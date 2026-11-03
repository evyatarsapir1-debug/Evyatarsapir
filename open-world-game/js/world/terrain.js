// Single source of truth for "how high is the walkable/drivable ground here":
// generated terrain (lots, beaches, sea bed) plus loaded surfaces (floors, stairs, ramps, bridge decks).
import { baseHeight, WATER_Y } from './worldGen.js';
import { SurfaceWorld } from '../physics/collision.js';

export const surfaces = new SurfaceWorld();
export const STEP = 0.6;

// yRef: current height of the body; surfaces higher than yRef + STEP are ignored (you walk under them)
export function heightAt(x, z, yRef = 1000) {
  return surfaces.heightAt(x, z, yRef, STEP, baseHeight(x, z));
}
export function waterDepthAt(x, z, groundY) { return WATER_Y - groundY; }
export { WATER_Y };
