// Home: the user's control center.
import { h, ic, ring } from '../ui.js';
import { getState, todayKey, addDays, storedImg } from '../store.js';
import { tasksFor, completion, streak, phaseOf, dayIndexOf, PROGRAMS } from '../plan.js';
import { TIPS } from '../data/tips.js';
import { computeTargets, foodTotals, currentWeight, isTrainingDay, nextSession } from '../transform.js';
import { diffText } from './transform.js';
import { taskItem, section, say, fmtDate } from './common.js';

const SHORTCUTS = [
  { label: 'השינוי שלי', icon: 'flame', hash: '#/transform', color: '#fb7185' },
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

  root.append(scanCard(ctx));
  root.append(transformCard(ctx));

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

function transformCard(ctx) {
  const s = getState();
  const t = s.transform;
  if (!t?.active) {
    return h('button', { class: 'card tap glow', style: { marginTop: '12px' }, 'data-tf-cta': '', onclick: () => ctx.go('#/transform') },
      h('div', { class: 'row' }, h('span', { class: 'ibox', style: { color: '#fb7185', background: 'rgba(251,113,133,.14)' } }, ic('flame')),
        h('div', { class: 'grow' }, h('b', null, 'מסלול שינוי אמיתי'),
          h('div', { class: 'small muted' }, s.profile.age >= 18 ? 'חיטוב, בניית שריר ושדרוג פנים – יעדים מחושבים, אימון שמתקדם מעצמו ובדיקה שבועית' : 'בניית שריר, כוח ושדרוג מראה – תוכנית אימון שמתקדמת מעצמה ופרוטוקול פנים')),
        ic('back')));
  }
  const tg = computeTargets();
  const ft = foodTotals();
  const steps = s.days[todayKey()]?.steps || 0;
  const cw = currentWeight();
  const diff = cw && t.startWeight ? Math.round((cw - t.startWeight) * 10) / 10 : null;
  const mini = (label, v, target, color) => h('div', { class: 'stat', style: { padding: '10px' } },
    h('div', { class: 'tiny muted' }, label), h('div', { style: { fontWeight: 800, fontSize: '16px' } }, v),
    h('div', { class: 'bar', style: { height: '5px', marginTop: '6px' } }, h('i', { style: { width: Math.min(100, Math.round((target ? parseFloat(String(v).replace(/[^\d.]/g, '')) / target : 0) * 100)) + '%', background: color } })));
  return h('div', { class: 'card', style: { marginTop: '12px' } },
    h('div', { class: 'row between mb' }, h('b', null, 'השינוי שלי – היום'), diff != null ? h('span', { class: 'tag ' + (diff < 0 ? 'lime' : diff > 0 ? 'amber' : '') }, diffText(diff, 'ק״ג')) : null),
    h('div', { class: 'grid3' },
      tg.kcal ? mini('קלוריות', Math.round(ft.kcal), tg.kcal, '#c084fc') : mini('חלבון', Math.round(ft.p), tg.protein, '#f472b6'),
      tg.kcal ? mini('חלבון', Math.round(ft.p), tg.protein, '#f472b6') : mini('צעדים', steps, tg.steps, '#22d3ee'),
      tg.kcal ? mini('צעדים', steps, tg.steps, '#22d3ee') : h('div', { class: 'stat', style: { padding: '10px' } }, h('div', { class: 'tiny muted' }, 'אימון'), h('div', { style: { fontWeight: 700, fontSize: '13px' } }, isTrainingDay() ? nextSession().name : 'מנוחה'))),
    h('button', { class: 'btn sm block mt', onclick: () => ctx.go('#/transform') }, ic('flame'), 'למסלול המלא'));
}

function scanCard(ctx) {
  const s = getState();
  const sc = s.scans?.[0];
  if (!sc) {
    return h('button', { class: 'coach-cta', style: { marginTop: '12px', background: 'linear-gradient(120deg,#f472b6,#a855f7 55%,#6d28d9)' }, 'data-scan-cta': '', onclick: () => ctx.go('#/scan') },
      h('span', { class: 'ci' }, ic('camera')),
      h('div', { class: 'grow' }, h('b', null, 'סריקת גלואו אפ'), h('div', { class: 'small', style: { opacity: 0.9 } }, 'תמונה של הפנים והשיער → איזו תספורת, קו לסת, בגדים, חיטוב או מסה')),
      ic('back'));
  }
  const r = sc.result;
  const done = sc.done || {};
  const next = r.quickWins.find((_, i) => !done[i]);
  const n = r.quickWins.filter((_, i) => done[i]).length;
  return h('button', { class: 'card tap glow', style: { marginTop: '12px' }, onclick: () => ctx.go('#/scan') },
    h('div', { class: 'row between' }, h('b', null, 'תוכנית הגלואו אפ שלך'), h('span', { class: 'tag purple' }, `${n}/${r.quickWins.length}`)),
    h('div', { class: 'bar', style: { marginTop: '8px' } }, h('i', { style: { width: (r.quickWins.length ? Math.round((n / r.quickWins.length) * 100) : 0) + '%' } })),
    h('p', { class: 'small mt' }, next ? `הצעד הבא: ${next.title}` : 'סיימת את כל הצעדים לשבוע! אפשר לעשות סריקה חדשה ולראות את ההתקדמות.'));
}
