// Fictional bank heists (game mechanics only, no real-world methods, no graphic violence).
// Four banks, four different missions: stages with objectives, a big vault door with its own opening animation
// (a code-lock opening or a cinematic "movie-style" blast), an alarm with flashing lights and a siren, smoke,
// people reacting (calling for help, hiding, running), a police response and an escape. Success pays the bank's
// loot into the player's account (shown in the phone) with a money animation; everything is saved.
import * as THREE from 'three';
import { cellData } from '../world/worldGen.js';
import { BANKS, VILLA } from '../world/layout.js';
import { interiorSpec } from '../world/interiors.js';
import { fmt } from './economy.js';

const COOLDOWN_MS = 10 * 60 * 1000;      // a robbed bank re-opens its vault 10 minutes later

// stage types: hold (stay at a spot for a few seconds), loot (collect every pile), unlock (vault opens with a code /
// key), blast (place a fictional charge, step back, cinematic explosion), escape (reach a place / lose the police)
export const HEISTS = {
  central: {
    title: 'השוד הגדול — הבנק המרכזי', stars: 3,
    intro: 'תוכנית: להשבית את המצלמות בקומת ההנהלה, להשיג את קוד הכספת מהמשרד של המנהל, לפתוח את הכספת בשקט — ולברוח הביתה.',
    stages: [
      { type: 'hold', text: 'עלה במעלית לקומת ההנהלה והשבת את מצלמות האבטחה', where: 'security', dur: 3.5, busy: 'משבית את המצלמות', done: 'המצלמות כבויות — אף אחד לא רואה אותך.' },
      { type: 'vault', text: 'פתח את הכספת — קח את המפתח מהמאבטח או מהפקיד, או פוצץ את הדלת', dur: 2.4, done: 'הכספת פתוחה!' },
      { type: 'loot', text: 'אסוף את השלל מהכספת', from: 'vault', dur: 2.6 },
    ],
  },
  harbor: {
    title: 'שוד בנק הנמל', stars: 2,
    intro: 'תוכנית: לקחת את כרטיס המפתח מאחד הקופאים, לפוצץ את דלת הכספת בפיצוץ קולנועי, לאסוף ולברוח לסירה שמחכה בחוף.',
    stages: [
      { type: 'vault', text: 'פתח את הכספת — קח את המפתח מהמאבטח או מהפקיד, או פוצץ את הדלת', dur: 2.4, done: 'הכספת פתוחה!' },
      { type: 'loot', text: 'אסוף את השלל מהכספת', from: 'vault', dur: 3 },
    ],
  },
  local: {
    title: 'שוד מהיר — בנק השכונה', stars: 2, timeLimit: 110,
    intro: 'תוכנית: היכנס, צא. האזעקה מתחילה מיד — יש לך פחות משתי דקות לרוקן את הקופות ואת הכספת הקטנה, ואז להיעלם מהמשטרה.',
    alarmAtStart: true,
    stages: [
      { type: 'loot', text: 'רוקן את מגירות הקופאים', from: 'drawers', dur: 1.4, share: 0.35 },
      { type: 'vault', text: 'פתח את הכספת — קח את המפתח מהמאבטח או מהפקיד, או פוצץ את הדלת', dur: 2.4, done: 'הכספת פתוחה!' },
      { type: 'loot', text: 'אסוף את השלל מהכספת', from: 'vault', dur: 2.2, share: 0.65 },
    ],
  },
  gold: {
    title: 'מבצע מגדל הזהב', stars: 4,
    intro: 'השוד הגדול מכולם: להשבית את מרכז האבטחה בקומה 1, לעלות לקומת האוצר, לפוצץ את הכספת הענקית, לאסוף זהב ומזומן ולברוח לנמל.',
    stages: [
      { type: 'hold', text: 'עלה במעלית לקומת האבטחה והשבת את המערכות', where: 'security', dur: 4, busy: 'משבית את מערכות האבטחה', done: 'מערכות האבטחה כבויות. עכשיו לקומת האוצר.' },
      { type: 'vault', text: 'פתח את הכספת — קח את המפתח מהמאבטח או מהפקיד, או פוצץ את הדלת', dur: 2.4, done: 'הכספת פתוחה!' },
      { type: 'loot', text: 'אסוף את הזהב והמזומן', from: 'vault', dur: 3.2 },
    ],
  },
};

const fmtUSD = (n) => fmt(n);
const _v = new THREE.Vector3();

export class Heists {
  constructor(game) {
    this.game = game;
    this.active = null;               // { id, b, stage, loot, busy, t, timer }
    this.doors = {};                  // bankId -> { open, mode, t, wheel }
    this.gates = {};                  // bankId -> { locked, open } - the bar gate inside the vault
    this.taken = {};                  // bankId -> Set of loot keys already in your bag
    this.fx = [];
    this._buildHud();
  }
  get records() { return (this.game.econ.heists ||= {}); }

  // ------------------------------------------------------------------ world lookups
  bankBuilding(id) {
    const k = BANKS.find((q) => q.id === id), [bx, bz] = k.key.split(',').map(Number);
    return cellData(bx, bz).buildings.find((q) => q.bank?.id === id) || null;
  }
  info(id) { const b = this.bankBuilding(id); return b && interiorSpec(b).bank; }
  door(id) { const b = this.bankBuilding(id); return b && { x: b.door.x + (b.door.x - b.x) * 0.1, z: b.door.z + (b.door.z - b.z) * 0.1, name: BANKS.find((q) => q.id === id).name }; }
  status(id) {
    const r = this.records[id] || {}, left = r.last ? COOLDOWN_MS - (Date.now() - r.last) : 0;
    if (this.active?.id === id) return { state: 'active', text: 'שוד פעיל' };
    if (left > 0) return { state: 'cooldown', text: `הכספת סגורה עוד ${Math.ceil(left / 60000)} דק׳`, left };
    return { state: 'ready', text: 'זמין לשוד' };
  }

  // ------------------------------------------------------------------ prompts (E / "פעולה")
  promptFor(player) {
    if (player.state !== 'foot') return null;
    const near = (pt, y, r = 1.8) => pt && Math.hypot(player.x - pt[0], player.z - pt[1]) < r && Math.abs(player.y - y) < 1.4;
    if (!this.active) return null;     // no "start" button: the robbery begins when you actually rob the bank
    const A = this.active, S = this.stage(), I = this.info(A.id);
    if (!S || A.busy || A.wait) return null;
    if (S.type === 'vault' && !A.hasKey) {
      // the key on the floor next to the guard you took down: a "take" button
      const k = A.keyObj;
      if (k && near([k.position.x, k.position.z], k.userData.y0 ?? k.position.y, 1.6)) return { text: '🔑 קח את המפתח', action: () => { this.game.scene.remove(k); A.keyObj = null; A.hasKey = true; this.game.audio.mech?.('in'); this.game.toast('🔑 יש לך את מפתח הכספת! גש לדלת הכספת ולחץ ״פתח״', 3); } };
      // the key holder gave up (hands raised): take the key off him
      const h = (A.keyHolders || []).find((q) => q.state === 'surrender' && near([q.x, q.z], q.y, 1.8)) || A.keyHolder;
      if (h && h.state === 'surrender' && near([h.x, h.z], h.y, 1.8)) return { text: '🔑 קח ממנו את מפתח הכספת', action: () => { A.hasKey = true; this.game.peds.say(h, 'קח, קח! רק אל תירה', 2.2); this.game.toast('🔑 יש לך את מפתח הכספת!', 2.5); this.game.audio.mech?.('in'); } };
    }
    const Gt = this.gates[A.id], gate = I?.vault?.gate;
    if (S.type === 'loot' && S.from === 'vault' && gate && Gt?.locked) {
      if (near(gate.pad, gate.y, 1.6)) return { text: '🔢 פרוץ את דלת הסורגים (קוד)', action: () => this._codeGame(A.id) };
      return null;                     // the money is behind the bars until you crack the code
    }
    for (const t of this.targets()) {
      if (t.taken) continue;
      // the vault: with the key there is an "open" button; without it you blow the door yourself (throw / stick a
      // grenade or a sticky bomb on it) - no button for that
      if (S.type === 'vault') { if (A.hasKey && near(t.pt, t.y, 1.9)) return { text: '🔑 פתח עם מפתח', action: () => { A.busy = { t: 0, dur: S.dur, target: t, mode: 'key' }; } }; continue; }
      if (near(t.pt, t.y, 1.9)) return { text: S.type === 'loot' ? 'אסוף את השלל' : S.busy || S.text, action: () => { A.busy = { t: 0, dur: S.dur, target: t }; } };
    }
    return null;
  }

  stage() { const A = this.active; return A && HEISTS[A.id].stages[A.stage]; }
  // the spots the current stage needs (each with pt [x,z] and y)
  targets() {
    const A = this.active, S = this.stage(), I = this.info(A.id);
    if (!S || !I) return [];
    if (A.targets) return A.targets;
    let list = [];
    if (S.type === 'hold') list = S.where === 'drawer' ? [I.drawers[0]] : [I[S.where]];
    else if (S.type === 'unlock' || S.type === 'blast' || S.type === 'vault') list = [{ pt: I.vault.outside, y: I.vault.y }];
    else if (S.type === 'loot') list = (S.from === 'drawers' ? I.drawers : I.vault.loot).map((q, i) => ({ ...q, key: (S.from === 'drawers' ? 'd' : 'v') + i }));
    A.targets = list.filter(Boolean).map((q) => ({ ...q, taken: false }));
    return A.targets;
  }

  // ------------------------------------------------------------------ flow
  start(id, loud = false) {
    const H = HEISTS[id];
    this.active = { id, b: this.bankBuilding(id), stage: 0, loot: 0, busy: null, targets: null, timer: H.timeLimit || null, alarm: false, holdup: loud };
    this.doors[id] = { open: 0, mode: 'closed', t: 0 };
    this.gates[id] = { locked: true, open: 0 };
    this.taken[id] = new Set();
    this.game.toast(loud ? `🔫 שוד! ${H.stages[0].text}` : `🤫 שוד שקט — ${H.stages[0].text}`, 4);
    if (H.alarmAtStart || loud) this.alarm(loud ? 'holdup' : 'start');
    this._gps();
  }
  // the robbery begins when you rob: draw / use a weapon inside the bank (a loud hold-up), or slip behind the teller
  // counter, into the back rooms or upstairs (a quiet job)
  _autoStart() {
    const g = this.game, P = g.player;
    if (P.state !== 'foot' || g.police.level > 0) return;
    for (const L of g.interiors.loaded.values()) {
      const I = L.spec.bank, b = L.b; if (!I?.frame) continue;
      if (Math.abs(P.x - b.x) > b.w / 2 || Math.abs(P.z - b.z) > b.d / 2) continue;
      if (this.status(b.bank.id).state !== 'ready') return;
      const Fr = I.frame, dx = P.x - Fr.o[0], dz = P.z - Fr.o[1];
      const depth = -(dx * Fr.f[0] + dz * Fr.f[1]);
      const armed = P.armed && (P.aimT > 0 || P.firing > 0);
      const sneaking = depth > Fr.dc + 0.9 || P.y > I.floors[0] + 2;
      if (armed) return this.start(b.bank.id, true);
      if (sneaking) return this.start(b.bank.id, false);
    }
  }
  _gps() {
    const S = this.stage(); if (!S) return;
    if (S.type === 'escape') {
      if (S.dest) { const d = S.dest(); this.game.gps.set({ x: d.x, z: d.z, name: d.name, radius: d.r, mission: true }, this.game.playerPos()); }
      else this.game.gps.clear();
      return;
    }
    const gate = this.info(this.active.id)?.vault?.gate;
    if (S.type === 'loot' && S.from === 'vault' && gate && this.gates[this.active.id]?.locked) { this.game.gps.set({ x: gate.pad[0], z: gate.pad[1], name: 'פרוץ את דלת הסורגים', radius: 2, mission: true }, this.game.playerPos()); return; }
    const t = this.targets().find((q) => !q.taken);
    if (t) this.game.gps.set({ x: t.pt[0], z: t.pt[1], name: S.text, radius: 2, mission: true }, this.game.playerPos());
  }
  _next(msg) {
    const A = this.active;
    if (msg) this.game.toast(msg, 3);
    A.stage++; A.targets = null; A.busy = null; A.wait = null; A.keyHolder = undefined;
    if (A.stage >= HEISTS[A.id].stages.length) return this._success();
    const S = this.stage();
    setTimeout(() => { if (this.active === A && this.stage() === S) this.game.toast(S.text, 3.5); }, msg ? 2600 : 0);
    this._gps();
  }
  alarm(why) {
    const A = this.active; if (!A || A.alarm) return;
    A.alarm = true;
    const H = HEISTS[A.id], b = A.b, I = this.info(A.id);
    this.game.police.setWanted(H.stars, b.door.x, b.door.z);
    if (why !== 'holdup') this.game.toast(`🚨 האזעקה בבנק! ${'★'.repeat(H.stars)} המשטרה בדרך`, 3);
    this.game.peds.heistReact(b, this.game.playerPos(), I.floors[0], I.floors[I.floors.length - 1] + 4, why === 'holdup');
    this._siren(true);
  }
  fail(reason) {
    const A = this.active; if (!A) return;
    this.active = null;
    this.records[A.id] = { ...(this.records[A.id] || {}), last: Date.now() - COOLDOWN_MS * 0.6, failed: (this.records[A.id]?.failed || 0) + 1 };
    this._siren(false); this._bag(false); this.game.gps.clear();
    this.game.toast(`השוד נכשל — ${reason}. השלל אבד.`, 4);
    this._hudRender(true); this.game.save?.();
  }
  _success() {
    const A = this.active, H = HEISTS[A.id], k = BANKS.find((q) => q.id === A.id);
    this.active = null;
    const pay = k.loot, rest = Math.max(0, pay - (A.paid || 0));
    this.records[A.id] = { count: (this.records[A.id]?.count || 0) + 1, last: Date.now() };
    if (rest) this.game.econ.earn(rest, `שוד: ${k.name}`);
    this.game.toast('🏃 הכסף אצלך — עכשיו ברח לפני שהמשטרה תגיע!', 3.5);
    this._siren(false); this._bag(false); this.game.gps.clear();
    this.game.phone?.notify?.('חשבון הבנק שלך', `הופקדו ${fmt(pay)} — ${H.title}. יתרה: ${fmt(this.game.econ.money)}`);
    this._reward(pay, H.title);
    this._hudRender(true);
    this.game.save?.();
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game, P = g.player, pos = g.playerPos();
    if (!this._exHooked && g.weapons?.explode) { this._exHooked = true; const ex = g.weapons.explode.bind(g.weapons); g.weapons.explode = (p, r, d, ctx) => { const out = ex(p, r, d, ctx); this.onExplosion(p); return out; }; }
    this._doors(dt);
    this._fx(dt);
    this._alarmLights(dt);
    this._lootObjects(dt);
    const A = this.active;
    if (!A) { this._hud.classList.remove('show'); this._busy.classList.remove('show'); this._autoStart(); return; }
    const S = this.stage();
    if (S?.type === 'vault') this._vaultKey(dt, A);
    if (A.timer !== null) { A.timer -= dt; if (A.timer <= 0) return this.fail('נגמר הזמן'); }
    // an action in progress (hold / loot / unlock / blast): stay at the spot until it is done
    if (A.busy) {
      const t = A.busy.target;
      if (P.state !== 'foot' || Math.hypot(P.x - t.pt[0], P.z - t.pt[1]) > 2.6) { A.busy = null; g.toast('הפעולה בוטלה — חזור למקום', 1.5); }
      else {
        A.busy.t += dt;
        if (A.busy.t >= A.busy.dur) {
          const done = A.busy; A.busy = null;
          if (S.type === 'hold') return this._next(S.done);
          if (S.type === 'loot') {
            done.target.taken = true;
            if (done.target.key) (this.taken[A.id] ||= new Set()).add(done.target.key);
            const total = HEISTS[A.id].stages.filter((q) => q.type === 'loot').reduce((n, q) => n + (q.share || 1), 0);
            const part = Math.round(BANKS.find((q) => q.id === A.id).loot * (S.share || 1) / total / this.targets().length);
            A.loot += part; A.paid = (A.paid || 0) + part;
            g.econ.earn(part, 'שלל מהבנק'); g.toast(`💰 +${fmt(part)}`, 1.4);   // the money is yours the moment it is in the bag
            this._bag(true); g.audio.coin?.(); g.audio.mech?.('in');
            if (this.targets().every((q) => q.taken)) { if (HEISTS[A.id].stages.slice(A.stage + 1).some((q) => q.type === 'loot')) return this._next('יש! הכספת ריקה'); return this._next(); }
            this._gps(); this._hudRender(true);
          }
          if (S.type === 'unlock' || (S.type === 'vault' && done.mode === 'key')) { this._openVault('unlock'); A.wait = { kind: 'opening' }; }
          if (S.type === 'vault' && done.mode === 'blast') { A.wait = { kind: 'countdown', t: 5 }; g.toast('המטען מוכן — התרחק מהדלת! 5…', 1.5); }
          if (S.type === 'blast') { A.wait = { kind: 'countdown', t: 5 }; g.toast('המטען מוכן — התרחק מהדלת! 5…', 1.5); }
        }
      }
    }
    // waiting for the vault door / the blast
    if (A.wait) {
      const W = A.wait, D = this.doors[A.id];
      if (W.kind === 'opening' && D.open > 0.92) { if (S.alarm || S.type === 'vault') this.alarm('open'); this._next(S.done); }
      if (W.kind === 'countdown') {
        const before = Math.ceil(W.t); W.t -= dt; const after = Math.ceil(W.t);
        if (after !== before && after > 0) { g.toast(`${after}…`, 0.9); g.audio.mech?.('dry'); }
        if (W.t <= 0) { this._blast(); W.kind = 'blown'; W.t = 1.2; }
      } else if (W.kind === 'blown') { W.t -= dt; if (W.t <= 0) { if (S.alarm || S.type === 'vault') this.alarm('blast'); this._next(S.type === 'vault' ? 'בום! דלת הכספת עפה — האזעקה פועלת!' : S.done); } }
    }
    // escape
    if (S?.type === 'escape') {
      if (S.lose) { if (g.police.level === 0) this._next(); }
      else { const d = S.dest(); if (Math.hypot(pos.x - d.x, pos.z - d.z) < d.r) this._next(); }
    }
    this._hudRender(false);
  }

  // ------------------------------------------------------------------ vault doors (one mesh per loaded bank)
  _doors(dt) {
    const g = this.game;
    for (const L of g.interiors.loaded.values()) {
      const I = L.spec.bank; if (!I?.vault) continue;
      const id = L.b.bank.id, D = (this.doors[id] ||= { open: 0, mode: 'closed', t: 0 });
      // the vault closes again for the next robbery once the cooldown is over and you are away
      if (!this.active && D.mode !== 'closed' && this.status(id).state === 'ready') { D.mode = 'closed'; D.open = 0; }
      if (!L.vaultDoor) L.vaultDoor = this._buildDoor(I.vault, L.group);
      const V = L.vaultDoor;
      D.t += dt;
      if (D.mode === 'opening') {
        // wheel spins, bolts pull back, then the heavy door swings open slowly
        V.wheel.rotation.z = Math.min(D.t, 1.4) * 9;
        const bolt = Math.min(1, Math.max(0, (D.t - 1.4) / 0.6));
        V.bolts.forEach((b) => b.position.copy(b.userData.home).multiplyScalar(1 - 0.18 * bolt));
        D.open = Math.min(1, Math.max(0, (D.t - 2.0) / 3.2)); D.open = D.open * D.open * (3 - 2 * D.open);
        if (D.t > 2.0 && !D.creak) { D.creak = true; g.audio.impact?.(5); }
      } else if (D.mode === 'blown') {
        D.open = Math.min(1.15, D.open + dt * 4.5);
      }
      // the bar gate inside: down and locked, slides up into the ceiling once the code is cracked
      if (I.vault.gate) {
        const Gt = (this.gates[id] ||= { locked: true, open: 0 });
        if (!this.active && !Gt.locked && this.status(id).state === 'ready') { Gt.locked = true; Gt.open = 0; }
        if (!L.vaultGate) L.vaultGate = this._buildGate(I.vault.gate, L.group);
        Gt.open = Gt.locked ? 0 : Math.min(1, Gt.open + dt * 0.8);
        L.vaultGate.bars.position.y = Gt.open * (I.vault.gate.h - 0.15);
        L.vaultGate.light.material.emissive.setHex(Gt.locked ? 0xff2020 : 0x20ff40);
        I.vault.gate.col.off = Gt.open > 0.6;
      }
      V.setAngle(D.open * 1.75);   // swings out, towards the corridor
      V.door.rotation.z = D.mode === 'blown' ? Math.min(0.25, D.open * 0.22) : 0;
      I.vault.col.off = D.open > 0.4;
    }
  }
  _buildGate(G, parent) {
    // steel bars across the vault + a keypad on the wall beside them (red light: locked, green: open)
    const g = new THREE.Group(), bars = new THREE.Group(); g.add(bars);
    const steel = new THREE.MeshStandardMaterial({ color: 0x8d949b, metalness: 0.9, roughness: 0.3 });
    const dx = G.p1[0] - G.p0[0], dz = G.p1[1] - G.p0[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const n = Math.floor(len / 0.14);
    const barGeo = new THREE.CylinderGeometry(0.018, 0.018, G.h, 8);
    for (let i = 0; i <= n; i++) { const t = i / n, m = new THREE.Mesh(barGeo, steel); m.position.set(G.p0[0] + dx * t, G.y + G.h / 2, G.p0[1] + dz * t); m.castShadow = true; bars.add(m); }
    for (const y of [0.08, G.h * 0.5, G.h - 0.08]) { const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), steel); r.position.set((G.p0[0] + G.p1[0]) / 2, G.y + y, (G.p0[1] + G.p1[1]) / 2); r.rotation.y = Math.atan2(-uz, ux); bars.add(r); }
    const pad = new THREE.Group(); pad.position.set(G.padWall[0], G.y + 1.25, G.padWall[1]); pad.rotation.y = Math.atan2(-uz, ux) + Math.PI / 2; g.add(pad);
    pad.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.05), new THREE.MeshStandardMaterial({ color: 0x1c1f24, metalness: 0.5, roughness: 0.4 })));
    const keys = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.012), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5 })); keys.position.set(0, -0.04, 0.03); pad.add(keys);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 2 })); light.position.set(0, 0.11, 0.03); pad.add(light);
    parent.add(g);
    return { bars, light };
  }
  // cracking the gate code: four digits roll on the display; stop each one when it shows the code's digit. Three wrong
  // stops set off the alarm (you can keep trying)
  _codeGame(id) {
    const g = this.game; if (this._cg) return;
    const code = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10));
    const el = document.createElement('div'); el.id = 'codeGame';
    el.innerHTML = `<div class="cg-box"><div class="cg-head">🔢 פריצת קוד — דלת הסורגים</div><div class="cg-dials">${code.map((c, i) => `<div class="cg-col"><b class="cg-t">${c}</b><span class="cg-d" data-i="${i}">0</span></div>`).join('')}</div>
      <div class="cg-msg">עצור כל ספרה מתגלגלת כשהיא שווה לספרה הירוקה שמעליה</div>
      <div class="cg-btns"><button type="button" class="cg-lock">🔒 עצור</button><button type="button" class="cg-x">✕</button></div></div>`;
    document.body.appendChild(el);
    const dials = [...el.querySelectorAll('.cg-d')], msg = el.querySelector('.cg-msg');
    const st = this._cg = { i: 0, v: 0, miss: 0, code, el, timer: null };
    g.state = 'minigame'; document.body.classList.add('shopping');
    const tick = () => { st.v = (st.v + 1) % 10; dials[st.i].textContent = st.v; };
    const speed = () => 230 - st.i * 35;
    const run = () => { clearInterval(st.timer); st.timer = setInterval(tick, speed()); dials.forEach((d, k) => d.classList.toggle('on', k === st.i)); };
    const close = (ok) => {
      clearInterval(st.timer); window.removeEventListener('keydown', st.onKey); el.remove(); this._cg = null; document.body.classList.remove('shopping');
      g.state = 'playing'; g.input.endFrame(); g.clock.getDelta();
      if (ok) this.unlockGate(id);
    };
    const lock = () => {
      dials[st.i].textContent = st.v;
      if (st.v === code[st.i]) {
        dials[st.i].classList.add('ok'); g.audio.mech?.('in'); st.i++; st.v = 0;
        if (st.i >= 4) { msg.textContent = '✔ הקוד נפרץ — הסורגים עולים!'; clearInterval(st.timer); setTimeout(() => close(true), 700); return; }
        run();
      } else {
        st.miss++; g.audio.mech?.('dry'); dials[st.i].classList.add('bad'); setTimeout(() => dials[st.i]?.classList.remove('bad'), 300);
        msg.textContent = st.miss >= 3 ? '⚠ יותר מדי טעויות — האזעקה הופעלה! תמשיך לנסות' : `טעות (${st.miss}/3)`;
        if (st.miss >= 3) this.alarm('code');
      }
    };
    el.querySelector('.cg-lock').addEventListener('pointerdown', (e) => { e.preventDefault(); lock(); });
    el.querySelector('.cg-x').addEventListener('pointerdown', (e) => { e.preventDefault(); close(false); });
    st.onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); lock(); } if (e.code === 'Escape') close(false); };
    window.addEventListener('keydown', st.onKey);
    run();
  }
  unlockGate(id) {
    const Gt = (this.gates[id] ||= { locked: true, open: 0 }); if (!Gt.locked) return;
    Gt.locked = false; this.game.audio.mech?.('rack'); this.game.audio.impact?.(4);
    this.game.toast('🔓 דלת הסורגים נפתחת — הכסף שלך!', 2.5);
    if (this.active?.id === id) { this.active.targets = null; this._gps(); }
  }
  _buildDoor(v, parent) {
    const steel = new THREE.MeshStandardMaterial({ color: 0xaab1b8, metalness: 0.9, roughness: 0.32 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.85, roughness: 0.4 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 });
    const [ox, oz] = v.out, [lx, lz] = v.lat;
    // pivot on the hinge (left edge of the opening). Local axes: +x = from the hinge across the opening, +z = out of
    // the vault, +y = up. Swinging open = turning about local y so the door comes out towards the corridor (local -z).
    const pivot = new THREE.Group();
    pivot.position.set(v.center[0] - lx * 1.25, v.y, v.center[1] - lz * 1.25);
    // right-handed basis: x = across the opening, y = up, z = x × y (that is: INTO the vault), so the front face is at -z
    pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(lx, 0, lz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(lx, 0, lz).cross(new THREE.Vector3(0, 1, 0))));
    const baseQ = pivot.quaternion.clone();
    const door = new THREE.Group(); door.position.set(1.25, 1.35, 0); pivot.add(door);
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.55, 40).rotateX(Math.PI / 2), steel); slab.castShadow = true; door.add(slab);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 8, 40), dark); ring.position.z = -0.29; door.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 32), dark); ring2.position.z = -0.29; door.add(ring2);
    // locking wheel with spokes (it spins while the vault opens)
    const wheel = new THREE.Group(); wheel.position.z = -0.36; door.add(wheel);
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 28), gold));
    for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.84, 8), gold); sp.rotation.z = i * Math.PI / 4; wheel.add(sp); }
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 16).rotateX(Math.PI / 2), gold));
    // locking bolts around the rim (they pull in before the door moves)
    const bolts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, bo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10), steel);
      bo.position.set(Math.cos(a) * 1.18, Math.sin(a) * 1.18, 0); bo.rotation.z = a + Math.PI / 2; bo.userData.home = bo.position.clone();
      door.add(bo); bolts.push(bo);
    }
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.3, 0.6), dark); hinge.position.set(0, 1.35, 0); pivot.add(hinge);
    parent.add(pivot);
    const qY = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    return { setAngle: (a) => pivot.quaternion.copy(baseQ).multiply(qY.setFromAxisAngle(Y, a)), door, wheel, bolts };
  }
  // ---- the vault key: one of the guards / tellers carries it (sometimes nobody does). Take it from him when he
  //      surrenders, or when he is down for good it drops on the floor and you pick it up. No key: blow the door.
  _assignKey(A) {
    const b = A.b, peds = this.game.peds.peds;
    const staff = peds.filter((p) => p.state !== 'dead' && Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2 && (p.app.guard || p.state === 'shopkeeper' || (p.state === 'surrender' && p.shopKey)));
    // the two guards at the door always carry vault keys (otherwise one of the staff might)
    const door = staff.filter((p) => p.doorGuard);
    A.keyHolders = door.length ? door : staff.length && Math.random() < 0.75 ? [staff.sort((a, c) => (c.app.guard ? 1 : 0) - (a.app.guard ? 1 : 0))[Math.floor(Math.random() * Math.min(2, staff.length))]] : [];
    A.keyHolder = A.keyHolders[0] || null;
    A.staff = staff; A.hasKey = false; A.keyObj = null; A.noKeyTold = false;
  }
  _vaultKey(dt, A) {
    const g = this.game, P = g.player;
    if (A.keyHolder === undefined) this._assignKey(A);
    if (A.hasKey) return;
    // someone from the staff went down: search him
    for (const p of A.staff || []) {
      if ((p.state !== 'dead' && !(p.wounded && p.state === 'knocked')) || p.searched) continue;
      p.searched = true;
      if ((A.keyHolders || [A.keyHolder]).includes(p) && !A.keyObj) {
        const m = new THREE.Group();
        const gold = new THREE.MeshStandardMaterial({ color: 0xe8c040, metalness: 1, roughness: 0.25, emissive: 0x6a4a08, emissiveIntensity: 0.8 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 16), gold); ring.rotation.x = Math.PI / 2; m.add(ring);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.13), gold); shaft.position.z = 0.11; m.add(shaft);
        for (const z of [0.15, 0.17]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), gold); t.position.set(0.02, 0, z); m.add(t); }
        m.position.set(p.x + 0.4, p.y + 0.06, p.z + 0.2); g.scene.add(m); A.keyObj = m;
        if (Math.hypot(P.x - p.x, P.z - p.z) < 25) g.toast('🔑 יש עליו מפתח — גש ולחץ ״קח את המפתח״', 2.8);
      } else if (Math.hypot(P.x - p.x, P.z - p.z) < 25) g.toast('אין עליו מפתח…', 1.8);
    }
    if (A.keyObj) {
      const k = A.keyObj; k.rotation.y += dt * 2.5; k.position.y = (k.userData.y0 ??= k.position.y) + 0.05 + Math.sin(performance.now() * 0.004) * 0.03;

    }
    // nobody had it: tell the player once there is nobody left to search
    if (!A.noKeyTold && (A.staff || []).length && A.staff.every((p) => p.searched || p.state === 'dead') && !A.keyObj) { A.noKeyTold = true; g.toast('לאף אחד אין מפתח — תצטרך לפוצץ את דלת הכספת', 3); }
  }
  // a grenade (or any explosive) that goes off right at the vault door blows it open
  // a grenade / sticky bomb that goes off at a vault door blows it open - whatever stage the robbery is at (it starts
  // the robbery if you had not yet, and skips the earlier jobs)
  onExplosion(pt) {
    const g = this.game;
    for (const L of g.interiors.loaded.values()) {
      const I = L.spec.bank, b = L.b, v = I?.vault; if (!v || !b.bank) continue;
      const d = Math.min(Math.hypot(pt.x - v.outside[0], pt.z - v.outside[1]), Math.hypot(pt.x - v.center[0], pt.z - v.center[1]));
      if (d > 4.2 || Math.abs(pt.y - v.y - 1) > 3) continue;
      const id = b.bank.id;
      if (!this.active) { if (this.status(id).state !== 'ready') return; this.start(id, true); }
      const A = this.active; if (A.id !== id || A.busy) return;
      if (this.doors[id] && this.doors[id].mode !== 'closed') return;     // already open
      const vi = HEISTS[id].stages.findIndex((q) => q.type === 'vault');
      if (vi >= 0 && A.stage < vi) { A.stage = vi; A.targets = null; A.keyHolder = undefined; }
      if (this.stage()?.type !== 'vault') return;
      A.wait = null; this._blast(); A.wait = { kind: 'blown', t: 1.2 };
      return;
    }
  }
  _openVault(mode) {
    const D = this.doors[this.active.id];
    D.mode = mode === 'unlock' ? 'opening' : 'blown'; D.t = 0; D.creak = false;
    if (mode === 'unlock') { this.game.audio.mech?.('rack'); this.game.toast('המנעול משתחרר — הכספת נפתחת…', 2.5); }
  }
  // cinematic movie-style blast (game effect only): flash, shockwave, sparks, debris, smoke, shake
  _blast() {
    const g = this.game, I = this.info(this.active.id), v = I.vault;
    const c = new THREE.Vector3(v.center[0] + v.out[0] * 0.4, v.y + 1.35, v.center[1] + v.out[1] * 0.4);
    this._openVault('blast');
    g.hitfx?.impact(c.x, c.y, c.z, 'heavy'); g.hitfx?.impact(c.x, c.y + 0.4, c.z, 'heavy');
    g.weapons._spark?.(c, 0xffb040, 1.6, 0.6);
    g.weapons.flash.position.copy(c); g.weapons.flash.intensity = 80; g.weapons._flashT = 0.35;
    g.audio.gunshot?.('heavy'); g.audio.impact?.(14);
    g.rig.shake = Math.max(g.rig.shake, 0.9); g.hitStop = 0.12;
    for (let i = 0; i < 14; i++) this._smoke(c, 0.6 + Math.random() * 0.8, 4 + Math.random() * 3, (Math.random() - 0.5) * 3 + v.out[0] * 2, (Math.random() - 0.5) * 3 + v.out[1] * 2);
    this.smokeT = 18; this.smokeAt = c;
    // too close? the blast knocks you down (game damage)
    const P = g.player, d = Math.hypot(P.x - c.x, P.z - c.z);
    if (d < 4.5 && P.state === 'foot') { g.hurt(Math.round(35 * (1 - d / 4.5)) + 5, 'פיצוץ הכספת'); P.vx += (P.x - c.x) / (d || 1) * 6; P.vz += (P.z - c.z) / (d || 1) * 6; P.vy = 3; P.grounded = false; }
  }
  _smoke(at, size, life, vx = 0, vz = 0) {
    const tex = this.game.hitfx?.dust; if (!tex) return;
    const m = new THREE.SpriteMaterial({ map: tex, color: 0x8a8a8a, transparent: true, depthWrite: false, opacity: 0.85 });
    const s = new THREE.Sprite(m); s.position.copy(at); s.scale.setScalar(size); this.game.scene.add(s);
    this.fx.push({ s, t: 0, life, vx, vz, grow: 1.2 + Math.random() });
  }
  _fx(dt) {
    if (this.smokeT > 0) { this.smokeT -= dt; if (Math.random() < dt * 4) this._smoke(this.smokeAt.clone().add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.5, (Math.random() - 0.5))), 0.8, 5, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6); }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt; const k = f.t / f.life;
      if (k >= 1) { this.game.scene.remove(f.s); f.s.material.dispose(); this.fx.splice(i, 1); continue; }
      f.s.position.x += f.vx * dt; f.s.position.z += f.vz * dt; f.s.position.y += dt * 0.5; f.vx *= 0.97; f.vz *= 0.97;
      f.s.scale.setScalar(f.s.scale.x + f.grow * dt); f.s.material.opacity = 0.8 * (1 - k);
    }
  }

  // ------------------------------------------------------------------ alarm: siren + flashing red lights + red pulse on screen
  _siren(on) {
    const au = this.game.audio, ctx = au.ctx;
    if (!on) { if (this.sir) { try { this.sir.o.stop(); this.sir.l.stop(); } catch { /* */ } this.sir = null; } return; }
    if (!ctx || this.sir) return;
    const o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 760; l.frequency.value = 1.6; lg.gain.value = 180;
    l.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
    g.gain.value = 0; o.connect(f); f.connect(g); g.connect(au.master); o.start(); l.start();
    this.sir = { o, l, g };
  }
  _alarmLights(dt) {
    // only the siren sound (no flashing red lights)
    const g = this.game, A = this.active;
    if (this.sir && A) { const pos = g.playerPos(), d = Math.hypot(pos.x - A.b.x, pos.z - A.b.z); this.sir.g.gain.value = Math.max(0, 0.07 * (1 - d / 160)); }
    document.getElementById('alarmFlash')?.classList.remove('on');
  }

  // cash stacks, gold bars and till money are real objects: what you take disappears into your bag
  _lootObjects(dt) {
    const g = this.game, P = g.player;
    for (const L of g.interiors.loaded.values()) {
      const I = L.spec.bank; if (!I) continue;
      const id = L.b.bank.id;
      if ((!this.active || this.active.id !== id) && this.status(id).state === 'ready' && this.taken[id]?.size) this.taken[id] = new Set();   // restocked
      if (!L.lootObj) {
        const cash = new THREE.MeshStandardMaterial({ color: 0x3f8f55, roughness: 0.8 }), band = new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.7 });
        const goldM = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.95, roughness: 0.25, emissive: 0x3a2a05, emissiveIntensity: 0.4 });
        const make = (pile) => {
          const grp = new THREE.Group(); grp.position.set(pile.pt[0], pile.y, pile.pt[1]); grp.rotation.y = pile.yaw;
          if (pile.kind === 'cash') for (let k = 0; k < 4; k++) {
            const st = new THREE.Group(); st.position.set(-0.26 + (k % 2) * 0.52, 0, -0.18 + Math.floor(k / 2) * 0.36);
            const h = pile.h * (0.85 + ((k * 37) % 10) / 60);
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.46, h, 0.32), cash); m.position.y = h / 2; m.castShadow = true; st.add(m);
            for (const yy of [0.25, 0.75]) { const bnd = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.04, 0.33), band); bnd.position.y = h * yy; st.add(bnd); }
            grp.add(st);
          } else if (pile.kind === 'gold') for (let k = 0; k < 12; k++) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.12), goldM); m.position.set(-0.7 + (k % 6) * 0.28, 0.04 + Math.floor(k / 6) * 0.0, -0.13 + Math.floor(k / 6) * 0.26); m.castShadow = true; grp.add(m);
          } else for (let k = 0; k < 3; k++) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.08), cash); m.position.set(-0.1 + k * 0.1, 0.025 + (k % 2) * 0.05, 0); grp.add(m);
            const bnd = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.052, 0.082), band); bnd.position.copy(m.position); grp.add(bnd);
          }
          L.group.add(grp); return { grp, anim: -1 };
        };
        L.lootObj = {};
        (I.vault?.loot || []).forEach((q, i) => { if (q.pile) L.lootObj['v' + i] = make(q.pile); });
        I.drawers.forEach((q, i) => { if (q.pile) L.lootObj['d' + i] = make(q.pile); });
      }
      const T = this.taken[id];
      for (const [key, o] of Object.entries(L.lootObj)) {
        const gone = !!T?.has(key);
        if (!gone) { o.grp.visible = true; o.grp.scale.setScalar(1); o.anim = -1; if (o.home) o.grp.position.copy(o.home); continue; }
        if (o.anim < 0 && o.grp.visible && this.active?.id === id) { o.anim = 0; o.home = o.grp.position.clone(); }
        if (o.anim >= 0) {
          // swept into the bag: lifts towards you and shrinks away
          o.anim += dt / 0.55; const k = Math.min(1, o.anim);
          o.grp.position.lerpVectors(o.home, new THREE.Vector3(P.x, P.y + 1.1, P.z), k * k);
          o.grp.scale.setScalar(1 - k * 0.95);
          if (k >= 1) { o.grp.visible = false; o.anim = -2; }
        } else if (o.anim !== -2) o.grp.visible = false;
      }
    }
  }

  // money bag on the player's back while carrying loot
  _bag(on) {
    const P = this.game.player;
    if (on && !this.bagMesh) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.24), new THREE.MeshStandardMaterial({ color: 0x2f3b2a, roughness: 0.9 }));
      m.position.set(0, 0.25, -0.2); const dollar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.01), new THREE.MeshBasicMaterial({ color: 0xd4af37 }));
      dollar.position.set(0, 0.05, -0.125); m.add(dollar);
      (P.model.spine || P.model.body || P.object).add(m); this.bagMesh = m;
    } else if (!on && this.bagMesh) { this.bagMesh.parent?.remove(this.bagMesh); this.bagMesh = null; }
  }

  // ------------------------------------------------------------------ HUD + reward animation
  _buildHud() {
    const el = document.createElement('div'); el.id = 'heistHud'; document.getElementById('hud').appendChild(el); this._hud = el;
    const pr = document.createElement('div'); pr.id = 'heistBusy'; pr.innerHTML = '<span></span><i><b></b></i>'; document.getElementById('hud').appendChild(pr); this._busy = pr;
    const af = document.createElement('div'); af.id = 'alarmFlash'; document.getElementById('hud').appendChild(af);
    const rw = document.createElement('div'); rw.id = 'heistReward'; document.getElementById('hud').appendChild(rw); this._rw = rw;
  }
  _hudRender(force) {
    const A = this.active;
    if (!A) { this._hud.classList.remove('show'); this._busy.classList.remove('show'); return; }
    const H = HEISTS[A.id], S = this.stage();
    const tg = S && this.targets(), left = tg?.filter((q) => !q.taken).length;
    const html = `<b>🏦 ${H.title}</b>` + H.stages.map((s, i) => `<div class="${i < A.stage ? 'done' : i === A.stage ? 'cur' : ''}">${i < A.stage ? '✔' : i === A.stage ? '▶' : '•'} ${s.text}${i === A.stage && s.type === 'loot' && tg.length > 1 ? ` (${tg.length - left}/${tg.length})` : ''}</div>`).join('')
      + `<div class="loot">שלל בתיק: ${fmt(A.loot)}${A.timer !== null ? ` · ⏱ ${Math.max(0, Math.ceil(A.timer))} שנ׳` : ''}${A.alarm ? ' · 🚨 אזעקה' : ''}</div>`;
    if (force || this._hud.dataset.h !== html) { this._hud.innerHTML = html; this._hud.dataset.h = html; }
    this._hud.classList.remove('show');   // no stage list on screen: short messages + the map route guide you
    const B = A.busy;
    this._busy.classList.toggle('show', !!B || A.wait?.kind === 'opening');
    if (B) { this._busy.querySelector('span').textContent = S.type === 'loot' ? 'אוסף שלל…' : `${S.busy}…`; this._busy.querySelector('b').style.width = Math.round(100 * B.t / B.dur) + '%'; }
    else if (A.wait?.kind === 'opening') { this._busy.querySelector('span').textContent = 'הכספת נפתחת…'; this._busy.querySelector('b').style.width = Math.round(100 * (this.doors[A.id]?.open || 0)) + '%'; }
  }
  _reward(amount, title) {
    const el = this._rw;
    el.innerHTML = `<div class="rw-box"><div class="rw-t">💰 השוד הצליח!</div><div class="rw-s">${title}</div><div class="rw-n">₪0</div><div class="rw-s">הכסף הועבר לחשבון שלך</div></div>` + Array.from({ length: 26 }, (_, i) => `<span class="bill" style="left:${(i * 37) % 100}%;animation-delay:${(i % 9) * 0.18}s;animation-duration:${2.2 + (i % 5) * 0.35}s">💵</span>`).join('');
    el.classList.add('show');
    const n = el.querySelector('.rw-n'), t0 = performance.now(), dur = 2600;
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3); n.textContent = fmt(amount * e); if (k < 1) requestAnimationFrame(tick); };
    tick();
    for (let i = 0; i < 6; i++) setTimeout(() => this.game.audio.coin?.(), i * 300);
    clearTimeout(this._rwT); this._rwT = setTimeout(() => el.classList.remove('show'), 6500);
  }
}
