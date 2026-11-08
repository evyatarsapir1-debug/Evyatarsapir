// Cinematic post-processing (medium / high quality): HDR render -> ambient occlusion -> bloom (lights, neon, sun glints) ->
// filmic tone mapping -> colour grading (contrast, saturation, time-of-day tint) + vignette.
// Low quality renders straight to the screen, exactly as before.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Screen-space ambient occlusion (medium / high): corners, the gap under cars, where walls meet the street and
// between buildings get the soft contact shadow real light gives them. Computed at half resolution from the depth
// buffer, then blurred with a depth-aware filter and multiplied into the HDR image before bloom.
const AO_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const AOShader = (samples) => ({
  uniforms: { tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, p11: { value: 1 }, radius: { value: 1.5 }, intensity: { value: 1.3 }, aspect: { value: 1 }, texel: { value: 0.001 } },
  vertexShader: AO_VERT,
  fragmentShader: `
    uniform sampler2D tDepth; uniform mat4 projInv; uniform float p11, radius, intensity, aspect, texel; varying vec2 vUv;
    vec3 vpos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 v = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
    float hash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main() {
      float d = texture2D(tDepth, vUv).x;
      if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 P = vpos(vUv);
      // normal from the neighbour on each axis with the smaller depth jump (stable at edges, unlike dFdx)
      vec2 px = vec2(1.0 / aspect, 1.0) * texel;
      vec3 l = vpos(vUv - vec2(px.x, 0.0)), r = vpos(vUv + vec2(px.x, 0.0)), dn = vpos(vUv - vec2(0.0, px.y)), up = vpos(vUv + vec2(0.0, px.y));
      vec3 dx = abs(r.z - P.z) < abs(P.z - l.z) ? r - P : P - l;
      vec3 dy = abs(up.z - P.z) < abs(P.z - dn.z) ? up - P : P - dn;
      vec3 cr = cross(dx, dy); float cl = length(cr);
      vec3 N = cl > 1e-12 ? cr / cl : vec3(0.0, 0.0, 1.0);
      float rs = radius * p11 * 0.5 / max(-P.z, 0.5);          // world radius -> screen (uv) radius
      rs = min(rs, 0.12);
      float a0 = hash(gl_FragCoord.xy) * 6.2831853, occ = 0.0;
      for (int i = 0; i < ${samples}; i++) {
        float t = (float(i) + 0.5) / float(${samples});
        float a = a0 + t * 37.699;                              // golden-angle spiral
        vec2 off = vec2(cos(a) / aspect, sin(a)) * rs * t;
        vec2 suv = vUv + off;
        if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;   // off-screen: no information
        vec3 v = vpos(suv) - P;
        float vv = dot(v, v), vn = dot(v, N);
        float fall = clamp(1.0 - vv / (radius * radius * 4.0), 0.0, 1.0);
        occ += max(0.0, vn - 0.02 - 0.025 * -P.z) / (vv + 0.1) * fall;   // depth-scaled bias: flat walls never self-shadow
      }
      float ao = clamp(1.0 - intensity * occ * 1.6 / float(${samples}), 0.0, 1.0);
      ao = mix(ao, 1.0, smoothstep(70.0, 170.0, -P.z));          // fade out in the distance (fog takes over)
      if (!(ao >= 0.0 && ao <= 1.0)) ao = 1.0;                    // never let a bad sample (NaN) through: bloom would spread it
      gl_FragColor = vec4(ao, -P.z, 0.0, 1.0);
    }`,
});
const AOComposite = {
  uniforms: { tDiffuse: { value: null }, tAO: { value: null }, texel: { value: new THREE.Vector2() }, strength: { value: 0.85 } },
  vertexShader: AO_VERT,
  fragmentShader: `
    uniform sampler2D tDiffuse, tAO; uniform vec2 texel; uniform float strength; varying vec2 vUv;
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      col.rgb = min(max(col.rgb, vec3(0.0)), vec3(60000.0));     // scrub NaN/inf pixels before bloom can spread them
      vec2 c = texture2D(tAO, vUv).xy;
      float sum = 0.0, wsum = 0.0;
      for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
        vec2 s = texture2D(tAO, vUv + vec2(float(x), float(y)) * texel).xy;
        float w = 1.0 / (1.0 + abs(s.y - c.y) * 4.0 / max(c.y, 1.0) * 10.0);   // don't blur across depth edges
        if (s.x >= 0.0 && s.x <= 1.0 && w > 0.0) { sum += s.x * w; wsum += w; }
      }
      float ao = wsum > 0.0 ? sum / wsum : 1.0;
      gl_FragColor = vec4(col.rgb * mix(1.0, ao, strength), col.a);
    }`,
};
class AOPass extends Pass {
  constructor(camera, samples) {
    super();
    this.camera = camera;
    // full-screen passes must not depth-test, or stale pixels (even uninitialised NaNs) leak through
    this.aoMat = new THREE.ShaderMaterial({ ...AOShader(samples), depthTest: false, depthWrite: false });
    this.compMat = new THREE.ShaderMaterial({ ...AOComposite, uniforms: THREE.UniformsUtils.clone(AOComposite.uniforms), depthTest: false, depthWrite: false });
    this.aoQuad = new FullScreenQuad(this.aoMat); this.compQuad = new FullScreenQuad(this.compMat);
    this.aoRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }
  setSize(w, h) {
    this.aoRT.setSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    this.compMat.uniforms.texel.value.set(2 / w, 2 / h);
    this.aoMat.uniforms.aspect.value = w / h; this.aoMat.uniforms.texel.value = 1 / h;
  }
  render(renderer, writeBuffer, readBuffer) {
    const U = this.aoMat.uniforms;
    U.tDepth.value = readBuffer.depthTexture;
    U.projInv.value.copy(this.camera.projectionMatrixInverse);
    U.p11.value = this.camera.projectionMatrix.elements[5];
    renderer.setRenderTarget(this.aoRT); this.aoQuad.render(renderer);
    this.compMat.uniforms.tDiffuse.value = readBuffer.texture; this.compMat.uniforms.tAO.value = this.aoRT.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.compQuad.render(renderer);
  }
  dispose() { this.aoRT.dispose(); this.aoMat.dispose(); this.compMat.dispose(); this.aoQuad.dispose(); this.compQuad.dispose(); }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, contrast: { value: 1.08 }, saturation: { value: 1.15 },
    tint: { value: new THREE.Vector3(1.02, 1.0, 0.97) }, vignette: { value: 0.25 }, lift: { value: 0.0 }, grain: { value: 0.025 }, seed: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float contrast, saturation, vignette, lift, grain, seed; uniform vec3 tint; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      col = (col - 0.5) * contrast + 0.5 + lift;                         // punchier contrast
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);                                // richer colours
      col *= tint;                                                        // warm day / golden hour / cool night
      vec2 d = vUv - 0.5; d.x *= 1.15;
      col *= mix(1.0 - vignette, 1.0, smoothstep(0.78, 0.22, length(d))); // soft vignette
      float gr = fract(sin(dot(vUv * 1000.0 + seed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      col += gr * grain * (1.0 - dot(col, vec3(0.33)) * 0.6);          // fine film grain, mostly in the darks
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.enabled = false; this.composer = null;
  }
  setQuality(q) {
    const want = q === 'medium' || q === 'high';
    if (want && !this.composer) this._build(q);
    if (this.composer && this.q !== q) this._build(q);
    this.enabled = want; this.q = q;
  }
  _build(q) {
    this.composer?.dispose?.();
    const r = this.renderer, size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 2 });
    rt.depthTexture = new THREE.DepthTexture(size.x * pr, size.y * pr); rt.depthTexture.type = THREE.FloatType;
    const c = new EffectComposer(r, rt);
    // the composer clones the target; the clone must get its OWN depth texture (a shared one corrupts the render)
    c.renderTarget2.depthTexture = new THREE.DepthTexture(size.x * pr, size.y * pr); c.renderTarget2.depthTexture.type = THREE.FloatType;
    c.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new AOPass(this.camera, q === 'high' ? 14 : 9);
    c.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.55, 0.9);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    this.composer = c; this.q = q;
  }
  setSize(w, h) { if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); } }
  // L: lighting state from the environment (night 0..1, wet 0..1, hour)
  update(L, hour) {
    if (!this.enabled) return;
    const n = L.night || 0, wet = L.wet || 0;
    const golden = Math.max(0, 1 - Math.abs(hour - 18.5) / 1.6) + Math.max(0, 1 - Math.abs(hour - 6.3) / 1.2);
    this.bloom.strength = 0.3 + golden * 0.25 + n * 0.32;
    this.bloom.threshold = 0.95 - golden * 0.1 - n * 0.2;
    this.bloom.radius = 0.42 + n * 0.12;
    const U = this.grade.uniforms;
    U.contrast.value = 1.12 + n * 0.04 - wet * 0.04;
    U.saturation.value = 1.26 - n * 0.14 - wet * 0.14;
    U.tint.value.set(1.035 + golden * 0.08 - n * 0.09, 1.01 + golden * 0.01 - n * 0.03, 0.96 - golden * 0.09 + n * 0.11);
    U.vignette.value = 0.22 + n * 0.15;
    U.seed.value = (U.seed.value + 7.31) % 100;
    U.grain.value = 0.02 + n * 0.02;
    if (this.ao) this.ao.compMat.uniforms.strength.value = 0.8 - n * 0.35;   // softer at night (less ambient light to block)
  }
  render() {
    if (this.enabled && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
