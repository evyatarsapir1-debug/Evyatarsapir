// Detailed procedural passenger jet (shared by the airport, the hangar interior and the flyable jet).
import * as THREE from 'three';
import { GeoBuilder, tubeGeo, loftGeo, foil } from './geoBuilder.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const M = (x, y, z, rx, ry, rz, sx, sy, sz) => { _e.set(rx, ry, rz); _q.setFromEuler(_e); return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); };
const LIP = new THREE.TorusGeometry(1.04, 0.13, 8, 28);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20), CONE = new THREE.ConeGeometry(0.5, 1, 20), BOX = new THREE.BoxGeometry(1, 1, 1), SPH = new THREE.SphereGeometry(0.5, 16, 10);

// Passenger jet, nose towards +Z, wheels on the ground at y=0. ~39m long, 34m wingspan.
// Smooth fuselage with a two-tone livery, cheatline and tail sweep, window rows, doors, cockpit glazing,
// swept and cranked wings with winglets, under-wing engines on pylons, flap fairings, tailplane, tail fin
// with logo, wing-body fairing, navigation lights and (optionally) landing gear.
// airline colour schemes (fictional airlines)
export const LIVERIES = [
  { name: 'אזורה איירליינס', tail: 0x1f5fa8, stripe: 0x2fb5e8 },
  { name: 'מפרץ אייר', tail: 0xe0533b, stripe: 0xf3a33a },
  { name: 'רכס תעופה', tail: 0x2e8a5d, stripe: 0x9bd16a },
];
export const JET_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.38 });
export const FY = 3.9; // fuselage centre height
let _jetParts = null;
function jetParts() {
  if (_jetParts) return _jetParts;
  const st = [
    [-19.7, 0.12, 1.35], [-18.6, 0.45, 1.2], [-16.2, 0.95, 0.85], [-13.2, 1.45, 0.48], [-10.2, 1.85, 0.16], [-7.5, 2.0, 0],
    [12.5, 2.0, 0], [14.6, 1.94, -0.04], [16.0, 1.72, -0.12], [17.2, 1.38, -0.22], [18.2, 0.95, -0.32], [18.9, 0.5, -0.4], [19.25, 0.08, -0.44],
  ].map(([z, r, cy]) => ({ z, r, cy, sy: 1.06 }));
  const wing = (sx) => {
    const S = (x, zLE, chord, y, t) => foil([sx * x, y, zLE], [0, 0, -1], [0, 1, 0], chord, t);
    return loftGeo([S(1.2, 3.6, 7.4, 2.68, 0.62), S(6.2, 1.0, 4.7, 3.08, 0.42), S(16.8, -4.9, 1.55, 4.0, 0.16)]);
  };
  const winglet = (sx) => loftGeo([
    foil([sx * 16.75, 3.98, -4.95], [0, 0, -1], [1, 0, 0], 1.5, 0.12),
    foil([sx * 17.25, 5.9, -6.5], [0, 0, -1], [1, 0, 0], 0.6, 0.06),
  ]);
  const stab = (sx) => loftGeo([
    foil([sx * 0.4, FY + 0.95, -14.4], [0, 0, -1], [0, 1, 0], 4.2, 0.36),
    foil([sx * 6.4, FY + 1.5, -18.0], [0, 0, -1], [0, 1, 0], 1.6, 0.12),
  ]);
  const fin = loftGeo([
    foil([0, FY + 1.0, -11.6], [0, 0, -1], [1, 0, 0], 6.6, 0.55),
    foil([0, FY + 7.8, -17.7], [0, 0, -1], [1, 0, 0], 2.5, 0.16),
  ]);
  const nacelle = tubeGeo([
    [4.7, 0.98], [4.55, 1.12], [4.1, 1.2], [2.6, 1.18], [1.2, 1.06], [0.5, 0.9], [0.35, 0.68], [-0.7, 0.5], [-1.25, 0.12],
  ].map(([z, r]) => ({ z, r })), 24, null, [false, true]);
  const fairing = tubeGeo([[-6.5, 0.2], [-5, 0.9], [-2, 1.15], [3, 1.15], [5.5, 0.8], [6.8, 0.2]].map(([z, r]) => ({ z, r, sx: 2.4, sy: 0.75 })), 20);
  _jetParts = { st, wing: [wing(1), wing(-1)], winglet: [winglet(1), winglet(-1)], stab: [stab(1), stab(-1)], fin, nacelle, fairing };
  return _jetParts;
}
export function buildAirliner(builder, livery, gear = true, ox = 0, oy = 0, oz = 0, heading = 0) {
  const W = 0xf4f6f8, BELLY = 0xc3cad1, G = 0xc9cfd6, D = 0x1a2128, METAL = 0x9aa2aa;
  const P = jetParts();
  const T = new THREE.Matrix4().makeRotationY(heading).setPosition(ox, oy, oz);
  const add = (geo, m, c) => builder.addGeometry(geo, new THREE.Matrix4().multiplyMatrices(T, m), c);
  const I = new THREE.Matrix4();
  // fuselage with livery painted per vertex
  const fus = tubeGeo(P.st.map((s) => ({ ...s, cy: FY + s.cy })), 32, (x, yr, z) => {
    if (yr < -1.05) return BELLY;
    if (yr > -0.42 && yr < -0.12 && z > -12 && z < 17.6) return livery.stripe;
    if (z < -11.5 && yr > 0.15 - (z + 11.5) * 0.12) return livery.tail;
    return W;
  });
  add(fus, I, null); fus.dispose();
  // passenger windows (two rows of small dark panes), with gaps at the doors
  for (const sx of [-1, 1]) {
    for (let z = -9.6; z < 12.2; z += 0.74) {
      if (Math.abs(z - 2.0) < 0.5 || Math.abs(z + 7.4) < 0.6) continue;
      add(BOX, M(sx * 1.94, FY + 0.48, z, 0, 0, sx * 0.24, 0.07, 0.36, 0.26), D);
    }
    // doors: light panel with darker outline
    for (const z of [13.4, 2.0, -7.6]) {
      const r = z > 13 ? 1.95 : 2.0;
      add(BOX, M(sx * (r - 0.02), FY + 0.05, z, 0, 0, sx * 0.05, 0.05, 1.95, 0.98), 0x8d969e);
      add(BOX, M(sx * r, FY + 0.05, z, 0, 0, sx * 0.05, 0.05, 1.82, 0.85), z < -7 ? W : 0xe8ecef);
    }
    // cargo doors
    add(BOX, M(sx * 1.5, FY - 1.35, 8, 0, 0, sx * 0.9, 0.05, 1.0, 1.6), 0xa9b1b8);
  }
  // cockpit glazing wrapping around the nose
  for (const [a, w] of [[-0.62, 0.42], [-0.3, 0.55], [0.3, 0.55], [0.62, 0.42]]) {
    const r = 1.32, z = 17.25 - Math.abs(a) * 0.45;
    add(BOX, M(Math.sin(a) * r, FY + 0.48, z + Math.cos(a) * 0.15, -0.55, a, 0, w, 0.36, 0.06), D);
  }
  add(BOX, M(0, FY + 0.6, 17.55, -0.95, 0, 0, 0.08, 0.36, 0.06), METAL); // centre frame
  // wings, winglets, engines, pylons, flap-track fairings
  for (let k = 0; k < 2; k++) {
    const sx = k ? -1 : 1;
    add(P.wing[k], I, G); add(P.winglet[k], I, livery.tail);
    add(P.nacelle, M(sx * 6.0, 1.75, 0, 0, 0, 0, 1, 1, 1), 0xe6eaee);
    add(CYL, M(sx * 6.0, 1.75, 4.25, Math.PI / 2, 0, 0, 1.9, 0.05, 1.9), 0x23292f);          // fan face (dark, recessed)
    add(CONE, M(sx * 6.0, 1.75, 4.5, Math.PI / 2, 0, 0, 0.55, 0.5, 0.55), 0xcfd5da);           // spinner
    add(LIP, M(sx * 6.0, 1.75, 4.62, 0, 0, 0, 1, 1, 1), 0xb8c0c8);                             // intake lip ring
    add(BOX, M(sx * 6.0, 2.85, 1.0, 0, 0, 0, 0.32, 0.9, 4.2), G);                              // pylon
    for (const x of [3.8, 8.6, 12.4]) {
      // flap-track fairings hanging under the trailing edge
      const k2 = x < 6.2 ? (x - 1.2) / 5 : (x - 6.2) / 10.6;
      const te = x < 6.2 ? -3.8 + 0.1 * k2 : -3.7 - 2.75 * k2, y = x < 6.2 ? 2.68 + 0.4 * k2 : 3.08 + 0.92 * k2;
      add(SPH, M(sx * x, y - 0.12, te + 0.6, 0, 0, 0, 0.26, 0.3, 2.2), 0xb3bbc3);
    }
    add(BOX, M(sx * 17.0, 4.0, -5.4, 0, 0, 0, 0.15, 0.15, 0.25), sx > 0 ? 0xff2a2a : 0x22ff55);  // nav lights
    add(P.stab[k], I, G);
  }
  add(P.fin, I, livery.tail);
  // tail logo disc + stripe on the fin
  for (const sx of [-1, 1]) {
    add(CYL, M(sx * 0.2, FY + 4.6, -15.5, 0, 0, Math.PI / 2, 2.0, 0.04, 2.0), livery.stripe);
    add(CYL, M(sx * 0.215, FY + 4.6, -15.5, 0, 0, Math.PI / 2, 1.2, 0.04, 1.2), W);
  }
  add(P.fairing, M(0, FY - 1.75, -0.5, 0, 0, 0, 1, 1, 1), 0xd4d9de);                         // wing-body fairing
  add(BOX, M(0, FY + 2.1, 4, 0, 0, 0, 0.18, 0.12, 0.3), 0xff2a2a);                           // beacon
  add(BOX, M(0, FY - 2.15, -2, 0, 0, 0, 0.18, 0.12, 0.3), 0xff2a2a);
  if (gear) {
    // nose gear: strut, torque link, twin wheels
    add(CYL, M(0, 1.25, 15.0, 0, 0, 0, 0.18, 1.7, 0.18), METAL);
    add(BOX, M(0, 0.95, 15.15, 0.4, 0, 0, 0.1, 0.5, 0.08), METAL);
    for (const s of [-1, 1]) {
      add(CYL, M(s * 0.28, 0.42, 15.0, 0, 0, Math.PI / 2, 0.84, 0.28, 0.84), 0x1d1d1f);
      add(CYL, M(s * 0.42, 0.42, 15.0, 0, 0, Math.PI / 2, 0.42, 0.02, 0.42), 0xbfc5ca);
    }
    // main gear: strut from the wing, bogie with four wheels each side, gear doors
    for (const s of [-1, 1]) {
      add(CYL, M(s * 3.4, 1.65, -1.2, 0, 0, 0, 0.28, 2.3, 0.28), METAL);
      add(BOX, M(s * 3.4, 0.62, -1.2, 0, 0, 0, 0.22, 0.22, 1.7), METAL);
      for (const dz of [-0.62, 0.62]) for (const dx of [-0.36, 0.36]) {
        add(CYL, M(s * 3.4 + dx, 0.6, -1.2 + dz, 0, 0, Math.PI / 2, 1.2, 0.36, 1.2), 0x1d1d1f);
        add(CYL, M(s * 3.4 + dx * 1.5, 0.6, -1.2 + dz, 0, 0, Math.PI / 2, 0.62, 0.02, 0.62), 0xbfc5ca);
      }
      add(BOX, M(s * 3.9, 1.9, -1.2, 0, 0, 0, 0.05, 1.6, 1.2), W);
    }
  }
}


// One merged mesh (vertex colours) for a livery, with or without landing gear.
const _geoCache = new Map();
export function airlinerGeometry(livery, gear = true) {
  const key = `${livery.tail}_${livery.stripe}_${gear}`;
  if (_geoCache.has(key)) return _geoCache.get(key);
  const g = _build(livery, gear); _geoCache.set(key, g); return g;
}
function _build(livery, gear) {
  const b = new GeoBuilder();
  buildAirliner(b, livery, gear);
  return b.build();
}
