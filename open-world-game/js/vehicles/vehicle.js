// Drivable vehicle: arcade physics with grip/drift, curb climbing, collision response and light visual damage.
import * as THREE from 'three';
import { VEHICLE_TYPES } from './vehicleTypes.js';
import { buildVehicleModel } from './vehicleModels.js';
import { makeBox, updateBox, obbVs, verticalOverlap } from '../physics/collision.js';
import { heightAt, WATER_Y } from '../world/terrain.js';
import { clamp, damp } from '../core/mathx.js';

let nextId = 1;
const _q = [];
const tmpColor = new THREE.Color();
const DAMAGE_TINT = new THREE.Color(0x5a4a3a);

export class Vehicle {
  constructor(typeKey, color, x, z, heading, y = null) {
    this.id = nextId++;
    this.typeKey = typeKey;
    this.T = VEHICLE_TYPES[typeKey];
    this.color = color ?? this.T.colors[0];
    this.parts = buildVehicleModel(this.T, this.color);
    this.object = this.parts.root;
    this.object.userData.vehicle = this;
    this.x = x; this.z = z; this.y = y ?? heightAt(x, z); this.heading = heading;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.speed = 0;         // forward speed (m/s)
    this.steer = 0;
    this.wheelSpin = 0;
    this.doorAngle = 0; this.doorTarget = 0;
    this.damage = 0;
    this.driver = null;     // 'player' | 'ai' | null
    this.rotorSpeed = 0;
    this.pitch = 0; this.roll = 0;
    this.horn = false;
    this.lastImpact = 0;
    this.isHeli = this.T.kind === 'heli';
    this.isTwoWheel = this.T.kind === 'moto' || this.T.kind === 'bike';
    this.collider = makeBox(x, z, this.T.W / 2, this.T.L / 2, heading, this.y, this.y + this.T.H, 'vehicle');
    this.collider.owner = this;
    this.sync();
  }

  get forwardX() { return Math.sin(this.heading); }
  get forwardZ() { return Math.cos(this.heading); }

  // World position of the point next to the driver door where the player stands to get in
  doorPoint() {
    const side = this.isTwoWheel ? 0.9 : this.T.W / 2 + 0.75;
    const lz = this.isTwoWheel ? 0 : this.parts.seat.z;
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    // local +x maps to world (cos h, -sin h); local +z to (sin h, cos h)
    return { x: this.x + side * c + lz * s, z: this.z - side * s + lz * c };
  }
  seatWorld(out) {
    const p = this.parts.seat;
    return out.set(p.x, p.y, p.z).applyMatrix4(this.object.matrixWorld);
  }

  // controls: { throttle -1..1, steer -1..1 (positive = right), handbrake bool, lift -1..1 }
  update(dt, ctl, statics, others) {
    const T = this.T;
    if (this.isHeli) return this._updateHeli(dt, ctl, statics, others);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx; // right vector of the vehicle (facing +z, right is -x)
    let vf = this.vx * fx + this.vz * fz;
    let vs = this.vx * rx + this.vz * rz;
    const thr = this.inWater || this.wrecked ? 0 : ctl.throttle || 0;
    const steerIn = ctl.steer || 0;
    const sf = 1 / (1 + Math.abs(vf) * (this.isTwoWheel ? 0.03 : 0.05));
    this.steer = damp(this.steer, steerIn * T.steerMax * sf, 8, dt);
    const dmgK = 1 - Math.min(this.damage, 100) / 400;
    if (thr > 0) {
      if (vf < -0.5) vf += T.brake * thr * dt;
      else vf += T.accel * dmgK * thr * Math.max(0.05, 1 - Math.max(0, vf) / T.maxSpeed) * dt;
    } else if (thr < 0) {
      if (vf > 0.5) vf += T.brake * thr * dt;
      else if (vf > -T.maxSpeed * 0.3) vf += T.accel * 0.6 * thr * dt;
    } else {
      const coast = 1.2 * dt;
      vf = Math.abs(vf) < coast ? 0 : vf - Math.sign(vf) * coast;
    }
    vf -= vf * Math.abs(vf) * 0.0009 * dt * 10;
    let grip = T.grip;
    if (ctl.handbrake) {
      const hb = 9 * dt;
      vf = Math.abs(vf) < hb ? 0 : vf - Math.sign(vf) * hb;
      grip *= 0.25;
    }
    vs *= Math.exp(-grip * dt);
    // yaw from bicycle model (positive steer turns right -> heading decreases)
    const yaw = -(vf / T.wheelbase) * Math.tan(this.steer);
    this.heading += yaw * dt;
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vx = nfx * vf + (-nfz) * vs;
    this.vz = nfz * vf + nfx * vs;
    this.speed = vf;
    this.x += this.vx * dt; this.z += this.vz * dt;

    // ground following: average height under front & rear axle
    const hb = T.wheelbase / 2;
    const yr = this.y + 0.25;
    const gF = heightAt(this.x + nfx * hb, this.z + nfz * hb, yr), gR = heightAt(this.x - nfx * hb, this.z - nfz * hb, yr);
    let gy = Math.max(gF, gR, heightAt(this.x, this.z, yr));
    // deep water: the vehicle floats low and the engine floods
    this.inWater = gy < WATER_Y - 0.5;
    if (this.inWater) {
      gy = WATER_Y - 0.8;
      this.vx *= Math.exp(-2.5 * dt); this.vz *= Math.exp(-2.5 * dt);
    }
    if (gy < this.y - 0.05) { this.vy -= 18 * dt; this.y = Math.max(gy, this.y + this.vy * dt); }
    else { this.vy = 0; this.y = damp(this.y, gy, 18, dt); }
    this.pitch = damp(this.pitch, Math.atan2(gR - gF, T.wheelbase), 10, dt);
    this.roll = damp(this.roll, this.isTwoWheel ? clamp(-yaw * Math.abs(vf) * 0.06, -0.6, 0.6) : clamp(yaw * vf * 0.006, -0.06, 0.06), 6, dt);

    this._collide(statics, others);
    this.wheelSpin += (vf / (this.parts.wheelR || 0.35)) * dt;
    this.sync(dt);
  }

  _updateHeli(dt, ctl, statics, others) {
    const T = this.T;
    const engine = this.driver ? 1 : 0;
    this.rotorSpeed = damp(this.rotorSpeed, engine, 0.8, dt);
    const ground = Math.max(heightAt(this.x, this.z, this.y + 0.3), this.roofY || -100);
    const powered = this.rotorSpeed > 0.85;
    const lift = ctl.lift || 0;
    let targetVy = powered ? lift * 7 : -4;
    if (!powered && this.y <= ground + 0.05) targetVy = 0;
    this.vy = damp(this.vy, targetVy, 2.5, dt);
    this.y += this.vy * dt;
    const airborne = this.y > ground + 0.3;
    if (this.y < ground) { this.y = ground; this.vy = Math.max(0, this.vy); }
    if (this.y > 260) { this.y = 260; this.vy = Math.min(0, this.vy); }
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz, vs = this.vx * rx + this.vz * rz;
    if (airborne) {
      vf += (ctl.throttle || 0) * T.accel * dt;
      vf = clamp(vf, -T.maxSpeed * 0.4, T.maxSpeed);
      this.heading += -(ctl.steer || 0) * 1.3 * dt;
    } else { vf *= Math.exp(-6 * dt); }
    vf *= Math.exp(-0.35 * dt);
    vs *= Math.exp(-T.grip * dt);
    this.vx = fx * vf + rx * vs; this.vz = fz * vf + rz * vs;
    this.speed = vf;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.pitch = damp(this.pitch, -(ctl.throttle || 0) * 0.18 * (airborne ? 1 : 0), 3, dt);
    this.roll = damp(this.roll, (ctl.steer || 0) * 0.15 * (airborne ? 1 : 0), 3, dt);
    this._collide(statics, others);
    if (this.parts.rotor) this.parts.rotor.rotation.y += this.rotorSpeed * 28 * dt;
    if (this.parts.tailRotor) this.parts.tailRotor.rotation.x += this.rotorSpeed * 40 * dt;
    this.sync(dt);
  }

  _collide(statics, others) {
    const c = this.collider;
    for (let iter = 0; iter < 2; iter++) {
      updateBox(c, this.x, this.z, this.heading);
      c.y0 = this.y + 0.15; c.y1 = this.y + this.T.H;
      const R = Math.max(this.T.L, this.T.W) / 2 + 1;
      statics.query(this.x - R, this.z - R, this.x + R, this.z + R, _q);
      let any = false;
      this.roofY = -100;
      for (const s of _q) {
        if (s.off || s.tag === 'slab') continue;
        if (!verticalOverlap(c.y0, c.y1, s)) continue;
        const r = obbVs(c, s);
        if (!r.hit) continue;
        // helicopters can settle on top of buildings and rocks
        if (this.isHeli && this.y > s.y1 - 1.6 && s.y1 < 400) {
          this.roofY = Math.max(this.roofY, s.y1);
          if (this.y < s.y1) { this.y = s.y1; this.vy = Math.max(0, this.vy); }
          continue;
        }
        any = true;
        this._resolve(r.nx, r.nz, r.depth, 1);
      }
      if (others) for (const o of others) {
        if (o === this || !o.object.visible) continue;
        if (Math.abs(o.x - this.x) > 14 || Math.abs(o.z - this.z) > 14) continue;
        if (!verticalOverlap(c.y0, c.y1, o.collider)) continue;
        updateBox(o.collider, o.x, o.z, o.heading);
        const r = obbVs(c, o.collider);
        if (!r.hit) continue;
        any = true;
        const total = this.T.mass + o.T.mass;
        const share = o.T.mass / total;
        const nx = r.nx, nz = r.nz, depth = r.depth;
        this._resolve(nx, nz, depth * share, share * 2);
        // push the other vehicle and transfer some momentum
        o.x -= nx * depth * (1 - share); o.z -= nz * depth * (1 - share);
        const rel = (this.vx - o.vx) * nx + (this.vz - o.vz) * nz;
        if (rel < 0) {
          const j = -rel * (this.T.mass / total) * 0.8;
          o.vx -= nx * j; o.vz -= nz * j;
          o.bumped = 1.5;
          o.addDamage(Math.abs(rel) * 2, -nx, -nz);
        }
      }
      if (!any) break;
    }
  }

  _resolve(nx, nz, depth, k) {
    this.x += nx * depth; this.z += nz * depth;
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      const bounce = 1.25;
      this.vx -= nx * vn * bounce * Math.min(1, k);
      this.vz -= nz * vn * bounce * Math.min(1, k);
      const impact = -vn;
      if (impact > 2) this.addDamage(impact * 2.2, nx, nz);
      this.lastImpact = Math.max(this.lastImpact, impact);
    }
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.speed = this.vx * fx + this.vz * fz;
  }

  addDamage(amount, nx, nz) {
    if (amount < 3) return;
    this.damage = Math.min(100, this.damage + amount);
    const P = this.parts.panels;
    // normal points away from the obstacle: obstacle is in direction -n. Front hit if -n aligns with forward.
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const front = -(nx * fx + nz * fz);
    const dent = Math.min(0.12, this.damage / 600);
    if (front > 0.5 && P.front) { P.front.position.z = P.front.userData.z0 ??= P.front.position.z; P.front.position.z -= dent; P.front.rotation.y = (Math.random() - 0.5) * dent * 2; }
    if (front < -0.5 && P.rear) { P.rear.userData.z0 ??= P.rear.position.z; P.rear.position.z = P.rear.userData.z0 + dent; P.rear.rotation.y = (Math.random() - 0.5) * dent * 2; }
    tmpColor.copy(this.parts.baseColor).lerp(DAMAGE_TINT, this.damage / 300);
    this.parts.paint.color.copy(tmpColor);
    if (this.damage > 60) for (const l of this.parts.lights) l.visible = false;
  }

  repair() {
    this.damage = 0; this.wrecked = false;
    this.parts.paint.color.copy(this.parts.baseColor);
    for (const l of this.parts.lights) l.visible = true;
    const P = this.parts.panels;
    for (const k of ['front', 'rear']) if (P[k] && P[k].userData.z0 !== undefined) { P[k].position.z = P[k].userData.z0; P[k].rotation.y = 0; }
  }

  // distance level of detail: one merged mesh far away, full animated rig up close
  setFar(far) {
    if (this._far === far) return;
    this._far = far;
    this.parts.body.visible = !far;
    for (const w of this.parts.wheels) w.pivot.visible = !far;
    this.parts.lod.visible = far;
  }

  wreck() {
    if (this.wrecked) return;
    this.wrecked = true; this.damage = 100;
    this.parts.paint.color.setHex(0x2b2622);
    for (const l of this.parts.lights) l.visible = false;
  }
  upgradeEngine() {
    this.tune = Math.min(3, (this.tune || 0) + 1);
    this.T = { ...this.T, accel: this.T.accel * 1.15, maxSpeed: this.T.maxSpeed * 1.15 };
  }
  rebuildLod() {
    // recolor the merged distance model to the new paint
    const lod = this.parts.lod;
    if (!lod) return;
    const col = lod.geometry.attributes.color, c = this.parts.baseColor;
    const old = this._lodPaint || this.parts.lodPaint;
    if (!old) return;
    for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - old.r) < 0.01 && Math.abs(col.getY(i) - old.g) < 0.01 && Math.abs(col.getZ(i) - old.b) < 0.01) col.setXYZ(i, c.r, c.g, c.b);
    col.needsUpdate = true;
    this._lodPaint = c.clone();
  }

  setColor(hex) { this.color = hex; this.parts.baseColor.set(hex); this.parts.paint.color.set(hex); }

  sync(dt = 0) {
    const o = this.object;
    o.position.set(this.x, this.y, this.z);
    o.rotation.set(0, this.heading, 0);
    this.parts.body.rotation.set(this.pitch, 0, this.roll);
    for (const w of this.parts.wheels) {
      w.spin.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = -this.steer;
    }
    if (this.isTwoWheel) { for (const w of this.parts.wheels) w.pivot.rotation.z = this.roll; }
    if (this.parts.door) {
      this.doorAngle = damp(this.doorAngle, this.doorTarget, 9, dt || 0.016);
      this.parts.door.rotation.y = -this.doorAngle * 1.1 * (this.isHeli ? 1 : 1);
    }
    if (this.parts.sirenR) {
      const on = this.siren && Math.floor(performance.now() / 250) % 2 === 0;
      this.parts.sirenR.material.emissiveIntensity = this.siren ? (on ? 2 : 0.1) : 0.3;
      this.parts.sirenB.material.emissiveIntensity = this.siren ? (on ? 0.1 : 2) : 0.3;
    }
    if (this.lastImpact > 0) this.lastImpact = Math.max(0, this.lastImpact - (dt || 0) * 10);
    if (this.bumped > 0) this.bumped -= dt || 0;
    updateBox(this.collider, this.x, this.z, this.heading);
    this.collider.y0 = this.y; this.collider.y1 = this.y + this.T.H;
  }
}
