// Real people: everyone in town - pedestrians, police, guards, gang members and you - is drawn as a detailed, rigged
// human model (Microsoft Rocketbox, MIT licence - assets/people) playing motion-captured clips (walking matched to their
// speed, running, standing, talking, phone, sitting, nervous, crouching). On top of the clips a pose layer turns the arm
// bones for what the clips don't have: a weapon in the hand (held low or aimed), fists up and punches, hands up when
// surrendering, eating, holding the parachute, hands on the wheel; and the whole body falls and lies there when someone
// is knocked down or killed - the same person, not a stand-in. Far away the models animate at a lower rate (cheap).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { WEAPONS } from '../game/weapons.js';

const _P1 = new THREE.Vector3(), _P2 = new THREE.Vector3(), _P3 = new THREE.Vector3(), _P4 = new THREE.Vector3(), _Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3();
// turn a bone (in world space) so that the direction from it to its child point goes from 'from' to 'to'
function aimBone(bone, from, to) {
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(_q2); _q2.premultiply(_q);
  bone.parent.getWorldQuaternion(_q); _q.invert();
  bone.quaternion.copy(_q.multiply(_q2)); bone.updateMatrixWorld(true);
}
// food you hold while eating (by what it is)
function foodMesh(F) {
  const g = new THREE.Group(), m = (c, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const icon = F?.icon, col = F?.color ?? 0xe2c28a;
  if (icon === '🍦') { const c = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 12), m(0xd9a35c, 0.85)); c.rotation.x = Math.PI; g.add(c); const b = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 8), m(col, 0.5)); b.position.y = 0.06; g.add(b); }
  else if (icon === '🍕') { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 3, 1, false, 0, 0.7), m(col)); w.rotation.z = Math.PI / 2; g.add(w); }
  else if (icon === '🍔') { for (const [y, c, h] of [[0, 0xc98a4a, 0.025], [0.025, 0x5a3420, 0.02], [0.04, 0x6aa84f, 0.006], [0.055, 0xd9a35c, 0.03]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, h, 16), m(c)); p.position.y = y; g.add(p); } }
  else if (icon === '☕' || icon === '🥤') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, icon === '🥤' ? 0.14 : 0.08, 14), m(icon === '🥤' ? 0xf2f2f2 : 0xffffff, 0.4)); g.add(c); }
  else if (icon === '🍟') { const box = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.04), m(0xc0392b)); g.add(box); for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.008), m(0xf2c94c)); f.position.set(-0.025 + i * 0.01, 0.05, 0); g.add(f); } }
  else if (icon === '🧆') { const pita = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), m(0xe8c995, 0.8)); pita.scale.set(1, 1.25, 0.6); g.add(pita); const top = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), m(0x7a9a3a)); top.position.y = 0.055; top.scale.set(1, 0.5, 0.6); g.add(top); }
  else { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.07), m(col)); g.add(b); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// a weapon in the hand of a real person (barrel along +z)
const _gunMats = {};
function gunMesh(kind) {
  const M = (c, m = 0.6, r = 0.35) => (_gunMats[c] ||= new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r }));
  const g = new THREE.Group(), box = (w, h, d, x, y, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); m.castShadow = true; g.add(m); };
  if (kind === 'knife') { box(0.02, 0.03, 0.1, 0, 0, -0.02, 0x2a2a2a); box(0.006, 0.025, 0.16, 0, 0.005, 0.11, 0xc8ccd0); }
  else if (kind === 'rifle' || kind === 'long') { box(0.05, 0.07, 0.55, 0, 0.03, 0.12, 0x23262b); box(0.025, 0.025, 0.32, 0, 0.045, 0.5, 0x1b1d20); box(0.04, 0.11, 0.05, 0, -0.04, 0.0, 0x23262b); box(0.04, 0.09, 0.05, 0, -0.03, 0.2, 0x2f3238); box(0.045, 0.08, 0.2, 0, 0.0, -0.22, 0x3a2e24); if (kind === 'long') box(0.04, 0.05, 0.16, 0, 0.1, 0.12, 0x111111); }
  else if (kind === 'launcher') { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12), M(0x4b5320, 0.2, 0.8)); t.rotation.x = Math.PI / 2; t.position.z = 0.15; g.add(t); box(0.04, 0.1, 0.05, 0, -0.08, 0.05, 0x222222); }
  else { box(0.03, 0.05, 0.17, 0, 0.03, 0.05, 0x1e2024); box(0.028, 0.1, 0.04, 0, -0.03, -0.01, 0x2a2c30); }
  return g;
}
// two-bone reach (upper arm + forearm) of the hand to a world point; the elbow bends towards 'pole'
function reach(B, target, pole) {
  const { sh, el, hand } = B; if (!sh || !el || !hand) return;
  sh.getWorldPosition(_s); el.getWorldPosition(_e); hand.getWorldPosition(_v);
  const a = _s.distanceTo(_e), b = _e.distanceTo(_v), toT = _d2.copy(target).sub(_s), d = Math.min(a + b - 0.001, Math.max(0.05, toT.length()));
  toT.setLength(d);
  const ang = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const axis = _d1.crossVectors(toT, pole).normalize(); if (axis.lengthSq() < 1e-6) return;
  const elbowPos = _t.copy(toT).normalize().applyAxisAngle(axis, ang).multiplyScalar(a).add(_s);
  aimBone(sh, _e.clone().sub(_s), elbowPos.clone().sub(_s));
  el.getWorldPosition(_e); hand.getWorldPosition(_v);
  aimBone(el, _v.clone().sub(_e), target.clone().sub(_e));
}
const BASE = './assets/people/web/';   // glTF JSON + texture images (the host serves neither .glb nor .bin)
// (the sports models are in swimwear: kept for the beach, not used on the streets)
const MEN_ALL = ['Male_Adult_01', 'Male_Adult_02', 'Male_Adult_03', 'Male_Adult_07', 'Male_Adult_08', 'Male_Adult_09', 'Male_Adult_10', 'Male_Adult_12', 'Male_Adult_13', 'Male_Adult_14', 'Business_Male_01', 'Business_Male_02'];
const WOMEN_ALL = ['Female_Adult_01', 'Female_Adult_02', 'Female_Adult_03', 'Female_Adult_04', 'Female_Adult_05', 'Female_Adult_06', 'Female_Adult_07', 'Female_Adult_08', 'Female_Adult_09', 'Female_Adult_10', 'Female_Adult_11', 'Female_Adult_12', 'Female_Adult_13', 'Female_Adult_14', 'Business_Female_01', 'Business_Female_02'];
// every session uses its own mix of people (each kind of person costs graphics memory on the phone)
const MIX = { low: [4, 4], medium: [8, 9], high: [12, 16] };
let MEN = MEN_ALL, WOMEN = WOMEN_ALL;
function pickMix(q) { const [m, w] = MIX[q] || MIX.medium, sh = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]); MEN = sh(MEN_ALL).slice(0, m); WOMEN = sh(WOMEN_ALL).slice(0, w); }
const GANG = ['Male_Adult_01', 'Male_Adult_02', 'Male_Adult_03'];   // + their colour: bandana and gold chain
const POLICE_M = ['Police_Male_01', 'Police_Male_02', 'Police_Male_03', 'Police_Male_04'], POLICE_F = ['Police_Female_01'];
const SECURITY = ['Security_Male_01'];
const SOLDIER = ['Military_Male_01', 'Military_Male_02'];
// pose of the pedestrian AI -> motion clip (m_ / f_ versions picked by the model)
const CLIP = { walk: 'walk', phoneWalk: 'walk', run: 'run', idle: 'idle', guard: 'idle', talk: 'talk', phone: 'phone', sit: 'sit', surprised: 'nervous', hide: 'crouch' };
const NAMES = {
  walk: ['m_walk_neutral_01', 'f_walk_neutral_01'], run: ['m_run_neutral', 'f_run_neutral'], idle: ['m_idle_neutral_01', 'f_idle_neutral_01'],
  look: ['m_idle_look_around_01', 'f_idle_look_around_01'], talk: ['m_gestic_talk_neutral_01', 'f_gestic_talk_neutral_01'],
  phone: ['m_cell_phone_talk_01', 'm_cell_phone_talk_01'], sit: ['m_sit_chair_idle_neutral_01', 'f_sit_chair_idle_neutral_01'],
  nervous: ['m_idle_nervous_01', 'f_idle_nervous_01'], crouch: ['m_crouch_idle', 'm_crouch_idle'],
};
// the playable characters: each one is his own real person
const PLAYER_AV = { miguel: 'Male_Adult_06', tavor: 'Male_Adult_05', jason: 'Male_Adult_04' };
const SKIP_STATES = new Set(['driving', 'inside', 'pulled', 'swimmer', 'convoy']);
// poses with no clip of their own: a base clip + the pose layer
const POSE = {
  aimGun: ['idle', 'aim'], guard: ['idle', 'fists'], block: ['idle', 'fists'], punch: ['idle', 'punch'], slip: ['idle', 'fists'],
  surrender: ['idle', 'handsUp'], fall: ['idle', 'lie'], getup: ['crouch', 'getup'], thrown: ['idle', 'lie'], sunbathe: ['idle', 'lieRest'], beachsit: ['sit', null],
};
// how many real people at once / out to what distance, by graphics quality (far ones animate at a third of the rate)
const BUDGET = { low: [12, 60], medium: [22, 100], high: [34, 140] };

// Hosted pages can forbid fetch() (content-security policy) but always allow the page's own module scripts and images.
// So the glTF data is a module (imported, not fetched), its geometry buffer is decoded here into one binary glTF (GLB)
// built in memory, and the textures are loaded as plain images.
async function loadGltf(loader, url) {
  const mod = await import(new URL(url, document.baseURI).href);
  const J = { ...mod.default, buffers: (mod.default.buffers || []).map((b) => ({ ...b })) };
  let bin = null;
  const buf = J.buffers[0];
  if (buf?.uri?.startsWith('data:')) {
    const s = atob(buf.uri.slice(buf.uri.indexOf(',') + 1)); bin = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
    delete buf.uri;
  }
  let js = new TextEncoder().encode(JSON.stringify(J));
  const jl = (js.length + 3) & ~3, bl = bin ? (bin.length + 3) & ~3 : 0;
  const out = new Uint8Array(12 + 8 + jl + (bin ? 8 + bl : 0)), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true); out.fill(0x20, 20, 20 + jl); out.set(js, 20);
  if (bin) { const o = 20 + jl; dv.setUint32(o, bl, true); dv.setUint32(o + 4, 0x004e4942, true); out.set(bin, o + 8); }
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  return new Promise((res, rej) => loader.parse(out.buffer, base, res, rej));
}

export class RealPeople {
  constructor(game) {
    this.game = game;
    this.loader = new GLTFLoader();
    // textures as <img> (TextureLoader), not fetch() + createImageBitmap
    this.loader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); parser.textureLoader.setCrossOrigin('anonymous'); return { name: 'imgTextures' }; });
    this.tpl = new Map();          // avatar name -> { scene, female }
    this.loading = new Set();
    this.failed = new Set();
    this.free = new Map();         // avatar name -> [spare instances]
    this.live = new Map();         // ped -> instance
    this.clips = null;
    pickMix(game.settings?.quality);
    loadGltf(this.loader, BASE + 'anims.js').then((g) => { this.clips = Object.fromEntries(g.animations.map((a) => [a.name, a])); }, (e) => { console.warn('real people: animations', e); this.clips = null; this.off = true; this._why(e); });
  }
  get count() { return this.live.size; }
  // if the real models can't load, say why once (so it can be reported) instead of silently showing the old figures
  _why(e) { if (this._told) return; this._told = true; setTimeout(() => this.game.toast?.(`⚠ הדמויות האמיתיות לא נטענו: ${String(e?.message || e).slice(0, 90)}`, 6), 3000); }

  _avatar(p) {
    if (p.rpAvatar) return p.rpAvatar;
    const seed = p.rpSeed ??= Math.floor(Math.random() * 1e6);
    const female = !!p.app?.long;
    const list = p.app?.cop ? (female ? POLICE_F : POLICE_M) : p.app?.soldier ? SOLDIER : (p.app?.guard || p.doorGuard) ? SECURITY : p.gangId ? GANG : female ? WOMEN : MEN;
    // never the same person as one of the playable characters
    const mine = new Set(Object.values(PLAYER_AV)), pool = list.filter((n) => !mine.has(n));
    return (p.rpAvatar = (pool.length ? pool : list)[seed % (pool.length || list.length)]);
  }
  _load(name) {
    if (this.tpl.has(name) || this.loading.has(name) || this.failed.has(name) || this.loading.size >= 2) return;
    this.loading.add(name);
    loadGltf(this.loader, `${BASE}av/${name}.js`).then((g) => {
      this.loading.delete(name);
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
      this.tpl.set(name, { scene: g.scene, female: name.includes('Female') });
    }, (e) => { console.warn('real people:', name, e); this.loading.delete(name); this.failed.add(name); this._why(e); });
  }
  _make(name) {
    const spare = this.free.get(name)?.pop(); if (spare) { spare.root.visible = true; this.game.scene.add(spare.root); return spare; }
    const T = this.tpl.get(name), model = skeletonClone(T.scene), root = new THREE.Group();
    root.add(model); model.scale.setScalar(0.01);
    const mixer = new THREE.AnimationMixer(model), g = T.female ? 1 : 0, actions = {};
    for (const [k, pair] of Object.entries(NAMES)) { const c = this.clips[pair[g]] || this.clips[pair[0]]; if (c) actions[k] = mixer.clipAction(c); }
    this.game.scene.add(root);
    // gang gear (shown for gang members): a bandana in the crew colour around the head and a gold chain
    const gear = new THREE.Group(); gear.visible = false; this.game.scene.add(gear);
    const cloth = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.85 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.102, 0.05, 20, 1, true), cloth); band.material.side = THREE.DoubleSide; gear.add(band);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.03), cloth); knot.position.set(0, -0.02, -0.105); gear.add(knot);
    // the top of the head: a bandana wrap (ABC) or a cap with a brim (BC)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.104, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), cloth); dome.scale.set(1, 0.85, 1.12); gear.add(dome);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), cloth); gear.add(brim);
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.007, 6, 28), new THREE.MeshStandardMaterial({ color: 0xd8b448, metalness: 1, roughness: 0.25 }));
    gear.add(chain);
    const bone = (n) => model.getObjectByName(n);
    const B = { R: { sh: bone('Bip01_R_UpperArm'), el: bone('Bip01_R_Forearm'), hand: bone('Bip01_R_Hand') }, L: { sh: bone('Bip01_L_UpperArm'), el: bone('Bip01_L_Forearm'), hand: bone('Bip01_L_Hand') } };
    const meshes = []; model.traverse((o) => { if (o.isMesh) meshes.push(o); });
    return { name, root, model, mixer, actions, cur: null, gear, band, chain, cloth, dome, brim, knot, head: bone('Bip01_Head'), neck: bone('Bip01_Neck'), B, meshes, lieK: 0, acc: 0, skip: 0, shadow: true };
  }
  _gear(I, color, mask) {
    if (!I.gear) return;
    I.gear.visible = color != null && !!I.head;
    if (!I.gear.visible) return;
    if (I.gearColor !== color) { I.cloth.color.setHex(color); I.gearColor = color; }
    I.root.updateMatrixWorld(true);
    const yaw = I.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
    I.head.getWorldPosition(_v);
    I.band.position.set(_v.x + fx * 0.025, _v.y + 0.085, _v.z + fz * 0.025); I.band.rotation.set(0, yaw, 0);
    I.knot.position.set(_v.x - fx * 0.1, _v.y + 0.065, _v.z - fz * 0.1); I.knot.rotation.set(0, yaw, 0); I.knot.visible = mask !== 'cap';
    I.dome.position.set(_v.x + fx * 0.02, _v.y + 0.1, _v.z + fz * 0.02); I.dome.rotation.set(0, yaw, 0);
    I.brim.visible = mask === 'cap'; I.brim.position.set(_v.x + fx * 0.115, _v.y + 0.095, _v.z + fz * 0.115); I.brim.rotation.set(0.12, yaw, 0, 'YXZ');
    (I.neck || I.head).getWorldPosition(_v);
    I.chain.position.set(_v.x + fx * 0.035, _v.y - 0.035, _v.z + fz * 0.035); I.chain.rotation.set(Math.PI / 2 - 0.35, 0, 0); I.chain.rotation.order = 'YXZ'; I.chain.rotation.y = yaw;
  }
  _release(p) {
    const I = this.live.get(p); if (!I) return;
    this.live.delete(p); p.rpOn = false;
    I.root.visible = false; this.game.scene.remove(I.root); if (I.gear) I.gear.visible = false; if (I.gun) I.gun.visible = false; I.lieK = 0;
    if (I.cur) { I.actions[I.cur]?.stop(); I.cur = null; }
    let L = this.free.get(I.name); if (!L) this.free.set(I.name, L = []);
    if (L.length < 3) L.push(I);       // keep a few spares to reuse (no rebuild when someone walks back into range)
  }
  _wants(p) {
    if (p.car || SKIP_STATES.has(p.state) || p.pose === 'swim') return null;
    if (p.state === 'dead' || p.state === 'knocked') return 'idle';
    return CLIP[p.pose] || (POSE[p.pose] ? POSE[p.pose][0] : null) || 'idle';
  }
  // the weapon a person carries (for the hand), and whether it is out
  _npcGun(p) {
    if (!p.app?.gun && !p.app?.knife) return null;
    const kind = p.app.knife && !p.app.gun ? 'knife' : (p.weaponKind && p.weaponKind !== 'knife' ? p.weaponKind : (p.doorGuard || p.cordon || p.gangRole === 'guard' || p.app.soldier ? 'rifle' : 'pistol'));
    p.weaponKind ||= kind;
    const out = p.pose === 'aimGun' || p.gunOut || p.doorGuard || p.cordon || p.state === 'gangFight' || (p.copChase && (p.app.cop || p.app.soldier));
    return out ? { kind, aim: p.pose === 'aimGun' || p.state === 'gangFight' || (p.copChase && p.pose !== 'run') } : null;
  }
  _showGun(I, kind) {
    if (!kind) { if (I.gun) I.gun.visible = false; return null; }
    if (!I.gun || I.gunKind !== kind) { if (I.gun) this.game.scene.remove(I.gun); I.gun = gunMesh(kind); I.gunKind = kind; this.game.scene.add(I.gun); }
    I.gun.visible = true; return I.gun;
  }
  // the pose layer: arms placed by two-bone reach after the clip has moved the body
  _pose(I, o) {
    const yaw = I.root.rotation.y, f = _P1.set(Math.sin(yaw), 0, Math.cos(yaw)), r = _P2.set(-Math.cos(yaw), 0, Math.sin(yaw)), up = _P3.set(0, 1, 0);   // r = the person's right
    I.root.updateMatrixWorld(true);
    const S = I.B.R.sh, Ls = I.B.L.sh; if (!S || !Ls || !I.head) return;
    const sR = S.getWorldPosition(new THREE.Vector3()), sL = Ls.getWorldPosition(new THREE.Vector3()), hd = I.head.getWorldPosition(new THREE.Vector3());
    const poleR = new THREE.Vector3().copy(r).multiplyScalar(0.5).addScaledVector(up, -1), poleL = new THREE.Vector3().copy(r).multiplyScalar(-0.5).addScaledVector(up, -1);
    const T = (base, df, du, dr) => base.clone().addScaledVector(f, df).addScaledVector(up, du).addScaledVector(r, dr);
    const k = o.kind;
    if (k === 'aim' || k === 'low') {
      const long = o.gun === 'rifle' || o.gun === 'long' || o.gun === 'launcher';
      const pitch = k === 'low' ? -0.75 : Math.max(-0.6, Math.min(0.6, o.pitch || 0));
      const dir = new THREE.Vector3().copy(f).multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch)).normalize();
      // the gun hand in front of the right shoulder (rifle: closer, stock at the shoulder), the other hand supporting
      const hR = sR.clone().addScaledVector(dir, long ? 0.32 : 0.5).addScaledVector(r, long ? -0.12 : -0.1).addScaledVector(up, long ? 0.02 : 0);
      reach(I.B.R, hR, poleR);
      const hL = hR.clone().addScaledVector(dir, long ? 0.28 : 0.03).addScaledVector(r, long ? -0.03 : -0.05).addScaledVector(up, long ? -0.03 : -0.02);
      if (o.gun !== 'knife') reach(I.B.L, hL, poleL);
      if (I.gun) { I.B.R.hand.getWorldPosition(_P4); I.gun.position.copy(_P4).addScaledVector(dir, long ? 0.0 : 0.03); I.gun.quaternion.setFromUnitVectors(_Z, dir); }
    } else if (k === 'fists' || k === 'punch') {
      const pk = k === 'punch' ? Math.sin(Math.min(1, o.punchK || 0) * Math.PI) : 0;
      reach(I.B.R, T(hd, 0.28 + pk * 0.35, -0.12 + pk * 0.04, 0.11 - pk * 0.08), poleR);
      reach(I.B.L, T(hd, o.left ? 0.28 + pk * 0.35 : 0.24, -0.12, -0.12), poleL);
    } else if (k === 'handsUp') {
      reach(I.B.R, T(sR, 0.05, 0.55, 0.08), poleR); reach(I.B.L, T(sL, 0.05, 0.55, -0.08), poleL);
    } else if (k === 'chute') {
      reach(I.B.R, T(sR, 0.0, 0.5, 0.12), poleR); reach(I.B.L, T(sL, 0.0, 0.5, -0.12), poleL);
    } else if (k === 'wheel' && o.wheel) {
      reach(I.B.R, o.wheel.clone().addScaledVector(r, 0.17), poleR); reach(I.B.L, o.wheel.clone().addScaledVector(r, -0.17), poleL);
    } else if (k === 'throw') {
      const t = o.throwK; reach(I.B.R, t > 0.5 ? T(sR, -0.2, 0.35, 0.05) : T(sR, 0.5, 0.25, 0), poleR);
    }
    if (I.gun && k !== 'aim' && k !== 'low' && I.gun.visible) { I.B.R.hand.getWorldPosition(_P4); I.gun.position.copy(_P4); I.gun.quaternion.setFromUnitVectors(_Z, new THREE.Vector3().copy(f).multiplyScalar(0.5).addScaledVector(up, -0.85).normalize()); }
  }
  // falling down / lying there / getting up: the whole body turns about the feet (on its back, head away from the hit)
  _lie(I, p, dt, mode) {
    const want = mode === 'getup' ? Math.max(0, Math.min(1, (p.timer ?? 0) / 0.9)) : mode ? 1 : 0;
    I.lieK += Math.sign(want - I.lieK) * Math.min(Math.abs(want - I.lieK), dt * (want > I.lieK ? 3.2 : 1.6));
    const k = I.lieK, e = k * k * (3 - 2 * k);
    I.root.rotation.order = 'YXZ';
    I.root.rotation.set(-Math.PI / 2 * e * (mode === 'lieRest' ? 1 : 0.98), mode && mode !== 'getup' ? (p.fallYaw ?? p.yaw ?? 0) : (p.yaw ?? 0), 0);
    I.root.position.y += 0.11 * e;
    return k > 0.98 && (p.state === 'dead');   // fully down and dead: no more breathing
  }

  // you: the character you play is a real person in every state - walking, running, jumping, weapon held low or aimed,
  // punching, throwing, eating, parachuting, sitting, in a car with the hands on the wheel. Only swimming and the closed
  // cockpits (planes, tank) keep the old figure / hide you.
  _player(dt) {
    const g = this.game, P = g.player, id = g.chars?.active || 'miguel', name = this.uniform?.() || PLAYER_AV[id] || PLAYER_AV.miguel;
    const v = P.vehicle, inCar = (P.state === 'driving' || P.state === 'entering' || P.state === 'exiting') && v;
    const enclosed = inCar && P.state === 'driving' && (v.isPlane || v.T?.enclosed);
    const ok = !g.realPeopleOff && !P.swimming && !enclosed && P.object.parent && g.state !== 'switching';
    if (!ok || !this.tpl.has(name)) {
      if (ok) this._load(name);
      if (this.me) { this.me.root.visible = false; if (this.me.gun) this.me.gun.visible = false; if (this.meHid) { P.object.visible = !enclosed; this.meHid = false; } }
      P.realBody = false;
      return;
    }
    if (!this.me || this.me.name !== name) { if (this.me) { this.game.scene.remove(this.me.root); if (this.me.gun) this.game.scene.remove(this.me.gun); } this.me = this._make(name); this.me.root.scale.setScalar(1.0); }
    const I = this.me, sp = Math.hypot(P.vx || 0, P.vz || 0);
    const W = g.econ?.equipped ? WEAPONS[g.econ.equipped] : null;
    const gunKind = W && P.state === 'foot' ? ({ pistol: 'pistol', rifle: 'rifle', long: 'long', heavy: 'launcher' })[W.kind] || null : null;
    const seated = inCar && P.state === 'driving' || !!P.seat;
    const key = seated ? 'sit' : P.skydive ? 'idle' : !P.grounded && !P.parachute ? (I.cur && I.cur !== 'sit' ? I.cur : 'idle') : sp < 0.3 ? 'idle' : sp < 3.3 ? 'walk' : 'run';
    if (I.cur !== key) { const a = I.actions[key], old = I.cur && I.actions[I.cur]; if (a) { a.reset(); a.play(); if (old) a.crossFadeFrom(old, 0.2, false); } I.cur = key; }
    const a = I.actions[key];
    if (a) a.timeScale = !P.grounded && !seated ? 0.25 : key === 'walk' ? Math.max(0.7, Math.min(1.8, sp / 1.35)) : key === 'run' ? Math.max(0.8, Math.min(1.8, sp / 3.6)) : 1;
    I.root.visible = true;
    // where you are: the old figure's place (it is positioned in the seat when you drive)
    P.object.updateWorldMatrix(true, false);
    P.object.getWorldPosition(I.root.position);
    if (inCar) { P.object.getWorldQuaternion(_q); I.root.quaternion.copy(_q); }
    else { I.root.rotation.order = 'YXZ'; I.root.rotation.set(P.skydive ? Math.PI / 2 * 0.9 : 0, P.object.rotation.y, 0); }
    I.mixer.update(dt);
    // the arms
    this._showGun(I, gunKind);
    const atk = P.attack;
    if (gunKind) this._pose(I, { kind: P.aimT > 0 || P.firing > 0 || g.aiming ? 'aim' : 'low', gun: gunKind, pitch: -(P.aimPitch || g.rig?.pitch || 0) * 0.8 });
    else if (atk) this._pose(I, { kind: 'punch', punchK: atk.t / (atk.m?.dur || 0.45), left: atk.type === 'jabL' });
    else if (P.throwT > 0) this._pose(I, { kind: 'throw', throwK: P.throwT / 0.55 });
    else if (P.parachute) this._pose(I, { kind: 'chute' });
    else if (P.combatT > 0) this._pose(I, { kind: 'fists' });
    else if (inCar && P.state === 'driving' && v.parts?.steerWheel) { v.parts.steerWheel.getWorldPosition(_P4); this._pose(I, { kind: 'wheel', wheel: _P4.clone() }); }
    this._eat(I, P, dt);
    if (P.object.visible) { P.object.visible = false; this.meHid = true; }
    P.realBody = true;
  }

  // eating for real: the food in your right hand, up to the mouth, a bite (the food gets smaller), chewing while the
  // hand comes down a little, three bites, then a swallow
  _eat(I, P, dt) {
    const on = P.eatT > 0 && P.eating;
    if (!on) { if (I.food) { this.game.scene.remove(I.food); I.food = null; I.foodOf = null; } return; }
    const sh = I.model.getObjectByName('Bip01_R_UpperArm'), el = I.model.getObjectByName('Bip01_R_Forearm'), hand = I.model.getObjectByName('Bip01_R_Hand'), head = I.head;
    if (!sh || !el || !hand || !head) return;
    if (I.foodOf !== P.eating) { if (I.food) this.game.scene.remove(I.food); I.food = foodMesh(P.eating); I.foodOf = P.eating; I.eat0 = P.eatT; this.game.scene.add(I.food); }
    const T = I.eat0 - P.eatT, cycle = 1.4, n = Math.min(2, Math.floor(T / cycle)), ph = (T - n * cycle) / cycle, last = P.eatT < 0.45;
    // how high the hand is: 0 = in front of the chest, 1 = at the mouth
    const up = last ? Math.max(0, P.eatT / 0.45) * 0.3 : ph < 0.35 ? ph / 0.35 : ph < 0.5 ? 1 : Math.max(0.25, 1 - (ph - 0.5) / 0.3 * 0.75);
    const bites = n + (ph >= 0.42 ? 1 : 0);
    I.root.updateMatrixWorld(true);
    const yaw = I.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    head.getWorldPosition(_h);
    const mouth = _t.set(_h.x + fx * 0.11, _h.y + 0.02, _h.z + fz * 0.11), chest = _d1.set(_h.x + fx * 0.3 - rx * 0.12, _h.y - 0.32, _h.z + fz * 0.3 - rz * 0.12);
    const target = chest.lerp(mouth, up);
    // two-bone reach (upper arm, forearm) with the elbow out and down
    sh.getWorldPosition(_s); el.getWorldPosition(_e); hand.getWorldPosition(_v);
    const a = _s.distanceTo(_e), b = _e.distanceTo(_v), toT = _d2.copy(target).sub(_s), d = Math.min(a + b - 0.001, Math.max(0.05, toT.length()));
    toT.setLength(d);
    const cosA = (a * a + d * d - b * b) / (2 * a * d), ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const pole = new THREE.Vector3(-rx * 0.4, -1, -rz * 0.4).normalize(), axis = new THREE.Vector3().crossVectors(toT, pole).normalize();
    const elbowDir = toT.clone().normalize().applyAxisAngle(axis, ang), elbowPos = _s.clone().addScaledVector(elbowDir, a);
    aimBone(sh, _e.clone().sub(_s), elbowPos.clone().sub(_s));
    el.getWorldPosition(_e); hand.getWorldPosition(_v);
    aimBone(el, _v.clone().sub(_e), target.clone().sub(_e));
    // chewing: small nods of the head between bites, a swallow at the end
    const chew = ph > 0.5 && !last ? Math.sin(T * 18) * 0.05 : last ? -0.12 * Math.sin(Math.PI * (1 - P.eatT / 0.45)) : 0;
    head.rotateX(chew); head.updateMatrixWorld(true);
    hand.getWorldPosition(_v);
    I.food.position.set(_v.x + fx * 0.05, _v.y + 0.02, _v.z + fz * 0.05); I.food.rotation.set(0, yaw, 0);
    I.food.scale.setScalar(Math.max(0.25, 1 - bites * 0.25));
    I.food.visible = !last || P.eatT > 0.25;
  }

  update(dt) {
    const g = this.game;
    if (this.clips && !this.off) this._player(dt);
    if (!this.clips || this.off || g.realPeopleOff) { if (this.live.size) for (const p of [...this.live.keys()]) this._release(p); return; }
    const [budget, range] = BUDGET[g.settings?.quality] || BUDGET.medium;
    const cam = g.camera.position, peds = g.peds.peds;
    // closest people in a pose the clips cover
    const cand = [];
    for (const p of peds) {
      const clip = this._wants(p); if (!clip) continue;
      const d = Math.hypot(p.x - cam.x, p.z - cam.z); if (!(d <= range) || Math.abs(p.y - cam.y) > 40) continue;
      cand.push([d, p, clip]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const want = new Map(cand.slice(0, budget).map(([d, p, clip]) => [p, clip])), dist = new Map(cand.map(([d, p]) => [p, d]));
    for (const p of [...this.live.keys()]) if (!want.has(p)) this._release(p);
    let made = 0;
    for (const [p, clip] of want) {
      const d = dist.get(p) || 0;
      let I = this.live.get(p);
      if (!I) {
        const name = this._avatar(p);
        if (!this.tpl.has(name)) { this._load(name); continue; }
        if (made >= 1 && !this.free.get(name)?.length) continue;     // at most one new model per frame (no stutter)
        I = this._make(name); made++; this.live.set(p, I); p.rpOn = true;
        I.root.scale.setScalar(0.94 + ((p.rpSeed || 0) % 13) * 0.01);   // people of different heights
        I.skip = (p.rpSeed || 0) % 3;
      }
      // motion: the clip for the pose, walking / running speed matched to how fast they really move
      const down = p.state === 'dead' || p.state === 'knocked';
      const layer = down ? 'lie' : POSE[p.pose]?.[1] || null;
      let key = NAMES[clip] ? clip : 'idle';
      if (key === 'idle' && !layer && ((p.rpSeed || 0) % 3 === 0)) key = 'look';
      if (I.cur !== key) {
        const a = I.actions[key], old = I.cur && I.actions[I.cur];
        if (a) { a.reset(); a.play(); if (old) a.crossFadeFrom(old, I.cur ? 0.25 : 0, false); if (!I.cur) a.time = ((p.rpSeed || 0) % 100) / 100 * a.getClip().duration; }
        I.cur = key;
      }
      const a = I.actions[key];
      if (a) a.timeScale = key === 'walk' ? Math.max(0.6, Math.min(1.7, (p.speed || 1.3) / 1.35)) : key === 'run' ? Math.max(0.7, Math.min(1.6, (p.speed || 3.6) / 3.6)) : 1;
      I.root.position.set(p.x, p.y, p.z);
      const lieMode = layer === 'lie' || layer === 'lieRest' || layer === 'getup' ? layer : (I.lieK > 0 ? null : undefined);
      let still = false;
      if (lieMode !== undefined) still = this._lie(I, p, dt, lieMode); else I.root.rotation.set(0, p.yaw || 0, 0);
      // far away: animate at a third of the rate, no shadow (cheap); fully down and dead: frozen
      const far = d > 35; I.acc += dt;
      if (!still && (!far || ++I.skip % 3 === 0)) { I.mixer.update(I.acc); I.acc = 0; }
      if (I.shadow !== !far) { I.shadow = !far; for (const m of I.meshes) m.castShadow = !far; }
      // the arms: weapon (low / aimed), fists, punches, hands up
      const gun = down ? null : this._npcGun(p);
      this._showGun(I, gun?.kind);
      if (!far && !down) {
        if (gun) this._pose(I, { kind: gun.aim ? 'aim' : 'low', gun: gun.kind, pitch: 0 });
        else if (layer === 'fists' || layer === 'punch') this._pose(I, { kind: layer, punchK: p.atk ? (p.atk.t || 0) / 0.45 : 0, left: p.atk?.type === 'jab' });
        else if (layer === 'handsUp') this._pose(I, { kind: 'handsUp' });
      } else if (gun && I.gun) { I.root.updateMatrixWorld(true); I.B.R.hand.getWorldPosition(_P4); I.gun.position.copy(_P4); }
      this._gear(I, p.gangColor, p.gangMask);
    }
    for (const L of this.free.values()) for (const I of L) { I.root.visible = false; if (I.gun) I.gun.visible = false; }
  }
}
