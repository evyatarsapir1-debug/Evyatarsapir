// Your barbershops in the city: real estate (rent / buy), furnishing and design, staff with pay terms and morale,
// clients who walk in by themselves, reviews and returning customers, daily accounts, and the chain overview.
import * as THREE from 'three';
import { ctx } from '../game/context.js';
import { progress } from '../game/progress.js';
import { PROPERTIES, HOMES } from './worldData.js';
import { CATALOG } from '../game/shopManager.js';
import { signTex } from './cityBuilder.js';
import { buildPerson, randomLook } from './people.js';
import { mulberry32 } from '../hair/scalp.js';
import { PERSON_NAMES } from './npcs.js';

const D = progress.data;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
const WALLS = ['#26332f', '#1f2733', '#3a2a24', '#2b2b2e', '#5a4636', '#e8e2d6', '#3b1f2b'];
const FLOORS = [['checker', 'משבצות'], ['wood', 'פרקט'], ['marble', 'שיש'], ['concrete', 'בטון']];
const LEATHERS = ['#4a1414', '#141414', '#5a3a1c', '#1c2f4a', '#2f4a2a'];
const market = (skill) => 40 + skill * 30;
const prop = (id) => PROPERTIES.find((p) => p.id === id);

export const business = {
  init(life, world) { this.life = life; this.world = world; },

  newBranch(p, mode) {
    return {
      propId: p.id, mode, name: `המספרה של ${D.profile.name || 'הספר'}`, theme: { wall: WALLS[0], floor: 'checker', leather: LEATHERS[0] },
      items: {}, stations: 0, employees: [], reviews: [], ledger: [], open: true, customers: {}, referrals: 0, candidates: null,
      today: { income: 0, served: 0, staff: 0, lost: 0 }, openedDay: this.life.state.day,
    };
  },

  migrateLegacy(shop) {
    const p = prop('p1');
    const br = this.newBranch(p, 'own');
    br.name = shop.name || br.name;
    if (shop.theme) br.theme = { ...br.theme, ...shop.theme };
    for (const [k, v] of Object.entries(shop.items || {})) if (!['level2', 'level3'].includes(k)) br.items[k] = v;
    br.stations = Math.min(p.stations, shop.stations || 1);
    br.employees = (shop.employees || []).slice(0, Math.max(0, br.stations - 1)).map((e) => ({ ...e, commission: 0.1, morale: 65, served: 0 }));
    br.reviews = (shop.reviews || []).slice(-30);
    this.life.state.branches[p.id] = br;
    shop.migrated = true; shop.owned = false;
    progress.save();
  },

  rating(br) {
    const base = br.reviews.length ? br.reviews.reduce((a, b) => a + b, 0) / br.reviews.length : 3.5;
    const bonus = CATALOG.filter((c) => br.items[c.id] && c.rating).reduce((a, c) => a + c.rating, 0);
    return Math.min(5, base + bonus);
  },
  priceMult(br) { return (0.75 + 0.1 * this.rating(br)) * (1 + 0.08 * (prop(br.propId).traffic - 3)); },
  arrivalRate(br) {
    const p = prop(br.propId);
    let r = (0.012 + 0.008 * p.traffic) * (0.55 + 0.18 * (this.rating(br) - 2.5)) * (1 + Math.min(1, br.referrals * 0.1));
    if (br.items.neon) r *= 1.15;
    return Math.max(0.006, r);
  },
  dailyCost(br) {
    const p = prop(br.propId);
    return (br.mode === 'rent' ? p.rent : 0) + 15 + 8 * br.stations + br.employees.reduce((a, e) => a + e.salary, 0);
  },
  addReview(br, s) { br.reviews.push(s); if (br.reviews.length > 30) br.reviews.shift(); },

  /** Returning customers: satisfied ones come back and bring friends. */
  pickCustomer(br) {
    const list = Object.entries(br.customers).filter(([, c]) => !c.lost && c.sat >= 3);
    if (list.length && Math.random() < 0.35) {
      const [seed, c] = list[Math.floor(Math.random() * list.length)];
      return { name: c.name, seed: +seed + c.visits, customer: c, custKey: seed };
    }
    return {};
  },

  playerServed(br, npc, c, res) {
    const fb = res.feedback;
    const price = c.price * this.priceMult(br);
    const pay = Math.round(price * (0.3 + 0.7 * res.overall / 100));
    const tip = fb.stars >= 5 ? 25 : fb.stars >= 4 ? 12 : 0;
    progress.reward(10 + res.overall * 0.5, pay + tip);
    D.stats.clients++;
    progress.recordHaircut(c.base.id, res.overall, 'client');
    if (fb.stars >= 4) progress.unlock('happyClient');
    this.addReview(br, fb.stars);
    br.today.income += pay + tip; br.today.served++;
    const key = npc.custKey || String(npc.seed);
    const cust = br.customers[key] ||= { name: npc.name, visits: 0, sat: 3 };
    cust.visits++; cust.sat = fb.stars;
    const lines = [`${fb.mood} ${stars(fb.stars)} — “${fb.text}”`, `תשלום: ${pay} 🪙${tip ? ` + טיפ ${tip}` : ''} · דירוג "${br.name}": ★ ${this.rating(br).toFixed(1)}`];
    if (fb.stars >= 4) { br.referrals += 1; lines.push(`😊 ${npc.name} ימליץ עליך לחברים — יותר לקוחות בימים הקרובים.`); }
    if (fb.stars <= 2) { cust.lost = true; lines.push(`😞 ${npc.name} כנראה לא יחזור. כל לקוח לא מרוצה פוגע במוניטין.`); }
    if (cust.visits > 1) lines.push(`🔁 לקוח חוזר (ביקור מספר ${cust.visits})`);
    progress.save();
    return { title: `${npc.name} שילם ויצא`, lines };
  },

  staffServed(br, npc, idx) {
    const e = br.employees[idx];
    if (!e) return;
    const q = THREE.MathUtils.clamp(42 + e.skill * 9 + (e.morale - 50) * 0.15 + (Math.random() - 0.5) * 18, 25, 99);
    const st = q >= 90 ? 5 : q >= 78 ? 4 : q >= 64 ? 3 : q >= 50 ? 2 : 1;
    const revenue = Math.round(70 * this.priceMult(br) * (0.3 + 0.7 * q / 100));
    const cut = Math.round(revenue * e.commission);
    progress.reward(0, revenue - cut);
    this.addReview(br, st);
    br.today.income += revenue - cut; br.today.staff++;
    e.served++; if (e.served % 25 === 0 && e.skill < 5) e.skill = Math.min(5, +(e.skill + 0.2).toFixed(1));
    if (st >= 4) br.referrals += 0.5;
    const key = String(npc.seed);
    const cust = br.customers[key] ||= { name: npc.name, visits: 0, sat: 3 };
    cust.visits++; cust.sat = st; if (st <= 2) cust.lost = true;
  },
  walkedOut(br) { this.addReview(br, 2); br.today.lost++; },

  dailyClose(br) {
    const p = prop(br.propId);
    const rent = br.mode === 'rent' ? p.rent : 0, bills = 15 + 8 * br.stations, salaries = br.employees.reduce((a, e) => a + e.salary, 0);
    const expenses = rent + bills + salaries;
    const t = br.today;
    br.ledger.unshift({ day: this.life.state.day - 1, income: t.income, expenses, profit: t.income - expenses, clients: t.served + t.staff, lost: t.lost, rating: +this.rating(br).toFixed(2) });
    br.ledger.length = Math.min(br.ledger.length, 30);
    const lines = [`💈 ${br.name}: הכנסות +${t.income} · הוצאות -${expenses} (${rent ? `שכירות ${rent}, ` : ''}חשבונות ${bills}${salaries ? `, משכורות ${salaries}` : ''})${t.lost ? ` · ${t.lost} לקוחות עזבו בלי תספורת` : ''}`];
    // staff morale follows pay; unhappy staff may quit
    for (const e of br.employees.slice()) {
      const target = THREE.MathUtils.clamp(50 + (e.salary / market(Math.floor(e.skill)) - 1) * 120 + e.commission * 120, 0, 100);
      e.morale += (target - e.morale) * 0.5;
      if (e.morale < 30 && Math.random() < 0.3) { br.employees = br.employees.filter((x) => x !== e); lines.push(`😠 ${e.name} התפטר/ה מ"${br.name}" בגלל תנאי העבודה.`); }
    }
    br.referrals *= 0.8;
    br.candidates = null;
    br.today = { income: 0, served: 0, staff: 0, lost: 0 };
    return { net: -expenses, lines };
  },

  /** Build the branch interior from what was bought. */
  furnish(br, b) {
    const city = this.world.city;
    city.furnishBarbershop(b, br.stations, br.theme.leather, false);
    const g = b.interior;
    // employees are live characters at their stations (ShopRuntime.syncStaff)
    br.employees.forEach((e, k) => { e.look ||= randomLook(mulberry32(e.name.length * 97 + k)); });
    const hw = b.w / 2;
    if (br.items.sofa) {
      const sofa = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 2), new THREE.MeshStandardMaterial({ color: br.theme.leather }));
      sofa.position.set(hw - 0.5, 0.36, 6); g.add(sofa);
      for (let k = 0; k < 2; k++) b.benchSeats.push({ world: b.toWorld(hw - 0.62, 5.5 + k * 0.9), rot: b.localRot(-Math.PI / 2) });
    }
    if (br.items.plants) for (const z of [1, b.d - 0.6]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 12), city.M.dark); pot.position.set(-hw + 0.5, 0.34, z); g.add(pot);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), city.M.leaf); leaf.position.set(-hw + 0.5, 0.95, z); g.add(leaf);
    }
    if (br.items.coffee) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.35), city.M.chrome); m.position.set(hw - 2.3, 1.4, b.d - 1.0); g.add(m); }
    if (br.items.mirror_led || br.items.lights) { for (const sp of b.stationSpots) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), city.M.panel); l.position.set(sp.local[0] - 0.85, 1.7, sp.local[1] + 0.45); g.add(l); } }
    b.facadeMat.color.set(br.theme.wall);
    if (b.sign) {
      const t = signTex(br.name.slice(0, 24), '#111', '#e7c983', `★ ${this.rating(br).toFixed(1)} · BARBER SHOP`);
      b.sign.material.map = t; b.sign.material.emissiveMap = t; b.sign.material.needsUpdate = true;
    }
    this.life.runtimes?.[br.propId]?.rebindSeats();
  },
  refurnish(br) { this.furnish(br, this.world.city.buildings[br.propId]); },

  // ================================================================ UI: real estate
  openRealty() {
    this.world.suspend();
    const s = this.life.state, career = this.life.career().id;
    const props = PROPERTIES.map((p) => {
      const mine = s.branches[p.id];
      return `<div class="store-item ${mine ? 'owned' : ''}"><b>🏷️ ${esc(p.name)}</b>
        <small>${p.stations} עמדות · תנועת לקוחות ${stars(p.traffic)} · שכירות ${p.rent} 🪙/יום (פיקדון ${p.rent * 7}) · מחיר קנייה ${p.price.toLocaleString('he-IL')} 🪙</small>
        ${mine ? `<span class="ok-text">✓ שלך: ${esc(mine.name)} (${mine.mode === 'own' ? 'בבעלות' : 'בשכירות'})</span>` : ''}
        <button class="btn ghost sm" data-wp="${p.id}">📍 סמן במפה וגש לבדוק</button></div>`;
    }).join('');
    const homes = HOMES.map((h) => `<div class="store-item ${s.home === h.id ? 'owned' : ''}"><b>🏠 ${h.name}</b><small>שכירות ${h.rent} 🪙/יום${h.deposit ? ` · פיקדון ${h.deposit}` : ''} · נוחות ${'★'.repeat(h.comfort)}</small>
      ${s.home === h.id ? '<span class="ok-text">✓ גר כאן</span>' : `<button class="btn primary sm" data-home="${h.id}">עבור לגור כאן</button>`}</div>`).join('');
    ctx.openSheet('🏢 משרד נדל״ן "העיר"', `
      <p>“שלום! כדי לפתוח מספרה צריך <b>ניסיון</b> (עבודה במספרה בעיר) ו<b>כסף לפיקדון</b>. כדאי לבקר בנכס לפני שחותמים — תיכנס, תסתכל ותבדוק את פרטי הנכס בפנים.”</p>
      <p class="muted small">הקריירה שלך: ${this.life.career().name} ${career >= 3 ? '✓ מספיק ניסיון לשכירות' : '✗ עדיין בלי ניסיון בעבודה'} · יתרה: ${D.coins.toLocaleString('he-IL')} 🪙</p>
      <h3 class="grp">חנויות להשכרה ולמכירה</h3><div class="store">${props}</div>
      <h3 class="grp">דירות</h3><div class="store">${homes}</div>`,
    {
      back: () => this.world.resume(),
      mount: (b) => {
        b.querySelectorAll('[data-wp]').forEach((el) => el.addEventListener('click', () => { const bd = this.world.city.buildings[el.dataset.wp]; this.world.resume(); this.world.setWaypoint({ ...bd.door, label: prop(el.dataset.wp).name }); }));
        b.querySelectorAll('[data-home]').forEach((el) => el.addEventListener('click', () => {
          const h = HOMES.find((x) => x.id === el.dataset.home);
          if (!progress.spend(h.deposit || 0)) { ctx.toast('אין מספיק מטבעות לפיקדון'); return; }
          s.home = h.id; progress.save();
          this.world.resume();
          this.world.setWaypoint({ ...this.world.city.buildings[h.id].door, label: h.name });
          ctx.toast(`🏠 עברת ל${h.name}! סימנתי לך אותה במפה.`, 3500);
        }));
      },
    });
  },

  openProperty(p) {
    const s = this.life.state, career = this.life.career().id;
    const deposit = p.rent * 7;
    const canRent = career >= 3, haveDeposit = D.coins >= deposit + p.rent, haveBuy = D.coins >= p.price;
    ctx.dialog({ title: `📋 ${p.name}`, html: `
      <ul class="reward-list"><li>גודל: <b>${p.stations} עמדות עבודה</b> (${p.w}×${p.d} מ׳)</li><li>מיקום: תנועת לקוחות ${stars(p.traffic)}</li>
      <li>שכירות: <b>${p.rent} 🪙 ליום</b> + חשבונות · פיקדון ${deposit} 🪙</li><li>קנייה: <b>${p.price.toLocaleString('he-IL')} 🪙</b> (בלי שכירות)</li></ul>
      <p class="muted small">אחרי החתימה החנות ריקה: צריך לקנות כיסא ומראה ולעצב אותה. לקוחות יתחילו להגיע לבד בשעות הפתיחה.</p>
      ${canRent ? '' : '<p class="bad-text">בעל הנכס: "אני משכיר רק לספר עם ניסיון. תעבוד קודם במספרה בעיר."</p>'}`,
    buttons: [
      { label: `✍️ חתום על חוזה שכירות (${deposit + p.rent} 🪙)`, primary: canRent && haveDeposit, disabled: !canRent || !haveDeposit, action: () => this.acquire(p, 'rent') },
      { label: `🏦 קנה את הנכס (${p.price.toLocaleString('he-IL')} 🪙)`, disabled: !canRent || !haveBuy, action: () => this.acquire(p, 'own') },
      { label: 'אחשוב על זה' }] });
    void s;
  },
  acquire(p, mode) {
    const cost = mode === 'rent' ? p.rent * 8 : p.price;
    if (!progress.spend(cost)) { ctx.toast('אין מספיק מטבעות'); return; }
    const br = this.newBranch(p, mode);
    this.life.state.branches[p.id] = br;
    this.life.addBranchRuntime(p.id);
    progress.unlock('openShop');
    progress.save();
    this.life.checkCareer();
    ctx.toast(mode === 'rent' ? `✍️ חתמת על חוזה! "${p.name}" שלך.` : `🏦 קנית את "${p.name}"!`, 3500);
    setTimeout(() => this.openManage(p.id, 'store'), 400);
  },

  // ================================================================ UI: managing a branch
  openManage(id, tab = 'overview') {
    this.world.suspend();
    const br = this.life.state.branches[id], p = prop(id);
    const rt = this.life.runtimes[id];
    const tabs = [['overview', '📊 סקירה'], ['store', '🛒 ציוד'], ['design', '🎨 עיצוב'], ['staff', '👥 צוות'], ['money', '💰 כספים']];
    const head = `<div class="shop-head"><div><h3>${esc(br.name)}</h3><div class="muted small">${esc(p.name)} · ${br.mode === 'own' ? 'בבעלותך' : `שכירות ${p.rent}/יום`} · ${br.stations}/${p.stations} עמדות</div></div>
      <div class="shop-rating">★ ${this.rating(br).toFixed(1)}<small>${br.reviews.length} ביקורות</small></div><div class="coins"><span>🪙</span><b>${D.coins.toLocaleString('he-IL')}</b></div></div>
      <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'overview') {
      const t = br.today;
      body = `<div class="day-card">
        <div class="day-stats"><span>${rt.open ? '🟢 פתוח' : '🔴 סגור'} (9:00–19:00)</span><span>מחכים: <b>${rt.waiting.length}</b></span><span>היום: <b>${t.income} 🪙</b></span><span>שירתת: <b>${t.served}</b> · צוות: <b>${t.staff}</b></span></div>
        <p class="muted small">מחיר ממוצע לתספורת ×${this.priceMult(br).toFixed(2)} · כ־${Math.round(this.arrivalRate(br) * 60 * 10) / 10} לקוחות בשעה · הוצאות קבועות ${this.dailyCost(br)} 🪙 ליום · ${Object.keys(br.customers).length} לקוחות במאגר</p>
        ${br.stations === 0 ? '<p class="bad-text">המספרה עדיין ריקה: קנה כיסא בלשונית "ציוד" כדי לפתוח.</p>' : ''}
        <button class="btn ${br.open ? 'ghost' : 'primary'}" id="btnOpenToggle">${br.open ? '🔒 סגור את המספרה' : '🔓 פתח את המספרה'}</button></div>
        <p class="muted small">לקוחות נכנסים לבד מהרחוב. אתה משרת בכיסא הראשון, והעובדים בשאר הכיסאות. לקוח שמחכה יותר משעה וחצי עוזב ומשאיר ביקורת רעה.</p>`;
    } else if (tab === 'store') {
      body = ['furniture', 'equipment'].map((cat) => `<h3 class="grp">${cat === 'furniture' ? 'ריהוט ועיצוב' : 'ציוד מקצועי'}</h3><div class="store">${CATALOG.filter((c) => c.cat === cat).map((c) => {
        const owned = !c.station && br.items[c.id];
        const full = c.station && br.stations >= p.stations;
        return `<div class="store-item ${owned ? 'owned' : ''}"><b>${c.name}</b><small>${c.desc}</small><span class="stars">${'★'.repeat(c.stars)}${'☆'.repeat(5 - c.stars)}</span>
          ${owned ? '<span class="ok-text">✓ ברשותך</span>' : full ? `<span class="lock">כל ${p.stations} העמדות מלאות</span>` : `<button class="btn ${D.coins >= c.price ? 'primary' : 'ghost'} sm" data-buy="${c.id}">קנה · ${c.price} 🪙</button>`}</div>`;
      }).join('')}</div>`).join('');
    } else if (tab === 'design') {
      body = `<h3 class="grp">שם ושלט</h3><div class="row"><input id="brName" class="text-input" maxlength="24" value="${esc(br.name)}" /><button class="btn ghost sm" id="btnRename">שמירה</button></div>
        <h3 class="grp">צבע החזית</h3><div class="swatches">${WALLS.map((w) => `<button class="swatch ${br.theme.wall === w ? 'active' : ''}" data-wall="${w}" style="background:${w}"></button>`).join('')}</div>
        <h3 class="grp">ריצפה (בעמדת העבודה)</h3><div class="chips">${FLOORS.map(([k, n]) => `<button class="chip-btn ${br.theme.floor === k ? 'active' : ''}" data-floor="${k}">${n}</button>`).join('')}</div>
        <h3 class="grp">עור הכיסאות</h3><div class="swatches">${LEATHERS.map((w) => `<button class="swatch ${br.theme.leather === w ? 'active' : ''}" data-leather="${w}" style="background:${w}"></button>`).join('')}</div>`;
    } else if (tab === 'staff') {
      if (!br.candidates) {
        const rng = mulberry32(this.life.state.day * 31 + id.charCodeAt(1));
        br.candidates = Array.from({ length: 3 }, (_, i) => { const skill = 2 + Math.floor(rng() * 4); return { id: `e${this.life.state.day}${i}${id}`, name: PERSON_NAMES[Math.floor(rng() * PERSON_NAMES.length)], skill, salary: market(skill), commission: 0.1, morale: 60, served: 0 }; });
      }
      const max = Math.max(0, br.stations - 1);
      const emp = br.employees.map((e, k) => `<div class="store-item"><b>✂️ ${esc(e.name)}</b><small>מיומנות ${e.skill.toFixed(1)}/5 · שירת ${e.served} · מצב רוח ${e.morale > 65 ? '😊' : e.morale > 40 ? '😐' : '😠'} ${Math.round(e.morale)}</small>
        <div class="row terms"><span>משכורת ${e.salary}/יום</span><button class="btn ghost sm" data-sal="${k}" data-d="-10">-</button><button class="btn ghost sm" data-sal="${k}" data-d="10">+</button>
        <span>עמלה ${Math.round(e.commission * 100)}%</span><button class="btn ghost sm" data-com="${k}" data-d="-0.05">-</button><button class="btn ghost sm" data-com="${k}" data-d="0.05">+</button></div>
        <small class="muted">שכר מקובל לרמה הזו: ${market(Math.floor(e.skill))}/יום. שכר נמוך = מצב רוח ירוד ועזיבה.</small>
        <button class="btn ghost sm" data-fire="${k}">פיטורים</button></div>`).join('') || '<p class="muted">אין עובדים. כל עובד צריך עמדה פנויה (כיסא נוסף).</p>';
      const cand = br.candidates.map((e, k) => `<div class="store-item"><b>${esc(e.name)}</b><small>מיומנות ${'★'.repeat(e.skill)}${'☆'.repeat(5 - e.skill)} · מבקש ${e.salary} 🪙/יום · דמי גיוס ${e.salary * 2}</small>
        ${br.employees.length >= max ? '<span class="lock">צריך עמדה פנויה — קנה עוד כיסא</span>' : `<button class="btn primary sm" data-hire="${k}">גייס</button>`}</div>`).join('');
      body = `<h3 class="grp">העובדים (${br.employees.length}/${max})</h3><div class="store">${emp}</div><h3 class="grp">מועמדים היום</h3><div class="store">${cand}</div>`;
    } else {
      const rows = br.ledger.map((l) => `<tr><td>${l.day}</td><td>${l.clients}</td><td>${l.income}</td><td>${l.expenses}</td><td class="${l.profit >= 0 ? 'ok-text' : 'bad-text'}">${l.profit}</td><td>★${l.rating.toFixed(1)}</td></tr>`).join('');
      body = `<p class="muted small">ההכנסות נכנסות מיד לחשבון. ההוצאות (שכירות, חשבונות ומשכורות) יורדות בחצות.</p>${rows ? `<table class="ledger"><tr><th>יום</th><th>לקוחות</th><th>הכנסות</th><th>הוצאות</th><th>רווח</th><th>דירוג</th></tr>${rows}</table>` : '<p class="muted">עוד לא נסגר יום.</p>'}`;
    }
    ctx.openSheet('💈 ניהול המספרה', head + body, {
      back: () => this.world.resume(),
      mount: (b) => {
        b.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => this.openManage(id, el.dataset.tab)));
        b.querySelector('#btnOpenToggle')?.addEventListener('click', () => { br.open = !br.open; progress.save(); this.openManage(id); });
        b.querySelectorAll('[data-buy]').forEach((el) => el.addEventListener('click', () => {
          const c = CATALOG.find((x) => x.id === el.dataset.buy);
          if (!progress.spend(c.price)) { ctx.toast('אין מספיק מטבעות'); return; }
          if (c.station) br.stations++; else br.items[c.id] = true;
          progress.save(); this.refurnish(br); ctx.toast(`🛒 ${c.name} הותקן במספרה`); this.life.checkCareer(); this.openManage(id, 'store');
        }));
        const setTheme = (k, v) => { br.theme[k] = v; progress.save(); this.refurnish(br); this.openManage(id, 'design'); };
        b.querySelectorAll('[data-wall]').forEach((el) => el.addEventListener('click', () => setTheme('wall', el.dataset.wall)));
        b.querySelectorAll('[data-floor]').forEach((el) => el.addEventListener('click', () => setTheme('floor', el.dataset.floor)));
        b.querySelectorAll('[data-leather]').forEach((el) => el.addEventListener('click', () => setTheme('leather', el.dataset.leather)));
        b.querySelector('#btnRename')?.addEventListener('click', () => { const v = b.querySelector('#brName').value.trim(); if (v) { br.name = v; progress.save(); this.refurnish(br); ctx.toast('השלט הוחלף'); this.openManage(id, 'design'); } });
        b.querySelectorAll('[data-hire]').forEach((el) => el.addEventListener('click', () => {
          const e = br.candidates[+el.dataset.hire];
          if (!progress.spend(e.salary * 2)) { ctx.toast('אין מספיק מטבעות לדמי הגיוס'); return; }
          br.employees.push(e); br.candidates.splice(+el.dataset.hire, 1); progress.save(); this.refurnish(br); ctx.toast(`${e.name} הצטרף/ה לצוות!`); this.openManage(id, 'staff');
        }));
        b.querySelectorAll('[data-fire]').forEach((el) => el.addEventListener('click', () => { br.employees.splice(+el.dataset.fire, 1); progress.save(); this.refurnish(br); this.openManage(id, 'staff'); }));
        b.querySelectorAll('[data-sal]').forEach((el) => el.addEventListener('click', () => { const e = br.employees[+el.dataset.sal]; e.salary = Math.max(30, e.salary + +el.dataset.d); progress.save(); this.openManage(id, 'staff'); }));
        b.querySelectorAll('[data-com]').forEach((el) => el.addEventListener('click', () => { const e = br.employees[+el.dataset.com]; e.commission = THREE.MathUtils.clamp(+(e.commission + +el.dataset.d).toFixed(2), 0, 0.5); progress.save(); this.openManage(id, 'staff'); }));
      },
    });
  },

  openChain() {
    const brs = Object.values(this.life.state.branches);
    const total = brs.reduce((a, b) => a + b.ledger.slice(0, 7).reduce((x, l) => x + l.profit, 0), 0);
    ctx.openSheet('💈 העסק שלי', brs.length ? `
      <div class="day-stats"><span>מספרות: <b>${brs.length}</b></span><span>רווח 7 ימים: <b>${total} 🪙</b></span><span>עובדים: <b>${brs.reduce((a, b) => a + b.employees.length, 0)}</b></span></div>
      <div class="store">${brs.map((b) => `<div class="store-item"><b>${esc(b.name)}</b><small>${esc(prop(b.propId).name)} · ★ ${this.rating(b).toFixed(1)} · היום ${b.today.income} 🪙 · ${b.employees.length} עובדים</small>
        <div class="row"><button class="btn primary sm" data-m="${b.propId}">ניהול</button><button class="btn ghost sm" data-wp="${b.propId}">📍 במפה</button></div></div>`).join('')}</div>
      <p class="muted small">כדי לפתוח סניף נוסף: משרד הנדל״ן או נכס עם שלט "להשכרה". שלוש מספרות = רשת.</p>`
      : '<p>עוד אין לך מספרה. עבוד במספרה בעיר, חסוך לפיקדון, ואז גש למשרד הנדל״ן 🏢.</p>',
    {
      back: () => this.life.openPhone(),
      mount: (el) => {
        el.querySelectorAll('[data-m]').forEach((x) => x.addEventListener('click', () => this.openManage(x.dataset.m)));
        el.querySelectorAll('[data-wp]').forEach((x) => x.addEventListener('click', () => { const bd = this.world.city.buildings[x.dataset.wp]; this.world.resume(); this.world.setWaypoint({ ...bd.door, label: this.life.state.branches[x.dataset.wp].name }); }));
      },
    });
  },
};
