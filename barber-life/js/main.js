// Barber Life — phase 1: training station with a 3D client, barber chair, clipper/trimmer and real strand cutting.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShop } from './scene/shop.js';
import { buildClient, SKIN_TONES } from './scene/client.js';
import { HairSystem, HAIR_PRESETS } from './hair/hairSystem.js';
import { Clippings } from './hair/clippings.js';
import { RADII, rayEllipsoid, hairlineY, azimuth, zoneOf, surfaceNormal } from './hair/scalp.js';
import { ToolRig, GUARDS, TOOLS } from './tools/tools.js';
import { OrbitCam } from './core/orbitCam.js';
import { ClipperSound } from './core/audio.js';

const SAVE_KEY = 'barber_life_v1';
const $ = (id) => document.getElementById(id);
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const CLIENT_LOOK = {
  daniel: { skin: SKIN_TONES.light, cape: '#1d2733' },
  yoni: { skin: SKIN_TONES.tan, cape: '#2a1f2f' },
  avi: { skin: SKIN_TONES.brown, cape: '#1f2a24' },
};

const loadBar = $('loadBar'), loadText = $('loadText');
const progress = (p, t) => { loadBar.style.width = `${Math.round(p * 100)}%`; if (t) loadText.textContent = t; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------------------------------------------------------------- save
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } }
let save = loadSave();
function writeSave() {
  try {
    save.settings = { sound: sound.enabled, guard: tools.guard.id, lever: tools.lever, tool: tools.active };
    save.clientId = state.clientId;
    save.hair = save.hair || {};
    save.hair[state.clientId] = hair.serialize();
    save.stats = state.stats;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch { /* storage full or blocked: the game still works without saving */ }
}

// ---------------------------------------------------------------- renderer / scene
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.6 : 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0e0f12');
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.02, 20);

const state = {
  phase: 'loading', mode: 'cut', clientId: 'daniel', mapMode: false,
  stroke: null, hover: null, undo: [], cuttingAmount: 0,
  stats: { strokes: 0, hairsCut: 0, ...(save.stats || {}) },
};

let shop, client, hair, clippings, tools, cam, sound;

async function init() {
  progress(0.1, 'מכין את המספרה...');
  await nextFrame();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  shop = buildShop(renderer, { mirrorRes: isMobile ? 384 : 640 });
  scene.add(shop.group);
  progress(0.35, 'מושיב את הלקוח בכיסא...');
  await nextFrame();
  tools = new ToolRig(scene);
  sound = new ClipperSound();
  if (save.settings) {
    if (save.settings.sound === false) sound.enabled = false;
    if (save.settings.guard) tools.setGuard(save.settings.guard);
    if (save.settings.lever) tools.setLever(true);
    if (save.settings.tool && TOOLS[save.settings.tool]) tools.select(save.settings.tool);
  }
  progress(0.55, 'מגדל אלפי שערות...');
  await nextFrame();
  setClient(save.clientId && HAIR_PRESETS[save.clientId] ? save.clientId : 'daniel', true);
  cam = new OrbitCam(camera, new THREE.Vector3(0, 1.32, 0));
  progress(0.95, 'כמעט מוכן...');
  await nextFrame();
  buildUI();
  renderer.compile(scene, camera);
  progress(1);
  $('loading').classList.remove('show');
  $('title').classList.add('show');
  state.phase = 'title';
  last = performance.now();
  requestAnimationFrame(loop);
}

function setClient(id, initial = false) {
  const preset = HAIR_PRESETS[id];
  const look = CLIENT_LOOK[id];
  if (client) { scene.remove(client.group); client.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
  if (hair) hair.dispose();
  state.clientId = id;
  client = buildClient({ skin: look.skin, hairColor: preset.color, capeColor: look.cape });
  scene.add(client.group);
  hair = new HairSystem({ count: isMobile ? 13000 : 22000, seed: 11 + Object.keys(HAIR_PRESETS).indexOf(id), preset });
  client.head.add(hair.mesh);
  hair.bindScalp(client.headMesh.geometry, client.baseColors);
  const saved = save.hair && save.hair[id];
  if (saved) hair.deserialize(saved);
  hair.updateScalp();
  hair.setMapMode(state.mapMode);
  if (!clippings) clippings = new Clippings(scene, preset.color); else { clippings.clear(); clippings.setColor(preset.color); }
  state.undo.length = 0;
  if (!initial) { refreshClientChip(); writeSave(); }
}

// ---------------------------------------------------------------- picking + cutting
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const _inv = new THREE.Matrix4(), _o = new THREE.Vector3(), _dir = new THREE.Vector3(), _d = new THREE.Vector3();

/** Ray from a screen point to the scalp. Returns { local, world, normalWorld, dir } or null. */
function pickHead(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  client.head.updateMatrixWorld();
  _inv.copy(client.head.matrixWorld).invert();
  _o.copy(raycaster.ray.origin).applyMatrix4(_inv);
  _dir.copy(raycaster.ray.direction).transformDirection(_inv);
  const t = rayEllipsoid(_o, _dir, 1);
  if (t < 0) return null;
  const local = _o.clone().addScaledVector(_dir, t);
  const dir = _d.set(local.x / RADII.x, local.y / RADII.y, local.z / RADII.z).normalize().clone();
  // Only the hair-bearing part of the head (plus a margin for neck/sideburn lines) is a work surface.
  if (dir.y < hairlineY(Math.abs(azimuth(dir))) - 0.18) return null;
  const n = surfaceNormal(local, new THREE.Vector3());
  return {
    local, dir,
    world: client.head.localToWorld(local.clone()),
    normalWorld: n.clone().transformDirection(client.head.matrixWorld),
  };
}

const cutOut = [];
const _sp = new THREE.Vector3();
function cutAtLocal(local) {
  cutOut.length = 0;
  hair.cut(local, tools.tool.radius, tools.cutMM, cutOut);
  const n = cutOut.length / 2;
  if (!n) return 0;
  state.stats.hairsCut += n;
  // spawn falling clippings (a sample: real cuts produce more than we need to draw)
  const step = Math.max(1, Math.floor(n / 24));
  for (let j = 0; j < n; j += step) {
    const i = cutOut[j * 2], removed = cutOut[j * 2 + 1];
    if (removed < 1) continue;
    hair.strandPoint(i, hair.lengths[i] + Math.min(removed, 8) * 0.5, _sp);
    clippings.spawn(client.head.localToWorld(_sp), removed);
  }
  return n;
}

function strokeTo(hit) {
  const s = state.stroke;
  let cut = 0;
  if (s.lastLocal) {
    const dist = s.lastLocal.distanceTo(hit.local);
    const steps = Math.min(40, Math.ceil(dist / 0.003));
    for (let k = 1; k <= steps; k++) {
      const p = s.lastLocal.clone().lerp(hit.local, k / steps);
      // re-project onto the scalp
      const q = Math.hypot(p.x / RADII.x, p.y / RADII.y, p.z / RADII.z);
      p.divideScalar(q);
      cut += cutAtLocal(p);
    }
  } else cut += cutAtLocal(hit.local);
  s.lastLocal = hit.local.clone();
  s.cut += cut;
  state.cuttingAmount = Math.min(1, state.cuttingAmount + cut / 60);
}

// ---------------------------------------------------------------- input
const pointers = new Map();
let orbitDrag = null, pinch = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'play') return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  sound.unlock();
  if (pointers.size === 2) {
    endStroke();
    orbitDrag = null;
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    return;
  }
  if (pointers.size > 2) return;
  const hit = state.mode === 'cut' && e.button === 0 ? pickHead(e.clientX, e.clientY) : null;
  if (hit) {
    state.undo.push(hair.snapshot());
    if (state.undo.length > 20) state.undo.shift();
    state.stroke = { lastLocal: null, cut: 0, id: e.pointerId };
    state.hover = hit;
    strokeTo(hit);
  } else {
    orbitDrag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (state.phase !== 'play') return;
  const p = pointers.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    if (d > 10) cam.zoom(pinch.d / d);
    cam.rotate(-(cx - pinch.cx) * 0.006, -(cy - pinch.cy) * 0.006);
    pinch = { d, cx, cy };
    return;
  }
  if (orbitDrag && orbitDrag.id === e.pointerId) {
    cam.rotate(-(e.clientX - orbitDrag.x) * 0.008, -(e.clientY - orbitDrag.y) * 0.006);
    orbitDrag.x = e.clientX; orbitDrag.y = e.clientY;
    return;
  }
  const hit = pickHead(e.clientX, e.clientY);
  if (state.stroke && state.stroke.id === e.pointerId) {
    if (hit) { strokeTo(hit); state.hover = hit; } else state.stroke.lastLocal = null;
  } else if (e.pointerType === 'mouse') {
    state.hover = state.mode === 'cut' ? hit : null;
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (state.stroke && state.stroke.id === e.pointerId) endStroke();
  if (orbitDrag && orbitDrag.id === e.pointerId) orbitDrag = null;
  if (pointers.size < 2) pinch = null;
  if (e.pointerType !== 'mouse') state.hover = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !state.stroke) state.hover = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

function endStroke() {
  const s = state.stroke;
  if (!s) return;
  state.stroke = null;
  if (s.cut === 0) state.undo.pop(); // nothing changed: don't keep an empty undo step
  else { state.stats.strokes++; scheduleSave(); }
}
let saveTimer = 0;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(writeSave, 600); }

addEventListener('keydown', (e) => {
  if (state.phase !== 'play') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  const idx = '0123456789'.indexOf(e.key);
  if (idx >= 0 && idx < GUARDS.length) selectGuard(GUARDS[idx].id);
  if (e.key === 'ArrowLeft') cam.rotate(0.25, 0);
  if (e.key === 'ArrowRight') cam.rotate(-0.25, 0);
  if (e.key === 'ArrowUp') cam.rotate(0, -0.15);
  if (e.key === 'ArrowDown') cam.rotate(0, 0.15);
  if (e.key === 'm' || e.key === 'M') toggleMap();
  if (e.key === 't' || e.key === 'T') selectTool(tools.active === 'clipper' ? 'trimmer' : 'clipper');
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- UI
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function selectGuard(id) {
  tools.setGuard(id);
  if (tools.active !== 'clipper') selectTool('clipper');
  refreshGuards();
  scheduleSave();
}
function selectTool(id) {
  tools.select(id);
  document.querySelectorAll('.tool-card').forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
  $('guardBox').classList.toggle('hidden', id !== 'clipper');
  $('trimInfo').classList.toggle('hidden', id !== 'trimmer');
  toast(TOOLS[id].name + ' — ' + TOOLS[id].desc.split('.')[0]);
  scheduleSave();
}
function refreshGuards() {
  document.querySelectorAll('.guard').forEach((b) => b.classList.toggle('active', b.dataset.guard === tools.guard.id));
  $('cutInfo').textContent = `נשאר: ${fmt(tools.cutMM)} מ״מ`;
  const lv = $('btnLever');
  lv.classList.toggle('on', tools.lever);
  lv.innerHTML = `ידית טייפר: <b>${tools.lever ? 'פתוחה (+1.5 מ״מ)' : 'סגורה'}</b>`;
}
function refreshClientChip() {
  const p = HAIR_PRESETS[state.clientId];
  $('clientName').textContent = p.name;
  $('clientHair').textContent = 'שיער ' + p.hairType;
}
function toggleMap() {
  state.mapMode = !state.mapMode;
  hair.setMapMode(state.mapMode);
  $('btnMap').classList.toggle('on', state.mapMode);
  $('legend').classList.toggle('hidden', !state.mapMode);
}
function undo() {
  const snap = state.undo.pop();
  if (!snap) { toast('אין מה לבטל'); return; }
  hair.restore(snap);
  hair.updateScalp();
  scheduleSave();
  toast('התנועה האחרונה בוטלה');
}
const fmt = (v) => (Math.round(v * 10) / 10).toString();
function openModal(id) { $(id).classList.remove('hidden'); }

function buildUI() {
  const gbox = $('guards');
  for (const g of GUARDS) {
    const b = document.createElement('button');
    b.className = 'guard'; b.dataset.guard = g.id;
    b.innerHTML = `<i class="sw" style="background:${g.color || '#bfc3c7'}"></i><b>${g.label}</b><small>${fmt(g.mm)} מ״מ</small>`;
    b.title = g.name;
    b.addEventListener('click', () => { selectGuard(g.id); toast(`${g.name}: נשארים ${fmt(tools.cutMM)} מ״מ שיער`); });
    gbox.appendChild(b);
  }
  $('btnLever').addEventListener('click', () => { tools.setLever(!tools.lever); refreshGuards(); scheduleSave(); });
  document.querySelectorAll('.tool-card').forEach((b) => b.addEventListener('click', () => selectTool(b.dataset.tool)));
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => cam.setView(b.dataset.view)));
  $('zoomIn').addEventListener('click', () => cam.zoom(0.82));
  $('zoomOut').addEventListener('click', () => cam.zoom(1.22));
  const setMode = (m) => {
    state.mode = m;
    $('modeCut').classList.toggle('active', m === 'cut');
    $('modeView').classList.toggle('active', m === 'view');
    if (m === 'view') state.hover = null;
  };
  $('modeCut').addEventListener('click', () => setMode('cut'));
  $('modeView').addEventListener('click', () => setMode('view'));
  $('btnUndo').addEventListener('click', undo);
  $('btnMap').addEventListener('click', toggleMap);
  $('btnReset').addEventListener('click', () => openModal('confirmModal'));
  $('confirmYes').addEventListener('click', () => {
    hair.regrow(); hair.updateScalp(); clippings.clear(); state.undo.length = 0;
    $('confirmModal').classList.add('hidden'); writeSave(); toast('השיער גדל מחדש — אפשר להתחיל שוב');
  });
  const soundBtn = $('btnSound');
  const refreshSound = () => { soundBtn.textContent = sound.enabled ? '🔊' : '🔇'; };
  soundBtn.addEventListener('click', () => { sound.setEnabled(!sound.enabled); refreshSound(); scheduleSave(); });
  refreshSound();
  $('btnHelp').addEventListener('click', () => openModal('helpModal'));
  $('btnHowTo').addEventListener('click', () => openModal('helpModal'));
  $('clientChip').addEventListener('click', () => { renderClientList(); openModal('clientModal'); });
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m || e.target.hasAttribute('data-close')) m.classList.add('hidden'); });
  });
  $('btnStart').addEventListener('click', () => {
    $('title').classList.remove('show');
    $('hud').classList.remove('hidden');
    state.phase = 'play';
    sound.unlock();
    if (!save.seenHelp) { save.seenHelp = true; openModal('helpModal'); writeSave(); }
    else toast('ברוך שובך! ההתקדמות נשמרה');
  });
  selectTool(tools.active);
  refreshGuards();
  refreshClientChip();
  $('toast').classList.remove('show');
}

function renderClientList() {
  const list = $('clientList');
  list.innerHTML = '';
  for (const p of Object.values(HAIR_PRESETS)) {
    const b = document.createElement('button');
    b.className = 'client-item' + (p.id === state.clientId ? ' active' : '');
    b.innerHTML = `<i class="sw" style="background:${p.color}"></i><span><b>${p.name}</b><small>שיער ${p.hairType} · עליון ${p.lengths.top} מ״מ · צדדים ${p.lengths.side} מ״מ</small></span>`;
    b.addEventListener('click', () => {
      $('clientModal').classList.add('hidden');
      if (p.id !== state.clientId) { setClient(p.id); toast(`${p.name} התיישב בכיסא`); }
    });
    list.appendChild(b);
  }
}

// ---------------------------------------------------------------- loop
let last = 0, scalpTimer = 0, roTimer = 0;
const MANUAL = new URLSearchParams(location.search).has('manual'); // tests step frames themselves
function loop(now) {
  if (MANUAL) { frame(0); return; }
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
}

function frame(dt, render = true) {
  if (state.phase === 'title') cam.theta += dt * 0.12;
  cam.update(dt);
  // tool placement
  const h = state.hover;
  if (h && state.phase === 'play') tools.placeOnHead(h.world, h.normalWorld, dt);
  else tools.rest(shop.toolRest, dt);
  tools.running = !!state.stroke || !!h;
  tools.update(dt);
  state.cuttingAmount *= Math.exp(-dt * 8);
  sound.set(state.stroke ? 1 : h ? 0.55 : 0, state.cuttingAmount);
  clippings.update(dt);
  shop.update(dt);
  scalpTimer += dt;
  if (scalpTimer > 0.08) { scalpTimer = 0; hair.updateScalp(); }
  roTimer += dt;
  if (roTimer > 0.12 && state.phase === 'play') { roTimer = 0; updateReadout(); }
  if (render) renderer.render(scene, camera);
}

function updateReadout() {
  const h = state.hover;
  if (!h) { $('roZone').textContent = state.mode === 'cut' ? 'גרור על הראש כדי לספר' : 'גרור כדי לסובב את המצלמה'; $('roLen').textContent = ''; return; }
  const z = zoneOf(h.dir);
  const len = hair.sampleLength(h.local, 0.009);
  $('roZone').textContent = z.name;
  $('roLen').textContent = len == null ? 'אין שיער באזור הזה' : `אורך ממוצע כאן: ${fmt(len)} מ״מ · הכלי משאיר ${fmt(tools.cutMM)} מ״מ`;
}

// ---------------------------------------------------------------- test hooks
window.__barber = {
  get state() { return state; }, get hair() { return hair; }, get tools() { return tools; }, get cam() { return cam; },
  get clippings() { return clippings; }, scene, camera, renderer, frame,
  pickHead, setClient, selectGuard, selectTool,
  /** cut along a path of unit directions (head-local), like a stroke */
  strokeDirs(dirs) {
    state.undo.push(hair.snapshot());
    state.stroke = { lastLocal: null, cut: 0, id: -1 };
    for (const d of dirs) {
      const v = new THREE.Vector3(...d).normalize();
      const local = new THREE.Vector3(v.x * RADII.x, v.y * RADII.y, v.z * RADII.z);
      strokeTo({ local, dir: v });
    }
    const c = state.stroke.cut; endStroke(); return c;
  },
  undo, toggleMap,
};

init().catch((err) => { console.error(err); loadText.textContent = 'שגיאה בטעינה: ' + err.message; });
