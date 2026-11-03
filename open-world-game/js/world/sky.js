// Sky dome, sun, ambient light, shadows that follow the player, and an environment map for reflections.
// (Stage 7 will animate time of day and weather; here the lighting is a clear afternoon.)
import * as THREE from 'three';

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    const skyGeo = new THREE.SphereGeometry(1800, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3d7fd6) }, horizon: { value: new THREE.Color(0xcfe3f2) },
        sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() }, sunColor: { value: new THREE.Color(0xfff2d0) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -0.1, 1.0); vec3 c = mix(horizon, top, pow(max(h,0.0), 0.55));
        float s = max(dot(normalize(vDir), sunDir), 0.0); c += sunColor * (pow(s, 600.0) * 2.5 + pow(s, 8.0) * 0.25);
        gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6b6250, 1.1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.45, 0.75, 0.35).normalize();
    this.skyMat.uniforms.sunDir.value.copy(this.sunDir);
    scene.fog = new THREE.Fog(0xcfe3f2, 150, 520);
    this._buildEnvMap();
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
    const size = q === 'high' ? 2048 : 1024;
    this.sun.castShadow = q !== 'low';
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    const far = q === 'low' ? 300 : q === 'medium' ? 430 : 560;
    this.scene.fog.far = far; this.scene.fog.near = far * 0.3;
  }

  update(focus) {
    // keep shadow camera centered on the player, snapped to texels to avoid shimmering
    const d = this.sunDir;
    const snap = 0.5;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.position.set(fx + d.x * 200, focus.y + d.y * 200, fz + d.z * 200);
    this.sun.target.position.set(fx, focus.y, fz);
    this.sky.position.copy(focus);
  }
}
