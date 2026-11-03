// Fictional game weapons (sci-fi props, no real-world specifications) and their game mechanics:
// aiming from the camera, energy tracers, hits on vehicles, explosions that push and wreck cars,
// thrown grenades and placed charges. People are never injured: they duck, fall over and run away.
import * as THREE from 'three';
import { segmentVsBox, verticalOverlap } from '../physics/collision.js';
import { heightAt } from '../world/terrain.js';

export const WEAPONS = {
  p7: { name: 'אקדח פלזמה P-7', kind: 'pistol', price: 1200, ammoPack: 30, ammoPrice: 80, rate: 3, damage: 9, range: 90, color: 0x55c8ff, hold: 'hand' },
  x4: { name: 'רובה סערה X-4', kind: 'rifle', price: 4800, ammoPack: 90, ammoPrice: 160, rate: 9, damage: 6, range: 120, auto: true, color: 0x7dff6a, hold: 'rifle' },
  nz: { name: 'רובה ארוך "נץ"', kind: 'long', price: 7500, ammoPack: 12, ammoPrice: 140, rate: 0.9, damage: 34, range: 260, color: 0xff6ad5, hold: 'rifle' },
  hp: { name: 'תותח פולסים כבד', kind: 'heavy', price: 14000, ammoPack: 6, ammoPrice: 600, rate: 0.7, damage: 60, range: 160, explosive: 6, color: 0xffa14a, hold: 'heavy' },
  gr: { name: 'רימון הלם', kind: 'grenade', price: 300, ammoPack: 4, ammoPrice: 300, rate: 1.2, explosive: 7, damage: 70, thrown: true, color: 0xffe14a, hold: 'hand' },
  fc: { name: 'מטען זיקוקים', kind: 'charge', price: 450, ammoPack: 3, ammoPrice: 450, rate: 1, explosive: 8, damage: 80, placed: true, color: 0xff4a4a, hold: 'hand' },
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
  }

  // small hand-held model attached to the player's right hand
  attachGun(player, id) {
    const hand = player.model.arms[1].elbow;
    if (this.gun) { this.gun.parent?.remove(this.gun); this.gun = null; }
    if (!id) return;
    const W = WEAPONS[id];
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.6, roughness: 0.35 });
    const glow = new THREE.MeshStandardMaterial({ color: W.color, emissive: W.color, emissiveIntensity: 1.2 });
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    if (W.kind === 'grenade') add(new THREE.SphereGeometry(0.07, 10, 8), glow, 0, -0.3, 0.04);
    else if (W.kind === 'charge') add(new THREE.BoxGeometry(0.16, 0.1, 0.12), glow, 0, -0.3, 0.04);
    else {
      const len = W.hold === 'hand' ? 0.28 : W.hold === 'heavy' ? 0.9 : 0.75;
      add(new THREE.BoxGeometry(0.07, 0.09, len), body, 0, -0.3, len / 2 - 0.05);
      add(new THREE.BoxGeometry(0.05, 0.13, 0.06), body, 0, -0.36, 0.02);
      add(new THREE.BoxGeometry(0.075, 0.03, len * 0.6), glow, 0, -0.25, len * 0.45);
      if (W.hold === 'heavy') add(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10).rotateX(Math.PI / 2), body, 0, -0.3, len * 0.7);
    }
    hand.add(g);
    this.gun = g;
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
      if (cx * cx + cz * cz < 0.16 && y > p.y && y < p.y + 1.8) { best = t; hit = { ped: p }; }
    }
    // ground
    for (let s = 2; s < best; s += 2) {
      const y = origin.y + dir.y * s;
      if (y < heightAt(origin.x + dir.x * s, origin.z + dir.z * s, y + 0.5)) { best = s; hit = null; break; }
    }
    return { dist: best, point: new THREE.Vector3(origin.x + dir.x * best, origin.y + dir.y * best, origin.z + dir.z * best), ...(hit || {}) };
  }

  _tracer(a, b, color) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const m = this.tracerMat.clone(); m.color.setHex(color);
    const line = new THREE.Line(g, m);
    this.scene.add(line);
    this.tracers.push({ obj: line, t: 0.09 });
    this._spark(b, color, 0.25, 0.15);
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
      if (d < radius * 1.4) ctx.scare?.(ped, p, true);
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
    // bare hands: a punch knocks people over (they get up and run off, unhurt) and dents cars a little
    if (!id && player.state === 'foot' && input.wasPressed('fire') && this.cool <= 0) {
      this.cool = 0.45; player.punchT = 0.3; player.punchSide = player.punchSide ? 0 : 1;
      const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
      let hit = false;
      for (const ped of ctx.peds) {
        const dx = ped.x - player.x, dz = ped.z - player.z, d = Math.hypot(dx, dz);
        if (d < 1.5 && Math.abs(ped.y - player.y) < 1 && (dx * fx + dz * fz) / (d || 1) > 0.4) { ctx.scare?.(ped, { x: player.x, z: player.z }, true); hit = true; }
      }
      for (const v of ctx.vehicles) {
        if (Math.abs(v.x - player.x) > 6 || Math.abs(v.z - player.z) > 6) continue;
        const px = player.x + fx * 1.0, pz = player.z + fz * 1.0;
        const r = segmentVsBox(player.x, player.y + 1.2, player.z, px, player.y + 1.2, pz, v.collider, 0.1);
        if (r < 1) { v.addDamage(4, -fx, -fz); hit = true; }
      }
      if (hit) ctx.onShake?.(0.15);
    }
    if (player.punchT > 0) player.punchT -= dt;
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
          player.firing = 0.35;
          // aim along the camera's forward direction, from the player's chest
          camera.getWorldDirection(_d);
          player.facing = Math.atan2(_d.x, _d.z);
          const origin = new THREE.Vector3(player.x + _d.x * 0.5, player.y + 1.45, player.z + _d.z * 0.5);
          if (W.thrown) {
            const s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: W.color, emissive: W.color, emissiveIntensity: 0.8 }));
            s.position.copy(origin); this.scene.add(s);
            this.projectiles.push({ obj: s, v: new THREE.Vector3(_d.x * 14, Math.max(4, _d.y * 14 + 5), _d.z * 14), fuse: 2.2, W });
          } else if (W.placed) {
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: W.color, emissive: W.color, emissiveIntensity: 0.6 }));
            s.position.set(player.x + Math.sin(player.facing) * 0.8, heightAt(player.x, player.z, player.y + 0.3) + 0.1, player.z + Math.cos(player.facing) * 0.8);
            this.scene.add(s); this.charges.push({ obj: s });
            ctx.message?.('המטען הונח — לחץ ירי שוב כדי להפעיל');
          } else {
            const camPos = camera.position.clone();
            const r = this._ray(camPos, _d, W.range + 8, ctx.vehicles, ctx.peds, null);
            const muzzle = origin.clone();
            this._tracer(muzzle, r.point, W.color);
            if (W.explosive) this.explode(r.point, W.explosive, W.damage, ctx);
            else if (r.vehicle) { r.vehicle.addDamage(W.damage, -_d.x, -_d.z); if (r.vehicle.damage >= 100) r.vehicle.wreck?.(); }
            if (r.ped) ctx.scare?.(r.ped, r.point, true);
            for (const ped of ctx.peds) if (Math.hypot(ped.x - player.x, ped.z - player.z) < 35) ctx.scare?.(ped, origin, false);
          }
        } else if (input.wasPressed('fire')) ctx.message?.('נגמרה התחמושת — אפשר לקנות עוד בחנות');
      }
    }
    if (player.firing > 0) player.firing -= dt;
    // projectiles (grenades)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.v.y -= 18 * dt;
      pr.obj.position.addScaledVector(pr.v, dt);
      const g = heightAt(pr.obj.position.x, pr.obj.position.z, pr.obj.position.y + 0.3);
      if (pr.obj.position.y < g + 0.09) { pr.obj.position.y = g + 0.09; pr.v.y = Math.abs(pr.v.y) * 0.35; pr.v.x *= 0.6; pr.v.z *= 0.6; }
      pr.fuse -= dt;
      if (pr.fuse <= 0) { this.scene.remove(pr.obj); this.explode(pr.obj.position.clone(), pr.W.explosive, pr.W.damage, ctx); this.projectiles.splice(i, 1); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.t -= dt; t.obj.material.opacity = Math.max(0, t.t / 0.09);
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
    if (this._flashT > 0) { this._flashT -= dt; this.flash.intensity = Math.max(0, this._flashT / 0.25) * 60; }
  }
}
