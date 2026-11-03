// Characters you can call/message, conversations with reply choices, and story missions with real objectives.
import { cellData } from '../world/worldGen.js';
import { fmt } from './economy.js';

export const CONTACTS = {
  roni: { name: 'רוני', role: 'חבר מהשכונה', color: '#ff8a3d' },
  mom: { name: 'אמא', role: 'משפחה', color: '#e84a8f' },
  falafel: { name: 'פלאפל הכיכר', role: 'מסעדה', color: '#f1c40f' },
  mechanic: { name: 'מאיה · מוסך אזורה', role: 'מוסך', color: '#3fa7ff' },
  taxi: { name: 'מוניות אזורה', role: 'שירות מוניות', color: '#ffd400' },
  airport: { name: 'מודיעין נמל התעופה', role: 'נמל התעופה אזורה', color: '#7d8cff' },
};

// helper lookups into the generated world
function findBuilding(pred, cells) {
  for (const [ix, iz] of cells) {
    const b = cellData(ix, iz).buildings.find(pred);
    if (b) return b;
  }
  return null;
}
const AZURA = []; for (let iz = 0; iz < 10; iz++) for (let ix = 0; ix < 10; ix++) AZURA.push([ix, iz]);
const doorOf = (b) => ({ x: b.door.x + (b.door.x - b.x) * 0.15, z: b.door.z + (b.door.z - b.z) * 0.15 });

export const MISSIONS = [
  {
    id: 'airport', title: 'איסוף מנמל התעופה', giver: 'roni', reward: 1200,
    offer: 'היי! אני נוחת עוד מעט בנמל התעופה אזורה. תוכל לאסוף אותי מאזור ההורדה מול הטרמינל?',
    steps: [
      { text: 'סע ברכב לאזור ההורדה מול הטרמינל', target: () => ({ x: -300, z: 514, radius: 14, name: 'נמל התעופה — הורדה' }), cond: (g) => g.player.state === 'driving', done: 'רוני: ראיתי אותך! נכנסתי לרכב 🙂' },
      { text: 'קח את רוני הביתה, לשכונת הגפנים', target: () => { const b = findBuilding((q) => q.house, [[1, 1], [0, 1], [2, 1]]); return { ...doorOf(b), radius: 12, name: 'הבית של רוני' }; }, cond: (g) => g.player.state === 'driving', done: 'רוני: תודה ענקית! העברתי לך משהו על הטרחה.' },
    ],
    unlocks: ['falafel', 'sunset'],
  },
  {
    id: 'falafel', title: 'משלוח חם', giver: 'falafel', reward: 600, timeLimit: 300,
    offer: 'שלום! השליח שלנו חולה. תוכל לקחת משלוח מהמסעדה לבניין מגורים? יש 5 דקות מהרגע שאתה אוסף.',
    steps: [
      { text: 'היכנס לפלאפל הכיכר ואסוף את המשלוח מהדלפק', target: () => { const b = findBuilding((q) => q.sign === 'פלאפל הכיכר', [[7, 6]]); const c = b._spec?.counter; return c ? { x: c.pt[0], z: c.pt[1], radius: 2.5, name: 'פלאפל הכיכר' } : { ...doorOf(b), radius: 4, name: 'פלאפל הכיכר' }; }, cond: (g) => g.player.state === 'foot', done: 'פלאפל הכיכר: הנה המשלוח, בהצלחה! השעון מתקתק.', startTimer: true },
      { text: 'מסור את המשלוח בכניסה לבניין המגורים', target: () => { const b = findBuilding((q) => q.interior === 'apartment', AZURA); return { ...doorOf(b), radius: 4, name: 'בניין המגורים' }; }, cond: (g) => g.player.state === 'foot', done: 'פלאפל הכיכר: הלקוח מרוצה. כל הכבוד!' },
    ],
    unlocks: ['view'],
  },
  {
    id: 'sunset', title: 'תמונת שקיעה', giver: 'mom', reward: 400,
    offer: 'חמוד, תצלם לי את השקיעה מהחוף? בין 17:00 ל־19:30 השמיים הכי יפים. (אפשר לשנות שעה בהגדרות)',
    steps: [
      { text: 'צלם במצלמת הטלפון מהחוף, בין 17:00 ל־19:30', target: () => ({ x: 1030, z: 300, radius: 9999, name: 'חוף אזורה' }), photo: (p) => p.x > 1000 && p.x < 1110 && p.hour >= 17 && p.hour <= 19.5, done: 'אמא: איזו תמונה מהממת! תלתי אותה על המקרר ❤️' },
    ],
    unlocks: [],
  },
  {
    id: 'view', title: 'נוף מלמעלה', giver: 'roni', reward: 500,
    offer: 'אתגר: עלה במעלית לקומה 8 ומעלה באחד המגדלים במרכז העיר. לא תאמין איזה נוף יש משם.',
    steps: [
      { text: 'עלה לקומה 8 ומעלה במגדל במרכז העיר', target: () => { const b = findBuilding((q) => q.interior === 'tower', AZURA); return { ...doorOf(b), radius: 9999, name: 'מגדל במרכז העיר', tower: b }; },
        check: (g, t) => { const b = t.tower; const p = g.player; return p.y > 25 && Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2; }, done: 'רוני: אמרתי לך! מזה רואים עד המפרץ.' },
    ],
    unlocks: ['race'],
  },
  {
    id: 'race', title: 'מירוץ הגשר', giver: 'roni', reward: 1500,
    offer: 'מירוץ! מהטיילת של אזורה לצד השני של גשר המפרץ בפחות מ־60 שניות. מתאים לך?',
    steps: [
      { text: 'סע לקו הזינוק בטיילת (קצה הגשר)', target: () => ({ x: 1004, z: 502, radius: 10, name: 'קו הזינוק' }), cond: (g) => g.player.state === 'driving', done: 'רוני: 3... 2... 1... סע!', startTimer: true },
      { text: 'הגע לקצה השני של הגשר תוך 60 שניות', target: () => ({ x: 2002, z: 502, radius: 14, name: 'קו הסיום' }), cond: (g) => g.player.state === 'driving', timeLimit: 60, done: 'רוני: זמן מטורף! אתה אגדה.' },
    ],
    unlocks: [],
  },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.state = {}; // id -> 'available' | 'active' | 'done'
    this.active = null; this.step = 0; this.timer = null;
    this.threads = {};  // contact -> [{ from, text }]
    this.unread = {};
    this.replies = {};  // contact -> [{ text, action }]
    this.lastPhoto = null;
  }
  toJSON() { return { state: this.state, active: this.active, step: this.step, threads: this.threads, unread: this.unread }; }
  load(o) {
    this.state = o?.state || {}; this.active = o?.active || null; this.step = o?.step || 0; this.threads = o?.threads || {}; this.unread = o?.unread || {};
    this.replies = {}; this.timer = null;
    for (const m of MISSIONS) if (this.state[m.id] === 'available') this._offerReplies(m);
    if (this.active) this._target();
  }
  start() {
    if (!Object.keys(this.state).length) {
      this.state.airport = 'available';
      this.message('roni', 'ברוך הבא לאזורה! 📱 זה הטלפון שלך — מפה, הודעות, מוסיקה והכול.');
      this._offer(MISSIONS[0]);
      this.message('mom', 'תשמור על עצמך ותאכל משהו, כן? יש פלאפל מעולה בכיכר.');
    }
  }

  message(contact, text, from = 'them') {
    (this.threads[contact] ||= []).push({ from, text });
    if (from === 'them') { this.unread[contact] = (this.unread[contact] || 0) + 1; this.game.phone?.notify(CONTACTS[contact].name, text); }
  }
  _offer(m) { this.message(m.giver, m.offer); this._offerReplies(m); }
  _offerReplies(m) {
    this.replies[m.giver] = [
      { text: 'בטח, אני בדרך', action: () => this.accept(m.id) },
      { text: 'אולי אחר כך', action: () => this.message(m.giver, 'אין בעיה, תכתוב לי כשתתפנה.') },
    ];
  }
  reply(contact, i) {
    const r = this.replies[contact]?.[i];
    if (!r) return;
    this.message(contact, r.text, 'me');
    delete this.replies[contact];
    setTimeout(() => r.action(), 600);
  }
  accept(id) {
    if (this.active && this.active !== id) { this.message(MISSIONS.find((m) => m.id === id).giver, 'נראה שאתה עסוק במשימה אחרת. סיים אותה קודם.'); this._offerReplies(MISSIONS.find((m) => m.id === id)); return; }
    this.active = id; this.step = 0; this.state[id] = 'active'; this.timer = null;
    this._target();
    this.game.toast(`משימה: ${this.def().title}`, 3);
  }
  abandon() {
    if (!this.active) return;
    const m = this.def(); this.state[m.id] = 'available'; this.active = null; this.timer = null; this.game.gps.clear();
    this._offerReplies(m);
  }
  def() { return MISSIONS.find((m) => m.id === this.active); }
  objective() { const m = this.def(); return m ? m.steps[this.step] : null; }
  _target() {
    const st = this.objective(); if (!st) return;
    this.tgt = st.target();
    if (this.tgt.radius < 1000) this.game.gps.set({ ...this.tgt, mission: true }, this.game.playerPos());
    else this.game.gps.set({ ...this.tgt, radius: 15, mission: true }, this.game.playerPos());
  }
  onPhoto(p) {
    this.lastPhoto = p;
    const st = this.objective();
    if (st?.photo && st.photo(p)) this._advance();
    else if (st?.photo) this.game.toast('התמונה נשמרה — אבל זה לא המקום או השעה שאמא ביקשה', 2.5);
  }
  update(dt) {
    if (!this.active) return;
    const st = this.objective(), g = this.game, p = g.playerPos();
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const m = this.def();
        this.message(m.giver, 'נגמר הזמן... ננסה שוב?');
        this.step = 0; this.timer = null; this._target();
        return;
      }
    }
    if (st.photo) return;
    if (st.check) { if (st.check(g, this.tgt)) this._advance(); return; }
    if (Math.hypot(p.x - this.tgt.x, p.z - this.tgt.z) < this.tgt.radius && (!st.cond || st.cond(g))) this._advance();
  }
  _advance() {
    const m = this.def(), st = this.objective();
    if (st.done) this.message(m.giver, st.done);
    if (st.startTimer) this.timer = m.timeLimit || m.steps[this.step + 1]?.timeLimit || 60;
    this.step++;
    if (this.step >= m.steps.length) {
      this.state[m.id] = 'done'; this.active = null; this.timer = null; this.game.gps.clear();
      this.game.econ.earn(m.reward, m.title);
      this.game.toast(`המשימה הושלמה! +${fmt(m.reward)}`, 4);
      for (const id of m.unlocks) if (!this.state[id]) { this.state[id] = 'available'; setTimeout(() => this._offer(MISSIONS.find((q) => q.id === id)), 4000); }
      this.game.save();
      return;
    }
    if (this.timer === null && this.objective().timeLimit) this.timer = this.objective().timeLimit;
    this._target();
  }
}
