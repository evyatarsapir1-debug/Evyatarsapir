// Main character controller: walking/running/jumping with collision, sitting on benches,
// and a full enter/exit vehicle sequence (walk to door -> open -> sit -> close).
import * as THREE from 'three';
import { CharacterModel } from '../character/characterModel.js';
import { heightAt, WATER_Y } from '../world/terrain.js';
import { circleVs, verticalOverlap } from '../physics/collision.js';
import { clamp, damp, dampAngle } from '../core/mathx.js';
import { POOLS } from '../world/layout.js';

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
    const can = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: 0xff7a2a, side: THREE.DoubleSide, roughness: 0.8 }));
    can.position.y = 4.2; can.scale.set(1, 0.5, 1.3); can.visible = false;
    this.object.add(can);
    this.canopy = can;
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
      case 'riding':   // luna park ride: position is set by the ride, just sit and look around
        this.model.animate(dt, { speed: 0, grounded: true, mode: 'sit' });
        this.object.position.set(this.x, this.y, this.z); this.object.rotation.set(0, this.facing, 0);
        break;
      case 'entering': this._entering(dt, world); break;
      case 'driving': this._driving(dt, input, world); break;
      case 'exiting': this._exiting(dt, world); break;
      case 'ejected': this._ejected(dt, world); break;
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
    const target = mag * (this.swimming ? 1.6 : running ? RUN : WALK) * (this.attack ? 0.2 : this.combatT > 0 ? 0.75 : 1);
    const lam = this.grounded ? 10 : 2;
    this.vx = damp(this.vx, dx * target, lam, dt);
    this.vz = damp(this.vz, dz * target, lam, dt);
    if (mag > 0.1 && !this.attack) this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 12, dt);

    if (this.grounded && !this.swimming && input.wasPressed('jump')) { this.vy = JUMP_V; this.grounded = false; }
    const wasGrounded = this.grounded;
    if (wasGrounded) this.fallTop = this.y; else this.fallTop = Math.max(this.fallTop ?? this.y, this.y);
    this.vy -= GRAVITY * dt;
    // parachute: opens by itself when falling from high up (if you own one)
    if (!this.grounded && this.vy < -9 && !this.parachute && world.econ?.items.parachute > 0 && this.y - heightAt(this.x, this.z, this.y) > 7) {
      world.econ.items.parachute--; this.parachute = true; world.onMessage?.('המצנח נפתח!');
    }
    if (this.parachute) {
      this.vy = Math.max(this.vy, -3.2);
      const sp = 6 + my * 3;
      this.facing += -mx * 1.4 * dt;
      this.vx = Math.sin(this.facing) * sp; this.vz = Math.cos(this.facing) * sp;
    }
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this._collide(world);
    let g = heightAt(this.x, this.z, this.y);
    // deep water: swim at the surface
    const floatY = WATER_Y - 1.25;
    this.swimming = g < floatY - 0.05;
    if (this.swimming) g = floatY;
    // swimming pools (the villa): float with the shoulders at the water line
    const pool = POOLS.find((q) => Math.abs(this.x - q.x) < q.w / 2 - 0.2 && Math.abs(this.z - q.z) < q.d / 2 - 0.2);
    if (pool && this.y < g + 1.2 && g < 0.6) { this.swimming = true; g -= 1.15; this.inPool = true; }
    else if (this.inPool) { this.inPool = false; if (this.y < g) { this.y = g; this.vy = 0; } }
    if (this.y <= g) {
      if (!wasGrounded) {
        const drop = (this.fallTop ?? this.y) - g;
        if (drop > 4.5 && !this.parachute && !this.swimming) world.onHurt?.(Math.round((drop - 4) * 9), 'נפילה');
        this.parachute = false;
      }
      this.y = g; this.vy = 0; this.grounded = true;
    }
    else if (this.y - g > 0.05 && this.vy <= 0 && this.grounded && this.y - g < 0.6) { this.y = g; this.vy = 0; }
    else if (this.y > g + 0.05) this.grounded = false;

    // contextual interactions
    this.nearVehicle = this._findVehicle(world.vehicles);
    this.nearJack = this.nearVehicle ? null : this._findJackable(world.vehicles);
    this.nearSeat = this.nearVehicle || this.nearJack ? null : this._findSeat(world);
    if (this.nearVehicle) {
      const nv = this.nearVehicle;
      this.prompt = { key: 'vehicle', text: `היכנס: ${nv.T.name}`, label: nv.isPlane ? 'היכנס למטוס' : nv.T.tank ? 'היכנס לטנק' : nv.isBoat ? 'עלה לסירה' : undefined };
      if (input.wasPressed('vehicle') || input.wasPressed('interact')) this.enterVehicle(this.nearVehicle, world);
    } else if (this.nearJack) {
      this.prompt = { key: 'vehicle', text: `חטוף: ${this.nearJack.T.name}`, label: 'הוצא את הנהג' };
      if (input.wasPressed('vehicle') || input.wasPressed('interact')) this.jackVehicle(this.nearJack, world);
    } else if (this.nearSeat) {
      this.prompt = { key: 'interact', text: this.nearSeat.kind === 'sleep' ? 'לישון' : 'לשבת', seat: this.nearSeat.label };
      if (input.wasPressed('interact')) this.useSeat(this.nearSeat);
    }
    this.model.animate(dt, { speed: this.parachute ? 0 : Math.hypot(this.vx, this.vz), grounded: this.grounded || this.parachute, vy: this.vy, mode: this.swimming ? 'swim' : 'foot', aim: this.armed ? (this.firing > 0 || this.aimT > 0 ? 2 : 1) : 0, hold: this.hold, aimPitch: this.aimPitch || 0, recoil: this.recoil || 0, throw: this.throwT > 0 ? this.throwT : 0, chute: this.parachute, attack: this.attack, stance: this.combatT > 0 && !this.armed, eat: this.eatT > 0 && !this.attack ? this.eating : null, hit: this.hitT > 0 ? { k: this.hitT / 0.4, kind: this.hitKind, side: this.hitSide } : null, draw: this.drawK ?? 1, reload: this.reloadK || 0, holster: this.holsterK || 0 });
    if (this.hitT > 0) this.hitT -= dt;
    if (this.eatT > 0) this.eatT -= dt;
    if (this.canopy) this.canopy.visible = !!this.parachute;
    this._sync();
  }

  _collide(world) {
    for (let iter = 0; iter < 2; iter++) {
      world.statics.query(this.x - 2, this.z - 2, this.x + 2, this.z + 2, _q);
      for (const c of _q) {
        if (c.off || c.tag === 'slab') continue;
        if (!verticalOverlap(this.y + 0.25, this.y + HEIGHT, c)) continue;
        const r = circleVs(this.x, this.z, RADIUS, c);
        if (r.hit) this._push(r);
      }
      if (world.peds) for (const o of world.peds) {
        if (Math.abs((o.y ?? this.y) - this.y) > 1.5) continue;
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
      if (v.isAir && v.y > Math.max(heightAt(v.x, v.z, v.y + 0.3), v.roofY ?? -100) + 0.5) continue;
      if (Math.abs(v.y - this.y) > (v.isBoat ? 2.4 : 1.6)) continue;
      const dp = v.doorPoint();
      const d = v.isPlane ? Math.hypot(dp.x - this.x, dp.z - this.z) - 1.2 : Math.min(Math.hypot(dp.x - this.x, dp.z - this.z), Math.hypot(v.x - this.x, v.z - this.z) - Math.max(v.T.W, v.T.L) / 2 + 0.6);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  // a traffic car with a driver, slow enough to pull them out (GTA-style carjacking)
  _findJackable(vehicles) {
    let best = null, bd = 2.6;
    for (const v of vehicles) {
      if (v.driver !== 'ai' || !v.driverPed || v.driverPed.state !== 'driving' || v.isAir) continue;
      if (Math.abs(v.speed) > 7 || Math.abs(v.y - this.y) > 1.6) continue;
      if (Math.abs(v.x - this.x) > 12 || Math.abs(v.z - this.z) > 12) continue;
      const dp = v.doorPoint();
      const d = Math.min(Math.hypot(dp.x - this.x, dp.z - this.z), Math.hypot(v.x - this.x, v.z - this.z) - Math.max(v.T.W, v.T.L) / 2 + 0.6);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  jackVehicle(v, world) {
    world.onJack?.(v);           // leaves traffic, stops
    v.jacking = true;
    this.enterVehicle(v, world);
    this.seq.jack = v.driverPed;
  }

  // ---------------------------------------------------------------- furniture: sit / sleep
  // Seats come from benches outside and from furniture inside loaded interiors.
  // The seat you are facing wins when several are close.
  _findSeat(world) {
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    let best = null, bs = Infinity;
    const consider = (s) => {
      if (Math.abs(s.x - this.x) > 2.2 || Math.abs(s.z - this.z) > 2.2 || Math.abs(s.y - this.y) > 0.8) return;
      const dx = s.x - this.x, dz = s.z - this.z, d = Math.hypot(dx, dz);
      if (d > 1.9) return;
      if (world.pedPositions && world.pedPositions.some((p) => Math.abs(p.x - s.x) < 0.45 && Math.abs(p.z - s.z) < 0.45 && Math.abs(p.y - s.y) < 1)) return; // taken
      const facingK = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const score = d - facingK * 0.9;
      if (score < bs) { bs = score; best = s; }
    };
    for (const b of world.benches || []) {
      const r = b.rot || 0;
      for (const off of [-0.45, 0.45]) {
        const ox = Math.cos(r) * off, oz = -Math.sin(r) * off; // along the bench
        consider({ x: b.x + ox - Math.sin(r) * 0.06, z: b.z + oz - Math.cos(r) * 0.06, y: b.y ?? 0, seatH: 0.45, yaw: r + Math.PI, kind: 'sit', label: 'ספסל' });
      }
    }
    for (const s of world.seats || []) consider(s);
    return best;
  }

  useSeat(seat) {
    this.state = 'sitting';
    this.vx = this.vz = 0;
    const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw);
    const ap = { x: seat.x + fx * 0.75, z: seat.z + fz * 0.75 };
    this.seq = { seat, phase: 'walk', t: 0, ap, fromX: this.x, fromZ: this.z, fromY: this.y };
  }

  _sitting(dt, input) {
    const s = this.seq, seat = s.seat;
    s.t += dt;
    const lying = seat.kind === 'sleep';
    const finalY = seat.y + (lying ? seat.seatH + 0.13 : seat.seatH - 0.43);
    let mode = 'foot', speed = 0;
    if (s.phase === 'walk') {
      const dx = s.ap.x - this.x, dz = s.ap.z - this.z, d = Math.hypot(dx, dz);
      if (d > 0.08 && s.t < 1.6) {
        const st = Math.min(d, 2.4 * dt);
        this.x += (dx / d) * st; this.z += (dz / d) * st; speed = 2.4;
        this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 12, dt);
      } else { s.phase = 'turn'; s.t = 0; }
      this.y = heightAt(this.x, this.z, this.y + 0.3);
    } else if (s.phase === 'turn') {
      this.facing = dampAngle(this.facing, seat.yaw, 14, dt);
      if (s.t > 0.3) { s.phase = 'down'; s.t = 0; s.y0 = this.y; }
    } else if (s.phase === 'down' || s.phase === 'idle') {
      const k = Math.min(1, s.t / 0.6), e = k * k * (3 - 2 * k);
      this.facing = dampAngle(this.facing, seat.yaw, 14, dt);
      this.x = s.ap.x + (seat.x - s.ap.x) * e; this.z = s.ap.z + (seat.z - s.ap.z) * e;
      this.y = s.y0 + (finalY - s.y0) * e;
      mode = lying ? 'lie' : 'sit';
      if (k >= 1) s.phase = 'idle';
      if (s.phase === 'idle') {
        this.prompt = { key: 'interact', text: 'לקום' };
        if (input.wasPressed('interact') || input.wasPressed('jump')) { s.phase = 'up'; s.t = 0; s.fromX = this.x; s.fromZ = this.z; s.fromY = this.y; }
      }
    } else if (s.phase === 'up') {
      const k = Math.min(1, s.t / 0.5);
      this.x = s.fromX + (s.ap.x - s.fromX) * k; this.z = s.fromZ + (s.ap.z - s.fromZ) * k;
      const gy = heightAt(s.ap.x, s.ap.z, seat.y + 0.3);
      this.y = s.fromY + (gy - s.fromY) * k;
      mode = k < 0.4 ? (lying ? 'lie' : 'sit') : 'foot';
      if (k >= 1) { this.state = 'foot'; this.seq = null; this.grounded = true; this.vy = 0; }
    }
    this.model.animate(dt, { speed, grounded: true, mode });
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
        s.phase = v.isTwoWheel ? 'sit' : v.isPlane ? 'board' : 'open'; s.t = 0;
        s.fromX = this.x; s.fromZ = this.z; s.fromY = this.y;
      }
      this.y = heightAt(this.x, this.z, this.y + 0.3);
    } else if (s.phase === 'open') {
      v.doorTarget = 1;
      this.facing = dampAngle(this.facing, v.heading + Math.PI / 2 * 0 - Math.PI / 2, 10, dt);
      this.model.animate(dt, { speed: 0, grounded: true, mode: 'foot', doorReach: true });
      if (s.t > 0.35) {
        if (s.jack) { s.phase = 'yank'; s.t = 0; world.onYank?.(v, s.jack); }
        else { s.phase = 'sit'; s.t = 0; }
      }
    } else if (s.phase === 'yank') {
      // grab the driver and throw them out: reach in, then a hard pull back with a step
      const k = Math.min(1, s.t / 0.9);
      const pull = k < 0.35 ? 0 : Math.sin(Math.min(1, (k - 0.35) / 0.4) * Math.PI / 2);
      this.facing = dampAngle(this.facing, v.heading - Math.PI / 2 + pull * 0.9, 10, dt);
      this.model.animate(dt, { speed: 0, grounded: true, mode: 'foot', doorReach: k < 0.55, attack: k > 0.45 && k < 0.8 ? { type: 'jabL', t: (k - 0.45) * 1.2, m: { dur: 0.42 } } : null });
      if (s.t > 0.9) { s.phase = 'sit'; s.t = 0; s.fromX = this.x; s.fromZ = this.z; s.fromY = this.y; v.jacking = false; }
    } else if (s.phase === 'board') {
      // through the passenger door straight into the cockpit (no floating up the side of the jet)
      this.facing = v.heading;
      this._attach(v); s.phase = 'close'; s.t = 0;
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
    (v.parts.body || v.object).add(this.object);
    this.object.position.copy(v.parts.seat);
    if (v.isPlane || v.T.enclosed) this.object.visible = false;   // you are inside the cockpit / the tank
    this.object.rotation.set(0, 0, 0);
    this.model.body.scale.y = this.model.body.scale.y; // keep appearance scale
  }
  _detach() {
    if (!this.attached) return;
    this.attached = false;
    this.object.visible = true;
    this.scene.add(this.object);
  }

  _driving(dt, input, world) {
    const v = this.vehicle;
    const throttle = input.isHeld('gas') ? 1 : input.isHeld('brake') ? -1 : input.moveY;
    const turn = (input.isHeld('right') ? 1 : 0) - (input.isHeld('left') ? 1 : 0);   // big turn buttons (touch)
    const ctl = { throttle, steer: clamp(input.moveX + turn, -1, 1), handbrake: input.isHeld('handbrake'), lift: (input.isHeld('up') ? 1 : 0) - (input.isHeld('down') || input.isHeld('run') ? 1 : 0) };
    if (v.isHeli) ctl.handbrake = false;
    if (v.isPlane) {
      // joystick sideways = bank & turn, up / down = climb / descend.
      // Throttle is a lever: gas pushes it up, brake pulls it down (it stays where you leave it).
      // joystick up = climb, joystick down = descend (keyboard: Space / R up, Q down)
      const jy = Math.abs(input.joyY) > 0.12 ? input.joyY : 0;
      ctl.lift = clamp(jy + (input.isHeld('up') || input.isHeld('jump') ? 1 : 0) - (input.isHeld('down') ? 1 : 0), -1, 1);
      ctl.throttle = input.isHeld('gas') ? 1 : input.isHeld('brake') ? -1 : input.keyY || 0;
      // flight assistance: stability mode, assisted take-off / landing (buttons "יציב" and "המראה"/"נחיתה")
      const F = world.flight;
      if (F) {
        if (input.wasPressed('stab')) F.toggleStab();
        if (input.wasPressed('assist')) F.toggleAssist(v);
        F.control(v, ctl, dt, input);
      }
    }
    this.controls = ctl;
    const preSpeed = v.speed, preHeading = v.heading;
    v.update(dt, ctl, world.statics, world.vehicles);
    this.x = v.x; this.z = v.z; this.y = v.y;
    // motorbike / bicycle: a hard hit throws the rider over the handlebars
    if (v.isTwoWheel && v.lastImpact > 7 && Math.abs(preSpeed) > 7) { this.eject(v, preSpeed, preHeading, world); return; }
    this.model.animate(dt, { speed: Math.abs(v.speed), mode: v.parts.seatMode, steer: v.steer / (v.T.steerMax || 1), pedal: v.T.kind === 'bike' && Math.abs(v.speed) > 0.3 });
    const landed = !v.isAir || v.y < Math.max(heightAt(v.x, v.z, v.y + 0.3), v.roofY ?? -100) + 0.4;
    if (landed && Math.abs(v.speed) < 3) this.prompt = { key: 'vehicle', text: 'צא מהרכב' };
    if (input.wasPressed('vehicle')) {
      if (!landed) this.message = v.isPlane ? 'יש לנחות לפני היציאה מהמטוס' : 'יש לנחות לפני היציאה מהמסוק';
      else if (Math.abs(v.speed) > 3) this.message = 'האט כדי לצאת מהרכב';
      else this.exitVehicle(world);
    }
  }

  exitVehicle(world) {
    const v = this.vehicle;
    // find a free spot: driver side first, then the other side, then behind
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    const sideOff = v.isTwoWheel ? 0.9 : v.T.W / 2 + 0.7;
    const dz = v.parts.doorZ ?? v.parts.seat.z;
    const cands = [[sideOff, dz], [-sideOff, dz], [0, -v.T.L / 2 - 1], [0, v.T.L / 2 + 1]];
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
    if (y < WATER_Y - 1.2 && !(this.vehicle && (this.vehicle.inWater || this.vehicle.isBoat))) return false;
    for (const c of _q) if (!c.off && c.tag !== 'slab' && verticalOverlap(y + 0.25, y + HEIGHT, c) && circleVs(x, z, RADIUS, c).hit) return false;
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
      const k = v.isPlane ? 1 : Math.min(1, s.t / 0.5);   // planes: step out of the door onto the ground
      const gy = v.isPlane ? heightAt(s.spot.x, s.spot.z, v.y + 1) : Math.max(heightAt(s.spot.x, s.spot.z, s.fromY + 0.6), v.roofY ?? -100);
      this.x = s.fromX + (s.spot.x - s.fromX) * k;
      this.z = s.fromZ + (s.spot.z - s.fromZ) * k;
      this.y = s.fromY + (gy - s.fromY) * k;
      this.model.animate(dt, { speed: 0, grounded: true, mode: k < 0.5 ? v.parts.seatMode : 'foot' });
      if (k >= 1) { s.phase = 'close'; s.t = 0; v.doorTarget = 0; }
    } else if (s.phase === 'close') {
      this.model.animate(dt, { speed: 0, grounded: true, mode: 'foot' });
      if (s.t > 0.25) {
        v.driver = null; this.lastVehicle = v; this.vehicle = null; this.ignoreVehicle = null;
        this.state = 'foot'; this.seq = null; this.vx = this.vz = this.vy = 0; this.grounded = true;
      }
    }
    this._sync();
  }

  // Thrown off a motorbike: fly forward over the bars, tumble, hit the road, slide, lie a moment, get up.
  eject(v, speed, heading, world) {
    v.object.updateMatrixWorld();
    const w = v.seatWorld(_v3);
    this._detach();
    v.driver = null; v.fallen = true; v.vx *= 0.4; v.vz *= 0.4;
    this.lastVehicle = v; this.vehicle = null; this.ignoreVehicle = v;
    const s = Math.min(Math.abs(speed), 30) * 0.75, fx = Math.sin(heading) * Math.sign(speed), fz = Math.cos(heading) * Math.sign(speed);
    this.x = w.x; this.y = w.y + 0.4; this.z = w.z; this.facing = heading;
    this.vx = fx * s; this.vz = fz * s; this.vy = 3.5 + s * 0.18;
    this.state = 'ejected'; this.seq = { t: 0, tumble: 0, spin: 6 + s * 0.35, bounced: 0, landedAt: null };
    this.grounded = false;
    world.onHurt?.(Math.round(8 + s * 1.6), 'תאונת אופנוע');
    world.onMessage?.('עפת מהאופנוע!');
  }
  _ejected(dt, world) {
    const q = this.seq; q.t += dt;
    const g0 = heightAt(this.x, this.z, this.y + 0.5);
    const air = this.y > g0 + 0.05 || this.vy > 0;
    if (air) { this.vy -= GRAVITY * dt; q.tumble += q.spin * dt; }
    else {
      // sliding on the asphalt, then rolling to a stop
      this.vx *= Math.exp(-2.6 * dt); this.vz *= Math.exp(-2.6 * dt);
      const rest = Math.round(q.tumble / (Math.PI * 2)) * Math.PI * 2 - Math.PI / 2;   // ends lying on the back
      q.tumble += (rest - q.tumble) * Math.min(1, 5 * dt);
      if (q.landedAt === null) q.landedAt = q.t;
    }
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this._collide(world);
    const g = heightAt(this.x, this.z, this.y + 0.5);
    if (this.y <= g) {
      this.y = g;
      if (this.vy < -3 && q.bounced < 2) { this.vy = -this.vy * 0.3; q.bounced++; q.spin *= 0.5; this.vx *= 0.7; this.vz *= 0.7; }
      else this.vy = 0;
    }
    if (q.t > 0.4 && q.t - (q.landedAt ?? q.t) < 0.01 && !air) this.ignoreVehicle = null;
    this.model.animate(dt, { speed: 0, grounded: !air, mode: air ? 'swim' : 'foot', chute: false });
    // body rotates around the hips while tumbling
    const a = q.tumble, h = 0.95;
    this.object.position.set(this.x - h * Math.sin(a) * Math.sin(this.facing), this.y + 0.15 + 0.8 * Math.abs(Math.cos(a)) - h * Math.cos(a) + (1 - Math.abs(Math.cos(a))) * 0.0, this.z - h * Math.sin(a) * Math.cos(this.facing));
    this.object.rotation.set(a, this.facing, 0, 'YXZ');
    // lie still a moment, then stand up
    if (!air && q.landedAt !== null && q.t - q.landedAt > 1.6 && Math.hypot(this.vx, this.vz) < 0.8) {
      this.object.rotation.set(0, this.facing, 0, 'XYZ');
      this.state = 'foot'; this.seq = null; this.vx = this.vz = this.vy = 0; this.grounded = true; this.ignoreVehicle = null;
      this._sync();
    }
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
