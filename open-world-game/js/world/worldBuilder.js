// Shared materials for the streamed world.
import * as THREE from 'three';
import * as T from './textures.js';

export function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const m = {
    road: std({ map: T.getRoad(), roughness: 0.82, bumpMap: T.bumpOf(T.getRoad()), bumpScale: 0.8 }),
    asphalt: std({ map: T.getAsphalt(), roughness: 0.85, bumpMap: T.bumpOf(T.getAsphalt()), bumpScale: 0.8 }),
    cross: std({ map: T.getCrosswalk(), transparent: true, alphaTest: 0.3, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    tiles: std({ map: T.getTiles(), vertexColors: true, bumpMap: T.bumpOf(T.getTiles()), bumpScale: 1.4, roughness: 0.78 }),
    grass: std({ map: T.getGrass(), roughness: 1 }),
    field: std({ map: T.getField(), roughness: 1 }),
    sand: std({ map: T.getSand(), roughness: 1 }),
    plaza: std({ map: T.getPlaza(), vertexColors: true, bumpMap: T.bumpOf(T.getPlaza()), bumpScale: 1.4, roughness: 0.75 }),
    lot: std({ map: T.getAsphalt(), vertexColors: true }),
    curb: std({ color: 0xb9b5ad }),
    water: new THREE.MeshStandardMaterial({ map: T.getWaterNormalish(), color: 0x7fb6cf, roughness: 0.12, metalness: 0.35 }),
    roof: std({ map: T.getRoof(), vertexColors: true }),
    houseRoof: std({ map: T.getHouseRoof(), vertexColors: true, roughness: 0.75 }),
    props: std({ vertexColors: true, roughness: 0.8 }),
    interior: std({ vertexColors: true, roughness: 0.9 }),
    rock: std({ map: T.getRock(), vertexColors: true, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfd9e6, transparent: true, opacity: 0.35, roughness: 0.03, metalness: 0.6, envMapIntensity: 1.3, depthWrite: false }),
    metal: std({ color: 0x4a4f55, metalness: 0.6, roughness: 0.4 }),
    signs: new THREE.MeshStandardMaterial({ map: T.getSignAtlas(), roughness: 0.6, emissive: 0xffffff, emissiveMap: T.getSignAtlas(), emissiveIntensity: 0.15 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe2a8, emissiveIntensity: 0.6 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    far: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  for (const s of ['glass', 'office', 'concrete', 'plaster', 'brick', 'industrial', 'storefront']) {
    const glass = s === 'glass';
    // roughness / metalness per pixel: window glass is smooth and reflects the city and sky, walls stay matte
    m['f_' + s] = std({ map: T.getFacade(s), vertexColors: true, roughness: 1, metalness: 1, roughnessMap: T.getFacadeRM(s), metalnessMap: T.getFacadeRM(s),
      bumpMap: T.getFacadeBump(s), bumpScale: glass ? 0.6 : 1.6, envMapIntensity: glass ? 1.25 : 1.0,
      emissive: 0xffffff, emissiveMap: T.getFacadeLit(s), emissiveIntensity: 0 });
  }
  // break up texture tiling: a large-scale world-space noise varies brightness/tint (worn, dirty and sun-bleached
  // patches) so no two stretches of street, plaza or wall look identical
  for (const k of ['road', 'asphalt', 'tiles', 'grass', 'field', 'sand', 'plaza', 'lot', 'roof', 'rock']) weather(m[k], 0.045, 0.32);
  for (const s of ['glass', 'office', 'concrete', 'plaster', 'brick', 'industrial', 'storefront']) weather(m['f_' + s], 0.03, s === 'glass' ? 0.08 : 0.22);
  return m;
}

function weather(mat, freq, amount) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.wFreq = { value: freq }; sh.uniforms.wAmt = { value: amount };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPos; uniform float wFreq, wAmt;
      float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec2 q = vWPos.xz + vWPos.y * 0.37;
        float n = wNoise(q * wFreq) * 0.6 + wNoise(q * wFreq * 3.7) * 0.3 + wNoise(q * wFreq * 11.0) * 0.1;
        diffuseColor.rgb *= 1.0 - wAmt * 0.5 + n * wAmt;                      // brighter / darker patches
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.04, 1.0, 0.93), smoothstep(0.55, 0.9, n) * wAmt * 2.0); }   // warm grime`);
  };
  mat.customProgramCacheKey = () => 'weather' + freq + amount;
}
