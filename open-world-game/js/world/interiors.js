// Real interiors built inside the building's footprint (no teleport, no loading screen):
// door openings, inner walls, floors/ceilings, furniture, stairs to an upper floor, mall mezzanine,
// and a drivable multi-storey parking garage. Each spec yields colliders + walkable surfaces + render data.
import { makeBox, makeSurface } from '../physics/collision.js';
import { CURB_H, faceVector } from './layout.js';

const T = 0.3; // wall thickness
const CAFE = ['קפה', 'גלידת', 'מאפיית', 'פיצה', 'בורגר', 'סושי', 'פלאפל', 'מסעדת', 'יין'];
const CLOTHES = ['אופנת', 'בגדי', 'נעלי', 'תכשיטי', 'משקפי', 'מספרת'];

// local frame of a building relative to its door face:
//  a = lateral coordinate (-L/2..L/2), b = depth from the inner face of the front wall (0..D)
function frame(b) {
  const [fx, fz] = faceVector(b.face);
  const alongX = fz !== 0;                  // door on n/s face -> lateral axis is x
  const L = (alongX ? b.w : b.d) - 2 * T;   // inner lateral size
  const D = (alongX ? b.d : b.w) - 2 * T;   // inner depth
  const half = (alongX ? b.d : b.w) / 2;
  const ox = b.x + fx * (half - T), oz = b.z + fz * (half - T); // inner front wall center
  const rx = -fz, rz = fx;                  // lateral direction
  const pt = (a, d) => [ox + rx * a - fx * d, oz + rz * a - fz * d];
  // world-space axis-aligned rect from local ranges
  const rect = (a0, a1, d0, d1) => {
    const p = pt(a0, d0), q = pt(a1, d1);
    return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
  };
  return { fx, fz, alongX, L, D, pt, rect, lateralAxis: alongX ? 'x' : 'z', depthAxis: alongX ? 'z' : 'x' };
}

function boxFromRect(r, y0, y1, color, mat = 'prop') {
  return { x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2, w: r[2] - r[0], d: r[3] - r[1], y: y0, h: y1 - y0, color, mat };
}
function colFromRect(r, y0, y1, tag) {
  return makeBox((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, (r[2] - r[0]) / 2, (r[3] - r[1]) / 2, 0, y0, y1, tag);
}

// Outer walls as colliders, with a door opening on the front face
function shellColliders(b, top, door, out) {
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const walls = {
    n: [x0, z0, x1, z0 + T], s: [x0, z1 - T, x1, z1], w: [x0, z0, x0 + T, z1], e: [x1 - T, z0, x1, z1],
  };
  for (const [f, r] of Object.entries(walls)) {
    if (f !== b.face) { out.push(colFromRect(r, 0, top)); continue; }
    const horiz = f === 'n' || f === 's';
    const c = horiz ? b.x : b.z, hw = door.w / 2;
    const lo = horiz ? r[0] : r[1], hi = horiz ? r[2] : r[3];
    const pieceA = horiz ? [lo, r[1], c - hw, r[3]] : [r[0], lo, r[2], c - hw];
    const pieceB = horiz ? [c + hw, r[1], hi, r[3]] : [r[0], c + hw, r[2], hi];
    out.push(colFromRect(pieceA, 0, top), colFromRect(pieceB, 0, top));
    out.push(colFromRect(r, CURB_H + door.h, top, 'lintel'));
  }
}

export function interiorSpec(b) {
  if (b._spec) return b._spec;
  const F = frame(b);
  const y0 = CURB_H;
  const spec = { colliders: [], surfaces: [], boxes: [], rooms: [], stairs: [], slabs: [], lamps: [], signs: [], door: null };
  const C = spec.colliders;
  const furn = (a0, a1, d0, d1, ya, yb, color, solid = true, mat = 'prop') => {
    const r = F.rect(a0, a1, d0, d1);
    spec.boxes.push(boxFromRect(r, ya, yb, color, mat));
    if (solid) C.push(colFromRect(r, ya - 0.1, yb));
  };
  const lamp = (a, d, y) => { const [x, z] = F.pt(a, d); spec.lamps.push({ x, z, y }); };
  const L = F.L, D = F.D, hl = L / 2;

  if (b.interior === 'shop') {
    const H = b.storefront ? Math.min(4.2, b.h) : Math.min(3.6, b.h);
    spec.door = { face: b.face, w: 1.8, h: 2.6 };
    shellColliders(b, y0 + H, spec.door, C);
    if (b.h > H) C.push(makeBox(b.x, b.z, b.w / 2, b.d / 2, 0, y0 + H, y0 + b.h));
    spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0, y1: y0 + H, wall: 0xf1ece2, floor: 0xd9cbb0, ceil: 0xf7f7f7, door: spec.door, b });
    const isCafe = CAFE.some((k) => b.sign?.includes(k)), isClothes = CLOTHES.some((k) => b.sign?.includes(k));
    // counter near the back
    const cw = Math.min(3.2, L * 0.4);
    furn(hl - cw - 0.6, hl - 0.6, D - 2.2, D - 1.5, y0, y0 + 1.05, 0x7a5233);
    furn(hl - cw - 0.6, hl - 0.6, D - 2.25, D - 1.45, y0 + 1.05, y0 + 1.1, 0xd8d2c8, false);
    if (isCafe) {
      const n = Math.max(1, Math.min(4, Math.floor((L - 2) / 2.6)));
      for (let i = 0; i < n; i++) for (const dd of [2.2, 4.6]) {
        if (dd > D - 3) continue;
        const a = -hl + 1.6 + i * 2.6;
        furn(a - 0.45, a + 0.45, dd - 0.45, dd + 0.45, y0, y0 + 0.75, 0x6b4a2f);
        furn(a - 0.2, a + 0.2, dd + 0.6, dd + 1.0, y0, y0 + 0.45, 0x2f2f2f, false);
        furn(a - 0.2, a + 0.2, dd - 1.0, dd - 0.6, y0, y0 + 0.45, 0x2f2f2f, false);
      }
    } else if (isClothes) {
      for (let dd = 2; dd < D - 3; dd += 2.4) {
        furn(-hl + 0.4, -hl + 0.7, dd, dd + 1.8, y0 + 1.5, y0 + 1.6, 0x888888, false, 'metal');
        furn(-hl + 0.3, -hl + 0.9, dd + 0.1, dd + 1.7, y0 + 0.6, y0 + 1.5, [0xc0392b, 0x2e86c1, 0x27ae60, 0x8e44ad][Math.floor(dd) % 4]);
      }
      furn(-0.8, 0.8, D * 0.45, D * 0.45 + 0.8, y0, y0 + 0.9, 0xe0d6c8); // display table
      furn(hl - 0.15, hl - 0.05, 1.5, 2.6, y0 + 0.3, y0 + 2.2, 0xcfe3ef, false, 'glass'); // mirror
    } else {
      for (let a = -hl + 1.2; a < hl - cw - 1.5; a += 2.4) furn(a, a + 0.7, 1.8, Math.max(2.6, D - 3.2), y0, y0 + 1.8, [0x5d8aa8, 0xb35a3c, 0x6a994e][Math.floor(a + 20) % 3]);
    }
    for (let d = 1.8; d < D; d += 3.5) lamp(0, d, y0 + H - 0.03);
  } else if (b.interior === 'house') {
    const two = b.h >= 5.6;
    const H1 = two ? b.h / 2 : b.h;
    const top = y0 + b.h;
    spec.door = { face: b.face, w: 1.2, h: 2.2 };
    shellColliders(b, top, spec.door, C);
    C.push(makeBox(b.x, b.z, b.w / 2 + 0.5, b.d / 2 + 0.5, 0, top, top + Math.min(b.w, b.d) * 0.35, 'roof'));
    spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0, y1: y0 + H1, wall: 0xf3e9d8, floor: 0xb38a5c, ceil: 0xfafafa, door: spec.door, b });
    // ground floor furniture: sofa, coffee table, TV, kitchen counter, dining table
    furn(-hl + 0.4, -hl + 2.4, 1.2, 2.1, y0, y0 + 0.8, 0x4a6fa5);
    furn(-hl + 0.8, -hl + 2.0, 2.6, 3.3, y0, y0 + 0.45, 0x6b4a2f);
    furn(-hl + 0.6, -hl + 2.2, Math.min(D - 1.6, 4.6), Math.min(D - 1.6, 4.6) + 0.3, y0 + 0.4, y0 + 1.2, 0x1a1a1a);
    furn(hl - 0.7, hl - 0.05, 1.0, Math.min(D - 2, 4.4), y0, y0 + 0.92, 0xe8e2d6);
    furn(1.0 - 0.7, 1.0 + 0.7, D * 0.5 - 0.5, D * 0.5 + 0.5, y0, y0 + 0.76, 0x8b5a2b);
    lamp(0, D * 0.4, y0 + H1 - 0.03);
    if (two) {
      const y1 = y0 + H1;
      const run = Math.min(L - 3.2, H1 / 0.6);
      const sa0 = -hl + 0.1, sa1 = sa0 + run, sd0 = D - 1.25, sd1 = D;
      const sr = F.rect(sa0, sa1, sd0, sd1);
      // stairs rise along the lateral axis from sa0 (ground) to sa1 (upper floor)
      const p0 = F.pt(sa0, 0), p1 = F.pt(sa1, 0);
      const axis = F.lateralAxis;
      const startMin = axis === 'x' ? p0[0] < p1[0] : p0[1] < p1[1];
      const s = makeSurface(sr[0], sr[1], sr[2], sr[3], startMin ? y0 : y1, startMin ? y1 : y0, axis);
      spec.surfaces.push(s);
      spec.stairs.push({ rect: sr, y0, y1, axis, startMin, color: 0x9c7650 });
      // upper floor slab (minus the stair opening)
      const pieces = [F.rect(-hl, hl, 0, sd0), F.rect(sa1, hl, sd0, D)];
      for (const r of pieces) {
        spec.surfaces.push(makeSurface(r[0], r[1], r[2], r[3], y1));
        spec.slabs.push({ rect: r, y: y1, color: 0xb38a5c, under: 0xfafafa });
        C.push(colFromRect(r, y1 - 0.25, y1 - 0.02, 'slab'));
      }
      // railing around the stair opening
      furn(sa0, sa1, sd0 - 0.08, sd0, y1, y1 + 0.95, 0x6b4a2f, true);
      spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0: y1, y1: top, wall: 0xe9eef3, floor: null, ceil: 0xfafafa, door: null, b });
      // bedroom
      furn(hl - 2.2, hl - 0.2, 0.5, 2.1, y1, y1 + 0.55, 0xf2f2f2);
      furn(hl - 2.2, hl - 0.2, 0.3, 0.5, y1, y1 + 1.0, 0x6b4a2f);
      furn(-hl + 0.3, -hl + 1.0, 0.5, 2.3, y1, y1 + 2.0, 0x8b6b4a);
      lamp(0, D * 0.4, top - 0.03);
    }
  } else if (b.interior === 'hall') {
    const H = Math.min(b.h, 7);
    spec.door = { face: b.face, w: 3.0, h: 3.2 };
    shellColliders(b, y0 + H, spec.door, C);
    if (b.h > H) C.push(makeBox(b.x, b.z, b.w / 2, b.d / 2, 0, y0 + H, y0 + b.h));
    spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0, y1: y0 + H, wall: 0xe6e1d6, floor: 0xcfc8bb, ceil: 0xf2f2f2, door: spec.door, b });
    furn(-2, 2, D * 0.55, D * 0.55 + 1, y0, y0 + 1.1, 0x5a6e7f); // info desk
    for (let a = -hl + 4; a < hl - 3; a += 6) for (const dd of [D * 0.25, D * 0.8]) {
      if (dd < 2 || dd > D - 1.5) continue;
      furn(a - 0.3, a + 0.3, dd - 0.3, dd + 0.3, y0, y0 + H, 0xd8d2c6); // pillars
    }
    for (let a = -hl + 2; a < hl - 4; a += 5) furn(a, a + 2.2, D * 0.4, D * 0.4 + 0.6, y0, y0 + 0.5, 0x6b4a2f);
    for (let a = -hl + 3; a < hl; a += 7) for (let d = 3; d < D; d += 7) lamp(a, d, y0 + H - 0.03);
  } else if (b.interior === 'mall') {
    const H1 = 5, top = y0 + b.h - 0.5;
    spec.door = { face: b.face, w: 4, h: 3.4 };
    shellColliders(b, top, spec.door, C);
    C.push(colFromRect(F.rect(-hl, hl, 0, D), top, top + 0.5, 'slab'));
    spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0, y1: top, wall: 0xeeeae2, floor: 0xe4ddd0, ceil: 0xfafafa, door: spec.door, b });
    const ym = y0 + H1, dm = D / 2;
    // mezzanine (back half) + central staircase
    const mz = F.rect(-hl, hl, dm, D);
    spec.surfaces.push(makeSurface(mz[0], mz[1], mz[2], mz[3], ym));
    spec.slabs.push({ rect: mz, y: ym, color: 0xe4ddd0, under: 0xf5f5f5 });
    C.push(colFromRect(mz, ym - 0.3, ym - 0.02, 'slab'));
    const sr = F.rect(-1.8, 1.8, dm - H1 / 0.6, dm);
    const pa = F.pt(0, dm - H1 / 0.6), pb = F.pt(0, dm);
    const axis = F.depthAxis, startMin = axis === 'x' ? pa[0] < pb[0] : pa[1] < pb[1];
    spec.surfaces.push(makeSurface(sr[0], sr[1], sr[2], sr[3], startMin ? y0 : ym, startMin ? ym : y0, axis));
    spec.stairs.push({ rect: sr, y0, y1: ym, axis, startMin, color: 0xbdb5a6 });
    // glass railing along the mezzanine edge (open at the stairs)
    furn(-hl, -1.8, dm - 0.1, dm, ym, ym + 1.0, 0xbfd9e6, true, 'glass');
    furn(1.8, hl, dm - 0.1, dm, ym, ym + 1.0, 0xbfd9e6, true, 'glass');
    // shop units along the back wall on both levels, with signs
    const names = ['אופנת אזורה', 'נעלי הצעד', 'אלקטרו פלוס', 'תכשיטי אור', 'צעצועי קשת', 'ספרים ועוד', 'בורגר חוף', 'גלידת שקיעה'];
    let k = 0;
    for (const [ya, yb] of [[y0, y0 + H1 - 0.4], [ym, top - 1]]) {
      for (let a = -hl + 1; a + 7 < hl; a += 8.5) {
        furn(a, a + 7, D - 3, D, ya, yb, [0xd7c4a3, 0xb7c9d6, 0xd6b7b7, 0xc6d6b7][k % 4]);
        const [x, z] = F.pt(a + 3.5, D - 3.05);
        spec.signs.push({ x, y: yb - 1.0, z, nx: F.fx, nz: F.fz, w: 4, name: names[k % names.length] });
        k++;
      }
    }
    // benches and planters on the ground floor
    for (let a = -hl + 4; a < hl - 4; a += 9) { furn(a, a + 2, 3, 3.6, y0, y0 + 0.5, 0x6b4a2f); furn(a + 3, a + 4, 3, 4, y0, y0 + 0.9, 0x3f7a32); }
    for (let a = -hl + 4; a < hl; a += 8) for (const d of [3, dm - 2, dm + 3, D - 5]) lamp(a, d, d < dm ? top - 0.03 : ym - 0.33);
  }
  b._spec = spec;
  return spec;
}

// --------------------------------------------------------------------------- parking garage
export function garageSpec(g) {
  if (g._spec) return g._spec;
  const spec = { colliders: [], surfaces: [], parking: [], slabs: [], ramps: [], walls: [], pillars: [] };
  const C = spec.colliders;
  const x0 = g.x - g.w / 2, x1 = g.x + g.w / 2, z0 = g.z - g.d / 2, z1 = g.z + g.d / 2;
  const lv = (k) => CURB_H + k * g.levelH;
  const rz0 = g.z - 14, rz1 = g.z + 8;            // ramp z-range
  const W0 = [x0 + 1, x0 + 8], E0 = [x1 - 8, x1 - 1]; // west / east ramp strips
  const entrance = [g.x + 6, g.x + 18];               // ground floor opening on the north wall
  const wall = (r, ya, yb, tag) => { C.push(colFromRect(r, ya, yb, tag)); spec.walls.push({ rect: r, y0: ya, y1: yb }); };
  for (let k = 0; k < g.levels; k++) {
    const y = lv(k);
    // floor slab with ramp openings
    let pieces;
    if (k === 0) pieces = [];
    else if (k % 2 === 1) pieces = [[x0, z0, x1, rz0], [x0, rz1, x1, z1], [W0[1] + 0.5, rz0, x1, rz1]]; // hole over west strip
    else pieces = [[x0, z0, x1, rz0], [x0, rz1, x1, z1], [x0, rz0, E0[0] - 0.5, rz1]];                 // hole over east strip
    if (k === g.levels - 1 && k % 2 === 0) pieces = [[x0, z0, x1, rz0], [x0, rz1, x1, z1], [x0, rz0, E0[0] - 0.5, rz1]];
    for (const r of pieces) {
      spec.surfaces.push(makeSurface(r[0], r[1], r[2], r[3], y));
      spec.slabs.push({ rect: r, y });
      C.push(colFromRect(r, y - 0.35, y - 0.05, 'slab'));
    }
    // perimeter parapets (ground level: north wall has the vehicle entrance)
    const py0 = y, py1 = y + 1.05;
    if (k === 0) {
      wall([x0, z0, entrance[0], z0 + 0.3], py0 - 0.15, py1);
      wall([entrance[1], z0, x1, z0 + 0.3], py0 - 0.15, py1);
    } else wall([x0, z0, x1, z0 + 0.3], py0, py1);
    wall([x0, z1 - 0.3, x1, z1], py0 - (k ? 0 : 0.15), py1);
    wall([x0, z0, x0 + 0.3, z1], py0 - (k ? 0 : 0.15), py1);
    wall([x1 - 0.3, z0, x1, z1], py0 - (k ? 0 : 0.15), py1);
    // ramp from level k to k+1: odd ramps on the west strip going south, even on the east strip going north
    if (k < g.levels - 1) {
      const westRamp = k % 2 === 0;
      const sx = westRamp ? W0 : E0;
      const ya = y, yb = lv(k + 1);
      // west ramp: low end at north (rz0); east ramp: low end at south (rz1)
      const s = westRamp ? makeSurface(sx[0], rz0, sx[1], rz1, ya, yb, 'z') : makeSurface(sx[0], rz1, sx[1], rz0, ya, yb, 'z');
      spec.surfaces.push(s);
      spec.ramps.push({ x0: sx[0], x1: sx[1], z0: rz0, z1: rz1, ya, yb, lowAtNorth: westRamp });
      // inner side wall of the ramp (stops cars driving under / off the ramp sideways), plus rail at the hole's far end above
      const inner = westRamp ? [sx[1], rz0, sx[1] + 0.4, rz1] : [sx[0] - 0.4, rz0, sx[0], rz1];
      wall(inner, ya, yb + 1.05);
      const endRail = westRamp ? [x0, rz0 - 0.4, sx[1] + 0.4, rz0] : [sx[0] - 0.4, rz1, x1, rz1 + 0.4];
      wall(endRail, yb, yb + 1.05);
    }
    // pillars and parking bays
    for (let px = x0 + 12; px < x1 - 12; px += 10.8) {
      for (const pz of [g.z - 8, g.z + 8]) {
        if (k < g.levels - 1 || true) {
          C.push(makeBox(px, pz, 0.3, 0.3, 0, y, y + g.levelH));
          spec.pillars.push({ x: px, z: pz, y0: y, y1: k < g.levels - 1 ? lv(k + 1) : y + 1 });
        }
        for (const o of [2.1, 5.4, 8.7]) if (px + o < x1 - 10) spec.parking.push({ x: px + o, z: pz, rot: 0, y, garage: true });
      }
    }
  }
  g._spec = spec;
  return spec;
}
