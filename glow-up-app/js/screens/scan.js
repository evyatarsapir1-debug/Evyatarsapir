// "סריקת גלואו אפ" – upload photos (or measure), get a personal plan: face shape, haircut,
// jawline actions, skin, beard/brows, cut/bulk recommendation, what clothes to buy, and a checklist.
import { h, ic, toast, note, sheet, sheetHead, chips, confirmDialog, emptyState, pickImage, bar, burst } from '../ui.js';
import { getState, update, todayKey, uid, images } from '../store.js';
import { CUT, haircutSVG, HAIR_COLORS } from '../data/haircuts.js';
import { COLOR, CATEGORIES } from '../data/style.js';
import { visionOn, aiOn, aiErrorText, hasSample } from '../ai.js';
import { aiScan, localScan, FACE_LABEL } from '../scan.js';
import { topbar, section, fmtDate, cheer } from './common.js';

const REC = { cut: ['חיטוב', 'flame', 'להוריד אחוז שומן'], bulk: ['בניית מסה', 'dumbbell', 'לבנות שריר'], recomp: ['ריקומפוזיציה', 'refresh', 'שריר + פחות שומן'], none: ['', 'info', ''] };

/** Downscale a picked file to a JPEG Blob (keeps uploads small and strips EXIF). */
export function fileToBlob(file, maxSide = 1280) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) return reject(new Error('not an image'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

export default function scan(ctx) {
  const s = getState();
  const root = h('main');
  const id = ctx.query.get('id');
  const fresh = ctx.query.get('new') || !s.scans?.length;
  root.append(topbar('סריקת גלואו אפ', { sub: 'תמונה → תוכנית שינוי אישית', back: '#/home' }));
  if (fresh) root.append(newScan(ctx));
  else {
    const sc = (id && s.scans.find((x) => x.id === id)) || s.scans[0];
    root.append(results(sc, ctx));
  }
  return root;
}

// ---------------- new scan ----------------
function newScan(ctx) {
  const wrap = h('div');
  const vision = visionOn();
  const slots = [
    { key: 'front', label: 'פנים ושיער מלפנים', hint: 'אור יום, בלי פילטר, שיער כמו ביום רגיל', required: true },
    { key: 'side', label: 'פרופיל מהצד', hint: 'קו הלסת והצוואר', required: false },
    { key: 'body', label: 'גוף מלא', hint: 'בגדים צמודים יחסית, עמידה רגילה', required: false },
  ];
  const picked = {};
  let saveToJournal = false;
  let manual = !vision || ctx.query.get('manual') === '1';

  wrap.append(h('div', { class: 'card hero' },
    h('h3', null, 'מה תקבל/י מהסריקה'),
    h('ul', { class: 'dots small' },
      h('li', null, 'צורת הפנים שלך ואיזו תספורת תתאים – ואיזו לא'),
      h('li', null, 'מה לעשות כדי שקו הלסת ייראה מוגדר יותר'),
      h('li', null, 'זקן, גבות ועור – פעולות מדויקות'),
      h('li', null, 'חיטוב, מסה או ריקומפוזיציה – והמסלול המתאים'),
      h('li', null, 'אילו בגדים לקנות ובאילו צבעים'),
      h('li', null, 'רשימת פעולות לשבוע הקרוב ותוכנית ל-12 שבועות'))));

  if (!manual) {
    wrap.append(section('התמונות שלך'));
    const grid = h('div', { class: 'grid3' });
    const drawSlot = (sl) => {
      const box = h('button', { class: 'card tap', style: { marginTop: 0, padding: '0', aspectRatio: '3/4', display: 'grid', placeItems: 'center', overflow: 'hidden', textAlign: 'center' }, 'data-slot': sl.key,
        onclick: async () => {
          const f = await pickImage();
          if (!f) return;
          try { picked[sl.key] = await fileToBlob(f); redraw(); } catch { toast('לא הצלחנו לקרוא את התמונה', 'alert'); }
        } });
      if (picked[sl.key]) {
        const img = h('img', { src: URL.createObjectURL(picked[sl.key]), alt: sl.label, style: { width: '100%', height: '100%', objectFit: 'cover' } });
        box.append(img);
      } else box.append(h('div', { style: { padding: '8px' } }, ic('camera'), h('div', { class: 'small', style: { fontWeight: 600, marginTop: '6px' } }, sl.label), h('div', { class: 'tiny muted' }, sl.required ? 'חובה' : 'לא חובה')));
      return h('div', null, box, h('p', { class: 'tiny muted', style: { marginTop: '6px' } }, sl.hint));
    };
    const redraw = () => grid.replaceChildren(...slots.map(drawSlot));
    redraw();
    wrap.append(grid);
    wrap.append(h('div', { class: 'mt' }, note(hasSample()
      ? 'התמונות נשלחות לניתוח ל-Claude דרך החשבון שלך (בפעם הראשונה תתבקש/י לאשר). GLOW UP לא שומרת אותן בשום שרת. אין כאן ציונים או דירוג – רק המלצות מה לעשות.'
      : 'התמונות נשלחות לניתוח ל-Claude עם מפתח ה-API שהגדרת. GLOW UP לא שומרת אותן בשום שרת. אין כאן ציונים או דירוג – רק המלצות מה לעשות.', '', 'lock')));
    wrap.append(h('label', { class: 'list-row', style: { padding: '12px 0', border: 0, cursor: 'pointer' } },
      h('div', { class: 'grow' }, h('div', { class: 't' }, 'לשמור את תמונת הפנים ביומן הפרטי'), h('div', { class: 'd' }, 'לצורך השוואה לפני/אחרי – רק במכשיר הזה')),
      h('span', { class: 'switch' }, h('input', { type: 'checkbox', 'aria-label': 'שמירה ביומן', onchange: (e) => (saveToJournal = e.target.checked) }), h('span'))));
    const status = h('div');
    const go = h('button', { class: 'btn primary block', 'data-scan-go': '', onclick: async () => {
      if (!picked.front) return toast('צריך לפחות תמונת פנים מלפנים', 'info');
      const imgs = slots.filter((sl) => picked[sl.key]).map((sl) => ({ blob: picked[sl.key], label: sl.label }));
      const ctl = new AbortController();
      go.disabled = true;
      const steps = ['מזהה צורת פנים…', 'בודק קו לסת ויציבה…', 'מתאים תספורות…', 'בונה רשימת קניות…', 'מרכיב תוכנית שבועית…'];
      let k = 0;
      const msg = h('p', { class: 'small muted center' }, steps[0]);
      const tick = setInterval(() => { k = Math.min(steps.length - 1, k + 1); msg.textContent = steps[k]; }, 6000);
      status.replaceChildren(h('div', { class: 'card center' }, h('div', { class: 'spinner', style: { width: '48px', height: '48px', margin: '0 auto 12px', borderRadius: '50%', border: '4px solid var(--surface-2)', borderTopColor: 'var(--purple-2)', animation: 'spin 1s linear infinite' } }), h('b', null, 'מנתח את התמונות…'), msg,
        h('p', { class: 'tiny muted' }, 'זה לוקח בדרך כלל חצי דקה עד שתי דקות.'),
        h('button', { class: 'btn sm mt', onclick: () => ctl.abort() }, ic('x'), 'עצירה')));
      try {
        const result = await aiScan(imgs, { signal: ctl.signal });
        let photoId = null;
        if (saveToJournal) {
          const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(picked.front); });
          photoId = await images.put(dataUrl);
        }
        finishScan(result, photoId, ctx);
      } catch (e) {
        status.replaceChildren(note(`הניתוח לא הושלם: ${aiErrorText(e)}`, 'warn'), h('button', { class: 'btn block mt', onclick: () => ctx.go('#/scan?new=1&manual=1') }, ic('ruler'), 'לעבור לבדיקה ידנית'));
      } finally { clearInterval(tick); go.disabled = false; }
    } }, ic('wand'), 'לנתח ולבנות לי תוכנית');
    wrap.append(go, h('div', { class: 'mt' }, status));
    wrap.append(h('button', { class: 'btn ghost block mt', onclick: () => ctx.go('#/scan?new=1&manual=1') }, ic('ruler'), 'בלי תמונה – בדיקה ידנית'));
  } else {
    if (!vision) wrap.append(h('div', { class: 'mt' }, note(aiOn() ? 'ניתוח תמונה לא זמין בתצוגה הזו, אז נעשה בדיקה ידנית מדויקת עם סרט מדידה.' : 'כרגע אין מודל AI מחובר, אז הבדיקה ידנית: 4 מדידות בסרט מדידה (או חוט וסרגל) נותנות צורת פנים מדויקת, ומהן נבנית התוכנית. כשהאפליקציה פתוחה דרך הקישור של Claude אפשר לנתח גם מתמונה.')));
    wrap.append(manualForm(ctx));
  }
  return wrap;
}

function manualForm(ctx) {
  const a = { forehead: '', cheek: '', jaw: '', length: '', angular: false };
  const field = (key, label, how) => h('label', { class: 'field' }, h('span', null, label), h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 5, max: 40, step: 0.5, placeholder: 'ס״מ', 'data-measure': key, oninput: (e) => (a[key] = e.target.value) }), h('span', { class: 'tiny muted', style: { display: 'block', marginTop: '4px' } }, how));
  return h('div', null,
    section('מדידת פנים (2 דקות)'),
    h('div', { class: 'card' },
      field('forehead', 'רוחב המצח', 'מרקה לרקה, באמצע המצח.'),
      field('cheek', 'רוחב עצמות הלחיים', 'בנקודה הרחבה ביותר, מתחת לעיניים.'),
      field('jaw', 'רוחב הלסת', 'מזווית הלסת (מתחת לאוזן) לזווית השנייה – אפשר למדוד חצי ולהכפיל.'),
      field('length', 'אורך הפנים', 'מקו השיער באמצע המצח עד קצה הסנטר.'),
      h('div', { class: 'field' }, h('span', null, 'זווית הלסת'), chips([{ id: 'r', label: 'מעוגלת' }, { id: 'a', label: 'זוויתית / חדה' }], 'r', (v) => (a.angular = v === 'a'), { multi: false }))),
    h('button', { class: 'btn primary block mt', 'data-manual-go': '', onclick: () => {
      if (!(+a.forehead && +a.cheek && +a.jaw && +a.length)) return toast('צריך למלא את 4 המדידות', 'info');
      finishScan(localScan(a), null, ctx);
    } }, ic('wand'), 'לבנות לי תוכנית'));
}

function finishScan(result, photoId, ctx) {
  const sc = { id: uid(), date: todayKey(), result, done: {}, photoId };
  update((s) => {
    s.scans = [sc, ...(s.scans || [])].slice(0, 12);
    if (result.faceShape) s.profile.faceShape = result.faceShape;
    if (photoId) s.photos.unshift({ id: uid(), imageId: photoId, date: todayKey(), note: 'סריקת גלואו אפ' });
  });
  toast('התוכנית שלך מוכנה! 🔥', 'wand');
  ctx.go('#/scan?id=' + sc.id);
}

// ---------------- results ----------------
function results(sc, ctx) {
  const r = sc.result;
  const s = getState();
  const wrap = h('div');
  const hairColor = (HAIR_COLORS.find((c) => c.id === (s.profile.hairColor || 'brown')) || HAIR_COLORS[1]).c;

  wrap.append(h('div', { class: 'card hero' },
    h('div', { class: 'row between' }, h('span', { class: 'tag purple' }, ic(r.source === 'ai' ? 'wand' : 'ruler'), r.source === 'ai' ? 'ניתוח AI מתמונה' : 'בדיקה ידנית'), h('span', { class: 'tiny muted' }, fmtDate(sc.date, { day: 'numeric', month: 'long' }))),
    r.faceShape ? h('h3', { class: 'mt', style: { fontSize: '20px' } }, `צורת פנים: ${FACE_LABEL[r.faceShape]}`) : null,
    r.faceShapeWhy ? h('p', { class: 'small' }, r.faceShapeWhy) : null,
    r.summary ? h('p', { class: 'mt', style: { color: 'var(--text)' } }, r.summary) : null,
    r.strengths?.length ? h('div', { class: 'chips mt' }, r.strengths.map((x) => h('span', { class: 'tag lime' }, ic('star'), x))) : null));

  // action checklist
  const done = sc.done || {};
  const total = r.quickWins.length;
  const n = r.quickWins.filter((_, i) => done[i]).length;
  wrap.append(section('מה לעשות השבוע'));
  wrap.append(h('div', { class: 'card', 'data-scan-plan': '' },
    h('div', { class: 'row between' }, h('b', null, `${n}/${total} בוצעו`), n === total && total ? h('span', { class: 'tag lime' }, 'הושלם 🎉') : null),
    h('div', { class: 'mt' }, bar(total ? n / total : 0)),
    ...r.quickWins.map((q, i) => h('div', { class: 'task' + (done[i] ? ' done' : ''), style: { marginTop: '8px' } },
      h('button', { class: 'check' + (done[i] ? ' on' : ''), 'aria-label': q.title, 'aria-pressed': done[i] ? 'true' : 'false', onclick: (e) => {
        update((st) => { const x = st.scans.find((y) => y.id === sc.id); x.done = { ...(x.done || {}), [i]: !done[i] }; });
        if (!done[i]) { const rc = e.currentTarget.getBoundingClientRect(); burst(rc.left + 15, rc.top + 15); toast(cheer(), 'check'); }
        ctx.refresh();
      } }, ic('check')),
      h('div', { class: 'task-body' }, h('span', { class: 'task-title' }, q.title), h('span', { class: 'tiny muted' }, `${q.minutes} דק׳`)))),
    h('button', { class: 'btn sm mt', onclick: () => {
      update((st) => { r.quickWins.forEach((q, i) => { if (!done[i] && !st.program.extraTasks.some((x) => x.title === q.title)) st.program.extraTasks.push({ id: 'custom-' + uid(), title: q.title, minutes: q.minutes, note: 'מסריקת הגלואו אפ' }); }); });
      toast('נוסף למשימות היומיות', 'check');
    } }, ic('plus'), 'להוסיף למשימות היומיות')));

  // hair
  wrap.append(section('שיער ותספורת'));
  if (r.hair.current) wrap.append(h('p', { class: 'small muted', style: { margin: '0 4px 10px' } }, `עכשיו: ${r.hair.current}`));
  wrap.append(r.hair.recommended.length ? h('div', { class: 'stack' }, r.hair.recommended.map((x, i) => {
    const c = CUT[x.id];
    const saved = s.savedCuts.includes(c.id);
    return h('div', { class: 'card', style: { marginTop: i ? '12px' : 0 } },
      h('div', { class: 'row', style: { alignItems: 'flex-start' } },
        h('button', { class: 'media', style: { width: '96px', height: '96px', flexShrink: 0, padding: 0, border: 0 }, html: haircutSVG(c, { hairColor }), 'aria-label': c.name, onclick: () => ctx.go('#/cut/' + c.id) }),
        h('div', { class: 'grow' },
          h('div', { class: 'row between' }, h('b', null, `${i === 0 ? '⭐ ' : ''}${c.name}`), h('span', { class: 'tag' }, c.en)),
          x.why ? h('p', { class: 'small', style: { marginTop: '4px' } }, x.why) : null,
          x.askBarber ? h('p', { class: 'tiny muted', style: { marginTop: '4px' } }, `לספר: ${x.askBarber}`) : null)),
      h('div', { class: 'row mt' },
        h('button', { class: 'btn sm grow', onclick: () => ctx.go('#/cut/' + c.id) }, 'פרטים מלאים'),
        h('button', { class: 'btn sm grow' + (saved ? '' : ' primary'), onclick: () => { update((st) => { st.savedCuts = saved ? st.savedCuts.filter((y) => y !== c.id) : [...st.savedCuts, c.id]; }); ctx.refresh(); } }, ic('bookmark'), saved ? 'שמור' : 'לשמור')));
  })) : h('div', { class: 'card' }, emptyState('scissors', 'לא התקבלה המלצה לתספורת.')));
  if (r.hair.avoid.length) wrap.append(h('div', { class: 'card' }, h('b', null, 'מה פחות יתאים'), h('ul', { class: 'dots small' }, r.hair.avoid.map((x) => h('li', null, h('b', null, x.name), ` – ${x.why}`)))));
  if (r.hair.styling || r.hair.products.length) wrap.append(h('div', { class: 'card' }, h('b', null, 'סידור ומוצרים'), r.hair.styling ? h('p', { class: 'small mt' }, r.hair.styling) : null, r.hair.products.length ? h('div', { class: 'chips mt' }, r.hair.products.map((x) => h('span', { class: 'tag' }, x))) : null));

  // jaw & face
  wrap.append(section('קו לסת ופנים'));
  wrap.append(h('div', { class: 'card' },
    r.jaw.observation ? h('p', { class: 'small' }, r.jaw.observation) : null,
    r.jaw.actions.length ? h('ol', { class: 'steps' }, r.jaw.actions.map((x) => h('li', null, x))) : null,
    h('p', { class: 'tiny muted' }, 'מבנה העצמות לא משתנה מתרגילים – אבל ההגדרה של הלסת כן משתנה עם אחוז שומן, נפיחות, יציבה וזקן.')));
  const extras = [r.beard && ['brush', 'זקן', r.beard], r.brows && ['eyebrow', 'גבות', r.brows]].filter(Boolean);
  if (extras.length) wrap.append(h('div', { class: 'list' }, extras.map(([icn, t, d]) => h('div', { class: 'list-row', style: { alignItems: 'flex-start' } }, h('span', { class: 'ico' }, ic(icn)), h('div', { class: 'grow' }, h('div', { class: 't' }, t), h('div', { class: 'd' }, d))))));
  wrap.append(h('div', { class: 'card' }, h('b', null, 'עור'), r.skin.observation ? h('p', { class: 'small mt' }, r.skin.observation) : null,
    r.skin.actions.length ? h('ul', { class: 'dots small' }, r.skin.actions.map((x) => h('li', null, x))) : null,
    r.skin.seeDermatologist ? note('כדאי לקבוע תור לרופא/ת עור – יש טיפולים במרשם שעובדים הרבה יותר טוב ממוצרים מהמדף.', 'med') : null));

  // body
  if (r.body.recommendation !== 'none' || r.body.observation) {
    const [lbl, icn, sub] = REC[r.body.recommendation];
    const goal = r.body.recommendation;
    wrap.append(section('גוף'));
    wrap.append(h('div', { class: 'card glow' },
      lbl ? h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic(icn)), h('div', { class: 'grow' }, h('b', null, `ההמלצה: ${lbl}`), h('div', { class: 'tiny muted' }, sub))) : null,
      r.body.observation ? h('p', { class: 'small mt' }, r.body.observation) : null,
      r.body.why ? h('p', { class: 'small mt', style: { color: 'var(--text)' } }, r.body.why) : null,
      lbl ? h('button', { class: 'btn primary block mt', onclick: () => ctx.go(`#/transform?setup=1&goal=${goal}`) }, ic('flame'), s.transform?.active ? 'לעדכן את מסלול השינוי' : `להתחיל מסלול ${lbl}`) : null));
  }

  // style
  wrap.append(section('בגדים לקנות'));
  if (r.style.colors.length) wrap.append(h('div', { class: 'card' }, h('b', null, 'הצבעים שלך'),
    h('div', { class: 'row wrap mt', style: { gap: '10px' } }, r.style.colors.map((c) => h('span', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'swatch', style: { background: COLOR[c].hex, width: '22px', height: '22px' } }), h('span', { class: 'small' }, COLOR[c].label)))),
    r.style.colorsWhy ? h('p', { class: 'small mt' }, r.style.colorsWhy) : null));
  const shop = s.styleShop || [];
  wrap.append(h('div', { class: 'list' }, r.style.buy.map((it) => {
    const inList = shop.some((x) => x.name === it.name);
    return h('div', { class: 'list-row', style: { alignItems: 'flex-start' } },
      h('span', { class: 'swatch', style: { background: COLOR[it.color]?.hex, width: '26px', height: '26px', marginTop: '2px' } }),
      h('div', { class: 'grow' }, h('div', { class: 't' }, it.name), h('div', { class: 'd' }, `${it.why}${it.price ? ` · ${it.price}` : ''}`)),
      h('button', { class: 'btn sm' + (inList ? '' : ' primary'), onclick: () => {
        update((st) => { st.styleShop ||= []; if (inList) st.styleShop = st.styleShop.filter((x) => x.name !== it.name); else st.styleShop.push({ id: uid(), ...it, bought: false }); });
        toast(inList ? 'הוסר מהרשימה' : 'נוסף לרשימת הקניות', 'bag'); ctx.refresh();
      } }, ic(inList ? 'check' : 'plus'), inList ? 'ברשימה' : 'לרשימה'));
  })));
  if (r.style.avoid.length) wrap.append(h('div', { class: 'card' }, h('b', null, 'כדאי להימנע'), h('ul', { class: 'dots small' }, r.style.avoid.map((x) => h('li', null, x)))));
  wrap.append(h('button', { class: 'btn block mt', onclick: () => ctx.go('#/style?tab=shop') }, ic('bag'), 'לרשימת הקניות'));

  // plan
  if (r.plan.length) {
    wrap.append(section('התוכנית ל-12 שבועות'));
    wrap.append(h('div', { class: 'list' }, r.plan.map((ph) => h('div', { class: 'list-row', style: { alignItems: 'flex-start' } },
      h('span', { class: 'tag purple', style: { minWidth: '62px', justifyContent: 'center' } }, `שבוע ${ph.weeks}`),
      h('div', { class: 'grow' }, h('div', { class: 't' }, ph.focus), h('ul', { class: 'dots small', style: { margin: '4px 0 0' } }, ph.actions.map((x) => h('li', null, x))))))));
  }

  wrap.append(h('p', { class: 'tiny muted center mt2' }, r.source === 'ai' ? 'ההמלצות נוצרו על ידי AI ועלולות לטעות. בעניינים רפואיים – רופא/ה.' : 'ההמלצות מבוססות על המדידות והפרופיל שלך.'));
  wrap.append(h('div', { class: 'row mt' },
    h('button', { class: 'btn primary grow', onclick: () => ctx.go('#/scan?new=1') }, ic('camera'), 'סריקה חדשה'),
    h('button', { class: 'btn grow', onclick: () => ctx.go(`#/coach?q=${encodeURIComponent('יש לי שאלה על תוצאות הסריקה שלי')}`) }, ic('bot'), 'לשאול את המאמן')));

  const all = s.scans || [];
  if (all.length > 1) {
    wrap.append(section('סריקות קודמות'));
    wrap.append(h('div', { class: 'list' }, all.map((x) => h('button', { class: 'list-row', onclick: () => ctx.go('#/scan?id=' + x.id) },
      h('span', { class: 'ico' }, ic(x.result.source === 'ai' ? 'wand' : 'ruler')),
      h('div', { class: 'grow' }, h('div', { class: 't' }, fmtDate(x.date, { day: 'numeric', month: 'long', year: 'numeric' })), h('div', { class: 'd' }, x.result.faceShape ? `צורת פנים ${FACE_LABEL[x.result.faceShape]}` : '')),
      x.id === sc.id ? h('span', { class: 'tag purple' }, 'מוצגת') : ic('chevron', 'chev')))));
  }
  return wrap;
}
