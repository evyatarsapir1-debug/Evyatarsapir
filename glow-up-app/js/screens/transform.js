// "השינוי שלי" – the transformation program: setup, targets, food log, progressive training,
// face protocol and body measurements with private before/after comparison.
import { h, ic, toast, note, sheet, sheetHead, bar, ring, emptyState, confirmDialog, chips, burst } from '../ui.js';
import { getState, update, todayKey, addDays, daysBetween, day, storedImg } from '../store.js';
import { GOALS, ACTIVITY, EQUIPMENT, computeTargets, projection, weeklyReview, currentWeight, weights, bmi, isAdult,
  nextSession, targetFor, program, isTrainingDay, foodTotals, foodEntry, exampleDay, faceProtocol, DONT_WORK, easierOf } from '../transform.js';
import { FOODS, FOOD, DAY_TEMPLATES } from '../data/foods.js';
import { EX } from '../data/fitness.js';
import { topbar, section, fmtDate, cheer } from './common.js';
import { figureSVG } from '../figure.js';

const n0 = (x) => Math.round(x).toLocaleString('he-IL');
/** "ירד 1.5 ק״ג" / "עלה 0.4 ק״ג" – avoids minus signs flipping in RTL text. */
export function diffText(v, unit) {
  if (!v) return `ללא שינוי`;
  return `${v < 0 ? 'ירד' : 'עלה'} ${Math.abs(v)} ${unit}`;
}

export default function transform(ctx) {
  const s = getState();
  const root = h('main');
  if (!s.transform?.active || ctx.query.get('setup')) {
    root.append(topbar('מסלול שינוי', { sub: 'תוכנית אישית שמשנה גוף ומראה', back: '#/home' }));
    root.append(setup(ctx));
    return root;
  }
  const tab = ctx.query.get('tab') || 'plan';
  root.append(topbar('השינוי שלי', { sub: GOALS.find((g) => g.id === s.transform.goal)?.label, back: '#/home',
    actions: [h('button', { class: 'icon-btn', 'aria-label': 'עריכת המסלול', onclick: () => ctx.go('#/transform?setup=1') }, ic('edit'))] }));
  const tabs = [['plan', 'מסלול'], ['food', 'אוכל'], ['train', 'אימון'], ['face', 'פנים'], ['body', 'מדדים']];
  root.append(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', class: tab === id ? 'on' : '', onclick: () => ctx.go(`#/transform?tab=${id}`) }, label))));
  root.append(tab === 'plan' ? planTab(ctx) : tab === 'food' ? foodTab(ctx) : tab === 'train' ? trainTab(ctx) : tab === 'face' ? faceTab(ctx) : bodyTab(ctx));
  return root;
}

// ---------------- setup ----------------
function setup(ctx) {
  const s = getState();
  const p = s.profile;
  const adult = p.age >= 18;
  const prev = s.transform || {};
  const t = {
    goal: (['cut', 'bulk', 'recomp', 'face'].includes(ctx.query.get('goal')) ? ctx.query.get('goal') : null) || prev.goal || (adult ? 'cut' : 'bulk'), sex: prev.sex || '', heightCm: prev.heightCm || '', startWeight: prev.startWeight || '',
    goalWeight: prev.goalWeight || '', activity: prev.activity || 'light', equipment: prev.equipment || 'home',
    daysPerWeek: prev.daysPerWeek || (p.fitnessLevel === 'intermediate' || p.fitnessLevel === 'advanced' ? 4 : 3), weighIns: prev.weighIns ?? adult,
  };
  const wrap = h('div');
  const preview = h('div');
  const drawPreview = () => {
    const ok = +t.heightCm > 120 && +t.startWeight > 30;
    if (!ok) { preview.replaceChildren(h('p', { class: 'small muted' }, 'מלאו גובה ומשקל כדי לראות את היעדים שלכם.')); return; }
    const tg = computeTargets({ ...t, heightCm: +t.heightCm, startWeight: +t.startWeight, weights: [] }, p);
    preview.replaceChildren(h('div', { class: 'card hero' },
      h('b', null, 'היעדים היומיים שלך'),
      h('div', { class: 'grid3 mt' },
        stat(tg.kcal ? n0(tg.kcal) : 'לפי רעב', 'קלוריות'), stat(`${tg.protein} ג׳`, 'חלבון'), stat(n0(tg.steps), 'צעדים')),
      ...tg.notes.map((x) => h('p', { class: 'small mt' }, x))));
  };
  const goalOpts = GOALS.map((g) => ({ ...g, label: g.label + (g.adult && !adult ? ' (גרסת נוער)' : '') }));
  wrap.append(
    h('div', { class: 'card hero' }, h('h3', null, 'גלואו אפ אמיתי = מערכת, לא רשימת תרגילים'),
      h('p', { class: 'small' }, 'המסלול מחשב לך יעדי אוכל, נותן תוכנית אימון שהמשקלים בה עולים מאימון לאימון, פרוטוקול פנים יומי, ובודק כל שבוע את התוצאות ומתקן את התוכנית בעצמו.')),
    section('מה המטרה הראשית?'),
    h('div', { class: 'opt-list' }, goalOpts.map((g) => h('button', { type: 'button', class: 'opt' + (t.goal === g.id ? ' on' : ''), onclick: (e) => { t.goal = g.id; e.currentTarget.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); drawPreview(); } },
      h('span', { class: 'oi' }, ic(g.icon)), h('div', null, h('b', null, g.label), h('small', { style: { display: 'block' } }, g.desc))))),
    !adult ? h('div', { class: 'mt' }, note(`בגיל ${p.age} המסלול בונה שריר, כוח ומראה – בלי גירעון קלורי, כי הגוף עוד גדל. זה עדיין שינוי אמיתי: אימון כוח מסודר משנה כתפיים, חזה, גב ויציבה בתוך חודשים.`)) : null,
    section('נתוני גוף (נשמרים רק אצלך)'),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', null, 'גובה (ס״מ)'), h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 120, max: 230, value: t.heightCm, oninput: (e) => { t.heightCm = e.target.value; drawPreview(); } })),
      h('label', { class: 'field' }, h('span', null, 'משקל (ק״ג)'), h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 30, max: 250, step: 0.1, value: t.startWeight, oninput: (e) => { t.startWeight = e.target.value; drawPreview(); } }))),
    h('div', { class: 'field' }, h('span', null, 'מין ביולוגי (רק לחישוב קצב חילוף החומרים)'), chips([{ id: 'm', label: 'זכר' }, { id: 'f', label: 'נקבה' }, { id: '', label: 'לא רוצה לציין' }], t.sex, (v) => { t.sex = v; drawPreview(); }, { multi: false })),
    adult ? h('label', { class: 'field' }, h('span', null, 'משקל יעד (לא חובה)'), h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 35, max: 250, step: 0.5, value: t.goalWeight, placeholder: 'לחישוב לוח זמנים', oninput: (e) => (t.goalWeight = e.target.value) })) : null,
    h('div', { class: 'field' }, h('span', null, 'כמה את/ה זז/ה ביום (בלי האימונים)'), chips(ACTIVITY.map((a) => ({ id: a.id, label: a.label })), t.activity, (v) => { t.activity = v; drawPreview(); }, { multi: false })),
    section('אימונים'),
    h('div', { class: 'field' }, h('span', null, 'איפה מתאמנים?'), chips(EQUIPMENT.map((a) => ({ id: a.id, label: a.label })), t.equipment, (v) => (t.equipment = v), { multi: false })),
    h('div', { class: 'field' }, h('span', null, 'כמה אימונים בשבוע?'), chips([{ id: 3, label: '3 אימונים' }, { id: 4, label: '4 אימונים' }], t.daysPerWeek, (v) => (t.daysPerWeek = v), { multi: false })),
    adult ? h('label', { class: 'list-row', style: { padding: '6px 0', border: 0, cursor: 'pointer' } }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'שקילת בוקר יומית'), h('div', { class: 'd' }, 'הממוצע השבועי מאפשר למערכת לכוונן את היעדים. אפשר לכבות.')),
      h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: t.weighIns, 'aria-label': 'שקילה יומית', onchange: (e) => (t.weighIns = e.target.checked) }), h('span'))) : null,
    h('div', { class: 'mt' }, preview),
    h('button', { class: 'btn primary block mt2', 'data-tf-start': '', onclick: () => {
      const H = +t.heightCm, W = +t.startWeight;
      if (!(H >= 120 && H <= 230)) return toast('גובה לא תקין', 'info');
      if (!(W >= 30 && W <= 250)) return toast('משקל לא תקין', 'info');
      update((st) => {
        const old = st.transform || {};
        st.transform = { ...old, active: true, goal: t.goal, sex: t.sex, heightCm: H, startWeight: old.startWeight || W, goalWeight: +t.goalWeight || null,
          activity: t.activity, equipment: t.equipment, daysPerWeek: t.daysPerWeek, weighIns: adult && t.weighIns,
          startDate: old.startDate || todayKey(), weights: old.weights || [], waist: old.waist || [], adjustments: old.adjustments || [], kcalAdjust: old.kcalAdjust || 0,
          lifts: old.lifts || {}, sessionCount: old.sessionCount || 0, swaps: old.swaps || {} };
        if (!st.transform.weights.some((x) => x.date === todayKey())) st.transform.weights.push({ date: todayKey(), kg: W });
        if (!st.profile.areas.includes('fitness')) st.profile.areas.push('fitness');
      });
      toast(prev.active ? 'המסלול עודכן' : 'מסלול השינוי התחיל! 🔥', 'zap');
      ctx.go('#/transform');
    } }, ic('zap'), prev.active ? 'שמירת שינויים' : 'להתחיל את השינוי'),
    prev.active ? h('button', { class: 'btn ghost block mt', onclick: async () => { if (await confirmDialog('לעצור את מסלול השינוי?', 'הנתונים נשמרים ואפשר לחזור בכל רגע.', { ok: 'עצירה' })) { update((st) => { st.transform.active = false; }); ctx.go('#/home'); } } }, 'עצירת המסלול') : null);
  drawPreview();
  return wrap;
}

function stat(v, k) { return h('div', { class: 'stat', style: { padding: '10px' } }, h('div', { class: 'v', style: { fontSize: '20px' } }, v), h('div', { class: 'k' }, k)); }

// ---------------- plan overview ----------------
function planTab(ctx) {
  const s = getState();
  const t = s.transform;
  const tg = computeTargets();
  const wrap = h('div');
  const week = Math.floor(daysBetween(t.startDate, todayKey()) / 7) + 1;
  const cw = currentWeight();
  const diff = cw && t.startWeight ? Math.round((cw - t.startWeight) * 10) / 10 : 0;
  wrap.append(h('div', { class: 'card hero' },
    h('div', { class: 'row between' }, h('span', { class: 'tag purple' }, ic('calendar'), `שבוע ${week}`), cw ? h('span', { class: 'tag ' + (diff < 0 ? 'lime' : diff > 0 ? 'amber' : '') }, diffText(diff, 'ק״ג') + ' מההתחלה') : null),
    h('h3', { class: 'mt', style: { fontSize: '18px' } }, 'היעדים היומיים שלך'),
    h('div', { class: 'grid3 mt' }, stat(tg.kcal ? n0(tg.kcal) : 'לפי רעב', 'קלוריות'), stat(`${tg.protein}ג׳`, 'חלבון'), stat(n0(tg.steps), 'צעדים')),
    tg.kcal ? h('p', { class: 'tiny muted mt' }, `שומן ~${tg.fat}ג׳ · פחמימות ~${tg.carbs}ג׳ · הוצאה יומית משוערת ${n0(tg.tdee)} קק״ל`) : null,
    ...tg.notes.map((x) => h('p', { class: 'small mt' }, x))));

  // weekly adaptive review
  const rev = weeklyReview();
  if (rev) {
    wrap.append(h('div', { class: 'card glow' },
      h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic('refresh')), h('div', { class: 'grow' }, h('b', null, 'בדיקה שבועית'), h('div', { class: 'tiny muted' }, `ממוצע שבועי: ${rev.prev} ← ${rev.now} ק״ג (${diffText(rev.pct, '%')})`))),
      h('p', { class: 'small mt' }, rev.reason),
      rev.delta ? h('button', { class: 'btn primary block mt', onclick: () => {
        update((st) => { const tt = st.transform; tt.kcalAdjust = (tt.kcalAdjust || 0) + rev.delta; tt.adjustments.push({ date: todayKey(), delta: rev.delta, reason: rev.reason }); });
        toast('היעדים עודכנו', 'check'); ctx.refresh();
      } }, ic('check'), `לעדכן (${rev.delta > 0 ? '+' : ''}${rev.delta} קלוריות)`) : h('button', { class: 'btn block mt', onclick: () => { update((st) => { st.transform.adjustments.push({ date: todayKey(), delta: 0, reason: rev.reason }); }); ctx.refresh(); } }, 'מעולה, ממשיכים')));
  } else if (t.weighIns) {
    wrap.append(h('p', { class: 'small muted', style: { margin: '12px 4px' } }, ic('info'), ' המערכת בודקת את הממוצע השבועי ומכווננת יעדים אוטומטית אחרי שבועיים של שקילות (לפחות 3 בשבוע).'));
  }

  // projection
  const pr = projection();
  if (pr) {
    wrap.append(h('div', { class: 'card' }, h('b', null, 'לוח זמנים משוער'),
      pr.reached ? h('p', { class: 'small mt' }, 'הגעת למשקל היעד! 🎉 אפשר לעדכן יעד חדש או לעבור לשמירה/בניית שריר.')
        : h('p', { class: 'small mt' }, `בקצב בריא של כ-${pr.perWeek} ק״ג בשבוע, משקל היעד (${t.goalWeight} ק״ג) צפוי בעוד כ-${pr.weeks} שבועות – בסביבות ${fmtDate(pr.date, { day: 'numeric', month: 'long', year: 'numeric' })}. זו הערכה; גוף אמיתי לא יורד בקו ישר.`)));
  }

  // what changes when
  wrap.append(section('מה ישתנה ומתי'));
  const cut = tg.mode === 'deficit';
  const stages = [
    ['שבוע 1-2', cut ? 'פחות נפיחות בפנים ובבטן, יותר אנרגיה, הכוח באימונים עולה מהר (מערכת העצבים לומדת).' : 'הכוח עולה מהר, יותר אנרגיה, שינה טובה יותר, יציבה משתפרת.'],
    ['שבוע 3-6', cut ? 'הבגדים יושבים אחרת, קו המותניים יורד, הפנים מתחילות להיראות חדות יותר.' : 'שרירים מתמלאים – כתפיים וחזה נראים מלאים יותר במראה.'],
    ['שבוע 8-12', cut ? 'שינוי שאחרים שמים לב אליו: לסת ועצמות לחיים מוגדרות יותר, שרירים נראים.' : 'שינוי שאחרים שמים לב אליו – גוף חזק וגדול יותר, יציבה בטוחה.'],
    ['חודש 4+', 'שינוי משמעותי בהשוואת תמונות. ההרגלים כבר אוטומטיים.'],
  ];
  wrap.append(h('div', { class: 'list' }, stages.map(([w, d], i) => h('div', { class: 'list-row' }, h('span', { class: 'tag ' + (week * 7 >= [0, 21, 56, 112][i] ? 'purple' : '') }, w), h('div', { class: 'grow small' }, d)))));

  // today
  wrap.append(section('היום'));
  const ft = foodTotals();
  const steps = s.days[todayKey()]?.steps || 0;
  const train = isTrainingDay();
  wrap.append(h('div', { class: 'list' },
    rowLink('apple', tg.kcal ? `אוכל: ${n0(ft.kcal)} / ${n0(tg.kcal)} קק״ל` : `חלבון: ${Math.round(ft.p)} / ${tg.protein} ג׳`, tg.kcal ? `חלבון ${Math.round(ft.p)} / ${tg.protein} ג׳` : 'אוכלים לפי רעב, חלבון בכל ארוחה', '#/transform?tab=food'),
    rowLink('dumbbell', train ? `אימון: ${nextSession().name}` : 'יום מנוחה מאימון כוח', train ? 'יעדים מדויקים לכל תרגיל' : 'הליכה וצעדים בלבד', '#/transform?tab=train'),
    rowLink('zap', `צעדים: ${n0(steps)} / ${n0(tg.steps)}`, 'לעדכן במדדים', '#/transform?tab=body'),
    rowLink('face', 'פרוטוקול פנים יומי', `${(s.days[todayKey()]?.face || []).length} פעולות סומנו`, '#/transform?tab=face')));
  wrap.append(h('div', { class: 'mt' }, note('אם יש מחלה כרונית, תרופות קבועות, היסטוריה של הפרעות אכילה או היריון – להתייעץ עם רופא/ה לפני שינוי תזונה. סחרחורת, עייפות קיצונית או מחזור שנעצר – סימן לעצור ולהתייעץ.', 'med')));
  return wrap;
}

function rowLink(icon, title, desc, hash) {
  return h('button', { class: 'list-row', onclick: () => (location.hash = hash) }, h('span', { class: 'ico' }, ic(icon)), h('div', { class: 'grow' }, h('div', { class: 't' }, title), h('div', { class: 'd' }, desc)), ic('chevron', 'chev'));
}

// ---------------- food ----------------
function foodTab(ctx) {
  const s = getState();
  const tg = computeTargets();
  const key = todayKey();
  const ft = foodTotals(key);
  const wrap = h('div');
  const adult = isAdult();
  wrap.append(h('div', { class: 'card hero' },
    h('div', { class: 'row' },
      tg.kcal ? ring(ft.kcal / tg.kcal, n0(ft.kcal), `מתוך ${n0(tg.kcal)}`, 100) : ring(ft.p / tg.protein, `${Math.round(ft.p)}ג׳`, 'חלבון', 100),
      h('div', { class: 'grow' },
        macroBar('חלבון', ft.p, tg.protein, '#f472b6'),
        tg.carbs ? macroBar('פחמימות', ft.c, tg.carbs, '#fbbf24') : null,
        tg.fat ? macroBar('שומן', ft.f, tg.fat, '#a3e635') : null)),
    tg.kcal && ft.kcal > tg.kcal * 1.1 ? h('p', { class: 'small mt' }, 'עברת את היעד היום – לא נורא. יום אחד לא משנה כלום; הממוצע השבועי הוא מה שקובע.') : null));
  wrap.append(h('div', { class: 'row mt' },
    h('button', { class: 'btn primary grow', 'data-food-add': '', onclick: () => addFood(ctx) }, ic('plus'), 'הוספת אוכל'),
    h('button', { class: 'btn', onclick: () => customFood(ctx) }, ic('edit'), 'ידני')));
  const log = s.days[key]?.food || [];
  wrap.append(section(`היומן של היום (${log.length})`));
  wrap.append(log.length ? h('div', { class: 'list' }, log.map((x) => h('div', { class: 'list-row' },
    h('div', { class: 'grow' }, h('div', { class: 't' }, `${x.name}${x.qty ? ` × ${x.qty}` : ''}`), h('div', { class: 'd' }, `${x.kcal} קק״ל · ${x.p}ג׳ חלבון${x.unit ? ` · ${x.unit}` : ''}`)),
    h('button', { class: 'icon-btn', 'aria-label': 'מחיקה', onclick: () => { update(() => { const d = day(key); d.food = d.food.filter((y) => y.id !== x.id); }); ctx.refresh(); } }, ic('trash')))))
    : h('div', { class: 'card' }, emptyState('apple', 'עוד לא נרשם אוכל היום. אפשר להוסיף מהרשימה או להוסיף ארוחה שלמה מהתפריט לדוגמה.')));

  // example day
  const ti = +(ctx.query.get('tpl') || 0);
  const ex = exampleDay(ti, tg.kcal ? tg : { protein: tg.protein });
  wrap.append(section('תפריט לדוגמה שמגיע ליעדים שלך'));
  wrap.append(h('div', { class: 'chips scroll' }, DAY_TEMPLATES.map((d, i) => h('button', { class: 'chip' + (i === ti % DAY_TEMPLATES.length ? ' on' : ''), onclick: () => ctx.go(`#/transform?tab=food&tpl=${i}`) }, d.name))));
  wrap.append(h('div', { class: 'card', style: { marginTop: '12px' } },
    h('div', { class: 'row between' }, h('b', null, ex.name), h('span', { class: 'tag purple' }, `${n0(ex.totals.kcal)} קק״ל · ${ex.totals.p}ג׳ חלבון`)),
    ...ex.meals.map((m) => h('div', { style: { marginTop: '12px' } },
      h('div', { class: 'row between' }, h('b', { class: 'small' }, m.name), h('button', { class: 'btn sm', onclick: () => {
        update(() => { const d = day(key); d.food ||= []; m.items.forEach((it) => d.food.push(foodEntry(it.id, it.q))); });
        toast(`${m.name} נוספה ליומן`, 'check'); ctx.refresh();
      } }, ic('plus'), 'ליומן')),
      h('ul', { class: 'dots small' }, m.items.map((it) => h('li', null, `${FOOD[it.id].name} – ${it.q} × ${FOOD[it.id].unit}`)))))),
  );
  if (!adult) wrap.append(h('div', { class: 'mt' }, note('הכמויות הן הצעה בלבד – בגילך אוכלים לפי רעב. אם עדיין רעבים, מוסיפים עוד פחמימה או חלבון. אבקות חלבון לא נחוצות.')));
  wrap.append(section('כללי הזהב'));
  wrap.append(h('div', { class: 'card' }, h('ul', { class: 'dots small' },
    h('li', null, 'חלבון בכל ארוחה – הוא שומר ובונה שריר ומשביע.'),
    h('li', null, 'חצי צלחת ירקות – נפח גדול, מעט קלוריות.'),
    h('li', null, 'משקאות ממותקים → מים / סודה / זירו. זה החיסכון הכי קל.'),
    h('li', null, '80/20: רוב הזמן אוכל פשוט, ויש מקום לפיצה עם חברים.'),
    adult ? h('li', null, 'לא יורדים מתחת ליעד באופן קבוע – גירעון גדול מדי שורף שריר ועוצר התקדמות.') : h('li', null, 'לא מדלגים על ארוחות – הגוף צריך אנרגיה לגדילה ולאימונים.'))));
  return wrap;
}

function macroBar(label, v, target, color) {
  const pct = target ? Math.min(1, v / target) : 0;
  const b = bar(pct);
  b.firstChild.style.background = color;
  return h('div', { style: { marginBottom: '8px' } }, h('div', { class: 'row between tiny' }, h('span', null, label), h('span', { class: 'muted' }, `${Math.round(v)} / ${target}ג׳`)), b);
}

function maybeMarkFood() {
  const tg = computeTargets();
  const ft = foodTotals();
  const ok = ft.p >= tg.protein * 0.9 && (!tg.kcal || (ft.kcal >= tg.kcal * 0.85 && ft.kcal <= tg.kcal * 1.1));
  update(() => { const d = day(); if (ok) d.done['tf-food'] = true; });
  return ok;
}

function addFood(ctx) {
  const adult = isAdult();
  sheet((api) => {
    let q = '';
    const list = h('div', { class: 'list' });
    const draw = () => {
      const items = FOODS.filter((f) => (adult || !f.adult) && (!q || f.name.includes(q)));
      list.replaceChildren(...items.map((f) => {
        let qty = 1;
        const qEl = h('b', { style: { minWidth: '28px', textAlign: 'center' } }, '1');
        return h('div', { class: 'list-row' },
          h('div', { class: 'grow' }, h('div', { class: 't' }, f.name), h('div', { class: 'd' }, `${f.unit} · ${f.kcal} קק״ל · ${f.p}ג׳ חלבון`)),
          h('button', { class: 'icon-btn', 'aria-label': 'פחות', onclick: () => { qty = Math.max(0.5, qty - 0.5); qEl.textContent = qty; } }, ic('minus')),
          qEl,
          h('button', { class: 'icon-btn', 'aria-label': 'יותר', onclick: () => { qty += 0.5; qEl.textContent = qty; } }, ic('plus')),
          h('button', { class: 'btn sm primary', onclick: () => {
            update(() => { const d = day(); d.food ||= []; d.food.push(foodEntry(f.id, qty)); });
            const ok = maybeMarkFood();
            toast(ok ? 'הגעת ליעד האוכל היום! 💪' : `נוסף: ${f.name}`, 'check');
            api.close(); ctx.refresh();
          } }, 'הוספה'));
      }));
    };
    draw();
    return h('div', null, sheetHead('הוספת אוכל', 'הערכים משוערים לפי מנה. מספיק בערך – לא צריך לשקול כל גרם.', api),
      h('input', { class: 'input mb', type: 'search', placeholder: 'חיפוש…', 'data-no-autofocus': '1', oninput: (e) => { q = e.target.value.trim(); draw(); } }), list);
  });
}

function customFood(ctx) {
  const e = { name: '', kcal: '', p: '' };
  sheet((api) => h('div', null, sheetHead('רישום ידני', 'למשל ארוחה במסעדה – הערכה זה מספיק.', api),
    h('label', { class: 'field' }, h('span', null, 'מה אכלת?'), h('input', { class: 'input', maxlength: 40, oninput: (x) => (e.name = x.target.value) })),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', null, 'קלוריות (משוער)'), h('input', { class: 'input', type: 'number', min: 0, max: 5000, oninput: (x) => (e.kcal = x.target.value) })),
      h('label', { class: 'field' }, h('span', null, 'חלבון (ג׳)'), h('input', { class: 'input', type: 'number', min: 0, max: 300, oninput: (x) => (e.p = x.target.value) }))),
    h('button', { class: 'btn primary block', onclick: () => {
      if (!e.name.trim() || !(+e.kcal >= 0)) return toast('צריך שם וקלוריות', 'info');
      update(() => { const d = day(); d.food ||= []; d.food.push({ id: Math.random().toString(36).slice(2, 9), name: e.name.trim(), kcal: Math.round(+e.kcal), p: Math.round(+e.p || 0), c: 0, f: 0 }); });
      maybeMarkFood(); api.close(); toast('נוסף', 'check'); ctx.refresh();
    } }, ic('check'), 'הוספה')));
}

// ---------------- training ----------------
function trainTab(ctx) {
  const s = getState();
  const t = s.transform;
  const sess = nextSession();
  const train = isTrainingDay();
  const doneToday = !!s.days[todayKey()]?.done?.['tf-train'];
  const wrap = h('div');
  wrap.append(h('div', { class: 'card hero' },
    h('span', { class: 'tag purple' }, ic('dumbbell'), `${program().length === 2 ? 'כל הגוף' : 'עליון/תחתון'} · ${t.daysPerWeek} אימונים בשבוע · ${EQUIPMENT.find((x) => x.id === t.equipment).label}`),
    h('h3', { class: 'mt', style: { fontSize: '18px' } }, doneToday ? 'האימון של היום הושלם ✓' : `האימון הבא: ${sess.name}`),
    h('p', { class: 'small' }, train ? 'היום יום אימון בתוכנית.' : 'היום לא מתוכנן אימון כוח – מנוחה וצעדים. אפשר להתאמן בכל זאת אם פספסת יום.'),
    h('p', { class: 'small mt' }, 'השיטה: עובדים בטווח חזרות. כשכל הסטים מגיעים לקצה העליון – מעלים משקל. כך השרירים חייבים לגדול. המערכת זוכרת הכל ומחשבת את היעד הבא.')));
  const inputs = [];
  sess.items.forEach((slot) => {
    const tgt = targetFor(slot);
    const ex = tgt.ex;
    if (!ex) return;
    const sets = [];
    const card = h('div', { class: 'card', style: { marginTop: '12px' } },
      h('div', { class: 'row' },
        h('button', { class: 'ico', style: { width: '64px', height: '48px', padding: 0, overflow: 'hidden', background: 'var(--bg-2)', border: 0, borderRadius: '10px' }, html: figureSVG(ex.fig, { animate: false }), 'aria-label': ex.name, onclick: () => ctx.go('#/exercise/' + ex.id) }),
        h('div', { class: 'grow' }, h('b', null, ex.name), h('div', { class: 'tiny muted' }, `${slot.sets} סטים × ${slot.min}-${slot.max} ${tgt.unit}`)),
        easierOf(tgt.exId) ? h('button', { class: 'btn sm ghost', onclick: () => { update((st) => { st.transform.swaps = { ...(st.transform.swaps || {}), [slot.ex]: easierOf(tgt.exId) }; }); toast('הוחלף לגרסה קלה יותר', 'arrowDown'); ctx.refresh(); } }, 'קל יותר') : null),
      h('p', { class: 'small', style: { margin: '8px 0', color: tgt.up ? 'var(--lime)' : 'var(--text-2)' } }, tgt.note),
      tgt.suggestHarder ? h('button', { class: 'btn sm mb', onclick: () => { update((st) => { st.transform.swaps = { ...(st.transform.swaps || {}), [slot.ex]: tgt.suggestHarder }; }); toast('עברת לתרגיל קשה יותר 🔥', 'arrowUp'); ctx.refresh(); } }, ic('arrowUp'), `לעבור ל${EX[tgt.suggestHarder].name}`) : null);
    for (let i = 0; i < slot.sets; i++) {
      const w = h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 0.5, min: 0, placeholder: slot.inc ? 'ק״ג' : '—', value: tgt.weight ?? '', disabled: !slot.inc, 'aria-label': `משקל סט ${i + 1}` });
      const r = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 0, max: 300, value: tgt.reps, 'aria-label': `${tgt.unit} סט ${i + 1}` });
      sets.push({ w, r });
      card.append(h('div', { class: 'row', style: { marginTop: '6px' } }, h('span', { class: 'tag', style: { minWidth: '52px', justifyContent: 'center' } }, `סט ${i + 1}`), w, h('span', { class: 'tiny muted' }, '×'), r, h('span', { class: 'tiny muted', style: { minWidth: '34px' } }, tgt.unit)));
    }
    inputs.push({ exId: tgt.exId, sets, inc: slot.inc });
    wrap.append(card);
  });
  wrap.append(h('div', { class: 'mt' }, note('חימום לפני: 5 דקות הליכה/ג׳אמפינג ג׳ק + סט קל של התרגיל הראשון. מנוחה: 2-3 דקות בתרגילים כבדים, 60-90 שניות בקטנים. כאב חד – עוצרים.', 'warn')));
  wrap.append(h('button', { class: 'btn primary block mt', 'data-tf-finish': '', onclick: (e) => {
    const log = inputs.map((x) => ({ exId: x.exId, sets: x.sets.map((s2) => ({ w: x.inc ? +s2.w.value || 0 : 0, r: +s2.r.value || 0 })).filter((s2) => s2.r > 0) })).filter((x) => x.sets.length);
    if (!log.length) return toast('צריך למלא לפחות סט אחד', 'info');
    const missingW = inputs.some((x) => x.inc && x.sets.some((s2) => !s2.w.value));
    if (missingW) return toast('חסר משקל בחלק מהסטים', 'info');
    const date = todayKey();
    update((st) => {
      const tt = st.transform;
      log.forEach((l) => { tt.lifts[l.exId] ||= []; tt.lifts[l.exId].push({ date, sets: l.sets }); });
      tt.sessionCount = (tt.sessionCount || 0) + 1;
      const d = day(date);
      d.done['tf-train'] = true;
      d.workouts.push({ id: 'tf', name: sess.name, minutes: 45, sets: log.map((l) => ({ id: l.exId, name: EX[l.exId].name, sets: l.sets.length, reps: l.sets.map((x) => x.r).join('/'), weight: Math.max(...l.sets.map((x) => x.w)) || '' })), source: 'transform', at: Date.now() });
    });
    const r = e.currentTarget.getBoundingClientRect(); burst(r.left + r.width / 2, r.top);
    toast(`${sess.name} נשמר! ${cheer()}`, 'trophy');
    ctx.go('#/transform?tab=train');
  } }, ic('check'), 'סיום ושמירת האימון'));

  // records
  const lifts = Object.entries(t.lifts || {});
  if (lifts.length) {
    wrap.append(section('השיאים וההתקדמות שלך'));
    wrap.append(h('div', { class: 'list' }, lifts.map(([id, list]) => {
      const first = list[0], last = list[list.length - 1];
      const best = (l) => Math.max(...l.sets.map((x) => x.w || 0));
      const bestR = (l) => Math.max(...l.sets.map((x) => x.r));
      const isW = best(last) > 0;
      const delta = isW ? Math.round((best(last) - best(first)) * 10) / 10 : bestR(last) - bestR(first);
      return h('div', { class: 'list-row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, EX[id]?.name || id), h('div', { class: 'd' }, `${list.length} אימונים · אחרון: ${last.sets.map((x) => (isW ? `${x.w}×${x.r}` : x.r)).join(', ')}`)),
        delta > 0 ? h('span', { class: 'tag lime' }, ic('arrowUp'), `+${delta}${isW ? ' ק״ג' : ''}`) : null);
    })));
  }
  return wrap;
}

// ---------------- face ----------------
function faceTab(ctx) {
  const s = getState();
  const key = todayKey();
  const done = new Set(s.days[key]?.face || []);
  const items = faceProtocol();
  const wrap = h('div');
  wrap.append(h('div', { class: 'card hero' }, h('h3', null, 'פרוטוקול שינוי הפנים'),
    h('p', { class: 'small' }, 'מבנה העצמות לא משתנה – אבל איך שהפנים נראות משתנה מאוד: שומן, נפיחות, עור, שיער, זקן, יציבה וחיוך. אלה הפעולות שבאמת עובדות, לפי סדר ההשפעה.'),
    h('div', { class: 'mt' }, bar(done.size / items.length)), h('p', { class: 'tiny muted mt' }, `היום: ${done.size}/${items.length} סומנו`)));
  items.forEach((it) => {
    const on = done.has(it.id);
    wrap.append(h('div', { class: 'card', style: { marginTop: '12px' } },
      h('div', { class: 'row', style: { alignItems: 'flex-start' } },
        h('button', { class: 'check' + (on ? ' on' : ''), 'aria-label': it.title, 'aria-pressed': on ? 'true' : 'false', 'data-face': it.id, onclick: () => {
          update(() => { const d = day(key); const set = new Set(d.face || []); on ? set.delete(it.id) : set.add(it.id); d.face = [...set]; if (d.face.length >= 4) d.done['tf-face'] = true; });
          ctx.refresh();
        } }, ic('check')),
        h('div', { class: 'grow' },
          h('div', { class: 'row between' }, h('b', null, it.title), h('span', { class: 'tag ' + (it.impact === 'גבוה' ? 'pink' : '') }, `השפעה: ${it.impact}`)),
          h('p', { class: 'small', style: { marginTop: '4px' } }, it.why),
          h('ol', { class: 'steps' }, it.steps.map((x) => h('li', null, x))),
          it.link ? h('a', { href: it.link, class: 'small' }, 'לפרטים ›') : null))));
  });
  wrap.append(section('מה לא עובד (וחבל על הזמן)'));
  wrap.append(h('div', { class: 'list' }, DONT_WORK.map((d) => h('div', { class: 'list-row', style: { alignItems: 'flex-start' } }, h('span', { class: 'ico', style: { color: 'var(--red)', background: 'rgba(251,113,133,.12)' } }, ic('x')), h('div', { class: 'grow' }, h('div', { class: 't' }, d.t), h('div', { class: 'd' }, d.d))))));
  wrap.append(h('div', { class: 'row mt' }, h('button', { class: 'btn grow', onclick: () => ctx.go('#/transform?tab=body') }, ic('camera'), 'תמונות לפני/אחרי'), h('button', { class: 'btn grow', onclick: () => ctx.go('#/guide/jaw') }, ic('info'), 'המדע על הלסת')));
  return wrap;
}

// ---------------- body metrics ----------------
function bodyTab(ctx) {
  const s = getState();
  const t = s.transform;
  const key = todayKey();
  const wrap = h('div');
  const todayW = (t.weights || []).find((x) => x.date === key);
  let wv = todayW?.kg || '', waistV = '', stepsV = s.days[key]?.steps || '';
  wrap.append(h('div', { class: 'card hero' },
    h('b', null, 'עדכון היום'),
    h('div', { class: 'grid3 mt' },
      h('label', { class: 'field', style: { margin: 0 } }, h('span', null, 'משקל (ק״ג)'), h('input', { class: 'input', type: 'number', step: 0.1, min: 30, max: 250, value: wv, 'data-tf-weight': '', oninput: (e) => (wv = e.target.value) })),
      h('label', { class: 'field', style: { margin: 0 } }, h('span', null, 'מותניים (ס״מ)'), h('input', { class: 'input', type: 'number', step: 0.5, min: 40, max: 200, placeholder: 'שבועי', oninput: (e) => (waistV = e.target.value) })),
      h('label', { class: 'field', style: { margin: 0 } }, h('span', null, 'צעדים'), h('input', { class: 'input', type: 'number', min: 0, max: 80000, value: stepsV, oninput: (e) => (stepsV = e.target.value) }))),
    h('button', { class: 'btn primary block mt', 'data-tf-save': '', onclick: () => {
      const W = +wv, WA = +waistV, ST = +stepsV;
      if (wv && !(W >= 30 && W <= 250)) return toast('משקל לא תקין', 'info');
      update((st) => {
        const tt = st.transform;
        if (wv) { tt.weights = tt.weights.filter((x) => x.date !== key); tt.weights.push({ date: key, kg: Math.round(W * 10) / 10 }); }
        if (waistV && WA >= 40 && WA <= 200) { tt.waist = (tt.waist || []).filter((x) => x.date !== key); tt.waist.push({ date: key, cm: WA }); }
        const d = day(key);
        if (stepsV !== '') { d.steps = Math.max(0, Math.round(ST)); if (d.steps >= computeTargets().steps) d.done['tf-steps'] = true; else delete d.done['tf-steps']; }
        if (wv) d.done['tf-weigh'] = true;
      });
      toast('נשמר', 'check'); ctx.refresh();
    } }, ic('check'), 'שמירה'),
    h('p', { class: 'tiny muted mt' }, 'טיפ: להישקל בבוקר, אחרי שירותים ולפני אוכל. המשקל קופץ מיום ליום בגלל מים – מסתכלים רק על הממוצע השבועי.')));

  // chart
  const ws = weights();
  wrap.append(section('משקל'));
  wrap.append(h('div', { class: 'card' }, ws.length >= 2 ? weightChart(ws, t.goalWeight) : emptyState('chart', 'הגרף יופיע אחרי 2 שקילות.'),
    h('div', { class: 'grid3 mt' }, stat(`${t.startWeight}`, 'התחלה'), stat(`${currentWeight() ?? '—'}`, 'ממוצע 7 ימים'), stat(t.goalWeight ? `${t.goalWeight}` : '—', 'יעד')),
    bmi() ? h('p', { class: 'tiny muted mt' }, `BMI: ${bmi()} (מדד גס – לא מבחין בין שריר לשומן)`) : null));
  const waist = [...(t.waist || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (waist.length) {
    const d = Math.round((waist[waist.length - 1].cm - waist[0].cm) * 10) / 10;
    wrap.append(h('div', { class: 'card' }, h('div', { class: 'row between' }, h('b', null, 'היקף מותניים'), h('span', { class: 'tag ' + (d < 0 ? 'lime' : '') }, diffText(d, 'ס״מ'))),
      h('p', { class: 'small mt' }, waist.slice(-6).map((x) => `${fmtDate(x.date, { day: 'numeric', month: 'numeric' })}: ${x.cm}`).join(' · ')),
      h('p', { class: 'tiny muted' }, 'מותניים יורדים + משקל יציב = שומן יורד ושריר נבנה. זה הסימן הכי טוב לריקומפוזיציה.')));
  }

  // before / after
  wrap.append(section('לפני / אחרי (פרטי)'));
  const photos = [...s.photos].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (photos.length >= 2) {
    const a = photos[0], b = photos[photos.length - 1];
    wrap.append(h('div', { class: 'card' },
      h('div', { class: 'grid2' },
        h('div', null, h('div', { class: 'photo-grid', style: { gridTemplateColumns: '1fr' } }, h('div', { class: 'ph' }, storedImg(a.imageId, 'לפני'), h('span', null, `לפני · ${fmtDate(a.date, { day: 'numeric', month: 'short' })}`)))),
        h('div', null, h('div', { class: 'photo-grid', style: { gridTemplateColumns: '1fr' } }, h('div', { class: 'ph' }, storedImg(b.imageId, 'אחרי'), h('span', null, `עכשיו · ${fmtDate(b.date, { day: 'numeric', month: 'short' })}`))))),
      h('p', { class: 'tiny muted mt' }, `${daysBetween(a.date, b.date)} ימים ביניהן. ההשוואה היחידה ששווה – את/ה מול עצמך.`)));
  } else {
    wrap.append(h('div', { class: 'card' }, h('p', { class: 'small' }, 'תמונות הן הדרך הכי טובה לראות שינוי – הרבה יותר מהמשקל. מצלמים פעם בשבוע: אותה שעה, אותה תאורה, אותה תנוחה (חזית + צד), בלי פילטר. נשמר רק במכשיר.')));
  }
  wrap.append(h('button', { class: 'btn block mt', onclick: () => ctx.go('#/progress') }, ic('camera'), 'הוספת תמונה ליומן הפרטי'));
  return wrap;
}

function weightChart(ws, goal) {
  const W = 320, H = 130, pad = 22;
  const pts = ws.slice(-60);
  const vals = pts.map((x) => x.kg);
  const lo = Math.min(...vals, goal || Infinity) - 0.5, hi = Math.max(...vals, goal || -Infinity) + 0.5;
  const x = (i) => pad + (i / Math.max(1, pts.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  const avg = pts.map((_, i) => { const win = pts.slice(Math.max(0, i - 6), i + 1); return win.reduce((a, p) => a + p.kg, 0) / win.length; });
  const dots = pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.kg)}" r="2.5" fill="var(--text-3)"/>`).join('');
  const line = avg.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const goalLine = goal ? `<line x1="${pad}" x2="${W - pad}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--lime)" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${W / 2}" y="${y(goal) - 4}" fill="var(--lime)" font-size="10" text-anchor="middle">יעד: ${goal} ק״ג</text>` : '';
  const el = h('div', { html: `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="גרף משקל">
    <defs><linearGradient id="wl" x1="0" x2="1"><stop offset="0" stop-color="#c084fc"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
    ${goalLine}${dots}<path d="${line}" fill="none" stroke="url(#wl)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${pad}" y="12" fill="var(--text-3)" font-size="10">${hi.toFixed(1)}</text><text x="${pad}" y="${H - 6}" fill="var(--text-3)" font-size="10">${lo.toFixed(1)}</text></svg>` });
  return h('div', null, el, h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: 'var(--text-3)', borderRadius: '50%' } }), 'שקילה'), h('span', null, h('i', { style: { background: 'var(--purple-3)' } }), 'ממוצע 7 ימים')));
}
