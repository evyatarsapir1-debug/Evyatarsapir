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
    const sens = 0.0042 * this.sensitivity * (this.camera.fov / 62);   // slower look when zoomed in
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
      if (v.isPlane) dist = clamp(this.dist, 2.2, 14) * 0.8 + 30;
      tx = v.x; ty = v.y + v.T.H * 0.85 + 0.6; tz = v.z;
      // auto-align behind the vehicle when the player is not looking around
      const moving = Math.abs(v.speed) > 1.5;
      if (this.idle > 1.2 && (moving || v.isAir)) {
        const behind = v.speed < -1 ? v.heading + Math.PI : v.heading;
        this.yaw = dampAngle(this.yaw, behind, 2.8, dt);
        this.pitch = damp(this.pitch, v.isPlane ? 0.16 - v.pitch * 0.8 : v.isHeli ? 0.32 : 0.2, 2, dt);
      }
      lam = 20;
    } else {
      dist = this.dist;
      // indoors: find the ceiling above the player and keep a close, level camera under it
      this.ceiling = null;
      this.statics.query(player.x - 0.5, player.z - 0.5, player.x + 0.5, player.z + 0.5, _q);
      for (const c of _q) {
        if ((c.tag === 'slab' || c.tag === 'roof') && c.y0 > player.y + 1.6 && (this.ceiling === null || c.y0 < this.ceiling)) {
          const dx = player.x - c.x, dz = player.z - c.z;
          if (Math.abs(dx * c.c - dz * c.s) < c.hw && Math.abs(dx * c.s + dz * c.c) < c.hd) this.ceiling = c.y0;
        }
      }
      if (this.ceiling !== null) { dist = Math.min(dist, 3.2); this.pitch = Math.min(this.pitch, 0.42); }
      tx = player.x; ty = player.y + 1.55; tz = player.z;
      if (player.state === 'sitting') ty -= 0.45;
      if (player.state === 'riding') { ty -= 0.45; dist = Math.max(dist, 7); lam = 30; this.ceiling = null; }
      // aiming a weapon: over-the-right-shoulder camera, the body turns with the crosshair
      this.aimK = damp(this.aimK || 0, player.armed && player.aimT > 0 && player.state === 'foot' ? 1 : 0, 8, dt);
      this.scopeK = damp(this.scopeK || 0, this.aimMode === 'scope' ? 1 : 0, 10, dt);
      const fovWant = this.aimMode === 'scope' ? 14 : this.aimMode === 'aim' ? 44 : 62;
      if (Math.abs(this.camera.fov - fovWant) > 0.05) { this.camera.fov = damp(this.camera.fov, fovWant, 10, dt); this.camera.updateProjectionMatrix(); }
      if (this.aimK > 0.01) {
        const k = this.aimK, rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
        const zoomed = this.aimMode === 'aim';
        tx += rx * (zoomed ? 0.85 : 0.55) * k; tz += rz * (zoomed ? 0.85 : 0.55) * k; ty += 0.15 * k;
        dist = dist + (Math.min(dist, zoomed ? 3.6 : 2.6) - dist) * k;
        if (player.aimT > 0) { player.facing = dampAngle(player.facing, this.yaw, 18, dt); player.aimPitch = clamp(-(this.pitch - 0.15) * 0.9, -0.8, 0.9); }
        lam = 24;
      }
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
    player.object.visible = !(v && v.isPlane);   // the pilot sits inside the closed cockpit

    const cp = Math.cos(this.pitch);
    const dirX = -Math.sin(this.yaw) * cp, dirY = Math.sin(this.pitch), dirZ = -Math.cos(this.yaw) * cp;
    // collision: shorten the boom if something blocks the view
    const ex = T.x + dirX * dist, ey = T.y + dirY * dist, ez = T.z + dirZ * dist;
    let t = 1;
    this.statics.query(Math.min(T.x, ex) - 1, Math.min(T.z, ez) - 1, Math.max(T.x, ex) + 1, Math.max(T.z, ez) + 1, _q);
    for (const c of _q) {
      if (c.tag === 'water' || c.tag === 'furniture' || c.off) continue;
      if (c.type === 'circle' && c.r < 0.5) continue; // ignore thin poles
      const h = segmentVsBox(T.x, T.y, T.z, ex, ey, ez, c, 0.25);
      if (h < t) t = h;
    }
    const want = Math.max(1.0, dist * t - 0.2);
    this.curDist = want < this.curDist ? want : damp(this.curDist, want, 4, dt);
    let px = T.x + dirX * this.curDist, py = T.y + dirY * this.curDist, pz = T.z + dirZ * this.curDist;
    py = Math.max(py, heightAt(px, pz, py) + 0.3);
    if (!v && this.ceiling !== null) py = Math.min(py, this.ceiling - 0.25);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.25;
      px += (Math.random() - 0.5) * s; py += (Math.random() - 0.5) * s; pz += (Math.random() - 0.5) * s;
    }
    if (!v && this.scopeK > 0.5 && player.state === 'foot') {
      const cp2 = Math.cos(this.pitch);
      const ex2 = player.x + Math.sin(this.yaw) * 0.3, ey2 = player.y + 1.62, ez2 = player.z + Math.cos(this.yaw) * 0.3;
      cam.position.set(ex2, ey2, ez2);
      cam.lookAt(ex2 + Math.sin(this.yaw) * cp2 * 10, ey2 - Math.sin(this.pitch - 0.15) * 10, ez2 + Math.cos(this.yaw) * cp2 * 10);
      player.object.visible = false;
      return;
    }
    cam.position.set(px, py, pz);
    cam.lookAt(T.x, T.y, T.z);
  }
}
