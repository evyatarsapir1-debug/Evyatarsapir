// A layer of puffy cumulus clouds high above the city (about 330-520 m). From the street they are just the sky; from a
// helicopter or while skydiving you fly over and through them: soft white heaps, lit on top and grey underneath, the
// ground showing through the gaps far below. One draw call: every puff is a camera-facing soft disc (instanced), the
// field wraps around the camera so it never ends.
import * as THREE from 'three';

const TILE = 4200;   // the field repeats every TILE metres (wrapped in the shader around the camera)

function puffTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  // a soft round puff built from many overlapping blobs (not a perfect circle)
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * S * 0.2, px = S / 2 + Math.cos(a) * r, py = S / 2 + Math.sin(a) * r, rad = S * (0.16 + Math.random() * 0.16);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Clouds {
  constructor(scene) {
    const rand = (a, b) => a + Math.random() * (b - a);
    const offs = [], sizes = [], shades = [];
    // cloud heaps: each one a cluster of puffs, flat-bottomed and domed on top like real cumulus
    for (let c = 0; c < 85; c++) {
      const cx = rand(0, TILE), cz = rand(0, TILE), base = rand(330, 420), w = rand(60, 170), n = 7 + Math.floor(w / 18);
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * w, dome = 1 - (r / w) ** 2;
        const s = rand(38, 70) * (0.6 + dome * 0.6);
        const y = base + dome * rand(20, 70) + rand(0, 12);
        offs.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r * 0.75);
        sizes.push(s); shades.push(Math.min(1, 0.62 + (y - base) / 110));
      }
    }
    const n = sizes.length, geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(offs), 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
    geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(new Float32Array(shades), 1));
    geo.instanceCount = n;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { map: { value: puffTexture() }, cam: { value: new THREE.Vector3() }, opacity: { value: 0 }, light: { value: new THREE.Color(1, 1, 1) }, shadow: { value: new THREE.Color(0.62, 0.66, 0.74) }, haze: { value: new THREE.Color(0.8, 0.86, 0.92) }, hazeFar: { value: 2600 } },
      vertexShader: `
        attribute vec3 aOff; attribute float aSize; attribute float aShade;
        uniform vec3 cam; varying vec2 vUv; varying float vShade; varying float vDist;
        void main() {
          vec3 p = aOff; p.xz = cam.xz + mod(aOff.xz - cam.xz + ${TILE / 2}.0, ${TILE}.0) - ${TILE / 2}.0;   // endless field around you
          vec4 mv = viewMatrix * vec4(p, 1.0);
          mv.xy += position.xy * aSize;
          vUv = uv; vShade = aShade; vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform float opacity, hazeFar; uniform vec3 light, shadow, haze;
        varying vec2 vUv; varying float vShade; varying float vDist;
        void main() {
          vec4 t = texture2D(map, vUv);
          float a = t.a * opacity * smoothstep(8.0, 60.0, vDist);             // fade out right in front of the lens (flying through)
          if (a < 0.01) discard;
          vec3 col = mix(shadow, light, vShade * (0.75 + 0.25 * vUv.y));
          col = mix(col, haze, smoothstep(hazeFar * 0.35, hazeFar, vDist));     // far clouds melt into the haze
          gl_FragColor = vec4(col, a * (1.0 - smoothstep(hazeFar * 0.8, hazeFar * 1.1, vDist)));
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.visible = false;
    scene.add(this.mesh);
  }
  // camera: the game camera; env: day / night state for the colours
  update(camera, env) {
    const h = camera.position.y;
    // they only show once you are up in the air (from the street the sky dome already has its clouds)
    const k = Math.min(1, Math.max(0, (h - 90) / 140));
    this.mesh.visible = k > 0.01;
    if (!this.mesh.visible) return;
    const U = this.mat.uniforms, day = 1 - (env?.night ?? 0);
    U.cam.value.copy(camera.position); U.opacity.value = k * (0.35 + 0.6 * day);
    U.light.value.setRGB(0.25 + 0.75 * day, 0.27 + 0.73 * day, 0.32 + 0.68 * day);
    U.shadow.value.setRGB(0.12 + 0.5 * day, 0.13 + 0.53 * day, 0.18 + 0.56 * day);
    if (env?.scene?.fog) U.haze.value.copy(env.scene.fog.color);
    U.hazeFar.value = Math.max(1800, (env?.fogFar || 1200) * 1.6);
  }
}
