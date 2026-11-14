// The training room / barbershop corner: floor, walls, mirror station, barber chair, lighting and decor.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function floorTexture() {
  return canvasTex(512, 512, (g, w) => {
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#1b1c1f' : '#e9e5dc';
      g.fillRect(x * s, y * s, s, s);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(${(x + y) % 2 ? '255,255,255' : '0,0,0'},${Math.random() * 0.04})`;
        g.fillRect(x * s + Math.random() * s, y * s + Math.random() * s, 3, 3);
      }
    }
    g.strokeStyle = 'rgba(120,120,120,0.55)'; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, w); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  });
}

function woodTexture(base = '#6b4429') {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * h;
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,15,5' : '160,110,70'},${0.08 + Math.random() * 0.12})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
      g.stroke();
    }
  });
}

function wallTexture() {
  // neutral plaster: the wall colour comes from the material (so the shop can be repainted)
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.035})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

function poleTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h);
    const cols = ['#c8102e', '#f4f4f4', '#1f3f8f', '#f4f4f4'];
    for (let i = -8; i < 16; i++) {
      g.fillStyle = cols[((i % 4) + 4) % 4];
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32 + 64); g.lineTo(w, i * 32 + 96); g.lineTo(0, i * 32 + 32); g.fill();
    }
  });
}

export function signTexture(title = 'BARBER LIFE', sub = 'ACADEMY  ·  EST. 2026') {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#121212'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a45c'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#e7c983'; g.font = 'bold 120px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${title.length > 12 ? Math.max(56, 120 - (title.length - 12) * 6) : 120}px Georgia, "Segoe UI", Arial, serif`;
    g.fillText(title, w / 2, h / 2 - 12);
    g.font = '32px Georgia, serif'; g.fillStyle = '#bfa06a';
    g.fillText(sub, w / 2, h / 2 + 72);
  });
}

/** Floor finishes the shop owner can choose. */
export function floorTexture2(style) {
  if (style === 'wood') return canvasTex(512, 512, (g, w) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = ['#6b4429', '#7a5132', '#5e3b23', '#73492c'][i % 4]; g.fillRect(0, i * w / 8, w, w / 8);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, i * w / 8, w, 2);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(30,15,5,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, i * w / 8 + Math.random() * w / 8, 40 + Math.random() * 80, 1.5); }
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(((i * 197) % w), i * w / 8, 2, w / 8);
    }
  });
  if (style === 'marble') return canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#ece9e3'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(120,115,110,${0.1 + Math.random() * 0.2})`; g.lineWidth = 0.5 + Math.random() * 2;
      g.beginPath(); let x = Math.random() * w, y = 0; g.moveTo(x, y);
      while (y < w) { x += (Math.random() - 0.5) * 40; y += 20 + Math.random() * 30; g.lineTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(80,80,80,0.4)'; g.lineWidth = 2; g.strokeRect(0, 0, w, w);
  });
  if (style === 'concrete') return canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#7d7f80'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * w, 2, 2); }
  });
  return floorTexture();
}

export function buildShop(renderer, { mirrorRes = 512 } = {}) {
  const group = new THREE.Group(); group.name = 'shop';
  const M = {
    chrome: new THREE.MeshStandardMaterial({ color: '#e8e8ea', metalness: 1, roughness: 0.12 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c9a45c', metalness: 1, roughness: 0.28 }),
    leather: new THREE.MeshPhysicalMaterial({ color: '#4a1414', roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new THREE.Color('#ff6b5a') }),
    blackMatte: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.5 }),
    darkWood: new THREE.MeshStandardMaterial({ map: woodTexture('#3a2416'), roughness: 0.55 }),
    marble: new THREE.MeshPhysicalMaterial({ color: '#f1efea', roughness: 0.22, clearcoat: 0.6 }),
  };

  // Floor, walls, ceiling.
  const ft = floorTexture(); ft.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshPhysicalMaterial({ map: ft, roughness: 0.32, clearcoat: 0.4, clearcoatRoughness: 0.25 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  group.add(floor);
  const wt = wallTexture(); wt.repeat.set(3, 1.5);
  const wallMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.9, color: '#26332f' });
  const wall = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; group.add(m); return m;
  };
  wall(6, 3, 0, 1.5, 1.3, Math.PI); wall(6, 3, 0, 1.5, -3, 0); wall(4.3, 3, 2.6, 1.5, -0.85, -Math.PI / 2); wall(4.3, 3, -2.6, 1.5, -0.85, Math.PI / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 3; group.add(ceil);
  // wood wainscoting along the mirror wall
  const wains = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.9, 0.03), M.darkWood);
  wains.position.set(0, 0.45, 1.28); group.add(wains);

  // Station: counter + mirror + lamps + products.
  const counter = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.8, 0.45, 3, 0.02), M.darkWood);
  counter.position.set(0, 0.4, 1.06); counter.castShadow = counter.receiveShadow = true; group.add(counter);
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.78, 0.04, 0.5, 3, 0.012), M.marble);
  top.position.set(0, 0.82, 1.04); top.receiveShadow = true; group.add(top);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(1.42, 1.22, 0.04, 3, 0.012), M.brass);
  frame.position.set(0, 1.55, 1.27); group.add(frame);
  const mirror = new Reflector(new THREE.PlaneGeometry(1.32, 1.12), {
    textureWidth: mirrorRes, textureHeight: Math.round(mirrorRes * 1.12 / 1.32), color: 0xb8bcc0, multisample: 4,
  });
  mirror.position.set(0, 1.55, 1.245); mirror.rotation.y = Math.PI;
  mirror.name = 'mirror';
  group.add(mirror);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffe7c0', emissiveIntensity: 2.2 });
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 20), lampMat);
    lamp.position.set(sx * 0.82, 1.55, 1.22); group.add(lamp);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 20), M.brass);
    cap.position.set(sx * 0.82, 2.02, 1.22); group.add(cap.clone()); cap.position.y = 1.08; group.add(cap);
  }
  // products on the counter
  const bottle = (x, z, h, r, color, capColor) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, transmission: 0.0, clearcoat: 1 }));
    b.position.set(x, 0.84 + h / 2, z); b.castShadow = true; group.add(b);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.6, h * 0.18, 16), new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.3, metalness: 0.4 }));
    c.position.set(x, 0.84 + h + h * 0.09, z); group.add(c);
  };
  bottle(-0.7, 1.08, 0.2, 0.035, '#1c5d8a', '#111'); bottle(-0.6, 1.12, 0.16, 0.03, '#a8742a', '#c9a45c');
  bottle(-0.52, 1.06, 0.13, 0.04, '#2a2a2a', '#c9a45c'); bottle(0.72, 1.1, 0.22, 0.03, '#e8e2d6', '#222');
  // disinfectant jar with combs (hygiene first!)
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.26, 28), new THREE.MeshPhysicalMaterial({ color: '#2f7fd8', roughness: 0.05, transmission: 0.6, thickness: 0.1, ior: 1.33, transparent: true, opacity: 0.85 }));
  jar.position.set(-0.36, 0.97, 1.1); group.add(jar);
  const jarLid = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.02, 28), M.chrome);
  jarLid.position.set(-0.36, 1.11, 1.1); group.add(jarLid);
  for (let i = 0; i < 3; i++) {
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.004), M.blackMatte);
    comb.position.set(-0.37 + i * 0.015, 1.0, 1.1 + (i - 1) * 0.012); comb.rotation.z = (i - 1) * 0.1; group.add(comb);
  }
  // folded towels
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.04, 0.16, 2, 0.015), new THREE.MeshStandardMaterial({ color: '#eae6de', roughness: 1 }));
    t.position.set(0.5, 0.86 + i * 0.041, 1.1); group.add(t);
  }
  // clipper dock
  const dock = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.03, 0.09, 2, 0.01), M.blackMatte);
  dock.position.set(0.26, 0.855, 0.98); group.add(dock);

  // Barber chair.
  const chair = new THREE.Group(); chair.name = 'chair';
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.045, 48), M.chrome);
  base.position.y = 0.022; chair.add(base);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.36, 32), M.chrome);
  column.position.y = 0.22; chair.add(column);
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.06, 32), M.blackMatte);
  housing.position.y = 0.4; chair.add(housing);
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.13, 0.52, 4, 0.05), M.leather);
  seat.position.set(0, 0.5, 0.1); chair.add(seat);
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.5, 0.11, 4, 0.05), M.leather);
  back.position.set(0, 0.8, -0.19); back.rotation.x = -0.12; chair.add(back);
  const backShell = new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.52, 0.03, 3, 0.012), M.chrome);
  backShell.position.set(0, 0.8, -0.255); backShell.rotation.x = -0.12; chair.add(backShell);
  for (const sx of [-1, 1]) {
    const pad = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.06, 0.44, 4, 0.025), M.leather);
    pad.position.set(sx * 0.32, 0.72, 0.1); chair.add(pad);
    for (const z of [-0.08, 0.26]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.16, 12), M.chrome);
      post.position.set(sx * 0.32, 0.62, z); chair.add(post);
    }
  }
  const footBar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 12), M.chrome);
  footBar.position.set(0, 0.33, 0.42); footBar.rotation.x = 0.55; chair.add(footBar);
  const foot = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.025, 0.2, 2, 0.01), M.chrome);
  foot.position.set(0, 0.14, 0.6); chair.add(foot);
  chair.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(chair);

  // Decor: barber pole, sign, waiting bench, shelf, plant, rug.
  const poleTex = poleTexture();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 32, 1, true), new THREE.MeshPhysicalMaterial({ map: poleTex, roughness: 0.2, clearcoat: 1 }));
  pole.position.set(1.2, 1.65, 1.2); group.add(pole);
  for (const y of [1.33, 1.97]) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.chrome);
    c.position.set(1.2, y, 1.2); if (y < 1.5) c.rotation.x = Math.PI; group.add(c);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.5 }));
  sign.position.set(0, 2.5, 1.285); sign.rotation.y = Math.PI; group.add(sign);
  const backSign = sign.clone(); backSign.position.set(0, 2.1, -2.98); backSign.rotation.y = 0; group.add(backSign);
  const bench = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.12, 0.45, 3, 0.04), M.leather);
  bench.position.set(0, 0.45, -2.6); group.add(bench);
  const benchBack = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.45, 0.08, 3, 0.03), M.leather);
  benchBack.position.set(0, 0.75, -2.84); group.add(benchBack);
  for (const sx of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.4), M.blackMatte);
    leg.position.set(sx, 0.2, -2.6); group.add(leg);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.035, 0.22), M.wood);
  shelf.position.set(-1.6, 1.5, 1.18); group.add(shelf);
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12 + (i % 3) * 0.03, 16), new THREE.MeshPhysicalMaterial({ color: ['#2b2b2b', '#c9a45c', '#1c5d8a', '#efe9dc', '#7a2b2b', '#2b2b2b'][i], roughness: 0.25, clearcoat: 1 }));
    p.position.set(-2.1 + i * 0.18, 1.58 + (i % 3) * 0.015, 1.18); group.add(p);
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.35, 24), new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.7 }));
  pot.position.set(-2.2, 0.175, -2.6); group.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#2f6b35', roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 14; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), leafMat);
    leaf.scale.set(0.35, 1.3, 0.08);
    const a = i * 2.4;
    leaf.position.set(-2.2 + Math.cos(a) * 0.1, 0.55 + (i % 4) * 0.08, -2.6 + Math.sin(a) * 0.1);
    leaf.rotation.set(Math.cos(a) * 0.6, a, Math.sin(a) * 0.6);
    group.add(leaf);
  }
  const rug = new THREE.Mesh(new THREE.CircleGeometry(0.85, 48), new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.003, 0.15); rug.receiveShadow = true; group.add(rug);

  // Lights.
  const hemi = new THREE.HemisphereLight('#fff4e6', '#3a3028', 0.55);
  group.add(hemi);
  const key = new THREE.DirectionalLight('#fff1dd', 2.4);
  key.position.set(1.2, 3.2, 1.6); key.target.position.set(0, 1.0, 0.1);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.2; key.shadow.camera.right = 1.2; key.shadow.camera.top = 1.6; key.shadow.camera.bottom = -1.2;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 6; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  group.add(key, key.target);
  const fill = new THREE.DirectionalLight('#c8d6ff', 0.7);
  fill.position.set(-2, 2, -2); group.add(fill);
  const mirrorLight = new THREE.PointLight('#ffe2b8', 1.6, 3, 2);
  mirrorLight.position.set(0, 1.9, 0.95); group.add(mirrorLight);
  // pendant lamps
  for (const x of [-0.9, 0.9]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6), M.blackMatte);
    cord.position.set(x, 2.7, -0.2); group.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#111', metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
    shade.position.set(x, 2.32, -0.2); group.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), lampMat);
    bulb.position.set(x, 2.25, -0.2); group.add(bulb);
  }

  return {
    group, mirror, chair, pole, poleTex, key, fill, hemi, M, wallMat, floor, frame, sign, mirrorLight, lampMat, counter, top,
    toolRest: new THREE.Vector3(0.26, 0.9, 0.98),
    update(dt) { poleTex.offset.y = (poleTex.offset.y + dt * 0.25) % 1; },
  };
}
