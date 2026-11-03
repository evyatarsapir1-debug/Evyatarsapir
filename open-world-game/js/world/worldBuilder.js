// Builds the always-loaded parts of the world (ground, road network, sidewalks, sea, airport, street furniture)
// and registers every static collider of the city.
import * as THREE from 'three';
import { GeoBuilder, mat } from './geoBuilder.js';
import * as T from './textures.js';
import { P, N, ROAD_HALF, SIDEWALK, CURB_H, CITY_SIZE, BEACH, AIRPORT, RAIL, WORLD_BOUNDS, faceVector } from './layout.js';
import { makeBox, makeCircle } from '../physics/collision.js';
import { dirOf, rightOf, hasLights } from '../traffic/roadGraph.js';

export function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const m = {
    road: std({ map: T.getRoad(), roughness: 0.9 }),
    asphalt: std({ map: T.getAsphalt(), roughness: 0.92 }),
    cross: std({ map: T.getCrosswalk(), transparent: true, alphaTest: 0.3, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    tiles: std({ map: T.getTiles(), vertexColors: true }),
    grass: std({ map: T.getGrass(), roughness: 1 }),
    sand: std({ map: T.getSand(), roughness: 1 }),
    plaza: std({ map: T.getPlaza(), vertexColors: true }),
    lot: std({ map: T.getAsphalt(), vertexColors: true }),
    curb: std({ color: 0xb9b5ad }),
    water: new THREE.MeshStandardMaterial({ map: T.getWaterNormalish(), color: 0x7fb6cf, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.92 }),
    roof: std({ map: T.getRoof(), vertexColors: true }),
    houseRoof: std({ map: T.getHouseRoof(), vertexColors: true, roughness: 0.75 }),
    props: std({ vertexColors: true, roughness: 0.8 }),
    metal: std({ color: 0x4a4f55, metalness: 0.6, roughness: 0.4 }),
    signs: new THREE.MeshStandardMaterial({ map: T.getSignAtlas(), roughness: 0.6, emissive: 0xffffff, emissiveMap: T.getSignAtlas(), emissiveIntensity: 0.15 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe2a8, emissiveIntensity: 0.3 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
  for (const s of ['glass', 'office', 'concrete', 'plaster', 'brick', 'industrial', 'storefront']) {
    const glass = s === 'glass';
    m['f_' + s] = std({ map: T.getFacade(s), vertexColors: true, roughness: glass ? 0.25 : 0.8, metalness: glass ? 0.45 : 0.05, envMapIntensity: glass ? 1.2 : 0.6 });
  }
  return m;
}

function meshOf(builder, material, { receive = true, cast = false } = {}) {
  if (builder.empty) return null;
  const mesh = new THREE.Mesh(builder.build(), material);
  mesh.receiveShadow = receive; mesh.castShadow = cast;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return mesh;
}

// ---------------------------------------------------------------------------
export function buildStaticWorld(scene, city, graph, statics, mats) {
  const root = new THREE.Group(); root.name = 'staticWorld';
  scene.add(root);

  // Base terrain
  const base = new GeoBuilder();
  base.floor(WORLD_BOUNDS.minX - 400, WORLD_BOUNDS.minZ - 400, BEACH.promenadeX0, WORLD_BOUNDS.maxZ + 400, -0.02, 0xffffff, 8);
  root.add(meshOf(base, mats.grass));

  // Roads
  const road = new GeoBuilder(), inter = new GeoBuilder(), cross = new GeoBuilder();
  for (const [a, b] of graph.edges) {
    const d = dirOf(a, b), r = rightOf(d);
    const L = Math.hypot(b.x - a.x, b.z - a.z) - ROAD_HALF * 2;
    const sx = a.x + d[0] * ROAD_HALF, sz = a.z + d[1] * ROAD_HALF;
    const ex = b.x - d[0] * ROAD_HALF, ez = b.z - d[1] * ROAD_HALF;
    const h = ROAD_HALF, y = 0.0;
    const p0 = [sx - r[0] * h, y, sz - r[1] * h], p1 = [sx + r[0] * h, y, sz + r[1] * h];
    const p2 = [ex + r[0] * h, y, ez + r[1] * h], p3 = [ex - r[0] * h, y, ez - r[1] * h];
    const v = L / 12;
    // ensure upward-facing winding
    const up = ((p1[0] - p0[0]) * (p3[2] - p0[2]) - (p1[2] - p0[2]) * (p3[0] - p0[0])) < 0;
    if (up) road.quad(p0, p1, p2, p3, [0, 0, 1, 0, 1, v, 0, v]);
    else road.quad(p1, p0, p3, p2, [1, 0, 0, 0, 0, v, 1, v]);
    // crosswalks at both ends (only where a node has lights / is an intersection)
    for (const [nx, nz, sgn, node] of [[sx, sz, 1, a], [ex, ez, -1, b]]) {
      if (node.nbrs.length < 3) continue;
      const c0x = nx + d[0] * sgn * 0.6, c0z = nz + d[1] * sgn * 0.6;
      const c1x = nx + d[0] * sgn * 3.6, c1z = nz + d[1] * sgn * 3.6;
      const q0 = [c0x - r[0] * h, 0.02, c0z - r[1] * h], q1 = [c0x + r[0] * h, 0.02, c0z + r[1] * h];
      const q2 = [c1x + r[0] * h, 0.02, c1z + r[1] * h], q3 = [c1x - r[0] * h, 0.02, c1z - r[1] * h];
      const upc = ((q1[0] - q0[0]) * (q3[2] - q0[2]) - (q1[2] - q0[2]) * (q3[0] - q0[0])) < 0;
      if (upc) cross.quad(q0, q1, q2, q3, [0, 0, 1, 0, 1, 1, 0, 1]); else cross.quad(q1, q0, q3, q2, [1, 0, 0, 0, 0, 1, 1, 1]);
    }
  }
  for (const n of graph.nodes.values()) inter.floor(n.x - ROAD_HALF, n.z - ROAD_HALF, n.x + ROAD_HALF, n.z + ROAD_HALF, 0.001, 0xffffff, 8);
  root.add(meshOf(road, mats.road), meshOf(inter, mats.asphalt), meshOf(cross, mats.cross));

  // Block lots: sidewalk ring + interior surface, curbs
  const tiles = new GeoBuilder(), grass = new GeoBuilder(), lot = new GeoBuilder(), plaza = new GeoBuilder(), curb = new GeoBuilder();
  const y = CURB_H;
  for (const blk of city.blocks) {
    const x0 = blk.ox + ROAD_HALF, z0 = blk.oz + ROAD_HALF, x1 = blk.ox + P - ROAD_HALF, z1 = blk.oz + P - ROAD_HALF;
    const s = SIDEWALK;
    tiles.floor(x0, z0, x1, z0 + s, y, 0xffffff, 3);
    tiles.floor(x0, z1 - s, x1, z1, y, 0xffffff, 3);
    tiles.floor(x0, z0 + s, x0 + s, z1 - s, y, 0xffffff, 3);
    tiles.floor(x1 - s, z0 + s, x1, z1 - s, y, 0xffffff, 3);
    const ix0 = x0 + s, iz0 = z0 + s, ix1 = x1 - s, iz1 = z1 - s;
    if (blk.ground === 'grass') grass.floor(ix0, iz0, ix1, iz1, y, 0xffffff, 8);
    else if (blk.ground === 'plaza') plaza.floor(ix0, iz0, ix1, iz1, y, 0xffffff, 6);
    else lot.floor(ix0, iz0, ix1, iz1, y, 0xd0d0d0, 8);
    for (const p of blk.paths) plaza.floor(p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2, y + 0.01, 0xe8dcc8, 4);
    curb.walls((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, y, 0xffffff, 1, 1);
  }
  // promenade + sidewalks along the outer edge of the grid
  tiles.floor(BEACH.promenadeX0, -150, BEACH.promenadeX1, 1150, y, 0xf0e6d6, 3);
  curb.walls((BEACH.promenadeX0 + BEACH.promenadeX1) / 2, 500, BEACH.promenadeX1 - BEACH.promenadeX0, 1300, 0, y, 0xffffff, 1, 1);
  root.add(meshOf(tiles, mats.tiles), meshOf(lot, mats.lot), meshOf(plaza, mats.plaza), meshOf(curb, mats.curb));
  const gm = meshOf(grass, mats.grass); root.add(gm);

  // Beach + sea
  const sand = new GeoBuilder();
  sand.floor(BEACH.promenadeX1, -400, BEACH.sandX1 + 30, 1500, 0.02, 0xffffff, 6);
  root.add(meshOf(sand, mats.sand));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1), mats.water);
  sea.rotation.x = -Math.PI / 2; sea.position.set(BEACH.sandX1 + 1500, 0.08, 500);
  sea.material.map.repeat.set(120, 120);
  sea.receiveShadow = true; sea.name = 'sea';
  root.add(sea);

  // Airport apron + runway
  const apron = new GeoBuilder(), runway = new GeoBuilder();
  apron.floor(AIRPORT.x0, AIRPORT.z0 + 140, -20, AIRPORT.z1, 0.005, 0xb5b5b5, 8);
  runway.quad([AIRPORT.x0 + 20, 0.01, 400], [-120, 0.01, 400], [-120, 0.01, 350], [AIRPORT.x0 + 20, 0.01, 350], [0, 0, 0, -40, 3.6, -40, 3.6, 0]);
  root.add(meshOf(apron, mats.lot), meshOf(runway, mats.road));

  // Rail line + platform
  const rail = new GeoBuilder();
  rail.floor(WORLD_BOUNDS.minX - 50, RAIL.z - 3.5, WORLD_BOUNDS.maxX, RAIL.z + 3.5, 0.03, 0x8a8178, 2);
  root.add(meshOf(rail, mats.lot));
  const railGeo = new GeoBuilder();
  const len = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX + 50;
  const bx = new THREE.BoxGeometry(1, 1, 1);
  for (const off of [-0.72, 0.72]) railGeo.addGeometry(bx, mat((WORLD_BOUNDS.minX - 50 + WORLD_BOUNDS.maxX) / 2, 0.15, RAIL.z + off, 0, len, 0.16, 0.1), 0x777b80);
  root.add(meshOf(railGeo, mats.metal, { cast: false }));
  const plat = new GeoBuilder();
  const pcx = (RAIL.platformX0 + RAIL.platformX1) / 2, pcz = (RAIL.platformZ0 + RAIL.platformZ1) / 2;
  plat.walls(pcx, pcz, RAIL.platformX1 - RAIL.platformX0, RAIL.platformZ1 - RAIL.platformZ0, 0, 0.5, 0xffffff, 1, 1);
  plat.floor(RAIL.platformX0, RAIL.platformZ0, RAIL.platformX1, RAIL.platformZ1, 0.5, 0xffffff, 3);
  root.add(meshOf(plat, mats.tiles));

  // Street lamps (instanced) along every segment, both sides
  const lampSpots = [];
  for (const [a, b] of graph.edges) {
    const d = dirOf(a, b), r = rightOf(d);
    for (const t of [0.25, 0.75]) {
      const side = t < 0.5 ? 1 : -1;
      const px = a.x + (b.x - a.x) * t + r[0] * side * (ROAD_HALF + 1.0);
      const pz = a.z + (b.z - a.z) * t + r[1] * side * (ROAD_HALF + 1.0);
      lampSpots.push({ x: px, z: pz, dx: -r[0] * side, dz: -r[1] * side });
    }
  }
  for (let z = 40; z < 1000; z += 60) lampSpots.push({ x: BEACH.promenadeX0 + 1, z, dx: -1, dz: 0 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 7, 6); poleGeo.translate(0, 3.5, 0);
  const armGeo = new THREE.BoxGeometry(0.08, 0.08, 1.6); armGeo.translate(0, 7, 0.8);
  const headGeo = new THREE.BoxGeometry(0.35, 0.15, 0.6); headGeo.translate(0, 6.95, 1.5);
  const poles = new THREE.InstancedMesh(poleGeo, mats.metal, lampSpots.length);
  const arms = new THREE.InstancedMesh(armGeo, mats.metal, lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, mats.lamp, lampSpots.length);
  lampSpots.forEach((l, i) => {
    const m = mat(l.x, CURB_H, l.z, Math.atan2(l.dx, l.dz));
    poles.setMatrixAt(i, m); arms.setMatrixAt(i, m); heads.setMatrixAt(i, m);
    statics.add(makeCircle(l.x, l.z, 0.2, 0, 7));
  });
  poles.castShadow = true;
  root.add(poles, arms, heads);

  // Traffic lights (instanced) — one per approach with a 3 bulb head
  const tlSpots = [];
  for (const n of graph.nodes.values()) {
    if (!hasLights(n)) continue;
    for (const k of n.nbrs) {
      const from = graph.get(k);
      const d = dirOf(from, n), r = rightOf(d); // approaching direction
      const px = n.x - d[0] * (ROAD_HALF + 1.2) + r[0] * (ROAD_HALF + 1.0);
      const pz = n.z - d[1] * (ROAD_HALF + 1.2) + r[1] * (ROAD_HALF + 1.0);
      tlSpots.push({ node: n, axis: Math.abs(d[1]) > 0.5 ? 'z' : 'x', x: px, z: pz, face: Math.atan2(-d[0], -d[1]), d, r });
    }
  }
  const tlPoleGeo = new THREE.CylinderGeometry(0.1, 0.12, 5.2, 6); tlPoleGeo.translate(0, 2.6, 0);
  const tlArmGeo = new THREE.BoxGeometry(6, 0.12, 0.12); tlArmGeo.translate(3, 5.1, 0);
  const tlHeadGeo = new THREE.BoxGeometry(0.42, 1.25, 0.32); tlHeadGeo.translate(5.6, 4.5, 0);
  const tlPoles = new THREE.InstancedMesh(tlPoleGeo, mats.metal, tlSpots.length);
  const tlArms = new THREE.InstancedMesh(tlArmGeo, mats.metal, tlSpots.length);
  const tlHeads = new THREE.InstancedMesh(tlHeadGeo, new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.6 }), tlSpots.length);
  const bulbGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const bulbs = new THREE.InstancedMesh(bulbGeo, mats.bulb, tlSpots.length * 3);
  const _mm = new THREE.Matrix4(), _o = new THREE.Matrix4(), dim = new THREE.Color(0x222222);
  tlSpots.forEach((s, i) => {
    // local +x points over the road (towards -right), local -z faces approaching traffic
    const rot = Math.atan2(s.r[1], -s.r[0]);
    const m = mat(s.x, CURB_H, s.z, rot);
    tlPoles.setMatrixAt(i, m); tlArms.setMatrixAt(i, m); tlHeads.setMatrixAt(i, m);
    for (let k = 0; k < 3; k++) {
      _o.makeTranslation(5.6, 4.9 - k * 0.4, -0.18);
      _mm.copy(mat(s.x, CURB_H, s.z, rot)).multiply(_o);
      bulbs.setMatrixAt(i * 3 + k, _mm);
      bulbs.setColorAt(i * 3 + k, dim);
    }
    statics.add(makeCircle(s.x, s.z, 0.2, 0, 5));
  });
  root.add(tlPoles, tlArms, tlHeads, bulbs);

  // Static colliders: world bounds, sea wall, platform
  const W = WORLD_BOUNDS;
  statics.add(makeBox((W.minX + W.maxX) / 2, W.minZ - 5, (W.maxX - W.minX) / 2 + 10, 5, 0, -10, 400, 'bound'));
  statics.add(makeBox((W.minX + W.maxX) / 2, W.maxZ + 5, (W.maxX - W.minX) / 2 + 10, 5, 0, -10, 400, 'bound'));
  statics.add(makeBox(W.minX - 5, (W.minZ + W.maxZ) / 2, 5, (W.maxZ - W.minZ) / 2 + 10, 0, -10, 400, 'bound'));
  statics.add(makeBox(W.maxX + 5, (W.minZ + W.maxZ) / 2, 5, (W.maxZ - W.minZ) / 2 + 10, 0, -10, 400, 'bound'));
  statics.add(makeBox(1104, (W.minZ + W.maxZ) / 2, 2, (W.maxZ - W.minZ) / 2, 0, -10, 1.6, 'sea'));

  return { root, tlSpots, bulbs, sea, lampHeads: heads };
}

// Colliders for every building and solid prop in the city (built once — physics doesn't depend on rendering)
export function registerCityColliders(city, statics) {
  const addB = (b) => {
    const h = b.house ? b.h + Math.min(b.w, b.d) * 0.35 : b.h;
    statics.add(makeBox(b.x, b.z, b.w / 2, b.d / 2, 0, 0, h + (b.tower && b.setback ? 0 : 0)));
  };
  const addProp = (p) => {
    switch (p.kind) {
      case 'tree': case 'palm': statics.add(makeCircle(p.x, p.z, 0.3 * (p.s || 1), 0, 6)); break;
      case 'bench': statics.add(makeBox(p.x, p.z, 0.85, 0.3, p.rot || 0, 0, 0.9)); break;
      case 'bin': statics.add(makeCircle(p.x, p.z, 0.3, 0, 1)); break;
      case 'container': statics.add(makeBox(p.x, p.z, 3.0, 1.2, p.rot || 0, 0, 2.6)); break;
      case 'chimney': statics.add(makeCircle(p.x, p.z, 1.6, 0, p.h)); break;
      case 'pump': statics.add(makeBox(p.x, p.z, 0.5, 0.35, 0, 0, 1.8)); break;
      case 'canopy':
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) statics.add(makeCircle(p.x + sx * (p.w / 2 - 1), p.z + sz * (p.d / 2 - 1), 0.3, 0, 5));
        statics.add(makeBox(p.x, p.z, p.w / 2, p.d / 2, 0, 5, 5.6));
        break;
      case 'pond': statics.add(makeCircle(p.x, p.z, p.r - 0.5, 0, 0.6, 'water')); break;
      case 'fountain': statics.add(makeCircle(p.x, p.z, 4.2, 0, 1.0)); statics.add(makeCircle(p.x, p.z, 0.8, 0, 4.0)); break;
      case 'tower': statics.add(makeCircle(p.x, p.z, 3, 0, p.h + 4)); break;
      case 'plane': statics.add(makeBox(p.x, p.z, 1.6, 13, p.rot, 0, 5)); statics.add(makeBox(p.x, p.z, 14, 1.4, p.rot, 1.5, 3)); break;
      case 'lifeguard': statics.add(makeBox(p.x, p.z, 1.4, 1.4, 0, 0, 4.5)); break;
      case 'platformRoof':
        for (let k = -3; k <= 3; k++) statics.add(makeCircle(p.x + k * (p.w / 7), p.z, 0.25, 0, 5));
        break;
    }
  };
  for (const blk of city.blocks) { blk.buildings.forEach(addB); blk.props.forEach(addProp); }
  city.extra.buildings.forEach(addB); city.extra.props.forEach(addProp);
}

export { faceVector };
