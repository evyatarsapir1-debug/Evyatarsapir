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
import { heightAt } from '../world/terrain.js';
import { lightState } from '../traffic/roadGraph.js';
import { circleVs, verticalOverlap } from '../physics/collision.js';
import { interiorSpec } from '../world/interiors.js';
import { SKIN_TONES, HAIR_COLORS, CLOTH_COLORS } from '../character/characterModel.js';

const MAX = 64;
const CORNERS = [[10, 10], [90, 10], [90, 90], [10, 90]];
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 2, 6);
const _q = [];

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
    this.a.phone = g(this.a.hand[1], 0, -0.02, 0.05);
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
    };
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.benchesTaken = new Set();
  }

  setDensity(n) { this.target = Math.min(MAX - 8, n); }
  obstacles() { return this.peds.filter((p) => p.state !== 'inside' && p.state !== 'shopkeeper' && p.state !== 'resident').map((p) => ({ x: p.x, z: p.z, y: p.y, r: 0.45 })); }

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
    this.peds.push(p);
    this._colors();
    return p;
  }

  _colors() {
    const c = new THREE.Color();
    this.peds.forEach((p, i) => {
      const a = p.app;
      const set = (m, idx, hex) => m.setColorAt(idx, c.setHex(hex));
      set(this.M.pelvis, i, a.pants); set(this.M.torso, i, a.shirt); set(this.M.head, i, a.skin);
      set(this.M.hairS, i, a.hair); set(this.M.hairL, i, a.hair); set(this.M.phone, i, 0x111111);
      for (let s = 0; s < 2; s++) {
        set(this.M.uArm, i * 2 + s, a.shirt); set(this.M.lArm, i * 2 + s, a.skin); set(this.M.hand, i * 2 + s, a.skin);
        set(this.M.uLeg, i * 2 + s, a.pants); set(this.M.lLeg, i * 2 + s, a.pants); set(this.M.foot, i * 2 + s, a.shoes);
      }
    });
    for (const m of Object.values(this.M)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // shopkeepers behind counters and residents at home, for interiors loaded around the player
  _syncInteriorPeople(places, player) {
    const want = new Map();
    for (const L of places || []) {
      const key = `${L.b.x.toFixed(1)},${L.b.z.toFixed(1)}`;
      const c = L.spec.counter;
      if (c) want.set(key + ':k', { x: c.keeper[0], z: c.keeper[1], y: c.y, yaw: c.yaw, state: 'shopkeeper' });
      if (L.spec.home) { const h = L.spec.home; want.set(key + ':h', { x: h.pt[0], z: h.pt[1], y: h.y, yaw: h.yaw, state: 'resident' }); }
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
      if ((p.state === 'shopkeeper' || p.state === 'resident') && !want.has(p.shopKey)) { this.peds.splice(i, 1); changed = true; }
    }
    if (changed) this._colors();
    for (const [k, w] of want) {
      if (this.peds.length >= MAX) break;
      if (this.peds.some((p) => p.shopKey === k)) continue;
      const p = this._add({ x: w.x, z: w.z, y: w.y, state: w.state, shopKey: k });
      p.yaw = w.yaw; p.phone = w.state === 'resident' && this.rng.chance(0.3);
    }
  }

  update(dt, time, ctx) {
    const { px, pz, cells } = ctx;
    this._lastDt = dt;
    // population
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (p.state !== 'shopkeeper' && p.state !== 'resident' && Math.hypot(p.x - px, p.z - pz) > 140) { this._release(p); this.peds.splice(i, 1); this._colors(); }
    }
    const walkers = this.peds.filter((p) => p.state !== 'shopkeeper' && p.state !== 'resident').length;
    if (walkers < this.target && cells.length && this.peds.length < MAX) this._spawnWalker(px, pz, cells);
    this._skT = (this._skT || 0) - dt;
    if (this._skT <= 0) { this._skT = 1; this._syncInteriorPeople(ctx.places, ctx.player); }

    for (const p of this.peds) this._think(p, dt, time, ctx);
    this._render();
  }

  _release(p) { if (p.bench) this.benchesTaken.delete(p.bench.key); }

  _goalOnLoop(p) {
    const c = CORNERS[p.corner];
    return [p.ix * P + c[0], p.iz * P + c[1]];
  }

  _think(p, dt, time, ctx) {
    const { player, vehicles, graph, statics } = ctx;
    p.timer -= dt;
    let goal = null, speed = p.walkSpeed, pose = 'walk';
    // ---- danger: fast vehicle heading at us
    if (p.state !== 'shopkeeper' && p.state !== 'resident' && p.state !== 'inside' && p.state !== 'fall' && p.state !== 'flee') {
      for (const v of vehicles) {
        const sp = Math.hypot(v.vx, v.vz);
        if (sp < 4 || Math.abs(v.x - p.x) > 12 || Math.abs(v.z - p.z) > 12) continue;
        const dx = p.x - v.x, dz = p.z - v.z;
        const along = (dx * v.vx + dz * v.vz) / sp;
        const lat = Math.abs(dx * v.vz - dz * v.vx) / sp;
        if (v.collider && verticalOverlap(p.y, p.y + 1.7, v.collider) && circleVs(p.x, p.z, 0.35, v.collider).hit && sp > 3) {
          this._release(p);
          p.state = 'fall'; p.timer = 2.6; p.fallYaw = Math.atan2(v.vx, v.vz); p.bench = null;
          p.vx = v.vx * 0.5; p.vz = v.vz * 0.5;
          break;
        }
        if (along > 0 && along < 10 && lat < 2.4 && p.state !== 'dodge') {
          const side = (dx * v.vz - dz * v.vx) > 0 ? 1 : -1;
          p.dodge = [p.x + (v.vz / sp) * side * 2.6, p.z - (v.vx / sp) * side * 2.6];
          p.prevState = p.state === 'cross' ? 'cross' : p.state === 'sit' ? 'walk' : p.state;
          this._release(p);
          p.state = 'dodge'; p.timer = 0.9;
        }
      }
    }
    switch (p.state) {
      case 'shopkeeper':
        pose = Math.sin(time * 0.3 + p.x) > 0.7 ? 'talk' : 'idle'; speed = 0;
        break;
      case 'resident':
        pose = 'sit'; speed = 0;
        break;
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
      case 'dodge': goal = p.dodge; speed = 4.5; pose = 'run'; if (p.timer <= 0) { p.state = p.prevState === 'cross' ? 'cross' : 'walk'; p.timer = this.rng.float(3, 8); } break;
      case 'fall':
        speed = 0; pose = 'fall';
        p.x += (p.vx || 0) * dt; p.z += (p.vz || 0) * dt; p.vx *= Math.exp(-4 * dt); p.vz *= Math.exp(-4 * dt);
        if (p.timer <= 0) { if (p.afterFall === 'flee') { p.state = 'flee'; p.timer = 6; p.afterFall = null; } else { p.state = 'walk'; p.timer = 4; } }
        break;
      case 'flee': {
        const [sx, sz] = p.fleeFrom;
        const dx = p.x - sx, dz = p.z - sz, L = Math.hypot(dx, dz) || 1;
        goal = [p.x + dx / L * 10, p.z + dz / L * 10]; speed = 4.8; pose = 'run';
        if (p.timer <= 0) { p.state = 'walk'; p.timer = 5; }
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
      if (statics && p.state !== 'toShop' && p.state !== 'leaveShop') {
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
    p.y = damp(p.y, heightAt(p.x, p.z, p.y + 0.4), 12, dt);
    p.pose = pose;
  }

  // something dangerous happened near this person (explosion, energy blast): duck / fall, then run away
  scare(p, src, hit) {
    if (p.state === 'shopkeeper' || p.state === 'resident') { p.pose = 'idle'; return; }
    this._release(p);
    if (hit && p.state !== 'fall') {
      p.state = 'fall'; p.timer = 2.4; p.fallYaw = Math.atan2(p.x - src.x, p.z - src.z); p.vx = (p.x - src.x) * 0.6; p.vz = (p.z - src.z) * 0.6;
      p.afterFall = 'flee'; p.fleeFrom = [src.x, src.z];
      return;
    }
    if (p.state === 'fall' || p.state === 'flee') return;
    p.state = 'flee'; p.timer = 6; p.fleeFrom = [src.x, src.z];
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
      case 'fall':
        t.bodyX = -1.45; t.armL = -2.6; t.armR = -2.4; t.legL = 0.1; t.legR = -0.2; hipsY = 0.2;
        break;
    }
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
      R.root.rotation.set(0, p.state === 'fall' ? p.fallYaw : p.yaw, 0);
      R.body.scale.set(p.app.w, p.app.h, p.app.w);
      R.root.updateMatrixWorld(true);
      const a = R.a;
      M.pelvis.setMatrixAt(i, a.pelvis.matrixWorld); M.torso.setMatrixAt(i, a.torso.matrixWorld); M.head.setMatrixAt(i, a.head.matrixWorld);
      M.hairS.setMatrixAt(i, p.app.bald ? this.zero : a.hairS.matrixWorld);
      M.hairL.setMatrixAt(i, p.app.long ? a.hairL.matrixWorld : this.zero);
      M.phone.setMatrixAt(i, p.pose === 'phone' || p.pose === 'phoneWalk' ? a.phone.matrixWorld : this.zero);
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
