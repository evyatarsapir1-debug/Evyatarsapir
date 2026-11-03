// Airport life: passenger jets that push back from the gates, taxi, take off over the bay, and later return,
// land on the runway and roll back to their gate. Ground-service vehicles drive loops on the apron.
// The departures board in the terminal (and the phone's airport contact) read the live schedule.
import * as THREE from 'three';
import { GeoBuilder } from './geoBuilder.js';
import { buildAirliner, airlinerGeometry, JET_MAT, LIVERIES } from './airliner.js';
export { LIVERIES };
import { AIRPORT } from './worldGen.js';
import { makeBox, updateBox, obbVs } from '../physics/collision.js';
import { clamp, damp, dampAngle, wrapAngle } from '../core/mathx.js';
import { Vehicle } from '../vehicles/vehicle.js';

const DESTS = ['רומא', 'אתונה', 'פריז', 'ברצלונה', 'לונדון', 'אילת', 'ניו יורק', 'ברלין', 'לרנקה', 'אמסטרדם'];

export { buildAirliner };
// left front passenger door (L1) in plane-local coordinates, at ground level
export const JET_DOOR = { x: 2.9, z: 13.4 };

class Plane {
  constructor(scene, idx) {
    this.idx = idx;
    this.livery = LIVERIES[idx % LIVERIES.length];
    this.mesh = new THREE.Mesh(airlinerGeometry(this.livery, true), JET_MAT);
    this.mesh.castShadow = true;
    this.cleanGeo = airlinerGeometry(this.livery, false); this.gearGeo = this.mesh.geometry;
    scene.add(this.mesh);
    this.x = 0; this.y = 0; this.z = 0; this.heading = Math.PI; this.pitch = 0; this.speed = 0;
    this.route = null; this.i = 0; this.state = 'parked'; this.timer = 0;
    this.colliders = [makeBox(0, 0, 2.2, 19, 0, 0.6, 6, 'plane'), makeBox(0, 0, 17, 2.5, 0, 2.6, 4.1, 'plane')];
  }
  place(x, z, heading, y = 0) { this.x = x; this.z = z; this.y = y; this.heading = heading; this.speed = 0; this.sync(); }
  sync() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.set(-this.pitch, this.heading, 0, 'YXZ');
    const gearUp = this.y > 25;
    const g = gearUp ? this.cleanGeo : this.gearGeo;
    if (this.mesh.geometry !== g) this.mesh.geometry = g;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    updateBox(this.colliders[0], this.x, this.z, this.heading);
    updateBox(this.colliders[1], this.x - fx * 1.5, this.z - fz * 1.5, this.heading);
    this.colliders[0].y0 = this.y + 0.6; this.colliders[0].y1 = this.y + 6;
    this.colliders[1].y0 = this.y + 2.6; this.colliders[1].y1 = this.y + 4.1;
  }
}

export class AirportManager {
  constructor(scene, statics, vehicles) {
    this.scene = scene; this.statics = statics; this.vehicleMgr = vehicles;
    this.planes = [];
    this.runway = null; // plane currently using the runway
    this.clock = 0;
    for (let i = 0; i < AIRPORT.gates.length; i++) {
      const p = new Plane(scene, i);
      p.gate = i; p.dest = DESTS[(i * 3) % DESTS.length]; p.flight = `AZ${310 + i * 7}`;
      p.place(AIRPORT.gates[i], AIRPORT.gateZ, Math.PI);
      p.timer = 25 + i * 70;
      this.planes.push(p);
    }
    // a fourth plane already on approach so something is landing soon
    const a = new Plane(scene, 3); a.gate = null; a.state = 'away'; a.timer = 8; a.mesh.visible = false; a.flight = 'AZ402'; a.dest = 'לרנקה';
    this.planes.push(a);
    // boards
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    this.boardCanvas = c;
    this.boardTexture = new THREE.CanvasTexture(c);
    this.boardTexture.colorSpace = THREE.SRGBColorSpace;
    this._boardT = 0;
    this.service = [];
  }

  // a jet standing still on the ground whose front door the player is next to
  boardable(player) {
    if (player.state !== 'foot') return null;
    for (const p of this.planes) {
      if (!p.mesh.visible || p.y > 0.5 || p.speed > 0.5 || p.state === 'taken') continue;
      if (Math.abs(p.x - player.x) > 30 || Math.abs(p.z - player.z) > 30) continue;
      const c = Math.cos(p.heading), s = Math.sin(p.heading);
      const dx = p.x + JET_DOOR.x * c + JET_DOOR.z * s, dz = p.z - JET_DOOR.x * s + JET_DOOR.z * c;
      if (Math.hypot(dx - player.x, dz - player.z) < 4.5) return p;
    }
    return null;
  }
  // the player takes this jet: the airport plane is hidden and returns to the schedule later
  take(p) {
    p.state = 'taken'; p.mesh.visible = false; p.timer = 240;
    if (this.runway === p) this.runway = null;
    p.gate = null;
    return { x: p.x, z: p.z, heading: p.heading, livery: p.livery };
  }

  _departRoute(gx) {
    const { taxiZ: T, runwayZ: R, runwayW: W } = AIRPORT;
    return [
      { x: gx, z: 655, v: 2, rev: true },
      { x: gx - 22, z: T - 6, v: 6 }, { x: W + 60, z: T, v: 9 }, { x: W + 25, z: T + 25, v: 6 }, { x: W + 15, z: R - 15, v: 5 }, { x: W + 30, z: R, v: 4, hold: true },
      { x: W + 120, z: R, v: 30, runway: true }, { x: -470, z: R, v: 74, runway: true },
      { x: -150, z: R, y: 22, v: 78, air: true }, { x: 700, z: R, y: 200, v: 86, air: true }, { x: 2600, z: R, y: 450, v: 95, air: true, end: true },
    ];
  }
  _arriveRoute(gx) {
    const { taxiZ: T, runwayZ: R } = AIRPORT;
    return [
      { x: -2000, z: R, y: 125, v: 80, air: true, runway: true }, { x: -905, z: R, y: 0, v: 68, air: true, runway: true },
      { x: -420, z: R, v: 26, runway: true }, { x: -140, z: R, v: 12, runway: true }, { x: -80, z: R - 30, v: 8 }, { x: -80, z: T + 4, v: 8 },
      { x: gx + 40, z: T, v: 9 }, { x: gx, z: 670, v: 5 }, { x: gx, z: AIRPORT.gateZ, v: 2, end: true },
    ];
  }
  _freeGate() {
    for (let g = 0; g < AIRPORT.gates.length; g++) if (!this.planes.some((p) => p.gate === g)) return g;
    return null;
  }

  departures() {
    const fmt = (s) => { const h = (this.hour + s / 60) % 24; const H = Math.floor(h), Mm = Math.floor((h - H) * 60); return `${String(H).padStart(2, '0')}:${String(Mm).padStart(2, '0')}`; };
    return this.planes.filter((p) => p.state === 'parked' || p.state === 'depart').map((p) => ({
      flight: p.flight, dest: p.dest, gate: p.gate !== null ? p.gate + 1 : '-', time: fmt(p.state === 'parked' ? p.timer : 0),
      status: p.state === 'depart' ? (p.route[p.i]?.air ? 'המריאה' : 'בהמראה') : p.timer < 30 ? 'עלייה למטוס' : 'בזמן',
    })).sort((a, b) => a.time.localeCompare(b.time));
  }

  _drawBoard() {
    const c = this.boardCanvas, g = c.getContext('2d');
    g.fillStyle = '#0b1a33'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ffcf33'; g.font = 'bold 44px Arial'; g.textAlign = 'right'; g.direction = 'rtl';
    g.fillText('המראות · DEPARTURES', 990, 64);
    g.font = 'bold 30px Arial'; g.fillStyle = '#8fb3ff';
    const cols = [990, 760, 520, 330];
    ['יעד', 'טיסה', 'שעה', 'שער / סטטוס'].forEach((t, i) => g.fillText(t, cols[i], 120));
    const rows = this.departures();
    const arr = this.planes.filter((p) => p.state === 'arrive' || p.state === 'away').map((p) => ({ dest: p.dest, flight: p.flight, time: p.state === 'arrive' ? 'נוחתת' : 'בדרך', gate: '-', status: 'נחיתה' }));
    [...rows, ...arr].slice(0, 7).forEach((r, k) => {
      const y = 175 + k * 52;
      g.fillStyle = k % 2 ? '#10244a' : '#0d1f40'; g.fillRect(20, y - 38, 984, 50);
      g.fillStyle = '#ffffff'; g.font = '30px Arial';
      g.fillText(r.dest, cols[0], y); g.fillText(r.flight, cols[1], y); g.fillText(r.time, cols[2], y);
      g.fillStyle = r.status === 'עלייה למטוס' ? '#56ff8a' : r.status === 'המריאה' || r.status === 'בהמראה' ? '#ffb347' : '#ffffff';
      g.fillText(`${r.gate} · ${r.status}`, cols[3], y);
    });
    this.boardTexture.needsUpdate = true;
  }

  // ground-service vehicles following loops on the apron
  _service(px, pz, allVehicles) {
    const near = Math.hypot(px + 300, pz - 640) < 450;
    if (near && !this.service.length) {
      const loops = [
        { type: 'tug', pts: [[-400, 648], [-200, 648], [-200, 666], [-400, 666]], v: 6 },
        { type: 'fuel', pts: [[-560, 652], [-120, 652], [-120, 690], [-560, 690]], v: 7 },
        { type: 'van', pts: [[-130, 600], [-130, 690], [-620, 690], [-620, 600]], v: 8 },
      ];
      for (const L of loops) {
        const [x, z] = L.pts[0];
        const v = new Vehicle(L.type, undefined, x, z, Math.atan2(L.pts[1][0] - x, L.pts[1][1] - z));
        v.driver = 'ai'; v.svc = { ...L, i: 1 };
        this.scene.add(v.object); this.service.push(v);
      }
    } else if (!near && this.service.length) {
      for (const v of this.service) { v.removed = true; this.scene.remove(v.object); v.object.traverse((o) => o.geometry && o.geometry.dispose()); }
      this.service = [];
    }
    for (const v of this.service) {
      const s = v.svc, [tx, tz] = s.pts[s.i];
      const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
      if (d < 3) { s.i = (s.i + 1) % s.pts.length; continue; }
      // stop for anything in front (player, cars, planes)
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      let blocked = false;
      for (const o of [...allVehicles, ...this.planes.map((p) => ({ x: p.x, z: p.z, plane: true, y: p.y }))]) {
        if (o === v || (o.plane && o.y > 3)) continue;
        const ox = o.x - v.x, oz = o.z - v.z, along = ox * fx + oz * fz, lat = Math.abs(ox * fz - oz * fx);
        if (along > 0 && along < (o.plane ? 26 : 9) && lat < (o.plane ? 18 : 2.5)) { blocked = true; break; }
      }
      if (Math.hypot(px - v.x, pz - v.z) < 8 && ((px - v.x) * fx + (pz - v.z) * fz) > 0) blocked = true;
      v.speed = damp(v.speed, blocked ? 0 : s.v, 2, 1 / 30);
      v.heading = dampAngle(v.heading, Math.atan2(dx, dz), 2.5, 1 / 30);
      v.x += Math.sin(v.heading) * v.speed / 30; v.z += Math.cos(v.heading) * v.speed / 30;
      v.vx = Math.sin(v.heading) * v.speed; v.vz = Math.cos(v.heading) * v.speed;
      v.wheelSpin += v.speed / 30 / 0.35;
      v.y = 0; v.sync(1 / 30);
    }
  }

  update(dt, hour, px, pz, allVehicles) {
    this.hour = hour;
    for (const p of this.planes) this._updatePlane(p, dt);
    // ground collisions for planes near the player
    const near = this.planes.filter((p) => p.mesh.visible && p.y < 8 && Math.hypot(p.x - px, p.z - pz) < 200);
    this.statics.removeGroup('planes');
    if (near.length) this.statics.addGroup('planes', near.flatMap((p) => p.colliders));
    this._service(px, pz, allVehicles);
    this._boardT -= dt;
    if (this._boardT <= 0) { this._boardT = 2; this._drawBoard(); }
  }

  _updatePlane(p, dt) {
    switch (p.state) {
      case 'parked':
        p.timer -= dt;
        if (p.timer <= 0) { p.state = 'depart'; p.route = this._departRoute(AIRPORT.gates[p.gate]); p.i = 0; }
        break;
      case 'away':
        p.timer -= dt;
        if (p.timer <= 0) {
          const g = this._freeGate();
          if (g === null || this.runway) { p.timer = 10; break; }
          p.gate = g; p.state = 'arrive'; p.route = this._arriveRoute(AIRPORT.gates[g]); p.i = 0;
          p.place(-3800, AIRPORT.runwayZ, Math.PI / 2, 300); p.speed = 85; p.mesh.visible = true;
          this.runway = p;
          p.dest = DESTS[Math.floor(Math.random() * DESTS.length)];
        }
        break;
      case 'depart': case 'arrive': this._follow(p, dt); break;
      case 'taken': p.timer -= dt; if (p.timer <= 0) { p.state = 'away'; p.timer = 30; } break;
    }
  }

  _follow(p, dt) {
    const w = p.route[p.i];
    if (!w) return;
    // the runway is used by one plane at a time: hold short if it's busy
    if (w.hold && this.runway && this.runway !== p) { p.speed = damp(p.speed, 0, 2, dt); p.sync(); return; }
    if (w.hold) this.runway = p;
    const dx = w.x - p.x, dz = w.z - p.z, dist = Math.hypot(dx, dz);
    const acc = w.air || w.runway ? 6 : 1.6;
    p.speed += clamp(w.v - p.speed, -acc * 1.4 * dt, acc * dt);
    const step = Math.min(dist, p.speed * dt);
    if (dist > 0.01) {
      if (w.rev) { p.x += (dx / dist) * step; p.z += (dz / dist) * step; }
      else {
        const want = Math.atan2(dx, dz);
        p.heading = dampAngle(p.heading, want, w.air ? 1.2 : 1.6, dt);
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
        const k = Math.max(0.2, Math.cos(wrapAngle(want - p.heading)));
        p.x += fx * step * k + (dx / dist) * step * (1 - k) * 0.5; p.z += fz * step * k + (dz / dist) * step * (1 - k) * 0.5;
      }
    }
    if (w.y !== undefined) {
      const ty = w.y, dy = ty - p.y;
      const tLeft = Math.max(0.3, dist / Math.max(1, p.speed));
      const vy = clamp(dy / tLeft, -9, 14);
      p.y = Math.max(0, p.y + vy * dt);
      p.pitch = damp(p.pitch, clamp(vy / Math.max(10, p.speed), -0.12, 0.2), 2, dt);
    } else { p.y = damp(p.y, 0, 3, dt); p.pitch = damp(p.pitch, 0, 3, dt); }
    p.sync();
    if (dist < Math.max(4, p.speed * dt * 1.5)) {
      if (w.runway && !(p.route[p.i + 1]?.runway) && this.runway === p) this.runway = null;
      p.i++;
      if (w.end) {
        if (p.state === 'depart') { p.state = 'away'; p.mesh.visible = false; p.gate = null; p.timer = 120 + Math.random() * 90; if (this.runway === p) this.runway = null; }
        else { p.state = 'parked'; p.heading = Math.PI; p.timer = 90 + Math.random() * 90; p.speed = 0; p.flight = `AZ${300 + Math.floor(Math.random() * 300)}`; p.dest = DESTS[Math.floor(Math.random() * DESTS.length)]; p.sync(); }
      }
    }
  }
}
