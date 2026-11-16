// Face & skincare: routine tracker (AM/PM), my products, skin + face guides.
import { h, ic, sheet, sheetHead, toast, confirmDialog, emptyState, note, listRow, burst } from '../ui.js';
import { getState, update, todayKey, addDays, day, uid } from '../store.js';
import { guidesByArea } from '../data/guides.js';
import { SKIN_TYPES, labelOf } from '../data/profile.js';
import { topbar, section, fmtDate, cheer } from './common.js';

const TYPES = [
  { id: 'cleanser', label: 'ניקוי' }, { id: 'moisturizer', label: 'לחות' }, { id: 'spf', label: 'קרם הגנה' },
  { id: 'treatment', label: 'טיפולי (למשל לפצעונים)' }, { id: 'other', label: 'אחר' },
];

export function skinSteps(slot) {
  const mine = getState().myProducts || [];
  const named = (type) => mine.filter((p) => p.type === type && p[slot]).map((p) => p.name).join(' / ');
  const base = slot === 'am'
    ? [{ id: 'cleanse', label: 'ניקוי פנים', type: 'cleanser', hint: 'מים פושרים או ניקוי עדין', guide: 'cleanser' },
      { id: 'moist', label: 'קרם לחות', type: 'moisturizer', hint: 'כמות בגודל אפונה', guide: 'moisturizer' },
      { id: 'spf', label: 'קרם הגנה SPF 30+', type: 'spf', hint: 'שתי אצבעות לפנים ולצוואר', guide: 'spf' }]
    : [{ id: 'cleanse', label: 'ניקוי פנים', type: 'cleanser', hint: 'להסיר קרם הגנה ולכלוך מהיום', guide: 'cleanser' },
      { id: 'moist', label: 'קרם לחות', type: 'moisturizer', hint: 'שכבה דקה', guide: 'moisturizer' }];
  const treat = mine.filter((p) => (p.type === 'treatment' || p.type === 'other') && p[slot]);
  const steps = base.map((b) => ({ ...b, product: named(b.type) }));
  treat.forEach((p) => steps.splice(slot === 'am' ? steps.length - 1 : 1, 0, { id: 'p-' + p.id, label: p.name, type: p.type, hint: p.type === 'treatment' ? 'מוצר טיפולי – לפי ההוראות' : '' }));
  return steps;
}

function routineCard(slot, ctx) {
  const key = todayKey();
  const steps = skinSteps(slot);
  const taskId = slot === 'am' ? 'skin-am' : 'skin-pm';
  const wrap = h('div', { class: 'card' });
  const draw = () => {
    const d = getState().days[key] || {};
    const allDone = !!d.done?.[taskId];
    const checked = (id) => allDone || (d.skin?.[slot] || []).includes(id);
    const n = steps.filter((st) => checked(st.id)).length;
    wrap.replaceChildren(
      h('div', { class: 'row between mb' },
        h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic(slot === 'am' ? 'sun' : 'moon')), h('div', null, h('b', null, slot === 'am' ? 'שגרת בוקר' : 'שגרת ערב'), h('div', { class: 'tiny muted' }, `${n}/${steps.length} צעדים`))),
        allDone ? h('span', { class: 'tag lime' }, ic('check'), 'הושלם') : null),
      ...steps.map((st) => h('div', { class: 'task' + (checked(st.id) ? ' done' : '') },
        h('button', {
          class: 'check' + (checked(st.id) ? ' on' : ''), 'aria-label': st.label, 'aria-pressed': checked(st.id) ? 'true' : 'false',
          onclick: (e) => {
            const was = checked(st.id);
            update(() => {
              const dd = day(key);
              let list = dd.done[taskId] ? steps.map((x) => x.id) : [...(dd.skin[slot] || [])].filter((x) => x !== 'done');
              list = was ? list.filter((x) => x !== st.id) : [...new Set([...list, st.id])];
              dd.skin[slot] = list;
              const complete = steps.every((x) => list.includes(x.id));
              if (complete) dd.done[taskId] = true; else delete dd.done[taskId];
            });
            if (!was) { const r = e.currentTarget.getBoundingClientRect(); burst(r.left + 15, r.top + 15); }
            if (!was && steps.every((x) => (getState().days[key].skin[slot] || []).includes(x.id))) toast(`${slot === 'am' ? 'שגרת הבוקר' : 'שגרת הערב'} הושלמה! ${cheer()}`, 'sparkles');
            draw();
          },
        }, ic('check')),
        h('button', { class: 'task-body', onclick: () => st.guide && ctx.go('#/guide/' + st.guide) },
          h('span', { class: 'task-title' }, st.label),
          h('span', { class: 'tiny muted' }, st.product ? `המוצר שלך: ${st.product}` : st.hint)))),
    );
  };
  draw();
  return wrap;
}

function history14() {
  const s = getState();
  const key = todayKey();
  const cells = [];
  let both = 0;
  for (let i = 13; i >= 0; i--) {
    const k = addDays(key, -i);
    const d = s.days[k]?.done || {};
    const n = (d['skin-am'] ? 1 : 0) + (d['skin-pm'] ? 1 : 0);
    if (n === 2) both++;
    cells.push(h('div', { style: { textAlign: 'center' } },
      h('div', { style: { display: 'grid', gap: '3px' } },
        h('i', { title: 'בוקר', style: { display: 'block', height: '12px', borderRadius: '4px', background: d['skin-am'] ? 'var(--amber)' : 'var(--surface-2)' } }),
        h('i', { title: 'ערב', style: { display: 'block', height: '12px', borderRadius: '4px', background: d['skin-pm'] ? 'var(--purple-2)' : 'var(--surface-2)' } })),
      h('div', { class: 'tiny muted', style: { fontSize: '10px', marginTop: '3px' } }, fmtDate(k, { day: 'numeric' }))));
  }
  return h('div', { class: 'card' },
    h('div', { class: 'row between mb' }, h('b', null, 'מעקב 14 ימים אחרונים'), h('span', { class: 'tag purple' }, `${both} ימים מלאים`)),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(14,1fr)', gap: '3px' } }, cells),
    h('div', { class: 'legend mt' }, h('span', null, h('i', { style: { background: 'var(--amber)' } }), 'בוקר'), h('span', null, h('i', { style: { background: 'var(--purple-2)' } }), 'ערב')));
}

function myProductsCard(ctx) {
  const mine = getState().myProducts || [];
  return h('div', null,
    section('המוצרים שלי', 'הוספה', () => productSheet(null, ctx)),
    mine.length
      ? h('div', { class: 'list' }, mine.map((p) => listRow({
        icon: p.type === 'spf' ? 'sun' : p.type === 'cleanser' ? 'droplet' : p.type === 'treatment' ? 'target' : 'sparkles',
        title: p.name,
        desc: `${labelOf(TYPES, p.type)} · ${[p.am && 'בוקר', p.pm && 'ערב'].filter(Boolean).join(' + ') || 'לא בשגרה'}`,
        onclick: () => productSheet(p, ctx),
      })))
      : h('div', { class: 'card' }, emptyState('sparkles', 'עדיין לא הוספת מוצרים. אפשר להוסיף את המוצרים שיש לך – והם יופיעו בשגרה.',
        h('button', { class: 'btn sm mt', onclick: () => productSheet(null, ctx) }, ic('plus'), 'הוספת מוצר'))));
}

function productSheet(existing, ctx) {
  const p = existing ? { ...existing } : { id: uid(), name: '', type: 'cleanser', am: true, pm: true };
  sheet((api) => h('div', null,
    sheetHead(existing ? 'עריכת מוצר' : 'מוצר חדש', 'לבנות שגרת טיפוח עם המוצרים שיש לך.', api),
    h('label', { class: 'field' }, h('span', null, 'שם המוצר'), h('input', { class: 'input', value: p.name, maxlength: 50, placeholder: 'לדוגמה: ג׳ל ניקוי עדין', oninput: (e) => (p.name = e.target.value) })),
    h('div', { class: 'field' }, h('span', null, 'סוג'), h('div', { class: 'chips' }, TYPES.map((t) => h('button', { class: 'chip' + (p.type === t.id ? ' on' : ''), onclick: (e) => { p.type = t.id; e.target.parentNode.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.target.classList.add('on'); } }, t.label)))),
    h('div', { class: 'field' }, h('span', null, 'מתי משתמשים'), h('div', { class: 'chips' },
      h('button', { class: 'chip' + (p.am ? ' on' : ''), onclick: (e) => { p.am = !p.am; e.target.classList.toggle('on'); } }, ic('sun'), 'בוקר'),
      h('button', { class: 'chip' + (p.pm ? ' on' : ''), onclick: (e) => { p.pm = !p.pm; e.target.classList.toggle('on'); } }, ic('moon'), 'ערב'))),
    p.type === 'treatment' ? note('מוצר טיפולי אחד בכל פעם, להתחיל 2-3 פעמים בשבוע. צריבה חזקה או פריחה – להפסיק ולהתייעץ.', 'warn') : null,
    h('div', { class: 'row mt' },
      existing ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('למחוק את המוצר?', p.name, { ok: 'מחיקה', danger: true })) { update((s) => { s.myProducts = s.myProducts.filter((x) => x.id !== p.id); }); api.close(); ctx.refresh(); } } }, ic('trash')) : null,
      h('button', {
        class: 'btn primary grow',
        onclick: () => {
          if (!p.name.trim()) return toast('צריך שם למוצר', 'info');
          update((s) => { const i = s.myProducts.findIndex((x) => x.id === p.id); if (i >= 0) s.myProducts[i] = p; else s.myProducts.push(p); });
          api.close(); toast('נשמר', 'check'); ctx.refresh();
        },
      }, ic('check'), 'שמירה'))));
}

export default function care(ctx) {
  const tab = ctx.query.get('tab') || 'routine';
  const s = getState();
  const root = h('main');
  root.append(topbar('פנים וטיפוח', { sub: `סוג עור: ${labelOf(SKIN_TYPES, s.profile.skinType) || 'לא הוגדר'}`, actions: [h('button', { class: 'icon-btn', 'aria-label': 'שיער ותספורות', onclick: () => ctx.go('#/hair') }, ic('scissors'))] }));
  const tabs = [['routine', 'השגרה שלי'], ['skin', 'מדריכי עור'], ['face', 'מראה הפנים']];
  root.append(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', class: tab === id ? 'on' : '', onclick: () => ctx.go(`#/care?tab=${id}`) }, label))));

  if (tab === 'routine') {
    root.append(h('div', { 'data-tour': 'skin-routine' }, routineCard('am', ctx), routineCard('pm', ctx)));
    root.append(section('היסטוריית טיפוח'));
    root.append(history14());
    root.append(myProductsCard(ctx));
    root.append(section('קיצורי דרך'));
    root.append(h('div', { class: 'grid2' },
      ...[['acne', 'face', 'מדריך פצעונים'], ['spf', 'sun', 'קרם הגנה'], ['routine-build', 'list', 'בניית שגרה'], ['products-check', 'search', 'לפני שקונים']].map(([id, icon, label]) =>
        h('button', { class: 'card tap', onclick: () => ctx.go('#/guide/' + id) }, h('span', { class: 'ibox' }, ic(icon)), h('b', { style: { display: 'block', marginTop: '8px' } }, label)))));
    root.append(h('div', { class: 'mt' }, h('button', { class: 'btn block', onclick: () => ctx.go('#/hair') }, ic('scissors'), 'שיער ותספורות')));
  } else {
    const list = guidesByArea(tab === 'skin' ? 'skin' : 'face');
    if (tab === 'face') root.append(note('המדריכים כאן מסבירים ומלמדים – בלי ציונים, בלי דירוג ובלי השוואות. כל פנים שונות, וזה בדיוק בסדר.'));
    root.append(h('div', { class: 'list mt' }, list.map((g) => listRow({ icon: g.icon, title: g.title, desc: `${g.summary} · ${g.read} דק׳ קריאה`, onclick: () => ctx.go('#/guide/' + g.id) }))));
    if (tab === 'skin') root.append(h('div', { class: 'mt' }, h('button', { class: 'btn block', onclick: () => ctx.go('#/products?group=skin') }, ic('bag'), 'מדריך מוצרי טיפוח')));
  }
  return root;
}
