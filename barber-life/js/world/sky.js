// Day/night cycle and weather for the city: sun, sky colour, fog, street lights and lit windows, rain.
import * as THREE from 'three';

const KEYS = [ // hour -> sky colour, sun intensity, ambient
  [0, '#0b1020', 0.0, 0.25], [5, '#1a2038', 0.0, 0.3], [6.5, '#e8a77a', 0.6, 0.5], [8, '#9cc4e8', 1.6, 0.75],
  [12, '#86b8e6', 2.2, 0.85], [17, '#a3c2e0', 1.7, 0.75], [18.8, '#f0a070', 0.7, 0.55], [20, '#2a2f4a', 0.05, 0.35], [24, '#0b1020', 0.0, 0.25],
];
export const WEATHER = {
  clear: { name: 'בהיר', icon: '☀️', dim: 1, fog: 0.0025 },
  cloudy: { name: 'מעונן', icon: '⛅', dim: 0.7, fog: 0.004 },
  rain: { name: 'גשום', icon: '🌧️', dim: 0.5, fog: 0.007 },
};

export class Sky {
  constructor(scene) {
    this.scene = scene;
    scene.background = new THREE.Color('#86b8e6');
    scene.fog = new THREE.FogExp2('#86b8e6', 0.0025);
    this.hemi = new THREE.HemisphereLight('#dfefff', '#4a4636', 0.8);
    this.sun = new THREE.DirectionalLight('#fff2dc', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    scene.add(this.hemi, this.sun, this.sun.target);
    this.weather = 'clear';
    this.inside = false;
    // rain: line segments around the player
    const n = 1400, pos = new Float32Array(n * 6);
    this.rainSeed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.rainSeed[i * 3] = Math.random(); this.rainSeed[i * 3 + 1] = Math.random(); this.rainSeed[i * 3 + 2] = Math.random(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#aeb8c8', transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    scene.add(this.rain);
    this._c = new THREE.Color(); this._c2 = new THREE.Color();
  }

  setWeather(w) { this.weather = WEATHER[w] ? w : 'clear'; this.rain.visible = this.weather === 'rain'; }

  /** hour 0..24 (float); focus = player position; nightMats get their emissive from the darkness. */
  update(hour, focus, nightMats, t) {
    let a = KEYS[0], b = KEYS[1];
    for (let i = 1; i < KEYS.length; i++) if (hour <= KEYS[i][0]) { a = KEYS[i - 1]; b = KEYS[i]; break; }
    const k = (hour - a[0]) / Math.max(0.001, b[0] - a[0]);
    const W = WEATHER[this.weather];
    this._c.set(a[1]).lerp(this._c2.set(b[1]), k);
    const grey = this._c2.set('#7d8590');
    if (this.weather !== 'clear') this._c.lerp(grey, this.weather === 'rain' ? 0.55 : 0.3);
    this.scene.background.copy(this._c);
    this.scene.fog.color.copy(this._c);
    this.scene.fog.density = W.fog;
    const sunI = (a[2] + (b[2] - a[2]) * k) * W.dim;
    const amb = (a[3] + (b[3] - a[3]) * k) * (0.6 + 0.4 * W.dim);
    this.sun.intensity = sunI;
    this.hemi.intensity = amb + (this.inside ? 0.55 : 0);
    // sun path: east (morning) over the south to the west (evening)
    const ang = (hour - 6) / 12 * Math.PI;
    this.sun.position.set(focus.x + Math.cos(ang) * 60, Math.max(8, Math.sin(ang) * 80), focus.z + 30);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.night = THREE.MathUtils.clamp(1 - sunI / 0.8, 0, 1);
    for (const m of nightMats) m.emissiveIntensity = this.night * (m.userData.nightMax ?? 1.4);
    if (this.rain.visible) {
      const p = this.rain.geometry.attributes.position.array, s = this.rainSeed;
      for (let i = 0; i < s.length / 3; i++) {
        const x = focus.x + (s[i * 3] - 0.5) * 40, z = focus.z + (s[i * 3 + 1] - 0.5) * 40;
        const y = 20 - ((t * 18 + s[i * 3 + 2] * 20) % 20);
        p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x + 0.05; p[i * 6 + 4] = y - 0.6; p[i * 6 + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
}
