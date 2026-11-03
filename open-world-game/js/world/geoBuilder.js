// Small helper that accumulates triangles (with uv + vertex colors) into one BufferGeometry.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
const _m3 = new THREE.Matrix3();

export class GeoBuilder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; this.count = 0; }
  get empty() { return this.count === 0; }
  _color(color) { _c.set(color); return _c; }

  // quad p0..p3 counter-clockwise when seen from the front
  quad(p0, p1, p2, p3, uv4, color = 0xffffff) {
    const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
    const e2x = p3[0] - p0[0], e2y = p3[1] - p0[1], e2z = p3[2] - p0[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const c = this._color(color), b = this.count;
    for (const [p, i] of [[p0, 0], [p1, 1], [p2, 2], [p3, 3]]) {
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(nx, ny, nz);
      this.uv.push(uv4[i * 2], uv4[i * 2 + 1]); this.col.push(c.r, c.g, c.b);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.count += 4;
  }

  // Horizontal rectangle at height y (facing up), uv scaled by world size / uvScale
  floor(x0, z0, x1, z1, y, color = 0xffffff, uvScale = 4) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0],
      [x0 / uvScale, -z1 / uvScale, x1 / uvScale, -z1 / uvScale, x1 / uvScale, -z0 / uvScale, x0 / uvScale, -z0 / uvScale], color);
  }

  // Four walls of an axis aligned box with tiling UVs (u per uS meters, v per vS meters)
  walls(cx, cz, w, d, y0, y1, color, uS, vS, faces = 'nsew') {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const v0 = 0, v1 = (y1 - y0) / vS;
    if (faces.includes('s')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, v0, w / uS, v0, w / uS, v1, 0, v1], color);
    if (faces.includes('n')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, v0, w / uS, v0, w / uS, v1, 0, v1], color);
    if (faces.includes('e')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [0, v0, d / uS, v0, d / uS, v1, 0, v1], color);
    if (faces.includes('w')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [0, v0, d / uS, v0, d / uS, v1, 0, v1], color);
  }

  // Append an existing BufferGeometry transformed by matrix, painted a single color
  addGeometry(geom, matrix, color) {
    const p = geom.attributes.position, n = geom.attributes.normal, uv = geom.attributes.uv;
    _m3.getNormalMatrix(matrix);
    const own = color === null && geom.attributes.color ? geom.attributes.color : null;
    const c = own ? null : this._color(color), b = this.count;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      if (n) { _n.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize(); this.nrm.push(_n.x, _n.y, _n.z); }
      else this.nrm.push(0, 1, 0);
      if (uv) this.uv.push(uv.getX(i), uv.getY(i)); else this.uv.push(0, 0);
      if (own) this.col.push(own.getX(i), own.getY(i), own.getZ(i)); else this.col.push(c.r, c.g, c.b);
    }
    if (geom.index) for (let i = 0; i < geom.index.count; i++) this.idx.push(b + geom.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(b + i);
    this.count += p.count;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
export function mat(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

// ---------------------------------------------------------------------------------------------
// Smooth procedural shapes used by aircraft and vehicles.

// Orient an indexed triangle list so that normals point away from `inside(x,y,z)` reference points.
function orient(pos, idx, ref) {
  // check the first few triangles against their reference centre; flip all if most point inwards
  let votes = 0;
  for (let t = 0; t < Math.min(idx.length, 600); t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const r = ref(idx[t]);
    const d = (pos[a] - r[0]) * n[0] + (pos[a + 1] - r[1]) * n[1] + (pos[a + 2] - r[2]) * n[2];
    votes += d >= 0 ? 1 : -1;
  }
  if (votes < 0) for (let t = 0; t < idx.length; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
}

// Tube along +Z made of elliptical rings. stations: [{ z, r, cy = 0, sx = 1, sy = 1 }], optional colorFn(x, yRel, z, ring) -> hex.
export function tubeGeo(stations, seg = 24, colorFn = null, capEnds = [true, true]) {
  const pos = [], col = [], idx = [], ctr = [];
  const cc = new THREE.Color();
  stations.forEach((s, k) => {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.cos(a) * s.r * (s.sx ?? 1), yr = Math.sin(a) * s.r * (s.sy ?? 1);
      pos.push(x, (s.cy ?? 0) + yr, s.z); ctr.push([0, s.cy ?? 0, s.z]);
      cc.set(colorFn ? colorFn(x, yr, s.z, s) : 0xffffff); col.push(cc.r, cc.g, cc.b);
    }
  });
  for (let k = 0; k < stations.length - 1; k++) for (let i = 0; i < seg; i++) {
    const a = k * seg + i, b = k * seg + ((i + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, c, b, b, c, d);
  }
  const caps = [];
  for (const k of [0, stations.length - 1]) {
    if (!capEnds[k === 0 ? 0 : 1]) continue;
    const s = stations[k], base = pos.length / 3;
    const nb = stations[k === 0 ? 1 : stations.length - 2];
    pos.push(0, s.cy ?? 0, s.z); ctr.push([0, nb.cy ?? 0, nb.z]);
    cc.set(colorFn ? colorFn(0, 0, s.z, s) : 0xffffff); col.push(cc.r, cc.g, cc.b);
    caps.push([base, k]);
  }
  orient(pos, idx, (v) => ctr[v]);
  for (const [base, k] of caps) {
    const tri = [];
    for (let i = 0; i < seg; i++) tri.push(base, k * seg + i, k * seg + ((i + 1) % seg));
    orient(pos, tri, () => ctr[base]);
    idx.push(...tri);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Loft through closed cross-sections (arrays of [x,y,z] with equal point counts); ends are capped.
export function loftGeo(sections) {
  const n = sections[0].length, pos = [], idx = [], ctr = [];
  for (const sec of sections) {
    const c = sec.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n, a[2] + p[2] / n], [0, 0, 0]);
    for (const p of sec) { pos.push(p[0], p[1], p[2]); ctr.push(c); }
  }
  for (let k = 0; k < sections.length - 1; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, b = k * n + ((i + 1) % n), c = a + n, d = b + n;
    idx.push(a, c, b, b, c, d);
  }
  orient(pos, idx, (v) => ctr[v]);
  // caps use their own vertices so edges stay crisp
  for (const k of [0, sections.length - 1]) {
    const sec = sections[k], base = pos.length / 3;
    const c = ctr[k * n], other = ctr[(k === 0 ? 1 : sections.length - 2) * n];
    for (const p of sec) pos.push(p[0], p[1], p[2]);
    pos.push(c[0], c[1], c[2]);
    const tri = [];
    for (let i = 0; i < n; i++) tri.push(base + n, base + i, base + ((i + 1) % n));
    orient(pos, tri, () => other);
    idx.push(...tri);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Airfoil-like cross-section: origin = leading edge, chord along `cd`, thickness along `td` (unit vectors).
const FOIL = [[0, 0], [0.04, 0.32], [0.18, 0.5], [0.42, 0.46], [0.72, 0.25], [1, 0.02], [1, -0.02], [0.72, -0.12], [0.42, -0.24], [0.18, -0.28], [0.04, -0.2]];
export function foil(o, cd, td, chord, thick) {
  return FOIL.map(([u, v]) => [o[0] + cd[0] * chord * u + td[0] * thick * v, o[1] + cd[1] * chord * u + td[1] * thick * v, o[2] + cd[2] * chord * u + td[2] * thick * v]);
}
