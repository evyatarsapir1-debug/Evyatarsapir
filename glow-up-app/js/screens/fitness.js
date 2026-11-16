// Fitness: workouts, exercise library with animated demos, guided workout mode, log & recovery.
import { h, ic, sheet, sheetHead, toast, note, listRow, emptyState, chips, confirmDialog, burst } from '../ui.js';
import { getState, update, todayKey, addDays, day, uid } from '../store.js';
import { EXERCISES, EX, CATEGORIES, EQUIP, LEVEL_LABEL, WORKOUTS, adaptExercise, levelNum, RECOVERY } from '../data/fitness.js';
import { figureSVG } from '../figure.js';
import { workoutFor, dayIndexOf, setTaskDone } from '../plan.js';
import { topbar, section, fmtDate, cheer } from './common.js';

const level = () => levelNum(getState().profile.fitnessLevel);

function weekLoad() {
  const s = getState();
  const key = todayKey();
  let sessions = 0, minutes = 0, streakDays = 0;
  for (let i = 0; i < 7; i++) {
    const w = s.days[addDays(key, -i)]?.workouts || [];
    const strength = w.filter((x) => !['mobility', 'posture', 'walk'].includes(x.id));
    if (strength.length) sessions++;
    minutes += w.reduce((a, x) => a + (x.minutes || 0), 0);
  }
  for (let i = 0; i < 7; i++) {
    const w = s.days[addDays(key, -i)]?.workouts || [];
    if (w.some((x) => !['mobility', 'posture', 'walk'].includes(x.id))) streakDays++; else break;
  }
  return { sessions, minutes, streakDays };
}

function overtrainingNote() {
  const l = weekLoad();
  const max = { 1: 4, 2: 5, 3: 5 }[level()];
  if (l.streakDays >= 4) return note(`התאמנת ${l.streakDays} ימים ברצף. הגוף צריך מנוחה כדי להתחזק – מחר עדיף יום מנוחה או הליכה קלה.`, 'warn');
  if (l.sessions >= max) return note(`כבר ${l.sessions} אימוני כוח השבוע – זה מעולה ומספיק. עוד אימונים לא יביאו יותר תוצאות, ומנוחה תעזור יותר.`, 'warn');
  return null;
}

export default function fitness(ctx) {
  const tab = ctx.query.get('tab') || 'workouts';
  const root = h('main');
  root.append(topbar('כושר ותנועה', { sub: `רמה: ${LEVEL_LABEL[level()]}`, actions: [h('button', { class: 'icon-btn', 'aria-label': 'תיעוד אימון', onclick: () => ctx.go('#/log') }, ic('plus'))] }));
  const tabs = [['workouts', 'אימונים'], ['library', 'תרגילים'], ['recovery', 'התאוששות'], ['history', 'היסטוריה']];
  root.append(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', class: tab === id ? 'on' : '', 'data-tour': id === 'library' ? 'ex-library' : null, onclick: () => ctx.go(`#/fitness?tab=${id}`) }, label))));
  root.append(tab === 'workouts' ? workoutsTab(ctx) : tab === 'library' ? libraryTab(ctx) : tab === 'recovery' ? recoveryTab(ctx) : historyTab(ctx));
  return root;
}

function workoutsTab(ctx) {
  const s = getState();
  const wrap = h('div');
  const idx = dayIndexOf(s.program);
  const today = s.profile.areas.includes('fitness') ? workoutFor(s.profile, s.program, idx) : null;
  const done = !!s.days[todayKey()]?.done?.workout;
  const warn = overtrainingNote();
  if (warn) wrap.append(warn);
  wrap.append(h('div', { class: 'card hero', style: { marginTop: warn ? '12px' : 0 } },
    h('span', { class: 'tag purple' }, ic('calendar'), 'האימון של היום'),
    today
      ? h('div', null, h('h3', { class: 'mt', style: { fontSize: '19px' } }, today.name), h('p', { class: 'small' }, `${today.focus} · כ-${today.minutes} דק׳`),
        h('button', { class: 'btn primary block mt', onclick: () => ctx.go('#/workout/' + today.id) }, ic(done ? 'check' : 'play'), done ? 'הושלם – לצפייה' : 'להתחיל אימון'))
      : h('div', null, h('h3', { class: 'mt' }, 'יום מנוחה 💤'), h('p', { class: 'small' }, 'מנוחה היא חלק מהתוכנית. אפשר הליכה קלה או מתיחות – רק אם בא לך.'),
        h('button', { class: 'btn block mt', onclick: () => ctx.go('#/workout/mobility') }, ic('stretch'), 'מתיחות קלות (לא חובה)'))));
  const l = weekLoad();
  wrap.append(h('div', { class: 'grid3 mt' },
    h('div', { class: 'stat' }, h('div', { class: 'v' }, l.sessions), h('div', { class: 'k' }, 'אימוני כוח ב-7 ימים')),
    h('div', { class: 'stat' }, h('div', { class: 'v' }, l.minutes), h('div', { class: 'k' }, 'דקות תנועה')),
    h('div', { class: 'stat' }, h('div', { class: 'v' }, s.savedExercises.length), h('div', { class: 'k' }, 'תרגילים שמורים'))));
  wrap.append(section('כל האימונים'));
  const lv = level();
  const list = Object.values(WORKOUTS).filter((w) => lv === 3 || !w.id.endsWith('Adv'));
  wrap.append(h('div', { class: 'list' }, list.map((w) => listRow({ icon: w.id === 'mobility' ? 'stretch' : w.id === 'posture' ? 'posture' : w.id === 'walk' ? 'heartPulse' : 'dumbbell', title: w.name, desc: `${w.focus} · ${w.minutes} דק׳ · ${w.items.length} תרגילים`, onclick: () => ctx.go('#/workout/' + w.id) }))));
  wrap.append(h('div', { class: 'row mt' }, h('button', { class: 'btn grow', onclick: () => ctx.go('#/log') }, ic('plus'), 'תיעוד אימון חופשי')));
  wrap.append(h('div', { class: 'mt' }, note('לפני התחלת אימונים עם מחלה כרונית, פציעה או כאב – כדאי להתייעץ עם רופא/ת. בכל אימון: אם יש כאב חד, סחרחורת או כאב בחזה – לעצור מיד.', 'med')));
  return wrap;
}

function libraryTab(ctx) {
  const s = getState();
  const cat = ctx.query.get('cat') || 'all';
  const lvF = ctx.query.get('lv') || 'mine';
  const term = ctx.query.get('q') || '';
  const wrap = h('div');
  const search = h('input', { class: 'input', type: 'search', placeholder: 'חיפוש תרגיל או שריר…', value: term, 'aria-label': 'חיפוש תרגיל',
    onchange: (e) => ctx.go(`#/fitness?tab=library&cat=${cat}&lv=${lvF}&q=${encodeURIComponent(e.target.value)}`) });
  wrap.append(search);
  wrap.append(h('div', { class: 'chips scroll mt' }, [{ id: 'all', label: 'הכל' }, { id: 'saved', label: 'שמורים' }, ...CATEGORIES].map((c) =>
    h('button', { class: 'chip' + (cat === c.id ? ' on' : ''), onclick: () => ctx.go(`#/fitness?tab=library&cat=${c.id}&lv=${lvF}`) }, c.icon ? ic(c.icon) : null, c.label))));
  wrap.append(h('div', { class: 'chips mt' }, [['mine', 'מתאים לרמה שלי'], ['1', 'מתחילים'], ['2', 'בינוני'], ['3', 'מתקדמים'], ['all', 'כל הרמות']].map(([id, label]) =>
    h('button', { class: 'chip' + (lvF === id ? ' on' : ''), onclick: () => ctx.go(`#/fitness?tab=library&cat=${cat}&lv=${id}`) }, label))));
  let list = EXERCISES;
  if (cat === 'saved') list = list.filter((e) => s.savedExercises.includes(e.id));
  else if (cat !== 'all') list = list.filter((e) => e.cat === cat);
  if (lvF === 'mine') list = list.filter((e) => e.level <= level());
  else if (lvF !== 'all') list = list.filter((e) => e.level === +lvF);
  if (term) list = list.filter((e) => e.name.includes(term) || e.en.toLowerCase().includes(term.toLowerCase()) || e.muscles.some((m) => m.includes(term)));
  wrap.append(list.length ? h('div', { class: 'cut-grid mt' }, list.map((e) => exCard(e, ctx))) : h('div', { class: 'card mt' }, emptyState('search', 'לא נמצאו תרגילים בסינון הזה.')));
  return wrap;
}

function exCard(e, ctx) {
  return h('button', { class: 'cut-card', onclick: () => ctx.go('#/exercise/' + e.id) },
    h('div', { class: 'media ex-fig', html: figureSVG({ ...e.fig, label: e.name }, { animate: false }) }),
    h('div', { class: 'info' }, h('b', null, e.name), h('div', { class: 'row wrap', style: { gap: '4px', marginTop: '4px' } },
      h('span', { class: 'tag' }, CATEGORIES.find((c) => c.id === e.cat).label), h('span', { class: 'tag ' + (e.level === 1 ? 'lime' : e.level === 2 ? 'amber' : 'pink') }, LEVEL_LABEL[e.level]))));
}

function recoveryTab() {
  const s = getState();
  const wrap = h('div');
  const warn = overtrainingNote();
  if (warn) wrap.append(warn);
  RECOVERY.forEach((r) => wrap.append(h('div', { class: 'card', style: { marginTop: '12px' } }, h('h3', null, r.title), h('p', null, r.text))));
  // how do you feel today
  const key = todayKey();
  const feel = s.days[key]?.feel;
  wrap.append(section('איך הגוף מרגיש היום?'));
  const opts = [['great', 'מעולה', 'zap'], ['ok', 'בסדר', 'smile'], ['sore', 'כאבי שרירים', 'heart'], ['tired', 'עייפות', 'moon'], ['pain', 'כאב חד / פציעה', 'alert']];
  const out = h('div', { class: 'mt' });
  const advice = (f) => ({
    great: 'יופי! אפשר להתאמן לפי התוכנית.',
    ok: 'אפשר להתאמן כרגיל, להקשיב לגוף.',
    sore: 'כאבי שרירים קלים זה נורמלי. היום עדיף אימון קל, הליכה או מתיחות לאותם שרירים.',
    tired: 'עייפות היא סימן לנוח. אפשר לקצר את האימון או להחליף אותו בהליכה. שינה טובה הלילה תעזור.',
    pain: 'כאב חד או כאב במפרק – לא להתאמן על האזור הזה. אם הכאב לא עובר תוך כמה ימים, יש נפיחות או קושי בתנועה – לפנות לרופא/ת.',
  }[f]);
  const drawOut = (f) => out.replaceChildren(f ? note(advice(f), f === 'pain' ? 'med' : f === 'tired' || f === 'sore' ? 'warn' : '') : '');
  wrap.append(chips(opts.map(([id, label, icon]) => ({ id, label, icon })), feel, (v) => { update(() => { day(key).feel = v; }); drawOut(v); }, { multi: false }));
  wrap.append(out);
  drawOut(feel);
  wrap.append(section('שגרת שחרור'));
  wrap.append(h('div', { class: 'list' }, ['childs-pose', 'hamstring-stretch', 'hip-flexor', 'doorway-stretch', 'open-book'].map((id) => listRow({ icon: 'stretch', title: EX[id].name, desc: EX[id].reps[level()], onclick: () => (location.hash = '#/exercise/' + id) }))));
  return wrap;
}

function historyTab(ctx) {
  const s = getState();
  const entries = Object.entries(s.days).flatMap(([k, d]) => (d.workouts || []).map((w) => ({ ...w, key: k }))).sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : (b.at || 0) - (a.at || 0)));
  const wrap = h('div');
  if (!entries.length) {
    wrap.append(h('div', { class: 'card' }, emptyState('dumbbell', 'עדיין אין אימונים בהיסטוריה. סיום אימון או תיעוד חופשי יופיעו כאן.', h('button', { class: 'btn sm mt', onclick: () => ctx.go('#/log') }, ic('plus'), 'תיעוד אימון'))));
    return wrap;
  }
  const total = entries.reduce((a, e) => a + (e.minutes || 0), 0);
  wrap.append(h('div', { class: 'grid2' }, h('div', { class: 'stat' }, h('div', { class: 'v' }, entries.length), h('div', { class: 'k' }, 'אימונים')), h('div', { class: 'stat' }, h('div', { class: 'v' }, total), h('div', { class: 'k' }, 'דקות בסך הכל'))));
  wrap.append(h('div', { class: 'list mt' }, entries.slice(0, 60).map((e) => listRow({
    icon: 'dumbbell', title: e.name || WORKOUTS[e.id]?.name || 'אימון',
    desc: `${fmtDate(e.key)} · ${e.minutes || 0} דק׳${e.sets?.length ? ` · ${e.sets.length} תרגילים` : ''}${e.feel ? ` · ${e.feel}` : ''}`,
    right: h('button', { class: 'icon-btn', 'aria-label': 'מחיקה', onclick: async () => { if (await confirmDialog('למחוק את האימון מההיסטוריה?', '', { ok: 'מחיקה', danger: true })) { update((st) => { const d = st.days[e.key]; d.workouts = d.workouts.filter((x) => x.at !== e.at || x.id !== e.id); if (e.source === 'plan' || !d.workouts.length) delete d.done.workout; }); ctx.refresh(); } } }, ic('trash')),
  }))));
  return wrap;
}

// ---------------- exercise detail ----------------
export function exerciseDetail(ctx) {
  const e = EX[ctx.params[0]];
  const root = h('main');
  if (!e) { root.append(topbar('תרגיל', { back: '#/fitness?tab=library' }), emptyState('dumbbell', 'לא נמצא')); return root; }
  const s = getState();
  const lv = level();
  const saved = s.savedExercises.includes(e.id);
  root.append(topbar(e.name, { sub: e.en, back: '#/fitness?tab=library', actions: [h('button', {
    class: 'icon-btn', 'aria-label': 'שמירה', 'aria-pressed': saved ? 'true' : 'false', style: saved ? { color: 'var(--purple-3)' } : null,
    onclick: () => { update((st) => { st.savedExercises = saved ? st.savedExercises.filter((x) => x !== e.id) : [...st.savedExercises, e.id]; }); toast(saved ? 'הוסר מהשמורים' : 'נשמר', 'bookmark'); ctx.refresh(); },
  }, ic('bookmark'))] }));
  let playing = true;
  const media = h('div', { class: 'media ex-fig', html: figureSVG({ ...e.fig, label: e.name }) });
  const playBtn = h('button', { class: 'btn sm', onclick: () => {
    const svg = media.querySelector('svg');
    playing = !playing;
    if (playing) svg.unpauseAnimations(); else svg.pauseAnimations();
    playBtn.replaceChildren(ic(playing ? 'pause' : 'play'), playing ? 'עצירה' : 'הפעלה');
  } }, ic('pause'), 'עצירה');
  root.append(media);
  root.append(h('div', { class: 'row between mt' },
    h('div', { class: 'row wrap', style: { gap: '6px' } },
      h('span', { class: 'tag ' + (e.level === 1 ? 'lime' : e.level === 2 ? 'amber' : 'pink') }, LEVEL_LABEL[e.level]),
      ...e.equip.map((q) => h('span', { class: 'tag' }, EQUIP[q]))),
    playBtn));
  if (e.fig.note) root.append(h('p', { class: 'tiny muted' }, e.fig.note));
  if (e.level > lv) root.append(h('div', { class: 'mt' }, note(`התרגיל מסומן לרמה "${LEVEL_LABEL[e.level]}". לפני שמנסים – כדאי לשלוט בגרסה הקלה: ${e.easier}`, 'warn')));
  root.append(h('div', { class: 'card hero mt' }, h('div', { class: 'row between' }, h('b', null, 'כמה לעשות (לרמה שלך)'), h('span', { class: 'tag purple', style: { fontSize: '14px' } }, e.reps[lv] === '—' ? e.reps[Math.min(3, e.level)] : e.reps[lv])),
    h('p', { class: 'small mt' }, 'סטים × חזרות. מנוחה של 60-90 שניות בין סטים. מעלים קושי רק כשכל החזרות נעשות בטכניקה טובה.')));
  root.append(section('שרירים שעובדים'));
  root.append(h('div', { class: 'chips' }, e.muscles.map((m) => h('span', { class: 'chip on' }, m))));
  root.append(section('איך מבצעים נכון'));
  root.append(h('div', { class: 'card' }, h('ol', { class: 'steps' }, e.steps.map((x) => h('li', null, x)))));
  root.append(section('טעויות נפוצות'));
  root.append(h('div', { class: 'card' }, h('ul', { class: 'dots' }, e.mistakes.map((x) => h('li', null, x)))));
  root.append(section('התאמה לרמה'));
  root.append(h('div', { class: 'grid2' },
    h('div', { class: 'card' }, h('span', { class: 'tag lime' }, ic('arrowDown'), 'קל יותר'), h('p', { class: 'small mt' }, e.easier)),
    h('div', { class: 'card', style: { marginTop: 0 } }, h('span', { class: 'tag pink' }, ic('arrowUp'), 'קשה יותר'), h('p', { class: 'small mt' }, e.harder))));
  root.append(h('div', { class: 'mt' }, note('כאב חד, כאב במפרק או סחרחורת – לעצור את התרגיל.', 'warn')));
  root.append(h('div', { class: 'row mt2' },
    h('button', { class: 'btn grow', onclick: () => ctx.go(`#/coach?q=${encodeURIComponent('איך עושים ' + e.name + ' נכון?')}`) }, ic('bot'), 'לשאול את המאמן'),
    h('button', { class: 'btn primary grow', onclick: () => ctx.go(`#/log?ex=${e.id}`) }, ic('plus'), 'תיעוד ביצוע')));
  return root;
}

// ---------------- workout (guided) ----------------
export function workoutScreen(ctx) {
  const w = WORKOUTS[ctx.params[0]];
  const root = h('main');
  if (!w) { root.append(topbar('אימון', { back: '#/fitness' }), emptyState('dumbbell', 'לא נמצא')); return root; }
  const lv = level();
  const items = w.items.map((id) => adaptExercise(id, lv)).filter(Boolean);
  const uniq = [...new Map(items.map((e) => [e.id, e])).values()];
  root.append(topbar(w.name, { sub: `${w.focus} · כ-${w.minutes} דק׳`, back: '#/fitness' }));
  const warn = overtrainingNote();
  if (warn && !['mobility', 'posture', 'walk'].includes(w.id)) root.append(warn);

  const exRow = (e, tag) => h('button', { class: 'list-row', onclick: () => ctx.go('#/exercise/' + e.id) },
    h('span', { class: 'ico', style: { width: '64px', height: '48px', padding: 0, overflow: 'hidden', background: 'var(--bg-2)' }, html: figureSVG(e.fig, { animate: false }) }),
    h('div', { class: 'grow' }, h('div', { class: 't' }, e.name), h('div', { class: 'd' }, `${tag ? tag + ' · ' : ''}${e.reps[lv] === '—' ? e.reps[e.level] : e.reps[lv]}`)),
    ic('chevron', 'chev'));
  if (w.warmup.length) { root.append(section('חימום (3-5 דק׳)')); root.append(h('div', { class: 'list' }, w.warmup.map((id) => exRow(EX[id], 'קצר וקל')))); }
  root.append(section(`תרגילים (${uniq.length})`));
  root.append(h('div', { class: 'list' }, uniq.map((e) => exRow(e))));
  if (w.cooldown.length) { root.append(section('שחרור ומתיחות')); root.append(h('div', { class: 'list' }, w.cooldown.map((id) => exRow(EX[id], 'מתיחה')))); }
  if (uniq.some((e, i) => e.id !== w.items[i])) root.append(h('p', { class: 'tiny muted mt' }, 'חלק מהתרגילים הוחלפו בגרסה שמתאימה לרמה שלך.'));
  root.append(h('div', { class: 'mt2' }, h('button', { class: 'btn primary block', onclick: () => guided(w, uniq, ctx) }, ic('play'), 'מצב אימון מודרך')));
  root.append(h('button', { class: 'btn ghost block mt', onclick: () => finishWorkout(w, [], w.minutes, ctx) }, ic('check'), 'סימון שהאימון בוצע'));
  return root;
}

function guided(w, list, ctx) {
  const lv = level();
  const all = [...w.warmup.map((id) => ({ ...EX[id], phase: 'חימום', sets: 1 })), ...list.map((e) => ({ ...e, phase: 'תרגיל', sets: parseInt((e.reps[lv] === '—' ? e.reps[e.level] : e.reps[lv]), 10) || 2 })), ...w.cooldown.map((id) => ({ ...EX[id], phase: 'שחרור', sets: 1 }))];
  let i = 0, set = 1, resting = false, restLeft = 0, timer = null;
  const started = Date.now();
  const log = [];
  const sh = sheet((api) => {
    const body = h('div');
    const draw = () => {
      clearInterval(timer);
      const e = all[i];
      const reps = e.reps[lv] === '—' ? e.reps[e.level] : e.reps[lv];
      if (resting) {
        const t = h('div', { class: 'timer' }, `0:${String(restLeft).padStart(2, '0')}`);
        timer = setInterval(() => {
          restLeft--;
          t.textContent = `${Math.floor(restLeft / 60)}:${String(restLeft % 60).padStart(2, '0')}`;
          if (restLeft <= 0) { clearInterval(timer); resting = false; if (navigator.vibrate) navigator.vibrate(200); draw(); }
        }, 1000);
        body.replaceChildren(
          h('div', { class: 'center' }, h('span', { class: 'tag cyan' }, ic('timer'), 'מנוחה'), t,
            h('p', { class: 'muted' }, `הבא: ${e.name} – סט ${set} מתוך ${e.sets}`),
            h('div', { class: 'row mt' }, h('button', { class: 'btn grow', onclick: () => { restLeft += 15; } }, '+15 שנ׳'), h('button', { class: 'btn primary grow', onclick: () => { resting = false; draw(); } }, 'דילוג על המנוחה'))));
        return;
      }
      body.replaceChildren(
        h('div', { class: 'row between' }, h('span', { class: 'tag purple' }, `${e.phase} · ${i + 1}/${all.length}`), h('button', { class: 'icon-btn', 'aria-label': 'סגירה', onclick: async () => { if (await confirmDialog('לצאת מהאימון?', 'ההתקדמות באימון הזה לא תישמר.', { ok: 'יציאה' })) { clearInterval(timer); api.close(); } } }, ic('x'))),
        h('h2', { class: 'mt' }, e.name),
        h('div', { class: 'media ex-fig mt', html: figureSVG(e.fig) }),
        h('div', { class: 'row between mt' }, h('b', null, `סט ${set} מתוך ${e.sets}`), h('span', { class: 'tag' }, reps)),
        h('ul', { class: 'dots small' }, e.steps.slice(0, 2).map((x) => h('li', null, x))),
        h('div', { class: 'row mt' },
          h('button', { class: 'btn', onclick: () => next(true) }, 'דילוג'),
          h('button', { class: 'btn primary grow', onclick: () => next(false) }, ic('check'), set < e.sets ? 'סיימתי סט' : 'סיימתי תרגיל')));
    };
    const next = (skip) => {
      const e = all[i];
      if (!skip) { const ex = log.find((x) => x.id === e.id); if (ex) ex.sets++; else log.push({ id: e.id, name: e.name, sets: 1 }); }
      if (!skip && set < e.sets) { set++; resting = e.phase === 'תרגיל'; restLeft = lv === 1 ? 75 : 60; draw(); return; }
      i++; set = 1;
      if (i >= all.length) { clearInterval(timer); api.close(); finishWorkout(w, log, Math.max(1, Math.round((Date.now() - started) / 60000)), ctx); return; }
      resting = all[i - 1].phase === 'תרגיל' && !skip; restLeft = 60; draw();
    };
    draw();
    return body;
  }, { onClose: () => clearInterval(timer) });
  return sh;
}

function finishWorkout(w, sets, minutes, ctx) {
  sheet((api) => {
    let feel = 'טוב';
    return h('div', { class: 'center' },
      h('div', { class: 'big-num' }, '💪'),
      h('h2', null, 'אימון הושלם!'),
      h('p', { class: 'lead' }, `${w.name} · ${minutes} דק׳`),
      h('div', { class: 'field', style: { textAlign: 'start' } }, h('span', null, 'איך הרגשת?'), chips(['קל מדי', 'טוב', 'מאתגר', 'קשה מדי'], feel, (v) => (feel = v), { multi: false })),
      h('button', {
        class: 'btn primary block mt',
        onclick: (e) => {
          const key = todayKey();
          update((s) => {
            const d = day(key);
            const isPlan = workoutFor(s.profile, s.program, dayIndexOf(s.program))?.id === w.id;
            if (isPlan) { setTaskDone({ id: 'workout', workoutId: w.id, title: w.name, minutes }, true, key); d.workouts[d.workouts.length - 1].sets = sets; d.workouts[d.workouts.length - 1].feel = feel; }
            else d.workouts.push({ id: w.id, name: w.name, minutes, sets, feel, source: 'manual', at: Date.now() });
            if (w.id === 'posture') d.done.posture = true;
          });
          const r = e.currentTarget.getBoundingClientRect(); burst(r.left + r.width / 2, r.top);
          toast(cheer(), 'trophy');
          if (feel === 'קשה מדי') toast('בפעם הבאה אפשר לבחור גרסה קלה יותר לכל תרגיל – זה בסדר גמור', 'info');
          api.close(); ctx.go('#/fitness?tab=history');
        },
      }, ic('check'), 'שמירה בהיסטוריה'));
  });
}

// ---------------- free log ----------------
export function workoutLog(ctx) {
  const pre = ctx.query.get('ex');
  const root = h('main');
  root.append(topbar('תיעוד אימון', { back: '#/fitness' }));
  const rows = pre && EX[pre] ? [{ id: pre, sets: 3, reps: 10, weight: '' }] : [];
  let minutes = 20, name = '', feel = 'טוב', date = todayKey();
  const list = h('div');
  const draw = () => {
    list.replaceChildren(...rows.map((r, i) => h('div', { class: 'card', style: { marginTop: '10px' } },
      h('div', { class: 'row between' }, h('b', null, EX[r.id].name), h('button', { class: 'icon-btn', 'aria-label': 'הסרה', onclick: () => { rows.splice(i, 1); draw(); } }, ic('x'))),
      h('div', { class: 'grid3 mt' },
        h('label', { class: 'field' }, h('span', null, 'סטים'), h('input', { class: 'input', type: 'number', min: 1, max: 10, value: r.sets, oninput: (e) => (r.sets = +e.target.value) })),
        h('label', { class: 'field' }, h('span', null, 'חזרות / שנ׳'), h('input', { class: 'input', type: 'number', min: 1, max: 300, value: r.reps, oninput: (e) => (r.reps = +e.target.value) })),
        h('label', { class: 'field' }, h('span', null, 'משקל (ק״ג)'), h('input', { class: 'input', type: 'number', min: 0, max: 300, step: 0.5, value: r.weight, placeholder: '—', oninput: (e) => (r.weight = e.target.value) }))))));
  };
  draw();
  const picker = h('select', { class: 'input', 'aria-label': 'הוספת תרגיל', onchange: (e) => { if (e.target.value) { rows.push({ id: e.target.value, sets: 3, reps: 10, weight: '' }); e.target.value = ''; draw(); } } },
    h('option', { value: '' }, '+ הוספת תרגיל…'), ...CATEGORIES.map((c) => h('optgroup', { label: c.label }, EXERCISES.filter((e) => e.cat === c.id).map((e) => h('option', { value: e.id }, e.name)))));
  root.append(
    h('label', { class: 'field' }, h('span', null, 'שם האימון (לא חובה)'), h('input', { class: 'input', placeholder: 'לדוגמה: כדורגל עם חברים', maxlength: 40, oninput: (e) => (name = e.target.value) })),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', null, 'משך (דקות)'), h('input', { class: 'input', type: 'number', min: 1, max: 240, value: minutes, oninput: (e) => (minutes = +e.target.value) })),
      h('label', { class: 'field' }, h('span', null, 'תאריך'), h('input', { class: 'input', type: 'date', value: date, max: todayKey(), oninput: (e) => (date = e.target.value || todayKey()) }))),
    picker, list,
    h('div', { class: 'field mt' }, h('span', null, 'איך הרגשת?'), chips(['קל מדי', 'טוב', 'מאתגר', 'קשה מדי'], feel, (v) => (feel = v), { multi: false })),
    minutes > 120 ? note('אימון ארוך מאוד. חשוב לשתות, לאכול ולנוח אחריו.', 'warn') : '',
    h('button', {
      class: 'btn primary block mt2',
      onclick: () => {
        if (!minutes || minutes < 1) return toast('צריך להזין משך', 'info');
        update(() => { day(date).workouts.push({ id: 'custom', name: name.trim() || (rows.length ? rows.map((r) => EX[r.id].name).slice(0, 2).join(', ') : 'אימון חופשי'), minutes: Math.min(240, minutes), sets: rows.map((r) => ({ id: r.id, name: EX[r.id].name, sets: r.sets, reps: r.reps, weight: r.weight })), feel, source: 'manual', at: Date.now() }); });
        toast('האימון נשמר', 'check');
        ctx.go('#/fitness?tab=history');
      },
    }, ic('check'), 'שמירה'));
  return root;
}
