// Your own barbershop: open it, design it, buy furniture and equipment, hire barbers, run work days,
// earn money and build a reputation. Every client the player serves is a real haircut with a real check.
import { ctx } from './context.js';
import { progress, RANKS } from './progress.js';
import { session } from './session.js';
import { generateClient } from '../data/clients.js';
import { applyDecor } from '../scene/shopDecor.js';
import { TOOLS } from '../tools/tools.js';
import { mulberry32 } from '../hair/scalp.js';

const D = progress.data;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const OPEN_COST = 800, OPEN_RANK = 3;
const CAPACITY = [0, 2, 3, 5]; // working stations per shop level (small shop: you + one more chair)

export const CATALOG = [
  // stations & furniture
  { id: 'chair_classic', cat: 'furniture', name: 'כיסא ספרים קלאסי', price: 400, stars: 3, station: true, desc: 'עמדת עבודה נוספת (כיסא, שיש ומראה). מאפשרת להעסיק ספר נוסף.' },
  { id: 'chair_premium', cat: 'furniture', name: 'כיסא ספרים פרימיום', price: 900, stars: 5, station: true, rating: 0.1, desc: 'עמדה נוספת עם כיסא עור הידראולי. לקוחות מרגישים את ההבדל: +0.1 לדירוג.' },
  { id: 'mirror_led', cat: 'furniture', name: 'מראה עם תאורת LED', price: 350, stars: 4, rating: 0.05, desc: 'מסגרת מוארת למראה הראשית. נראה מקצועי ומאיר את העבודה.' },
  { id: 'sofa', cat: 'furniture', name: 'ספת המתנה ושולחן', price: 300, stars: 3, queue: 2, desc: 'עוד מקום בהמתנה: +2 לקוחות ביום.' },
  { id: 'coffee', cat: 'furniture', name: 'מכונת קפה ללקוחות', price: 250, stars: 3, rating: 0.05, desc: 'קפה בזמן ההמתנה: לקוחות סבלניים ומרוצים יותר.' },
  { id: 'plants', cat: 'furniture', name: 'צמחייה ועיצוב', price: 120, stars: 2, rating: 0.02, desc: 'אווירה נעימה וירוקה במספרה.' },
  { id: 'neon', cat: 'furniture', name: 'שלט ניאון עם שם המספרה', price: 280, stars: 4, marketing: 1, desc: 'שיווק: +1 לקוח ביום. השם שלך מואר על הקיר.' },
  { id: 'lights', cat: 'furniture', name: 'תאורה מקצועית', price: 400, stars: 4, rating: 0.05, desc: 'תאורה חזקה ואחידה — רואים כל קו בעבודה.' },
  { id: 'sterilizer', cat: 'equipment', name: 'ארון חיטוי UV', price: 450, stars: 5, desc: 'הכלים מחוטאים אוטומטית לפני כל לקוח במספרה שלך.' },
  // equipment (changes how the tools cut)
  { id: 'clipper_pro', cat: 'equipment', name: 'מכונה מקצועית — להב נירוסטה', price: 600, stars: 5, desc: 'להב חד ומדויק: שולי התנועה נקיים יותר, פחות שערות שנשארות בקצוות.' },
  { id: 'trimmer_pro', cat: 'equipment', name: 'טרימר Zero-Gap מקצועי', price: 400, stars: 4, desc: 'קווי מתאר חדים יותר.' },
  { id: 'scissors_pro', cat: 'equipment', name: 'מספריים יפניות', price: 700, stars: 5, desc: 'פלדה יפנית: גזירה נקייה ומדויקת על המסרק.' },
  { id: 'duster_pro', cat: 'equipment', name: 'מברשת צוואר רכה ורחבה', price: 150, stars: 3, desc: 'מנקה שטח גדול יותר בכל תנועה.' },
  // upgrades
  { id: 'level2', cat: 'upgrade', name: 'הרחבה: מספרה בינונית (3 עמדות)', price: 1500, stars: 4, level: 2, desc: 'עוד מקום לעמדות ולעובדים. המחיר לתספורת עולה ב־15%.' },
  { id: 'level3', cat: 'upgrade', name: 'מספרה גדולה (5 עמדות)', price: 3500, stars: 5, level: 3, needs: 'level2', desc: 'מספרה מובילה: עד 5 עמדות, ותספורת יקרה יותר ב־30%.' },
];
const CAT_NAMES = { furniture: 'ריהוט ועיצוב', equipment: 'ציוד מקצועי', upgrade: 'הרחבת המספרה' };
const WALLS = ['#26332f', '#1f2733', '#3a2a24', '#2b2b2e', '#5a4636', '#e8e2d6', '#3b1f2b'];
const FLOORS = [['checker', 'משבצות שחור-לבן'], ['wood', 'פרקט עץ'], ['marble', 'שיש'], ['concrete', 'בטון מוחלק']];
const LEATHERS = ['#4a1414', '#141414', '#5a3a1c', '#1c2f4a', '#2f4a2a'];
const NAMES = ['אלון', 'שחר', 'ליאור', 'גיא', 'מורן', 'עדי', 'רז', 'טל', 'נוי', 'אופיר'];

function state() {
  D.shop ||= { owned: false };
  const s = D.shop;
  s.items ||= {}; s.theme ||= { wall: WALLS[0], floor: 'checker', leather: LEATHERS[0] };
  s.level ??= 1; s.stations ??= 1; s.employees ||= []; s.ledger ||= []; s.reviews ||= []; s.day ??= 0;
  s.queue ||= []; s.today ||= null; s.candidates ||= null;
  s.rating = s.reviews.length ? s.reviews.reduce((a, b) => a + b, 0) / s.reviews.length : 3;
  return s;
}
const ratingBonus = (s) => CATALOG.filter((c) => s.items[c.id] && c.rating).reduce((a, c) => a + c.rating, 0);
const effRating = (s) => Math.min(5, s.rating + ratingBonus(s));
const priceMult = (s) => (1 + 0.15 * (s.level - 1)) * (0.8 + 0.1 * effRating(s));
const rent = (s) => [0, 80, 150, 260][s.level];
function clientsPerDay(s) {
  let n = 2 + Math.round(effRating(s) - 2.5) + s.stations;
  for (const c of CATALOG) if (s.items[c.id]) n += (c.queue || 0) + (c.marketing || 0);
  return Math.max(2, Math.min(12, n));
}
function addReview(s, stars) { s.reviews.push(stars); if (s.reviews.length > 30) s.reviews.shift(); s.rating = s.reviews.reduce((a, b) => a + b, 0) / s.reviews.length; }
function refreshDecor() { applyDecor(ctx.shop, state(), ctx.tools, TOOLS); }

// ================================================================ UI
let tab = 'day';
export function openShop(t = tab) {
  tab = t;
  const s = state();
  if (!s.owned) return renderClosed(s);
  const tabs = [['day', '📅 יום עבודה'], ['store', '🛒 ציוד וריהוט'], ['design', '🎨 עיצוב'], ['staff', '👥 צוות'], ['money', '💰 כספים']];
  const head = `<div class="shop-head"><div><h3>${esc(s.name)}</h3><div class="muted small">יום ${s.day} · ${['', 'מספרה קטנה', 'מספרה בינונית', 'מספרה גדולה'][s.level]} · ${s.stations} עמדות · ${s.employees.length} עובדים</div></div>
    <div class="shop-rating">★ ${effRating(s).toFixed(1)}<small>${s.reviews.length} ביקורות</small></div><div class="coins"><span>🪙</span><b>${D.coins}</b></div></div>
    <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
    <button class="btn ghost sm" id="btnTour">👁 סיור במספרה (תלת־ממד)</button>`;
  const body = { day: dayTab, store: storeTab, design: designTab, staff: staffTab, money: moneyTab }[tab](s);
  ctx.openSheet('המספרה שלי', head + body, {
    back: ctx.showHub,
    mount: (b) => {
      b.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => openShop(el.dataset.tab)));
      b.querySelector('#btnTour').addEventListener('click', tour);
      MOUNT[tab]?.(b, s);
    },
  });
}

function renderClosed(s) {
  const r = progress.rank;
  const rankOk = r.id >= OPEN_RANK, coinOk = D.coins >= OPEN_COST;
  ctx.openSheet('המספרה שלי', `
    <div class="illu-wrap">💈</div>
    <p>אחרי שלמדת את הבסיס — הגיע הזמן לפתוח מספרה משלך! תבחר שם ועיצוב, תקנה כיסאות, מראות וציוד, תקבל לקוחות, תעסיק ספרים ותנהל הכנסות והוצאות.</p>
    <ul class="req-list"><li class="${rankOk ? 'ok-text' : 'bad-text'}">${rankOk ? '✓' : '✗'} דרגת ${RANKS[OPEN_RANK - 1].name} (יש לך: ${r.name})</li>
    <li class="${coinOk ? 'ok-text' : 'bad-text'}">${coinOk ? '✓' : '✗'} ${OPEN_COST} 🪙 לפתיחה (יש לך: ${D.coins})</li></ul>
    ${rankOk && coinOk ? `<input id="shopName" class="text-input" maxlength="22" placeholder="שם המספרה (למשל: Fade Kings)" />
      <button class="btn primary" id="btnOpenShop">💈 פתח את המספרה (${OPEN_COST} 🪙)</button>`
    : '<p class="muted">מרוויחים XP ומטבעות בשיעורים, במעבדה, אצל לקוחות ובאתגר היומי.</p>'}`,
  {
    back: ctx.showHub,
    mount: (b) => b.querySelector('#btnOpenShop')?.addEventListener('click', () => {
      const name = b.querySelector('#shopName').value.trim();
      if (!name) { b.querySelector('#shopName').focus(); ctx.toast('בחר שם למספרה'); return; }
      if (!progress.spend(OPEN_COST)) return;
      Object.assign(s, { owned: true, name, day: 0, opened: new Date().toISOString().slice(0, 10) });
      progress.save();
      refreshDecor();
      const a = progress.unlock('openShop');
      openShop('design');
      ctx.toast(`💈 ${name} נפתחה!${a ? ` 🏆 ${a.name}` : ''}`, 3500);
    }),
  });
}

const MOUNT = {};

function dayTab(s) {
  if (!s.today) {
    return `<div class="day-card"><h3>יום ${s.day + 1}</h3><p>צפי: <b>${clientsPerDay(s)}</b> לקוחות · מחיר ממוצע לתספורת ×${priceMult(s).toFixed(2)} · שכירות ${rent(s)} 🪙 · משכורות ${s.employees.reduce((a, e) => a + e.salary, 0)} 🪙</p>
      <p class="muted small">אתה מספר בעצמך כל לקוח שתבחר. העובדים שלך משרתים לקוחות מהתור כשאתה לוחץ "הצוות משרת" או אחרי כל לקוח שלך.</p>
      <button class="btn primary" id="btnOpenDay">🔓 פתח יום עבודה</button></div>`;
  }
  const t = s.today;
  const q = s.queue.map((c, i) => `<div class="q-item"><span class="q-n">${i + 1}</span><div><b>${esc(c.name)}</b><small>${esc(c.base.he)} · שיער ${esc(c.preset.hairType)} · ${Math.round(c.price * priceMult(s))} 🪙</small></div></div>`).join('') || '<p class="muted">התור ריק — כל הלקוחות קיבלו שירות!</p>';
  return `<div class="day-card"><h3>יום ${s.day} — המספרה פתוחה</h3>
    <div class="day-stats"><span>שירתת: <b>${t.mine}</b></span><span>הצוות: <b>${t.staff}</b></span><span>הכנסות: <b>${t.income} 🪙</b></span><span>★ היום: <b>${t.stars.length ? (t.stars.reduce((a, b) => a + b, 0) / t.stars.length).toFixed(1) : '-'}</b></span></div>
    <h4>בתור (${s.queue.length})</h4><div class="queue">${q}</div>
    <div class="row">${s.queue.length ? '<button class="btn primary" id="btnServe">✂️ שרת את הלקוח הבא</button>' : ''}
    ${s.queue.length && s.employees.length ? '<button class="btn ghost" id="btnStaff">👥 הצוות משרת</button>' : ''}
    <button class="btn ghost" id="btnClose">🔒 סגור את היום</button></div>
    ${t.log.length ? `<details class="zones"><summary>יומן היום</summary><ul>${t.log.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>` : ''}</div>`;
}
MOUNT.day = (b, s) => {
  b.querySelector('#btnOpenDay')?.addEventListener('click', () => { openDay(s); openShop('day'); });
  b.querySelector('#btnServe')?.addEventListener('click', () => serveNext(s));
  b.querySelector('#btnStaff')?.addEventListener('click', () => { staffRound(s); progress.save(); openShop('day'); });
  b.querySelector('#btnClose')?.addEventListener('click', () => closeDay(s));
};

export function openDay(s = state()) {
  s.day++;
  const rng = mulberry32(s.day * 7919 + D.xp);
  const n = clientsPerDay(s);
  s.queue = [];
  for (let i = 0; i < n; i++) {
    const c = generateClient({ seed: Math.floor(rng() * 1e9), maxDifficulty: Math.min(5, progress.rank.id + 1) });
    s.queue.push(c);
  }
  s.today = { mine: 0, staff: 0, income: 0, stars: [], log: [] };
  progress.save();
}

function serveNext(s) {
  const c = s.queue.shift();
  progress.save();
  ctx.startClient(c, {
    title: `${s.name}: ${c.name}`,
    onEnd: (res) => {
      const fb = res.feedback;
      const pay = Math.round(c.price * priceMult(s) * (0.3 + 0.7 * res.overall / 100));
      const tip = fb.stars >= 5 ? 25 : fb.stars >= 4 ? 12 : 0;
      progress.reward(10 + res.overall * 0.5, pay + tip);
      D.stats.clients++;
      progress.recordHaircut(c.base.id, res.overall, 'client');
      addReview(s, fb.stars);
      s.today.mine++; s.today.income += pay + tip; s.today.stars.push(fb.stars);
      s.today.log.push(`${c.name}: ${c.base.he} — ${'★'.repeat(fb.stars)} (${pay + tip} 🪙)`);
      if (fb.stars >= 4) progress.unlock('happyClient');
      if (D.stats.clients >= 10) progress.unlock('tenClients');
      const staffLines = staffRound(s);
      progress.save();
      refreshDecor();
      return { title: `${c.name} שילם ויצא`, lines: [`${fb.mood} ${'★'.repeat(fb.stars)}${'☆'.repeat(5 - fb.stars)} — ${fb.text}`, `הכנסה: ${pay} 🪙${tip ? ` + טיפ ${tip}` : ''}`, `דירוג המספרה: ★ ${effRating(s).toFixed(1)}`, ...staffLines], reopen: () => openShop('day') };
    },
  });
  if (s.items.sterilizer) session.disinfect();
}

/** Each employee serves one client from the queue. Quality depends on skill. */
function staffRound(s) {
  const lines = [];
  for (const e of s.employees) {
    const c = s.queue.shift();
    if (!c) break;
    const q = Math.max(30, Math.min(99, 48 + e.skill * 9 + (Math.random() - 0.5) * 16 - c.base.difficulty * 3));
    const stars = q >= 90 ? 5 : q >= 78 ? 4 : q >= 64 ? 3 : q >= 50 ? 2 : 1;
    const pay = Math.round(c.price * priceMult(s) * (0.3 + 0.7 * q / 100));
    progress.reward(0, pay);
    addReview(s, stars);
    s.today.staff++; s.today.income += pay; s.today.stars.push(stars);
    const l = `${e.name} (עובד) — ${c.name}: ${c.base.he}, ${'★'.repeat(stars)} (${pay} 🪙)`;
    s.today.log.push(l); lines.push(l);
  }
  return lines;
}

function closeDay(s) {
  const t = s.today;
  const left = s.queue.length;
  const salaries = s.employees.reduce((a, e) => a + e.salary, 0);
  const supplies = (t.mine + t.staff) * 5;
  const expenses = rent(s) + salaries + supplies;
  D.coins -= expenses;
  for (let i = 0; i < left; i++) addReview(s, 3); // people who waited for nothing leave a lukewarm review
  const profit = t.income - expenses;
  s.ledger.unshift({ day: s.day, income: t.income, expenses, profit, clients: t.mine + t.staff, left, rating: +effRating(s).toFixed(2) });
  s.ledger.length = Math.min(s.ledger.length, 30);
  const lines = [`לקוחות: ${t.mine} שלך + ${t.staff} של הצוות${left ? ` · ${left} עזבו בלי תספורת` : ''}`, `הכנסות: ${t.income} 🪙`,
    `הוצאות: ${expenses} 🪙 (שכירות ${rent(s)}, משכורות ${salaries}, חומרים ${supplies})`, `${profit >= 0 ? '📈 רווח' : '📉 הפסד'}: ${profit} 🪙`, `דירוג המספרה: ★ ${effRating(s).toFixed(1)}`];
  if (!left && t.mine + t.staff >= 3) { const a = progress.unlock('fullDay'); if (a) lines.push(`🏆 הישג: ${a.name}`); }
  if (D.coins < 0) lines.push('⚠️ היתרה שלילית. כדאי לשרת יותר לקוחות לפני שמגייסים עוד עובדים.');
  s.today = null; s.queue = [];
  progress.save();
  refreshDecor();
  ctx.goHub?.({ title: `סיכום יום ${s.day}`, lines, reopen: () => openShop('money') });
}

function storeTab(s) {
  const cap = CAPACITY[s.level];
  return Object.keys(CAT_NAMES).map((cat) => `<h3 class="grp">${CAT_NAMES[cat]}</h3><div class="store">${CATALOG.filter((c) => c.cat === cat).map((c) => {
    const owned = c.station ? false : !!s.items[c.id];
    let why = '';
    if (c.station && s.stations >= cap) why = 'אין מקום לעמדה נוספת — הרחב את המספרה';
    if (c.needs && !s.items[c.needs]) why = 'צריך קודם את ההרחבה הקודמת';
    if (c.level && s.level >= c.level) return `<div class="store-item owned"><b>${c.name}</b><small>${c.desc}</small><span class="stars">${'★'.repeat(c.stars)}</span><span class="ok-text">✓ בוצע</span></div>`;
    return `<div class="store-item ${owned ? 'owned' : ''}"><b>${c.name}</b><small>${c.desc}</small><span class="stars">${'★'.repeat(c.stars)}${'☆'.repeat(5 - c.stars)}</span>
      ${owned ? '<span class="ok-text">✓ ברשותך</span>' : why ? `<span class="lock">${why}</span>` : `<button class="btn ${D.coins >= c.price ? 'primary' : 'ghost'} sm" data-buy="${c.id}">קנה · ${c.price} 🪙</button>`}</div>`;
  }).join('')}</div>`).join('');
}
MOUNT.store = (b, s) => b.querySelectorAll('[data-buy]').forEach((el) => el.addEventListener('click', () => buy(s, el.dataset.buy)));

export function buy(s, id) {
  const c = CATALOG.find((x) => x.id === id);
  if (!c) return false;
  if (!progress.spend(c.price)) { ctx.toast(`חסרים ${c.price - D.coins} 🪙`); return false; }
  if (c.station) { s.stations++; s.items[id] = (s.items[id] || 0) + 1; }
  else if (c.level) s.level = c.level;
  else s.items[id] = true;
  if (c.level) s.items[id] = true;
  progress.save();
  refreshDecor();
  ctx.toast(`🛒 קנית: ${c.name}`);
  openShop('store');
  return true;
}

function designTab(s) {
  return `<h3 class="grp">שם המספרה</h3><div class="row"><input id="shopRename" class="text-input" maxlength="22" value="${esc(s.name)}" /><button class="btn ghost sm" id="btnRename">שמירה</button></div>
    <h3 class="grp">צבע הקירות</h3><div class="swatches">${WALLS.map((w) => `<button class="swatch ${s.theme.wall === w ? 'active' : ''}" data-wall="${w}" style="background:${w}" aria-label="${w}"></button>`).join('')}</div>
    <h3 class="grp">ריצפה</h3><div class="chips">${FLOORS.map(([k, n]) => `<button class="chip-btn ${s.theme.floor === k ? 'active' : ''}" data-floor="${k}">${n}</button>`).join('')}</div>
    <h3 class="grp">עור הכיסאות</h3><div class="swatches">${LEATHERS.map((w) => `<button class="swatch ${s.theme.leather === w ? 'active' : ''}" data-leather="${w}" style="background:${w}" aria-label="${w}"></button>`).join('')}</div>
    <p class="muted small">השינויים מופיעים מיד במספרה התלת־ממדית. לחץ "סיור במספרה" כדי לראות.</p>`;
}
MOUNT.design = (b, s) => {
  const set = (k, v) => { s.theme[k] = v; progress.save(); refreshDecor(); openShop('design'); };
  b.querySelectorAll('[data-wall]').forEach((el) => el.addEventListener('click', () => set('wall', el.dataset.wall)));
  b.querySelectorAll('[data-floor]').forEach((el) => el.addEventListener('click', () => set('floor', el.dataset.floor)));
  b.querySelectorAll('[data-leather]').forEach((el) => el.addEventListener('click', () => set('leather', el.dataset.leather)));
  b.querySelector('#btnRename').addEventListener('click', () => { const v = b.querySelector('#shopRename').value.trim(); if (v) { s.name = v; progress.save(); refreshDecor(); ctx.toast('השם עודכן'); openShop('design'); } });
};

function staffTab(s) {
  const maxStaff = s.stations - 1;
  if (!s.candidates) {
    const rng = mulberry32(Date.now() % 1e9);
    s.candidates = Array.from({ length: 3 }, (_, i) => { const skill = 2 + Math.floor(rng() * 4); return { id: `e${Date.now()}${i}`, name: NAMES[Math.floor(rng() * NAMES.length)], skill, salary: 40 + skill * 30 }; });
  }
  const emp = s.employees.map((e) => `<div class="store-item"><b>✂️ ${esc(e.name)}</b><small>מיומנות ${'★'.repeat(e.skill)}${'☆'.repeat(5 - e.skill)} · משכורת ${e.salary} 🪙 ליום</small><button class="btn ghost sm" data-fire="${e.id}">פיטורים</button></div>`).join('') || '<p class="muted">עוד אין עובדים.</p>';
  const cand = s.candidates.map((e) => `<div class="store-item"><b>${esc(e.name)}</b><small>מיומנות ${'★'.repeat(e.skill)}${'☆'.repeat(5 - e.skill)} · משכורת ${e.salary} 🪙 ליום · דמי גיוס ${e.salary * 2} 🪙</small>
    ${s.employees.length >= maxStaff ? '<span class="lock">צריך עמדה פנויה — קנה כיסא</span>' : `<button class="btn primary sm" data-hire="${e.id}">גייס</button>`}</div>`).join('');
  return `<p class="muted">כל עובד צריך עמדה (כיסא). עובד מיומן משרת טוב יותר — והדירוג שלך עולה. משכורות משולמות בסוף כל יום.</p>
    <h3 class="grp">העובדים שלך (${s.employees.length}/${maxStaff})</h3><div class="store">${emp}</div>
    <h3 class="grp">מועמדים</h3><div class="store">${cand}</div>`;
}
MOUNT.staff = (b, s) => {
  b.querySelectorAll('[data-hire]').forEach((el) => el.addEventListener('click', () => {
    const e = s.candidates.find((x) => x.id === el.dataset.hire);
    if (!progress.spend(e.salary * 2)) { ctx.toast('אין מספיק מטבעות לדמי הגיוס'); return; }
    s.employees.push(e); s.candidates = s.candidates.filter((x) => x !== e); progress.save(); ctx.toast(`${e.name} הצטרף לצוות!`); openShop('staff');
  }));
  b.querySelectorAll('[data-fire]').forEach((el) => el.addEventListener('click', () => { s.employees = s.employees.filter((x) => x.id !== el.dataset.fire); progress.save(); openShop('staff'); }));
};

function moneyTab(s) {
  const rows = s.ledger.map((l) => `<tr><td>${l.day}</td><td>${l.clients}</td><td>${l.income}</td><td>${l.expenses}</td><td class="${l.profit >= 0 ? 'ok-text' : 'bad-text'}">${l.profit}</td><td>★${l.rating.toFixed(1)}</td></tr>`).join('');
  const tot = s.ledger.reduce((a, l) => a + l.profit, 0);
  return `<div class="day-stats"><span>יתרה: <b>${D.coins} 🪙</b></span><span>רווח מצטבר: <b>${tot} 🪙</b></span><span>דירוג: <b>★ ${effRating(s).toFixed(1)}</b></span><span>לקוחות ביום: <b>${clientsPerDay(s)}</b></span></div>
    <p class="muted small">מוניטין גבוה = יותר לקוחות ומחיר גבוה יותר. הדירוג הוא ממוצע 30 הביקורות האחרונות, ועוד בונוס מריהוט ותאורה.</p>
    ${rows ? `<table class="ledger"><tr><th>יום</th><th>לקוחות</th><th>הכנסות</th><th>הוצאות</th><th>רווח</th><th>דירוג</th></tr>${rows}</table>` : '<p class="muted">עוד לא נסגר יום עבודה.</p>'}`;
}

function tour() {
  session.start({ kind: 'view', title: `סיור: ${state().name}`, subtitle: 'גרור כדי להסתובב. ⌂ חוזר לתפריט.', spec: null, head: { preset: { id: 'tour', name: 'לקוח', hairType: 'חלק', color: '#3a281d', curlAmp: 0, curlFreq: 0, width: 0.00115, lengths: { top: 40, crown: 36, side: 14, back: 14, nape: 8 } } } });
  ctx.enter3D();
  ctx.cam.setOverview(true);
}

export function initShop() {
  state();
  refreshDecor();
  ctx.registerHubCard({
    go: 'shop', icon: '💈', title: 'המספרה שלי',
    sub: () => { const s = state(); return s.owned ? `${s.name} · ★ ${effRating(s).toFixed(1)}${s.today ? ' · פתוח עכשיו' : ''}` : `נפתח בדרגת ${RANKS[OPEN_RANK - 1].name}`; },
  }, () => openShop());
  ctx.refreshDecor = refreshDecor;
}
export { state as shopState };
