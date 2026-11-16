// Strand-based 3D hair that can really be cut.
// Every hair is an instanced, camera-facing ribbon grown from a root on the scalp. Its shape (standing up when
// short, lying down and following the head when long, curls) is computed in the vertex shader from the length,
// so cutting = shortening a per-strand length attribute. Nothing is a flat picture of hair.
import * as THREE from 'three';
import { RADII, hairMask, zoneOf, zoneKeyOf, ZONE_KEYS, surfacePoint, surfaceNormal, mulberry32 } from './scalp.js';

const SEG = 6; // ribbon segments per strand

export const HAIR_PRESETS = {
  daniel: {
    id: 'daniel', name: 'דניאל', hairType: 'חלק', hairTypeId: 'straight',
    color: '#3a281d', curlAmp: 0, curlFreq: 0, width: 0.00115,
    lengths: { top: 48, crown: 42, side: 28, back: 32, nape: 20 },
  },
  yoni: {
    id: 'yoni', name: 'יוני', hairType: 'גלי', hairTypeId: 'wavy',
    color: '#6b4a2e', curlAmp: 0.0022, curlFreq: 260, width: 0.00115,
    lengths: { top: 60, crown: 50, side: 32, back: 36, nape: 22 },
  },
  avi: {
    id: 'avi', name: 'אבי', hairType: 'מתולתל ועבה', hairTypeId: 'curly',
    color: '#151010', curlAmp: 0.0032, curlFreq: 620, width: 0.0013,
    lengths: { top: 50, crown: 46, side: 34, back: 36, nape: 24 },
  },
  // Training mannequin: long, even hair so every haircut in the library can be cut on it.
  mannequin: {
    id: 'mannequin', name: 'ראש אימון', hairType: 'שיער אימון ארוך', hairTypeId: 'straight',
    color: '#4a3324', curlAmp: 0, curlFreq: 0, width: 0.00115,
    lengths: { top: 62, crown: 60, side: 52, back: 54, nape: 44 },
  },
  mannequinWavy: {
    id: 'mannequinWavy', name: 'ראש אימון גלי', hairType: 'גלי', hairTypeId: 'wavy',
    color: '#5c3e27', curlAmp: 0.0022, curlFreq: 260, width: 0.00115,
    lengths: { top: 62, crown: 60, side: 52, back: 54, nape: 44 },
  },
  mannequinCurly: {
    id: 'mannequinCurly', name: 'ראש אימון מתולתל', hairType: 'מתולתל', hairTypeId: 'curly',
    color: '#1d1512', curlAmp: 0.0032, curlFreq: 620, width: 0.0013,
    lengths: { top: 62, crown: 60, side: 52, back: 54, nape: 44 },
  },
};

/** Hair types used for generated clients (lengths are chosen per client). */
export const HAIR_TYPES = {
  straightDark: { hairType: 'חלק', hairTypeId: 'straight', color: '#2e2018', curlAmp: 0, curlFreq: 0, width: 0.00115 },
  straightBrown: { hairType: 'חלק', hairTypeId: 'straight', color: '#5a3d26', curlAmp: 0, curlFreq: 0, width: 0.00115 },
  blond: { hairType: 'חלק ובהיר', hairTypeId: 'straight', color: '#b8925a', curlAmp: 0, curlFreq: 0, width: 0.00105 },
  ginger: { hairType: 'חלק, ג׳ינג׳י', hairTypeId: 'straight', color: '#8a4a22', curlAmp: 0, curlFreq: 0, width: 0.00105 },
  wavy: { hairType: 'גלי', hairTypeId: 'wavy', color: '#4e3522', curlAmp: 0.0022, curlFreq: 260, width: 0.00115 },
  curly: { hairType: 'מתולתל', hairTypeId: 'curly', color: '#161011', curlAmp: 0.0032, curlFreq: 620, width: 0.0013 },
  coarse: { hairType: 'עבה וקשה', hairTypeId: 'coarse', color: '#121012', curlAmp: 0.0009, curlFreq: 180, width: 0.0015 },
  grey: { hairType: 'מאפיר', hairTypeId: 'straight', color: '#8d8a86', curlAmp: 0, curlFreq: 0, width: 0.001 },
};

const vertexShader = /* glsl */`
  uniform vec3 uRadii;
  uniform float uCurlAmp, uCurlFreq, uWidth;
  attribute float aT, aSide;
  attribute vec3 aRoot, aNormal, aFlow;
  attribute float aLen, aTarget, aZone;
  attribute vec4 aRand;
  varying float vT, vLen, vTarget, vZone;
  varying vec3 vTan, vWorld, vNorm;
  varying vec4 vRand;

  vec3 strandPos(float s, float L) {
    float stand = mix(0.9, 0.07, smoothstep(0.003, 0.032, L));
    stand = clamp(stand + (aRand.y - 0.5) * 0.25, 0.05, 0.97);
    vec3 d0 = normalize(aNormal * stand + aFlow * (1.0 - stand));
    float bend = smoothstep(0.006, 0.045, L) * 1.15;
    vec3 g = normalize(aFlow * 0.55 + vec3(0.0, -0.45, 0.0));
    vec3 p = aRoot + d0 * s + g * (s * s / (L + 1e-4)) * bend;
    if (uCurlAmp > 0.0) {
      vec3 b1 = normalize(cross(d0, aNormal + vec3(0.001, 0.002, 0.0)));
      vec3 b2 = cross(d0, b1);
      float ph = s * uCurlFreq * (0.8 + aRand.x * 0.4) + aRand.z * 6.2832;
      float amp = uCurlAmp * smoothstep(0.0, 0.008, s) * (0.7 + aRand.y * 0.6);
      p += (b1 * cos(ph) + b2 * sin(ph)) * amp;
    }
    // Keep hair on top of the head: long hair follows the skull instead of passing through it.
    vec3 q = p / uRadii;
    float lq = length(q);
    float minR = 1.0 + (0.0007 + s * (0.03 + aRand.y * 0.16)) / 0.09;
    if (lq < minR) p = q / lq * minR * uRadii;
    return p;
  }

  void main() {
    float L = aLen;
    float s = aT * L;
    vec3 p = strandPos(s, L);
    vec3 p2 = strandPos(s + max(L * 0.06, 0.0004), L);
    vec3 tanL = normalize(p2 - p + vec3(0.0, 0.0, 1e-6));
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vec3 tanW = normalize(mat3(modelMatrix) * tanL);
    vec3 viewDir = normalize(cameraPosition - wp.xyz);
    vec3 side = cross(tanW, viewDir);
    float sl = length(side);
    side = sl > 1e-4 ? side / sl : normalize(cross(tanW, vec3(0.0, 1.0, 0.0)));
    float w = uWidth * (0.6 + aRand.w * 0.8) * mix(1.0, 0.3, aT) * step(0.00025, L);
    wp.xyz += side * aSide * w * 0.5;
    vT = aT; vLen = L; vTarget = aTarget; vZone = aZone; vTan = tanW; vWorld = wp.xyz; vRand = aRand;
    vNorm = normalize(mat3(modelMatrix) * aNormal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 uColor, uKeyDir, uKeyColor, uFillDir, uFillColor, uAmbient;
  uniform float uMapMode, uHighlight;
  varying float vT, vLen, vTarget, vZone;
  varying vec3 vTan, vWorld, vNorm;
  varying vec4 vRand;

  vec3 lengthColor(float mm) {
    if (mm < 1.0) return vec3(0.45, 0.2, 0.75);
    if (mm < 4.0) return vec3(0.1, 0.35, 0.95);
    if (mm < 7.5) return vec3(0.05, 0.75, 0.85);
    if (mm < 11.5) return vec3(0.15, 0.8, 0.25);
    if (mm < 16.0) return vec3(0.95, 0.85, 0.1);
    if (mm < 22.0) return vec3(1.0, 0.5, 0.05);
    if (mm < 32.0) return vec3(0.9, 0.12, 0.1);
    return vec3(0.95, 0.85, 0.9);
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 T = normalize(vTan);
    vec3 base = uColor * (0.7 + vRand.x * 0.6);
    if (uMapMode > 0.5 && uMapMode < 1.5) base = pow(lengthColor(vLen * 1000.0), vec3(2.2)) * 0.8;
    if (uMapMode > 1.5) {
      // difference from the professional result: green = right length, red = too long, blue = too short
      float tol = max(0.0006, vTarget * 0.12);
      float e = (vLen - vTarget) / tol;
      vec3 c = vec3(0.1, 0.85, 0.25);
      if (e > 1.0) c = mix(vec3(1.0, 0.85, 0.1), vec3(0.95, 0.1, 0.1), clamp((e - 1.0) / 3.0, 0.0, 1.0));
      if (e < -1.0) c = mix(vec3(0.1, 0.8, 0.95), vec3(0.15, 0.2, 0.95), clamp((-e - 1.0) / 2.0, 0.0, 1.0));
      base = pow(c, vec3(2.2)) * 0.8;
    }
    if (uHighlight > -0.5) {
      if (abs(vZone - uHighlight) < 0.5) base = mix(base, pow(vec3(1.0, 0.78, 0.25), vec3(2.2)), 0.85);
      else base *= 0.35;
    }
    float ao = mix(0.32, 1.0, smoothstep(0.0, 0.75, vT));
    vec3 col = uAmbient * base * ao;
    // Kajiya-Kay style hair lighting with two lights + head self-shadowing from the scalp normal.
    for (int i = 0; i < 2; i++) {
      vec3 L = i == 0 ? uKeyDir : uFillDir;
      vec3 lc = i == 0 ? uKeyColor : uFillColor;
      float tl = dot(T, L);
      float diff = sqrt(max(0.0, 1.0 - tl * tl));
      float headSh = smoothstep(-0.35, 0.45, dot(vNorm, L));
      vec3 H = normalize(L + V);
      float th = dot(T, H);
      float spec1 = pow(sqrt(max(0.0, 1.0 - th * th)), 110.0) * 0.07;
      float th2 = dot(T, normalize(H + vNorm * 0.25));
      float spec2 = pow(sqrt(max(0.0, 1.0 - th2 * th2)), 30.0) * 0.06;
      col += lc * headSh * (base * (0.25 + 0.75 * diff) * ao + (spec1 + spec2 * base * 3.0) * ao);
    }
    float alpha = 1.0 - smoothstep(0.82, 1.0, vT);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class HairSystem {
  constructor({ count = 18000, seed = 7, preset = HAIR_PRESETS.daniel } = {}) {
    this.count = count;
    this.seed = seed;
    this.preset = preset;
    this._build();
  }

  _build() {
    const N = this.count, rnd = mulberry32(this.seed);
    // Estimate how much of the sphere is scalp so the golden spiral gives ~N accepted roots.
    let acc = 0; const tmp = new THREE.Vector3();
    for (let i = 0; i < 4000; i++) {
      const y = 1 - 2 * rnd(), r = Math.sqrt(1 - y * y), ph = rnd() * Math.PI * 2;
      acc += hairMask(tmp.set(r * Math.cos(ph), y, r * Math.sin(ph)));
    }
    const M = Math.ceil(N / (acc / 4000) * 1.02);
    const roots = [], dirs = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    const d = new THREE.Vector3();
    for (let i = 0; i < M && roots.length < N; i++) {
      const y = 1 - 2 * (i + 0.5) / M + (rnd() - 0.5) * 1.6 / M;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const ph = i * golden + (rnd() - 0.5) * 0.04;
      d.set(r * Math.cos(ph), y, r * Math.sin(ph)).normalize();
      const m = hairMask(d);
      if (m <= 0 || rnd() > m) continue;
      roots.push(surfacePoint(d, new THREE.Vector3()));
      dirs.push(d.clone());
    }
    const n = this.count = roots.length;
    this.roots = new Float32Array(n * 3);
    this.normals = new Float32Array(n * 3);
    this.flows = new Float32Array(n * 3);
    this.rand = new Float32Array(n * 4);
    this.lengths = new Float32Array(n);   // mm
    this.initial = new Float32Array(n);
    this.zone = new Array(n);
    this.zoneIdx = new Float32Array(n);
    this.dirs = new Float32Array(n * 3);
    this.mask = new Float32Array(n);
    this.hash = new Float32Array(n);
    this.target = null;      // mm per strand for the active haircut (null = free cutting)
    this.display = 'mine';   // 'mine' | 'pro'
    const whorl = new THREE.Vector3(0.12, 0.8, -0.58).normalize();
    const nrm = new THREE.Vector3(), flow = new THREE.Vector3(), radial = new THREE.Vector3();
    const L = this.preset.lengths;
    for (let i = 0; i < n; i++) {
      const p = roots[i], dd = dirs[i];
      surfaceNormal(p, nrm);
      // combed down/back, with the fringe swept to the client's left like a natural side sweep
      const sweep = 1.1 * THREE.MathUtils.smoothstep(dd.z, 0.2, 0.85) * THREE.MathUtils.smoothstep(dd.y, 0.15, 0.6);
      flow.set(sweep, -1, -0.6 - sweep * 0.4);
      flow.addScaledVector(nrm, -flow.dot(nrm));
      if (flow.lengthSq() < 1e-6) flow.set(0, 0, -1).addScaledVector(nrm, -nrm.z);
      flow.normalize();
      const wa = dd.angleTo(whorl);
      if (wa < 0.7) {
        radial.copy(dd).sub(whorl);
        radial.addScaledVector(nrm, -radial.dot(nrm));
        if (radial.lengthSq() > 1e-8) {
          radial.normalize();
          // a gentle spiral around the crown whorl
          radial.applyAxisAngle(nrm, 0.6);
          flow.lerp(radial, 1 - wa / 0.7).normalize();
        }
      }
      flow.x += (rnd() - 0.5) * 0.35; flow.y += (rnd() - 0.5) * 0.35; flow.z += (rnd() - 0.5) * 0.35;
      flow.addScaledVector(nrm, -flow.dot(nrm)).normalize();
      p.toArray(this.roots, i * 3); nrm.toArray(this.normals, i * 3); flow.toArray(this.flows, i * 3);
      for (let k = 0; k < 4; k++) this.rand[i * 4 + k] = rnd();
      const z = zoneOf(dd);
      this.zone[i] = z.id;
      this.zoneIdx[i] = ZONE_KEYS.indexOf(zoneKeyOf(dd));
      dd.toArray(this.dirs, i * 3);
      this.mask[i] = hairMask(dd);
      // Grown-out starting lengths that blend smoothly between the zones.
      const topW = THREE.MathUtils.smoothstep(dd.y, 0.15, 0.65);
      const backW = THREE.MathUtils.smoothstep(-dd.z, 0.2, 0.8);
      let len = THREE.MathUtils.lerp(L.side, L.top, topW);
      len = THREE.MathUtils.lerp(len, THREE.MathUtils.lerp(L.back, L.crown, topW), backW * (1 - topW * 0.5));
      len = THREE.MathUtils.lerp(len, L.nape, THREE.MathUtils.smoothstep(-dd.y, 0.25, 0.65) * backW);
      if (z.id === 'sideburn') len = Math.min(len, 22);
      len *= 0.88 + rnd() * 0.24;
      this.lengths[i] = this.initial[i] = len;
      this.hash[i] = rnd();
    }

    // Ribbon template.
    const tpl = new THREE.InstancedBufferGeometry();
    const aT = [], aSide = [], idx = [];
    for (let s = 0; s <= SEG; s++) { const t = s / SEG; aT.push(t, t); aSide.push(-1, 1); }
    for (let s = 0; s < SEG; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    tpl.setIndex(idx);
    tpl.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(aT.length * 3), 3));
    tpl.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
    tpl.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
    tpl.setAttribute('aRoot', new THREE.InstancedBufferAttribute(this.roots, 3));
    tpl.setAttribute('aNormal', new THREE.InstancedBufferAttribute(this.normals, 3));
    tpl.setAttribute('aFlow', new THREE.InstancedBufferAttribute(this.flows, 3));
    tpl.setAttribute('aRand', new THREE.InstancedBufferAttribute(this.rand, 4));
    this.lenAttr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.lenAttr.setUsage(THREE.DynamicDrawUsage);
    tpl.setAttribute('aLen', this.lenAttr);
    this.targetAttr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    tpl.setAttribute('aTarget', this.targetAttr);
    tpl.setAttribute('aZone', new THREE.InstancedBufferAttribute(this.zoneIdx, 1));
    tpl.instanceCount = n;
    tpl.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.3);

    this.uniforms = {
      uRadii: { value: RADII.clone() },
      uCurlAmp: { value: this.preset.curlAmp }, uCurlFreq: { value: this.preset.curlFreq },
      uWidth: { value: this.preset.width },
      uColor: { value: new THREE.Color(this.preset.color) },
      uKeyDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
      uKeyColor: { value: new THREE.Color(1.7, 1.6, 1.5) },
      uFillDir: { value: new THREE.Vector3(-0.6, 0.3, -0.7).normalize() },
      uFillColor: { value: new THREE.Color(0.7, 0.75, 0.85) },
      uAmbient: { value: new THREE.Color(0.55, 0.55, 0.6) },
      uMapMode: { value: 0 },
      uHighlight: { value: -1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader,
      side: THREE.DoubleSide, alphaToCoverage: true, transparent: false,
    });
    this.mesh = new THREE.Mesh(tpl, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'hair';
    this.mesh.renderOrder = 2;
    this.syncLengths();
  }

  /** Lengths currently drawn: the player's work, or the professional result of the active haircut. */
  get shown() { return this.display === 'pro' && this.proLengths ? this.proLengths : this.lengths; }

  syncLengths() {
    const a = this.lenAttr.array, src = this.shown;
    for (let i = 0; i < this.count; i++) a[i] = src[i] * 0.001;
    this.lenAttr.needsUpdate = true;
    this.scalpDirty = true;
  }

  /** 0 = natural, 1 = length map, 2 = difference from the target (needs a target). */
  setMapMode(mode) { this.uniforms.uMapMode.value = mode === true ? 1 : mode === false ? 0 : mode; }
  highlightZone(key) { this.uniforms.uHighlight.value = key == null ? -1 : ZONE_KEYS.indexOf(key); }

  /**
   * Set the haircut to aim for. fn(dir, i) -> mm. The professional result is the target limited by the hair the
   * client actually has (nobody can make hair longer).
   */
  setTarget(fn) {
    if (!fn) { this.target = this.proLengths = null; this.display = 'mine'; this.syncLengths(); return; }
    const n = this.count, d = new THREE.Vector3();
    this.target = new Float32Array(n);
    this.proLengths = new Float32Array(n);
    const ta = this.targetAttr.array;
    for (let i = 0; i < n; i++) {
      d.fromArray(this.dirs, i * 3);
      const t = Math.max(0, fn(d, i));
      this.target[i] = t;
      this.proLengths[i] = Math.min(t, this.initial[i]);
      ta[i] = this.proLengths[i] * 0.001;
    }
    this.targetAttr.needsUpdate = true;
    this.syncLengths();
  }

  setDisplay(mode) { this.display = mode === 'pro' && this.proLengths ? 'pro' : 'mine'; this.syncLengths(); }

  /**
   * Thinning shears: in the footprint, about `fraction` of the strands are shortened to 45–75% of their length,
   * which removes bulk without changing the outline. Returns cut events like cut().
   */
  thin(point, radius, fraction, stroke, out = []) {
    const r2 = radius * radius, R = this.roots;
    let changed = 0;
    for (let i = 0; i < this.count; i++) {
      const dx = R[i * 3] - point.x, dy = R[i * 3 + 1] - point.y, dz = R[i * 3 + 2] - point.z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      // each strand is picked at most once per stroke (deterministic per stroke id)
      const h = (this.hash[i] * 7.31 + stroke * 0.618) % 1;
      if (h > fraction) continue;
      if (this._thinStroke && this._thinStroke[i] === stroke) continue;
      (this._thinStroke ||= new Int32Array(this.count))[i] = stroke;
      const L = this.lengths[i];
      if (L < 8) continue;
      const nl = L * (0.45 + ((this.hash[i] * 13.7) % 1) * 0.3);
      this.lengths[i] = nl;
      out.push(i, L - nl);
      changed++;
    }
    if (changed) this.syncLengths();
    return out;
  }

  /**
   * Cut every strand whose root lies within `radius` (m) of the head-local point to `targetMM`.
   * The outer 30% of the tool footprint cuts only some strands, like a real blade edge.
   * Returns the cut strands as [index, removedMM, ...] for the falling clippings.
   */
  cut(point, radius, targetMM, out = [], { edge = 0.7, ragged = 0, axis = null, depth = 0 } = {}) {
    const r2 = radius * radius, inner = radius * edge, R = this.roots;
    // With a blade axis the footprint is a strip: `radius` along the blade, `depth` across it (a real blade is a line).
    const ax = axis ? axis.x : 0, ay = axis ? axis.y : 0, az = axis ? axis.z : 0;
    const dInner = depth * edge;
    let changed = 0;
    for (let i = 0; i < this.count; i++) {
      const L = this.lengths[i];
      if (L <= targetMM) continue;
      const dx = R[i * 3] - point.x, dy = R[i * 3 + 1] - point.y, dz = R[i * 3 + 2] - point.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      if (axis) {
        const along = Math.abs(dx * ax + dy * ay + dz * az);
        const across = Math.sqrt(Math.max(0, d2 - along * along));
        if (across > depth) continue;
        // soft blade corners and edge: some strands at the border survive, like a real pass
        const e = Math.max(along > inner ? (along - inner) / (radius - inner) : 0, across > dInner ? (across - dInner) / (depth - dInner) : 0);
        if (e > 0 && this.hash[i] > 1 - e) continue;
      } else {
        const dist = Math.sqrt(d2);
        if (dist > inner && this.hash[i] > 1 - (dist - inner) / (radius - inner)) continue;
      }
      // point cutting leaves the ends slightly uneven (soft, textured line)
      const t = ragged ? targetMM * (1 - ragged * ((this.hash[i] * 5.77) % 1)) : targetMM;
      if (L <= t) continue;
      this.lengths[i] = t;
      out.push(i, L - t);
      changed++;
    }
    if (changed) this.syncLengths();
    return out;
  }

  /** Average length (mm) of strands within `radius` of a head-local point, or null if there is no hair there. */
  sampleLength(point, radius = 0.008) {
    const r2 = radius * radius, R = this.roots;
    let sum = 0, n = 0;
    for (let i = 0; i < this.count; i++) {
      const dx = R[i * 3] - point.x, dy = R[i * 3 + 1] - point.y, dz = R[i * 3 + 2] - point.z;
      if (dx * dx + dy * dy + dz * dz < r2) { sum += this.lengths[i]; n++; }
    }
    return n ? sum / n : null;
  }

  /** Approximate head-local position of a point `mm` along strand i (for spawning clippings). */
  strandPoint(i, mm, out) {
    const k = i * 3, s = mm * 0.001;
    const stand = mm < 10 ? 0.85 : 0.3;
    out.set(
      this.roots[k] + (this.normals[k] * stand + this.flows[k] * (1 - stand)) * s,
      this.roots[k + 1] + (this.normals[k + 1] * stand + this.flows[k + 1] * (1 - stand)) * s,
      this.roots[k + 2] + (this.normals[k + 2] * stand + this.flows[k + 2] * (1 - stand)) * s,
    );
    const q = Math.hypot(out.x / RADII.x, out.y / RADII.y, out.z / RADII.z);
    const minR = 1 + (0.001 + s * 0.15) / 0.09;
    if (q < minR) out.set(out.x / q * minR, out.y / q * minR, out.z / q * minR);
    return out;
  }

  /**
   * Prepare scalp shading: each scalp vertex of the head mesh gets the strands around it, so short hair darkens
   * the skin like real stubble and a fade shows as a smooth gradient from skin to hair.
   */
  bindScalp(geometry, baseColors) {
    const pos = geometry.attributes.position, n = pos.count;
    const cell = 0.007, grid = new Map(), R = this.roots;
    const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (let i = 0; i < this.count; i++) {
      const k = key(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]);
      let arr = grid.get(k); if (!arr) grid.set(k, arr = []); arr.push(i);
    }
    const verts = [], starts = [0], list = [], masks = [];
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    for (let v = 0; v < n; v++) {
      p.fromBufferAttribute(pos, v);
      d.set(p.x / RADII.x, p.y / RADII.y, p.z / RADII.z);
      const q = d.length();
      if (q < 0.97 || q > 1.03) continue;
      d.divideScalar(q);
      const m = hairMask(d);
      if (m <= 0.001) continue;
      const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
      for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) for (let iz = -1; iz <= 1; iz++) {
        const arr = grid.get(`${cx + ix},${cy + iy},${cz + iz}`);
        if (!arr) continue;
        for (const i of arr) {
          const dx = R[i * 3] - p.x, dy = R[i * 3 + 1] - p.y, dz = R[i * 3 + 2] - p.z;
          if (dx * dx + dy * dy + dz * dz < cell * cell) list.push(i);
        }
      }
      verts.push(v); masks.push(m); starts.push(list.length);
    }
    this.scalp = {
      geometry, base: baseColors, verts: Int32Array.from(verts), starts: Int32Array.from(starts),
      list: Int32Array.from(list), mask: Float32Array.from(masks),
    };
    this.scalpDirty = true;
    this.updateScalp();
  }

  updateScalp() {
    if (!this.scalp || !this.scalpDirty) return;
    this.scalpDirty = false;
    const { geometry, base, verts, starts, list, mask } = this.scalp;
    const col = geometry.attributes.color.array;
    const hc = this.uniforms.uColor.value, lengths = this.shown;
    for (let j = 0; j < verts.length; j++) {
      let sum = 0, cnt = 0;
      for (let k = starts[j]; k < starts[j + 1]; k++) { sum += lengths[list[k]]; cnt++; }
      const avg = cnt ? sum / cnt : 0;
      const dark = avg <= 0.05 ? 0 : (0.18 + 0.77 * (1 - Math.exp(-avg / 1.3))) * mask[j];
      const v = verts[j] * 3;
      // stubble reads slightly blue-grey on skin, full hair reads as the hair colour
      const sr = hc.r * 0.85 + base[v] * 0.15, sg = hc.g * 0.85 + base[v + 1] * 0.15, sb = hc.b * 0.9 + base[v + 2] * 0.18;
      col[v] = base[v] + (sr - base[v]) * dark;
      col[v + 1] = base[v + 1] + (sg - base[v + 1]) * dark;
      col[v + 2] = base[v + 2] + (sb - base[v + 2]) * dark;
    }
    geometry.attributes.color.needsUpdate = true;
  }

  /** Lengths as a compact base64 string (0.1 mm steps). */
  serialize() {
    const u = new Uint16Array(this.count);
    for (let i = 0; i < this.count; i++) u[i] = Math.round(Math.min(this.lengths[i], 6500) * 10);
    let s = '';
    const b = new Uint8Array(u.buffer);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }

  deserialize(str) {
    try {
      const bin = atob(str);
      if (bin.length !== this.count * 2) return false;
      const b = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
      const u = new Uint16Array(b.buffer);
      for (let i = 0; i < this.count; i++) this.lengths[i] = u[i] / 10;
      this.syncLengths();
      return true;
    } catch { return false; }
  }

  /** Median length (mm) of the strands of one zone key. */
  zoneMedian(key, src = this.lengths) {
    const idx = ZONE_KEYS.indexOf(key), a = [];
    for (let i = 0; i < this.count; i++) if (this.zoneIdx[i] === idx) a.push(src[i]);
    if (!a.length) return null;
    a.sort((x, y) => x - y);
    return a[a.length >> 1];
  }

  snapshot() { return this.lengths.slice(); }
  restore(snap) { this.lengths.set(snap); this.syncLengths(); }
  regrow() { this.lengths.set(this.initial); this.syncLengths(); }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
