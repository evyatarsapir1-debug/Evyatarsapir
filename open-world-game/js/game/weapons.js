// Game weapons (generic in-game items, no real-world specifications) and their mechanics: aiming from the camera
// (over-the-shoulder while you shoot), muzzle flashes and tracers, hits on people and vehicles, explosions that
// push and wreck cars, thrown grenades (with a real throwing animation) and placed charges.
import * as THREE from 'three';
import { segmentVsBox, verticalOverlap } from '../physics/collision.js';
import { heightAt } from '../world/terrain.js';

export const WEAPONS = {
  p7: { name: 'אקדח', kind: 'pistol', price: 1200, ammoPack: 30, ammoPrice: 80, rate: 3, damage: 9, pedDmg: 4, range: 90, color: 0x3a3f45, hold: 'pistol' },
  x4: { name: 'רובה סער', kind: 'rifle', price: 4800, ammoPack: 90, ammoPrice: 160, rate: 9, damage: 6, pedDmg: 3, range: 120, auto: true, color: 0x4a4f3a, hold: 'rifle' },
  nz: { name: 'רובה צלפים', kind: 'long', price: 7500, ammoPack: 12, ammoPrice: 140, rate: 0.9, damage: 34, pedDmg: 8, range: 260, color: 0x2f3b2a, hold: 'rifle' },
  hp: { name: 'מטול', kind: 'heavy', price: 14000, ammoPack: 6, ammoPrice: 600, rate: 0.7, damage: 60, range: 160, explosive: 6, color: 0x5a6148, hold: 'heavy' },
  gr: { name: 'רימון', kind: 'grenade', price: 300, ammoPack: 4, ammoPrice: 300, rate: 1.2, explosive: 7, damage: 70, thrown: true, color: 0x4f5a3c, hold: 'hand' },
  fc: { name: 'מטען נפץ', kind: 'charge', price: 450, ammoPack: 3, ammoPrice: 450, rate: 1, explosive: 8, damage: 80, placed: true, color: 0xb03a2e, hold: 'hand' },
};
export const WEAPON_ORDER = ['p7', 'x4', 'nz', 'hp', 'gr', 'fc'];

const _q = [];
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class WeaponSystem {
  constructor(scene, statics) {
    this.scene = scene; this.statics = statics;
    this.cool = 0;
    this.tracers = [];
    this.fx = [];
    this.projectiles = [];
    this.charges = [];
    this.flash = new THREE.PointLight(0xffaa55, 0, 30, 2);
    scene.add(this.flash);
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true });
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, depthWrite: false });
    this.smokeMat = new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, depthWrite: false });
    this.sphere = new THREE.SphereGeometry(1, 14, 10);
    this.gunMeshes = {};
    // realistic shot effects: glowing tracer streaks, ejected brass, impact sparks, bullet holes, muzzle smoke
    this.tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.addMat = new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.brassGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.024, 6);
    this.brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.3 });
    this.holeGeo = new THREE.CircleGeometry(0.035, 8);
    this.holeMat = new THREE.MeshBasicMaterial({ color: 0x15130f, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.sparkGeo = new THREE.BoxGeometry(0.012, 0.012, 0.06);
    this.casings = []; this.holes = []; this.sparks = [];
  }

  // brass shell flying out of the right side of the gun
  _eject(player) {
    if (!this.gunInner) return;
    const p = new THREE.Vector3(0, -0.25, 0.05).applyMatrix4(this.gunInner.matrixWorld);
    const fx = Math.sin(player.facing), fz = Math.cos(player.facing), rx = -fz, rz = fx;
    const m = new THREE.Mesh(this.brassGeo, this.brassMat); m.position.copy(p); this.scene.add(m);
    this.casings.push({ obj: m, v: new THREE.Vector3(rx * (1.6 + Math.random()) - fx * 0.4, 2 + Math.random(), rz * (1.6 + Math.random()) - fz * 0.4), spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, 0), t: 4 });
    if (this.casings.length > 40) { const c = this.casings.shift(); this.scene.remove(c.obj); }
  }
  // what the bullet hits: hole (walls, ground, cars), sparks, dust
  _impact(point, dir, hard) {
    const n = dir.clone().negate();
    const hole = new THREE.Mesh(this.holeGeo, this.holeMat.clone());
    hole.position.copy(point).addScaledVector(n, 0.02); hole.lookAt(point.clone().addScaledVector(n, 1));
    this.scene.add(hole); this.holes.push({ obj: hole, t: 25 });
    if (this.holes.length > 50) { const h = this.holes.shift(); this.scene.remove(h.obj); }
    const k = hard ? 7 : 4;
    for (let i = 0; i < k; i++) {
      const sp = new THREE.Mesh(this.sparkGeo, this.addMat.clone());
      sp.material.color.setHex(hard ? 0xffd27a : 0xd8cfb8);
      sp.position.copy(point).addScaledVector(n, 0.05);
      const v = n.clone().multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4));
      sp.lookAt(sp.position.clone().add(v)); this.scene.add(sp);
      this.sparks.push({ obj: sp, v, t: 0.25 + Math.random() * 0.2 });
    }
  }

  // realistic hand-held model in the player's right hand (barrel along +z from the hand at y = -0.3)
  attachGun(player, id) {
    const hand = player.model.arms[1].elbow;
    if (this.gun) { this.gun.parent?.remove(this.gun); this.gun = null; this.gunInner = null; }
    if (!id) return;
    const W = WEAPONS[id];
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.75, roughness: 0.35 });
    const poly = new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.1, roughness: 0.7 });
    const furn = new THREE.MeshStandardMaterial({ color: W.kind === 'long' ? 0x5b4630 : 0x2c2f33, metalness: 0.1, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1d3b52, metalness: 0.9, roughness: 0.1 });
    const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
    const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d), cy = (r, l, n = 10) => new THREE.CylinderGeometry(r, r, l, n).rotateX(Math.PI / 2);
    let muzzle = 0.3;
    if (W.kind === 'grenade') {
      add(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: 0x4f5a3c, roughness: 0.6 }), 0, -0.31, 0.03).scale.set(1, 1.25, 1);
      add(bx(0.02, 0.04, 0.02), steel, 0, -0.25, 0.03); add(new THREE.TorusGeometry(0.014, 0.003, 4, 10), steel, 0.02, -0.24, 0.03);
    } else if (W.kind === 'charge') {
      add(bx(0.16, 0.08, 0.11), new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.8 }), 0, -0.3, 0.04);
      add(bx(0.05, 0.03, 0.04), new THREE.MeshStandardMaterial({ color: 0x1d1d1f, emissive: 0xff2020, emissiveIntensity: 0.6 }), 0, -0.25, 0.04);
    } else if (W.kind === 'pistol') {
      add(bx(0.034, 0.042, 0.19), steel, 0, -0.262, 0.07);                 // slide
      add(bx(0.03, 0.03, 0.15), poly, 0, -0.293, 0.065);                   // frame
      add(bx(0.03, 0.11, 0.05), poly, 0, -0.34, -0.005, 0.22);             // grip
      add(bx(0.006, 0.03, 0.05), steel, 0, -0.318, 0.04);                  // trigger guard
      add(cy(0.008, 0.02), steel, 0, -0.262, 0.17);                        // muzzle
      add(bx(0.006, 0.01, 0.01), steel, 0, -0.237, 0.15); add(bx(0.016, 0.01, 0.01), steel, 0, -0.237, -0.015); // sights
      muzzle = 0.18;
    } else if (W.kind === 'heavy') {
      add(cy(0.055, 0.95, 14), new THREE.MeshStandardMaterial({ color: 0x5a6148, roughness: 0.6 }), 0, -0.26, 0.2);
      add(cy(0.07, 0.12, 14), poly, 0, -0.26, 0.66); add(cy(0.065, 0.1, 14), poly, 0, -0.26, -0.27);
      add(bx(0.03, 0.1, 0.04), poly, 0, -0.33, 0.0, 0.2); add(bx(0.03, 0.09, 0.04), poly, 0, -0.33, 0.25, 0.1);
      add(bx(0.03, 0.05, 0.08), steel, 0.05, -0.2, 0.12);
      muzzle = 0.72;
    } else {
      const long = W.kind === 'long';
      add(bx(0.045, 0.07, 0.3), steel, 0, -0.27, 0.08);                    // receiver
      add(bx(0.05, 0.055, long ? 0.26 : 0.2), furn, 0, -0.275, long ? 0.36 : 0.32); // handguard / fore-end
      add(cy(0.011, long ? 0.42 : 0.28), steel, 0, -0.262, long ? 0.66 : 0.55);     // barrel
      add(cy(0.016, 0.05), steel, 0, -0.262, long ? 0.88 : 0.7);           // muzzle device
      add(bx(0.03, 0.09, 0.045), poly, 0, -0.33, -0.01, 0.3);              // pistol grip
      add(bx(0.006, 0.03, 0.05), steel, 0, -0.31, 0.03);                   // trigger guard
      add(bx(0.04, 0.075, 0.27), furn, 0, -0.285, -0.2);                   // stock
      add(bx(0.044, 0.09, 0.03), poly, 0, -0.285, -0.335);                 // butt pad
      if (!long) { add(bx(0.03, 0.13, 0.055), poly, 0, -0.355, 0.14, 0.25); add(bx(0.012, 0.035, 0.012), steel, 0, -0.218, 0.42); add(bx(0.02, 0.025, 0.04), steel, 0, -0.226, 0.0); }
      else { add(bx(0.03, 0.06, 0.05), poly, 0, -0.32, 0.13); add(cy(0.022, 0.26), steel, 0, -0.205, 0.08); add(cy(0.027, 0.05), glass, 0, -0.205, 0.22); add(cy(0.025, 0.05), glass, 0, -0.205, -0.06); for (const z of [0.0, 0.16]) add(bx(0.02, 0.03, 0.02), steel, 0, -0.228, z); }
      muzzle = long ? 0.92 : 0.73;
    }
    // muzzle flash (hidden until a shot)
    if (!W.thrown && !W.placed) {
      const fm = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      const f = new THREE.Group(); f.position.set(0, -0.262, muzzle + 0.03);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 7).rotateX(Math.PI / 2).translate(0, 0, 0.1), fm); f.add(cone);
      const star = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), fm); f.add(star);
      const star2 = star.clone(); star2.rotation.y = Math.PI / 2; f.add(star2);
      f.visible = false; g.add(f); this.muzzleFlash = f;
    } else this.muzzleFlash = null;
    // the model is built with the barrel along +z; turn it so the barrel follows the forearm (forearm = -y of the elbow)
    const mount = new THREE.Group(); mount.position.set(0, -0.29, 0.015); mount.rotation.x = Math.PI / 2;
    g.position.set(0, 0.29, 0); mount.add(g);
    hand.add(mount);
    this.gun = mount; this.gunInner = g; this.gunMuzzle = muzzle;
  }

  // ray from the camera; returns { point, vehicle?, ped? }
  _ray(origin, dir, range, vehicles, peds, ignore) {
    let best = range, hit = null;
    const ex = origin.x + dir.x * range, ey = origin.y + dir.y * range, ez = origin.z + dir.z * range;
    this.statics.query(Math.min(origin.x, ex) - 1, Math.min(origin.z, ez) - 1, Math.max(origin.x, ex) + 1, Math.max(origin.z, ez) + 1, _q);
    for (const c of _q) {
      if (c.off || c.tag === 'water') continue;
      const t = segmentVsBox(origin.x, origin.y, origin.z, ex, ey, ez, c, 0) * range;
      if (t < best) { best = t; hit = null; }
    }
    for (const v of vehicles) {
      if (v === ignore) continue;
      const t = segmentVsBox(origin.x, origin.y, origin.z, ex, ey, ez, v.collider, 0) * range;
      if (t < best) { best = t; hit = { vehicle: v }; }
    }
    for (const p of peds) {
      // vertical cylinder test
      const ox = p.x - origin.x, oz = p.z - origin.z;
      const t = ox * dir.x + oz * dir.z;
      if (t < 0 || t > best) continue;
      const cx = origin.x + dir.x * t - p.x, cz = origin.z + dir.z * t - p.z;
      const y = origin.y + dir.y * t;
      if (cx * cx + cz * cz < 0.25 && y > p.y && y < p.y + 1.85) { best = t; hit = { ped: p }; }
    }
    // ground
    for (let s = 2; s < best; s += 2) {
      const y = origin.y + dir.y * s;
      if (y < heightAt(origin.x + dir.x * s, origin.z + dir.z * s, y + 0.5)) { best = s; hit = null; break; }
    }
    return { dist: best, point: new THREE.Vector3(origin.x + dir.x * best, origin.y + dir.y * best, origin.z + dir.z * best), ...(hit || {}) };
  }

  _tracer(a, b, color) {
    // a short glowing streak that races from the muzzle to the target
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(this.tracerGeo, this.addMat.clone()); m.material.color.setHex(color);
    m.position.copy(a); m.lookAt(b); m.scale.set(0.012, 0.012, Math.min(len, 6));
    this.scene.add(m);
    this.tracers.push({ obj: m, t: 0.08, a: a.clone(), b: b.clone(), len, streak: true });
    // muzzle smoke wisp
    const sm = new THREE.Mesh(this.sphere, this.smokeMat.clone()); sm.material.color.setHex(0xbdb8ae);
    sm.position.copy(a); sm.scale.setScalar(0.05); this.scene.add(sm);
    this.fx.push({ obj: sm, t: 0.7, life: 0.7, grow: 0.35, rise: 0.25, type: 'smoke' });
    // dust puff where the bullet hits
    const s = new THREE.Mesh(this.sphere, this.smokeMat.clone()); s.material.color.setHex(0x9a958c);
    s.position.copy(b); s.scale.setScalar(0.12); this.scene.add(s);
    this.fx.push({ obj: s, t: 0.6, life: 0.6, grow: 0.9, rise: 0.4, type: 'smoke' });
  }

  _spark(p, color, size, life) {
    const m = this.fireMat.clone(); m.color.setHex(color);
    const s = new THREE.Mesh(this.sphere, m);
    s.position.copy(p); s.scale.setScalar(size);
    this.scene.add(s);
    this.fx.push({ obj: s, t: life, life, grow: size * 2, type: 'spark' });
  }

  explode(p, radius, damage, ctx) {
    this._spark(p, 0xffb040, radius * 0.3, 0.5);
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(this.sphere, this.smokeMat.clone());
      s.position.set(p.x + (Math.random() - 0.5) * radius * 0.5, p.y + Math.random(), p.z + (Math.random() - 0.5) * radius * 0.5);
      s.scale.setScalar(radius * 0.18);
      this.scene.add(s);
      this.fx.push({ obj: s, t: 2.5, life: 2.5, grow: radius * 0.5, rise: 1.5 + Math.random(), type: 'smoke' });
    }
    this.flash.position.copy(p); this.flash.intensity = 60; this._flashT = 0.25;
    ctx.onShake?.(Math.min(1, radius / Math.max(4, p.distanceTo(ctx.camera.position) * 0.6)));
    for (const v of ctx.vehicles) {
      const dx = v.x - p.x, dz = v.z - p.z, d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const k = 1 - d / radius, L = d || 1;
      v.vx += (dx / L) * 14 * k * (2000 / Math.max(800, v.T.mass)); v.vz += (dz / L) * 14 * k * (2000 / Math.max(800, v.T.mass));
      v.bumped = 1.5;
      v.addDamage(damage * k * 1.6, -dx / L, -dz / L);
      if (v.damage >= 100) v.wreck?.();
    }
    for (const ped of ctx.peds) {
      const d = Math.hypot(ped.x - p.x, ped.z - p.z);
      if (d < radius * 0.7 && ctx.hitPed) ctx.hitPed(ped, 8);
      else if (d < radius * 1.4) ctx.scare?.(ped, p, true);
      else if (d < 40) ctx.scare?.(ped, p, false);
    }
    const pl = ctx.player;
    const dp = Math.hypot(pl.x - p.x, pl.z - p.z);
    if (dp < radius) { ctx.hurtPlayer?.(Math.round(45 * (1 - dp / radius))); if (pl.state === 'foot') { pl.vx += (pl.x - p.x) / (dp || 1) * 6; pl.vz += (pl.z - p.z) / (dp || 1) * 6; pl.vy = 4; pl.grounded = false; } }
  }

  // trigger held / pressed this frame
  update(dt, ctx) {
    const { player, econ, input, camera } = ctx;
    this.cool -= dt;
    const id = econ.equipped;
    const canUse = id && player.state === 'foot' && econ.weapons[id];
    if (canUse) {
      const W = WEAPONS[id], inv = econ.weapons[id];
      const want = W.auto ? input.isHeld('fire') : input.wasPressed('fire');
      if (want && this.cool <= 0) {
        if (W.placed && this.charges.length) { // second press detonates placed charges
          for (const c of this.charges) { this.scene.remove(c.obj); this.explode(c.obj.position.clone(), W.explosive, W.damage, ctx); }
          this.charges = []; this.cool = 0.5;
        } else if (inv.ammo > 0) {
          inv.ammo--;
          this.cool = 1 / W.rate;
          player.firing = 0.35; player.aimT = 2.5;
          camera.getWorldDirection(_d);
          // gentle aim assist (touch screens): snap to a person right next to the crosshair
          if (!W.thrown && !W.placed && !W.explosive && W.kind !== 'long') {   // no assist for the launcher or the scoped rifle
            let best = 0.12, tgt = null;
            for (const ped of ctx.peds) {
              if (ped.state === 'dead') continue;
              _v.set(ped.x - camera.position.x, ped.y + 1.25 - camera.position.y, ped.z - camera.position.z);
              const L = _v.length(); if (L > W.range) continue;
              const ang = Math.acos(Math.min(1, _v.dot(_d) / L));
              if (ang < best) { best = ang; tgt = _v.clone().normalize(); }
            }
            if (tgt) _d.copy(tgt);
          }
          player.facing = Math.atan2(_d.x, _d.z);
          const origin = new THREE.Vector3(player.x + _d.x * 0.5, player.y + 1.45, player.z + _d.z * 0.5);
          if (W.thrown) {
            // wind up and throw: the grenade leaves the hand at the end of the arm swing
            player.throwT = 0.55;
            this.pendingThrow = { t: 0.3, W, dir: _d.clone() };
            this.cool = Math.max(this.cool, 0.6);
          } else if (W.placed) {
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.8 }));
            s.position.set(player.x + Math.sin(player.facing) * 0.8, heightAt(player.x, player.z, player.y + 0.3) + 0.08, player.z + Math.cos(player.facing) * 0.8);
            this.scene.add(s); this.charges.push({ obj: s });
            ctx.message?.('המטען הונח — לחץ ירי שוב כדי להפעיל');
          } else {
            const camPos = camera.position.clone();
            const r = this._ray(camPos, _d, W.range + 8, ctx.vehicles, ctx.peds, null);
            // muzzle in world space
            const muzzle = new THREE.Vector3();
            if (this.gunInner) { this.gunInner.updateWorldMatrix(true, false); muzzle.set(0, -0.262, this.gunMuzzle || 0.3).applyMatrix4(this.gunInner.matrixWorld); } else muzzle.copy(origin);
            this._tracer(muzzle, r.point, 0xffd9a0);
            if (!W.explosive) { this._eject(player); if (!r.ped) this._impact(r.point, _d, !!r.vehicle); }
            player.recoil = W.kind === 'long' ? 1 : W.kind === 'pistol' ? 0.55 : 0.35;
            if (this.muzzleFlash) { this.muzzleFlash.visible = true; this.muzzleFlash.rotation.z = Math.random() * 3; this.muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.5); this._mfT = 0.05; }
            this.flash.position.copy(muzzle); this.flash.intensity = 18; this._flashT = 0.06;
            ctx.onShot?.(W);
            ctx.onShake?.(W.kind === 'long' ? 0.18 : W.kind === 'rifle' ? 0.06 : 0.1);
            ctx.onRecoil?.(W.kind === 'long' ? 0.05 : W.kind === 'pistol' ? 0.025 : 0.012);
            if (W.explosive) this.explode(r.point, W.explosive, W.damage, ctx);
            else if (r.vehicle) { r.vehicle.addDamage(W.damage, -_d.x, -_d.z); if (r.vehicle.damage >= 100) r.vehicle.wreck?.(); }
            if (r.ped) ctx.hitPed?.(r.ped, W.pedDmg || 4);
            for (const ped of ctx.peds) if (ped !== r.ped && Math.hypot(ped.x - player.x, ped.z - player.z) < 35) ctx.scare?.(ped, origin, false);
          }
        } else if (input.wasPressed('fire')) ctx.message?.('נגמרה התחמושת — אפשר לקנות עוד בחנות');
      }
    }
    if (player.firing > 0) player.firing -= dt;
    if (player.aimT > 0) player.aimT -= dt;
    if (player.recoil > 0) player.recoil = Math.max(0, player.recoil - dt * 6);
    if (player.throwT > 0) player.throwT -= dt;
    if (canUse && input.isHeld('fire')) player.aimT = Math.max(player.aimT || 0, 0.6);
    if (this._mfT > 0) { this._mfT -= dt; if (this._mfT <= 0 && this.muzzleFlash) this.muzzleFlash.visible = false; }
    // grenade released from the hand
    if (this.pendingThrow) {
      this.pendingThrow.t -= dt;
      if (this.pendingThrow.t <= 0) {
        const { W, dir } = this.pendingThrow; this.pendingThrow = null;
        const hand = new THREE.Vector3(); player.model.arms[1].hand.getWorldPosition(hand);
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4f5a3c, roughness: 0.6 }));
        s.scale.set(1, 1.25, 1); s.position.copy(hand); this.scene.add(s);
        this.projectiles.push({ obj: s, v: new THREE.Vector3(dir.x * 15, Math.max(4.5, dir.y * 14 + 5.5), dir.z * 15), fuse: 2.2, W, spin: 8 });
        if (this.gun) this.gun.visible = false; this._regrow = 0.5;
      }
    }
    if (this._regrow > 0) { this._regrow -= dt; if (this._regrow <= 0 && this.gun) this.gun.visible = true; }
    // projectiles (grenades)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.v.y -= 18 * dt;
      pr.obj.position.addScaledVector(pr.v, dt);
      if (pr.spin) { pr.obj.rotation.x += pr.spin * dt; pr.obj.rotation.z += pr.spin * 0.6 * dt; }
      const g = heightAt(pr.obj.position.x, pr.obj.position.z, pr.obj.position.y + 0.3);
      if (pr.obj.position.y < g + 0.09) { pr.obj.position.y = g + 0.09; pr.v.y = Math.abs(pr.v.y) * 0.35; pr.v.x *= 0.6; pr.v.z *= 0.6; }
      pr.fuse -= dt;
      if (pr.fuse <= 0) { this.scene.remove(pr.obj); this.explode(pr.obj.position.clone(), pr.W.explosive, pr.W.damage, ctx); this.projectiles.splice(i, 1); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.t -= dt;
      if (t.streak) {
        const k = 1 - Math.max(0, t.t) / 0.08;                     // 0 -> 1 as the bullet travels
        t.obj.position.lerpVectors(t.a, t.b, Math.min(1, k * 1.15)); t.obj.lookAt(t.b);
        t.obj.material.opacity = Math.max(0, t.t / 0.08);
        if (t.t <= 0) { this.scene.remove(t.obj); this.tracers.splice(i, 1); }
        continue;
      }
      t.obj.material.opacity = Math.max(0, t.t / 0.09);
      if (t.t <= 0) { this.scene.remove(t.obj); t.obj.geometry.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t -= dt;
      const k = 1 - f.t / f.life;
      f.obj.scale.setScalar(Math.max(0.01, f.obj.scale.x + f.grow * dt));
      f.obj.material.opacity = (f.type === 'smoke' ? 0.55 : 1) * (1 - k);
      if (f.rise) f.obj.position.y += f.rise * dt;
      if (f.t <= 0) { this.scene.remove(f.obj); this.fx.splice(i, 1); }
    }
    // brass casings, sparks, bullet holes
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i]; c.t -= dt;
      if (c.v) {
        c.v.y -= 15 * dt; c.obj.position.addScaledVector(c.v, dt);
        c.obj.rotation.x += c.spin.x * dt; c.obj.rotation.y += c.spin.y * dt;
        const gy = heightAt(c.obj.position.x, c.obj.position.z, c.obj.position.y + 0.2) + 0.006;
        if (c.obj.position.y < gy) { c.obj.position.y = gy; if (Math.abs(c.v.y) > 1.2) { c.v.y = -c.v.y * 0.35; c.v.x *= 0.5; c.v.z *= 0.5; } else { c.v = null; c.obj.rotation.set(0, Math.random() * 6, Math.PI / 2); } }
      }
      if (c.t <= 0) { this.scene.remove(c.obj); this.casings.splice(i, 1); }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i]; sp.t -= dt; sp.v.y -= 9 * dt; sp.obj.position.addScaledVector(sp.v, dt); sp.obj.material.opacity = Math.max(0, sp.t * 3);
      if (sp.t <= 0) { this.scene.remove(sp.obj); this.sparks.splice(i, 1); }
    }
    for (let i = this.holes.length - 1; i >= 0; i--) { const h = this.holes[i]; h.t -= dt; if (h.t < 3) h.obj.material.opacity = Math.max(0, h.t / 3) * 0.85; if (h.t <= 0) { this.scene.remove(h.obj); this.holes.splice(i, 1); } }
    if (this._flashT > 0) { this._flashT -= dt; this.flash.intensity = Math.max(0, this._flashT / 0.25) * 60; }
  }
}
