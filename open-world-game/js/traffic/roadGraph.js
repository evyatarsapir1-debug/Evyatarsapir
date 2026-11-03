// Endless road network graph, generated lazily from the world generator's road lattice.
import { P, ROAD_HALF, LANE_OFFSET } from '../world/layout.js';
import { nodeNbrs, hasLightsAt, isUrban } from '../world/worldGen.js';

export class RoadGraph {
  constructor() { this.nodes = new Map(); }
  static key(gx, gz) { return gx + ',' + gz; }
  node(gx, gz) {
    const key = gx + ',' + gz;
    let n = this.nodes.get(key);
    if (n) return n;
    const nb = nodeNbrs(gx, gz);
    n = { key, gx, gz, x: gx * P, z: gz * P, nbrs: nb.map(([a, b]) => a + ',' + b), lights: hasLightsAt(gx, gz, nb.length),
      urban: isUrban(gx - 1, gz - 1) || isUrban(gx, gz - 1) || isUrban(gx - 1, gz) || isUrban(gx, gz) };
    this.nodes.set(key, n);
    if (this.nodes.size > 20000) this.nodes.delete(this.nodes.keys().next().value);
    return n;
  }
  get(key) {
    const n = this.nodes.get(key);
    if (n) return n;
    const [gx, gz] = key.split(',').map(Number);
    return this.node(gx, gz);
  }
  // random directed road segment whose lane lies within [rMin, rMax] of (x,z)
  randomSegmentNear(x, z, rMin, rMax, rng) {
    for (let t = 0; t < 30; t++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(rMin, rMax);
      const gx = Math.round((x + Math.cos(a) * d) / P), gz = Math.round((z + Math.sin(a) * d) / P);
      const n = this.node(gx, gz);
      if (!n.nbrs.length) continue;
      const b = this.get(rng.pick(n.nbrs));
      return rng.chance(0.5) ? [n, b] : [b, n];
    }
    return null;
  }
}

export function dirOf(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
  return [dx / L, dz / L];
}
export function rightOf(d) { return [-d[1], d[0]]; }
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
  if (axis === 'z') { if (c < 10) return 'g'; if (c < 12.5) return 'y'; return 'r'; }
  if (c < 13) return 'r'; if (c < 23) return 'g'; if (c < 25.5) return 'y'; return 'r';
}
export function hasLights(node) { return node.lights; }
