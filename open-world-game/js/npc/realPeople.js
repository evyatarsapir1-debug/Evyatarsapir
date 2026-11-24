// Real people: the pedestrians close to the camera are drawn as detailed, rigged human models (Microsoft Rocketbox,
// MIT licence — assets/people) playing motion-captured clips: walking (matched to their speed), running, standing,
// talking, on the phone, sitting, nervous, crouching. Further away (or in a pose the clips don't cover: falling,
// fighting, aiming, swimming, driving) the light instanced figure is used, so the phone isn't overloaded.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const BASE = './assets/people/web/';   // glTF JSON + texture images (the host serves neither .glb nor .bin)
// (the sports models are in swimwear: kept for the beach, not used on the streets)
const MEN = ['Male_Adult_01', 'Male_Adult_02', 'Male_Adult_03', 'Male_Adult_04', 'Male_Adult_05', 'Male_Adult_06', 'Business_Male_01'];
const WOMEN = ['Female_Adult_01', 'Female_Adult_02', 'Female_Adult_03', 'Female_Adult_04', 'Female_Adult_05', 'Female_Adult_06', 'Business_Female_01'];
const POLICE_M = ['Police_Male_01', 'Police_Male_02'], POLICE_F = ['Police_Female_01'];
const SECURITY = ['Security_Male_01'];
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
const SKIP_STATES = new Set(['driving', 'inside', 'pulled', 'thrown', 'swimmer', 'convoy', 'dead']);
// how many real people at once / out to what distance, by graphics quality
const BUDGET = { low: [5, 26], medium: [10, 38], high: [16, 50] };

export class RealPeople {
  constructor(game) {
    this.game = game;
    this.loader = new GLTFLoader();
    this.tpl = new Map();          // avatar name -> { scene, female }
    this.loading = new Set();
    this.failed = new Set();
    this.free = new Map();         // avatar name -> [spare instances]
    this.live = new Map();         // ped -> instance
    this.clips = null;
    this.loader.load(BASE + 'anims.json', (g) => { this.clips = Object.fromEntries(g.animations.map((a) => [a.name, a])); }, undefined, () => { this.clips = null; this.off = true; });
  }
  get count() { return this.live.size; }

  _avatar(p) {
    if (p.rpAvatar) return p.rpAvatar;
    const seed = p.rpSeed ??= Math.floor(Math.random() * 1e6);
    const female = !!p.app?.long;
    const list = p.app?.cop ? (female ? POLICE_F : POLICE_M) : p.app?.guard ? SECURITY : female ? WOMEN : MEN;
    // never the same person as one of the playable characters
    const mine = new Set(Object.values(PLAYER_AV)), pool = list.filter((n) => !mine.has(n));
    return (p.rpAvatar = (pool.length ? pool : list)[seed % (pool.length || list.length)]);
  }
  _load(name) {
    if (this.tpl.has(name) || this.loading.has(name) || this.failed.has(name) || this.loading.size >= 2) return;
    this.loading.add(name);
    this.loader.load(`${BASE}av/${name}.json`, (g) => {
      this.loading.delete(name);
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
      this.tpl.set(name, { scene: g.scene, female: name.includes('Female') });
    }, undefined, () => { this.loading.delete(name); this.failed.add(name); });
  }
  _make(name) {
    const spare = this.free.get(name)?.pop(); if (spare) { spare.root.visible = true; this.game.scene.add(spare.root); return spare; }
    const T = this.tpl.get(name), model = skeletonClone(T.scene), root = new THREE.Group();
    root.add(model); model.scale.setScalar(0.01);
    const mixer = new THREE.AnimationMixer(model), g = T.female ? 1 : 0, actions = {};
    for (const [k, pair] of Object.entries(NAMES)) { const c = this.clips[pair[g]] || this.clips[pair[0]]; if (c) actions[k] = mixer.clipAction(c); }
    this.game.scene.add(root);
    return { name, root, model, mixer, actions, cur: null };
  }
  _release(p) {
    const I = this.live.get(p); if (!I) return;
    this.live.delete(p); p.rpOn = false;
    I.root.visible = false; this.game.scene.remove(I.root);
    if (I.cur) { I.actions[I.cur]?.stop(); I.cur = null; }
    let L = this.free.get(I.name); if (!L) this.free.set(I.name, L = []);
    if (L.length < 3) L.push(I);       // keep a few spares to reuse (no rebuild when someone walks back into range)
  }
  _wants(p) {
    if (p.cm || p.gangId || p.follower || p.doorGuard || p.cordon || p.car || SKIP_STATES.has(p.state)) return null;
    return CLIP[p.pose] || null;
  }

  // you: the character you play is a real person too while walking / running / standing / jumping (empty hands);
  // with a weapon in hand, fighting, swimming, parachuting, eating, sitting or in a vehicle the full-featured
  // figure (which has those animations) is used
  _player(dt) {
    const g = this.game, P = g.player, id = g.chars?.active || 'miguel', name = PLAYER_AV[id] || PLAYER_AV.miguel;
    const ok = !g.realPeopleOff && P.state === 'foot' && !P.swimming && !P.parachute && !P.skydive && !P.attack && !(P.hitT > 0) && !(P.eatT > 0) && !(P.throwT > 0)
      && !(P.combatT > 0) && !g.econ?.equipped && g.econ?.gear !== 'chute' && !P.seat && !P.eating && P.object.parent && g.state !== 'switching';
    if (!ok || !this.tpl.has(name)) {
      if (ok) this._load(name);
      if (this.me) { this.me.root.visible = false; if (this.meHid) { P.object.visible = true; this.meHid = false; } }
      P.realBody = false;
      return;
    }
    if (!this.me || this.me.name !== name) { if (this.me) this.game.scene.remove(this.me.root); this.me = this._make(name); this.me.root.scale.setScalar(1.0); }
    const I = this.me, sp = Math.hypot(P.vx || 0, P.vz || 0);
    const key = !P.grounded ? (I.cur || 'idle') : sp < 0.3 ? 'idle' : sp < 3.3 ? 'walk' : 'run';
    if (I.cur !== key) { const a = I.actions[key], old = I.cur && I.actions[I.cur]; if (a) { a.reset(); a.play(); if (old) a.crossFadeFrom(old, 0.2, false); } I.cur = key; }
    const a = I.actions[key];
    if (a) a.timeScale = !P.grounded ? 0.25 : key === 'walk' ? Math.max(0.7, Math.min(1.8, sp / 1.35)) : key === 'run' ? Math.max(0.8, Math.min(1.8, sp / 3.6)) : 1;
    I.root.visible = true;
    I.root.position.copy(P.object.position); I.root.rotation.set(0, P.object.rotation.y, 0);
    I.mixer.update(dt);
    if (P.object.visible) { P.object.visible = false; this.meHid = true; }
    P.realBody = true;
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
    const want = new Map(cand.slice(0, budget).map(([, p, clip]) => [p, clip]));
    for (const p of [...this.live.keys()]) if (!want.has(p)) this._release(p);
    let made = 0;
    for (const [p, clip] of want) {
      let I = this.live.get(p);
      if (!I) {
        const name = this._avatar(p);
        if (!this.tpl.has(name)) { this._load(name); continue; }
        if (made >= 1 && !this.free.get(name)?.length) continue;     // at most one new model per frame (no stutter)
        I = this._make(name); made++; this.live.set(p, I); p.rpOn = true;
        I.root.scale.setScalar(0.97 + ((p.rpSeed || 0) % 7) * 0.01);   // people of different heights
      }
      // motion: the clip for the pose, walking / running speed matched to how fast they really move
      let key = NAMES[clip] ? clip : 'idle';
      if (key === 'idle' && ((p.rpSeed || 0) % 3 === 0)) key = 'look';
      if (I.cur !== key) {
        const a = I.actions[key], old = I.cur && I.actions[I.cur];
        if (a) { a.reset(); a.play(); if (old) a.crossFadeFrom(old, I.cur ? 0.25 : 0, false); if (!I.cur) a.time = ((p.rpSeed || 0) % 100) / 100 * a.getClip().duration; }
        I.cur = key;
      }
      const a = I.actions[key];
      if (a) a.timeScale = key === 'walk' ? Math.max(0.6, Math.min(1.7, (p.speed || 1.3) / 1.35)) : key === 'run' ? Math.max(0.7, Math.min(1.6, (p.speed || 3.6) / 3.6)) : 1;
      I.root.position.set(p.x, p.y, p.z);
      I.root.rotation.set(0, p.yaw || 0, 0);
      I.mixer.update(dt);
    }
    for (const L of this.free.values()) for (const I of L) I.root.visible = false;
  }
}
