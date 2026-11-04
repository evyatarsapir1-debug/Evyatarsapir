// Sky dome with sun, moon, stars and clouds; a full day/night cycle; changing weather (clear, cloudy, rain, fog)
// with falling rain and wet roads; and shadows that follow the player.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/mathx.js';

const C = (h) => new THREE.Color(h);
const SKY = {
  night: { top: C(0x050912), hor: C(0x18233a) },
  dusk: { top: C(0x2c3f78), hor: C(0xf0905a) },
  day: { top: C(0x3d7fd6), hor: C(0xcfe3f2) },
  overcast: { top: C(0x7d8794), hor: C(0xb8c0c8) },
};
export const WEATHER = {
  clear: { name: 'בהיר', cloud: 0.1, rain: 0, fog: 1 },
  cloudy: { name: 'מעונן', cloud: 0.65, rain: 0, fog: 0.9 },
  rain: { name: 'גשם', cloud: 0.95, rain: 1, fog: 0.65 },
  fog: { name: 'ערפל', cloud: 0.7, rain: 0, fog: 0.35 },
};
const WEATHER_SEQ = ['clear', 'clear', 'cloudy', 'rain', 'cloudy', 'clear', 'fog', 'clear'];

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.hour = 10;            // game clock (0..24)
    this.dayMinutes = 24;      // real minutes per game day
    this.weather = 'clear'; this.weatherIdx = 0; this.weatherT = 240;
    this.w = { cloud: 0.1, rain: 0, fog: 1 }; // smoothed weather values
    this.wet = 0;
    this.fogFar = 900;
    const skyGeo = new THREE.SphereGeometry(1800, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: C(0x3d7fd6) }, horizon: { value: C(0xcfe3f2) },
        sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() }, sunColor: { value: C(0xfff2d0) },
        moonDir: { value: new THREE.Vector3(-0.4, 0.6, -0.3).normalize() },
        night: { value: 0 }, cloud: { value: 0.1 }, time: { value: 0 }, cloudColor: { value: C(0xffffff) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 moonDir; uniform float night; uniform float cloud; uniform float time; uniform vec3 cloudColor; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
        void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, -0.1, 1.0);
          vec3 c = mix(horizon, top, pow(max(h,0.0), 0.55));
          float s = max(dot(d, sunDir), 0.0); c += sunColor * (pow(s, 600.0) * 2.5 + pow(s, 8.0) * 0.25) * (1.0 - cloud * 0.8);
          float m = max(dot(d, moonDir), 0.0); c += vec3(0.85, 0.9, 1.0) * pow(m, 900.0) * 1.6 * night;
          if (h > 0.0) {
            vec2 sp = d.xz / (d.y + 0.15);
            float st = step(0.9975, hash(floor(sp * 140.0))) * night * (1.0 - cloud);
            c += vec3(st);
            float cl = smoothstep(0.62 - cloud * 0.45, 0.95, fbm(sp * 1.6 + vec2(time * 0.004, time * 0.002)));
            c = mix(c, cloudColor, cl * clamp(cloud * 1.4, 0.0, 1.0) * smoothstep(0.0, 0.25, h));
          }
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -1;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6b6250, 1.1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 1.1;
    scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.45, 0.75, 0.35).normalize();
    scene.fog = new THREE.Fog(0xcfe3f2, 150, 520);
    this._buildEnvMap();

    // rain streaks around the camera
    const N = 1600;
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60;
      pos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.0, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this.rainN = N;
    this._tmp = new THREE.Color();
  }

  _buildEnvMap() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const s = this.sky.clone(); s.scale.setScalar(0.05);
    envScene.add(s);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 16), new THREE.MeshBasicMaterial({ color: 0x5a5a55 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -5; envScene.add(ground);
    this.scene.environment = pm.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.7;
    pm.dispose();
  }

  setQuality(q) {
    const size = q === 'high' ? 4096 : 2048;
    this.sun.castShadow = q !== 'low';
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.rain.geometry.setDrawRange(0, q === 'low' ? 1000 : this.rainN * 2);
  }

  // fog ends where the low-detail world ends, so the horizon fades into real geometry (no backdrop images)
  setFogFar(far) {
    this.fogFar = far;
    this.sky.scale.setScalar((far + 300) / 1800);
  }

  setWeather(name) { if (WEATHER[name]) { this.weather = name; this.weatherT = 200 + Math.random() * 200; } }
  get weatherName() { return WEATHER[this.weather].name; }
  get clockText() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // dt in real seconds; returns lighting factors for the rest of the game
  tick(dt) {
    this.hour = (this.hour + dt * (24 / (this.dayMinutes * 60))) % 24;
    this.weatherT -= dt;
    if (this.weatherT <= 0) { this.weatherIdx = (this.weatherIdx + 1) % WEATHER_SEQ.length; this.setWeather(WEATHER_SEQ[this.weatherIdx]); }
    const W = WEATHER[this.weather], k = 1 - Math.exp(-dt / 12);
    for (const key of ['cloud', 'rain', 'fog']) this.w[key] += (W[key] - this.w[key]) * k;
    this.wet = clamp(this.wet + (this.w.rain > 0.3 ? dt / 40 : -dt / 120), 0, 1);
    this.skyMat.uniforms.time.value += dt;

    const ang = ((this.hour - 6) / 12) * Math.PI;    // 6:00 sunrise, 18:00 sunset
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang) * 0.8, elev, 0.35).normalize();
    const day = smoothstep(-0.08, 0.25, elev);
    const dusk = clamp(1 - Math.abs(elev) / 0.25, 0, 1) * (1 - this.w.cloud * 0.7);
    this.night = 1 - day;
    const cl = this.w.cloud;
    const U = this.skyMat.uniforms;
    const top = this._mix(SKY.night.top, SKY.day.top, day), hor = this._mix(SKY.night.hor, SKY.day.hor, day);
    top.lerp(SKY.dusk.top, dusk * 0.6); hor.lerp(SKY.dusk.hor, dusk * 0.8);
    top.lerp(this._tmp.copy(SKY.overcast.top).multiplyScalar(0.25 + day * 0.75), cl * 0.75);
    hor.lerp(this._tmp.copy(SKY.overcast.hor).multiplyScalar(0.2 + day * 0.8), cl * 0.75);
    U.top.value.copy(top); U.horizon.value.copy(hor);
    U.sunDir.value.copy(this.sunDir); U.moonDir.value.set(-this.sunDir.x, Math.abs(this.sunDir.y) * 0.8 + 0.2, -this.sunDir.z).normalize();
    U.night.value = this.night; U.cloud.value = cl;
    U.cloudColor.value.setRGB(0.25 + day * 0.7, 0.27 + day * 0.7, 0.3 + day * 0.7).lerp(C(0xf3a77a), dusk * 0.5);
    U.sunColor.value.setHex(0xfff2d0).lerp(C(0xff8a4a), dusk);

    // lights
    const sunUp = elev > -0.05;
    this.sun.color.setHex(0xfff1dc).lerp(C(0xff9a5a), dusk * 0.8);
    this.sun.intensity = sunUp ? 2.6 * smoothstep(-0.05, 0.2, elev) * (1 - cl * 0.7) : 0.25 * (1 - cl);
    if (!sunUp) this.sun.color.setHex(0x8fa6d6); // moonlight
    // low sun / moon: long grazing shadows band and stripe on flat roads -> fade them out smoothly
    this.sun.shadow.intensity = sunUp ? smoothstep(0.06, 0.3, elev) : 0;
    this.lightDir = sunUp ? this.sunDir : U.moonDir.value;
    this.hemi.intensity = 0.18 + day * 0.95 * (1 - cl * 0.25);
    this.hemi.color.setHex(0xcfe6ff).lerp(C(0x5a6b8f), this.night);
    this.hemi.groundColor.setHex(0x6b6250).lerp(C(0x1b1d24), this.night);
    this.scene.environmentIntensity = 0.12 + 0.6 * day + this.wet * 0.3;
    this.scene.fog.color.copy(hor);
    const ff = this.fogFar * this.w.fog;
    this.scene.fog.far = ff * 0.97; this.scene.fog.near = ff * 0.25 * this.w.fog;
    this.renderer.toneMappingExposure = 1.0 + this.night * 0.25;
    this.rain.material.opacity = this.w.rain * 0.45;
    this.rain.visible = this.w.rain > 0.02;
    return { night: this.night, wet: this.wet, rain: this.w.rain };
  }

  _mix(a, b, t) { return new THREE.Color().copy(a).lerp(b, t); }

  update(focus, dt = 0.016, camera) {
    const d = this.lightDir || this.sunDir;
    const snap = 0.5;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.position.set(fx + d.x * 200, focus.y + Math.max(0.15, d.y) * 200, fz + d.z * 200);
    this.sun.target.position.set(fx, focus.y, fz);
    this.sky.position.copy(focus);
    if (this.rain.visible && camera) {
      // falling streaks wrapped around the camera
      const p = this.rain.geometry.attributes.position, a = p.array, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const fall = 22 * dt;
      for (let i = 0; i < a.length; i += 6) {
        let y = a[i + 1] - fall;
        let x = a[i], z = a[i + 2];
        if (y < cy - 8 || Math.abs(x - cx) > 30 || Math.abs(z - cz) > 30) {
          x = cx + (Math.random() - 0.5) * 60; z = cz + (Math.random() - 0.5) * 60; y = cy + 6 + Math.random() * 20;
        }
        a[i] = x; a[i + 1] = y; a[i + 2] = z; a[i + 3] = x + 0.05; a[i + 4] = y - 0.7; a[i + 5] = z;
      }
      p.needsUpdate = true;
    }
  }
}
