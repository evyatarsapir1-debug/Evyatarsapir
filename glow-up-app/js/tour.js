// Interactive first-run tour: spotlight + arrow + short explanation. Skippable, replayable.
import { h, ic } from './ui.js';
import { getState, update } from './store.js';

const STEPS = [
  { hash: '#/home', sel: '[data-tour="hero"]', title: '1. מסך הבית', text: 'כאן רואים את התוכנית של היום: באיזה יום ושלב את/ה, ואחוז ההשלמה. גוללים למטה לטיפ היומי, להתקדמות השבועית ולקיצורי הדרך לכל התחומים.' },
  { hash: '#/plans', sel: '[data-tour="programs"]', title: '2. בונים תוכנית', text: 'בוחרים מסלול של 7, 30 או 90 ימים וקצב שמתאים לך. אפשר להוסיף משימות אישיות, לכבות משימות ולראות סיכום שבועי.' },
  { hash: '#/home', sel: '[data-tour="tasks"] .task', title: '3. מסמנים משימה', text: 'לחיצה על העיגול מסמנת שהמשימה הושלמה. לחיצה על שם המשימה פותחת הסבר צעד אחר צעד וזמן משוער.' },
  { hash: '#/home', sel: '.nav [data-tab="coach"]', title: '4. המאמן האישי', text: 'שואלים כל שאלה – טיפוח, תספורת, אימון, לוק או התמדה. אפשר לחבר מאמן AI אמיתי (Claude) בהגדרות; בלי חיבור הוא עובד כמדריך מובנה.' },
  { hash: '#/fitness?tab=library', sel: '[data-tour="ex-library"]', title: '5. מוצאים תרגילים', text: 'בספריית התרגילים מסננים לפי שריר ורמה. בכל תרגיל יש הדגמה מונפשת, הסבר, טעויות נפוצות והתאמות.' },
  { hash: '#/care', sel: '[data-tour="skin-routine"]', title: '6. שגרת טיפוח', text: 'מסמנים כל צעד בשגרת הבוקר והערב, מוסיפים את המוצרים שלך ועוקבים אחרי ההיסטוריה.' },
  { hash: '#/style', sel: '[data-tour="style-tabs"]', title: '7. יוצרים לוקים', text: 'מוסיפים בגדים לארון הדיגיטלי (תמונה לא חובה), והסטייליסט מציע שילובים רק ממה שיש לך. את הלוקים האהובים שומרים.' },
  { hash: '#/progress', sel: '[data-tour="progress"]', title: '8. עוקבים אחרי ההתקדמות', text: 'רצף התמדה, משימות, הרגלים, היסטוריית אימונים וטיפוח והישגים. בלי ציונים ובלי השוואות – רק את/ה מול עצמך.' },
];

let layer = null;

export function maybeStartTour(force) {
  const s = getState();
  if (!s.onboarded || (s.tourDone && !force)) return;
  if (force || !s.tourDone) startTour();
}

export function startTour() {
  endTour(false);
  let i = 0;
  layer = h('div', { class: 'tour-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'הדרכה' });
  const hole = h('div', { class: 'tour-hole' });
  const arrow = h('div', { class: 'tour-arrow', html: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22 3 10h6V2h6v8h6z"/></svg>' });
  const tip = h('div', { class: 'tour-tip' });
  layer.append(hole, arrow, tip);
  document.body.appendChild(layer);
  const onKey = (e) => { if (e.key === 'Escape') endTour(true); if (e.key === 'ArrowLeft') go(i + 1); if (e.key === 'ArrowRight') go(i - 1); };
  document.addEventListener('keydown', onKey);
  layer._off = () => document.removeEventListener('keydown', onKey);
  const onResize = () => place();
  window.addEventListener('resize', onResize);
  layer._offResize = () => window.removeEventListener('resize', onResize);

  let target = null;
  function place() {
    if (!layer) return;
    const vh = window.innerHeight;
    if (!target || !target.isConnected) { hole.style.cssText = 'top:50%;left:50%;width:0;height:0'; arrow.style.display = 'none'; tip.style.top = '30%'; tip.style.bottom = 'auto'; return; }
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(hole.style, { top: r.top - pad + 'px', left: r.left - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    arrow.style.display = '';
    const below = r.top + r.height / 2 < vh / 2;
    const cx = r.left + r.width / 2 - 15;
    if (below) {
      arrow.style.top = r.bottom + 10 + 'px'; arrow.style.left = cx + 'px'; arrow.style.transform = 'rotate(180deg)';
      tip.style.top = Math.min(vh - 230, r.bottom + 48) + 'px'; tip.style.bottom = 'auto';
    } else {
      arrow.style.top = r.top - 42 + 'px'; arrow.style.left = cx + 'px'; arrow.style.transform = 'none';
      tip.style.bottom = Math.min(vh - 230, vh - r.top + 48) + 'px'; tip.style.top = 'auto';
    }
  }

  async function go(n) {
    if (n < 0) return;
    if (n >= STEPS.length) return endTour(true);
    i = n;
    const st = STEPS[i];
    if (location.hash !== st.hash) location.hash = st.hash;
    tip.replaceChildren(h('div', { class: 'tiny muted' }, 'טוען…'));
    target = await waitFor(st.sel);
    if (!layer) return;
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
      await new Promise((r) => setTimeout(r, 120));
    }
    tip.replaceChildren(
      h('h3', null, st.title),
      h('p', null, st.text),
      h('div', { class: 'row between' },
        h('div', { class: 'tour-dots' }, STEPS.map((_, k) => h('i', { class: k === i ? 'on' : '' }))),
        h('div', { class: 'row', style: { gap: '6px' } },
          h('button', { class: 'btn sm ghost', 'data-tour-skip': '', onclick: () => endTour(true) }, 'דילוג'),
          i > 0 ? h('button', { class: 'btn sm', onclick: () => go(i - 1) }, 'הקודם') : null,
          h('button', { class: 'btn sm primary', 'data-tour-next': '', onclick: () => go(i + 1) }, i === STEPS.length - 1 ? 'סיום' : 'הבא'))));
    place();
  }
  go(0);
}

function waitFor(sel, timeout = 2500) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const loop = () => {
      const el = document.querySelector(sel);
      if (el && el.getBoundingClientRect().height > 0) return resolve(el);
      if (performance.now() - t0 > timeout) return resolve(null);
      setTimeout(loop, 60);
    };
    setTimeout(loop, 80);
  });
}

export function endTour(markDone) {
  if (layer) { layer._off?.(); layer._offResize?.(); layer.remove(); layer = null; }
  if (markDone) {
    update((s) => { s.tourDone = true; });
    if (!location.hash.startsWith('#/home')) location.hash = '#/home';
  }
}
