// Head geometry helpers shared by the client model and the hair system.
// Head-local space: origin = centre of the cranium, +Y up, +Z = the client's face (forward), -X = client's right.
import * as THREE from 'three';

// Cranium ellipsoid radii in metres (width 15.4 cm, height above centre 9.2 cm, length 19.6 cm).
export const RADII = new THREE.Vector3(0.077, 0.092, 0.098);

// Hairline: for each |azimuth| around the head (0 = forehead, PI = back of the neck) the lowest
// normalized height at which hair grows. Gives the forehead, temple recess, sideburns, the arc
// over the ear and the nape.
const HAIRLINE = [
  [0.0, 0.43], [0.45, 0.41], [0.8, 0.33], [1.0, 0.2], [1.13, -0.12], [1.2, -0.42],
  [1.33, -0.44], [1.4, -0.05], [1.5, 0.06], [1.82, 0.06], [2.0, -0.18], [2.25, -0.5],
  [2.6, -0.66], [Math.PI, -0.72],
];

export function azimuth(d) { return Math.atan2(d.x, d.z); }

export function hairlineY(absAz) {
  for (let i = 1; i < HAIRLINE.length; i++) {
    const [a1, y1] = HAIRLINE[i];
    if (absAz <= a1) {
      const [a0, y0] = HAIRLINE[i - 1];
      const t = (absAz - a0) / (a1 - a0);
      return y0 + (y1 - y0) * t;
    }
  }
  return HAIRLINE[HAIRLINE.length - 1][1];
}

/** Hair density 0..1 for a unit direction d (from the cranium centre). Soft at the hairline. */
export function hairMask(d) {
  const minY = hairlineY(Math.abs(azimuth(d)));
  return THREE.MathUtils.smoothstep(d.y, minY - 0.01, minY + 0.07);
}

/** Educational zone names (Hebrew) for a unit direction. */
export function zoneOf(d) {
  const az = azimuth(d), a = Math.abs(az);
  const side = az < 0 ? 'ימין' : 'שמאל';
  if (d.y > 0.6) return d.z < -0.3 ? { id: 'crown', name: 'כתר (קודקוד)' } : { id: 'top', name: 'חלק עליון' };
  if (a < 1.0) return { id: 'fringe', name: 'קו שיער קדמי' };
  if (a < 1.4 && d.y < 0.0) return { id: 'sideburn', name: 'פאה ' + side };
  if (a < 2.15) return { id: 'side', name: 'צד ' + side };
  if (d.y < -0.3) return { id: 'nape', name: 'עורף' };
  return { id: 'back', name: 'אחורי הראש' };
}

/** Ellipsoid point + outward normal for a unit direction. */
export function surfacePoint(d, out = new THREE.Vector3()) { return out.set(d.x * RADII.x, d.y * RADII.y, d.z * RADII.z); }
export function surfaceNormal(p, out = new THREE.Vector3()) {
  return out.set(p.x / (RADII.x * RADII.x), p.y / (RADII.y * RADII.y), p.z / (RADII.z * RADII.z)).normalize();
}

/** Ray (head-local) vs ellipsoid scaled by `grow`. Returns distance t or -1. */
export function rayEllipsoid(origin, dir, grow = 1) {
  const rx = RADII.x * grow, ry = RADII.y * grow, rz = RADII.z * grow;
  const ox = origin.x / rx, oy = origin.y / ry, oz = origin.z / rz;
  const dx = dir.x / rx, dy = dir.y / ry, dz = dir.z / rz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / (2 * a);
  if (t0 > 0) return t0;
  const t1 = (-b + s) / (2 * a);
  return t1 > 0 ? t1 : -1;
}

/** Small deterministic PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
