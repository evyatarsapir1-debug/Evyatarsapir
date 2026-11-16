// Glow-up scan: turns photos (AI) or measurements (built-in) into a concrete personal plan.
// No attractiveness scores, no ratings, no bone-change promises.
import { getState } from './store.js';
import { HAIRCUTS, CUT } from './data/haircuts.js';
import { COLOR, COLORS, CATEGORIES } from './data/style.js';
import { labelOf, SKIN_TYPES, HAIR_TYPES, STYLES } from './data/profile.js';
import { computeTargets, bmi, currentWeight } from './transform.js';
import { ask } from './ai.js';

export const FACE_LABEL = { oval: 'אובלי', round: 'עגול', square: 'מרובע', long: 'ארוך', heart: 'לב', diamond: 'יהלום' };

// Capsule wardrobe by style: [name, category, color, why, price range]
const CAPSULE = {
  base: [
    ['טי שירט לבנה איכותית', 'top', 'white', 'הבסיס של כל לוק – עובדת עם הכל.', '₪40-90'],
    ['טי שירט שחורה', 'top', 'black', 'נראית מסודרת ומחדדת את הגזרה.', '₪40-90'],
    ['ג׳ינס כהה בגזרה ישרה/מחויטת', 'bottom', 'denim', 'מתאים לבית ספר, יציאות ודייטים.', '₪120-300'],
    ['סניקרס לבנות נקיות', 'shoes', 'white', 'משדרגות כל לוק פשוט.', '₪180-450'],
  ],
  casual: [['קפוצ׳ון ניטרלי (אפור/בז׳)', 'layer', 'grey', 'נוח ונראה טוב עם ג׳ינס או ג׳וגר.', '₪100-250'], ['אוברשירט בצבע אדמה', 'layer', 'olive', 'שכבה שהופכת טי פשוטה ללוק.', '₪120-260']],
  street: [['קפוצ׳ון אוברסייז איכותי', 'layer', 'black', 'בסיס של סטריט – גזרה רחבה ובד עבה.', '₪150-350'], ['מכנס קרגו / ג׳וגר רחב', 'bottom', 'khaki', 'יוצר את הסילואט הרחב של סטריט.', '₪120-280'], ['סניקרס בולטות (פריט אחד)', 'shoes', 'multi', 'פריט מרכזי אחד – השאר ניטרלי.', '₪300-700']],
  classic: [['חולצה מכופתרת תכלת', 'top', 'lightblue', 'הכי מחמיאה לרוב גווני העור.', '₪120-250'], ['צ׳ינו בז׳ / נייבי', 'bottom', 'beige', 'מסודר בלי להיות רשמי.', '₪120-280'], ['נעלי עור חומות', 'shoes', 'brown', 'משלימות לוק קלאסי.', '₪250-600']],
  sport: [['ג׳וגר מחויט שחור', 'bottom', 'black', 'ספורטיבי אבל מסודר.', '₪120-250'], ['טי דרייפיט', 'sport', 'navy', 'לאימון ויומיום.', '₪60-150']],
  minimal: [['סריג דק בצבע נייבי', 'layer', 'navy', 'קווים נקיים ומראה בוגר.', '₪150-300'], ['מכנס מחויט אפור', 'bottom', 'grey', 'בסיס מינימליסטי.', '₪150-300']],
  elegant: [['בלייזר נייבי לא מובנה', 'layer', 'navy', 'שדרוג מיידי – גם על טי.', '₪300-700'], ['חולצה מכופתרת לבנה', 'top', 'white', 'חובה לאירועים.', '₪120-250'], ['שעון עם רצועת עור', 'watch', 'brown', 'אביזר אחד שמשדר רמה.', '₪150-600']],
  vintage: [['חולצת קורדרוי/פלנל', 'top', 'brown', 'צבעי אדמה ובדים עם טקסטורה.', '₪100-250'], ['ג׳ינס בגזרה ישרה בהירה', 'bottom', 'denim', 'סילואט קלאסי של פעם.', '₪120-280']],
};

export function capsuleFor(styles = [], owned = []) {
  const has = (cat, color) => owned.some((w) => w.category === cat && w.color === color);
  const list = [...CAPSULE.base, ...styles.flatMap((s) => CAPSULE[s] || [])];
  const seen = new Set();
  return list.filter(([n, c, col]) => { const k = n; if (seen.has(k) || has(c, col)) return false; seen.add(k); return true; })
    .map(([name, category, color, why, price]) => ({ name, category, color, why, price }));
}

/** Face shape from four measurements (cm) and jaw form. */
export function faceShapeFrom({ forehead, cheek, jaw, length, angular }) {
  const F = +forehead, C = +cheek, J = +jaw, L = +length;
  if (!(F && C && J && L)) return null;
  const lc = L / C;
  if (lc >= 1.5) return 'long';
  const close = (a, b) => Math.abs(a - b) / Math.max(a, b) < 0.1;
  if (close(F, C) && close(C, J) && lc < 1.3) return angular ? 'square' : 'round';
  if (C > F * 1.05 && C > J * 1.08) return 'diamond';
  if (F >= C * 0.95 && J < F * 0.85) return 'heart';
  if (lc < 1.2) return angular ? 'square' : 'round';
  return 'oval';
}

const FACE_TIPS = {
  oval: { hair: 'כמעט כל תספורת מתאימה – אפשר לבחור לפי סוג השיער והזמן.', avoid: [['פוני כבד שמכסה את כל המצח', 'מסתיר את הפרופורציות המאוזנות']] },
  round: { hair: 'נפח למעלה וצדדים קצרים מאריכים את הפנים ומוסיפים זוויות.', avoid: [['באז קאט אחיד מאוד קצר', 'מדגיש את העיגול'], ['שיער עד הלחיים ונפח בצדדים', 'מרחיב את הפנים']] },
  square: { hair: 'הלסת החזקה היא יתרון: תספורות קלאסיות וקצרות מדגישות אותה, טקסטורה מרככת.', avoid: [['קו ישר וחד מאוד בכל מקום', 'יכול להיראות נוקשה מדי']] },
  long: { hair: 'פחות גובה למעלה ומעט נפח בצדדים או פוני מאזנים את האורך.', avoid: [['קוויף/פומפדור גבוה', 'מאריך עוד יותר'], ['צדדים מגולחים לגמרי עם נפח גבוה', 'מצר ומאריך']] },
  heart: { hair: 'אורך בינוני וטקסטורה בצדדים מאזנים מצח רחב וסנטר צר. זקן קצר מוסיף נפח לסנטר.', avoid: [['צדדים קצרים מאוד עם נפח גבוה', 'מדגיש את המצח']] },
  diamond: { hair: 'פוני או טקסטורה קדימה ומעט נפח באזור הסנטר מאזנים עצמות לחיים רחבות.', avoid: [['צדדים מגולחים מאוד קצרים', 'מבליט את רוחב עצמות הלחיים']] },
};

const BEARD = {
  oval: 'כמעט כל צורה מתאימה – זיפים מסודרים או זקן קצר.',
  round: 'יותר אורך בסנטר וצדדים קצרים – יוצר זווית ומאריך.',
  square: 'זקן קצר ומעוגל מעט בתחתית מרכך את הזוויות, או זיפים שמדגישים את הלסת.',
  long: 'צדדים מלאים יותר וסנטר קצר – לא להאריך את הסנטר.',
  heart: 'זקן מלא באזור הסנטר והלסת התחתונה מאזן סנטר צר.',
  diamond: 'זקן מלא בסנטר, צדדים קצרים יותר.',
};

/** Built-in plan (no AI): from measurements + profile. Same shape as the AI result. */
export function localScan(answers) {
  const s = getState();
  const p = s.profile;
  const shape = faceShapeFrom(answers) || p.faceShape || 'oval';
  const fits = HAIRCUTS.filter((c) => c.face.includes(shape) && (!p.hairType || p.hairType === 'unknown' || c.hair.includes(p.hairType)))
    .filter((c) => p.minutes > 10 || c.styleMin <= 5).slice(0, 3);
  const adult = p.age >= 18;
  const t = s.transform;
  const b = t?.active ? bmi() : null;
  let rec = 'recomp', why = 'לבנות שריר ולשפר הרכב גוף באמצעות אימון כוח וחלבון.';
  if (!adult) { rec = 'bulk'; why = 'בגילך – בניית שריר וכוח, בלי גירעון קלורי. זה מה שמשנה כתפיים, חזה, גב ויציבה.'; }
  else if (b != null && b >= 25) { rec = 'cut'; why = 'חיטוב מתון יחשוף את קו הלסת ואת השרירים – זה השינוי הכי גדול שאפשר לעשות לפנים.'; }
  else if (b != null && b < 20.5) { rec = 'bulk'; why = 'המשקל כבר נמוך – בניית מסה תמלא כתפיים, חזה וגב ותיתן מראה חזק יותר.'; }
  const tips = FACE_TIPS[shape];
  return {
    source: 'local',
    faceShape: shape,
    faceShapeWhy: answers?.length ? `לפי המדידות: אורך הפנים ביחס לרוחב עצמות הלחיים ${(+answers.length / +answers.cheek).toFixed(2)}.` : 'לפי הבחירה בפרופיל.',
    strengths: [],
    jaw: { observation: 'מבנה העצמות לא משתנה, אבל הגדרת הלסת כן – לפי אחוז שומן, נפיחות, יציבה וזקן/תספורת.', actions: [adult ? 'להוריד אחוז שומן במסלול השינוי – זה הגורם מס׳ 1 לקו לסת מוגדר.' : 'אימון כוח ושינה – הפנים מתחדדות גם עם הגדילה.', '2.5-3 ליטר מים ביום, מלח במידה – פחות נפיחות בתוך ימים.', 'הכנסת סנטר 3×10 ביום וטלפון בגובה העיניים – הלסת נראית חדה יותר מיד.', p.address === 'f' ? 'תספורת עם שכבות ליד קו הלסת מדגישה אותה.' : `זקן: ${BEARD[shape]}`] },
    hair: { current: labelOf(HAIR_TYPES, p.hairType) || '', recommended: fits.map((c) => ({ id: c.id, why: `${tips.hair}`, askBarber: c.ask[0] })), avoid: tips.avoid.map(([name, why2]) => ({ name, why: why2 })), styling: tips.hair, products: fits[0]?.products || [] },
    beard: p.address === 'f' ? '' : BEARD[shape],
    skin: { observation: `סוג עור לפי הפרופיל: ${labelOf(SKIN_TYPES, p.skinType) || 'לא הוגדר'}.`, actions: ['בוקר: ניקוי, לחות, SPF 30+ כל יום.', 'ערב: ניקוי ולחות' + (adult ? ', רטינואיד 2-3 פעמים בשבוע.' : '.'), 'לא לפוצץ פצעונים.'], seeDermatologist: false },
    brows: 'לנקות שערות בין הגבות ומתחת לקו בלבד – בלי לשנות את הצורה.',
    body: { seen: false, observation: t?.active ? `משקל ממוצע ${currentWeight()} ק״ג${b ? `, BMI ${b}` : ''}.` : 'כדי לקבל המלצה מדויקת – להגדיר את מסלול השינוי (גובה ומשקל).', recommendation: rec, why },
    style: { colors: ['navy', 'white', 'grey', 'olive', 'black'], colorsWhy: 'צבעים ניטרליים ונייבי מחמיאים כמעט לכל גוון עור ומשתלבים זה עם זה.', buy: capsuleFor(p.styles, s.wardrobe).slice(0, 7), avoid: ['לוגואים גדולים בכל פריט', 'יותר מ-3 צבעים בולטים בלוק אחד', 'בגדים גדולים או קטנים מדי בכתפיים'] },
    quickWins: [
      { title: `לקבוע תור לתספורת: ${fits[0] ? CUT[fits[0].id].name : 'לפי הספרייה'}`, minutes: 5 },
      { title: 'לקנות קרם הגנה SPF 30+ ולהתחיל למרוח כל בוקר', minutes: 5 },
      { title: 'הכנסת סנטר 3×10 + טלפון בגובה העיניים', minutes: 5 },
      { title: 'לשתות 2.5 ליטר מים כל יום השבוע', minutes: 1 },
      { title: 'לסדר את הארון: להוציא בגדים שלא מתאימים במידה', minutes: 20 },
    ],
    plan: [
      { weeks: '1-2', focus: 'שינויים מהירים', actions: ['תספורת חדשה', 'שגרת עור + SPF', 'מים ושינה – פחות נפיחות', 'יציבה'] },
      { weeks: '3-6', focus: 'גוף ובגדים', actions: [rec === 'cut' ? 'חיטוב מתון לפי היעדים' : 'אימון כוח 3-4 פעמים בשבוע', 'לקנות 2-3 פריטי בסיס מהרשימה', 'זקן/גבות מסודרים'] },
      { weeks: '7-12', focus: 'השינוי נראה', actions: ['משקלים עולים באימונים', 'הרכב גוף משתנה', 'סגנון לבוש קבוע שמתאים לך'] },
    ],
    summary: `צורת פנים ${FACE_LABEL[shape]}. ${tips.hair}`,
  };
}

function prompt(p, s, labels) {
  const t = s.transform;
  const tg = t?.active ? computeTargets() : null;
  const cuts = HAIRCUTS.map((c) => `${c.id} = ${c.name} (${c.en})`).join('; ');
  const colors = COLORS.map((c) => c.id).join(', ');
  const cats = CATEGORIES.map((c) => c.id).join(', ');
  return `את/ה סטייליסט/ית, ספר/ית ומאמן/ת גלואו אפ מקצועי/ת. המשתמש העלה תמונות של עצמו כדי לקבל תוכנית שינוי אישית ומעשית.
התמונות: ${labels.join(' | ')}.
מידע מהאפליקציה: גיל ${p.age}; פנייה ${p.address === 'f' ? 'בלשון נקבה' : p.address === 'm' ? 'בלשון זכר' : 'ניטרלית'}; סוג שיער לפי המשתמש: ${labelOf(HAIR_TYPES, p.hairType) || 'לא ידוע'}; סוג עור: ${labelOf(SKIN_TYPES, p.skinType) || 'לא ידוע'}; סגנון אהוב: ${(p.styles || []).map((x) => labelOf(STYLES, x)).join(', ') || 'לא צוין'}; זמן לסידור בבוקר: ${p.minutes} דק׳${t?.active ? `; גובה ${t.heightCm} ס״מ, משקל ${currentWeight()} ק״ג, מטרה במסלול: ${t.goal}${tg?.kcal ? `, יעד ${tg.kcal} קק״ל` : ''}` : ''}.

כללים מחייבים:
- אין ציון, דירוג או מספר ליופי. אין השוואה לאחרים. אין מילים שליליות על המראה. תאר/י בצורה ניטרלית ומכבדת והתמקד/י במה לעשות.
- אל תסיק/י מוצא, דת, מצב רפואי או מגדר מהתמונה.
- אל תבטיח/י שינוי במבנה העצמות (לסת, סנטר, אף). מה שמשנה את מראה הלסת: אחוז שומן, נפיחות, יציבה, זקן ותספורת.
- ${p.age < 18 ? 'המשתמש מתחת לגיל 18: אסור להמליץ על גירעון קלורי או חיטוב בדיאטה. body.recommendation רק "bulk" או "recomp" (אימון כוח, חלבון, שינה).' : 'body.recommendation: "cut" אם נראה אחוז שומן גבוה שמסתיר הגדרה, "bulk" אם הגוף רזה ובנוי מעט, "recomp" אחרת, "none" אם אין תמונת גוף. אם המשתמש נראה רזה מאוד – לעולם לא "cut".'}
- עור: אם יש אקנה משמעותי, צלקות או פריחה – seeDermatologist=true.
- אם תמונה לא ברורה או שהפנים לא נראות – כתוב/כתבי זאת בשדה הרלוונטי ואל תמציא/י.
- hair.recommended: 2-3 תספורות, id חייב להיות אחד מהרשימה: ${cuts}.
- style.colors ו-buy[].color: רק מתוך: ${colors}. buy[].category רק מתוך: ${cats}. 5-8 פריטים לקנייה, ספציפיים (גזרה, בד, צבע) ובמחירים בשקלים.
- quickWins: 4-6 פעולות קונקרטיות לשבוע הקרוב.
- הכל בעברית, משפטים קצרים ומעשיים.

החזר/י רק JSON בצורה הזו:
{"faceShape":"oval|round|square|long|heart|diamond","faceShapeWhy":"","strengths":[""],"jaw":{"observation":"","actions":[""]},"hair":{"current":"","recommended":[{"id":"","why":"","askBarber":""}],"avoid":[{"name":"","why":""}],"styling":"","products":[""]},"beard":"","skin":{"observation":"","actions":[""],"seeDermatologist":false},"brows":"","body":{"seen":false,"observation":"","recommendation":"cut|bulk|recomp|none","why":""},"style":{"colors":[""],"colorsWhy":"","buy":[{"name":"","category":"","color":"","why":"","price":""}],"avoid":[""]},"quickWins":[{"title":"","minutes":5}],"plan":[{"weeks":"1-2","focus":"","actions":[""]}],"summary":""}`;
}

/** AI scan from photos. images: [{blob, label}] */
export async function aiScan(images, { onText, signal } = {}) {
  const s = getState();
  const res = await ask(prompt(s.profile, s, images.map((x, i) => `תמונה ${i + 1}: ${x.label}`)), {
    json: true, images: images.map((x) => x.blob), tier: 'complex', fresh: true, signal,
    onText: onText ? (t) => onText(t) : undefined,
  });
  return sanitize(res);
}

/** Keep only known ids/values so the UI never breaks on unexpected output. */
export function sanitize(r) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  const str = (x) => (typeof x === 'string' ? x : '');
  const out = {
    source: 'ai',
    faceShape: FACE_LABEL[r?.faceShape] ? r.faceShape : null,
    faceShapeWhy: str(r?.faceShapeWhy),
    strengths: arr(r?.strengths).map(str).filter(Boolean).slice(0, 5),
    jaw: { observation: str(r?.jaw?.observation), actions: arr(r?.jaw?.actions).map(str).filter(Boolean).slice(0, 6) },
    hair: {
      current: str(r?.hair?.current),
      recommended: arr(r?.hair?.recommended).filter((x) => CUT[x?.id]).slice(0, 3).map((x) => ({ id: x.id, why: str(x.why), askBarber: str(x.askBarber) })),
      avoid: arr(r?.hair?.avoid).slice(0, 4).map((x) => ({ name: str(x?.name), why: str(x?.why) })).filter((x) => x.name),
      styling: str(r?.hair?.styling), products: arr(r?.hair?.products).map(str).filter(Boolean).slice(0, 4),
    },
    beard: str(r?.beard),
    skin: { observation: str(r?.skin?.observation), actions: arr(r?.skin?.actions).map(str).filter(Boolean).slice(0, 6), seeDermatologist: !!r?.skin?.seeDermatologist },
    brows: str(r?.brows),
    body: { seen: !!r?.body?.seen, observation: str(r?.body?.observation), recommendation: ['cut', 'bulk', 'recomp', 'none'].includes(r?.body?.recommendation) ? r.body.recommendation : 'none', why: str(r?.body?.why) },
    style: {
      colors: arr(r?.style?.colors).filter((c) => COLOR[c]).slice(0, 8), colorsWhy: str(r?.style?.colorsWhy),
      buy: arr(r?.style?.buy).slice(0, 8).map((x) => ({ name: str(x?.name), category: CATEGORIES.some((c) => c.id === x?.category) ? x.category : 'top', color: COLOR[x?.color] ? x.color : 'black', why: str(x?.why), price: str(x?.price) })).filter((x) => x.name),
      avoid: arr(r?.style?.avoid).map(str).filter(Boolean).slice(0, 5),
    },
    quickWins: arr(r?.quickWins).slice(0, 6).map((x) => ({ title: str(x?.title || x), minutes: Math.max(1, Math.min(120, +x?.minutes || 5)) })).filter((x) => x.title),
    plan: arr(r?.plan).slice(0, 4).map((x) => ({ weeks: str(x?.weeks), focus: str(x?.focus), actions: arr(x?.actions).map(str).filter(Boolean).slice(0, 5) })),
    summary: str(r?.summary),
  };
  // safety net: never a deficit under 18
  if ((getState().profile?.age || 0) < 18 && out.body.recommendation === 'cut') out.body.recommendation = 'recomp';
  return out;
}
