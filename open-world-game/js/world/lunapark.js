// Luna park at the marina: a turning Ferris wheel (₪10) and a roller coaster (₪20) you can ride.
// Built once as real 3D objects; colliders keep you out of the structures; while riding the player sits in the
// cabin / car and the camera follows the ride.
import * as THREE from 'three';
import { GeoBuilder, mat } from './geoBuilder.js';
import { makeBox, makeCircle } from '../physics/collision.js';
import { CURB_H } from './layout.js';

export const LUNA = { x: 2550, z: 550 };       // centre of cell (25, 5)
const WHEEL = { x: LUNA.x - 22, z: LUNA.z + 10, r: 17, hub: 20, cabins: 12, period: 70 };
const COASTER = { x: LUNA.x + 18, z: LUNA.z - 5 };

const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12), TOR = new THREE.TorusGeometry(1, 0.035, 6, 64);
const M = (x, y, z, ry, sx, sy, sz, rx = 0, rz = 0) => mat(x, y, z, ry, sx, sy, sz, rx, rz).clone();

// closed coaster loop in local coordinates (x, z around COASTER), with height profile
function coasterPath() {
  const pts = [];
  const N = 220;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = Math.cos(t) * 24 + Math.cos(t * 2) * 5;
    const z = Math.sin(t) * 13 + Math.sin(t * 3) * 3;
    // lift hill, big drop, hills, a low station section near t≈0
    let y = 2.2 + Math.max(0, Math.sin(t - 0.6)) * 15 + Math.max(0, Math.sin(t * 3 + 1.2)) * 5;
    if (t < 0.45 || t > Math.PI * 2 - 0.35) y = 2.2;
    pts.push(new THREE.Vector3(COASTER.x + x, CURB_H + y, COASTER.z + z));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

export class LunaPark {
  constructor(scene, statics) {
    this.scene = scene; this.statics = statics;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.ride = null; this.time = 0;
    const metal = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.4 });
    // ---------------- Ferris wheel: two A-frames + rotating rim with spokes + hanging cabins
    const sb = new GeoBuilder(), W = WHEEL, y0 = CURB_H;
    for (const sz of [-1.6, 1.6]) for (const sx of [-1, 1]) {
      const len = Math.hypot(W.r * 0.55, W.hub), ang = Math.atan2(W.r * 0.55, W.hub) * sx;
      sb.addGeometry(BOX, M(W.x + sx * W.r * 0.275, y0 + W.hub / 2, W.z + sz, 0, 0.6, len, 0.6, 0, -ang), 0xf2f2f2);
    }
    sb.addGeometry(CYL, M(W.x, y0 + W.hub, W.z, 0, 1.2, 4, 1.2, Math.PI / 2), 0xcfd5da);
    sb.addGeometry(BOX, M(W.x, y0 + 1.2, W.z - 4, 0, 6, 2.4, 3), 0xc0392b);                // ticket booth
    sb.addGeometry(BOX, M(W.x, y0 + 0.15, W.z, 0, 10, 0.3, 7), 0xd8d2c6);                  // boarding platform
    this.group.add(new THREE.Mesh(sb.build(), metal));
    const wheel = new THREE.Group(); wheel.position.set(W.x, y0 + W.hub, W.z); this.group.add(wheel); this.wheel = wheel;
    const wb = new GeoBuilder();
    for (const sz of [-1.4, 1.4]) { wb.addGeometry(TOR, M(0, 0, sz, 0, W.r, W.r, 1), 0xf5f5f5); wb.addGeometry(TOR, M(0, 0, sz, 0, W.r * 0.6, W.r * 0.6, 1), 0xf5f5f5); }
    for (let k = 0; k < W.cabins * 2; k++) {
      const a = (k / (W.cabins * 2)) * Math.PI * 2;
      for (const sz of [-1.4, 1.4]) wb.addGeometry(BOX, M(Math.cos(a) * W.r / 2, Math.sin(a) * W.r / 2, sz, 0, W.r, 0.12, 0.12, 0, a), 0xe8e8e8);
      // rim lights
      wb.addGeometry(BOX, M(Math.cos(a) * W.r, Math.sin(a) * W.r, 1.5, 0, 0.3, 0.3, 0.2), [0xff4d4d, 0xffd34d, 0x4dc3ff, 0x7dff6a][k % 4]);
    }
    for (let k = 0; k < W.cabins; k++) { const a = (k / W.cabins) * Math.PI * 2; wb.addGeometry(CYL, M(Math.cos(a) * W.r, Math.sin(a) * W.r, 0, 0, 0.15, 3, 0.15, Math.PI / 2), 0xbfc5ca); }
    const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.4, emissive: 0x332211, emissiveIntensity: 0.2 });
    this.wheelMat = wheelMat;
    wheel.add(new THREE.Mesh(wb.build(), wheelMat));
    this.cabins = [];
    const CAB = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22];
    for (let k = 0; k < W.cabins; k++) {
      const cb = new GeoBuilder(), c = CAB[k % CAB.length];
      cb.addGeometry(BOX, M(0, -1.7, 0, 0, 2.0, 0.15, 1.8), c);                    // floor
      for (const sx of [-1, 1]) cb.addGeometry(BOX, M(sx * 0.95, -1.3, 0, 0, 0.1, 0.8, 1.8), c);
      for (const sz of [-1, 1]) cb.addGeometry(BOX, M(0, -1.3, sz * 0.85, 0, 2.0, 0.8, 0.1), c);
      cb.addGeometry(BOX, M(0, -0.25, 0, 0, 2.1, 0.12, 1.9), c);                    // roof
      for (const sx of [-0.9, 0.9]) for (const sz of [-0.8, 0.8]) cb.addGeometry(BOX, M(sx, -0.75, sz, 0, 0.06, 0.9, 0.06), 0xdddddd);
      cb.addGeometry(BOX, M(0, 0, 0, 0, 0.1, 0.5, 0.1), 0xbfc5ca);                  // hanger
      const cab = new THREE.Mesh(cb.build(), metal); cab.castShadow = true;
      this.group.add(cab); this.cabins.push(cab);
    }
    // ---------------- roller coaster: track rails + supports, a train of 3 cars
    this.curve = coasterPath();
    this.trackLen = this.curve.getLength();
    const tb = new GeoBuilder(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), tng = new THREE.Vector3(), side = new THREE.Vector3();
    const SEG = 440;
    for (let i = 0; i < SEG; i++) {
      const u = i / SEG; this.curve.getPointAt(u, p); this.curve.getTangentAt(u, tng);
      side.crossVectors(tng, up).normalize();
      const yaw = Math.atan2(tng.x, tng.z), pitch = -Math.asin(Math.max(-1, Math.min(1, tng.y)));
      const segLen = this.trackLen / SEG * 1.05;
      for (const s of [-0.55, 0.55]) tb.addGeometry(BOX, M(p.x + side.x * s, p.y, p.z + side.z * s, yaw, 0.12, 0.12, segLen, pitch), 0xe74c3c);
      if (i % 3 === 0) tb.addGeometry(BOX, M(p.x, p.y - 0.12, p.z, yaw, 1.3, 0.08, 0.15), 0x7f8c8d);    // ties
      if (i % 8 === 0 && p.y > CURB_H + 1) tb.addGeometry(BOX, M(p.x, (p.y + CURB_H) / 2 - 0.1, p.z, 0, 0.35, p.y - CURB_H, 0.35), 0xf1c40f); // supports
    }
    // station
    const st = this.curve.getPointAt(0);
    tb.addGeometry(BOX, M(st.x, CURB_H + 1.0, st.z + 2.6, 0, 9, 2.0, 3), 0x34495e);
    tb.addGeometry(BOX, M(st.x, CURB_H + 4.5, st.z + 1.0, 0, 11, 0.3, 6), 0xe74c3c);
    for (const sx of [-5, 5]) tb.addGeometry(BOX, M(st.x + sx, CURB_H + 2.3, st.z + 1, 0, 0.3, 4.4, 0.3), 0xecf0f1);
    const track = new THREE.Mesh(tb.build(), metal); track.castShadow = true; this.group.add(track);
    this.train = [];
    for (let k = 0; k < 3; k++) {
      const cb = new GeoBuilder();
      cb.addGeometry(BOX, M(0, 0.45, 0, 0, 1.4, 0.6, 2.0), [0x2980b9, 0xf1c40f, 0x27ae60][k]);
      cb.addGeometry(BOX, M(0, 0.8, -0.5, 0, 1.3, 0.5, 0.15), 0x1d1d1f);
      cb.addGeometry(BOX, M(0, 0.85, 0.75, 0, 1.3, 0.25, 0.1), 0xbfc5ca);
      const car = new THREE.Mesh(cb.build(), metal); car.castShadow = true; this.group.add(car); this.train.push(car);
    }
    this.trainS = 0; this.trainV = 0;
    // colliders (structures only; you walk between them)
    this.colliders = [
      makeBox(W.x, W.z, W.r * 0.6, 2.2, 0, 0, W.hub + 1),
      makeBox(W.x, W.z - 4, 3, 1.5, 0, 0, 2.4),
      makeBox(st.x, st.z + 2.6, 4.5, 1.5, 0, 0, 2),
    ];
    for (let i = 0; i < 60; i++) { this.curve.getPointAt(i / 60, p); if (p.y > CURB_H + 2.6) this.colliders.push(makeCircle(p.x, p.z, 0.4, 0, p.y)); }
    this.added = false;
    this.wheelPt = { x: W.x, z: W.z - 6.2 };
    this.coasterPt = { x: st.x, z: st.z + 5 };
  }

  near(px, pz, r = 260) { return Math.abs(px - LUNA.x) < r && Math.abs(pz - LUNA.z) < r; }

  // prompts at the ticket points
  promptFor(player) {
    if (player.state !== 'foot' || this.ride || !this.group.visible) return null;
    if (Math.hypot(player.x - this.wheelPt.x, player.z - this.wheelPt.z) < 3.2) return { text: 'גלגל ענק · ₪10', ride: 'wheel', price: 10 };
    if (Math.hypot(player.x - this.coasterPt.x, player.z - this.coasterPt.z) < 3.6) return { text: 'רכבת הרים · ₪20', ride: 'coaster', price: 20 };
    return null;
  }

  start(kind, player) {
    this.ride = { kind, t: 0, player, from: { x: player.x, z: player.z, y: player.y, facing: player.facing } };
    if (kind === 'wheel') {
      // board the cabin that is lowest right now
      let best = 0, by = Infinity;
      this.cabins.forEach((c, k) => { if (c.position.y < by) { by = c.position.y; best = k; } });
      this.ride.cabin = best; this.ride.dur = WHEEL.period;
    } else { this.trainS = 0; this.trainV = 3; this.ride.dur = null; }
    player.state = 'riding'; player.vx = player.vz = player.vy = 0;
  }

  // returns the point the camera should look at while riding, or null
  update(dt, px, pz) {
    const show = this.near(px, pz);
    if (show !== this.group.visible) this.group.visible = show;
    if (show && !this.added) { this.statics.addGroup('lunapark', this.colliders); this.added = true; }
    if (!show && this.added && !this.ride) { this.statics.removeGroup('lunapark'); this.added = false; }
    if (!show && !this.ride) return null;
    this.time += dt;
    // wheel rotation
    const W = WHEEL, a0 = (this.time / W.period) * Math.PI * 2;
    this.wheel.rotation.z = a0;
    this.cabins.forEach((c, k) => { const a = a0 + (k / W.cabins) * Math.PI * 2; c.position.set(W.x + Math.cos(a) * W.r, CURB_H + W.hub + Math.sin(a) * W.r, W.z); });
    this.wheelMat.emissiveIntensity = 0.2 + (Math.sin(this.time * 3) * 0.5 + 0.5) * 0.6;
    // coaster physics: chain lift to the top, then gravity
    const tng = new THREE.Vector3();
    const u = ((this.trainS % this.trackLen) + this.trackLen) % this.trackLen / this.trackLen;
    this.curve.getTangentAt(u, tng);
    const lifting = tng.y > 0.05 && this.trainV < 4.5;
    this.trainV = lifting ? Math.max(this.trainV, 4.5) : Math.max(3, this.trainV - 9.8 * tng.y * dt - this.trainV * 0.01 * dt);
    if (!this.ride || this.ride.kind !== 'coaster') {
      // idle loop when nobody is riding (slower)
      this.trainV = Math.min(this.trainV, 14);
    }
    this.trainS += this.trainV * dt;
    const p = new THREE.Vector3();
    this.train.forEach((car, k) => {
      const uu = ((((this.trainS - k * 2.3) % this.trackLen) + this.trackLen) % this.trackLen) / this.trackLen;
      this.curve.getPointAt(uu, p); this.curve.getTangentAt(uu, tng);
      car.position.copy(p);
      car.rotation.set(-Math.asin(Math.max(-1, Math.min(1, tng.y))), Math.atan2(tng.x, tng.z), 0, 'YXZ');
    });
    // rider
    const R = this.ride;
    if (!R) return null;
    R.t += dt;
    const pl = R.player;
    if (R.kind === 'wheel') {
      const c = this.cabins[R.cabin];
      pl.x = c.position.x; pl.y = c.position.y - 1.62; pl.z = c.position.z; pl.facing = Math.PI;
      if (R.t >= R.dur) return this.stop('הסיבוב בגלגל הענק נגמר. איזה נוף!');
      return { look: new THREE.Vector3(c.position.x, c.position.y - 1, c.position.z), mode: 'sit', dist: 7 };
    }
    const car = this.train[0];
    pl.x = car.position.x; pl.y = car.position.y + 0.25; pl.z = car.position.z; pl.facing = car.rotation.y;
    R.lap = (R.lap || 0) + this.trainV * dt;
    if (R.lap > this.trackLen) return this.stop('וואו! איזו נסיעה ברכבת ההרים!');
    return { look: car.position.clone(), mode: 'sit', dist: 9, yaw: car.rotation.y };
  }

  stop(msg) {
    const R = this.ride, pl = R.player;
    pl.state = 'foot';
    const back = R.kind === 'wheel' ? this.wheelPt : this.coasterPt;
    pl.x = back.x; pl.z = back.z; pl.y = CURB_H; pl.vy = 0; pl.grounded = true;
    this.ride = null;
    return { done: msg };
  }
}
