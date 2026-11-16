// Built-in guide mode: a rule-based assistant that answers from the app's own content
// and the user's data. It is NOT an AI model, and the UI labels it as such.
import { getState, todayKey, addDays } from './store.js';
import { tasksFor, completion, streak, weekSummary, workoutFor, dayIndexOf, PACES } from './plan.js';
import { HAIRCUTS } from './data/haircuts.js';
import { suggestOutfits, COLOR, OCCASIONS } from './data/style.js';
import { MEALS } from './data/nutrition.js';
import { EXERCISES, levelNum } from './data/fitness.js';
import { GUIDES } from './data/guides.js';
import { labelOf, SKIN_TYPES, HAIR_TYPES } from './data/profile.js';
import { computeTargets, nextSession, isTrainingDay, currentWeight, foodTotals } from './transform.js';

const has = (t, words) => words.some((w) => t.includes(w));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function g(m, f, n) {
  const a = getState().profile?.address;
  return a === 'f' ? f : a === 'm' ? m : (n ?? m);
}

const INTENTS = [
  { id: 'crisis', words: ['להתאבד', 'לפגוע בעצמי', 'לא רוצה לחיות', 'פוגע בעצמי', 'פוגעת בעצמי', 'למות', 'אין טעם לחיות'] },
  { id: 'bodyimage', words: ['מכוער', 'מכוערת', 'שונא את עצמי', 'שונאת את עצמי', 'שמן מדי', 'שמנה מדי', 'שונא את הגוף', 'שונאת את הגוף', 'מתבייש במראה', 'מתביישת במראה', 'לא יפה', 'דירוג', 'ציון למראה', 'כמה אני יפה', 'תדרג'] },
  { id: 'transform', words: ['להשתנות', 'משתנה באמת', 'אני משתנה', 'להשתנות באמת', 'גלו אפ אמיתי', 'גלואו אפ אמיתי', 'לשנות את הגוף', 'לשנות את הפנים', 'מבנה גוף', 'להיראות טוב יותר', 'להתחטב', 'שינוי אמיתי', 'לבנות גוף', 'מסה', 'להגדיל שרירים'] },
  { id: 'diet', words: ['דיאטה', 'לרזות', 'ירידה במשקל', 'לרדת במשקל', 'קלוריות', 'צום', 'חיטוב', 'לחטב', 'להוריד קילו', 'אחוז שומן'] },
  { id: 'pain', words: ['כואב', 'כאב', 'פציעה', 'נפצעתי', 'נקע', 'סחרחורת', 'כאב בחזה'] },
  { id: 'rash', words: ['פריחה', 'גירוד', 'אלרגיה', 'צורב', 'שורף', 'נפיחות', 'אדום מאוד'] },
  { id: 'jaw', words: ['לסת', 'מיואינג', 'mewing', 'קו לסת', 'סנטר', 'מבנה פנים', 'עצמות לחיים'] },
  { id: 'height', words: ['לגבוה', 'להתארך', 'גובה', 'להיות גבוה'] },
  { id: 'motivation', words: ['מוטיבציה', 'להתמיד', 'אין לי כוח', 'עצלן', 'עצלנית', 'מתייאש', 'מתייאשת', 'לוותר', 'קשה לי', 'נשבר', 'נשברה', 'דחיינות'] },
  { id: 'acne', words: ['פצעון', 'פצעונים', 'אקנה', 'חצקון', 'חצ\'קון', 'חצקונים', 'נקודות שחורות'] },
  { id: 'brows', words: ['גבות', 'גבה'] },
  { id: 'teeth', words: ['שיניים', 'ריח פה', 'חוט דנטלי', 'מברשת', 'הלבנה', 'חיוך'] },
  { id: 'outfit', words: ['לוק', 'ללבוש', 'בגד', 'בגדים', 'סטייל', 'תלבושת', 'שילוב', 'צבעים', 'ארון', 'אאוטפיט', 'stylist'] },
  { id: 'skin', words: ['טיפוח', ' עור', 'העור', 'לעור', 'קרם', 'לחות', 'ניקוי פנים', 'הגנה', 'spf', 'שגרת בוקר', 'שגרת ערב'] },
  { id: 'hair', words: ['תספורת', 'שיער', 'פייד', 'fade', 'תסרוקת', 'מספרה', 'לספר', 'הספר', 'קרופ', 'באז', 'תלתלים', 'ווקס', 'קליי'] },
  { id: 'posture', words: ['יציבה', 'גב תפוס', 'צוואר', 'כפוף', 'כתפיים עגולות'] },
  { id: 'workout', words: ['אימון', 'להתאמן', 'כושר', 'שרירים', 'תרגיל', 'כוח', 'בטן', 'חזה', 'גב', 'ידיים', 'רגליים', 'כתפיים', 'שכיבות'] },
  { id: 'food', words: ['לאכול', 'אוכל', 'ארוחה', 'ארוחת', 'תזונה', 'חלבון', 'נשנוש', 'מתכון', 'רעב'] },
  { id: 'water', words: ['מים', 'לשתות', 'שתייה'] },
  { id: 'sleep', words: ['שינה', 'לישון', 'עייף', 'עייפה', 'נרדם', 'נרדמת', 'להירדם'] },
  { id: 'progress', words: ['התקדמות', 'איך אני מתקדם', 'איך אני מתקדמת', 'סיכום', 'כמה עשיתי', 'רצף', 'להתאים את התוכנית', 'לשנות קצב', 'קצב'] },
  { id: 'today', words: ['היום', 'מה לעשות', 'משימות', 'תוכנית', 'מה עכשיו', 'מאיפה להתחיל'] },
  { id: 'confidence', words: ['ביטחון', 'בטוח בעצמי', 'בטוחה בעצמי', 'ביישן', 'ביישנית'] },
  { id: 'smell', words: ['ריח', 'זיעה', 'דאודורנט', 'בושם'] },
  { id: 'thanks', words: ['תודה', 'אחלה', 'מעולה', 'סבבה'] },
  { id: 'hello', words: ['היי', 'שלום', 'הי ', 'מה קורה', 'מה נשמע', 'בוקר טוב', 'ערב טוב'] },
];

export function detectIntent(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  for (const it of INTENTS) if (has(t, it.words)) return it.id;
  return null;
}

export function localReply(text) {
  const s = getState();
  const p = s.profile;
  const intent = detectIntent(text);
  const key = todayKey();
  const lv = levelNum(p.fitnessLevel);
  const teen = p.age < 18;

  switch (intent) {
    case 'crisis':
      return { text: `${p.name}, אני ממש שמח/ה שכתבת. מה שאת/ה מרגיש/ה חשוב, ואת/ה לא לבד.\n\n**חשוב לדבר עכשיו עם מישהו:**\n1. מבוגר שסומכים עליו – הורה, מורה, יועץ/ת.\n2. ער״ן – עזרה ראשונה נפשית, 24/7: **1201** (יש גם צ׳אט באתר).\n3. במצב של סכנה מיידית: מד״א **101** או משטרה **100**.\n\nאני כאן גם אחר כך, אבל אנשים אמיתיים יכולים לעזור עכשיו. 💜`, actions: [] };
    case 'bodyimage':
      return { text: `אני לא נותן/ת ציונים ולא מדרג/ת מראה – כי זה לא מודד שום דבר אמיתי, והשוואות רק מזיקות.\n\nמה שכן עובד: לדאוג לעצמך – שינה, תנועה, טיפוח, בגדים שמרגישים טוב. אלה דברים שבשליטה שלך, והם משפיעים גם על ההרגשה.\n\nואם המחשבות על המראה מעסיקות הרבה או גורמות לעצב – זה חשוב לשתף מבוגר שסומכים עליו או יועץ/ת. ער״ן זמינים ב-1201.`, actions: [{ label: 'מדריך ביטחון עצמי', go: '#/guide/confidence' }, { label: 'מסלול שינוי בריא', go: '#/transform' }] };
    case 'transform':
    case 'diet': {
      const t = s.transform;
      if (teen) {
        return { text: `שינוי אמיתי בגיל ${p.age} נראה ככה – ובלי דיאטה, כי הגוף עוד גדל:\n\n1. **אימון כוח 3 פעמים בשבוע** עם עומס שעולה מאימון לאימון – זה מה שבונה כתפיים, חזה, גב ורגליים.\n2. **חלבון בכל ארוחה** (~${Math.round((t?.startWeight || 60) * 1.4)}ג׳ ביום מאוכל רגיל).\n3. **9,000 צעדים** ושינה של 8-10 שעות.\n4. **פרוטוקול פנים**: עור, תספורת, יציבה ונפיחות – משנה את המראה כבר בשבועות הראשונים.\n\nבמסלול השינוי כל זה מחושב ומתעדכן לבד.`, actions: [{ label: t?.active ? 'למסלול שלי' : 'להתחיל מסלול שינוי', go: '#/transform' }] };
      }
      if (!t?.active) {
        return { text: `בוא/י נעשה את זה כמו שצריך. מסלול השינוי בונה לך:\n\n1. **יעד קלוריות וחלבון** שמחושב לגוף שלך (גירעון מתון לחיטוב / עודף קטן למסה).\n2. **תוכנית אימון עם עומס הדרגתי** – משקל וחזרות מדויקים לכל תרגיל, שעולים מאימון לאימון.\n3. **בדיקה שבועית** של ממוצע המשקל – והתוכנית מתקנת את עצמה.\n4. **פרוטוקול פנים** – שומן, נפיחות, עור, זקן, תספורת ויציבה.\n\nלוקח דקה להגדיר.`, actions: [{ label: 'להתחיל מסלול שינוי', go: '#/transform' }] };
      }
      const tg = computeTargets();
      const ft = foodTotals();
      return { text: `המסלול שלך:\n• **${tg.kcal?.toLocaleString('he-IL')} קלוריות** ו-**${tg.protein}ג׳ חלבון** ביום (היום: ${Math.round(ft.kcal)} / ${Math.round(ft.p)}ג׳)\n• **${tg.steps.toLocaleString('he-IL')} צעדים**\n• אימון: ${isTrainingDay() ? `היום – ${nextSession().name}` : 'היום מנוחה'}\n• משקל ממוצע: ${currentWeight() ?? '—'} ק״ג\n\nהכלל: לעמוד ביעדים רוב הימים, להעלות משקלים באימונים, ולתת למערכת לכוונן כל שבוע. בלי צומות, בלי תוספי "חיטוב".`, actions: [{ label: 'למסלול', go: '#/transform' }, { label: 'רישום אוכל', go: '#/transform?tab=food' }] };
    }
    case 'pain':
      return { text: `כאב הוא סימן לעצור. 🛑\n\n- **כאב חד, כאב במפרק, נפיחות או קושי בתנועה** – לא להתאמן על האזור ולפנות לרופא/ת אם זה לא עובר תוך כמה ימים.\n- **כאב בחזה, קוצר נשימה חריג או סחרחורת** במאמץ – להפסיק מיד ולפנות לעזרה רפואית.\n- כאב שרירים עמום יום-יומיים אחרי אימון חדש – נפוץ. הליכה קלה ומתיחות עדינות עוזרות.`, actions: [{ label: 'התאוששות', go: '#/fitness?tab=recovery' }] };
    case 'rash':
      return { text: `אם מוצר גרם לפריחה, צריבה חזקה, גירוד או נפיחות:\n1. להפסיק את המוצר מיד.\n2. לשטוף במים פושרים, בלי לשפשף.\n3. לא למרוח מוצרים חדשים על האזור.\n4. **אם יש נפיחות בפנים, בעיניים או קושי בנשימה – לפנות מיד לעזרה רפואית.**\n5. אם זה לא נרגע תוך יום-יומיים – לפנות לרופא/ת.\n\nבפעם הבאה: בדיקת רגישות על אזור קטן לפני שימוש.`, actions: [{ label: 'לפני שקונים מוצר', go: '#/guide/products-check' }] };
    case 'jaw':
      return { text: `שאלה מצוינת, והתשובה הכנה: **מבנה העצמות של הפנים והלסת נקבע בעיקר על ידי גנטיקה וגדילה טבעית.** אין הוכחה שתרגילי פנים, מיואינג או מכשירים משנים אותו – ולעיסה מוגזמת אפילו עלולה לגרום לכאבי לסת.\n\nמה כן משפיע על המראה:\n1. **יציבה** – ראש קדימה מטלפון משנה את קו הצוואר. תרגיל "הכנסת סנטר" עוזר.\n2. **תספורת וזקן** – יכולים להדגיש קווים מיד.\n3. **שינה ושתייה** – פחות נפיחות.\n${teen ? '4. **זמן** – הפנים ממשיכות להתפתח לאורך גיל ההתבגרות.' : ''}`, actions: [{ label: 'המדריך המלא', go: '#/guide/jaw' }, { label: 'תרגיל הכנסת סנטר', go: '#/exercise/chin-tuck' }] };
    case 'height':
      return { text: `הגובה נקבע בעיקר על ידי גנטיקה, ונמשך עד סוף גיל ההתבגרות. אין תרגילים או תוספים שמוכחים כמגבירים גובה.\n\nמה שתומך בגדילה תקינה: שינה מספקת, תזונה מגוונת עם חלבון וסידן, ופעילות גופנית. ויציבה זקופה גורמת להיראות במלוא הגובה כבר היום.\n\nאם יש דאגה לגבי הגדילה – רופא/ת ילדים או משפחה יכולים לבדוק.`, actions: [{ label: 'תזונה לגדילה', go: '#/guide/growth-nutrition' }] };
    case 'acne':
      return { text: `פצעונים נפוצים מאוד${teen ? ' בגילך' : ''} ולא קשורים ל"חוסר ניקיון". מה שעובד:\n1. ניקוי עדין פעמיים ביום ואחרי אימון.\n2. לא לפוצץ ולא לסחוט.\n3. קרם לחות "לא קומדוגני" וקרם הגנה.\n4. מוצר טיפולי אחד בכל פעם (למשל בנזואיל פרוקסיד 2.5% או חומצה סליצילית), 2-3 פעמים בשבוע בהתחלה.\n5. סבלנות – 6-8 שבועות לשיפור.\n\n**לרופא/ת** אם יש פצעים עמוקים וכואבים, צלקות, או אין שיפור אחרי 2-3 חודשים.`, actions: [{ label: 'מדריך הפצעונים', go: '#/guide/acne' }, { label: 'השגרה שלי', go: '#/care' }] };
    case 'skin': {
      const st = labelOf(SKIN_TYPES, p.skinType) || 'לא הוגדר';
      return { text: `שגרת טיפוח לעור ${st}:\n\n**בוקר**\n1. ${p.skinType === 'dry' || p.skinType === 'sensitive' ? 'שטיפה במים פושרים' : 'ניקוי עדין'}\n2. קרם לחות ${p.skinType === 'oily' || p.skinType === 'combination' ? 'קליל (ג׳ל)' : p.skinType === 'dry' ? 'עשיר' : ''}\n3. קרם הגנה SPF 30+ – הכי חשוב!\n\n**ערב**\n1. ניקוי עדין (להסיר את קרם ההגנה)\n2. קרם לחות\n\nפשוט ועקבי עדיף על הרבה מוצרים. במסך הטיפוח אפשר לסמן כל צעד ולהוסיף את המוצרים שלך.`, actions: [{ label: 'לשגרת הטיפוח', go: '#/care' }, { label: 'סוגי עור', go: '#/guide/skin-types' }] };
    }
    case 'hair': {
      const fits = HAIRCUTS.filter((c) => (!p.hairType || p.hairType === 'unknown' || c.hair.includes(p.hairType)) && (!p.faceShape || c.face.includes(p.faceShape)));
      const top = (fits.length ? fits : HAIRCUTS).filter((c) => p.minutes > 10 || c.styleMin <= 5).slice(0, 3);
      return { text: `לפי ${p.hairType && p.hairType !== 'unknown' ? `שיער ${labelOf(HAIR_TYPES, p.hairType)}` : 'הפרופיל שלך'}${p.faceShape ? ' וצורת הפנים שבחרת' : ''}, הנה 3 תספורות שכדאי לבדוק:\n\n${top.map((c, i) => `${i + 1}. **${c.name}** – ${c.desc.split('.')[0]}.`).join('\n')}\n\n${p.faceShape ? '' : 'טיפ: בחירת צורת פנים בספריית התספורות תשפר את ההתאמה. '}כשהולכים לספר – להראות תמונה ולהגיד כמה זמן יש לך לסדר בבוקר.`, actions: [{ label: '📸 ניתוח מתמונה', go: '#/scan' }, ...top.map((c) => ({ label: c.name, go: '#/cut/' + c.id })), { label: 'איך בוחרים תספורת', go: '#/guide/hair-choose' }] };
    }
    case 'outfit': {
      const occ = OCCASIONS.find((o) => text.includes(o.label))?.id || (has(text, ['אירוע', 'חתונה', 'בר מצווה', 'בת מצווה']) ? 'event' : has(text, ['יציאה', 'לצאת', 'מסיבה']) ? 'out' : has(text, ['בית ספר', 'בית הספר']) ? 'school' : has(text, ['ספורט', 'אימון']) ? 'sport' : 'daily');
      const outfits = suggestOutfits(s.wardrobe, occ, { count: 1, seed: Date.now() });
      const occLabel = OCCASIONS.find((o) => o.id === occ).label;
      if (!s.wardrobe.length) return { text: `כדי להציע לוק מהבגדים שלך, צריך קודם להוסיף כמה פריטים לארון הדיגיטלי (תמונה לא חובה).\n\nבינתיים, נוסחה בטוחה ל${occLabel}: פריט אחד צבעוני על בסיס ניטרלי (שחור/לבן/אפור/נייבי/בז׳), נעליים נקיות ואביזר אחד.`, actions: [{ label: 'לארון הדיגיטלי', go: '#/style' }, { label: 'מדריך צבעים', go: '#/guide/colors' }] };
      if (!outfits.length) return { text: `לא מצאתי שילוב מלא ל${occLabel} מהפריטים שבארון. כדאי לוודא שיש לפחות חולצה, מכנס ונעליים שמסומנים כמתאימים ל${occLabel}.`, actions: [{ label: 'לארון', go: '#/style' }] };
      const o = outfits[0];
      return { text: `לוק ל${occLabel} מהארון שלך:\n\n${o.items.map((i) => `• ${i.name} (${COLOR[i.color]?.label})`).join('\n')}\n\n**למה זה עובד:** ${o.reasons.slice(0, 2).join('; ') || 'שילוב צבעים מאוזן'}.`, actions: [{ label: 'עוד הצעות בסטייליסט', go: `#/style?tab=stylist&occ=${occ}` }] };
    }
    case 'workout': {
      const w = p.areas.includes('fitness') ? workoutFor(p, s.program, dayIndexOf(s.program)) : null;
      const muscle = [['חזה', 'chest'], ['גב', 'back'], ['כתפיים', 'shoulders'], ['ידיים', 'arms'], ['רגליים', 'legs'], ['בטן', 'core']].find(([he]) => text.includes(he));
      if (muscle) {
        const list = EXERCISES.filter((e) => e.cat === muscle[1] && e.level <= lv).slice(0, 3);
        return { text: `תרגילים ל${muscle[0]} שמתאימים לרמה שלך:\n\n${list.map((e, i) => `${i + 1}. **${e.name}** – ${e.reps[lv]}`).join('\n')}\n\nבכל תרגיל יש הדגמה מונפשת, הסבר, טעויות נפוצות והתאמות. 1-2 תרגילים לקבוצת שריר באימון זה מספיק – ולתת לה 48 שעות מנוחה.`, actions: list.map((e) => ({ label: e.name, go: '#/exercise/' + e.id })) };
      }
      return w
        ? { text: `האימון שלך להיום: **${w.name}** (${w.focus}, כ-${w.minutes} דק׳).\n\n1. חימום קצר 3-5 דקות.\n2. התרגילים לפי הסדר, 60-90 שניות מנוחה בין סטים.\n3. טכניקה לפני כמות.\n4. שחרור ומתיחות בסוף.\n\nאפשר להיכנס ל"מצב אימון מודרך" עם טיימר מנוחה.`, actions: [{ label: 'להתחיל אימון', go: '#/workout/' + w.id }] }
        : { text: `היום ${p.areas.includes('fitness') ? 'יום מנוחה בתוכנית שלך 💤 – המנוחה היא חלק מהאימון. אפשר הליכה קלה או מתיחות.' : 'כושר לא נמצא בתחומים שבחרת, אבל אפשר תמיד לבחור אימון מהספרייה.'}`, actions: [{ label: 'מתיחות קלות', go: '#/workout/mobility' }, { label: 'כל האימונים', go: '#/fitness' }] };
    }
    case 'posture':
      return { text: `5 דקות ביום ליציבה טובה יותר:\n1. **הכנסת סנטר** – 8 חזרות, החזקה של 3 שניות.\n2. **מלאך על הקיר** – 8 חזרות.\n3. **פתיחת גומייה** או מתיחת חזה במשקוף.\n4. **חתול-פרה** – 8 תנועות איטיות.\n\nובמהלך היום: טלפון בגובה העיניים, ולקום כל 45-60 דקות.`, actions: [{ label: 'אימון היציבה', go: '#/workout/posture' }, { label: 'מדריך יציבה', go: '#/guide/posture-basics' }] };
    case 'food': {
      const hr = new Date().getHours();
      const type = hr < 11 ? 'breakfast' : hr < 16 ? 'lunch' : hr < 21 ? 'dinner' : 'snacks';
      const label = { breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב', snacks: 'נשנוש' }[type];
      const ideas = [...MEALS[type]].sort(() => Math.random() - 0.5).slice(0, 3);
      return { text: `3 רעיונות ל${label}:\n\n${ideas.map((m, i) => `${i + 1}. **${m.name}** (${m.time} דק׳) – ${m.parts.join(', ')}`).join('\n')}\n\nהנוסחה: חצי צלחת ירקות/פירות, רבע חלבון, רבע פחמימה.`, actions: [{ label: 'עוד רעיונות', go: `#/nutrition?tab=meals&type=${type}` }, { label: 'התפריט שלי', go: '#/nutrition' }] };
    }
    case 'water': {
      const n = s.days[key]?.water || 0; const goal = s.routines?.waterGoal || 8;
      return { text: `היום שתית ${n} מתוך ${goal} כוסות. ${n >= goal ? 'מעולה! 💧' : 'טריקים: בקבוק בהישג יד, כוס עם כל ארוחה, ומים עם לימון או נענע.'}\n\nסימן טוב לשתייה מספקת: שתן בצבע צהוב בהיר.`, actions: [{ label: 'מעקב מים', go: '#/nutrition' }] };
    }
    case 'sleep': {
      const r = s.routines;
      return { text: `השעות שלך: שינה ב-${r.bed}, השכמה ב-${r.wake}. ${teen ? 'בגילך מומלץ 8-10 שעות.' : 'מומלץ 7-9 שעות.'}\n\nמה עוזר להירדם:\n1. שעה קבועה – גם בסופ״ש.\n2. בלי מסכים 30-60 דקות לפני.\n3. חדר חשוך וקריר.\n4. בלי קפאין אחרי הצהריים.\n5. אור יום ותנועה בבוקר.`, actions: [{ label: 'מעקב שינה', go: '#/routine?tab=sleep' }, { label: 'תזכורת לשינה', go: '#/routine?tab=reminders' }] };
    }
    case 'teeth':
      return { text: `לחיוך בריא ונשימה רעננה:\n1. צחצוח פעמיים ביום, 2 דקות, משחה עם פלואוריד.\n2. חוט דנטלי פעם ביום.\n3. לצחצח בעדינות גם את הלשון.\n4. לירוק בלי לשטוף הרבה אחרי.\n5. ביקורת אצל רופא/ת שיניים.\n\nהלבנה – רק אחרי התייעצות עם רופא/ת שיניים${teen ? ', במיוחד בגילך' : ''}.`, actions: [{ label: 'המדריך המלא', go: '#/guide/oral' }] };
    case 'brows':
      return { text: `סידור גבות בטוח:\n1. פינצטה נקייה, אור טוב, אחרי מקלחת.\n2. למרוט רק שערות בודדות בין הגבות ומתחת לקו.\n3. לא למרוט מעל הגבה.\n4. לעצור כל כמה שערות ולהסתכל מרחוק.\n\nפחות זה יותר – לוקח זמן לגדל בחזרה.`, actions: [{ label: 'המדריך המלא', go: '#/guide/brows' }] };
    case 'motivation': {
      const c = completion(key);
      return { text: `${pick(['זה לגמרי בסדר להרגיש ככה.', 'כולם עוברים את זה – גם הכי מתמידים.', 'אני איתך.'])} הנה מה שעובד:\n\n1. **מתחילים קטן** – משימה אחת של 2 דקות. לפעמים זה כל מה שצריך.\n2. **מצמידים להרגל קיים** – טיפוח מיד אחרי צחצוח שיניים.\n3. **לא מוותרים על הרצף** – גם יום עם משימה אחת שומר עליו (כרגע: ${streak()} ימים 🔥).\n4. **מורידים קצב** אם צריך – קצב "רגוע" הוא עדיין התקדמות.\n\n${c.total ? `היום: ${c.done}/${c.total}. ${c.done ? 'כבר התחלת – יופי!' : 'מה המשימה הכי קלה ברשימה?'}` : ''}`, actions: [{ label: 'המשימות של היום', go: '#/home' }, { label: 'לעבור לקצב רגוע', pace: 'light' }] };
    }
    case 'progress': return progressReply();
    case 'today': {
      const ts = tasksFor(key);
      const todo = ts.filter((t) => !s.days[key]?.done?.[t.id] && t.id !== 'rest');
      if (!todo.length) return { text: `סיימת את כל המשימות להיום! 🎉 ${g('אלוף', 'אלופה', 'כל הכבוד')}.\nאפשר לנוח, לקרוא מדריך או לתכנן את מחר.`, actions: [{ label: 'מדריכים', go: '#/learn' }] };
      const next = [...todo].sort((a, b) => (a.minutes || 0) - (b.minutes || 0))[0];
      return { text: `נשארו לך ${todo.length} משימות להיום:\n\n${todo.map((t) => `• ${t.title}${t.minutes ? ` (${t.minutes} דק׳)` : ''}`).join('\n')}\n\n**הצעה:** להתחיל ב"${next.title}" – זו הקצרה ביותר. וככה עושים אותה:\n${(next.steps || []).slice(0, 4).map((x, i) => `${i + 1}. ${x}`).join('\n')}`, actions: [{ label: 'למסך הבית', go: '#/home' }, next.link ? { label: 'למדריך המשימה', go: next.link } : null].filter(Boolean) };
    }
    case 'confidence':
      return { text: `ביטחון נבנה מפעולות קטנות:\n1. לעמוד במשימות שהבטחת לעצמך – גם קטנות.\n2. יציבה זקופה וקשר עין.\n3. בגדים שמרגישים טוב עליך.\n4. שינה, תנועה ואוכל טוב.\n5. לפרגן לעצמך על כל התקדמות.\n\nוזכור/י: הרבה ממה שרואים ברשת ערוך ומפולטר.`, actions: [{ label: 'מדריך ביטחון עצמי', go: '#/guide/confidence' }] };
    case 'smell':
      return { text: `לרעננות לאורך היום:\n1. מקלחת אחרי פעילות וזיעה.\n2. דאודורנט על עור נקי ויבש.\n3. בגדים וגרביים נקיים כל יום.\n4. בושם – מעט מאוד (ריסוס אחד-שניים).\n5. לשתות מים.`, actions: [{ label: 'הרגלים למראה רענן', go: '#/guide/fresh' }] };
    case 'thanks':
      return { text: pick(['בכיף! 💜 אני כאן בכל שאלה.', 'שמח/ה לעזור! ממשיכים ככה.', 'תמיד. בהצלחה היום! ✨']), actions: [] };
    case 'hello':
      return { text: `היי ${p.name}! 👋 במה נתמקד היום? אפשר לשאול על המשימות, טיפוח, תספורת, אימון, ארוחה, לוק או איך להתמיד.`, actions: [{ label: 'מה לעשות היום?', ask: 'מה לעשות היום?' }, { label: 'איך אני מתקדם/ת?', ask: 'איך אני מתקדם?' }] };
    default: {
      const term = text.replace(/[?!.,]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
      const found = GUIDES.filter((gd) => term.some((w) => gd.title.includes(w) || gd.summary.includes(w))).slice(0, 3);
      return {
        text: found.length
          ? `לא בטוח/ה שהבנתי עד הסוף, אבל אולי אחד המדריכים האלה יעזור:\n\n${found.map((x) => `• ${x.title}`).join('\n')}`
          : `במצב המדריך המובנה אני יודע/ת לעזור ב: משימות היום, שגרת טיפוח, פצעונים, תספורות, לוקים מהארון שלך, אימונים, יציבה, ארוחות, מים, שינה, שיניים, מוטיבציה והתקדמות.\n\nנסו לנסח עם אחת המילים האלה${s.coach.apiKey ? '' : ', או לחבר מאמן AI אמיתי בהגדרות כדי לקבל תשובות חופשיות לכל שאלה'}.`,
        actions: [...found.map((x) => ({ label: x.title, go: '#/guide/' + x.id })), ...(found.length ? [] : [{ label: 'מה לעשות היום?', ask: 'מה לעשות היום?' }, { label: 'חיבור מאמן AI', go: '#/settings?sec=coach' }])],
      };
    }
  }
}

/** Analyses the last 7 days and suggests adapting the plan. */
export function progressReply() {
  const s = getState();
  const key = todayKey();
  const ws = weekSummary(addDays(key, -6));
  const pct = Math.round(ws.pct * 100);
  const pace = s.program.pace;
  let advice, actions = [{ label: 'מסך ההתקדמות', go: '#/progress' }];
  if (ws.total === 0) advice = 'עדיין אין מספיק נתונים. נתחיל מהמשימות של היום!';
  else if (ws.pct >= 0.85 && pace !== 'intense') { advice = 'את/ה מצליח/ה מאוד! אם זה מרגיש קל, אפשר להעלות לקצב "ממוקד" – עם עוד משימות (וימי מנוחה נשמרים).'; actions.push({ label: 'להעלות לקצב ממוקד', pace: pace === 'light' ? 'normal' : 'intense' }); }
  else if (ws.pct < 0.4 && pace !== 'light') { advice = 'נראה שהקצב קצת עמוס כרגע – וזה בסדר גמור. קצב "רגוע" ישאיר רק את החשוב ביותר, כדי שיהיה קל להתמיד.'; actions.push({ label: 'לעבור לקצב רגוע', pace: 'light' }); }
  else advice = 'הקצב הנוכחי מתאים לך. ממשיכים ככה, ומשפרים משימה אחת בכל פעם.';
  const byArea = {};
  for (const d of ws.days) for (const t of tasksFor(d.key)) { if (t.id === 'rest') continue; byArea[t.area] ||= [0, 0]; byArea[t.area][1]++; if (s.days[d.key]?.done?.[t.id]) byArea[t.area][0]++; }
  const names = { skin: 'טיפוח', hair: 'שיער', fitness: 'כושר', posture: 'יציבה', nutrition: 'תזונה', style: 'סטייל', sleep: 'שינה', hygiene: 'רעננות', core: 'בסיס', custom: 'אישיות' };
  const rows = Object.entries(byArea).filter(([, v]) => v[1]).sort((a, b) => b[0] / b[1] - a[0] / a[1]);
  const strong = rows[0], weak = rows[rows.length - 1];
  return {
    text: `סיכום 7 הימים האחרונים:\n• הושלמו ${ws.done} מתוך ${ws.total} משימות (${pct}%)\n• ימים פעילים: ${ws.activeDays}/7\n• רצף נוכחי: ${streak()} ימים 🔥\n${strong && weak && strong !== weak ? `• הכי חזק: ${names[strong[0]] || strong[0]} · שווה חיזוק: ${names[weak[0]] || weak[0]}\n` : ''}\n${advice}\nקצב נוכחי: ${PACES.find((x) => x.id === pace).label}.`,
    actions,
  };
}

export const QUICK = [
  'איך אני משתנה באמת?', 'מה לעשות היום?', 'תבנה לי שגרת טיפוח', 'איזו תספורת תתאים לי?', 'תציע לי לוק לבית ספר',
  'איזה אימון לעשות?', 'רעיון לארוחה', 'אין לי מוטיבציה', 'איך אני מתקדם?',
];
