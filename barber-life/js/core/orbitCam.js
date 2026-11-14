// Smooth orbit camera around the client's head, kept inside the room.
import * as THREE from 'three';

export const VIEWS = {
  front: { theta: 0, phi: 1.45, r: 0.62 },
  right: { theta: -Math.PI / 2, phi: 1.45, r: 0.6 },   // the client's right side (-X)
  left: { theta: Math.PI / 2, phi: 1.45, r: 0.6 },
  back: { theta: Math.PI, phi: 1.4, r: 0.62 },
  top: { theta: Math.PI, phi: 0.35, r: 0.62 },
  work: { theta: Math.PI - 0.55, phi: 1.3, r: 0.78 },
};

export class OrbitCam {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target.clone();
    this.theta = VIEWS.work.theta; this.phi = VIEWS.work.phi; this.r = VIEWS.work.r;
    this.cur = { theta: this.theta, phi: this.phi, r: this.r };
    this.minR = 0.26; this.maxR = 1.5;
    this.update(1);
  }

  rotate(dTheta, dPhi) {
    this.theta += dTheta;
    this.phi = THREE.MathUtils.clamp(this.phi + dPhi, 0.15, 2.2);
  }

  zoom(f) { this.r = THREE.MathUtils.clamp(this.r * f, this.minR, this.maxR); }

  setView(name) {
    const v = VIEWS[name]; if (!v) return;
    // take the short way round
    const twoPi = Math.PI * 2;
    let t = v.theta;
    while (t - this.theta > Math.PI) t -= twoPi;
    while (t - this.theta < -Math.PI) t += twoPi;
    this.theta = t; this.phi = v.phi; this.r = v.r;
  }

  update(dt) {
    const k = 1 - Math.exp(-12 * dt);
    const c = this.cur;
    c.theta += (this.theta - c.theta) * k;
    c.phi += (this.phi - c.phi) * k;
    c.r += (this.r - c.r) * k;
    const dir = _d.set(Math.sin(c.phi) * Math.sin(c.theta), Math.cos(c.phi), Math.sin(c.phi) * Math.cos(c.theta));
    // narrow (portrait) screens see less sideways: step back so the whole head still fits
    let r = c.r * (this.camera.aspect < 1 ? Math.min(1.8, 0.85 / this.camera.aspect) : 1);
    // stay in front of the mirror wall, above the floor, below the ceiling
    if (dir.z > 0) r = Math.min(r, (1.12 - this.target.z) / dir.z);
    if (dir.y > 0) r = Math.min(r, (2.85 - this.target.y) / dir.y);
    if (Math.abs(dir.x) > 0) r = Math.min(r, 2.4 / Math.abs(dir.x));
    this.camera.position.copy(this.target).addScaledVector(dir, r);
    this.camera.lookAt(this.target);
  }
}
const _d = new THREE.Vector3();
