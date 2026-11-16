// Settings & profile: edit profile, AI coach connection, appearance, tour, privacy & data.
import { h, ic, sheet, sheetHead, toast, confirmDialog, note, listRow, toggle, chips, pickImage, readImage } from '../ui.js';
import { getState, update, images, storedImg, resetAll, exportData, importData } from '../store.js';
import { GOALS, SKIN_TYPES, HAIR_TYPES, HAIR_LENGTHS, STYLES, FITNESS_LEVELS, AREAS, ADDRESS, labelOf } from '../data/profile.js';
import { MODEL, testKey } from '../coach-ai.js';
import { topbar, section } from './common.js';

export default function settings(ctx) {
  const s = getState();
  const p = s.profile;
  const sec = ctx.query.get('sec');
  const root = h('main');
  root.append(topbar('הגדרות ופרופיל', { back: '#/home' }));

  // profile header
  const av = h('button', { class: 'avatar', style: { width: '72px', height: '72px', fontSize: '28px' }, 'aria-label': 'תמונת פרופיל', onclick: () => avatarSheet(ctx) }, p.avatarId ? storedImg(p.avatarId, '') : p.name.charAt(0));
  root.append(h('div', { class: 'card hero' }, h('div', { class: 'row' }, av,
    h('div', { class: 'grow' }, h('h3', { style: { margin: 0 } }, p.name), h('p', { class: 'small' }, `גיל ${p.age} · ${p.areas.length} תחומים · ${p.minutes} דק׳ ביום`),
      h('button', { class: 'btn sm mt', onclick: () => avatarSheet(ctx) }, ic('camera'), p.avatarId ? 'החלפת תמונה' : 'תמונת פרופיל (לא חובה)')))));

  // profile fields
  root.append(section('הפרופיל שלי'));
  const field = (title, value, edit) => listRow({ title, desc: value || 'לא הוגדר', onclick: edit });
  root.append(h('div', { class: 'list' },
    field('שם וצורת פנייה', `${p.name} · ${labelOf(ADDRESS, p.address)}`, () => editName(ctx)),
    field('גיל', String(p.age), () => editAge(ctx)),
    field('מטרות', p.goals.map((g) => labelOf(GOALS, g)).join(', '), () => editMulti(ctx, 'מטרות', GOALS, 'goals')),
    field('תחומים לשיפור', p.areas.map((a) => labelOf(AREAS, a)).join(', '), () => editMulti(ctx, 'תחומים לשיפור', AREAS, 'areas', 'התחומים קובעים אילו משימות יופיעו בתוכנית.')),
    field('סוג עור', labelOf(SKIN_TYPES, p.skinType), () => editSingle(ctx, 'סוג עור', SKIN_TYPES, 'skinType')),
    field('סוג שיער', `${labelOf(HAIR_TYPES, p.hairType)} · ${labelOf(HAIR_LENGTHS, p.hairLength)}`, () => editSingle(ctx, 'סוג שיער', HAIR_TYPES, 'hairType', HAIR_LENGTHS)),
    field('סגנון לבוש', p.styles.map((x) => labelOf(STYLES, x)).join(', '), () => editMulti(ctx, 'סגנון לבוש', STYLES, 'styles')),
    field('ניסיון באימונים', labelOf(FITNESS_LEVELS, p.fitnessLevel), () => editSingle(ctx, 'ניסיון באימונים', FITNESS_LEVELS, 'fitnessLevel')),
    field('זמן פנוי ביום', `${p.minutes} דקות`, () => editSingle(ctx, 'זמן פנוי ביום', [10, 20, 30, 45, 60].map((m) => ({ id: m, label: `${m} דקות` })), 'minutes'))));

  // coach
  const coachSec = h('div', { id: 'coach-settings' });
  coachSec.append(section('מאמן AI'));
  coachSec.append(coachCard(ctx));
  root.append(coachSec);
  if (sec === 'coach') requestAnimationFrame(() => coachSec.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  // appearance
  root.append(section('תצוגה'));
  root.append(h('div', { class: 'list' },
    h('div', { class: 'list-row' }, h('span', { class: 'ico' }, ic(s.settings.theme === 'light' ? 'sun' : 'moon')), h('div', { class: 'grow t' }, 'מצב כהה'),
      toggle(s.settings.theme !== 'light', (v) => { update((st) => { st.settings.theme = v ? 'dark' : 'light'; }); ctx.refresh(); }, 'מצב כהה')),
    h('div', { class: 'list-row' }, h('span', { class: 'ico' }, ic('zap')), h('div', { class: 'grow' }, h('div', { class: 't' }, 'הפחתת אנימציות'), h('div', { class: 'd' }, 'מעברים ותנועה מינימליים')),
      toggle(s.settings.motion === 'reduce', (v) => { update((st) => { st.settings.motion = v ? 'reduce' : 'auto'; }); }, 'הפחתת אנימציות'))));

  // help
  root.append(section('עזרה'));
  root.append(h('div', { class: 'list' },
    listRow({ icon: 'help', title: 'הפעלת ההדרכה מחדש', desc: 'סיור קצר בכל חלקי האפליקציה', onclick: () => { ctx.go('#/home'); setTimeout(() => import('../tour.js').then((m) => m.startTour()), 400); } }),
    listRow({ icon: 'heartPulse', title: 'מתי לפנות לרופא או לאיש מקצוע', onclick: () => ctx.go('#/guide/when-doctor') }),
    listRow({ icon: 'info', title: 'כל המדריכים', onclick: () => ctx.go('#/learn') })));

  // privacy
  root.append(section('פרטיות ומידע'));
  root.append(note('כל המידע שלך – פרופיל, משימות, תמונות וארון – נשמר **רק במכשיר הזה**, בדפדפן. אין חשבון ואין שרת של GLOW UP. מידע נשלח החוצה רק אם חיברת מאמן AI, ורק טקסט (אף פעם לא תמונות).', '', 'shield'));
  root.append(h('div', { class: 'list mt' },
    listRow({ icon: 'download', title: 'ייצוא המידע שלי', desc: 'קובץ גיבוי JSON (ללא תמונות וללא מפתח API)', onclick: () => doExport() }),
    listRow({ icon: 'upload', title: 'ייבוא מגיבוי', desc: 'שחזור מקובץ JSON', onclick: () => doImport(ctx) }),
    listRow({ icon: 'image', title: 'מחיקת כל התמונות', desc: `${s.photos.length} ביומן · ${s.wardrobe.filter((w) => w.imageId).length} בארון${p.avatarId ? ' · תמונת פרופיל' : ''}`, onclick: () => deletePhotos(ctx) }),
    listRow({ icon: 'trash', title: 'מחיקת כל המידע', desc: 'איפוס מלא של האפליקציה', color: '#fb7185', onclick: () => deleteAll() })));

  root.append(h('div', { class: 'center mt2' }, h('div', { class: 'logo', style: { fontSize: '20px' } }, 'GLOW', h('span', null, 'UP')),
    h('p', { class: 'tiny muted' }, 'גרסה 1.0 · המידע באפליקציה כללי ואינו תחליף לייעוץ רפואי, תזונתי או מקצועי אישי.')));
  return root;
}

function coachCard(ctx) {
  const s = getState();
  const c = s.coach;
  let key = c.apiKey || '';
  let show = false;
  const input = h('input', { class: 'input ltr', type: 'password', value: key, placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false, 'aria-label': 'מפתח API', 'data-no-autofocus': '1', oninput: (e) => (key = e.target.value.trim()) });
  const status = h('div');
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, h('span', { class: 'ibox' }, ic('bot')), h('div', { class: 'grow' }, h('b', null, 'חיבור Claude כמאמן AI'), h('div', { class: 'tiny muted' }, c.provider === 'claude' && c.apiKey ? `מחובר · ${c.model || MODEL}` : 'לא מחובר – המאמן עובד במצב מדריך מובנה'))),
    h('p', { class: 'small mt' }, 'כדי לקבל מאמן AI אמיתי שעונה בחופשיות על כל שאלה, אפשר להזין מפתח API אישי של Anthropic (נוצר ב-Claude Console). השימוש מחויב לפי החשבון שלך.'),
    h('label', { class: 'field mt' }, h('span', null, 'מפתח API'),
      h('div', { class: 'row' }, input, h('button', { class: 'icon-btn', 'aria-label': 'הצגה/הסתרה', onclick: () => { show = !show; input.type = show ? 'text' : 'password'; } }, ic('eye')))),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary grow', onclick: async () => {
        if (!key.startsWith('sk-')) return toast('המפתח צריך להתחיל ב-sk-', 'info');
        update((st) => { st.coach.apiKey = key; st.coach.provider = 'claude'; });
        status.replaceChildren(h('p', { class: 'small muted mt' }, 'בודק חיבור…'));
        try { await testKey(); status.replaceChildren(note('החיבור עובד! המאמן משתמש עכשיו ב-Claude.')); toast('מאמן AI מחובר', 'bot'); }
        catch (e) { status.replaceChildren(note(`החיבור נכשל: ${e?.status === 401 ? 'מפתח לא תקין' : e?.message || 'שגיאה'}. המפתח נשמר – אפשר לתקן ולנסות שוב.`, 'warn')); }
      } }, ic('key'), 'שמירה ובדיקה'),
      c.apiKey ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('לנתק את מאמן ה-AI?', 'המפתח יימחק מהמכשיר והמאמן יחזור למצב מדריך מובנה.', { ok: 'ניתוק', danger: true })) { update((st) => { st.coach.apiKey = ''; st.coach.provider = 'local'; }); ctx.refresh(); } } }, 'ניתוק') : null),
    status,
    h('div', { class: 'list-row', style: { padding: '14px 0 0', border: 0 } },
      h('div', { class: 'grow' }, h('div', { class: 't' }, 'לשתף את הפרופיל עם המאמן'), h('div', { class: 'd' }, 'מטרות, סוג עור/שיער, רמת כושר, משימות היום ופריטי הארון (טקסט בלבד) – לתשובות מותאמות. גיל וצורת פנייה נשלחים תמיד לצורכי בטיחות.')),
      toggle(c.shareProfile, (v) => update((st) => { st.coach.shareProfile = v; }), 'שיתוף פרופיל')),
    h('div', { class: 'mt' }, note('המפתח נשמר בדפדפן במכשיר הזה בלבד והשיחה נשלחת ישירות ל-api.anthropic.com. לא לשתף את המפתח עם אף אחד, ולא להשתמש בו במכשיר ציבורי.', 'warn', 'lock')));
}

function avatarSheet(ctx) {
  sheet((api) => {
    const p = getState().profile;
    return h('div', null,
      sheetHead('תמונת פרופיל', 'לא חובה. נשמרת רק במכשיר הזה.', api),
      p.avatarId ? h('div', { class: 'media', style: { height: '180px', width: '180px', margin: '0 auto', borderRadius: '50%' } }, storedImg(p.avatarId, '')) : null,
      h('div', { class: 'row mt' },
        h('button', { class: 'btn primary grow', onclick: async () => {
          const f = await pickImage(); if (!f) return;
          try {
            const data = await readImage(f, 400);
            const id = await images.put(data);
            if (p.avatarId) await images.del(p.avatarId);
            update((s) => { s.profile.avatarId = id; });
            api.close(); toast('התמונה עודכנה', 'camera'); ctx.refresh();
          } catch { toast('לא הצלחנו לקרוא את התמונה', 'alert'); }
        } }, ic('camera'), 'בחירת תמונה'),
        p.avatarId ? h('button', { class: 'btn danger', onclick: async () => { await images.del(p.avatarId); update((s) => { s.profile.avatarId = null; }); api.close(); toast('התמונה נמחקה', 'trash'); ctx.refresh(); } }, ic('trash'), 'מחיקה') : null));
  });
}

function editName(ctx) {
  const p = getState().profile;
  let name = p.name, address = p.address;
  sheet((api) => h('div', null,
    sheetHead('שם וצורת פנייה', null, api),
    h('label', { class: 'field' }, h('span', null, 'שם / כינוי'), h('input', { class: 'input', value: name, maxlength: 24, oninput: (e) => (name = e.target.value) })),
    h('div', { class: 'field' }, h('span', null, 'צורת פנייה'), chips(ADDRESS, address, (v) => (address = v), { multi: false })),
    h('button', { class: 'btn primary block', onclick: () => { if (!name.trim()) return toast('צריך שם', 'info'); update((s) => { s.profile.name = name.trim(); s.profile.address = address; }); api.close(); toast('נשמר', 'check'); ctx.refresh(); } }, 'שמירה')));
}

function editAge(ctx) {
  let age = getState().profile.age;
  sheet((api) => {
    const val = h('div', { class: 'big-num' }, String(age));
    return h('div', null,
      sheetHead('גיל', 'משמש להתאמת המלצות בטוחות.', api), val,
      h('input', { type: 'range', min: 10, max: 70, value: age, 'aria-label': 'גיל', oninput: (e) => { age = +e.target.value; val.textContent = age; } }),
      h('button', { class: 'btn primary block mt', onclick: () => { update((s) => { s.profile.age = age; }); api.close(); toast('נשמר', 'check'); ctx.refresh(); } }, 'שמירה'));
  });
}

function editMulti(ctx, title, options, key, lead) {
  let sel = [...(getState().profile[key] || [])];
  sheet((api) => h('div', null,
    sheetHead(title, lead, api),
    chips(options, sel, (v) => (sel = v), { max: key === 'styles' ? 3 : 0 }),
    h('button', { class: 'btn primary block mt2', onclick: () => { if (!sel.length) return toast('צריך לבחור לפחות אחד', 'info'); update((s) => { s.profile[key] = sel; }); api.close(); toast('נשמר – התוכנית התעדכנה', 'check'); ctx.refresh(); } }, 'שמירה')));
}

function editSingle(ctx, title, options, key, extra) {
  const p = getState().profile;
  let v = p[key], len = p.hairLength;
  sheet((api) => h('div', null,
    sheetHead(title, null, api),
    chips(options, v, (x) => (v = x), { multi: false }),
    extra ? h('div', { class: 'field mt' }, h('span', null, 'אורך'), chips(extra, len, (x) => (len = x), { multi: false })) : null,
    h('button', { class: 'btn primary block mt2', onclick: () => { update((s) => { s.profile[key] = v; if (extra) s.profile.hairLength = len; }); api.close(); toast('נשמר – התוכנית התעדכנה', 'check'); ctx.refresh(); } }, 'שמירה')));
}

function doExport() {
  const text = JSON.stringify(exportData(), null, 2);
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `glowup-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch { /* downloads can be blocked (e.g. embedded views) – the copy option below always works */ }
  // Some embedded views block downloads, so always offer copy as well.
  sheet((api) => {
    const ta = h('textarea', { class: 'input ltr', rows: 8, readonly: true, 'data-no-autofocus': '1', style: { fontSize: '12px' } }, text);
    return h('div', null,
      sheetHead('גיבוי המידע', 'אם ההורדה לא התחילה, אפשר להעתיק את הטקסט ולשמור אותו בקובץ או בהערה.', api),
      ta,
      h('button', { class: 'btn primary block mt', onclick: async () => {
        try { await navigator.clipboard.writeText(text); toast('הגיבוי הועתק', 'check'); }
        catch { ta.focus(); ta.select(); toast('סמנו והעתיקו את הטקסט', 'info'); }
      } }, ic('layers'), 'העתקת הגיבוי'));
  });
}

function doImport(ctx) {
  const inp = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; inp.remove();
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (!(await confirmDialog('לשחזר מהגיבוי?', 'המידע הנוכחי יוחלף במידע מהקובץ.', { ok: 'שחזור' }))) return;
      importData(obj); toast('המידע שוחזר', 'check'); ctx.go('#/home');
    } catch (e) { toast('הקובץ לא תקין: ' + (e.message || ''), 'alert'); }
  });
  document.body.appendChild(inp); inp.click();
}

async function deletePhotos(ctx) {
  if (!(await confirmDialog('למחוק את כל התמונות?', 'תמונות היומן, תמונות הארון ותמונת הפרופיל יימחקו לצמיתות. הפריטים עצמם יישארו בארון.', { ok: 'מחיקת תמונות', danger: true }))) return;
  await images.clear();
  update((s) => { s.photos = []; s.wardrobe.forEach((w) => { w.imageId = null; }); s.profile.avatarId = null; });
  toast('כל התמונות נמחקו', 'trash');
  ctx.refresh();
}

async function deleteAll() {
  if (!(await confirmDialog('למחוק את כל המידע?', 'הפרופיל, התוכנית, ההיסטוריה, הארון, התמונות והשיחות יימחקו לצמיתות מהמכשיר. אי אפשר לבטל.', { ok: 'מחיקה מלאה', danger: true }))) return;
  await resetAll();
  location.hash = '#/home';
  location.reload();
}
