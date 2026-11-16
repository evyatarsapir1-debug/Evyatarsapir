// The seated client: sculpted head (cranium = the hair ellipsoid), face, eyes, ears, neck, barber cape, legs, shoes.
import * as THREE from 'three';
import { RADII, hairlineY, azimuth } from '../hair/scalp.js';

const ss = THREE.MathUtils.smoothstep;
const g2 = (x, y, sx, sy) => Math.exp(-(x * x) / (sx * sx) - (y * y) / (sy * sy));

export const SKIN_TONES = { light: '#e2b08c', tan: '#c98e66', brown: '#8d5a3b' };

/** Builds the head geometry by sculpting a dense sphere. The upper (hair) part stays exactly the cranium ellipsoid. */
function sculptHead(skinHex, hairHex) {
  const geo = new THREE.SphereGeometry(1, 180, 140);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const skin = new THREE.Color(skinHex), lip = new THREE.Color('#a85a50'), cheek = new THREE.Color('#d7826e');
  const brow = new THREE.Color(hairHex).multiplyScalar(0.9), beard = new THREE.Color(hairHex).lerp(new THREE.Color('#5a6470'), 0.5);
  const d = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const minY = hairlineY(Math.abs(azimuth(d)));
    const w = 1 - ss(d.y, minY - 0.22, minY - 0.02);       // 0 on the scalp, 1 on the face/jaw
    const t = Math.max(0, -d.y), fw = ss(d.z, 0.0, 0.8);
    const aAz = Math.abs(azimuth(d));
    // broad jaw angle below the ears, slightly slimmer cheeks, longer lower face
    const jaw = 0.16 * ss(t, 0.25, 0.65) * (1 - ss(t, 0.85, 1.0)) * ss(aAz, 0.35, 1.0) * (1 - ss(aAz, 1.9, 2.4));
    let px = d.x * RADII.x * (1 + (jaw - 0.04) * w);
    let py = d.y * RADII.y * (1 + 0.95 * t * fw * w);
    let pz = d.z * RADII.z * (1 + 0.12 * t * fw * w);
    // Fill the lower face out to a natural profile: brow -> cheeks -> lips -> chin.
    if (d.z > 0 && py < 0.01) {
      const yy = -py;
      const zProf = yy < 0.06 ? 0.094 - yy * 0.05 : yy < 0.1 ? 0.091 - (yy - 0.06) * 0.1 : 0.087 - (yy - 0.1) * 0.25;
      const hw = yy < 0.05 ? 0.072 : yy < 0.1 ? 0.072 - (yy - 0.05) * 0.4 : Math.max(0.02, 0.052 - (yy - 0.1) * 0.9);
      const xr = px / hw;
      const target = zProf * Math.sqrt(Math.max(0, 1 - xr * xr * xr * xr));
      const wFace = ss(d.z, 0.15, 0.6) * w * (1 - ss(yy, 0.13, 0.16));
      if (target > pz) pz += (target - pz) * wFace;
    }
    // Facial features (front only).
    const wF = ss(d.z, 0.5, 0.85) * w;
    if (wF > 0) {
      const ax = Math.abs(px);
      const noseW = 0.0065 + 0.0075 * ss(-py, 0.03, 0.06);
      const noseProf = 0.004 + 0.016 * ss(-py, 0.012, 0.056);
      const nose = noseProf * Math.exp(-(px * px) / (noseW * noseW)) * (1 - ss(-py, 0.058, 0.07)) * ss(-py, -0.005, 0.012);
      const socket = -0.0085 * g2(ax - 0.033, py + 0.021, 0.016, 0.011);
      const browR = 0.0045 * g2(ax - 0.03, py - 0.0, 0.035, 0.007);
      const cheekB = 0.004 * g2(ax - 0.047, py + 0.047, 0.016, 0.013);
      const lips = 0.0045 * g2(px, py + 0.091, 0.021, 0.0065) - 0.0018 * g2(px, py + 0.0905, 0.02, 0.0012);
      const chin = 0.006 * g2(px, py + 0.124, 0.02, 0.012);
      const nostril = 0.005 * g2(ax - 0.013, py + 0.06, 0.006, 0.006);
      const philtrum = 0.0015 * g2(px, py + 0.078, 0.006, 0.006);
      pz += (nose + nostril + socket + browR + cheekB + lips + chin + philtrum) * wF;
    }
    pos.setXYZ(i, px, py, pz);
    // Skin colour + features.
    c.copy(skin);
    if (wF > 0) {
      const ax = Math.abs(px);
      c.lerp(cheek, 0.25 * g2(ax - 0.045, py + 0.05, 0.02, 0.018) * wF);
      c.lerp(lip, 0.85 * g2(px, py + 0.091, 0.022, 0.006) * wF);
      const archY = 0.001 - 0.007 * ((ax - 0.033) / 0.022) ** 2;
      c.lerp(brow, 0.92 * g2(ax - 0.033, py - archY, 0.022, 0.0042) * wF);
    }
    // light beard shadow on the jaw, chin and upper lip
    const beardW = w * ss(-py, 0.06, 0.08) * ss(d.z, -0.2, 0.3) * (1 - 0.9 * g2(px, py + 0.091, 0.02, 0.006));
    c.lerp(beard, 0.14 * beardW);
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return { geo, baseColors: colors.slice() };
}

function surfaceZAt(geo, x, y) {
  const pos = geo.attributes.position;
  let best = Infinity, z = 0;
  for (let i = 0; i < pos.count; i++) {
    const pz = pos.getZ(i);
    if (pz <= 0) continue;
    const dd = (pos.getX(i) - x) ** 2 + (pos.getY(i) - y) ** 2;
    if (dd < best) { best = dd; z = pz; }
  }
  return z;
}

function eyeTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#f2ede6'; g.fillRect(0, 0, 128, 128);
  const grd = g.createRadialGradient(64, 64, 6, 64, 64, 30);
  grd.addColorStop(0, '#2a1a10'); grd.addColorStop(0.35, '#4b2f1a'); grd.addColorStop(0.9, '#6b4526'); grd.addColorStop(1, '#2b1a10');
  g.fillStyle = grd; g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#050505'; g.beginPath(); g.arc(64, 64, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(56, 56, 4, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fabricTexture(hex, stripe) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = hex; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 1);
  }
  if (stripe) { g.fillStyle = stripe; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 3, 256); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildClient({ skin = SKIN_TONES.light, hairColor = '#3a281d', capeColor = '#1d2733', mannequin = false } = {}) {
  if (mannequin) skin = '#d8bfa4';
  const group = new THREE.Group(); group.name = 'client';
  const head = new THREE.Group(); head.name = 'head';
  head.position.set(0, 1.34, 0.0);
  group.add(head);

  const { geo, baseColors } = sculptHead(skin, hairColor);
  const skinMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.58, metalness: 0, sheen: 0.35, sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#ff9a80'), clearcoat: 0.08, clearcoatRoughness: 0.6,
  });
  const headMesh = new THREE.Mesh(geo, skinMat);
  headMesh.name = 'headMesh'; headMesh.castShadow = true;
  head.add(headMesh);

  // Eyes, set into the sockets, with eyelids.
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const lidMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(skin).multiplyScalar(0.92), roughness: 0.6 });
  for (const sx of [-1, 1]) {
    const ex = 0.033 * sx, ey = -0.021;
    const ez = surfaceZAt(geo, ex, ey) - 0.0085;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0118, 32, 24), eyeMat);
    eye.position.set(ex, ey, ez);
    eye.rotation.set(0, -Math.PI / 2 + sx * -0.05, 0); // texture centre (u = 0.5) faces +Z
    head.add(eye);
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 28, 12, 0, Math.PI * 2, 0, 1.05), lidMat);
    upper.position.copy(eye.position); upper.rotation.x = 0.12;
    head.add(upper);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.0123, 28, 8, 0, Math.PI * 2, 0, 1.05), lidMat);
    lower.position.copy(eye.position); lower.rotation.x = Math.PI - 0.05;
    head.add(lower);
  }

  // Ears: helix rim + concha, tilted back and slightly away from the head.
  const earMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(skin).lerp(new THREE.Color('#e08a78'), 0.15), roughness: 0.6, sheen: 0.3, sheenColor: new THREE.Color('#ff9a80') });
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0055, 12, 32), earMat);
    rim.scale.set(1, 1.45, 1);
    const concha = new THREE.Mesh(new THREE.SphereGeometry(0.018, 20, 16), earMat);
    concha.scale.set(0.95, 1.35, 0.35); concha.position.z = -0.003;
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), earMat);
    lobe.position.set(0.004, -0.027, 0); lobe.scale.set(1, 1.1, 0.6);
    ear.add(rim, concha, lobe);
    ear.position.set(sx * 0.0745, -0.028, -0.004);
    ear.rotation.set(0, sx * (Math.PI / 2 - 0.35), sx * -0.18);
    ear.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    head.add(ear);
  }

  // Neck.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.16, 32, 1, true), skinMat.clone());
  neck.material.vertexColors = false; neck.material.color.set(skin);
  neck.position.set(0, -0.12, -0.012);
  head.add(neck);

  if (mannequin) {
    // Training head on a tripod stand: a short bust, a clamp and a tripod on the floor.
    const plastic = new THREE.MeshStandardMaterial({ color: '#cfb59a', roughness: 0.55 });
    const bust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 0.12, 32), plastic);
    bust.position.set(0, 1.12, -0.012); group.add(bust);
    const chromeM = new THREE.MeshStandardMaterial({ color: '#d8d8da', metalness: 1, roughness: 0.2 });
    const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 20), new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5 }));
    clamp.position.set(0, 1.03, -0.012); group.add(clamp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.98, 16), chromeM);
    pole.position.set(0, 0.52, -0.012); group.add(pole);
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.42, 12), chromeM);
      const a = k * Math.PI * 2 / 3;
      leg.position.set(Math.sin(a) * 0.14, 0.14, -0.012 + Math.cos(a) * 0.14);
      leg.rotation.set(Math.cos(a) * 0.75, 0, -Math.sin(a) * 0.75);
      group.add(leg);
    }
    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { group, head, headMesh, baseColors, dustTargets: [neck, bust], mannequin: true };
  }

  // Barber cape (lathe), neck strip, lap drape.
  const capeMat = new THREE.MeshStandardMaterial({ map: fabricTexture(capeColor, null), roughness: 0.75, side: THREE.DoubleSide });
  const prof = [[0.05, 0.0], [0.07, -0.015], [0.12, -0.04], [0.19, -0.075], [0.225, -0.12], [0.24, -0.2], [0.245, -0.4], [0.255, -0.62], [0.27, -0.78]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const cape = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), capeMat);
  cape.scale.set(1.2, 1, 0.82);
  cape.position.set(0, 1.18, -0.02);
  cape.castShadow = true;
  group.add(cape);
  const strip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.064, 0.022, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9, side: THREE.DoubleSide }));
  strip.position.set(0, 1.19, -0.014);
  group.add(strip);
  // Drape over the thighs and knees, falling past the knees.
  const lap = new THREE.PlaneGeometry(0.56, 0.75, 12, 24);
  const lp = lap.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i), v = (lp.getY(i) + 0.375) / 0.75; // 0 = waist, 1 = hem
    const z = 0.05 + Math.min(v, 0.6) * 0.75;
    const y = 0.66 - Math.max(0, v - 0.6) * 1.1 - Math.sin(v * Math.PI) * 0.02 + Math.abs(x) * -0.05;
    lp.setXYZ(i, x * (1 + v * 0.15), y, z);
  }
  lap.computeVertexNormals();
  const lapMesh = new THREE.Mesh(lap, capeMat);
  lapMesh.castShadow = true;
  group.add(lapMesh);

  // Shins and shoes on the footrest.
  const trouser = new THREE.MeshStandardMaterial({ map: fabricTexture('#2b2f38', null), roughness: 0.85 });
  const shoeMat = new THREE.MeshPhysicalMaterial({ color: '#3a2216', roughness: 0.35, clearcoat: 0.6 });
  for (const sx of [-1, 1]) {
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.44, 16), trouser);
    shin.position.set(sx * 0.1, 0.38, 0.55); shin.rotation.x = 0.12;
    shin.castShadow = true;
    group.add(shin);
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 6, 16), shoeMat);
    shoe.rotation.x = Math.PI / 2; shoe.scale.set(1, 1, 0.75);
    shoe.position.set(sx * 0.1, 0.19, 0.62);
    shoe.castShadow = true;
    group.add(shoe);
  }

  return { group, head, headMesh, baseColors, dustTargets: [cape, strip, lapMesh, neck], mannequin: false };
}
