// Streams detailed city geometry (buildings, props, signs) in 100m cells around the player.
// Cells are built progressively (a few per frame) and disposed when far away so a big city stays fast.
import * as THREE from 'three';
import { GeoBuilder, mat } from './geoBuilder.js';
import { P, CURB_H, faceVector } from './layout.js';
import { signUV } from './textures.js';

const STYLES = ['glass', 'office', 'concrete', 'plaster', 'brick', 'industrial', 'storefront'];

// prototype geometries for props
const G = {
  trunk: new THREE.CylinderGeometry(0.16, 0.26, 3, 6).translate(0, 1.5, 0),
  leaf: new THREE.IcosahedronGeometry(1.9, 0),
  leafSmall: new THREE.IcosahedronGeometry(1.4, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl16: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
  cone: new THREE.ConeGeometry(0.5, 1, 6),
  disc: new THREE.CylinderGeometry(1, 1, 0.1, 24),
  torus: new THREE.TorusGeometry(1, 0.08, 6, 24).rotateX(Math.PI / 2),
};

function addProp(pb, p) {
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
    case 'container':
      pb.addGeometry(G.box, mat(p.x, y + 1.3, p.z, p.rot || 0, 6, 2.6, 2.4), p.color);
      break;
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
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pb.addGeometry(G.box, mat(p.x + sx, 1.2, p.z + sz, 0, 0.2, 2.4, 0.2), 0xffffff);
      pb.addGeometry(G.box, mat(p.x, 3.2, p.z, 0, 2.8, 1.8, 2.8), 0xe74c3c);
      pb.addGeometry(G.box, mat(p.x, 4.3, p.z, 0, 3.2, 0.25, 3.2), 0xf1c40f);
      break;
    case 'platformRoof':
      for (let k = -3; k <= 3; k++) pb.addGeometry(G.box, mat(p.x + k * (p.w / 7), 2.75, p.z, 0, 0.3, 4.5, 0.3), 0x8c9399);
      pb.addGeometry(G.box, mat(p.x, 5.1, p.z, 0, p.w, 0.3, p.d), 0x9aa3ab);
      break;
  }
}

function buildBuilding(b, out, pb, signs) {
  const f = (s) => out[s] ||= new GeoBuilder();
  const uS = 12, vS = 12.8;
  if (b.house) {
    f('plaster').walls(b.x, b.z, b.w, b.d, CURB_H, CURB_H + b.h, b.color, uS, vS);
    // gable roof along the longer axis
    const rb = out.houseRoof ||= new GeoBuilder();
    const alongX = b.w >= b.d, y0 = CURB_H + b.h, rise = Math.min(b.w, b.d) * 0.35, o = 0.5;
    const x0 = b.x - b.w / 2 - o, x1 = b.x + b.w / 2 + o, z0 = b.z - b.d / 2 - o, z1 = b.z + b.d / 2 + o;
    if (alongX) {
      const zm = b.z;
      rb.quad([x0, y0, z1], [x1, y0, z1], [x1, y0 + rise, zm], [x0, y0 + rise, zm], [0, 0, b.w / 3, 0, b.w / 3, 2, 0, 2], b.roofColor);
      rb.quad([x1, y0, z0], [x0, y0, z0], [x0, y0 + rise, zm], [x1, y0 + rise, zm], [0, 0, b.w / 3, 0, b.w / 3, 2, 0, 2], b.roofColor);
      // gable ends
      f('plaster').quad([b.x + b.w / 2, y0, b.z + b.d / 2], [b.x + b.w / 2, y0, b.z - b.d / 2], [b.x + b.w / 2, y0 + rise * 0.92, zm], [b.x + b.w / 2, y0 + rise * 0.92, zm], [0, 0, 0.1, 0, 0.05, 0.1, 0.05, 0.1], b.color);
      f('plaster').quad([b.x - b.w / 2, y0, b.z - b.d / 2], [b.x - b.w / 2, y0, b.z + b.d / 2], [b.x - b.w / 2, y0 + rise * 0.92, zm], [b.x - b.w / 2, y0 + rise * 0.92, zm], [0, 0, 0.1, 0, 0.05, 0.1, 0.05, 0.1], b.color);
    } else {
      const xm = b.x;
      rb.quad([x1, y0, z1], [x1, y0, z0], [xm, y0 + rise, z0], [xm, y0 + rise, z1], [0, 0, b.d / 3, 0, b.d / 3, 2, 0, 2], b.roofColor);
      rb.quad([x0, y0, z0], [x0, y0, z1], [xm, y0 + rise, z1], [xm, y0 + rise, z0], [0, 0, b.d / 3, 0, b.d / 3, 2, 0, 2], b.roofColor);
      f('plaster').quad([b.x + b.w / 2, y0, b.z - b.d / 2], [b.x - b.w / 2, y0, b.z - b.d / 2], [xm, y0 + rise * 0.92, b.z - b.d / 2], [xm, y0 + rise * 0.92, b.z - b.d / 2], [0, 0, 0.1, 0, 0.05, 0.1, 0.05, 0.1], b.color);
      f('plaster').quad([b.x - b.w / 2, y0, b.z + b.d / 2], [b.x + b.w / 2, y0, b.z + b.d / 2], [xm, y0 + rise * 0.92, b.z + b.d / 2], [xm, y0 + rise * 0.92, b.z + b.d / 2], [0, 0, 0.1, 0, 0.05, 0.1, 0.05, 0.1], b.color);
    }
    // front door + doorstep
    const [fx, fz] = faceVector(b.face);
    const dx = b.x + fx * (b.w / 2 + 0.03), dz = b.z + fz * (b.d / 2 + 0.03);
    pb.addGeometry(G.box, mat(dx, CURB_H + 1.1, dz, fx !== 0 ? Math.PI / 2 : 0, 1.2, 2.2, 0.08), 0x5a3b26);
    return;
  }
  let y = CURB_H;
  const top = CURB_H + b.h;
  const roof = out.roof ||= new GeoBuilder();
  if (b.storefront) {
    const sh = Math.min(4.2, b.h);
    f('storefront').walls(b.x, b.z, b.w, b.d, y, y + sh, 0xffffff, 6, 4);
    y += sh;
  }
  if (b.tower && b.setback) {
    const mid = CURB_H + b.h * 0.62;
    f(b.style).walls(b.x, b.z, b.w, b.d, y, mid, b.color, uS, vS);
    roof.floor(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2, mid, 0xbbbbbb, 6);
    const w2 = b.w * 0.72, d2 = b.d * 0.72;
    f(b.style).walls(b.x, b.z, w2, d2, mid, top, b.color, uS, vS);
    roof.floor(b.x - w2 / 2, b.z - d2 / 2, b.x + w2 / 2, b.z + d2 / 2, top, 0xbbbbbb, 6);
    // antenna
    pb.addGeometry(G.cyl, mat(b.x, top + 8, b.z, 0, 0.4, 16, 0.4), 0xdddddd);
    pb.addGeometry(G.box, mat(b.x, top + 16.2, b.z, 0, 0.6, 0.6, 0.6), 0xff3b30);
  } else {
    if (top > y) f(b.style).walls(b.x, b.z, b.w, b.d, y, top, b.color, uS, vS);
    roof.floor(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2, top, 0xaaaaaa, 6);
    // parapet
    f('concrete').walls(b.x, b.z, b.w + 0.3, b.d + 0.3, top, top + 0.8, 0xcfcac2, 60, 60);
    if (b.h > 12 && b.w > 12 && b.d > 12) {
      f('concrete').walls(b.x + b.w * 0.15, b.z - b.d * 0.1, 5, 4, top, top + 3, 0xbab5ad, 60, 60);
      roof.floor(b.x + b.w * 0.15 - 2.5, b.z - b.d * 0.1 - 2, b.x + b.w * 0.15 + 2.5, b.z - b.d * 0.1 + 2, top + 3, 0x999999, 6);
    }
  }
  const [fx, fz] = faceVector(b.face);
  const half = fx !== 0 ? b.w / 2 : b.d / 2;
  const frontLen = fx !== 0 ? b.d : b.w;
  if (b.garage) {
    const cx = b.x + fx * (half + 0.05), cz = b.z + fz * (half + 0.05);
    pb.addGeometry(G.box, mat(cx, CURB_H + 2.6, cz, fx !== 0 ? Math.PI / 2 : 0, 10, 5.2, 0.1), 0x2a2d30);
  }
  if (b.sign) {
    const tall = b.station || b.airport || (b.tower && b.sign);
    const sw = tall ? Math.min(frontLen * 0.6, 24) : Math.min(frontLen * 0.7, 7);
    const sh = sw / 4;
    const sy = tall ? Math.min(top - sh - 1, b.tower ? top * 0.62 - sh - 2 : top - sh - 1) : CURB_H + 4.25;
    const cx = b.x + fx * (half + 0.15), cz = b.z + fz * (half + 0.15);
    const rx = fz, rz = -fx; // viewer's right
    const [u0, v0, u1, v1] = signUV(b.sign);
    signs.quad(
      [cx - rx * sw / 2, sy, cz - rz * sw / 2], [cx + rx * sw / 2, sy, cz + rz * sw / 2],
      [cx + rx * sw / 2, sy + sh, cz + rz * sw / 2], [cx - rx * sw / 2, sy + sh, cz - rz * sw / 2],
      [u0, v0, u1, v0, u1, v1, u0, v1]);
  }
}

export class ChunkManager {
  constructor(scene, city, mats) {
    this.scene = scene; this.mats = mats;
    this.cells = new Map();
    this.loaded = new Map();
    this.group = new THREE.Group(); this.group.name = 'chunks';
    scene.add(this.group);
    const cell = (x, z) => {
      const ix = Math.floor(x / P), iz = Math.floor(z / P), k = ix + ',' + iz;
      let c = this.cells.get(k);
      if (!c) { c = { key: k, ix, iz, buildings: [], props: [] }; this.cells.set(k, c); }
      return c;
    };
    for (const blk of city.blocks) {
      const c = cell(blk.ox + 50, blk.oz + 50);
      c.buildings.push(...blk.buildings); c.props.push(...blk.props);
    }
    for (const b of city.extra.buildings) cell(b.x, b.z).buildings.push(b);
    for (const p of city.extra.props) {
      const q = { ...p };
      if (p.kind === 'tree' || p.kind === 'palm') q.y = p.x > 1000 ? 0.02 : 0;
      if (['tower', 'plane', 'lifeguard'].includes(p.kind)) q.y = 0;
      if (p.kind === 'platformRoof') q.y = 0.5;
      cell(p.x, p.z).props.push(q);
    }
    this.radius = 420;
    this.budget = 2;
  }

  buildCell(c) {
    const out = {}, pb = new GeoBuilder(), signs = new GeoBuilder();
    for (const b of c.buildings) buildBuilding(b, out, pb, signs);
    for (const p of c.props) addProp(pb, p);
    const g = new THREE.Group();
    const add = (builder, material, cast = true) => {
      if (!builder || builder.empty) return;
      const m = new THREE.Mesh(builder.build(), material);
      m.castShadow = cast; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
    };
    for (const s of STYLES) add(out[s], this.mats['f_' + s]);
    add(out.roof, this.mats.roof, false);
    add(out.houseRoof, this.mats.houseRoof);
    add(pb, this.mats.props);
    add(signs, this.mats.signs, false);
    g.matrixAutoUpdate = false;
    return g;
  }

  update(px, pz, force = false) {
    const R = this.radius, R2 = R * R, U2 = (R + 120) ** 2;
    const need = [];
    for (const c of this.cells.values()) {
      const cx = c.ix * P + 50, cz = c.iz * P + 50;
      const d2 = (cx - px) ** 2 + (cz - pz) ** 2;
      if (this.loaded.has(c.key)) {
        if (d2 > U2) {
          const g = this.loaded.get(c.key);
          g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
          this.group.remove(g); this.loaded.delete(c.key);
        }
      } else if (d2 < R2) need.push([d2, c]);
    }
    need.sort((a, b) => a[0] - b[0]);
    const n = force ? need.length : Math.min(this.budget, need.length);
    for (let i = 0; i < n; i++) {
      const c = need[i][1];
      const g = this.buildCell(c);
      this.group.add(g); this.loaded.set(c.key, g);
    }
    return need.length - n;
  }
}
