// Los Antos Customs: drive into the garage, the car rolls onto the turntable and everything you pick is fitted to
// the 3D car in real time - paint & finish, rims & rim colour, tyres, spoilers, bumpers, lights, window tint, neon,
// ride height and performance parts. Orbit the camera around the car, compare before / after, pay to fit it while a
// mechanic works on the car (sparks, paint mist, tool sounds). Mods are saved with your own cars.
import * as THREE from 'three';
import { GeoBuilder } from '../world/geoBuilder.js';
import { CharacterModel, defaultAppearance } from '../character/characterModel.js';
import { buildVehicleModel, shared } from '../vehicles/vehicleModels.js';
import { VEHICLE_TYPES } from '../vehicles/vehicleTypes.js';
import { fmt } from './economy.js';

// ------------------------------------------------------------------ catalogue
export const PAINTS = [
  [0xf5f5f5, 'לבן שלג'], [0x1d1d1f, 'שחור'], [0x9aa0a6, 'כסף'], [0x4a4f55, 'גרפיט'], [0xc0392b, 'אדום'], [0x7b1f1f, 'בורדו'],
  [0xe67e22, 'כתום'], [0xf1c40f, 'צהוב'], [0x27ae60, 'ירוק'], [0x1e5631, 'ירוק בריטי'], [0x2e86c1, 'כחול'], [0x1f2d4d, 'כחול כהה'],
  [0x00b5c8, 'טורקיז'], [0x8e44ad, 'סגול'], [0xd35480, 'ורוד'], [0xc8b48a, 'בז׳'], [0x6e4b3a, 'חום'], [0x3d5a40, 'זית'],
  [0xb0c4de, 'תכלת'], [0xffd700, 'זהב'], [0x7fff00, 'ירוק ליים'], [0xff4500, 'כתום אש'], [0x4b0082, 'אינדיגו'], [0x2f4f4f, 'אפור צפחה'],
];
export const FINISHES = {
  gloss: { name: 'מבריק', price: 0, metal: 0.5, rough: 0.38, cc: 1, ccR: 0.06 },
  metallic: { name: 'מטאלי', price: 300, metal: 0.85, rough: 0.28, cc: 1, ccR: 0.05 },
  pearl: { name: 'פנינה', price: 800, metal: 0.6, rough: 0.22, cc: 1, ccR: 0.03, irid: 0.7 },
  matte: { name: 'מט', price: 600, metal: 0.1, rough: 0.82, cc: 0, ccR: 0.5 },
  chrome: { name: 'כרום', price: 2500, metal: 1, rough: 0.07, cc: 1, ccR: 0.02 },
};
export const RIMS = [['קלאסי 5 חישורים', 0], ['ספורט 10 חישורים', 900], ['טורבינה', 1300], ['עמוק (דיפ דיש)', 1600], ['דיסק אחיד', 1100], ['שטח מפלדה', 800], ['רשת', 1500]];
export const RIM_COLORS = [[0xc9ced3, 'כסוף'], [0x1d1f22, 'שחור'], [0xd4af37, 'זהב'], [0x4a4f55, 'גרפיט'], [0xf2f2f2, 'לבן'], [0xc0392b, 'אדום'], [0x8c6239, 'ברונזה'], [0xe8eef2, 'כרום']];
export const TIRES = { stock: ['רגילים', 0], sport: ['ספורט — פרופיל נמוך', 1200], offroad: ['שטח', 1400], whitewall: ['פס לבן קלאסי', 900] };
export const SPOILERS = [['ללא', 0], ['שפת זנב', 700], ['כנף ספורט', 1500], ['כנף GT', 2600]];
export const FRONTS = [['מקורי', 0], ['ספליטר ספורט', 1200], ['מגן שטח', 1300]];
export const REARS = [['מקורי', 0], ['מפזר אוויר', 1100], ['אגזוז כפול', 900]];
export const LIGHTS = { stock: ['מקוריים', 0], xenon: ['קסנון לבן־כחול', 800], amber: ['צהובים', 500], smoked: ['אחוריים כהים', 600] };
export const TINTS = [['ללא', 0], ['בהיר', 300], ['כהה', 500], ['לימוזינה', 800]];
export const NEONS = [[null, 'ללא', 0], [0x2e86ff, 'כחול', 1200], [0xff2a2a, 'אדום', 1200], [0x2aff6a, 'ירוק', 1200], [0xb84dff, 'סגול', 1200], [0xffffff, 'לבן', 1200]];
export const HEIGHTS = [[-2, 'נמוך מאוד', 1000], [-1, 'נמוך', 600], [0, 'מקורי', 0], [1, 'מוגבה', 600], [2, 'מוגבה מאוד', 1000]];
const LEVELS = (base) => [0, 1, 2, 3].map((k) => [k, k ? `רמה ${k}` : 'מקורי', k ? base * k : 0]);

export function defaultMods(v) {
  return { color: v.color ?? v.parts.baseColor.getHex(), finish: 'gloss', rim: 0, rimColor: 0xc9ced3, tire: 'stock', spoiler: 0, front: 0, rear: 0, lights: 'stock', tint: 0, neon: null, height: 0, engine: v.tune || 0, turbo: 0, brakes: 0, susp: 0 };
}

// categories shown in the garage (value list + price + label + optional swatch)
function categories(v) {
  const cats = [
    { id: 'color', name: 'צבע', icon: '🎨', work: 'paint', opts: PAINTS.map(([c, n]) => ({ value: c, name: n, price: 400, swatch: c })) },
    { id: 'finish', name: 'גימור', icon: '✨', work: 'paint', opts: Object.entries(FINISHES).map(([k, f]) => ({ value: k, name: f.name, price: f.price })) },
    { id: 'rim', name: 'חישוקים', icon: '🛞', work: 'wheel', opts: RIMS.map(([n, p], i) => ({ value: i, name: n, price: p })) },
    { id: 'rimColor', name: 'צבע חישוקים', icon: '⚙️', work: 'wheel', opts: RIM_COLORS.map(([c, n]) => ({ value: c, name: n, price: 300, swatch: c })) },
    { id: 'tire', name: 'צמיגים', icon: '⭕', work: 'wheel', opts: Object.entries(TIRES).map(([k, [n, p]]) => ({ value: k, name: n, price: p })) },
    { id: 'spoiler', name: 'ספוילר', icon: '🪽', work: 'rear', opts: SPOILERS.map(([n, p], i) => ({ value: i, name: n, price: p })) },
    { id: 'front', name: 'פגוש קדמי', icon: '🔺', work: 'front', opts: FRONTS.map(([n, p], i) => ({ value: i, name: n, price: p })) },
    { id: 'rear', name: 'פגוש אחורי', icon: '🔻', work: 'rear', opts: REARS.map(([n, p], i) => ({ value: i, name: n, price: p })) },
    { id: 'lights', name: 'פנסים', icon: '💡', work: 'front', opts: Object.entries(LIGHTS).map(([k, [n, p]]) => ({ value: k, name: n, price: p })) },
    { id: 'tint', name: 'חלונות', icon: '🕶️', work: 'side', opts: TINTS.map(([n, p], i) => ({ value: i, name: n, price: p })) },
    { id: 'neon', name: 'ניאון', icon: '🌈', work: 'side', opts: NEONS.map(([c, n, p]) => ({ value: c, name: n, price: p, swatch: c ?? undefined })) },
    { id: 'height', name: 'גובה', icon: '↕️', work: 'wheel', opts: HEIGHTS.map(([h, n, p]) => ({ value: h, name: n, price: p })) },
    { id: 'engine', name: 'מנוע', icon: '🔧', work: 'front', opts: LEVELS(2500).map(([k, n, p]) => ({ value: k, name: n, price: p, desc: k ? `+${15 * k}% תאוצה` : '' })) },
    { id: 'turbo', name: 'טורבו', icon: '🌀', work: 'front', opts: [{ value: 0, name: 'ללא', price: 0 }, { value: 1, name: 'טורבו', price: 4000, desc: '+15% תאוצה' }] },
    { id: 'brakes', name: 'בלמים', icon: '🛑', work: 'wheel', opts: LEVELS(1200).map(([k, n, p]) => ({ value: k, name: n, price: p, desc: k ? `+${20 * k}% בלימה` : '' })) },
    { id: 'susp', name: 'מתלים', icon: '🏁', work: 'wheel', opts: LEVELS(1500).map(([k, n, p]) => ({ value: k, name: n, price: p, desc: k ? `+${10 * k}% אחיזה` : '' })) },
  ];
  if (!v.parts.dims) {   // no body kit on this model: offer only what really changes it (paint + performance)
    const keep = new Set(['color', 'finish', 'engine', 'turbo', 'brakes', 'susp']);
    for (let i = cats.length - 1; i >= 0; i--) if (!keep.has(cats[i].id)) cats.splice(i, 1);
  }
  if (v.damage > 1 || v.wrecked) cats.unshift({ id: 'repair', name: 'תיקון', icon: '🧰', work: 'side', opts: [{ value: 1, name: `תיקון מלא (נזק ${Math.round(v.damage)}%)`, price: 250 + Math.round(v.damage * 6) }] });
  if (!v.owned) cats.push({ id: 'own', name: 'רישום', icon: '📄', work: 'side', opts: [{ value: 1, name: 'רשום את הרכב על שמך', price: 1500, desc: 'השדרוגים נשמרים והרכב מחכה לך ליד הבית' }] });
  return cats;
}

// ------------------------------------------------------------------ geometry: rims + tyres
const rimCache = new Map();
const _rz = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
function rimGeo(r, w, style, color, tire) {
  const key = [r.toFixed(2), w.toFixed(2), style, color, tire].join('|');
  if (rimCache.has(key)) return rimCache.get(key);
  const b = new GeoBuilder();
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const tw = tire === 'offroad' ? w * 1.25 : tire === 'sport' ? w * 1.1 : w;
  const rr = tire === 'sport' ? r * 0.74 : tire === 'offroad' ? r * 0.56 : r * 0.62;       // rim radius
  const tr = tire === 'offroad' ? r * 1.06 : r;
  // tyre: tread + sidewalls, open in the middle so the brake disc and caliper show through the spokes
  b.addGeometry(new THREE.CylinderGeometry(tr, tr, tw, 24, 1, true), _rz, 0x181818);
  for (const sx of [-1, 1]) {
    b.addGeometry(new THREE.RingGeometry(rr * 0.98, tr, 24, 1), new THREE.Matrix4().multiplyMatrices(T(sx * tw / 2, 0, 0), new THREE.Matrix4().makeRotationY(sx * Math.PI / 2)), 0x1c1c1c);
    b.addGeometry(new THREE.CylinderGeometry(rr * 0.98, rr * 0.98, 0.01, 20), new THREE.Matrix4().multiplyMatrices(T(sx * (tw / 2 - 0.1), 0, 0), _rz), 0x15171a);   // dark wheel well behind
    b.addGeometry(new THREE.CylinderGeometry(rr * 0.78, rr * 0.78, 0.016, 22), new THREE.Matrix4().multiplyMatrices(T(sx * (tw / 2 - 0.075), 0, 0), _rz), 0x8d9196);  // brake disc
  }
  if (tire === 'offroad') for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; b.addGeometry(new THREE.BoxGeometry(tw * 1.02, 0.05, 0.09), new THREE.Matrix4().makeRotationX(a).multiply(T(0, tr - 0.01, 0)), 0x222222); }
  if (tire === 'whitewall') for (const sx of [-1, 1]) b.addGeometry(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.006, 24), new THREE.Matrix4().multiplyMatrices(T(sx * (tw / 2 + 0.002), 0, 0), _rz), 0xf2f2f2);
  const dark = 0x2a2d30, c = color;
  b.addGeometry(new THREE.CylinderGeometry(rr, rr, tw + 0.006, 20, 1, true), _rz, dark);         // rim barrel (open: you see in)
  for (const sx of [-1, 1]) {
    const face = (geo, m4, col = c) => b.addGeometry(geo, new THREE.Matrix4().multiplyMatrices(T(sx * (tw / 2 + 0.006), 0, 0), m4), col);
    const spoke = (a, len, wd, off = 0.32, th = 0.02) => face(new THREE.BoxGeometry(th, rr * len, rr * wd), new THREE.Matrix4().makeRotationX(a).multiply(T(0, rr * off, 0)));
    face(new THREE.CylinderGeometry(rr, rr, 0.008, 22, 1, true), _rz);                           // outer lip ring
    switch (style) {
      case 0: for (let i = 0; i < 5; i++) spoke((i / 5) * Math.PI * 2, 0.8, 0.22, 0.5); break;
      case 1: for (let i = 0; i < 10; i++) spoke((i / 10) * Math.PI * 2, 0.85, 0.09, 0.52); break;
      case 2: for (let i = 0; i < 14; i++) face(new THREE.BoxGeometry(0.018, rr * 0.8, rr * 0.12), new THREE.Matrix4().makeRotationX((i / 14) * Math.PI * 2).multiply(new THREE.Matrix4().makeRotationY(0.5)).multiply(T(0, rr * 0.52, 0))); break;
      case 3: face(new THREE.CylinderGeometry(rr * 0.98, rr * 0.98, 0.012, 22), _rz, 0xd8dde2); for (let i = 0; i < 6; i++) spoke((i / 6) * Math.PI * 2, 0.62, 0.16, 0.36, 0.03); break;
      case 4: face(new THREE.CylinderGeometry(rr * 0.95, rr * 0.95, 0.014, 22), _rz); for (let i = 0; i < 5; i++) face(new THREE.CylinderGeometry(rr * 0.07, rr * 0.07, 0.016, 8), new THREE.Matrix4().makeRotationX((i / 5) * Math.PI * 2).multiply(T(0, rr * 0.4, 0)).multiply(_rz), dark); break;
      case 5: face(new THREE.CylinderGeometry(rr * 0.96, rr * 0.96, 0.012, 22), _rz); for (let i = 0; i < 8; i++) face(new THREE.CylinderGeometry(rr * 0.12, rr * 0.12, 0.016, 10), new THREE.Matrix4().makeRotationX((i / 8) * Math.PI * 2).multiply(T(0, rr * 0.6, 0)).multiply(_rz), 0x111111); break;
      case 6: for (let i = 0; i < 9; i++) for (const tilt of [0.55, -0.55]) face(new THREE.BoxGeometry(0.014, rr * 1.0, rr * 0.06), new THREE.Matrix4().makeRotationX((i / 9) * Math.PI * 2 + tilt * 0.4).multiply(T(0, rr * 0.48, 0)).multiply(new THREE.Matrix4().makeRotationX(tilt))); break;
    }
    face(new THREE.CylinderGeometry(rr * 0.2, rr * 0.2, 0.02, 12), _rz, style === 4 ? c : 0xd5d9dd);   // hub cap
    face(new THREE.CylinderGeometry(rr * 0.08, rr * 0.08, 0.026, 8), _rz, 0x222222);
  }
  const g = b.build(); rimCache.set(key, g); return g;
}

// ------------------------------------------------------------------ applying mods to a car (idempotent)
let glowTex = null;
function neonGlow() {             // soft glow that fades out from under the car
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  const gx = x.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.3, 'rgba(255,255,255,1)'); gx.addColorStop(0.7, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gx; x.fillRect(0, 0, 64, 128);
  x.globalCompositeOperation = 'destination-in';
  const gy = x.createLinearGradient(0, 0, 0, 128); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.18, 'rgba(0,0,0,1)'); gy.addColorStop(0.82, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gy; x.fillRect(0, 0, 64, 128);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex;
}
const CARBON = new THREE.MeshPhysicalMaterial({ color: 0x161616, roughness: 0.35, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.08 });
const CHROME = new THREE.MeshStandardMaterial({ color: 0xe6e9ec, metalness: 1, roughness: 0.12 });
export function applyMods(v) {
  const P = v.parts, d = P.dims, m = (v.mods ||= defaultMods(v));
  // paint + finish
  v.setColor(m.color); v.rebuildLod?.();
  const F = FINISHES[m.finish] || FINISHES.gloss, pm = P.paint;
  pm.metalness = F.metal; pm.roughness = F.rough; pm.clearcoat = F.cc; pm.clearcoatRoughness = F.ccR;
  if ('iridescence' in pm) pm.iridescence = F.irid || 0;
  if (m.finish === 'chrome') pm.color.lerp(new THREE.Color(0xffffff), 0.35);
  pm.needsUpdate = true;
  // performance (always from the base model so it never stacks twice)
  const base = VEHICLE_TYPES[v.typeKey] || v.baseT || (v.baseT = { ...v.T });
  v.T = { ...base, accel: base.accel * (1 + 0.15 * m.engine) * (m.turbo ? 1.15 : 1), maxSpeed: base.maxSpeed * (1 + 0.1 * m.engine + (m.turbo ? 0.05 : 0)), brake: base.brake * (1 + 0.2 * m.brakes), grip: base.grip * (1 + 0.1 * m.susp) };
  v.tune = m.engine;
  if (!d) return;                     // bikes, buses, trucks, military: paint + performance only
  // rims + tyres
  for (const w of P.wheels) { const mesh = w.spin.children[0]; if (mesh) mesh.geometry = rimGeo(d.r, d.wheelW, m.rim, m.rimColor, m.tire); }
  // ride height
  P.body.position.y = m.height * 0.065 + (m.tire === 'offroad' ? 0.04 : 0);
  // lights (own materials so other cars are not affected)
  if (!v._headMat) { v._headMat = shared.head.clone(); v._tailMat = shared.tail.clone(); P.body.traverse((o) => { if (o.material === shared.head) o.material = v._headMat; if (o.material === shared.tail) o.material = v._tailMat; }); }
  const L = m.lights;
  v._headMat.color.setHex(L === 'amber' ? 0xffd27a : L === 'xenon' ? 0xdfe9ff : 0xffffff);
  v._headMat.emissive.setHex(L === 'amber' ? 0xffb030 : L === 'xenon' ? 0xbfd6ff : 0xfff5d0);
  v._tailMat.color.setHex(L === 'smoked' ? 0x2a0505 : 0x8b0000);
  // window tint
  if (!v._glassMat) { v._glassMat = shared.glass.clone(); P.body.traverse((o) => { if (o.material === shared.glass) o.material = v._glassMat; }); }
  v._glassMat.opacity = [0.55, 0.7, 0.86, 0.96][m.tint]; v._glassMat.color.setHex([0x1c2a36, 0x16202a, 0x0d1218, 0x050709][m.tint]);
  // body kit: spoiler, front, rear, neon
  if (P.kit) { P.body.remove(P.kit); P.kit.traverse((o) => o.geometry?.dispose()); }
  const k = new THREE.Group(); P.kit = k; P.body.add(k);
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; k.add(o); return o; };
  const B = (w, h, dd) => new THREE.BoxGeometry(w, h, dd), Cy = (r, h) => new THREE.CylinderGeometry(r, r, h, 12);
  const top = d.clear + d.lowH, zr = -d.L / 2, zf = d.L / 2;
  if (m.spoiler === 1) add(B(d.W * 0.86, 0.05, 0.18), P.paint, 0, top - 0.05, zr + 0.16, 0.18);
  if (m.spoiler === 2) { for (const sx of [-1, 1]) add(B(0.05, 0.22, 0.08), CARBON, sx * d.W * 0.32, top + 0.11, zr + 0.3); add(B(d.W * 0.92, 0.04, 0.32), CARBON, 0, top + 0.24, zr + 0.3, -0.08); }
  if (m.spoiler === 3) { for (const sx of [-1, 1]) { add(B(0.05, 0.44, 0.1), CARBON, sx * d.W * 0.3, top + 0.22, zr + 0.32); add(B(0.03, 0.2, 0.48), CARBON, sx * d.W * 0.51, top + 0.46, zr + 0.3); } add(B(d.W * 1.02, 0.05, 0.42), CARBON, 0, top + 0.45, zr + 0.3, -0.1); }
  if (m.front === 1) { add(B(d.W * 1.02, 0.03, 0.24), CARBON, 0, d.clear + 0.03, zf + 0.08); for (const sx of [-1, 1]) add(B(0.18, 0.02, 0.1), CARBON, sx * d.W * 0.47, d.clear + d.lowH * 0.3, zf + 0.04, 0, sx * 0.3); }
  if (m.front === 2) { for (const sx of [-1, 1]) add(Cy(0.04, d.lowH * 0.95), CARBON, sx * 0.42, d.clear + d.lowH * 0.45, zf + 0.24); for (const yy of [0.72, 0.28]) add(Cy(0.035, d.W * 0.78), CARBON, 0, d.clear + d.lowH * yy, zf + 0.24, 0, Math.PI / 2); add(B(d.W * 0.5, 0.04, 0.3), CHROME, 0, d.clear + 0.02, zf + 0.1); }
  if (m.rear === 1) { add(B(d.W * 0.82, 0.04, 0.3), CARBON, 0, d.clear + 0.04, zr - 0.06); for (let i = -2; i <= 2; i++) add(B(0.02, 0.12, 0.28), CARBON, i * d.W * 0.14, d.clear + 0.1, zr - 0.06); }
  if (m.rear === 2) for (const sx of [-1, 1]) for (const o of [0.24, 0.34]) add(Cy(0.05, 0.2), CHROME, sx * d.W * o, d.clear + 0.12, zr - 0.08, Math.PI / 2);
  // brakes: big painted calipers that show through the rims (red / yellow / blue by level)
  for (const w of P.wheels) {
    if (w.caliper) { w.pivot.remove(w.caliper); w.caliper = null; }
    if (!m.brakes) continue;
    const side = Math.sign(w.pivot.position.x) || 1, cal = new THREE.Mesh(new THREE.BoxGeometry(0.06, d.r * 0.5, d.r * 0.42), new THREE.MeshStandardMaterial({ color: [0, 0xd62020, 0xf2c230, 0x2e86ff][m.brakes], roughness: 0.4, metalness: 0.3 }));
    const tw = d.wheelW * (m.tire === 'offroad' ? 1.25 : m.tire === 'sport' ? 1.1 : 1);
    cal.position.set(side * (tw / 2 - 0.035), d.r * 0.3, -d.r * 0.2); w.pivot.add(cal); w.caliper = cal;
  }
  // turbo: an intake scoop on the bonnet; engine levels 2+: twin vents beside it
  const hoodY = d.clear + d.lowH - 0.04;
  if (m.turbo) { add(B(d.W * 0.34, 0.09, d.L * 0.16), CARBON, 0, hoodY + 0.04, zf - d.L * 0.24, -0.06); add(B(d.W * 0.26, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0x050505 }), 0, hoodY + 0.06, zf - d.L * 0.16); }
  if (m.engine >= 2) for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) add(B(0.16, 0.02, 0.03), CARBON, sx * d.W * 0.3, hoodY + 0.012, zf - d.L * 0.2 - i * 0.07);
  if (m.neon != null) {
    const nm = new THREE.MeshBasicMaterial({ color: m.neon, map: neonGlow(), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pl = add(new THREE.PlaneGeometry(d.W * 1.7, d.L * 1.15), nm, 0, -P.body.position.y + 0.09, 0, -Math.PI / 2); pl.castShadow = false;
    for (const sx of [-1, 1]) { const t = add(B(0.04, 0.02, d.L * 0.8), new THREE.MeshBasicMaterial({ color: m.neon, toneMapped: false }), sx * d.W * 0.42, d.clear - 0.02, 0); t.castShadow = false; }
  }
}

// ------------------------------------------------------------------ the garage
export class Tuning {
  constructor(game) {
    this.game = game; this.s = null; this.fx = [];
    this._buildUi();
  }
  // props inside every loaded workshop: turntable, tyre stack, oil drums, a car up on the lift
  update(dt) {
    for (const L of this.game.interiors.loaded.values()) {
      const W = L.spec.workshop; if (!W || L.garageProps) continue;
      const g = new THREE.Group(); L.group.add(g); L.garageProps = g;
      const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.8, roughness: 0.35 });
      const tt = new THREE.Group(); tt.position.set(W.bay.pt[0], W.y, W.bay.pt[1]); g.add(tt);
      tt.add(new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.08, 48), metal));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.04, 6, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0x3a2c05 })); ring.position.y = 0.05; tt.add(ring);
      for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 2.8), new THREE.MeshStandardMaterial({ color: 0x2a2d30 })); s.position.y = 0.045; s.rotation.y = (i / 12) * Math.PI; tt.add(s); }
      L.turntable = tt;
      const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
      W.tires.forEach((t, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20), tire); m.position.set(t.pt[0], t.y + 0.33 + (i % 2) * 0.68, t.pt[1]); m.rotation.set(0, Math.atan2(W.out[0], W.out[1]), Math.PI / 2); g.add(m); });
      W.drums.forEach((p, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), new THREE.MeshStandardMaterial({ color: [0x1f5fa8, 0xc0392b, 0x2e7d4f][i % 3], metalness: 0.5, roughness: 0.4 })); m.position.set(p[0], W.y + 0.45, p[1]); g.add(m); });
      // a project car up on the lift
      const parts = buildVehicleModel(VEHICLE_TYPES.sports, 0xe67e22);
      parts.root.position.set(W.lift.pt[0], W.lift.y, W.lift.pt[1]); parts.root.rotation.y = W.lift.yaw; g.add(parts.root);
    }
  }

  // quick change from outside the garage view (the counter menu) - keeps the saved mods in step
  setMods(v, patch) {
    v.mods = { ...(v.mods || defaultMods(v)), ...patch }; applyMods(v);
    const ref = v.ownedRef; if (v.owned && ref) { ref.mods = { ...v.mods }; ref.color = v.mods.color; }
  }
  // driving onto the turntable bay
  promptFor(v) {
    if (this.s || !v || v.isAir || v.isBoat) return null;
    for (const L of this.game.interiors.loaded.values()) {
      const W = L.spec.workshop; if (!W) continue;
      if (Math.hypot(v.x - W.bay.pt[0], v.z - W.bay.pt[1]) > 3.8 || Math.abs(v.speed) > 2.5) continue;
      return { text: '🔧 מוסך לוס אנטוס — התאמה אישית', action: () => this.open(v, L) };
    }
    return null;
  }

  open(v, L) {
    const g = this.game, W = L.spec.workshop;
    v.mods ||= defaultMods(v);
    // roll the car onto the turntable, facing the door
    v.x = W.bay.pt[0]; v.z = W.bay.pt[1]; v.heading = W.bay.yaw; v.speed = 0; v.vx = v.vz = 0; v.sync();
    this.s = { v, L, W, orig: { ...v.mods }, cur: { ...v.mods }, cat: null, preview: null, yaw: W.bay.yaw + 2.4, pitch: 0.22, dist: 7.2, before: false, work: null, spin: 0 };
    g.state = 'tuning';
    // a mechanic who comes over to work on the car
    const app = { ...defaultAppearance(), top: 'jacket', topColor: 7, bottom: 'pants', bottomColor: 7, shoes: 1, hairStyle: 'buzz', hat: 'cap', hatColor: 1 };
    this.mech = new CharacterModel(app); g.scene.add(this.mech.root); this._placeMech('idle');
    this._renderUi(); this.ui.classList.add('show'); document.body.classList.add('tuning');
    g.audio.mech?.('draw');
  }
  close() {
    const s = this.s; if (!s) return;
    if (s.work) return;                                   // let the mechanic finish
    s.v.mods = { ...s.cur }; applyMods(s.v);
    this.ui.classList.remove('show'); document.body.classList.remove('tuning');
    if (this.mech) { this.game.scene.remove(this.mech.root); this.mech = null; }
    const g = this.game; g.state = 'playing'; g.camera.clearViewOffset(); g.input.endFrame(); g.clock.getDelta();
    s.v.heading = s.W.bay.yaw; s.v.sync();
    this.s = null;
    g.toast('🔧 תודה שבחרת במוסך לוס אנטוס! סע בזהירות', 2.5);
  }

  // preview an option on the car (not paid yet)
  pick(catId, value) {
    const s = this.s; if (!s || s.work) return;
    s.cat = catId; s.before = false;
    s.preview = { ...s.cur, [catId]: value };
    if (catId === 'repair' || catId === 'own') s.preview = { ...s.cur };
    s.pickValue = value;
    s.v.mods = { ...s.preview }; applyMods(s.v);
    this._renderUi();
  }
  setCat(catId) {
    const s = this.s; if (!s || s.work) return;
    s.cat = catId; s.preview = null; s.pickValue = undefined; s.before = false;
    s.v.mods = { ...s.cur }; applyMods(s.v);
    this._renderUi();
  }
  toggleBefore() {
    const s = this.s; if (!s || s.work) return;
    s.before = !s.before;
    s.v.mods = { ...(s.before ? s.orig : (s.preview || s.cur)) }; applyMods(s.v);
    this._renderUi();
  }
  buy() {
    const s = this.s, g = this.game; if (!s || s.work || s.pickValue === undefined) return;
    const cat = categories(s.v).find((c) => c.id === s.cat), opt = cat?.opts.find((o) => o.value === s.pickValue);
    if (!opt) return;
    if (s.cat !== 'repair' && s.cat !== 'own' && s.cur[s.cat] === s.pickValue) return;
    if (!g.econ.pay(opt.price, `מוסך: ${cat.name} — ${opt.name}`)) { g.toast('אין מספיק כסף', 2); return; }
    s.work = { t: 0, dur: cat.work === 'paint' ? 2.8 : cat.work === 'wheel' ? 2.2 : 1.8, kind: cat.work, cat: s.cat, value: s.pickValue, name: opt.name };
    if (s.cat === 'color') { s.work.from = new THREE.Color(s.cur.color); s.work.to = new THREE.Color(s.pickValue); s.v.parts.paint.color.copy(s.work.from); }
    this._placeMech(cat.work);
    this._renderUi();
  }
  _finishWork() {
    const s = this.s, w = s.work, g = this.game; s.work = null;
    if (w.cat === 'repair') s.v.repair();
    else if (w.cat === 'own') {
      const ref = { type: s.v.typeKey, color: s.cur.color, mods: { ...s.cur } };
      g.econ.ownedCars.push(ref); s.v.owned = true; s.v.ownedRef = ref;
    } else s.cur[w.cat] = w.value;
    s.preview = null; s.pickValue = undefined;
    s.v.mods = { ...s.cur }; applyMods(s.v);
    if (s.v.owned) { const ref = s.v.ownedRef || g.econ.ownedCars.find((c) => c.type === s.v.typeKey); if (ref) { ref.mods = { ...s.cur }; ref.color = s.cur.color; } }
    g.audio.coin?.(); g.toast(w.cat === 'own' ? '📄 הרכב רשום על שמך — השדרוגים נשמרים' : `✔ הותקן: ${w.name}`, 2);
    g.save?.();
    this._placeMech('idle');
    this._renderUi();
  }

  // ------------------------------------------------------------------ the garage view (runs instead of the game frame)
  frame(dt) {
    const g = this.game, s = this.s, I = g.input;
    if (!s) { g.state = 'playing'; return; }
    I.poll();
    if (I.wasPressed('pause')) { this.close(); I.endFrame(); return; }
    const v = s.v;
    // orbit: drag / swipe to look around the car, wheel / pinch to zoom; slow automatic turn when idle
    if (I.lookDX || I.lookDY) { s.yaw -= I.lookDX * 0.006; s.pitch = Math.min(0.9, Math.max(0.05, s.pitch + I.lookDY * 0.004)); s.idle = 0; } else s.idle = (s.idle || 0) + dt;
    if (Math.abs(I.joyX) > 0.1) { s.yaw -= I.joyX * dt * 1.6; s.idle = 0; }   // touch: the left-side joystick also turns the view
    if (I.zoom) s.dist = Math.min(11, Math.max(4.2, s.dist + I.zoom * 0.4));
    if (s.idle > 2.5 && !s.work) s.yaw += dt * 0.25;
    if (s.L.turntable) s.L.turntable.rotation.y += dt * 0.15;
    // work in progress: mechanic animation + effects
    if (s.work) {
      s.work.t += dt;
      this._workFx(dt, s.work);
      if (s.work.from) s.v.parts.paint.color.lerpColors(s.work.from, s.work.to, Math.min(1, s.work.t / (s.work.dur * 0.85)));   // fresh coat goes on gradually
      if (s.work.t >= s.work.dur) this._finishWork();
    }
    this._animMech(dt);
    this._fxUpdate(dt);
    v.sync(dt);
    // camera around the car centre (shifted so the panel does not hide the car)
    const c = new THREE.Vector3(v.x, v.y + 0.75, v.z), cam = g.camera;
    cam.position.set(c.x + Math.sin(s.yaw) * Math.cos(s.pitch) * s.dist, c.y + Math.sin(s.pitch) * s.dist, c.z + Math.cos(s.yaw) * Math.cos(s.pitch) * s.dist);
    cam.lookAt(c);
    if (this.mech) {   // never let the mechanic block the view of the car
      const mp = this.mech.root.position, cx = cam.position.x - c.x, cz = cam.position.z - c.z, L2 = cx * cx + cz * cz;
      const t = ((mp.x - c.x) * cx + (mp.z - c.z) * cz) / L2, px = c.x + cx * t - mp.x, pz = c.z + cz * t - mp.z;
      this.mech.root.visible = !(t > 0.15 && Math.hypot(px, pz) < 1.0);
    }
    const W = innerWidth, H = innerHeight, r = this.ui.getBoundingClientRect();
    if (W > 700 && r.width) cam.setViewOffset(W, H, (r.width / 2) * (r.left < W / 2 ? -1 : 1), 0, W, H);
    else if (r.height) cam.setViewOffset(W, H, 0, r.height * 0.45, W, H);
    g.env.update(new THREE.Vector3(v.x, v.y, v.z), dt, cam);
    if (this._uiMoney !== g.econ.money) this._renderUi();
    if (s.work) { const p = Math.min(1, s.work.t / s.work.dur); const bar = this.ui.querySelector('.tn-work b'); if (bar) bar.style.width = Math.round(p * 100) + '%'; }
    I.endFrame();
  }

  // mechanic placement by the part being worked on
  _placeMech(kind) {
    const s = this.s, v = s.v, m = this.mech; if (!m) return;
    const d = v.parts.dims || { W: 1.8, L: 4.4 }, fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
    let ax = 0, az = 0;
    if (kind === 'idle') { ax = d.W / 2 + 2.6; az = d.L / 2 + 1.4; }
    else if (kind === 'wheel') { ax = d.W / 2 + 0.55; az = (d.wb || 2.6) / 2; }
    else if (kind === 'front') { ax = 0.3; az = d.L / 2 + 0.6; }
    else if (kind === 'rear') { ax = -0.3; az = -d.L / 2 - 0.6; }
    else { ax = d.W / 2 + 0.7; az = 0; }
    if (Math.sin(s.yaw) * rx + Math.cos(s.yaw) * rz > 0) ax = -ax;   // work on the side away from the camera so he stays in view
    m.root.position.set(v.x + rx * ax + fx * az, v.y, v.z + rz * ax + fz * az);
    m.root.rotation.y = Math.atan2(v.x + fx * az * 0.6 - m.root.position.x, v.z + fz * az * 0.6 - m.root.position.z);
    m.kind = kind;
  }
  _animMech(dt) {
    const m = this.mech, s = this.s; if (!m) return;
    const w = s.work;
    m.animate(dt, { speed: 0, grounded: true, mode: 'foot', hold: null, aim: w && w.kind === 'paint' ? 2 : 0 });
    if (!w) return;
    // working: crouch at wheels / bumpers, arms busy (tool / spray gun moving)
    const t = s.work.t, low = w.kind === 'wheel' || w.kind === 'front' || w.kind === 'rear';
    if (low) { m.root.position.y = s.v.y - 0.35; m.legs?.forEach?.(() => {}); }
    const A = m.arms; if (!A) return;
    A[0].sh.rotation.x = -1.2 + Math.sin(t * 9) * 0.25; A[1].sh.rotation.x = -1.3 + Math.cos(t * 8) * 0.3;
    A[0].elbow.rotation.x = -0.6; A[1].elbow.rotation.x = -0.5;
  }
  _workFx(dt, w) {
    const s = this.s, g = this.game, v = s.v, m = this.mech;
    w.acc = (w.acc || 0) + dt;
    if (w.acc < (w.kind === 'paint' ? 0.05 : 0.18)) return;
    w.acc = 0;
    const p = m ? m.root.position.clone() : new THREE.Vector3(v.x, v.y, v.z);
    const toCar = new THREE.Vector3(v.x - p.x, 0, v.z - p.z).normalize();
    const at = p.clone().addScaledVector(toCar, 0.55).setY(v.y + (w.kind === 'paint' ? 0.9 + Math.random() * 0.5 : 0.45));
    if (w.kind === 'paint') {
      // paint mist from the spray gun, in the new colour
      const col = w.to || s.v.parts.paint.color.clone();
      this._puff(at, col, 0.25, 0.9, toCar);
      if (Math.random() < 0.15) g.audio.mech?.('dry');
    } else {
      g.hitfx?.impact(at.x, at.y, at.z, Math.random() < 0.3 ? 'heavy' : 'hit');
      if (Math.random() < 0.4) g.audio.mech?.(Math.random() < 0.5 ? 'rack' : 'in');
    }
  }
  _puff(at, color, size, life, dir) {
    const tex = this.game.hitfx?.dust; if (!tex) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0.7, depthWrite: false }));
    sp.position.copy(at); sp.scale.setScalar(size); this.game.scene.add(sp);
    this.fx.push({ sp, t: 0, life, vx: dir.x * 1.2 + (Math.random() - 0.5) * 0.4, vz: dir.z * 1.2 + (Math.random() - 0.5) * 0.4 });
  }
  _fxUpdate(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt; const k = f.t / f.life;
      if (k >= 1) { this.game.scene.remove(f.sp); f.sp.material.dispose(); this.fx.splice(i, 1); continue; }
      f.sp.position.x += f.vx * dt; f.sp.position.z += f.vz * dt; f.sp.position.y += dt * 0.15;
      f.sp.scale.setScalar(f.sp.scale.x + dt * 0.8); f.sp.material.opacity = 0.7 * (1 - k);
    }
    this.game.hitfx?.update(dt);
  }

  // ------------------------------------------------------------------ UI
  _buildUi() {
    const el = document.createElement('div'); el.id = 'tunePanel'; document.body.appendChild(el); this.ui = el;
    // a tap (finger lifted without moving) chooses; a swipe scrolls the panel / the category row instead
    let down = null;
    const act = (t) => {
      if (t.dataset.cat) this.setCat(t.dataset.cat);
      else if (t.dataset.opt !== undefined) { const c = categories(this.s.v).find((q) => q.id === this.s.cat); const o = c.opts[+t.dataset.opt]; this.pick(c.id, o.value); }
      else if (t.dataset.act === 'buy') this.buy();
      else if (t.dataset.act === 'before') this.toggleBefore();
      else if (t.dataset.act === 'exit') this.close();
    };
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); const t = e.target.closest('[data-cat],[data-opt],[data-act]'); down = t ? { t, x: e.clientX, y: e.clientY, id: e.pointerId } : null; });
    el.addEventListener('pointermove', (e) => { if (down && down.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down = null; });
    el.addEventListener('pointercancel', () => { down = null; });   // the browser took the gesture over as a scroll
    el.addEventListener('pointerup', (e) => {
      const d = down; down = null; if (!d || d.id !== e.pointerId) return;
      const t = e.target.closest('[data-cat],[data-opt],[data-act]');
      if (t !== d.t || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || t.disabled) return;
      e.preventDefault(); act(t);
    });
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }
  _renderUi() {
    const s = this.s; if (!s) return;
    const g = this.game, cats = categories(s.v);
    if (!s.cat || !cats.some((c) => c.id === s.cat)) s.cat = cats[0].id;
    const cat = cats.find((c) => c.id === s.cat);
    const fmtV = (o) => o.swatch !== undefined ? `<i style="background:#${new THREE.Color(o.swatch).getHexString()}"></i>` : '';
    const opts = cat.opts.map((o, i) => {
      const installed = cat.id !== 'repair' && cat.id !== 'own' && s.cur[cat.id] === o.value, sel = s.pickValue === o.value;
      return `<button type="button" class="tn-opt${sel ? ' sel' : ''}${installed ? ' inst' : ''}" data-opt="${i}">${fmtV(o)}<span>${o.name}${o.desc ? `<small>${o.desc}</small>` : ''}</span><b>${installed ? 'מותקן' : o.price ? fmt(o.price) : 'חינם'}</b></button>`;
    }).join('');
    const pickOpt = cat.opts.find((o) => o.value === s.pickValue);
    const canBuy = pickOpt && !(cat.id !== 'repair' && cat.id !== 'own' && s.cur[cat.id] === s.pickValue);
    const keep = { p: this.ui.scrollTop, c: this.ui.querySelector('.tn-cats')?.scrollLeft || 0, o: this.ui.querySelector('.tn-opts')?.scrollTop || 0, cat: this._uiCat };
    this.ui.innerHTML = `<div class="tn-head"><b>🔧 מוסך לוס אנטוס</b><span>${s.v.T.name}${s.v.owned ? ' · שלך' : ' · לא רשום על שמך'}</span><em>${fmt(g.econ.money)}</em></div>
      <div class="tn-cats">${cats.map((c) => `<button type="button" class="tn-cat${c.id === s.cat ? ' on' : ''}" data-cat="${c.id}"><span>${c.icon}</span>${c.name}</button>`).join('')}</div>
      <div class="tn-opts">${opts}</div>
      ${s.work ? `<div class="tn-work"><span>🔧 המכונאי עובד על הרכב…</span><i><b></b></i></div>` : `<div class="tn-foot"><button type="button" class="tn-btn buy" data-act="buy" ${canBuy ? '' : 'disabled'}>${canBuy ? `קנה — ${pickOpt.price ? fmt(pickOpt.price) : 'חינם'}` : 'בחר שדרוג'}</button><button type="button" class="tn-btn${s.before ? ' on' : ''}" data-act="before">${s.before ? 'אחרי ▶' : '◀ לפני'}</button><button type="button" class="tn-btn exit" data-act="exit">סיום</button></div>`}
      <div class="tn-hint">${s.before ? 'מוצג: הרכב כפי שנכנס למוסך' : 'גרור כדי להסתובב סביב הרכב · גלגלת / צביטה לזום'}</div>`;
    this._uiMoney = g.econ.money;
    // keep where the player had scrolled to (the menu is rebuilt on every choice); a new category starts its list at the top
    const cs = this.ui.querySelector('.tn-cats'), os = this.ui.querySelector('.tn-opts');
    this.ui.scrollTop = keep.p; if (cs) cs.scrollLeft = keep.c; if (os) os.scrollTop = keep.cat === s.cat ? keep.o : 0;
    this._uiCat = s.cat;
  }
}
