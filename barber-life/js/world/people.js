// Low-poly people for the city: the player and the residents. Built from shared geometries so dozens stay cheap.
import * as THREE from 'three';

const G = {
  torso: new THREE.CapsuleGeometry(0.2, 0.42, 4, 10),
  head: new THREE.SphereGeometry(0.15, 16, 12),
  hair: new THREE.SphereGeometry(0.158, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  arm: new THREE.CapsuleGeometry(0.06, 0.48, 4, 8),
  leg: new THREE.CapsuleGeometry(0.08, 0.6, 4, 8),
  shoe: new THREE.BoxGeometry(0.13, 0.08, 0.26),
  apron: new THREE.BoxGeometry(0.36, 0.55, 0.03),
  eye: new THREE.SphereGeometry(0.018, 8, 6),
};
// arm/leg pivots at the top
G.arm.translate(0, -0.3, 0);
G.leg.translate(0, -0.38, 0);
const matCache = new Map();
function mat(color, rough = 0.75) {
  const k = color + rough;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  return matCache.get(k);
}

export const SKINS = ['#e2b08c', '#c98e66', '#8d5a3b', '#f0c7a4', '#a8714c'];
export const HAIRS = ['#2e2018', '#5a3d26', '#151010', '#b8925a', '#8a4a22', '#8d8a86'];
export const CLOTHES = ['#1f3f8f', '#7a2b2b', '#2f6b35', '#c9a45c', '#e9e5dc', '#141414', '#5a4636', '#3b1f2b', '#2a6f8a', '#8a5a2b'];

/** Builds a person. look: { skin, hair, shirt, pants, shoes, apron } */
export function buildPerson(look = {}) {
  const p = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.98;
  p.add(body);
  const parts = {};
  parts.torso = new THREE.Mesh(G.torso, mat(look.shirt || '#1f3f8f'));
  parts.torso.position.y = 0.32;
  body.add(parts.torso);
  const headG = new THREE.Group();
  headG.position.y = 0.86;
  body.add(headG);
  parts.head = new THREE.Mesh(G.head, mat(look.skin || SKINS[0], 0.6));
  headG.add(parts.head);
  parts.hair = new THREE.Mesh(G.hair, mat(look.hair || HAIRS[0], 0.9));
  parts.hair.position.y = 0.02; parts.hair.rotation.x = -0.25;
  headG.add(parts.hair);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(G.eye, mat('#111', 0.3));
    e.position.set(sx * 0.05, 0.02, 0.135);
    headG.add(e);
  }
  parts.armL = new THREE.Mesh(G.arm, mat(look.shirt || '#1f3f8f'));
  parts.armR = new THREE.Mesh(G.arm, mat(look.shirt || '#1f3f8f'));
  parts.armL.position.set(0.27, 0.66, 0); parts.armR.position.set(-0.27, 0.66, 0);
  body.add(parts.armL, parts.armR);
  parts.legL = new THREE.Group(); parts.legR = new THREE.Group();
  for (const [lg, sx] of [[parts.legL, 1], [parts.legR, -1]]) {
    lg.position.set(sx * 0.11, 0.02, 0);
    const leg = new THREE.Mesh(G.leg, mat(look.pants || '#2b2f38'));
    const shoe = new THREE.Mesh(G.shoe, mat(look.shoes || '#3a2216', 0.4));
    shoe.position.set(0, -0.92, 0.05);
    lg.add(leg, shoe);
    lg.userData.leg = leg; lg.userData.shoe = shoe;
    body.add(lg);
  }
  parts.apron = new THREE.Mesh(G.apron, mat(look.apron || '#141414'));
  parts.apron.position.set(0, 0.18, 0.2);
  parts.apron.visible = !!look.apron;
  body.add(parts.apron);
  p.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  p.userData = { parts, body, headG, phase: Math.random() * 6, look: { ...look } };
  return p;
}

/** Recolour a person (clothes shop). */
export function dressPerson(p, look) {
  const { parts } = p.userData;
  Object.assign(p.userData.look, look);
  const L = p.userData.look;
  parts.torso.material = parts.armL.material = parts.armR.material = mat(L.shirt);
  parts.legL.userData.leg.material = parts.legR.userData.leg.material = mat(L.pants);
  parts.legL.userData.shoe.material = parts.legR.userData.shoe.material = mat(L.shoes, 0.4);
  parts.hair.material = mat(L.hair, 0.9);
  parts.head.material = mat(L.skin, 0.6);
  parts.apron.visible = !!L.apron;
  if (L.apron) parts.apron.material = mat(L.apron);
}

/** Walk / idle / sit animation. speed in m/s. */
export function animatePerson(p, dt, speed, sitting = false) {
  const u = p.userData;
  const { parts, body } = u;
  if (sitting) {
    body.position.y = 0.55;
    parts.legL.rotation.x = parts.legR.rotation.x = -1.45;
    parts.armL.rotation.x = parts.armR.rotation.x = -0.5;
    return;
  }
  body.position.y = 0.98;
  u.phase += dt * (2 + speed * 2.2);
  const a = Math.min(1, speed / 1.4) * 0.6;
  const s = Math.sin(u.phase);
  parts.legL.rotation.x = s * a; parts.legR.rotation.x = -s * a;
  parts.armL.rotation.x = -s * a * 0.8; parts.armR.rotation.x = s * a * 0.8;
  body.position.y = 0.98 + Math.abs(Math.cos(u.phase)) * 0.03 * Math.min(1, speed);
}

export function randomLook(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  return { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(CLOTHES), pants: pick(['#2b2f38', '#3a2a20', '#141414', '#4a4f5a', '#6b5a44']), shoes: pick(['#3a2216', '#141414', '#e9e5dc']) };
}
