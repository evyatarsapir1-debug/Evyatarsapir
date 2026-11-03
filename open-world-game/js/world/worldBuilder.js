// Shared materials for the streamed world.
import * as THREE from 'three';
import * as T from './textures.js';

export function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const m = {
    road: std({ map: T.getRoad(), roughness: 0.9 }),
    asphalt: std({ map: T.getAsphalt(), roughness: 0.92 }),
    cross: std({ map: T.getCrosswalk(), transparent: true, alphaTest: 0.3, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    tiles: std({ map: T.getTiles(), vertexColors: true }),
    grass: std({ map: T.getGrass(), roughness: 1 }),
    field: std({ map: T.getField(), roughness: 1 }),
    sand: std({ map: T.getSand(), roughness: 1 }),
    plaza: std({ map: T.getPlaza(), vertexColors: true }),
    lot: std({ map: T.getAsphalt(), vertexColors: true }),
    curb: std({ color: 0xb9b5ad }),
    water: new THREE.MeshStandardMaterial({ map: T.getWaterNormalish(), color: 0x7fb6cf, roughness: 0.12, metalness: 0.35 }),
    roof: std({ map: T.getRoof(), vertexColors: true }),
    houseRoof: std({ map: T.getHouseRoof(), vertexColors: true, roughness: 0.75 }),
    props: std({ vertexColors: true, roughness: 0.8 }),
    interior: std({ vertexColors: true, roughness: 0.9 }),
    rock: std({ map: T.getRock(), vertexColors: true, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfd9e6, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3, depthWrite: false }),
    metal: std({ color: 0x4a4f55, metalness: 0.6, roughness: 0.4 }),
    signs: new THREE.MeshStandardMaterial({ map: T.getSignAtlas(), roughness: 0.6, emissive: 0xffffff, emissiveMap: T.getSignAtlas(), emissiveIntensity: 0.15 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe2a8, emissiveIntensity: 0.6 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    far: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  for (const s of ['glass', 'office', 'concrete', 'plaster', 'brick', 'industrial', 'storefront']) {
    const glass = s === 'glass';
    m['f_' + s] = std({ map: T.getFacade(s), vertexColors: true, roughness: glass ? 0.25 : 0.8, metalness: glass ? 0.45 : 0.05, envMapIntensity: glass ? 1.2 : 0.6,
      emissive: 0xffffff, emissiveMap: T.getFacadeLit(s), emissiveIntensity: 0 });
  }
  return m;
}
