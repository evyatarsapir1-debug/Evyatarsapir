// What the player bought and designed, made visible in the 3D shop: colours, floor, extra stations, furniture, signs.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { floorTexture2, signTexture } from './shop.js';

let decor = null;
let lastFloor = null;

function neonTexture(text) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.font = 'bold 110px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff3df2'; g.shadowBlur = 30; g.fillStyle = '#ffd6fb';
  g.fillText(text, 512, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function station(shop, premium) {
  const g = new THREE.Group();
  const counter = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.8, 0.4, 3, 0.02), shop.M.darkWood);
  counter.position.set(0, 0.4, 0.42); g.add(counter);
  const top = new THREE.Mesh(new RoundedBoxGeometry(0.96, 0.04, 0.44, 3, 0.01), shop.M.marble);
  top.position.set(0, 0.82, 0.42); g.add(top);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(0.8, 1.0, 0.03, 3, 0.01), shop.M.brass);
  frame.position.set(0, 1.45, 0.61); g.add(frame);
  // non-reflective mirror for the extra stations (only the main station renders a real reflection)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.92), new THREE.MeshStandardMaterial({ color: '#9aa4ad', metalness: 1, roughness: 0.08 }));
  glass.position.set(0, 1.45, 0.592); glass.rotation.y = Math.PI; g.add(glass);
  const chair = shop.chair.clone();
  chair.visible = true;
  chair.scale.setScalar(0.95);
  if (premium) chair.traverse((o) => { if (o.isMesh && o.material === shop.M.leather) o.material = shop.M.leather2 ||= shop.M.leather.clone(); });
  g.add(chair);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Rebuild the decor from the shop state (cheap: only a few meshes). */
export function applyDecor(shop, s, tools, TOOLS) {
  if (!shop) return;
  if (decor) { shop.group.remove(decor); decor.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
  decor = new THREE.Group(); decor.name = 'decor';
  shop.group.add(decor);
  const owned = s && s.owned;
  const has = (id) => !!(owned && s.items[id]);
  // colours and floor
  shop.wallMat.color.set(owned ? s.theme.wall : '#26332f');
  shop.M.leather.color.set(owned ? s.theme.leather : '#4a1414');
  if (shop.M.leather2) shop.M.leather2.color.set(owned ? s.theme.leather : '#4a1414').offsetHSL(0, 0, 0.06);
  const fl = owned ? s.theme.floor : 'checker';
  if (fl !== lastFloor) {
    const t = floorTexture2(fl); t.repeat.set(3, 3);
    shop.floor.material.map = t; shop.floor.material.needsUpdate = true;
    lastFloor = fl;
  }
  shop.sign.material.map = owned ? signTexture(s.name.toUpperCase().slice(0, 22) || 'MY BARBERSHOP', `★ ${(s.rating || 0).toFixed(1)}  ·  BARBER SHOP`) : signTexture();
  shop.sign.material.needsUpdate = true;
  // extra stations along the side walls (each bought chair = one more working station)
  const extra = owned ? Math.max(0, s.stations - 1) : 0;
  const spots = [[-2.05, -0.2, Math.PI / 2], [2.05, -0.2, -Math.PI / 2], [-2.05, -1.6, Math.PI / 2], [2.05, -1.6, -Math.PI / 2]];
  for (let i = 0; i < Math.min(extra, spots.length); i++) {
    const st = station(shop, has('chair_premium') && i === 0);
    st.position.set(spots[i][0], 0, spots[i][1]);
    st.rotation.y = spots[i][2] + Math.PI;
    decor.add(st);
  }
  // furniture & decoration
  if (has('sofa')) {
    const sofa = new THREE.Group();
    const seat = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.2, 0.55, 3, 0.06), shop.M.leather);
    seat.position.y = 0.32; sofa.add(seat);
    const back = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.5, 0.14, 3, 0.05), shop.M.leather);
    back.position.set(0, 0.6, -0.22); sofa.add(back);
    for (const sx of [-0.62, 0.62]) { const arm = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.42, 0.55, 3, 0.04), shop.M.leather); arm.position.set(sx, 0.43, 0); sofa.add(arm); }
    sofa.position.set(1.4, 0, -2.6);
    decor.add(sofa);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 32), shop.M.marble);
    table.position.set(0.25, 0.4, -2.2); decor.add(table);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.4, 12), shop.M.brass);
    leg.position.set(0.25, 0.2, -2.2); decor.add(leg);
  }
  if (has('coffee')) {
    const tableC = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.9, 0.4, 2, 0.02), shop.M.darkWood);
    tableC.position.set(-1.6, 0.45, -2.7); decor.add(tableC);
    const mach = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.4, 0.3, 3, 0.03), new THREE.MeshStandardMaterial({ color: '#b0b3b8', metalness: 0.9, roughness: 0.25 }));
    mach.position.set(-1.65, 1.1, -2.72); decor.add(mach);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.07, 16), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.4 }));
    cup.position.set(-1.45, 0.94, -2.62); decor.add(cup);
  }
  if (has('plants')) {
    const leafMat = new THREE.MeshStandardMaterial({ color: '#3d7a3f', roughness: 0.7, side: THREE.DoubleSide });
    for (const [x, z] of [[2.2, 1.0], [-2.25, 0.9], [2.25, -2.75]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.3, 20), new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6 }));
      pot.position.set(x, 0.15, z); decor.add(pot);
      for (let i = 0; i < 12; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), leafMat);
        const a = i * 2.4; leaf.scale.set(0.3, 1.2, 0.08);
        leaf.position.set(x + Math.cos(a) * 0.08, 0.45 + (i % 4) * 0.08, z + Math.sin(a) * 0.08);
        leaf.rotation.set(Math.cos(a) * 0.6, a, Math.sin(a) * 0.6); decor.add(leaf);
      }
    }
  }
  if (has('neon')) {
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: neonTexture(s.name || 'BARBER'), transparent: true, toneMapped: false }));
    neon.position.set(0, 1.55, -2.97); decor.add(neon);
  }
  shop.frame.material = has('mirror_led') ? (shop.M.led ||= new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#e8f2ff', emissiveIntensity: 1.6 })) : shop.M.brass;
  shop.key.intensity = has('lights') ? 2.9 : 2.4;
  shop.mirrorLight.intensity = has('lights') ? 2.4 : 1.6;
  if (has('sterilizer')) {
    const cab = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.26, 0.24, 2, 0.02), new THREE.MeshStandardMaterial({ color: '#e9eef2', roughness: 0.3 }));
    cab.position.set(0.68, 0.97, 1.04); decor.add(cab);
    const uv = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), new THREE.MeshBasicMaterial({ color: '#8f6bff', toneMapped: false }));
    uv.position.set(0.68, 0.97, 0.915); uv.rotation.y = Math.PI; decor.add(uv);
  }
  // equipment quality
  if (tools) {
    tools.quality.clipper = has('clipper_pro') ? 0.88 : 0.7;
    tools.quality.trimmer = has('trimmer_pro') ? 0.92 : 0.75;
    tools.quality.scissors = has('scissors_pro') ? 0.92 : 0.75;
    TOOLS.duster.radius = has('duster_pro') ? 0.11 : 0.07;
  }
}
