// Single source of truth for "how high is the walkable/drivable ground here":
// generated terrain (lots, beaches, sea bed) plus loaded surfaces (floors, stairs, ramps, bridge decks).
import { baseHeight, WATER_Y } from './worldGen.js';
import { SurfaceWorld } from '../physics/collision.js';

export const surfaces = new SurfaceWorld();
export const STEP = 0.6;

// yRef: current height of the body; surfaces higher than yRef + STEP are ignored (you walk under them)
// moving platforms (elevator cabins): { rect: [x0,z0,x1,z1], y }
export const movingSurfaces = new Set();

export function heightAt(x, z, yRef = 1000) {
  let h = surfaces.heightAt(x, z, yRef, STEP, baseHeight(x, z));
  for (const m of movingSurfaces) {
    const r = m.rect;
    if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3] && m.y > h && m.y <= yRef + STEP) h = m.y;
  }
  return h;
}
export function waterDepthAt(x, z, groundY) { return WATER_Y - groundY; }
export { WATER_Y };
