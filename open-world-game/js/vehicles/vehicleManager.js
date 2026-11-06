// Parked vehicles: every streamed cell has deterministic parking slots (curbs, lots, driveways, garage levels).
// Slots near the player are filled with drivable vehicles; vehicles the player has used are kept alive.
import { Vehicle } from './vehicle.js';
import { VEHICLE_TYPES, PARKED_POOL } from './vehicleTypes.js';
import { hash2, RNG } from '../core/rng.js';
import { cellData } from '../world/worldGen.js';

const SPAWN_R = 200, DESPAWN_R = 250;
const CURB_POOL = PARKED_POOL.filter((t) => t !== 'bicycle');

export class VehicleManager {
  constructor(scene, statics) {
    this.scene = scene; this.statics = statics;
    this.parked = [];
    this.kept = [];
    this.slots = new Map();     // slotKey -> slot (only for loaded cells)
    this.vacated = new Set();   // slots the player took a vehicle from (session memory)
    this.cellSlots = new Map(); // cellKey -> [slotKey]
  }

  all() { return [...this.parked, ...this.kept]; }

  // Called when the set of physics-loaded cells changes
  syncCells(cells) {
    const want = new Set(cells.map(([i, j]) => i + ',' + j));
    for (const [ck, keys] of this.cellSlots) {
      if (want.has(ck)) continue;
      for (const k of keys) { const s = this.slots.get(k); if (s?.vehicle) this._dispose(s.vehicle, this.parked); this.slots.delete(k); }
      this.cellSlots.delete(ck);
    }
    for (const [i, j] of cells) {
      const ck = i + ',' + j;
      if (this.cellSlots.has(ck)) continue;
      const cd = cellData(i, j), keys = [];
      for (const s of cd.parking) {
        const key = `${s.x.toFixed(1)},${s.z.toFixed(1)},${(s.y || 0).toFixed(1)}`;
        const r = new RNG(hash2(Math.round(s.x * 10), Math.round(s.z * 10), 3 + Math.round((s.y || 0) * 10)));
        const occ = s.fixed ? 1 : s.garage ? 0.45 : s.curb ? 0.75 : s.driveway ? 0.55 : 0.4;
        if (r.float() > occ) continue;
        const type = s.type || r.pick(s.curb || s.garage ? CURB_POOL : PARKED_POOL);
        const T = VEHICLE_TYPES[type];
        this.slots.set(key, { key, x: s.x, z: s.z, y: s.y ?? null, rot: s.rot, type, color: r.pick(T.colors), vehicle: null });
        keys.push(key);
      }
      this.cellSlots.set(ck, keys);
    }
  }

  markUsed(v) {
    if (v.slot) { this.vacated.add(v.slot.key); v.slot.vehicle = null; v.slot = null; }
    const i = this.parked.indexOf(v);
    if (i >= 0) this.parked.splice(i, 1);
    if (!this.kept.includes(v)) this.kept.push(v);
    if (this.kept.length > 6) {
      const old = this.kept.find((k) => k.driver !== 'player' && k !== v && !k.owned);
      if (old) this._dispose(old, this.kept);
    }
  }
  adopt(v) { if (!this.kept.includes(v)) this.kept.push(v); }

  _dispose(v, list) {
    this.scene.remove(v.object);
    v.object.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    const i = list.indexOf(v); if (i >= 0) list.splice(i, 1);
  }

  update(dt, px, pz, allVehicles, physicsReady, noSpawn = false) {
    let spawned = 0;
    for (const s of this.slots.values()) {
      if (this.vacated.has(s.key)) continue;
      const d2 = (s.x - px) ** 2 + (s.z - pz) ** 2;
      if (!s.vehicle && d2 < SPAWN_R * SPAWN_R) {
        if (noSpawn || spawned >= 1) continue;      // at most one new parked vehicle per frame (no stutter); none while flying
        spawned++;
        if (physicsReady && !physicsReady(s.x, s.z)) continue;
        const blocked = allVehicles.some((v) => Math.abs(v.x - s.x) < 3 && Math.abs(v.z - s.z) < 5 && Math.abs(v.y - (s.y ?? v.y)) < 2);
        if (blocked) continue;
        const v = new Vehicle(s.type, s.color, s.x, s.z, s.rot, s.y);
        v.slot = s; s.vehicle = v;
        this.scene.add(v.object);
        this.parked.push(v);
      } else if (s.vehicle && d2 > DESPAWN_R * DESPAWN_R) {
        const v = s.vehicle; s.vehicle = null;
        this._dispose(v, this.parked);
      }
    }
    for (const v of [...this.kept]) {
      if (v.driver !== 'player' && !v.owned && (v.x - px) ** 2 + (v.z - pz) ** 2 > 700 * 700) this._dispose(v, this.kept);
    }
    for (const v of this.all()) {
      if (v.driver === 'player') continue;
      const moving = Math.abs(v.vx) + Math.abs(v.vz) > 0.05 || (v.isHeli && v.rotorSpeed > 0.01);
      if (moving) {
        if (v.slot) this.markUsed(v);
        v.update(dt, { throttle: 0, steer: 0, handbrake: true, lift: 0 }, this.statics, allVehicles);
      }
    }
  }
}
