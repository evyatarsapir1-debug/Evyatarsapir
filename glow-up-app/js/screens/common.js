// Shared screen building blocks.
import { h, ic, sheet, sheetHead, toast, burst, note } from '../ui.js';
import { update, todayKey, getState } from '../store.js';
import { setTaskDone } from '../plan.js';

export function topbar(title, { sub, back, actions = [] } = {}) {
  return h('header', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn flip', 'aria-label': 'חזרה', onclick: () => goBack(back) }, ic('back')) : null,
    h('h1', null, title, sub ? h('span', { class: 'sub' }, sub) : null),
    ...actions);
}

/** Back: use in-app history when there is some, otherwise go to the parent screen. */
export function goBack(parent = '#/home') {
  if ((window.__glowNav || 0) > 0) { window.__glowNav -= 2; history.back(); }
  else location.hash = typeof parent === 'string' ? parent : '#/home';
}

export function section(title, linkText, onLink) {
  return h('div', { class: 'section' }, h('h2', null, title), linkText ? h('button', { class: 'link', onclick: onLink }, linkText) : null);
}

const AREA_TAG = { skin: ['טיפוח', 'purple'], hair: ['שיער', 'cyan'], fitness: ['כושר', 'lime'], posture: ['יציבה', 'lime'], nutrition: ['תזונה', 'amber'], style: ['סטייל', 'pink'], sleep: ['שינה', 'cyan'], hygiene: ['רעננות', 'cyan'], core: ['בסיס', ''], custom: ['אישי', 'pink'] };

/** A checkable task row. onChange(newValue) is called after state update. */
export function taskItem(task, { key = todayKey(), onChange } = {}) {
  const done = !!getState().days[key]?.done?.[task.id];
  const isRest = task.id === 'rest';
  const [tagLabel, tagCls] = AREA_TAG[task.area] || ['', ''];
  const check = h('button', {
    class: 'check' + (done ? ' on' : ''), 'aria-label': done ? 'בטל סימון' : 'סמן כהושלם', 'aria-pressed': done ? 'true' : 'false',
    'data-task': task.id,
    onclick: (e) => {
      if (isRest) return openTask(task, { key, onChange });
      const nv = !done;
      update(() => setTaskDone(task, nv, key));
      if (nv) {
        const r = e.currentTarget.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2);
        toast(cheer(), 'check');
      }
      onChange && onChange(nv);
    },
  }, ic(isRest ? 'heart' : 'check'));
  if (isRest) { check.classList.add('on'); }
  return h('div', { class: 'task' + (done ? ' done' : '') },
    check,
    h('button', { class: 'task-body', onclick: () => openTask(task, { key, onChange }) },
      h('span', { class: 'task-title' }, task.title),
      h('span', { class: 'task-meta' },
        tagLabel ? h('span', { class: 'tag ' + tagCls }, tagLabel) : null,
        task.minutes ? h('span', { class: 'tag' }, ic('clock'), `${task.minutes} דק׳`) : null,
        h('span', { class: 'tag' }, ic('info'), 'הסבר'))));
}

const CHEERS = ['כל הכבוד! 💜', 'עוד צעד קדימה ✨', 'מעולה, ממשיכים!', 'יש! הרגל נבנה', 'אלוף/ה! 🔥', 'ככה בונים גלואו אפ'];
export const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];

/** Bottom sheet explaining a task step by step. */
export function openTask(task, { key = todayKey(), onChange } = {}) {
  sheet((api) => {
    const done = !!getState().days[key]?.done?.[task.id];
    return h('div', null,
      sheetHead(task.title, task.why, api),
      h('div', { class: 'row wrap mb' },
        task.minutes ? h('span', { class: 'tag purple' }, ic('clock'), `זמן משוער: ${task.minutes} דק׳`) : null),
      task.steps?.length ? h('div', null, h('h3', { style: { margin: '6px 0 0', fontSize: '15px' } }, 'צעד אחר צעד'), h('ol', { class: 'steps' }, task.steps.map((s) => h('li', null, s)))) : null,
      task.id === 'workout' ? note('אם משהו כואב (כאב חד או במפרק) – לעצור. עדיף לדלג על תרגיל מאשר להיפצע.', 'warn') : null,
      h('div', { class: 'row mt2' },
        task.link ? h('button', { class: 'btn grow', onclick: () => { api.close(); location.hash = task.link; } }, ic('chevron'), task.id === 'workout' ? 'לאימון המלא' : 'למדריך המלא') : null,
        task.id === 'rest' ? null : h('button', {
          class: 'btn grow ' + (done ? '' : 'primary'),
          onclick: () => {
            update(() => setTaskDone(task, !done, key));
            if (!done) toast(cheer(), 'check');
            api.close();
            onChange && onChange(!done);
          },
        }, ic(done ? 'refresh' : 'check'), done ? 'בטל סימון' : 'סימון כהושלם')));
  });
}

export function areaColor(area) {
  return { skin: '#c084fc', hair: '#22d3ee', fitness: '#a3e635', nutrition: '#fbbf24', style: '#f472b6', sleep: '#60a5fa', posture: '#34d399', hygiene: '#67e8f9', core: '#a78bfa' }[area] || '#a78bfa';
}

export function fmtDate(key, opts = { weekday: 'short', day: 'numeric', month: 'numeric' }) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', opts);
}

export function say(m, f, n) {
  const a = getState().profile?.address;
  if (a === 'f') return f;
  if (a === 'm') return m;
  return n ?? m;
}
