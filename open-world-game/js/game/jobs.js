// Jobs (phone app "עבודות"): pick a job, work a shift, get paid for every task.
//   ice-cream delivery   - collect at the ice-cream shop, deliver to customers waiting on the street
//   clothes-shop clerk   - behind the counter: customers walk in, you serve them
//   gun-shop clerk       - the same at the gun shop
//   police officer       - (police uniform) calls: the suspect runs, you catch him and make the arrest
//   soldier              - (army uniform) a patrol through the checkpoints at the base
//   paramedic            - (medic uniform) an injured person on the street: you treat him and he gets back up
// All fictional game activities; the money goes into your account.
import { cellData } from '../world/worldGen.js';
import { interiorSpec } from '../world/interiors.js';
import { fmt } from './economy.js';

export const JOBS = [
  { id: 'icecream', name: 'שליח גלידה', icon: '🍦', desc: 'אוסף גלידות מ"גלידת שקיעה" ומביא ללקוחות ברחוב', pay: 120, per: 'משלוח', n: 3 },
  { id: 'clothes', name: 'מוכר בחנות בגדים', icon: '👕', desc: 'עומד מאחורי הדלפק ומשרת לקוחות שנכנסים', pay: 90, per: 'לקוח', n: 4 },
  { id: 'guns', name: 'מוכר בחנות נשקים', icon: '🔫', desc: 'מאחורי הדלפק בחנות הנשקים — לקוחות נכנסים ואתה משרת', pay: 150, per: 'לקוח', n: 4 },
  { id: 'police', name: 'שוטר', icon: '🚓', desc: 'במדי משטרה: קריאות מהמוקד, חשוד בורח — תופסים ועוצרים', pay: 300, per: 'מעצר', n: 3, uniform: 'Police_Male_01' },
  { id: 'army', name: 'חייל', icon: '🪖', desc: 'במדי צבא: סיור בעמדות של הבסיס הצבאי', pay: 200, per: 'עמדה', n: 4, uniform: 'Military_Male_01' },
  { id: 'rescue', name: 'פרמדיק', icon: '🚑', desc: 'במדי חובש: מגיעים לפצוע ברחוב, מטפלים בו והוא קם', pay: 250, per: 'הצלה', n: 3, uniform: 'Medical_Male_01' },
];
const BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j]));
const PLACES = { icecream: 'גלידת שקיעה', clothes: /חנות בגדים|בגדי רחוב/, guns: 'חנות נשקים', police: 'תחנת משטרה', army: 'מפקדה', rescue: 'בית חולים' };   // the soldier reports at the base headquarters

export class Jobs {
  constructor(game) {
    this.game = game;
    this.cur = null;        // { id, done, step, ... }
    this._places = {};
    game.realPeople && (game.realPeople.uniform = () => (this.cur && BY_ID[this.cur.id].uniform) || null);
  }
  get job() { return this.cur && BY_ID[this.cur.id]; }
  _place(id) {
    if (this._places[id] !== undefined) return this._places[id];
    const m = PLACES[id]; let found = null;
    for (let i = -8; i < 22 && !found; i++) for (let j = -8; j < 22 && !found; j++) {
      const b = cellData(i, j).buildings.find((q) => (m instanceof RegExp ? m.test(q.sign || '') : q.sign === m));
      if (b) found = b;
    }
    if (found && !found.door) found.door = { x: found.x, z: found.z };   // buildings without an entrance of their own (the base HQ)
    return (this._places[id] = found);
  }
  _gps(x, z, name, r = 3) { this.game.gps.set({ x, z, name, radius: r, mission: true }, this.game.playerPos()); }
  _say(t, d = 2.6) { this.game.toast(t, d); }
  _ped(x, z, extra = {}) {
    const P = this.game.peds, p = P._add({ x, z, state: 'guard', yaw: 0, keep: true, homeSpot: { x, z, yaw: 0, state: 'guard', y: 0 }, phone: false, suitcase: false, ...extra });
    p.jobPed = true; p.walkOnly = true; P._colors(); return p;
  }
  _dropPed(p) { if (!p) return; const P = this.game.peds, i = P.peds.indexOf(p); if (i >= 0 && p.state !== 'dead') { p.state = 'walk'; p.timer = 8; p.keep = false; } }
  _spot(minD = 70, maxD = 200) {
    const g = this.game, pos = g.playerPos();
    for (let k = 0; k < 20; k++) { const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD); const s = g.roadsideSpot(pos.x + Math.cos(a) * d, pos.z + Math.sin(a) * d); if (s) return s; }
    return { x: pos.x + 40, z: pos.z + 40 };
  }

  // ------------------------------------------------------------------ start / stop
  start(id) {
    const J = BY_ID[id]; if (!J) return 'עבודה לא ידועה';
    if (this.cur) this.stop(true);
    const b = this._place(id);
    if (!b) return `לא מצאתי את ${PLACES[id]} במפה`;
    this.cur = { id, done: 0, earned: 0, step: 'goto', b, t: 0 };
    const where = id === 'army' ? b : b;
    this._gps(where.door.x, where.door.z, `${J.icon} ${J.name}`, 6);
    this._say(`${J.icon} התחלת משמרת: ${J.name}. ${J.uniform ? 'לבשת את המדים. ' : ''}סע ל${b.sign} — מסומן ב-GPS`, 4);
    return null;
  }
  stop(quiet) {
    const C = this.cur; if (!C) return;
    for (const p of [C.ped, ...(C.peds || [])]) this._dropPed(p);
    const J = BY_ID[C.id];
    this.game.econ.jobs ||= {}; const st = (this.game.econ.jobs[C.id] ||= { shifts: 0, earned: 0 }); st.shifts++; st.earned += C.earned;
    this.cur = null; this.game.gps.clear(); this.game.save?.();
    if (!quiet) this._say(`${J.icon} המשמרת הסתיימה: ${C.done} ${J.per}${C.done === 1 ? '' : 'ים'} · הרווחת ${fmt(C.earned)}`, 4);
  }
  _pay(note) {
    const C = this.cur, J = BY_ID[C.id];
    C.done++; C.earned += J.pay; this.game.econ.earn(J.pay, `${J.name}`);
    this._say(`${J.icon} ${note} +${fmt(J.pay)} (${C.done}/${J.n})`, 2.6);
    if (C.done >= J.n) { const bonus = Math.round(J.pay * 0.5); this.game.econ.earn(bonus, 'בונוס משמרת'); C.earned += bonus; this.stop(true); this._say(`🏁 משמרת מלאה! בונוס ${fmt(bonus)} · סה״כ ${fmt(C.earned)}`, 3.5); return false; }
    return true;
  }

  // ------------------------------------------------------------------ the button on screen (E / "פעולה")
  promptFor(p) {
    const C = this.cur; if (!C || C.busy || p.state !== 'foot') return null;
    const g = this.game, near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    if (C.step === 'pickup' && near(C.pick[0], C.pick[1], 2.6)) return { text: '🍦 קח את הגלידות', action: () => { C.step = 'deliver'; this._nextCustomer(); } };
    if (C.step === 'deliver' && C.ped && near(C.ped.x, C.ped.z, 2.4)) return { text: '🍦 מסור את הגלידה', action: () => { g.peds.say(C.ped, ['תודה רבה!', 'וואו, עוד קרה!', 'מעולה, תודה!'][C.done % 3], 2); this._dropPed(C.ped); C.ped = null; if (this._pay('גלידה נמסרה')) this._nextCustomer(); } };
    if (C.step === 'shop' && C.ped && C.ped.atCounter && near(C.keeper[0], C.keeper[1], 1.8)) return { text: '🛍️ שרת את הלקוח', action: () => { C.busy = { t: 0, dur: 2, done: () => { g.peds.say(C.ped, ['תודה, ביי!', 'מושלם, אני לוקח', 'כמה זה? מעולה'][C.done % 3], 2); C.ped.followTo = { x: C.door[0], z: C.door[1] }; C.ped.state = 'follow'; C.ped.leaving = true; C.leaving = C.ped; C.ped = null; if (this._pay('לקוח שורת')) C.nextT = 3; } }; this._say('משרת את הלקוח…', 2); } };
    if (C.step === 'chase' && C.ped && near(C.ped.x, C.ped.z, 2.4)) return { text: '🚓 עצור אותו', action: () => { const q = C.ped; q.state = 'surrender'; q.timer = 4; q.copChase = false; g.peds.say(q, 'בסדר, בסדר! אני נכנע', 2); setTimeout(() => this._dropPedGone(q), 3500); C.ped = null; if (this._pay('החשוד נעצר')) this._later(C, () => this._nextCall(), 2500); } };
    if (C.step === 'treat' && C.ped && near(C.ped.x, C.ped.z, 2.4)) return { text: '🚑 טפל בפצוע', action: () => { C.busy = { t: 0, dur: 3, done: () => { const q = C.ped; q.wounded = false; q.state = 'getup'; q.timer = 0.9; g.peds.say(q, 'תודה... הצלת אותי', 2.5); setTimeout(() => this._dropPed(q), 2000); C.ped = null; if (this._pay('הפצוע טופל')) this._later(C, () => this._nextCall(), 2500); } }; this._say('מטפל בפצוע…', 3); } };
    return null;
  }
  // a delayed step that only runs if the same shift is still on
  _later(C, f, ms) { setTimeout(() => { if (this.cur === C) f(); }, ms); }
  _dropPedGone(q) { const P = this.game.peds, i = P.peds.indexOf(q); if (i >= 0) P.peds.splice(i, 1); P._colors(); }

  // ------------------------------------------------------------------ per job
  _arrive() {
    const C = this.cur, g = this.game, J = BY_ID[C.id], b = C.b;
    if (C.id === 'icecream') {
      const S = interiorSpec(b), c = S.counter; C.pick = c ? c.pt : [b.door.x, b.door.z];
      C.step = 'pickup'; this._gps(C.pick[0], C.pick[1], 'קח את הגלידות מהדלפק', 2); this._say('🍦 היכנס ואסוף את הגלידות מהדלפק', 3);
    } else if (C.id === 'clothes' || C.id === 'guns') {
      const S = interiorSpec(b), c = S.counter; if (!c) { this._say('אין דלפק בחנות הזאת', 3); return this.stop(true); }
      C.keeper = c.keeper; C.counter = c.pt; C.door = [b.door.x, b.door.z]; C.step = 'shop'; C.nextT = 1;
      this._gps(c.keeper[0], c.keeper[1], 'עמוד מאחורי הדלפק', 1.5); this._say(`${J.icon} עמוד מאחורי הדלפק — לקוחות יגיעו`, 3);
    } else if (C.id === 'army') {
      const cx = b.x, cz = b.z; C.points = [0, 1, 2, 3].map((k) => { const a = k * Math.PI / 2 + 0.4, s = g.roadsideSpot(cx + Math.cos(a) * 45, cz + Math.sin(a) * 45); return s ? [s.x, s.z] : [cx + Math.cos(a) * 40, cz + Math.sin(a) * 40]; });
      C.step = 'patrol'; C.pi = 0; this._gps(C.points[0][0], C.points[0][1], 'עמדה 1', 4); this._say('🪖 התחל סיור: 4 עמדות בבסיס, מסומנות ב-GPS', 3);
    } else { C.step = 'call'; this._nextCall(); }
  }
  _nextCustomer() {
    const C = this.cur, s = this._spot(60, 170);
    C.ped = this._ped(s.x, s.z); C.ped.yaw = Math.random() * 6.28;
    this._gps(s.x, s.z, `🍦 לקוח ${C.done + 1}/${BY_ID.icecream.n}`, 3);
    this._say(`🍦 לקוח מחכה לגלידה — ${C.done + 1}/${BY_ID.icecream.n}`, 2.5);
  }
  _nextCall() {
    const C = this.cur; if (!C) return;
    const s = this._spot(70, 190);
    if (C.id === 'police') {
      C.ped = this._ped(s.x, s.z); C.ped.walkOnly = false; C.step = 'chase'; C.ped.suspect = true;
      this._gps(s.x, s.z, '🚓 קריאה: חשוד', 6); this._say(`📻 מוקד: חשוד בגניבה, מסומן ב-GPS. תפוס אותו! (${C.done + 1}/${BY_ID.police.n})`, 3.5);
    } else if (C.id === 'rescue') {
      C.ped = this._ped(s.x, s.z, { state: 'knocked', timer: 9999 }); C.ped.wounded = 'leg'; C.ped.fallYaw = Math.random() * 6.28; C.step = 'treat';
      this._gps(s.x, s.z, '🚑 פצוע', 4); this._say(`🚑 קריאה: פצוע שוכב ברחוב, מסומן ב-GPS (${C.done + 1}/${BY_ID.rescue.n})`, 3.5);
    }
  }

  update(dt) {
    const C = this.cur; if (!C) return;
    const g = this.game, pos = g.playerPos();
    if (C.busy) { C.busy.t += dt; if (C.busy.t >= C.busy.dur) { const f = C.busy.done; C.busy = null; f(); } return; }
    if (C.step === 'goto') {
      const b = C.b, r = C.id === 'army' ? 40 : C.id === 'police' || C.id === 'rescue' ? 25 : 6;
      if (Math.hypot(pos.x - b.door.x, pos.z - b.door.z) < r || C.id === 'police' || C.id === 'rescue') this._arrive();
      return;
    }
    if (C.step === 'shop') {
      // customers come in through the door and walk to the counter; served ones walk out
      if (C.leaving && Math.hypot(C.leaving.x - C.door[0], C.leaving.z - C.door[1]) < 1.2) { this._dropPedGone(C.leaving); C.leaving = null; }
      if (!C.ped) { C.nextT -= dt; if (C.nextT <= 0) { C.ped = this._ped(C.door[0], C.door[1], { state: 'follow' }); C.ped.followTo = { x: C.counter[0], z: C.counter[1] }; } }
      else if (!C.ped.atCounter && Math.hypot(C.ped.x - C.counter[0], C.ped.z - C.counter[1]) < 1.1) { C.ped.atCounter = true; C.ped.state = 'guard'; C.ped.homeSpot = { x: C.ped.x, z: C.ped.z, yaw: Math.atan2(C.keeper[0] - C.ped.x, C.keeper[1] - C.ped.z), state: 'guard', y: C.ped.y }; g.peds.say(C.ped, ['שלום! אפשר עזרה?', 'יש לכם את זה במידה אחרת?', 'אני רוצה לקנות'][C.done % 3], 2.5); }
    }
    if (C.step === 'chase' && C.ped) {
      const q = C.ped, d = Math.hypot(q.x - pos.x, q.z - pos.z);
      if (d < 22 && q.state !== 'flee' && q.state !== 'surrender') { q.state = 'flee'; q.timer = 60; q.fleeFrom = [pos.x, pos.z]; g.peds.say(q, 'משטרה?! ברחתי!', 1.6); }
      if (q.state === 'flee') q.fleeFrom = [pos.x, pos.z];
      g.gps.dest && (g.gps.dest.x = q.x, g.gps.dest.z = q.z);
    }
    if (C.step === 'patrol') {
      const pt = C.points[C.pi];
      if (Math.hypot(pos.x - pt[0], pos.z - pt[1]) < 5) {
        if (!this._pay(`עמדה ${C.pi + 1} נבדקה — הכול שקט`)) return;
        C.pi++; const n = C.points[C.pi]; this._gps(n[0], n[1], `עמדה ${C.pi + 1}`, 4);
      }
    }
  }
}
