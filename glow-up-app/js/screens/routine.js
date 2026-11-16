// Sleep & daily routine: editable morning/evening routine, sleep tracking, reminders, day planner.
import { h, ic, sheet, sheetHead, toast, note, emptyState, toggle, confirmDialog, listRow } from '../ui.js';
import { getState, update, todayKey, addDays, day, uid } from '../store.js';
import { sleepHours, minusMinutes } from '../routines.js';
import { requestPermission, notificationsSupported, DAY_NAMES } from '../reminders.js';
import { topbar, section, fmtDate } from './common.js';

export default function routine(ctx) {
  const tab = ctx.query.get('tab') || 'routine';
  const root = h('main');
  root.append(topbar('שינה ושגרת יום', { sub: 'שגרה שמתאימה לשעות שלך', back: '#/home' }));
  const tabs = [['routine', 'שגרה'], ['sleep', 'שינה'], ['reminders', 'תזכורות'], ['day', 'ארגון יום']];
  root.append(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', class: tab === id ? 'on' : '', onclick: () => ctx.go(`#/routine?tab=${id}`) }, label))));
  root.append(tab === 'routine' ? routineTab(ctx) : tab === 'sleep' ? sleepTab(ctx) : tab === 'reminders' ? remindersTab(ctx) : dayTab(ctx));
  return root;
}

function routineList(slot, ctx) {
  const key = todayKey();
  const card = h('div', { class: 'card', style: { marginTop: '12px' } });
  const draw = () => {
    const s = getState();
    const r = s.routines;
    const items = r[slot].filter((x) => x.on);
    const checked = s.days[key]?.routine?.[slot] || [];
    const total = items.reduce((a, x) => a + (x.minutes || 0), 0);
    const start = slot === 'morning' ? r.wake : minusMinutes(r.bed, total);
    card.replaceChildren(
      h('div', { class: 'row between mb' },
        h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic(slot === 'morning' ? 'sun' : 'moon')),
          h('div', null, h('b', null, slot === 'morning' ? 'שגרת בוקר' : 'שגרת ערב'), h('div', { class: 'tiny muted ltr', style: { textAlign: 'right' } }, `${start} · ${total} דק׳`))),
        h('button', { class: 'btn sm', onclick: () => editRoutine(slot, ctx) }, ic('edit'), 'עריכה')),
      items.length ? h('div', null, items.map((it) => {
        const on = checked.includes(it.id);
        return h('div', { class: 'task' + (on ? ' done' : '') },
          h('button', { class: 'check' + (on ? ' on' : ''), 'aria-label': it.title, 'aria-pressed': on ? 'true' : 'false', onclick: () => {
            update(() => { const d = day(key); d.routine ||= {}; const list = new Set(d.routine[slot] || []); on ? list.delete(it.id) : list.add(it.id); d.routine[slot] = [...list]; });
            draw();
          } }, ic('check')),
          h('div', { class: 'task-body' }, h('span', { class: 'task-title' }, it.title), h('span', { class: 'tiny muted' }, `${it.minutes} דק׳`)));
      })) : emptyState('list', 'אין פריטים בשגרה. לחצו על עריכה להוספה.'));
  };
  draw();
  return card;
}

function editRoutine(slot, ctx) {
  sheet((api) => {
    const r = getState().routines;
    let title = '', minutes = 5;
    return h('div', null,
      sheetHead(slot === 'morning' ? 'עריכת שגרת בוקר' : 'עריכת שגרת ערב', 'הפעילו, כבו, מחקו או הוסיפו פעולות. הסדר הוא סדר הביצוע.', api),
      h('div', { class: 'list' }, r[slot].map((it, i) => h('div', { class: 'list-row' },
        h('div', { class: 'grow' }, h('div', { class: 't' }, it.title), h('div', { class: 'd' }, `${it.minutes} דק׳`)),
        h('button', { class: 'icon-btn', 'aria-label': 'למעלה', disabled: i === 0, onclick: () => { update((s) => { const a = s.routines[slot]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; }); api.rebuild(); ctx.refresh(); } }, ic('arrowUp')),
        toggle(it.on, (v) => { update(() => { it.on = v; }); ctx.refresh(); }, it.title),
        h('button', { class: 'icon-btn', 'aria-label': 'מחיקה', onclick: () => { update((s) => { s.routines[slot] = s.routines[slot].filter((x) => x.id !== it.id); }); api.rebuild(); ctx.refresh(); } }, ic('trash'))))),
      h('div', { class: 'grid2 mt', style: { gridTemplateColumns: '2fr 1fr' } },
        h('input', { class: 'input', placeholder: 'פעולה חדשה…', maxlength: 50, 'data-no-autofocus': '1', oninput: (e) => (title = e.target.value) }),
        h('input', { class: 'input', type: 'number', min: 1, max: 120, value: 5, 'aria-label': 'דקות', oninput: (e) => (minutes = +e.target.value || 5) })),
      h('button', { class: 'btn primary block mt', onclick: () => { if (!title.trim()) return toast('צריך לכתוב פעולה', 'info'); update((s) => { s.routines[slot].push({ id: uid(), title: title.trim(), minutes: Math.min(120, Math.max(1, minutes)), on: true }); }); api.rebuild(); ctx.refresh(); } }, ic('plus'), 'הוספה'));
  });
}

function routineTab(ctx) {
  const s = getState();
  const r = s.routines;
  const wrap = h('div');
  const timeInput = (label, val, onSet) => h('label', { class: 'field', style: { margin: 0 } }, h('span', null, label), h('input', { class: 'input', type: 'time', value: val, onchange: (e) => { if (e.target.value) { onSet(e.target.value); toast('נשמר', 'check'); ctx.refresh(); } } }));
  const hrs = sleepHours(r.bed, r.wake);
  wrap.append(h('div', { class: 'card hero' },
    h('div', { class: 'grid2' }, timeInput('שעת השכמה', r.wake, (v) => update((st) => { st.routines.wake = v; })), timeInput('שעת שינה', r.bed, (v) => update((st) => { st.routines.bed = v; }))),
    h('p', { class: 'small mt' }, `לפי השעות האלה יש לך ${hrs} שעות שינה. ${hrs < r.sleepGoal ? `המומלץ לגילך: לפחות ${r.sleepGoal} שעות – נסו להקדים את שעת השינה.` : 'מעולה, זה בטווח המומלץ.'}`)));
  wrap.append(routineList('morning', ctx));
  wrap.append(routineList('evening', ctx));
  wrap.append(h('div', { class: 'mt' }, note('הפסקת מסכים 30-60 דקות לפני השינה עוזרת להירדם מהר יותר. אפשר להפעיל תזכורת בלשונית "תזכורות".')));
  return wrap;
}

function sleepTab(ctx) {
  const s = getState();
  const key = todayKey();
  const r = s.routines;
  const last = s.days[key]?.sleep || { bed: r.bed, wake: r.wake, quality: 3 };
  let bed = last.bed, wake = last.wake, quality = last.quality || 3;
  const wrap = h('div');
  const qBtns = h('div', { class: 'chips' });
  const drawQ = () => qBtns.replaceChildren(...[[1, 'גרוע'], [2, 'לא משהו'], [3, 'בסדר'], [4, 'טוב'], [5, 'מעולה']].map(([v, l]) => h('button', { class: 'chip' + (quality === v ? ' on' : ''), onclick: () => { quality = v; drawQ(); } }, l)));
  drawQ();
  wrap.append(h('div', { class: 'card hero' },
    h('b', null, 'איך ישנת הלילה?'),
    h('div', { class: 'grid2 mt' },
      h('label', { class: 'field' }, h('span', null, 'נרדמתי בערך ב-'), h('input', { class: 'input', type: 'time', value: bed, onchange: (e) => (bed = e.target.value) })),
      h('label', { class: 'field' }, h('span', null, 'קמתי ב-'), h('input', { class: 'input', type: 'time', value: wake, onchange: (e) => (wake = e.target.value) }))),
    h('div', { class: 'field' }, h('span', null, 'איכות השינה'), qBtns),
    h('button', { class: 'btn primary block', 'data-sleep-save': '', onclick: () => {
      if (!bed || !wake) return toast('צריך למלא שעות', 'info');
      update(() => { const d = day(key); d.sleep = { bed, wake, quality, hours: sleepHours(bed, wake) }; d.done['sleep-log'] = true; });
      toast(`נשמר: ${sleepHours(bed, wake)} שעות שינה`, 'moon'); ctx.refresh();
    } }, ic('check'), s.days[key]?.sleep ? 'עדכון' : 'שמירה')));
  // 7-day chart
  const days = Array.from({ length: 7 }, (_, i) => addDays(key, i - 6));
  const vals = days.map((k) => s.days[k]?.sleep?.hours || 0);
  const logged = vals.filter(Boolean);
  const avg = logged.length ? Math.round((logged.reduce((a, b) => a + b, 0) / logged.length) * 10) / 10 : 0;
  const max = 12;
  wrap.append(section('7 הלילות האחרונים'));
  wrap.append(h('div', { class: 'card' },
    h('div', { class: 'row between mb' }, h('b', null, logged.length ? `ממוצע: ${avg} שעות` : 'עדיין אין תיעוד'), h('span', { class: 'tag cyan' }, `יעד: ${r.sleepGoal} שעות`)),
    h('div', { class: 'week' }, days.map((k, i) => {
      const bar = h('i', { style: { height: '0%', background: vals[i] >= r.sleepGoal ? 'linear-gradient(to top,#22d3ee,#a855f7)' : 'linear-gradient(to top,#6d28d9,#a78bfa)' } });
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.height = Math.round((vals[i] / max) * 100) + '%'; }));
      return h('div', null, h('div', { class: 'col' + (k === key ? ' today' : ''), title: vals[i] ? `${vals[i]} שעות` : 'אין נתון' }, bar), h('div', { class: 'd' }, vals[i] ? String(vals[i]) : fmtDate(k, { weekday: 'narrow' })));
    })),
    logged.length >= 3 && avg < r.sleepGoal - 1 ? h('div', { class: 'mt' }, note('הממוצע נמוך מהמומלץ. נסו להקדים את שעת השינה ב-15 דקות כל כמה ימים, ולהימנע ממסכים לפני השינה.', 'warn')) : null));
  wrap.append(section('מדריכים'));
  wrap.append(h('div', { class: 'list' }, [['sleep-basics', 'moon', 'שינה טובה – הבסיס'], ['screens', 'phoneOff', 'הפסקות ממסכים']].map(([id, icon, t]) => listRow({ icon, title: t, onclick: () => ctx.go('#/guide/' + id) }))));
  return wrap;
}

function remindersTab(ctx) {
  const s = getState();
  const wrap = h('div');
  const perm = notificationsSupported() ? Notification.permission : 'unsupported';
  wrap.append(h('div', { class: 'card hero' },
    h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic('bell')), h('div', { class: 'grow' }, h('b', null, 'התראות מערכת'), h('div', { class: 'tiny muted' }, perm === 'granted' ? 'מאושר' : perm === 'denied' ? 'נחסם בדפדפן' : perm === 'unsupported' ? 'לא נתמך בדפדפן הזה' : 'לא הופעל')),
      toggle(s.settings.notifications && perm === 'granted', async (v) => {
        if (v) {
          const res = await requestPermission();
          if (res !== 'granted') { toast(res === 'unsupported' ? 'הדפדפן לא תומך בהתראות' : 'צריך לאשר התראות בהגדרות הדפדפן', 'alert'); ctx.refresh(); return; }
        }
        update((st) => { st.settings.notifications = v; }); ctx.refresh();
      }, 'התראות')),
    h('p', { class: 'tiny muted mt' }, 'תזכורות פועלות כשהאפליקציה פתוחה (בלשונית או כאפליקציה מותקנת במסך הבית). כשההתראות כבויות, התזכורת מופיעה כהודעה בתוך האפליקציה.')));
  // screen breaks
  const sb = s.routines.screenBreak;
  wrap.append(h('div', { class: 'card' },
    h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic('phoneOff')), h('div', { class: 'grow' }, h('b', null, 'תזכורת להפסקת מסך'), h('div', { class: 'tiny muted' }, `כל ${sb.every} דקות של שימוש`)),
      toggle(sb.on, (v) => { update((st) => { st.routines.screenBreak.on = v; }); toast(v ? 'הופעל' : 'כובה', 'check'); }, 'הפסקת מסך')),
    h('div', { class: 'chips mt' }, [30, 45, 60, 90].map((m) => h('button', { class: 'chip' + (sb.every === m ? ' on' : ''), onclick: () => { update((st) => { st.routines.screenBreak.every = m; }); ctx.refresh(); } }, `${m} דק׳`)))));
  wrap.append(section('התזכורות שלי', 'הוספה', () => reminderSheet(null, ctx)));
  if (!s.reminders.length) {
    wrap.append(h('div', { class: 'card' }, emptyState('bell', 'אין תזכורות עדיין.'),
      h('div', { class: 'chips', style: { justifyContent: 'center' } }, [['שגרת טיפוח בוקר', s.routines.wake], ['לשתות מים', '12:00'], ['אימון', '17:00'], ['שגרת ערב והפסקת מסכים', minusMinutes(s.routines.bed, 45)]].map(([t, time]) =>
        h('button', { class: 'chip', onclick: () => { update((st) => { st.reminders.push({ id: uid(), title: t, time, days: [], on: true }); }); toast('התזכורת נוספה', 'bell'); ctx.refresh(); } }, ic('plus'), `${t} · ${time}`)))));
  } else {
    wrap.append(h('div', { class: 'list' }, s.reminders.map((r) => h('div', { class: 'list-row' },
      h('span', { class: 'ico' }, ic('bell')),
      h('button', { class: 'grow', style: { background: 'none', border: 0, textAlign: 'inherit', padding: 0 }, onclick: () => reminderSheet(r, ctx) },
        h('div', { class: 't' }, r.title), h('div', { class: 'd' }, h('span', { class: 'ltr' }, r.time), ' · ', r.days?.length ? r.days.map((d) => DAY_NAMES[d]).join(' ') : 'כל יום')),
      toggle(r.on, (v) => { update(() => { r.on = v; }); }, r.title)))));
  }
  return wrap;
}

function reminderSheet(existing, ctx) {
  const r = existing ? { ...existing, days: [...(existing.days || [])] } : { id: uid(), title: '', time: '08:00', days: [], on: true };
  sheet((api) => h('div', null,
    sheetHead(existing ? 'עריכת תזכורת' : 'תזכורת חדשה', null, api),
    h('label', { class: 'field' }, h('span', null, 'על מה להזכיר?'), h('input', { class: 'input', value: r.title, maxlength: 50, oninput: (e) => (r.title = e.target.value) })),
    h('label', { class: 'field' }, h('span', null, 'שעה'), h('input', { class: 'input', type: 'time', value: r.time, onchange: (e) => (r.time = e.target.value) })),
    h('div', { class: 'field' }, h('span', null, 'ימים (ללא בחירה = כל יום)'), h('div', { class: 'chips' }, DAY_NAMES.map((n, i) => h('button', { class: 'chip' + (r.days.includes(i) ? ' on' : ''), onclick: (e) => { r.days = r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i]; e.currentTarget.classList.toggle('on'); } }, n)))),
    h('div', { class: 'row mt' },
      existing ? h('button', { class: 'btn danger', 'aria-label': 'מחיקה', onclick: async () => { if (await confirmDialog('למחוק את התזכורת?', r.title, { ok: 'מחיקה', danger: true })) { update((s) => { s.reminders = s.reminders.filter((x) => x.id !== r.id); }); api.close(); ctx.refresh(); } } }, ic('trash')) : null,
      h('button', { class: 'btn primary grow', onclick: () => {
        if (!r.title.trim() || !r.time) return toast('צריך טקסט ושעה', 'info');
        update((s) => { const i = s.reminders.findIndex((x) => x.id === r.id); r.title = r.title.trim(); if (i >= 0) s.reminders[i] = r; else s.reminders.push(r); });
        api.close(); toast('נשמר', 'bell'); ctx.refresh();
      } }, ic('check'), 'שמירה'))));
}

function dayTab(ctx) {
  const s = getState();
  const blocks = [...(s.routines.blocks || [])].sort((a, b) => a.time.localeCompare(b.time));
  const wrap = h('div');
  wrap.append(h('p', { class: 'small muted' }, 'תכנון פשוט של היום: בית ספר/עבודה, שיעורי בית, אימון, זמן חופשי. המשימות של התוכנית מופיעות במסך הבית.'));
  const r = s.routines;
  const timeline = [{ time: r.wake, title: 'השכמה + שגרת בוקר', fixed: true }, ...blocks, { time: minusMinutes(r.bed, 45), title: 'שגרת ערב + הפסקת מסכים', fixed: true }, { time: r.bed, title: 'שינה', fixed: true }].sort((a, b) => a.time.localeCompare(b.time));
  wrap.append(h('div', { class: 'list mt' }, timeline.map((b) => h('div', { class: 'list-row' },
    h('span', { class: 'tag purple ltr', style: { minWidth: '54px', justifyContent: 'center' } }, b.time),
    h('div', { class: 'grow t' }, b.title),
    b.fixed ? h('span', { class: 'tiny muted' }, 'מהשגרה') : h('button', { class: 'icon-btn', 'aria-label': 'מחיקה', onclick: () => { update((st) => { st.routines.blocks = st.routines.blocks.filter((x) => x.id !== b.id); }); ctx.refresh(); } }, ic('trash'))))));
  let time = '16:00', title = '';
  wrap.append(h('div', { class: 'card' },
    h('b', null, 'הוספת פעילות ליום'),
    h('div', { class: 'grid2 mt', style: { gridTemplateColumns: '1fr 2fr' } },
      h('input', { class: 'input', type: 'time', value: time, 'aria-label': 'שעה', onchange: (e) => (time = e.target.value) }),
      h('input', { class: 'input', placeholder: 'לדוגמה: שיעורי בית', maxlength: 40, oninput: (e) => (title = e.target.value) })),
    h('button', { class: 'btn primary block mt', onclick: () => { if (!title.trim() || !time) return toast('צריך שעה ותיאור', 'info'); update((st) => { st.routines.blocks = [...(st.routines.blocks || []), { id: uid(), time, title: title.trim() }]; }); ctx.refresh(); } }, ic('plus'), 'הוספה')));
  wrap.append(h('div', { class: 'mt' }, note('טיפ: לשלב "זמן מנוחה" אמיתי ביום – בלי מסך – עוזר לריכוז ולמצב הרוח.')));
  return wrap;
}
