// Fighter jet (fictional, generic): slim fuselage with a long nose, bubble canopy, side intakes, cropped delta wings,
// twin canted tails, stabilators, single nozzle with afterburner glow, tricycle gear. Nose towards +Z, wheels at y=0.
import * as THREE from 'three';
import { GeoBuilder, tubeGeo, loftGeo, foil, mat } from '../world/geoBuilder.js';

const FY = 1.75;
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14), SPH = new THREE.SphereGeometry(0.5, 16, 12);
const M = (x, y, z, ry, sx, sy, sz, rx = 0, rz = 0) => mat(x, y, z, ry, sx, sy, sz, rx, rz).clone();
const cache = new Map();

function build(col, gear) {
  const b = new GeoBuilder(), I = new THREE.Matrix4();
  const DARK = 0x1c2228, GLASS = 0x223a4c, METAL = 0x8c939a, light = new THREE.Color(col).offsetHSL(0, 0, 0.08).getHex();
  // fuselage: pointed nose (radome), cockpit hump, wide middle, tapering to the nozzle
  const fus = tubeGeo([[8.0, 0.02, -0.15], [7.4, 0.22, -0.12], [6.3, 0.48, -0.06], [4.8, 0.7, 0], [3.0, 0.82, 0.05], [1.0, 0.9, 0.05], [-1.5, 0.95, 0], [-4.5, 0.85, 0], [-6.4, 0.62, 0], [-7.2, 0.55, 0]]
    .map(([z, r, cy]) => ({ z, r, cy: FY + cy, sx: 1.15, sy: 0.92 })), 24, (x, yr, z) => (yr < -0.45 ? light : col), [true, false]);
  b.addGeometry(fus, I, null); fus.dispose();
  b.addGeometry(SPH, M(0, FY + 0.72, 3.4, 0, 0.95, 0.72, 3.0), GLASS);                     // bubble canopy
  b.addGeometry(BOX, M(0, FY + 0.72, 2.2, 0, 0.9, 0.06, 0.08), DARK);                        // canopy frame
  for (const s of [-1, 1]) {
    b.addGeometry(BOX, M(s * 0.95, FY - 0.25, 1.6, 0, 0.55, 0.75, 2.2), col);                // intakes
    b.addGeometry(BOX, M(s * 0.95, FY - 0.25, 2.72, 0, 0.5, 0.68, 0.06), DARK);               // intake openings
    b.addGeometry(BOX, M(s * 0.95, FY - 0.25, -0.6, 0, 0.6, 0.72, 2.6), col);
  }
  // cropped delta wings
  for (const s of [-1, 1]) {
    const W = loftGeo([foil([s * 0.9, FY - 0.05, 1.4], [0, 0, -1], [0, 1, 0], 5.6, 0.32), foil([s * 5.4, FY - 0.15, -2.8], [0, 0, -1], [0, 1, 0], 1.7, 0.1)]);
    b.addGeometry(W, I, col);
    b.addGeometry(BOX, M(s * 5.35, FY - 0.15, -3.4, 0, 0.12, 0.12, 2.0), METAL);             // wingtip rail
    const H = loftGeo([foil([s * 0.8, FY + 0.05, -5.2], [0, 0, -1], [0, 1, 0], 2.4, 0.14), foil([s * 3.1, FY - 0.05, -6.8], [0, 0, -1], [0, 1, 0], 1.0, 0.06)]);
    b.addGeometry(H, I, col);
    const V = loftGeo([foil([s * 0.75, FY + 0.6, -3.6], [0, 0, -1], [1, 0, 0], 3.0, 0.16), foil([s * 1.3, FY + 2.6, -6.0], [0, 0, -1], [1, 0, 0], 1.2, 0.08)]);
    b.addGeometry(V, I, col);
  }
  // nozzle
  const noz = tubeGeo([[-7.0, 0.56], [-7.9, 0.5], [-8.1, 0.47]].map(([z, r]) => ({ z, r, cy: FY })), 16, null, [false, false]);
  b.addGeometry(noz, I, 0x3a3f44); noz.dispose();
  b.addGeometry(CYL, M(0, FY, -7.6, 0, 0.82, 0.05, 0.82, Math.PI / 2), 0x14181c);
  b.addGeometry(BOX, M(0, FY + 1.0, 6.3, 0, 0.05, 0.05, 0.6), METAL);                       // pitot
  b.addGeometry(BOX, M(-0.65, FY + 0.05, 7.2, 0, 0.06, 0.06, 1.2), METAL);                  // refuelling probe
  // national-style roundels (fictional) + tail stripe
  for (const s of [-1, 1]) b.addGeometry(CYL, M(s * 3.4, FY - 0.02, -1.6, 0, 0.9, 0.04, 0.9), 0x2f5b8a);
  if (gear) {
    b.addGeometry(CYL, M(0, 0.8, 4.4, 0, 0.12, 1.2, 0.12), METAL); b.addGeometry(CYL, M(0, 0.32, 4.4, 0, 0.64, 0.22, 0.64, 0, Math.PI / 2), 0x151515);
    for (const s of [-1, 1]) { b.addGeometry(CYL, M(s * 1.35, 0.85, -1.4, 0, 0.14, 1.3, 0.14), METAL); b.addGeometry(CYL, M(s * 1.45, 0.4, -1.4, 0, 0.8, 0.3, 0.8, 0, Math.PI / 2), 0x151515); }
  }
  return b.build();
}
export function fighterGeometry(col, gear) {
  const k = col + '_' + gear;
  if (!cache.has(k)) cache.set(k, build(col, gear));
  return cache.get(k);
}
export const FIGHTER_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.42 });
export const FIGHTER_FY = FY;
// afterburner: two nested additive cones behind the nozzle
export function afterburner() {
  const g = new THREE.Group();
  const m1 = new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const m2 = new THREE.MeshBasicMaterial({ color: 0x8fc6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1, 14, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5), m1);
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.3), m2);
  g.add(c1, c2); g.position.set(0, FY, -8.1);
  return g;
}
