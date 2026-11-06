// Military systems: the tank turret follows your camera and its cannon fires (fictional) shells that explode on
// impact (smoke, fire flash, shake — no gore); fighter jets patrol in formation over the city.
import * as THREE from 'three';
import { segmentVsBox, makeBox } from '../physics/collision.js';
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
    // base gate barrier: a red-and-white arm that lifts when someone drives or walks up to it
    this.gate = new THREE.Group(); this.gate.position.set(-506.5, 1.0, -40); scene.add(this.gate);
    const arm = new THREE.Group(); this.gate.add(arm); this.gateArm = arm;
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 }), red = new THREE.MeshStandardMaterial({ color: 0xd0312d, roughness: 0.5 });
    const bm = new THREE.Mesh(new THREE.BoxGeometry(12, 0.13, 0.13), white); bm.position.x = 6; bm.castShadow = true; arm.add(bm);
    for (let k = 0; k < 6; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.14), red); r.position.x = 1 + k * 2; arm.add(r); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 1.5 })); lamp.position.set(11.8, 0.12, 0); arm.add(lamp);
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x333333 })); cw.position.x = -0.4; arm.add(cw);   // counterweight
    this.gateOpen = 0;
    this.gateCol = makeBox(-500.5, -40, 6, 0.15, 0, 0.6, 1.2, 'gate');
    this.gateAdded = false;
    // patrol: two pairs of fighters on long loops over the city and the bay
    this.patrol = [];
    const routes = [{ cx: 500, cz: 450, rx: 1100, rz: 650, y: 230, w: 0.045, ph: 0 }, { cx: 700, cz: 400, rx: 1300, rz: 800, y: 320, w: -0.035, ph: 2.5 }];
    for (const r of routes) for (let k = 0; k < 2; k++) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(fighterGeometry(0x7d8790, false), FIGHTER_MAT); m.castShadow = true; g.add(m);
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
      P.g.rotation.z = Math.sign(r.w) * 0.5;   // banked in the turn
    }
    // ------------------------------------------------ gate barrier
    {
      const pp = player.state === 'driving' && player.vehicle ? player.vehicle : player;
      let near = Math.hypot(pp.x + 500, pp.z + 40) < 18;
      for (const o of ctx.vehicles || []) if (!near && o.driver && Math.hypot(o.vx, o.vz) > 0.5 && Math.abs(o.x + 500) < 9 && Math.abs(o.z + 40) < 16) near = true;   // parked cars don't hold it open
      const want = near ? 1 : 0;
      this.gateOpen += Math.sign(want - this.gateOpen) * Math.min(Math.abs(want - this.gateOpen), dt * 0.7);
      const e = this.gateOpen * this.gateOpen * (3 - 2 * this.gateOpen);
      this.gateArm.rotation.z = e * 1.45;
      this.gateCol.off = this.gateOpen > 0.55;
      const close = Math.abs(pp.x + 500) < 300 && Math.abs(pp.z + 40) < 300;
      if (close && !this.gateAdded) { this.statics.addGroup('basegate', [this.gateCol]); this.gateAdded = true; }
      else if (!close && this.gateAdded) { this.statics.removeGroup('basegate'); this.gateAdded = false; }
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
        audio?.gunshot?.('heavy'); audio?.impact?.(10); onShake?.(0.45); ctx.onCrime?.('cannon', v.x, v.z);
      }
      if (this.recoilT > 0) { this.recoilT -= dt; v.parts.barrel.position.z = damp(v.parts.barrel.position.z, 2.2, 6, dt); }
    }
    // ------------------------------------------------ fighter: missiles (fictional), homing on the nearest vehicle ahead
    if (v && v.T.fighter && (input.wasPressed('fire') || input.isHeld('fire')) && this.cool <= 0) {
      this.cool = 0.7; this.side = -(this.side || 1);
      v.object.updateMatrixWorld();
      const start = new THREE.Vector3(this.side * 3.0, 1.0, -0.6).applyMatrix4(v.parts.body.matrixWorld);
      const fwd = new THREE.Vector3(0, 0, 1).transformDirection(v.parts.body.matrixWorld);
      let target = null, best = 0.9;
      for (const o of ctx.vehicles || []) {
        if (o === v || o.wrecked) continue;
        const d = _a.set(o.x - start.x, o.y + 1 - start.y, o.z - start.z), L = d.length();
        if (L > 1500 || L < 15) continue;
        const c = d.dot(fwd) / L; if (c > best) { best = c; target = o; }
      }
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.4, roughness: 0.4 }));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, 1.55), new THREE.MeshStandardMaterial({ color: 0x8a6a3a }));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 8).rotateX(-Math.PI / 2).translate(0, 0, -2.1), this.shellMat);
      g.add(body, nose, flame); g.position.copy(start); g.lookAt(start.clone().add(fwd));
      this.scene.add(g);
      this.missiles ||= [];
      this.missiles.push({ obj: g, v: fwd.clone().multiplyScalar(Math.max(60, v.speed) + 10), t: 0, owner: v, target });
      ctx.onCrime?.('missile', v.x, v.z);
      audio?.gunshot?.('heavy');
    }
    for (let i = (this.missiles || []).length - 1; i >= 0; i--) {
      const ms = this.missiles[i]; ms.t += dt;
      const sp = Math.min(260, ms.v.length() + 120 * dt);
      if (ms.target && !ms.target.removed && ms.t > 0.25) {
        const want = _b.set(ms.target.x - ms.obj.position.x, ms.target.y + 0.8 - ms.obj.position.y, ms.target.z - ms.obj.position.z).normalize();
        ms.v.normalize().lerp(want, Math.min(1, 3.5 * dt)).normalize();
      } else ms.v.normalize();
      ms.v.multiplyScalar(sp);
      _a.copy(ms.obj.position); ms.obj.position.addScaledVector(ms.v, dt); _b.copy(ms.obj.position);
      ms.obj.lookAt(_b.clone().add(ms.v));
      if (Math.random() < 0.8) this._puff(_a.clone(), 0.35, 1.4, 0xd8d4cc);
      let hit = ms.t > 8 || _b.y < heightAt(_b.x, _b.z, _b.y + 1);
      if (!hit && ms.target && ms.obj.position.distanceTo(_a.set(ms.target.x, ms.target.y + 0.8, ms.target.z)) < 4) hit = true;
      if (!hit) {
        _a.copy(_b).addScaledVector(ms.v, -dt);
        this.statics.query(Math.min(_a.x, _b.x) - 1, Math.min(_a.z, _b.z) - 1, Math.max(_a.x, _b.x) + 1, Math.max(_a.z, _b.z) + 1, _q);
        for (const c of _q) { if (c.off || c.tag === 'water') continue; if (segmentVsBox(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, c, 0) < 1) { hit = true; break; } }
        if (!hit) for (const o of ctx.vehicles || []) { if (o === ms.owner) continue; if (segmentVsBox(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, o.collider, 0.5) < 1) { hit = true; break; } }
      }
      if (hit) {
        this.scene.remove(ms.obj); this.missiles.splice(i, 1);
        if (weapons.lastCtx) weapons.explode(ms.obj.position.clone(), 11, 130, weapons.lastCtx);
        for (let k = 0; k < 10; k++) this._puff(ms.obj.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5)), 1.4, 4, 0x4a4540);
      }
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
