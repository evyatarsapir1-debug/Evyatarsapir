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

// --------------------------------------------------------------------------- furniture library
// Each piece is a list of boxes in its own frame: u = across (width), v = towards its front, y = up.
// Box: [u0, u1, v0, v1, y0, y1, color, material?]
const WOOD = 0x7a5233, DARKWOOD = 0x4e3423, WHITE = 0xf2f0ec, STEEL = 0xc9ced3;
const shade = (c, k = 0.85) => { const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k; return (r << 16) | (g << 8) | b; };
export const PIECES = {
  sofa: (c = 0x4a6fa5) => [[-1, 1, -0.45, 0.45, 0, 0.42, c], [-1, 1, -0.45, -0.22, 0.42, 0.86, c], [-1, -0.82, -0.45, 0.45, 0.42, 0.62, c], [0.82, 1, -0.45, 0.45, 0.42, 0.62, c],
    [-0.8, -0.02, -0.22, 0.42, 0.42, 0.52, shade(c, 1.12)], [0.02, 0.8, -0.22, 0.42, 0.42, 0.52, shade(c, 1.12)]],
  armchair: (c = 0x8a5a44) => [[-0.45, 0.45, -0.42, 0.42, 0, 0.42, c], [-0.45, 0.45, -0.42, -0.22, 0.42, 0.85, c], [-0.45, -0.32, -0.42, 0.42, 0.42, 0.6, c], [0.32, 0.45, -0.42, 0.42, 0.42, 0.6, c]],
  bed: (c = 0x5d8aa8) => [[-0.8, 0.8, -1.05, 1.05, 0, 0.3, DARKWOOD], [-0.78, 0.78, -1.0, 1.02, 0.3, 0.52, 0xf7f7f7], [-0.81, 0.81, -0.25, 1.05, 0.5, 0.57, c],
    [-0.8, 0.8, -1.12, -1.02, 0, 1.05, DARKWOOD], [-0.62, -0.06, -0.96, -0.6, 0.52, 0.65, 0xffffff], [0.06, 0.62, -0.96, -0.6, 0.52, 0.65, 0xffffff]],
  nightstand: () => [[-0.25, 0.25, -0.22, 0.22, 0, 0.5, WOOD], [-0.1, 0.1, -0.1, 0.1, 0.5, 0.75, 0xfff3d6, 'lamp']],
  tv: () => [[-0.85, 0.85, -0.22, 0.22, 0, 0.48, 0x3a3a3a], [-0.08, 0.08, -0.06, 0.0, 0.48, 0.58, 0x222222], [-0.7, 0.7, -0.05, 0.0, 0.58, 1.38, 0x0b0e13], [-0.66, 0.66, 0.0, 0.01, 0.62, 1.34, 0x1d3b5a, 'screen']],
  kitchen: (len = 2.6) => {
    const h = len / 2, out = [[-h, h - 0.8, -0.31, 0.31, 0, 0.88, WHITE], [-h, h - 0.8, -0.32, 0.32, 0.88, 0.92, 0x3b3b3b],
      [-h + 0.4, -h + 1.0, -0.2, 0.2, 0.92, 0.94, 0x111111], [h - 0.78, h, -0.34, 0.34, 0, 1.85, 0xdfe3e6], [-h, h - 0.8, -0.31, -0.02, 1.5, 2.15, WHITE],
      [-h + 1.3, -h + 1.8, -0.15, 0.15, 0.92, 0.95, STEEL]];
    return out;
  },
  table: () => [[-0.7, 0.7, -0.42, 0.42, 0.72, 0.77, WOOD], ...[[-0.65, -0.58], [0.58, 0.65]].flatMap(([u0, u1]) => [[u0, u1, -0.38, -0.31, 0, 0.72, DARKWOOD], [u0, u1, 0.31, 0.38, 0, 0.72, DARKWOOD]]),
    [-0.22, 0.22, -0.95, -0.55, 0, 0.45, 0x2f2f2f], [-0.22, 0.22, -0.98, -0.92, 0.45, 0.9, 0x2f2f2f], [-0.22, 0.22, 0.55, 0.95, 0, 0.45, 0x2f2f2f], [-0.22, 0.22, 0.92, 0.98, 0.45, 0.9, 0x2f2f2f]],
  coffee: () => [[-0.55, 0.55, -0.3, 0.3, 0.38, 0.43, WOOD], [-0.5, 0.5, -0.25, 0.25, 0, 0.38, DARKWOOD]],
  wardrobe: (c = 0x8b6b4a) => [[-0.6, 0.6, -0.3, 0.3, 0, 2.05, c], [-0.01, 0.01, 0.3, 0.31, 0.1, 1.95, 0x2a2a2a], [-0.12, -0.08, 0.31, 0.34, 0.9, 1.2, STEEL], [0.08, 0.12, 0.31, 0.34, 0.9, 1.2, STEEL]],
  lamp: () => [[-0.16, 0.16, -0.16, 0.16, 0, 0.04, 0x333333], [-0.025, 0.025, -0.025, 0.025, 0, 1.45, 0x333333], [-0.2, 0.2, -0.2, 0.2, 1.4, 1.72, 0xfff3d6, 'lamp']],
  desk: () => [[-0.7, 0.7, -0.35, 0.35, 0.72, 0.76, 0xe8e4dc], [-0.68, -0.62, -0.3, 0.3, 0, 0.72, 0x555555], [0.62, 0.68, -0.3, 0.3, 0, 0.72, 0x555555],
    [-0.3, 0.3, -0.3, -0.25, 0.8, 1.15, 0x111418], [-0.27, 0.27, -0.25, -0.24, 0.83, 1.12, 0x2a5a8a, 'screen'], [-0.25, 0.25, 0.45, 0.9, 0, 0.48, 0x333333], [-0.25, 0.25, 0.85, 0.9, 0.48, 0.95, 0x333333]],
  chair: (c = 0x2f2f2f) => [[-0.22, 0.22, -0.22, 0.22, 0, 0.45, c], [-0.22, 0.22, -0.26, -0.2, 0.45, 0.92, c]],
  bench: (c = 0x6b4a2f) => [[-0.95, 0.95, -0.25, 0.25, 0.38, 0.45, c], [-0.95, 0.95, -0.27, -0.21, 0.45, 0.85, c], [-0.9, -0.82, -0.2, 0.2, 0, 0.38, 0x333333], [0.82, 0.9, -0.2, 0.2, 0, 0.38, 0x333333]],
  seatrow: (c = 0x2e5d8a) => [[-1.5, 1.5, -0.25, 0.25, 0.38, 0.45, c], [-1.5, 1.5, -0.28, -0.22, 0.45, 0.9, c], [-1.45, 1.45, -0.05, 0.05, 0, 0.38, 0x9aa0a6],
    ...[-1.5, -0.9, -0.3, 0.3, 0.9, 1.5].map((u) => [u - 0.03, u + 0.03, -0.25, 0.2, 0.45, 0.62, 0x9aa0a6])],
  plant: () => [[-0.2, 0.2, -0.2, 0.2, 0, 0.4, 0xb5653d], [-0.35, 0.35, -0.35, 0.35, 0.4, 1.2, 0x3f7a32]],
  rug: (c = 0x9b3d3d) => [[-1.1, 1.1, -0.75, 0.75, 0, 0.012, c]],
  bookcase: () => [[-0.5, 0.5, -0.18, 0.18, 0, 1.9, WOOD], ...[0.35, 0.8, 1.25].map((y, i) => [-0.45, 0.45, -0.12, 0.17, y, y + 0.3, [0xa33b3b, 0x2e6da4, 0x3f8f4f][i]])],
  mailboxes: () => [[-1.0, 1.0, -0.15, 0.15, 0.9, 1.8, 0x8c939a], ...[0, 1, 2, 3].map((i) => [-0.95 + i * 0.5, -0.55 + i * 0.5, 0.15, 0.16, 1.35, 1.7, 0x5b6168])],
  desk_reception: () => [[-1.3, 1.3, -0.4, 0.4, 0, 1.05, 0x6b5a4a], [-1.35, 1.35, -0.45, 0.45, 1.05, 1.1, 0xd8d2c8]],
};
// Where a person sits / lies on each piece: [u, v, seatHeight, kind, faceOffset(rad, relative to the piece's front)]
export const SEATS = {
  sofa: [[-0.5, -0.05, 0.42, 'sit', 0], [0.5, -0.05, 0.42, 'sit', 0]],
  armchair: [[0, -0.05, 0.42, 'sit', 0]],
  bed: [[0, 0.95, 0.52, 'sleep', 0]],
  chair: [[0, -0.02, 0.45, 'sit', 0]],
  table: [[0, -0.8, 0.45, 'sit', 0], [0, 0.8, 0.45, 'sit', Math.PI]],
  desk: [[0, 0.72, 0.48, 'sit', Math.PI]],
  bench: [[-0.45, -0.02, 0.45, 'sit', 0], [0.45, -0.02, 0.45, 'sit', 0]],
  seatrow: [[-1.2, -0.02, 0.45, 'sit', 0], [-0.6, -0.02, 0.45, 'sit', 0], [0, -0.02, 0.45, 'sit', 0], [0.6, -0.02, 0.45, 'sit', 0], [1.2, -0.02, 0.45, 'sit', 0]],
};
export const SEAT_LABEL = { sofa: 'ספה', armchair: 'כורסה', bed: 'מיטה', chair: 'כיסא', table: 'כיסא', desk: 'כיסא', bench: 'ספסל', seatrow: 'כיסא המתנה' };
const DIR_VEC = (F, dir) => dir === '-d' ? [F.fx, F.fz] : dir === '+a' ? [-F.fz, F.fx] : dir === '-a' ? [F.fz, -F.fx] : [-F.fx, -F.fz];

function mapUV(u0, u1, v0, v1, dir) {
  switch (dir) {
    case '-d': return [-u1, -u0, -v1, -v0];
    case '+a': return [v0, v1, -u1, -u0];
    case '-a': return [-v1, -v0, u0, u1];
    default: return [u0, u1, v0, v1];
  }
}
// place a furniture piece at local (a, d), floor height y, facing dir ('+d' | '-d' | '+a' | '-a')
function piece(F, spec, kind, a, d, y, dir = '+d', arg, solid = true) {
  let ma0 = Infinity, ma1 = -Infinity, md0 = Infinity, md1 = -Infinity, my = 0;
  for (const [u0, u1, v0, v1, ya, yb, col, mat] of PIECES[kind](arg)) {
    const [A0, A1, D0, D1] = mapUV(u0, u1, v0, v1, dir);
    spec.boxes.push(boxFromRect(F.rect(a + A0, a + A1, d + D0, d + D1), y + ya, y + yb, col, mat || 'prop'));
    ma0 = Math.min(ma0, A0); ma1 = Math.max(ma1, A1); md0 = Math.min(md0, D0); md1 = Math.max(md1, D1); my = Math.max(my, yb);
  }
  if (solid && kind !== 'rug') spec.colliders.push(colFromRect(F.rect(a + ma0 + 0.03, a + ma1 - 0.03, d + md0 + 0.03, d + md1 - 0.03), y - 0.1, y + my, 'furniture'));
  if (SEATS[kind]) {
    const [vx, vz] = DIR_VEC(F, dir);
    const yaw = Math.atan2(vx, vz);
    for (const [u, v, h, k, off] of SEATS[kind]) {
      const [A0, , D0] = mapUV(u, u, v, v, dir);
      const [x, z] = F.pt(a + A0, d + D0);
      (spec.seats ||= []).push({ x, z, y, seatH: h, yaw: yaw + off, kind: k, label: SEAT_LABEL[kind] });
    }
  }
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
    spec.counter = { pt: F.pt(hl - cw / 2 - 0.6, D - 2.9), keeper: F.pt(hl - cw / 2 - 0.6, D - 1.0), yaw: Math.atan2(F.fx, F.fz), y: y0 };
    furn(hl - cw - 0.6, hl - 0.6, D - 2.2, D - 1.5, y0, y0 + 1.05, 0x7a5233);
    furn(hl - cw - 0.6, hl - 0.6, D - 2.25, D - 1.45, y0 + 1.05, y0 + 1.1, 0xd8d2c8, false);
    if (isCafe) {
      const n = Math.max(1, Math.min(4, Math.floor((L - 2) / 2.6)));
      for (let i = 0; i < n; i++) for (const dd of [2.2, 4.6]) {
        if (dd > D - 3) continue;
        const a = -hl + 1.6 + i * 2.6;
        furn(a - 0.45, a + 0.45, dd - 0.45, dd + 0.45, y0, y0 + 0.75, 0x6b4a2f);
        piece(F, spec, 'chair', a, dd - 0.8, y0, '+d', 0x2f2f2f, false);
        piece(F, spec, 'chair', a, dd + 0.8, y0, '-d', 0x2f2f2f, false);
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
    // ground floor: living room, kitchen, dining
    piece(F, spec, 'rug', -hl + 2.2, 2.7, y0, '+d', 0x8c3b3b, false);
    piece(F, spec, 'sofa', -hl + 2.2, 1.25, y0, '+d', 0x4a6fa5);
    piece(F, spec, 'coffee', -hl + 2.2, 2.6, y0, '+d');
    piece(F, spec, 'tv', -hl + 2.2, Math.min(D - 2.0, 4.6), y0, '-d');
    piece(F, spec, 'kitchen', hl - 0.35, Math.min(D - 2.4, 2.9), y0, '-a', Math.min(D - 2.6, 3.4));
    piece(F, spec, 'table', 1.2, D * 0.5, y0, '+d');
    piece(F, spec, 'armchair', -hl + 4.0, 2.4, y0, '-a', 0x8a5a44);
    piece(F, spec, 'plant', -hl + 0.45, 0.45, y0);
    piece(F, spec, 'bookcase', hl - 1.5, D - 0.25, y0, '-d');
    spec.home = { pt: F.pt(-hl + 2.2, 1.3), yaw: Math.atan2(-F.fx, -F.fz), y: y0, sit: true };
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
      piece(F, spec, 'bed', hl - 1.3, 1.25, y1, '+d', 0x5d8aa8);
      piece(F, spec, 'nightstand', hl - 2.45, 0.35, y1, '+d');
      piece(F, spec, 'wardrobe', -hl + 0.95, 0.4, y1, '+d');
      piece(F, spec, 'lamp', -hl + 0.4, D - 2.0, y1);
      piece(F, spec, 'desk', 0.4, 0.45, y1, '+d');
      lamp(0, D * 0.4, top - 0.03);
    }
  } else if (b.interior === 'hall') {
    const H = Math.min(b.h, 7);
    spec.door = { face: b.face, w: 3.0, h: 3.2 };
    shellColliders(b, y0 + H, spec.door, C);
    if (b.h > H) C.push(makeBox(b.x, b.z, b.w / 2, b.d / 2, 0, y0 + H, y0 + b.h));
    spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0, y1: y0 + H, wall: 0xe6e1d6, floor: 0xcfc8bb, ceil: 0xf2f2f2, door: spec.door, b });
    furn(-2, 2, D * 0.55, D * 0.55 + 1, y0, y0 + 1.1, 0x5a6e7f); // info desk
    spec.counter = { pt: F.pt(0, D * 0.55 - 0.9), keeper: F.pt(0, D * 0.55 + 1.7), yaw: Math.atan2(F.fx, F.fz), y: y0 };
    for (let a = -hl + 4; a < hl - 3; a += 6) for (const dd of [D * 0.25, D * 0.8]) {
      if (dd < 2 || dd > D - 1.5) continue;
      furn(a - 0.3, a + 0.3, dd - 0.3, dd + 0.3, y0, y0 + H, 0xd8d2c6); // pillars
    }
    for (let a = -hl + 3; a < hl - 4; a += 5) piece(F, spec, 'bench', a, D * 0.4, y0, '+d');
    for (let a = -hl + 3; a < hl; a += 7) for (let d = 3; d < D; d += 7) lamp(a, d, y0 + H - 0.03);
  } else if (b.interior === 'apartment' || b.interior === 'tower') {
    apartmentSpec(b, F, spec, piece, lamp, furn);
  } else if (b.interior === 'terminal') {
    terminalSpec(b, F, spec, piece, lamp, furn);
  } else if (b.interior === 'hangar') {
    hangarSpec(b, F, spec, piece, lamp, furn);
  } else if (b.interior === 'ctower') {
    ctowerSpec(b, F, spec, piece, lamp, furn);
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
    for (let a = -hl + 4; a < hl - 4; a += 9) { piece(F, spec, 'bench', a + 1, 3.3, y0, '+d'); piece(F, spec, 'plant', a + 3.5, 3.5, y0); }
    for (let a = -hl + 4; a < hl; a += 8) for (const d of [3, dm - 2, dm + 3, D - 5]) lamp(a, d, d < dm ? top - 0.03 : ym - 0.33);
  }
  b._spec = spec;
  return spec;
}

// --------------------------------------------------------------------------- airport terminal
// Check-in hall with islands, agents and baggage belts; flight boards; café, duty free and fashion shops with counters;
// restrooms; baggage-claim carousel; gate lounge with rows of seats facing a glass wall over the apron.
function terminalSpec(b, F, spec, piece, lamp, furn) {
  const C = spec.colliders, y0 = CURB_H, L = F.L, D = F.D, hl = L / 2, H = 12;
  spec.door = { face: b.face, w: 8, h: 3.4 };
  shellColliders(b, y0 + H, spec.door, C);
  C.push(makeBox(b.x, b.z, b.w / 2, b.d / 2, 0, y0 + H, y0 + b.h));
  C.push(colFromRect(F.rect(-hl, hl, 0, D), y0 + H - 0.2, y0 + H, 'slab'));
  spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0, y1: y0 + H, wall: 0xeef0f2, floor: 0xd9dcde, ceil: 0xf4f5f6, door: spec.door, b, glassBack: true });
  spec.counters = []; spec.staff = []; spec.belts = []; spec.boards = []; spec.wander = { points: [], n: 18 };
  const sign = (a, d, y, w, name, back = false) => { const [x, z] = F.pt(a, d); spec.signs.push({ x, y, z, nx: back ? -F.fx : F.fx, nz: back ? -F.fz : F.fz, w, name }); };
  const wp = (a, d) => spec.wander.points.push(F.pt(a, d));
  // structural columns
  for (let a = -hl + 15; a < hl - 5; a += 25) for (const d of [16, 33]) furn(a - 0.4, a + 0.4, d - 0.4, d + 0.4, y0, y0 + H, 0xdfe2e5);
  // check-in islands
  ['A', 'B', 'C'].forEach((n, i) => {
    const ac = -55 + i * 40;
    furn(ac - 7, ac + 7, 9.6, 10.4, y0, y0 + 1.05, 0x5b6876);                 // counter
    furn(ac - 7.1, ac + 7.1, 9.55, 10.45, y0 + 1.05, y0 + 1.1, 0xe0e3e6, false);
    furn(ac - 7, ac + 7, 12.0, 12.8, y0, y0 + 0.55, 0x2a2d31);                 // baggage belt
    spec.belts.push({ path: [F.pt(ac - 7, 12.4), F.pt(ac + 7, 12.4)], y: y0 + 0.55, loop: false });
    furn(ac - 7, ac + 7, 13.0, 13.2, y0, y0 + 2.6, 0x9aa3ad);                  // partition behind the belt
    for (let k = -2; k <= 2; k += 2) {
      spec.staff.push({ pt: F.pt(ac + k * 2.2, 11.2), yaw: Math.atan2(F.fx, F.fz), y: y0 });
      piece(F, spec, 'chair', ac + k * 2.2, 11.4, y0, '-d', 0x333333, false);
    }
    sign(ac, 9.5, y0 + 3.4, 5, 'צ׳ק-אין');
    wp(ac - 4, 6); wp(ac + 4, 6);
  });
  // flight information boards
  for (const a of [-80, 70]) spec.boards.push({ ...Object.fromEntries([['x', F.pt(a, 15.6)[0]], ['z', F.pt(a, 15.6)[1]]]), y: y0 + 4.2, w: 9, h: 4.4, nx: F.fx, nz: F.fz });
  // café
  const cafe = -75;
  furn(cafe - 6, cafe + 2, 26, 27, y0, y0 + 1.05, 0x7a5233);
  spec.counters.push({ pt: F.pt(cafe - 2, 25), keeper: F.pt(cafe - 2, 27.8), yaw: Math.atan2(F.fx, F.fz), y: y0, name: 'קפה טרמינל' });
  sign(cafe - 2, 25.9, y0 + 3.2, 5, 'קפה טרמינל');
  for (let i = 0; i < 3; i++) { piece(F, spec, 'table', cafe - 6 + i * 3.6, 21.5, y0, '+d'); }
  wp(cafe, 22);
  // duty free + fashion
  const shop = (ac, name, colors) => {
    furn(ac - 6, ac + 6, 27.5, 28, y0, y0 + 2.4, 0x8f98a2);
    for (let k = -1; k <= 1; k++) furn(ac + k * 3.5 - 1.2, ac + k * 3.5 + 1.2, 21.5, 22.2, y0, y0 + 1.6, colors[(k + 3) % colors.length]);
    furn(ac + 3, ac + 6, 25.2, 26, y0, y0 + 1.05, 0x5b6876);
    spec.counters.push({ pt: F.pt(ac + 4.5, 24.4), keeper: F.pt(ac + 4.5, 26.6), yaw: Math.atan2(F.fx, F.fz), y: y0, name });
    sign(ac, 27.4, y0 + 3.4, 6, name);
    wp(ac, 20);
  };
  shop(-45, 'דיוטי פרי', [0xc0392b, 0x8e44ad, 0x2e86c1]);
  shop(-20, 'אופנת אזורה', [0x27ae60, 0xf1c40f, 0xe67e22]);
  // restrooms (real room with a door and stalls)
  const ra0 = 52, ra1 = 68;
  const wallR = (a0, a1, d0, d1) => { const r = F.rect(a0, a1, d0, d1); spec.boxes.push(boxFromRect(r, y0, y0 + 3.2, 0xd5e1ea, 'wall')); C.push(colFromRect(r, y0, y0 + 3.2)); };
  wallR(ra0, ra0 + 0.15, 20, 29); wallR(ra1 - 0.15, ra1, 20, 29); wallR(ra0, ra1, 28.85, 29);
  wallR(ra0, 58.5, 20, 20.15); wallR(61.5, ra1, 20, 20.15);
  spec.boxes.push(boxFromRect(F.rect(ra0, ra1, 20, 29), y0 + 3.2, y0 + 3.3, 0xf2f2f2, 'wall'));
  for (let k = 0; k < 4; k++) { const a = ra0 + 1 + k * 3.6; furn(a, a + 0.08, 25.5, 28.8, y0, y0 + 2.1, 0x7f8c8d); furn(a + 0.6, a + 1.4, 28.2, 28.8, y0, y0 + 0.45, 0xffffff); }
  for (let k = 0; k < 3; k++) furn(ra0 + 2 + k * 4, ra0 + 3.2 + k * 4, 20.2, 20.7, y0 + 0.8, y0 + 0.95, 0xffffff);
  sign(60, 19.9, y0 + 3.6, 4, 'שירותים');
  // baggage claim carousel (oval loop)
  const cx = 30, cd = 36, cr = 2.2, cl = 6;
  furn(cx - cl, cx + cl, cd - cr, cd + cr, y0, y0 + 0.45, 0x2a2d31);
  furn(cx - cl + 0.6, cx + cl - 0.6, cd - cr + 0.6, cd + cr - 0.6, y0 + 0.45, y0 + 0.9, 0x9aa3ad);
  const loop = [];
  for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2; loop.push(F.pt(cx + Math.cos(t) * (cl - 0.4), cd + Math.sin(t) * (cr - 0.35))); }
  spec.belts.push({ path: loop, y: y0 + 0.45, loop: true });
  sign(cx, cd - cr - 0.2, y0 + 3.4, 5, 'מסוע מזוודות');
  wp(cx, cd - 4); wp(cx - 8, cd);
  // gate lounge: seat rows facing the glass wall, gate desks and signs
  [-60, 0, 60].forEach((ga, i) => {
    for (const d of [41, 44]) for (const o of [-7, -3.5, 3.5, 7]) piece(F, spec, 'seatrow', ga + o, d, y0, '+d', [0x2e5d8a, 0x8a2e3b, 0x2e8a5d][i]);
    furn(ga + 10, ga + 13, 46.5, 47.4, y0, y0 + 1.05, 0x5b6876);
    spec.staff.push({ pt: F.pt(ga + 11.5, 48.1), yaw: Math.atan2(F.fx, F.fz), y: y0 });
    sign(ga + 11.5, 47.5, y0 + 3.2, 3.2, `שער ${i + 1}`);
    wp(ga, 38); wp(ga + 9, 45);
  });
  // plants and benches near the entrance
  for (const a of [-30, 30]) { piece(F, spec, 'bench', a, 3, y0, '+d'); piece(F, spec, 'plant', a + 3, 2.5, y0); }
  for (let a = -hl + 6; a < hl; a += 12) for (const d of [5, 17, 30, 42]) lamp(a, d, y0 + H - 0.05);
  for (const a of [-20, 0, 20]) wp(a, 3);
  // taxi drivers waiting at the kerb outside
  spec.outdoor = [];
  for (let k = 0; k < 3; k++) { const [x, z] = [-343 + k * 14, 509.2]; spec.outdoor.push({ pt: [x, z], yaw: Math.PI, y: 0 }); }
}

function hangarSpec(b, F, spec, piece, lamp, furn) {
  const C = spec.colliders, y0 = CURB_H, L = F.L, D = F.D, hl = L / 2, H = 20;
  spec.door = { face: b.face, w: 46, h: 16 };
  shellColliders(b, y0 + H, spec.door, C);
  C.push(makeBox(b.x, b.z, b.w / 2, b.d / 2, 0, y0 + H, y0 + b.h));
  C.push(colFromRect(F.rect(-hl, hl, 0, D), y0 + H - 0.2, y0 + H, 'slab'));
  spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0, y1: y0 + H, wall: 0xc9ced3, floor: 0x9aa0a6, ceil: 0xb8bec4, door: spec.door, b });
  const [cx, cz] = F.pt(0, D * 0.5);
  spec.plane = { x: cx, z: cz, heading: Math.atan2(F.fx, F.fz) };   // a parked airliner in maintenance
  C.push(colFromRect(F.rect(-2.2, 2.2, D * 0.5 - 19, D * 0.5 + 19), 0, 5.5), colFromRect(F.rect(-17, 17, D * 0.5 - 2, D * 0.5 + 1.5), 2.2, 3.4));
  for (const a of [-hl + 4, hl - 4]) for (let d = 6; d < D - 4; d += 9) furn(a - 1, a + 1, d - 0.5, d + 0.5, y0, y0 + 1.2, 0xd35400);
  furn(-hl + 1, -hl + 7, D - 3, D - 1, y0, y0 + 2.2, 0x5b6876);
  piece(F, spec, 'desk', hl - 6, D - 3, y0, '-d');
  spec.counters = []; spec.staff = [{ pt: F.pt(hl - 6, D - 2), yaw: Math.atan2(F.fx, F.fz), y: y0 }];
  for (let a = -hl + 8; a < hl; a += 16) for (let d = 8; d < D; d += 14) lamp(a, d, y0 + H - 0.05);
}

// control tower: lobby + elevator straight up to the glass cab with radar consoles
function ctowerSpec(b, F, spec, piece, lamp, furn) {
  const C = spec.colliders, y0 = CURB_H, L = F.L, D = F.D, hl = L / 2;
  const top = y0 + b.h - 4.2;
  spec.door = { face: b.face, w: 1.8, h: 2.6 };
  shellColliders(b, y0 + b.h, spec.door, C);
  C.push(colFromRect(F.rect(-hl, hl, 0, D), y0 + b.h - 0.4, y0 + b.h, 'slab'));
  const sa0 = hl - 2.6, sd0 = D / 2 - 1.4, sd1 = D / 2 + 1.4;
  spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0, y1: y0 + 3.6, wall: 0xe6e1d6, floor: 0xc8c2b6, ceil: 0xf2f2f2, door: spec.door, b });
  spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0: top, y1: y0 + b.h - 0.4, wall: 0xdfe5ea, floor: null, ceil: 0xf2f2f2, door: null, b, glassAll: true });
  // lobby ceiling and cab floor (with the shaft opening)
  for (const [y, r] of [[y0 + 3.6, null], [top, true]]) {
    for (const rr of [F.rect(-hl, sa0, 0, D), F.rect(sa0, hl, 0, sd0), F.rect(sa0, hl, sd1, D)]) {
      if (r) { spec.surfaces.push(makeSurface(rr[0], rr[1], rr[2], rr[3], y)); spec.slabs.push({ rect: rr, y, color: 0x6b7480, under: 0xf2f2f2 }); }
      else spec.slabs.push({ rect: rr, y: y + 0.25, color: 0xf2f2f2, under: 0xf2f2f2 });
      C.push(colFromRect(rr, y - 0.25, y - 0.02, 'slab'));
    }
  }
  // the solid core between lobby and cab (only the shaft runs through it)
  C.push(colFromRect(F.rect(-hl, sa0, 0, D), y0 + 3.6, top - 0.3));
  const floors = [y0, top];
  const wallBox = (a0, a1, d0, d1, ya, yb) => { const r = F.rect(a0, a1, d0, d1); spec.boxes.push(boxFromRect(r, ya, yb, 0xb8b2a6, 'wall')); C.push(colFromRect(r, ya, yb)); };
  // shaft: full-height side walls, front wall with a door opening at each served floor
  const yTopShaft = top + 3.2;
  wallBox(sa0, hl, sd0 - 0.07, sd0 + 0.07, y0, yTopShaft); wallBox(sa0, hl, sd1 - 0.07, sd1 + 0.07, y0, yTopShaft);
  wallBox(sa0 - 0.07, sa0 + 0.07, sd0, D / 2 - 0.6, y0, yTopShaft); wallBox(sa0 - 0.07, sa0 + 0.07, D / 2 + 0.6, sd1, y0, yTopShaft);
  wallBox(sa0 - 0.07, sa0 + 0.07, D / 2 - 0.6, D / 2 + 0.6, y0 + 2.3, top);
  wallBox(sa0 - 0.07, sa0 + 0.07, D / 2 - 0.6, D / 2 + 0.6, top + 2.3, yTopShaft);
  furn(-2, 1, 1.5, 2.3, y0, y0 + 1.05, 0x5a6e7f);
  spec.staff = [{ pt: F.pt(-0.5, 3), yaw: Math.atan2(F.fx, F.fz), y: y0 }];
  // cab: consoles along the windows, controllers and radar screens
  furn(-hl + 0.3, hl - 3, 0.3, 1.1, top, top + 0.95, 0x3b4148);
  furn(-hl + 0.3, -hl + 1.1, 1.1, D - 0.3, top, top + 0.95, 0x3b4148);
  for (const a of [-3, 0, 3]) { furn(a - 0.6, a + 0.6, 0.5, 0.55, top + 0.95, top + 1.5, 0x1d4f2a, true, 'lamp'); piece(F, spec, 'chair', a, 1.7, top, '-d', 0x222222, false); }
  spec.staff.push({ pt: F.pt(-3, 1.75), yaw: Math.atan2(F.fx, F.fz), y: top, sit: true }, { pt: F.pt(3, 1.75), yaw: Math.atan2(F.fx, F.fz), y: top, sit: true });
  lamp(0, D / 2, y0 + 3.55); lamp(-2, D / 2, y0 + b.h - 0.45);
  const [rx, rz] = [-F.fz, F.fx];
  const ldoors = floors.map((y) => { const c = colFromRect(F.rect(sa0 - 0.08, sa0 + 0.08, D / 2 - 0.6, D / 2 + 0.6), y, y + 2.3, 'ldoor'); C.push(c); return c; });
  spec.floors = floors;
  spec.elevator = {
    floors, ldoors, cabin: F.rect(sa0 + 0.12, hl - 0.05, sd0 + 0.1, sd1 - 0.1), shaft: F.rect(sa0, hl, sd0, sd1),
    doorPt: F.pt(sa0 - 0.9, D / 2), doorCenter: F.pt(sa0, D / 2), insidePt: F.pt((sa0 + hl) / 2, D / 2),
    out: [-rx, -rz], lat: [-F.fx, -F.fz], width: 1.2, height: 2.3, labels: ['לובי', 'חדר פיקוח'],
  };
}

// --------------------------------------------------------------------------- apartment buildings & towers
// Lobby + elevator on the ground floor, then on every floor a central corridor with apartments on both sides.
// Each apartment has a living room (sofa, TV, kitchen, table) and a bedroom (bed, wardrobe, lamp).
export const FLOOR_H = 3.2;
function apartmentSpec(b, F, spec, piece, lamp, furn) {
  const C = spec.colliders, y0 = CURB_H, L = F.L, D = F.D, hl = L / 2;
  const usable = b.tower && b.setback ? b.h * 0.62 : b.h;
  const nF = Math.max(2, Math.min(b.tower ? 15 : 12, Math.floor((usable - 0.5) / FLOOR_H)));
  const topY = y0 + nF * FLOOR_H;
  const office = b.tower;
  spec.door = { face: b.face, w: 2.2, h: 2.7 };
  shellColliders(b, topY, spec.door, C);
  C.push(makeBox(b.x, b.z, b.w / 2, b.d / 2, 0, topY, y0 + b.h + 1));
  spec.rooms.push({ rect: F.rect(-hl, hl, 0, D), y0, y1: topY, wall: 0xeee8dc, floor: 0xc7b79c, ceil: 0xf6f6f6, door: spec.door, b });
  const cd0 = D / 2 - 1.0, cd1 = D / 2 + 1.0;            // corridor band
  const sa0 = hl - 2.6, sd0 = cd0 - 0.4, sd1 = cd1 + 0.4; // elevator shaft
  const WT = 0.14, wallC = 0xe7e1d6, corrC = 0xd9d2c4;
  const floors = [];
  for (let k = 0; k < nF; k++) floors.push(y0 + k * FLOOR_H);
  spec.floors = floors;
  const wallBox = (a0, a1, d0, d1, ya, yb, color) => {
    const r = F.rect(a0, a1, d0, d1);
    spec.boxes.push(boxFromRect(r, ya, yb, color, 'wall'));
    C.push(colFromRect(r, ya, yb));
  };
  // wall along the lateral axis at depth dc, from a0 to a1, with door gaps [{a, w}]
  const wallA = (a0, a1, dc, ya, yb, gaps, color) => {
    let a = a0;
    for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
      if (g.a - g.w / 2 > a) wallBox(a, g.a - g.w / 2, dc - WT / 2, dc + WT / 2, ya, yb, color);
      wallBox(g.a - g.w / 2, g.a + g.w / 2, dc - WT / 2, dc + WT / 2, ya + 2.25, yb, color);
      a = g.a + g.w / 2;
    }
    if (a1 > a) wallBox(a, a1, dc - WT / 2, dc + WT / 2, ya, yb, color);
  };
  const wallD = (d0, d1, ac, ya, yb, color) => wallBox(ac - WT / 2, ac + WT / 2, d0, d1, ya, yb, color);
  // units along the lateral axis
  const nU = Math.max(2, Math.round(L / 7.5));
  const uw = L / nU;
  const units = [];
  for (let i = 0; i < nU; i++) units.push([-hl + i * uw, -hl + (i + 1) * uw]);
  spec.homes = [];
  const furnishUnit = (u0, u1, dFac, dCor, y, k) => {
    // dFac: depth of the facade wall, dCor: depth of the corridor wall
    const s = Math.sign(dCor - dFac), um = (u0 + u1) / 2;
    const inward = s > 0 ? '+d' : '-d', back = s > 0 ? '-d' : '+d';
    const lm = (u0 + um) / 2, bm = (um + u1) / 2;
    const depth = Math.abs(dCor - dFac);
    const at = (t) => dFac + s * t;
    if (office) {
      piece(F, spec, 'desk', lm, at(1.3), y, back);
      piece(F, spec, 'desk', bm, at(1.3), y, back);
      piece(F, spec, 'plant', u0 + 0.5, at(0.5), y);
      piece(F, spec, 'bookcase', bm, at(depth - 0.45), y, back);
    } else {
      piece(F, spec, 'rug', lm, at(depth * 0.45), y, '+d', 0x7d5a8c, false);
      piece(F, spec, 'sofa', lm, at(0.75), y, inward, [0x4a6fa5, 0x8a5a44, 0x5b7f5a, 0x7a6f66][k % 4]);
      piece(F, spec, 'coffee', lm, at(1.9), y, inward);
      if (uw > 6.5) piece(F, spec, 'armchair', u0 + 1.45, at(1.15), y, '+a', 0x8a6a4a);
      if (depth > 5.5) piece(F, spec, 'tv', lm, at(depth - 2.0), y, back);
      piece(F, spec, 'kitchen', u0 + 0.38, at(depth * 0.5), y, '+a', Math.min(depth - 2.6, 3.0));
      piece(F, spec, 'bed', bm, at(1.2), y, inward, [0x5d8aa8, 0xa86f5d, 0x6d9a6a][k % 3]);
      piece(F, spec, 'wardrobe', u1 - 0.4, at(depth - 1.9), y, '-a');
      piece(F, spec, 'lamp', u1 - 0.35, at(0.35), y);
      spec.homes.push({ pt: F.pt(lm, at(0.85)), yaw: Math.atan2(-F.fx * s, -F.fz * s), y, floor: k, sit: true });
    }
    lamp(lm, at(depth * 0.5), y + FLOOR_H - 0.28);
    lamp(bm, at(depth * 0.5), y + FLOOR_H - 0.28);
    return { lm, s };
  };
  for (let k = 0; k < nF; k++) {
    const y = floors[k], yb = y + FLOOR_H - 0.25;
    // slab of this floor (k>0) with the shaft opening, plus the corridor floor tint
    if (k > 0) {
      const pieces = [F.rect(-hl, sa0, 0, D), F.rect(sa0, hl, 0, sd0), F.rect(sa0, hl, sd1, D)];
      for (const r of pieces) {
        spec.surfaces.push(makeSurface(r[0], r[1], r[2], r[3], y));
        spec.slabs.push({ rect: r, y, color: 0xc7b79c, under: 0xf6f6f6 });
        C.push(colFromRect(r, y - 0.25, y - 0.02, 'slab'));
      }
    }
    spec.boxes.push(boxFromRect(F.rect(-hl, sa0, cd0, cd1), y + 0.025, y + 0.035, corrC, 'wall'));
    // elevator shaft walls (doors are dynamic)
    wallA(sa0, hl, sd0, y, y + FLOOR_H, [], 0xb8b2a6);
    wallA(sa0, hl, sd1, y, y + FLOOR_H, [], 0xb8b2a6);
    wallBox(sa0 - WT / 2, sa0 + WT / 2, sd0, D / 2 - 0.6, y, y + FLOOR_H, 0xb8b2a6);
    wallBox(sa0 - WT / 2, sa0 + WT / 2, D / 2 + 0.6, sd1, y, y + FLOOR_H, 0xb8b2a6);
    wallBox(sa0 - WT / 2, sa0 + WT / 2, D / 2 - 0.6, D / 2 + 0.6, y + 2.3, y + FLOOR_H, 0xb8b2a6);
    lamp(-hl / 2, D / 2, yb - 0.03); lamp(hl / 2 - 1.5, D / 2, yb - 0.03);
    // back band: apartments on every floor
    const backGaps = [];
    units.forEach(([u0, u1], i) => {
      const { lm } = furnishUnit(u0, u1, D, cd1, y, k * 7 + i);
      backGaps.push({ a: lm, w: 1.0 });
      if (i > 0) wallD(cd1, D, u0, y, yb, wallC);
      wallD(cd1 + 1.4, D, (u0 + u1) / 2, y, yb, wallC); // living / bedroom partition
    });
    wallA(-hl, sa0, cd1, y, yb, backGaps, wallC);
    if (k === 0) {
      // lobby across the whole front band
      piece(F, spec, 'sofa', -hl / 2, 1.0, y, '+d', 0x5a6e7f);
      piece(F, spec, 'plant', -hl + 0.6, 0.6, y); piece(F, spec, 'plant', hl - 0.6, 0.6, y);
      piece(F, spec, 'mailboxes', -hl + 1.4, cd0 - 0.4, y, '+d');
      piece(F, spec, office ? 'desk_reception' : 'armchair', hl / 2, 1.6, y, '+d');
      spec.counter = { pt: F.pt(hl / 2, 0.6), keeper: F.pt(hl / 2, 2.4), yaw: Math.atan2(F.fx, F.fz), y: y0, lobby: true };
    } else {
      const frontGaps = [];
      units.forEach(([u0, u1], i) => {
        const { lm } = furnishUnit(u0, u1, 0, cd0, y, k * 5 + i);
        frontGaps.push({ a: lm, w: 1.0 });
        if (i > 0) wallD(0, cd0, u0, y, yb, wallC);
        wallD(0, cd0 - 1.4, (u0 + u1) / 2, y, yb, wallC);
      });
      wallA(-hl, sa0, cd0, y, yb, frontGaps, wallC);
    }
  }
  // top ceiling
  const topR = F.rect(-hl, hl, 0, D);
  C.push(colFromRect(topR, topY - 0.25, topY, 'slab'));
  // elevator description (world space)
  const [rx, rz] = [-F.fz, F.fx];
  const ldoors = floors.map((y) => {
    const c = colFromRect(F.rect(sa0 - 0.08, sa0 + 0.08, D / 2 - 0.6, D / 2 + 0.6), y, y + 2.3, 'ldoor');
    C.push(c);
    return c;
  });
  spec.elevator = {
    floors, ldoors,
    cabin: F.rect(sa0 + 0.12, hl - 0.05, sd0 + 0.1, sd1 - 0.1),
    shaft: F.rect(sa0, hl, sd0, sd1),
    doorPt: F.pt(sa0 - 0.9, D / 2), doorCenter: F.pt(sa0, D / 2),
    insidePt: F.pt((sa0 + hl) / 2, D / 2),
    out: [-rx, -rz],          // world direction from the shaft towards the corridor
    lat: [-F.fx, -F.fz],      // world direction along the door (depth axis)
    width: 1.2, height: 2.3,
  };
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
