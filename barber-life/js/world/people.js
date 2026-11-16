// Low-poly people for the city: the player and the residents. Built from shared geometries so dozens stay cheap.
// Jointed limbs (hips/knees, shoulders/elbows) so walking, running, jumping, sitting, cutting hair and paying
// look natural. animatePerson() blends smoothly between poses.
import * as THREE from 'three';

const G = {
  torso: new THREE.CapsuleGeometry(0.2, 0.42, 4, 10),
  hips: new THREE.CapsuleGeometry(0.17, 0.08, 4, 10),
  head: new THREE.SphereGeometry(0.15, 16, 12),
  hair: new THREE.SphereGeometry(0.158, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  nose: new THREE.ConeGeometry(0.022, 0.05, 6),
  upperArm: new THREE.CapsuleGeometry(0.062, 0.22, 4, 8),
  foreArm: new THREE.CapsuleGeometry(0.055, 0.2, 4, 8),
  hand: new THREE.SphereGeometry(0.055, 8, 6),
  thigh: new THREE.CapsuleGeometry(0.085, 0.3, 4, 8),
  shin: new THREE.CapsuleGeometry(0.075, 0.3, 4, 8),
  shoe: new THREE.BoxGeometry(0.13, 0.08, 0.26),
  apron: new THREE.BoxGeometry(0.36, 0.55, 0.03),
  eye: new THREE.SphereGeometry(0.018, 8, 6),
  tool: new THREE.BoxGeometry(0.03, 0.12, 0.04),
};
// limb pivots at the top
G.upperArm.translate(0, -0.15, 0);
G.foreArm.translate(0, -0.13, 0);
G.thigh.translate(0, -0.19, 0);
G.shin.translate(0, -0.19, 0);
G.nose.rotateX(Math.PI / 2);
const matCache = new Map();
function mat(color, rough = 0.75) {
  const k = color + rough;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  return matCache.get(k);
}

export const SKINS = ['#e2b08c', '#c98e66', '#8d5a3b', '#f0c7a4', '#a8714c'];
export const HAIRS = ['#2e2018', '#5a3d26', '#151010', '#b8925a', '#8a4a22', '#8d8a86'];
export const CLOTHES = ['#1f3f8f', '#7a2b2b', '#2f6b35', '#c9a45c', '#e9e5dc', '#141414', '#5a4636', '#3b1f2b', '#2a6f8a', '#8a5a2b'];

function limb(upperGeo, lowerGeo, upperMat, lowerMat, lowerY) {
  const top = new THREE.Group();
  const upper = new THREE.Mesh(upperGeo, upperMat);
  const joint = new THREE.Group(); joint.position.y = lowerY;
  const lower = new THREE.Mesh(lowerGeo, lowerMat);
  joint.add(lower);
  top.add(upper, joint);
  top.userData = { upper, joint, lower };
  return top;
}

/** Builds a person. look: { skin, hair, shirt, pants, shoes, apron } */
export function buildPerson(look = {}) {
  const p = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.98;
  p.add(body);
  const parts = {};
  const shirt = mat(look.shirt || '#1f3f8f'), pants = mat(look.pants || '#2b2f38'), skin = mat(look.skin || SKINS[0], 0.6);
  // upper body pivots at the waist so it can lean when running
  const chest = new THREE.Group(); chest.position.y = 0.05; body.add(chest);
  parts.chest = chest;
  parts.torso = new THREE.Mesh(G.torso, shirt); parts.torso.position.y = 0.27; chest.add(parts.torso);
  parts.hips = new THREE.Mesh(G.hips, pants); parts.hips.position.y = 0.0; body.add(parts.hips);
  const headG = new THREE.Group(); headG.position.y = 0.81; chest.add(headG);
  parts.head = new THREE.Mesh(G.head, skin); headG.add(parts.head);
  parts.hair = new THREE.Mesh(G.hair, mat(look.hair || HAIRS[0], 0.9));
  parts.hair.position.y = 0.02; parts.hair.rotation.x = -0.25; headG.add(parts.hair);
  parts.nose = new THREE.Mesh(G.nose, skin); parts.nose.position.set(0, -0.01, 0.15); headG.add(parts.nose);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(G.eye, mat('#111', 0.3)); e.position.set(sx * 0.05, 0.03, 0.135); headG.add(e); }
  // arms: shoulder → elbow → hand
  for (const [key, sx] of [['armL', 1], ['armR', -1]]) {
    const a = limb(G.upperArm, G.foreArm, shirt, skin, -0.3);
    a.position.set(sx * 0.27, 0.6, 0);
    const hand = new THREE.Mesh(G.hand, skin); hand.position.y = -0.27; a.userData.joint.add(hand);
    a.userData.hand = hand;
    chest.add(a); parts[key] = a;
  }
  // a small tool in the right hand (visible while cutting)
  parts.tool = new THREE.Mesh(G.tool, mat('#1a1a1c', 0.4));
  parts.tool.position.set(0, -0.06, 0.03); parts.tool.visible = false;
  parts.armR.userData.hand.add(parts.tool);
  // legs: hip → knee → foot
  for (const [key, sx] of [['legL', 1], ['legR', -1]]) {
    const l = limb(G.thigh, G.shin, pants, pants, -0.4);
    l.position.set(sx * 0.11, -0.02, 0);
    const shoe = new THREE.Mesh(G.shoe, mat(look.shoes || '#3a2216', 0.4)); shoe.position.set(0, -0.5, 0.05);
    l.userData.joint.add(shoe);
    l.userData.shoe = shoe; l.userData.leg = l.userData.upper;
    body.add(l); parts[key] = l;
  }
  parts.apron = new THREE.Mesh(G.apron, mat(look.apron || '#141414'));
  parts.apron.position.set(0, 0.13, 0.2); parts.apron.visible = !!look.apron;
  chest.add(parts.apron);
  p.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  p.userData = { parts, body, headG, phase: Math.random() * 6, look: { ...look }, pose: {}, t: Math.random() * 10 };
  return p;
}

/** Recolour a person (clothes shop). */
export function dressPerson(p, look) {
  const { parts } = p.userData;
  Object.assign(p.userData.look, look);
  const L = p.userData.look;
  const shirt = mat(L.shirt), pants = mat(L.pants), skin = mat(L.skin, 0.6);
  parts.torso.material = shirt;
  for (const a of [parts.armL, parts.armR]) { a.userData.upper.material = shirt; a.userData.lower.material = skin; a.userData.hand.material = skin; }
  parts.hips.material = pants;
  for (const l of [parts.legL, parts.legR]) { l.userData.upper.material = l.userData.lower.material = pants; l.userData.shoe.material = mat(L.shoes, 0.4); }
  parts.hair.material = mat(L.hair, 0.9);
  parts.head.material = parts.nose.material = skin;
  parts.apron.visible = !!L.apron;
  if (L.apron) parts.apron.material = mat(L.apron);
}

const lerp = THREE.MathUtils.lerp;
/** Ease every joint toward its target so poses blend (no snapping between walking, sitting, cutting...). */
function ease(o, key, target, k) { o[key] = lerp(o[key], target, k); }

/**
 * Animate a person. speed in m/s. sitting: in a chair/bench.
 * pose: null | 'cut' (barber working) | 'pay' (handing money) | 'wave' | 'look' (client checking the mirror) | 'jump' | 'phone'
 */
export function animatePerson(p, dt, speed, sitting = false, pose = null, air = 0) {
  const u = p.userData;
  const { parts, body } = u;
  u.t += dt;
  const k = Math.min(1, dt * 12);
  const run = Math.min(1, Math.max(0, (speed - 3.4) / 2.4));
  const T = { bodyY: 0.98, lean: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, shL: 0, shR: 0, elL: 0, elR: 0, shLz: 0, shRz: 0, head: 0, headY: 0 };
  if (sitting) {
    T.bodyY = 0.55; T.hipL = T.hipR = 1.5; T.kneeL = T.kneeR = 1.45; T.shL = T.shR = -0.35; T.elL = T.elR = -0.6;
    if (pose === 'look') { T.headY = Math.sin(u.t * 1.6) * 0.5; T.head = -0.1; }
  } else if (air > 0 || pose === 'jump') {
    T.hipL = 0.9; T.hipR = 0.4; T.kneeL = 1.3; T.kneeR = 0.7; T.shL = T.shR = -2.4; T.elL = T.elR = -0.3; T.lean = 0.1;
  } else {
    u.phase += dt * (2 + speed * (2.2 - run * 0.5));
    const a = Math.min(1, speed / 1.4) * (0.55 + run * 0.35);
    const s = Math.sin(u.phase), c = Math.cos(u.phase);
    T.hipL = s * a; T.hipR = -s * a;
    T.kneeL = Math.max(0, -c) * a * (1.1 + run) + 0.05; T.kneeR = Math.max(0, c) * a * (1.1 + run) + 0.05;
    T.shL = -s * a * (0.8 + run * 0.4); T.shR = s * a * (0.8 + run * 0.4);
    T.elL = T.elR = -0.15 - run * 1.2;
    T.lean = run * 0.28 + Math.min(1, speed / 1.4) * 0.04;
    T.bodyY = 0.98 + Math.abs(c) * (0.03 + run * 0.05) * Math.min(1, speed) - run * 0.03;
    if (speed < 0.1) { // idle: breathing + small weight shifts
      const br = Math.sin(u.t * 1.7);
      T.bodyY = 0.98 + br * 0.006; T.shL = T.shR = 0.04 + br * 0.02; T.elL = T.elR = -0.12;
      T.headY = Math.sin(u.t * 0.37) * 0.25;
    }
    if (pose === 'cut') { // both hands up at a client's head; the right hand snips/moves along
      const w = u.t * 3.2;
      T.shR = -1.25 + Math.sin(w) * 0.18; T.elR = -0.9 + Math.sin(w * 2.7) * 0.25; T.shRz = 0.25 + Math.sin(w * 0.7) * 0.15;
      T.shL = -1.0; T.elL = -1.25; T.shLz = -0.35; T.head = 0.35; T.lean = 0.12; T.headY = Math.sin(w * 0.5) * 0.15;
    } else if (pose === 'pay') { T.shR = -1.35; T.elR = -0.25; T.head = 0.15; }
    else if (pose === 'wave') { T.shR = -2.6; T.shRz = 0.2 + Math.sin(u.t * 9) * 0.35; T.elR = -0.5; }
    else if (pose === 'phone') { T.shR = -1.1; T.elR = -1.9; T.head = 0.45; }
  }
  ease(body.position, 'y', T.bodyY, k);
  ease(parts.chest.rotation, 'x', T.lean, k);
  ease(parts.legL.rotation, 'x', -T.hipL, k); ease(parts.legR.rotation, 'x', -T.hipR, k);
  ease(parts.legL.userData.joint.rotation, 'x', T.kneeL, k); ease(parts.legR.userData.joint.rotation, 'x', T.kneeR, k);
  ease(parts.armL.rotation, 'x', T.shL, k); ease(parts.armR.rotation, 'x', T.shR, k);
  ease(parts.armL.rotation, 'z', T.shLz, k); ease(parts.armR.rotation, 'z', -T.shRz, k);
  ease(parts.armL.userData.joint.rotation, 'x', T.elL, k); ease(parts.armR.userData.joint.rotation, 'x', T.elR, k);
  ease(u.headG.rotation, 'x', T.head, k); ease(u.headG.rotation, 'y', T.headY, k * 0.5);
  parts.tool.visible = pose === 'cut';
}

export function randomLook(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  return { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(CLOTHES), pants: pick(['#2b2f38', '#3a2a20', '#141414', '#4a4f5a', '#6b5a44']), shoes: pick(['#3a2216', '#141414', '#e9e5dc']) };
}
