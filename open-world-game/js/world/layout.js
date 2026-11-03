// City layout: deterministic data describing every block, building, prop, road and parking spot.
// Rendering (chunks) and physics (colliders) are both built from this data, so what you see is what you hit.
import { RNG, hash2 } from '../core/rng.js';

export const P = 100;            // distance between parallel road centerlines
export const N = 10;             // blocks per axis -> city is 1km x 1km
export const ROAD_HALF = 7;      // half width of the asphalt
export const LANE_OFFSET = 2.25; // driving lane center offset from road centerline
export const PARK_OFFSET = 5.6;  // curb parking lane offset
export const SIDEWALK = 4;
export const CURB_H = 0.15;
export const CITY_SIZE = N * P;

export const WORLD_BOUNDS = { minX: -700, maxX: 1180, minZ: -160, maxZ: 1160 };
export const BEACH = { promenadeX0: 1007, promenadeX1: 1022, sandX1: 1090 };
export const AIRPORT = { x0: -660, x1: -40, z0: 300, z1: 720 };
export const RAIL = { z: 1046, platformZ0: 1010, platformZ1: 1036, platformX0: 410, platformX1: 590 };

// Block type map (rows = z from north to south, columns = x from west to east)
// D downtown, C commercial, A apartments, H houses, I industrial, P park, S plaza,
// G gas station, M garage, T train station, B beachfront
const MAP = [
  'HHHPHHAACB',
  'HHHHAACPCB',
  'HPHACCCCAB',
  'AACDDDDCMB',
  'ACGDDDDCCB',
  'HACDDSDCGB',
  'HACDDDDCAB',
  'IIMCCAPAAB',
  'IIICGAAHHP',
  'IIIACTCHHB',
];

const DISTRICTS = {
  D: 'מרכז העיר — רובע המגדלים',
  S: 'כיכר העירייה',
  C: 'רחוב השוק',
  A: 'שכונת רמת הים',
  H: 'שכונת הגפנים',
  I: 'אזור התעשייה',
  P: 'פארק',
  G: 'תחנת דלק',
  M: 'מוסך',
  T: 'התחנה המרכזית',
  B: 'טיילת החוף',
};

const SHOP_NAMES = [
  'קפה גלים', 'פיצה נמל', 'אופנת אזורה', 'סופר השכונה', 'מאפיית הבוקר', 'ספרים ועוד',
  'פרחי הים', 'בורגר חוף', 'גלידת שקיעה', 'מספרת סטייל', 'חדר כושר אנרגיה', 'אלקטרו פלוס',
  'נעלי הצעד', 'בית הקפה הירוק', 'מסעדת הנמל', 'סושי גל', 'פלאפל הכיכר', 'תכשיטי אור',
  'משקפי עין', 'פארם העיר', 'צעצועי קשת', 'יין ושמש', 'בגדי רחוב', 'מכולת אבי',
];
export const SPECIAL_SIGNS = ['תחנת רכבת מרכזית', 'מוסך אזורה', 'דלק+', 'נמל התעופה אזורה', 'מגדל אזורה', 'בית העירייה', 'מחסני הנמל', 'בית קפה החוף'];
export const ALL_SIGNS = [...SHOP_NAMES, ...SPECIAL_SIGNS];

const PASTELS = [0xf2e3c6, 0xe8d1b5, 0xd9c8a9, 0xf0d9c0, 0xc9d6df, 0xe4c9b6, 0xd8e2cf, 0xefe6d8, 0xd4b8a0, 0xbfcfd9];
const TOWER_TINTS = [0x9fb8cc, 0x7f9bb5, 0xa9b9c4, 0x8aa3a8, 0xb7c4cf, 0x6f8aa3, 0xc4ccd2];
const BRICK = [0xa65a45, 0x9b4f3c, 0xb26b4f, 0x8c5040];
const ROOF_COLORS = [0xa04a35, 0x8a3f30, 0x5d5b5a, 0x7a4a33, 0x3f4b57];

export function blockType(bx, bz) {
  if (bx < 0 || bz < 0 || bx >= N || bz >= N) return null;
  return MAP[bz][bx];
}

export function districtAt(x, z) {
  if (x > BEACH.promenadeX0 - 2) return x > BEACH.sandX1 ? 'הים התיכון' : 'חוף אזורה';
  if (x >= AIRPORT.x0 && x <= -20 && z >= AIRPORT.z0 - 40 && z <= AIRPORT.z1) return 'נמל התעופה אזורה';
  if (z > 1003 && x > 380 && x < 620) return 'התחנה המרכזית';
  const bx = Math.floor(x / P), bz = Math.floor(z / P);
  const t = blockType(bx, bz);
  if (!t) return 'פאתי העיר';
  return DISTRICTS[t];
}

// Ground surface height (sidewalks / block lots are raised by a curb).
export function groundHeight(x, z) {
  if (x >= 0 && x <= CITY_SIZE && z >= 0 && z <= CITY_SIZE) {
    const lx = x - Math.floor(x / P) * P, lz = z - Math.floor(z / P) * P;
    if (lx > ROAD_HALF && lx < P - ROAD_HALF && lz > ROAD_HALF && lz < P - ROAD_HALF) return CURB_H;
    return 0;
  }
  if (x >= BEACH.promenadeX0 && x <= BEACH.promenadeX1 && z > -150 && z < 1150) return CURB_H;
  if (z >= RAIL.platformZ0 && z <= RAIL.platformZ1 && x >= RAIL.platformX0 && x <= RAIL.platformX1) return 0.9;
  return 0;
}

export function isOnRoad(x, z) {
  if (x >= -ROAD_HALF && x <= CITY_SIZE + ROAD_HALF && z >= -ROAD_HALF && z <= CITY_SIZE + ROAD_HALF) {
    const lx = ((x % P) + P) % P, lz = ((z % P) + P) % P;
    return lx < ROAD_HALF || lx > P - ROAD_HALF || lz < ROAD_HALF || lz > P - ROAD_HALF;
  }
  return Math.abs(z - 500) < ROAD_HALF && x < 0 && x > -300 - ROAD_HALF;
}

// ---------------------------------------------------------------------------
// Block generation
// ---------------------------------------------------------------------------
function addBox(list, b) { list.push(b); return b; }

function perimeterBuildings(rng, ox, oz, opts, out) {
  // Places buildings around the 4 edges of the buildable square [ox+11, ox+89]
  const a = 11, bnd = 89;
  const depth = opts.depth;
  const sides = [
    { face: 'n', along: 'x', from: a, to: bnd, fixed: a, dirSign: 1 },
    { face: 's', along: 'x', from: a, to: bnd, fixed: bnd, dirSign: -1 },
    { face: 'w', along: 'z', from: a + depth, to: bnd - depth, fixed: a, dirSign: 1 },
    { face: 'e', along: 'z', from: a + depth, to: bnd - depth, fixed: bnd, dirSign: -1 },
  ];
  for (const s of sides) {
    let p = s.from;
    while (p < s.to - 6) {
      let len = rng.float(opts.minFront, opts.maxFront);
      if (s.to - (p + len) < opts.minFront) len = s.to - p;
      const gap = rng.chance(opts.gapChance || 0) ? rng.float(3, 6) : 0;
      const center = p + len / 2;
      const d = depth * rng.float(0.85, 1);
      const h = rng.float(opts.minH, opts.maxH);
      let cx, cz, w, dd;
      if (s.along === 'x') { cx = ox + center; cz = oz + s.fixed + s.dirSign * d / 2; w = len - 0.6; dd = d; }
      else { cz = oz + center; cx = ox + s.fixed + s.dirSign * d / 2; dd = len - 0.6; w = d; }
      const b = {
        x: cx, z: cz, w, d: dd, h, face: s.face,
        style: rng.pick(opts.styles), color: rng.pick(opts.colors),
        storefront: opts.storefront && rng.chance(0.85),
      };
      if (b.storefront) b.sign = rng.pick(SHOP_NAMES);
      addBox(out, b);
      p += len + gap;
    }
  }
}

function faceVector(face) {
  switch (face) {
    case 'n': return [0, -1];
    case 's': return [0, 1];
    case 'w': return [-1, 0];
    default: return [1, 0];
  }
}

export function generateBlock(bx, bz) {
  const type = blockType(bx, bz);
  const rng = new RNG(hash2(bx, bz, 7));
  const ox = bx * P, oz = bz * P;
  const blk = { bx, bz, type, ox, oz, buildings: [], props: [], parking: [], ground: 'concrete', paths: [] };
  const B = blk.buildings, PR = blk.props;
  const cx = ox + 50, cz = oz + 50;

  const parkingGrid = (x0, z0, cols, rows, rot = 0) => {
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      blk.parking.push({ x: x0 + i * 3.4, z: z0 + j * 6.5, rot });
    }
  };

  switch (type) {
    case 'D': {
      blk.ground = 'plaza';
      const layoutKind = rng.int(0, 2);
      if (layoutKind === 0) {
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          const w = rng.float(28, 34), d = rng.float(28, 34);
          const x = ox + 11 + 19 + i * 40, z = oz + 11 + 19 + j * 40;
          const h = rng.float(45, 150);
          B.push({ x, z, w, d, h, style: rng.pick(['glass', 'office', 'glass']), color: rng.pick(TOWER_TINTS), face: j === 0 ? 'n' : 's', tower: true, setback: rng.chance(0.5) });
        }
      } else {
        const w = rng.float(40, 52), d = rng.float(40, 52);
        const h = rng.float(110, 190);
        B.push({ x: cx, z: cz, w, d, h, style: 'glass', color: rng.pick(TOWER_TINTS), face: 'n', tower: true, setback: true, sign: bx === 4 && bz === 4 ? 'מגדל אזורה' : undefined });
        // low podium shops on the south edge
        B.push({ x: cx, z: oz + 84, w: 60, d: 10, h: 7, style: 'concrete', color: 0xd8d2c6, face: 's', storefront: true, sign: rng.pick(SHOP_NAMES) });
        for (let k = 0; k < 6; k++) PR.push({ kind: 'tree', x: ox + 16 + k * 13.6, z: oz + 16, s: rng.float(0.9, 1.2) });
        for (let k = 0; k < 3; k++) PR.push({ kind: 'bench', x: ox + 23 + k * 27, z: oz + 18.5, rot: 0 });
      }
      break;
    }
    case 'S': { // city hall plaza
      blk.ground = 'plaza';
      B.push({ x: cx, z: oz + 22, w: 46, d: 18, h: 22, style: 'concrete', color: 0xe9e1cf, face: 'n', sign: 'בית העירייה' });
      PR.push({ kind: 'fountain', x: cx, z: cz + 12 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        PR.push({ kind: 'tree', x: cx + Math.cos(a) * 22, z: cz + 12 + Math.sin(a) * 18, s: 1.1 });
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        PR.push({ kind: 'bench', x: cx + Math.cos(a) * 12, z: cz + 12 + Math.sin(a) * 12, rot: -a + Math.PI / 2 });
      }
      break;
    }
    case 'C': {
      perimeterBuildings(rng, ox, oz, { depth: 20, minFront: 14, maxFront: 24, minH: 8, maxH: 22, styles: ['concrete', 'brick', 'plaster', 'office'], colors: [...PASTELS, ...BRICK], storefront: true }, B);
      blk.ground = 'asphalt';
      parkingGrid(ox + 34, oz + 38, 10, 3, 0);
      break;
    }
    case 'B': {
      // beachfront: cafes facing promenade (east) + apartments
      perimeterBuildings(rng, ox, oz, { depth: 18, minFront: 16, maxFront: 26, minH: 7, maxH: 26, styles: ['plaster', 'concrete'], colors: PASTELS, storefront: true, gapChance: 0.3 }, B);
      blk.ground = 'asphalt';
      parkingGrid(ox + 34, oz + 36, 10, 3, 0);
      for (const b of B) if (b.face === 'e' && b.storefront) {
        b.sign = rng.pick(['קפה גלים', 'מסעדת הנמל', 'בורגר חוף', 'גלידת שקיעה', 'סושי גל', 'בית קפה החוף']);
      }
      break;
    }
    case 'A': {
      perimeterBuildings(rng, ox, oz, { depth: 18, minFront: 20, maxFront: 30, minH: 12, maxH: 30, styles: ['plaster', 'concrete', 'brick'], colors: PASTELS, storefront: rng.chance(0.3), gapChance: 0.5 }, B);
      blk.ground = 'grass';
      for (let k = 0; k < 8; k++) PR.push({ kind: 'tree', x: ox + rng.float(36, 64), z: oz + rng.float(36, 64), s: rng.float(0.8, 1.3) });
      PR.push({ kind: 'bench', x: cx, z: cz, rot: rng.float(0, 3) });
      break;
    }
    case 'H': {
      blk.ground = 'grass';
      // two rows of houses facing north and south roads + side houses
      const lot = 19.5;
      for (const row of [{ face: 'n', z: oz + 26 }, { face: 's', z: oz + 74 }]) {
        for (let i = 0; i < 4; i++) {
          const x = ox + 11 + lot / 2 + i * lot;
          const w = rng.float(10, 13), d = rng.float(9, 12), h = rng.float(3.2, 6.6);
          B.push({ x, z: row.z, w, d, h, style: 'plaster', color: rng.pick(PASTELS), face: row.face, house: true, roofColor: rng.pick(ROOF_COLORS) });
          const ty = row.face === 'n' ? -12 : 12;
          if (rng.chance(0.8)) PR.push({ kind: 'tree', x: x + rng.float(-6, 6), z: row.z + ty * 0.85, s: rng.float(0.7, 1.1) });
          if (rng.chance(0.6)) PR.push({ kind: 'tree', x: x + rng.float(-6, 6), z: row.z - ty * 0.85, s: rng.float(0.8, 1.2) });
          blk.parking.push({ x: x + w / 2 + 2.2, z: row.z + (row.face === 'n' ? -7 : 7), rot: 0, driveway: true });
        }
      }
      break;
    }
    case 'I': {
      blk.ground = 'asphalt';
      const two = rng.chance(0.5);
      if (two) {
        B.push({ x: ox + 32, z: cz, w: 38, d: 64, h: rng.float(10, 14), style: 'industrial', color: rng.pick([0x8f9aa1, 0xa7a091, 0x7f8c8d]), face: 'w', sign: 'מחסני הנמל' });
        B.push({ x: ox + 74, z: oz + 34, w: 26, d: 40, h: rng.float(8, 12), style: 'industrial', color: rng.pick([0x9aa5ab, 0xb0a897]), face: 'e' });
      } else {
        B.push({ x: cx, z: oz + 34, w: 70, d: 36, h: rng.float(11, 16), style: 'industrial', color: rng.pick([0x8f9aa1, 0xa7a091]), face: 'n' });
      }
      PR.push({ kind: 'chimney', x: ox + rng.float(20, 80), z: oz + rng.float(70, 84), h: rng.float(22, 34) });
      for (let k = 0; k < 6; k++) {
        PR.push({ kind: 'container', x: ox + 55 + (k % 3) * 9.5, z: oz + 72 + Math.floor(k / 3) * 3.2, rot: 0, color: rng.pick([0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98]) });
      }
      parkingGrid(ox + 16, oz + 76, 8, 1, 0);
      break;
    }
    case 'P': {
      blk.ground = 'grass';
      blk.paths.push({ x: cx, z: cz, w: 4, d: 78 }, { x: cx, z: cz, w: 78, d: 4 });
      const hasPond = rng.chance(0.6);
      if (hasPond) PR.push({ kind: 'pond', x: ox + 70, z: oz + 30, r: 11 });
      let tries = 0, placed = 0;
      while (placed < 34 && tries < 300) {
        tries++;
        const x = ox + rng.float(14, 86), z = oz + rng.float(14, 86);
        if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5) continue;
        if (hasPond && Math.hypot(x - (ox + 70), z - (oz + 30)) < 15) continue;
        PR.push({ kind: 'tree', x, z, s: rng.float(0.8, 1.5) });
        placed++;
      }
      for (let k = 0; k < 4; k++) {
        PR.push({ kind: 'bench', x: cx + 4.2, z: oz + 20 + k * 20 + (k > 1 ? 4 : -4), rot: -Math.PI / 2 });
        PR.push({ kind: 'bench', x: ox + 20 + k * 20 + (k > 1 ? 4 : -4), z: cz - 4.2, rot: 0 });
      }
      break;
    }
    case 'G': {
      blk.ground = 'asphalt';
      PR.push({ kind: 'canopy', x: ox + 35, z: oz + 30, w: 22, d: 14 });
      for (let k = 0; k < 3; k++) PR.push({ kind: 'pump', x: ox + 28 + k * 7, z: oz + 30 });
      B.push({ x: ox + 70, z: oz + 26, w: 18, d: 12, h: 4.5, style: 'concrete', color: 0xf1f1f1, face: 'n', storefront: true, sign: 'דלק+' });
      B.push({ x: cx, z: oz + 78, w: 70, d: 18, h: rng.float(9, 15), style: 'plaster', color: rng.pick(PASTELS), face: 's', storefront: true, sign: rng.pick(SHOP_NAMES) });
      parkingGrid(ox + 18, oz + 52, 18, 1, 0);
      break;
    }
    case 'M': {
      blk.ground = 'asphalt';
      B.push({ x: ox + 32, z: oz + 30, w: 36, d: 26, h: 8, style: 'industrial', color: 0x6d7b84, face: 'n', garage: true, sign: 'מוסך אזורה' });
      B.push({ x: ox + 75, z: cz, w: 22, d: 60, h: rng.float(10, 18), style: 'brick', color: rng.pick(BRICK), face: 'e', storefront: true, sign: rng.pick(SHOP_NAMES) });
      parkingGrid(ox + 16, oz + 60, 12, 3, 0);
      break;
    }
    case 'T': {
      blk.ground = 'plaza';
      B.push({ x: cx, z: oz + 70, w: 64, d: 26, h: 16, style: 'glass', color: 0xc9d3db, face: 's', station: true, sign: 'תחנת רכבת מרכזית' });
      parkingGrid(ox + 18, oz + 20, 19, 2, 0);
      for (let k = 0; k < 5; k++) PR.push({ kind: 'tree', x: ox + 16 + k * 17, z: oz + 50, s: 1 });
      for (let k = 0; k < 3; k++) PR.push({ kind: 'bench', x: ox + 24 + k * 26, z: oz + 53, rot: 0 });
      break;
    }
  }

  // bus-stop style benches + trash bins along sidewalks of non-park blocks
  if (type !== 'P' && type !== 'H') {
    if (rng.chance(0.5)) PR.push({ kind: 'bench', x: cx + rng.float(-25, 25), z: oz + 9, rot: Math.PI });
    PR.push({ kind: 'bin', x: ox + 10, z: oz + 30 });
  }

  // Doors for later stages (enterable places) — front center of each building
  for (const b of B) {
    const [fx, fz] = faceVector(b.face);
    const half = (fx !== 0 ? b.w : b.d) / 2;
    b.door = { x: b.x + fx * (half + 0.3), z: b.z + fz * (half + 0.3), face: b.face };
  }
  return blk;
}

// ---------------------------------------------------------------------------
// Whole-city data (cheap) — generated once at startup
// ---------------------------------------------------------------------------
export function generateCity() {
  const blocks = [];
  for (let bz = 0; bz < N; bz++) for (let bx = 0; bx < N; bx++) blocks.push(generateBlock(bx, bz));

  // Special out-of-grid areas
  const extra = { buildings: [], props: [], parking: [] };
  // Airport
  extra.buildings.push({ x: -300, z: 552, w: 120, d: 40, h: 18, style: 'glass', color: 0xd0dbe3, face: 'n', sign: 'נמל התעופה אזורה', airport: true });
  extra.buildings.push({ x: -470, z: 600, w: 70, d: 50, h: 20, style: 'industrial', color: 0xb8c0c5, face: 'n', hangar: true });
  extra.props.push({ kind: 'tower', x: -400, z: 520, h: 34 });
  extra.props.push({ kind: 'helipad', x: -200, z: 560 });
  extra.props.push({ kind: 'plane', x: -470, z: 520, rot: Math.PI / 2 });
  extra.props.push({ kind: 'plane', x: -560, z: 560, rot: Math.PI / 2 + 0.3 });
  for (let k = 0; k < 14; k++) extra.parking.push({ x: -350 + k * 3.4, z: 515, rot: 0 });
  // Beach promenade benches, palm trees and lifeguard towers
  for (let z = 20; z < 1000; z += 32) {
    extra.props.push({ kind: 'palm', x: BEACH.promenadeX1 + 2, z, s: 1 });
    if ((z / 32) % 2 < 1) extra.props.push({ kind: 'bench', x: BEACH.promenadeX0 + 11, z: z + 16, rot: -Math.PI / 2 });
  }
  for (let z = 120; z < 1000; z += 220) extra.props.push({ kind: 'lifeguard', x: 1060, z });
  // Train platform roof + station
  extra.props.push({ kind: 'platformRoof', x: 500, z: (RAIL.platformZ0 + RAIL.platformZ1) / 2, w: 160, d: 14 });
  // Outskirts trees (north and west)
  const r = new RNG(99);
  for (let k = 0; k < 220; k++) {
    let x = r.float(-640, 1000), z = r.float(-150, -14);
    if (k > 140) { x = r.float(-690, -14); z = r.float(-150, 1150); if (x > AIRPORT.x0 - 10 && z > AIRPORT.z0 - 30 && z < AIRPORT.z1 + 10) continue; if (Math.abs(z - 500) < 12) continue; }
    extra.props.push({ kind: 'tree', x, z, s: r.float(0.9, 1.6) });
  }
  for (const b of extra.buildings) {
    const [fx, fz] = faceVector(b.face);
    const half = (fx !== 0 ? b.w : b.d) / 2;
    b.door = { x: b.x + fx * (half + 0.3), z: b.z + fz * (half + 0.3), face: b.face };
  }

  // Curb parking spots on road segments (not near intersections)
  const curb = [];
  const cr = new RNG(1234);
  for (let k = 0; k <= N; k++) {
    for (let s = 0; s < N; s++) {
      for (const side of [-1, 1]) {
        if (!cr.chance(0.35)) continue;
        const t = s * P + cr.float(22, 78);
        // road along x at z = k*P
        curb.push({ x: t, z: k * P + side * PARK_OFFSET, rot: side > 0 ? Math.PI / 2 : -Math.PI / 2, curb: true });
      }
      for (const side of [-1, 1]) {
        if (!cr.chance(0.35)) continue;
        const t = s * P + cr.float(22, 78);
        curb.push({ x: k * P + side * PARK_OFFSET, z: t, rot: side > 0 ? Math.PI : 0, curb: true });
      }
    }
  }
  return { blocks, extra, curb };
}

export function getBlock(city, bx, bz) {
  if (bx < 0 || bz < 0 || bx >= N || bz >= N) return null;
  return city.blocks[bz * N + bx];
}

export { faceVector };
