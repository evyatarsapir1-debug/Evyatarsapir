// Builds the city: roads, sidewalks, buildings with real interiors, street furniture, colliders, doors and the
// interaction points. Decorative buildings are merged per material so the whole city costs few draw calls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCK, ROAD, PITCH, N, HALF_CITY, blockCenter, lotFrame, SHOPS, PROPERTIES, HOMES, PLACES, PARK_BLOCK, CARS } from './worldData.js';
import { buildPerson, randomLook } from './people.js';
import { mulberry32 } from '../hair/scalp.js';

const WALL_H = 4.2, T = 0.25, DOOR_W = 2.2, DOOR_H = 2.7;

function canvasTex(w, h, draw, repeat = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function facadeTextures(base, seed) {
  const rnd = mulberry32(seed);
  const draw = (lit) => (g, w, h) => {
    g.fillStyle = lit ? '#000' : base; g.fillRect(0, 0, w, h);
    if (!lit) for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
    // 2 windows across, 2 floors down per tile; bottom strip = plain wall (used for roofs)
    for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) {
      const x = 18 + fx * 64, y = 14 + fy * 64;
      if (lit) { g.fillStyle = rnd() < 0.45 ? `rgba(255,${200 + rnd() * 40},${120 + rnd() * 60},1)` : '#000'; g.fillRect(x, y, 30, 38); }
      else {
        g.fillStyle = '#1b2633'; g.fillRect(x, y, 30, 38);
        g.fillStyle = 'rgba(160,190,220,0.35)'; g.fillRect(x + 2, y + 2, 12, 34);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 2, y + 38, 34, 4);
      }
    }
  };
  const map = canvasTex(128, 128, draw(false));
  const em = canvasTex(128, 128, draw(true));
  return { map, em };
}

/** Text sign (shop name) as a texture. */
export function signTex(text, bg = '#111', fg = '#e7c983', sub = '') {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = text.length > 14 ? Math.max(54, 120 - (text.length - 14) * 5) : 120;
    g.font = `bold ${size}px "Segoe UI", Arial, sans-serif`;
    g.fillText(text, w / 2, sub ? h / 2 - 24 : h / 2);
    if (sub) { g.font = '44px "Segoe UI", Arial, sans-serif'; g.fillText(sub, w / 2, h / 2 + 62); }
  }, false);
}

export function buildCity(shopSrc) {
  const root = new THREE.Group(); root.name = 'city';
  const colliders = [];   // {minX,maxX,minZ,maxZ}
  const footprints = [];  // for the map: {minX,maxX,minZ,maxZ,kind}
  const interact = [];    // interaction points (filled by the world)
  const buildings = {};   // id -> { group, frame, door, inside, interior, sign, w, d }
  const lamps = [];
  const nightMats = [];   // materials whose emissive follows the night
  const rnd = mulberry32(2026);

  const M = {
    asphalt: new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.92 }),
    sidewalk: new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, w) => { g.fillStyle = '#9a9890'; g.fillRect(0, 0, w, w); g.strokeStyle = '#7d7b74'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, w); g.stroke(); g.beginPath(); g.moveTo(0, i * w / 4); g.lineTo(w, i * w / 4); g.stroke(); } for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * w, 2, 2); } }), roughness: 0.85 }),
    grass: new THREE.MeshStandardMaterial({ color: '#4f7a3a', roughness: 1 }),
    paint: new THREE.MeshStandardMaterial({ color: '#e8e2c8', roughness: 0.7 }),
    wallIn: new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.9 }),
    floorIn: new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, w) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#1b1c1f' : '#e9e5dc'; g.fillRect(x * 64, y * 64, 64, 64); } }), roughness: 0.4 }),
    woodFloor: new THREE.MeshStandardMaterial({ color: '#7a5132', roughness: 0.6 }),
    roof: new THREE.MeshStandardMaterial({ color: '#4a4d52', roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: '#9fc4dc', transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }),
    frame: new THREE.MeshStandardMaterial({ color: '#222326', roughness: 0.5, metalness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ color: '#6b4429', roughness: 0.6 }),
    marble: new THREE.MeshStandardMaterial({ color: '#efece6', roughness: 0.3 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#dadadc', roughness: 0.2, metalness: 1 }),
    mirror: new THREE.MeshStandardMaterial({ color: '#a7b1ba', roughness: 0.05, metalness: 1 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffe1a0', emissiveIntensity: 0 }),
    panel: new THREE.MeshStandardMaterial({ color: '#fffaf0', emissive: '#fff4dc', emissiveIntensity: 0.6 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3f7a36', roughness: 0.9 }),
    trunk: new THREE.MeshStandardMaterial({ color: '#5a3f2a', roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ color: '#4f8fb8', roughness: 0.1, metalness: 0.2 }),
  };
  nightMats.push(M.lamp);

  // ---------------------------------------------------------------- ground, roads, markings
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF_CITY * 2 + 140, HALF_CITY * 2 + 140), M.grass);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  root.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(HALF_CITY * 2 + ROAD, HALF_CITY * 2 + ROAD), M.asphalt);
  road.rotation.x = -Math.PI / 2; road.receiveShadow = true;
  root.add(road);
  const marks = [];
  for (let k = 0; k <= N; k++) {
    const c = -HALF_CITY + k * PITCH;
    for (let t = -HALF_CITY; t < HALF_CITY; t += 6) {
      const inX = Math.abs(((t + HALF_CITY) % PITCH) - 0) < ROAD / 2 + 1 || Math.abs(((t + HALF_CITY) % PITCH) - PITCH) < ROAD / 2 + 1;
      if (inX) continue;
      marks.push(new THREE.BoxGeometry(0.15, 0.01, 2.5).translate(c, 0.01, t + 1.5));
      marks.push(new THREE.BoxGeometry(2.5, 0.01, 0.15).translate(t + 1.5, 0.01, c));
    }
    // crosswalks at every crossing
    for (let m = 0; m <= N; m++) {
      const c2 = -HALF_CITY + m * PITCH;
      for (const s of [-1, 1]) for (let q = -5; q <= 5; q += 1.4) {
        marks.push(new THREE.BoxGeometry(0.7, 0.01, 3).translate(c + q, 0.012, c2 + s * (ROAD / 2 + 1.6)));
        marks.push(new THREE.BoxGeometry(3, 0.01, 0.7).translate(c2 + s * (ROAD / 2 + 1.6), 0.012, c + q));
      }
    }
  }
  const markMesh = new THREE.Mesh(mergeGeometries(marks), M.paint);
  root.add(markMesh);

  // ---------------------------------------------------------------- blocks (sidewalk slabs) + park
  const slabs = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const c = blockCenter(i, j);
    slabs.push(new THREE.BoxGeometry(BLOCK, 0.14, BLOCK).translate(c.x, 0.07, c.z));
  }
  const slabMesh = new THREE.Mesh(mergeGeometries(slabs), M.sidewalk);
  slabMesh.material.map.repeat.set(BLOCK / 3, BLOCK / 3);
  slabMesh.receiveShadow = true;
  root.add(slabMesh);

  // ---------------------------------------------------------------- shared furniture builders
  const box = (g, w, h, d, x, y, z, m, collide = false, list = null) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (collide) (list || g.userData.localColliders).push({ x, z, w, d });
    return mesh;
  };
  function chairModel() {
    if (shopSrc?.chair) { const c = shopSrc.chair.clone(); c.visible = true; c.scale.setScalar(0.95); return c; }
    const c = new THREE.Group();
    c.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.05, 24), M.chrome));
    const s = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.12, 0.5, 2, 0.04), M.dark); s.position.y = 0.5; c.add(s);
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.55, 0.1, 2, 0.04), M.dark); b.position.set(0, 0.82, -0.2); c.add(b);
    return c;
  }
  function stationAt(g, x, z, rotY, withChair = true) {
    // mirror + shelf on the wall, chair in front of it facing the mirror
    const s = new THREE.Group();
    s.position.set(x, 0.14, z); s.rotation.y = rotY;
    const shelf = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.06, 0.35, 2, 0.01), M.marble); shelf.position.set(0, 0.85, 0.75); s.add(shelf);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 0.3), M.wood); cab.position.set(0, 0.42, 0.78); s.add(cab);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.04), M.frame); fr.position.set(0, 1.55, 0.93); s.add(fr);
    const mi = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), M.mirror); mi.position.set(0, 1.55, 0.905); mi.rotation.y = Math.PI; s.add(mi);
    if (withChair) s.add(chairModel());
    g.add(s);
    return s;
  }
  function bench(g, x, z, rotY, len = 1.6, mat = M.dark) {
    const b = new THREE.Group(); b.position.set(x, 0.14, z); b.rotation.y = rotY;
    const seat = new THREE.Mesh(new RoundedBoxGeometry(len, 0.1, 0.45, 2, 0.03), mat); seat.position.y = 0.45; b.add(seat);
    const back = new THREE.Mesh(new RoundedBoxGeometry(len, 0.45, 0.08, 2, 0.03), mat); back.position.set(0, 0.72, -0.2); b.add(back);
    for (const sx of [-len / 2 + 0.1, len / 2 - 0.1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.4), M.frame); l.position.set(sx, 0.22, 0); b.add(l); }
    g.add(b);
    return b;
  }
  function npcAt(g, x, z, rotY, look, apron) {
    const p = buildPerson({ ...(look || randomLook(rnd)), apron });
    p.position.set(x, 0.14, z); p.rotation.y = rotY;
    g.add(p);
    return p;
  }

  // ---------------------------------------------------------------- enterable shell
  /**
   * A one-storey building with a real interior. Returns the record; colliders are added in world space.
   * Local frame: front wall at z = 0 (door in the middle), inside towards +z, x across.
   */
  function shell(id, lot, { w, d, facade = '#3a3d44', sign = '', signSub = '', floor = M.floorIn, kind = 'shop' }) {
    const fr = lotFrame(lot.block[0], lot.block[1], lot.side, lot.off);
    const g = new THREE.Group();
    g.position.set(fr.x, 0, fr.z); g.rotation.y = fr.rot;
    g.userData.localColliders = [];
    const facadeMat = new THREE.MeshStandardMaterial({ color: facade, roughness: 0.7 });
    const hw = w / 2;
    // floor + ceiling/roof
    const fl = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.05, d - 0.1), floor); fl.position.set(0, 0.165, d / 2); fl.receiveShadow = true; g.add(fl);
    if (floor.map) { floor.map.repeat?.set(w / 2.4, d / 2.4); }
    box(g, w + 0.4, 0.3, d + 0.4, 0, WALL_H + 0.15, d / 2, M.roof);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, d - 0.5), M.wallIn); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, WALL_H - 0.01, d / 2); g.add(ceil);
    for (let k = 0; k < Math.max(1, Math.floor(d / 4)); k++) {
      const pn = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), M.panel); pn.rotation.x = Math.PI / 2; pn.position.set(0, WALL_H - 0.03, 2 + k * 4); g.add(pn);
    }
    // walls: back + sides (inside colour), outside cladding
    box(g, w, WALL_H, T, 0, WALL_H / 2, d, M.wallIn, true);
    box(g, T, WALL_H, d, -hw, WALL_H / 2, d / 2, M.wallIn, true);
    box(g, T, WALL_H, d, hw, WALL_H / 2, d / 2, M.wallIn, true);
    box(g, w + 0.3, WALL_H, 0.05, 0, WALL_H / 2, d + T / 2 + 0.03, facadeMat);
    box(g, 0.05, WALL_H, d + 0.3, -hw - T / 2 - 0.03, WALL_H / 2, d / 2, facadeMat);
    box(g, 0.05, WALL_H, d + 0.3, hw + T / 2 + 0.03, WALL_H / 2, d / 2, facadeMat);
    // front: storefront glass both sides of the door
    const segW = (w - DOOR_W) / 2;
    for (const sx of [-1, 1]) {
      const cx = sx * (DOOR_W / 2 + segW / 2);
      box(g, segW, 0.6, T, cx, 0.3, 0, facadeMat, true);
      box(g, segW, WALL_H - 3.0, T, cx, 3.0 + (WALL_H - 3.0) / 2, 0, facadeMat, true);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(segW - 0.1, 2.4), M.glass); gl.position.set(cx, 1.8, 0); g.add(gl);
      box(g, 0.08, 2.4, 0.12, cx + sx * (segW / 2 - 0.04), 1.8, 0, M.frame);
      box(g, 0.08, 2.4, 0.12, cx - sx * (segW / 2 - 0.04), 1.8, 0, M.frame);
    }
    box(g, DOOR_W, WALL_H - DOOR_H, T, 0, DOOR_H + (WALL_H - DOOR_H) / 2, 0, facadeMat);
    // automatic sliding glass doors (open when someone walks up: world.updateDoors)
    const doorPanels = [];
    for (const sx of [-1, 1]) {
      const pg = new THREE.Group();
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W / 2 - 0.04, DOOR_H - 0.08), M.glass); pane.position.y = DOOR_H / 2;
      const fr1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, DOOR_H, 0.06), M.frame); fr1.position.set(sx * (DOOR_W / 4 - 0.02), DOOR_H / 2, 0);
      const fr2 = fr1.clone(); fr2.position.x = -sx * (DOOR_W / 4 - 0.02);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.05), M.frame); handle.position.set(-sx * (DOOR_W / 4 - 0.12), 1.1, -0.05);
      pg.add(pane, fr1, fr2, handle);
      pg.position.set(sx * DOOR_W / 4, 0.14, 0.02);
      pg.userData.base = sx * DOOR_W / 4; pg.userData.dir = sx;
      g.add(pg); doorPanels.push(pg);
    }
    // sign above the door
    let signMesh = null;
    if (sign) {
      signMesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.6, 6), 1.1), new THREE.MeshStandardMaterial({ map: signTex(sign, '#111', '#e7c983', signSub), roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0, emissiveMap: null }));
      signMesh.material.emissiveMap = signMesh.material.map;
      nightMats.push(signMesh.material);
      signMesh.position.set(0, 3.55, -0.16); signMesh.rotation.y = Math.PI;
      g.add(signMesh);
    }
    root.add(g);
    // world-space colliders
    const cos = Math.round(Math.cos(fr.rot)), sin = Math.round(Math.sin(fr.rot));
    const toWorld = (x, z) => ({ x: fr.x + x * cos + z * sin, z: fr.z - x * sin + z * cos });
    for (const c of g.userData.localColliders) {
      const a = toWorld(c.x - c.w / 2, c.z - c.d / 2), b = toWorld(c.x + c.w / 2, c.z + c.d / 2);
      colliders.push({ minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) });
    }
    g.userData.localColliders = [];
    const ca = toWorld(-hw, 0), cb = toWorld(hw, d);
    const fp = { minX: Math.min(ca.x, cb.x), maxX: Math.max(ca.x, cb.x), minZ: Math.min(ca.z, cb.z), maxZ: Math.max(ca.z, cb.z), kind };
    footprints.push(fp);
    const rec = {
      id, group: g, frame: fr, w, d, toWorld, block: lot.block, sign: signMesh, facadeMat, footprint: fp, doorPanels, doorOpen: 0,
      door: toWorld(0, -1.2), inside: toWorld(0, 2.2), interior: new THREE.Group(),
      /** a point inside, in local coordinates (x across, z depth) */
      at: (x, z) => toWorld(x, z),
      localRot: (r) => fr.rot + r,
    };
    g.add(rec.interior);
    buildings[id] = rec;
    return rec;
  }

  // ---------------------------------------------------------------- the places
  for (const s of SHOPS) {
    const b = shell(s.id, s, { w: s.w, d: s.d, facade: s.color, sign: s.name, signSub: 'BARBER SHOP', kind: 'barber' });
    furnishBarbershop(b, s.stations, s.leather, true, s);
  }
  for (const p of PROPERTIES) {
    const b = shell(p.id, p, { w: p.w, d: p.d, facade: '#55585e', sign: 'להשכרה / למכירה', signSub: `${p.stations} עמדות`, kind: 'property' });
    b.property = p;
  }
  for (const h of HOMES) {
    const b = shell(h.id, h, { w: h.w, d: h.d, facade: ['#8a7a66', '#6a5a7a', '#3a4a5a'][h.comfort - 1], sign: h.name, kind: 'home', floor: M.woodFloor });
    furnishHome(b, h);
  }
  for (const p of PLACES) {
    const b = shell(p.id, p, { w: p.w, d: p.d, facade: p.color, sign: p.name, signSub: p.he, kind: p.type, floor: p.type === 'cafe' || p.type === 'clothes' ? M.woodFloor : M.floorIn });
    ({ academy: furnishAcademy, realty: furnishRealty, clothes: furnishClothes, cafe: furnishCafe, cars: furnishCars })[p.type](b, p);
  }

  /** Barber stations, waiting bench, reception. Also used for the player's own branches (rebuilt on purchases). */
  function furnishBarbershop(b, stations, leather, staffed, shopDef) {
    const g = b.interior;
    g.clear();
    const hw = b.w / 2;
    b.stationSpots = [];
    const n = Math.min(stations, Math.floor((b.d - 3.5) / 2.1));
    for (let k = 0; k < n; k++) {
      const z = 3.4 + k * 2.1;
      stationAt(g, -hw + 1.1, z, -Math.PI / 2);
      b.stationSpots.push({ local: [-hw + 1.1, z], world: b.toWorld(-hw + 1.1, z), barber: b.toWorld(-hw + 1.9, z + 0.5), rot: b.localRot(-Math.PI / 2) });
    }
    const benchSeats = [];
    bench(g, hw - 0.5, 3.2, -Math.PI / 2, 2.2, new THREE.MeshStandardMaterial({ color: leather || '#141414', roughness: 0.5 }));
    for (let k = 0; k < 3; k++) benchSeats.push({ world: b.toWorld(hw - 0.62, 2.4 + k * 0.75), rot: b.localRot(-Math.PI / 2) });
    b.benchSeats = benchSeats;
    box(g, 1.6, 1.0, 0.6, hw - 1.4, 0.64, b.d - 1.0, M.wood); // reception
    b.reception = b.toWorld(hw - 1.4, b.d - 1.8);
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 16), new THREE.MeshStandardMaterial({ color: '#2f7fd8', transparent: true, opacity: 0.8 }));
    jar.position.set(hw - 1.0, 1.27, b.d - 1.0); g.add(jar);
    if (staffed) {
      b.owner = npcAt(g, hw - 1.4, b.d - 0.45, Math.PI, null, '#141414');
      b.ownerName = shopDef?.owner;
      // station barbers are live characters (ShopRuntime.syncStaff) so they can work on clients
    }
    if (!b.pole) {
      b.pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 16), new THREE.MeshStandardMaterial({ map: poleTexture() }));
      b.pole.position.set(-hw + 0.4, 2.3, -0.3); b.group.add(b.pole);
    }
  }
  function furnishHome(b) {
    const g = b.interior, hw = b.w / 2;
    const bed = new THREE.Group(); bed.position.set(hw - 1.2, 0.14, b.d - 1.4);
    const frame = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.4, 2.1, 2, 0.05), M.wood); frame.position.y = 0.2; bed.add(frame);
    const mat = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.2, 2.0, 2, 0.06), new THREE.MeshStandardMaterial({ color: '#e8e4dc' })); mat.position.y = 0.5; bed.add(mat);
    const blanket = new THREE.Mesh(new RoundedBoxGeometry(1.52, 0.08, 1.2, 2, 0.04), new THREE.MeshStandardMaterial({ color: '#2a4a7a' })); blanket.position.set(0, 0.62, -0.35); bed.add(blanket);
    const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.12, 0.35, 2, 0.05), new THREE.MeshStandardMaterial({ color: '#fff' })); pillow.position.set(0, 0.66, 0.75); bed.add(pillow);
    g.add(bed);
    b.bed = b.toWorld(hw - 1.2, b.d - 2.8);
    box(g, 2.2, 0.9, 0.6, -hw + 1.4, 0.59, b.d - 0.5, M.marble); // kitchen
    box(g, 0.8, 1.9, 0.5, -hw + 0.5, 1.09, 2.8, M.wood); // wardrobe
    b.wardrobe = b.toWorld(-hw + 1.2, 2.8);
    const sofa = bench(g, -hw + 1.3, b.d / 2 + 0.4, Math.PI / 2, 1.8, new THREE.MeshStandardMaterial({ color: '#5a4636' }));
    void sofa;
    const tv = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), M.dark); tv.position.set(hw - 0.15, 1.5, b.d / 2); tv.rotation.y = -Math.PI / 2; g.add(tv);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.5), M.mirror); mirror.position.set(-hw + 0.14, 1.4, 4.6); mirror.rotation.y = Math.PI / 2; g.add(mirror);
  }
  function furnishAcademy(b) {
    const g = b.interior, hw = b.w / 2;
    box(g, 3, 1.05, 0.7, 0, 0.66, b.d - 2.2, M.wood);
    b.desk = b.toWorld(0, b.d - 3.2);
    npcAt(g, 0, b.d - 1.4, Math.PI, { skin: '#c98e66', hair: '#151010', shirt: '#141414', pants: '#141414', shoes: '#141414' }, '#c9a45c');
    for (let k = 0; k < 3; k++) stationAt(g, -hw + 1.1, 3 + k * 2.4, -Math.PI / 2);
    for (let k = 0; k < 3; k++) {
      // training heads on tripods
      const st = new THREE.Group(); st.position.set(hw - 1.6, 0.14, 3 + k * 2.4);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 8), M.chrome); pole.position.y = 0.65; st.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshStandardMaterial({ color: '#d8bfa4' })); head.position.y = 1.45; st.add(head);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, 1.6), new THREE.MeshStandardMaterial({ color: '#4a3324' })); hair.position.y = 1.47; st.add(hair);
      g.add(st);
    }
    for (let k = 0; k < 3; k++) npcAt(g, -hw + 1.9, 3.4 + k * 2.4, -Math.PI / 2, null, k % 2 ? '#141414' : null);
  }
  function furnishRealty(b) {
    const g = b.interior, hw = b.w / 2;
    box(g, 2.2, 0.8, 0.9, 0, 0.54, b.d - 2.4, M.wood);
    b.desk = b.toWorld(0, b.d - 3.6);
    npcAt(g, 0, b.d - 1.5, Math.PI, { skin: '#f0c7a4', hair: '#b8925a', shirt: '#2f6f5e', pants: '#2b2f38', shoes: '#141414' });
    for (let k = 0; k < 4; k++) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ map: signTex(['למכירה', 'להשכרה', 'נכסים', 'דירות'][k], '#fff', '#2f6f5e') }));
      board.position.set(-hw + 0.14, 1.8, 2 + k * 1.8); board.rotation.y = Math.PI / 2; g.add(board);
    }
    bench(g, hw - 0.5, 3, -Math.PI / 2, 1.6);
  }
  function furnishClothes(b) {
    const g = b.interior, hw = b.w / 2;
    const cols = ['#1f3f8f', '#141414', '#7a2b2b', '#2f6b35', '#c9a45c', '#e9e5dc'];
    for (let r = 0; r < 3; r++) {
      const rack = new THREE.Group(); rack.position.set(-hw + 2.5 + r * 2.6, 0.14, b.d / 2);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 8), M.chrome); bar.rotation.z = Math.PI / 2; bar.position.y = 1.5; rack.add(bar);
      for (const sx of [-0.9, 0.9]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), M.chrome); l.position.set(sx, 0.75, 0); rack.add(l); }
      for (let k = 0; k < 7; k++) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.5), new THREE.MeshStandardMaterial({ color: cols[(k + r) % cols.length] })); sh.position.set(-0.75 + k * 0.25, 1.1, 0); rack.add(sh); }
      g.add(rack);
    }
    b.racks = b.toWorld(0, b.d / 2 - 1.2);
    box(g, 1.6, 1.0, 0.6, hw - 1.4, 0.64, b.d - 1.0, M.wood);
    npcAt(g, hw - 1.4, b.d - 0.45, Math.PI, null);
    const mi = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), M.mirror); mi.position.set(hw - 0.14, 1.2, 2.5); mi.rotation.y = -Math.PI / 2; g.add(mi);
  }
  function furnishCafe(b) {
    const g = b.interior, hw = b.w / 2;
    box(g, 3.2, 1.05, 0.7, 0, 0.66, b.d - 1.4, M.wood);
    const mach = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.5, 0.4, 2, 0.04), M.chrome); mach.position.set(-0.8, 1.45, b.d - 1.4); g.add(mach);
    b.counter = b.toWorld(0, b.d - 2.5);
    npcAt(g, 0, b.d - 0.6, Math.PI, null, '#5a3a1c');
    for (let k = 0; k < 4; k++) {
      const x = (k % 2 ? 1 : -1) * (hw - 2), z = 2.4 + Math.floor(k / 2) * 2.6;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 20), M.marble); t.position.set(x, 0.9, z); g.add(t);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.75, 10), M.frame); leg.position.set(x, 0.5, z); g.add(leg);
      if (k % 2) npcAt(g, x + 0.7, z, -Math.PI / 2, null);
    }
  }
  function furnishCars(b) {
    const g = b.interior;
    b.carSpots = [];
    CARS.forEach((c, k) => {
      const x = -b.w / 2 + 3 + k * 4.6, z = b.d / 2 + 0.5;
      const m = carModel(c.color, c.kind); m.position.set(x, 0.14, z); m.rotation.y = 0.5; g.add(m);
      b.carSpots.push({ car: c, world: b.toWorld(x, z - 2.2) });
    });
    box(g, 1.6, 1.0, 0.6, b.w / 2 - 1.4, 0.64, b.d - 1.0, M.wood);
    b.desk = b.toWorld(b.w / 2 - 1.4, b.d - 2.0);
    npcAt(g, b.w / 2 - 1.4, b.d - 0.45, Math.PI, { skin: '#c98e66', hair: '#151010', shirt: '#2b4a8a', pants: '#141414', shoes: '#141414' });
  }

  // ---------------------------------------------------------------- filler buildings (merged)
  const palette = ['#b7a58c', '#8f8a84', '#a86b4f', '#d6cfc0', '#6d7580', '#c2a37a', '#8a6a5a', '#5f6b5c'];
  const facades = palette.map((c, k) => facadeTextures(c, 100 + k));
  const fillerGeoms = palette.map(() => []);
  const roofGeoms = [];
  const used = {}; // "i,j,side" -> [ [a,b], ... ] occupied along the side
  const mark = (lot, w) => { const k = `${lot.block[0]},${lot.block[1]},${lot.side}`; (used[k] ||= []).push([lot.off - w / 2 - 0.6, lot.off + w / 2 + 0.6]); };
  for (const l of [...SHOPS, ...PROPERTIES, ...HOMES, ...PLACES]) mark(l, l.w);
  function addTower(cx, cz, w, d, h) {
    const k = Math.floor(rnd() * palette.length);
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    // face order: +x, -x, +y, -y, +z, -z (4 vertices each)
    for (let f = 0; f < 6; f++) {
      const sw = f < 2 ? d : w;
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        if (f === 2 || f === 3) { uv.setXY(i, 0.05, 0.02); continue; }
        uv.setXY(i, uv.getX(i) * sw / 7, uv.getY(i) * h / 7);
      }
    }
    geo.translate(cx, h / 2 + 0.14, cz);
    fillerGeoms[k].push(geo);
    roofGeoms.push(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3).translate(cx, h + 0.34, cz));
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    footprints.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, kind: 'building' });
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === PARK_BLOCK[0] && j === PARK_BLOCK[1]) continue;
    const c = blockCenter(i, j);
    for (const side of ['n', 's', 'e', 'w']) {
      const occ = (used[`${i},${j},${side}`] || []).sort((a, b) => a[0] - b[0]);
      let t = -15;
      const spans = [];
      for (const [a, b2] of occ) { if (a > t + 4) spans.push([t, a]); t = Math.max(t, b2); }
      if (15 > t + 4) spans.push([t, 15]);
      for (const [a, b2] of spans) {
        let x = a;
        while (b2 - x >= 4) {
          const w = Math.min(b2 - x, 6 + rnd() * 6);
          const d = 9 + rnd() * 4, h = 6 + rnd() * (j === 0 || i === 3 ? 22 : 12);
          const off = x + w / 2;
          const fr = lotFrame(i, j, side, off);
          const cx = fr.x - fr.out[0] * d / 2, cz = fr.z - fr.out[1] * d / 2;
          const along = side === 'n' || side === 's';
          addTower(cx, cz, along ? w - 0.4 : d, along ? d : w - 0.4, h);
          x += w;
        }
      }
    }
    // corner towers and a tall building in the middle of the block
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addTower(c.x + sx * 17.5, c.z + sz * 17.5, 6.5, 6.5, 10 + rnd() * 20);
    addTower(c.x, c.z, 11, 11, 14 + rnd() * 30);
  }
  fillerGeoms.forEach((list, k) => {
    if (!list.length) return;
    const m = new THREE.MeshStandardMaterial({ map: facades[k].map, emissiveMap: facades[k].em, emissive: '#ffd9a0', emissiveIntensity: 0, roughness: 0.85 });
    nightMats.push(m);
    const mesh = new THREE.Mesh(mergeGeometries(list), m);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  });
  root.add(new THREE.Mesh(mergeGeometries(roofGeoms), M.roof));

  // ---------------------------------------------------------------- park
  {
    const c = blockCenter(PARK_BLOCK[0], PARK_BLOCK[1]);
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 6, 0.06, BLOCK - 6), M.grass); lawn.position.set(c.x, 0.17, c.z); lawn.receiveShadow = true; root.add(lawn);
    const fount = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.6, 32), M.marble); fount.position.set(c.x, 0.44, c.z); root.add(fount);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.05, 32), M.water); water.position.set(c.x, 0.72, c.z); root.add(water);
    colliders.push({ minX: c.x - 3, maxX: c.x + 3, minZ: c.z - 3, maxZ: c.z + 3 });
    footprints.push({ minX: c.x - 3, maxX: c.x + 3, minZ: c.z - 3, maxZ: c.z + 3, kind: 'park' });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; bench(root, c.x + Math.cos(a) * 7, c.z + Math.sin(a) * 7, -a - Math.PI / 2, 1.6, M.wood); }
    footprints.push({ minX: c.x - BLOCK / 2 + 3, maxX: c.x + BLOCK / 2 - 3, minZ: c.z - BLOCK / 2 + 3, maxZ: c.z + BLOCK / 2 - 3, kind: 'parkArea' });
  }

  // ---------------------------------------------------------------- trees and street lamps (instanced)
  const treePos = [], lampPos = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const c = blockCenter(i, j);
    for (let t = -21; t <= 21; t += 10.5) {
      for (const [x, z] of [[c.x + t, c.z - 23.5], [c.x + t, c.z + 23.5], [c.x - 23.5, c.z + t], [c.x + 23.5, c.z + t]]) {
        if (Math.abs(t) > 20) continue;
        (Math.round((t + 21) / 10.5) % 2 ? lampPos : treePos).push([x, z]);
      }
    }
    if (i === PARK_BLOCK[0] && j === PARK_BLOCK[1]) for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; treePos.push([c.x + Math.cos(a) * 15, c.z + Math.sin(a) * 15]); }
  }
  // keep doorways clear: no tree or lamp right in front of an entrance
  const doors = Object.values(buildings).map((b) => b.door);
  const clear = ([x, z]) => doors.every((d) => Math.hypot(d.x - x, d.z - z) > 3.2);
  for (const list of [treePos, lampPos]) { const keep = list.filter(clear); list.length = 0; list.push(...keep); }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 2.6, 8), M.trunk, treePos.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.4, 1), M.leaf, treePos.length);
  const m4 = new THREE.Matrix4();
  treePos.forEach(([x, z], k) => {
    trunks.setMatrixAt(k, m4.makeTranslation(x, 1.44, z));
    const s = 0.85 + rnd() * 0.4;
    crowns.setMatrixAt(k, m4.makeScale(s, s * 1.1, s).setPosition(x, 3.4, z));
  });
  trunks.castShadow = crowns.castShadow = true;
  root.add(trunks, crowns);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 5, 8), M.frame, lampPos.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 12, 8), M.lamp, lampPos.length);
  lampPos.forEach(([x, z], k) => {
    poles.setMatrixAt(k, m4.makeTranslation(x, 2.64, z));
    heads.setMatrixAt(k, m4.makeTranslation(x, 5.2, z));
    lamps.push({ x, z });
  });
  root.add(poles, heads);
  for (const [x, z] of [...treePos, ...lampPos]) colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 });

  return { root, colliders, footprints, buildings, interact, lamps, nightMats, M, furnishBarbershop, stationAt, chairModel, carModel, box };
}

function poleTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 64, 128);
  const cols = ['#c8102e', '#f4f4f4', '#1f3f8f', '#f4f4f4'];
  for (let i = -4; i < 8; i++) { g.fillStyle = cols[((i % 4) + 4) % 4]; g.beginPath(); g.moveTo(0, i * 16); g.lineTo(64, i * 16 + 32); g.lineTo(64, i * 16 + 48); g.lineTo(0, i * 16 + 16); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Simple car / scooter model, facing +Z. */
export function carModel(color, kind = 'car') {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1d2a36', roughness: 0.05, metalness: 0.6 });
  const tire = new THREE.CylinderGeometry(kind === 'scooter' ? 0.25 : 0.34, kind === 'scooter' ? 0.25 : 0.34, kind === 'scooter' ? 0.12 : 0.24, 16);
  tire.rotateZ(Math.PI / 2);
  if (kind === 'scooter') {
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.5, 1.4, 3, 0.15), paint); body.position.y = 0.55; g.add(body);
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.35, 0.12, 0.6, 2, 0.05), dark); seat.position.set(0, 0.86, -0.2); g.add(seat);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), dark); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.15, 0.55); g.add(bar);
    for (const z of [-0.55, 0.6]) { const w = new THREE.Mesh(tire, dark); w.position.set(0, 0.25, z); g.add(w); }
  } else {
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.7, 4.0, 3, 0.2), paint); body.position.y = 0.65; g.add(body);
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.6, 2.1, 3, 0.2), glass); cabin.position.set(0, 1.25, -0.2); g.add(cabin);
    for (const [x, z] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) { const w = new THREE.Mesh(tire, dark); w.position.set(x, 0.34, z); g.add(w); }
    const lightM = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff6d8', emissiveIntensity: 0.5 });
    for (const x of [-0.6, 0.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), lightM); l.position.set(x, 0.75, 2.0); g.add(l); }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
