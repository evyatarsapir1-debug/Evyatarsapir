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

const $ = (id) => document.getElementById(id);
const keys = new Set();

export const world = {
  active: false, ready: false,
  joy: { x: 0, y: 0, id: null }, look: { id: null, x: 0, y: 0 },
  yaw: Math.PI, pitch: 0.32, camDist: 5, run: false, driving: null, waypoint: null,

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
    this.ready = true;
    ctx.world = this;
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
    this.active = true;
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
    pad.addEventListener('pointerdown', (e) => { e.stopPropagation(); pad.setPointerCapture(e.pointerId); this.joy.id = e.pointerId; setJoy(e); });
    pad.addEventListener('pointermove', (e) => { if (this.joy.id === e.pointerId) setJoy(e); });
    const endJoy = (e) => { if (this.joy.id === e.pointerId) { this.joy.id = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; } };
    pad.addEventListener('pointerup', endJoy); pad.addEventListener('pointercancel', endJoy);
    $('wInteract').addEventListener('click', () => this.interact());
    $('wRun').addEventListener('click', () => { this.run = !this.run; $('wRun').classList.toggle('on', this.run); });
    $('wMap').addEventListener('click', () => this.toggleMap());
    $('wPhone').addEventListener('click', () => life.openPhone());
    $('minimap').addEventListener('click', () => this.toggleMap());
    $('mapClose').addEventListener('click', () => this.toggleMap(false));
    $('mapCanvas').addEventListener('click', (e) => this.mapClick(e));
  },

  // ---------------------------------------------------------------- per frame
  frame(dt, render = true) {
    if (!this.active) { if (render) ctx.renderer.render(this.scene, this.camera); return; }
    life.update(dt);
    this.movePlayer(dt);
    const focus = this.driving ? this.driving.mesh.position : this.player.position;
    this.sky.inside = !this.driving && !!this.insideBuilding(focus);
    this.sky.update(life.hour, focus, this.city.nightMats, performance.now() / 1000);
    const obstacles = [this.player.position, ...this.people.list.map((p) => p.mesh.position)];
    if (this.driving) obstacles.push(this.driving.mesh.position);
    this.traffic.update(dt, obstacles);
    this.people.update(dt);
    this.updateCamera(dt);
    this.cull(dt, focus);
    this._hudT = (this._hudT || 0) + dt;
    if (this._hudT > 0.2) { this._hudT = 0; this.refreshHud(); }
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
    p.y = this.groundY(p);
    animatePerson(this.player, dt, speed);
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

  // ---------------------------------------------------------------- cars
  spawnCarMesh(carState) {
    const def = CARS.find((c) => c.id === carState.id);
    let m = this.carMeshes[carState.id];
    if (!m) { m = carModel(def.color, def.kind); this.carMeshes[carState.id] = m; this.scene.add(m); }
    m.position.set(carState.x, 0.02, carState.z); m.rotation.y = carState.h;
    return m;
  },
  enterCar(carState) {
    const m = this.spawnCarMesh(carState);
    this.driving = { state: carState, mesh: m, v: 0, def: CARS.find((c) => c.id === carState.id) };
    this.player.visible = false;
    this.camDist = 8;
    ctx.toast('🚗 נהיגה: קדימה/אחורה להאצה ובלימה, ימינה/שמאלה להיגוי. לחץ שוב על הכפתור כדי לצאת.', 4000);
  },
  exitCar() {
    const d = this.driving; if (!d) return;
    const m = d.mesh;
    Object.assign(d.state, { x: m.position.x, z: m.position.z, h: m.rotation.y });
    const sx = Math.cos(m.rotation.y), sz = -Math.sin(m.rotation.y);
    this.player.position.set(m.position.x + sx * 1.8, 0.14, m.position.z + sz * 1.8);
    this.collide(this.player.position, 0.32);
    this.player.visible = true;
    this.driving = null;
    this.camDist = 5;
    life.save();
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
    if (it) it.action();
  },

  refreshHud(force) {
    const s = life.state;
    $('wClock').textContent = `יום ${s.day} · ${life.clock()} ${WEATHER[s.weather].icon}`;
    $('wMoney').textContent = `🪙 ${ctx.progress.data.coins.toLocaleString('he-IL')}`;
    $('wCareer').textContent = life.career().name;
    $('wEnergy').style.width = `${Math.max(0, s.energy)}%`;
    $('wEnergy').classList.toggle('low', s.energy < 25);
    $('wGoal').textContent = '🎯 ' + life.goal();
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
    if (best) btn.innerHTML = `<b>${best.icon || '👆'}</b><span>${best.label}</span><small class="kbd">E</small>`;
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
      if (Math.hypot(w.x - p.x, w.z - p.z) < 4) { this.waypoint = null; ctx.toast('📍 הגעת ליעד'); }
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
    if (show) this.drawFullMap();
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
    this.waypoint = { x: m.x, z: m.z };
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
