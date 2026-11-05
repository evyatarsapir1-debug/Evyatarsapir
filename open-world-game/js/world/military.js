// Military systems: the tank turret follows your camera and its cannon fires (fictional) shells that explode on
// impact (smoke, fire flash, shake — no gore); fighter jets patrol in formation over the city.
import * as THREE from 'three';
import { segmentVsBox } from '../physics/collision.js';
import { heightAt } from './terrain.js';
import { damp, dampAngle } from '../core/mathx.js';
import { fighterGeometry, FIGHTER_MAT, afterburner } from '../vehicles/fighterModel.js';

const _q = [], _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Military {
  constructor(scene, statics) {
    this.scene = scene; this.statics = statics;
    this.shells = []; this.cool = 0;
    this.shellGeo = new THREE.SphereGeometry(0.18, 8, 6);
    this.shellMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, blending: THREE.AdditiveBlending, transparent: true });
    this.smokeMat = new THREE.MeshLambertMaterial({ color: 0xb8b2a6, transparent: true, depthWrite: false });
    this.sphere = new THREE.SphereGeometry(1, 10, 8);
    this.puffs = [];
    // patrol: two pairs of fighters on long loops over the city and the bay
    this.patrol = [];
    const routes = [{ cx: 500, cz: 450, rx: 1100, rz: 650, y: 230, w: 0.045, ph: 0 }, { cx: 700, cz: 400, rx: 1300, rz: 800, y: 320, w: -0.035, ph: 2.5 }];
    for (const r of routes) for (let k = 0; k < 2; k++) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(fighterGeometry(0x6f7a80, false), FIGHTER_MAT); m.castShadow = true; g.add(m);
      const f = afterburner(); f.scale.set(1, 1, 1.6); g.add(f);
      g.matrixAutoUpdate = true; scene.add(g);
      this.patrol.push({ g, r, off: k, a: r.ph });
    }
  }

  update(dt, ctx) {
    const { player, input, camYaw, camPitch, weapons, audio, onShake } = ctx;
    // ------------------------------------------------ patrol flights
    for (const P of this.patrol) {
      const r = P.r; P.a += r.w * dt;
      const a = P.a - P.off * 0.02 * Math.sign(r.w);
      const x = r.cx + Math.cos(a) * r.rx + P.off * 14, z = r.cz + Math.sin(a) * r.rz - P.off * 10, y = r.y + Math.sin(a * 3) * 25 + P.off * 4;
      const dx = -Math.sin(a) * r.rx * Math.sign(r.w), dz = Math.cos(a) * r.rz * Math.sign(r.w);
      P.g.position.set(x, y, z);
      P.g.rotation.set(0, Math.atan2(dx, dz), 0, 'YXZ');
      P.g.rotation.z = -Math.sign(r.w) * 0.5;   // banked in the turn
    }
    // ------------------------------------------------ tank: turret + cannon
    const v = player.state === 'driving' ? player.vehicle : null;
    this.cool -= dt;
    if (v && v.parts.turret) {
      const want = camYaw - v.heading;
      v.parts.turret.rotation.y = dampAngle(v.parts.turret.rotation.y, want, 2.2, dt);   // a heavy turret turns slowly
      v.parts.barrel.rotation.x = damp(v.parts.barrel.rotation.x, Math.max(-0.25, Math.min(0.12, (camPitch - 0.22) * 0.8)), 3, dt);
      if ((input.wasPressed('fire') || input.isHeld('fire')) && this.cool <= 0) {
        this.cool = 2.2;
        v.parts.barrel.updateWorldMatrix(true, false);
        const muzzle = new THREE.Vector3(0, 0, v.parts.muzzleZ).applyMatrix4(v.parts.barrel.matrixWorld);
        const dir = new THREE.Vector3(0, 0, 1).transformDirection(v.parts.barrel.matrixWorld);
        const s = new THREE.Mesh(this.shellGeo, this.shellMat); s.position.copy(muzzle); this.scene.add(s);
        this.shells.push({ obj: s, v: dir.multiplyScalar(140), t: 0, owner: v });
        // muzzle blast: flash, big smoke puffs, recoil rock, sound, shake
        weapons.flash.position.copy(muzzle); weapons.flash.intensity = 80; weapons._flashT = 0.15;
        weapons._spark(muzzle, 0xffc860, 1.2, 0.12);
        for (let i = 0; i < 6; i++) this._puff(muzzle.clone().addScaledVector(dir.clone().normalize(), i * 0.5), 0.5 + i * 0.15, 1.6);
        v.pitch -= 0.06; v.parts.barrel.position.z = 2.2 - 0.5; this.recoilT = 0.3;
        audio?.gunshot?.('heavy'); audio?.impact?.(10); onShake?.(0.45);
      }
      if (this.recoilT > 0) { this.recoilT -= dt; v.parts.barrel.position.z = damp(v.parts.barrel.position.z, 2.2, 6, dt); }
    }
    // ------------------------------------------------ shells in flight
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i]; sh.t += dt;
      _a.copy(sh.obj.position);
      sh.v.y -= 3 * dt;
      sh.obj.position.addScaledVector(sh.v, dt);
      _b.copy(sh.obj.position);
      let hit = sh.t > 5;
      if (!hit && _b.y < heightAt(_b.x, _b.z, _b.y + 1)) hit = true;
      if (!hit) {
        this.statics.query(Math.min(_a.x, _b.x) - 1, Math.min(_a.z, _b.z) - 1, Math.max(_a.x, _b.x) + 1, Math.max(_a.z, _b.z) + 1, _q);
        for (const c of _q) { if (c.off || c.tag === 'water') continue; if (segmentVsBox(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, c, 0) < 1) { hit = true; break; } }
      }
      if (!hit) for (const o of weapons.lastCtx?.vehicles || []) { if (o === sh.owner) continue; if (segmentVsBox(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, o.collider, 0.3) < 1) { hit = true; break; } }
      if (sh.t > 0.05 && Math.random() < 0.5) this._puff(_a.clone(), 0.25, 0.8);
      if (hit) {
        this.scene.remove(sh.obj); this.shells.splice(i, 1);
        if (weapons.lastCtx) weapons.explode(_a.clone(), 9, 95, weapons.lastCtx);
        for (let k = 0; k < 8; k++) this._puff(_a.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4)), 1.2, 3.5, 0x4a4540);
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]; p.t -= dt; const k = 1 - p.t / p.life;
      p.obj.scale.setScalar(p.s * (1 + k * 2.5)); p.obj.position.y += dt * 0.8; p.obj.material.opacity = 0.6 * (1 - k);
      if (p.t <= 0) { this.scene.remove(p.obj); this.puffs.splice(i, 1); }
    }
  }
  _puff(pos, s, life, color = 0xb8b2a6) {
    const m = new THREE.Mesh(this.sphere, this.smokeMat.clone()); m.material.color.setHex(color);
    m.position.copy(pos); m.scale.setScalar(s); this.scene.add(m);
    this.puffs.push({ obj: m, t: life, life, s });
    if (this.puffs.length > 120) { const o = this.puffs.shift(); this.scene.remove(o.obj); }
  }
}
