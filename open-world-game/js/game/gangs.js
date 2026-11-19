// Gang territories: two small neighbourhoods at the edge of the city (one crossroads each), run by fictional street
// gangs. Yellow warning signs stand on every road into them. Members hang out on the corners in green, faces covered
// with balaclavas or bandanas, armed only with pistols, knives or their fists; a leader with bodyguards; their cars and
// a motorbike parked nearby. Walk around freely - they only stare and talk. They come for you only if you hurt one of
// them, shoot on their turf (at them or their houses), or steal / damage their car or bike: the pistols stop and
// shoot, the others charge (game damage only, no blood). Walk up to the leader to join the gang, and again to leave.
import * as THREE from 'three';
import { P, ROAD_HALF } from '../world/layout.js';
import { heightAt } from '../world/terrain.js';
import { Vehicle } from '../vehicles/vehicle.js';

export const GANGS = [
  // two small, out-of-the-way neighbourhoods at the edge of the city (one crossroads each), nowhere else
  { id: 'snakes', name: 'הנחשים הירוקים', short: 'הנחשים', color: 0x2f9e44, dark: 0x1d4d27, accent: 0x111111, car: 0x1f7a35, mask: 0x1c3a22, cx: 100, cz: 100, r: 85, cross: [1, 1] },
  { id: 'harbor', name: 'חבורת הנמל', short: 'הנמל', color: 0x56702f, dark: 0x2e3b1a, accent: 0x1c1c1c, car: 0x3b4d22, mask: 0x161616, cx: 100, cz: 900, r: 85, cross: [1, 9] },
];
const BY_ID = Object.fromEntries(GANGS.map((g) => [g.id, g]));
const WARN = ['אתה לא שייך לפה', 'תמשיך ללכת', 'מה אתה מסתכל?', 'זה השטח שלנו', 'אל תעשה שטויות', 'לך מפה'];
const ANGRY = ['תפסו אותו!', 'הוא נגע בנו!', 'עכשיו אתה גמור!', 'אל תיתנו לו לברוח!', 'כולם עליו!'];
const HELLO = ['אחי!', 'מה המצב?', 'הבית שלך פה', 'כבוד', 'אנחנו איתך'];

export class Gangs {
  constructor(game) {
    this.game = game; this.crews = {};
    for (const G of GANGS) this.crews[G.id] = { G, members: [], cars: [], hostile: 0, warned: 0, spawned: false };
    this.inside = null; this.serial = 0;
  }
  // listen to the people system: hitting or running over a gang member provokes his crew
  _hook() {
    if (this._hooked) return; this._hooked = true;
    const peds = this.game.peds, P = this.game.player;
    const hit = peds.hit.bind(peds), run = peds._runOver.bind(peds);
    peds.hit = (p, src, dmg, kick) => { const r = hit(p, src, dmg, kick); if (r && src === P && p.app?.gang) this.provoke(p.app.gang, 'hit'); return r; };
    peds._runOver = (p, v, sp, ctx) => { run(p, v, sp, ctx); if (v.driver === 'player' && p.app?.gang) this.provoke(p.app.gang, 'car'); };
  }
  get member() { return this.game.econ.gang || null; }
  info(id) { return BY_ID[id]; }
  territoryAt(x, z) { return GANGS.find((G) => Math.hypot(x - G.cx, z - G.cz) < G.r) || null; }

  // ------------------------------------------------------------------ spawning the crew near the player
  _corner(G, [ix, iz], k) {
    // a sidewalk corner of an intersection inside the territory (k picks which of the four corners)
    const o = ROAD_HALF + 2.2, sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1;
    return { x: ix * P + sx * o, z: iz * P + sz * o };
  }
  _app(G, role, i) {
    const skins = [0xe9b98f, 0xc98e62, 0xa86f48, 0x7b4a2c, 0x4f2f1d];
    const a = { skin: skins[(i * 3 + role.length) % skins.length], hair: 0x1b1410, long: false, bald: i % 3 === 0, h: 1.02 + (i % 5) * 0.025, w: 1.02 + (i % 4) * 0.04,
      shirt: i % 2 ? G.color : G.dark, pants: i % 3 === 1 ? 0xc8c8c8 : G.accent, shoes: i % 2 ? 0xf2f2f2 : 0x1d1d1f, gang: G.id };
    if (role === 'leader') Object.assign(a, { shirt: 0xd9d9d6, pants: 0xd9d9d6, shoes: 0xf2f2f2, vestColor: 0x161616, capColor: G.color, gun: true, h: 1.1, w: 1.12 });
    else {
      // street criminals: faces covered (balaclava in the crew colour or black, or a bandana), pistol / knife / fists only
      if (i % 4 === 3) a.bandana = G.color; else { a.mask = true; a.maskColor = i % 2 ? G.mask : 0x141414; }
      if (role === 'guard') { a.vestColor = 0x161616; a.gun = true; }
      else { const w = i % 3; if (w === 0) a.gun = true; else if (w === 1) a.knife = true; else a.fists = true; }
      if (i % 4 === 1 && !a.mask) a.capColor = G.color;
      if (i % 5 === 2) a.vestColor = 0x161616;
    }
    return a;
  }
  _spawn(crew) {
    const G = crew.G, peds = this.game.peds;
    let i = 0;
    [0, 1, 2, 3].forEach((ci) => {
      const lead = ci === 0;
      const c = this._corner(G, G.cross, ci), n = lead ? 4 : 3;
      for (let k = 0; k < n; k++, i++) {
        const role = lead ? (k === 0 ? 'leader' : 'guard') : 'member';
        const a = (k / n) * Math.PI * 2 + ci, x = c.x + Math.sin(a) * 1.3, z = c.z + Math.cos(a) * 1.3;
        const yaw = Math.atan2(c.x - x, c.z - z);
        const p = peds._add({ x, z, state: 'guard', yaw, app: this._app(G, role, i + ci), homeSpot: { x, z, yaw, state: 'guard', y: heightAt(x, z) }, keep: true, gangKey: ++this.serial, phone: false, suitcase: false });
        p.temper = 'fight'; p.skill = 0.8; p.baseYaw = yaw; p.hp = p.maxHp = role === 'leader' ? 16 : 11; p.gangRole = role; p.gangId = G.id;
        crew.members.push(p);
      }
    });
    peds._colors();
    // their cars parked along the street by the leader's corner
    const lc = this._corner(G, G.cross, 0), [cx0, cz0] = [G.cross[0] * P, G.cross[1] * P];
    for (let k = 0; k < 3; k++) {
      const x = cx0 + 5.4 * (lc.x > cx0 ? 1 : -1), z = lc.z + (lc.z > cz0 ? 1 : -1) * (8 + k * 6.5);
      const v = new Vehicle(['suv', 'muscle', 'moto'][k], k === 2 ? 0x111111 : G.car, x, z, 0, heightAt(x, z));
      v.gang = G.id; v.dmg0 = 0; this.game.scene.add(v.object); this.game.vehicles.adopt(v); v.sync();
      crew.cars.push(v);
    }
    this._signs(crew);
    crew.spawned = true;
  }
  // warning signs on every road into the neighbourhood, facing the people coming in
  _signTex(G) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#f2c230'; x.fillRect(0, 0, 512, 256);
    x.fillStyle = '#111'; for (let i = -6; i < 30; i++) { x.save(); x.translate(i * 34, 0); x.rotate(0.6); x.fillRect(0, -20, 14, 60); x.restore(); x.save(); x.translate(i * 34, 236); x.rotate(0.6); x.fillRect(0, -20, 14, 60); x.restore(); }
    x.fillStyle = '#f2c230'; x.fillRect(10, 26, 492, 204);
    x.strokeStyle = '#111'; x.lineWidth = 8; x.strokeRect(14, 30, 484, 196);
    x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
    x.font = 'bold 40px Arial, sans-serif'; x.fillText('⚠ נכנסים לשכונה של', 256, 78);
    x.font = 'bold 58px Arial, sans-serif'; x.fillStyle = '#' + new THREE.Color(G.dark).getHexString(); x.fillText(G.name, 256, 142);
    x.fillStyle = '#111'; x.font = 'bold 26px Arial, sans-serif'; x.fillText('שטח כנופיה — אל תיגע בכלום', 256, 196);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  _signs(crew) {
    const G = crew.G, g = this.game, cx = G.cross[0] * P, cz = G.cross[1] * P;
    const face = new THREE.MeshStandardMaterial({ map: (this._tex ||= {})[G.id] ||= this._signTex(G), roughness: 0.6 });
    const back = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.6, roughness: 0.4 }), post = new THREE.MeshStandardMaterial({ color: 0x6d7378, metalness: 0.7, roughness: 0.35 });
    crew.signs = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const D = G.r - 4, px = -dz, pz = dx;                       // right-hand side for someone driving in (towards the centre)
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
    for (const p of crew.members) { const i = peds.peds.indexOf(p); if (i >= 0) peds.peds.splice(i, 1); }
    peds._colors();
    for (const v of crew.cars) if (v.driver !== 'player') { const L = this.game.vehicles.kept, i = L.indexOf(v); if (i >= 0) this.game.vehicles._dispose(v, L); }
    for (const s of crew.signs || []) { this.game.scene.remove(s); s.traverse((o) => o.geometry?.dispose()); }
    crew.members = []; crew.cars = []; crew.signs = []; crew.spawned = false;
  }

  // ------------------------------------------------------------------ provoking the crew
  provoke(id, why) {
    const crew = this.crews[id]; if (!crew) return;
    if (this.member === id) {
      // hitting your own people gets you thrown out
      if (why === 'hit' || why === 'shot' || why === 'car') { this.leave(true); } else return;
    }
    const was = crew.hostile > 0;
    crew.hostile = 70;
    if (!was) {
      const loud = crew.members.find((p) => p.state !== 'dead');
      if (loud) this.game.peds.say(loud, ANGRY[Math.floor(Math.random() * ANGRY.length)], 2.4);
      this.game.toast(`⚠ ${crew.G.name} רודפים אחריך!`, 3);
    }
  }
  // called when the player hits / shoots a person (any weapon)
  onHit(ped, how) { if (ped?.app?.gang) this.provoke(ped.app.gang, how); }
  // gunfire: shooting on their turf near them makes them come for you
  onShot(x, z) {
    for (const crew of Object.values(this.crews)) {
      if (!crew.spawned || this.member === crew.G.id) continue;
      if (Math.hypot(x - crew.G.cx, z - crew.G.cz) < crew.G.r) this.provoke(crew.G.id, 'shot');
    }
  }

  // ------------------------------------------------------------------ joining / leaving at the leader
  promptFor(p) {
    if (p.state !== 'foot') return null;
    for (const crew of Object.values(this.crews)) {
      const L = crew.members.find((m) => m.gangRole === 'leader' && m.state !== 'dead');
      if (!L || crew.hostile > 0 || Math.hypot(L.x - p.x, L.z - p.z) > 2.6) continue;
      const G = crew.G, me = this.member;
      if (me === G.id) return { text: `🚪 עזוב את ${G.name}`, action: () => this.leave(false) };
      if (me) return { text: `אתה כבר ב${BY_ID[me].name} — עזוב קודם`, action: () => {} };
      return { text: `🤝 הצטרף ל${G.name}`, action: () => this.join(G.id) };
    }
    return null;
  }
  join(id) {
    const g = this.game, G = BY_ID[id], P = g.player;
    g.econ.gang = id;
    // the crew's colours: you get their green shirt (your old look comes back when you leave)
    g.econ.gangPrev = { top: P.model.app.top, topColor: P.model.app.topColor };
    P.model.setAppearance({ ...P.model.app, topColor: G.id === 'snakes' ? 4 : 11 });
    const L = this.crews[id].members.find((m) => m.gangRole === 'leader'); if (L) g.peds.say(L, 'ברוך הבא למשפחה. מעכשיו אתה איתנו.', 3);
    g.toast(`🤝 הצטרפת ל${G.name}! החבר׳ה שלהם הם החבר׳ה שלך — והיריבים כבר לא אוהבים אותך`, 4.5);
    g.save();
  }
  leave(kicked) {
    const g = this.game, id = this.member; if (!id) return;
    const G = BY_ID[id], P = g.player;
    g.econ.gang = null;
    if (g.econ.gangPrev) { P.model.setAppearance({ ...P.model.app, ...g.econ.gangPrev }); g.econ.gangPrev = null; }
    if (kicked) { g.toast(`❌ ${G.name} זרקו אותך מהחבורה — ועכשיו הם כועסים`, 4); this.crews[id].hostile = 60; }
    else { const L = this.crews[id].members.find((m) => m.gangRole === 'leader'); if (L) g.peds.say(L, 'בסדר. רק אל תחזור לבקש טובות.', 3); g.toast(`יצאת מ${G.name}`, 3); }
    g.save();
  }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    this._hook();
    this.game.minimap.zones = this.zones();
    const g = this.game, P = g.player, pos = g.playerPos();
    // territory banner + map
    const t = this.territoryAt(pos.x, pos.z);
    if ((t?.id || null) !== this.inside) {
      this.inside = t?.id || null;
      if (t) g.toast(this.member === t.id ? `🏠 השטח של ${t.name} — הבית שלך` : `⚠ נכנסת לשטח של ${t.name}. אל תיגע בכלום.`, 3.2);
    }
    for (const crew of Object.values(this.crews)) {
      const G = crew.G, d = Math.hypot(pos.x - G.cx, pos.z - G.cz);
      if (!crew.spawned && d < G.r + 140) this._spawn(crew);
      else if (crew.spawned && d > G.r + 260) this._despawn(crew);
      if (!crew.spawned) continue;
      // touching their cars (getting in, or damaging them)
      for (const v of crew.cars) {
        if (this.member === G.id) continue;
        if ((P.vehicle === v && (P.state === 'driving' || P.state === 'entering')) || v.damage > v.dmg0 + 4) { v.dmg0 = v.damage; this.provoke(G.id, 'car'); }
      }
      crew.hostile = Math.max(0, crew.hostile - dt * (t === G ? 0.5 : 1.5));
      this._crew(crew, dt, pos, t === G);
    }
  }

  _crew(crew, dt, pos, onTurf) {
    const g = this.game, P = g.player, peds = g.peds, hostile = crew.hostile > 0, mine = this.member === crew.G.id;
    crew.shootT = (crew.shootT || 0) - dt;
    for (const p of crew.members) {
      if (p.state === 'dead') continue;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      // they never run off scared like ordinary people
      if (['flee', 'hide', 'surrender', 'callHelp', 'surprised', 'evade', 'dodge'].includes(p.state)) { p.state = hostile ? 'copChase' : 'goHome'; p.timer = 0; }
      if (hostile && d < 90) {
        if (!['copChase', 'fall', 'knocked', 'getup', 'thrown', 'down', 'dazed'].includes(p.state)) { peds._release(p); p.seat = null; p.state = 'copChase'; }
        p.copChase = true; p.chaseTo = null; p.gunOut = !!p.app.gun;
        // knives: close in and slash (game damage, no blood)
        if ((p.app.knife || p.app.fists) && d < 1.6 && P.state === 'foot' && p.state === 'copChase') {
          p.stabT = (p.stabT || 0) - dt;
          if (p.stabT <= 0) { p.stabT = 0.9 + Math.random() * 0.4; g.hurt(p.app.knife ? 7 : 4, crew.G.name); g.audio.impact?.(p.app.knife ? 1.5 : 2.5); g.rig.shake = Math.max(g.rig.shake, 0.12); p.hitT = 0.25; }
        }
        // pistols: stop, aim and fire when they can see you
        if (p.app.gun && p.pose === 'aimGun' && crew.shootT <= 0 && d < 34 && (g.police._los?.(p.x, p.z, pos.x, pos.z) ?? true)) {
          crew.shootT = 0.55 + Math.random() * 0.5;
          const from = new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.5, p.y + 1.4, p.z + Math.cos(p.yaw) * 0.5);
          const to = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2.2, pos.y + 1.1, pos.z + (Math.random() - 0.5) * 2.2);
          g.weapons._tracer(from, to, 0xffd9a0); g.audio.gunshot?.('pistol');
          if (Math.random() < (d < 12 ? 0.45 : 0.3)) g.hurt(P.state === 'driving' ? 3 : 6, crew.G.name);
        }
        if (Math.random() < dt * 0.15) peds.say(p, ANGRY[Math.floor(Math.random() * ANGRY.length)], 1.6);
      } else {
        if (p.state === 'copChase') { p.copChase = false; p.gunOut = false; p.state = 'goHome'; p.timer = 0; }
        if (p.state === 'fight' && !hostile) { p.state = 'goHome'; p.timer = 0; }
        // idle: stare at you when you come close; warn strangers, greet members
        if (p.state === 'guard' && (d >= 7 || P.state !== 'foot') && p.baseYaw !== undefined) p.homeSpot.yaw = p.baseYaw;
        if (p.state === 'guard' && d < 7 && P.state === 'foot') {
          p.homeSpot.yaw = Math.atan2(pos.x - p.x, pos.z - p.z);   // they turn and watch you
          if (!p.sayT || p.sayT <= 0) { p.toldT = (p.toldT || 0) - dt; if (p.toldT <= 0) { p.toldT = 9 + Math.random() * 6; peds.say(p, (mine ? HELLO : WARN)[Math.floor(Math.random() * 6) % (mine ? HELLO.length : WARN.length)], 2); } }
        }
      }
    }
  }

  // gang turf on the minimap and the big map (green circles, brighter if it is your gang)
  zones() { return GANGS.map((G) => ({ x: G.cx, z: G.cz, r: G.r, name: `שטח ${G.name}`, fill: this.member === G.id ? 'rgba(60,200,90,0.18)' : 'rgba(30,140,50,0.22)', stroke: 'rgba(20,100,35,0.85)' })); }
}
