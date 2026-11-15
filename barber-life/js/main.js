// Barber Life — engine: renderer, scene, client/mannequin head, real strand cutting, tools, camera, input, base HUD.
// Game modes (lessons, lab, practice, clients, challenges, shop) live in js/game and js/ui and use the shared ctx.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShop } from './scene/shop.js';
import { buildClient, SKIN_TONES } from './scene/client.js';
import { HairSystem, HAIR_PRESETS } from './hair/hairSystem.js';
import { Clippings } from './hair/clippings.js';
import { RADII, rayEllipsoid, hairlineY, azimuth, zoneOf, surfaceNormal } from './hair/scalp.js';
import { ToolRig, GUARDS, TOOLS, SCISSOR_LENGTHS } from './tools/tools.js';
import { OrbitCam } from './core/orbitCam.js';
import { ClipperSound } from './core/audio.js';
import { ctx } from './game/context.js';
import { progress } from './game/progress.js';
import { DemoPlayer, planDemo } from './game/demo.js';
import { initScreens } from './ui/screens.js';
import { session } from './game/session.js';
import { world } from './world/worldMode.js';
import { fx } from './ui/fx.js';
import { sfx } from './core/sfx.js';
import { controls } from './world/controls.js';
import { openProfile } from './ui/profile.js';

const $ = (id) => document.getElementById(id);
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const MANUAL = new URLSearchParams(location.search).has('manual'); // tests step frames themselves
const CLIENT_LOOK = {
  daniel: { skin: SKIN_TONES.light, cape: '#1d2733' },
  yoni: { skin: SKIN_TONES.tan, cape: '#2a1f2f' },
  avi: { skin: SKIN_TONES.brown, cape: '#1f2a24' },
};

const loadBar = $('loadBar'), loadText = $('loadText');
const setLoad = (p, t) => { loadBar.style.width = `${Math.round(p * 100)}%`; if (t) loadText.textContent = t; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const save = progress.data;

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
  phase: 'loading', mode: 'cut', headKey: null, mapMode: 0,
  stroke: null, hover: null, undo: [], cuttingAmount: 0, strokeId: 1,
  freeSave: null,     // hair-save key while in free practice (phase-1 behaviour)
  tapHandler: null,   // lessons can take over taps on the head (e.g. "touch the crown")
  dusting: null,
  stats: save.stats,
};
let shop, client, hair, clippings, tools, cam, sound, demo;

async function init() {
  setLoad(0.1, 'מכין את המספרה...');
  await nextFrame();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  shop = buildShop(renderer, { mirrorRes: isMobile ? 384 : 640 });
  scene.add(shop.group);
  setLoad(0.35, 'מכין את הכלים...');
  await nextFrame();
  tools = new ToolRig(scene);
  sound = new ClipperSound();
  const st = save.settings || {};
  if (st.sound === false) sound.enabled = false;
  if (st.guard) tools.setGuard(st.guard);
  if (st.lever) tools.setLever(true);
  if (st.tool && TOOLS[st.tool]) tools.select(st.tool);
  if (st.scissorLen) tools.scissorLen = st.scissorLen;
  setLoad(0.55, 'מגדל אלפי שערות...');
  await nextFrame();
  cam = new OrbitCam(camera, new THREE.Vector3(0, 1.32, 0));
  // live getters (Object.assign would copy today's values instead of the getters)
  for (const [k, get] of Object.entries({ hair: () => hair, client: () => client, tools: () => tools, cam: () => cam, clippings: () => clippings, shop: () => shop, sound: () => sound })) {
    Object.defineProperty(ctx, k, { get, configurable: true });
  }
  Object.assign(ctx, {
    THREE, renderer, scene, camera, state, isMobile, MANUAL, progress, session,
    setupHead, setFreeHead, cutAtLocal, pickHead, toast, selectTool, selectGuard, setMap, setMode, refreshToolUI,
    saveSettings, frame, undo, pushUndo, renderView,
  });
  demo = new DemoPlayer(ctx);
  ctx.demo = demo;
  setFreeHead(save.clientId && HAIR_PRESETS[save.clientId] ? save.clientId : 'daniel');
  setLoad(0.9, 'כמעט מוכן...');
  await nextFrame();
  buildBaseUI();
  initScreens();
  fx.init();
  ctx.fx = fx; ctx.sfx = sfx;
  ctx.openProfile = openProfile;
  ctx.openSettings = () => controls.open();
  ctx.cutCount = {};
  /** The client turns his head left and right to check the haircut in the mirror, then cb() (the result). */
  ctx.lookInMirror = (name, cb) => {
    if (MANUAL) { cb(); return; }
    state.mirror = { t: 0, dur: 2.2, cb, base: client.head.rotation.y, baseX: client.head.rotation.x };
    toast(`👀 ${name} מסתכל במראה...`, 2000);
  };
  ctx.registerHubCard?.({ go: 'profile', icon: '👤', title: 'הפרופיל שלי', sub: () => `רמה ${progress.rank.id} · ${progress.data.xp} XP` }, () => openProfile(() => ctx.showHub()));
  ctx.startWorld = () => {
    world.start();
    if (!save.seenWorldHelp) { save.seenWorldHelp = true; progress.save(); if (!ctx.tutorial?.active) $('worldHelp').classList.remove('hidden'); }
  };
  // never lose progress: save when the app goes to the background or closes
  const saveNow = () => { if (world.ready && ctx.life) ctx.life.savePos(); }; // nothing to save on the title screen
  addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  renderer.compile(scene, camera);
  setLoad(1);
  $('loading').classList.remove('show');
  $('title').classList.add('show');
  state.phase = 'title';
  last = performance.now();
  requestAnimationFrame(loop);
}

/**
 * Seat a head with hair. preset: a HAIR_PRESETS entry or a generated preset object.
 * opts: { mannequin, skin, cape, seed, saved (serialized lengths) }
 */
function setupHead(preset, opts = {}) {
  if (pad.on) setTimeout(() => { padStop(); padCenter(); }, 60);
  const mannequin = !!opts.mannequin;
  if (client) { scene.remove(client.group); client.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
  if (hair) hair.dispose();
  demo?.stop();
  client = buildClient({ skin: opts.skin || SKIN_TONES.light, hairColor: preset.color, capeColor: opts.cape || '#1d2733', mannequin });
  scene.add(client.group);
  shop.chair.visible = !mannequin;
  const seed = opts.seed ?? (11 + Math.max(0, Object.keys(HAIR_PRESETS).indexOf(preset.id)));
  hair = new HairSystem({ count: isMobile ? 13000 : 22000, seed, preset });
  client.head.add(hair.mesh);
  hair.bindScalp(client.headMesh.geometry, client.baseColors);
  if (opts.saved) hair.deserialize(opts.saved);
  hair.updateScalp();
  if (state.mapMode === 2) state.mapMode = 0;
  hair.setMapMode(state.mapMode);
  if (!clippings) clippings = new Clippings(scene, preset.color); else { clippings.clear(); clippings.setColor(preset.color); }
  clippings.capeOn = !mannequin;
  state.undo.length = 0;
  state.headKey = preset.id;
  state.freeSave = null;
  refreshClientChip(preset, mannequin);
  if (document.getElementById('legendDiff')) setMap(state.mapMode);
  return hair;
}

/** Free practice on one of the fixed heads; the haircut is saved like in phase 1. */
function setFreeHead(id) {
  const preset = HAIR_PRESETS[id];
  const look = CLIENT_LOOK[id] || {};
  const mannequin = id.startsWith('mannequin');
  setupHead(preset, { mannequin, skin: look.skin, cape: look.cape, saved: save.hair[id] });
  state.freeSave = id;
  save.clientId = id;
  progress.save();
}

function saveFreeHair() {
  if (!state.freeSave || !hair) return;
  save.hair[state.freeSave] = hair.serialize();
  progress.save();
}
function saveSettings() {
  save.settings = { pad: pad.on, sound: sound.enabled, guard: tools.guard.id, lever: tools.lever, tool: tools.active, scissorLen: tools.scissorLen };
  progress.save();
}

// ---------------------------------------------------------------- picking + cutting
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const _inv = new THREE.Matrix4(), _o = new THREE.Vector3(), _dir = new THREE.Vector3(), _d = new THREE.Vector3();

function setRay(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

/** Ray from a screen point to the scalp. Returns { local, world, normalWorld, dir } or null. */
function pickHead(clientX, clientY) {
  setRay(clientX, clientY);
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
  return { local, dir, world: client.head.localToWorld(local.clone()), normalWorld: n.clone().transformDirection(client.head.matrixWorld) };
}

/** Ray to the cape / neck / shoulders for the duster. */
function pickBody(clientX, clientY) {
  setRay(clientX, clientY);
  const hits = raycaster.intersectObjects(client.dustTargets, false);
  if (!hits.length) return null;
  const h = hits[0];
  const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
  if (n.dot(raycaster.ray.direction) > 0) n.negate();
  return { world: h.point.clone(), normalWorld: n, body: true };
}

const cutOut = [];
const _sp = new THREE.Vector3(), _n = new THREE.Vector3(), _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _fwd = new THREE.Vector3(0, 0, 1);
/** Apply the active tool at a head-local point. Returns the number of strands cut. */
function cutAtLocal(local, { stroke = state.strokeId, demo: isDemo = false } = {}) {
  if (hair.display === 'pro') return 0;
  cutOut.length = 0;
  const t = tools.tool;
  if (t.id === 'duster') return 0;
  if (t.id === 'thinning') hair.thin(local, t.radius, t.fraction, stroke, cutOut);
  else {
    const ragged = t.id === 'scissors' && tools.pointCut ? 0.12 : 0;
    // the blade lies across the stroke, horizontally around the head (like the 3D tool)
    surfaceNormal(local, _n);
    _axis.crossVectors(_up, _n);
    if (_axis.lengthSq() < 0.05) _axis.crossVectors(_fwd, _n);
    _axis.normalize();
    hair.cut(local, t.radius, tools.cutMM, cutOut, { edge: tools.quality[t.id] ?? 0.7, ragged, axis: _axis, depth: t.depth });
  }
  const n = cutOut.length / 2;
  if (!n) return 0;
  state.stats.hairsCut += n;
  if (!isDemo) session.onCut?.(n);
  // spawn falling clippings (a sample: real cuts produce more than we need to draw)
  const step = Math.max(1, Math.floor(n / (isDemo ? 6 : 24)));
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
      const q = Math.hypot(p.x / RADII.x, p.y / RADII.y, p.z / RADII.z);
      p.divideScalar(q);
      cut += cutAtLocal(p);
    }
  } else cut += cutAtLocal(hit.local);
  s.lastLocal = hit.local.clone();
  s.cut += cut;
  if (cut > 0) { ctx.cutCount[tools.active] = (ctx.cutCount[tools.active] || 0) + 1; ctx.tutorial?.poke(); }
  state.cuttingAmount = Math.min(1, state.cuttingAmount + cut / 60);
}

function pushUndo() {
  state.undo.push(hair.snapshot());
  if (state.undo.length > 20) state.undo.shift();
}

// ---------------------------------------------------------------- input
const pointers = new Map();
let orbitDrag = null, pinch = null;
const playing = () => state.phase === 'play';

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!playing()) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  sound.unlock();
  if (pointers.size === 2) {
    endStroke(); orbitDrag = null; state.dusting = null;
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    return;
  }
  if (pointers.size > 2) return;
  const cutMode = state.mode === 'cut' && e.button === 0 && !demo.active;
  if (cutMode && state.tapHandler) {
    const hit = pickHead(e.clientX, e.clientY);
    if (hit) { state.tapHandler(hit); return; }
  }
  if (cutMode && tools.active === 'duster') {
    const hit = pickBody(e.clientX, e.clientY) || pickHead(e.clientX, e.clientY);
    if (hit) { state.dusting = { id: e.pointerId }; dustAt(hit); return; }
  }
  const hit = cutMode && tools.active !== 'duster' ? pickHead(e.clientX, e.clientY) : null;
  if (hit) {
    if (hair.display === 'pro') { toast('זו תצוגת התוצאה המקצועית. חזור ל"שלי" כדי להמשיך לספר.'); orbitDrag = { x: e.clientX, y: e.clientY, id: e.pointerId }; return; }
    pushUndo();
    state.strokeId++;
    state.stroke = { lastLocal: null, cut: 0, id: e.pointerId };
    state.hover = hit;
    strokeTo(hit);
  } else {
    orbitDrag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
});

function dustAt(hit) {
  state.hover = hit;
  const n = clippings.dust(hit.world, TOOLS.duster.radius);
  if (n) session.onDust?.(n);
}

canvas.addEventListener('pointermove', (e) => {
  if (!playing()) return;
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
  if (state.dusting && state.dusting.id === e.pointerId) {
    const hit = pickBody(e.clientX, e.clientY) || pickHead(e.clientX, e.clientY);
    if (hit) dustAt(hit);
    return;
  }
  const hit = tools.active === 'duster' ? (pickBody(e.clientX, e.clientY) || pickHead(e.clientX, e.clientY)) : pickHead(e.clientX, e.clientY);
  if (state.stroke && state.stroke.id === e.pointerId) {
    if (hit) { strokeTo(hit); state.hover = hit; } else state.stroke.lastLocal = null;
  } else if (e.pointerType === 'mouse') {
    state.hover = state.mode === 'cut' && !demo.active ? hit : null;
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (state.stroke && state.stroke.id === e.pointerId) endStroke();
  if (state.dusting && state.dusting.id === e.pointerId) state.dusting = null;
  if (orbitDrag && orbitDrag.id === e.pointerId) orbitDrag = null;
  if (pointers.size < 2) pinch = null;
  if (e.pointerType !== 'mouse' && !pad.on) state.hover = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !state.stroke) state.hover = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

// ---------------------------------------------------------------- side touchpad (remote aim)
// Drag on the pad at the edge of the screen: a sight moves over the head (like a laptop touchpad), so the finger
// never covers the client. Hold the ✂️ button to cut along the sight; a quick tap locks cutting on/off.
const pad = { on: false, x: 0, y: 0, drag: null, cutId: null, latch: false, down: 0, sens: 1.7 };
function padSet(on) {
  pad.on = on;
  $('btnPad').classList.toggle('on', on);
  document.body.classList.toggle('pad-on', on);
  $('padWrap').classList.toggle('hidden', !on);
  $('padCut').classList.toggle('hidden', !on);
  $('aimCursor').classList.toggle('hidden', !on);
  padStop();
  if (on) padCenter(); else state.hover = null;
  const s = progress.data.settings ||= {}; s.pad = on; progress.save();
}
/** sight on the middle of the head (the side the camera looks at) */
function padCenter() {
  const v = client.head.localToWorld(new THREE.Vector3(0, 0.02, 0)).project(camera);
  pad.x = (v.x + 1) / 2 * innerWidth; pad.y = (1 - v.y) / 2 * innerHeight;
}
function padHit() {
  if (tools.active === 'duster') return pickBody(pad.x, pad.y) || pickHead(pad.x, pad.y);
  return pickHead(pad.x, pad.y);
}
function padBegin() {
  if (!playing() || demo.active || state.mode !== 'cut') return;
  const hit = padHit();
  if (state.tapHandler) { if (hit) state.tapHandler(hit); return; }
  if (tools.active === 'duster') { state.dusting = { id: 'pad' }; if (hit) dustAt(hit); return; }
  if (hair.display === 'pro') { toast('זו תצוגת התוצאה המקצועית. חזור ל"שלי" כדי להמשיך לספר.'); return; }
  pushUndo();
  state.strokeId++;
  state.stroke = { lastLocal: null, cut: 0, id: 'pad' };
  if (hit) { state.hover = hit; strokeTo(hit); }
}
function padStop() {
  if (state.stroke?.id === 'pad') endStroke();
  if (state.dusting?.id === 'pad') state.dusting = null;
  pad.latch = false; pad.cutId = null;
  $('padCut').classList.remove('on', 'latched');
  $('padCutText').textContent = 'החזק לחיתוך';
}
function padMoveAim(dx, dy) {
  pad.x = THREE.MathUtils.clamp(pad.x + dx * pad.sens, 0, innerWidth);
  pad.y = THREE.MathUtils.clamp(pad.y + dy * pad.sens, 0, innerHeight);
  const hit = padHit();
  if (state.stroke?.id === 'pad') { if (hit && !hit.body) strokeTo(hit); else state.stroke.lastLocal = null; }
  else if (state.dusting?.id === 'pad' && hit) dustAt(hit);
}
function bindPad() {
  const tp = $('touchPad'), cut = $('padCut');
  tp.addEventListener('pointerdown', (e) => { e.preventDefault(); tp.setPointerCapture(e.pointerId); pad.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; tp.classList.add('active'); sound.unlock(); });
  tp.addEventListener('pointermove', (e) => {
    if (pad.drag?.id !== e.pointerId) return;
    padMoveAim(e.clientX - pad.drag.x, e.clientY - pad.drag.y);
    pad.drag.x = e.clientX; pad.drag.y = e.clientY;
  });
  const endDrag = (e) => { if (pad.drag?.id === e.pointerId) { pad.drag = null; tp.classList.remove('active'); } };
  tp.addEventListener('pointerup', endDrag); tp.addEventListener('pointercancel', endDrag);
  tp.addEventListener('dblclick', () => padCenter());
  cut.addEventListener('pointerdown', (e) => {
    e.preventDefault(); cut.setPointerCapture(e.pointerId); sound.unlock();
    if (pad.latch) { padStop(); return; } // tap again: stop the locked cut
    pad.cutId = e.pointerId; pad.down = performance.now();
    cut.classList.add('on'); $('padCutText').textContent = 'חותך...';
    padBegin();
  });
  const cutUp = (e) => {
    if (pad.cutId !== e.pointerId) return;
    pad.cutId = null;
    if (performance.now() - pad.down < 260 && !state.tapHandler && (state.stroke?.id === 'pad' || state.dusting?.id === 'pad')) {
      pad.latch = true; cut.classList.add('latched'); $('padCutText').textContent = 'נעול — לחץ לעצירה';
      return;
    }
    padStop();
  };
  cut.addEventListener('pointerup', cutUp); cut.addEventListener('pointercancel', cutUp);
  $('btnPad').addEventListener('click', () => { padSet(!pad.on); toast(pad.on ? '🎯 משטח כיוון: גרור במשטח כדי להזיז את הכוונת, והחזק ✂️ כדי לספר. לחיצה קצרה על ✂️ נועלת חיתוך.' : 'מצב רגיל: גוררים ישר על הראש.', 4200); });
}
function padFrame() {
  if (!pad.on || !playing()) { if (pad.on) $('aimCursor').classList.add('hidden'); return; }
  const el = $('aimCursor');
  el.classList.remove('hidden');
  el.style.transform = `translate(${pad.x}px, ${pad.y}px)`;
  const hit = state.mode === 'cut' && !demo.active ? padHit() : null;
  el.classList.toggle('on-head', !!hit);
  el.classList.toggle('cutting', state.stroke?.id === 'pad' || state.dusting?.id === 'pad');
  if (!state.stroke || state.stroke.id === 'pad') state.hover = hit;
}
ctx.pad = pad; ctx.padSet = padSet; ctx.padCenter = padCenter;

function endStroke() {
  const s = state.stroke;
  if (!s) return;
  state.stroke = null;
  if (s.cut === 0) state.undo.pop();
  else {
    state.stats.strokes++;
    progress.unlock('firstCut');
    scheduleSave();
  }
}
let saveTimer = 0;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveFreeHair(); saveSettings(); }, 600); }

addEventListener('keydown', (e) => {
  if (!playing() || e.target.tagName === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  const idx = '0123456789'.indexOf(e.key);
  if (idx >= 0 && idx < GUARDS.length) selectGuard(GUARDS[idx].id);
  if (e.key === 'ArrowLeft') cam.rotate(0.25, 0);
  if (e.key === 'ArrowRight') cam.rotate(-0.25, 0);
  if (e.key === 'ArrowUp') cam.rotate(0, -0.15);
  if (e.key === 'ArrowDown') cam.rotate(0, 0.15);
  if (e.key === 'm' || e.key === 'M') setMap(state.mapMode === 1 ? 0 : 1);
  if (e.key === 't' || e.key === 'T') selectTool(tools.active === 'clipper' ? 'trimmer' : 'clipper');
});

/** On short screens the panels sit at the top/right, so shift the picture to keep the head in the free area. */
function fitCamera() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  if (innerHeight <= 520) camera.setViewOffset(innerWidth, innerHeight, 22, -Math.round(innerHeight * 0.03), innerWidth, innerHeight);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  if (world.camera) { world.camera.aspect = innerWidth / innerHeight; world.camera.updateProjectionMatrix(); }
}
addEventListener('resize', fitCamera);
fitCamera();

// ---------------------------------------------------------------- base HUD
let toastTimer = 0;
function toast(msg, ms = 2400) {
  const t = $('toast');
  t.classList.remove('show'); void t.offsetWidth;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function announce(a) { if (a) toast(`🏆 הישג חדש: ${a.name} (+${a.xp} XP, +${a.coins} 🪙)`, 3200); }
ctx.announce = announce;

function selectGuard(id) {
  tools.setGuard(id);
  if (tools.active !== 'clipper') selectTool('clipper', true);
  refreshToolUI();
  scheduleSave();
}
function selectTool(id, quiet = false) {
  if (!TOOLS[id]) return;
  tools.select(id);
  refreshToolUI();
  if (!quiet) toast(TOOLS[id].name + ' — ' + TOOLS[id].desc.split('.')[0]);
  session.onToolChange?.(id);
  scheduleSave();
}
function refreshToolUI() {
  const id = tools.active;
  document.querySelectorAll('.tool-card').forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
  $('guardBox').classList.toggle('hidden', id !== 'clipper');
  $('trimInfo').classList.toggle('hidden', id !== 'trimmer');
  $('scissorBox').classList.toggle('hidden', id !== 'scissors');
  $('thinInfo').classList.toggle('hidden', id !== 'thinning');
  $('dustInfo').classList.toggle('hidden', id !== 'duster');
  document.querySelectorAll('.guard[data-guard]').forEach((b) => b.classList.toggle('active', b.dataset.guard === tools.guard.id));
  $('cutInfo').textContent = `נשאר: ${fmt(tools.guard.mm + (tools.lever ? 1.5 : 0))} מ״מ`;
  const lv = $('btnLever');
  lv.classList.toggle('on', tools.lever);
  lv.innerHTML = `ידית טייפר: <b>${tools.lever ? 'פתוחה (+1.5 מ״מ)' : 'סגורה'}</b>`;
  document.querySelectorAll('.slen').forEach((b) => b.classList.toggle('active', +b.dataset.len === tools.scissorLen));
  $('scissorInfo').textContent = `נשאר: ${tools.scissorLen} מ״מ`;
  $('btnPoint').classList.toggle('on', tools.pointCut);
  $('btnPoint').innerHTML = `סוג גזירה: <b>${tools.pointCut ? 'פוינט קאט (קצוות רכים)' : 'ישרה (קו חד)'}</b>`;
}
function refreshClientChip(preset, mannequin) {
  $('clientName').textContent = preset.name;
  $('clientHair').textContent = (mannequin ? '' : 'שיער ') + preset.hairType;
  $('clientAvatar').textContent = mannequin ? '🗿' : '👤';
}
/** 0 = natural, 1 = length map, 2 = difference from the professional result. */
function setMap(mode) {
  if (mode === 2 && !hair.target) mode = 1;
  state.mapMode = mode;
  hair.setMapMode(mode);
  $('btnMap').classList.toggle('on', mode === 1);
  $('legend').classList.toggle('hidden', mode !== 1);
  $('legendDiff').classList.toggle('hidden', mode !== 2);
  session.onMapChange?.(mode);
}
function setMode(m) {
  state.mode = m;
  $('modeCut').classList.toggle('active', m === 'cut');
  $('modeView').classList.toggle('active', m === 'view');
  if (m === 'view') state.hover = null;
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

function buildBaseUI() {
  bindPad();
  { const sp = progress.data.settings?.pad; if (sp ?? isMobile) setTimeout(() => padSet(true), 0); }
  const gbox = $('guards');
  for (const g of GUARDS) {
    const b = document.createElement('button');
    b.className = 'guard'; b.dataset.guard = g.id;
    b.innerHTML = `<i class="sw" style="background:${g.color || '#bfc3c7'}"></i><b>${g.label}</b><small>${fmt(g.mm)} מ״מ</small>`;
    b.title = g.name;
    b.addEventListener('click', () => { selectGuard(g.id); toast(`${g.name}: נשארים ${fmt(tools.cutMM)} מ״מ שיער`); });
    gbox.appendChild(b);
  }
  const sbox = $('scissorLens');
  for (const l of SCISSOR_LENGTHS) {
    const b = document.createElement('button');
    b.className = 'guard slen'; b.dataset.len = l;
    b.innerHTML = `<b>${l}</b><small>מ״מ</small>`;
    b.addEventListener('click', () => { tools.scissorLen = l; refreshToolUI(); scheduleSave(); });
    sbox.appendChild(b);
  }
  $('btnPoint').addEventListener('click', () => { tools.pointCut = !tools.pointCut; refreshToolUI(); });
  $('btnLever').addEventListener('click', () => { tools.setLever(!tools.lever); refreshToolUI(); scheduleSave(); });
  document.querySelectorAll('.tool-card').forEach((b) => b.addEventListener('click', () => selectTool(b.dataset.tool)));
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => cam.setView(b.dataset.view)));
  // compact screens (phone held sideways) have one button that cycles the camera views
  const cycle = ['work', 'left', 'back', 'right', 'front', 'top'];
  let ci = 0;
  $('btnViewCycle').addEventListener('click', () => {
    ci = (ci + 1) % cycle.length;
    cam.setView(cycle[ci]);
    toast({ work: 'מבט עבודה', left: 'צד שמאל', back: 'מאחור', right: 'צד ימין', front: 'חזית', top: 'מלמעלה' }[cycle[ci]], 1000);
  });
  $('zoomIn').addEventListener('click', () => cam.zoom(0.82));
  $('zoomOut').addEventListener('click', () => cam.zoom(1.22));
  $('modeCut').addEventListener('click', () => setMode('cut'));
  $('modeView').addEventListener('click', () => setMode('view'));
  $('btnUndo').addEventListener('click', undo);
  $('btnMap').addEventListener('click', () => setMap(state.mapMode === 1 ? 0 : 1));
  $('btnReset').addEventListener('click', () => $('confirmModal').classList.remove('hidden'));
  $('confirmYes').addEventListener('click', () => {
    demo.stop();
    hair.regrow(); hair.updateScalp(); clippings.clear(); state.undo.length = 0;
    $('confirmModal').classList.add('hidden'); saveFreeHair(); session.onRegrow?.();
    toast('השיער גדל מחדש — אפשר להתחיל שוב');
  });
  const soundBtn = $('btnSound');
  const refreshSound = () => { soundBtn.textContent = sound.enabled ? '🔊' : '🔇'; };
  soundBtn.addEventListener('click', () => { sound.setEnabled(!sound.enabled); refreshSound(); saveSettings(); });
  refreshSound();
  $('btnHelp').addEventListener('click', () => $('helpModal').classList.remove('hidden'));
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m || e.target.hasAttribute('data-close')) m.classList.add('hidden'); });
  });
  refreshToolUI();
}

// ---------------------------------------------------------------- offscreen views (library pictures)
let viewRT = null;
/** Renders the scene from a camera around the head into a data URL (used for haircut pictures). */
function renderView(theta, phi, r = 0.62, size = 256) {
  viewRT ||= new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  const c = new THREE.PerspectiveCamera(36, 1, 0.02, 20);
  const t = cam.target;
  c.position.set(t.x + r * Math.sin(phi) * Math.sin(theta), t.y + r * Math.cos(phi), t.z + r * Math.sin(phi) * Math.cos(theta));
  c.lookAt(t);
  const vis = tools.root.visible;
  tools.root.visible = false; clippings.mesh.visible = false;
  hair.scalpDirty = true;
  hair.updateScalp();
  renderer.setRenderTarget(viewRT);
  renderer.render(scene, c);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(viewRT, 0, 0, size, size, px);
  renderer.setRenderTarget(null);
  tools.root.visible = vis; clippings.mesh.visible = true;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  g.putImageData(img, 0, 0);
  return cv.toDataURL('image/jpeg', 0.85);
}

// ---------------------------------------------------------------- loop
let last = 0, scalpTimer = 0, roTimer = 0;
function loop(now) {
  if (MANUAL) { frame(0); return; }
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
}

function frame(dt, render = true) {
  if (world.active) { world.frame(dt, render); return; }
  if (state.phase !== 'play') cam.theta += dt * 0.12;
  cam.update(dt);
  if (state.mirror) { // the client checks the result: look left, right, tilt
    const m = state.mirror; m.t += dt;
    const u = Math.min(1, m.t / m.dur);
    client.head.rotation.y = m.base + Math.sin(u * Math.PI * 2) * 0.45 * Math.sin(u * Math.PI);
    client.head.rotation.x = m.baseX - Math.sin(u * Math.PI) * 0.08;
    if (u >= 1) { client.head.rotation.y = m.base; client.head.rotation.x = m.baseX; state.mirror = null; m.cb(); }
  }
  padFrame();
  let h = state.hover;
  if (demo.active) {
    const local = demo.update(dt);
    if (local) {
      const n = surfaceNormal(local, new THREE.Vector3()).transformDirection(client.head.matrixWorld);
      h = { world: client.head.localToWorld(local.clone()), normalWorld: n };
      state.cuttingAmount = 1;
    }
    session.onDemoProgress?.(demo.progress);
  }
  if (h && playing()) tools.placeOnHead(h.world, h.normalWorld, dt);
  else tools.rest(shop.toolRest, dt);
  tools.running = !!state.stroke || !!h || !!state.dusting;
  tools.update(dt);
  state.cuttingAmount *= Math.exp(-dt * 8);
  const cutting = tools.active === 'clipper' || tools.active === 'trimmer';
  sound.set(cutting && (state.stroke || demo.active) ? 1 : cutting && h ? 0.55 : 0, state.cuttingAmount);
  clippings.update(dt);
  shop.update(dt);
  session.update?.(dt);
  scalpTimer += dt;
  if (scalpTimer > 0.08) { scalpTimer = 0; hair.updateScalp(); }
  roTimer += dt;
  if (roTimer > 0.12 && playing()) { roTimer = 0; updateReadout(); }
  if (render) renderer.render(scene, camera);
}

function updateReadout() {
  const h = state.hover;
  if (!h || h.body || !h.local) {
    $('roZone').textContent = h?.body ? 'מברשת על הגלימה' : state.mode === 'cut' ? 'גרור על הראש כדי לספר' : 'גרור כדי לסובב את המצלמה';
    $('roLen').textContent = h?.body ? `שערות על הלקוח: ${clippings.countOnClient()}` : '';
    return;
  }
  const z = zoneOf(h.dir);
  const len = hair.sampleLength(h.local, 0.009);
  $('roZone').textContent = z.name;
  const what = tools.cutMM != null ? ` · הכלי משאיר ${fmt(tools.cutMM)} מ״מ` : '';
  let tgt = '';
  if (hair.target) {
    let s = 0, n = 0;
    const R = hair.roots, r2 = 0.009 * 0.009;
    for (let i = 0; i < hair.count; i++) {
      const dx = R[i * 3] - h.local.x, dy = R[i * 3 + 1] - h.local.y, dz = R[i * 3 + 2] - h.local.z;
      if (dx * dx + dy * dy + dz * dz < r2) { s += hair.proLengths[i]; n++; }
    }
    if (n) tgt = ` · יעד ${fmt(s / n)} מ״מ`;
  }
  $('roLen').textContent = len == null ? 'אין שיער באזור הזה' : `אורך כאן: ${fmt(len)} מ״מ${tgt}${what}`;
}

// ---------------------------------------------------------------- test hooks
window.__barber = {
  get state() { return state; }, get hair() { return hair; }, get tools() { return tools; }, get cam() { return cam; },
  get clippings() { return clippings; }, get client() { return client; }, get demo() { return demo; },
  get progress() { return progress; }, get session() { return session; }, get world() { return world; }, ctx,
  scene, camera, renderer, frame, pickHead, setFreeHead, selectGuard, selectTool, setMap, planDemo,
  /** run the professional plan instantly on the current head (tests) */
  autoCut(spec) { const prev = tools.active; demo.start(planDemo(spec || session.cfg.spec)); demo.finishNow(); selectTool(prev, true); },
  /** cut along a path of unit directions (head-local), like a stroke */
  strokeDirs(dirs) {
    pushUndo();
    state.strokeId++;
    state.stroke = { lastLocal: null, cut: 0, id: -1 };
    for (const d of dirs) {
      const v = new THREE.Vector3(...d).normalize();
      strokeTo({ local: new THREE.Vector3(v.x * RADII.x, v.y * RADII.y, v.z * RADII.z), dir: v });
    }
    const c = state.stroke.cut; endStroke(); return c;
  },
  undo,
  toggleMap: () => setMap(state.mapMode === 1 ? 0 : 1),
};

init().catch((err) => { console.error(err); loadText.textContent = 'שגיאה בטעינה: ' + err.message; });
