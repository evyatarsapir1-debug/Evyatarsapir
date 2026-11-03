// Parked vehicles: deterministic parking slots around the city are filled with drivable vehicles near the player.
// Vehicles the player has used are kept alive (up to a limit) so they don't vanish behind your back.
import { Vehicle } from './vehicle.js';
import { VEHICLE_TYPES, PARKED_POOL } from './vehicleTypes.js';
import { hash2, RNG } from '../core/rng.js';

const SPAWN_R = 210, DESPAWN_R = 260;

export class VehicleManager {
  constructor(scene, city, statics) {
    this.scene = scene; this.statics = statics;
    this.parked = [];    // vehicles spawned from slots
    this.kept = [];      // vehicles the player has driven
    this.slots = [];
    const add = (s, occ, pool) => {
      const h = hash2(Math.round(s.x * 10), Math.round(s.z * 10), 3);
      const r = new RNG(h);
      if (!s.fixed && r.float() > occ) return;
      const type = s.type || r.pick(pool);
      const T = VEHICLE_TYPES[type];
      this.slots.push({ x: s.x, z: s.z, rot: s.rot, type, color: r.pick(T.colors), vehicle: null, vacated: false });
    };
    for (const blk of city.blocks) for (const s of blk.parking) add(s, s.driveway ? 0.55 : 0.4, PARKED_POOL);
    for (const s of city.extra.parking) add(s, 0.5, PARKED_POOL);
    const curbPool = PARKED_POOL.filter((t) => t !== 'bicycle');
    for (const s of city.curb) add(s, 0.75, curbPool);
    // featured vehicles
    const featured = [
      { x: -200, z: 560, rot: 0, type: 'heli' },
      { x: -230, z: 600, rot: Math.PI / 2, type: 'heli' },
      { x: 560, z: 994.4, rot: -Math.PI / 2, type: 'bus' },
      { x: 150, z: 994.4, rot: -Math.PI / 2, type: 'truck' },
      { x: 1012, z: 300, rot: 0, type: 'bicycle' }, { x: 1012, z: 302, rot: 0, type: 'bicycle' },
      { x: 1012, z: 640, rot: 0, type: 'moto' },
      { x: 505.6, z: 450, rot: Math.PI, type: 'sports' },
      { x: 505.6, z: 538, rot: Math.PI, type: 'sedan' },
      { x: 494.4, z: 560, rot: 0, type: 'luxury' },
    ];
    for (const f of featured) add({ ...f, fixed: true }, 1, PARKED_POOL);
  }

  all() { return [...this.parked, ...this.kept]; }

  markUsed(v) {
    if (v.slot) { v.slot.vacated = true; v.slot.vehicle = null; v.slot = null; }
    const i = this.parked.indexOf(v);
    if (i >= 0) this.parked.splice(i, 1);
    if (!this.kept.includes(v)) this.kept.push(v);
    // keep at most 6 used vehicles; drop the farthest unused one
    if (this.kept.length > 6) {
      const old = this.kept.find((k) => k.driver !== 'player' && k !== v);
      if (old) this._dispose(old, this.kept);
    }
  }

  // Adopt an externally created vehicle (e.g. taken from traffic) so it persists
  adopt(v) { if (!this.kept.includes(v)) this.kept.push(v); }

  _dispose(v, list) {
    this.scene.remove(v.object);
    v.object.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    const i = list.indexOf(v); if (i >= 0) list.splice(i, 1);
  }

  update(dt, px, pz, allVehicles) {
    // spawn / despawn (cheap scan)
    for (const s of this.slots) {
      if (s.vacated) continue;
      const d2 = (s.x - px) ** 2 + (s.z - pz) ** 2;
      if (!s.vehicle && d2 < SPAWN_R * SPAWN_R) {
        const blocked = allVehicles.some((v) => Math.abs(v.x - s.x) < 3 && Math.abs(v.z - s.z) < 5);
        if (blocked) continue;
        const v = new Vehicle(s.type, s.color, s.x, s.z, s.rot);
        v.slot = s; s.vehicle = v;
        this.scene.add(v.object);
        this.parked.push(v);
      } else if (s.vehicle && d2 > DESPAWN_R * DESPAWN_R) {
        const v = s.vehicle; s.vehicle = null;
        this._dispose(v, this.parked);
      }
    }
    for (const v of [...this.kept]) {
      if (v.driver !== 'player' && (v.x - px) ** 2 + (v.z - pz) ** 2 > 700 * 700) this._dispose(v, this.kept);
    }
    // settle vehicles that were pushed (or a helicopter with spinning-down rotor)
    for (const v of this.all()) {
      if (v.driver === 'player') continue;
      const moving = Math.abs(v.vx) + Math.abs(v.vz) > 0.05 || (v.isHeli && (v.rotorSpeed > 0.01 || v.y > 0.05));
      if (moving) {
        if (v.slot) { v.slot.vacated = true; v.slot.vehicle = null; v.slot = null; this.markUsed(v); }
        v.update(dt, { throttle: 0, steer: 0, handbrake: true, lift: 0 }, this.statics, allVehicles);
      }
    }
  }
}
