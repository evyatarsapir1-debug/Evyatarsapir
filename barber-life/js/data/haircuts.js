// Haircut library. Every haircut is a real target: a length (mm) for every point of the scalp.
// The same definition drives the professional preview, the step list, the auto-demo and the quality check.
import * as THREE from 'three';
import { azimuth, heightName, hairMask } from '../hair/scalp.js';
import { GUARDS, LEVER_OPEN_MM } from '../tools/tools.js';

const ss = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;

function profile(points, y) {
  if (y <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (y <= points[i][0]) {
      const [y0, v0] = points[i - 1], [y1, v1] = points[i];
      return v0 + (v1 - v0) * (y - y0) / (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

/** Target length (mm) of a haircut for a unit head direction d. */
export function targetLength(spec, d) {
  const a = Math.abs(azimuth(d));
  const backW = ss(a, 1.6, 2.6);
  const y = d.y + (spec.drop || 0) * backW;
  const side = profile(spec.sides, y);
  const t = spec.top;
  const topLen = d.z > 0 ? lerp(t.mid, t.front, ss(d.z, 0.1, 0.9)) : lerp(t.mid, t.crown, ss(-d.z, 0.1, 0.9));
  const ridge = spec.ridge ?? 0.55, blend = spec.blend ?? 0.1;
  const frontBonus = 0.35 * Math.max(0, d.z) * ss(d.y, 0.1, 0.35);
  const topW = ss(d.y + frontBonus, ridge - blend, ridge + blend);
  let len = lerp(side, topLen, topW);
  if (spec.custom) len = spec.custom(d, len, topW);
  return Math.max(0, len);
}

const S = (pts) => pts; // readability helper
const TOP = (mid, front = mid, crown = mid) => ({ mid, front, crown });

// difficulty 1..5, minRank = rank needed to cut it in the lab (library is always open to read)
export const HAIRCUTS = [
  { id: 'induction', name: 'Induction Cut', he: 'אינדקשן (קרחת מכונה)', cat: 'classic', difficulty: 1,
    sides: S([[-1, 0.5], [1, 0.5]]), top: TOP(0.5), outline: true,
    desc: 'המכונה בלי מסרק על כל הראש. הכי קצר שאפשר בלי סכין. מתאים ללקוחות שרוצים מראה נקי מאוד וטיפול קל.',
    request: ['תוריד הכול עם המכונה, בלי מסרק', 'אני רוצה הכי קצר שיש עם המכונה'] },
  { id: 'burr', name: 'Burr Cut', he: 'באר קאט (מסרק 1)', cat: 'classic', difficulty: 1,
    sides: S([[-1, 3], [1, 3]]), top: TOP(3), outline: true,
    desc: 'אורך אחיד של 3 מ״מ על כל הראש. בסיס מצוין לתרגול שליטה במכונה ותנועות נגד כיוון הצמיחה.',
    request: ['מסרק 1 על כל הראש', 'תעשה לי הכול קצר, 3 מילימטר בכל מקום'] },
  { id: 'buzz', name: 'Buzz Cut', he: 'באז קאט (מסרק 2)', cat: 'classic', difficulty: 1,
    sides: S([[-1, 6], [1, 6]]), top: TOP(6), outline: true,
    desc: 'אורך אחיד של 6 מ״מ על כל הראש. התספורת הראשונה שכל ספר לומד: אותו מסרק בכל מקום, תנועות חופפות וקו עורף נקי.',
    request: ['באז קאט עם מסרק 2', 'תספורת מכונה אחידה, לא קצר מדי'] },
  { id: 'highTight', name: 'High and Tight', he: 'היי אנד טייט (צבאי)', cat: 'classic', difficulty: 2,
    sides: S([[-1, 0.5], [0.42, 0.5], [0.55, 3], [0.62, 10]]), top: TOP(10, 12, 9), ridge: 0.62, blend: 0.05, outline: true,
    desc: 'צדדים וגב כמעט בלי שיער עד גובה גבוה, ומעל רצועה קצרה של 10 מ״מ. מראה צבאי חד.',
    request: ['היי אנד טייט, כמו בצבא', 'צדדים בלי כלום ולמעלה קצר'] },
  { id: 'crew', name: 'Crew Cut', he: 'קרו קאט', cat: 'classic', difficulty: 2,
    sides: S([[-1, 3], [-0.3, 4.5], [0.1, 6], [0.5, 10]]), top: TOP(18, 24, 13), outline: true,
    desc: 'צדדים קצרים שמתארכים בהדרגה, למעלה קצר שמתארך קצת לכיוון הקדמה. קלאסיקה מסודרת שקל לעצב.',
    request: ['קרו קאט קלאסי', 'צדדים קצרים ולמעלה קצת יותר ארוך, שיהיה מסודר'] },
  { id: 'caesar', name: 'Caesar Cut', he: 'קיסר', cat: 'classic', difficulty: 2,
    sides: S([[-1, 4.5], [0, 6], [0.5, 10]]), top: TOP(15, 16, 14), outline: true,
    custom: (d, len, topW) => (d.z > 0.6 && topW > 0.5 ? Math.min(len, 15) : len),
    desc: 'אורך קצר ואחיד למעלה (כ־15 מ״מ) עם פוני ישר וקצר קדימה, צדדים מעט קצרים יותר.',
    request: ['תספורת קיסר עם פוני ישר', 'למעלה קצר ושווה, פוני קצר קדימה'] },
  { id: 'princeton', name: 'Princeton', he: 'פרינסטון', cat: 'classic', difficulty: 2,
    sides: S([[-1, 6], [0.1, 10], [0.5, 13]]), top: TOP(28, 38, 22),
    desc: 'גרסה ארוכה של קרו קאט: מספיק אורך בקדמה כדי לסרק הצידה.',
    request: ['פרינסטון, שיהיה אפשר לסרק הצידה', 'צדדים קצרים ולמעלה מספיק ארוך לסירוק'] },
  { id: 'ivy', name: 'Ivy League', he: 'אייבי ליג', cat: 'classic', difficulty: 3,
    sides: S([[-1, 4.5], [-0.2, 6], [0.2, 10], [0.5, 13]]), top: TOP(30, 40, 22), outline: true,
    desc: 'קרו קאט אלגנטי: צדדים מדורגים ונקיים, למעלה אורך שמאפשר שביל צד.',
    request: ['אייבי ליג, מסודר כמו לעבודה', 'צדדים מדורגים ולמעלה אורך לשביל'] },
  { id: 'sidePart', name: 'Side Part', he: 'שביל צד קלאסי', cat: 'classic', difficulty: 3,
    sides: S([[-1, 6], [-0.2, 10], [0.25, 13], [0.5, 19]]), top: TOP(42, 50, 32), outline: true,
    desc: 'הצדדים מדורגים במכונה, החלק העליון במספריים ומעבר רך ביניהם. מסרקים לצד אחד ויוצרים שביל.',
    request: ['שביל צד קלאסי', 'מסודר, עם שביל בצד ואורך למעלה'] },
  { id: 'businessman', name: 'Businessman', he: 'תספורת עסקים', cat: 'classic', difficulty: 3,
    sides: S([[-1, 10], [0, 13], [0.5, 19]]), top: TOP(45, 52, 35),
    desc: 'שמרנית ונקייה: הצדדים לא קצרים מדי, החלק העליון ארוך מספיק לסירוק לאחור או לצד.',
    request: ['משהו מסודר לעבודה, לא קצר מדי בצדדים', 'תספורת קלאסית של איש עסקים'] },
  { id: 'gentleman', name: 'Classic Scissor Cut', he: 'תספורת מספריים קלאסית', cat: 'classic', difficulty: 4,
    sides: S([[-1, 16], [0, 22], [0.5, 30]]), top: TOP(48, 55, 40),
    desc: 'כולה במספריים על מסרק: צדדים של 2–3 ס״מ שמתחברים בצורה רכה לחלק העליון. דורשת שליטה במספריים.',
    request: ['תספורת מספריים, בלי מכונה קצרה', 'רק לקצר ולסדר, להשאיר טבעי'] },
  { id: 'taper', name: 'Taper Fade', he: 'טייפר', cat: 'fade', difficulty: 2,
    sides: S([[-1, 1.5], [-0.5, 3], [-0.25, 6], [0.05, 10], [0.4, 13], [0.6, 16]]), top: TOP(38, 45, 30), outline: true,
    desc: 'דירוג עדין רק בקצוות — בעורף ובפאות — וכל השאר נשאר מלא. הכי שמרני מבין הפיידים.',
    request: ['טייפר עדין בעורף ובפאות', 'רק לקצר בקצוות, שיהיה מעבר עדין'] },
  { id: 'lowFade', name: 'Low Fade', he: 'דירוג נמוך (Low Fade)', cat: 'fade', difficulty: 3,
    sides: S([[-1, 0.5], [-0.5, 0.5], [-0.3, 1.5], [-0.12, 3], [0.06, 6], [0.25, 10], [0.5, 13]]), top: TOP(40, 46, 32), outline: true,
    desc: 'המעבר מתחיל נמוך — מעט מעל קו העורף והאוזן — ועולה בהדרגה. נראה נקי אבל שומר הרבה שיער בצדדים.',
    request: ['דירוג נמוך', 'פייד נמוך ולהשאיר אורך למעלה'] },
  { id: 'midFade', name: 'Mid Fade', he: 'דירוג אמצעי (Mid Fade)', cat: 'fade', difficulty: 3,
    sides: S([[-1, 0.5], [-0.15, 0.5], [0.02, 1.5], [0.16, 3], [0.3, 6], [0.44, 10], [0.56, 13]]), top: TOP(40, 46, 32), outline: true,
    desc: 'המעבר מתחיל בגובה האוזן ועולה עד קו הרקה. הפייד הפופולרי ביותר — מאוזן בין נקי לטבעי.',
    request: ['מיד פייד', 'פייד באמצע, ולמעלה להשאיר'] },
  { id: 'highFade', name: 'High Fade', he: 'דירוג גבוה (High Fade)', cat: 'fade', difficulty: 4,
    sides: S([[-1, 0.5], [0.18, 0.5], [0.32, 1.5], [0.42, 3], [0.52, 6], [0.6, 10]]), top: TOP(40, 46, 32), ridge: 0.6, blend: 0.07, outline: true,
    desc: 'הצדדים כמעט חלקים עד גובה גבוה, והמעבר קצר וחד לפני החלק העליון. דורש מעבר מהיר ומדויק.',
    request: ['היי פייד', 'פייד גבוה, שיהיה חד'] },
  { id: 'lowSkin', name: 'Low Skin Fade', he: 'סקין פייד נמוך', cat: 'fade', difficulty: 4,
    sides: S([[-1, 0.2], [-0.48, 0.2], [-0.36, 0.5], [-0.22, 1.5], [-0.06, 3], [0.12, 6], [0.32, 10], [0.52, 13]]), top: TOP(40, 46, 32), outline: true,
    desc: 'כמו דירוג נמוך, אבל מתחיל מעור חלק (טרימר) בתחתית. המעבר מעור לשיער חייב להיות רך מאוד.',
    request: ['סקין פייד נמוך', 'פייד מאפס, נמוך'] },
  { id: 'skinFade', name: 'Skin Fade', he: 'סקין פייד (Mid Skin)', cat: 'fade', difficulty: 4,
    sides: S([[-1, 0.2], [-0.1, 0.2], [0.02, 0.5], [0.13, 1.5], [0.25, 3], [0.38, 6], [0.5, 10]]), top: TOP(36, 42, 30), outline: true,
    desc: 'עור חלק עד גובה האוזן ומעבר הדרגתי עד קו הרקה. הסמל של ספרות מודרנית — כל קו נראה בו.',
    request: ['סקין פייד', 'פייד מאפס באמצע'] },
  { id: 'baldFade', name: 'High Skin (Bald) Fade', he: 'בולד פייד גבוה', cat: 'fade', difficulty: 5,
    sides: S([[-1, 0.2], [0.25, 0.2], [0.35, 0.5], [0.43, 1.5], [0.5, 3], [0.57, 6], [0.62, 10]]), top: TOP(36, 42, 30), ridge: 0.62, blend: 0.06, outline: true,
    desc: 'עור חלק כמעט עד החלק העליון ומעבר קצר מאוד. התספורת הכי קשה לסימטריה ולמעבר נקי.',
    request: ['בולד פייד גבוה', 'הצדדים לגמרי חלקים עד למעלה'] },
  { id: 'dropFade', name: 'Drop Fade', he: 'דרופ פייד', cat: 'fade', difficulty: 5, drop: 0.32,
    sides: S([[-1, 0.5], [-0.1, 0.5], [0.06, 1.5], [0.2, 3], [0.34, 6], [0.46, 10], [0.56, 13]]), top: TOP(40, 46, 32), outline: true,
    desc: 'הפייד גבוה בצדדים ו"צונח" מאחורי האוזן לכיוון העורף, כמו קשת. דורש שליטה בקו לאורך כל הראש.',
    request: ['דרופ פייד', 'פייד שיורד מאחורי האוזן'] },
  { id: 'burstLike', name: 'Temple Taper', he: 'טמפל טייפר', cat: 'fade', difficulty: 3,
    sides: S([[-1, 1.5], [-0.45, 3], [-0.15, 6], [0.1, 10], [0.45, 16]]), top: TOP(45, 52, 35), outline: true,
    custom: (d, len) => {
      const a = Math.abs(azimuth(d));
      // only the temple/sideburn area and the neckline are tapered, the back of the sides stays fuller
      const temple = a > 0.8 && a < 1.5;
      return temple || d.y < -0.35 ? len : Math.max(len, Math.min(16, len + 6));
    },
    desc: 'דירוג קטן רק ברקות ובעורף, וכל השאר נשאר מלא. פייד עדין ללקוח שלא רוצה שינוי גדול.',
    request: ['רק לנקות את הרקות והעורף', 'טייפר ברקות בלבד'] },
  { id: 'frenchCrop', name: 'French Crop', he: 'פרנץ׳ קרופ', cat: 'modern', difficulty: 3,
    sides: S([[-1, 0.5], [-0.35, 1.5], [-0.1, 3], [0.15, 6], [0.4, 10], [0.55, 13]]), top: TOP(25, 18, 22), outline: true,
    custom: (d, len, topW) => (d.z > 0.55 && topW > 0.5 ? Math.min(len, 18) : len),
    desc: 'פייד בצדדים, למעלה כ־25 מ״מ שמסורק קדימה, ופוני קצר וישר. מודרני וקל לעיצוב.',
    request: ['פרנץ׳ קרופ', 'פייד בצדדים ופוני קצר וישר קדימה'] },
  { id: 'texturedCrop', name: 'Textured Crop', he: 'קרופ עם טקסטורה', cat: 'modern', difficulty: 3, texture: true,
    sides: S([[-1, 0.2], [-0.15, 0.5], [0.0, 1.5], [0.15, 3], [0.3, 6], [0.45, 10], [0.55, 13]]), top: TOP(30, 24, 26), outline: true,
    desc: 'סקין פייד עם חלק עליון של כ־30 מ״מ שמקבל טקסטורה במספרי דילול. מראה "מבולגן" מכוון.',
    request: ['קרופ עם טקסטורה', 'פייד, ולמעלה שיהיה טקסטורה ולא שטוח'] },
  { id: 'undercut', name: 'Undercut', he: 'אנדרקאט', cat: 'modern', difficulty: 3,
    sides: S([[-1, 3], [0.5, 3]]), top: TOP(55, 60, 45), ridge: 0.55, blend: 0.025, outline: true,
    desc: 'צדדים קצרים ואחידים עד קו חד, ומעליו שיער ארוך בלי מעבר ("ניתוק"). כאן הקו החד הוא חלק מהתספורת.',
    request: ['אנדרקאט', 'צדדים קצרים עם ניתוק, ולמעלה ארוך'] },
  { id: 'slickBack', name: 'Slick Back Undercut', he: 'סליק בק אנדרקאט', cat: 'modern', difficulty: 3,
    sides: S([[-1, 1.5], [0.52, 1.5]]), top: TOP(58, 62, 50), ridge: 0.52, blend: 0.025, outline: true,
    desc: 'אנדרקאט קצר מאוד בצדדים, ולמעלה אורך מלא שמסורק לאחור עם ג׳ל.',
    request: ['סליק בק', 'צדדים קצרים ולמעלה ארוך לסירוק אחורה'] },
  { id: 'quiff', name: 'Quiff + Mid Fade', he: 'קוויף עם פייד', cat: 'modern', difficulty: 4,
    sides: S([[-1, 0.5], [-0.15, 0.5], [0.02, 1.5], [0.16, 3], [0.3, 6], [0.44, 10], [0.56, 13]]), top: TOP(48, 60, 32), outline: true,
    desc: 'פייד אמצעי וחלק עליון שמתארך לכיוון הקדמה, כדי להרים את הפוני למעלה ואחורה.',
    request: ['קוויף', 'פייד, ולהשאיר ארוך מקדימה כדי להרים'] },
  { id: 'pompadour', name: 'Pompadour', he: 'פומפדור', cat: 'modern', difficulty: 4,
    sides: S([[-1, 6], [-0.2, 10], [0.2, 13], [0.5, 19]]), top: TOP(52, 62, 38),
    desc: 'צדדים מדורגים בינוני, וחלק עליון ארוך מאוד בקדמה שמעוצב לנפח גבוה לאחור.',
    request: ['פומפדור', 'נפח גדול מקדימה והצדדים מסודרים'] },
  { id: 'comboverFade', name: 'Comb Over Fade', he: 'קומב אובר פייד', cat: 'modern', difficulty: 4,
    sides: S([[-1, 0.2], [-0.4, 0.5], [-0.2, 1.5], [-0.02, 3], [0.18, 6], [0.38, 10], [0.55, 13]]), top: TOP(44, 50, 34), outline: true,
    desc: 'סקין פייד נמוך וחלק עליון ארוך שמסורק לצד. שילוב של קלאסי ומודרני.',
    request: ['קומב אובר עם פייד', 'פייד נמוך ולמעלה לסרק הצידה'] },
  { id: 'edgar', name: 'Edgar', he: 'אדגר', cat: 'modern', difficulty: 4,
    sides: S([[-1, 0.2], [0.2, 0.2], [0.32, 0.5], [0.42, 1.5], [0.5, 3], [0.57, 6]]), top: TOP(28, 20, 26), ridge: 0.57, blend: 0.05, outline: true,
    custom: (d, len, topW) => (d.z > 0.55 && topW > 0.5 ? Math.min(len, 20) : len),
    desc: 'בולד פייד גבוה, חלק עליון קצר־בינוני ופוני ישר וחד. דורש קו פוני ישר לגמרי.',
    request: ['אדגר', 'פייד גבוה ופוני ישר חד'] },
  { id: 'curlyTop', name: 'Curly Top Fade', he: 'תלתלים עם פייד', cat: 'modern', difficulty: 4,
    sides: S([[-1, 0.2], [-0.15, 0.5], [0.0, 1.5], [0.15, 3], [0.3, 6], [0.45, 10], [0.55, 13]]), top: TOP(42, 45, 38), outline: true,
    desc: 'פייד נקי בצדדים ותלתלים מלאים למעלה. מקצרים את התלתלים בעדינות במספריים כדי לשמור על הצורה.',
    request: ['פייד ולהשאיר את התלתלים למעלה', 'לנקות צדדים, התלתלים נשארים'] },
  { id: 'flatTop', name: 'Flat Top', he: 'פלאט טופ', cat: 'classic', difficulty: 5,
    sides: S([[-1, 0.5], [-0.2, 1.5], [0.1, 3], [0.35, 6], [0.55, 10]]), top: TOP(25), outline: true,
    custom: (d, len, topW) => {
      if (topW < 0.3) return len;
      // hair ends at one flat height: the higher the scalp, the shorter the hair
      const flat = THREE.MathUtils.clamp((0.118 - d.y * 0.092) * 1000, 12, 48);
      return lerp(len, flat, topW);
    },
    desc: 'החלק העליון נחתך כך שקצות השיער יוצרים משטח שטוח וישר. האורך משתנה לפי צורת הראש — הקשה מכולן.',
    request: ['פלאט טופ', 'למעלה שטוח וישר כמו שולחן'] },
  { id: 'layers', name: 'Long Layers', he: 'שכבות ארוכות', cat: 'modern', difficulty: 4,
    sides: S([[-1, 30], [0, 38], [0.5, 45]]), top: TOP(55, 58, 50),
    desc: 'תספורת מספריים בלבד: מקצרים מעט ומדרגים בשכבות, כך שהשיער נשאר ארוך ונופל טבעי.',
    request: ['רק לקצר קצת ולעשות שכבות', 'להשאיר ארוך, רק לסדר'] },
];

export const HAIRCUT_BY_ID = Object.fromEntries(HAIRCUTS.map((h) => [h.id, h]));
export const CATEGORY_NAMES = { classic: 'קלאסי', fade: 'פיידים', modern: 'מודרני' };
export const DIFFICULTY_NAMES = ['', 'קלה', 'בסיסית', 'בינונית', 'מתקדמת', 'מומחה'];

/** Largest guard setting (incl. open lever) that leaves at most `mm`. */
export function guardFor(mm) {
  let best = null;
  for (const g of GUARDS) {
    for (const lever of [false, true]) {
      const v = g.mm + (lever ? LEVER_OPEN_MM : 0);
      if (v <= mm + 0.3 && (!best || v > best.mm + 1e-6 || (Math.abs(v - best.mm) < 1e-6 && best.lever && !lever))) best = { guard: g, lever, mm: v };
    }
  }
  return best;
}
export function guardText(gs) {
  if (!gs) return 'טרימר';
  return `${gs.guard.name}${gs.lever ? ' עם ידית פתוחה' : ''} (${gs.mm} מ״מ)`;
}

/** Numbered work steps generated from the haircut itself, in the order a barber works. */
export function haircutSteps(spec) {
  const steps = [];
  steps.push('התייעצות: בודקים עם הלקוח את האורך בצדדים ולמעלה, ומחטאים את הכלים.');
  // one band per length in the haircut's profile, from the longest guard down; each band reaches as high as the
  // target still allows that length
  const ridge = spec.ridge ?? 0.55;
  const vals = [...new Set(spec.sides.map((p) => p[1]).filter((v) => v < 26))].sort((x, y) => y - x);
  const list = [];
  for (const v of vals) {
    let top = null;
    for (let y = -0.75; y <= ridge + 0.001; y += 0.01) if (targetLength(spec, vecSide(y)) >= v - 0.05) { top = y; break; }
    let reach = -0.75;
    for (let y = -0.75; y <= ridge + 0.001; y += 0.01) if (targetLength(spec, vecSide(y)) <= v + 0.3) reach = y;
    if (top == null && v > 0.3) continue;
    list.push({ mm: v, top: reach, gs: v <= 0.3 ? null : guardFor(v) });
  }
  const to = (y) => heightName(y).replace(/^ב/, '');
  for (const b of list) {
    if (!b.gs) steps.push(`טרימר (0.2 מ״מ): עור חלק מקו העורף עד ${to(b.top)}.`);
    else steps.push(`${guardText(b.gs)}: תנועות כלפי מעלה מקו העורף עד ${to(b.top)}.`);
  }
  if (list.length > 2 && !(spec.blend < 0.04)) steps.push('מחליקים את הקווים בין המסרקים: חצאי מספרים או ידית טייפר פתוחה, בתנועת "הוצאה" כלפי חוץ.');
  if (spec.blend < 0.04) steps.push('משאירים קו ניתוק חד בין הצדדים לחלק העליון — לא מחליקים אותו.');
  const t = spec.top;
  if (t.mid <= 25) {
    const g = guardFor(t.mid);
    steps.push(`חלק עליון: ${g ? guardText(g) : 'מסרק ' + t.mid + ' מ״מ'} — אורך אחיד${t.front !== t.mid ? `, ובקדמה ${t.front} מ״מ (מספריים)` : ''}.`);
  } else {
    steps.push(`חלק עליון במספריים על מסרק: ${t.mid} מ״מ באמצע, ${t.front} מ״מ בקדמה ו־${t.crown} מ״מ בכתר.`);
  }
  if (spec.texture) steps.push('מספרי דילול על החלק העליון: מורידים נפח ומוסיפים טקסטורה.');
  if (spec.outline) steps.push('טרימר: קו עורף נקי, פאות ישרות וקו מסביב לאוזניים.');
  steps.push('בדיקה: מבט מאחור ומלמעלה לסימטריה, ומעבר על מפת האורכים כדי למצוא קווים ואיים.');
  return steps;
}
function vecSide(y) { const r = Math.sqrt(Math.max(0, 1 - y * y)); return { x: r, y, z: 0 }; }

/** Side-profile illustration (SVG) of a haircut: the head silhouette with hair drawn at the target lengths. */
export function haircutSVG(spec, size = 120) {
  const pts = [];
  const cx = 60, cy = 62, rx = 34, ry = 34;
  for (let i = 0; i <= 60; i++) {
    const ang = -Math.PI * 0.62 + (i / 60) * Math.PI * 1.42; // from the nape over the top to the forehead
    const d = { x: 0, y: Math.cos(ang), z: Math.sin(ang) };
    const m = hairMask(new THREE.Vector3(d.x, d.y, d.z).normalize());
    const len = m > 0.2 ? targetLength(spec, d) : 0;
    const r = 1 + Math.min(len, 60) / 60 * 0.42;
    pts.push([cx + d.z * rx * r, cy - d.y * ry * r]);
  }
  const hair = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" class="cut-svg" aria-hidden="true">
    <path d="${hair}" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#e2b08c"/>
    <path d="M${cx + rx - 2},${cy + 4} q8,6 2,12 q-2,10 -8,16 q-10,8 -22,6" fill="#e2b08c"/>
    <ellipse cx="${cx - 2}" cy="${cy + 6}" rx="5" ry="8" fill="#d39a78"/>
    <rect x="${cx - 16}" y="${cy + 28}" width="24" height="24" fill="#e2b08c"/>
  </svg>`;
}
