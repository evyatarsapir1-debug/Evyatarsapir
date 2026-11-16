// Products guide, shopping list and personal budget tracker.
import { h, ic, sheet, sheetHead, toast, note, emptyState, confirmDialog, bar } from '../ui.js';
import { getState, update, todayKey, uid } from '../store.js';
import { PRODUCT_GROUPS, PRODUCTS, EXPENSE_CATS } from '../data/products.js';
import { topbar, section, fmtDate } from './common.js';

const ils = (n) => `₪${Math.round(n).toLocaleString('he-IL')}`;

export default function products(ctx) {
  const tab = ctx.query.get('tab') || 'guide';
  const root = h('main');
  root.append(topbar('מוצרים ותקציב', { sub: 'לקנות חכם, בלי לבזבז', back: '#/home' }));
  const s = getState();
  const tabs = [['guide', 'מדריך מוצרים'], ['list', `רשימת קניות (${s.shopping.length})`], ['budget', 'תקציב']];
  root.append(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', class: tab === id ? 'on' : '', onclick: () => ctx.go(`#/products?tab=${id}`) }, label))));
  root.append(tab === 'guide' ? guideTab(ctx) : tab === 'list' ? listTab(ctx) : budgetTab(ctx));
  return root;
}

function guideTab(ctx) {
  const group = ctx.query.get('group') || 'skin';
  const s = getState();
  const wrap = h('div');
  wrap.append(h('div', { class: 'chips scroll' }, PRODUCT_GROUPS.map((g) => h('button', { class: 'chip' + (group === g.id ? ' on' : ''), onclick: () => ctx.go(`#/products?tab=guide&group=${g.id}`) }, ic(g.icon), g.label))));
  wrap.append(h('div', { class: 'mt' }, note('אנחנו לא ממליצים על מותגים ולא מקבלים עמלות. מוצר בסיסי וזול יכול להיות יעיל בדיוק כמו יקר – העיקר שיתאים לך.')));
  PRODUCTS.filter((p) => p.group === group).sort((a, b) => a.priority - b.priority).forEach((p) => {
    const inList = s.shopping.includes(p.id);
    wrap.append(h('div', { class: 'card', style: { marginTop: '12px' } },
      h('div', { class: 'row between' }, h('b', null, p.name), h('span', { class: 'tag ' + (p.priority === 1 ? 'lime' : p.priority === 2 ? 'amber' : '') }, p.priority === 1 ? 'בסיסי' : p.priority === 2 ? 'מומלץ' : 'לא חובה')),
      h('p', { class: 'small mt' }, h('b', null, 'למה זה טוב: '), p.use),
      h('p', { class: 'small' }, h('b', null, 'למי מתאים: '), p.for),
      h('div', { class: 'small mt' }, h('b', null, 'מה לבדוק לפני שקונים:'), h('ul', { class: 'dots' }, p.check.map((c) => h('li', null, c)))),
      h('div', { class: 'row between mt' }, h('span', { class: 'tiny muted' }, `טווח מחירים משוער: ${ils(p.price[0])}–${ils(p.price[1])}`),
        h('button', { class: 'btn sm' + (inList ? '' : ' primary'), onclick: () => { update((st) => { st.shopping = inList ? st.shopping.filter((x) => x !== p.id) : [...st.shopping, p.id]; }); toast(inList ? 'הוסר מהרשימה' : 'נוסף לרשימת הקניות', 'bag'); ctx.refresh(); } }, ic(inList ? 'check' : 'plus'), inList ? 'ברשימה' : 'לרשימה'))));
  });
  wrap.append(h('p', { class: 'tiny muted center mt' }, 'המחירים הם הערכה כללית בלבד ומשתנים בין חנויות.'));
  return wrap;
}

function listTab(ctx) {
  const s = getState();
  const items = s.shopping.map((id) => PRODUCTS.find((p) => p.id === id)).filter(Boolean);
  const wrap = h('div');
  if (!items.length) { wrap.append(h('div', { class: 'card' }, emptyState('bag', 'הרשימה ריקה. הוסיפו מוצרים מהמדריך.', h('button', { class: 'btn sm mt', onclick: () => ctx.go('#/products?tab=guide') }, 'למדריך')))); return wrap; }
  const lo = items.reduce((a, p) => a + p.price[0], 0), hi = items.reduce((a, p) => a + p.price[1], 0);
  wrap.append(h('div', { class: 'card hero' }, h('b', null, `${items.length} מוצרים`), h('p', { class: 'small' }, `עלות משוערת: ${ils(lo)}–${ils(hi)}`),
    s.budget.monthly ? h('p', { class: 'small' }, `נשאר בתקציב החודש: ${ils(remaining())}`) : null));
  wrap.append(h('div', { class: 'list mt' }, items.map((p) => h('div', { class: 'list-row' },
    h('div', { class: 'grow' }, h('div', { class: 't' }, p.name), h('div', { class: 'd' }, `${ils(p.price[0])}–${ils(p.price[1])}`)),
    h('button', { class: 'btn sm', onclick: () => expenseSheet(ctx, { note: p.name, category: ['skin', 'hair', 'hygiene', 'clothes', 'acc'].includes(p.group) ? p.group : 'other', fromList: p.id }) }, ic('check'), 'קניתי'),
    h('button', { class: 'icon-btn', 'aria-label': 'הסרה', onclick: () => { update((st) => { st.shopping = st.shopping.filter((x) => x !== p.id); }); ctx.refresh(); } }, ic('x'))))));
  return wrap;
}

function monthKey(k = todayKey()) { return k.slice(0, 7); }
function monthExpenses() { return getState().budget.expenses.filter((e) => monthKey(e.date) === monthKey()); }
function remaining() { return getState().budget.monthly - monthExpenses().reduce((a, e) => a + e.amount, 0); }

function budgetTab(ctx) {
  const s = getState();
  const wrap = h('div');
  const spent = monthExpenses().reduce((a, e) => a + e.amount, 0);
  const monthName = new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  wrap.append(h('div', { class: 'card hero' },
    h('div', { class: 'row between' }, h('b', null, `תקציב ${monthName}`), h('button', { class: 'btn sm', onclick: () => setBudget(ctx) }, ic('edit'), s.budget.monthly ? 'שינוי' : 'הגדרת תקציב')),
    s.budget.monthly
      ? h('div', null,
        h('div', { class: 'row between mt' }, h('span', { class: 'big-num', style: { fontSize: '34px', textAlign: 'start' } }, ils(Math.max(0, s.budget.monthly - spent))), h('span', { class: 'small muted' }, `נשאר מתוך ${ils(s.budget.monthly)}`)),
        h('div', { class: 'mt' }, bar(Math.min(1, spent / s.budget.monthly))),
        spent > s.budget.monthly ? h('div', { class: 'mt' }, note(`חרגת מהתקציב ב-${ils(spent - s.budget.monthly)}. זה קורה – אפשר לתכנן את החודש הבא בהתאם.`, 'warn')) : null)
      : h('p', { class: 'small mt' }, 'הגדירו סכום חודשי לטיפוח, בגדים ושאר הוצאות הגלואו אפ – ותעקבו כמה נשאר.')));
  wrap.append(h('button', { class: 'btn primary block mt', onclick: () => expenseSheet(ctx) }, ic('plus'), 'הוספת הוצאה'));
  // by category
  const byCat = EXPENSE_CATS.map((c) => ({ ...c, sum: monthExpenses().filter((e) => e.category === c.id).reduce((a, e) => a + e.amount, 0) })).filter((c) => c.sum > 0);
  if (byCat.length) {
    wrap.append(section('לפי קטגוריה – החודש'));
    wrap.append(h('div', { class: 'card' }, byCat.sort((a, b) => b.sum - a.sum).map((c) => h('div', { style: { marginBottom: '12px' } },
      h('div', { class: 'row between small' }, h('span', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'swatch', style: { background: c.color, width: '10px', height: '10px' } }), c.label), h('b', null, ils(c.sum))),
      h('div', { style: { marginTop: '6px' } }, bar(c.sum / spent))))));
  }
  wrap.append(section('הוצאות אחרונות'));
  const all = [...s.budget.expenses].sort((a, b) => (a.date < b.date ? 1 : -1));
  wrap.append(all.length ? h('div', { class: 'list' }, all.slice(0, 50).map((e) => {
    const c = EXPENSE_CATS.find((x) => x.id === e.category) || EXPENSE_CATS[6];
    return h('div', { class: 'list-row' },
      h('span', { class: 'ico', style: { color: c.color, background: c.color + '22' } }, ic(c.icon)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, e.note || c.label), h('div', { class: 'd' }, `${fmtDate(e.date)} · ${c.label}`)),
      h('b', null, ils(e.amount)),
      h('button', { class: 'icon-btn', 'aria-label': 'מחיקה', onclick: async () => { if (await confirmDialog('למחוק את ההוצאה?', `${e.note || c.label} – ${ils(e.amount)}`, { ok: 'מחיקה', danger: true })) { update((st) => { st.budget.expenses = st.budget.expenses.filter((x) => x.id !== e.id); }); ctx.refresh(); } } }, ic('trash')));
  })) : h('div', { class: 'card' }, emptyState('wallet', 'אין הוצאות עדיין.')));
  wrap.append(h('div', { class: 'mt' }, note('טיפ: לפני קנייה – לשאול "האם אני צריך/ה את זה, או שזה רק נראה טוב בפרסומת?". מוצרי בסיס קודם, תוספות אחר כך.')));
  return wrap;
}

function setBudget(ctx) {
  let v = getState().budget.monthly || 200;
  sheet((api) => h('div', null,
    sheetHead('תקציב חודשי', 'כמה מתוכנן להוציא בחודש על טיפוח, בגדים ואביזרים?', api),
    h('label', { class: 'field' }, h('span', null, 'סכום (₪)'), h('input', { class: 'input', type: 'number', min: 0, max: 100000, value: v, oninput: (e) => (v = +e.target.value) })),
    h('div', { class: 'chips mb' }, [100, 200, 300, 500].map((n) => h('button', { class: 'chip', onclick: () => { update((s) => { s.budget.monthly = n; }); api.close(); ctx.refresh(); } }, ils(n)))),
    h('button', { class: 'btn primary block', onclick: () => { if (!(v >= 0)) return toast('סכום לא תקין', 'info'); update((s) => { s.budget.monthly = Math.round(v); }); api.close(); toast('התקציב נשמר', 'wallet'); ctx.refresh(); } }, ic('check'), 'שמירה')));
}

function expenseSheet(ctx, pre = {}) {
  const e = { id: uid(), amount: '', category: pre.category || 'skin', note: pre.note || '', date: todayKey() };
  sheet((api) => h('div', null,
    sheetHead('הוצאה חדשה', null, api),
    h('label', { class: 'field' }, h('span', null, 'סכום (₪)'), h('input', { class: 'input', type: 'number', min: 0, step: 0.5, inputmode: 'decimal', oninput: (ev) => (e.amount = ev.target.value) })),
    h('label', { class: 'field' }, h('span', null, 'על מה?'), h('input', { class: 'input', value: e.note, maxlength: 50, 'data-no-autofocus': '1', oninput: (ev) => (e.note = ev.target.value) })),
    h('div', { class: 'field' }, h('span', null, 'קטגוריה'), h('div', { class: 'chips' }, EXPENSE_CATS.map((c) => h('button', { class: 'chip' + (e.category === c.id ? ' on' : ''), onclick: (ev) => { e.category = c.id; ev.currentTarget.parentNode.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); ev.currentTarget.classList.add('on'); } }, ic(c.icon), c.label)))),
    h('label', { class: 'field' }, h('span', null, 'תאריך'), h('input', { class: 'input', type: 'date', value: e.date, max: todayKey(), onchange: (ev) => (e.date = ev.target.value || todayKey()) })),
    h('button', { class: 'btn primary block', onclick: () => {
      const amount = parseFloat(e.amount);
      if (!(amount > 0)) return toast('צריך סכום גדול מ-0', 'info');
      update((s) => { s.budget.expenses.push({ ...e, amount, note: e.note.trim() }); if (pre.fromList) s.shopping = s.shopping.filter((x) => x !== pre.fromList); });
      api.close(); toast('ההוצאה נשמרה', 'wallet'); ctx.refresh();
    } }, ic('check'), 'שמירה')));
}
