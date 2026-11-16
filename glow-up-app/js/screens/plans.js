// Programs: choose 7/30/90 days, pace, browse days, add/hide tasks, weekly summaries.
import { h, ic, sheet, sheetHead, toast, confirmDialog, bar, emptyState } from '../ui.js';
import { getState, update, todayKey, addDays, uid } from '../store.js';
import { PROGRAMS, PACES, tasksFor, phaseOf, dayIndexOf, weekSummary, completion, taskLibrary } from '../plan.js';
import { topbar, section, taskItem, fmtDate } from './common.js';

export default function plans(ctx) {
  const s = getState();
  const prog = s.program;
  const idx = dayIndexOf(prog);
  const sel = ctx.query.get('day') != null ? Math.max(0, Math.min(prog.length - 1, +ctx.query.get('day'))) : Math.min(idx, prog.length - 1);
  const selKey = addDays(prog.startDate, sel);
  const current = PROGRAMS.find((p) => p.length === prog.length);
  const root = h('main');

  root.append(topbar('התוכנית שלי', { sub: `${current.name} · קצב ${PACES.find((p) => p.id === prog.pace).label}`, back: '#/home' }));

  // overview
  const pct = Math.min(1, (idx + 1) / prog.length);
  root.append(h('div', { class: 'card hero' },
    h('div', { class: 'row between' }, h('b', null, `יום ${Math.min(idx + 1, prog.length)} מתוך ${prog.length}`), h('span', { class: 'tag purple' }, `שלב ${phaseOf(prog, Math.min(idx, prog.length - 1)).n}: ${phaseOf(prog, Math.min(idx, prog.length - 1)).name}`)),
    h('div', { class: 'mt' }, bar(pct)),
    h('p', { class: 'small mt' }, `התחלת ב-${fmtDate(prog.startDate, { day: 'numeric', month: 'long' })}. ${idx >= prog.length ? 'התוכנית הושלמה – אפשר לבחור מסלול חדש.' : `נשארו ${prog.length - idx - 1} ימים.`}`)));

  // program choice
  root.append(section('מסלולי התקדמות'));
  root.append(h('div', { class: 'stack', 'data-tour': 'programs' }, PROGRAMS.map((p) => h('button', {
    class: 'card tap' + (p.length === prog.length ? ' glow' : ''),
    onclick: async () => {
      if (p.length === prog.length) return;
      const ok = await confirmDialog(`לעבור ל${p.name}?`, 'התוכנית תתחיל מהיום. ההיסטוריה וההתקדמות שלך נשמרות.', { ok: 'כן, להתחיל' });
      if (!ok) return;
      update((st) => { st.program.history = [...(st.program.history || []), { length: st.program.length, startDate: st.program.startDate, endedAt: todayKey() }]; st.program.length = p.length; st.program.startDate = todayKey(); });
      toast(`${p.name} התחילה!`, 'zap');
      ctx.go('#/plans');
    },
  }, h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic(p.icon)), h('div', { class: 'grow' }, h('b', null, p.name), h('div', { class: 'small muted' }, p.sub)),
    p.length === prog.length ? h('span', { class: 'tag purple' }, 'פעילה') : ic('chevron', 'chev'))))));

  // pace
  root.append(section('הקצב שלי'));
  const paceWrap = h('div', { class: 'card' },
    h('div', { class: 'chips' }, PACES.map((pc) => h('button', {
      class: 'chip' + (prog.pace === pc.id ? ' on' : ''),
      onclick: () => { update((st) => { st.program.pace = pc.id; }); toast(`הקצב עודכן ל"${pc.label}"`, 'check'); ctx.refresh(); },
    }, pc.label))),
    h('p', { class: 'small muted mt' }, PACES.find((p) => p.id === prog.pace).desc + ' הקצב משנה את מספר המשימות ואת ימי האימון.'),
    h('div', { class: 'row mt' }, h('span', { class: 'small grow' }, `זמן יומי: ${s.profile.minutes} דקות`),
      h('button', { class: 'btn sm', onclick: () => editMinutes(ctx) }, ic('edit'), 'שינוי')));
  root.append(paceWrap);

  // day picker
  root.append(section('משימות לפי יום'));
  const strip = h('div', { class: 'chips scroll', role: 'tablist' });
  for (let i = 0; i < prog.length; i++) {
    const k = addDays(prog.startDate, i);
    const c = k <= todayKey() ? completion(k) : null;
    const btn = h('button', {
      class: 'chip' + (i === sel ? ' on' : ''), role: 'tab', 'aria-selected': i === sel ? 'true' : 'false',
      onclick: () => ctx.go(`#/plans?day=${i}`),
    }, `יום ${i + 1}`, c && c.total && c.done === c.total ? ic('check') : null);
    strip.append(btn);
    if (i === sel) requestAnimationFrame(() => btn.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }
  root.append(strip);
  const ph = phaseOf(prog, sel);
  root.append(h('p', { class: 'small muted', style: { margin: '10px 0' } }, `${fmtDate(selKey, { weekday: 'long', day: 'numeric', month: 'long' })} · שלב ${ph.n} – ${ph.name}`));
  const future = selKey > todayKey();
  const list = h('div');
  const drawList = () => {
    const ts = tasksFor(selKey);
    list.replaceChildren(...ts.map((t) => future ? futureItem(t) : taskItem(t, { key: selKey, onChange: drawList })));
    const total = ts.reduce((a, t) => a + (t.minutes || 0), 0);
    list.append(h('p', { class: 'tiny muted center mt' }, `סה״כ זמן משוער: ${total} דקות${future ? ' · אפשר לסמן משימות רק ביום עצמו או אחריו' : ''}`));
  };
  drawList();
  root.append(list);

  // edit tasks
  root.append(h('div', { class: 'row mt' },
    h('button', { class: 'btn grow', onclick: () => addTask(ctx) }, ic('plus'), 'משימה אישית'),
    h('button', { class: 'btn grow', onclick: () => manageTasks(ctx) }, ic('list'), 'עריכת משימות')));

  // weekly summaries
  root.append(section('סיכום שבועי'));
  const weeks = Math.ceil(Math.min(idx + 1, prog.length) / 7);
  if (!weeks) root.append(emptyState('chart', 'הסיכום הראשון יופיע בסוף השבוע הראשון.'));
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = weekSummary(addDays(prog.startDate, w * 7));
    const best = ws.days.reduce((a, d) => (d.done > a.done ? d : a), ws.days[0]);
    root.append(h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('b', null, `שבוע ${w + 1}`), h('span', { class: 'tag ' + (ws.pct >= 0.7 ? 'lime' : ws.pct >= 0.4 ? 'amber' : '') }, Math.round(ws.pct * 100) + '%')),
      h('div', { class: 'mt' }, bar(ws.pct)),
      h('div', { class: 'grid3 mt' },
        h('div', { class: 'stat' }, h('div', { class: 'v' }, ws.done), h('div', { class: 'k' }, 'משימות')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, ws.activeDays), h('div', { class: 'k' }, 'ימים פעילים')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, best?.done ? fmtDate(best.key, { weekday: 'short' }) : '—'), h('div', { class: 'k' }, 'היום הכי טוב'))),
      h('p', { class: 'small mt' }, weekMessage(ws))));
  }

  root.append(h('div', { class: 'mt2' }, h('button', {
    class: 'btn ghost block',
    onclick: async () => {
      if (!(await confirmDialog('להתחיל את התוכנית מחדש?', 'יום 1 יהיה היום. ההיסטוריה שלך נשמרת.', { ok: 'להתחיל מחדש' }))) return;
      update((st) => { st.program.startDate = todayKey(); });
      toast('התוכנית התחילה מחדש', 'refresh');
      ctx.go('#/plans');
    },
  }, ic('refresh'), 'להתחיל את התוכנית מחדש')));
  return root;
}

function futureItem(t) {
  return h('div', { class: 'task', style: { opacity: 0.75 } },
    h('span', { class: 'check', style: { borderStyle: 'dashed' } }),
    h('div', { class: 'task-body' }, h('span', { class: 'task-title' }, t.title),
      h('span', { class: 'task-meta' }, t.minutes ? h('span', { class: 'tag' }, ic('clock'), `${t.minutes} דק׳`) : null)));
}

function weekMessage(ws) {
  if (ws.pct >= 0.8) return 'שבוע מעולה! ההרגלים מתחילים להיות טבעיים. אפשר לשקול להעלות קצב.';
  if (ws.pct >= 0.5) return 'שבוע טוב. נסו לזהות איזו משימה הכי קשה לכם ולהזיז אותה לשעה נוחה יותר.';
  if (ws.done > 0) return 'כל התחלה קשה – וכל משימה נחשבת. אולי קצב "רגוע" יתאים יותר לתקופה הזו?';
  return 'שבוע חדש, התחלה חדשה. מתחילים ממשימה אחת קטנה ביום.';
}

function addTask(ctx) {
  let title = '', minutes = 5, noteTxt = '';
  sheet((api) => h('div', null,
    sheetHead('משימה אישית', 'תופיע בכל יום בתוכנית שלך.', api),
    h('label', { class: 'field' }, h('span', null, 'מה המשימה?'), h('input', { class: 'input', maxlength: 60, placeholder: 'לדוגמה: 10 דקות קריאה', oninput: (e) => (title = e.target.value) })),
    h('label', { class: 'field' }, h('span', null, 'זמן משוער (דקות)'), h('input', { class: 'input', type: 'number', min: 1, max: 120, value: 5, oninput: (e) => (minutes = +e.target.value || 5) })),
    h('label', { class: 'field' }, h('span', null, 'הסבר / הערה (לא חובה)'), h('input', { class: 'input', maxlength: 120, oninput: (e) => (noteTxt = e.target.value) })),
    h('button', {
      class: 'btn primary block',
      onclick: () => {
        if (!title.trim()) return toast('צריך לכתוב שם למשימה', 'info');
        update((st) => { st.program.extraTasks.push({ id: 'custom-' + uid(), title: title.trim(), minutes: Math.min(120, Math.max(1, minutes)), note: noteTxt.trim() }); });
        api.close(); toast('המשימה נוספה', 'check'); ctx.refresh();
      },
    }, ic('plus'), 'הוספה')));
}

function manageTasks(ctx) {
  const lib = taskLibrary().filter((t) => t.area !== 'core' || ['learn', 'water', 'teeth'].includes(t.id));
  sheet((api) => {
    const st = getState();
    const hidden = new Set(st.program.hiddenTasks || []);
    return h('div', null,
      sheetHead('עריכת משימות', 'כבו משימות שלא מתאימות לך. הן לא יופיעו בתוכנית.', api),
      st.program.extraTasks.length ? h('div', null, h('h3', { style: { fontSize: '15px' } }, 'המשימות האישיות שלי'),
        h('div', { class: 'list mb' }, st.program.extraTasks.map((t) => h('div', { class: 'list-row' },
          h('div', { class: 'grow' }, h('div', { class: 't' }, t.title), h('div', { class: 'd' }, `${t.minutes} דק׳`)),
          h('button', { class: 'icon-btn', 'aria-label': 'מחיקה', onclick: () => { update((s2) => { s2.program.extraTasks = s2.program.extraTasks.filter((x) => x.id !== t.id); }); api.rebuild(); ctx.refresh(); } }, ic('trash')))))) : null,
      h('h3', { style: { fontSize: '15px' } }, 'משימות התוכנית'),
      h('div', { class: 'list' }, lib.map((t) => h('label', { class: 'list-row', style: { cursor: 'pointer' } },
        h('span', { class: 'ico' }, ic(t.icon || 'check')),
        h('div', { class: 'grow' }, h('div', { class: 't' }, t.title)),
        h('span', { class: 'switch' },
          h('input', { type: 'checkbox', checked: !hidden.has(t.id), 'aria-label': t.title, onchange: (e) => { update((s2) => { const set = new Set(s2.program.hiddenTasks || []); if (e.target.checked) set.delete(t.id); else set.add(t.id); s2.program.hiddenTasks = [...set]; }); ctx.refresh(); } }),
          h('span'))))),
      h('p', { class: 'tiny muted mt' }, 'משימות מוצגות רק בתחומים שבחרת. לשינוי התחומים – הגדרות › פרופיל.'));
  });
}

function editMinutes(ctx) {
  sheet((api) => {
    const st = getState();
    return h('div', null,
      sheetHead('כמה זמן ביום?', 'כמות המשימות תותאם לזמן שתבחר/י.', api),
      h('div', { class: 'chips' }, [10, 20, 30, 45, 60].map((m) => h('button', {
        class: 'chip' + (st.profile.minutes === m ? ' on' : ''),
        onclick: () => { update((s2) => { s2.profile.minutes = m; }); api.close(); toast('עודכן', 'check'); ctx.refresh(); },
      }, `${m} דק׳`))));
  });
}
