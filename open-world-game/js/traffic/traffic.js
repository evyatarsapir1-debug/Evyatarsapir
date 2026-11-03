// AI traffic: cars follow right-hand lanes on the road graph, obey traffic lights,
// keep distance from vehicles/people ahead, and turn smoothly through intersections.
import { Vehicle } from '../vehicles/vehicle.js';
import { VEHICLE_TYPES, TRAFFIC_POOL } from '../vehicles/vehicleTypes.js';
import { dirOf, laneStart, laneEnd, lightState, hasLights } from './roadGraph.js';
import { RNG } from '../core/rng.js';
import { clamp, dampAngle, wrapAngle } from '../core/mathx.js';
import { obbVs, updateBox } from '../physics/collision.js';

const STOP_BACK = 11;

function linePath(a, b) {
  const [ax, az] = laneStart(a, b, STOP_BACK), [bx, bz] = laneEnd(a, b, STOP_BACK);
  const len = Math.hypot(bx - ax, bz - az);
  return { kind: 'line', ax, az, dx: (bx - ax) / len, dz: (bz - az) / len, len, from: a, to: b, axis: a.x === b.x ? 'z' : 'x' };
}
function turnPath(a, b, c) {
  const p0 = laneEnd(a, b, STOP_BACK), p2 = laneStart(b, c, STOP_BACK);
  const d1 = dirOf(a, b), d2 = dirOf(b, c);
  let p1;
  const cross = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(cross) < 1e-3) {
    if (d1[0] * d2[0] + d1[1] * d2[1] > 0) p1 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
    else p1 = [b.x + d1[0] * 12, b.z + d1[1] * 12]; // U-turn at dead end
  } else {
    // intersection of p0 + t*d1 and p2 - u*d2
    const t = ((p2[0] - p0[0]) * d2[1] - (p2[1] - p0[1]) * d2[0]) / cross;
    p1 = [p0[0] + d1[0] * t, p0[1] + d1[1] * t];
  }
  let len = 0, px = p0[0], pz = p0[1];
  for (let i = 1; i <= 12; i++) {
    const q = qpt(p0, p1, p2, i / 12);
    len += Math.hypot(q[0] - px, q[1] - pz); px = q[0]; pz = q[1];
  }
  return { kind: 'quad', p0, p1, p2, len, node: b, straight: Math.abs(cross) < 1e-3 && d1[0] * d2[0] + d1[1] * d2[1] > 0 };
}
function qpt(p0, p1, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}
function pathPoint(p, s) {
  s = clamp(s, 0, p.len);
  if (p.kind === 'line') return [p.ax + p.dx * s, p.az + p.dz * s];
  return qpt(p.p0, p.p1, p.p2, s / p.len);
}

export class Traffic {
  constructor(scene, graph, statics) {
    this.scene = scene; this.graph = graph; this.statics = statics;
    this.cars = [];
    this.rng = new RNG(4242);
    this.target = 22;
    this.spawnTimer = 0;
  }

  setDensity(n) { this.target = n; }

  _chooseNext(a, b) {
    const opts = b.nbrs.filter((k) => k !== a.key);
    const key = opts.length ? this.rng.pick(opts) : a.key;
    return this.graph.get(key);
  }

  _spawn(px, pz, allVehicles) {
    for (let tries = 0; tries < 12; tries++) {
      const seg = this.graph.randomSegmentNear(px, pz, 90, 230, this.rng);
      if (!seg) continue;
      const [a, b] = seg;
      const path = linePath(a, b);
      const s = this.rng.float(5, path.len - 5);
      const [x, z] = pathPoint(path, s);
      const d = Math.hypot(x - px, z - pz);
      if (d < 90 || d > 230) continue;
      if (allVehicles.some((v) => Math.abs(v.x - x) < 14 && Math.abs(v.z - z) < 14)) continue;
      const key = this.rng.pick(TRAFFIC_POOL);
      const T = VEHICLE_TYPES[key];
      const v = new Vehicle(key, this.rng.pick(T.colors), x, z, Math.atan2(path.dx, path.dz));
      v.driver = 'ai';
      const fast = !a.urban && !b.urban;
      v.ai = { path, s, next: this._chooseNext(a, b), wait: 0, cruise: Math.min(T.maxSpeed * 0.8, this.rng.float(10, 14) * (fast ? 1.6 : 1)) * (key === 'bus' || key === 'truck' ? 0.75 : 1) };
      v.ai.baseCruise = v.ai.cruise / (fast ? 1.6 : 1);
      v.speed = v.ai.cruise * 0.6;
      this.scene.add(v.object);
      this.cars.push(v);
      return v;
    }
    return null;
  }

  remove(v) {
    this.scene.remove(v.object);
    v.object.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.cars.splice(this.cars.indexOf(v), 1);
  }

  // obstacles: array of {x, z, r} (people) ; vehicles: all vehicles in the world
  update(dt, time, px, pz, vehicles, obstacles) {
    // population control
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      const d = Math.hypot(v.x - px, v.z - pz);
      if (d > 280 || (v.ai.wait > 20 && d > 60)) this.remove(v);
    }
    this.spawnTimer -= dt;
    if (this.cars.length < this.target && this.spawnTimer <= 0) {
      this._spawn(px, pz, vehicles);
      this.spawnTimer = 0.25;
    }

    for (const v of this.cars) this._drive(v, dt, time, vehicles, obstacles);
  }

  _drive(v, dt, time, vehicles, obstacles) {
    const ai = v.ai, T = v.T;
    if (v.bumped > 0) {
      // knocked by the player: slide and slow down, then resume
      v.x += v.vx * dt; v.z += v.vz * dt;
      v.vx *= Math.exp(-3 * dt); v.vz *= Math.exp(-3 * dt);
      v.speed = 0; v.horn = true;
      v._collide(this.statics, null);
      v.sync(dt);
      return;
    }
    v.horn = false;
    let target = ai.cruise;
    const p = ai.path;
    if (p.kind === 'quad') target = p.straight ? ai.cruise * 0.85 : Math.min(target, 6.5);

    // traffic light at end of lane
    if (p.kind === 'line' && hasLights(p.to)) {
      const st = lightState(p.to, p.axis, time);
      const stopS = p.len - T.L / 2 - 0.3;
      const dist = stopS - ai.s;
      if (st !== 'g' && dist > -0.5) {
        const canClear = st === 'y' && dist < Math.max(4, v.speed * 0.9);
        if (!canClear) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 4.5 * Math.max(0, dist - 0.2))));
      }
    } else if (p.kind === 'line') {
      // slow before an unsignalised corner
      const dist = p.len - ai.s;
      if (dist < 20) target = Math.min(target, 6.5 + dist * 0.3);
    }

    // look ahead for vehicles / people
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = -fz, rz = fx;
    let minGap = Infinity;
    for (const o of vehicles) {
      if (o === v || !o.object.visible) continue;
      const dx = o.x - v.x, dz = o.z - v.z;
      if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > 35) continue;
      const lat = Math.abs(dx * rx + dz * rz);
      const width = (T.W + o.T.W) / 2 + 0.6 + (p.kind === 'quad' ? 1.2 : 0);
      if (lat > width) continue;
      if (o.isHeli && o.y > v.y + 3) continue;
      const gap = along - (T.L + o.T.L) / 2;
      if (gap < minGap) minGap = gap;
    }
    for (const ob of obstacles) {
      const dx = ob.x - v.x, dz = ob.z - v.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > 25) continue;
      const lat = Math.abs(dx * rx + dz * rz);
      if (lat > T.W / 2 + ob.r + 0.5) continue;
      const gap = along - T.L / 2 - ob.r;
      if (gap < minGap) minGap = gap;
    }
    if (minGap < Infinity) {
      const safe = Math.max(0, minGap - 2.5);
      target = Math.min(target, Math.sqrt(2 * 5 * safe));
      if (minGap < 2.5) target = 0;
    }

    // speed control
    const acc = target > v.speed ? 3.2 : 9;
    v.speed += clamp(target - v.speed, -acc * dt, acc * dt);
    if (v.speed < 0.05 && target < 0.1) { v.speed = 0; ai.wait += dt; } else ai.wait = Math.max(0, ai.wait - dt * 2);

    // advance along path
    ai.s += v.speed * dt;
    if (ai.s >= p.len) {
      const over = ai.s - p.len;
      if (p.kind === 'line') {
        ai.path = turnPath(p.from, p.to, ai.next);
        ai.turnFrom = p.from; ai.turnVia = p.to;
      } else {
        const a = ai.turnVia, b = ai.next;
        ai.path = linePath(a, b);
        ai.next = this._chooseNext(a, b);
        const fast = !a.urban && !b.urban;
        ai.cruise = Math.min(T.maxSpeed * 0.8, ai.baseCruise * (fast ? 1.6 : 1));
      }
      ai.s = over;
    }
    // steer towards look-ahead point (pure pursuit) so pushes are recovered smoothly
    const look = Math.max(3, v.speed * 0.5);
    let [tx, tz] = this._pointAhead(ai, ai.s + look);
    const desired = Math.atan2(tx - v.x, tz - v.z);
    if (v.speed > 0.1) v.heading = dampAngle(v.heading, desired, 6, dt);
    // move along heading, plus gentle correction to lane position
    const [cx, cz] = pathPoint(ai.path, ai.s);
    v.x += Math.sin(v.heading) * v.speed * dt + (cx - v.x) * Math.min(1, 2 * dt);
    v.z += Math.cos(v.heading) * v.speed * dt + (cz - v.z) * Math.min(1, 2 * dt);
    const steerAngle = wrapAngle(desired - v.heading);
    v.steer = clamp(-steerAngle * 2, -0.6, 0.6);
    v.vx = Math.sin(v.heading) * v.speed; v.vz = Math.cos(v.heading) * v.speed;
    v.y = 0; v.pitch = 0;
    // hard guarantee: never overlap another vehicle (e.g. the player's car stopped across the lane)
    updateBox(v.collider, v.x, v.z, v.heading);
    for (const o of vehicles) {
      if (o === v || Math.abs(o.x - v.x) > 9 || Math.abs(o.z - v.z) > 9 || (o.isHeli && o.y > 3)) continue;
      const r = obbVs(v.collider, o.collider);
      if (r.hit) { v.x += r.nx * r.depth; v.z += r.nz * r.depth; v.speed = Math.min(v.speed, 0.5); updateBox(v.collider, v.x, v.z, v.heading); }
    }
    v.wheelSpin += (v.speed / (v.parts.wheelR || 0.35)) * dt;
    v.sync(dt);
  }

  _pointAhead(ai, s) {
    if (s <= ai.path.len) return pathPoint(ai.path, s);
    const over = s - ai.path.len;
    if (ai.path.kind === 'line') {
      const tp = turnPath(ai.path.from, ai.path.to, ai.next);
      return pathPoint(tp, over);
    }
    return pathPoint(linePath(ai.turnVia, ai.next), over);
  }
}
