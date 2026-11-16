// Style: digital wardrobe, smart stylist (rule-based, uses only the user's items), saved looks, guides.
import { h, ic, sheet, sheetHead, toast, confirmDialog, emptyState, note, listRow, pickImage, readImage } from '../ui.js';
import { getState, update, uid, images, storedImg, todayKey } from '../store.js';
import { CATEGORIES, OCCASIONS, COLORS, COLOR, suggestOutfits, scoreOutfit, slotOf, STYLE_TIPS, colorsWork } from '../data/style.js';
import { STYLES, labelOf } from '../data/profile.js';
import { guidesByArea } from '../data/guides.js';
import { topbar, section } from './common.js';
import { aiAvailable } from '../coach-ai.js';
import { capsuleFor } from '../scan.js';

const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];

function swatchBg(color) {
  const c = COLOR[color];
  if (!c) return 'var(--surface-2)';
  return c.hex.startsWith('#') ? c.hex : c.hex;
}

export function itemTile(item, { onclick, selected } = {}) {
  const c = COLOR[item.color];
  const ph = h('div', { class: 'ph', style: item.imageId ? null : { background: `linear-gradient(135deg, ${c?.hex?.startsWith('#') ? c.hex + '55' : 'var(--surface-2)'}, var(--bg-2))` } },
    item.imageId ? storedImg(item.imageId, item.name) : ic(catOf(item.category).icon));
  return h('button', { class: 'ward-item' + (selected ? ' sel' : ''), onclick, type: 'button', 'aria-pressed': selected ? 'true' : null },
    ph, h('div', { class: 'nm row', style: { gap: '5px' } }, h('span', { class: 'swatch', style: { background: swatchBg(item.color), width: '10px', height: '10px' } }), h('span', { class: 'grow', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, item.name)));
}

function itemSheet(existing, ctx) {
  const it = existing ? { ...existing, occasions: [...(existing.occasions || [])] } : { id: uid(), name: '', category: 'top', color: 'black', occasions: ['daily'], imageId: null };
  let pendingImage = null; // data URL chosen in this sheet
  sheet((api) => {
    const preview = h('div', { class: 'media', style: { height: '150px' } });
    const drawPreview = () => {
      preview.replaceChildren();
      if (pendingImage) preview.append(h('img', { src: pendingImage, alt: '', style: { height: '100%', objectFit: 'contain' } }));
      else if (it.imageId) preview.append(storedImg(it.imageId, ''));
      else preview.append(h('div', { class: 'center muted small' }, ic(catOf(it.category).icon), h('div', null, 'תמונה – לא חובה')));
      preview.querySelectorAll('img').forEach((img) => { img.style.height = '100%'; img.style.objectFit = 'contain'; });
      preview.querySelector('svg')?.setAttribute('style', 'width:34px;height:34px');
    };
    drawPreview();
    const colorBtns = h('div', { class: 'swatches' }, COLORS.map((c) => h('button', {
      class: it.color === c.id ? 'on' : '', title: c.label, 'aria-label': c.label, style: { background: c.hex },
      onclick: (e) => { it.color = c.id; colorBtns.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); colorLabel.textContent = c.label; },
    })));
    const colorLabel = h('span', { class: 'small muted' }, COLOR[it.color]?.label);
    return h('div', null,
      sheetHead(existing ? 'עריכת פריט' : 'פריט חדש לארון', null, api),
      preview,
      h('div', { class: 'row mt' },
        h('button', {
          class: 'btn sm grow',
          onclick: async () => {
            const f = await pickImage();
            if (!f) return;
            try { pendingImage = await readImage(f, 700); drawPreview(); } catch { toast('לא הצלחנו לקרוא את התמונה', 'alert'); }
          },
        }, ic('camera'), it.imageId || pendingImage ? 'החלפת תמונה' : 'צילום / העלאת תמונה'),
        (it.imageId || pendingImage) ? h('button', { class: 'btn sm', onclick: () => { pendingImage = null; it._removeImage = true; it.imageId = null; drawPreview(); } }, ic('trash')) : null),
      h('p', { class: 'tiny muted', style: { margin: '6px 0 12px' } }, 'התמונה נשמרת רק במכשיר שלך ולא נשלחת לשום מקום.'),
      h('label', { class: 'field' }, h('span', null, 'שם הפריט'), h('input', { class: 'input', value: it.name, maxlength: 40, placeholder: 'לדוגמה: טי לבנה', oninput: (e) => (it.name = e.target.value) })),
      h('div', { class: 'field' }, h('span', null, 'קטגוריה'), h('div', { class: 'chips' }, CATEGORIES.map((c) => h('button', { class: 'chip' + (it.category === c.id ? ' on' : ''), onclick: (e) => { it.category = c.id; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); if (!pendingImage && !it.imageId) drawPreview(); } }, ic(c.icon), c.label)))),
      h('div', { class: 'field' }, h('span', { class: 'row between' }, h('span', null, 'צבע עיקרי'), colorLabel), colorBtns),
      h('div', { class: 'field' }, h('span', null, 'מתאים ל…'), h('div', { class: 'chips' }, OCCASIONS.map((o) => h('button', { class: 'chip' + (it.occasions.includes(o.id) ? ' on' : ''), onclick: (e) => { it.occasions = it.occasions.includes(o.id) ? it.occasions.filter((x) => x !== o.id) : [...it.occasions, o.id]; e.currentTarget.classList.toggle('on'); } }, o.label)))),
      h('div', { class: 'row mt' },
        existing ? h('button', {
          class: 'btn danger', 'aria-label': 'מחיקה',
          onclick: async () => {
            if (!(await confirmDialog('למחוק את הפריט?', 'הפריט והתמונה שלו יימחקו מהמכשיר.', { ok: 'מחיקה', danger: true }))) return;
            if (existing.imageId) await images.del(existing.imageId);
            update((s) => { s.wardrobe = s.wardrobe.filter((x) => x.id !== it.id); s.looks = s.looks.map((l) => ({ ...l, itemIds: l.itemIds.filter((x) => x !== it.id) })).filter((l) => l.itemIds.length); });
            api.close(); toast('נמחק', 'trash'); ctx.refresh();
          },
        }, ic('trash')) : null,
        h('button', {
          class: 'btn primary grow',
          onclick: async () => {
            if (!it.name.trim()) return toast('צריך לתת שם לפריט', 'info');
            if (pendingImage) {
              if (existing?.imageId) await images.del(existing.imageId);
              it.imageId = await images.put(pendingImage);
            } else if (it._removeImage && existing?.imageId) await images.del(existing.imageId);
            delete it._removeImage;
            update((s) => { const i = s.wardrobe.findIndex((x) => x.id === it.id); if (i >= 0) s.wardrobe[i] = it; else s.wardrobe.push(it); });
            api.close(); toast(existing ? 'עודכן' : 'נוסף לארון', 'check'); ctx.refresh();
          },
        }, ic('check'), 'שמירה')));
  });
}

function wardrobeTab(ctx) {
  const s = getState();
  const cat = ctx.query.get('cat') || 'all';
  const wrap = h('div');
  wrap.append(h('div', { class: 'row mb' },
    h('button', { class: 'btn primary grow', 'data-tour': 'add-item', onclick: () => itemSheet(null, ctx) }, ic('plus'), 'הוספת פריט'),
    s.wardrobe.length ? null : h('button', { class: 'btn', onclick: () => starterWardrobe(ctx) }, ic('wand'), 'ארון לדוגמה')));
  wrap.append(h('div', { class: 'chips scroll mb' }, [{ id: 'all', label: `הכל (${s.wardrobe.length})` }, ...CATEGORIES.map((c) => ({ id: c.id, label: `${c.label} (${s.wardrobe.filter((w) => w.category === c.id).length})` }))].map((c) =>
    h('button', { class: 'chip' + (cat === c.id ? ' on' : ''), onclick: () => ctx.go(`#/style?tab=wardrobe&cat=${c.id}`) }, c.label))));
  const items = s.wardrobe.filter((w) => cat === 'all' || w.category === cat);
  wrap.append(items.length ? h('div', { class: 'ward-grid' }, items.map((it) => itemTile(it, { onclick: () => itemSheet(it, ctx) })))
    : h('div', { class: 'card' }, emptyState('shirt', s.wardrobe.length ? 'אין פריטים בקטגוריה הזו.' : 'הארון הדיגיטלי ריק. מוסיפים פריטים (עם או בלי תמונה), והסטייליסט יציע שילובים רק ממה שיש לך.')));
  return wrap;
}

function starterWardrobe(ctx) {
  const items = [
    ['טי לבנה', 'top', 'white', ['school', 'daily', 'out']], ['טי שחורה', 'top', 'black', ['school', 'daily', 'out']], ['קפוצ׳ון אפור', 'layer', 'grey', ['school', 'daily']],
    ['חולצה מכופתרת תכלת', 'top', 'lightblue', ['event', 'out']], ['ג׳ינס כהה', 'bottom', 'denim', ['school', 'daily', 'out']], ['צ׳ינו בז׳', 'bottom', 'beige', ['out', 'event']],
    ['ג׳וגר שחור', 'bottom', 'black', ['daily', 'sport']], ['סניקרס לבנות', 'shoes', 'white', ['school', 'daily', 'out']], ['נעלי עור חומות', 'shoes', 'brown', ['event']],
    ['שעון כסוף', 'watch', 'silver', ['out', 'event', 'daily']], ['אוברשירט זית', 'layer', 'olive', ['out', 'daily']], ['סט ספורט', 'sport', 'black', ['sport']],
  ];
  update((s) => { items.forEach(([name, category, color, occasions]) => s.wardrobe.push({ id: uid(), name, category, color, occasions, imageId: null, sample: true })); });
  toast('נוסף ארון לדוגמה – אפשר לערוך או למחוק כל פריט', 'wand');
  ctx.refresh();
}

function stylistTab(ctx) {
  const s = getState();
  const occ = ctx.query.get('occ') || 'daily';
  const seed = +(ctx.query.get('seed') || 1);
  const wrap = h('div');
  wrap.append(h('div', { class: 'card hero' },
    h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic('wand')), h('div', { class: 'grow' }, h('b', null, 'סטייליסט חכם'),
      h('div', { class: 'small muted' }, 'מציע שילובים רק מהפריטים שבארון שלך, לפי כללי התאמת צבעים ואירוע.'))),
    h('div', { class: 'chips mt' }, OCCASIONS.map((o) => h('button', { class: 'chip' + (occ === o.id ? ' on' : ''), onclick: () => ctx.go(`#/style?tab=stylist&occ=${o.id}`) }, o.label)))));
  if (s.profile.styles?.length) wrap.append(h('p', { class: 'small muted', style: { margin: '10px 4px' } }, ic('info'), ' ', s.profile.styles.map((id) => `${labelOf(STYLES, id)}: ${STYLE_TIPS[id]}`).join(' ')));
  const outfits = suggestOutfits(s.wardrobe, occ, { count: 3, seed: seed * 7919 + occ.length });
  if (!outfits.length) {
    const need = [];
    if (!s.wardrobe.some((w) => slotOf(w) === 'top' || slotOf(w) === 'dress' || slotOf(w) === 'sport')) need.push('חולצה');
    if (!s.wardrobe.some((w) => slotOf(w) === 'bottom' || slotOf(w) === 'dress' || slotOf(w) === 'sport')) need.push('מכנס/חצאית');
    wrap.append(h('div', { class: 'card mt' }, emptyState('shirt', need.length ? `כדי להציע לוק צריך לפחות: ${need.join(' ו')}. אפשר להוסיף פריטים בלשונית הארון.` : 'לא מצאנו שילוב מתאים לאירוע הזה. נסו לסמן עוד פריטים כמתאימים לאירוע, או להוסיף פריטים ניטרליים.',
      h('button', { class: 'btn sm mt', onclick: () => ctx.go('#/style?tab=wardrobe') }, ic('plus'), 'לארון'))));
  } else {
    outfits.forEach((o, i) => wrap.append(outfitCard(o, occ, ctx, i)));
    wrap.append(h('button', { class: 'btn block mt', onclick: () => ctx.go(`#/style?tab=stylist&occ=${occ}&seed=${seed + 1}`) }, ic('refresh'), 'הצעות נוספות'));
  }
  wrap.append(h('div', { class: 'row mt' },
    h('button', { class: 'btn grow', onclick: () => buildLook(ctx, occ) }, ic('layers'), 'לבנות לוק בעצמי'),
    h('button', { class: 'btn grow', onclick: () => ctx.go(`#/coach?q=${encodeURIComponent(`תציע לי לוק ל${OCCASIONS.find((x) => x.id === occ).label} מהבגדים שלי`)}`) }, ic('bot'), aiAvailable() ? 'AI Stylist' : 'לשאול את המאמן')));
  return wrap;
}

function outfitCard(o, occ, ctx, i) {
  return h('div', { class: 'card', style: { marginTop: '12px' } },
    h('div', { class: 'row between mb' }, h('b', null, `הצעה ${i + 1}`), h('span', { class: 'tag ' + (o.score >= 75 ? 'lime' : 'purple') }, `התאמה ${o.score}%`)),
    h('div', { class: 'outfit' }, o.items.map((it) => itemTile(it))),
    o.reasons.length ? h('ul', { class: 'dots small' }, o.reasons.slice(0, 3).map((r) => h('li', null, r))) : null,
    h('button', { class: 'btn sm mt', onclick: () => saveLook(o.items.map((x) => x.id), occ, ctx) }, ic('bookmark'), 'שמירת הלוק'));
}

function saveLook(itemIds, occ, ctx, name) {
  update((s) => { s.looks.unshift({ id: uid(), name: name || `לוק ${OCCASIONS.find((x) => x.id === occ)?.label || ''}`, itemIds, occasion: occ, created: todayKey() }); });
  toast('הלוק נשמר', 'bookmark');
  ctx.refresh();
}

function buildLook(ctx, occ) {
  const sel = new Set();
  sheet((api) => {
    const s = getState();
    const result = h('div');
    const grid = h('div', { class: 'ward-grid' });
    let name = '';
    const draw = () => {
      grid.replaceChildren(...s.wardrobe.map((it) => itemTile(it, { selected: sel.has(it.id), onclick: () => { sel.has(it.id) ? sel.delete(it.id) : sel.add(it.id); draw(); } })));
      const items = s.wardrobe.filter((w) => sel.has(w.id)).map((w) => ({ ...w, slot: slotOf(w) }));
      if (items.length < 2) { result.replaceChildren(h('p', { class: 'small muted' }, 'בחרו לפחות 2 פריטים כדי לקבל ניתוח התאמה.')); return; }
      const sc = scoreOutfit(items);
      result.replaceChildren(h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('b', null, 'ניתוח הלוק'), h('span', { class: 'tag ' + (sc.score >= 70 ? 'lime' : sc.score >= 50 ? 'purple' : 'amber') }, `${sc.score}%`)),
        h('ul', { class: 'dots small' }, (sc.reasons.length ? sc.reasons : ['שילוב סביר – אפשר לנסות להוסיף פריט ניטרלי']).map((r) => h('li', null, r)))));
    };
    draw();
    return h('div', null,
      sheetHead('בניית לוק', 'בחרו פריטים מהארון.', api),
      s.wardrobe.length ? grid : emptyState('shirt', 'הארון ריק עדיין.'),
      h('div', { class: 'mt' }, result),
      h('label', { class: 'field mt' }, h('span', null, 'שם ללוק (לא חובה)'), h('input', { class: 'input', maxlength: 40, oninput: (e) => (name = e.target.value) })),
      h('button', { class: 'btn primary block', onclick: () => { if (sel.size < 2) return toast('בחרו לפחות 2 פריטים', 'info'); api.close(); saveLook([...sel], occ, ctx, name.trim() || undefined); } }, ic('bookmark'), 'שמירה'));
  });
}

function looksTab(ctx) {
  const s = getState();
  const byId = Object.fromEntries(s.wardrobe.map((w) => [w.id, w]));
  if (!s.looks.length) return h('div', { class: 'card' }, emptyState('bookmark', 'אין עדיין לוקים שמורים. שמרו הצעה מהסטייליסט או בנו לוק בעצמכם.', h('button', { class: 'btn sm mt', onclick: () => ctx.go('#/style?tab=stylist') }, ic('wand'), 'לסטייליסט')));
  return h('div', null, s.looks.map((l) => h('div', { class: 'card', style: { marginTop: '12px' } },
    h('div', { class: 'row between mb' }, h('div', null, h('b', null, l.name), h('div', { class: 'tiny muted' }, OCCASIONS.find((o) => o.id === l.occasion)?.label || '')),
      h('button', { class: 'icon-btn', 'aria-label': 'מחיקת לוק', onclick: async () => { if (await confirmDialog('למחוק את הלוק?', l.name, { ok: 'מחיקה', danger: true })) { update((st) => { st.looks = st.looks.filter((x) => x.id !== l.id); }); ctx.refresh(); } } }, ic('trash'))),
    h('div', { class: 'outfit' }, l.itemIds.map((id) => byId[id]).filter(Boolean).map((it) => itemTile(it))))));
}

function guidesTab(ctx) {
  const wrap = h('div');
  // quick color matcher
  let a = 'navy', b = 'white';
  const out = h('div', { class: 'mt' });
  const draw = () => {
    const ok = colorsWork(a, b);
    out.replaceChildren(note(ok ? `${COLOR[a].label} + ${COLOR[b].label}: עובדים יחד ✓` : `${COLOR[a].label} + ${COLOR[b].label}: שילוב מאתגר – עדיף להוסיף פריט ניטרלי ביניהם או לבחור אחד מהם.`, ok ? '' : 'warn'));
  };
  const picker = (get, set) => h('select', { class: 'input', onchange: (e) => { set(e.target.value); draw(); } }, COLORS.filter((c) => c.id !== 'multi').map((c) => h('option', { value: c.id, selected: get() === c.id }, c.label)));
  wrap.append(h('div', { class: 'card hero' }, h('b', null, 'בודק התאמת צבעים'),
    h('div', { class: 'grid2 mt' }, picker(() => a, (v) => (a = v)), picker(() => b, (v) => (b = v))), out));
  draw();
  wrap.append(section('מדריכי סטייל'));
  wrap.append(h('div', { class: 'list' }, guidesByArea('style').map((g) => listRow({ icon: g.icon, title: g.title, desc: g.summary, onclick: () => ctx.go('#/guide/' + g.id) }))));
  wrap.append(h('div', { class: 'mt' }, h('button', { class: 'btn block', onclick: () => ctx.go('#/products?group=clothes') }, ic('bag'), 'מדריך בגדים ואביזרים')));
  return wrap;
}

export default function style(ctx) {
  const tab = ctx.query.get('tab') || 'wardrobe';
  const s = getState();
  const root = h('main');
  root.append(topbar('סטייל ולבוש', { sub: (s.profile.styles || []).map((id) => labelOf(STYLES, id)).join(' · ') || 'הארון הדיגיטלי שלך' }));
  const tabs = [['wardrobe', 'ארון'], ['stylist', 'סטייליסט'], ['shop', `קניות (${(s.styleShop || []).filter((x) => !x.bought).length})`], ['looks', `לוקים (${s.looks.length})`], ['guides', 'מדריכים']];
  root.append(h('div', { class: 'tabs', role: 'tablist', 'data-tour': 'style-tabs' }, tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', class: tab === id ? 'on' : '', onclick: () => ctx.go(`#/style?tab=${id}`) }, label))));
  root.append(tab === 'wardrobe' ? wardrobeTab(ctx) : tab === 'stylist' ? stylistTab(ctx) : tab === 'shop' ? shopTab(ctx) : tab === 'looks' ? looksTab(ctx) : guidesTab(ctx));
  return root;
}

function shopTab(ctx) {
  const s = getState();
  const list = s.styleShop || [];
  const wrap = h('div');
  const toBuy = list.filter((x) => !x.bought), bought = list.filter((x) => x.bought);
  wrap.append(h('div', { class: 'card hero' },
    h('b', null, 'רשימת הקניות שלך'),
    h('p', { class: 'small' }, 'פריטים שבאמת ישדרגו את הלוק – לפי הסגנון שלך, הצבעים שמתאימים לך ומה שכבר יש בארון. כשקונים – לוחצים "קניתי" והפריט נכנס לארון הדיגיטלי.'),
    h('button', { class: 'btn sm mt', onclick: () => ctx.go('#/scan') }, ic('camera'), 'התאמה אישית מסריקת תמונה')));
  const row = (it) => h('div', { class: 'list-row', style: { alignItems: 'flex-start' } },
    h('span', { class: 'swatch', style: { background: COLOR[it.color]?.hex, width: '26px', height: '26px', marginTop: '2px' } }),
    h('div', { class: 'grow' }, h('div', { class: 't', style: it.bought ? { textDecoration: 'line-through', opacity: 0.6 } : null }, it.name), h('div', { class: 'd' }, [catOf(it.category).label, it.price, it.why].filter(Boolean).join(' · '))),
    it.bought ? null : h('button', { class: 'btn sm primary', onclick: () => {
      update((st) => { const x = st.styleShop.find((y2) => y2.id === it.id); x.bought = true; st.wardrobe.push({ id: uid(), name: it.name, category: it.category, color: it.color, occasions: ['daily', 'out', 'school'], imageId: null }); });
      toast('מעולה! נוסף לארון הדיגיטלי', 'shirt'); ctx.refresh();
    } }, ic('check'), 'קניתי'),
    h('button', { class: 'icon-btn', 'aria-label': 'הסרה', onclick: () => { update((st) => { st.styleShop = st.styleShop.filter((y2) => y2.id !== it.id); }); ctx.refresh(); } }, ic('x')));
  if (toBuy.length) { wrap.append(section(`לקנות (${toBuy.length})`)); wrap.append(h('div', { class: 'list' }, toBuy.map(row))); }
  const sugg = capsuleFor(s.profile.styles, s.wardrobe).filter((c) => !list.some((x) => x.name === c.name));
  if (sugg.length) {
    wrap.append(section('מומלץ לסגנון שלך'));
    wrap.append(h('div', { class: 'list' }, sugg.map((it) => h('div', { class: 'list-row', style: { alignItems: 'flex-start' } },
      h('span', { class: 'swatch', style: { background: COLOR[it.color]?.hex, width: '26px', height: '26px', marginTop: '2px' } }),
      h('div', { class: 'grow' }, h('div', { class: 't' }, it.name), h('div', { class: 'd' }, `${it.why} · ${it.price}`)),
      h('button', { class: 'btn sm', onclick: () => { update((st) => { st.styleShop = [...(st.styleShop || []), { id: uid(), ...it, bought: false }]; }); toast('נוסף לרשימה', 'bag'); ctx.refresh(); } }, ic('plus'), 'לרשימה')))));
  }
  if (bought.length) { wrap.append(section(`נקנו (${bought.length})`)); wrap.append(h('div', { class: 'list' }, bought.map(row))); }
  wrap.append(h('div', { class: 'mt' }, note('טיפ: לקנות קודם את פריטי הבסיס (טי, ג׳ינס, סניקרס) – הם יוצרים הכי הרבה לוקים. מידה נכונה חשובה יותר ממותג.')));
  return wrap;
}
