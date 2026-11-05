// Boats and jet skis cruising the bay with a driver at the wheel (north and south of the bridge).
import { Vehicle } from '../vehicles/vehicle.js';
import { WATER_Y } from './terrain.js';

const LOOPS = [
  { type: 'boat', cx: 1500, cz: 260, rx: 300, rz: 130, dir: 1, speed: 0.06, phase: 0 },
  { type: 'jetski', cx: 1450, cz: 250, rx: 220, rz: 90, dir: -1, speed: 0.11, phase: 2 },
  { type: 'boat', cx: 1520, cz: 760, rx: 320, rz: 140, dir: -1, speed: 0.05, phase: 1 },
  { type: 'jetski', cx: 1550, cz: 740, rx: 250, rz: 100, dir: 1, speed: 0.12, phase: 4 },
  { type: 'jetski', cx: 1480, cz: 780, rx: 180, rz: 70, dir: 1, speed: 0.13, phase: 5.5 },
];

export class BoatTraffic {
  constructor(scene, statics) { this.scene = scene; this.statics = statics; this.list = []; }

  update(dt, px, pz, others) {
    const near = px > 700 && px < 2300 && pz > -300 && pz < 1300;
    if (near && !this.list.length) {
      for (const L of LOOPS) {
        const a = L.phase, x = L.cx + Math.cos(a) * L.rx, z = L.cz + Math.sin(a) * L.rz;
        const v = new Vehicle(L.type, undefined, x, z, 0, WATER_Y - 0.3);
        v.driver = 'ai'; v.loop = { ...L, a };
        this.scene.add(v.object); this.list.push(v);
      }
    } else if (!near && this.list.length) {
      for (const v of this.list) { v.removed = true; this.scene.remove(v.object); }
      this.list = [];
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      if (v.driver !== 'ai') { this.list.splice(i, 1); continue; }   // taken by the player
      const L = v.loop;
      L.a += L.dir * L.speed * dt;
      // steer towards a point a little ahead on the ellipse
      const ta = L.a + L.dir * 0.25, tx = L.cx + Math.cos(ta) * L.rx, tz = L.cz + Math.sin(ta) * L.rz;
      const want = Math.atan2(tx - v.x, tz - v.z);
      let e = want - v.heading; e = Math.atan2(Math.sin(e), Math.cos(e));
      v.update(dt, { throttle: Math.abs(e) > 1 ? 0.3 : 0.75, steer: Math.max(-1, Math.min(1, -e * 2)) }, this.statics, others);
    }
  }
  release(v) { const i = this.list.indexOf(v); if (i >= 0) this.list.splice(i, 1); v.loop = null; }
}
