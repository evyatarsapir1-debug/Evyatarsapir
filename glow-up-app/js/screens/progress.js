// Progress: stats, habits, histories, achievements, and an optional private photo journal.
// No beauty scores, no face ratings, no body comparisons.
import { h, ic, ring, bar, note, emptyState, confirmDialog, toast, sheet, sheetHead, pickImage, readImage, listRow } from '../ui.js';
import { getState, update, todayKey, addDays, uid, images, storedImg } from '../store.js';
import { streak, bestStreak, totalDone, completion, tasksFor, weekSummary, dayIndexOf } from '../plan.js';
import { topbar, section, fmtDate, areaColor } from './common.js';
import { weekChart } from './home.js';

export function achievements() {
  const s = getState();
  const days = Object.values(s.days);
  const workouts = days.reduce((a, d) => a + (d.workouts?.length || 0), 0);
  const skinFull = days.filter((d) => d.done?.['skin-am'] && d.done?.['skin-pm']).length;
  const waterDays = days.filter((d) => d.done?.water).length;
  const sleepDays = days.filter((d) => d.sleep).length;
  const total = totalDone();
  const best = bestStreak();
  const programDone = (s.program?.history || []).length > 0 || (s.program && dayIndexOf(s.program) >= s.program.length);
  return [
    { id: 'first', icon: 'check', title: 'צעד ראשון', desc: 'להשלים משימה ראשונה', on: total >= 1 },
    { id: 's3', icon: 'flame', title: '3 ימים ברצף', desc: 'רצף התמדה של 3 ימים', on: best >= 3 },
    { id: 's7', icon: 'flame', title: 'שבוע שלם', desc: 'רצף של 7 ימים', on: best >= 7 },
    { id: 's30', icon: 'crown', title: 'חודש של התמדה', desc: 'רצף של 30 ימים', on: best >= 30 },
    { id: 't50', icon: 'star', title: '50 משימות', desc: 'להשלים 50 משימות', on: total >= 50 },
    { id: 't200', icon: 'medal', title: '200 משימות', desc: 'להשלים 200 משימות', on: total >= 200 },
    { id: 'w1', icon: 'dumbbell', title: 'אימון ראשון', desc: 'לתעד אימון', on: workouts >= 1 },
    { id: 'w10', icon: 'zap', title: '10 אימונים', desc: 'לתעד 10 אימונים', on: workouts >= 10 },
    { id: 'skin7', icon: 'sparkles', title: 'עור מטופח', desc: '7 ימים של שגרת בוקר וערב', on: skinFull >= 7 },
    { id: 'water5', icon: 'droplet', title: 'שתיין/ית', desc: 'יעד מים ב-5 ימים', on: waterDays >= 5 },
    { id: 'sleep7', icon: 'moon', title: 'מעקב שינה', desc: 'לתעד שינה 7 פעמים', on: sleepDays >= 7 },
    { id: 'look', icon: 'shirt', title: 'לוק ראשון', desc: 'לשמור לוק', on: s.looks.length >= 1 },
    { id: 'ward10', icon: 'layers', title: 'ארון מסודר', desc: '10 פריטים בארון', on: s.wardrobe.length >= 10 },
    { id: 'cut', icon: 'scissors', title: 'יודע/ת מה רוצה', desc: 'לשמור תספורת', on: s.savedCuts.length >= 1 },
    { id: 'prog', icon: 'trophy', title: 'סיום תוכנית', desc: 'להשלים מסלול', on: programDone },
  ];
}

function heatmap() {
  const s = getState();
  const key = todayKey();
  const cells = [];
  for (let i = 44; i >= 0; i--) {
    const k = addDays(key, -i);
    const n = Object.values(s.days[k]?.done || {}).filter(Boolean).length;
    const c = n === 0 ? '' : n < 3 ? 'l1' : n < 6 ? 'l2' : 'l3';
    cells.push(h('i', { class: c, title: `${fmtDate(k)}: ${n} משימות` }));
  }
  return h('div', null, h('div', { class: 'heat' }, cells),
    h('div', { class: 'legend mt' }, h('span', null, 'פחות'), h('i', { style: { background: 'var(--surface-2)' } }), h('i', { style: { background: 'rgba(139,92,246,.35)' } }), h('i', { style: { background: 'rgba(139,92,246,.65)' } }), h('i', { style: { background: 'var(--purple-2)' } }), h('span', null, 'יותר')));
}

function habitsCard() {
  const s = getState();
  const key = todayKey();
  const labels = { skin: 'טיפוח עור', hair: 'שיער', fitness: 'כושר', posture: 'יציבה', nutrition: 'תזונה', style: 'סטייל', sleep: 'שינה', hygiene: 'רעננות', core: 'בסיס (מים, שיניים, למידה)', custom: 'משימות אישיות' };
  const agg = {};
  for (let i = 0; i < 14; i++) {
    const k = addDays(key, -i);
    if (s.program && k < s.program.startDate && !s.days[k]) continue;
    for (const t of tasksFor(k)) {
      if (t.id === 'rest') continue;
      agg[t.area] ||= { done: 0, total: 0 };
      agg[t.area].total++;
      if (s.days[k]?.done?.[t.id]) agg[t.area].done++;
    }
  }
  const rows = Object.entries(agg).filter(([, v]) => v.total);
  if (!rows.length) return emptyState('chart', 'עדיין אין מספיק נתונים.');
  return h('div', null, rows.map(([area, v]) => h('div', { style: { marginBottom: '12px' } },
    h('div', { class: 'row between small' }, h('span', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'swatch', style: { background: areaColor(area), width: '10px', height: '10px' } }), labels[area] || area), h('span', { class: 'muted' }, `${v.done}/${v.total}`)),
    h('div', { style: { marginTop: '6px' } }, bar(v.done / v.total)))));
}

export default function progress(ctx) {
  const s = getState();
  const root = h('main');
  root.append(topbar('ההתקדמות שלי', { sub: 'משווים רק לעצמך מאתמול', back: '#/home' }));
  const st = streak();
  const days = Object.values(s.days);
  const activeDays = days.filter((d) => Object.values(d.done || {}).some(Boolean)).length;
  const workouts = days.reduce((a, d) => a + (d.workouts?.length || 0), 0);
  const skinDays = days.filter((d) => d.done?.['skin-am'] || d.done?.['skin-pm']).length;
  const comp = completion();

  root.append(h('div', { class: 'card hero', 'data-tour': 'progress' },
    h('div', { class: 'row' }, ring(comp.pct, `${Math.round(comp.pct * 100)}%`, 'היום', 96),
      h('div', { class: 'grow' }, h('div', { class: 'streak', style: { fontSize: '22px' } }, ic('flame'), `${st} ימים ברצף`), h('p', { class: 'small' }, `השיא שלך: ${bestStreak()} ימים`),
        h('p', { class: 'small' }, st > 0 ? 'ממשיכים ככה! כל יום עם משימה אחת לפחות שומר על הרצף.' : 'היום הוא יום מצוין להתחיל רצף חדש.')))));
  root.append(h('div', { class: 'grid2 mt' },
    stat('check', totalDone(), 'משימות הושלמו', '#c084fc'),
    stat('calendar', activeDays, 'ימים פעילים', '#22d3ee'),
    stat('dumbbell', workouts, 'אימונים', '#a3e635'),
    stat('sparkles', skinDays, 'ימי טיפוח', '#f472b6')));

  root.append(section('השבוע'));
  root.append(h('div', { class: 'card' }, weekChart()));

  root.append(section('45 הימים האחרונים'));
  root.append(h('div', { class: 'card' }, heatmap()));

  root.append(section('התקדמות בהרגלים (14 ימים)'));
  root.append(h('div', { class: 'card' }, habitsCard()));

  root.append(section('היסטוריה', null));
  root.append(h('div', { class: 'list' },
    listRow({ icon: 'dumbbell', title: 'היסטוריית אימונים', desc: `${workouts} אימונים`, onclick: () => ctx.go('#/fitness?tab=history') }),
    listRow({ icon: 'sparkles', title: 'היסטוריית טיפוח', desc: `${skinDays} ימים עם שגרת טיפוח`, onclick: () => ctx.go('#/care') }),
    listRow({ icon: 'shirt', title: 'לוקים שמורים', desc: `${s.looks.length} לוקים`, onclick: () => ctx.go('#/style?tab=looks') }),
    listRow({ icon: 'scissors', title: 'תסרוקות שמורות', desc: `${s.savedCuts.length} תסרוקות`, onclick: () => ctx.go('#/hair?tab=saved') }),
    listRow({ icon: 'moon', title: 'מעקב שינה', desc: `${days.filter((d) => d.sleep).length} לילות מתועדים`, onclick: () => ctx.go('#/routine?tab=sleep') })));

  root.append(section('הישגים'));
  const ach = achievements();
  root.append(h('p', { class: 'small muted', style: { marginTop: '-4px' } }, `${ach.filter((a) => a.on).length} מתוך ${ach.length}`));
  root.append(h('div', { class: 'ach' }, ach.map((a) => h('div', { class: 'a' + (a.on ? ' on' : ''), title: a.desc }, h('div', { class: 'ai' }, ic(a.on ? a.icon : 'lock')), h('b', null, a.title), h('div', { class: 'tiny muted' }, a.desc)))));

  root.append(section('יומן תמונות פרטי'));
  root.append(photoJournal(ctx));
  return root;
}

function stat(icon, v, k, color) {
  return h('div', { class: 'stat' }, h('div', { class: 'row between' }, h('div', { class: 'v' }, v), h('span', { style: { color } }, ic(icon))), h('div', { class: 'k' }, k));
}

function photoJournal(ctx) {
  const s = getState();
  const wrap = h('div', { class: 'card' });
  wrap.append(note('**לגמרי אופציונלי.** התמונות נשמרות רק במכשיר הזה, לא נשלחות לשום מקום (גם לא למאמן), ואפשר למחוק אותן בכל רגע. אין כאן ציונים או השוואות – רק תיעוד אישי בשבילך.', '', 'lock'));
  if (s.photos.length) {
    wrap.append(h('div', { class: 'photo-grid mt' }, s.photos.map((p) => h('button', { class: 'ph', onclick: () => viewPhoto(p, ctx) }, storedImg(p.imageId, ''), h('span', null, fmtDate(p.date, { day: 'numeric', month: 'short' }))))));
  }
  wrap.append(h('button', {
    class: 'btn block mt',
    onclick: async () => {
      if (!s.settings.photoConsent) {
        const ok = await confirmDialog('יומן תמונות פרטי', 'התמונה תישמר רק במכשיר הזה (בזיכרון הדפדפן) ולא תועלה לשום שרת. אפשר למחוק כל תמונה או את כל המידע בהגדרות. להמשיך?', { ok: 'כן, להמשיך' });
        if (!ok) return;
        update((st) => { st.settings.photoConsent = true; });
      }
      const f = await pickImage();
      if (!f) return;
      try {
        const data = await readImage(f, 900);
        const imageId = await images.put(data);
        update((st) => { st.photos.unshift({ id: uid(), imageId, date: todayKey(), note: '' }); });
        toast('נשמר ביומן הפרטי', 'lock');
        ctx.refresh();
      } catch { toast('לא הצלחנו לשמור את התמונה', 'alert'); }
    },
  }, ic('camera'), 'הוספת תמונה'));
  return wrap;
}

function viewPhoto(p, ctx) {
  sheet((api) => {
    let noteTxt = p.note || '';
    return h('div', null,
      sheetHead(fmtDate(p.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), null, api),
      h('div', { class: 'media', style: { maxHeight: '60vh' } }, storedImg(p.imageId, '')),
      h('label', { class: 'field mt' }, h('span', null, 'הערה אישית'), h('input', { class: 'input', value: noteTxt, maxlength: 80, 'data-no-autofocus': '1', oninput: (e) => (noteTxt = e.target.value) })),
      h('div', { class: 'row' },
        h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('למחוק את התמונה?', 'המחיקה סופית.', { ok: 'מחיקה', danger: true })) { await images.del(p.imageId); update((s) => { s.photos = s.photos.filter((x) => x.id !== p.id); }); api.close(); toast('נמחקה', 'trash'); ctx.refresh(); } } }, ic('trash'), 'מחיקה'),
        h('button', { class: 'btn primary grow', onclick: () => { update((s) => { const x = s.photos.find((y) => y.id === p.id); if (x) x.note = noteTxt; }); api.close(); } }, ic('check'), 'שמירה')));
  });
}
