// Fist-fight impact effects (cartoon style, no blood): a bright burst + spark streaks where a blow lands,
// a softer blue flash for a blocked hit, and a dust puff when someone hits the ground.
import * as THREE from 'three';

function burstTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,240,200,0.9)'); grd.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  // star rays
  g.translate(64, 64); g.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(-4, 0); g.lineTo(0, -60 + (i % 2) * 22); g.lineTo(4, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dustTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, 'rgba(210,200,185,0.8)'); grd.addColorStop(1, 'rgba(210,200,185,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class HitFX {
  constructor(scene) {
    this.scene = scene; this.live = [];
    this.burst = burstTexture(); this.dust = dustTexture();
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 6), 3));
  }
  // kind: 'hit' | 'heavy' | 'block'
  impact(x, y, z, kind = 'hit') {
    const col = kind === 'block' ? 0x9fd4ff : kind === 'heavy' ? 0xffd27a : 0xffffff;
    const m = new THREE.SpriteMaterial({ map: this.burst, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const sp = new THREE.Sprite(m); sp.position.set(x, y, z);
    const size = kind === 'heavy' ? 1.1 : kind === 'block' ? 0.6 : 0.75;
    sp.scale.setScalar(size * 0.4); this.scene.add(sp);
    this.live.push({ o: sp, t: 0, dur: 0.2, grow: size, kind: 'burst' });
    // spark streaks flying outward
    const n = kind === 'heavy' ? 12 : 7, pos = new Float32Array(n * 6), vel = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.3) * 1.2;
      vel.push([Math.cos(a) * Math.cos(b) * 5, Math.sin(b) * 4 + 1, Math.sin(a) * Math.cos(b) * 5]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lm = new THREE.LineBasicMaterial({ color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const ls = new THREE.LineSegments(g, lm); ls.frustumCulled = false; this.scene.add(ls);
    this.live.push({ o: ls, t: 0, dur: 0.22, vel, origin: [x, y, z], kind: 'spark' });
  }
  dustPuff(x, y, z) {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.SpriteMaterial({ map: this.dust, transparent: true, depthWrite: false, opacity: 0.7 });
      const sp = new THREE.Sprite(m); const a = Math.random() * Math.PI * 2;
      sp.position.set(x + Math.cos(a) * 0.3, y + 0.15, z + Math.sin(a) * 0.3); sp.scale.setScalar(0.5);
      this.scene.add(sp);
      this.live.push({ o: sp, t: 0, dur: 0.9, kind: 'dust', vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2 });
    }
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i]; e.t += dt; const k = e.t / e.dur;
      if (k >= 1) { this.scene.remove(e.o); e.o.material.dispose(); if (e.kind === 'spark') e.o.geometry.dispose(); this.live.splice(i, 1); continue; }
      if (e.kind === 'burst') { e.o.scale.setScalar(e.grow * (0.4 + k * 0.8)); e.o.material.opacity = 1 - k; e.o.material.rotation = k * 0.6; }
      else if (e.kind === 'spark') {
        const p = e.o.geometry.attributes.position.array, [x, y, z] = e.origin;
        e.vel.forEach((v, j) => {
          const t0 = Math.max(0, e.t - 0.04), t1 = e.t;
          p.set([x + v[0] * t0, y + v[1] * t0 - 4 * t0 * t0, z + v[2] * t0, x + v[0] * t1, y + v[1] * t1 - 4 * t1 * t1, z + v[2] * t1], j * 6);
        });
        e.o.geometry.attributes.position.needsUpdate = true; e.o.material.opacity = 1 - k;
      } else { e.o.position.x += e.vx * dt; e.o.position.z += e.vz * dt; e.o.position.y += dt * 0.4; e.o.scale.setScalar(0.5 + k * 1.4); e.o.material.opacity = 0.7 * (1 - k); }
    }
  }
}
