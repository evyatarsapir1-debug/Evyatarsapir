// Guide article viewer + "learn" index of all guides.
import { h, ic, rich, note, listRow, emptyState } from '../ui.js';
import { GUIDE, GUIDES } from '../data/guides.js';
import { topbar, section } from './common.js';

const AREA_NAMES = { skin: 'עור', face: 'מראה הפנים', hair: 'שיער', nutrition: 'תזונה', style: 'סטייל', sleep: 'שינה ושגרה', posture: 'יציבה', core: 'מיינדסט ובטיחות' };
const AREA_BACK = { skin: '#/care?tab=skin', face: '#/care?tab=face', hair: '#/hair?tab=guides', nutrition: '#/nutrition', style: '#/style?tab=guides', sleep: '#/routine', posture: '#/fitness', core: '#/learn' };

export default function guide(ctx) {
  const g = GUIDE[ctx.params[0]];
  const root = h('main');
  if (!g) {
    root.append(topbar('מדריך', { back: '#/learn' }), emptyState('info', 'המדריך לא נמצא.'));
    return root;
  }
  root.append(topbar(g.title, { sub: `${AREA_NAMES[g.area]} · ${g.read} דק׳ קריאה`, back: AREA_BACK[g.area] }));
  root.append(h('div', { class: 'card hero' }, h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('span', { class: 'ibox' }, ic(g.icon)), h('p', { class: 'grow', style: { color: 'var(--text)' } }, g.summary))));
  for (const sec of g.sections) {
    if (sec.note) { root.append(h('div', { class: 'mt' }, note(sec.note, sec.kind))); continue; }
    const card = h('div', { class: 'card', style: { marginTop: '12px' } }, h('h3', null, sec.h));
    if (sec.p) card.append(h('p', null, rich(sec.p)));
    if (sec.list) card.append(h('ul', { class: 'dots' }, sec.list.map((li) => h('li', null, rich(li)))));
    if (sec.steps) card.append(h('ol', { class: 'steps' }, sec.steps.map((li) => h('li', null, rich(li)))));
    root.append(card);
  }
  root.append(h('p', { class: 'tiny muted mt2 center' }, 'מידע כללי לחינוך ולמודעות בלבד, ואינו תחליף לייעוץ רפואי או מקצועי אישי.'));
  root.append(h('div', { class: 'row mt' },
    h('button', { class: 'btn grow', onclick: () => ctx.go(`#/coach?q=${encodeURIComponent('יש לי שאלה על ' + g.title)}`) }, ic('bot'), 'לשאול את המאמן')));
  const related = GUIDES.filter((x) => x.area === g.area && x.id !== g.id).slice(0, 3);
  if (related.length) {
    root.append(section('עוד בנושא'));
    root.append(h('div', { class: 'list' }, related.map((r) => listRow({ icon: r.icon, title: r.title, desc: `${r.read} דק׳`, onclick: () => ctx.go('#/guide/' + r.id) }))));
  }
  return root;
}

export function learn(ctx) {
  const root = h('main');
  root.append(topbar('מדריכים', { sub: `${GUIDES.length} מדריכים קצרים וברורים`, back: '#/home' }));
  const q = h('input', { class: 'input', type: 'search', placeholder: 'חיפוש מדריך…', 'aria-label': 'חיפוש', oninput: () => draw() });
  const list = h('div');
  const draw = () => {
    const term = q.value.trim();
    list.replaceChildren();
    for (const area of Object.keys(AREA_NAMES)) {
      const items = GUIDES.filter((g) => g.area === area && (!term || g.title.includes(term) || g.summary.includes(term)));
      if (!items.length) continue;
      list.append(section(AREA_NAMES[area]));
      list.append(h('div', { class: 'list' }, items.map((g) => listRow({ icon: g.icon, title: g.title, desc: g.summary, onclick: () => ctx.go('#/guide/' + g.id) }))));
    }
    if (!list.children.length) list.append(emptyState('search', 'לא נמצאו מדריכים.'));
  };
  root.append(q, list);
  draw();
  return root;
}
