// Streams the endless world around the player.
//  * Near chunks (200m squares) get full detail: ground, roads, sidewalks, buildings with real interiors,
//    props, lamps, traffic lights, bridges, tunnels, parking garage.
//  * Far chunks get a single low-detail 3D mesh (real boxes and terrain, not pictures) so the horizon is never empty.
//  * Physics (colliders + walkable surfaces) is loaded per 100m cell around the player independently of rendering.
// Everything is built progressively under a per-frame time budget.
import * as THREE from 'three';
import { GeoBuilder, mat } from './geoBuilder.js';
import { P, CURB_H, ROAD_HALF, SIDEWALK, RAIL, faceVector } from './layout.js';
import { signUV } from './textures.js';
import { cellData, cellPhysics, ridgeHeight, tunnelLines, RIDGE, TUNNEL_H, TUNNEL_HALF, WATER_Y, baseHeight, nodeNbrs, seaHeight, shoreDist } from './worldGen.js';
import { interiorSpec, garageSpec, doorFor } from './interiors.js';

const CH = 200;               // render chunk size (2x2 cells)
const STYLES = ['glass', 'office', 'concrete', 'plaster', 'brick', 'industrial', 'storefront'];

const G = {
  trunk: new THREE.CylinderGeometry(0.16, 0.26, 3, 6).translate(0, 1.5, 0),
  leaf: new THREE.IcosahedronGeometry(1.9, 0),
  leafSmall: new THREE.IcosahedronGeometry(1.4, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  boxB: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl16: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  disc: new THREE.CylinderGeometry(1, 1, 0.1, 24),
  torus: new THREE.TorusGeometry(1, 0.08, 6, 24).rotateX(Math.PI / 2),
  rock: new THREE.DodecahedronGeometry(1, 0),
  hay: new THREE.CylinderGeometry(0.8, 0.8, 1.4, 12).rotateZ(Math.PI / 2),
  lampPole: new THREE.CylinderGeometry(0.09, 0.14, 7, 6).translate(0, 3.5, 0),
  lampArm: new THREE.BoxGeometry(0.08, 0.08, 1.6).translate(0, 7, 0.8),
  lampHead: new THREE.BoxGeometry(0.35, 0.15, 0.6).translate(0, 6.95, 1.5),
  tlPole: new THREE.CylinderGeometry(0.1, 0.12, 5.2, 6).translate(0, 2.6, 0),
  tlArm: new THREE.BoxGeometry(6, 0.12, 0.12).translate(3, 5.1, 0),
  tlHead: new THREE.BoxGeometry(0.42, 1.25, 0.32).translate(5.6, 4.5, 0),
  bulb: new THREE.SphereGeometry(0.13, 8, 6),
};

// ---------------------------------------------------------------------------- props
function addProp(pb, p, lampB) {
  const y = p.y ?? CURB_H;
  switch (p.kind) {
    case 'tree': {
      const s = p.s || 1;
      pb.addGeometry(G.trunk, mat(p.x, y, p.z, 0, s, s, s), 0x6b4a2f);
      pb.addGeometry(G.leaf, mat(p.x, y + 3.6 * s, p.z, p.x, s * 1.1, s, s * 1.1), 0x3f7a32);
      pb.addGeometry(G.leafSmall, mat(p.x + 0.6 * s, y + 4.8 * s, p.z - 0.3 * s, p.z, s, s, s), 0x4f8f3a);
      break;
    }
    case 'palm': {
      const s = p.s || 1;
      pb.addGeometry(G.cyl, mat(p.x, y + 3.5 * s, p.z, 0, 0.35 * s, 7 * s, 0.35 * s, 0.05, 0.05), 0x8b6b45);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        pb.addGeometry(G.box, mat(p.x + Math.sin(a) * 1.6, y + 6.8 * s, p.z + Math.cos(a) * 1.6, a, 0.9, 0.08, 3.4, 0.35), 0x3d8a3a);
      }
      break;
    }
    case 'bench': {
      const r = p.rot || 0, c = Math.cos(r), s = Math.sin(r);
      const at = (lx, ly, lz) => [p.x + lx * c + lz * s, y + ly, p.z - lx * s + lz * c];
      let q = at(0, 0.45, 0); pb.addGeometry(G.box, mat(q[0], q[1], q[2], r, 1.7, 0.08, 0.5), 0x8a5a33);
      q = at(0, 0.75, 0.24); pb.addGeometry(G.box, mat(q[0], q[1], q[2], r, 1.7, 0.45, 0.06), 0x8a5a33);
      for (const lx of [-0.75, 0.75]) { q = at(lx, 0.22, 0); pb.addGeometry(G.box, mat(q[0], q[1], q[2], r, 0.08, 0.45, 0.5), 0x333333); }
      break;
    }
    case 'bin': pb.addGeometry(G.cyl, mat(p.x, y + 0.45, p.z, 0, 0.55, 0.9, 0.55), 0x2e5d3a); break;
    case 'pool': {
      // swimming pool: white stone coping, tiled walls, turquoise water and a steel ladder
      const hw = p.w / 2, hd = p.d / 2, c = 0.6;
      pb.addGeometry(G.box, mat(p.x, y + 0.1, p.z - hd - c / 2, 0, p.w + 2 * c, 0.14, c), 0xf2efe8);
      pb.addGeometry(G.box, mat(p.x, y + 0.1, p.z + hd + c / 2, 0, p.w + 2 * c, 0.14, c), 0xf2efe8);
      pb.addGeometry(G.box, mat(p.x - hw - c / 2, y + 0.1, p.z, 0, c, 0.14, p.d), 0xf2efe8);
      pb.addGeometry(G.box, mat(p.x + hw + c / 2, y + 0.1, p.z, 0, c, 0.14, p.d), 0xf2efe8);
      pb.addGeometry(G.box, mat(p.x, y + 0.05, p.z, 0, p.w, 0.04, p.d), 0x29b6e0);
      pb.addGeometry(G.box, mat(p.x, y + 0.075, p.z, 0, p.w - 0.3, 0.01, p.d - 0.3), 0x46cdf0);
      for (const dx of [-0.3, 0.3]) {
        pb.addGeometry(G.cyl, mat(p.x + hw - 1.2 + dx, y + 0.5, p.z - hd + 0.05, 0, 0.06, 0.9, 0.06), 0xd5d9dd);
        pb.addGeometry(G.box, mat(p.x + hw - 1.2 + dx, y + 0.95, p.z - hd - 0.12, 0, 0.06, 0.06, 0.35), 0xd5d9dd);
      }
      break;
    }
    case 'lounger': {
      const r = p.rot || 0, c = Math.cos(r), sn = Math.sin(r);
      const at = (lx, ly, lz) => [p.x + lx * c + lz * sn, y + ly, p.z - lx * sn + lz * c];
      let q = at(0, 0.32, 0.2); pb.addGeometry(G.box, mat(q[0], q[1], q[2], r, 0.7, 0.08, 1.5), 0xf4f1ea);
      q = at(0, 0.55, -0.75); pb.addGeometry(G.box, mat(q[0], q[1], q[2], r, 0.7, 0.08, 0.7, -0.75), 0xf4f1ea);
      q = at(0, 0.38, 0.2); pb.addGeometry(G.box, mat(q[0], q[1], q[2], r, 0.62, 0.05, 1.4), 0x2e86c1);
      for (const lx of [-0.3, 0.3]) for (const lz of [-0.6, 0.8]) { q = at(lx, 0.14, lz); pb.addGeometry(G.box, mat(q[0], q[1], q[2], r, 0.05, 0.28, 0.05), 0x9aa0a6); }
      break;
    }
    case 'parasol':
      pb.addGeometry(G.cyl, mat(p.x, y + 1.25, p.z, 0, 0.07, 2.5, 0.07), 0xdddddd);
      pb.addGeometry(G.cone, mat(p.x, y + 2.6, p.z, 0, 3.2, 0.6, 3.2), 0xf4f1ea);
      pb.addGeometry(G.cone, mat(p.x, y + 2.62, p.z, 0.4, 2.0, 0.42, 2.0), 0x2e86c1);
      break;
    case 'pier': {
      const L = p.x1 - p.x0, cx = (p.x0 + p.x1) / 2;
      pb.addGeometry(G.box, mat(cx, p.y - 0.06, p.z, 0, L, 0.12, 2.6), 0x9c7650);                 // deck
      for (let x = p.x0 + 0.6; x < p.x1; x += 1.2) pb.addGeometry(G.box, mat(x, p.y + 0.005, p.z, 0, 0.04, 0.01, 2.6), 0x6b4a2f); // plank gaps
      for (let x = p.x0 + 2; x <= p.x1; x += 4) for (const sz of [-1.2, 1.2]) pb.addGeometry(G.cyl, mat(x, p.y - 2.2, p.z + sz, 0, 0.22, 4.4, 0.22), 0x5a4030); // posts
      for (const sz of [-1.25, 1.25]) pb.addGeometry(G.box, mat(cx + L * 0.25, p.y + 0.5, p.z + sz, 0, L * 0.5, 0.06, 0.06), 0x6b4a2f); // rails (shore half)
      pb.addGeometry(G.cyl, mat(p.x1 - 0.5, p.y + 0.25, p.z + 1.1, 0, 0.18, 0.5, 0.18), 0x333333); // bollards
      pb.addGeometry(G.cyl, mat(p.x1 - 0.5, p.y + 0.25, p.z - 1.1, 0, 0.18, 0.5, 0.18), 0x333333);
      break;
    }
    case 'towel': {
      const r = p.rot || 0;
      pb.addGeometry(G.box, mat(p.x, y + 0.012, p.z, r, 1.0, 0.02, 2.0), p.color);
      pb.addGeometry(G.box, mat(p.x, y + 0.014, p.z, r, 1.0, 0.02, 0.18), 0xffffff);
      break;
    }
    case 'hedge':
      pb.addGeometry(G.box, mat(p.x, y + 0.75, p.z, 0, p.w, 1.5, p.d), 0x3b6e2e);
      pb.addGeometry(G.box, mat(p.x, y + 1.52, p.z, 0, p.w + 0.1, 0.06, p.d + 0.1), 0x4b8a3a);
      break;
    case 'container': pb.addGeometry(G.box, mat(p.x, y + 1.3, p.z, p.rot || 0, 6, 2.6, 2.4), p.color); break;
    case 'chimney':
      pb.addGeometry(G.cyl16, mat(p.x, y + p.h / 2, p.z, 0, 3.2, p.h, 3.2), 0x9c9a95);
      pb.addGeometry(G.cyl16, mat(p.x, y + p.h - 1.5, p.z, 0, 3.3, 1.2, 3.3), 0xb03a2e);
      pb.addGeometry(G.cyl16, mat(p.x, y + p.h - 4, p.z, 0, 3.3, 1.2, 3.3), 0xf2f2f2);
      break;
    case 'pump':
      pb.addGeometry(G.box, mat(p.x, y + 0.9, p.z, 0, 1, 1.8, 0.7), 0xd9d9d9);
      pb.addGeometry(G.box, mat(p.x, y + 1.6, p.z, 0, 1.02, 0.35, 0.72), 0xc0392b);
      break;
    case 'canopy':
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pb.addGeometry(G.box, mat(p.x + sx * (p.w / 2 - 1), y + 2.6, p.z + sz * (p.d / 2 - 1), 0, 0.5, 5.2, 0.5), 0xdddddd);
      pb.addGeometry(G.box, mat(p.x, y + 5.3, p.z, 0, p.w, 0.6, p.d), 0xf4f4f4);
      pb.addGeometry(G.box, mat(p.x, y + 5.3, p.z, 0, p.w + 0.1, 0.3, p.d + 0.1), 0xc0392b);
      break;
    case 'pond':
      pb.addGeometry(G.disc, mat(p.x, y + 0.03, p.z, 0, p.r, 1, p.r), 0x3f7f9f);
      pb.addGeometry(G.torus, mat(p.x, y + 0.08, p.z, 0, p.r, 2, p.r), 0x9a9488);
      break;
    case 'fountain':
      pb.addGeometry(G.cyl16, mat(p.x, y + 0.4, p.z, 0, 8.4, 0.8, 8.4), 0xcfc8bb);
      pb.addGeometry(G.disc, mat(p.x, y + 0.75, p.z, 0, 3.9, 1, 3.9), 0x5aa0c8);
      pb.addGeometry(G.cyl, mat(p.x, y + 2, p.z, 0, 1, 4, 1), 0xd8d0c2);
      pb.addGeometry(G.cyl16, mat(p.x, y + 3.6, p.z, 0, 3, 0.4, 3), 0xd8d0c2);
      break;
    case 'tower':
      pb.addGeometry(G.cyl16, mat(p.x, y + p.h / 2, p.z, 0, 4, p.h, 4), 0xe0e0e0);
      pb.addGeometry(G.cyl16, mat(p.x, y + p.h + 2, p.z, 0, 7, 4, 7), 0x35576f);
      pb.addGeometry(G.cyl16, mat(p.x, y + p.h + 4.3, p.z, 0, 7.6, 0.6, 7.6), 0xeeeeee);
      break;
    case 'helipad':
      pb.addGeometry(G.disc, mat(p.x, 0.04, p.z, 0, 10, 1, 10), 0x55595e);
      pb.addGeometry(G.torus, mat(p.x, 0.1, p.z, 0, 8.5, 1, 8.5), 0xf2d43a);
      pb.addGeometry(G.box, mat(p.x - 2, 0.1, p.z, 0, 0.8, 0.05, 6), 0xffffff);
      pb.addGeometry(G.box, mat(p.x + 2, 0.1, p.z, 0, 0.8, 0.05, 6), 0xffffff);
      pb.addGeometry(G.box, mat(p.x, 0.1, p.z, 0, 4, 0.05, 0.8), 0xffffff);
      break;
    case 'plane': {
      const r = p.rot;
      pb.addGeometry(G.cyl16, mat(p.x, 3, p.z, r, 3.2, 26, 3.2, Math.PI / 2), 0xf4f6f8);
      pb.addGeometry(G.box, mat(p.x, 2.4, p.z, r, 28, 0.3, 3.2), 0xdfe3e8);
      pb.addGeometry(G.box, mat(p.x - Math.sin(r) * 12, 6, p.z - Math.cos(r) * 12, r, 0.3, 5, 2.6), 0x1f5fa8);
      pb.addGeometry(G.box, mat(p.x - Math.sin(r) * 12, 4.2, p.z - Math.cos(r) * 12, r, 9, 0.25, 2), 0xdfe3e8);
      for (const s of [-1, 1]) pb.addGeometry(G.box, mat(p.x + Math.cos(r) * 2 * s, 0.7, p.z - Math.sin(r) * 2 * s, r, 0.3, 1.4, 0.3), 0x333333);
      break;
    }
    case 'lifeguard':
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pb.addGeometry(G.box, mat(p.x + sx, 1.2 - 0.6, p.z + sz, 0, 0.2, 3.6, 0.2), 0xffffff);
      pb.addGeometry(G.box, mat(p.x, 3.2, p.z, 0, 2.8, 1.8, 2.8), 0xe74c3c);
      pb.addGeometry(G.box, mat(p.x, 4.3, p.z, 0, 3.2, 0.25, 3.2), 0xf1c40f);
      break;
    case 'platformRoof':
      for (let k = -3; k <= 3; k++) pb.addGeometry(G.box, mat(p.x + k * (p.w / 7), y + 2.25, p.z, 0, 0.3, 4.5, 0.3), 0x8c9399);
      pb.addGeometry(G.box, mat(p.x, y + 4.6, p.z, 0, p.w, 0.3, p.d), 0x9aa3ab);
      break;
    case 'jetbridge': {
      // elevated walkway from the terminal to the aircraft door, on two legs
      pb.addGeometry(G.box, mat(p.x, 4.2, p.z, 0, 3.0, 2.8, 16), 0xb9c0c7);
      pb.addGeometry(G.box, mat(p.x, 4.2, p.z + 8.2, 0, 3.4, 3.2, 1.2), 0x8d959e);
      for (const dz of [-3, 4]) pb.addGeometry(G.box, mat(p.x, 1.4, p.z + dz, 0, 0.5, 2.8, 0.5), 0x6b7480);
      break;
    }
    case 'rlight': (lampB || pb).addGeometry(G.box, mat(p.x, 0.25, p.z, 0, 0.35, 0.3, 0.35), 0xffffff); break;
    case 'tline': pb.addGeometry(G.box, mat(p.x, 0.02, p.z, 0, 6, 0.02, 0.3), 0xf1c40f); break;
    case 'rock': pb.addGeometry(G.rock, mat(p.x, y + 0.5 * p.s, p.z, p.rot || 0, 1.3 * p.s, 0.9 * p.s, 1.1 * p.s), 0x8d877c); break;
    case 'hay': pb.addGeometry(G.hay, mat(p.x, y + 0.8, p.z, p.rot || 0, 1, 1, 1), 0xd8b45a); break;
    case 'umbrella':
      pb.addGeometry(G.cyl, mat(p.x, y + 1.2, p.z, 0, 0.08, 2.4, 0.08), 0xeeeeee);
      pb.addGeometry(G.cone, mat(p.x, y + 2.35, p.z, 0, 3.2, 0.6, 3.2), p.color);
      pb.addGeometry(G.box, mat(p.x + 1.4, y + 0.15, p.z, 0.3, 1.9, 0.12, 0.8), 0xffffff);
      break;
  }
}

// ---------------------------------------------------------------------------- building faces with optional door
const FACE = {
  s: (r) => ({ o: [r[0], r[3]], dir: [1, 0], len: r[2] - r[0] }),
  n: (r) => ({ o: [r[2], r[1]], dir: [-1, 0], len: r[2] - r[0] }),
  e: (r) => ({ o: [r[2], r[3]], dir: [0, -1], len: r[3] - r[1] }),
  w: (r) => ({ o: [r[0], r[1]], dir: [0, 1], len: r[3] - r[1] }),
};
function facePiece(bld, f, u0, u1, y0, y1, yBase, uS, vS, color, inward) {
  if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
  const a = [f.o[0] + f.dir[0] * u0, f.o[1] + f.dir[1] * u0], b = [f.o[0] + f.dir[0] * u1, f.o[1] + f.dir[1] * u1];
  const v0 = (y0 - yBase) / vS, v1 = (y1 - yBase) / vS;
  if (!inward) bld.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [u0 / uS, v0, u1 / uS, v0, u1 / uS, v1, u0 / uS, v1], color);
  else bld.quad([b[0], y0, b[1]], [a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [u1 / uS, v0, u0 / uS, v0, u0 / uS, v1, u1 / uS, v1], color);
}
// all four faces of rect; door (if any) is cut into face `door.face`, centered, starting at y0
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
function faces(bld, rect, y0, y1, uS, vS, color, door, inward = false, skip = null) {
  for (const k of ['n', 's', 'e', 'w']) {
    if (skip && (skip === 'all' || skip === k)) continue;
    const f = FACE[k](rect);
    if (door && door.face === k) {
      const c = f.len / 2, hw = door.w / 2, dh = Math.min(y1, y0 + door.h);
      facePiece(bld, f, 0, c - hw, y0, y1, y0, uS, vS, color, inward);
      facePiece(bld, f, c + hw, f.len, y0, y1, y0, uS, vS, color, inward);
      facePiece(bld, f, c - hw, c + hw, dh, y1, y0, uS, vS, color, inward);
    } else facePiece(bld, f, 0, f.len, y0, y1, y0, uS, vS, color, inward);
  }
}

function signQuad(signs, cx, cy, cz, nx, nz, sw, name) {
  const sh = sw / 4, rx = nz, rz = -nx;
  const [u0, v0, u1, v1] = signUV(name);
  signs.quad([cx - rx * sw / 2, cy, cz - rz * sw / 2], [cx + rx * sw / 2, cy, cz + rz * sw / 2],
    [cx + rx * sw / 2, cy + sh, cz + rz * sw / 2], [cx - rx * sw / 2, cy + sh, cz - rz * sw / 2], [u0, v0, u1, v0, u1, v1, u0, v1]);
}

function buildBuilding(b, out, B) {
  const f = (s) => out[s] ||= new GeoBuilder();
  const uS = 12, vS = 12.8;
  const rect = [b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2];
  const spec = b.interior ? { door: doorFor(b) } : null;
  const door = spec ? spec.door : null;
  if (b.house) {
    faces(f('plaster'), rect, CURB_H, CURB_H + b.h, uS, vS, b.color, door);
    const rb = f('houseRoof');
    const alongX = b.w >= b.d, y0 = CURB_H + b.h, rise = Math.min(b.w, b.d) * 0.35, o = 0.5;
    const x0 = rect[0] - o, x1 = rect[2] + o, z0 = rect[1] - o, z1 = rect[3] + o;
    const tri = [0, 0, 0.1, 0, 0.05, 0.1, 0.05, 0.1];
    if (alongX) {
      const zm = b.z;
      rb.quad([x0, y0, z1], [x1, y0, z1], [x1, y0 + rise, zm], [x0, y0 + rise, zm], [0, 0, b.w / 3, 0, b.w / 3, 2, 0, 2], b.roofColor);
      rb.quad([x1, y0, z0], [x0, y0, z0], [x0, y0 + rise, zm], [x1, y0 + rise, zm], [0, 0, b.w / 3, 0, b.w / 3, 2, 0, 2], b.roofColor);
      f('plaster').quad([rect[2], y0, rect[3]], [rect[2], y0, rect[1]], [rect[2], y0 + rise * 0.92, zm], [rect[2], y0 + rise * 0.92, zm], tri, b.color);
      f('plaster').quad([rect[0], y0, rect[1]], [rect[0], y0, rect[3]], [rect[0], y0 + rise * 0.92, zm], [rect[0], y0 + rise * 0.92, zm], tri, b.color);
    } else {
      const xm = b.x;
      rb.quad([x1, y0, z1], [x1, y0, z0], [xm, y0 + rise, z0], [xm, y0 + rise, z1], [0, 0, b.d / 3, 0, b.d / 3, 2, 0, 2], b.roofColor);
      rb.quad([x0, y0, z0], [x0, y0, z1], [xm, y0 + rise, z1], [xm, y0 + rise, z0], [0, 0, b.d / 3, 0, b.d / 3, 2, 0, 2], b.roofColor);
      f('plaster').quad([rect[2], y0, rect[1]], [rect[0], y0, rect[1]], [xm, y0 + rise * 0.92, rect[1]], [xm, y0 + rise * 0.92, rect[1]], tri, b.color);
      f('plaster').quad([rect[0], y0, rect[3]], [rect[2], y0, rect[3]], [xm, y0 + rise * 0.92, rect[3]], [xm, y0 + rise * 0.92, rect[3]], tri, b.color);
    }
    if (!door) {
      const [fx, fz] = faceVector(b.face);
      const dx = b.x + fx * (b.w / 2 + 0.03), dz = b.z + fz * (b.d / 2 + 0.03);
      B.props.addGeometry(G.box, mat(dx, CURB_H + 1.1, dz, fx !== 0 ? Math.PI / 2 : 0, 1.2, 2.2, 0.08), 0x5a3b26);
    }
  } else {
    let y = CURB_H;
    const top = CURB_H + b.h;
    const roof = f('roof');
    if (b.villa) {
      // modern villa: glass ground floor, white upper floor, deep flat-roof overhang, wood cladding, balcony
      const mid = CURB_H + b.h / 2;
      const [fx, fz] = faceVector(b.face), rx = -fz, rz = fx;
      const half = fx !== 0 ? b.w / 2 : b.d / 2, ry = fx !== 0 ? Math.PI / 2 : 0;
      const F0 = (a, out) => [b.x + fx * (half + out) + rx * a, b.z + fz * (half + out) + rz * a];
      faces(f('glass'), rect, CURB_H, mid, 3, 3.8, 0xcfe0ea, door);
      faces(f('plaster'), rect, mid, top, 40, 40, 0xf8f6f1, null);
      roof.floor(rect[0], rect[1], rect[2], rect[3], top, 0xdedbd4, 6);
      B.props.addGeometry(G.box, mat(b.x, top + 0.17, b.z, 0, b.w + 2.6, 0.34, b.d + 2.6), 0xf6f4ef);
      B.props.addGeometry(G.box, mat(b.x, mid + 0.12, b.z, 0, b.w + 0.9, 0.26, b.d + 0.9), 0xf1eee8);
      // ribbon windows on the upper floor (dark glass) on all four sides
      for (const [sx, sz, len] of [[0, -1, b.w], [0, 1, b.w], [-1, 0, b.d], [1, 0, b.d]]) {
        const cx = b.x + sx * (b.w / 2 + 0.03), cz = b.z + sz * (b.d / 2 + 0.03);
        B.props.addGeometry(G.box, mat(cx, mid + 1.9, cz, sx !== 0 ? Math.PI / 2 : 0, len * 0.62, 1.5, 0.06), 0x24394a);
      }
      // wood cladding block on the left of the front, stone base
      let q = F0(-b.w * 0.3, 0.1); B.props.addGeometry(G.box, mat(q[0], (mid + top) / 2, q[1], ry, b.w * 0.3, top - mid - 0.1, 0.2), 0x8a5a3b);
      B.props.addGeometry(G.box, mat(b.x, CURB_H + 0.2, b.z, 0, b.w + 0.3, 0.4, b.d + 0.3), 0x9c958a);
      // balcony over the entrance with glass railing
      q = F0(b.w * 0.18, 0.9); B.props.addGeometry(G.box, mat(q[0], mid + 0.12, q[1], ry, b.w * 0.42, 0.24, 1.8), 0xf1eee8);
      q = F0(b.w * 0.18, 1.75); B.props.addGeometry(G.box, mat(q[0], mid + 0.75, q[1], ry, b.w * 0.42, 1.0, 0.05), 0x9fc6dc);
      q = F0(b.w * 0.18, 1.75); B.props.addGeometry(G.box, mat(q[0], mid + 1.27, q[1], ry, b.w * 0.42, 0.05, 0.08), 0xc9ced3);
      // house-name plaque by the door + wall lights
      signQuad(B.signs, F0(2.3, 0.12)[0], CURB_H + 2.0, F0(2.3, 0.12)[1], fx, fz, 1.6, b.sign);
      for (const s2 of [-1, 1]) { q = F0(s2 * 1.6, 0.12); B.props.addGeometry(G.box, mat(q[0], CURB_H + 2.4, q[1], ry, 0.18, 0.32, 0.12), 0xfff3d0); }
    } else if (b.storefront) {
      const sh = Math.min(4.2, b.h);
      faces(f('storefront'), rect, y, y + sh, 6, 4, 0xffffff, door);
      y += sh;
      if (top > y) faces(f(b.style), rect, y, top, uS, vS, b.color, null);
    } else if (b.tower && b.setback) {
      const mid = CURB_H + b.h * 0.62;
      faces(f(b.style), rect, y, mid, uS, vS, b.color, door);
      roof.floor(rect[0], rect[1], rect[2], rect[3], mid, 0xbbbbbb, 6);
      const w2 = b.w * 0.72, d2 = b.d * 0.72;
      faces(f(b.style), [b.x - w2 / 2, b.z - d2 / 2, b.x + w2 / 2, b.z + d2 / 2], mid, top, uS, vS, b.color, null);
      roof.floor(b.x - w2 / 2, b.z - d2 / 2, b.x + w2 / 2, b.z + d2 / 2, top, 0xbbbbbb, 6);
      B.props.addGeometry(G.cyl, mat(b.x, top + 8, b.z, 0, 0.4, 16, 0.4), 0xdddddd);
      B.props.addGeometry(G.box, mat(b.x, top + 16.2, b.z, 0, 0.6, 0.6, 0.6), 0xff3b30);
    } else {
      faces(f(b.style), rect, y, top, uS, vS, b.color, door);
    }
    // balconies on residential facades (aligned with the window bays of the facade texture)
    if (!b.storefront && !b.tower && ['plaster', 'brick', 'concrete'].includes(b.style) && b.h >= 9) {
      const [fx, fz] = faceVector(b.face);
      const half = fx !== 0 ? b.w / 2 : b.d / 2, len = fx !== 0 ? b.d : b.w;
      const rx = -fz, rz = fx;
      for (let fy = CURB_H + 3.2; fy < top - 2.5; fy += 3.2) {
        for (let u = 1.5; u < len - 1.5; u += 6) {
          const a = u - len / 2;
          if (b.interior && fy < CURB_H + 3.3 && Math.abs(a) < 2.5) continue;
          const cx = b.x + fx * (half + 0.6) + rx * a, cz = b.z + fz * (half + 0.6) + rz * a;
          const ry = fx !== 0 ? Math.PI / 2 : 0;
          B.props.addGeometry(G.box, mat(cx, fy + 0.3, cz, ry, 2.4, 0.12, 1.2), 0xd8d2c6);
          B.props.addGeometry(G.box, mat(cx + fx * 0.58, fy + 0.85, cz + fz * 0.58, ry, 2.4, 0.06, 0.05), 0x5b6168);
          for (const s of [-1, 1]) B.props.addGeometry(G.box, mat(cx + rx * s * 1.18, fy + 0.6, cz + rz * s * 1.18, ry, 0.05, 0.6, 1.2), 0x5b6168);
          B.props.addGeometry(G.box, mat(cx + fx * 0.58, fy + 0.6, cz + fz * 0.58, ry, 2.36, 0.5, 0.02), 0x8fa3b0);
        }
      }
    }
    if (!(b.tower && b.setback) && !b.villa) {
      roof.floor(rect[0], rect[1], rect[2], rect[3], top, 0xaaaaaa, 6);
      faces(f('concrete'), [rect[0] - 0.15, rect[1] - 0.15, rect[2] + 0.15, rect[3] + 0.15], top, top + 0.8, 60, 60, 0xcfcac2, null);
      if (b.h > 12 && b.w > 12 && b.d > 12) {
        faces(f('concrete'), [b.x + b.w * 0.15 - 2.5, b.z - b.d * 0.1 - 2, b.x + b.w * 0.15 + 2.5, b.z - b.d * 0.1 + 2], top, top + 3, 60, 60, 0xbab5ad, null);
        roof.floor(b.x + b.w * 0.15 - 2.5, b.z - b.d * 0.1 - 2, b.x + b.w * 0.15 + 2.5, b.z - b.d * 0.1 + 2, top + 3, 0x999999, 6);
      }
    }
    const [fx, fz] = faceVector(b.face);
    const half = fx !== 0 ? b.w / 2 : b.d / 2;
    const frontLen = fx !== 0 ? b.d : b.w;
    if (b.garage && !door) B.props.addGeometry(G.box, mat(b.x + fx * (half + 0.05), CURB_H + 2.6, b.z + fz * (half + 0.05), fx !== 0 ? Math.PI / 2 : 0, 10, 5.2, 0.1), 0x2a2d30);
    if (b.sign && !b.villa) {
      const tall = b.station || b.airport || b.mall || (b.tower && b.sign);
      const sw = tall ? Math.min(frontLen * 0.6, 24) : Math.min(frontLen * 0.7, 7);
      const sh = sw / 4;
      const sy = tall ? (b.tower ? top * 0.62 - sh - 2 : top - sh - 1) : CURB_H + 4.25;
      signQuad(B.signs, b.x + fx * (half + 0.15), sy, b.z + fz * (half + 0.15), fx, fz, sw, b.sign);
    }
  }
  if (spec) buildDoorFrame(spec, b, B);
}

function buildDoorFrame(spec, b, B) {
  const [fx, fz] = faceVector(b.face);
  const half = fx !== 0 ? b.w / 2 : b.d / 2;
  const cx = b.x + fx * (half - 0.15), cz = b.z + fz * (half - 0.15), rx = -fz, rz = fx, hw = spec.door.w / 2;
  const ry = fx !== 0 ? Math.PI / 2 : 0;
  for (const s of [-1, 1]) B.props.addGeometry(G.box, mat(cx + rx * s * (hw + 0.06), CURB_H + spec.door.h / 2, cz + rz * s * (hw + 0.06), ry, 0.12, spec.door.h, 0.42), 0x3b3f44);
  B.props.addGeometry(G.box, mat(cx, CURB_H + spec.door.h + 0.06, cz, ry, spec.door.w + 0.24, 0.12, 0.42), 0x3b3f44);
  if (b.interior === 'apartment' || b.interior === 'tower' || b.interior === 'hall' || b.interior === 'mall') {
    // entrance canopy
    B.props.addGeometry(G.box, mat(b.x + fx * (half + 1.2), CURB_H + spec.door.h + 0.45, b.z + fz * (half + 1.2), ry, spec.door.w + 2.2, 0.18, 2.4), 0x50565c);
  }
}

// Interior geometry (built on demand by the InteriorManager when the player is close)
export function buildInterior(spec, b, B) {
  const I = B.interior;
  for (const r of spec.rooms) {
    faces(I, r.rect, r.y0, r.y1, 3, 3, r.wall, r.door, true, r.glassAll ? 'all' : r.glassBack ? OPP[b.face] : null);
    if (r.floor !== null) I.floor(r.rect[0], r.rect[1], r.rect[2], r.rect[3], r.y0 + 0.02, r.floor, 2);
    const [x0, z0, x1, z1] = r.rect, y = r.y1 - 0.01;
    I.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 0, 1, 0, 1, 1, 0, 1], r.ceil);
  }
  if (spec.door) {
    const [fx, fz] = faceVector(b.face);
    const half = fx !== 0 ? b.w / 2 : b.d / 2;
    const cx = b.x + fx * (half - 0.15), cz = b.z + fz * (half - 0.15);
    B.props.addGeometry(G.box, mat(cx - fx * 1.0, CURB_H + 0.03, cz - fz * 1.0, fx !== 0 ? Math.PI / 2 : 0, spec.door.w, 0.02, 1.2), 0x6b2e2e);
  }
  for (const s of spec.slabs) {
    const [x0, z0, x1, z1] = s.rect;
    I.floor(x0, z0, x1, z1, s.y, s.color, 2);
    const yb = s.y - 0.25;
    I.quad([x0, yb, z0], [x1, yb, z0], [x1, yb, z1], [x0, yb, z1], [0, 0, 1, 0, 1, 1, 0, 1], s.under);
  }
  for (const st of spec.stairs) buildStairs(B.props, st);
  for (const bx of spec.boxes) {
    const target = bx.mat === 'glass' ? B.glass : bx.mat === 'lamp' ? B.lamp : bx.mat === 'wall' ? B.interior : B.props;
    target.addGeometry(G.boxB, mat(bx.x, bx.y, bx.z, 0, bx.w, bx.h, bx.d), bx.color);
  }
  for (const l of spec.lamps) B.lamp.addGeometry(G.box, mat(l.x, l.y - 0.03, l.z, 0, 0.9, 0.05, 0.9), 0xffffff);
  for (const s of spec.signs) signQuad(B.signs, s.x + s.nx * 0.05, s.y, s.z + s.nz * 0.05, s.nx, s.nz, s.w, s.name);
}

function buildStairs(pb, st) {
  const n = Math.max(4, Math.round((st.y1 - st.y0) / 0.18));
  const [x0, z0, x1, z1] = st.rect;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const h = (st.y1 - st.y0) * t1;
    let a0, a1;
    if (st.axis === 'x') {
      const L = x1 - x0; a0 = st.startMin ? x0 + L * t0 : x1 - L * t1; a1 = a0 + L / n;
      pb.addGeometry(G.boxB, mat((a0 + a1) / 2, st.y0, (z0 + z1) / 2, 0, a1 - a0, h, z1 - z0), st.color);
    } else {
      const L = z1 - z0; a0 = st.startMin ? z0 + L * t0 : z1 - L * t1; a1 = a0 + L / n;
      pb.addGeometry(G.boxB, mat((x0 + x1) / 2, st.y0, (a0 + a1) / 2, 0, x1 - x0, h, a1 - a0), st.color);
    }
  }
}

function buildGarage(g, B) {
  const spec = garageSpec(g);
  const C = B.props, conc = 0xb8b4ac;
  for (const s of spec.slabs) C.addGeometry(G.boxB, mat((s.rect[0] + s.rect[2]) / 2, s.y - 0.3, (s.rect[1] + s.rect[3]) / 2, 0, s.rect[2] - s.rect[0], 0.3, s.rect[3] - s.rect[1]), 0xa9a59d);
  for (const w of spec.walls) C.addGeometry(G.boxB, mat((w.rect[0] + w.rect[2]) / 2, w.y0, (w.rect[1] + w.rect[3]) / 2, 0, w.rect[2] - w.rect[0], w.y1 - w.y0, w.rect[3] - w.rect[1]), conc);
  for (const p of spec.pillars) C.addGeometry(G.boxB, mat(p.x, p.y0, p.z, 0, 0.6, p.y1 - p.y0, 0.6), 0xc9c5bd);
  for (const r of spec.ramps) {
    const yN = r.lowAtNorth ? r.ya : r.yb, yS = r.lowAtNorth ? r.yb : r.ya;
    C.quad([r.x0, yS + 0.01, r.z1], [r.x1, yS + 0.01, r.z1], [r.x1, yN + 0.01, r.z0], [r.x0, yN + 0.01, r.z0], [0, 0, 1, 0, 1, 1, 0, 1], 0x8f8b84);
    C.quad([r.x0, yN - 0.3, r.z0], [r.x1, yN - 0.3, r.z0], [r.x1, yS - 0.3, r.z1], [r.x0, yS - 0.3, r.z1], [0, 0, 1, 0, 1, 1, 0, 1], 0x9a968e);
  }
  // painted bay lines on each level
  for (const p of spec.parking) C.addGeometry(G.box, mat(p.x - 1.7, p.y + 0.02, p.z, 0, 0.08, 0.01, 4.8), 0xf2f2f2);
  signQuad(B.signs, g.x + 12, CURB_H + 3.6, g.z - g.d / 2 - 0.1, 0, -1, 8, 'חניון');
}

// ---------------------------------------------------------------------------- ridge + tunnels
function buildRidge(cd, B) {
  const r = cd.ridge;
  const tl = tunnelLines(r.x0 - 12, r.x1 + 12).filter((L) => L >= RIDGE.x0 && L <= RIDGE.x1);
  const xs = new Set();
  for (let x = r.x0; x <= r.x1 + 0.01; x += 5) xs.add(+x.toFixed(2));
  xs.add(r.x1);
  for (const L of tl) for (const o of [-12, -TUNNEL_HALF - 0.6, TUNNEL_HALF + 0.6, 12]) if (L + o > r.x0 && L + o < r.x1) xs.add(L + o);
  const X = [...xs].sort((a, b) => a - b);
  const zs = new Set([r.z0, r.z1]);
  for (const zz of [RIDGE.z0, RIDGE.z0 + 1, RIDGE.z0 + 2.5, RIDGE.z0 + 4, RIDGE.z1 - 4, RIDGE.z1 - 2.5, RIDGE.z1 - 1, RIDGE.z1]) if (zz >= r.z0 && zz <= r.z1) zs.add(zz);
  for (let z = Math.ceil(r.z0 / 8) * 8; z < r.z1; z += 8) zs.add(z);
  const Z = [...zs].sort((a, b) => a - b);
  const inBore = (x) => tl.some((L) => Math.abs(x - L) <= TUNNEL_HALF + 0.7);
  const h = (x, z) => {
    let y = ridgeHeight(x, z);
    if (inBore(x)) y = Math.max(y, TUNNEL_H + 1.2);
    return y;
  };
  const rb = B.rock;
  const col = (y) => (y > 30 ? 0xc9c3b8 : y > 12 ? 0xb3a48c : 0x9aa07a);
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
    const xa = X[i], xb = X[i + 1], za = Z[j], zb = Z[j + 1];
    const ya = h(xa, zb), yb = h(xb, zb), yc = h(xb, za), yd = h(xa, za);
    if (ya + yb + yc + yd < 0.05) continue;
    rb.quad([xa, ya, zb], [xb, yb, zb], [xb, yc, za], [xa, yd, za], [xa / 8, -zb / 8, xb / 8, -zb / 8, xb / 8, -za / 8, xa / 8, -za / 8], col((ya + yc) / 2));
  }
  for (const L of tl) {
    const z0 = Math.max(r.z0, RIDGE.z0), z1 = Math.min(r.z1, RIDGE.z1);
    const I = B.interior;
    // bore walls, ceiling and lights
    I.quad([L - TUNNEL_HALF, 0, z1], [L - TUNNEL_HALF, 0, z0], [L - TUNNEL_HALF, TUNNEL_H, z0], [L - TUNNEL_HALF, TUNNEL_H, z1], [0, 0, 1, 0, 1, 1, 0, 1], 0xcfcbc2);
    I.quad([L + TUNNEL_HALF, 0, z0], [L + TUNNEL_HALF, 0, z1], [L + TUNNEL_HALF, TUNNEL_H, z1], [L + TUNNEL_HALF, TUNNEL_H, z0], [0, 0, 1, 0, 1, 1, 0, 1], 0xcfcbc2);
    I.quad([L - TUNNEL_HALF, TUNNEL_H, z0], [L + TUNNEL_HALF, TUNNEL_H, z0], [L + TUNNEL_HALF, TUNNEL_H, z1], [L - TUNNEL_HALF, TUNNEL_H, z1], [0, 0, 1, 0, 1, 1, 0, 1], 0x9e9a92);
    for (let z = z0 + 4; z < z1; z += 10) B.lamp.addGeometry(G.box, mat(L, TUNNEL_H - 0.08, z, 0, 0.5, 0.1, 4), 0xffffff);
    // portals
    for (const [zp, nz] of [[RIDGE.z0, -1], [RIDGE.z1, 1]]) {
      if (zp < r.z0 - 0.01 || zp > r.z1 + 0.01) continue;
      const f = nz < 0 ? FACE.n([L - 13, zp - 0.6, L + 13, zp]) : FACE.s([L - 13, zp, L + 13, zp + 0.6]);
      const u = (x) => (nz < 0 ? L + 13 - x : x - (L - 13));
      const ua = Math.min(u(L - TUNNEL_HALF), u(L + TUNNEL_HALF)), ub = Math.max(u(L - TUNNEL_HALF), u(L + TUNNEL_HALF));
      facePiece(B.props, f, 0, ua, 0, TUNNEL_H + 4, 0, 4, 4, 0xbdb7ab, false);
      facePiece(B.props, f, ub, 26, 0, TUNNEL_H + 4, 0, 4, 4, 0xbdb7ab, false);
      facePiece(B.props, f, ua, ub, TUNNEL_H, TUNNEL_H + 4, 0, 4, 4, 0xbdb7ab, false);
      signQuad(B.signs, L, TUNNEL_H + 1.2, zp + nz * 0.05, 0, nz, 9, 'מנהרת הרכס');
    }
  }
}

// ---------------------------------------------------------------------------- full-detail cell
function buildCellNear(cd, B, bulbs) {
  const { ox, oz } = cd;
  const y = CURB_H;
  // ground
  if (cd.urban) {
    const x0 = ox + ROAD_HALF, z0 = oz + ROAD_HALF, x1 = ox + P - ROAD_HALF, z1 = oz + P - ROAD_HALF, s = SIDEWALK;
    B.tiles.floor(x0, z0, x1, z0 + s, y, 0xffffff, 3);
    B.tiles.floor(x0, z1 - s, x1, z1, y, 0xffffff, 3);
    B.tiles.floor(x0, z0 + s, x0 + s, z1 - s, y, 0xffffff, 3);
    B.tiles.floor(x1 - s, z0 + s, x1, z1 - s, y, 0xffffff, 3);
    const ix0 = x0 + s, iz0 = z0 + s, ix1 = x1 - s, iz1 = z1 - s;
    if (cd.ground === 'grass') B.grass.floor(ix0, iz0, ix1, iz1, y, 0xffffff, 8);
    else if (cd.ground === 'plaza') B.plaza.floor(ix0, iz0, ix1, iz1, y, 0xffffff, 6);
    else B.lot.floor(ix0, iz0, ix1, iz1, y, 0xd0d0d0, 8);
    for (const p of cd.paths) B.plaza.floor(p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2, y + 0.01, 0xe8dcc8, 4);
    B.tiles.walls((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, y, 0xb9b5ad, 1, 1);
    // ground under the road edges of this cell's south/east sides is drawn by neighbours' roads
  } else if (cd.beach) {
    const west = cd.beach.west;
    const X = (x) => (west ? x : 3000 - x);
    // split along z at road crossings (arterial bridges every 500m)
    const zr = [];
    const cut = (a, b) => zr.push([a, b]);
    let za = oz, zb = oz + P;
    if (((oz % 500) + 500) % 500 === 0) za = oz + ROAD_HALF;
    if ((((oz + P) % 500) + 500) % 500 === 0) zb = oz + P - ROAD_HALF;
    cut(za, zb);
    for (const [a, b] of zr) {
      const px0 = Math.min(X(1007), X(1022)), px1 = Math.max(X(1007), X(1022));
      B.tiles.floor(px0, a, px1, b, y, 0xf0e6d6, 3);
      B.tiles.walls((px0 + px1) / 2, (a + b) / 2, px1 - px0, b - a, 0, y, 0xffffff, 1, 1);
    }
    // sand profile strips (full cell length; roads are drawn above where they cross)
    const xsW = [1022, 1040, 1060, 1090, 1100];
    for (let i = 0; i < xsW.length - 1; i++) {
      const xa = X(xsW[i]), xb = X(xsW[i + 1]);
      const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
      const yl = baseHeight(lo + 0.01, oz + 50), yh = baseHeight(hi - 0.01, oz + 50);
      for (const [a, b] of zr) B.sand.quad([lo, yl, b], [hi, yh, b], [hi, yh, a], [lo, yl, a], [lo / 6, -b / 6, hi / 6, -b / 6, hi / 6, -a / 6, lo / 6, -a / 6]);
      if (zr[0][0] > oz) B.sand.quad([lo, yl - 0.05, zr[0][0]], [hi, yh - 0.05, zr[0][0]], [hi, yh - 0.05, oz], [lo, yl - 0.05, oz], [0, 0, 1, 0, 1, 1, 0, 1]);
      if (zr[0][1] < oz + P) B.sand.quad([lo, yl - 0.05, oz + P], [hi, yh - 0.05, oz + P], [hi, yh - 0.05, zr[0][1]], [lo, yl - 0.05, zr[0][1]], [0, 0, 1, 0, 1, 1, 0, 1]);
    }
  } else if (cd.kind !== 'Q') {
    (cd.ground === 'field' ? B.field : B.grass).floor(ox, oz, ox + P, oz + P, -0.02, 0xffffff, 8);
    for (const a of cd.apron) (a.name === 'runway' ? B.road : B.lot).floor(a.rect[0], a.rect[1], a.rect[2], a.rect[3], a.name === 'runway' ? 0.012 : 0.006, 0xb5b5b5, a.name === 'runway' ? 14 : 8);
  }
  if (cd.water) B.water.floor(cd.water[0], cd.water[1], cd.water[2], cd.water[3], WATER_Y, 0xffffff, 30);
  // open-sea cells along the coast: sandy beach and the sea floor sloping away (a height grid)
  if (cd.kind === 'Q' && !(ox >= 1000 && ox < 2000 && oz >= 0 && oz < 1000) && shoreDist(ox + 50, oz + 50) < 120) {
    const N = 25, st = P / N, h = [];
    for (let i = 0; i <= N; i++) { h.push([]); for (let j = 0; j <= N; j++) h[i].push(seaHeight(ox + i * st, oz + j * st)); }
    const col = (y) => (y > -0.1 ? 0xffffff : y > -1.2 ? 0xd9cdb0 : 0xa89c80);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = ox + i * st, x1 = x0 + st, z0 = oz + j * st, z1 = z0 + st;
      const a = h[i][j], b = h[i + 1][j], c = h[i + 1][j + 1], d = h[i][j + 1];
      if (Math.min(a, b, c, d) < -4.4) continue;   // deep water: nothing to draw under the surface
      B.sand.quad([x0, a, z1 - st], [x0, d, z1], [x1, c, z1], [x1, b, z0], [x0 / 6, -z0 / 6, x0 / 6, -z1 / 6, x1 / 6, -z1 / 6, x1 / 6, -z0 / 6], col((a + b + c + d) / 4));
    }
  }

  // rail
  if (cd.rail) {
    const r = cd.rail;
    B.lot.floor(r.x0, RAIL.z - 3.5, r.x1, RAIL.z + 3.5, 0.03, 0x8a8178, 2);
    for (const off of [-0.72, 0.72]) B.props.addGeometry(G.box, mat((r.x0 + r.x1) / 2, 0.1, RAIL.z + off, 0, r.x1 - r.x0, 0.12, 0.1), 0x777b80);
    for (let x = r.x0 + 1; x < r.x1; x += 2) B.props.addGeometry(G.box, mat(x, 0.05, RAIL.z, 0, 0.25, 0.06, 2.4), 0x5a4636);
    if (r.bufferW) B.props.addGeometry(G.boxB, mat(r.x0 + 1, 0, RAIL.z, 0, 1, 1.2, 2.6), 0xc0392b);
    if (r.bufferE) B.props.addGeometry(G.boxB, mat(r.x1 - 1, 0, RAIL.z, 0, 1, 1.2, 2.6), 0xc0392b);
    if (r.platform) {
      const [x0, z0, x1, z1] = r.platform;
      B.tiles.walls((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, 0.5, 0xffffff, 1, 1);
      B.tiles.floor(x0, z0, x1, z1, 0.5, 0xffffff, 3);
    }
  }

  // roads owned by this cell
  for (const s of cd.segs) {
    const d = s.dir, r = [-d[1], d[0]], h = ROAD_HALF;
    const sx = s.ax + d[0] * h, sz = s.az + d[1] * h, ex = s.bx - d[0] * h, ez = s.bz - d[1] * h;
    const p0 = [sx - r[0] * h, 0, sz - r[1] * h], p1 = [sx + r[0] * h, 0, sz + r[1] * h];
    const p2 = [ex + r[0] * h, 0, ez + r[1] * h], p3 = [ex - r[0] * h, 0, ez - r[1] * h];
    const v = (P - 2 * h) / 12;
    const up = ((p1[0] - p0[0]) * (p3[2] - p0[2]) - (p1[2] - p0[2]) * (p3[0] - p0[0])) < 0;
    if (up) B.road.quad(p0, p1, p2, p3, [0, 0, 1, 0, 1, v, 0, v]); else B.road.quad(p1, p0, p3, p2, [1, 0, 0, 0, 0, v, 1, v]);
    for (const [nx, nz, sgn, has] of [[sx, sz, 1, s.crossA], [ex, ez, -1, s.crossB]]) {
      if (!has) continue;
      const c0x = nx + d[0] * sgn * 0.6, c0z = nz + d[1] * sgn * 0.6, c1x = nx + d[0] * sgn * 3.6, c1z = nz + d[1] * sgn * 3.6;
      const q0 = [c0x - r[0] * h, 0.02, c0z - r[1] * h], q1 = [c0x + r[0] * h, 0.02, c0z + r[1] * h];
      const q2 = [c1x + r[0] * h, 0.02, c1z + r[1] * h], q3 = [c1x - r[0] * h, 0.02, c1z - r[1] * h];
      const upc = ((q1[0] - q0[0]) * (q3[2] - q0[2]) - (q1[2] - q0[2]) * (q3[0] - q0[0])) < 0;
      if (upc) B.cross.quad(q0, q1, q2, q3, [0, 0, 1, 0, 1, 1, 0, 1]); else B.cross.quad(q1, q0, q3, q2, [1, 0, 0, 0, 0, 1, 1, 1]);
    }
    // road shoulders across open ground keep the road from floating visually
    if (!cd.urban && !cd.bridge && cd.kind !== 'Q') {
      const sh = 1.6;
      for (const sg of [-1, 1]) {
        const a = [sx + r[0] * sg * h, sz + r[1] * sg * h], b = [ex + r[0] * sg * h, ez + r[1] * sg * h];
        const o = [r[0] * sg * sh, r[1] * sg * sh];
        const g0 = [a[0], -0.005, a[1]], g1 = [a[0] + o[0], -0.005, a[1] + o[1]], g2 = [b[0] + o[0], -0.005, b[1] + o[1]], g3 = [b[0], -0.005, b[1]];
        const u2 = ((g1[0] - g0[0]) * (g3[2] - g0[2]) - (g1[2] - g0[2]) * (g3[0] - g0[0])) < 0;
        if (u2) B.lot.quad(g0, g1, g2, g3, [0, 0, 1, 0, 1, 1, 0, 1], 0x9a958a); else B.lot.quad(g1, g0, g3, g2, [0, 0, 1, 0, 1, 1, 0, 1], 0x9a958a);
      }
    }
  }
  if (cd.node) B.lot.floor(ox - ROAD_HALF, oz - ROAD_HALF, ox + ROAD_HALF, oz + ROAD_HALF, 0.001, 0xffffff, 8);

  // bridge structure
  if (cd.bridge) {
    const { x0, x1, z } = cd.bridge;
    const L = x1 - x0, cx = (x0 + x1) / 2;
    B.props.addGeometry(G.boxB, mat(cx, -1.45, z, 0, L, 1.4, 19.4), 0xa7a39b);          // deck body (top just below the asphalt: no z-fighting)
    for (const s of [-1, 1]) {
      B.tiles.floor(x0, s < 0 ? z - 9.5 : z + ROAD_HALF, x1, s < 0 ? z - ROAD_HALF : z + 9.5, 0.0, 0xd9d4ca, 3); // walkways
      B.props.addGeometry(G.boxB, mat(cx, 0, z + s * 9.7, 0, L, 0.35, 0.4), 0xcfcac0);  // curb wall
      B.props.addGeometry(G.box, mat(cx, 1.1, z + s * 9.7, 0, L, 0.08, 0.12), 0x6f777f); // handrail
      for (let x = x0 + 2; x < x1; x += 2.5) B.props.addGeometry(G.box, mat(x, 0.7, z + s * 9.7, 0, 0.06, 0.8, 0.06), 0x6f777f);
    }
    for (let x = Math.ceil(x0 / 40) * 40; x < x1; x += 40) {
      if (Math.min(x, 3000 - x) < 1050) continue;
      B.props.addGeometry(G.boxB, mat(x, -5, z, 0, 3, 3.6, 14), 0x9c988f); // pillars into the sea bed
    }
  }

  // street lamps
  for (const l of cd.lamps) {
    const m = mat(l.x, l.y, l.z, Math.atan2(l.dx, l.dz));
    B.props.addGeometry(G.lampPole, m, 0x4a4f55); B.props.addGeometry(G.lampArm, m, 0x4a4f55); B.lamp.addGeometry(G.lampHead, m, 0xffffff);
  }
  // traffic lights
  for (const s of cd.tl) {
    const rot = Math.atan2(s.r[1], -s.r[0]);
    const m = mat(s.x, s.y, s.z, rot).clone();
    B.props.addGeometry(G.tlPole, m, 0x4a4f55); B.props.addGeometry(G.tlArm, m, 0x4a4f55); B.props.addGeometry(G.tlHead, m, 0x22262a);
    bulbs.push({ spot: s, m });
  }
  // buildings, props, garage, ridge
  for (const b of cd.buildings) buildBuilding(b, B.fac, B);
  for (const p of cd.props) addProp(B.props, p, B.lamp);
  if (cd.garage) buildGarage(cd.garage, B);
  if (cd.ridge) buildRidge(cd, B);
}

// ---------------------------------------------------------------------------- low detail cell (far LOD)
const FAR_GROUND = { grass: 0x6f9a4c, field: 0x9bb05a, urban: 0xa9a59c, water: 0x3d7fa6, sand: 0xdcc796, apron: 0x8e8e8a };
function buildCellFar(cd, F) {
  const { ox, oz } = cd;
  let gcol = cd.urban ? FAR_GROUND.urban : cd.ground === 'field' ? FAR_GROUND.field : FAR_GROUND.grass;
  if (cd.kind === 'Q') gcol = FAR_GROUND.water;
  if (cd.beach) {
    const west = cd.beach.west, X = (x) => (west ? x : 3000 - x);
    F.floor(Math.min(X(1000), X(1060)), oz, Math.max(X(1000), X(1060)), oz + P, 0, FAR_GROUND.sand, 50);
    F.floor(Math.min(X(1060), X(1100)), oz, Math.max(X(1060), X(1100)), oz + P, WATER_Y, FAR_GROUND.water, 50);
  } else F.floor(ox, oz, ox + P, oz + P, cd.kind === 'Q' ? WATER_Y : -0.03, gcol, 50);
  for (const s of cd.segs) {
    const x0 = Math.min(s.ax, s.bx) - (s.dir[1] ? ROAD_HALF : 0), x1 = Math.max(s.ax, s.bx) + (s.dir[1] ? ROAD_HALF : 0);
    const z0 = Math.min(s.az, s.bz) - (s.dir[0] ? ROAD_HALF : 0), z1 = Math.max(s.az, s.bz) + (s.dir[0] ? ROAD_HALF : 0);
    F.floor(x0, z0, x1, z1, 0.02, 0x4a4c50, 50);
  }
  for (const b of cd.buildings) {
    const top = CURB_H + b.h + (b.house ? Math.min(b.w, b.d) * 0.3 : 0);
    F.walls(b.x, b.z, b.w, b.d, 0, top, b.color, 50, 50);
    F.floor(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2, top, b.house ? b.roofColor : 0x9a9a98, 50);
  }
  if (cd.garage) { const g = cd.garage; F.walls(g.x, g.z, g.w, g.d, 0, CURB_H + g.levelH * (g.levels - 1) + 1, 0xb8b4ac, 50, 50); }
  let trees = 0;
  for (const p of cd.props) if ((p.kind === 'tree' || p.kind === 'palm') && trees++ % 3 === 0) F.walls(p.x, p.z, 3.4, 3.4, 2, 6.5, 0x3f7a32, 50, 50);
  if (cd.ridge) {
    const r = cd.ridge;
    const step = 20;
    for (let x = r.x0; x < r.x1 - 0.01; x += step) for (let z = r.z0; z < r.z1 - 0.01; z += step) {
      const xb = Math.min(r.x1, x + step), zb = Math.min(r.z1, z + step);
      const ya = ridgeHeight(x, zb), yb = ridgeHeight(xb, zb), yc = ridgeHeight(xb, z), yd = ridgeHeight(x, z);
      F.quad([x, ya, zb], [xb, yb, zb], [xb, yc, z], [x, yd, z], [0, 0, 1, 0, 1, 1, 0, 1], 0xa49a85);
    }
  }
}

// ---------------------------------------------------------------------------- manager
export class ChunkManager {
  constructor(scene, mats, statics, surfaces) {
    this.scene = scene; this.mats = mats; this.statics = statics; this.surfaces = surfaces;
    this.group = new THREE.Group(); this.group.name = 'chunks';
    scene.add(this.group);
    this.near = new Map();   // chunkKey -> { group, bulbs }
    this.far = new Map();    // chunkKey -> mesh
    this.phys = new Set();   // cell keys with colliders loaded
    this.radius = 380;       // full detail radius
    this.farRadius = 900;    // low detail radius
    this.physRadius = 260;
    this.budgetMs = 6;
    this.benches = [];
    this._benchDirty = true;
    this.onCellsChanged = null;
  }
  get loaded() { return this.near; }

  _chunkCells(cx, cz) {
    const out = [];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) out.push(cellData(cx * 2 + i, cz * 2 + j));
    return out;
  }

  _buildNear(cx, cz) {
    const B = {};
    for (const k of ['road', 'asphalt', 'cross', 'tiles', 'grass', 'field', 'sand', 'plaza', 'lot', 'curb', 'water', 'props', 'interior', 'rock', 'glass', 'signs', 'lamp']) B[k] = new GeoBuilder();
    B.fac = {};
    const bulbs = [];
    for (const cd of this._chunkCells(cx, cz)) buildCellNear(cd, B, bulbs);
    const g = new THREE.Group();
    const add = (builder, material, cast, receive = true) => {
      if (!builder || builder.empty) return;
      const m = new THREE.Mesh(builder.build(), material);
      m.castShadow = cast; m.receiveShadow = receive;
      m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
    };
    const M = this.mats;
    add(B.grass, M.grass, false); add(B.field, M.field, false); add(B.sand, M.sand, false); add(B.water, M.water, false);
    add(B.road, M.road, false); add(B.asphalt, M.asphalt, false); add(B.cross, M.cross, false);
    add(B.tiles, M.tiles, false); add(B.plaza, M.plaza, false); add(B.lot, M.lot, false); add(B.curb, M.curb, false);
    for (const s of STYLES) add(B.fac[s], M['f_' + s], true);
    add(B.fac.roof, M.roof, false); add(B.fac.houseRoof, M.houseRoof, true);
    add(B.props, M.props, true); add(B.interior, M.interior, false); add(B.rock, M.rock, true);
    add(B.glass, M.glass, false, false); add(B.signs, M.signs, false); add(B.lamp, M.lamp, false);
    let bulbMesh = null;
    if (bulbs.length) {
      bulbMesh = new THREE.InstancedMesh(G.bulb, M.bulb, bulbs.length * 3);
      const o = new THREE.Matrix4(), mm = new THREE.Matrix4(), dim = new THREE.Color(0x222222);
      bulbs.forEach((b, i) => {
        for (let k = 0; k < 3; k++) {
          o.makeTranslation(5.6, 4.9 - k * 0.4, -0.18);
          mm.copy(b.m).multiply(o);
          bulbMesh.setMatrixAt(i * 3 + k, mm); bulbMesh.setColorAt(i * 3 + k, dim);
        }
      });
      bulbMesh.instanceMatrix.needsUpdate = true;
      g.add(bulbMesh);
    }
    g.matrixAutoUpdate = false;
    return { group: g, bulbs, bulbMesh, cache: [] };
  }

  _buildFar(cx, cz) {
    const F = new GeoBuilder();
    for (const cd of this._chunkCells(cx, cz)) buildCellFar(cd, F);
    const m = new THREE.Mesh(F.build(), this.mats.far);
    m.matrixAutoUpdate = false; m.updateMatrix();
    return m;
  }

  _dispose(obj) { obj.traverse((o) => { if (o.geometry && !(o.isInstancedMesh && o.geometry === G.bulb)) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); }); }

  // Physics for 100m cells near the player
  _updatePhysics(px, pz) {
    const R = this.physRadius, U = R + 90;
    const i0 = Math.floor((px - R) / P), i1 = Math.floor((px + R) / P), j0 = Math.floor((pz - R) / P), j1 = Math.floor((pz + R) / P);
    let changed = false;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i + ',' + j;
      if (this.phys.has(k)) continue;
      const cx = i * P + 50, cz = j * P + 50;
      if ((cx - px) ** 2 + (cz - pz) ** 2 > (R + 71) ** 2) continue;
      const cd = cellPhysics(cellData(i, j));
      this.statics.addGroup(k, cd.colliders);
      for (const s of cd.surfaces) this.surfaces.addSurface(s, k);
      this.phys.add(k); changed = true;
    }
    for (const k of [...this.phys]) {
      const [i, j] = k.split(',').map(Number);
      const cx = i * P + 50, cz = j * P + 50;
      if ((cx - px) ** 2 + (cz - pz) ** 2 > (U + 71) ** 2) {
        this.statics.removeGroup(k); this.surfaces.removeGroup(k); this.phys.delete(k); changed = true;
      }
    }
    if (changed) {
      this.benches = [];
      for (const k of this.phys) { const [i, j] = k.split(',').map(Number); this.benches.push(...cellData(i, j).benches); }
      this.onCellsChanged?.([...this.phys].map((k) => k.split(',').map(Number)));
    }
  }

  isPhysicsReady(x, z) { return this.phys.has(Math.floor(x / P) + ',' + Math.floor(z / P)); }

  update(px, pz, force = false) {
    this._updatePhysics(px, pz);
    const t0 = performance.now();
    const R = this.radius, FR = this.farRadius;
    const c0x = Math.floor((px - FR) / CH), c1x = Math.floor((px + FR) / CH), c0z = Math.floor((pz - FR) / CH), c1z = Math.floor((pz + FR) / CH);
    const wantNear = [], wantFar = [];
    const seen = new Set();
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const k = cx + ',' + cz;
      seen.add(k);
      const mx = cx * CH + CH / 2, mz = cz * CH + CH / 2;
      // distance from player to the chunk square
      const dx = Math.max(0, Math.abs(px - mx) - CH / 2), dz = Math.max(0, Math.abs(pz - mz) - CH / 2);
      const d = Math.hypot(dx, dz);
      if (d < R) { if (!this.near.has(k)) wantNear.push([d, cx, cz, k]); }
      else if (d > R + 60 && this.near.has(k)) { const n = this.near.get(k); this._dispose(n.group); this.group.remove(n.group); this.near.delete(k); }
      if (d < FR) { if (!this.far.has(k)) wantFar.push([d, cx, cz, k]); }
      else if (d > FR + 100 && this.far.has(k)) { const f = this.far.get(k); this._dispose(f); this.group.remove(f); this.far.delete(k); }
    }
    for (const [k, n] of this.near) if (!seen.has(k)) { this._dispose(n.group); this.group.remove(n.group); this.near.delete(k); }
    for (const [k, f] of this.far) if (!seen.has(k)) { this._dispose(f); this.group.remove(f); this.far.delete(k); }
    wantNear.sort((a, b) => a[0] - b[0]);
    wantFar.sort((a, b) => a[0] - b[0]);
    let pending = wantNear.length + wantFar.length;
    for (const [, cx, cz, k] of wantNear) {
      if (!force && performance.now() - t0 > this.budgetMs) break;
      const n = this._buildNear(cx, cz);
      this.group.add(n.group); this.near.set(k, n); pending--;
    }
    for (const [, cx, cz, k] of wantFar) {
      if (!force && performance.now() - t0 > this.budgetMs) break;
      if (force && wantFar.length > 40 && performance.now() - t0 > 400) break;
      const m = this._buildFar(cx, cz);
      this.group.add(m); this.far.set(k, m); pending--;
    }
    // far mesh is hidden where the detailed chunk is present
    for (const [k, f] of this.far) f.visible = !this.near.has(k);
    return pending;
  }

  // recolor traffic-light bulbs
  updateLights(time, lightState) {
    const cols = this._cols ||= { r: new THREE.Color(0xff2a1a), y: new THREE.Color(0xffc21a), g: new THREE.Color(0x2aff5a), off: new THREE.Color(0x1d1d1d) };
    for (const n of this.near.values()) {
      if (!n.bulbMesh) continue;
      let changed = false;
      n.bulbs.forEach((b, i) => {
        const st = lightState(b.spot.node, b.spot.axis, time);
        if (n.cache[i] === st) return;
        n.cache[i] = st; changed = true;
        n.bulbMesh.setColorAt(i * 3, st === 'r' ? cols.r : cols.off);
        n.bulbMesh.setColorAt(i * 3 + 1, st === 'y' ? cols.y : cols.off);
        n.bulbMesh.setColorAt(i * 3 + 2, st === 'g' ? cols.g : cols.off);
      });
      if (changed) n.bulbMesh.instanceColor.needsUpdate = true;
    }
  }
}

export { nodeNbrs, G, faces };
