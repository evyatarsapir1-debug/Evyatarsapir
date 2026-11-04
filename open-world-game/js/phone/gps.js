// GPS: shortest route along the real road network (A* on the endless road graph),
// shown on the phone map, on the minimap and as a light beam over the destination.
import * as THREE from 'three';
import { P } from '../world/layout.js';

function nearestNode(graph, x, z) {
  let best = null, bd = Infinity;
  const gx = Math.round(x / P), gz = Math.round(z / P);
  for (let r = 0; r <= 6 && !best; r++) {
    for (let i = gx - r; i <= gx + r; i++) for (let j = gz - r; j <= gz + r; j++) {
      if (Math.max(Math.abs(i - gx), Math.abs(j - gz)) !== r) continue;
      const n = graph.node(i, j);
      if (!n.nbrs.length) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
  }
  return best;
}

export function findRoute(graph, from, to) {
  const a = nearestNode(graph, from.x, from.z), b = nearestNode(graph, to.x, to.z);
  if (!a || !b) return null;
  const open = new Map([[a.key, { n: a, g: 0, f: Math.hypot(a.x - b.x, a.z - b.z), prev: null }]]);
  const closed = new Map();
  let it = 0;
  while (open.size && it++ < 40000) {
    let cur = null;
    for (const o of open.values()) if (!cur || o.f < cur.f) cur = o;
    open.delete(cur.n.key);
    closed.set(cur.n.key, cur);
    if (cur.n.key === b.key) {
      const pts = [];
      for (let c = cur; c; c = c.prev) pts.unshift([c.n.x, c.n.z]);
      pts.unshift([from.x, from.z]); pts.push([to.x, to.z]);
      // skip a first corner that lies behind (when you are already on the road towards the next one)
      if (pts.length > 3) {
        const [f, c1, c2] = pts, dx = c2[0] - c1[0], dz = c2[1] - c1[1], L2 = dx * dx + dz * dz || 1;
        const t = ((f[0] - c1[0]) * dx + (f[1] - c1[1]) * dz) / L2;
        const off = Math.hypot(c1[0] + dx * t - f[0], c1[1] + dz * t - f[1]);
        if (t > 0 && t < 1 && off < 14) pts.splice(1, 1);
      }
      const last = pts.length;
      if (last > 3) {
        const e = pts[last - 1], c1 = pts[last - 2], c0 = pts[last - 3], dx = c1[0] - c0[0], dz = c1[1] - c0[1], L2 = dx * dx + dz * dz || 1;
        const t = ((e[0] - c0[0]) * dx + (e[1] - c0[1]) * dz) / L2;
        const off = Math.hypot(c0[0] + dx * t - e[0], c0[1] + dz * t - e[1]);
        if (t > 0 && t < 1 && off < 14) pts.splice(last - 2, 1);   // destination is on the last road: don't overshoot to its far corner
      }
      return { points: pts, length: cur.g + Math.hypot(from.x - a.x, from.z - a.z) + Math.hypot(to.x - b.x, to.z - b.z) };
    }
    for (const k of cur.n.nbrs) {
      if (closed.has(k)) continue;
      const n = graph.get(k);
      const g = cur.g + Math.hypot(n.x - cur.n.x, n.z - cur.n.z);
      const o = open.get(k);
      if (!o || g < o.g) open.set(k, { n, g, f: g + Math.hypot(n.x - b.x, n.z - b.z), prev: cur });
    }
  }
  return null;
}

export class GPS {
  constructor(scene, graph) {
    this.graph = graph;
    this.dest = null;      // { x, z, name }
    this.route = null;
    this._t = 0;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 120, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xb35cff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.visible = false;
    scene.add(beam);
    this.beam = beam;
  }
  set(dest, from) {
    this.dest = dest;
    this.route = dest ? findRoute(this.graph, from, dest) : null;
    this.beam.visible = !!dest;
    if (dest) this.beam.position.set(dest.x, 60, dest.z);
    return this.route;
  }
  clear() { this.set(null); }
  // where the player is along the route: closest segment + projection onto it (not just the closest corner,
  // which made the distance grow again right after passing a corner)
  _locate(px, pz) {
    const pts = this.route.points;
    let bi = 0, bt = 0, bd = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2));
      const d = Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz);
      if (d < bd - 0.01) { bd = d; bi = i; bt = t; }
    }
    return { i: bi, t: bt, off: bd };
  }
  remaining(px, pz) {
    if (!this.route) return this.dest ? Math.hypot(this.dest.x - px, this.dest.z - pz) : 0;
    const pts = this.route.points, { i, t, off } = this._locate(px, pz);
    const a = pts[i], b = pts[i + 1];
    let L = off + Math.hypot(b[0] - a[0], b[1] - a[1]) * (1 - t);
    for (let k = i + 1; k < pts.length - 1; k++) L += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
    return L;
  }
  // the point the navigation arrow aims at: ~25 m ahead along the route (or the destination itself)
  aimPoint(px, pz) {
    if (!this.dest) return null;
    if (!this.route) return [this.dest.x, this.dest.z];
    const pts = this.route.points, { i, t } = this._locate(px, pz);
    // walk 25 m forward along the route from the player's projected position
    let ax = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, az = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, left = 25;
    for (let k = i; k < pts.length - 1; k++) {
      const bx = pts[k + 1][0], bz = pts[k + 1][1], seg = Math.hypot(bx - ax, bz - az);
      if (seg >= left) return [ax + (bx - ax) * (left / (seg || 1)), az + (bz - az) * (left / (seg || 1))];
      left -= seg; ax = bx; az = bz;
    }
    return [this.dest.x, this.dest.z];
  }
  update(dt, px, pz) {
    if (!this.dest) return null;
    this.beam.material.opacity = 0.25 + Math.sin(performance.now() * 0.004) * 0.1;
    const d = Math.hypot(this.dest.x - px, this.dest.z - pz);
    if (d < (this.dest.radius || 12)) { const reached = this.dest; this.clear(); return { arrived: reached }; }
    this._t -= dt;
    if (this._t <= 0 && this.route) {
      this._t = 3;
      // re-route when the player leaves the route
      let off = Infinity;
      const pts = this.route.points;
      for (let i = 0; i < pts.length - 1; i++) off = Math.min(off, segDist(px, pz, pts[i], pts[i + 1]));
      if (off > 30) this.route = findRoute(this.graph, { x: px, z: pz }, this.dest);
    }
    return null;
  }
}
function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2));
  return Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz);
}
