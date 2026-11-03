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
  remaining(px, pz) {
    if (!this.route) return this.dest ? Math.hypot(this.dest.x - px, this.dest.z - pz) : 0;
    // distance along the route from the closest point onwards
    const pts = this.route.points;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - px, pts[i][1] - pz); if (d < bd) { bd = d; bi = i; } }
    let L = bd;
    for (let i = bi; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    return L;
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
