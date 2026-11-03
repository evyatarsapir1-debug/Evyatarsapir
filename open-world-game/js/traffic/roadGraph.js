// Road network graph: intersections (nodes) and road segments (edges). Every road is connected.
import { P, N, ROAD_HALF, LANE_OFFSET } from '../world/layout.js';

export class RoadGraph {
  constructor() {
    this.nodes = new Map(); // key -> {key, gx, gz, x, z, nbrs: [key]}
    for (let gx = 0; gx <= N; gx++) for (let gz = 0; gz <= N; gz++) this.addNode(gx, gz);
    for (let gx = 0; gx <= N; gx++) for (let gz = 0; gz <= N; gz++) {
      if (gx < N) this.link(gx, gz, gx + 1, gz);
      if (gz < N) this.link(gx, gz, gx, gz + 1);
    }
    // airport access road heading west from (0,5)
    for (let gx = -1; gx >= -3; gx--) { this.addNode(gx, 5); this.link(gx + 1, 5, gx, 5); }
    this.edges = [];
    for (const n of this.nodes.values()) for (const k of n.nbrs) if (n.key < k) this.edges.push([n, this.nodes.get(k)]);
  }
  static key(gx, gz) { return gx + ',' + gz; }
  addNode(gx, gz) {
    const key = RoadGraph.key(gx, gz);
    if (!this.nodes.has(key)) this.nodes.set(key, { key, gx, gz, x: gx * P, z: gz * P, nbrs: [] });
  }
  link(ax, az, bx, bz) {
    const a = this.nodes.get(RoadGraph.key(ax, az)), b = this.nodes.get(RoadGraph.key(bx, bz));
    a.nbrs.push(b.key); b.nbrs.push(a.key);
  }
  get(key) { return this.nodes.get(key); }
  nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const n of this.nodes.values()) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  // Closest point on any lane: returns {from, to, t}
  nearestEdge(x, z) {
    let best = null, bd = Infinity;
    for (const [a, b] of this.edges) {
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = { a, b, t, dist: Math.sqrt(d) }; }
    }
    return best;
  }
}

// direction unit vector from node a to node b
export function dirOf(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
  return [dx / L, dz / L];
}
// right-hand side vector of a travel direction (x east, z south)
export function rightOf(d) { return [-d[1], d[0]]; }

// Lane entry / exit points for a directed segment a->b (stops before the intersection boxes)
export function laneStart(a, b, back = ROAD_HALF) {
  const d = dirOf(a, b), r = rightOf(d);
  return [a.x + d[0] * back + r[0] * LANE_OFFSET, a.z + d[1] * back + r[1] * LANE_OFFSET];
}
export function laneEnd(a, b, back = ROAD_HALF) {
  const d = dirOf(a, b), r = rightOf(d);
  return [b.x - d[0] * back + r[0] * LANE_OFFSET, b.z - d[1] * back + r[1] * LANE_OFFSET];
}

// Traffic light phase for an intersection and approach axis. Cycle 26s with all-red clearance.
export function lightState(node, axis, t) {
  const off = ((node.gx * 7 + node.gz * 3) % 26 + 26) % 26;
  const c = (t + off) % 26;
  if (axis === 'z') { // traffic moving along z (north/south)
    if (c < 10) return 'g'; if (c < 12.5) return 'y'; return 'r';
  }
  if (c < 13) return 'r'; if (c < 23) return 'g'; if (c < 25.5) return 'y'; return 'r';
}
export function hasLights(node) { return node.nbrs.length >= 3; }
