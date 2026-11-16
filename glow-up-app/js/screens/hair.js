// Hair: haircut library (with saved favourites), choosing guide, products, routine.
import { h, ic, toast, listRow, note, emptyState, chips } from '../ui.js';
import { getState, update } from '../store.js';
import { HAIRCUTS, CUT, haircutSVG, HAIR_COLORS, FACE_SHAPES } from '../data/haircuts.js';
import { HAIR_TYPES, labelOf } from '../data/profile.js';
import { guidesByArea } from '../data/guides.js';
import { topbar, section } from './common.js';

const LEN = { short: 'קצר', medium: 'בינוני', long: 'ארוך' };

function hairColor() {
  const id = getState().profile.hairColor || 'brown';
  return (HAIR_COLORS.find((c) => c.id === id) || HAIR_COLORS[1]).c;
}

function toggleSave(id) {
  let saved;
  update((s) => {
    saved = !s.savedCuts.includes(id);
    s.savedCuts = saved ? [...s.savedCuts, id] : s.savedCuts.filter((x) => x !== id);
  });
  toast(saved ? 'נשמר לתסרוקות שאהבת' : 'הוסר מהשמורים', saved ? 'bookmark' : 'x');
  return saved;
}

function recommend(cut) {
  const p = getState().profile;
  let score = 0;
  if (p.faceShape && cut.face.includes(p.faceShape)) score += 2;
  if (p.hairType && cut.hair.includes(p.hairType)) score += 2;
  if (p.minutes <= 10 && cut.styleMin <= 3) score += 1;
  return score;
}

function cutCard(cut, ctx) {
  const saved = getState().savedCuts.includes(cut.id);
  const btn = h('button', { class: 'save' + (saved ? ' on' : ''), 'aria-label': saved ? 'הסרה מהשמורים' : 'שמירה', 'aria-pressed': saved ? 'true' : 'false',
    onclick: (e) => { e.stopPropagation(); const v = toggleSave(cut.id); btn.classList.toggle('on', v); btn.setAttribute('aria-pressed', v ? 'true' : 'false'); } }, ic('bookmark'));
  const media = h('div', { class: 'media', html: haircutSVG(cut, { hairColor: hairColor() }) });
  const rec = recommend(cut) >= 4;
  return h('div', { class: 'cut-card', role: 'button', tabindex: 0, onclick: () => ctx.go('#/cut/' + cut.id), onkeydown: (e) => { if (e.key === 'Enter') ctx.go('#/cut/' + cut.id); } },
    btn, media,
    h('div', { class: 'info' }, h('b', null, cut.name), h('div', { class: 'row wrap', style: { gap: '4px', marginTop: '4px' } },
      h('span', { class: 'tag' }, LEN[cut.length]),
      rec ? h('span', { class: 'tag purple' }, ic('star'), 'מתאים לך') : null)));
}

export default function hair(ctx) {
  const tab = ctx.query.get('tab') || 'library';
  const s = getState();
  const root = h('main');
  root.append(topbar('שיער ותספורות', { sub: `סוג שיער: ${labelOf(HAIR_TYPES, s.profile.hairType) || 'לא הוגדר'}`, back: '#/care' }));
  const tabs = [['library', 'ספריית תספורות'], ['saved', `שמורים (${s.savedCuts.length})`], ['guides', 'מדריכים ושגרה']];
  root.append(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', class: tab === id ? 'on' : '', onclick: () => ctx.go(`#/hair?tab=${id}`) }, label))));

  if (tab === 'library') {
    const filter = ctx.query.get('len') || 'all';
    // personalisation controls
    root.append(h('div', { class: 'card' },
      h('b', null, 'התאמה אישית'),
      h('p', { class: 'small muted' }, 'בחירת צורת פנים (לא חובה) מסמנת תספורות שמתאימות לך. לא בטוח/ה? ', h('a', { href: '#/guide/face-shape' }, 'איך לזהות')),
      h('div', { class: 'mt' }, chips(FACE_SHAPES, s.profile.faceShape, (v) => { update((st) => { st.profile.faceShape = st.profile.faceShape === v ? null : v; }); ctx.refresh(); }, { multi: false })),
      h('div', { class: 'row mt', style: { gap: '8px' } }, h('span', { class: 'small muted' }, 'צבע שיער בתצוגה:'),
        ...HAIR_COLORS.map((c) => h('button', { 'aria-label': c.id, style: { width: '26px', height: '26px', borderRadius: '50%', background: c.c, border: (s.profile.hairColor || 'brown') === c.id ? '2px solid var(--purple-3)' : '2px solid var(--border-strong)' }, onclick: () => { update((st) => { st.profile.hairColor = c.id; }); ctx.refresh(); } })))));
    root.append(h('div', { class: 'chips scroll mt' }, [['all', 'הכל'], ['short', 'קצרות'], ['medium', 'בינוניות'], ['long', 'ארוכות'], ['fade', 'פייד'], ['forme', 'מתאימות לי']].map(([id, label]) =>
      h('button', { class: 'chip' + (filter === id ? ' on' : ''), onclick: () => ctx.go(`#/hair?tab=library&len=${id}`) }, label))));
    let list = HAIRCUTS;
    if (['short', 'medium', 'long'].includes(filter)) list = list.filter((c) => c.length === filter);
    if (filter === 'fade') list = list.filter((c) => c.tags.includes('פייד') || c.id === 'taper');
    if (filter === 'forme') list = [...list].filter((c) => recommend(c) >= 2).sort((a, b) => recommend(b) - recommend(a));
    root.append(list.length ? h('div', { class: 'cut-grid mt' }, list.map((c) => cutCard(c, ctx))) : emptyState('scissors', 'כדי לראות התאמות – בחרו צורת פנים למעלה.'));
    root.append(h('p', { class: 'tiny muted center mt' }, 'האיורים ממחישים את מבנה התספורת. אפשר להראות אותם לספר יחד עם ההסבר.'));
  } else if (tab === 'saved') {
    const saved = s.savedCuts.map((id) => CUT[id]).filter(Boolean);
    root.append(saved.length ? h('div', { class: 'cut-grid' }, saved.map((c) => cutCard(c, ctx)))
      : h('div', { class: 'card' }, emptyState('bookmark', 'עדיין לא שמרת תסרוקות. לחצו על סימן השמירה בכרטיס תספורת.', h('button', { class: 'btn sm mt', onclick: () => ctx.go('#/hair') }, 'לספרייה'))));
  } else {
    root.append(hairRoutineCard(s.profile));
    root.append(section('מדריכים'));
    root.append(h('div', { class: 'list' }, guidesByArea('hair').map((g) => listRow({ icon: g.icon, title: g.title, desc: g.summary, onclick: () => ctx.go('#/guide/' + g.id) }))));
    root.append(h('div', { class: 'mt' }, h('button', { class: 'btn block', onclick: () => ctx.go('#/products?group=hair') }, ic('bag'), 'מדריך מוצרי שיער')));
  }
  return root;
}

function hairRoutineCard(p) {
  const t = p.hairType;
  const wash = { straight: 'כל יום-יומיים', thin: 'כל יום-יומיים', wavy: 'כל 2-3 ימים', curly: '1-2 פעמים בשבוע', coily: 'פעם בשבוע בערך' }[t] || 'כל 2-3 ימים';
  const product = { straight: 'קליי או משחה', thin: 'ספריי מלח / פודרה לנפח', wavy: 'ספריי מלח או קרם קל', curly: 'קרם תלתלים + ג׳ל עדין', coily: 'קרם לחות לשיער + שמן קל' }[t] || 'קליי או קרם';
  return h('div', { class: 'card hero' },
    h('b', null, 'השגרה שמתאימה לשיער שלך'),
    h('ul', { class: 'dots' },
      h('li', null, `חפיפה: ${wash}`),
      h('li', null, `מוצר עיצוב מומלץ: ${product}`),
      h('li', null, 'מרכך על האורכים בלבד, לייבש בטפיחות'),
      h('li', null, p.hairLength === 'short' ? 'תספורת כל 3-5 שבועות לשמירה על הצורה' : 'גזירת קצוות כל 8-12 שבועות')),
    t === 'curly' || t === 'coily' ? note('לתלתלים: לא להבריש יבש, ולישון על ציפית סאטן אם אפשר.') : null);
}

export function haircutDetail(ctx) {
  const cut = CUT[ctx.params[0]];
  const root = h('main');
  if (!cut) { root.append(topbar('תספורת', { back: '#/hair' }), emptyState('scissors', 'לא נמצא')); return root; }
  const s = getState();
  const saved = s.savedCuts.includes(cut.id);
  const saveBtn = h('button', { class: 'icon-btn', 'aria-label': 'שמירה', 'aria-pressed': saved ? 'true' : 'false', style: saved ? { color: 'var(--purple-3)' } : null, onclick: () => { toggleSave(cut.id); ctx.refresh(); } }, ic('bookmark'));
  root.append(topbar(cut.name, { sub: cut.en, back: '#/hair', actions: [saveBtn] }));
  root.append(h('div', { class: 'media', style: { aspectRatio: '1.2' }, html: haircutSVG(cut, { hairColor: hairColor() }) }));
  root.append(h('div', { class: 'row wrap mt' },
    h('span', { class: 'tag purple' }, LEN[cut.length]),
    ...cut.tags.map((t) => h('span', { class: 'tag' }, t)),
    h('span', { class: 'tag cyan' }, ic('clock'), cut.styleMin ? `${cut.styleMin} דק׳ סידור` : 'בלי סידור'),
    h('span', { class: 'tag amber' }, ic('scissors'), `תספורת כל ${cut.upkeep} שבועות`)));
  root.append(h('div', { class: 'card mt' }, h('p', { style: { color: 'var(--text)' } }, cut.desc)));
  const faceNames = cut.face.map((f) => labelOf(FACE_SHAPES, f)).join(', ');
  const hairNames = cut.hair.map((x) => labelOf(HAIR_TYPES, x)).join(', ');
  const fitsMe = (s.profile.hairType && cut.hair.includes(s.profile.hairType));
  root.append(h('div', { class: 'grid2 mt' },
    h('div', { class: 'stat' }, h('div', { class: 'k' }, 'צורות פנים'), h('div', { class: 'small', style: { marginTop: '4px' } }, faceNames)),
    h('div', { class: 'stat' }, h('div', { class: 'k' }, 'סוגי שיער'), h('div', { class: 'small', style: { marginTop: '4px' } }, hairNames))));
  if (s.profile.hairType && s.profile.hairType !== 'unknown') root.append(h('div', { class: 'mt' }, note(fitsMe ? 'התספורת מתאימה לסוג השיער שהגדרת 👌' : 'התספורת פחות נפוצה לסוג השיער שהגדרת – כדאי להתייעץ עם הספר.', fitsMe ? '' : 'warn')));
  root.append(section('מה להגיד לספר'));
  root.append(h('div', { class: 'card' }, h('ol', { class: 'steps' }, cut.ask.map((x) => h('li', null, x)))));
  root.append(section('איך מסדרים בבית'));
  root.append(h('div', { class: 'card' }, h('ol', { class: 'steps' }, cut.style.map((x) => h('li', null, x)))));
  root.append(section('מוצרים'));
  root.append(h('div', { class: 'card' }, h('ul', { class: 'dots' }, cut.products.map((x) => h('li', null, x))), h('a', { href: '#/guide/hair-products', class: 'small' }, 'מדריך מוצרי שיער ›')));
  root.append(h('div', { class: 'row mt2' },
    h('button', { class: 'btn grow', onclick: () => ctx.go(`#/coach?q=${encodeURIComponent(`האם ${cut.name} יתאים לי?`)}`) }, ic('bot'), 'לשאול את המאמן'),
    h('button', { class: 'btn primary grow', onclick: () => { if (!getState().savedCuts.includes(cut.id)) toggleSave(cut.id); ctx.go('#/hair?tab=saved'); } }, ic('bookmark'), 'שמירה')));
  return root;
}
