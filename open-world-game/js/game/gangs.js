// Street gangs (fictional, game mechanics only - no blood): two crews, ABC in green and BC in blue, each holding a
// small neighbourhood at the edge of the city with warning signs on every road in. Members are full character models
// (real clothes in the crew colour, ABC with bandanas over the face, BC with caps, gold chains on everyone, pistols and
// compact rifles). Walk past them freely - they only stare and talk; they come for you only if you hurt one of them,
// shoot on their turf, or take / damage their cars and bikes.
//
// Join a crew from the phone (Gangs app). Then call your boys: "follow me" - they walk behind you, and when you get in a
// car they jump into the crew's cars and bikes and drive behind you; when you stop and get out, they get out too.
// "Attack!" - they go for the rival crew (guns keep their distance, the rest charge). Wipe out the rival crew on its own
// turf and the neighbourhood becomes yours: your colours on the map, your signs, your people on the corners.
// The X button in the app takes you out of the gang - back to being a normal person.
import * as THREE from 'three';
import { P, ROAD_HALF } from '../world/layout.js';
import { heightAt } from '../world/terrain.js';
import { Vehicle } from '../vehicles/vehicle.js';
import { CharacterModel } from '../character/characterModel.js';

export const GANGS = [
  { id: 'abc', name: 'ABC', full: 'כנופיית ABC', color: 0x2f9e44, css: '#2f9e44', top: 4, top2: 11, car: 0x1f7a35, mask: 'bandana', fill: 'rgba(40,180,70,0.22)', fillMine: 'rgba(60,220,90,0.30)', stroke: 'rgba(20,110,40,0.95)', signDark: '#1d5c2a' },
  { id: 'bc', name: 'BC', full: 'כנופיית BC', color: 0x2563c9, css: '#2563c9', top: 3, top2: 17, car: 0x1f4fa8, mask: 'cap', fill: 'rgba(40,100,220,0.22)', fillMine: 'rgba(70,140,255,0.32)', stroke: 'rgba(20,55,140,0.95)', signDark: '#173a7a' },
];
// the two neighbourhoods (one crossroads each); `home` is the crew that holds it until someone takes it over
export const TURFS = [
  { id: 'north', name: 'השכונה הצפונית', cx: 100, cz: 100, r: 85, cross: [1, 1], home: 'abc' },
  { id: 'south', name: 'שכונת הנמל', cx: 100, cz: 900, r: 85, cross: [1, 9], home: 'bc' },
];
const BY_ID = Object.fromEntries(GANGS.map((g) => [g.id, g]));
const OLD_IDS = { snakes: 'abc', harbor: 'bc' };   // saves from before the ABC / BC crews
const WARN = ['אתה לא שייך לפה', 'תמשיך ללכת', 'מה אתה מסתכל?', 'זה השטח שלנו', 'אל תעשה שטויות', 'לך מפה'];
const ANGRY = ['תפסו אותו!', 'הוא נגע בנו!', 'עכשיו אתה גמור!', 'אל תיתנו לו לברוח!', 'כולם עליו!'];
const HELLO = ['אחי!', 'מה המצב?', 'הבית שלך פה', 'כבוד', 'אנחנו איתך'];
const COME = ['אנחנו איתך!', 'מאחוריך, אחי', 'בוא נזוז', 'סע, אנחנו אחריך'];
const GO = ['קדימה! עליהם!', 'זה השטח שלנו עכשיו!', 'אל תשאירו אף אחד!', 'יאללה!'];
const SKINS = [0, 1, 2, 3, 4];
const _seat = new THREE.Vector3();
const DOWN = ['dead', 'knocked', 'down', 'thrown', 'fall', 'dazed'];

// ------------------------------------------------------------------ crew weapons (generic game props)
const STEEL = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.75, roughness: 0.35 });
const POLY = new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.1, roughness: 0.7 });
const BLADE = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 0.9, roughness: 0.2 });
function npcWeapon(kind) {
  const g = new THREE.Group();
  const add = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
  const cy = (r, l, m, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 10).rotateX(Math.PI / 2), m); o.position.set(x, y, z); g.add(o); return o; };
  if (kind === 'pistol') {
    add(0.034, 0.042, 0.19, STEEL, 0, -0.262, 0.07); add(0.03, 0.03, 0.15, POLY, 0, -0.293, 0.065);
    add(0.031, 0.11, 0.05, POLY, 0, -0.34, -0.005, 0.22); add(0.006, 0.03, 0.05, STEEL, 0, -0.318, 0.04);
    add(0.006, 0.01, 0.01, STEEL, 0, -0.236, 0.15); add(0.016, 0.01, 0.01, STEEL, 0, -0.236, -0.015); cy(0.008, 0.02, STEEL, 0, -0.262, 0.17);
    add(0.034, 0.012, 0.054, POLY, 0, -0.402, -0.02, 0.22);
  } else if (kind === 'rifle') {
    add(0.045, 0.07, 0.3, STEEL, 0, -0.27, 0.08); add(0.05, 0.055, 0.2, POLY, 0, -0.275, 0.32);
    for (let i = 0; i < 6; i++) add(0.052, 0.008, 0.012, POLY, 0, -0.245, 0.24 + i * 0.03);
    cy(0.011, 0.28, STEEL, 0, -0.262, 0.55); cy(0.016, 0.05, STEEL, 0, -0.262, 0.7);
    add(0.03, 0.09, 0.045, POLY, 0, -0.33, -0.01, 0.3); add(0.03, 0.13, 0.055, POLY, 0, -0.355, 0.14, 0.25);
    add(0.04, 0.075, 0.27, POLY, 0, -0.285, -0.2); add(0.044, 0.09, 0.03, POLY, 0, -0.285, -0.335); add(0.02, 0.025, 0.04, STEEL, 0, -0.226, 0.0);
  } else if (kind === 'knife') {
    add(0.022, 0.03, 0.1, POLY, 0, -0.3, 0.0); const b = add(0.006, 0.026, 0.13, BLADE, 0, -0.3, 0.11); b.scale.set(1, 1, 1);
  }
  // held in the hand with the barrel along the forearm: with the arms out in front the weapon points straight ahead
  // (level), the grip down in the fist - not standing up on end
  const hand = new THREE.Group(); hand.position.set(0, -0.3, 0.0); hand.rotation.x = Math.PI / 2;
  g.position.set(0, 0.3, 0); hand.add(g);
  return hand;
}

// ------------------------------------------------------------------ looks
function pedApp(G, role, i) {
  // the simple crowd look (used only far away, where the full model is not drawn)
  const skins = [0xe9b98f, 0xc98e62, 0xa86f48, 0x7b4a2c, 0x4f2f1d];
  const a = { skin: skins[(i * 3 + role.length) % skins.length], hair: 0x1b1410, long: false, bald: i % 3 === 0, h: 1.02 + (i % 5) * 0.025, w: 1.02 + (i % 4) * 0.04,
    shirt: G.color, pants: 0x1d1d1f, shoes: i % 2 ? 0xf2f2f2 : 0x1d1d1f, gang: G.id };
  if (G.mask === 'bandana' && role !== 'leader') a.bandana = G.color; else a.capColor = G.color;
  return a;
}
function modelApp(G, role, i) {
  const tops = ['tshirt', 'hoodie', 'tank', 'tshirt', 'longsleeve', 'hoodie'];
  const app = {
    skin: SKINS[(i * 3 + 1) % SKINS.length], hairStyle: ['buzz', 'short', 'bald', 'curly', 'buzz', 'mohawk'][i % 6], hairColor: i % 4 === 3 ? 2 : 0,
    top: tops[i % tops.length], topColor: i % 3 === 2 ? G.top2 : G.top, underColor: 1,
    bottom: i % 3 === 1 ? 'shorts' : 'jeans', bottomColor: i % 3 === 1 ? 1 : (i % 2 ? 16 : 1), shoes: i % 2 ? 0 : 1, shoeStyle: i % 5 === 4 ? 'boot' : 'sneaker',
    height: 1.0 + (i % 5) * 0.02, build: 1.0 + (i % 4) * 0.05, beard: ['stubble', 'short', 'none', 'goatee', 'scruffy'][i % 5], glasses: i % 5 === 0 ? 'sun' : 'none',
    hat: 'none', hatColor: G.top, mask: 'none', maskColor: G.color, chain: true,
  };
  if (G.mask === 'bandana') { app.mask = 'bandana'; if (i % 3 === 1) { app.hat = 'beanie'; app.hatColor = 1; } }
  else { app.hat = i % 3 === 2 ? 'beanie' : 'cap'; if (i % 4 === 3) app.mask = 'bandana'; }
  if (role === 'leader') Object.assign(app, { top: 'tshirt', topColor: 0, bottom: 'jeans', bottomColor: 1, glasses: 'sun', mask: 'none', hat: G.mask === 'bandana' ? 'none' : 'cap', beard: 'short', build: 1.15, height: 1.06, hairStyle: 'buzz' });
  return app;
}

export class Gangs {
  constructor(game) {
    this.game = game; this.crews = {};
    for (const T of TURFS) this.crews[T.id] = { T, G: null, members: [], cars: [], hostile: 0, spawned: false };
    this.inside = null; this.serial = 0;
    this.followers = []; this.order = 'follow'; this.convoy = []; this.trail = []; this.trailS = 0;
    this.models = new Set(); this._cmBudget = 0;
  }
  // ------------------------------------------------------------------ state
  get member() { const id = this.game.econ.gang; return id ? (OLD_IDS[id] || id) : null; }
  info(id) { return BY_ID[OLD_IDS[id] || id]; }
  owner(T) { return BY_ID[(this.game.econ.turf || {})[T.id]] || BY_ID[T.home]; }
  territoryAt(x, z) { return TURFS.find((T) => Math.hypot(x - T.cx, z - T.cz) < T.r) || null; }
  turfsOf(gid) { return TURFS.filter((T) => this.owner(T).id === gid); }
  enemyOf(gid) { return GANGS.find((G) => G.id !== gid); }
  // listen to the people system: hitting or running over a gang member provokes his crew
  _hook() {
    if (this._hooked) return; this._hooked = true;
    const peds = this.game.peds, Pl = this.game.player;
    const hit = peds.hit.bind(peds), run = peds._runOver.bind(peds);
    peds.hit = (p, src, dmg, kick) => {
      // your own crew: no damage from you - they only tell you off
      if (src === Pl && p.gangId && p.gangId === this.member) { if (!(p.sayT > 0)) peds.say(p, ['אחי! אנחנו באותה כנופיה', 'וואו, תירגע אחי', 'אני איתך, לא נגדך!'][Math.floor(Math.random() * 3)], 1.8); return false; }
      const r = hit(p, src, dmg, kick); if (r && src === Pl && p.gangId) this.provoke(p.gangId, 'hit', p);
      if (r && src && src !== Pl && p.follower && !src.follower && src.x !== undefined) src.aggroT = 30;   // whoever hits one of your boys becomes a target
      return r;
    };
    peds._runOver = (p, v, sp, ctx) => { if (v.driver === 'player' && p.gangId && p.gangId === this.member) return; run(p, v, sp, ctx); if (v.driver === 'player' && p.gangId) this.provoke(p.gangId, 'car', p); };
    if (this.game.econ.gang && OLD_IDS[this.game.econ.gang]) this.game.econ.gang = OLD_IDS[this.game.econ.gang];
  }

  // ------------------------------------------------------------------ full character models for gang members
  _attachModel(p) {
    const cm = new CharacterModel(p.modelApp);
    this.game.scene.add(cm.root); p.cm = cm; p.cmOn = true; this.models.add(p);
    const kind = p.app.gun ? (p.gangRole === 'guard' ? 'rifle' : 'pistol') : p.app.knife ? 'knife' : null;
    if (kind) { p.weapon = npcWeapon(kind); p.weaponKind = kind; cm.arms[1].elbow.add(p.weapon); p.weapon.visible = false; }
  }
  _dropModel(p) {
    if (!p.cm) return;
    this.game.scene.remove(p.cm.root);
    p.cm.root.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    p.cm = null; p.cmOn = false; p.weapon = null; this.models.delete(p);
  }
  _models(dt) {
    const g = this.game, cam = g.camera.position;
    this._cmBudget = 3;                                 // build at most three models per frame (no stutter when a crew appears)
    const all = [...this.followers, ...Object.values(this.crews).flatMap((c) => c.members)];
    for (const p of all) {
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (!p.cm && d < 130 && this._cmBudget-- > 0) this._attachModel(p);
      else if (p.cm && d > 150) this._dropModel(p);
      if (!p.cm) continue;
      const cm = p.cm, R = cm.root;
      if (p.state === 'convoy') {
        // riding with the crew: sitting in the car (driver / passenger seat) or on the bike, visible through the glass
        const v = p.carRef; R.visible = !!v; if (!v) continue;
        const seat = v.parts.seat, side = p.seatSide || 1;
        _seat.set(seat.x * side, seat.y, seat.z); v.object.updateMatrixWorld(); v.object.localToWorld(_seat);
        R.position.copy(_seat); R.rotation.order = 'YXZ'; R.rotation.set(0, v.heading, 0);
        if (p.weapon) p.weapon.visible = false;
        cm.animate(dt, { speed: Math.abs(v.speed || 0), mode: v.parts.seatMode || 'drive', steer: 0 });
        continue;
      }
      R.visible = true;
      const down = DOWN.includes(p.state);
      R.position.set(p.x, p.y + (down ? 0.13 : 0), p.z);
      R.rotation.order = 'YXZ';
      R.rotation.set(down ? -Math.PI / 2 : 0, down ? (p.fallYaw ?? p.yaw) + Math.PI : p.yaw, 0);
      const armed = !!p.weapon && !down && (p.gunOut || p.state === 'gangFight' || (p.state === 'copChase' && p.copChase));
      if (p.weapon) p.weapon.visible = armed;
      const aim = armed && p.weaponKind !== 'knife' ? 2 : 0;   // guns held level and pointed ahead (never muzzle-up)
      cm.animate(dt, { speed: down ? 0 : (p.speed || 0), grounded: true, mode: 'foot', aim, hold: aim ? (p.weaponKind === 'rifle' ? 'rifle' : 'pistol') : null, aimPitch: 0, recoil: p.recoilT > 0 ? p.recoilT : 0, stance: !armed && (p.state === 'gangFight' || p.state === 'fight'), draw: 1, reload: 0, holster: 0 });
      if (p.recoilT > 0) p.recoilT -= dt;
    }
  }

  // ------------------------------------------------------------------ the crew on its corners
  _corner(T, k) {
    const o = ROAD_HALF + 2.2, sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1;
    return { x: T.cross[0] * P + sx * o, z: T.cross[1] * P + sz * o };
  }
  _newPed(G, role, i, x, z, yaw, extra = {}) {
    const peds = this.game.peds;
    const app = pedApp(G, role, i);
    const w = role === 'leader' ? 'gun' : role === 'guard' ? 'gun' : ['gun', 'gun', 'knife', 'fists'][i % 4];
    if (w === 'gun') app.gun = true; else if (w === 'knife') app.knife = true; else app.fists = true;
    const p = peds._add({ x, z, state: 'guard', yaw, app, homeSpot: { x, z, yaw, state: 'guard', y: heightAt(x, z) }, keep: true, gangKey: ++this.serial, phone: false, suitcase: false, ...extra });
    p.temper = 'fight'; p.skill = 0.8; p.baseYaw = yaw; p.hp = p.maxHp = role === 'leader' ? 16 : 11; p.gangRole = role; p.gangId = G.id;
    p.modelApp = modelApp(G, role, i);
    return p;
  }
  _spawn(crew) {
    const T = crew.T, G = crew.G = this.owner(T);
    let i = 0;
    [0, 1, 2, 3].forEach((ci) => {
      const lead = ci === 0, c = this._corner(T, ci), n = lead ? 4 : 3;
      for (let k = 0; k < n; k++, i++) {
        const role = lead ? (k === 0 ? 'leader' : 'guard') : 'member';
        const a = (k / n) * Math.PI * 2 + ci, x = c.x + Math.sin(a) * 1.3, z = c.z + Math.cos(a) * 1.3;
        crew.members.push(this._newPed(G, role, i + ci * 3, x, z, Math.atan2(c.x - x, c.z - z)));
      }
    });
    this.game.peds._colors();
    // the crew's rides: cars and motorbikes in the crew colour, parked along the streets around the crossroads
    const cx0 = T.cross[0] * P, cz0 = T.cross[1] * P, kinds = ['muscle', 'suv', 'moto', 'sedan', 'moto', 'muscle', 'moto'];
    kinds.forEach((kind, k) => {
      const side = k % 2 ? 1 : -1, arm = Math.floor(k / 2), along = 14 + arm * 7.5;
      const ns = k % 4 < 2;   // north-south street or east-west street
      const x = ns ? cx0 + side * 5.4 : cx0 + (k % 3 ? 1 : -1) * along, z = ns ? cz0 + (k % 3 ? -1 : 1) * along : cz0 + side * 5.4;
      const v = new Vehicle(kind, G.car, x, z, ns ? 0 : Math.PI / 2, heightAt(x, z));
      v.gang = G.id; v.dmg0 = 0; this.game.scene.add(v.object); this.game.vehicles.adopt(v); v.sync();
      crew.cars.push(v);
    });
    this._signs(crew);
    crew.spawned = true; crew.hostile = 0;
  }
  _signTex(G, T) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#f2c230'; x.fillRect(0, 0, 512, 256);
    x.fillStyle = '#111'; for (let i = -6; i < 30; i++) { x.save(); x.translate(i * 34, 0); x.rotate(0.6); x.fillRect(0, -20, 14, 60); x.restore(); x.save(); x.translate(i * 34, 236); x.rotate(0.6); x.fillRect(0, -20, 14, 60); x.restore(); }
    x.fillStyle = '#f2c230'; x.fillRect(10, 26, 492, 204);
    x.strokeStyle = '#111'; x.lineWidth = 8; x.strokeRect(14, 30, 484, 196);
    x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
    x.font = 'bold 34px Arial, sans-serif'; x.fillText(`⚠ ${T.name} — שטח של`, 256, 76);
    x.font = 'bold 78px Arial, sans-serif'; x.fillStyle = G.signDark; x.direction = 'ltr'; x.fillText(G.name, 256, 146); x.direction = 'rtl';
    x.fillStyle = '#111'; x.font = 'bold 26px Arial, sans-serif'; x.fillText('שטח כנופיה — אל תיגע בכלום', 256, 200);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  _signs(crew) {
    const T = crew.T, G = crew.G, g = this.game, cx = T.cross[0] * P, cz = T.cross[1] * P;
    const key = G.id + T.id;
    const face = new THREE.MeshStandardMaterial({ map: (this._tex ||= {})[key] ||= this._signTex(G, T), roughness: 0.6 });
    const back = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.6, roughness: 0.4 }), post = new THREE.MeshStandardMaterial({ color: 0x6d7378, metalness: 0.7, roughness: 0.35 });
    crew.signs = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const D = T.r - 4, px = -dz, pz = dx;
      const x = cx + dx * D + px * (ROAD_HALF + 1.6), z = cz + dz * D + pz * (ROAD_HALF + 1.6), y = heightAt(x, z);
      const s = new THREE.Group(); s.position.set(x, y, z); s.rotation.y = Math.atan2(dx, dz);
      for (const sx of [-0.95, 0.95]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8), post); m.position.set(sx, 1.45, -0.03); m.castShadow = true; s.add(m); }
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), face); board.position.set(0, 2.25, 0.005); s.add(board);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(2.64, 1.34, 0.03), back); bk.position.set(0, 2.25, -0.012); bk.castShadow = true; s.add(bk);
      g.scene.add(s); crew.signs.push(s);
    }
  }
  _despawn(crew) {
    const peds = this.game.peds;
    for (const p of crew.members) { this._dropModel(p); const i = peds.peds.indexOf(p); if (i >= 0) peds.peds.splice(i, 1); }
    peds._colors();
    for (const v of crew.cars) if (v.driver !== 'player' && !this.convoy.some((c) => c.v === v)) { const L = this.game.vehicles.kept, i = L.indexOf(v); if (i >= 0) this.game.vehicles._dispose(v, L); }
    for (const s of crew.signs || []) { this.game.scene.remove(s); s.traverse((o) => o.geometry?.dispose()); }
    crew.members = []; crew.cars = []; crew.signs = []; crew.spawned = false;
  }

  // ------------------------------------------------------------------ provoking a crew
  provoke(gid, why) {
    if (this.member === gid) {
      // hurting your own people gets you thrown out
      if (why === 'hit' || why === 'shot' || why === 'car') this.leave(true);
      return;
    }
    for (const crew of Object.values(this.crews)) {
      if (!crew.spawned || crew.G.id !== gid) continue;
      const was = crew.hostile > 0;
      crew.hostile = 70;
      if (!was) {
        const loud = crew.members.find((p) => p.state !== 'dead');
        if (loud) this.game.peds.say(loud, ANGRY[Math.floor(Math.random() * ANGRY.length)], 2.4);
        this.game.toast(`⚠ ${crew.G.full} רודפים אחריך!`, 3);
      }
    }
  }
  onHit(ped, how) { if (ped?.gangId) this.provoke(ped.gangId, how); }
  // gunfire on a crew's turf (not your own crew's) makes them come for you
  onShot(x, z) {
    for (const crew of Object.values(this.crews)) {
      if (!crew.spawned || this.member === crew.G.id) continue;
      if (Math.hypot(x - crew.T.cx, z - crew.T.cz) < crew.T.r) this.provoke(crew.G.id, 'shot');
    }
  }

  // ------------------------------------------------------------------ joining / leaving (phone app)
  promptFor() { return null; }   // joining happens in the phone now
  join(id) {
    const g = this.game, G = BY_ID[id], Pl = g.player; if (!G) return;
    if (this.member === id) return;
    if (this.member) this.leave(false, true);
    g.econ.gang = id;
    // you wear their colour and chain while you are in (your own look comes back when you leave)
    g.econ.gangPrev = { topColor: Pl.model.app.topColor, chain: !!Pl.model.app.chain };
    Pl.model.setAppearance({ ...Pl.model.app, topColor: G.top, chain: true });
    for (const crew of Object.values(this.crews)) if (crew.G?.id === id) { crew.hostile = 0; const L = crew.members.find((m) => m.gangRole === 'leader' && m.state !== 'dead'); if (L) g.peds.say(L, 'ברוך הבא למשפחה. מעכשיו אתה איתנו.', 3); }
    // welcome present: a car in the crew colour, parked next to you and registered to you
    const gifts = (g.econ.gangCars ||= {});
    if (!gifts[id]) {
      gifts[id] = true;
      const pos = g.playerPos(), v = g.spawnVehicleNear('muscle', pos.x + 4, pos.z + 4);
      if (v) { v.setColor(G.car); v.rebuildLod?.(); v.owned = true; const ref = { type: 'muscle', color: G.car }; g.econ.ownedCars.push(ref); v.ownedRef = ref; v.gang = id; }
      g.toast(`🤝 הצטרפת ל${G.full}! קיבלת מכונית ${id === 'abc' ? 'ירוקה' : 'כחולה'} של הכנופיה — היא חונה לידך. בטלפון: "קרא לחבר׳ה"`, 5);
    } else g.toast(`🤝 הצטרפת ל${G.full}! בטלפון: "קרא לחבר׳ה" — והם באים אחריך`, 4.5);
    g.save();
  }
  leave(kicked, quiet) {
    const g = this.game, id = this.member; if (!id) return;
    const G = BY_ID[id], Pl = g.player;
    this.dismiss(true);
    g.econ.gang = null;
    if (g.econ.gangPrev) { Pl.model.setAppearance({ ...Pl.model.app, topColor: g.econ.gangPrev.topColor ?? Pl.model.app.topColor, chain: !!g.econ.gangPrev.chain }); g.econ.gangPrev = null; }
    if (kicked) { g.toast(`❌ ${G.full} זרקו אותך מהכנופיה — ועכשיו הם כועסים`, 4); for (const crew of Object.values(this.crews)) if (crew.G?.id === id) crew.hostile = 60; }
    else if (!quiet) g.toast(`✖ יצאת מ${G.full}. אתה שוב אדם רגיל`, 3);
    g.save();
  }

  // ------------------------------------------------------------------ your crew: call, orders, dismiss
  call(n = 8) {
    const g = this.game, id = this.member, G = BY_ID[id]; if (!G) return 'אתה לא בכנופיה';
    this.followers = this.followers.filter((p) => p.state !== 'dead' && this.game.peds.peds.includes(p));
    const need = n - this.followers.length;
    if (need <= 0) { this.order = 'follow'; this._say(COME); return 'החבר׳ה כבר איתך — הם באים אחריך'; }
    const pos = g.playerPos();
    // first the boys standing on your own crew's corners nearby, the rest come from around the block
    const local = Object.values(this.crews).filter((c) => c.spawned && c.G.id === id).flatMap((c) => c.members)
      .filter((p) => p.gangRole !== 'leader' && p.state !== 'dead' && Math.hypot(p.x - pos.x, p.z - pos.z) < 70)
      .sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z)).slice(0, need);
    for (const p of local) { for (const c of Object.values(this.crews)) { const i = c.members.indexOf(p); if (i >= 0) c.members.splice(i, 1); } this._enlist(p); }
    const facing = pos.facing ?? 0;
    for (let k = this.followers.length; k < n; k++) {
      // arrive from behind you (out of sight), already running
      const a = facing + Math.PI + (k - 1.5) * 0.35, x = pos.x + Math.sin(a) * 26, z = pos.z + Math.cos(a) * 26;
      const p = this._newPed(G, k === 0 ? 'guard' : 'member', 40 + this.serial, x, z, facing, {});
      this._enlist(p);
    }
    g.peds._colors();
    this.order = 'follow';
    // the ones who came from around the block arrive in the crew's cars and bikes, driving to you through the streets
    const fresh = this.followers.filter((f) => f.state !== 'dead' && !local.includes(f));
    if (fresh.length && g.player.state === 'foot') this._arrive(fresh);
    this._say(COME);
    return `👥 ${this.followers.length} חברים מ${G.full} בדרך אליך — ${this._rideText(this.followers.length)}`;
  }
  _enlist(p) { p.follower = true; p.state = 'follow'; p.copChase = false; p.gunOut = false; p.hp = p.maxHp = 20; p.temper = 'fight'; this.followers.push(p); }
  attack() {
    if (!this.followers.length) return 'קודם קרא לחבר׳ה';
    const pos = this.game.playerPos(), enemies = this._enemies(pos, 90);
    this.order = 'attack';
    if (!enemies.length) return `🔫 החבר׳ה מוכנים — תוביל אותם לשטח של ${this.enemyOf(this.member).full}`;
    this._say(GO);
    for (const crew of Object.values(this.crews)) if (crew.spawned && crew.G.id !== this.member && enemies.some((e) => crew.members.includes(e))) { crew.hostile = 80; crew.war = true; }
    return `🔫 תוקפים! ${enemies.length} מ${this.enemyOf(this.member).full} בסביבה`;
  }
  hold() { if (!this.followers.length) return 'אין חבר׳ה איתך'; this.order = 'wait'; for (const p of this.followers) if (p.state === 'follow') { p.state = 'guard'; p.homeSpot = { x: p.x, z: p.z, yaw: p.yaw, state: 'guard', y: p.y }; } return '✋ החבר׳ה מחכים כאן'; }
  dismiss(quiet) {
    const peds = this.game.peds, g = this.game;
    for (const c of this.convoy) this._parkConvoy(c);
    this.convoy = []; this.arrivals = [];
    for (const v of this.rides || []) if (v.driver !== 'player') { const L = g.vehicles.kept, i = L.indexOf(v); if (i >= 0) g.vehicles._dispose(v, L); }
    this.rides = [];
    for (const p of this.followers) { this._dropModel(p); const i = peds.peds.indexOf(p); if (i >= 0) peds.peds.splice(i, 1); }
    peds._colors();
    this.followers = []; this.order = 'follow';
    if (!quiet) return 'החבר׳ה הלכו הביתה';
  }
  _say(lines) { const p = this.followers.find((q) => q.state !== 'dead' && q.state !== 'convoy'); if (p) this.game.peds.say(p, lines[Math.floor(Math.random() * lines.length)], 2); }
  // people who are going for you or your crew right now
  _threats(pos, dt) {
    const me = this.member, out = [];
    for (const p of this.game.peds.peds) {
      if (p.aggroT > 0) p.aggroT -= dt;
      if (p.state === 'dead' || p.follower || (p.gangId && p.gangId === me)) continue;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if ((p.aggroT > 0 && d < 60)                                            // hit one of your boys
        || (p.state === 'fight' && d < 14)                                    // brawling with you
        || (p.app?.cop && p.copChase && d < 35)                               // officers coming for you
        || (p.gangId && d < 90 && Object.values(this.crews).some((c) => c.spawned && c.G?.id === p.gangId && c.hostile > 0))) out.push(p);   // a rival crew after you
    }
    return out;
  }
  _enemies(pos, r) {
    const me = this.member; if (!me) return [];
    return Object.values(this.crews).filter((c) => c.spawned && c.G.id !== me).flatMap((c) => c.members).filter((p) => p.state !== 'dead' && Math.hypot(p.x - pos.x, p.z - pos.z) < r);
  }

  // ------------------------------------------------------------------ convoy: the crew drives behind you
  _trail(v) {
    const L = this.trail, last = L[L.length - 1];
    if (last && v.speed < 0.3) return;   // reversing / standing: the road ahead of the convoy does not grow
    if (!last || Math.hypot(v.x - last.x, v.z - last.z) > 0.6) {
      this.trailS += last ? Math.hypot(v.x - last.x, v.z - last.z) : 0;
      L.push({ x: v.x, z: v.z, y: v.y, s: this.trailS });
      if (L.length > 900) L.splice(0, L.length - 900);
    }
  }
  _at(s) {
    const L = this.trail; if (!L.length) return null;
    if (s <= L[0].s) return { ...L[0], h: L.length > 1 ? Math.atan2(L[1].x - L[0].x, L[1].z - L[0].z) : 0 };
    let i = L.length - 1; while (i > 0 && L[i - 1].s > s) i--;
    const a = L[i - 1] || L[0], b = L[i], k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: a.y + (b.y - a.y) * k, h: Math.atan2(b.x - a.x, b.z - a.z) };
  }
  _groups(riders) {
    const bikes = riders.length >= 7 ? 2 : riders.length % 2, out = [];
    const inCars = riders.slice(0, riders.length - bikes);
    for (let i = 0; i < inCars.length; i += 2) out.push({ kind: ['muscle', 'suv', 'sedan', 'muscle'][out.length % 4], riders: inCars.slice(i, i + 2) });
    for (const r of riders.slice(riders.length - bikes)) out.push({ kind: 'moto', riders: [r] });
    return out;
  }
  _rideText(n) { const gr = this._groups(new Array(n).fill(0)), c = gr.filter((x) => x.kind !== 'moto').length, b = gr.length - c; return `${c} מכוניות${b ? ` ו־${b} אופנועים` : ''}`; }
  _ride(kind, x, z, h, y) {
    const g = this.game, G = BY_ID[this.member];
    const v = new Vehicle(kind, G.car, x, z, h, y ?? heightAt(x, z));
    v.gang = G.id; v.convoy = true; v.dmg0 = 0; g.scene.add(v.object); g.vehicles.adopt(v); v.sync();
    return v;
  }
  _seatRiders(grp, v) { grp.riders.forEach((p, i) => { p.state = 'convoy'; p.cmOn = true; p.carRef = v; p.seatSide = i ? -1 : 1; }); }
  // crew arriving: their rides start a block or two away and drive the streets to you, park, and everybody gets out
  // crew arriving: their rides start a block or two away and drive the STREETS to you (right-hand lane, junction to
  // junction), then park in a neat column along the curb of your street - never across sidewalks or through buildings
  _arrive(fresh) {
    const g = this.game, pos = g.playerPos();
    const spot = g.roadsideSpot(pos.x, pos.z);   // the kerb of the street next to you
    if (!spot) { for (const grp of this._groups(fresh)) for (const p of grp.riders) { p.state = 'follow'; } return; }
    const J = this._junction(spot.x, spot.z);
    // along the kerb (the street's own direction), pointing away from the junction; lat = the kerb's sideways offset
    let ux = Math.sin(spot.heading), uz = Math.cos(spot.heading);
    if ((spot.x - J.x) * ux + (spot.z - J.z) * uz < 0) { ux = -ux; uz = -uz; }
    // column of parking places along the kerb (cars 7.5 m apart, bikes 4.5 m), kept clear of the junctions
    const groups = this._groups(fresh), gaps = groups.map((gr) => (gr.kind === 'moto' ? 4.5 : 7.5));
    const total = gaps.reduce((a, b) => a + b, 0), t0 = (spot.x - J.x) * ux + (spot.z - J.z) * uz;
    let front = Math.min(86, Math.max(14 + total, t0 + total / 2));
    const parks = []; let t = front;
    for (const gp of gaps) { parks.push({ x: J.x + ux * t + (spot.x - J.x - ux * t0), z: J.z + uz * t + (spot.z - J.z - uz * t0), h: Math.atan2(ux, uz) }); t -= gp; }
    // where they come from: a kerb spot a block or two away, behind you
    const back = (pos.facing ?? 0) + Math.PI;
    let start = null;
    for (let k = 0; k < 10 && !start; k++) { const a = back + (k - 4.5) * 0.45, d = 120 + k * 8; const s0 = g.roadsideSpot(pos.x + Math.sin(a) * d, pos.z + Math.cos(a) * d); if (s0 && Math.hypot(s0.x - pos.x, s0.z - pos.z) > 70) start = s0; }
    if (!start) start = { x: spot.x - ux * 120, z: spot.z - uz * 120, heading: Math.atan2(ux, uz) };
    const nodes = (g.police?._route?.(start.x, start.z, J.x, J.z) || []).map((n) => ({ x: n.x, z: n.z }));
    if (!nodes.length || Math.hypot(nodes[nodes.length - 1].x - J.x, nodes[nodes.length - 1].z - J.z) > 1) nodes.push({ x: J.x, z: J.z });
    this.arrivals = groups.map((grp, k) => {
      const path = this._lanePath([{ x: start.x, z: start.z }, ...nodes, parks[k]]);
      const v = this._ride(grp.kind, path.pts[0].x, path.pts[0].z, 0);
      this._seatRiders(grp, v);
      return { v, riders: grp.riders, k, path, s: -k * 9, spd: 0, park: parks[k] };
    });
  }
  _junction(x, z) { return { x: Math.round(x / P) * P, z: Math.round(z / P) * P }; }
  // a polyline through the points, shifted into the right-hand lane on every street (corners meet at the lane corner)
  _lanePath(pts) {
    const L = 2.6, out = [];
    const dir = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; };
    const rn = (d) => ({ x: -d.z, z: d.x });
    // drop points that are on top of each other
    const P2 = pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 1.5);
    P2.forEach((p, i) => {
      if (i === 0 || i === P2.length - 1) { out.push({ x: p.x, z: p.z }); return; }
      const din = dir(P2[i - 1], p), dout = dir(p, P2[i + 1]), a = rn(din), b = rn(dout);
      const straight = din.x * dout.x + din.z * dout.z > 0.7;
      out.push(straight ? { x: p.x + a.x * L, z: p.z + a.z * L } : { x: p.x + (a.x + b.x) * L, z: p.z + (a.z + b.z) * L });
    });
    const cum = [0]; for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z));
    return { pts: out, cum, len: cum[cum.length - 1] };
  }
  _pathAt(path, s) {
    const { pts, cum } = path; s = Math.max(0, Math.min(path.len, s));
    let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, k = (s - cum[i - 1]) / seg;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, h: Math.atan2(b.x - a.x, b.z - a.z) };
  }
  _arriving(dt) {
    if (!this.arrivals?.length) return;
    for (const a of this.arrivals) {
      const v = a.v, left = a.path.len - a.s;
      // drive the route: up to 15 m/s, slowing for the corners and to a stop at the parking place
      const want = Math.min(15, Math.max(2.5, left * 0.7));
      a.spd += Math.max(-8 * dt, Math.min(5 * dt, want - a.spd));
      a.s += a.spd * dt;
      const at = this._pathAt(a.path, Math.max(0, a.s)), ahead = this._pathAt(a.path, Math.max(0, a.s) + 4);
      v.x = at.x; v.z = at.z; v.y = heightAt(v.x, v.z, v.y + 1);
      const h = left < 2 ? a.park.h : Math.atan2(ahead.x - at.x, ahead.z - at.z) || at.h;
      let dh = h - v.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); v.heading += dh * Math.min(1, dt * 7);
      v.speed = a.spd; v.vx = v.vz = 0; v.sync(dt);
      for (const p of a.riders) { p.x = v.x; p.z = v.z; p.y = v.y; }
      if (left < 0.4) { v.heading = a.park.h; v.speed = 0; v.sync(dt); this._parkConvoy(a); a.done = true; this._say(['הגענו, אחי', 'אנחנו פה!', 'מה התוכנית?']); }
    }
    this.arrivals = this.arrivals.filter((a) => !a.done);
  }
  _board(pv) {
    // they run to the crew's rides: two to a car, one to a bike; the rides pull in behind your car
    const g = this.game, G = BY_ID[this.member], riders = this.followers.filter((p) => !DOWN.includes(p.state));
    if (!riders.length) return;
    this.trail = []; this.trailS = 0;
    // seed the trail with a straight run-up behind your car so the rides start in line behind you
    const bx = -Math.sin(pv.heading), bz = -Math.cos(pv.heading);
    for (let d = 60; d >= 0; d -= 1) this._trailPush(pv.x + bx * d, pv.z + bz * d, heightAt(pv.x + bx * d, pv.z + bz * d));
    void G;
    const free = (this.rides || []).filter((v) => g.vehicles.kept.includes(v) && v.driver !== 'player' && !v.wrecked && Math.hypot(v.x - pv.x, v.z - pv.z) < 80);
    this._groups(riders).forEach((grp, k) => {
      const at = this._at(this.trailS - 11 - k * 9.5);
      // their own car / bike if it is parked close by (it pulls in behind you), otherwise one comes round the corner
      const i = free.findIndex((v) => (v.typeKey === 'moto') === (grp.kind === 'moto'));
      const v = i >= 0 ? free.splice(i, 1)[0] : this._ride(grp.kind, at.x, at.z, at.h, at.y);
      v.convoy = true; v.x = at.x; v.z = at.z; v.y = at.y; v.heading = at.h; v.speed = 0; v.sync();   // in line behind you
      this._seatRiders(grp, v);
      this.convoy.push({ v, riders: grp.riders, k, s: this.trailS - 11 - k * 9.5 });
    });
    this._say(['עולים!', 'כולם לרכבים!', 'סע, אנחנו מאחוריך']);
  }
  _trailPush(x, z, y) { const L = this.trail, last = L[L.length - 1]; this.trailS += last ? Math.hypot(x - last.x, z - last.z) : 0; L.push({ x, z, y, s: this.trailS }); }
  _drive(dt, pv) {
    this._trail(pv);
    const vmax = Math.abs(pv.speed) + 12;
    // backing up into them: they back up along the road too, keeping their distance
    let back = Infinity;
    if (pv.speed < -0.3) { const L = this.trail; let best = Infinity; for (let i = Math.max(0, L.length - 400); i < L.length; i++) { const d = Math.hypot(L[i].x - pv.x, L[i].z - pv.z); if (d < best) { best = d; back = L[i].s; } } }
    for (const c of this.convoy) {
      // every ride keeps its own place on the road you drove and moves along it - the same corners, the same lane
      const gap = 11 + c.k * 9.5, want = Math.min(this.trailS, back) - gap, prev = c.s ?? want;
      c.s = prev > want ? want : Math.min(want, prev + vmax * dt);   // backs off at once, catches up at a car's pace
      if (want - c.s > 60) c.s = want - 60;   // fell far behind (you raced off): catch up out of sight
      const at = this._at(c.s), ahead = this._at(c.s + 3); if (!at) continue;
      const v = c.v; v.x = at.x; v.z = at.z; v.y = at.y;
      const h = Math.hypot(ahead.x - at.x, ahead.z - at.z) > 0.2 ? Math.atan2(ahead.x - at.x, ahead.z - at.z) : v.heading;
      let dh = h - v.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); v.heading += dh * Math.min(1, dt * 8);
      v.speed = (c.s - prev) / Math.max(dt, 1e-3); v.vx = v.vz = 0;
      v.sync(dt);
      for (const p of c.riders) { p.x = v.x; p.z = v.z; p.y = v.y; }
    }
  }
  _parkConvoy(c) {
    // everybody out: they step out of the doors and the ride stays parked (and is used again next time you drive)
    const v = c.v; v.speed = 0; v.convoy = false;
    if (!(this.rides ||= []).includes(v)) this.rides.push(v);
    c.riders.forEach((p, i) => {
      const side = i % 2 ? 1 : -1, rx = Math.cos(v.heading) * side * 1.5, rz = -Math.sin(v.heading) * side * 1.5;
      p.x = v.x + rx; p.z = v.z + rz; p.y = heightAt(p.x, p.z); p.carRef = null;
      if (p.state === 'convoy') p.state = 'follow';
    });
  }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    this._hook();
    const g = this.game, Pl = g.player, pos = g.playerPos();
    if (g.minimap) g.minimap.zones = this.zones();
    const t = this.territoryAt(pos.x, pos.z);
    if ((t?.id || null) !== this.inside) {
      this.inside = t?.id || null;
      if (t) { const G = this.owner(t); g.toast(this.member === G.id ? `🏠 ${t.name} — השטח של ${G.full}. הבית שלך` : `⚠ נכנסת ל${t.name} — השטח של ${G.full}. אל תיגע בכלום.`, 3.2); }
    }
    for (const crew of Object.values(this.crews)) {
      const T = crew.T, d = Math.hypot(pos.x - T.cx, pos.z - T.cz);
      if (!crew.spawned && d < T.r + 140) this._spawn(crew);
      else if (crew.spawned && d > T.r + 260) this._despawn(crew);
      if (!crew.spawned) continue;
      if (crew.G.id !== this.owner(T).id) { this._despawn(crew); continue; }   // the turf changed hands
      for (const v of crew.cars) {
        if (this.member === crew.G.id || v.convoy) continue;
        if ((Pl.vehicle === v && (Pl.state === 'driving' || Pl.state === 'entering')) || v.damage > v.dmg0 + 4) { v.dmg0 = v.damage; this.provoke(crew.G.id, 'car'); }
      }
      crew.hostile = Math.max(0, crew.hostile - dt * (t === T ? 0.5 : 1.5));
      if (crew.hostile <= 0) crew.war = false;
      this._crew(crew, dt, pos, t === T);
      this._takeover(crew, t === T);
    }
    this._followers(dt, pos);
    this._models(dt);
  }

  _followers(dt, pos) {
    const g = this.game, Pl = g.player, peds = g.peds;
    if (!this.member && this.followers.length) this.dismiss(true);
    this.followers = this.followers.filter((p) => peds.peds.includes(p));
    if (!this.followers.length) { if (this.convoy.length) { for (const c of this.convoy) this._parkConvoy(c); this.convoy = []; } return; }
    const pv = Pl.state === 'driving' ? Pl.vehicle : null;
    const road = pv && !pv.isAir && !pv.isBoat;
    if (this.arrivals?.length) {
      if (road) { for (const a of this.arrivals) this._parkConvoy(a); this.arrivals = []; }   // you drove off: they join the convoy instead
      else { this._arriving(dt); }
    }
    if (road && !this.convoy.length) this._board(pv);
    if (road && this.convoy.length) { this._drive(dt, pv); return; }
    if (!road && this.convoy.length) { for (const c of this.convoy) this._parkConvoy(c); this.convoy = []; this._say(['הגענו!', 'יאללה, יוצאים', 'מה התוכנית?']); }
    // your crew defends you without being told: anyone who goes for you or for them is a target. "Attack!" also sends
    // them at the rival crew when nobody started anything
    const facing = pos.facing ?? 0;
    const threats = this._threats(pos, dt);
    const enemies = this.order === 'attack' ? [...new Set([...this._enemies(pos, 90), ...threats])] : threats;
    for (const crew of Object.values(this.crews)) if (crew.spawned && crew.hostile > 0 && threats.some((t) => crew.members.includes(t))) crew.war = true;   // they started it on their turf: it can be taken
    if (threats.length && !this._defendSaid) { this._defendSaid = true; this._say(['מישהו נוגע בך?!', 'עליהם!', 'אף אחד לא נוגע באח שלנו!']); }
    if (!threats.length) this._defendSaid = false;
    let slot = 0;
    for (const p of this.followers) {
      if (p.state === 'dead' || p.state === 'convoy') continue;   // still riding in (arriving): the ride decides
      if (['flee', 'hide', 'surrender', 'callHelp', 'surprised', 'evade', 'dodge', 'walk', 'idle', 'talk', 'goHome', 'copChase'].includes(p.state)) p.state = 'follow';
      if (DOWN.includes(p.state) || p.state === 'getup') continue;
      // fight: each one picks the nearest rival
      if (enemies.length) {
        if (p.state !== 'gangFight' || !p.target || p.target.state === 'dead') {
          p.target = enemies.reduce((b, e) => (Math.hypot(e.x - p.x, e.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? e : b), enemies[0]);
          p.state = 'gangFight'; p.gunOut = !!p.app.gun;
        }
        this._strike(p, p.target, dt, false);
        continue;
      }
      if (p.state === 'gangFight') { p.state = 'follow'; p.target = null; p.gunOut = false; }
      if (this.order === 'wait') { if (p.state === 'follow') { p.state = 'guard'; p.homeSpot = { x: p.x, z: p.z, yaw: p.yaw, state: 'guard', y: p.y }; } continue; }
      // follow in a loose group behind you
      const row = Math.floor(slot / 2), side = slot % 2 ? 1 : -1; slot++;
      const bx = -Math.sin(facing), bz = -Math.cos(facing), rx = Math.cos(facing), rz = -Math.sin(facing);
      const ox = side * (1.3 + row * 0.5), ob = 2.0 + row * 1.8;
      p.state = 'follow'; p.followTo = { x: pos.x + bx * ob + rx * ox, z: pos.z + bz * ob + rz * ox, yaw: facing };
      if (Math.hypot(p.x - pos.x, p.z - pos.z) > 70) { p.x = p.followTo.x + bx * 20; p.z = p.followTo.z + bz * 20; p.y = heightAt(p.x, p.z); }
    }
  }
  // one gang member attacking another (game damage only): guns shoot from range, the rest hit up close
  _strike(p, target, dt, shooterIsEnemy) {
    const g = this.game, d = Math.hypot(target.x - p.x, target.z - p.z);
    p.atkT = (p.atkT ?? Math.random() * 0.8) - dt;
    if (p.atkT > 0) return;
    if (p.app.gun && p.pose === 'aimGun' && d < 34) {
      p.atkT = 0.7 + Math.random() * 0.6; p.recoilT = 0.12;
      const from = new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.5, p.y + 1.4, p.z + Math.cos(p.yaw) * 0.5);
      const to = new THREE.Vector3(target.x + (Math.random() - 0.5) * 1.4, target.y + 1.1, target.z + (Math.random() - 0.5) * 1.4);
      g.weapons.npcShot(from, to, p.weaponKind === 'rifle' ? 'rifle' : 'pistol', g.audio);
      if (Math.random() < (d < 14 ? 0.5 : 0.32)) g.peds.hit(target, p, shooterIsEnemy ? 1.6 : 3.5);   // your crew is tougher than the rivals
    } else if (!p.app.gun && d < 1.6) {
      p.atkT = 0.85 + Math.random() * 0.4; p.hitT = 0.25;
      g.peds.hit(target, p, p.app.knife ? 3 : 2); g.audio.impact?.(2);
    }
  }

  _crew(crew, dt, pos, onTurf) {
    const g = this.game, Pl = g.player, peds = g.peds, hostile = crew.hostile > 0, mine = this.member === crew.G.id;
    crew.shootT = (crew.shootT || 0) - dt;
    const myBoys = this.followers.filter((f) => f.state !== 'dead' && f.state !== 'convoy');
    for (const p of crew.members) {
      if (p.state === 'dead') continue;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (['flee', 'hide', 'surrender', 'callHelp', 'surprised', 'evade', 'dodge'].includes(p.state)) { p.state = hostile ? 'copChase' : 'goHome'; p.timer = 0; }
      if (hostile && d < 90) {
        // the nearest threat: one of your boys if he is closer than you, otherwise you
        const boy = myBoys.reduce((b, f) => (!b || Math.hypot(f.x - p.x, f.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? f : b), null);
        if (boy && Math.hypot(boy.x - p.x, boy.z - p.z) < d - 2) {
          if (!DOWN.includes(p.state) && p.state !== 'getup') { peds._release(p); p.state = 'gangFight'; p.target = boy; p.gunOut = !!p.app.gun; p.copChase = false; }
          this._strike(p, boy, dt, true);
          continue;
        }
        if (!['copChase', 'fall', 'knocked', 'getup', 'thrown', 'down', 'dazed'].includes(p.state)) { peds._release(p); p.seat = null; p.state = 'copChase'; }
        p.copChase = true; p.chaseTo = null; p.gunOut = !!p.app.gun;
        if ((p.app.knife || p.app.fists) && d < 1.6 && Pl.state === 'foot' && p.state === 'copChase') {
          p.stabT = (p.stabT || 0) - dt;
          if (p.stabT <= 0) { p.stabT = 0.9 + Math.random() * 0.4; g.hurt(p.app.knife ? 7 : 4, crew.G.full); g.audio.impact?.(p.app.knife ? 1.5 : 2.5); g.rig.shake = Math.max(g.rig.shake, 0.12); p.hitT = 0.25; }
        }
        if (p.app.gun && p.pose === 'aimGun' && crew.shootT <= 0 && d < 34 && (g.police._los?.(p.x, p.z, pos.x, pos.z) ?? true)) {
          crew.shootT = 0.55 + Math.random() * 0.5; p.recoilT = 0.12;
          const from = new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.5, p.y + 1.4, p.z + Math.cos(p.yaw) * 0.5);
          const to = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2.2, pos.y + 1.1, pos.z + (Math.random() - 0.5) * 2.2);
          g.weapons.npcShot(from, to, 'pistol', g.audio);
          if (Math.random() < (d < 12 ? 0.45 : 0.3)) g.hurt(Pl.state === 'driving' ? 3 : 6, crew.G.full);
        }
        if (Math.random() < dt * 0.15) peds.say(p, ANGRY[Math.floor(Math.random() * ANGRY.length)], 1.6);
      } else {
        if (p.state === 'copChase' || p.state === 'gangFight') { p.copChase = false; p.gunOut = false; p.target = null; p.state = 'goHome'; p.timer = 0; }
        if (p.state === 'fight' && !hostile) { p.state = 'goHome'; p.timer = 0; }
        // idle: they only stare and talk - nobody is attacked just for walking past
        if (p.state === 'guard' && (d >= 7 || Pl.state !== 'foot') && p.baseYaw !== undefined) p.homeSpot.yaw = p.baseYaw;
        if (p.state === 'guard' && d < 7 && Pl.state === 'foot') {
          p.homeSpot.yaw = Math.atan2(pos.x - p.x, pos.z - p.z);
          if (!p.sayT || p.sayT <= 0) { p.toldT = (p.toldT || 0) - dt; if (p.toldT <= 0) { p.toldT = 9 + Math.random() * 6; const L = mine ? HELLO : WARN; peds.say(p, L[Math.floor(Math.random() * L.length)], 2); } }
        }
      }
    }
  }
  // wipe out the rival crew on its own turf (three or fewer left standing - they run) and the neighbourhood is yours
  _takeover(crew, onTurf) {
    const me = this.member; if (!me || crew.G.id === me || !onTurf || !crew.war) return;
    const alive = crew.members.filter((p) => p.state !== 'dead');
    if (alive.length > 3) return;
    const g = this.game, G = BY_ID[me];
    (g.econ.turf ||= {})[crew.T.id] = me;
    for (const p of alive) { p.state = 'flee'; p.timer = 12; p.fleeFrom = [crew.T.cx, crew.T.cz]; }
    g.toast(`🏴 השתלטתם על ${crew.T.name}! מעכשיו זה השטח של ${G.full}`, 5);
    this._say(['השטח שלנו!', 'כבוד, אחי!', 'עכשיו הם יודעים מי אנחנו']);
    this.order = 'follow'; crew.war = false; crew.hostile = 0;
    g.audio.coin?.(); g.save();
    // the old crew's people and signs go; next time you come by, your crew stands on the corners
    setTimeout(() => { if (crew.spawned) this._despawn(crew); }, 6000);
  }

  // gang turf on the minimap and the big map (crew colour, brighter if it is yours)
  zones() {
    return TURFS.map((T) => { const G = this.owner(T); return { x: T.cx, z: T.cz, r: T.r, name: `${T.name} — ${G.full}`, fill: this.member === G.id ? G.fillMine : G.fill, stroke: G.stroke }; });
  }
}
