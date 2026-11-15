// Life in the city: game clock, energy, money, career ladder, jobs in barbershops, homes, cafe, clothes, cars,
// properties and your own barbershops (with clients that walk in by themselves). Everything is saved.
import { ctx } from '../game/context.js';
import { progress, RANKS } from '../game/progress.js';
import { SHOPS, PROPERTIES, HOMES, CARS, OUTFITS, CAREER, OPEN_HOUR, CLOSE_HOUR } from './worldData.js';
ctx.careerNext = (id) => { const n = CAREER[id]; return n ? `${n.name} — ${n.how}` : ''; };
import { generateClient } from '../data/clients.js';
import { applyDecor } from '../scene/shopDecor.js';
import { TOOLS } from '../tools/tools.js';
import { TIPS } from './npcs.js';
import { LESSONS } from '../data/lessons.js';
import { business } from './business.js';

const D = progress.data;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MIN_PER_SEC = 2;           // 1 real second = 2 game minutes (a day = 12 real minutes)
const HAIRCUT_MINUTES = 40;
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

function defaults() {
  return {
    day: 1, minute: 8 * 60, weather: 'clear', energy: 100, home: 'studio', pos: null,
    job: null, everEmployed: false, jobServed: 0, workedToday: 0,
    cars: [], outfit: { owned: { shirt: ['#e9e5dc'], pants: ['#2b2f38'], shoes: ['#3a2216'], apron: [null] }, wear: { shirt: '#e9e5dc', pants: '#2b2f38', shoes: '#3a2216', apron: null } },
    branches: {}, careerBest: 1, reports: [], tipsSeen: 0,
  };
}

/** A barbershop in the world that has clients: a job shop or one of the player's branches. */
class ShopRuntime {
  constructor(b, kind, ref) {
    this.b = b; this.kind = kind; this.ref = ref;
    this.waiting = []; this.chairs = {}; this.acc = 0; this.pending = 0;
    this.seats = (b.benchSeats || []).map((s) => ({ ...s, taken: null }));
    b.takeSeat = (p) => { const s = this.seats.find((x) => !x.taken); if (s) s.taken = p; return s; };
    b.freeSeat = (p) => { for (const s of this.seats) if (s.taken === p) s.taken = null; };
  }
  get open() {
    const h = life.hour;
    if (h < OPEN_HOUR || h >= CLOSE_HOUR) return false;
    if (this.kind === 'branch') return this.ref.open && this.ref.stations > 0;
    return true;
  }
  rebindSeats() { this.seats = (this.b.benchSeats || []).map((s) => ({ ...s, taken: null })); }
  /** staff barbers who can serve here */
  staffCount() {
    if (this.kind === 'job') return Math.max(0, (this.ref.stations || 3) - 1);
    return Math.min(this.ref.employees.length, Math.max(0, this.ref.stations - 1));
  }
  arrivalRate() {
    const w = life.state.weather === 'rain' ? 0.6 : 1;
    if (this.kind === 'job') return (0.03 + 0.008 * this.ref.tier) * w;
    return business.arrivalRate(this.ref) * w;
  }
  tick(dm) {
    const people = life.world.people;
    if (this.open) {
      this.acc += this.arrivalRate() * dm;
      const free = this.seats.filter((s) => !s.taken).length - this.pending;
      if (this.acc >= 1 && free > 0) {
        this.acc = 0;
        const info = this.kind === 'branch' ? business.pickCustomer(this.ref) : {};
        this.pending++;
        const p = people.sendClient(this.b, (pp) => { this.pending--; pp.arrived = life.totalMinutes; this.waiting.push(pp); }, { temporary: true, ...info });
        p.onGaveUp = () => { this.pending--; };
      } else if (this.acc > 3) this.acc = 3;
    }
    // staff serve waiting clients on chairs 1..n (chair 0 is the player's)
    const n = this.staffCount();
    const playerHere = this.kind === 'job' ? life.state.job?.shopId === this.ref.id : true;
    for (let k = 1; k <= n; k++) {
      const ch = this.chairs[k];
      if (ch && life.totalMinutes >= ch.until) {
        people.release(ch.npc);
        if (this.kind === 'branch') business.staffServed(this.ref, ch.npc, k - 1);
        delete this.chairs[k];
      }
      const spot = this.b.stationSpots?.[k];
      if (!this.chairs[k] && spot && this.waiting.length > (playerHere && life.nearShop(this) ? 1 : 0)) {
        const npc = this.waiting.shift();
        this.b.freeSeat(npc);
        people.toChair(npc, spot);
        this.chairs[k] = { npc, until: life.totalMinutes + 45 };
      }
    }
    // clients who waited too long leave
    for (const p of this.waiting.slice()) {
      if (life.totalMinutes - p.arrived > 100) {
        this.waiting = this.waiting.filter((x) => x !== p);
        people.release(p);
        if (this.kind === 'branch') business.walkedOut(this.ref, p);
      }
    }
    // closing time: everybody waiting goes home
    if (!this.open && this.waiting.length) { for (const p of this.waiting) people.release(p); this.waiting = []; }
  }
}

export const life = {
  get state() { D.life ||= defaults(); return D.life; },
  get hour() { return this.state.minute / 60; },
  get totalMinutes() { return this.state.day * 1440 + this.state.minute; },
  clock() { const m = Math.floor(this.state.minute); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; },
  look() { const w = this.state.outfit.wear; return { skin: this.state.skin || '#e2b08c', hair: this.state.hairColor || '#2e2018', ...w }; },
  save() { progress.save(); },
  savePos() {
    const w = this.world; if (!w) return;
    const p = w.player.position;
    this.state.pos = { x: p.x, z: p.z, yaw: w.yaw };
    progress.save();
  },

  attach(world) {
    this.world = world;
    const s = this.state;
    business.init(this, world);
    // legacy: the shop from the academy version becomes a branch in a real property
    if (D.shop?.owned && !Object.keys(s.branches).length) business.migrateLegacy(D.shop);
    if (!s.pos) { const b = world.city.buildings[s.home]; s.pos = { x: b.door.x + b.frame.out[0] * 2, z: b.door.z + b.frame.out[1] * 2, yaw: Math.atan2(b.frame.out[0], b.frame.out[1]) }; }
    world.sky.setWeather(s.weather);
    this.runtimes = {};
    for (const sh of SHOPS) this.runtimes[sh.id] = new ShopRuntime(world.city.buildings[sh.id], 'job', sh);
    for (const id of Object.keys(s.branches)) this.addBranchRuntime(id);
    for (const c of s.cars) world.spawnCarMesh(c);
    this._saveT = 0;
  },
  addBranchRuntime(id) {
    const b = this.world.city.buildings[id];
    business.furnish(this.state.branches[id], b);
    this.runtimes[id] = new ShopRuntime(b, 'branch', this.state.branches[id]);
  },
  nearShop(rt) { const w = this.world; return !!w && w.insideBuilding(w.player.position) === rt.b; },

  onResume() {
    if (ctx.academyMinutes) { this.advance(ctx.academyMinutes); ctx.academyMinutes = 0; }
    this.checkCareer();
    setTimeout(() => this.flushNotes(), 600);
  },

  /** City notices (daily report, promotions) never interrupt a haircut or a menu: they wait for the city view. */
  notify(opts) { (this.notes ||= []).push(opts); if (this.world?.active) setTimeout(() => this.flushNotes(), 50); },
  flushNotes() {
    if (!this.world?.active || !this.notes?.length) return;
    if (document.querySelector('.modal:not(.hidden)')) { setTimeout(() => this.flushNotes(), 800); return; }
    const n = this.notes.shift();
    const buttons = (n.buttons || [{ label: 'המשך', primary: true }]).map((b) => ({ ...b, action: () => { b.action?.(); setTimeout(() => this.flushNotes(), 200); } }));
    ctx.dialog({ ...n, buttons });
  },

  // ---------------------------------------------------------------- time
  update(dt) {
    const dm = dt * MIN_PER_SEC;
    this.advance(dm);
    for (const rt of Object.values(this.runtimes)) rt.tick(dm);
    this._saveT += dt;
    if (this._saveT > 15) { this._saveT = 0; this.savePos(); }
  },
  advance(minutes) {
    const s = this.state;
    s.minute += minutes;
    s.energy = Math.max(0, s.energy - minutes / 60 * 4.5);
    while (s.minute >= 1440) { s.minute -= 1440; s.day++; this.dailyTick(); }
    if (s.energy <= 0 && !this._passing) this.passOut();
  },
  passOut() {
    this._passing = true;
    ctx.toast('😵 התעלפת מעייפות... התעוררת בבית בבוקר. שינה וקפה חשובים!', 4500);
    this.sleepUntilMorning(true);
    this._passing = false;
  },
  sleepUntilMorning(forced = false) {
    const s = this.state;
    const target = 7 * 60;
    const add = s.minute < target ? target - s.minute : 1440 - s.minute + target;
    this.advance(add);
    s.energy = 100;
    const b = this.world.city.buildings[s.home];
    this.world.teleport(b.bed.x, b.bed.z);
    if (!forced) ctx.toast('🌅 בוקר טוב! אנרגיה מלאה.');
    this.save();
  },

  dailyTick() {
    const s = this.state;
    const lines = [];
    let total = 0;
    const home = HOMES.find((h) => h.id === s.home);
    total += home.rent; lines.push(`🏠 שכירות דירה (${home.name}): -${home.rent}`);
    if (s.job && s.workedToday) {
      const sh = SHOPS.find((x) => x.id === s.job.shopId);
      total -= sh.basePay; lines.push(`✂️ משכורת בסיס מ־${sh.name}: +${sh.basePay}`);
    }
    for (const br of Object.values(s.branches)) {
      const r = business.dailyClose(br);
      total += r.net * -1;
      lines.push(...r.lines);
    }
    D.coins -= total;
    s.workedToday = 0;
    s.weather = ['clear', 'clear', 'cloudy', 'rain', 'clear', 'cloudy'][Math.floor(Math.random() * 6)];
    this.world?.sky.setWeather(s.weather);
    const net = -total;
    lines.push(`${net >= 0 ? '📈' : '📉'} סה״כ היום: ${net >= 0 ? '+' : ''}${net} 🪙 · יתרה: ${D.coins} 🪙`);
    if (D.coins < 0) lines.push('⚠️ יתרה שלילית: עבוד עוד משמרות, הורד הוצאות או עבור לדירה זולה יותר.');
    s.reports.unshift({ day: s.day - 1, lines });
    s.reports.length = Math.min(s.reports.length, 10);
    this.save();
    this.notify({ title: `סיכום יום ${s.day - 1}`, html: `<ul class="reward-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p class="muted small">${esc(TIPS[s.day % TIPS.length])}</p>`, buttons: [{ label: 'יום חדש!', primary: true }] });
  },

  // ---------------------------------------------------------------- career
  career() {
    const s = this.state, rank = progress.rank.id;
    const passed = LESSONS.filter((l) => progress.lessonPassed(l.id)).length;
    const brs = Object.values(s.branches);
    let lvl = 1;
    if (passed >= 10 || rank >= 2) lvl = 2;
    if (lvl >= 2 && (s.job || s.everEmployed)) lvl = 3;
    if (lvl >= 3 && (rank >= 5 || s.jobServed >= 25)) lvl = 4;
    if (brs.length >= 1) lvl = Math.max(lvl, 5);
    if (brs.some((b) => b.reviews.length >= 20 && business.rating(b) >= 4.2)) lvl = Math.max(lvl, 6);
    if (brs.length >= 3) lvl = 7;
    return CAREER[lvl - 1];
  },
  checkCareer() {
    const c = this.career();
    if (c.id > this.state.careerBest) {
      this.state.careerBest = c.id;
      progress.reward(80, 100);
      this.save();
      this.notify({ title: '⬆️ קידום בקריירה!', html: `<p>מעכשיו אתה <b>${c.name}</b>.</p><p>${c.id < 7 ? `השלב הבא: <b>${ctx.careerNext?.(c.id) || ''}</b>` : 'הגעת לפסגה!'}</p><p class="muted">+80 XP, +100 🪙</p>`, buttons: [{ label: 'מעולה', primary: true }] });
    }
  },

  /** What to do next — one clear goal so the game never feels messy. */
  goal() {
    const s = this.state, rank = progress.rank.id;
    const passed = LESSONS.filter((l) => progress.lessonPassed(l.id)).length;
    const brs = Object.values(s.branches);
    if (s.energy < 20) return 'אתה עייף: לך לישון בבית או קנה קפה בקפה שיר';
    if (rank < 2 && passed < 5) return `לך לאקדמיה 🎓 ולמד את השיעורים הראשונים (${passed}/5)`;
    if (!s.job && !brs.length) return 'חפש עבודה: דבר עם מוטי במספרה Fade House ✂️';
    if (!brs.length) {
      const cheapest = Math.min(...PROPERTIES.map((p) => p.rent * 7));
      if (D.coins < cheapest + 400) return `עבוד בכיסא במספרה וחסוך: יש ${D.coins} מתוך ${cheapest + 400} 🪙 לפתיחת מספרה`;
      return 'מספיק כסף! גש למשרד הנדל״ן 🏢 או לנכס עם שלט "להשכרה" 🏷️';
    }
    const empty = brs.find((b) => b.stations === 0);
    if (empty) return `קנה כיסא במספרה "${empty.name}" כדי לפתוח אותה (ניהול בדלפק)`;
    if (brs.length < 3) return `צבור מוניטין והרחב: ${brs.length}/3 מספרות לרשת`;
    return 'בעל רשת! שדרג סניפים, גייס צוות טוב ושמור על הדירוג';
  },

  // ---------------------------------------------------------------- map markers
  mapMarkers() {
    const B = this.world.city.buildings, s = this.state, out = [];
    const add = (b, icon, label, important = false) => out.push({ x: b.door.x, z: b.door.z, icon, label, important });
    add(B.academy, '🎓', 'האקדמיה לספרות', true);
    for (const sh of SHOPS) add(B[sh.id], '✂️', `${sh.name}${s.job?.shopId === sh.id ? ' (העבודה שלך)' : ''}`, s.job?.shopId === sh.id);
    for (const p of PROPERTIES) add(B[p.id], s.branches[p.id] ? '💈' : '🏷️', s.branches[p.id] ? s.branches[p.id].name : `${p.name} (${p.rent}/יום)`, !!s.branches[p.id]);
    add(B[s.home], '🏠', 'הבית שלך', true);
    add(B.realty, '🏢', 'משרד נדל״ן');
    add(B.clothes, '👕', 'חנות בגדים');
    add(B.cafe, '☕', 'קפה שיר');
    add(B.cars, '🚗', 'סוכנות רכב');
    for (const c of s.cars) out.push({ x: c.x, z: c.z, icon: '🔑', label: `הרכב שלך: ${CARS.find((x) => x.id === c.id).name}` });
    return out;
  },

  // ---------------------------------------------------------------- interactions
  interactions(pos, driving) {
    const W = this.world, B = W.city.buildings, s = this.state, out = [];
    if (driving) { out.push({ x: pos.x, z: pos.z, r: 99, icon: '🚪', label: 'צא מהרכב', action: () => W.exitCar() }); return out; }
    for (const c of s.cars) out.push({ x: c.x, z: c.z, r: 2.6, icon: '🚗', label: 'היכנס לרכב', action: () => W.enterCar(c) });
    out.push({ ...B.academy.desk, r: 1.8, icon: '🎓', label: 'דבר עם המזכירה (שיעורים, מעבדה ואימונים)', action: () => this.openAcademy() });
    out.push({ ...B.realty.desk, r: 1.8, icon: '🏢', label: 'משרד הנדל״ן: נכסים ודירות', action: () => this.openRealty() });
    out.push({ ...B.clothes.racks, r: 2.2, icon: '👕', label: 'קנה בגדים', action: () => this.openClothes() });
    out.push({ ...B.cafe.counter, r: 1.8, icon: '☕', label: 'קפה וארוחה', action: () => this.openCafe() });
    out.push({ ...B.cars.desk, r: 1.8, icon: '🚗', label: 'דבר עם המוכר', action: () => this.openCars() });
    for (const sp of B.cars.carSpots) out.push({ ...sp.world, r: 1.6, icon: '🚘', label: `${sp.car.name} — ${sp.car.price.toLocaleString('he-IL')} 🪙`, action: () => this.buyCar(sp.car) });
    const home = B[s.home];
    out.push({ ...home.bed, r: 1.8, icon: '🛏️', label: 'לישון', action: () => this.sleep() });
    out.push({ ...home.wardrobe, r: 1.6, icon: '🧥', label: 'ארון בגדים', action: () => this.openClothes(true) });
    for (const sh of SHOPS) {
      const b = B[sh.id], rt = this.runtimes[sh.id];
      out.push({ ...b.reception, r: 1.8, icon: '🗣️', label: `דבר עם ${sh.owner}, בעל ${sh.name}`, action: () => this.talkOwner(sh) });
      if (s.job?.shopId === sh.id) out.push({ ...b.stationSpots[0].barber, r: 1.5, icon: '💈', label: rt.open ? `עבוד בכיסא (${rt.waiting.length} מחכים)` : 'המספרה סגורה (9:00–19:00)', action: () => this.workChair(rt) });
    }
    for (const p of PROPERTIES) {
      const b = B[p.id], br = s.branches[p.id];
      if (!br) out.push({ ...b.inside, r: 2.2, icon: '📋', label: `פרטי הנכס: ${p.name}`, action: () => business.openProperty(p) });
      else {
        out.push({ ...b.reception, r: 1.8, icon: '📋', label: `ניהול "${br.name}"`, action: () => business.openManage(p.id) });
        if (br.stations > 0) out.push({ ...b.stationSpots[0].barber, r: 1.5, icon: '💈', label: this.runtimes[p.id].open ? `שרת לקוח (${this.runtimes[p.id].waiting.length} מחכים)` : 'המספרה סגורה עכשיו', action: () => this.workChair(this.runtimes[p.id]) });
      }
    }
    const npc = W.people.nearest(pos, 2.0);
    if (npc && (npc.state === 'loop' || npc.state === 'inside' || npc.state === 'waiting')) out.push({ x: npc.mesh.position.x, z: npc.mesh.position.z, r: 2.0, icon: '💬', label: `דבר עם ${npc.name}`, action: () => this.talkNpc(npc) });
    return out;
  },

  talkNpc(npc) {
    const s = this.state;
    let text = TIPS[(s.tipsSeen++ + npc.seed) % TIPS.length];
    if (npc.state === 'waiting') text = 'אני מחכה לתספורת. מקווה שזה לא ייקח הרבה זמן...';
    if (npc.customer) text = `היי! הייתי אצלך כבר ${npc.customer.visits} פעמים. ${npc.customer.sat >= 4 ? 'אני ממליץ עליך לכל החברים!' : 'מקווה שהפעם יצא יותר טוב.'}`;
    npc.mesh.rotation.y = Math.atan2(this.world.player.position.x - npc.mesh.position.x, this.world.player.position.z - npc.mesh.position.z);
    ctx.dialog({ title: `💬 ${npc.name}`, html: `<div class="bubble">“${esc(text)}”</div>`, buttons: [{ label: 'תודה!', primary: true }] });
  },

  // ---------------------------------------------------------------- places
  openAcademy() {
    this.world.suspend();
    ctx.returnTo = 'hub';
    ctx.showHub();
    ctx.toast('🎓 ברוך הבא לאקדמיה! כל שיעור ותספורת כאן לוקחים זמן ביום שלך.', 3000);
  },
  sleep() {
    const h = this.hour;
    if (h >= 19 || h < 6 || this.state.energy < 40) {
      ctx.dialog({ title: '🛏️ לישון?', html: '<p>תישן עד 07:00. בחצות משולמות ההוצאות של היום ותקבל סיכום יומי.</p>', buttons: [{ label: 'לילה טוב', primary: true, action: () => this.sleepUntilMorning() }, { label: 'עוד לא' }] });
    } else {
      ctx.dialog({ title: '🛏️ מנוחה', html: '<p>עוד מוקדם לישון. אפשר לנוח שעתיים (+35 אנרגיה).</p>', buttons: [{ label: 'לנוח שעתיים', primary: true, action: () => { this.advance(120); this.state.energy = Math.min(100, this.state.energy + 35); this.save(); } }, { label: 'ביטול' }] });
    }
  },
  openCafe() {
    const buy = (price, energy, what) => {
      if (D.coins < price) { ctx.toast('אין מספיק מטבעות'); return; }
      D.coins -= price; this.state.energy = Math.min(100, this.state.energy + energy); this.advance(15); this.save();
      ctx.toast(`${what} (+${energy} אנרגיה)`);
    };
    ctx.dialog({ title: '☕ קפה שיר', html: '<p>אנרגיה יורדת במהלך היום. ספר עייף עובד לאט — וגם הולך לאט.</p>', buttons: [
      { label: '☕ אספרסו — 12 🪙 (+20)', action: () => buy(12, 20, '☕ אספרסו חזק') },
      { label: '🥪 כריך — 25 🪙 (+35)', action: () => buy(25, 35, '🥪 כריך טרי') },
      { label: '🍝 ארוחה מלאה — 45 🪙 (+60)', primary: true, action: () => buy(45, 60, '🍝 ארוחה טובה') },
      { label: 'לא עכשיו' }] });
  },
  openClothes(wardrobe = false) {
    const o = this.state.outfit;
    const names = { shirt: 'חולצה', pants: 'מכנסיים', shoes: 'נעליים', apron: 'סינר עבודה' };
    const html = Object.entries(OUTFITS).map(([cat, items]) => `<h3 class="grp">${names[cat]}</h3><div class="outfit-row">${items.map(([col, name, price]) => {
      const owned = o.owned[cat].includes(col), wearing = o.wear[cat] === col;
      if (wardrobe && !owned) return '';
      return `<button class="outfit ${wearing ? 'active' : ''}" data-cat="${cat}" data-col="${col}" data-price="${price}"><i style="background:${col || 'transparent'}"></i><span>${name}</span><small>${wearing ? 'לבוש' : owned ? 'שלך' : `${price} 🪙`}</small></button>`;
    }).join('')}</div>`).join('');
    ctx.dialog({ title: wardrobe ? '🧥 ארון בגדים' : '👕 אורבן סטייל', html: `${wardrobe ? '' : '<p class="muted">ספר מקצועי נראה מקצועי. סינר עבודה = רושם טוב על לקוחות.</p>'}${html}`, buttons: [{ label: 'סגור', primary: true }], mount: (body) => {
      body.querySelectorAll('.outfit').forEach((b) => b.addEventListener('click', () => {
        const cat = b.dataset.cat, col = b.dataset.col === 'null' ? null : b.dataset.col, price = +b.dataset.price;
        if (!o.owned[cat].includes(col)) { if (D.coins < price) { ctx.toast('אין מספיק מטבעות'); return; } D.coins -= price; o.owned[cat].push(col); ctx.toast('קנית! 🛍️'); }
        o.wear[cat] = col;
        this.world.dress(this.look());
        this.save();
        ctx.closeDialog(); this.openClothes(wardrobe);
      }));
    } });
  },
  openCars() {
    const owned = this.state.cars.map((c) => c.id);
    ctx.dialog({ title: '🚗 סיטי מוטורס', html: `<p>רכב חוסך זמן בדרך בין הבית, העבודה והמספרות שלך.</p><ul class="reward-list">${CARS.map((c) => `<li><b>${c.name}</b> — ${c.price.toLocaleString('he-IL')} 🪙 · מהירות ${c.speed * 3.6 | 0} קמ״ש ${owned.includes(c.id) ? '✓ שלך' : ''}</li>`).join('')}</ul><p class="muted small">גש לרכב באולם כדי לקנות אותו.</p>`, buttons: [{ label: 'הבנתי', primary: true }] });
  },
  buyCar(car) {
    if (this.state.cars.find((c) => c.id === car.id)) { ctx.toast('הרכב הזה כבר שלך — הוא חונה ברחוב'); return; }
    ctx.dialog({ title: `🚘 ${car.name}`, html: `<p>מחיר: <b>${car.price.toLocaleString('he-IL')} 🪙</b>. יש לך ${D.coins.toLocaleString('he-IL')} 🪙.</p>`, buttons: [
      { label: 'קנה', primary: true, action: () => {
        if (!progress.spend(car.price)) { ctx.toast('אין מספיק מטבעות — המשך לעבוד ולחסוך'); return; }
        const b = this.world.city.buildings.cars;
        const st = { id: car.id, x: b.door.x + b.frame.out[0] * 6, z: b.door.z + b.frame.out[1] * 6, h: Math.atan2(-b.frame.out[1], b.frame.out[0]) };
        this.state.cars.push(st);
        this.world.spawnCarMesh(st);
        this.save();
        ctx.toast(`🔑 ${car.name} חונה מחוץ לסוכנות!`, 3000);
      } }, { label: 'ביטול' }] });
  },
  openRealty() { business.openRealty(); },

  // ---------------------------------------------------------------- jobs
  talkOwner(sh) {
    const s = this.state, rt = this.runtimes[sh.id];
    const rankOk = progress.rank.id >= sh.needRank;
    const mine = s.job?.shopId === sh.id;
    const need = RANKS[sh.needRank - 1].name;
    let html = `<p>“${esc(sh.pitch)}”</p><ul class="reward-list"><li>עמלה: <b>${Math.round(sh.commission * 100)}%</b> ממחיר כל תספורת + טיפים</li><li>בסיס: <b>${sh.basePay} 🪙</b> בכל יום שעבדת</li><li>שעות: 9:00–19:00 · ${rt.waiting.length} לקוחות מחכים עכשיו</li><li>דרישה: דרגת <b>${need}</b> באקדמיה ${rankOk ? '✓' : '✗'}</li></ul>`;
    const buttons = [];
    if (mine) {
      const j = s.job;
      const avg = j.scores.length ? Math.round(j.scores.reduce((a, b) => a + b, 0) / j.scores.length) : 0;
      html += `<div class="practice-box">אתה עובד כאן · ${j.served} לקוחות · ציון ממוצע ${avg || '-'} · עמלה ${Math.round((sh.commission + j.bonus) * 100)}%${j.warnings ? ` · ⚠️ ${j.warnings} אזהרות` : ''}</div>`;
      html += `<p class="muted">${esc(j.served < 3 ? `${sh.owner}: "תתחיל בכיסא הראשון. תקשיב ללקוח, תחטא כלים ותנקה אותו בסוף."` : avg >= 80 ? `${sh.owner}: "עבודה מצוינת! הלקוחות מבקשים אותך."` : `${sh.owner}: "שים לב למעברים ולסימטריה. אם צריך — תתרגל באקדמיה."`)}</p>`;
      buttons.push({ label: 'להתפטר', action: () => { s.job = null; this.save(); ctx.toast(`התפטרת מ־${sh.name}`); } });
    } else if (rankOk) {
      buttons.push({ label: s.job ? `לעבור לעבוד כאן (לעזוב את ${SHOPS.find((x) => x.id === s.job.shopId).name})` : 'אני רוצה לעבוד כאן!', primary: true, action: () => {
        s.job = { shopId: sh.id, served: 0, scores: [], warnings: 0, bonus: 0, since: s.day };
        s.everEmployed = true; this.save();
        ctx.toast(`🎉 התקבלת לעבודה ב־${sh.name}! הכיסא הראשון שלך. גש אליו כשיש לקוחות.`, 4000);
        this.checkCareer();
      } });
    } else {
      html += `<p class="bad-text">${esc(sh.owner)}: "אני צריך ספר בדרגת ${need}. תחזור אליי אחרי עוד קצת לימוד באקדמיה."</p>`;
      buttons.push({ label: '📍 סמן את האקדמיה במפה', action: () => this.world.setWaypoint({ ...this.world.city.buildings.academy.door, label: 'האקדמיה' }) });
    }
    buttons.push({ label: 'סגור', primary: !buttons.some((b) => b.primary) });
    ctx.dialog({ title: `🗣️ ${sh.owner} — ${sh.name}`, html, buttons });
  },

  /** Serve the next waiting client in a job shop or in your own branch: a real haircut in the station view. */
  workChair(rt) {
    if (!rt.open) { ctx.toast('המספרה סגורה עכשיו. פתוח 9:00–19:00.'); return; }
    if (!rt.waiting.length) { ctx.toast('אין לקוח שמחכה כרגע. לקוחות נכנסים מהרחוב — חכה רגע.'); return; }
    if (rt.chairs[0]) return;
    const npc = rt.waiting.shift();
    rt.b.freeSeat(npc);
    this.world.people.toChair(npc, rt.b.stationSpots[0]);
    rt.chairs[0] = { npc, until: Infinity };
    const isBranch = rt.kind === 'branch';
    const tier = isBranch ? 3 : rt.ref.tier;
    const c = generateClient({ seed: npc.seed, maxDifficulty: Math.min(5, progress.rank.id + 1, tier + 2) });
    c.name = npc.name;
    if (npc.customer) c.speech = `שוב אני! ${c.speech}`;
    // the station looks like the shop you are in
    if (isBranch) applyDecor(ctx.shop, { owned: true, ...rt.ref, rating: business.rating(rt.ref) }, ctx.tools, TOOLS);
    else applyDecor(ctx.shop, { owned: true, name: rt.ref.name, theme: { wall: rt.ref.color, floor: 'checker', leather: rt.ref.leather }, items: {}, stations: 1, rating: 4 }, ctx.tools, TOOLS);
    this.world.suspend();
    ctx.returnTo = 'world';
    ctx.onClientAbandoned = () => { delete rt.chairs[0]; this.world.people.release(npc); applyDecor(ctx.shop, null, ctx.tools, TOOLS); };
    ctx.startClient(c, {
      title: `${rt.ref.name}: ${c.name}`,
      onEnd: (res) => {
        delete rt.chairs[0];
        this.world.people.release(npc);
        this.advance(HAIRCUT_MINUTES);
        const out = isBranch ? business.playerServed(rt.ref, npc, c, res) : this.jobServed(rt.ref, c, res);
        applyDecor(ctx.shop, null, ctx.tools, TOOLS);
        this.checkCareer();
        this.save();
        return out;
      },
    });
    if (isBranch && rt.ref.items.sterilizer) ctx.session.disinfect();
  },

  jobServed(sh, c, res) {
    const s = this.state, j = s.job;
    const fb = res.feedback;
    const price = c.price * sh.priceMult;
    const earn = Math.round(price * (sh.commission + (j?.bonus || 0)) * (0.3 + 0.7 * res.overall / 100));
    const tip = fb.stars >= 5 ? 15 * sh.tier : fb.stars >= 4 ? 8 * sh.tier : 0;
    progress.reward(10 + res.overall * 0.4, earn + tip);
    D.stats.clients++;
    progress.recordHaircut(c.base.id, res.overall, 'client');
    if (fb.stars >= 4) progress.unlock('happyClient');
    s.jobServed++; s.workedToday++;
    const lines = [`${fb.mood} ${stars(fb.stars)} — “${fb.text}”`, `שכר: ${earn} 🪙 (${Math.round((sh.commission + (j?.bonus || 0)) * 100)}% מ־${Math.round(price)})${tip ? ` + טיפ ${tip} 🪙` : ''}`];
    if (j && j.shopId === sh.id) {
      j.served++; j.scores.push(res.overall); if (j.scores.length > 10) j.scores.shift();
      const last3 = j.scores.slice(-3), avg3 = last3.reduce((a, b) => a + b, 0) / last3.length;
      const avg10 = j.scores.reduce((a, b) => a + b, 0) / j.scores.length;
      if (last3.length === 3 && avg3 < 50) {
        j.warnings++; j.scores = [];
        lines.push(j.warnings >= 3 ? `❌ ${sh.owner}: "אני מצטער, זה לא עובד. תתאמן באקדמיה ותחזור."` : `⚠️ ${sh.owner}: "הלקוחות לא מרוצים. תתרגל באקדמיה — אזהרה ${j.warnings}/3."`);
        if (j.warnings >= 3) s.job = null;
      } else if (j.served >= 12 && avg10 >= 82 && j.bonus < 0.1) {
        j.bonus += 0.05; lines.push(`🎉 ${sh.owner}: "אתה מעולה! העליתי לך את העמלה ל־${Math.round((sh.commission + j.bonus) * 100)}%."`);
      }
    }
    return { title: `${c.name} שילם ויצא`, lines };
  },

  // ---------------------------------------------------------------- phone
  openPhone() {
    this.world.suspend();
    const s = this.state, c = this.career();
    const brs = Object.values(s.branches);
    const ladder = CAREER.map((k) => `<div class="rank ${k.id <= c.id ? 'got' : ''}"><b>${k.id}</b><span>${k.name}</span><small>${k.how}</small></div>`).join('');
    const home = HOMES.find((h) => h.id === s.home);
    const daily = home.rent + brs.reduce((a, b) => a + business.dailyCost(b), 0);
    ctx.openSheet('📱 הטלפון', `
      <div class="phone-apps">
        <button class="app" data-app="map">🗺️<span>מפה</span></button>
        <button class="app" data-app="biz">💈<span>העסק שלי</span></button>
        <button class="app" data-app="awards">🎓<span>תעודות</span></button>
        <button class="app" data-app="dict">📕<span>מילון</span></button>
        <button class="app" data-app="help">❓<span>איך משחקים</span></button>
      </div>
      <h3 class="grp">💼 הקריירה שלך: ${c.name}</h3><div class="ranks">${ladder}</div>
      <p>🎯 ${esc(this.goal())}</p>
      <h3 class="grp">💰 כספים</h3>
      <div class="day-stats"><span>יתרה: <b>${D.coins.toLocaleString('he-IL')} 🪙</b></span><span>הוצאות קבועות ליום: <b>${daily} 🪙</b></span><span>אנרגיה: <b>${Math.round(s.energy)}%</b></span></div>
      <p class="muted small">עבודה: ${s.job ? `${SHOPS.find((x) => x.id === s.job.shopId).name} · ${s.job.served} לקוחות` : 'אין עבודה כרגע'} · דירה: ${home.name} (${home.rent}/יום) · מספרות: ${brs.length}</p>
      ${s.reports.length ? `<details class="zones"><summary>סיכומים יומיים אחרונים</summary>${s.reports.map((r) => `<h4>יום ${r.day}</h4><ul>${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}</details>` : ''}`,
    {
      back: () => this.world.resume(),
      mount: (b) => b.querySelectorAll('[data-app]').forEach((el) => el.addEventListener('click', () => {
        const a = el.dataset.app;
        if (a === 'map') { this.world.resume(); this.world.toggleMap(true); }
        if (a === 'biz') business.openChain();
        if (a === 'awards') ctx.openAwards(() => this.openPhone());
        if (a === 'dict') ctx.openDictionary(() => this.openPhone());
        if (a === 'help') { this.world.resume(); ctx.showWorldHelp(); }
      })),
    });
  },
};
