// Interactive first-time tutorial: 10 steps. Each step has a short explanation, an arrow that points at the button
// to press, a GPS target in the city (gold arrow + light beacon), and it only moves on when the player really did
// the action. Mistakes get a specific hint. Progress is saved so a reload continues from the same step.
import { ctx } from '../game/context.js';
import { progress } from '../game/progress.js';
import { LESSONS } from '../data/lessons.js';
import { OPEN_HOUR, CLOSE_HOUR } from './worldData.js';
import { fx } from '../ui/fx.js';
import { sfx } from '../core/sfx.js';

const D = progress.data;
const $ = (id) => document.getElementById(id);
const passed = () => LESSONS.filter((l) => progress.lessonPassed(l.id)).length;
const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
const first = (sels) => { for (const s of sels) { const el = document.querySelector(s); if (visible(el)) return el; } return null; };
const inWorld = () => !!ctx.world?.active;
const inHub = () => !$('hub').classList.contains('hidden');
const inStation = () => !$('hud').classList.contains('hidden');
const touch = () => matchMedia('(pointer: coarse)').matches;

/** Where am I? Points the player back to the city when a step needs it. */
function backToCity() {
  if (inStation()) return { point: ['#btnHome'], text: 'חזור לעיר: לחץ על ⌂ למעלה, ואז על "🏙️ חזרה לעיר".' };
  if (inHub()) return { point: ['#hubCity'], text: 'לחץ "🏙️ חזרה לעיר" כדי לצאת לרחוב.' };
  if (!$('sheet').classList.contains('hidden')) return { point: ['#sheetClose'], text: 'סגור את המסך הזה כדי לחזור לעיר.' };
  return null;
}

const STEPS = [
  {
    id: 'move', title: 'זזים בעיר', icon: '🕹️',
    text: () => touch() ? 'גרור את העיגול שבפינה כדי ללכת. דחיפה עד הקצה = ריצה. גרירת אצבע על המסך מסובבת את המצלמה.' : 'לך עם W A S D או החיצים. Shift = ריצה, רווח = קפיצה. גרור עם העכבר כדי לסובב את המצלמה.',
    point: () => touch() ? ['#joy'] : [],
    start: (T) => { const p = ctx.world.player.position; T.base.x = p.x; T.base.z = p.z; T.base.walked = 0; },
    tick: (T) => { const p = ctx.world.player.position; T.base.walked += Math.hypot(p.x - T.base.x, p.z - T.base.z); T.base.x = p.x; T.base.z = p.z; },
    progress: (T) => `${Math.min(12, Math.round(T.base.walked))}/12 מטרים`,
    done: (T) => T.base.walked >= 12,
    idleHint: () => touch() ? 'שים את האגודל על העיגול השקוף בפינה וגרור לכיוון שאתה רוצה ללכת.' : 'לחץ והחזק W (או ↑) כדי ללכת קדימה.',
  },
  {
    id: 'map', title: 'המפה', icon: '🗺️',
    text: (T) => T.flags.mapOpen ? 'זו מפת העיר: 🎓 אקדמיה, ✂️ מספרות, 🏠 הבית שלך. לחיצה על מקום מסמנת אליו יעד. עכשיו סגור את המפה (✕).' : 'לחץ על כפתור המפה 🗺️ (או על המפה הקטנה בפינה) כדי לראות את כל העיר.',
    point: (T) => T.flags.mapOpen ? ['#mapClose'] : ['#wMap'],
    tick: (T) => { if (!$('mapOverlay').classList.contains('hidden')) T.flags.mapOpen = true; },
    done: (T) => T.flags.mapOpen && $('mapOverlay').classList.contains('hidden'),
    idleHint: () => 'הכפתור 🗺️ נמצא למעלה ליד המפה הקטנה. במחשב אפשר גם ללחוץ M.',
  },
  {
    id: 'talk', title: 'מדברים עם אנשים', icon: '💬',
    text: () => 'תושבי העיר נותנים טיפים על המקצוע. לך לאדם הקרוב (החץ הזהב מוביל אליו) ולחץ על כפתור "💬 דבר עם..." כשהוא מופיע.',
    point: () => ['#wInteract'],
    target: () => { const w = ctx.world, n = w.people.nearest(w.player.position, 60); return n ? { x: n.mesh.position.x, z: n.mesh.position.z, label: n.name, moving: true } : null; },
    done: (T) => T.flags.talked,
    idleHint: () => 'התקרב לאדם עד שכפתור "💬 דבר עם..." מופיע בפינה, ואז לחץ עליו (או E במחשב).',
  },
  {
    id: 'enter', title: 'נכנסים למספרה', icon: '🚪',
    text: () => 'עקוב אחרי החץ הזהב אל המספרה Fade House. הדלתות נפתחות לבד — פשוט תיכנס.',
    target: () => ({ ...ctx.world.city.buildings.fadeHouse.inside, label: 'Fade House' }),
    done: () => ctx.world.insideBuilding(ctx.world.player.position)?.id === 'fadeHouse',
    wrong: () => { const b = ctx.world.insideBuilding(ctx.world.player.position); return b && b.id !== 'fadeHouse' ? 'זו לא המספרה הנכונה 🙂 צא החוצה ועקוב אחרי החץ הזהב ל־Fade House.' : null; },
    idleHint: () => 'החץ הזהב ליד הרגליים שלך מצביע לכיוון. העמוד הזוהר מסמן את היעד.',
  },
  {
    id: 'job', title: 'מוצאים עבודה', icon: '💼',
    text: () => 'גש לדלפק בסוף המספרה ודבר עם מוטי, הבעלים. בקש לעבוד אצלו.',
    point: () => document.querySelector('#dialogModal:not(.hidden)') ? ['#dialogButtons .btn.primary'] : ['#wInteract'],
    target: () => ({ ...ctx.world.city.buildings.fadeHouse.reception, label: 'מוטי — הדלפק' }),
    done: () => !!ctx.life.state.job,
    wrong: (T) => { if (T.flags.ownerTalked && !document.querySelector('#dialogModal:not(.hidden)') && !ctx.life.state.job) return 'סגרת בלי להתקבל. דבר שוב עם מוטי ולחץ "אני רוצה לעבוד כאן!".'; return null; },
    idleHint: () => 'הדלפק נמצא בצד ימין בסוף המספרה. כשאתה קרוב יופיע "🗣️ דבר עם מוטי".',
  },
  {
    id: 'learn', title: 'לומדים תספורות', icon: '🎓',
    text: () => inHub() || !$('sheet').classList.contains('hidden')
      ? 'זו האקדמיה. פתח "📚 מסלול לימוד" ועבור את השיעור הראשון: קרא, תרגל וענה על המשימה.'
      : 'מוטי: "לפני לקוחות — תלמד את הבסיס." לך לאקדמיה (החץ מוביל) ודבר עם המזכירה.',
    point: () => inHub() ? ['[data-go="lessons"]'] : !$('sheet').classList.contains('hidden') ? ['.lesson-item:not(.locked):not(.done)', '#sheetBody .btn.primary'] : ['#wInteract'],
    target: () => ({ ...ctx.world.city.buildings.academy.desk, label: 'האקדמיה — המזכירה' }),
    start: (T) => { T.base.passed = passed(); },
    done: (T) => passed() > T.base.passed || (T.base.passed > 0 && T.flags.skipLearn),
    idleHint: () => inWorld() ? 'האקדמיה היא הבניין הזהוב (🎓 במפה). המזכירה יושבת מאחורי הדלפק.' : 'בחר שיעור פתוח מהרשימה ולחץ עליו.',
  },
  {
    id: 'tools', title: 'מכונה ומספריים', icon: '✂️',
    text: (T) => {
      if (inStation()) {
        if ((T.base.clipper || 0) < 12) return 'בחר 🔹 מכונה וגרור על הצדדים של הראש. השערות נחתכות לפי המסרק שבחרת (המספר = מ״מ שנשארים).';
        if ((T.base.scissors || 0) < 12) return 'מעולה! עכשיו בחר ✂ מספריים וגרור על החלק העליון. מספריים משאירים שיער ארוך יותר.';
        return 'יופי!';
      }
      if (!$('sheet').classList.contains('hidden')) return 'בחר ראש אימון (למשל דניאל) — אפשר לספר בלי לחץ ובלי זמן.';
      return inHub() ? 'עכשיו תרגול מעשי: פתח "🎯 מצב אימונים" ובחר ראש אימון.' : 'חזור לאקדמיה (המזכירה) ופתח את מצב האימונים.';
    },
    point: (T) => inStation() ? ((T.base.clipper || 0) < 12 ? (ctx.tools?.active === 'clipper' ? [] : ['[data-tool="clipper"]']) : (ctx.tools?.active === 'scissors' ? [] : ['[data-tool="scissors"]'])) : inHub() ? ['[data-go="practice"]'] : !$('sheet').classList.contains('hidden') ? ['[data-free]', '#sheetBody .btn.primary'] : ['#wInteract'],
    target: () => ({ ...ctx.world.city.buildings.academy.desk, label: 'האקדמיה' }),
    tick: (T) => { const c = ctx.cutCount || {}; T.base.clipper = (c.clipper || 0) - (T.base.c0 || 0); T.base.scissors = (c.scissors || 0) - (T.base.s0 || 0); },
    start: (T) => { const c = ctx.cutCount || {}; T.base.c0 = c.clipper || 0; T.base.s0 = c.scissors || 0; },
    progress: (T) => `מכונה ${Math.min(12, Math.max(0, T.base.clipper || 0))}/12 · מספריים ${Math.min(12, Math.max(0, T.base.scissors || 0))}/12`,
    done: (T) => (T.base.clipper || 0) >= 12 && (T.base.scissors || 0) >= 12,
    wrong: () => (inStation() && ctx.tools && !['clipper', 'scissors'].includes(ctx.tools.active) ? 'בשלב הזה צריך מכונה או מספריים — בחר אחד מהם בצד המסך.' : null),
    idleHint: () => inStation() ? 'גרור את האצבע (או העכבר) על השיער עצמו. גרירה על הרקע רק מסובבת את המצלמה.' : 'מצב האימונים נמצא בתפריט האקדמיה: 🎯 מצב אימונים.',
  },
  {
    id: 'client', title: 'מקבלים לקוח', icon: '💈',
    text: () => {
      const back = backToCity(); if (back) return `כל הכבוד! עכשיו לעבודה האמיתית. ${back.text}`;
      const h = ctx.life.hour;
      if (h < OPEN_HOUR || h >= CLOSE_HOUR) return 'המספרה סגורה עכשיו (פתוח 9:00–19:00). אפשר לחכות לפתיחה בכפתור למטה.';
      return 'לך לכיסא שלך ב־Fade House. לקוחות נכנסים מהרחוב ומחכים על הספסל. לחץ "💈 עבוד בכיסא", הקשב לבקשה וספר!';
    },
    point: () => backToCity()?.point || ['#wInteract'],
    target: () => ({ ...ctx.world.city.buildings[ctx.life.state.job?.shopId || 'fadeHouse'].stationSpots[0].barber, label: 'הכיסא שלך' }),
    action: () => { const h = ctx.life.hour; return inWorld() && (h < OPEN_HOUR || h >= CLOSE_HOUR) ? { label: '⏩ חכה לפתיחה (9:00)', run: () => { const m = ctx.life.state.minute; const add = m < OPEN_HOUR * 60 ? OPEN_HOUR * 60 - m : 1440 - m + OPEN_HOUR * 60; ctx.life.advance(add + 2); ctx.toast('⏰ 09:00 — המספרה פתוחה!'); } } : null; },
    start: (T) => { T.base.served = ctx.life.state.jobServed; },
    tick: () => { const rt = ctx.life.runtimes?.[ctx.life.state.job?.shopId || 'fadeHouse']; if (rt && rt.open && !rt.waiting.length && !rt.pending) rt.acc = Math.max(rt.acc, 1); },
    done: (T) => ctx.life.state.jobServed > T.base.served,
    idleHint: () => 'עמוד ליד הכיסא הראשון (משמאל לכניסה). כשיש לקוח מחכה, יופיע "💈 עבוד בכיסא".',
  },
  {
    id: 'money', title: 'מרוויחים כסף', icon: '🪙',
    text: () => 'קיבלת תשלום: עמלה לפי איכות התספורת + טיפ על שירות טוב. פתח את הטלפון 📱 כדי לראות כסף, הוצאות וקריירה.',
    point: () => backToCity()?.point || ['#wPhone'],
    done: (T) => T.flags.phone,
    idleHint: () => 'כפתור הטלפון 📱 נמצא למעלה ליד המפה. במחשב: P.',
  },
  {
    id: 'buy', title: 'חוסכים וקונים מספרה', icon: '🏢',
    text: () => backToCity()?.text || 'בחצות משלמים שכירות ומקבלים סיכום יומי. כשתחסוך מספיק — שוכרים חנות במשרד הנדל״ן. לך לשם עכשיו ותראה מה מחכה לך.',
    point: () => backToCity()?.point || ['#wInteract'],
    target: () => ({ ...ctx.world.city.buildings.realty.desk, label: 'משרד הנדל״ן' }),
    done: (T) => T.flags.realty,
    idleHint: () => 'משרד הנדל״ן (🏢 במפה) נמצא ליד האקדמיה. דבר עם הסוכן בדלפק.',
  },
];

export const tutorial = {
  steps: STEPS,
  get st() { return ctx.life?.state; },
  get active() { const t = this.st?.tutorial; return !!t && !t.done; },
  get step() { return this.active ? STEPS[this.st.tutorial.step] : null; },

  init() {
    ctx.tutorial = this;
    const s = this.st;
    if (!s.tutorial) {
      const fresh = !s.everEmployed && !Object.keys(s.branches).length && passed() === 0 && !D.stats.haircuts;
      s.tutorial = fresh ? { step: 0, base: {}, flags: {}, done: false } : { step: 0, base: {}, flags: {}, done: true, offered: true };
      if (fresh) this._begin(); else setTimeout(() => ctx.toast?.('💡 חדש: הדרכה אינטראקטיבית — בהגדרות ⚙️', 4000), 1500);
    } else if (this.active) this._begin(true);
    document.getElementById('tutSkip').onclick = () => this.skip();
    this._loop();
  },
  restart() {
    this.st.tutorial = { step: 0, base: {}, flags: {}, done: false };
    if (ctx.life.state.job || passed() > 0) this.st.tutorial.flags.skipLearn = true;
    this._begin();
    ctx.life.save();
  },
  skip() {
    ctx.dialog({ title: 'לדלג על ההדרכה?', html: '<p>אפשר להפעיל אותה שוב מתי שתרצה בהגדרות ⚙️. יומן המשימות ימשיך להראות לך מה לעשות.</p>', buttons: [
      { label: 'כן, לדלג', action: () => { this.st.tutorial.done = true; ctx.life.save(); this._render(); } },
      { label: 'להמשיך בהדרכה', primary: true }] });
  },
  /** Something happened in the game (talked, phone, realty, ownerTalked, ...). */
  flag(name) { if (this.active) { this.st.tutorial.flags[name] = true; } },

  _begin(resume = false) {
    const t = this.st.tutorial, step = STEPS[t.step];
    if (!resume) { t.base = {}; t.flags = { skipLearn: t.flags?.skipLearn }; step.start?.(this.ctxObj()); }
    else if (!t.base || !Object.keys(t.base).length) step.start?.(this.ctxObj());
    this._idle = 0; this._lastHint = null;
    this._render();
  },
  ctxObj() { const t = this.st.tutorial; t.base ||= {}; t.flags ||= {}; return t; },

  _complete() {
    const t = this.st.tutorial, step = STEPS[t.step];
    progress.reward(15, 0);
    sfx.play('task');
    fx.banner(`✅ ${step.title}`, `שלב ${t.step + 1}/10 הושלם · +15 XP`, { sound: 'success', confetti: t.step === STEPS.length - 1 });
    t.step++;
    if (t.step >= STEPS.length) {
      t.done = true;
      progress.reward(100, 200);
      ctx.life.save();
      setTimeout(() => {
        fx.banner('🎓 סיימת את ההדרכה!', '+100 XP · +200 🪙 · עכשיו העיר שלך', { sound: 'level' });
        fx.coins(200);
        ctx.quests?.check();
      }, 1600);
      this._render();
      return;
    }
    ctx.life.save();
    this._hold = performance.now() + 1500; // let the success banner breathe before the next card
    this._begin();
  },

  /** GPS target for the current step (or null). */
  target() {
    const s = this.step;
    if (!s?.target || !inWorld()) return null;
    try { return s.target(this.ctxObj()); } catch { return null; }
  },

  _loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      if (!this.active || !ctx.world?.ready) { this._hidePointer(); return; }
      const T = this.ctxObj(), s = STEPS[T.step];
      const now = performance.now();
      if (this._hold && now < this._hold) { this._hidePointer(); $('tutCard').classList.add('hidden'); return; }
      this._hold = 0;
      $('tutCard').classList.remove('hidden');
      try {
        if (inWorld() || s.id === 'tools' || s.id === 'learn') s.tick?.(T);
        if (s.done(T)) { this._complete(); return; }
      } catch { /* a step can't be evaluated right now (e.g. city not loaded) */ }
      // every ~0.25 s: refresh text, hints and the pointer
      if (now - (this._lastR || 0) > 250) {
        this._lastR = now;
        this._idle += 0.25;
        const wrong = s.wrong?.(T);
        if (wrong) { this._setHint(wrong, true); } else if (this._idle > 20 && s.idleHint) { this._setHint(s.idleHint(T), false); } else this._setHint('');
        this._render(true);
      }
      this._pointer(s, T);
    };
    requestAnimationFrame(tick);
  },
  /** reset the idle timer when the player is doing something */
  poke() { this._idle = 0; },

  _setHint(text, bad) {
    const el = $('tutHint');
    if (text === this._lastHint) return;
    if (text && bad && this._lastHint !== text) sfx.play('error');
    this._lastHint = text;
    el.textContent = text ? `${bad ? '⚠️' : '💡'} ${text}` : '';
    el.className = `tut-hint ${bad ? 'bad' : ''} ${text ? 'show' : ''}`;
  },

  _render(soft = false) {
    const card = $('tutCard');
    document.body.classList.toggle('tut-on', this.active);
    if (!this.active) { card.classList.add('hidden'); this._hidePointer(); return; }
    const T = this.ctxObj(), s = STEPS[T.step];
    card.classList.remove('hidden');
    $('tutStep').textContent = `הדרכה · שלב ${T.step + 1}/10`;
    $('tutTitle').textContent = `${s.icon} ${s.title}`;
    $('tutText').textContent = s.text(T);
    $('tutProgress').textContent = s.progress ? s.progress(T) : '';
    $('tutDots').innerHTML = STEPS.map((_, i) => `<i class="${i < T.step ? 'done' : i === T.step ? 'cur' : ''}"></i>`).join('');
    const a = s.action?.(T);
    const btn = $('tutAction');
    btn.classList.toggle('hidden', !a);
    if (a) { btn.textContent = a.label; btn.onclick = () => { a.run(); this._render(); }; }
    if (!soft) { card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse'); }
  },

  _pointer(s, T) {
    const sels = s.point?.(T) || [];
    const el = first(sels);
    const arrow = $('tutArrow'), ring = $('tutRing');
    // the card itself never covers the thing it points at
    if (!el || document.querySelector('.modal:not(.hidden):not(#dialogModal)')) { this._hidePointer(); return; }
    const r = el.getBoundingClientRect();
    ring.style.cssText = `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`;
    ring.classList.remove('hidden');
    const above = r.top > 90;
    arrow.classList.toggle('up', !above);
    arrow.style.left = `${r.left + r.width / 2}px`;
    arrow.style.top = `${above ? r.top - 12 : r.bottom + 12}px`;
    arrow.classList.remove('hidden');
  },
  _hidePointer() { $('tutArrow')?.classList.add('hidden'); $('tutRing')?.classList.add('hidden'); },
};
