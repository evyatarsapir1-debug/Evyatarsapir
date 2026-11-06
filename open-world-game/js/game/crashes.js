// Car crashes: when vehicles hit each other (or a wall) hard, pieces fly off — painted body bits, black plastic,
// glass — with sparks, a dust/smoke puff, a crunch sound and a camera shake; badly damaged cars smoke from the engine.
import * as THREE from 'three';
import { heightAt } from '../world/terrain.js';

const _v = new THREE.Vector3();

export class Crashes {
  constructor(scene) {
    this.scene = scene;
    this.bits = []; this.puffs = [];
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.sphere = new THREE.SphereGeometry(1, 8, 6);
    this.glass = new THREE.MeshStandardMaterial({ color: 0xbfe3f2, metalness: 0.6, roughness: 0.1, transparent: true, opacity: 0.8 });
    this.plastic = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.8 });
    this.spark = new THREE.MeshBasicMaterial({ color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.smoke = new THREE.MeshLambertMaterial({ color: 0xaaa49a, transparent: true, depthWrite: false });
  }

  update(dt, ctx) {
    const { vehicles, player, audio, onShake } = ctx;
    const done = new Set();
    for (const v of vehicles) {
      const e = v.crashEvt;
      if (!e) continue;
      v.crashEvt = null;
      if (done.has(e)) continue;
      done.add(e);
      const d = Math.hypot(e.x - player.x, e.z - player.z);
      if (d > 160) continue;
      const k = Math.min(1, (e.s - 5) / 15);                      // 0 = bump, 1 = heavy crash
      const cars = [e.a, e.b].filter(Boolean);
      const n = Math.round(6 + k * 22);
      for (let i = 0; i < n; i++) {
        const src = cars[i % cars.length];
        const kind = i % 4 === 0 ? 'glass' : i % 3 === 0 ? 'plastic' : 'paint';
        const mat = kind === 'glass' ? this.glass : kind === 'plastic' ? this.plastic : src.parts.paint;
        const m = new THREE.Mesh(this.box, mat);
        const sz = kind === 'glass' ? 0.06 + Math.random() * 0.08 : 0.12 + Math.random() * 0.25 * (0.5 + k);
        m.scale.set(sz, kind === 'glass' ? 0.01 : sz * 0.25, sz * (0.6 + Math.random()));
        m.position.set(e.x + (Math.random() - 0.5), e.y + Math.random() * 0.5, e.z + (Math.random() - 0.5));
        m.castShadow = true; this.scene.add(m);
        const sp = 3 + Math.random() * 6 * (0.6 + k);
        const a = Math.random() * Math.PI * 2;
        this.bits.push({ m, v: new THREE.Vector3(Math.cos(a) * sp + (src.vx || 0) * 0.3, 2 + Math.random() * 4 * (0.5 + k), Math.sin(a) * sp + (src.vz || 0) * 0.3), spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12), t: 8 + Math.random() * 4, rest: false });
      }
      for (let i = 0; i < 8 + k * 14; i++) {
        const m = new THREE.Mesh(this.box, this.spark.clone()); m.scale.set(0.03, 0.03, 0.14);
        m.position.set(e.x, e.y, e.z); this.scene.add(m);
        const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 7;
        this.bits.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 1 + Math.random() * 4, Math.sin(a) * sp), spin: new THREE.Vector3(), t: 0.3 + Math.random() * 0.3, spark: true });
      }
      for (let i = 0; i < 3 + k * 5; i++) this._puff(new THREE.Vector3(e.x + (Math.random() - 0.5) * 2, e.y, e.z + (Math.random() - 0.5) * 2), 0.6 + k * 0.6, 2.5, 0xb5aea2);
      audio?.impact?.(6 + e.s);
      if (d < 30) onShake?.(Math.min(0.8, 0.15 + k * 0.6) * (1 - d / 40));
    }
    // flying parts: gravity, bounce, slide, then lie on the road for a while
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i]; b.t -= dt;
      if (b.t <= 0) { this.scene.remove(b.m); this.bits.splice(i, 1); continue; }
      if (b.spark) { b.v.y -= 12 * dt; b.m.position.addScaledVector(b.v, dt); b.m.lookAt(_v.copy(b.m.position).add(b.v)); b.m.material.opacity = Math.min(1, b.t * 4); continue; }
      if (b.rest) continue;
      b.v.y -= 15 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
      const g = heightAt(b.m.position.x, b.m.position.z, b.m.position.y + 0.3) + 0.02;
      if (b.m.position.y < g) {
        b.m.position.y = g;
        if (b.v.y < -2) { b.v.y *= -0.3; b.v.x *= 0.5; b.v.z *= 0.5; b.spin.multiplyScalar(0.5); }
        else { b.v.set(0, 0, 0); b.rest = true; b.m.rotation.set(0, b.m.rotation.y, 0); }
      }
    }
    if (this.bits.length > 220) { const o = this.bits.shift(); this.scene.remove(o.m); }
    // engine smoke from badly damaged cars near the player
    this._engT = (this._engT || 0) - dt;
    if (this._engT <= 0) {
      this._engT = 0.18;
      for (const v of vehicles) {
        if (v.damage < 55 || v.wrecked || v.isAir || v.isBoat || Math.abs(v.x - player.x) > 90 || Math.abs(v.z - player.z) > 90) continue;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        this._puff(new THREE.Vector3(v.x + fx * v.T.L * 0.38, v.y + v.T.H * 0.75, v.z + fz * v.T.L * 0.38), 0.25 + (v.damage - 55) / 120, 2.2, v.damage > 80 ? 0x3a3835 : 0xd8d4cc);
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]; p.t -= dt; const q = 1 - p.t / p.life;
      p.m.scale.setScalar(p.s * (1 + q * 2.2)); p.m.position.y += dt * 1.2; p.m.material.opacity = 0.55 * (1 - q);
      if (p.t <= 0) { this.scene.remove(p.m); this.puffs.splice(i, 1); }
    }
  }
  _puff(pos, s, life, color) {
    const m = new THREE.Mesh(this.sphere, this.smoke.clone()); m.material.color.setHex(color);
    m.position.copy(pos); m.scale.setScalar(s); this.scene.add(m);
    this.puffs.push({ m, t: life, life, s });
    if (this.puffs.length > 140) { const o = this.puffs.shift(); this.scene.remove(o.m); }
  }
}
