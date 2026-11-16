// Home: the user's control center.
import { h, ic, ring } from '../ui.js';
import { getState, todayKey, addDays, storedImg } from '../store.js';
import { tasksFor, completion, streak, phaseOf, dayIndexOf, PROGRAMS } from '../plan.js';
import { TIPS } from '../data/tips.js';
import { taskItem, section, say, fmtDate } from './common.js';

const SHORTCUTS = [
  { label: 'טיפוח פנים', icon: 'sparkles', hash: '#/care', color: '#c084fc' },
  { label: 'שיער', icon: 'scissors', hash: '#/hair', color: '#22d3ee' },
  { label: 'כושר', icon: 'dumbbell', hash: '#/fitness', color: '#a3e635' },
  { label: 'תזונה', icon: 'apple', hash: '#/nutrition', color: '#fbbf24' },
  { label: 'סטייל', icon: 'shirt', hash: '#/style', color: '#f472b6' },
  { label: 'שינה ושגרה', icon: 'moon', hash: '#/routine', color: '#60a5fa' },
  { label: 'התקדמות', icon: 'chart', hash: '#/progress', color: '#34d399' },
  { label: 'מוצרים ותקציב', icon: 'wallet', hash: '#/products', color: '#f59e0b' },
];

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'לילה טוב';
  if (hr < 12) return 'בוקר טוב';
  if (hr < 17) return 'צהריים טובים';
  if (hr < 21) return 'ערב טוב';
  return 'לילה טוב';
}

export default function home(ctx) {
  const s = getState();
  const p = s.profile;
  const key = todayKey();
  const idx = dayIndexOf(s.program, key);
  const prog = PROGRAMS.find((x) => x.length === s.program.length);
  const finished = idx >= s.program.length;
  const phase = phaseOf(s.program, Math.min(idx, s.program.length - 1));
  const tasks = tasksFor(key);
  const comp = completion(key);
  const st = streak();
  const tip = TIPS[(new Date().getDate() + new Date().getMonth() * 31) % TIPS.length];

  const root = h('main');
  const listWrap = h('div', { 'data-tour': 'tasks' });
  const heroRingSlot = h('div');
  const weekSlot = h('div');

  const streakEl = h('span', { class: 'streak', title: 'רצף התמדה', 'data-tour': 'streak' });
  const drawDynamic = () => {
    const c = completion(key);
    streakEl.replaceChildren(ic('flame'), String(streak()));
    heroRingSlot.replaceChildren(ring(c.pct, `${Math.round(c.pct * 100)}%`, `${c.done}/${c.total}`));
    weekSlot.replaceChildren(weekChart());
  };
  const drawTasks = () => {
    const ts = tasksFor(key);
    const todo = ts.filter((t) => !s.days[key]?.done?.[t.id]);
    const done = ts.filter((t) => s.days[key]?.done?.[t.id]);
    listWrap.replaceChildren(...[...todo, ...done].map((t) => taskItem(t, { key, onChange: () => { drawTasks(); drawDynamic(); } })));
  };

  // greeting
  const avatar = h('button', { class: 'avatar', 'aria-label': 'פרופיל', onclick: () => ctx.go('#/settings') },
    p.avatarId ? storedImg(p.avatarId, '') : (p.name || '?').trim().charAt(0));
  root.append(
    h('div', { class: 'greet' },
      avatar,
      h('div', { class: 'grow' },
        h('h1', null, `${greeting()}, ${p.name}`),
        h('p', null, fmtDate(key, { weekday: 'long', day: 'numeric', month: 'long' }))),
      streakEl,
      h('button', { class: 'icon-btn', 'aria-label': 'הגדרות', onclick: () => ctx.go('#/settings') }, ic('settings'))),
  );

  // hero: daily plan
  if (finished) {
    root.append(h('div', { class: 'card hero', 'data-tour': 'hero' },
      h('div', { class: 'row' }, h('div', { class: 'grow' },
        h('span', { class: 'tag purple' }, ic('trophy'), 'התוכנית הושלמה'),
        h('h3', { class: 'mt' }, `סיימת את ${prog.name}! 🎉`),
        h('p', null, 'כל הכבוד על ההתמדה. אפשר להתחיל מסלול חדש או להמשיך באותו מסלול מההתחלה.'))),
      h('button', { class: 'btn primary block mt', onclick: () => ctx.go('#/plans') }, ic('target'), 'בחירת תוכנית הבאה')));
  } else {
    root.append(h('div', { class: 'card hero', 'data-tour': 'hero' },
      h('div', { class: 'row' },
        h('div', { class: 'grow' },
          h('span', { class: 'tag purple' }, ic('target'), prog.name),
          h('h3', { class: 'mt', style: { fontSize: '19px' } }, `יום ${idx + 1} מתוך ${s.program.length}`),
          h('p', { class: 'small' }, `שלב ${phase.n}: ${phase.name} – ${phase.desc}`),
          h('button', { class: 'btn sm mt', onclick: () => ctx.go('#/plans') }, ic('edit'), 'ניהול התוכנית')),
        heroRingSlot)));
  }

  // tasks
  root.append(section('המשימות להיום', 'כל התוכנית', () => ctx.go('#/plans')));
  if (tasks.length) root.append(listWrap);
  root.append(h('p', { class: 'tiny muted center mt' }, say('לחץ על משימה להסבר מלא, ועל העיגול כדי לסמן שהושלמה.', 'לחצי על משימה להסבר מלא, ועל העיגול כדי לסמן שהושלמה.', 'לחיצה על משימה – הסבר מלא. לחיצה על העיגול – סימון שהושלמה.')));

  // coach CTA
  root.append(h('div', { class: 'mt2' }, h('button', { class: 'coach-cta', 'data-tour': 'coach', onclick: () => ctx.go('#/coach') },
    h('span', { class: 'ci' }, ic('bot')),
    h('div', { class: 'grow' }, h('b', null, 'המאמן האישי שלי'), h('div', { class: 'small', style: { opacity: 0.85 } }, 'שאלות, הסברים, לוקים ואימונים – צעד אחר צעד')),
    ic('back'))));

  // weekly progress
  root.append(section('התקדמות שבועית', 'לכל הנתונים', () => ctx.go('#/progress')));
  root.append(h('div', { class: 'card' }, weekSlot));

  // tip
  root.append(section('הטיפ היומי'));
  root.append(h('div', { class: 'card' }, h('div', { class: 'row', style: { alignItems: 'flex-start' } },
    h('span', { class: 'ibox' }, ic('sparkles')),
    h('p', { class: 'grow', style: { color: 'var(--text)' } }, tip.text))));

  // shortcuts
  root.append(section('כל תחומי הגלואו אפ'));
  root.append(h('div', { class: 'shortcuts', 'data-tour': 'shortcuts' }, SHORTCUTS.map((sc) => h('button', { class: 'shortcut', onclick: () => ctx.go(sc.hash) },
    h('span', { class: 'si', style: { background: sc.color + '22', color: sc.color } }, ic(sc.icon)), sc.label))));

  root.append(h('div', { class: 'row mt2', style: { justifyContent: 'center' } },
    h('button', { class: 'btn ghost sm', onclick: () => ctx.go('#/learn') }, ic('info'), 'מדריכים'),
    h('button', { class: 'btn ghost sm', onclick: () => import('../tour.js').then((m) => m.startTour()) }, ic('help'), 'הדרכה')));

  drawTasks();
  drawDynamic();
  return root;
}

export function weekChart() {
  const key = todayKey();
  const d = new Date();
  const sunday = addDays(key, -d.getDay());
  const names = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  let done = 0, total = 0;
  const cols = names.map((n, i) => {
    const k = addDays(sunday, i);
    const c = k <= key ? completion(k) : { pct: 0, done: 0, total: 0 };
    done += c.done; total += c.total;
    const bar = h('i', { style: { height: '0%' } });
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.height = Math.round(c.pct * 100) + '%'; }));
    return h('div', null, h('div', { class: 'col' + (k === key ? ' today' : ''), title: `${c.done}/${c.total}` }, bar), h('div', { class: 'd' }, n));
  });
  return h('div', null,
    h('div', { class: 'row between mb' }, h('b', null, `${done} משימות הושלמו השבוע`), h('span', { class: 'tag' }, total ? Math.round((done / total) * 100) + '%' : '0%')),
    h('div', { class: 'week' }, cols));
}
