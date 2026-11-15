// Open-world mode: the city scene, the player (walking or driving), third-person camera, touch + keyboard controls,
// collisions, interactions, minimap / full map, and switching to the close-up cutting station and back.
import * as THREE from 'three';
import { ctx } from '../game/context.js';
import { buildCity, carModel } from './cityBuilder.js';
import { Sky, WEATHER } from './sky.js';
import { Traffic } from './traffic.js';
import { People } from './npcs.js';
import { buildPerson, animatePerson, dressPerson } from './people.js';
import { HALF_CITY, BLOCK, N, blockCenter, CARS } from './worldData.js';
import { life } from './life.js';
import { progress } from '../game/progress.js';
import { quests } from './quests.js';
import { tutorial } from './tutorial.js';
import { controls } from './controls.js';
import { sfx } from '../core/sfx.js';
import { fx } from '../ui/fx.js';

const $ = (id) => document.getElementById(id);
const keys = new Set();

export const world = {
  active: false, ready: false,
  joy: { x: 0, y: 0, id: null }, look: { id: null, x: 0, y: 0 },
  yaw: Math.PI, pitch: 0.32, camDist: 5, run: false, driving: null, waypoint: null, vy: 0, air: 0, anim: null,

  init() {
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
    this.sky = new Sky(scene);
    if (ctx.isMobile) { this.sky.sun.castShadow = false; }
    this.city = buildCity(ctx.shop);
    scene.add(this.city.root);
    this.traffic = new Traffic(scene, ctx.isMobile ? 8 : 14);
    this.people = new People(scene, this.city.buildings, ctx.isMobile ? 14 : 24);
    this.player = buildPerson(life.look());
    scene.add(this.player);
    this.carMeshes = {};
    life.attach(this);
    const p = life.state.pos;
    this.player.position.set(p.x, 0.14, p.z);
    this.yaw = p.yaw ?? Math.PI;
    this.drawMapBase();
    this.bindInput();
    this.buildGps();
    this.people.onPay = (p) => {
      if (Math.hypot(p.mesh.position.x - this.player.position.x, p.mesh.position.z - this.player.position.z) < 14) { sfx.play('coin'); this.popIcon('🪙', p.mesh.position); }
    };
    this.ready = true;
    ctx.world = this;
    ctx.life = life; ctx.quests = quests;
    quests.init(life);
    controls.apply();
    tutorial.init();
  },

  // ---------------------------------------------------------------- mode switching
  start() {
    if (!this.ready) this.init();
    this.resume();
  },
  resume() {
    ctx.returnTo = 'world';
    ctx.session?.stop?.();
    $('hud').classList.add('hidden');
    $('hub').classList.add('hidden');
    $('sheet').classList.add('hidden');
    $('worldHud').classList.remove('hidden');
    document.body.classList.add('in-world');
    if (this._wasSuspended) fx.flash?.();
    this._wasSuspended = false;
    this.active = true;
    if (ctx.pendingCoins) { const c = ctx.pendingCoins; ctx.pendingCoins = 0; setTimeout(() => fx.coins(c), 450); }
    ctx.state.phase = 'world';
    life.onResume();
    this.refreshHud(true);
  },
  /** Leave the city for the close-up station (cutting) or a menu. */
  suspend() {
    this.active = false;
    keys.clear(); this.joy.x = this.joy.y = 0; this.joy.id = null;
    $('worldHud').classList.add('hidden');
    $('mapOverlay').classList.add('hidden');
    $('dialogModal').classList.add('hidden');
    document.body.classList.remove('in-world');
    if (this.driving || this.anim) this.finishAnim?.();
    this._wasSuspended = true;
    fx.flash?.();
    sfx.music('shop');
    life.savePos();
  },

  // ---------------------------------------------------------------- input
  bindInput() {
    const canvas = ctx.renderer.domElement;
    addEventListener('keydown', (e) => {
      if (!this.active || e.target.tagName === 'INPUT') return;
      keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter') this.interact();
      if (e.code === 'KeyM') this.toggleMap();
      if (e.code === 'Space') { e.preventDefault(); this.jump(); }
      if (e.code === 'KeyP') life.openPhone();
      if (e.code === 'KeyQ') this.toggleQuest();
      tutorial.poke();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.run = true;
    });
    addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code.startsWith('Shift')) this.run = false; });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      canvas.setPointerCapture(e.pointerId);
      if (this.look.id == null) { this.look = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active || this.look.id !== e.pointerId) return;
      this.yaw -= (e.clientX - this.look.x) * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.look.y) * 0.004, -0.1, 1.1);
      this.look.x = e.clientX; this.look.y = e.clientY;
    });
    const endLook = (e) => { if (this.look.id === e.pointerId) this.look.id = null; };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);
    canvas.addEventListener('wheel', (e) => { if (this.active) this.camDist = THREE.MathUtils.clamp(this.camDist * Math.exp(e.deltaY * 0.001), 2.5, 9); }, { passive: true });
    // virtual joystick
    const pad = $('joy'), knob = $('joyKnob');
    const setJoy = (e) => {
      const r = pad.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      this.joy.x = x; this.joy.y = y;
      knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
    };
    pad.addEventListener('pointerdown', (e) => { if (controls.editing) return; e.stopPropagation(); pad.setPointerCapture(e.pointerId); this.joy.id = e.pointerId; setJoy(e); pad.classList.add('active'); tutorial.poke(); });
    pad.addEventListener('pointermove', (e) => { if (this.joy.id === e.pointerId) setJoy(e); });
    const endJoy = (e) => { if (this.joy.id === e.pointerId) { this.joy.id = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; pad.classList.remove('active'); } };
    pad.addEventListener('pointerup', endJoy); pad.addEventListener('pointercancel', endJoy);
    $('wInteract').addEventListener('click', () => this.interact());
    $('wRun').addEventListener('click', () => { this.run = !this.run; $('wRun').classList.toggle('on', this.run); });
    $('wMap').addEventListener('click', () => this.toggleMap());
    $('wPhone').addEventListener('click', () => life.openPhone());
    $('wJump').addEventListener('click', () => this.jump());
    $('wSettings').addEventListener('click', () => controls.open());
    $('questHead').addEventListener('click', () => this.toggleQuest());
    $('editDone').addEventListener('click', () => controls.editMode(false));
    $('gpsChip').addEventListener('click', () => this.toggleMap(true));
    try { if (localStorage.getItem('barber_life_questMin') === '1') $('questPanel').classList.add('min'); } catch { /* ignore */ }
    $('minimap').addEventListener('click', () => this.toggleMap());
    $('mapClose').addEventListener('click', () => this.toggleMap(false));
    $('mapCanvas').addEventListener('click', (e) => this.mapClick(e));
  },

  // ---------------------------------------------------------------- per frame
  frame(dt, render = true) {
    if (!this.active) { if (render) ctx.renderer.render(this.scene, this.camera); return; }
    life.update(dt);
    if (this.anim) this.updateAnim(dt); else this.movePlayer(dt);
    this.updateDoors(dt);
    this.updateGps(dt);
    const focus = this.driving ? this.driving.mesh.position : this.player.position;
    this.sky.inside = !this.driving && !!this.insideBuilding(focus);
    this.sky.update(life.hour, focus, this.city.nightMats, performance.now() / 1000);
    const obstacles = [this.player.position, ...this.people.list.map((p) => p.mesh.position)];
    if (this.driving) obstacles.push(this.driving.mesh.position);
    this.traffic.update(dt, obstacles);
    this.people.update(dt);
    this.updateCamera(dt);
    this.cull(dt, focus);
    this.updatePops(dt);
    this._hudT = (this._hudT || 0) + dt;
    if (this._hudT > 0.2) { this._hudT = 0; this.refreshHud(); }
    this._qT = (this._qT || 0) + dt;
    if (this._qT > 1) { this._qT = 0; quests.check(); this.updateMusic(); }
    this.drawMinimap();
    if (render) ctx.renderer.render(this.scene, this.camera);
  },

  /** Draw only what is near: interiors of nearby buildings and people within sight. */
  cull(dt, focus) {
    this._cullT = (this._cullT || 0) - dt;
    if (this._cullT > 0) return;
    this._cullT = 0.4;
    for (const b of Object.values(this.city.buildings)) {
      const d = Math.hypot(b.door.x - focus.x, b.door.z - focus.z);
      b.interior.visible = d < 45;
    }
    for (const p of this.people.list) p.mesh.visible = Math.hypot(p.mesh.position.x - focus.x, p.mesh.position.z - focus.z) < 90;
  },

  insideBuilding(p) {
    for (const b of Object.values(this.city.buildings)) {
      const f = b.footprint;
      if (p.x > f.minX && p.x < f.maxX && p.z > f.minZ && p.z < f.maxZ) return b;
    }
    return null;
  },

  input() {
    let fx = 0, fy = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fy += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fy -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
    fx += this.joy.x; fy -= this.joy.y;
    const l = Math.hypot(fx, fy);
    if (l > 1) { fx /= l; fy /= l; }
    return { fx, fy, mag: Math.min(1, l) };
  },

  movePlayer(dt) {
    const { fx, fy, mag } = this.input();
    if (this.driving) return this.drive(dt, fx, fy);
    const p = this.player.position;
    let speed = 0;
    if (mag > 0.05) {
      // camera-relative movement
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      // forward = away from the camera, right = screen right
      const dx = -fy * sy + fx * cy, dz = -fy * cy - fx * sy;
      const tired = life.state.energy < 15 ? 0.6 : 1;
      speed = (this.run || mag > 0.95 && this.joy.id != null ? 6 : 3.2) * mag * tired;
      p.x += dx / Math.hypot(dx, dz) * speed * dt;
      p.z += dz / Math.hypot(dx, dz) * speed * dt;
      const target = Math.atan2(dx, dz);
      let d = target - this.player.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.player.rotation.y += d * Math.min(1, dt * 12);
    }
    this.collide(p, 0.32);
    const lim = HALF_CITY + 30;
    p.x = THREE.MathUtils.clamp(p.x, -lim, lim); p.z = THREE.MathUtils.clamp(p.z, -lim, lim);
    const g = this.groundY(p);
    if (this.air > 0 || this.vy > 0) { // jump arc
      this.air += this.vy * dt; this.vy -= 18 * dt;
      if (this.air <= 0) { this.air = 0; this.vy = 0; sfx.play('land'); }
    }
    p.y = g + this.air;
    if (speed > 0.5 && this.air === 0) { // footsteps
      this._stepT = (this._stepT || 0) + dt * speed;
      if (this._stepT > 2.2) { this._stepT = 0; sfx.play('step'); }
      if (this.joy.id == null || mag > 0.2) tutorial.poke();
    }
    animatePerson(this.player, dt, speed, false, null, this.air);
  },

  groundY(p) {
    const half = BLOCK / 2;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const c = blockCenter(i, j);
      if (Math.abs(p.x - c.x) < half && Math.abs(p.z - c.z) < half) return 0.14;
    }
    return 0;
  },

  collide(p, r) {
    let hit = false;
    for (const c of this.city.colliders) {
      if (p.x < c.minX - r || p.x > c.maxX + r || p.z < c.minZ - r || p.z > c.maxZ + r) continue;
      const qx = THREE.MathUtils.clamp(p.x, c.minX, c.maxX), qz = THREE.MathUtils.clamp(p.z, c.minZ, c.maxZ);
      let dx = p.x - qx, dz = p.z - qz;
      const d = Math.hypot(dx, dz);
      if (d < r) {
        hit = true;
        if (d < 1e-5) {
          // centre inside the box: push out along the shallowest axis
          const ox = Math.min(p.x - c.minX, c.maxX - p.x), oz = Math.min(p.z - c.minZ, c.maxZ - p.z);
          if (ox < oz) p.x = p.x - c.minX < c.maxX - p.x ? c.minX - r : c.maxX + r;
          else p.z = p.z - c.minZ < c.maxZ - p.z ? c.minZ - r : c.maxZ + r;
        } else { dx /= d; dz /= d; p.x = qx + dx * r; p.z = qz + dz * r; }
      }
    }
    return hit;
  },

  jump() {
    if (!this.active || this.driving || this.anim || this.air > 0) return;
    this.vy = 5.6; this.air = 0.001;
    sfx.play('jump');
  },

  // ---------------------------------------------------------------- doors: slide open when someone walks up
  updateDoors(dt) {
    const pl = this.player.position;
    for (const b of Object.values(this.city.buildings)) {
      if (!b.doorPanels?.length) continue;
      const dp = Math.hypot(b.door.x - pl.x, b.door.z - pl.z);
      if (dp > 40) continue;
      let want = !this.driving && dp < 3.2 ? 1 : 0;
      if (!want) for (const p of this.people.list) { if (Math.abs(p.mesh.position.x - b.door.x) < 2.6 && Math.abs(p.mesh.position.z - b.door.z) < 2.6) { want = 1; break; } }
      if (want && b.doorOpen < 0.05 && dp < 3.2) sfx.play('door');
      b.doorOpen += (want - b.doorOpen) * Math.min(1, dt * 6);
      for (const pg of b.doorPanels) pg.position.x = pg.userData.base + pg.userData.dir * b.doorOpen * 1.05;
    }
  },

  // ---------------------------------------------------------------- GPS: gold arrow at the player's feet + light beacon at the target
  buildGps() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.55); shape.lineTo(0.38, 0.05); shape.lineTo(0.16, 0.05); shape.lineTo(0.16, -0.4); shape.lineTo(-0.16, -0.4); shape.lineTo(-0.16, 0.05); shape.lineTo(-0.38, 0.05); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2); // lie flat, tip toward -z
    geo.rotateY(Math.PI);      // tip toward +z
    this.gpsArrow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffd36a', transparent: true, opacity: 0.92, depthTest: false }));
    this.gpsArrow.renderOrder = 10;
    this.scene.add(this.gpsArrow);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 26, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd36a', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 13;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 40), new THREE.MeshBasicMaterial({ color: '#ffd36a', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2;
    this.beacon = new THREE.Group(); this.beacon.add(beam, ring); this.beacon.userData = { beam, ring };
    this.scene.add(this.beacon);
  },
  /** Current navigation target: tutorial step → map waypoint → story mission. */
  navTarget() {
    return tutorial.target() || (this.waypoint ? { ...this.waypoint, label: this.waypoint.label || 'יעד במפה' } : null) || (tutorial.active ? null : quests.target());
  },
  updateGps(dt) {
    const t = this.navTarget();
    const p = this.driving ? this.driving.mesh.position : this.player.position;
    this._gpsT = (this._gpsT || 0) + dt;
    const chip = $('gpsChip');
    if (!t) { this.gpsArrow.visible = this.beacon.visible = false; chip.classList.add('hidden'); return; }
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const near = d < 2.2;
    this.gpsArrow.visible = !near;
    const rr = this.driving ? 3.2 : 1.15;
    this.gpsArrow.position.set(p.x + Math.sin(ang) * rr, p.y + 0.12 + Math.sin(this._gpsT * 4) * 0.05, p.z + Math.cos(ang) * rr);
    this.gpsArrow.rotation.y = ang;
    this.gpsArrow.scale.setScalar(this.driving ? 2.2 : 1);
    this.beacon.visible = !t.moving;
    this.beacon.position.set(t.x, this.groundY(t), t.z);
    const pulse = 1 + 0.25 * Math.sin(this._gpsT * 3);
    this.beacon.userData.ring.scale.setScalar(pulse);
    this.beacon.userData.beam.material.opacity = Math.min(0.24, 0.05 + d / 200);
    // HUD chip: arrow relative to where the camera looks
    let rel = ang - (this.yaw + Math.PI);
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    chip.classList.remove('hidden');
    if ((this._chipT = (this._chipT || 0) + dt) > 0.15) {
      this._chipT = 0;
      chip.innerHTML = `<i style="transform:rotate(${-rel}rad)">➤</i><span><b>${t.label || 'יעד'}</b><small>${near ? 'הגעת!' : `${Math.round(d)} מ׳`}</small></span>`;
    }
  },

  /** A small icon that floats up from a point in the world (coin when a client pays). */
  popIcon(icon, pos) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); g.font = '48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, 32, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
    sp.scale.setScalar(0.45); sp.position.set(pos.x, 2.0, pos.z);
    this.scene.add(sp);
    (this.pops ||= []).push({ sp, t: 0 });
  },
  updatePops(dt) {
    for (const o of (this.pops || []).slice()) {
      o.t += dt; o.sp.position.y += dt * 0.8; o.sp.material.opacity = Math.max(0, 1 - o.t / 1.4);
      if (o.t > 1.4) { this.scene.remove(o.sp); o.sp.material.map.dispose(); o.sp.material.dispose(); this.pops = this.pops.filter((x) => x !== o); }
    }
  },

  updateMusic() {
    const h = life.hour;
    const inside = this.insideBuilding(this.player.position);
    sfx.music(inside && /barber|property/.test(inside.footprint.kind) ? 'shop' : h >= 20 || h < 6 ? 'night' : 'city');
  },

  toggleQuest() {
    const el = $('questPanel');
    el.classList.toggle('min');
    try { localStorage.setItem('barber_life_questMin', el.classList.contains('min') ? '1' : '0'); } catch { /* ignore */ }
  },

  // ---------------------------------------------------------------- cars
  spawnCarMesh(carState) {
    const def = CARS.find((c) => c.id === carState.id);
    let m = this.carMeshes[carState.id];
    if (!m) { m = carModel(def.color, def.kind); this.carMeshes[carState.id] = m; this.scene.add(m); }
    m.position.set(carState.x, 0.02, carState.z); m.rotation.y = carState.h;
    return m;
  },
  /** Walk to the driver's door, step in (the car dips), then drive. */
  enterCar(carState) {
    if (this.anim) return;
    const m = this.spawnCarMesh(carState);
    const def = CARS.find((c) => c.id === carState.id);
    const side = def.kind === 'scooter' ? 0.7 : 1.25;
    const door = { x: m.position.x + Math.cos(m.rotation.y) * side, z: m.position.z - Math.sin(m.rotation.y) * side };
    const from = { x: this.player.position.x, z: this.player.position.z };
    this.anim = { type: 'enter', t: 0, dur: 0.9, from, door, m, carState, def };
    sfx.play('door');
  },
  updateAnim(dt) {
    const a = this.anim; a.t += dt;
    const u = Math.min(1, a.t / a.dur), p = this.player.position;
    if (a.type === 'enter') {
      const w = Math.min(1, u / 0.55);
      if (u < 0.55) { // walk to the door
        p.x = a.from.x + (a.door.x - a.from.x) * w; p.z = a.from.z + (a.door.z - a.from.z) * w;
        this.player.rotation.y = Math.atan2(a.door.x - a.from.x, a.door.z - a.from.z);
        animatePerson(this.player, dt, 2.5);
      } else { // slide in and shrink into the seat
        const k = (u - 0.55) / 0.45;
        p.x = a.door.x + (a.m.position.x - a.door.x) * k; p.z = a.door.z + (a.m.position.z - a.door.z) * k;
        this.player.scale.setScalar(1 - k * 0.6);
        animatePerson(this.player, dt, 0, k > 0.5);
        a.m.position.y = 0.02 - Math.sin(k * Math.PI) * 0.06;
      }
      if (u >= 1) this.finishAnim();
    } else if (a.type === 'exit') {
      const k = u;
      this.player.visible = true;
      this.player.scale.setScalar(0.4 + 0.6 * k);
      p.x = a.m.position.x + (a.door.x - a.m.position.x) * k; p.z = a.m.position.z + (a.door.z - a.m.position.z) * k;
      a.m.position.y = 0.02 - Math.sin(k * Math.PI) * 0.06;
      animatePerson(this.player, dt, 1.2);
      if (u >= 1) this.finishAnim();
    }
  },
  finishAnim() {
    const a = this.anim; if (!a) return;
    this.anim = null;
    this.player.scale.setScalar(1);
    a.m.position.y = 0.02;
    if (a.type === 'enter') {
      this.driving = { state: a.carState, mesh: a.m, v: 0, def: a.def };
      this.player.visible = false;
      this.camDist = 8;
      sfx.play('car');
      ctx.toast('🚗 נהיגה: קדימה/אחורה להאצה ובלימה, ימינה/שמאלה להיגוי. "צא מהרכב" כדי לצאת.', 4000);
    } else {
      this.player.position.set(a.door.x, 0.14, a.door.z);
      this.collide(this.player.position, 0.32);
      life.save();
    }
  },
  exitCar() {
    const d = this.driving; if (!d || this.anim) return;
    const m = d.mesh;
    Object.assign(d.state, { x: m.position.x, z: m.position.z, h: m.rotation.y });
    const sx = Math.cos(m.rotation.y), sz = -Math.sin(m.rotation.y);
    const door = { x: m.position.x + sx * 1.8, z: m.position.z + sz * 1.8 };
    this.collide(door, 0.32);
    this.player.rotation.y = Math.atan2(sx, sz);
    this.driving = null;
    this.camDist = 5;
    this.anim = { type: 'exit', t: 0, dur: 0.6, door, m };
    sfx.play('door');
  },
  drive(dt, fx, fy) {
    const d = this.driving, m = d.mesh;
    const vmax = d.def.speed;
    if (fy > 0.05) d.v += fy * 9 * dt; else if (fy < -0.05) d.v += fy * (d.v > 0 ? 18 : 6) * dt; else d.v *= Math.exp(-dt * 0.9);
    d.v = THREE.MathUtils.clamp(d.v, -5, vmax);
    m.rotation.y -= fx * dt * 1.6 * THREE.MathUtils.clamp(d.v / 6, -1, 1);
    const p = m.position;
    p.x += Math.sin(m.rotation.y) * d.v * dt; p.z += Math.cos(m.rotation.y) * d.v * dt;
    if (this.collide(p, d.def.kind === 'scooter' ? 0.6 : 1.3)) d.v *= 0.3;
    const lim = HALF_CITY + 30;
    p.x = THREE.MathUtils.clamp(p.x, -lim, lim); p.z = THREE.MathUtils.clamp(p.z, -lim, lim);
    this.player.position.set(p.x, 0.14, p.z);
  },

  // ---------------------------------------------------------------- camera
  updateCamera(dt) {
    const t = this.driving ? this.driving.mesh.position : this.player.position;
    const inside = !this.driving && this.insideBuilding(t);
    const want = this.driving ? Math.max(this.camDist, 7) : inside ? Math.min(this.camDist, 3.4) : this.camDist;
    this._dist = THREE.MathUtils.lerp(this._dist ?? want, want, Math.min(1, dt * 4));
    if (this.driving) { // follow behind the car when moving
      const behind = this.driving.mesh.rotation.y + Math.PI;
      if (Math.abs(this.driving.v) > 1) { let d = behind - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 2.5); }
    }
    const head = new THREE.Vector3(t.x, t.y + (this.driving ? 1.6 : 1.55), t.z);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // keep the camera out of walls: 2D ray against the colliders
    let dist = this._dist;
    for (const c of this.city.colliders) {
      const hitT = rayBox(head.x, head.z, dir.x, dir.z, c);
      if (hitT != null && hitT > 0.2 && hitT < dist) dist = Math.max(1.2, hitT - 0.25);
    }
    if (inside) { const lim = 4.0 - head.y - 0.2; if (dir.y * dist > lim) dist = lim / Math.max(0.05, dir.y); }
    this.camera.position.copy(head).addScaledVector(dir, dist);
    this.camera.lookAt(head);
  },

  // ---------------------------------------------------------------- interactions
  interact() {
    if (!this.active) return;
    const it = this.current;
    if (it) { sfx.play('tap'); tutorial.poke(); it.action(); }
    else ctx.toast('אין כאן עם מי לדבר או מה לעשות. חפש את הכפתור שמופיע כשמתקרבים לאנשים, דלפקים וכיסאות.', 2600);
  },

  refreshHud(force) {
    const s = life.state;
    $('wClock').textContent = `יום ${s.day} · ${life.clock()} ${WEATHER[s.weather].icon}`;
    $('wMoney').textContent = `🪙 ${ctx.progress.data.coins.toLocaleString('he-IL')}`;
    $('wCareer').textContent = life.career().name;
    $('wEnergy').style.width = `${Math.max(0, s.energy)}%`;
    $('wEnergy').classList.toggle('low', s.energy < 25);
    const lvl = progress.rank, nx = progress.nextRank, xp = progress.data.xp;
    $('wLevel').textContent = `רמה ${lvl.id}`;
    $('wXp').style.width = `${nx ? Math.round((xp - lvl.xp) / (nx.xp - lvl.xp) * 100) : 100}%`;
    $('wXpText').textContent = nx ? `${xp}/${nx.xp} XP` : `${xp} XP`;
    const q = quests.render(), alert = life.alert();
    $('wGoal').textContent = alert ? `⚠️ ${alert}` : q.title;
    $('wGoal').classList.toggle('alert', !!alert);
    if (q.html !== this._qHtml) { this._qHtml = q.html; $('questBody').innerHTML = q.html; }
    // nearest interaction
    const pos = this.driving ? this.driving.mesh.position : this.player.position;
    const list = life.interactions(pos, !!this.driving);
    let best = null, bd = Infinity;
    for (const it of list) {
      const d = Math.hypot(it.x - pos.x, it.z - pos.z);
      if (d < (it.r || 1.6) && d < bd) { bd = d; best = it; }
    }
    this.current = best;
    const btn = $('wInteract');
    btn.classList.toggle('hidden', !best);
    if (best && best.label !== this._lastLabel) { btn.innerHTML = `<b>${best.icon || '👆'}</b><span>${best.label}</span><small class="kbd">E</small>`; btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
    this._lastLabel = best?.label;
    void force;
  },

  // ---------------------------------------------------------------- map
  mapScale: 2.0, // canvas px per metre on the base map
  drawMapBase() {
    const size = Math.ceil((HALF_CITY * 2 + 60) * this.mapScale);
    const cv = this.mapBase = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const W = (x) => (x + HALF_CITY + 30) * this.mapScale;
    g.fillStyle = '#3c5a34'; g.fillRect(0, 0, size, size);
    g.fillStyle = '#3a3c42'; g.fillRect(W(-HALF_CITY - 7), W(-HALF_CITY - 7), (HALF_CITY * 2 + 14) * this.mapScale, (HALF_CITY * 2 + 14) * this.mapScale);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const c = blockCenter(i, j);
      g.fillStyle = '#9a988f'; g.fillRect(W(c.x - BLOCK / 2), W(c.z - BLOCK / 2), BLOCK * this.mapScale, BLOCK * this.mapScale);
    }
    const colors = { building: '#6e6a66', barber: '#c9a45c', property: '#4a8a6a', home: '#5a7ab8', academy: '#e8c14a', realty: '#2f9f7e', clothes: '#b04a8a', cafe: '#a8743a', cars: '#3a6ab8', park: '#4f8fb8', parkArea: '#4f7a3a' };
    for (const f of [...this.city.footprints].sort((a, b) => (a.kind === 'parkArea' ? -1 : 0) - (b.kind === 'parkArea' ? -1 : 0))) {
      g.fillStyle = colors[f.kind] || '#666';
      g.fillRect(W(f.minX), W(f.minZ), (f.maxX - f.minX) * this.mapScale, (f.maxZ - f.minZ) * this.mapScale);
    }
    this.W = W;
  },

  markers() {
    return life.mapMarkers();
  },

  drawMinimap() {
    const cv = $('minimap'); if (!cv) return;
    const g = cv.getContext('2d');
    const S = cv.width, view = 90; // metres across
    const p = this.driving ? this.driving.mesh.position : this.player.position;
    const k = S / (view * this.mapScale);
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
    g.setTransform(k, 0, 0, k, S / 2 - this.W(p.x) * k, S / 2 - this.W(p.z) * k);
    g.drawImage(this.mapBase, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = `${Math.round(S / 11)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of this.markers()) {
      let x = S / 2 + (m.x - p.x) * this.mapScale * k, y = S / 2 + (m.z - p.z) * this.mapScale * k;
      const dx = x - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy), lim = S / 2 - 10;
      if (d > lim) { if (!m.important) continue; x = S / 2 + dx / d * lim; y = S / 2 + dy / d * lim; }
      g.fillText(m.icon, x, y);
    }
    if (this.waypoint) {
      const w = this.waypoint;
      let x = S / 2 + (w.x - p.x) * this.mapScale * k, y = S / 2 + (w.z - p.z) * this.mapScale * k;
      const dx = x - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy), lim = S / 2 - 8;
      if (d > lim) { x = S / 2 + dx / d * lim; y = S / 2 + dy / d * lim; }
      g.fillStyle = '#ff4fd8'; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      if (Math.hypot(w.x - p.x, w.z - p.z) < 4) { this.waypoint = null; ctx.toast('📍 הגעת ליעד'); sfx.play('task'); }
    }
    // player arrow (map is north-up; heading from the model/car)
    const h = this.driving ? this.driving.mesh.rotation.y : this.player.rotation.y;
    g.translate(S / 2, S / 2); g.rotate(-h + Math.PI);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke();
    g.restore();
  },

  toggleMap(on) {
    const el = $('mapOverlay');
    const show = on ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);
    if (show) this.drawFullMap(); else { sfx.play('close'); life.flushNotes(); }
  },
  drawFullMap() {
    const cv = $('mapCanvas');
    const S = Math.min(innerWidth - 24, innerHeight - 120, 900);
    cv.width = cv.height = S * (devicePixelRatio > 1 ? 2 : 1);
    cv.style.width = cv.style.height = `${S}px`;
    const g = cv.getContext('2d');
    const k = cv.width / this.mapBase.width;
    g.drawImage(this.mapBase, 0, 0, cv.width, cv.height);
    g.font = `${Math.round(cv.width / 34)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    this._mapMarkers = [];
    for (const m of this.markers()) {
      const x = this.W(m.x) * k, y = this.W(m.z) * k;
      g.fillText(m.icon, x, y);
      this._mapMarkers.push({ ...m, px: x / cv.width, py: y / cv.height });
    }
    const p = this.driving ? this.driving.mesh.position : this.player.position;
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3;
    g.beginPath(); g.arc(this.W(p.x) * k, this.W(p.z) * k, cv.width / 90, 0, Math.PI * 2); g.fill(); g.stroke();
    if (this.waypoint) { g.fillStyle = '#ff4fd8'; g.beginPath(); g.arc(this.W(this.waypoint.x) * k, this.W(this.waypoint.z) * k, cv.width / 110, 0, Math.PI * 2); g.fill(); }
    $('mapList').innerHTML = this.markers().filter((m) => m.label).map((m, i) => `<button class="map-item" data-mi="${i}">${m.icon} ${m.label}</button>`).join('');
    $('mapList').querySelectorAll('[data-mi]').forEach((b) => b.addEventListener('click', () => { const m = this.markers()[+b.dataset.mi]; this.setWaypoint(m); }));
  },
  mapClick(e) {
    const r = e.target.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    let best = null, bd = 0.04;
    for (const m of this._mapMarkers || []) { const d = Math.hypot(m.px - px, m.py - py); if (d < bd) { bd = d; best = m; } }
    if (best) this.setWaypoint(best);
  },
  setWaypoint(m) {
    this.waypoint = { x: m.x, z: m.z, label: m.label };
    ctx.toast(`📍 יעד במפה: ${m.label || ''}`);
    this.toggleMap(false);
  },

  teleport(x, z, yaw) { this.player.position.set(x, 0.14, z); if (yaw != null) this.yaw = yaw; },
  dress(look) { dressPerson(this.player, look); },
};

/** 2D ray (origin, dir) vs AABB → distance or null. */
function rayBox(ox, oz, dx, dz, c) {
  let t0 = -Infinity, t1 = Infinity;
  for (const [o, d, mn, mx] of [[ox, dx, c.minX, c.maxX], [oz, dz, c.minZ, c.maxZ]]) {
    if (Math.abs(d) < 1e-6) { if (o < mn || o > mx) return null; continue; }
    let a = (mn - o) / d, b = (mx - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (t0 > t1 || t1 < 0) return null;
  return t0 > 0 ? t0 : null;
}
