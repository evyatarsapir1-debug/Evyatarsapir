// AI stylist: free-text questions and clothing photos → complete outfits (Claude), sanitized to
// the app's garment catalog and colors so results render like the built-in stylist.
import { getState } from './store.js';
import { ask } from './ai.js';
import { COLORS, COLOR, CATEGORIES } from './data/style.js';
import { G, GARMENTS, catalogText, OCC_LABEL } from './data/stylist.js';
import { STYLES, labelOf } from './data/profile.js';

const SLOTS = ['layer', 'top', 'bottom', 'shoes', 'acc'];

function context() {
  const s = getState();
  const p = s.profile;
  const scanColors = s.scans?.[0]?.style?.colors || [];
  const ward = s.wardrobe.slice(0, 60).map((w) => `${w.name} (${COLOR[w.color]?.label || w.color})`).join(', ');
  return `גיל ${p.age || 'לא ידוע'}; פנייה ${p.address === 'f' ? 'בלשון נקבה' : p.address === 'm' ? 'בלשון זכר' : 'ניטרלית'}; סגנון אהוב: ${(p.styles || []).map((x) => labelOf(STYLES, x)).join(', ') || 'לא צוין'}${scanColors.length ? `; צבעים שמתאימים לו/ה (מהסריקה): ${scanColors.map((c) => COLOR[c]?.label || c).join(', ')}` : ''}.
בגדים שכבר יש בארון: ${ward || 'לא הוזנו'}.`;
}

const RULES = `כללים:
- אין הערות על הגוף או המראה, אין "להסתיר" חלקי גוף, אין ציונים. רק מה ללבוש ולמה.
- לוק שלם = חולצה (top) + מכנסיים/חצאית (bottom) + נעליים (shoes), ואפשר שכבה עליונה (layer) ואביזר (acc).
- לכבד כל הגבלה שהמשתמש ביקש (למשל "רק חולצות חלקות" = בלי הדפסים, בלי לוגו גדול, בלי צבעוני).
- להתאים לגיל ולאירוע. מחירים, אם מוזכרים, בשקלים.
- piece.garment: id מהקטלוג אם מתאים: ${catalogText()}. אם אין התאמה – "" ולתאר ב-label.
- כל פריט עם צבע מדויק. piece.label = שם הפריט בלי הצבע (למשל "ג׳ינס סלים"), והצבע ב-piece.color. בג׳ינס: denim = כחול כהה, blue = כחול בינוני, lightblue = כחול בהיר, black = שחור, grey = אפור.
- הלוקים חייבים להיות מתואמים באמת: מקסימום צבע בולט אחד, נעלי עור וחגורה באותו צבע, ניגודיות בין שכבה עליונה לחולצה.
- piece.color רק מתוך: ${COLORS.map((c) => c.id).join(', ')}.
- piece.slot רק: ${SLOTS.join(', ')}.
- בעברית, קצר וברור.`;

const SCHEMA = '{"intro":"","outfits":[{"name":"","pieces":[{"slot":"top","garment":"","label":"","color":"","fromPhoto":null}],"why":[""]}],"works":[""],"avoid":[{"what":"","why":""}],"tips":[""],"items":[],"missing":[]}';

/** Free-text stylist question (no photos). */
export async function aiStylist(question, { occasion, plain, signal } = {}) {
  const prompt = `את/ה סטייליסט/ית אישי/ת. המשתמש שואל: "${question.slice(0, 600)}".
${occasion ? `אירוע: ${OCC_LABEL[occasion]}.` : ''}${plain ? ' המשתמש ביקש רק חולצות חלקות (בלי הדפסים).' : ''}
מידע: ${context()}
${RULES}
- תן/י 3 לוקים שלמים. אם המשתמש שאל על פריט מסוים (למשל פוטר/קפוצ׳ון) – כל הלוקים בונים סביבו, works = מה כן הולך איתו, avoid = מה לא הולך איתו ולמה (3-6).
- אם ביקש מהארון שלו – השתמש/י רק בבגדים מהארון, ו-missing = פריטים שכדאי לקנות כדי להשלים.
החזר/י רק JSON: ${SCHEMA}`;
  const r = await ask(prompt, { json: true, signal, tier: 'default', fresh: true });
  return sanitize(r);
}

/** Clothing photos (Blob[]) → identified items + outfits that combine them. */
export async function aiStylistPhotos(blobs, { question = '', occasion, plain, signal } = {}) {
  const prompt = `את/ה סטייליסט/ית אישי/ת. המשתמש שלח ${blobs.length} תמונות של בגדים (תמונה 1 עד ${blobs.length}) ורוצה שתתאים/י לו לוקים.
${question ? `השאלה שלו: "${question.slice(0, 500)}".` : ''}${occasion ? ` אירוע: ${OCC_LABEL[occasion]}.` : ''}${plain ? ' רק חולצות חלקות.' : ''}
מידע: ${context()}
${RULES}
- items: כל בגד שרואים בתמונות: {"photo":1,"name":"","garment":"","category":"top|layer|bottom|shoes|acc","color":""}. category רק מתוך: ${CATEGORIES.map((c) => c.id).join(', ')}. אם תמונה לא ברורה או שאין בה בגד – לא להמציא.
- outfits: 2-4 לוקים שמשלבים את הבגדים מהתמונות (ומהארון אם צריך). piece.fromPhoto = מספר התמונה אם הפריט מהתמונות, אחרת null.
- works: מה הכי עובד ביחד מהבגדים שנשלחו. avoid: איזה שילובים מהם לא לעשות ולמה.
- missing: 1-4 פריטים שחסרים כדי שהבגדים האלה יעבדו טוב יותר: {"name":"","category":"","color":"","why":"","price":""}.
החזר/י רק JSON: ${SCHEMA}`;
  const r = await ask(prompt, { json: true, images: blobs, signal, tier: 'complex', fresh: true });
  return sanitize(r, blobs.length);
}

const str = (v, n = 220) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const arr = (v) => (Array.isArray(v) ? v : []);
const color = (c) => (COLOR[c] ? c : 'grey');

export function sanitize(r, photos = 0) {
  r = r && typeof r === 'object' ? r : {};
  const piece = (p) => {
    const g = G[p?.garment] || null;
    const slot = SLOTS.includes(p?.slot) ? p.slot : g?.slot || 'top';
    const label = str(p?.label, 60) || g?.label || '';
    if (!label) return null;
    const fp = Number.isInteger(p?.fromPhoto) && p.fromPhoto >= 1 && p.fromPhoto <= photos ? p.fromPhoto : null;
    return { id: g?.id || '', label, slot, color: color(p?.color), fromPhoto: fp };
  };
  const order = { layer: 0, top: 1, bottom: 2, shoes: 3, acc: 4 };
  const outfits = arr(r.outfits).slice(0, 4).map((o, i) => ({
    name: str(o?.name, 50) || `לוק ${i + 1}`,
    pieces: arr(o?.pieces).map(piece).filter(Boolean).sort((a, b) => order[a.slot] - order[b.slot]).slice(0, 6),
    why: arr(o?.why).map((x) => str(x, 160)).filter(Boolean).slice(0, 4),
  })).filter((o) => o.pieces.length >= 2);
  const cats = new Set(CATEGORIES.map((c) => c.id));
  return {
    source: 'ai',
    intro: str(r.intro, 400),
    outfits,
    works: arr(r.works).map((x) => str(x, 180)).filter(Boolean).slice(0, 6),
    avoid: arr(r.avoid).map((a) => (typeof a === 'string' ? { what: str(a, 120), why: '' } : { what: str(a?.what, 120), why: str(a?.why, 180) })).filter((a) => a.what).slice(0, 8),
    tips: arr(r.tips).map((x) => str(x, 200)).filter(Boolean).slice(0, 5),
    items: arr(r.items).slice(0, 12).filter((it) => it?.photo == null || (Number.isInteger(it.photo) && it.photo >= 1 && it.photo <= photos)).map((it) => ({
      photo: Number.isInteger(it?.photo) && it.photo >= 1 && it.photo <= photos ? it.photo : null,
      name: str(it?.name, 40), garment: G[it?.garment] ? it.garment : '',
      category: cats.has(it?.category) ? it.category : (G[it?.garment]?.slot === 'acc' ? 'acc' : G[it?.garment]?.slot) || 'top',
      color: color(it?.color),
    })).filter((it) => it.name),
    missing: arr(r.missing).slice(0, 5).map((m) => ({ name: str(m?.name, 50), category: cats.has(m?.category) ? m.category : 'top', color: color(m?.color), why: str(m?.why, 160), price: str(m?.price, 30) })).filter((m) => m.name),
  };
}

export { GARMENTS };
