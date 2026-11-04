// Procedural vehicle models. Each model faces +Z, origin on the ground at the vehicle center.
// Returns references to animated parts: wheels (spin/steer), driver door (opens), rotors, damage panels.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from '../world/geoBuilder.js';
import { airlinerGeometry, JET_MAT, LIVERIES, FY } from '../world/airliner.js';

export const shared = {
  tire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xbfc5ca, metalness: 0.8, roughness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1c2a36, metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.2 }),
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff5d0, emissiveIntensity: 0.4 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x8b0000, emissive: 0xff1a1a, emissiveIntensity: 0.3 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xffd400, emissive: 0x332a00 }),
  red: new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0x880000 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2050ff, emissive: 0x001088 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff }),
  wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 }),
  lod: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 }),
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const archCache = new Map();
// half-ring over a wheel (dark plastic arch)
const ARCH = (r) => { const k = r.toFixed(2); if (!archCache.has(k)) archCache.set(k, new THREE.TorusGeometry(r + 0.06, 0.055, 6, 14, Math.PI)); return archCache.get(k); };

function m(geo, mat, parent, x, y, z, cast = true) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z); o.castShadow = cast; parent.add(o); return o;
}

const _rz = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
const wheelCache = new Map();
function wheelGeo(r, w) {
  const k = r.toFixed(2) + '_' + w.toFixed(2);
  if (wheelCache.has(k)) return wheelCache.get(k);
  const b = new GeoBuilder();
  b.addGeometry(new THREE.CylinderGeometry(r, r, w, 16), _rz, 0x1a1a1a);
  b.addGeometry(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.01, 14), _rz, 0x2a2d30);
  b.addGeometry(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 14, 1, true), _rz, 0xc9ced3);
  for (const sx of [-1, 1]) {
    // hub + five spokes on each face
    b.addGeometry(new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.02, 8), new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeTranslation(sx * (w / 2 + 0.005), 0, 0), _rz), 0xd5d9dd);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const m4 = new THREE.Matrix4().makeRotationX(a).premultiply(new THREE.Matrix4().makeTranslation(sx * (w / 2 + 0.004), 0, 0));
      m4.multiply(new THREE.Matrix4().makeTranslation(0, r * 0.32, 0));
      b.addGeometry(new THREE.BoxGeometry(0.02, r * 0.5, r * 0.13), m4, 0xc9ced3);
    }
  }
  const g = b.build();
  wheelCache.set(k, g);
  return g;
}
function wheel(parent, x, y, z, r, w, front) {
  const pivot = new THREE.Group(); pivot.position.set(x, y, z); parent.add(pivot);
  const spin = new THREE.Group(); pivot.add(spin);
  const mesh = new THREE.Mesh(wheelGeo(r, w), shared.wheel);
  mesh.castShadow = true; spin.add(mesh);
  return { pivot, spin, front };
}

// Merge the static meshes of the body by material (fewer draw calls) and build a one-mesh LOD for distance.
function optimize(parts) {
  const body = parts.body;
  const keep = new Set([...Object.values(parts.panels), parts.sirenR, parts.sirenB].filter(Boolean));
  const groups = new Map();
  for (const o of [...body.children]) {
    if (!o.isMesh || keep.has(o)) continue;
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(o);
  }
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const geos = list.map((o) => { o.updateMatrix(); return o.geometry.index ? o.geometry.clone().applyMatrix4(o.matrix) : o.geometry.clone().applyMatrix4(o.matrix); });
    const merged = mergeGeometries(geos.map((g) => (g.index ? g : g)), false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = list.some((o) => o.castShadow);
    for (const o of list) { body.remove(o); o.geometry.dispose(); }
    geos.forEach((g) => g.dispose());
    body.add(mesh);
    if (mat === shared.head) parts.lights = [mesh];
  }
  // LOD: everything in one vertex-colored mesh
  const lb = new GeoBuilder();
  parts.root.updateMatrixWorld(true);
  parts.root.traverse((o) => {
    if (!o.isMesh) return;
    const c = o.material === shared.wheel ? 0x202020 : o.material.color ? o.material.color.getHex() : 0x888888;
    lb.addGeometry(o.geometry, o.matrixWorld, c);
  });
  parts.lodPaint = parts.paint.color.clone();
  const lod = new THREE.Mesh(lb.build(), shared.lod);
  lod.castShadow = true; lod.visible = false;
  parts.root.add(lod);
  parts.lod = lod;
}

// Flyable passenger jet: the same detailed model as the airport planes, gear swaps out when retracted.
function buildJet(color) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const livery = LIVERIES[(color | 0) % LIVERIES.length] || LIVERIES[0];
  const mesh = new THREE.Mesh(airlinerGeometry(livery, true), JET_MAT);
  mesh.castShadow = true; body.add(mesh);
  const paint = new THREE.MeshStandardMaterial({ color: 0xffffff });
  return {
    root: g, body, paint, baseColor: new THREE.Color(0xffffff), wheels: [], door: null, rotor: null, tailRotor: null, panels: {}, lights: [],
    seat: new THREE.Vector3(0.55, FY - 0.55, 16.2), doorZ: 13.4, seatMode: 'drive', doorSide: 1, glassParts: [], wheelR: 0.6,
    jetMesh: mesh, gearGeo: mesh.geometry, cleanGeo: airlinerGeometry(livery, false), lod: null, shared: true,
  };
}

export function buildVehicleModel(type, color) {
  if (type.kind === 'plane') return buildJet(color);
  const T = type, g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.1 });
  const parts = { root: g, body, paint, baseColor: new THREE.Color(color), wheels: [], door: null, rotor: null, tailRotor: null, panels: {}, lights: [], seat: new THREE.Vector3(), seatMode: 'drive', doorSide: 1, glassParts: [] };
  const L = T.L, W = T.W, H = T.H;

  if (T.kind === 'car') {
    const r = T.bus || T.truck ? 0.5 : (T.offroad ? 0.42 : 0.34);
    const clear = r * 0.55;
    const wb = T.wheelbase;
    if (T.bus) {
      m(box(W, H - clear - 0.2, L), paint, body, 0, clear + (H - clear) / 2, 0);
      const band = m(box(W + 0.02, 0.9, L - 1.2), shared.glass, body, 0, H - 1.1, -0.2);
      parts.glassParts.push(band);
      m(box(W - 0.2, 1.3, 0.05), shared.glass, body, 0, H - 1.2, L / 2 + 0.01);
      parts.seat.set(0.7, 1.15, L / 2 - 1.3);
      parts.doorSide = 1;
      parts.panels.front = m(box(W, 0.4, 0.15), shared.dark, body, 0, clear + 0.25, L / 2 + 0.05);
      parts.panels.rear = m(box(W, 0.4, 0.15), shared.dark, body, 0, clear + 0.25, -L / 2 - 0.05);
    } else if (T.truck) {
      const cabL = 2.2;
      m(box(W, H * 0.75, cabL), paint, body, 0, clear + H * 0.4, L / 2 - cabL / 2);
      parts.glassParts.push(m(box(W - 0.1, 0.8, 0.05), shared.glass, body, 0, clear + H * 0.62, L / 2 + 0.01));
      if (T.tank) {
        const tank = m(new THREE.CylinderGeometry(1.05, 1.05, L - cabL - 0.6, 18), new THREE.MeshStandardMaterial({ color: 0xd9dde1, metalness: 0.6, roughness: 0.3 }), body, 0, clear + 1.55, -cabL / 2 - 0.15);
        tank.rotation.x = Math.PI / 2;
        m(box(W, 0.3, L - cabL - 0.4), shared.dark, body, 0, clear + 0.5, -cabL / 2 - 0.15);
      } else m(box(W, H - 0.3, L - cabL - 0.3), new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.6 }), body, 0, clear + (H - 0.3) / 2 + 0.2, -cabL / 2 - 0.15);
      parts.seat.set(0.55, 1.35, L / 2 - 1.1);
      parts.panels.front = m(box(W, 0.35, 0.15), shared.dark, body, 0, clear + 0.25, L / 2 + 0.05);
      parts.panels.rear = m(box(W, 0.3, 0.15), shared.dark, body, 0, clear + 0.2, -L / 2 - 0.05);
    } else {
      const lowH = H * (T.van ? 0.4 : 0.48);
      const sporty = T.maxSpeed > 60 || T.coupe;
      // lower body
      const lower = m(box(W, lowH, L), paint, body, 0, clear + lowH / 2, 0);
      lower.receiveShadow = true;
      // hood slope hint
      m(box(W * 0.98, 0.06, L * 0.3), paint, body, 0, clear + lowH + 0.02, L * 0.33);
      // cabin (glass) + roof — shaped per body style
      let cabL = L * (sporty ? 0.42 : 0.5), cabH = H - lowH - clear, cabZ = sporty ? -L * 0.06 : -L * 0.05;
      if (T.pickup) { cabL = L * 0.36; cabZ = L * 0.05; }
      if (T.van) { cabL = L * 0.8; cabZ = -L * 0.08; }
      if (T.convertible) {
        // open top: only a raked windshield, seats and a roll bar
        m(box(W * 0.86, cabH * 0.55, 0.05), shared.glass, body, 0, clear + lowH + cabH * 0.27, cabZ + cabL * 0.45, false).rotation.x = -0.35;
        m(box(W * 0.8, 0.5, 0.5), shared.seat, body, 0, clear + lowH + 0.05, cabZ - cabL * 0.05);
        m(box(W * 0.84, 0.08, 0.08), paint, body, 0, clear + lowH + cabH * 0.55, cabZ - cabL * 0.35);
      } else {
        const cab = m(box(W * 0.88, cabH * 0.92, cabL), shared.glass, body, 0, clear + lowH + cabH * 0.46, cabZ, false);
        parts.glassParts.push(cab);
        m(box(W * 0.86, 0.07, cabL * 0.82), paint, body, 0, clear + lowH + cabH * 0.95, cabZ - cabL * 0.02);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          m(box(0.06, cabH * 0.92, 0.08), paint, body, sx * W * 0.43, clear + lowH + cabH * 0.46, cabZ + sz * cabL * 0.47);
        }
        if (T.van) for (const sx of [-1, 1]) m(box(0.04, cabH * 0.75, cabL * 0.55), paint, body, sx * W * 0.445, clear + lowH + cabH * 0.42, cabZ - cabL * 0.2);
      }
      if (T.pickup) {
        // open cargo bed behind the cab
        const bedL = L * 0.42, bz = -L / 2 + bedL / 2;
        m(box(W, 0.45, 0.08), paint, body, 0, clear + lowH + 0.22, -L / 2 + 0.04);
        for (const sx of [-1, 1]) m(box(0.08, 0.45, bedL), paint, body, sx * (W / 2 - 0.04), clear + lowH + 0.22, bz);
        m(box(W - 0.2, 0.04, bedL - 0.1), shared.dark, body, 0, clear + lowH + 0.01, bz);
      }
      if (T.spoiler) {
        for (const sx of [-0.5, 0.5]) m(box(0.06, 0.3, 0.08), shared.dark, body, sx * W * 0.7, clear + lowH + 0.15, -L / 2 + 0.25);
        m(box(W * 0.95, 0.05, 0.35), shared.dark, body, 0, clear + lowH + 0.32, -L / 2 + 0.25);
      }
      if (T.scoop) {
        m(box(W * 0.3, 0.12, L * 0.18), shared.dark, body, 0, clear + lowH + 0.08, L * 0.28);
        for (const sx of [-0.12, 0.12]) m(box(0.12, 0.012, L * 0.98), shared.white, body, sx, clear + lowH + 0.005, 0);
      }
      parts.seat.set(W * 0.22, clear + lowH * 0.5 - 0.42, cabZ + cabL * 0.05);
      // driver door (left side for left-hand drive = +x)
      const hinge = new THREE.Group();
      hinge.position.set(W / 2 + 0.005, clear, cabZ + cabL * 0.42);
      body.add(hinge);
      const dl = cabL * 0.62;
      m(box(0.05, lowH, dl), paint, hinge, 0.01, lowH / 2, -dl / 2);
      const dw = m(box(0.04, cabH * 0.8, dl * 0.95), shared.glass, hinge, 0.0, lowH + cabH * 0.42, -dl / 2, false);
      parts.glassParts.push(dw);
      m(box(0.05, 0.04, 0.18), shared.chrome, hinge, 0.04, lowH * 0.75, -dl * 0.8);
      parts.door = hinge;
      // lights
      for (const sx of [-1, 1]) {
        parts.lights.push(m(box(0.38, 0.14, 0.06), shared.head, body, sx * (W / 2 - 0.3), clear + lowH * 0.72, L / 2 + 0.01, false));
        m(box(0.36, 0.13, 0.06), shared.tail, body, sx * (W / 2 - 0.3), clear + lowH * 0.75, -L / 2 - 0.01, false);
      }
      // ---- body details: door seams + handles on both sides, mirrors, grille, wheel arches, side skirts
      const fourDoor = !(sporty || T.convertible || T.pickup || T.van || T.kind === 'bike');
      const dz0 = cabZ + cabL * 0.42, dzMid = cabZ - cabL * 0.2 + (fourDoor ? 0.12 : -0.15), dz1 = fourDoor ? cabZ - cabL * 0.48 : dzMid;
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 + 0.004);
        for (const z of fourDoor ? [dz0, dzMid, dz1] : [dz0, dzMid]) m(box(0.012, lowH * 0.82, 0.022), shared.dark, body, x, clear + lowH * 0.52, z, false);
        m(box(0.012, 0.02, (dz0 - dz1)), shared.dark, body, x, clear + lowH * 0.1, (dz0 + dz1) / 2, false);
        // handles (the driver side has its own on the opening door)
        if (sx < 0) m(box(0.04, 0.035, 0.17), shared.chrome, body, x - sx * 0.01, clear + lowH * 0.75, dz0 - 0.32, false);
        if (fourDoor) m(box(0.04, 0.035, 0.17), shared.chrome, body, x + sx * 0.01, clear + lowH * 0.75, dzMid - 0.3, false);
        // side mirror
        const my = clear + lowH + 0.08, mz = cabZ + cabL * 0.47;
        m(box(0.2, 0.05, 0.06), paint, body, sx * (W / 2 + 0.07), my, mz, false);
        m(box(0.08, 0.13, 0.2), paint, body, sx * (W / 2 + 0.17), my + 0.04, mz, false);
        m(box(0.02, 0.1, 0.16), shared.glass, body, sx * (W / 2 + 0.17), my + 0.04, mz - 0.11, false);
        // side skirt
        m(box(0.05, 0.08, wb * 0.62), shared.dark, body, sx * (W / 2 + 0.01), clear + 0.04, 0, false);
        // wheel arches
        for (const az of [wb / 2, -wb / 2]) {
          const arch = m(ARCH(r), shared.dark, body, sx * (W / 2 - 0.02), r, az, false);
          arch.rotation.y = Math.PI / 2;
        }
      }
      // grille with chrome bar + lower intake
      m(box(W * 0.46, lowH * 0.3, 0.03), shared.dark, body, 0, clear + lowH * 0.68, L / 2 + 0.012, false);
      m(box(W * 0.46, 0.025, 0.035), shared.chrome, body, 0, clear + lowH * 0.68, L / 2 + 0.02, false);
      m(box(W * 0.6, lowH * 0.12, 0.03), shared.dark, body, 0, clear + lowH * 0.32, L / 2 + 0.1, false);
      // rear window frame line + third brake light
      if (!T.convertible) m(box(W * 0.25, 0.04, 0.03), shared.tail, body, 0, clear + lowH + cabH * 0.8, cabZ - cabL * 0.5 - 0.01, false);
      parts.panels.front = m(box(W + 0.04, lowH * 0.35, 0.14), shared.dark, body, 0, clear + lowH * 0.2, L / 2 + 0.03);
      parts.panels.rear = m(box(W + 0.04, lowH * 0.35, 0.14), shared.dark, body, 0, clear + lowH * 0.2, -L / 2 - 0.03);
      m(box(0.5, 0.08, 0.02), shared.white, body, 0, clear + lowH * 0.3, -L / 2 - 0.11); // plate
      m(box(0.5, 0.08, 0.02), shared.white, body, 0, clear + lowH * 0.3, L / 2 + 0.11);
      if (T.taxi) {
        m(box(0.6, 0.18, 0.25), shared.yellow, body, 0, H + 0.08, cabZ);
        m(box(W + 0.01, 0.08, L * 0.6), shared.dark, body, 0, clear + lowH * 0.6, 0);
      }
      if (T.police) {
        parts.sirenR = m(box(0.45, 0.14, 0.25), shared.red, body, -0.25, H + 0.06, cabZ);
        parts.sirenB = m(box(0.45, 0.14, 0.25), shared.blue, body, 0.25, H + 0.06, cabZ);
        m(box(W + 0.01, 0.22, L * 0.8), new THREE.MeshStandardMaterial({ color: 0x1f3d8a }), body, 0, clear + lowH * 0.55, 0);
      }
    }
    const fz = wb / 2, rz = -wb / 2, wx = W / 2 - 0.12;
    for (const [sx, z, front] of [[-1, fz, true], [1, fz, true], [-1, rz, false], [1, rz, false]]) {
      parts.wheels.push(wheel(g, sx * wx, r, z, r, 0.24, front));
      if (T.bus || T.truck) if (!front) parts.wheels.push(wheel(g, sx * wx, r, z - 1.3, r, 0.24, false));
    }
    parts.wheelR = r;
  } else if (T.kind === 'moto' || T.kind === 'bike') {
    const bike = T.kind === 'bike';
    const r = bike ? 0.34 : 0.32;
    const frameMat = paint;
    if (bike) {
      const tube = (len) => new THREE.CylinderGeometry(0.025, 0.025, len, 6);
      const a = m(tube(0.75), frameMat, body, 0, 0.6, 0.05); a.rotation.x = Math.PI / 2.4;
      const b2 = m(tube(0.6), frameMat, body, 0, 0.55, -0.22); b2.rotation.x = -0.3;
      const c = m(tube(0.55), frameMat, body, 0, 0.78, 0.02); c.rotation.x = Math.PI / 2;
      m(box(0.18, 0.05, 0.26), shared.seat, body, 0, 0.92, -0.28);
      m(box(0.55, 0.03, 0.03), shared.dark, body, 0, 1.0, 0.45);
      parts.seat.set(0, 0.32, -0.25);
    } else {
      // sport motorcycle: tank, seat, tail, engine block, exhaust, forks, round headlight, screen, mirrors, fenders
      const cyl = (r1, r2, h, n = 12) => new THREE.CylinderGeometry(r1, r2, h, n);
      const rx = (o, a) => { o.rotation.x = a; return o; };
      const tank = m(new THREE.SphereGeometry(0.22, 14, 10), frameMat, body, 0, 0.93, 0.18); tank.scale.set(0.95, 0.62, 1.35);
      m(box(0.26, 0.09, 0.56), shared.seat, body, 0, 0.92, -0.3);                       // seat
      const tail = m(box(0.22, 0.12, 0.34), frameMat, body, 0, 0.99, -0.62); tail.rotation.x = -0.25;   // tail cowl
      m(box(0.3, 0.32, 0.46), shared.dark, body, 0, 0.55, 0.05);                         // engine
      for (const sx of [-0.09, 0.09]) rx(m(cyl(0.06, 0.06, 0.24), shared.chrome, body, sx, 0.72, 0.2), 0.35); // cylinders
      m(box(0.06, 0.1, 0.92), shared.dark, body, 0, 0.66, 0.04);                         // frame spine
      rx(m(box(0.05, 0.06, 0.62), shared.dark, body, 0.1, 0.4, -0.4), 0.12);             // swing arm
      rx(m(cyl(0.045, 0.055, 0.8), shared.chrome, body, 0.17, 0.42, -0.32), Math.PI / 2 - 0.12); // exhaust
      m(cyl(0.06, 0.06, 0.08), shared.dark, body, 0.17, 0.47, -0.74).rotation.x = Math.PI / 2;
      for (const sx of [-0.07, 0.07]) rx(m(cyl(0.022, 0.022, 0.78), shared.chrome, body, sx, 0.68, 0.62), -0.42); // forks
      m(box(0.12, 0.06, 0.16), shared.dark, body, 0, 1.0, 0.52);                         // steering head
      m(box(0.72, 0.035, 0.035), shared.chrome, body, 0, 1.06, 0.48);                    // handlebar
      for (const sx of [-0.36, 0.36]) m(box(0.035, 0.05, 0.1), shared.dark, body, sx, 1.06, 0.48);   // grips
      for (const sx of [-0.3, 0.3]) { m(box(0.012, 0.16, 0.012), shared.dark, body, sx, 1.14, 0.48); m(box(0.08, 0.05, 0.02), shared.glass, body, sx, 1.22, 0.49); } // mirrors
      const hl = m(cyl(0.085, 0.085, 0.07, 16), shared.chrome, body, 0, 0.98, 0.66); hl.rotation.x = Math.PI / 2;
      parts.lights.push(rx(m(new THREE.CircleGeometry(0.072, 16), shared.head, body, 0, 0.98, 0.7, false), 0));
      const scr = m(box(0.26, 0.2, 0.012), shared.glass, body, 0, 1.13, 0.6, false); scr.rotation.x = -0.45;
      rx(m(box(0.12, 0.03, 0.38), frameMat, body, 0, 0.66, 0.72), -0.2);                 // front fender
      rx(m(box(0.14, 0.03, 0.3), frameMat, body, 0, 0.7, -0.78), 0.5);                   // rear hugger
      m(box(0.14, 0.06, 0.04), shared.tail, body, 0, 0.98, -0.8, false);                 // tail light
      for (const sx of [-0.2, 0.2]) m(box(0.08, 0.025, 0.04), shared.chrome, body, sx, 0.4, -0.08);  // foot pegs
      parts.seat.set(0, 0.3, -0.28);
    }
    parts.seatMode = 'ride';
    for (const [z, front] of [[T.wheelbase / 2, true], [-T.wheelbase / 2, false]]) {
      const w = wheel(g, 0, r, z, r, bike ? 0.05 : 0.14, front);
      parts.wheels.push(w);
    }
    parts.wheelR = r;
  } else if (T.kind === 'heli') {
    const cab = m(new THREE.SphereGeometry(1.25, 16, 12), paint, body, 0, 1.55, 1.0);
    cab.scale.set(0.95, 0.95, 1.5);
    const glass = m(new THREE.SphereGeometry(1.1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shared.glass, body, 0, 1.75, 1.7, false);
    glass.rotation.x = Math.PI / 2.2; glass.scale.set(0.95, 0.9, 1.0);
    parts.glassParts.push(glass);
    const boom = m(new THREE.CylinderGeometry(0.18, 0.32, 5, 8), paint, body, 0, 1.8, -3.0);
    boom.rotation.x = Math.PI / 2;
    m(box(0.08, 1.2, 0.8), paint, body, 0, 2.3, -5.3);
    for (const sx of [-1, 1]) {
      m(box(0.08, 0.08, 3.2), shared.dark, body, sx * 0.9, 0.08, 0.8);
      for (const z of [0, 1.8]) m(box(0.06, 0.5, 0.06), shared.dark, body, sx * 0.75, 0.33, z);
    }
    const rotor = new THREE.Group(); rotor.position.set(0, 2.95, 0.6); body.add(rotor);
    m(new THREE.CylinderGeometry(0.15, 0.15, 0.35, 8), shared.dark, rotor, 0, -0.15, 0);
    for (const a of [0, Math.PI / 2]) { const bl = m(box(9.2, 0.04, 0.28), shared.dark, rotor, 0, 0, 0); bl.rotation.y = a; }
    parts.rotor = rotor;
    const tr = new THREE.Group(); tr.position.set(0.12, 2.3, -5.5); body.add(tr);
    m(box(0.03, 1.4, 0.14), shared.dark, tr, 0, 0, 0);
    parts.tailRotor = tr;
    parts.seat.set(0.4, 0.95, 1.2);
    // simple door (left)
    const hinge = new THREE.Group(); hinge.position.set(1.1, 0.8, 1.9); body.add(hinge);
    m(box(0.05, 1.2, 1.1), paint, hinge, 0.02, 0.6, -0.55);
    parts.door = hinge;
    parts.wheelR = 0;
  }
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  optimize(parts);
  return parts;
}
