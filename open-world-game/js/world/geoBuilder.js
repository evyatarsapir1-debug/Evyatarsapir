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
    const c = this._color(color), b = this.count;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      if (n) { _n.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize(); this.nrm.push(_n.x, _n.y, _n.z); }
      else this.nrm.push(0, 1, 0);
      if (uv) this.uv.push(uv.getX(i), uv.getY(i)); else this.uv.push(0, 0);
      this.col.push(c.r, c.g, c.b);
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
