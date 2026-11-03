// Builds the inside of enterable buildings when the player is near (furniture, walls, floors, lights),
// and runs the elevators: a real cabin that travels between floors with sliding cabin and landing doors.
import * as THREE from 'three';
import { GeoBuilder } from './geoBuilder.js';
import { interiorSpec } from './interiors.js';
import { buildInterior, G } from './chunkManager.js';
import { cellData } from './worldGen.js';
import { movingSurfaces } from './terrain.js';
import { P } from './layout.js';
import { buildAirliner } from './airport.js';

const LOAD_R = 45, UNLOAD_R = 75;

function distToRect(x, z, b) {
  const dx = Math.max(0, Math.abs(x - b.x) - b.w / 2), dz = Math.max(0, Math.abs(z - b.z) - b.d / 2);
  return Math.hypot(dx, dz);
}

class Elevator {
  constructor(e, mats, parent) {
    this.e = e;
    this.y = e.floors[0];
    this.floor = 0;
    this.target = null;
    this.vel = 0;
    this.door = 0;          // 0 closed .. 1 open
    this.doorWant = false;
    this.holdT = 0;
    const [x0, z0, x1, z1] = e.cabin;
    this.cx = (x0 + x1) / 2; this.cz = (z0 + z1) / 2;
    this.surface = { rect: [x0 + 0.05, z0 + 0.05, x1 - 0.05, z1 - 0.05], y: this.y };
    movingSurfaces.add(this.surface);
    // cabin body (floor, ceiling, back + side walls, handrail, light, button panel)
    const b = new GeoBuilder(), lb = new GeoBuilder();
    const w = x1 - x0, d = z1 - z0, H = 2.45;
    const box = (cx, cy, cz, sx, sy, sz, col) => b.addGeometry(G.box, new THREE.Matrix4().compose(new THREE.Vector3(cx - this.cx, cy, cz - this.cz), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)), col);
    box(this.cx, -0.06, this.cz, w, 0.12, d, 0x6f6a63);
    box(this.cx, H + 0.05, this.cz, w, 0.1, d, 0xd8d6d0);
    const [ox, oz] = e.out, [lx, lz] = e.lat;
    // back wall is on the side opposite to "out"
    const backX = this.cx - ox * (Math.abs(ox) ? w / 2 : 0), backZ = this.cz - oz * (Math.abs(oz) ? d / 2 : 0);
    box(backX, H / 2, backZ, Math.abs(ox) ? 0.06 : w, H, Math.abs(oz) ? 0.06 : d, 0xb9c0c6);
    for (const s of [-1, 1]) {
      const sx = this.cx + lx * s * (Math.abs(lx) ? w / 2 : 0), sz = this.cz + lz * s * (Math.abs(lz) ? d / 2 : 0);
      box(sx, H / 2, sz, Math.abs(lx) ? 0.06 : w, H, Math.abs(lz) ? 0.06 : d, 0xc7cdd2);
    }
    box(backX + ox * 0.08, 0.95, backZ + oz * 0.08, Math.abs(ox) ? 0.04 : w * 0.8, 0.05, Math.abs(oz) ? 0.04 : d * 0.8, 0x9aa0a6);
    lb.addGeometry(G.box, new THREE.Matrix4().compose(new THREE.Vector3(0, H - 0.01, 0), new THREE.Quaternion(), new THREE.Vector3(w * 0.6, 0.03, d * 0.6)), 0xffffff);
    this.cabin = new THREE.Group();
    this.cabin.add(new THREE.Mesh(b.build(), mats.props), new THREE.Mesh(lb.build(), mats.lamp));
    this.cabin.position.set(this.cx, this.y, this.cz);
    parent.add(this.cabin);
    // sliding doors: 2 cabin panels (move with the cabin) + 2 landing panels per floor (instanced)
    const panelGeo = new THREE.BoxGeometry(1, 1, 1);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xaeb5bb, metalness: 0.7, roughness: 0.3 });
    this.cabinDoors = [new THREE.Mesh(panelGeo, doorMat), new THREE.Mesh(panelGeo, doorMat)];
    this.cabinDoors.forEach((m) => this.cabin.add(m));
    this.landing = new THREE.InstancedMesh(panelGeo, doorMat, e.floors.length * 2);
    this.landing.frustumCulled = false;
    parent.add(this.landing);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._layoutDoors(true);
  }

  _panel(cx, cy, cz, open, side) {
    const [ox, oz] = this.e.out, [lx, lz] = this.e.lat;
    const pw = this.e.width / 2;
    const shift = side * (pw / 2 + open * pw * 0.95);
    this._v.set(cx + lx * shift, cy + this.e.height / 2, cz + lz * shift);
    this._s.set(Math.abs(lx) ? pw : 0.05, this.e.height, Math.abs(lz) ? pw : 0.05);
    return this._m.compose(this._v, this._q, this._s);
  }

  _layoutDoors(all) {
    const [dx, dz] = this.e.doorCenter, [ox, oz] = this.e.out;
    // cabin doors (local to cabin group)
    this.cabinDoors.forEach((m, i) => {
      const s = i ? 1 : -1;
      this._panel(dx - ox * 0.1 - this.cx, 0, dz - oz * 0.1 - this.cz, this.door, s);
      m.position.copy(this._v); m.scale.copy(this._s);
    });
    this.e.floors.forEach((fy, k) => {
      const open = k === this.floor && Math.abs(this.y - fy) < 0.02 ? this.door : 0;
      if (!all && k !== this.floor && k !== this._lastFloor) return;
      for (const s of [-1, 1]) this.landing.setMatrixAt(k * 2 + (s > 0 ? 1 : 0), this._panel(dx + ox * 0.1, fy, dz + oz * 0.1, open, s));
    });
    this._lastFloor = this.floor;
    this.landing.instanceMatrix.needsUpdate = true;
  }

  go(k) {
    if (k < 0 || k >= this.e.floors.length) return;
    if (k === this.floor && this.target === null && Math.abs(this.y - this.e.floors[k]) < 0.02) { this.doorWant = true; this.holdT = 6; return; }
    this.target = k;
    this.doorWant = false;
  }

  floorAt(y) {
    let best = 0;
    this.e.floors.forEach((fy, k) => { if (Math.abs(fy - y) < Math.abs(this.e.floors[best] - y)) best = k; });
    return best;
  }

  contains(x, y, z) {
    const r = this.e.cabin;
    return x > r[0] && x < r[2] && z > r[1] && z < r[3] && y > this.y - 0.6 && y < this.y + 1.2;
  }

  update(dt) {
    const e = this.e;
    // doors
    const ds = 1.6 * dt;
    this.door = this.doorWant ? Math.min(1, this.door + ds) : Math.max(0, this.door - ds);
    if (this.door >= 1 && this.target === null) { this.holdT -= dt; if (this.holdT <= 0) this.doorWant = false; }
    // travel (only with doors shut)
    if (this.target !== null && this.door <= 0) {
      const ty = e.floors[this.target];
      const dy = ty - this.y, dist = Math.abs(dy);
      const vmax = Math.min(2.4, Math.sqrt(2 * 1.4 * dist) + 0.05);
      this.vel = Math.min(vmax, this.vel + 1.4 * dt);
      const step = Math.min(dist, this.vel * dt);
      this.y += Math.sign(dy) * step;
      this.floor = this.floorAt(this.y);
      if (dist - step < 0.001) {
        this.y = ty; this.floor = this.target; this.target = null; this.vel = 0;
        this.doorWant = true; this.holdT = 6;
      }
    }
    this.surface.y = this.y;
    this.cabin.position.y = this.y;
    e.ldoors.forEach((c, k) => { c.off = k === this.floor && this.door > 0.85 && Math.abs(this.y - e.floors[k]) < 0.02; });
    this._layoutDoors(false);
  }

  dispose() {
    movingSurfaces.delete(this.surface);
    for (const c of this.e.ldoors) c.off = false;
    this.cabin.parent?.remove(this.cabin);
    this.landing.parent?.remove(this.landing);
    this.cabin.traverse((o) => o.geometry && o.geometry !== this.cabinDoors[0].geometry && o.geometry.dispose());
    this.landing.dispose();
  }
}

export class InteriorManager {
  constructor(scene, mats) {
    this.scene = scene; this.mats = mats;
    this.loaded = new Map(); // key -> { b, group, elevator }
    this.group = new THREE.Group(); this.group.name = 'interiors';
    scene.add(this.group);
    this.panel = document.getElementById('elevPanel');
    this.active = null; // elevator the player is inside
  }

  _key(b) { return `${b.x.toFixed(1)},${b.z.toFixed(1)}`; }

  _build(b) {
    const spec = interiorSpec(b);
    const B = { interior: new GeoBuilder(), props: new GeoBuilder(), lamp: new GeoBuilder(), glass: new GeoBuilder(), signs: new GeoBuilder() };
    buildInterior(spec, b, B);
    const g = new THREE.Group();
    const M = this.mats;
    for (const [k, m] of [['interior', M.interior], ['props', M.props], ['lamp', M.lamp], ['glass', M.glass], ['signs', M.signs]]) {
      if (B[k].empty) continue;
      const mesh = new THREE.Mesh(B[k].build(), m);
      mesh.receiveShadow = k !== 'lamp'; mesh.castShadow = false;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      g.add(mesh);
    }
    // flight boards with the live schedule
    for (const bd of spec.boards || []) {
      if (!this.boardTexture) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bd.w, bd.h), new THREE.MeshBasicMaterial({ map: this.boardTexture }));
      m.position.set(bd.x + bd.nx * 0.05, bd.y, bd.z + bd.nz * 0.05);
      m.rotation.y = Math.atan2(bd.nx, bd.nz);
      g.add(m);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(bd.w + 0.3, bd.h + 0.3, 0.15), M.metal);
      frame.position.set(bd.x - bd.nx * 0.05, bd.y, bd.z - bd.nz * 0.05); frame.rotation.y = m.rotation.y; g.add(frame);
    }
    // an airliner in the hangar
    if (spec.plane) {
      const pb = new GeoBuilder();
      buildAirliner(pb, { tail: 0x6b7480, stripe: 0xb0b8c0 }, true, spec.plane.x, 0.15, spec.plane.z, spec.plane.heading);
      const pm = new THREE.Mesh(pb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.45 }));
      pm.castShadow = true; g.add(pm);
    }
    // suitcases riding the baggage belts
    let belts = null;
    if (spec.belts?.length) {
      const total = spec.belts.reduce((n, b) => n + (b.loop ? 9 : 5), 0);
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.42, 0.26), new THREE.MeshStandardMaterial({ roughness: 0.6 }), total);
      const cols = [0x2c3e50, 0xc0392b, 0x16a085, 0x8e44ad, 0xd35400, 0x34495e, 0x7f8c8d];
      for (let i = 0; i < total; i++) mesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      g.add(mesh);
      belts = { mesh, list: spec.belts.map((bl) => ({ ...bl, n: bl.loop ? 9 : 5, len: bl.path.reduce((L, p, i) => i ? L + Math.hypot(p[0] - bl.path[i - 1][0], p[1] - bl.path[i - 1][1]) : 0, 0) + (bl.loop ? Math.hypot(bl.path[0][0] - bl.path.at(-1)[0], bl.path[0][1] - bl.path.at(-1)[1]) : 0) })), t: 0 };
    }
    this.group.add(g);
    const elevator = spec.elevator ? new Elevator(spec.elevator, M, this.group) : null;
    return { b, spec, group: g, elevator, belts };
  }

  _dispose(L) {
    L.group.traverse((o) => o.geometry && o.geometry.dispose());
    this.group.remove(L.group);
    L.elevator?.dispose();
  }

  // returns all loaded homes/counters for NPC placement
  places() {
    const out = [];
    for (const L of this.loaded.values()) out.push(L);
    return out;
  }

  update(dt, player, force = false) {
    const px = player.x, pz = player.z;
    const ix = Math.floor(px / P), iz = Math.floor(pz / P);
    const want = new Map();
    for (let i = ix - 2; i <= ix + 2; i++) for (let j = iz - 2; j <= iz + 2; j++) {
      for (const b of cellData(i, j).buildings) {
        if (!b.interior) continue;
        const d = distToRect(px, pz, b);
        const k = this._key(b);
        if (d < LOAD_R || (this.loaded.has(k) && d < UNLOAD_R)) want.set(k, [b, d]);
      }
    }
    for (const [k, L] of this.loaded) if (!want.has(k)) { this._dispose(L); this.loaded.delete(k); }
    const todo = [...want].filter(([k]) => !this.loaded.has(k)).sort((a, b) => a[1][1] - b[1][1]);
    let built = 0;
    for (const [k, [b]] of todo) {
      if (!force && built >= 1) break;
      this.loaded.set(k, this._build(b)); built++;
    }
    // baggage belts
    const _mm = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _pp = new THREE.Vector3(), _ss = new THREE.Vector3(1, 1, 1);
    for (const L of this.loaded.values()) {
      const B = L.belts; if (!B) continue;
      B.t += dt * 0.6;
      let k = 0;
      for (const bl of B.list) {
        for (let i = 0; i < bl.n; i++, k++) {
          let s = ((B.t + i * bl.len / bl.n) % bl.len + bl.len) % bl.len;
          const pts = bl.loop ? [...bl.path, bl.path[0]] : bl.path;
          let a = pts[0], c = pts[1];
          for (let j = 1; j < pts.length; j++) { const seg = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); if (s <= seg) { a = pts[j - 1]; c = pts[j]; break; } s -= seg; }
          const seg = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, t = Math.min(1, s / seg);
          _pp.set(a[0] + (c[0] - a[0]) * t, bl.y + 0.21, a[1] + (c[1] - a[1]) * t);
          _qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(c[0] - a[0], c[1] - a[1]) + Math.PI / 2);
          B.mesh.setMatrixAt(k, _mm.compose(_pp, _qq, _ss));
        }
      }
      B.mesh.instanceMatrix.needsUpdate = true;
    }
    // elevators
    let inside = null;
    for (const L of this.loaded.values()) {
      if (!L.elevator) continue;
      L.elevator.update(dt);
      if (player.state === 'foot' && L.elevator.contains(px, player.y, pz)) inside = L.elevator;
    }
    this._panel(inside);
  }

  // contextual action near an elevator landing: { text, action }
  promptFor(player) {
    if (player.state !== 'foot') return null;
    for (const L of this.loaded.values()) {
      const el = L.elevator;
      if (!el) continue;
      const [dx, dz] = el.e.doorPt;
      if (Math.hypot(player.x - dx, player.z - dz) > 2.2) continue;
      const k = el.floorAt(player.y);
      if (Math.abs(el.e.floors[k] - player.y) > 0.8) continue;
      const here = el.floor === k && el.target === null && el.door > 0.5;
      if (here) continue;
      return { text: el.target === k || (el.floor === k && el.doorWant) ? 'המעלית בדרך...' : 'הזמן מעלית', action: () => el.go(k) };
    }
    return null;
  }

  _panel(el) {
    if (!this.panel) return;
    if (el !== this.active) {
      this.active = el;
      this.panel.classList.toggle('show', !!el);
      if (el) {
        const btns = this.panel.querySelector('.floors');
        btns.innerHTML = '';
        el.e.floors.forEach((_, k) => {
          const b = document.createElement('button');
          b.className = 'fbtn' + (el.e.labels ? ' wide' : ''); b.textContent = el.e.labels ? el.e.labels[k] : k === 0 ? 'ק' : String(k); b.dataset.k = k;
          b.onpointerdown = (ev) => { ev.preventDefault(); ev.stopPropagation(); el.go(k); };
          btns.appendChild(b);
        });
      }
    }
    if (el) {
      const st = this.panel.querySelector('.status');
      const cur = el.e.labels ? el.e.labels[el.floor] : el.floor === 0 ? 'קרקע' : el.floor;
      st.textContent = el.target !== null ? `קומה ${cur} ${el.e.floors[el.target] > el.y ? '▲' : '▼'}` : `קומה ${cur}`;
      this.panel.querySelectorAll('.fbtn').forEach((b) => b.classList.toggle('on', +b.dataset.k === el.target || (+b.dataset.k === el.floor && el.target === null)));
    }
  }
}
