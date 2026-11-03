// Third-person orbit camera (swipe / drag to rotate, pinch / wheel to zoom), chase camera for vehicles,
// first-person driver view, and wall avoidance so the camera never ends up inside a building.
import * as THREE from 'three';
import { segmentVsBox } from '../physics/collision.js';
import { heightAt } from '../world/terrain.js';
import { clamp, damp, dampAngle } from '../core/mathx.js';

const _q = [];

export class CameraRig {
  constructor(camera, statics) {
    this.camera = camera; this.statics = statics;
    this.yaw = 0; this.pitch = 0.28; this.dist = 4.6;
    this.curDist = 4.6;
    this.mode = 'chase'; // 'chase' | 'first'
    this.idle = 10;
    this.shake = 0;
    this.sensitivity = 1; this.invertY = false;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.first = true;
  }

  toggleMode() { this.mode = this.mode === 'chase' ? 'first' : 'chase'; }

  update(dt, input, player) {
    const sens = 0.0042 * this.sensitivity;
    const dx = input.lookDX, dy = input.lookDY * (this.invertY ? -1 : 1);
    if (dx || dy) this.idle = 0; else this.idle += dt;
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch + dy * sens, -0.35, 1.25);
    if (input.zoom) this.dist = clamp(this.dist + input.zoom * 0.5, 2.2, 14);

    const v = player.state === 'driving' || player.state === 'entering' && player.seq?.phase === 'close' ? player.vehicle : null;
    let tx, ty, tz, dist, lam = 14;
    if (v) {
      const L = v.T.L;
      dist = clamp(this.dist, 2.2, 14) * 0.6 + L * 0.9 + 2.2;
      if (v.isHeli) dist += 4;
      tx = v.x; ty = v.y + v.T.H * 0.85 + 0.6; tz = v.z;
      // auto-align behind the vehicle when the player is not looking around
      const moving = Math.abs(v.speed) > 1.5;
      if (this.idle > 1.2 && (moving || v.isHeli)) {
        const behind = v.speed < -1 ? v.heading + Math.PI : v.heading;
        this.yaw = dampAngle(this.yaw, behind, 2.8, dt);
        this.pitch = damp(this.pitch, v.isHeli ? 0.32 : 0.2, 2, dt);
      }
      lam = 20;
    } else {
      dist = this.dist;
      tx = player.x; ty = player.y + 1.55; tz = player.z;
      if (player.state === 'sitting') ty -= 0.45;
      // gentle auto-follow while walking
      if (this.idle > 2 && player.speed > 1) this.yaw = dampAngle(this.yaw, player.facing, 0.8, dt);
    }
    this.target.set(tx, ty, tz);
    if (this.first) { this.smoothTarget.copy(this.target); this.first = false; }
    this.smoothTarget.x = damp(this.smoothTarget.x, tx, lam, dt);
    this.smoothTarget.y = damp(this.smoothTarget.y, ty, lam * 0.6, dt);
    this.smoothTarget.z = damp(this.smoothTarget.z, tz, lam, dt);
    const T = this.smoothTarget;

    const cam = this.camera;
    if (v && this.mode === 'first') {
      v.object.updateMatrixWorld();
      const seat = v.seatWorld(new THREE.Vector3());
      const head = v.isTwoWheel ? 1.55 : 1.18;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      cam.position.set(seat.x + fx * 0.1, seat.y + head, seat.z + fz * 0.1);
      const lookYaw = this.idle > 1.2 ? v.heading : this.yaw;
      if (this.idle > 1.2) this.yaw = dampAngle(this.yaw, v.heading, 4, dt);
      cam.lookAt(cam.position.x + Math.sin(lookYaw) * 10, cam.position.y - 0.6 + (0.2 - this.pitch) * 4, cam.position.z + Math.cos(lookYaw) * 10);
      player.object.visible = false;
      return;
    }
    player.object.visible = true;

    const cp = Math.cos(this.pitch);
    const dirX = -Math.sin(this.yaw) * cp, dirY = Math.sin(this.pitch), dirZ = -Math.cos(this.yaw) * cp;
    // collision: shorten the boom if something blocks the view
    const ex = T.x + dirX * dist, ey = T.y + dirY * dist, ez = T.z + dirZ * dist;
    let t = 1;
    this.statics.query(Math.min(T.x, ex) - 1, Math.min(T.z, ez) - 1, Math.max(T.x, ex) + 1, Math.max(T.z, ez) + 1, _q);
    for (const c of _q) {
      if (c.tag === 'water') continue;
      if (c.type === 'circle' && c.r < 0.5) continue; // ignore thin poles
      const h = segmentVsBox(T.x, T.y, T.z, ex, ey, ez, c, 0.25);
      if (h < t) t = h;
    }
    const want = Math.max(1.0, dist * t - 0.2);
    this.curDist = want < this.curDist ? want : damp(this.curDist, want, 4, dt);
    let px = T.x + dirX * this.curDist, py = T.y + dirY * this.curDist, pz = T.z + dirZ * this.curDist;
    py = Math.max(py, heightAt(px, pz, py) + 0.3);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.25;
      px += (Math.random() - 0.5) * s; py += (Math.random() - 0.5) * s; pz += (Math.random() - 0.5) * s;
    }
    cam.position.set(px, py, pz);
    cam.lookAt(T.x, T.y, T.z);
  }
}
