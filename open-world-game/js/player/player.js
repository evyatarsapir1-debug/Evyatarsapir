// Main character controller: walking/running/jumping with collision, sitting on benches,
// and a full enter/exit vehicle sequence (walk to door -> open -> sit -> close).
import * as THREE from 'three';
import { CharacterModel } from '../character/characterModel.js';
import { heightAt, WATER_Y } from '../world/terrain.js';
import { circleVs, verticalOverlap } from '../physics/collision.js';
import { clamp, damp, dampAngle } from '../core/mathx.js';

const RADIUS = 0.35, HEIGHT = 1.8;
const WALK = 2.3, RUN = 6.2, GRAVITY = 17, JUMP_V = 5.4;
const _q = [];
const _v3 = new THREE.Vector3();

export class Player {
  constructor(scene, appearance) {
    this.model = new CharacterModel(appearance);
    this.object = this.model.root;
    scene.add(this.object);
    this.scene = scene;
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.facing = 0;
    this.grounded = true;
    this.state = 'foot';
    this.vehicle = null;
    this.seq = null;          // active enter/exit/sit sequence
    this.sprint = false;
    this.bench = null;
    this.prompt = null;       // { key, text }
    this.nearVehicle = null;
    this.nearBench = null;
    this.message = null;
  }

  setPosition(x, z, facing = 0, y = null) {
    this.x = x; this.z = z; this.y = heightAt(x, z, y ?? 1000); this.facing = facing;
    this.vx = this.vz = this.vy = 0;
    this._sync();
  }

  get speed() { return Math.hypot(this.vx, this.vz); }

  update(dt, input, camYaw, world) {
    this.prompt = null;
    switch (this.state) {
      case 'foot': this._foot(dt, input, camYaw, world); break;
      case 'sitting': this._sitting(dt, input); break;
      case 'entering': this._entering(dt, world); break;
      case 'driving': this._driving(dt, input, world); break;
      case 'exiting': this._exiting(dt, world); break;
    }
  }

  // ---------------------------------------------------------------- on foot
  _foot(dt, input, camYaw, world) {
    const mx = input.moveX, my = input.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));
    if (input.wasPressed('run') && input.isTouch) this.sprint = !this.sprint;
    if (mag < 0.1) this.sprint = input.isTouch ? this.sprint && mag > 0.05 : false;
    const running = input.isTouch ? this.sprint : input.isHeld('run');
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let dx = fx * my + rx * mx, dz = fz * my + rz * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 0) { dx /= dl; dz /= dl; }
    const target = mag * (this.swimming ? 1.6 : running ? RUN : WALK);
    const lam = this.grounded ? 10 : 2;
    this.vx = damp(this.vx, dx * target, lam, dt);
    this.vz = damp(this.vz, dz * target, lam, dt);
    if (mag > 0.1) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 12, dt);

    if (this.grounded && !this.swimming && input.wasPressed('jump')) { this.vy = JUMP_V; this.grounded = false; }
    this.vy -= GRAVITY * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this._collide(world);
    let g = heightAt(this.x, this.z, this.y);
    // deep water: swim at the surface
    const floatY = WATER_Y - 1.25;
    this.swimming = g < floatY - 0.05;
    if (this.swimming) g = floatY;
    if (this.y <= g) { this.y = g; this.vy = 0; this.grounded = true; }
    else if (this.y - g > 0.05 && this.vy <= 0 && this.grounded && this.y - g < 0.6) { this.y = g; this.vy = 0; }
    else if (this.y > g + 0.05) this.grounded = false;

    // contextual interactions
    this.nearVehicle = this._findVehicle(world.vehicles);
    this.nearBench = this.nearVehicle ? null : this._findBench(world.benches);
    if (this.nearVehicle) {
      this.prompt = { key: 'vehicle', text: `היכנס: ${this.nearVehicle.T.name}` };
      if (input.wasPressed('vehicle') || input.wasPressed('interact')) this.enterVehicle(this.nearVehicle, world);
    } else if (this.nearBench) {
      this.prompt = { key: 'interact', text: 'שב על הספסל' };
      if (input.wasPressed('interact')) this._sitOn(this.nearBench);
    }
    this.model.animate(dt, { speed: Math.hypot(this.vx, this.vz), grounded: this.grounded, vy: this.vy, mode: this.swimming ? 'swim' : 'foot' });
    this._sync();
  }

  _collide(world) {
    for (let iter = 0; iter < 2; iter++) {
      world.statics.query(this.x - 2, this.z - 2, this.x + 2, this.z + 2, _q);
      for (const c of _q) {
        if (c.tag === 'slab') continue;
        if (!verticalOverlap(this.y + 0.25, this.y + HEIGHT, c)) continue;
        const r = circleVs(this.x, this.z, RADIUS, c);
        if (r.hit) this._push(r);
      }
      if (world.peds) for (const o of world.peds) {
        const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz), m = RADIUS + 0.3;
        if (d < m && d > 1e-4) this._push({ nx: dx / d, nz: dz / d, depth: m - d });
      }
      for (const v of world.vehicles) {
        if (v === this.ignoreVehicle) continue;
        if (Math.abs(v.x - this.x) > 8 || Math.abs(v.z - this.z) > 8) continue;
        if (!verticalOverlap(this.y + 0.2, this.y + HEIGHT, v.collider)) continue;
        const r = circleVs(this.x, this.z, RADIUS, v.collider);
        if (r.hit) {
          this._push(r);
          // being hit by a moving car knocks you back a bit (no gore, just a stumble)
          const vs = Math.hypot(v.vx, v.vz);
          if (vs > 3) { this.vx += r.nx * vs * 0.6; this.vz += r.nz * vs * 0.6; this.vy = Math.max(this.vy, 2.5); this.grounded = false; }
        }
      }
    }
  }
  _push(r) {
    this.x += r.nx * r.depth; this.z += r.nz * r.depth;
    const vn = this.vx * r.nx + this.vz * r.nz;
    if (vn < 0) { this.vx -= r.nx * vn; this.vz -= r.nz * vn; }
  }

  _findVehicle(vehicles) {
    let best = null, bd = 2.8;
    for (const v of vehicles) {
      if (v.driver === 'ai' || v.driver === 'player') continue;
      if (v.isHeli && v.y > Math.max(heightAt(v.x, v.z, v.y + 0.3), v.roofY ?? -100) + 0.5) continue;
      if (Math.abs(v.y - this.y) > 1.6) continue;
      const dp = v.doorPoint();
      const d = Math.min(Math.hypot(dp.x - this.x, dp.z - this.z), Math.hypot(v.x - this.x, v.z - this.z) - Math.max(v.T.W, v.T.L) / 2 + 0.6);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  _findBench(benches) {
    let best = null, bd = 1.8;
    for (const b of benches) {
      if (Math.abs(b.x - this.x) > 3 || Math.abs(b.z - this.z) > 3 || Math.abs((b.y ?? this.y) - this.y) > 1) continue;
      const d = Math.hypot(b.x - this.x, b.z - this.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---------------------------------------------------------------- benches
  _sitOn(b) {
    this.state = 'sitting'; this.bench = b;
    const r = b.rot || 0;
    // the backrest is at local +z, so the sitter faces local -z
    const sx = b.x - Math.sin(r) * 0.08, sz = b.z - Math.cos(r) * 0.08;
    this.seq = { t: 0, fromX: this.x, fromZ: this.z, fromF: this.facing, toX: sx, toZ: sz, toF: r + Math.PI, benchY: b.y };
    this.vx = this.vz = 0;
  }
  _sitting(dt, input) {
    const s = this.seq;
    s.t = Math.min(1, s.t + dt * 2.5);
    this.x = s.fromX + (s.toX - s.fromX) * s.t;
    this.z = s.fromZ + (s.toZ - s.fromZ) * s.t;
    this.facing = dampAngle(this.facing, s.toF, 10, dt);
    this.y = (s.benchY ?? heightAt(this.x, this.z, this.y)) + 0.02;
    this.prompt = { key: 'interact', text: 'קום' };
    this.model.animate(dt, { speed: 0, grounded: true, mode: s.t > 0.4 ? 'sit' : 'foot' });
    if (s.t >= 1 && (input.wasPressed('interact') || input.wasPressed('jump') || Math.hypot(input.moveX, input.moveY) > 0.5)) {
      this.state = 'foot'; this.bench = null;
      const r = this.facing;
      this.x += Math.sin(r) * 0.5; this.z += Math.cos(r) * 0.5;
    }
    this._sync();
  }

  // ---------------------------------------------------------------- vehicles
  enterVehicle(v, world) {
    this.state = 'entering';
    this.vehicle = v;
    this.ignoreVehicle = v;
    v.driver = 'player';
    world.onVehicleUsed?.(v);
    const dp = v.doorPoint();
    this.seq = { phase: 'walk', t: 0, door: dp };
    this.vx = this.vz = 0;
  }

  _entering(dt, world) {
    const v = this.vehicle, s = this.seq;
    s.t += dt;
    if (s.phase === 'walk') {
      const dp = v.doorPoint();
      const dx = dp.x - this.x, dz = dp.z - this.z, d = Math.hypot(dx, dz);
      const sp = 3.2;
      if (d > 0.15 && s.t < 2.0) {
        this.x += (dx / d) * Math.min(d, sp * dt); this.z += (dz / d) * Math.min(d, sp * dt);
        this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 12, dt);
        this.model.animate(dt, { speed: sp, grounded: true, mode: 'foot' });
      } else {
        s.phase = v.isTwoWheel ? 'sit' : 'open'; s.t = 0;
        s.fromX = this.x; s.fromZ = this.z; s.fromY = this.y;
      }
      this.y = heightAt(this.x, this.z, this.y + 0.3);
    } else if (s.phase === 'open') {
      v.doorTarget = 1;
      this.facing = dampAngle(this.facing, v.heading + Math.PI / 2 * 0 - Math.PI / 2, 10, dt);
      this.model.animate(dt, { speed: 0, grounded: true, mode: 'foot', doorReach: true });
      if (s.t > 0.35) { s.phase = 'sit'; s.t = 0; }
    } else if (s.phase === 'sit') {
      const k = Math.min(1, s.t / 0.55);
      v.object.updateMatrixWorld();
      v.seatWorld(_v3);
      this.x = s.fromX + (_v3.x - s.fromX) * k;
      this.z = s.fromZ + (_v3.z - s.fromZ) * k;
      this.y = s.fromY + (_v3.y - s.fromY) * k;
      this.facing = dampAngle(this.facing, v.heading, 10, dt);
      this.model.animate(dt, { speed: 0, grounded: true, mode: k > 0.3 ? v.parts.seatMode : 'foot' });
      if (k >= 1) { s.phase = 'close'; s.t = 0; v.doorTarget = 0; this._attach(v); }
    } else if (s.phase === 'close') {
      this.model.animate(dt, { speed: 0, mode: v.parts.seatMode });
      if (s.t > 0.3) { this.state = 'driving'; this.seq = null; }
    }
    if (this.state !== 'driving' && !this.attached) this._sync();
  }

  _attach(v) {
    this.attached = true;
    v.object.add(this.object);
    this.object.position.copy(v.parts.seat);
    this.object.rotation.set(0, 0, 0);
    this.model.body.scale.y = this.model.body.scale.y; // keep appearance scale
  }
  _detach() {
    if (!this.attached) return;
    this.attached = false;
    this.scene.add(this.object);
  }

  _driving(dt, input, world) {
    const v = this.vehicle;
    const throttle = input.isHeld('gas') ? 1 : input.isHeld('brake') ? -1 : input.moveY;
    const ctl = { throttle, steer: input.moveX, handbrake: input.isHeld('handbrake'), lift: (input.isHeld('up') ? 1 : 0) - (input.isHeld('down') || input.isHeld('run') ? 1 : 0) };
    if (v.isHeli) ctl.handbrake = false;
    this.controls = ctl;
    v.update(dt, ctl, world.statics, world.vehicles);
    this.x = v.x; this.z = v.z; this.y = v.y;
    this.model.animate(dt, { speed: Math.abs(v.speed), mode: v.parts.seatMode, steer: v.steer / (v.T.steerMax || 1), pedal: v.T.kind === 'bike' && Math.abs(v.speed) > 0.3 });
    const landed = !v.isHeli || v.y < Math.max(heightAt(v.x, v.z, v.y + 0.3), v.roofY ?? -100) + 0.4;
    if (landed && Math.abs(v.speed) < 3) this.prompt = { key: 'vehicle', text: 'צא מהרכב' };
    if (input.wasPressed('vehicle')) {
      if (!landed) this.message = 'יש לנחות לפני היציאה מהמסוק';
      else if (Math.abs(v.speed) > 3) this.message = 'האט כדי לצאת מהרכב';
      else this.exitVehicle(world);
    }
  }

  exitVehicle(world) {
    const v = this.vehicle;
    // find a free spot: driver side first, then the other side, then behind
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    const sideOff = v.isTwoWheel ? 0.9 : v.T.W / 2 + 0.7;
    const cands = [[sideOff, v.parts.seat.z], [-sideOff, v.parts.seat.z], [0, -v.T.L / 2 - 1], [0, v.T.L / 2 + 1]];
    let spot = null;
    for (const [lx, lz] of cands) {
      const x = v.x + lx * c + lz * s, z = v.z - lx * s + lz * c;
      if (this._free(x, z, world, v)) { spot = { x, z, side: lx }; break; }
    }
    if (!spot) { this.message = 'אין מקום לצאת מכאן'; return; }
    v.update(0.0001, { throttle: 0, steer: 0, handbrake: true }, world.statics, world.vehicles);
    v.vx = v.vz = 0; v.speed = 0;
    this.state = 'exiting';
    this.seq = { t: 0, phase: v.isTwoWheel ? 'out' : 'open', spot };
  }
  _free(x, z, world, ignore) {
    world.statics.query(x - 1, z - 1, x + 1, z + 1, _q);
    const y = heightAt(x, z, this.vehicle ? this.vehicle.y + 0.6 : this.y);
    if (y < WATER_Y - 1.2 && !(this.vehicle && this.vehicle.inWater)) return false;
    for (const c of _q) if (c.tag !== 'slab' && verticalOverlap(y + 0.25, y + HEIGHT, c) && circleVs(x, z, RADIUS, c).hit) return false;
    for (const v of world.vehicles) if (v !== ignore && Math.abs(v.x - x) < 8 && Math.abs(v.z - z) < 8 && circleVs(x, z, RADIUS, v.collider).hit) return false;
    return true;
  }

  _exiting(dt, world) {
    const v = this.vehicle, s = this.seq;
    s.t += dt;
    if (s.phase === 'open') {
      v.doorTarget = 1;
      this.model.animate(dt, { speed: 0, mode: v.parts.seatMode, doorReach: true });
      if (s.t > 0.3) {
        s.phase = 'out'; s.t = 0;
        v.object.updateMatrixWorld();
        const w = v.seatWorld(_v3);
        this._detach();
        this.x = w.x; this.y = w.y; this.z = w.z; this.facing = v.heading;
        s.fromX = w.x; s.fromY = w.y; s.fromZ = w.z;
      }
    } else if (s.phase === 'out') {
      if (this.attached) {
        v.object.updateMatrixWorld();
        const w = v.seatWorld(_v3);
        this._detach();
        s.fromX = w.x; s.fromY = w.y; s.fromZ = w.z; this.facing = v.heading;
      }
      const k = Math.min(1, s.t / 0.5);
      const gy = Math.max(heightAt(s.spot.x, s.spot.z, s.fromY + 0.6), v.roofY ?? -100);
      this.x = s.fromX + (s.spot.x - s.fromX) * k;
      this.z = s.fromZ + (s.spot.z - s.fromZ) * k;
      this.y = s.fromY + (gy - s.fromY) * k;
      this.model.animate(dt, { speed: 0, grounded: true, mode: k < 0.5 ? v.parts.seatMode : 'foot' });
      if (k >= 1) { s.phase = 'close'; s.t = 0; v.doorTarget = 0; }
    } else if (s.phase === 'close') {
      this.model.animate(dt, { speed: 0, grounded: true, mode: 'foot' });
      if (s.t > 0.25) {
        v.driver = null; this.vehicle = null; this.ignoreVehicle = null;
        this.state = 'foot'; this.seq = null; this.vx = this.vz = this.vy = 0; this.grounded = true;
      }
    }
    this._sync();
  }

  // Instantly place the player inside a vehicle (used when loading a save)
  forceIntoVehicle(v) {
    this.vehicle = v; this.ignoreVehicle = v; v.driver = 'player';
    this.state = 'driving'; this._attach(v);
  }

  _sync() {
    if (this.attached) return;
    this.object.position.set(this.x, this.y, this.z);
    this.object.rotation.set(0, this.facing, 0);
  }
}
