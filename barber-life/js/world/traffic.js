// Road traffic: cars drive clockwise around blocks in the right-hand lane (so they never cross each other),
// slow down behind other cars and stop for the player and pedestrians.
import * as THREE from 'three';
import { N, blockCenter } from './worldData.js';
import { carModel } from './cityBuilder.js';

const LANE = 27.5; // lane centre distance from the block centre
const COLORS = ['#c8102e', '#1f3f8f', '#e9e5dc', '#141414', '#8d8a86', '#2f6b35', '#c9a45c', '#5a3d26'];

function loopPoint(c, s) {
  // perimeter of a square of half-size LANE, clockwise seen from above (+x east, +z south): north side heading east first
  const L = LANE * 2, P = L * 4;
  s = ((s % P) + P) % P;
  const side = Math.floor(s / L), u = s - side * L;
  switch (side) {
    case 0: return { x: c.x - LANE + u, z: c.z - LANE, h: Math.PI / 2 };
    case 1: return { x: c.x + LANE, z: c.z - LANE + u, h: 0 };
    case 2: return { x: c.x + LANE - u, z: c.z + LANE, h: -Math.PI / 2 };
    default: return { x: c.x - LANE, z: c.z + LANE - u, h: Math.PI };
  }
}

export class Traffic {
  constructor(scene, count = 12) {
    this.cars = [];
    this.group = new THREE.Group(); this.group.name = 'traffic';
    scene.add(this.group);
    for (let k = 0; k < count; k++) {
      const i = k % N, j = Math.floor(k / N) % N;
      const m = carModel(COLORS[k % COLORS.length]);
      this.group.add(m);
      this.cars.push({ mesh: m, c: blockCenter(i, j), s: (k * 37) % (LANE * 8), v: 8, vmax: 7 + (k % 3) * 1.5 });
    }
  }

  /** obstacles: [{x,z}] (player, pedestrians, player's car) */
  update(dt, obstacles) {
    for (const car of this.cars) {
      const p = loopPoint(car.c, car.s);
      const fx = Math.sin(p.h), fz = Math.cos(p.h);
      let block = 99;
      const check = (o) => {
        const dx = o.x - p.x, dz = o.z - p.z;
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 9 && side < 1.8) block = Math.min(block, ahead);
      };
      for (const o of obstacles) check(o);
      for (const o of this.cars) if (o !== car) check(o.mesh.position);
      const target = block < 3.5 ? 0 : block < 9 ? car.vmax * (block - 3.5) / 5.5 : car.vmax;
      car.v += (target - car.v) * Math.min(1, dt * 3);
      car.s += car.v * dt;
      const q = loopPoint(car.c, car.s);
      // smooth the 90° turns at the corners
      const q2 = loopPoint(car.c, car.s + 3);
      car.mesh.position.set(q.x, 0.02, q.z);
      car.mesh.rotation.y = Math.atan2(q2.x - q.x, q2.z - q.z);
    }
  }
}
