// Cinematic post-processing (medium / high quality): HDR render -> bloom (lights, neon, sun glints) ->
// filmic tone mapping -> colour grading (contrast, saturation, time-of-day tint) + vignette.
// Low quality renders straight to the screen, exactly as before.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, contrast: { value: 1.08 }, saturation: { value: 1.15 },
    tint: { value: new THREE.Vector3(1.02, 1.0, 0.97) }, vignette: { value: 0.25 }, lift: { value: 0.0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float contrast, saturation, vignette, lift; uniform vec3 tint; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      col = (col - 0.5) * contrast + 0.5 + lift;                         // punchier contrast
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);                                // richer colours
      col *= tint;                                                        // warm day / golden hour / cool night
      vec2 d = vUv - 0.5; d.x *= 1.15;
      col *= mix(1.0 - vignette, 1.0, smoothstep(0.78, 0.22, length(d))); // soft vignette
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
    const c = new EffectComposer(r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
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
  }
  render() {
    if (this.enabled && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
