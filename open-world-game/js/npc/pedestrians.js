// Pedestrians (NPCs) with real behaviour:
//  walk the sidewalk loop around their block, cross streets on the crosswalks when the cars' light is red,
//  stop to talk with each other, look at their phone, sit on benches, walk into shops (real interiors) and out again,
//  step out of the way of the player and of fast cars, stumble if hit, and shopkeepers stand behind counters.
// Rendering: one InstancedMesh per body part, so dozens of animated people cost ~12 draw calls.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp, damp, dampAngle } from '../core/mathx.js';
import { P } from '../world/layout.js';
import { cellData, isUrban, nodeNbrs } from '../world/worldGen.js';
import { heightAt, WATER_Y } from '../world/terrain.js';
import { lightState } from '../traffic/roadGraph.js';
import { circleVs, verticalOverlap } from '../physics/collision.js';
import { interiorSpec } from '../world/interiors.js';
import { SKIN_TONES, HAIR_COLORS, CLOTH_COLORS } from '../character/characterModel.js';

const MAX = 64;
const CORNERS = [[10, 10], [90, 10], [90, 90], [10, 90]];
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 2, 6);
const _q = [];
const _seatV = new THREE.Vector3();

class Rig {
  constructor() {
    const g = (parent, x = 0, y = 0, z = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
    this.root = new THREE.Object3D();
    this.body = g(this.root);
    this.hips = g(this.body, 0, 0.95, 0);
    this.a = {};
    this.a.pelvis = g(this.hips, 0, 0.02, 0);
    this.spine = g(this.hips, 0, 0.08, 0);
    this.a.torso = g(this.spine, 0, 0.24, 0); this.a.torso.scale.set(1.18, 1, 0.75);
    this.neck = g(this.spine, 0, 0.5, 0);
    this.head = g(this.neck, 0, 0.14, 0.01);
    this.a.head = g(this.head); this.a.head.scale.set(0.92, 1.05, 1);
    this.a.hairS = g(this.head, 0, 0.012, -0.005); this.a.hairS.scale.set(0.95, 1.05, 1.05);
    this.a.hairL = g(this.head, 0, -0.13, -0.08);
    this.sh = [], this.el = [], this.hip = [], this.knee = [];
    this.a.uArm = []; this.a.lArm = []; this.a.hand = []; this.a.uLeg = []; this.a.lLeg = []; this.a.foot = [];
    for (const s of [-1, 1]) {
      const sh = g(this.spine, s * 0.21, 0.42, 0), el = g(sh, 0, -0.29, 0);
      this.sh.push(sh); this.el.push(el);
      this.a.uArm.push(g(sh, 0, -0.14, 0)); this.a.lArm.push(g(el, 0, -0.13, 0)); this.a.hand.push(g(el, 0, -0.28, 0.01));
      const hip = g(this.hips, s * 0.09, -0.04, 0), knee = g(hip, 0, -0.43, 0);
      this.hip.push(hip); this.knee.push(knee);
      this.a.uLeg.push(g(hip, 0, -0.21, 0)); this.a.lLeg.push(g(knee, 0, -0.2, 0)); this.a.foot.push(g(knee, 0, -0.44, 0.05));
    }
    this.a.neck = g(this.spine, 0, 0.5, 0);
    this.a.shoulders = g(this.spine, 0, 0.4, -0.005);
    this.a.nose = g(this.head, 0, -0.012, 0.108);
    this.a.eyes = g(this.head, 0, 0.022, 0.095);
    this.a.helmet = g(this.head, 0, 0.035, -0.005);
    this.a.vest = g(this.spine, 0, 0.27, 0.0);
    this.a.rifle = g(this.spine, 0.02, 0.3, -0.17); this.a.rifle.rotation.z = 0.85;
    this.a.phone = g(this.a.hand[1], 0, -0.02, 0.05);
    this.a.bag = g(this.a.hand[0], -0.12, -0.3, 0);
  }
}

export class Pedestrians {
  constructor(scene) {
    this.scene = scene;
    this.rng = new RNG(777);
    this.peds = [];
    this.target = 26;
    this.rig = new Rig();
    const std = (o = {}) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
    const mk = (geo, n, color) => {
      const m = new THREE.InstancedMesh(geo, std({ color: 0xffffff }), n);
      m.count = 0; m.castShadow = true; m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color(color)); m.instanceColor.needsUpdate = true;
      scene.add(m); return m;
    };
    const capG = new THREE.SphereGeometry(0.122, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55);
    this.M = {
      pelvis: mk(new THREE.BoxGeometry(0.32, 0.18, 0.2), MAX, 0xffffff),
      torso: mk(cap(0.15, 0.26), MAX, 0xffffff),
      head: mk(new THREE.SphereGeometry(0.115, 12, 9), MAX, 0xffffff),
      hairS: mk(capGeo(capG), MAX, 0xffffff),
      hairL: mk(new THREE.BoxGeometry(0.24, 0.32, 0.08), MAX, 0xffffff),
      uArm: mk(cap(0.055, 0.2), MAX * 2, 0xffffff),
      lArm: mk(cap(0.048, 0.2), MAX * 2, 0xffffff),
      hand: mk(new THREE.SphereGeometry(0.052, 6, 5), MAX * 2, 0xffffff),
      uLeg: mk(cap(0.08, 0.3), MAX * 2, 0xffffff),
      lLeg: mk(cap(0.065, 0.3), MAX * 2, 0xffffff),
      foot: mk(new THREE.BoxGeometry(0.1, 0.07, 0.25), MAX * 2, 0xffffff),
      phone: mk(new THREE.BoxGeometry(0.07, 0.14, 0.012), MAX, 0x111111),
      neck: mk(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), MAX, 0xffffff),
      shoulders: mk(cap(0.075, 0.28).rotateZ(Math.PI / 2), MAX, 0xffffff),
      nose: mk(new THREE.BoxGeometry(0.03, 0.04, 0.03), MAX, 0xffffff),
      eyes: mk(new THREE.BoxGeometry(0.085, 0.018, 0.01), MAX, 0x1a1a1a),
      helmet: mk(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(1, 0.95, 1.08), MAX, 0x4b5320),
      vest: mk(new THREE.BoxGeometry(0.36, 0.34, 0.25), MAX, 0x3d4428),
      rifle: mk(new THREE.BoxGeometry(0.05, 0.75, 0.06), MAX, 0x1d1f1c),
      bag: mk(new THREE.BoxGeometry(0.22, 0.55, 0.38), MAX, 0x2c3e50),
    };
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.benchesTaken = new Set();
    this.deadKeys = new Set();   // indoor people who died never come back
  }

  setDensity(n) { this.target = Math.min(MAX - 8, n); }
  obstacles() { return this.peds.filter((p) => p.state !== 'inside' && p.state !== 'shopkeeper' && p.state !== 'resident' && p.state !== 'dead' && !p.car).map((p) => ({ x: p.x, z: p.z, y: p.y, r: 0.45 })); }

  _appearance() {
    const r = this.rng;
    const long = r.chance(0.4);
    return {
      skin: SKIN_TONES[r.int(0, SKIN_TONES.length - 1)], hair: HAIR_COLORS[r.int(0, 5)], long, bald: !long && r.chance(0.12),
      shirt: CLOTH_COLORS[r.int(0, CLOTH_COLORS.length - 1)], pants: CLOTH_COLORS[r.int(0, CLOTH_COLORS.length - 1)],
      shoes: r.chance(0.5) ? 0x1d1d1f : 0xeeeeee, h: r.float(0.92, 1.08), w: r.float(0.9, 1.12),
    };
  }

  _spawnWalker(px, pz, cells) {
    for (let t = 0; t < 10; t++) {
      const [ix, iz] = this.rng.pick(cells);
      if (!isUrban(ix, iz)) continue;
      const ox = ix * P, oz = iz * P;
      const c = this.rng.int(0, 3), dir = this.rng.chance(0.5) ? 1 : -1;
      const a = CORNERS[c], b = CORNERS[(c + dir + 4) % 4];
      const t0 = this.rng.float(0.1, 0.9);
      const x = ox + a[0] + (b[0] - a[0]) * t0, z = oz + a[1] + (b[1] - a[1]) * t0;
      const d = Math.hypot(x - px, z - pz);
      if (d < 35 || d > 120) continue;
      return this._add({ x, z, ix, iz, corner: (c + dir + 4) % 4, dir, state: 'walk' });
    }
    return null;
  }

  _add(o) {
    const p = {
      yaw: 0, speed: 0, phase: this.rng.float(0, 6), j: {}, timer: this.rng.float(4, 14),
      app: this._appearance(), walkSpeed: this.rng.float(1.15, 1.55), phone: this.rng.chance(0.15), lane: this.rng.float(-0.6, 0.6), ...o,
    };
    p.y = heightAt(p.x, p.z, (o.y ?? 0) + 0.5);
    // fight-system personality: how this person reacts to a brawl
    const r = this.rng.float();
    p.temper = r < 0.24 ? 'dodge' : r < 0.52 ? 'flee' : r < 0.70 ? 'freeze' : r < 0.83 ? 'call' : 'fight';
    p.wealth = this.rng.float() < 0.2 ? 'rich' : this.rng.float() < 0.5 ? 'worker' : 'regular';
    p.hp = p.maxHp = 8;
    this.peds.push(p);
    this._colors();
    return p;
  }

  _colors() {
    const c = new THREE.Color();
    this.peds.forEach((p, i) => {
      const a = p.app;
      const set = (m, idx, hex) => m.setColorAt(idx, c.setHex(hex));
      set(this.M.neck, i, a.skin); set(this.M.nose, i, a.skin); set(this.M.eyes, i, 0x1a1a1a); set(this.M.shoulders, i, a.swim ? a.skin : a.shirt);
      set(this.M.helmet, i, a.cop ? 0x111d3a : 0x4b5320); set(this.M.vest, i, 0x3d4428); set(this.M.rifle, i, 0x1d1f1c);
      if (a.swim) {
        // swimwear: trunks / swimsuit in a bright colour, bare arms and legs, barefoot
        const sw = a.swimColor;
        set(this.M.pelvis, i, sw); set(this.M.torso, i, a.long ? sw : a.skin); set(this.M.head, i, a.skin);
        set(this.M.hairS, i, a.hair); set(this.M.hairL, i, a.hair); set(this.M.phone, i, 0x111111); set(this.M.bag, i, 0xf2c94c);
        for (let s = 0; s < 2; s++) {
          set(this.M.uArm, i * 2 + s, a.skin); set(this.M.lArm, i * 2 + s, a.skin); set(this.M.hand, i * 2 + s, a.skin);
          set(this.M.uLeg, i * 2 + s, a.long ? a.skin : sw); set(this.M.lLeg, i * 2 + s, a.skin); set(this.M.foot, i * 2 + s, a.skin);
        }
        return;
      }
      set(this.M.neck, i, a.skin); set(this.M.nose, i, a.skin); set(this.M.eyes, i, 0x1a1a1a); set(this.M.shoulders, i, a.swim ? a.skin : a.shirt);
      set(this.M.helmet, i, a.cop ? 0x111d3a : 0x4b5320); set(this.M.vest, i, 0x3d4428); set(this.M.rifle, i, 0x1d1f1c);
      set(this.M.pelvis, i, a.pants); set(this.M.torso, i, a.shirt); set(this.M.head, i, a.skin);
      set(this.M.hairS, i, a.hair); set(this.M.hairL, i, a.hair); set(this.M.phone, i, 0x111111);
      set(this.M.bag, i, [0x2c3e50, 0xc0392b, 0x16a085, 0x7f8c8d][i % 4]);
      for (let s = 0; s < 2; s++) {
        set(this.M.uArm, i * 2 + s, a.shirt); set(this.M.lArm, i * 2 + s, a.skin); set(this.M.hand, i * 2 + s, a.skin);
        set(this.M.uLeg, i * 2 + s, a.pants); set(this.M.lLeg, i * 2 + s, a.pants); set(this.M.foot, i * 2 + s, a.shoes);
      }
    });
    for (const m of Object.values(this.M)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // shopkeepers behind counters and residents at home, for interiors loaded around the player
  _syncInteriorPeople(places, player, cells) {
    const want = new Map();
    // beachgoers in swimwear on the city beach near the player
    for (const [i, j] of cells || []) {
      const cd = cellData(i, j);
      for (const b of [...(cd.beachSpots || []), ...(cd.peopleSpots || [])]) {
        if (Math.hypot(b.x - player.x, b.z - player.z) > (b.outfit === 'soldier' ? 260 : 130)) continue;
        want.set(b.key, { x: b.x, z: b.z, y: b.y, yaw: b.yaw, state: b.state, swim: !b.outfit, soldier: b.outfit === 'soldier', cop: b.outfit === 'cop', pts: b.pts, seats: [] });
      }
    }
    for (const L of places || []) {
      const key = `${L.b.x.toFixed(1)},${L.b.z.toFixed(1)}`;
      const c = L.spec.counter;
      if (c) want.set(key + ':k', { x: c.keeper[0], z: c.keeper[1], y: c.y, yaw: c.yaw, state: 'shopkeeper' });
      if (L.spec.home) { const h = L.spec.home; want.set(key + ':h', { x: h.pt[0], z: h.pt[1], y: h.y, yaw: h.yaw, state: 'resident' }); }
      (L.spec.counters || []).forEach((c, i) => want.set(`${key}:c${i}`, { x: c.keeper[0], z: c.keeper[1], y: c.y, yaw: c.yaw, state: 'shopkeeper' }));
      (L.spec.staff || []).forEach((c, i) => want.set(`${key}:s${i}`, { x: c.pt[0], z: c.pt[1], y: c.y, yaw: c.yaw, state: c.sit ? 'resident' : 'shopkeeper' }));
      (L.spec.outdoor || []).forEach((c, i) => want.set(`${key}:o${i}`, { x: c.pt[0], z: c.pt[1], y: c.y, yaw: c.yaw, state: 'shopkeeper', phone: i === 1 }));
      if (L.spec.wander) {
        const pts = L.spec.wander.points;
        for (let i = 0; i < L.spec.wander.n; i++) want.set(`${key}:w${i}`, { x: pts[i % pts.length][0] + (i % 3) * 0.7, z: pts[i % pts.length][1], y: L.spec.rooms[0].y0, yaw: i, state: 'wander', pts, seats: L.spec.seats || [], suitcase: i % 5 < 3 });
      }
      if (L.spec.homes) {
        L.spec.homes.forEach((h, i) => {
          if (Math.abs(h.y - player.y) > 4 || i % 2) return;
          want.set(`${key}:a${i}`, { x: h.pt[0], z: h.pt[1], y: h.y, yaw: h.yaw, state: 'resident' });
        });
      }
    }
    let changed = false;
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (p.shopKey && !want.has(p.shopKey)) { this._release(p); this.peds.splice(i, 1); changed = true; }
    }
    if (changed) this._colors();
    for (const [k, w] of want) {
      if (this.peds.length >= MAX) break;
      if (this.deadKeys.has(k) || this.peds.some((p) => p.shopKey === k)) continue;
      const p = this._add({ x: w.x, z: w.z, y: w.y, state: w.state, shopKey: k, pts: w.pts, seats: w.seats, suitcase: !!w.suitcase });
      if (w.cop) this._copLook(p);
      if (w.soldier) {
        // soldier: olive uniform, helmet (the short-hair cap in olive), dark boots
        Object.assign(p.app, { shirt: 0x4b5320, pants: 0x4b5320, shoes: 0x1f1f1f, hair: 0x3f4a2c, long: false, bald: false, soldier: true });
        p.phone = false; p.suitcase = false; p.walkSpeed = 1.3; p.timer = this.rng.float(0, 4);
        this._colors();
      }
      if (w.swim) { p.app.swim = true; p.app.swimColor = [0xe74c3c, 0x2e86c1, 0xf1c40f, 0x1abc9c, 0xe84393, 0x2d3436, 0xff7f50][this.rng.int(0, 6)]; p.phone = false; p.suitcase = false; if (w.state === 'swimmer') { p.fixedY = null; } this._colors(); }
      p.yaw = w.yaw; p.phone = !!w.phone;
      p.homeSpot = { x: w.x, z: w.z, y: w.y, yaw: w.yaw, state: w.state };
      if (w.state === 'wander') { p.wi = this.rng.int(0, w.pts.length - 1); p.timer = this.rng.float(0, 4); }
    }
  }

  update(dt, time, ctx) {
    const { px, pz, cells } = ctx;
    this._lastDt = dt;
    // population
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (p.state === 'dead' && p.timer <= 0 && Math.hypot(p.x - px, p.z - pz) > 25) { this._release(p); this.peds.splice(i, 1); this._colors(); continue; }
      const gone = p.state === 'dead' ? false : p.car ? p.state === 'driving' && (p.car.removed || (p.car.driver !== 'ai' && p.car.driver !== 'police' && !p.car.jacking)) : !p.shopKey && Math.hypot(p.x - px, p.z - pz) > 140;
      if (gone) { if (p.car && p.car.driverPed === p) p.car.driverPed = null; this._release(p); this.peds.splice(i, 1); this._colors(); }
    }
    const walkers = this.peds.filter((p) => !p.shopKey && !p.car).length;
    if (walkers < this.target && cells.length && this.peds.length < MAX) this._spawnWalker(px, pz, cells);
    this._skT = (this._skT || 0) - dt;
    if (this._skT <= 0) { this._skT = 1; this._syncInteriorPeople(ctx.places, ctx.player, ctx.cells); }

    for (const p of this.peds) this._think(p, dt, time, ctx);
    this._render();
  }

  _release(p) { if (p.bench) this.benchesTaken.delete(p.bench.key); }

  _goalOnLoop(p) {
    if (CORNERS[p.corner] === undefined) { p.ix = Math.floor(p.x / P); p.iz = Math.floor(p.z / P); p.corner = 0; p.dir = 1; }
    const c = CORNERS[p.corner];
    return [p.ix * P + c[0], p.iz * P + c[1]];
  }

  _copLook(p) {
    Object.assign(p.app, { shirt: 0x1f3d7a, pants: 0x14213d, shoes: 0x111111, cop: true, long: false });
    p.phone = false; p.suitcase = false; p.temper = 'fight'; p.walkSpeed = 1.35; p.hp = p.maxHp = 12;
    this._colors();
  }
  // an officer who gets out of a patrol car and runs at the player to arrest them
  addCop(x, z, chase = true) {
    if (this.peds.length >= MAX) return null;
    const p = this._add({ x, z, state: chase ? 'copChase' : 'walk', ix: Math.floor(x / P), iz: Math.floor(z / P), corner: 0, dir: 1 });
    this._copLook(p); p.copChase = chase;
    return p;
  }
  // a person sitting at the wheel of a traffic car
  addDriver(v) {
    if (this.peds.length >= MAX) return null;
    const p = this._add({ x: v.x, z: v.z, state: 'driving', car: v, y: v.y });
    p.phone = false; p.suitcase = false; p.app.h = Math.min(p.app.h, 0.97);
    v.driverPed = p;
    return p;
  }
  // carjacking: the player pulls this driver out and throws them onto the road
  yank(p, v, from) {
    if (!p) return;
    v.object.updateMatrixWorld();
    const w = v.seatWorld(new THREE.Vector3());
    const dp = v.doorPoint();
    p.state = 'pulled'; p.timer = 0.55; p.pull = { x0: w.x, y0: w.y, z0: w.z, x1: dp.x, z1: dp.z };
    const ox = dp.x - v.x, oz = dp.z - v.z, L = Math.hypot(ox, oz) || 1;
    p.throwDir = [ox / L, oz / L];
    p.from = [from.x, from.z];
    this.say(p, ['היי! זה האוטו שלי!', 'מה אתה עושה?!', 'עזוב אותי!', 'לא! הרכב שלי!'][this.rng.int(0, 3)], 2.6);
  }
  _vehicleSeat(p, dt) {
    const v = p.car;
    v.object.updateMatrixWorld();
    const w = v.seatWorld(_seatV);
    p.x = w.x; p.y = w.y - (v.isTwoWheel ? 0 : 0.1); p.z = w.z; p.yaw = v.heading; p.speed = 0;
    p.pose = v.isTwoWheel || v.T.jetski ? 'ride' : 'drive';
  }

  _think(p, dt, time, ctx) {
    const { player, vehicles, graph, statics } = ctx;
    p.timer -= dt;
    if (p.state === 'driving') { if (p.sayT > 0) p.sayT -= dt; this._vehicleSeat(p, dt); return; }
    if (p.state === 'pulled') {
      // dragged out through the door
      if (p.sayT > 0) p.sayT -= dt;
      const k = clamp(1 - p.timer / 0.55, 0, 1), e = k * k * (3 - 2 * k), P = p.pull;
      const gy = heightAt(P.x1, P.z1, P.y0 + 0.5);
      p.x = P.x0 + (P.x1 - P.x0) * e; p.z = P.z0 + (P.z1 - P.z0) * e; p.y = P.y0 + (gy - P.y0) * e + Math.sin(k * Math.PI) * 0.35;
      p.yaw = dampAngle(p.yaw, Math.atan2(p.from[0] - p.x, p.from[1] - p.z), 6, dt);
      p.pose = 'pulled'; p.speed = 0;
      if (p.timer <= 0) {
        // thrown: flies a couple of meters, tumbles and rolls on the asphalt
        const [tx, tz] = p.throwDir;
        p.state = 'thrown'; p.car = null;
        p.vx = tx * 5.2 + (Math.random() - 0.5) * 1.5; p.vz = tz * 5.2 + (Math.random() - 0.5) * 1.5; p.vy = 3.6;
        p.fallYaw = Math.atan2(-tx, -tz); p.tumble = 0; p.spin = 7 + Math.random() * 3; p.bounced = 0; p.timer = 3.2;
      }
      return;
    }
    if (p.state === 'thrown') {
      if (p.sayT > 0) p.sayT -= dt;
      const gy = heightAt(p.x, p.z, p.y + 0.6);
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.y > gy + 0.01 || p.vy > 0) {
        p.vy -= 17 * dt; p.y += p.vy * dt; p.tumble += p.spin * dt;
        if (p.y <= gy) {
          p.y = gy;
          if (p.bounced < 1 && p.vy < -3) { p.vy = -p.vy * 0.28; p.bounced++; p.spin *= 0.5; }
          else p.vy = 0;
        }
      } else {
        // sliding / rolling to a stop, ending face-down on the road
        p.y = gy;
        p.vx *= Math.exp(-3.2 * dt); p.vz *= Math.exp(-3.2 * dt);
        // come to rest lying on the back (matches the 'fall' pose they get up from)
        const rest = Math.round((p.tumble + Math.PI / 2) / (Math.PI * 2)) * Math.PI * 2 - Math.PI / 2;
        p.tumble = damp(p.tumble, rest, 6, dt);
      }
      // walls/cars stop the slide
      statics?.query(p.x - 1, p.z - 1, p.x + 1, p.z + 1, _q);
      for (const c of _q) { if (c.off || c.tag === 'slab' || !verticalOverlap(p.y + 0.1, p.y + 1, c)) continue; const r = circleVs(p.x, p.z, 0.3, c); if (r.hit) { p.x += r.nx * r.depth; p.z += r.nz * r.depth; p.vx *= 0.3; p.vz *= 0.3; } }
      p.pose = 'thrown'; p.speed = 0;
      if (p.timer <= 0) {
        p.tumble = 0; p.vx = p.vz = 0;
        p.state = 'fall'; p.timer = 1.6; p.afterFall = null;
        p.ix = Math.floor(p.x / P); p.iz = Math.floor(p.z / P); p.corner = this.rng.int(0, 3); p.dir = 1;
        // getting up, then each personality reacts
        p.afterJack = true;
      }
      return;
    }
    if (p.afterJack && p.state !== 'fall') {
      p.afterJack = false;
      const src = { x: player.x, z: player.z };
      if (p.temper === 'fight' && player.state === 'foot') { p.state = 'fight'; this.say(p, 'אתה הולך לשלם על זה!'); }
      else if (p.temper === 'call') { p.state = 'callHelp'; p.timer = 3.5; p.fleeFrom = [src.x, src.z]; this.say(p, 'הלו? גנבו לי את האוטו!', 3.5); }
      else if (p.temper === 'freeze') { p.state = 'surprised'; p.timer = 2.5; this.say(p, 'אני לא מאמין...'); }
      else { p.state = 'flee'; p.timer = 7; p.fleeFrom = [src.x, src.z]; this.say(p, ['קח אותו, קח!', 'משוגע!', 'הצילו!'][this.rng.int(0, 2)]); }
    }
    let goal = null, speed = p.walkSpeed, pose = 'walk';
    // ---- danger: fast vehicle heading at us
    if (p.hitT > 0) p.hitT -= dt;
    if (p.sayT > 0) p.sayT -= dt;
    if (p.barT > 0) p.barT -= dt;
    if (!['shopkeeper', 'resident', 'inside', 'fall', 'flee', 'fight', 'down', 'evade', 'surprised', 'callHelp', 'dazed', 'driving', 'pulled', 'thrown', 'dead', 'swimmer', 'sunbathe', 'beachsit', 'guard', 'copChase'].includes(p.state)) {
      for (const v of vehicles) {
        const sp = Math.hypot(v.vx, v.vz);
        if (sp < 4 || Math.abs(v.x - p.x) > 12 || Math.abs(v.z - p.z) > 12 || v.y - p.y > 3) continue;
        const dx = p.x - v.x, dz = p.z - v.z;
        const along = (dx * v.vx + dz * v.vz) / sp;
        const lat = Math.abs(dx * v.vz - dz * v.vx) / sp;
        if (v.collider && verticalOverlap(p.y, p.y + 1.7, v.collider) && circleVs(p.x, p.z, 0.35, v.collider).hit && sp > 3) {
          this._release(p);
          p.state = 'fall'; p.timer = 2.6; p.seat = null; p.fixedY = null; p.fallYaw = Math.atan2(v.vx, v.vz); p.bench = null;
          if (v.driver === 'player') ctx.onCrime?.(p.app.cop ? 'copHit' : 'assault', p.x, p.z);
          p.vx = v.vx * 0.5; p.vz = v.vz * 0.5;
          break;
        }
        if (along > 0 && along < 10 && lat < 2.4 && p.state !== 'dodge') {
          const side = (dx * v.vz - dz * v.vx) > 0 ? 1 : -1;
          p.dodge = [p.x + (v.vz / sp) * side * 2.6, p.z - (v.vx / sp) * side * 2.6];
          p.prevState = p.state === 'cross' ? 'cross' : p.state === 'sit' ? 'walk' : p.state;
          this._release(p);
          p.state = 'dodge'; p.timer = 0.9; p.seat = null; p.fixedY = null;
        }
      }
    }
    switch (p.state) {
      case 'shopkeeper':
        pose = p.phone ? 'phone' : Math.sin(time * 0.3 + p.x) > 0.7 ? 'talk' : 'idle'; speed = 0;
        break;
      case 'resident':
        pose = 'sit'; speed = 0;
        break;
      case 'copChase': {
        const pl = ctx.player, dx = pl.x - p.x, dz = pl.z - p.z, d = Math.hypot(dx, dz);
        if (!p.copChase) { p.state = 'walk'; break; }
        if (pl.state === 'foot' || d > 4) { goal = [pl.x, pl.z]; speed = d > 2 ? 4.6 : 1.4; pose = d > 2 ? 'run' : 'guard'; }
        else { speed = 0; pose = 'guard'; }
        if (d > 160) p.copChase = false;
        break;
      }
      case 'guard': speed = 0; pose = Math.sin(time * 0.25 + p.x * 0.7) > 0.55 ? 'talk' : 'idle'; if (p.homeSpot) p.yaw = dampAngle(p.yaw, p.homeSpot.yaw, 4, dt); break;
      case 'sunbathe': speed = 0; pose = 'sunbathe'; p.y = damp(p.y, p.homeSpot?.y ?? p.y, 8, dt); break;
      case 'beachsit': speed = 0; pose = 'beachsit'; break;
      case 'swimmer': {
        // swims slowly back and forth parallel to the shore
        const h = p.homeSpot; p.swimT = (p.swimT || 0) + dt;
        const tz = h.z + Math.sin(p.swimT * 0.12 + h.x) * 14;
        goal = [h.x + Math.sin(p.swimT * 0.07) * 4, tz]; speed = 0.9; pose = 'swim';
        break;
      }
      case 'goHome': {
        const h = p.homeSpot;
        goal = [h.x, h.z]; speed = p.walkSpeed * 0.9;
        if (Math.hypot(h.x - p.x, h.z - p.z) < 0.35 || p.timer < -25) { p.x = h.x; p.z = h.z; p.state = h.state; p.yaw = h.yaw; p.timer = this.rng.float(6, 12); goal = null; }
        break;
      }
      case 'wander': {
        // travellers in the terminal: walk to a spot, wait or sit for a while, move on
        goal = p.pts[p.wi]; speed = p.walkSpeed * 0.9;
        if (p.timer > 0) { speed = 0; pose = p.phone ? 'phone' : 'idle'; goal = null; break; }
        if (Math.hypot(goal[0] - p.x, goal[1] - p.z) < 0.8) {
          const seats = p.app.soldier ? [] : (p.seats || []).filter((st) => Math.hypot(st.x - p.x, st.z - p.z) < 14 && !this.peds.some((o) => o !== p && o.seat === st));
          if (seats.length && this.rng.chance(0.55)) { p.seat = this.rng.pick(seats); p.state = 'toSeat'; }
          else if (p.app.soldier) { p.timer = this.rng.float(1, 3); p.wi = (p.wi + 1) % p.pts.length; }   // patrol: corner to corner
          else { p.timer = this.rng.float(3, 9); p.wi = this.rng.int(0, p.pts.length - 1); p.phone = this.rng.chance(0.3); }
        }
        break;
      }
      case 'toSeat': {
        const st = p.seat, ax = st.x + Math.sin(st.yaw) * 0.6, az = st.z + Math.cos(st.yaw) * 0.6;
        goal = [ax, az]; speed = p.walkSpeed * 0.9;
        if (Math.hypot(ax - p.x, az - p.z) < 0.35) { p.state = 'seated'; p.timer = this.rng.float(10, 25); }
        break;
      }
      case 'seated': {
        const st = p.seat; speed = 0; pose = 'sit';
        p.x = damp(p.x, st.x, 6, dt); p.z = damp(p.z, st.z, 6, dt); p.yaw = dampAngle(p.yaw, st.yaw, 8, dt);
        p.fixedY = st.y + st.seatH - 0.43;
        if (p.timer <= 0) { p.state = 'wander'; p.seat = null; p.fixedY = null; p.wi = this.rng.int(0, p.pts.length - 1); }
        break;
      }
      case 'walk': {
        goal = this._goalOnLoop(p);
        if (p.phone) pose = 'phoneWalk';
        // side activities
        if (p.timer <= 0) {
          p.timer = this.rng.float(6, 16);
          const r = this.rng.float();
          if (r < 0.2) { p.state = 'phone'; p.timer = this.rng.float(4, 9); }
          else if (r < 0.45) this._tryShop(p);
          else if (r < 0.6) this._tryBench(p, ctx.benches);
          else if (r < 0.8) this._tryTalk(p);
        }
        if (Math.hypot(goal[0] - p.x, goal[1] - p.z) < 0.6) this._atCorner(p, time, graph);
        break;
      }
      case 'waitCross': {
        speed = 0; pose = p.phone ? 'phone' : 'idle';
        p.yaw = dampAngle(p.yaw, Math.atan2(p.crossTo[0] - p.x, p.crossTo[1] - p.z), 6, dt);
        if (this._canCross(p, time, graph, vehicles)) { p.state = 'cross'; }
        else if (p.timer < -40) { p.state = 'walk'; p.timer = 5; this._nextCorner(p); }
        break;
      }
      case 'cross': {
        goal = p.crossTo; speed = p.walkSpeed * 1.15;
        if (Math.hypot(goal[0] - p.x, goal[1] - p.z) < 0.5) {
          p.ix = p.crossCell[0]; p.iz = p.crossCell[1]; p.corner = p.crossCorner;
          p.state = 'walk'; p.timer = this.rng.float(3, 10);
          this._nextCorner(p);
        }
        break;
      }
      case 'phone': speed = 0; pose = 'phone'; if (p.timer <= 0) { p.state = 'walk'; p.timer = this.rng.float(5, 12); } break;
      case 'talk':
        speed = 0; pose = 'talk';
        if (p.partner) p.yaw = dampAngle(p.yaw, Math.atan2(p.partner.x - p.x, p.partner.z - p.z), 5, dt);
        if (p.timer <= 0 || !this.peds.includes(p.partner)) { p.state = 'walk'; p.partner = null; p.timer = this.rng.float(5, 12); }
        break;
      case 'toShop': goal = p.shopPath[0]; if (Math.hypot(goal[0] - p.x, goal[1] - p.z) < 0.35) { p.shopPath.shift(); if (!p.shopPath.length) { p.state = 'inside'; p.timer = this.rng.float(8, 22); } } break;
      case 'inside': speed = 0; pose = 'idle'; if (p.timer <= 0) { p.state = 'leaveShop'; p.shopPath = p.exitPath.slice(); } break;
      case 'leaveShop': goal = p.shopPath[0]; if (Math.hypot(goal[0] - p.x, goal[1] - p.z) < 0.35) { p.shopPath.shift(); if (!p.shopPath.length) { p.state = 'walk'; p.timer = this.rng.float(6, 14); } } break;
      case 'toBench': goal = [p.bench.sx, p.bench.sz]; if (Math.hypot(goal[0] - p.x, goal[1] - p.z) < 0.3) { p.state = 'sit'; p.timer = this.rng.float(10, 25); } break;
      case 'sit':
        speed = 0; pose = 'sit'; p.x = p.bench.sx; p.z = p.bench.sz; p.yaw = dampAngle(p.yaw, (p.bench.rot || 0) + Math.PI, 8, dt);
        if (p.timer <= 0) { this._release(p); p.state = 'walk'; p.timer = this.rng.float(6, 12); p.bench = null; }
        break;
      case 'dodge': goal = p.dodge; speed = 4.5; pose = 'run'; if (p.timer <= 0) { p.state = p.prevState === 'cross' ? 'cross' : this._calm(p); p.timer = p.pts ? 0 : this.rng.float(3, 8); } break;
      case 'fall':
        speed = 0; pose = 'fall';
        p.x += (p.vx || 0) * dt; p.z += (p.vz || 0) * dt; p.vx *= Math.exp(-4 * dt); p.vz *= Math.exp(-4 * dt);
        if (p.timer <= 0) { if (p.afterFall === 'flee') { p.state = 'flee'; p.timer = 6; p.afterFall = null; } else { p.state = this._calm(p); p.timer = p.pts ? 0 : 4; } }
        break;
      // ------------------------------------------------ fight-system states
      case 'fight': {
        // fights back: keep close, guard up, throw punches
        const pl = ctx.player, dx = pl.x - p.x, dz = pl.z - p.z, d = Math.hypot(dx, dz);
        p.yaw = dampAngle(p.yaw, Math.atan2(dx, dz), 10, dt);
        pose = 'guard'; speed = 0;
        if (pl.state !== 'foot' || d > 18 || p.hp <= 2) { p.state = 'flee'; p.timer = 7; p.fleeFrom = [pl.x, pl.z]; this.say(p, p.hp <= 2 ? 'מספיק, מספיק!' : 'ברחתי!'); break; }
        if (d > 1.15) { goal = [pl.x, pl.z]; speed = d > 3 ? 3.2 : 1.6; }
        p.atkCool = (p.atkCool ?? 0.8) - dt;
        if (p.atk) {
          p.atk.t += dt; pose = 'punch';
          if (!p.atk.done && p.atk.t >= 0.17) {
            p.atk.done = true;
            const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
            if (d < 1.45 && (dx * fx + dz * fz) / (d || 1) > 0.5 && Math.abs(pl.y - p.y) < 1) ctx.onPlayerHit?.(p, 4);
          }
          if (p.atk.t >= 0.42) p.atk = null;
        } else if (d < 1.4 && p.atkCool <= 0) { p.atk = { t: 0, side: (p.atkSide = !p.atkSide) }; p.atkCool = 0.9 + this.rng.float(0, 0.6); }
        break;
      }
      case 'evade': {
        // step back / sideways out of reach
        goal = p.evadeTo; speed = 3.4; pose = 'run';
        if (p.timer <= 0 || Math.hypot(goal[0] - p.x, goal[1] - p.z) < 0.4) { p.state = this._calm(p); p.timer = 3; }
        break;
      }
      case 'surprised': speed = 0; pose = 'surprised'; if (p.timer <= 0) { p.state = this._calm(p); p.timer = 4; } break;
      case 'callHelp':
        speed = 0; pose = 'phone';
        if (p.timer <= 0) { p.state = 'flee'; p.timer = 6; }
        break;
      case 'dead':
        speed = 0; pose = 'fall';
        p.x += (p.vx || 0) * dt; p.z += (p.vz || 0) * dt; p.vx *= Math.exp(-4 * dt); p.vz *= Math.exp(-4 * dt);
        break;
      case 'down': {
        // knocked out of the fight (not injured): lies down a while, then gets up dazed and leaves
        speed = 0; pose = 'fall';
        p.x += (p.vx || 0) * dt; p.z += (p.vz || 0) * dt; p.vx *= Math.exp(-4 * dt); p.vz *= Math.exp(-4 * dt);
        if (p.timer <= 0) { p.state = 'dazed'; p.timer = 12; p.fleeFrom = [ctx.player.x, ctx.player.z]; this.say(p, 'אוף... אני הולך מפה'); }
        break;
      }
      case 'dazed': {
        const [sx, sz] = p.fleeFrom, dx = p.x - sx, dz = p.z - sz, L = Math.hypot(dx, dz) || 1;
        goal = [p.x + dx / L * 10, p.z + dz / L * 10]; speed = 1.0; pose = 'walk';
        if (p.timer <= 0) { p.state = this._calm(p); p.timer = 6; p.hp = p.maxHp; p.defeated = false; }
        break;
      }
      case 'flee': {
        const [sx, sz] = p.fleeFrom;
        const dx = p.x - sx, dz = p.z - sz, L = Math.hypot(dx, dz) || 1;
        goal = [p.x + dx / L * 10, p.z + dz / L * 10]; speed = 4.8; pose = 'run';
        if (p.timer <= 0) { p.state = this._calm(p); p.timer = p.pts ? 0 : 5; }
        break;
      }
    }
    // ---- movement with simple avoidance
    if (goal && speed > 0) {
      let dx = goal[0] - p.x, dz = goal[1] - p.z;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      let slow = 1;
      // the player on foot in front of us: wait / sidestep
      if (player.state === 'foot' || player.state === 'sitting') {
        const ox = player.x - p.x, oz = player.z - p.z, along = ox * dx + oz * dz, lat = Math.abs(ox * dz - oz * dx);
        if (along > 0 && along < 1.6 && lat < 0.7 && Math.abs(player.y - p.y) < 1.5) { slow = 0.15; dx += dz * 0.8; dz -= dx * 0.8; }
      }
      for (const o of this.peds) {
        if (o === p || o.state === 'inside') continue;
        const ox = o.x - p.x, oz = o.z - p.z;
        if (Math.abs(ox) > 1.5 || Math.abs(oz) > 1.5) continue;
        const along = ox * dx + oz * dz, lat = ox * dz - oz * dx;
        if (along > 0 && along < 1.2 && Math.abs(lat) < 0.6) { const s = lat > 0 ? -1 : 1; dx += dz * s * 0.7; dz -= dx * s * 0.7; slow = Math.min(slow, 0.6); }
      }
      const L2 = Math.hypot(dx, dz) || 1; dx /= L2; dz /= L2;
      const sp = speed * slow;
      p.x += dx * sp * dt; p.z += dz * sp * dt;
      p.yaw = dampAngle(p.yaw, Math.atan2(dx, dz), 8, dt);
      p.speed = damp(p.speed, sp, 8, dt);
      // never walk through walls/poles (interiors use doors)
      if (statics && p.state !== 'toShop' && p.state !== 'leaveShop' && p.state !== 'seated') {
        // never overlap vehicles either
        for (const v of ctx.vehicles) {
          if (Math.abs(v.x - p.x) > 6 || Math.abs(v.z - p.z) > 6) continue;
          const r = circleVs(p.x, p.z, 0.3, v.collider);
          if (r.hit && verticalOverlap(p.y + 0.3, p.y + 1.7, v.collider)) { p.x += r.nx * r.depth; p.z += r.nz * r.depth; }
        }
        statics.query(p.x - 1, p.z - 1, p.x + 1, p.z + 1, _q);
        for (const c of _q) {
          if (c.off || c.tag === 'slab' || !verticalOverlap(p.y + 0.3, p.y + 1.7, c)) continue;
          const r = circleVs(p.x, p.z, 0.3, c);
          if (r.hit) { p.x += r.nx * r.depth; p.z += r.nz * r.depth; }
        }
      }
    } else p.speed = damp(p.speed, 0, 8, dt);
    if (p.state === 'swimmer') { p.y = WATER_Y - 0.55 + Math.sin(performance.now() * 0.002 + p.x) * 0.05; p.pose = pose; return; }
    p.y = p.fixedY != null ? damp(p.y, p.fixedY, 8, dt) : damp(p.y, heightAt(p.x, p.z, p.y + 0.4), 12, dt);
    p.pose = pose;
  }

  // something dangerous happened near this person (explosion, energy blast): duck / fall, then run away
  scare(p, src, hit) {
    if (p.state === 'driving' || p.state === 'pulled' || p.state === 'thrown') return;
    p.seat = null; p.fixedY = null;
    this._release(p);
    if (hit && p.state !== 'fall') {
      p.state = 'fall'; p.timer = 2.4; p.fallYaw = Math.atan2(p.x - src.x, p.z - src.z); p.vx = (p.x - src.x) * 0.6; p.vz = (p.z - src.z) * 0.6;
      p.afterFall = 'flee'; p.fleeFrom = [src.x, src.z];
      return;
    }
    if (p.state === 'fall' || p.state === 'flee') return;
    p.state = 'flee'; p.timer = 6; p.fleeFrom = [src.x, src.z];
  }

  say(p, text, t = 2.2) { p.say = text; p.sayT = t; }

  // state to return to after a scare/fight: travellers wander, people who live/work inside walk back to their spot
  _calm(p) {
    if (p.homeSpot && !p.pts) return 'goHome';
    return p.pts ? 'wander' : 'walk';
  }

  // a person got hit in a fist fight
  hit(p, src, dmg, kick) {
    if (p.state === 'down' || p.state === 'dazed' || p.state === 'dead' || p.state === 'driving' || p.state === 'pulled' || p.state === 'thrown') return false;
    this._release(p); p.seat = null; p.fixedY = null;
    p.hp = Math.max(0, p.hp - dmg); p.barT = 6; p.hitT = 0.35;
    const dx = p.x - src.x, dz = p.z - src.z, L = Math.hypot(dx, dz) || 1;
    p.x += dx / L * (kick ? 0.7 : 0.35); p.z += dz / L * (kick ? 0.7 : 0.35);
    if (p.hp <= 0) {
      // out of health: the person collapses and stays down for good (no blood, no gore)
      p.state = 'dead'; p.timer = 45; p.defeated = true; p.vx = dx / L * (kick === true ? 3 : 2.4); p.vz = dz / L * (kick === true ? 3 : 2.4); p.atk = null;
      p.fallYaw = Math.atan2(-dx, -dz); p.sayT = 0; p.barT = 4;
      if (p.shopKey) this.deadKeys.add(p.shopKey);
      return 'dead';
    }
    if (p.state !== 'fight') {
      if (p.temper === 'fight') { p.state = 'fight'; this.say(p, ['רוצה מכות?!', 'בוא נראה אותך!', 'טעית בבן אדם!'][this.rng.int(0, 2)]); }
      else this.react(p, src, true);
    }
    return 'hit';
  }

  // someone saw (or felt) a fight: every personality reacts differently
  react(p, src, wasHit = false) {
    if (['fight', 'down', 'dazed', 'dead', 'inside', 'driving', 'pulled', 'thrown'].includes(p.state)) return;
    // people sitting at home or standing at work only react when they are hit or the fight is right next to them
    if ((p.state === 'shopkeeper' || p.state === 'resident') && !wasHit && Math.hypot(p.x - src.x, p.z - src.z) > 4) return;
    if (!wasHit && p.reactedAt && performance.now() - p.reactedAt < 8000) return;
    p.reactedAt = performance.now();
    this._release(p); p.seat = null; p.fixedY = null;
    const dx = p.x - src.x, dz = p.z - src.z, L = Math.hypot(dx, dz) || 1;
    switch (p.temper) {
      case 'dodge': {
        const side = this.rng.chance(0.5) ? 1 : -1;
        p.evadeTo = [p.x + dx / L * 3 + (-dz / L) * side * 2, p.z + dz / L * 3 + (dx / L) * side * 2];
        p.state = 'evade'; p.timer = 1.6; this.say(p, 'וואו, זהירות!'); break;
      }
      case 'flee': p.state = 'flee'; p.timer = 7; p.fleeFrom = [src.x, src.z]; this.say(p, ['הצילו!', 'אני מתחפף!', 'משוגע!'][this.rng.int(0, 2)]); break;
      case 'freeze': p.state = 'surprised'; p.timer = 3; p.yaw = Math.atan2(-dx, -dz); this.say(p, ['מה קורה פה?!', 'וואו!', 'אין מצב...'][this.rng.int(0, 2)]); break;
      case 'call': p.state = 'callHelp'; p.timer = 3.5; p.fleeFrom = [src.x, src.z]; p.yaw = Math.atan2(-dx, -dz); this.say(p, 'הלו? יש פה קטטה ברחוב!', 3.5); break;
      case 'fight':
        if (wasHit) { p.state = 'fight'; this.say(p, 'רוצה מכות?!'); }
        else { p.state = 'surprised'; p.timer = 2; this.say(p, 'היי! תירגע!'); }
        break;
    }
  }

  _nextCorner(p) { p.corner = (p.corner + p.dir + 4) % 4; }

  _atCorner(p, time, graph) {
    // maybe cross the street to the neighbouring block
    const c = p.corner, ox = p.ix * P, oz = p.iz * P;
    const opts = [];
    const add = (cell, corner, to, node, axis) => { if (isUrban(cell[0], cell[1])) opts.push({ cell, corner, to, node, axis }); };
    if (c === 0) { add([p.ix, p.iz - 1], 3, [ox + 10, oz - 10], [p.ix, p.iz], 'x'); add([p.ix - 1, p.iz], 1, [ox - 10, oz + 10], [p.ix, p.iz], 'z'); }
    if (c === 1) { add([p.ix, p.iz - 1], 2, [ox + 90, oz - 10], [p.ix + 1, p.iz], 'x'); add([p.ix + 1, p.iz], 0, [ox + 110, oz + 10], [p.ix + 1, p.iz], 'z'); }
    if (c === 2) { add([p.ix, p.iz + 1], 1, [ox + 90, oz + 110], [p.ix + 1, p.iz + 1], 'x'); add([p.ix + 1, p.iz], 3, [ox + 110, oz + 90], [p.ix + 1, p.iz + 1], 'z'); }
    if (c === 3) { add([p.ix, p.iz + 1], 0, [ox + 10, oz + 110], [p.ix, p.iz + 1], 'x'); add([p.ix - 1, p.iz], 2, [ox - 10, oz + 90], [p.ix, p.iz + 1], 'z'); }
    if (opts.length && this.rng.chance(0.4)) {
      const o = this.rng.pick(opts);
      p.state = 'waitCross'; p.crossTo = o.to; p.crossCell = o.cell; p.crossCorner = o.corner; p.crossNode = graph.node(o.node[0], o.node[1]); p.crossAxis = o.axis;
      p.timer = 0;
      return;
    }
    if (this.rng.chance(0.15)) p.dir = -p.dir;
    this._nextCorner(p);
  }

  _canCross(p, time, graph, vehicles) {
    const n = p.crossNode;
    if (n.lights) {
      if (lightState(n, p.crossAxis, time) !== 'r') return false;
      // wait one beat after red starts so cars have stopped
    }
    // no vehicle about to drive through the crosswalk
    const mx = (p.x + p.crossTo[0]) / 2, mz = (p.z + p.crossTo[1]) / 2;
    for (const v of vehicles) {
      const d = Math.hypot(v.x - mx, v.z - mz);
      if (d < 9) return false;
      const sp = Math.hypot(v.vx, v.vz);
      if (!n.lights && sp > 2 && d < 30 && ((mx - v.x) * v.vx + (mz - v.z) * v.vz) > 0) return false;
    }
    return true;
  }

  _tryTalk(p) {
    for (const o of this.peds) {
      if (o === p || o.state !== 'walk') continue;
      if (Math.hypot(o.x - p.x, o.z - p.z) < 2.5) {
        const t = this.rng.float(6, 14);
        p.state = o.state = 'talk'; p.partner = o; o.partner = p; p.timer = o.timer = t;
        return;
      }
    }
  }

  _tryShop(p) {
    const cd = cellData(p.ix, p.iz);
    let best = null, bd = 6;
    for (const b of cd.buildings) {
      if (!b.interior) continue;
      const d = Math.hypot(b.door.x - p.x, b.door.z - p.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return;
    const [fx, fz] = [best.door.x - best.x, best.door.z - best.z];
    const L = Math.hypot(fx, fz); const nx = Math.round(fx / L), nz = Math.round(fz / L);
    const outside = [best.door.x + nx * 0.8, best.door.z + nz * 0.8];
    const inside = [best.door.x - nx * 3.2 + (this.rng.float(-1, 1)), best.door.z - nz * 3.2 + (this.rng.float(-1, 1))];
    p.shopPath = [outside, [best.door.x - nx * 0.8, best.door.z - nz * 0.8], inside];
    p.exitPath = [[best.door.x - nx * 0.8, best.door.z - nz * 0.8], outside];
    p.state = 'toShop';
  }

  _tryBench(p, benches) {
    if (!benches) return;
    for (const b of benches) {
      if (Math.abs(b.x - p.x) > 6 || Math.abs(b.z - p.z) > 6) continue;
      const key = b.x.toFixed(1) + ',' + b.z.toFixed(1);
      if (this.benchesTaken.has(key)) continue;
      const r = b.rot || 0;
      p.bench = { key, sx: b.x - Math.sin(r) * 0.08, sz: b.z - Math.cos(r) * 0.08, rot: r };
      this.benchesTaken.add(key);
      p.state = 'toBench';
      return;
    }
  }

  // ------------------------------------------------------------------ pose + render
  _pose(p, dt) {
    const j = p.j, t = {};
    const sp = p.speed;
    const runK = clamp((sp - 2) / 2.5, 0, 1), moveK = clamp(sp / 1.2, 0, 1);
    p.phase += dt * (sp / (1.3 + runK * 0.9)) * Math.PI;
    const s = Math.sin(p.phase), c = Math.cos(p.phase);
    let hipsY = 0.95 - Math.abs(s) * 0.03 * moveK;
    const swing = (0.42 + runK * 0.4) * moveK;
    t.legL = -s * swing; t.legR = s * swing;
    t.kneeL = Math.max(0, c) * (0.3 + runK) * moveK + 0.05; t.kneeR = Math.max(0, -c) * (0.3 + runK) * moveK + 0.05;
    t.armL = s * (0.35 + runK * 0.5) * moveK; t.armR = -s * (0.35 + runK * 0.5) * moveK;
    t.elbowL = -0.15 - runK; t.elbowR = -0.15 - runK; t.side = 0.08; t.spine = 0.03 + runK * 0.15; t.head = 0;
    t.bodyX = 0;
    const now = performance.now() * 0.001;
    switch (p.pose) {
      case 'phone': case 'phoneWalk':
        t.armR = -1.1; t.elbowR = -1.6; t.head = 0.35;
        break;
      case 'talk':
        t.armR = -0.6 + Math.sin(now * 3 + p.x) * 0.35; t.elbowR = -1.0; t.armL = -0.2 + Math.sin(now * 2.3 + p.z) * 0.2; t.elbowL = -0.6;
        t.head = Math.sin(now * 1.5 + p.x) * 0.1;
        break;
      case 'idle': t.spine = Math.sin(now * 2 + p.x) * 0.015; break;
      case 'sit':
        t.legL = t.legR = -1.45; t.kneeL = t.kneeR = 1.4; t.armL = t.armR = -0.35; t.elbowL = t.elbowR = -0.9; t.spine = -0.05; hipsY = 0.5;
        break;
      case 'sunbathe':
        // lying on the back on a towel, hands behind the head
        t.bodyX = -1.52; t.legL = 0.05; t.legR = -0.1; t.kneeL = 0.05; t.kneeR = 0.35; t.armL = -2.7; t.armR = -2.7; t.elbowL = t.elbowR = -2.0; t.side = 0.6; hipsY = 0.13; t.spine = 0; t.head = 0.1;
        break;
      case 'beachsit':
        t.legL = t.legR = -1.35; t.kneeL = t.kneeR = 1.9; t.armL = t.armR = 0.3; t.elbowL = t.elbowR = -0.2; t.side = 0.25; t.spine = -0.25; hipsY = 0.22;
        break;
      case 'swim': {
        const ph = now * 2.4 + p.x;
        t.bodyX = -1.3; t.armL = -2.6 + Math.sin(ph) * 1.3; t.armR = -2.6 - Math.sin(ph) * 1.3; t.elbowL = t.elbowR = -0.3;
        t.legL = Math.sin(ph * 2) * 0.3; t.legR = -Math.sin(ph * 2) * 0.3; t.kneeL = t.kneeR = 0.15; t.side = 0.3; hipsY = 0.3;
        break;
      }
      case 'drive': case 'ride':
        // seated at the wheel, hands on it (riders: legs apart, arms on the bars)
        { const ride = p.pose === 'ride', st = (p.car?.steer || 0) * 0.35;
          t.legL = t.legR = ride ? -0.95 : -1.25; t.kneeL = t.kneeR = ride ? 1.2 : 1.1;
          t.armL = (ride ? -1.15 : -1.05) + st; t.armR = (ride ? -1.15 : -1.05) - st; t.elbowL = t.elbowR = ride ? -0.2 : -0.55;
          t.side = ride ? 0.15 : 0.12; t.spine = ride ? 0.35 : -0.05; hipsY = ride ? 0.62 : 0.5; }
        t.head = Math.sin(now * 0.7 + p.phase) * 0.08;
        break;
      case 'pulled':
        // dragged by the collar: legs trailing, arms flailing
        t.legL = -0.9; t.legR = -0.5; t.kneeL = 1.0; t.kneeR = 0.6; t.armL = -2.2 + Math.sin(now * 14) * 0.5; t.armR = -1.6 + Math.cos(now * 13) * 0.5;
        t.elbowL = t.elbowR = -0.5; t.side = 0.4; t.spine = -0.35; t.head = -0.3; hipsY = 0.75;
        break;
      case 'thrown':
        if (p.vy === 0 && Math.abs(p.vx) + Math.abs(p.vz) < 0.6) { t.armL = -2.6; t.armR = -2.4; t.legL = 0.1; t.legR = -0.2; t.side = 0.3; hipsY = 0.95; break; }
        // limbs loose while flying/rolling
        t.legL = -0.4 + Math.sin(now * 9) * 0.5; t.legR = 0.2 + Math.cos(now * 8) * 0.5; t.kneeL = 0.9; t.kneeR = 0.5;
        t.armL = -2.5 + Math.sin(now * 11) * 0.6; t.armR = -1.2 + Math.cos(now * 10) * 0.6; t.elbowL = t.elbowR = -0.7; t.side = 0.6; t.spine = 0.3; hipsY = 0.95;
        break;
      case 'fall':
        t.bodyX = -1.45; t.armL = -2.6; t.armR = -2.4; t.legL = 0.1; t.legR = -0.2; hipsY = 0.2;
        break;
      case 'guard': case 'punch': {
        // boxing guard, knees soft; punch: one arm drives forward and back
        t.armL = -1.0; t.armR = -1.0; t.elbowL = -1.9; t.elbowR = -1.9; t.side = 0.25; t.spine = 0.12; t.kneeL = t.kneeR = 0.25 + (sp > 0.2 ? Math.max(0, c) * 0.4 : 0); hipsY = 0.9;
        if (p.pose === 'punch' && p.atk) {
          const k2 = Math.min(1, p.atk.t / 0.42), e = k2 < 0.4 ? Math.sin(k2 / 0.4 * Math.PI / 2) : Math.cos((k2 - 0.4) / 0.6 * Math.PI / 2);
          if (p.atk.side) { t.armR = -1.0 - 0.6 * e; t.elbowR = -1.9 + 1.85 * e; } else { t.armL = -1.0 - 0.6 * e; t.elbowL = -1.9 + 1.85 * e; }
          t.spine = 0.12 + 0.12 * e;
        }
        break;
      }
      case 'surprised':
        t.armL = t.armR = -2.3; t.elbowL = t.elbowR = -1.2; t.side = 0.5; t.spine = -0.12; t.head = -0.15;
        break;
    }
    if (p.hitT > 0) { const k2 = p.hitT / 0.35; t.spine -= 0.45 * k2; t.head -= 0.35 * k2; t.armL -= 0.4 * k2; t.armR -= 0.4 * k2; }
    const k = 12;
    for (const key of Object.keys(t)) j[key] = damp(j[key] ?? t[key], t[key], k, dt);
    j.hipsY = damp(j.hipsY ?? hipsY, hipsY, k, dt);
    const R = this.rig;
    R.hips.position.y = j.hipsY;
    R.body.rotation.x = j.bodyX;
    R.spine.rotation.x = j.spine;
    R.head.rotation.x = j.head;
    R.hip[0].rotation.x = j.legL; R.hip[1].rotation.x = j.legR;
    R.knee[0].rotation.x = j.kneeL; R.knee[1].rotation.x = j.kneeR;
    R.sh[0].rotation.x = j.armL; R.sh[1].rotation.x = j.armR;
    R.sh[0].rotation.z = -j.side; R.sh[1].rotation.z = j.side;
    R.el[0].rotation.x = j.elbowL; R.el[1].rotation.x = j.elbowR;
  }

  _render() {
    const R = this.rig, M = this.M;
    const dt = this._lastDt || 0.016;
    this.peds.forEach((p, i) => {
      this._pose(p, dt);
      R.root.position.set(p.x, p.y, p.z);
      R.root.rotation.set(0, p.state === 'fall' || p.state === 'dead' ? p.fallYaw : p.yaw, 0);
      if (p.state === 'thrown') {
        // somersault around the hips while flying, settling on the ground
        // rotate about the hips: keep the hip point at its height above the road (lower when lying flat)
        const yaw = p.fallYaw, a = p.tumble, h = 0.95, hc = 0.16 + 0.79 * Math.abs(Math.cos(a));
        R.root.rotation.set(a, yaw, 0, 'YXZ');
        R.root.position.set(p.x - h * Math.sin(a) * Math.sin(yaw), p.y + hc - h * Math.cos(a), p.z - h * Math.sin(a) * Math.cos(yaw));
      } else R.root.rotation.order = 'XYZ';
      R.body.scale.set(p.app.w, p.app.h, p.app.w);
      R.root.updateMatrixWorld(true);
      const a = R.a;
      M.pelvis.setMatrixAt(i, a.pelvis.matrixWorld); M.torso.setMatrixAt(i, a.torso.matrixWorld); M.head.setMatrixAt(i, a.head.matrixWorld);
      M.hairS.setMatrixAt(i, p.app.bald ? this.zero : a.hairS.matrixWorld);
      M.hairL.setMatrixAt(i, p.app.long ? a.hairL.matrixWorld : this.zero);
      M.phone.setMatrixAt(i, p.pose === 'phone' || p.pose === 'phoneWalk' ? a.phone.matrixWorld : this.zero);
      M.neck.setMatrixAt(i, a.neck.matrixWorld); M.shoulders.setMatrixAt(i, a.shoulders.matrixWorld);
      M.nose.setMatrixAt(i, a.nose.matrixWorld); M.eyes.setMatrixAt(i, a.eyes.matrixWorld);
      const sol = !!p.app.soldier;
      M.helmet.setMatrixAt(i, sol || p.app.cop ? a.helmet.matrixWorld : this.zero); M.vest.setMatrixAt(i, sol ? a.vest.matrixWorld : this.zero); M.rifle.setMatrixAt(i, sol ? a.rifle.matrixWorld : this.zero);
      if (sol) M.hairS.setMatrixAt(i, this.zero);
      M.bag.setMatrixAt(i, p.suitcase && p.pose !== 'sit' ? a.bag.matrixWorld : this.zero);
      for (let s = 0; s < 2; s++) {
        M.uArm.setMatrixAt(i * 2 + s, a.uArm[s].matrixWorld); M.lArm.setMatrixAt(i * 2 + s, a.lArm[s].matrixWorld); M.hand.setMatrixAt(i * 2 + s, a.hand[s].matrixWorld);
        M.uLeg.setMatrixAt(i * 2 + s, a.uLeg[s].matrixWorld); M.lLeg.setMatrixAt(i * 2 + s, a.lLeg[s].matrixWorld); M.foot.setMatrixAt(i * 2 + s, a.foot[s].matrixWorld);
      }
    });
    const n = this.peds.length;
    for (const [k, m] of Object.entries(M)) {
      m.count = ['uArm', 'lArm', 'hand', 'uLeg', 'lLeg', 'foot'].includes(k) ? n * 2 : n;
      m.instanceMatrix.needsUpdate = true;
    }
  }
}

function capGeo(g) { return g; }
