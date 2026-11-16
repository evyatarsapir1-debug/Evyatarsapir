// Nutrition: water tracker, balanced plate, nutrients, meal ideas & simple daily menu. No diets.
import { h, ic, sheet, sheetHead, toast, note, listRow, emptyState } from '../ui.js';
import { getState, update, todayKey, addDays, day } from '../store.js';
import { MEALS, MEAL_LABELS, NUTRIENTS } from '../data/nutrition.js';
import { guidesByArea } from '../data/guides.js';
import { topbar, section, fmtDate } from './common.js';

export default function nutrition(ctx) {
  const tab = ctx.query.get('tab') || 'today';
  const root = h('main');
  root.append(topbar('תזונה ובריאות', { sub: 'מאוזן, מגוון וטעים – בלי דיאטות', back: '#/home' }));
  const tabs = [['today', 'היום'], ['meals', 'רעיונות לארוחות'], ['learn', 'ללמוד']];
  root.append(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', class: tab === id ? 'on' : '', onclick: () => ctx.go(`#/nutrition?tab=${id}`) }, label))));
  root.append(tab === 'today' ? todayTab(ctx) : tab === 'meals' ? mealsTab(ctx) : learnTab(ctx));
  return root;
}

function waterCard() {
  const key = todayKey();
  const wrap = h('div', { class: 'card hero' });
  const draw = () => {
    const s = getState();
    const goal = s.routines?.waterGoal || 8;
    const n = s.days[key]?.water || 0;
    wrap.replaceChildren(
      h('div', { class: 'row between' }, h('div', { class: 'row' }, h('span', { class: 'ibox', style: { color: 'var(--cyan)', background: 'rgba(34,211,238,.12)' } }, ic('droplet')), h('div', null, h('b', null, 'שתיית מים'), h('div', { class: 'tiny muted' }, `${n} מתוך ${goal} כוסות`))),
        h('div', { class: 'row', style: { gap: '6px' } },
          h('button', { class: 'icon-btn', 'aria-label': 'פחות כוס', onclick: () => set(Math.max(0, n - 1)) }, ic('minus')),
          h('button', { class: 'icon-btn', 'aria-label': 'עוד כוס', 'data-water-add': '', onclick: () => set(n + 1) }, ic('plus')))),
      h('div', { class: 'water mt' }, Array.from({ length: Math.max(goal, n) }, (_, i) => h('button', { class: i < n ? 'on' : '', 'aria-label': `${i + 1} כוסות`, onclick: () => set(i + 1 === n ? i : i + 1) }))),
      n >= goal ? h('p', { class: 'small mt', style: { color: 'var(--cyan)' } }, 'הגעת ליעד היום! 💧') : '');
    function set(v) {
      update((st) => {
        const d = day(key); d.water = v;
        if (v >= goal) d.done.water = true; else delete d.done.water;
      });
      if (v === goal) toast('יעד המים הושלם!', 'droplet');
      draw();
    }
  };
  draw();
  return wrap;
}

function plateCard() {
  return h('div', { class: 'card' },
    h('div', { class: 'row between mb' }, h('b', null, 'הצלחת המאוזנת'), h('a', { href: '#/guide/plate', class: 'small' }, 'הסבר ›')),
    h('div', { class: 'row', style: { gap: '16px', alignItems: 'center' } },
      h('div', { class: 'plate', style: { width: '150px', flexShrink: 0 } },
        h('div', { style: { background: '#34d399', gridRow: 'span 2' } }, 'ירקות ופירות ½'),
        h('div', { style: { background: '#f472b6' } }, 'חלבון ¼'),
        h('div', { style: { background: '#fbbf24' } }, 'פחמימה ¼')),
      h('ul', { class: 'dots small grow' }, h('li', null, 'חצי צלחת צבעונית'), h('li', null, 'רבע חלבון'), h('li', null, 'רבע פחמימה (עדיף מלאה)'), h('li', null, 'מעט שומן בריא'), h('li', null, 'מים לשתייה'))));
}

function menuCard(ctx, key, label) {
  const s = getState();
  const menu = s.days[key]?.meals || {};
  const all = Object.values(MEALS).flat();
  const byId = Object.fromEntries(all.map((m) => [m.id, m]));
  return h('div', { class: 'card' },
    h('div', { class: 'row between mb' }, h('b', null, label), h('span', { class: 'tiny muted' }, fmtDate(key))),
    h('div', { class: 'list', style: { background: 'transparent' } }, ['breakfast', 'lunch', 'dinner', 'snacks'].map((type) => {
      const m = byId[menu[type]];
      return listRow({ icon: m?.icon || 'plus', title: MEAL_LABELS[type], desc: m ? m.name : 'לבחירת רעיון', onclick: () => pickMeal(ctx, key, type) });
    })));
}

function pickMeal(ctx, key, type) {
  sheet((api) => h('div', null,
    sheetHead(MEAL_LABELS[type], 'בחרו רעיון – אפשר לשנות בכל רגע.', api),
    h('div', { class: 'list' }, MEALS[type].map((m) => listRow({
      icon: m.icon, title: m.name, desc: `${m.time} דק׳ · ${m.parts.join(', ')}`,
      onclick: () => { update(() => { const d = day(key); d.meals = { ...(d.meals || {}), [type]: m.id }; }); api.close(); toast('נוסף לתפריט', 'check'); ctx.refresh(); },
    }))),
    getState().days[key]?.meals?.[type] ? h('button', { class: 'btn ghost block mt', onclick: () => { update(() => { const d = day(key); delete d.meals[type]; }); api.close(); ctx.refresh(); } }, ic('x'), 'ניקוי הבחירה') : null));
}

function todayTab(ctx) {
  const s = getState();
  const wrap = h('div');
  wrap.append(waterCard());
  if (s.profile.age < 18) wrap.append(h('div', { class: 'mt' }, note('בגיל ההתבגרות הגוף גדל ומתפתח וצריך מספיק אנרגיה. לכן GLOW UP לא סופרת קלוריות ולא מציעה דיאטות – רק אוכל מגוון ומאוזן.')));
  wrap.append(section('התפריט שלי'));
  wrap.append(menuCard(ctx, todayKey(), 'היום'));
  wrap.append(h('div', { style: { marginTop: '12px' } }, menuCard(ctx, addDays(todayKey(), 1), 'מחר')));
  wrap.append(section('מבנה ארוחה'));
  wrap.append(plateCard());
  wrap.append(section('אבות המזון'));
  wrap.append(h('div', { class: 'grid2' }, NUTRIENTS.map((n) => h('button', { class: 'card tap', style: { marginTop: 0 }, onclick: () => ctx.go('#/guide/' + n.guide) },
    h('span', { class: 'ibox', style: { color: n.color, background: n.color + '22' } }, ic(n.icon)),
    h('b', { style: { display: 'block', marginTop: '8px' } }, n.label), h('p', { class: 'small' }, n.short)))));
  return wrap;
}

function mealsTab(ctx) {
  const type = ctx.query.get('type') || 'breakfast';
  const filter = ctx.query.get('f') || 'all';
  const wrap = h('div');
  wrap.append(h('div', { class: 'chips scroll' }, Object.entries(MEAL_LABELS).map(([id, label]) => h('button', { class: 'chip' + (type === id ? ' on' : ''), onclick: () => ctx.go(`#/nutrition?tab=meals&type=${id}&f=${filter}`) }, label))));
  wrap.append(h('div', { class: 'chips mt' }, [['all', 'הכל'], ['veg', 'צמחוני'], ['vegan', 'טבעוני'], ['quick', 'עד 10 דק׳'], ['school', 'לקחת לבית הספר']].map(([id, label]) => h('button', { class: 'chip' + (filter === id ? ' on' : ''), onclick: () => ctx.go(`#/nutrition?tab=meals&type=${type}&f=${id}`) }, label))));
  let list = MEALS[type];
  if (filter === 'veg') list = list.filter((m) => m.tags.includes('veg') || m.tags.includes('vegan'));
  else if (filter !== 'all') list = list.filter((m) => m.tags.includes(filter));
  if (!list.length) { wrap.append(h('div', { class: 'card mt' }, emptyState('apple', 'אין רעיונות בסינון הזה – נסו סינון אחר.'))); return wrap; }
  list.forEach((m) => wrap.append(h('div', { class: 'card', style: { marginTop: '12px' } },
    h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic(m.icon)), h('div', { class: 'grow' }, h('b', null, m.name), h('div', { class: 'tiny muted' }, `${m.time} דק׳ הכנה`))),
    h('div', { class: 'chips mt' }, m.parts.map((p) => h('span', { class: 'tag' }, p))),
    m.how ? h('p', { class: 'small mt' }, m.how) : null,
    h('button', { class: 'btn sm mt', onclick: () => { update(() => { const d = day(todayKey()); d.meals = { ...(d.meals || {}), [type]: m.id }; }); toast('נוסף לתפריט של היום', 'check'); } }, ic('plus'), 'לתפריט של היום'))));
  wrap.append(h('p', { class: 'tiny muted center mt' }, 'יש אלרגיה, רגישות או תזונה מיוחדת? להתאים את הרעיונות ולהתייעץ עם רופא/ת או דיאטן/ית.'));
  return wrap;
}

function learnTab(ctx) {
  const wrap = h('div');
  wrap.append(h('div', { class: 'list' }, guidesByArea('nutrition').map((g) => listRow({ icon: g.icon, title: g.title, desc: g.summary, onclick: () => ctx.go('#/guide/' + g.id) }))));
  wrap.append(h('div', { class: 'mt' }, note('אם אוכל, משקל או מראה הגוף מעסיקים אותך הרבה או גורמים ללחץ – חשוב לדבר עם מבוגר שסומכים עליו ועם רופא/ת. ער״ן: 1201.', 'med')));
  return wrap;
}
