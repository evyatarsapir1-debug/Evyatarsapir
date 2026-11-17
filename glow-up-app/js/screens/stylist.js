// "הסטייליסט שלי" – dresses you: full outfits (shirt + pants + shoes), "plain shirts only",
// "what goes with a hoodie / what doesn't", consult with clothing photos (AI), and matching from your wardrobe.
import { h, ic, toast, note, emptyState, pickImage, toggle, rich } from '../ui.js';
import { getState, update, uid, images } from '../store.js';
import { COLOR, COLORS, colorsWork } from '../data/style.js';
import { GARMENTS, G, buildOutfits, matchFor, parseRequest, garmentSVG, OCC_LABEL, SLOT_LABEL, short, garmentOfItem, pairProblem, pieceName, colorName, fabricHex } from '../data/stylist.js';
import { outfitFigureSVG } from '../outfit-figure.js';
import { aiOn, visionOn, aiErrorText, hasSample } from '../ai.js';
import { aiStylist, aiStylistPhotos } from '../stylist-ai.js';
import { section } from './common.js';
import { fileToBlob } from './scan.js';
import { itemTile, wardrobeStylist } from './style.js';

const OCCS = ['school', 'daily', 'out', 'date', 'event', 'sport'];
const STYLE_OPTS = [['', 'הכל'], ['casual', 'קז׳ואל'], ['street', 'סטריט'], ['minimal', 'מינימליסטי'], ['classic', 'קלאסי'], ['elegant', 'אלגנטי'], ['sport', 'ספורטיבי'], ['vintage', 'וינטג׳']];
const QUICK = ['תלביש אותי לבית ספר', 'רק חולצות חלקות', 'מה הולך עם פוטר שחור?', 'מה לא מתאים לקפוצ׳ון?', 'לוק לדייט', 'לוק לאירוע'];

// request state survives re-renders inside this session
const req = { occasion: 'daily', style: '', plain: false, anchor: '', anchorColor: '', seed: 1, asked: '', ai: null, aiErr: '' };
let photoState = { blobs: [], question: '', result: null, err: '' };
let pending = null;

const fem = () => getState().profile.address === 'f';
const prefer = () => getState().scans?.[0]?.style?.colors || [];
const ownedGarments = () => getState().wardrobe.map(garmentOfItem).filter(Boolean);

export function stylistTab(ctx) {
  const s = getState();
  const mode = ctx.query.get('mode') || (ctx.query.get('occ') ? 'wardrobe' : 'dress');
  if (!req.style && s.profile.styles?.length && !req._init) { req.style = ['casual', 'street', 'minimal', 'classic', 'elegant', 'sport', 'vintage'].find((x) => s.profile.styles.includes(x)) || ''; }
  req._init = true;
  const wrap = h('div', { class: 'stylist' });

  // ---- ask box ----
  const input = h('textarea', { class: 'input', rows: 2, maxlength: 600, 'data-stylist-q': '', placeholder: 'מה ללבוש? לדוגמה: "רק חולצות חלקות לבית ספר" או "מה הולך עם פוטר אפור?"' });
  input.value = req.asked;
  const askBtn = h('button', { class: 'btn primary', 'data-stylist-ask': '', onclick: () => submit(input.value) }, ic('wand'), 'תלביש אותי');
  wrap.append(h('div', { class: 'card hero' },
    h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic('wand')), h('div', { class: 'grow' }, h('b', null, 'הסטייליסט שלך'),
      h('div', { class: 'small muted' }, aiOn() ? 'מחובר ל-Claude · שואלים כל דבר על לבוש' : 'מצב מובנה (בלי AI) · מבין בקשות נפוצות ובונה לוקים לפי כללי סטייל'))),
    h('div', { class: 'mt' }, input),
    h('div', { class: 'row mt' }, askBtn, h('button', { class: 'btn', onclick: () => ctx.go('#/style?tab=stylist&mode=photos') }, ic('camera'), 'לשלוח תמונות')),
    h('div', { class: 'chips scroll mt' }, QUICK.map((q) => h('button', { class: 'chip', onclick: () => { input.value = q; submit(q); } }, q)))));

  // ---- modes ----
  const modes = [['dress', 'תלביש אותי'], ['match', 'מה הולך עם…'], ['photos', 'התייעצות עם תמונות'], ['wardrobe', 'מהארון שלי']];
  wrap.append(h('div', { class: 'chips scroll', style: { margin: '14px 0 4px' }, role: 'tablist' }, modes.map(([id, label]) =>
    h('button', { class: 'chip' + (mode === id ? ' on' : ''), role: 'tab', 'aria-selected': mode === id ? 'true' : 'false', 'data-mode': id, onclick: () => ctx.go(`#/style?tab=stylist&mode=${id}`) }, label))));

  const body = h('div');
  wrap.append(body);
  if (mode === 'match') body.append(matchMode(ctx));
  else if (mode === 'photos') body.append(photosMode(ctx));
  else if (mode === 'wardrobe') body.append(wardrobeMode(ctx));
  else body.append(dressMode(ctx));
  return wrap;

  async function submit(text) {
    text = (text || '').trim();
    if (!text) return toast('כתבו מה אתם רוצים ללבוש', 'info');
    const p = parseRequest(text);
    req.asked = text;
    if (p.occasion) req.occasion = p.occasion;
    if (p.style) req.style = p.style;
    req.plain = p.plain || (req.plain && !p.anchor);
    req.anchor = p.anchor || '';
    req.anchorColor = p.anchorColor || '';
    req.seed++;
    req.ai = null; req.aiErr = ''; req.scroll = true;
    if (p.wardrobe && !aiOn()) return ctx.go('#/style?tab=stylist&mode=wardrobe');
    if (aiOn()) {
      pending?.abort();
      pending = new AbortController();
      req.ai = 'loading';
      ctx.go('#/style?tab=stylist&mode=dress&r=' + req.seed);
      try { req.ai = await aiStylist(text, { occasion: req.occasion, plain: req.plain, signal: pending.signal }); }
      catch (e) { req.ai = null; req.aiErr = e.code === 'cancelled' || e.name === 'AbortError' ? '' : aiErrorText(e); }
      pending = null;
      if (location.hash.includes('mode=dress')) ctx.refresh();
    } else {
      ctx.go((p.avoidQuestion || (p.anchor && /הולך|מתאים|עם/.test(text))) && p.anchor ? `#/style?tab=stylist&mode=match&g=${p.anchor}&c=${p.anchorColor}` : '#/style?tab=stylist&mode=dress&r=' + req.seed);
    }
  }
}

// ======================= dress me =======================
function dressMode(ctx) {
  const wrap = h('div');
  // AI answer to a typed question
  if (req.ai === 'loading') {
    wrap.append(h('div', { class: 'card center', 'data-stylist-loading': '' }, spinner(), h('b', null, 'הסטייליסט בונה לך לוקים…'), h('p', { class: 'small muted' }, `"${req.asked}"`),
      h('button', { class: 'btn sm mt', onclick: () => { pending?.abort(); req.ai = null; ctx.refresh(); } }, 'עצירה')));
  } else if (req.ai && typeof req.ai === 'object') {
    wrap.append(aiAnswer(req.ai, ctx, { title: `"${req.asked}"`, onClear: () => { req.ai = null; ctx.refresh(); } }));
    wrap.append(section('או לבנות בעצמך עם הפילטרים'));
  } else if (req.aiErr) {
    wrap.append(note(`${req.aiErr} בינתיים – לוקים מהסטייליסט המובנה:`, 'warn'));
  }

  // controls
  const ctl = h('div', { class: 'card' });
  ctl.append(h('div', { class: 'small', style: { fontWeight: 700 } }, 'לאן?'),
    h('div', { class: 'chips mt' }, OCCS.map((o) => h('button', { class: 'chip' + (req.occasion === o ? ' on' : ''), 'data-occ': o, onclick: () => { req.occasion = o; req.seed++; redraw(); } }, OCC_LABEL[o]))),
    h('div', { class: 'small mt', style: { fontWeight: 700 } }, 'סגנון'),
    h('div', { class: 'chips mt' }, STYLE_OPTS.map(([id, label]) => h('button', { class: 'chip' + (req.style === id ? ' on' : ''), onclick: () => { req.style = id; req.seed++; redraw(); } }, label))),
    h('label', { class: 'list-row', style: { padding: '12px 0 4px', border: 0, cursor: 'pointer' } },
      h('div', { class: 'grow' }, h('div', { class: 't' }, 'רק חולצות חלקות'), h('div', { class: 'd' }, 'בלי הדפסים, בלי לוגו, בלי צבעוני')),
      h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: req.plain, 'data-plain': '', 'aria-label': 'רק חולצות חלקות', onchange: (e) => { req.plain = e.target.checked; req.seed++; redraw(); } }), h('span'))),
    anchorPicker(() => { req.seed++; redraw(); }));
  wrap.append(ctl);

  const results = h('div');
  wrap.append(results);
  function redraw() {
    // keep control chips in sync without a full navigation
    ctl.querySelectorAll('[data-occ]').forEach((b) => b.classList.toggle('on', b.dataset.occ === req.occasion));
    ctl.querySelectorAll('.chips')[1]?.querySelectorAll('.chip').forEach((b, i) => b.classList.toggle('on', STYLE_OPTS[i][0] === req.style));
    const outfits = buildOutfits({ occasion: req.occasion, style: req.style, plain: req.plain, anchor: req.anchor || null, anchorColor: req.anchorColor || null, fem: fem(), prefer: prefer(), owned: ownedGarments(), count: 3, seed: req.seed * 7919 });
    results.replaceChildren();
    const head = [OCC_LABEL[req.occasion], req.style && STYLE_OPTS.find((x) => x[0] === req.style)?.[1], req.plain && 'חולצות חלקות', req.anchor && `עם ${short(G[req.anchor].label)}${req.anchorColor ? ' ' + colorName(req.anchor, req.anchorColor) : ''}`].filter(Boolean).join(' · ');
    results.append(section(`הלוקים שלך · ${head}`));
    if (!outfits.length) results.append(h('div', { class: 'card' }, emptyState('shirt', 'לא מצאתי לוק שעומד בכל הדרישות. נסו להסיר את הפריט שבחרתם או לבחור אירוע אחר.')));
    outfits.forEach((o, i) => results.append(outfitCard(o, ctx, i)));
    if (outfits.length) results.append(h('button', { class: 'btn block mt', 'data-more': '', onclick: () => { req.seed++; redraw(); } }, ic('refresh'), 'עוד לוקים'));
    if (req.anchor) results.append(matchCard(matchFor(req.anchor, req.anchorColor || null, { fem: fem() }), ctx, true));
    if (prefer().length) results.append(h('p', { class: 'tiny muted mt' }, `הצבעים מועדפים לפי הסריקה שלך: ${prefer().map((c) => COLOR[c]?.label).filter(Boolean).join(', ')}.`));
  }
  redraw();
  if (req.scroll) { req.scroll = false; scrollTo(req.ai ? wrap : results); }
  return wrap;
}

function anchorPicker(onChange) {
  const box = h('div', { class: 'mt' });
  const draw = () => {
    const g = G[req.anchor];
    box.replaceChildren(
      h('div', { class: 'small', style: { fontWeight: 700 } }, 'פריט שחייב להיות בלוק (לא חובה)'),
      h('select', { class: 'input mt', 'data-anchor': '', 'aria-label': 'פריט שחייב להיות בלוק', onchange: (e) => { req.anchor = e.target.value; req.anchorColor = req.anchor ? G[req.anchor].colors[0] : ''; draw(); onChange(); } },
        h('option', { value: '' }, 'בלי – תבחר אתה הכל'),
        ...['layer', 'top', 'bottom', 'shoes'].map((slot) => h('optgroup', { label: SLOT_LABEL[slot] }, GARMENTS.filter((x) => x.slot === slot && (!x.fem || fem())).map((x) => h('option', { value: x.id, selected: x.id === req.anchor }, x.label))))),
      g ? h('div', { class: 'swatches mt' }, COLORS.filter((c) => !['gold', 'silver'].includes(c.id) && (g.slot !== 'shoes' || g.colors.includes(c.id))).map((c) => h('button', { class: req.anchorColor === c.id ? 'on' : '', title: c.label, 'aria-label': c.label, style: { background: c.hex }, onclick: () => { req.anchorColor = c.id; draw(); onChange(); } }))) : null);
  };
  draw();
  return box;
}

// ======================= what goes with… =======================
function matchMode(ctx) {
  const gid = ctx.query.get('g') || req.anchor || 'hoodie';
  const g = G[gid] || G.hoodie;
  const col = ctx.query.get('c') || (req.anchor === g.id && req.anchorColor) || g.colors[0];
  const wrap = h('div');
  const picker = h('div', { class: 'card', style: { marginTop: '12px' } },
    h('div', { class: 'small', style: { fontWeight: 700 } }, 'לבדוק פריט אחר'),
    ...['layer', 'top', 'bottom', 'shoes'].map((slot) => h('div', null, h('div', { class: 'tiny muted mt' }, SLOT_LABEL[slot]),
      h('div', { class: 'chips' }, GARMENTS.filter((x) => x.slot === slot && (!x.fem || fem())).map((x) => h('button', { class: 'chip' + (x.id === g.id ? ' on' : ''), 'data-g': x.id, onclick: () => ctx.go(`#/style?tab=stylist&mode=match&g=${x.id}&c=${x.colors[0]}`) }, short(x.label)))))),
    h('div', { class: 'small mt', style: { fontWeight: 700 } }, 'באיזה צבע?'),
    h('div', { class: 'swatches mt' }, COLORS.filter((c) => !['gold', 'silver'].includes(c.id) && (g.slot !== 'shoes' || g.colors.includes(c.id))).map((c) => h('button', { class: col === c.id ? 'on' : '', title: c.label, 'aria-label': c.label, style: { background: c.hex }, onclick: () => ctx.go(`#/style?tab=stylist&mode=match&g=${g.id}&c=${c.id}`) }))));
  const m = matchFor(g.id, COLOR[col] ? col : null, { fem: fem() });
  const card = matchCard(m, ctx);
  wrap.append(card);
  const outfits = buildOutfits({ occasion: g.f[0] >= 3 ? 'event' : g.f[1] <= 1 ? 'daily' : 'out', anchor: g.id, anchorColor: col, fem: fem(), prefer: prefer(), count: 3, seed: (req.seed++) * 31 + g.id.length });
  wrap.append(section(`3 לוקים עם ${short(g.label)} ${colorName(g.id, col)}`));
  outfits.forEach((o, i) => wrap.append(outfitCard(o, ctx, i)));
  wrap.append(h('button', { class: 'btn block mt', onclick: () => ctx.refresh() }, ic('refresh'), 'לוקים אחרים'));
  wrap.append(picker);
  if (req.scroll) { req.scroll = false; scrollTo(card); }
  return wrap;
}

function matchCard(m, ctx, compact = false) {
  if (!m) return h('div');
  const name = `${short(m.anchor.label)}${m.color ? ' ' + colorName(m.anchor.id, m.color) : ''}`;
  const card = h('div', { class: 'card', style: { marginTop: '12px' }, 'data-match': m.anchor.id },
    h('div', { class: 'row' }, h('span', { html: garmentSVG(m.anchor.id, m.color, 54) }), h('div', { class: 'grow' }, h('b', null, `מה הולך עם ${name}?`), m.tip ? h('div', { class: 'small muted' }, m.tip) : null)));
  card.append(h('h3', { style: { margin: '14px 0 6px', color: 'var(--lime)' } }, '✓ כן יתאים'));
  for (const slot of Object.keys(m.good)) {
    const list = m.good[slot].slice(0, compact ? 4 : 8);
    if (!list.length) continue;
    card.append(h('div', { class: 'tiny muted', style: { marginTop: '8px' } }, SLOT_LABEL[slot]),
      h('div', { class: 'match-list' }, list.map((x) => h('div', { class: 'match-chip' }, h('span', { html: garmentSVG(x.id, x.colors[0], 30) }), h('div', null, h('div', { class: 'small' }, short(x.label)),
        h('div', { class: 'row', style: { gap: '3px', marginTop: '3px' } }, x.colors.map((c) => h('span', { class: 'swatch', title: colorName(x.id, c), style: { background: fabricHex(x.id, c), width: '11px', height: '11px' } }))),
        h('div', { class: 'tiny muted', style: { marginTop: '2px' } }, x.colors.slice(0, 3).map((c) => colorName(x.id, c).replace(/ \(.*\)/, '')).join(' / ')))))));
  }
  if (m.bad.length) {
    card.append(h('h3', { style: { margin: '16px 0 6px', color: 'var(--pink)' } }, '✗ לא יתאים'));
    card.append(h('ul', { class: 'dots small', 'data-avoid': '' }, m.bad.map((b) => h('li', null, h('b', null, short(b.label)), ' – ', b.why))));
  }
  if (m.color) {
    card.append(h('h3', { style: { margin: '16px 0 6px' } }, 'צבעים'));
    card.append(h('div', { class: 'small' }, 'הולך עם: ', h('span', { class: 'row', style: { display: 'inline-flex', gap: '4px', flexWrap: 'wrap', verticalAlign: 'middle' } }, m.colorsGood.slice(0, 12).map((c) => h('span', { class: 'swatch', title: COLOR[c].label, style: { background: COLOR[c].hex, width: '16px', height: '16px' } })))));
    if (m.colorsBad.length) card.append(h('div', { class: 'small mt' }, 'פחות מומלץ ליד: ', m.colorsBad.map((c) => COLOR[c].label).join(', ')));
  }
  return card;
}

// ======================= outfit rendering =======================
function pieceTile(p) {
  return h('div', { class: 'piece' }, h('div', { class: 'pic', html: garmentSVG(p.id || guessShape(p), p.color, 48) }),
    h('div', { class: 'tiny muted' }, SLOT_LABEL[p.slot] || ''), h('div', { class: 'small pn' }, short(p.label)), h('div', { class: 'tiny' }, COLOR[p.color]?.label || ''),
    p.fromPhoto ? h('span', { class: 'tag cyan', style: { marginTop: '4px' } }, `מתמונה ${p.fromPhoto}`) : null);
}
function guessShape(p) { return { top: 'tee', layer: 'hoodie', bottom: 'slim-jeans', shoes: 'white-sneakers', acc: 'watch' }[p.slot] || 'tee'; }

/** Display name with the exact color ("ג׳ינס סלים בצבע כחול כהה (שטיפה כהה)"). */
function nameOf(p) {
  if (!p.id) { const cn = colorName('', p.color); return p.label.includes(cn.split(' ')[0].slice(0, 3)) ? p.label : `${p.label} בצבע ${cn}`; }
  return pieceName(p);
}
const figId = (p) => p.id || guessShape(p);

/** Mannequin figure + the exact list of pieces. Used for outfits and saved looks. */
export function lookVisual(pieces, { width = 128 } = {}) {
  const fig = outfitFigureSVG(pieces.map((p) => ({ ...p, id: figId(p) })), { width });
  return h('div', { class: 'look-grid' },
    h('div', { class: 'studio', html: fig }),
    h('div', { class: 'look-lines' }, pieces.map((p) => h('div', { class: 'look-line' },
      h('span', { class: 'swatch', title: colorName(p.id, p.color), style: { background: p.color === 'multi' ? COLOR.multi.hex : fabricHex(figId(p), p.color), width: '16px', height: '16px', flexShrink: 0, marginTop: '2px' } }),
      h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'tiny muted' }, SLOT_LABEL[p.slot] || ''), h('div', { class: 'small', style: { fontWeight: 600 } }, nameOf(p)),
        p.fromPhoto ? h('span', { class: 'tag cyan', style: { marginTop: '3px' } }, `מתמונה ${p.fromPhoto}`) : null)))));
}

function outfitCard(o, ctx, i) {
  const missing = () => {
    const owned = new Set(ownedGarments());
    return o.pieces.filter((p) => p.slot !== 'acc' && !(p.id && owned.has(p.id)) && !p.fromPhoto);
  };
  return h('div', { class: 'card outfit-card', style: { marginTop: '12px' } },
    h('div', { class: 'row between mb' }, h('b', null, o.name || `לוק ${i + 1}`), o.curated ? h('span', { class: 'tag lime' }, 'לוק מוכח') : o.score ? h('span', { class: 'tag purple' }, 'צבעים מתואמים') : null),
    lookVisual(o.pieces),
    o.why?.length ? h('ul', { class: 'dots small', style: { marginTop: '10px' } }, o.why.map((r) => h('li', null, r))) : null,
    h('div', { class: 'row mt', style: { flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', 'data-save-look': '', onclick: () => {
        update((s) => { s.looks.unshift({ id: uid(), name: o.name || `לוק ${OCC_LABEL[req.occasion] || ''}`, itemIds: [], pieces: o.pieces.map(({ id, label, slot, color }) => ({ id, label, slot, color })), occasion: req.occasion, created: new Date().toISOString().slice(0, 10) }); });
        toast('הלוק נשמר בלוקים', 'bookmark');
      } }, ic('bookmark'), 'שמירה'),
      h('button', { class: 'btn sm', onclick: () => {
        const need = missing();
        if (!need.length) return toast('יש לך כבר הכל בארון 🔥', 'check');
        update((s) => { s.styleShop = s.styleShop || []; need.forEach((p) => { const nm = nameOf(p); if (!s.styleShop.some((x) => x.name === nm && !x.bought)) s.styleShop.push({ id: uid(), name: nm, category: p.slot === 'acc' ? 'acc' : p.slot, color: p.color, why: 'מהלוק שהסטייליסט הציע', price: '', bought: false }); }); });
        toast(`${need.length} פריטים נוספו לרשימת הקניות`, 'bag');
      } }, ic('bag'), 'מה חסר לי → לקניות')));
}

function aiAnswer(r, ctx, { title, onClear } = {}) {
  const wrap = h('div', { 'data-ai-answer': '' });
  wrap.append(h('div', { class: 'card hero' },
    h('div', { class: 'row between' }, h('span', { class: 'mode-pill ai' }, h('i'), 'Claude · סטייליסט'), onClear ? h('button', { class: 'icon-btn', 'aria-label': 'סגירה', onclick: onClear }, ic('x')) : null),
    title ? h('div', { class: 'small muted mt' }, title) : null,
    r.intro ? h('div', { class: 'mt' }, rich(r.intro)) : null));
  if (r.items?.length) {
    wrap.append(section('מה זיהיתי בתמונות'));
    wrap.append(h('div', { class: 'list' }, r.items.map((it) => h('div', { class: 'list-row' },
      h('span', { html: garmentSVG(it.garment || guessShape({ slot: it.category }), it.color, 34) }),
      h('div', { class: 'grow' }, h('div', { class: 't' }, it.name), h('div', { class: 'd' }, [it.photo ? `תמונה ${it.photo}` : '', COLOR[it.color]?.label].filter(Boolean).join(' · '))),
      h('button', { class: 'btn sm', onclick: async (e) => {
        const blob = it.photo && photoState.blobs[it.photo - 1] && photoState.keepPhotos ? photoState.blobs[it.photo - 1] : null;
        let imageId = null;
        if (blob) imageId = await images.put(await blobToDataURL(blob));
        update((s) => { s.wardrobe.push({ id: uid(), name: it.name, category: ['top', 'layer', 'bottom', 'shoes', 'acc', 'watch', 'jewelry', 'dress', 'sport'].includes(it.category) ? it.category : 'top', color: it.color, occasions: ['daily', 'out', 'school'], imageId }); });
        e.currentTarget.disabled = true; e.currentTarget.textContent = 'בארון ✓';
        toast('נוסף לארון', 'shirt');
      } }, ic('plus'), 'לארון')))));
  }
  r.outfits.forEach((o, i) => wrap.append(outfitCard(o, ctx, i)));
  if (r.works?.length) wrap.append(h('div', { class: 'card', style: { marginTop: '12px' } }, h('h3', { style: { margin: '0 0 6px', color: 'var(--lime)' } }, '✓ מה כן יתאים'), h('ul', { class: 'dots small' }, r.works.map((x) => h('li', null, x)))));
  if (r.avoid?.length) wrap.append(h('div', { class: 'card', style: { marginTop: '12px' } }, h('h3', { style: { margin: '0 0 6px', color: 'var(--pink)' } }, '✗ מה לא יתאים'), h('ul', { class: 'dots small' }, r.avoid.map((a) => h('li', null, h('b', null, a.what), a.why ? ' – ' + a.why : '')))));
  if (r.missing?.length) {
    wrap.append(h('div', { class: 'card', style: { marginTop: '12px' } }, h('h3', { style: { margin: '0 0 6px' } }, 'מה כדאי להוסיף'),
      h('div', { class: 'list' }, r.missing.map((m) => h('div', { class: 'list-row' }, h('span', { class: 'swatch', style: { background: COLOR[m.color]?.hex, width: '22px', height: '22px' } }),
        h('div', { class: 'grow' }, h('div', { class: 't' }, m.name), h('div', { class: 'd' }, [m.why, m.price].filter(Boolean).join(' · '))),
        h('button', { class: 'btn sm', onclick: (e) => { update((s) => { s.styleShop = [...(s.styleShop || []), { id: uid(), ...m, bought: false }]; }); e.currentTarget.disabled = true; e.currentTarget.textContent = 'ברשימה ✓'; } }, ic('plus'), 'לקניות'))))));
  }
  if (r.tips?.length) wrap.append(h('div', { class: 'mt' }, note(r.tips.join(' · '))));
  wrap.append(h('p', { class: 'tiny muted mt' }, 'התשובה נוצרה ע״י Claude ויכולה לטעות – הטעם שלך קובע.'));
  return wrap;
}

// ======================= photo consult =======================
function photosMode(ctx) {
  const wrap = h('div');
  if (!visionOn()) {
    wrap.append(h('div', { class: 'card' },
      h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic('camera')), h('b', null, 'התייעצות עם תמונות צריכה AI')),
      h('p', { class: 'small' }, aiOn() ? 'החיבור הנוכחי ל-Claude לא תומך בשליחת תמונות.' : 'כדי שהסטייליסט יראה את הבגדים בתמונה צריך חיבור ל-Claude (בתוך הלינק של Claude זה עובד אוטומטית, או עם מפתח API בהגדרות).'),
      h('p', { class: 'small', style: { fontWeight: 700 } }, 'אפשר לתאם בגדים גם בלי תמונות:'),
      h('ul', { class: 'dots small' }, h('li', null, 'לכתוב בתיבה למעלה, למשל "קפוצ׳ון אפור וג׳ינס – אילו נעליים?"'), h('li', null, '"מה הולך עם…" – בוחרים פריט וצבע ומקבלים מה כן ומה לא'), h('li', null, '"מהארון שלי" – מוסיפים את הבגדים לארון ומקבלים לוקים רק מהם')),
      h('div', { class: 'row mt' }, h('button', { class: 'btn sm', onclick: () => ctx.go('#/style?tab=stylist&mode=match') }, 'מה הולך עם…'), h('button', { class: 'btn sm', onclick: () => ctx.go('#/style?tab=stylist&mode=wardrobe') }, 'מהארון שלי'), h('button', { class: 'btn sm ghost', onclick: () => ctx.go('#/settings?sec=coach') }, 'חיבור AI'))));
    return wrap;
  }
  wrap.append(h('div', { class: 'card hero' }, h('b', null, 'שלחו תמונות של בגדים – הסטייליסט יתאים לכם'),
    h('p', { class: 'small' }, 'עד 4 תמונות: חולצה, מכנסיים, נעליים, או ערימה על המיטה. אפשר גם צילום של הארון. הוא יזהה מה יש, יגיד מה הולך עם מה, מה לא – ומה חסר.')));
  const grid = h('div', { class: 'grid2', style: { marginTop: '12px' } });
  const drawGrid = () => {
    grid.replaceChildren(...[0, 1, 2, 3].map((i) => {
      const b = photoState.blobs[i];
      const box = h('button', { class: 'card tap photo-slot', 'data-photo': String(i), style: { marginTop: 0, padding: 0, aspectRatio: '1', display: 'grid', placeItems: 'center', overflow: 'hidden' },
        onclick: async () => {
          if (b) { photoState.blobs.splice(i, 1); photoState.result = null; return drawGrid(); }
          const f = await pickImage();
          if (!f) return;
          try { photoState.blobs.push(await fileToBlob(f, 1024)); photoState.result = null; drawGrid(); } catch { toast('לא הצלחנו לקרוא את התמונה', 'alert'); }
        } });
      if (b) box.append(h('img', { src: URL.createObjectURL(b), alt: `תמונה ${i + 1}`, style: { width: '100%', height: '100%', objectFit: 'cover' } }), h('span', { class: 'tag', style: { position: 'absolute', top: '6px', insetInlineStart: '6px' } }, `${i + 1} · הסרה`));
      else if (i === photoState.blobs.length) box.append(h('div', { class: 'center small muted' }, ic('camera'), h('div', null, i === 0 ? 'הוספת תמונה' : 'עוד תמונה')));
      else box.append(h('div', { class: 'tiny muted' }, '—'));
      box.style.position = 'relative';
      return box;
    }));
  };
  drawGrid();
  wrap.append(grid);
  const q = h('textarea', { class: 'input mt', rows: 2, maxlength: 500, placeholder: 'שאלה (לא חובה): "מה ללבוש עם זה לחתונה?" / "מה הכי מתאים לבית ספר?"', oninput: (e) => (photoState.question = e.target.value) });
  q.value = photoState.question;
  wrap.append(q);
  wrap.append(h('div', { class: 'chips mt' }, OCCS.map((o) => h('button', { class: 'chip' + (req.occasion === o ? ' on' : ''), onclick: (e) => { req.occasion = o; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === e.currentTarget)); } }, OCC_LABEL[o]))));
  wrap.append(h('label', { class: 'list-row', style: { padding: '12px 0', border: 0, cursor: 'pointer' } },
    h('div', { class: 'grow' }, h('div', { class: 't' }, 'לשמור את התמונות עם הפריטים בארון'), h('div', { class: 'd' }, 'רק אם תלחצו "לארון" על פריט – ורק במכשיר הזה')),
    h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!photoState.keepPhotos, 'aria-label': 'שמירת תמונות בארון', onchange: (e) => (photoState.keepPhotos = e.target.checked) }), h('span'))));
  wrap.append(note(hasSample() ? 'התמונות נשלחות ל-Claude דרך החשבון שלך רק כדי לנתח את הבגדים (בפעם הראשונה תתבקשו לאשר). GLOW UP לא שומרת אותן בשום שרת.' : 'התמונות נשלחות ל-Claude עם מפתח ה-API שלך רק לניתוח. GLOW UP לא שומרת אותן בשום שרת.', '', 'lock'));
  const status = h('div');
  const go = h('button', { class: 'btn primary block mt', 'data-photos-go': '', onclick: async () => {
    if (!photoState.blobs.length) return toast('צריך לפחות תמונה אחת של בגד', 'info');
    go.disabled = true;
    const ctl = new AbortController();
    status.replaceChildren(h('div', { class: 'card center', style: { marginTop: '12px' } }, spinner(), h('b', null, 'הסטייליסט מסתכל על הבגדים…'), h('button', { class: 'btn sm mt', onclick: () => ctl.abort() }, 'עצירה')));
    try {
      photoState.result = await aiStylistPhotos(photoState.blobs, { question: photoState.question, occasion: req.occasion, plain: req.plain, signal: ctl.signal });
      photoState.err = '';
    } catch (e) { photoState.err = ctl.signal.aborted ? '' : aiErrorText(e); }
    go.disabled = false;
    drawResult();
  } }, ic('wand'), 'תתאים לי לוקים');
  wrap.append(go, status);
  function drawResult() {
    status.replaceChildren();
    if (photoState.err) status.append(h('div', { class: 'mt' }, note(photoState.err, 'warn')));
    if (photoState.result) status.append(h('div', { class: 'mt' }, aiAnswer(photoState.result, ctx, { title: photoState.question ? `"${photoState.question}"` : 'התאמה לבגדים מהתמונות' })));
    if (photoState.result && !photoState.result.outfits.length && !photoState.result.items.length) status.append(note('לא הצלחתי לזהות בגדים בתמונות. נסו תמונה מוארת של הבגד על רקע חלק.', 'warn'));
  }
  drawResult();
  return wrap;
}

// ======================= from my wardrobe =======================
function wardrobeMode(ctx) {
  const s = getState();
  const wrap = h('div');
  wrap.append(wardrobeStylist(ctx));
  if (!s.wardrobe.length) return wrap;
  // what goes with one of MY items – only from my wardrobe
  wrap.append(section('מה הולך עם פריט מהארון שלי?'));
  const pickId = ctx.query.get('item');
  wrap.append(h('div', { class: 'outfit', 'data-my-pick': '' }, s.wardrobe.filter((w) => w.category !== 'sport').map((w) => itemTile(w, { selected: w.id === pickId, onclick: () => ctx.go(`#/style?tab=stylist&mode=wardrobe&item=${w.id}`) }))));
  const it = s.wardrobe.find((w) => w.id === pickId);
  if (!it) { wrap.append(h('p', { class: 'small muted' }, 'בחרו פריט – ותקבלו מה מהארון הולך איתו ומה לא.')); return wrap; }
  const gi = G[garmentOfItem(it)];
  const goes = [], no = [];
  for (const w of s.wardrobe) {
    if (w.id === it.id || w.category === it.category) continue;
    const gw = G[garmentOfItem(w)];
    const why = (gi && gw ? pairProblem(gi, gw) : '') || (!colorsWork(it.color, w.color) ? `${COLOR[it.color]?.label} ו${COLOR[w.color]?.label} מתנגשים` : '');
    (why ? no : goes).push({ w, why });
  }
  wrap.append(h('div', { class: 'card', style: { marginTop: '10px' }, 'data-my-match': '' },
    h('b', null, `${it.name}`),
    h('h3', { style: { margin: '12px 0 6px', color: 'var(--lime)' } }, `✓ הולך עם (${goes.length})`),
    goes.length ? h('div', { class: 'outfit' }, goes.map(({ w }) => itemTile(w))) : h('p', { class: 'small muted' }, 'אין עדיין פריט מתאים בארון.'),
    no.length ? h('h3', { style: { margin: '14px 0 6px', color: 'var(--pink)' } }, `✗ פחות מתאים (${no.length})`) : null,
    no.length ? h('ul', { class: 'dots small' }, no.map(({ w, why }) => h('li', null, h('b', null, w.name), ' – ', why))) : null,
    gi ? h('button', { class: 'btn sm mt', onclick: () => ctx.go(`#/style?tab=stylist&mode=match&g=${gi.id}&c=${it.color}`) }, ic('wand'), 'רעיונות גם מחוץ לארון') : null));
  return wrap;
}

function scrollTo(el) { setTimeout(() => el.isConnected && el.scrollIntoView({ behavior: navigator.webdriver ? 'auto' : 'smooth', block: 'start' }), 60); }
function spinner() { return h('div', { style: { width: '44px', height: '44px', margin: '0 auto 12px', borderRadius: '50%', border: '4px solid var(--surface-2)', borderTopColor: 'var(--purple-2)', animation: 'spin 1s linear infinite' } }); }
function blobToDataURL(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
