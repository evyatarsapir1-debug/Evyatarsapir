// 2.5D collision: oriented boxes and circles on the ground plane, each with a vertical extent [y0, y1].
// Static colliders live in a spatial hash; dynamic bodies (vehicles, player) are tested by their owners.

const CELL = 20;

export function makeBox(x, z, hw, hd, rot = 0, y0 = 0, y1 = 3, tag = 'static') {
  const c = Math.cos(rot), s = Math.sin(rot);
  return { type: 'box', x, z, hw, hd, rot, c, s, y0, y1, tag, stamp: 0 };
}
export function makeCircle(x, z, r, y0 = 0, y1 = 3, tag = 'static') {
  return { type: 'circle', x, z, r, y0, y1, tag, stamp: 0 };
}
export function updateBox(b, x, z, rot) {
  b.x = x; b.z = z; b.rot = rot; b.c = Math.cos(rot); b.s = Math.sin(rot);
}

// Box local axes: ax = (c, -s) is local +x, az = (s, c) is local +z  (matches three.js rotation.y)
function boxBounds(b) {
  if (b.type === 'circle') return [b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r];
  const ex = Math.abs(b.c) * b.hw + Math.abs(b.s) * b.hd;
  const ez = Math.abs(b.s) * b.hw + Math.abs(b.c) * b.hd;
  return [b.x - ex, b.z - ez, b.x + ex, b.z + ez];
}

export class StaticWorld {
  constructor() { this.cells = new Map(); this.groups = new Map(); this._stamp = 1; }
  key(ix, iz) { return ix * 100003 + iz; }
  add(col, group = '_') {
    const [x0, z0, x1, z1] = boxBounds(col);
    col._cells = [];
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const k = this.key(ix, iz);
        let arr = this.cells.get(k);
        if (!arr) { arr = []; this.cells.set(k, arr); }
        arr.push(col); col._cells.push(k);
      }
    let g = this.groups.get(group);
    if (!g) { g = []; this.groups.set(group, g); }
    g.push(col);
    return col;
  }
  addGroup(group, cols) { for (const c of cols) this.add(c, group); }
  hasGroup(group) { return this.groups.has(group); }
  removeGroup(group) {
    const g = this.groups.get(group);
    if (!g) return;
    for (const col of g) for (const k of col._cells) {
      const arr = this.cells.get(k);
      if (!arr) continue;
      const i = arr.indexOf(col);
      if (i >= 0) arr.splice(i, 1);
      if (!arr.length) this.cells.delete(k);
    }
    this.groups.delete(group);
  }
  query(x0, z0, x1, z1, out = []) {
    out.length = 0;
    const stamp = ++this._stamp;
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const arr = this.cells.get(this.key(ix, iz));
        if (!arr) continue;
        for (const c of arr) if (c.stamp !== stamp) { c.stamp = stamp; out.push(c); }
      }
    return out;
  }
}

// Walkable/drivable surfaces above the terrain: floors, stairs, ramps, bridge decks, parking levels.
// A surface is an axis-aligned rectangle with height y0 at its start and y1 at its end along 'axis'
// (axis 'x' or 'z'; equal heights = flat floor).
export function makeSurface(x0, z0, x1, z1, y0, y1 = y0, axis = 'x') {
  return { type: 'surface', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1),
    ya: y0, yb: y1, axis, fromMin: axis === 'x' ? x0 <= x1 : z0 <= z1, stamp: 0 };
}
export function surfaceY(s, x, z) {
  if (s.ya === s.yb) return s.ya;
  let t = s.axis === 'x' ? (x - s.x0) / (s.x1 - s.x0) : (z - s.z0) / (s.z1 - s.z0);
  if (!s.fromMin) t = 1 - t;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return s.ya + (s.yb - s.ya) * t;
}
export class SurfaceWorld extends StaticWorld {
  addSurface(s, group) {
    // reuse the box hashing by giving the surface an equivalent bounding box
    s.x = (s.x0 + s.x1) / 2; s.z = (s.z0 + s.z1) / 2; s.hw = (s.x1 - s.x0) / 2; s.hd = (s.z1 - s.z0) / 2; s.c = 1; s.s = 0;
    s.type = 'box'; s.isSurface = true;
    return this.add(s, group);
  }
  // highest surface under (x,z) that is not above yRef + step
  heightAt(x, z, yRef, step, base) {
    let best = base;
    const arr = this.cells.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!arr) return best;
    for (const s of arr) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const h = surfaceY(s, x, z);
      if (h > best && h <= yRef + step) best = h;
    }
    return best;
  }
}

// --- narrow phase -----------------------------------------------------------
const res = { hit: false, nx: 0, nz: 0, depth: 0 };

// circle (px,pz,r) vs shape -> normal points from shape towards circle
export function circleVs(px, pz, r, col) {
  res.hit = false;
  if (col.type === 'circle') {
    const dx = px - col.x, dz = pz - col.z;
    const d2 = dx * dx + dz * dz, rr = r + col.r;
    if (d2 >= rr * rr) return res;
    const d = Math.sqrt(d2) || 1e-4;
    res.hit = true; res.nx = dx / d; res.nz = dz / d; res.depth = rr - d;
    return res;
  }
  // into box local
  const dx = px - col.x, dz = pz - col.z;
  const lx = dx * col.c - dz * col.s;
  const lz = dx * col.s + dz * col.c;
  const qx = Math.max(-col.hw, Math.min(col.hw, lx));
  const qz = Math.max(-col.hd, Math.min(col.hd, lz));
  let ex = lx - qx, ez = lz - qz;
  const d2 = ex * ex + ez * ez;
  if (d2 > r * r) return res;
  let nlx, nlz, depth;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    nlx = ex / d; nlz = ez / d; depth = r - d;
  } else {
    // center inside box: push along smallest penetration axis
    const px1 = col.hw - Math.abs(lx), pz1 = col.hd - Math.abs(lz);
    if (px1 < pz1) { nlx = Math.sign(lx) || 1; nlz = 0; depth = px1 + r; }
    else { nlx = 0; nlz = Math.sign(lz) || 1; depth = pz1 + r; }
  }
  // back to world: world = lx*ax + lz*az, ax=(c,-s), az=(s,c)
  res.hit = true;
  res.nx = nlx * col.c + nlz * col.s;
  res.nz = -nlx * col.s + nlz * col.c;
  res.depth = depth;
  return res;
}

// OBB (a) vs shape (b) -> MTV normal pointing from b towards a
const axes = new Float32Array(8);
function project(b, axx, axz) {
  const c = b.x * axx + b.z * axz;
  const r = b.hw * Math.abs(b.c * axx - b.s * axz) + b.hd * Math.abs(b.s * axx + b.c * axz);
  return [c - r, c + r];
}
export function obbVs(a, b) {
  res.hit = false;
  if (b.type === 'circle') {
    const r = circleVs(b.x, b.z, b.r, a);
    if (r.hit) { r.nx = -r.nx; r.nz = -r.nz; }
    return r;
  }
  axes[0] = a.c; axes[1] = -a.s; axes[2] = a.s; axes[3] = a.c;
  axes[4] = b.c; axes[5] = -b.s; axes[6] = b.s; axes[7] = b.c;
  let best = Infinity, bx = 0, bz = 0;
  for (let i = 0; i < 8; i += 2) {
    const axx = axes[i], axz = axes[i + 1];
    const [a0, a1] = project(a, axx, axz);
    const [b0, b1] = project(b, axx, axz);
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o <= 0) return res;
    if (o < best) {
      best = o;
      const dir = ((a.x - b.x) * axx + (a.z - b.z) * axz) >= 0 ? 1 : -1;
      bx = axx * dir; bz = axz * dir;
    }
  }
  res.hit = true; res.nx = bx; res.nz = bz; res.depth = best;
  return res;
}

export function verticalOverlap(y0, y1, col) { return y1 > col.y0 && y0 < col.y1; }

// Segment (3D) vs box collider -> param t in [0,1] of first hit, or 1
export function segmentVsBox(sx, sy, sz, ex, ey, ez, col, pad = 0.2) {
  if (col.type === 'circle') {
    // treat as square
    return segAabb(sx - col.x, sy, sz - col.z, ex - col.x, ey, ez - col.z, col.r + pad, col.r + pad, col.y0, col.y1 + pad);
  }
  const ldx = sx - col.x, ldz = sz - col.z, edx = ex - col.x, edz = ez - col.z;
  const lsx = ldx * col.c - ldz * col.s, lsz = ldx * col.s + ldz * col.c;
  const lex = edx * col.c - edz * col.s, lez = edx * col.s + edz * col.c;
  return segAabb(lsx, sy, lsz, lex, ey, lez, col.hw + pad, col.hd + pad, col.y0, col.y1 + pad);
}
function segAabb(sx, sy, sz, ex, ey, ez, hw, hd, y0, y1) {
  let tmin = 0, tmax = 1;
  const d = [ex - sx, ey - sy, ez - sz], s = [sx, sy, sz];
  const mn = [-hw, y0, -hd], mx = [hw, y1, hd];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (s[i] < mn[i] || s[i] > mx[i]) return 1; continue; }
    let t0 = (mn[i] - s[i]) / d[i], t1 = (mx[i] - s[i]) / d[i];
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    tmin = Math.max(tmin, t0); tmax = Math.min(tmax, t1);
    if (tmin > tmax) return 1;
  }
  return tmin;
}
