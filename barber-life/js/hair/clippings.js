// Cut hair that falls off the head, slides down the cape and collects on the floor.
import * as THREE from 'three';

const MAX = 6000;
const CAPE = { cx: 0, cz: -0.02, sx: 1.2, sz: 0.82, top: 1.18 };
// cape lathe profile (radius by depth below the neck), matches client.js
const PROF = [[0.05, 0.0], [0.07, -0.015], [0.12, -0.04], [0.19, -0.075], [0.225, -0.12], [0.24, -0.2], [0.245, -0.4], [0.255, -0.62], [0.27, -0.78]];
function capeRadius(dy) {
  if (dy > 0) return 0;
  for (let i = 1; i < PROF.length; i++) {
    if (dy >= PROF[i][1]) {
      const t = (dy - PROF[i - 1][1]) / (PROF[i][1] - PROF[i - 1][1]);
      return PROF[i - 1][0] + (PROF[i][0] - PROF[i - 1][0]) * t;
    }
  }
  return 0;
}

export class Clippings {
  constructor(scene, color) {
    const geo = new THREE.CylinderGeometry(0.00045, 0.00035, 1, 4, 1);
    geo.translate(0, 0.5, 0);
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'clippings';
    scene.add(this.mesh);
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.rot = new Float32Array(MAX * 4);
    this.len = new Float32Array(MAX);
    this.state = new Uint8Array(MAX); // 0 = free, 1 = falling, 2 = sliding on cape, 3 = resting
    this.next = 0;
    this.used = 0;
    this.capeOn = true;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  setColor(c) { this.mat.color.set(c); }

  spawn(worldPos, lengthMM) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.used = Math.min(MAX, this.used + 1);
    this.pos[i * 3] = worldPos.x; this.pos[i * 3 + 1] = worldPos.y; this.pos[i * 3 + 2] = worldPos.z;
    this.vel[i * 3] = (Math.random() - 0.5) * 0.25;
    this.vel[i * 3 + 1] = Math.random() * 0.15;
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
    this._q.setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
    this._q.toArray(this.rot, i * 4);
    this.len[i] = Math.max(0.0015, Math.min(lengthMM * 0.001, 0.06));
    this.state[i] = 1;
    this.dirty = true;
  }

  clear() { this.state.fill(0); this.used = 0; this.next = 0; this.mesh.count = 0; this.dirty = true; }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const P = this.pos, V = this.vel;
    let moving = 0;
    for (let i = 0; i < this.used; i++) {
      const st = this.state[i];
      if (st === 0 || st === 3) continue;
      const k = i * 3;
      moving++;
      if (st === 1 || st === 4) {
        V[k + 1] -= 9.8 * dt;
        const drag = Math.exp(-dt * 3.5); // light hair, strong air drag
        V[k] *= drag; V[k + 1] *= drag; V[k + 2] *= drag;
      } else {
        // sliding down the cape surface
        const dx = (P[k] - CAPE.cx) / CAPE.sx, dz = (P[k + 2] - CAPE.cz) / CAPE.sz;
        const r = Math.hypot(dx, dz) || 1e-4;
        V[k] = dx / r * 0.08; V[k + 2] = dz / r * 0.06; V[k + 1] = -0.18;
        if (Math.random() < dt * 0.6) this.state[i] = 3; // some hairs stick to the cape
      }
      P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
      // cape collision
      const dy = P[k + 1] - CAPE.top;
      if (this.capeOn && st !== 4 && dy < 0 && dy > -0.78) {
        const cr = capeRadius(dy);
        const dx = (P[k] - CAPE.cx) / CAPE.sx, dz = (P[k + 2] - CAPE.cz) / CAPE.sz;
        const r = Math.hypot(dx, dz);
        if (r < cr) {
          const s = cr / (r || 1e-4);
          P[k] = CAPE.cx + dx * s * CAPE.sx * 1.01; P[k + 2] = CAPE.cz + dz * s * CAPE.sz * 1.01;
          if (st === 1) { this.state[i] = 2; this._flatten(i); }
        }
      }
      // lap drape
      if (this.capeOn && st !== 4 && P[k + 1] < 0.67 && P[k + 1] > 0.6 && Math.abs(P[k]) < 0.3 && P[k + 2] > 0.05 && P[k + 2] < 0.5) {
        P[k + 1] = 0.67; this.state[i] = 3; this._flatten(i);
      }
      if (P[k + 1] <= 0.002) { P[k + 1] = 0.002; this.state[i] = 3; this._flatten(i); }
    }
    // matrices (skipped once everything has settled)
    if (!moving && !this.dirty) return;
    this.dirty = moving > 0;
    const m = this._m, q = this._q, s = this._s, p = this._p;
    for (let i = 0; i < this.used; i++) {
      if (this.state[i] === 0) { m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); continue; }
      q.fromArray(this.rot, i * 4);
      p.fromArray(P, i * 3);
      s.set(1, this.len[i], 1);
      m.compose(p, q, s);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Hairs lying on the cape / lap / shoulders (not on the floor). */
  countOnClient() {
    let c = 0;
    for (let i = 0; i < this.used; i++) if ((this.state[i] === 2 || this.state[i] === 3) && this.pos[i * 3 + 1] > 0.05) c++;
    return c;
  }

  /** Neck duster: knocks hairs near a world point off the client so they fall to the floor. */
  dust(p, radius) {
    let n = 0;
    const r2 = radius * radius;
    for (let i = 0; i < this.used; i++) {
      const st = this.state[i];
      if (st !== 2 && st !== 3) continue;
      const k = i * 3;
      if (this.pos[k + 1] <= 0.05) continue;
      const dx = this.pos[k] - p.x, dy = this.pos[k + 1] - p.y, dz = this.pos[k + 2] - p.z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      const h = Math.hypot(this.pos[k], this.pos[k + 2]) || 1;
      this.vel[k] = this.pos[k] / h * 0.6; this.vel[k + 2] = this.pos[k + 2] / h * 0.6; this.vel[k + 1] = 0.3;
      this.pos[k] *= 1.0 + 0.4 / h * 0.1; this.pos[k + 2] *= 1.0 + 0.4 / h * 0.1;
      this.state[i] = 4; // brushed: falls without sticking to the cape again
      n++;
    }
    if (n) this.dirty = true;
    return n;
  }

  _flatten(i) {
    // lie flat on the floor
    this._q.setFromEuler(new THREE.Euler(Math.PI / 2, Math.random() * 6.28, 0, 'YXZ'));
    this._q.toArray(this.rot, i * 4);
  }
}
