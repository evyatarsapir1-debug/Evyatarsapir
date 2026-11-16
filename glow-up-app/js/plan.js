// Personal plan engine: builds today's tasks from the profile + chosen program.
import { getState, todayKey, addDays, daysBetween, day } from './store.js';
import { WORKOUTS, levelNum } from './data/fitness.js';

export const PROGRAMS = [
  { length: 7, name: 'תוכנית 7 ימים', sub: 'התנעה: בונים בסיס והרגלים ראשונים', icon: 'zap' },
  { length: 30, name: 'תוכנית 30 ימים', sub: 'שינוי הרגלים אמיתי – 4 שלבים', icon: 'target' },
  { length: 90, name: 'תוכנית 90 ימים', sub: 'גלואו אפ מלא ומתמשך – 3 פאזות', icon: 'crown' },
];
export const PACES = [
  { id: 'light', label: 'רגוע', desc: 'פחות משימות, מתאים לתקופה עמוסה', factor: 0.7 },
  { id: 'normal', label: 'מאוזן', desc: 'הקצב המומלץ', factor: 1 },
  { id: 'intense', label: 'ממוקד', desc: 'יותר משימות – עדיין עם ימי מנוחה', factor: 1.3 },
];

export function phaseOf(program, dayIndex) {
  const L = program.length;
  if (L === 7) return { n: 1, name: 'בסיס', desc: 'מכירים את השגרה ובונים הרגלים קטנים.' };
  if (L === 30) {
    const w = Math.min(3, Math.floor(dayIndex / 7));
    return [
      { n: 1, name: 'בסיס', desc: 'שגרת טיפוח פשוטה, תנועה קלה ושתייה.' },
      { n: 2, name: 'בנייה', desc: 'מוסיפים אימוני כוח ותכנון לבוש ותזונה.' },
      { n: 3, name: 'העלאת רמה', desc: 'עוד קצת עומס באימונים ושיפור הסטייל.' },
      { n: 4, name: 'ביסוס', desc: 'מקבעים את ההרגלים כדי שיישארו גם אחרי התוכנית.' },
    ][w];
  }
  const m = Math.min(2, Math.floor(dayIndex / 30));
  return [
    { n: 1, name: 'יסודות', desc: 'הרגלים יציבים: טיפוח, תנועה, שינה ושתייה.' },
    { n: 2, name: 'התקדמות', desc: 'אימונים מגוונים יותר, תספורת וסטייל מותאמים.' },
    { n: 3, name: 'גרסה הכי טובה', desc: 'שגרה אישית מלאה שמרגישה טבעית.' },
  ][m];
}

// ---------------- task library ----------------
// area must be one of profile AREAS ids, or 'core'.
// prio: lower = more important when trimming to the user's time budget.
const T = {
  water: { area: 'core', prio: 0, minutes: 1, icon: 'droplet', title: 'לשתות מים לאורך היום', why: 'שתייה מספקת עוזרת לאנרגיה, לריכוז ולתחושה רעננה.', steps: ['להחזיק בקבוק מים בהישג יד.', 'לשתות כוס עם כל ארוחה ואחרי אימון.', 'לסמן כוסות במסך התזונה.'], link: '#/nutrition' },
  'skin-am': { area: 'skin', prio: 1, minutes: 4, icon: 'sun', title: 'שגרת טיפוח בוקר', link: '#/care' },
  'skin-pm': { area: 'skin', prio: 1, minutes: 4, icon: 'moon', title: 'שגרת טיפוח ערב', link: '#/care' },
  pillow: { area: 'skin', prio: 6, minutes: 2, icon: 'bed', title: 'להחליף ציפית', why: 'ציפית נקייה מפחיתה מגע של שומן ולכלוך עם העור.', steps: ['להחליף ציפית פעם-פעמיים בשבוע.', 'לכבס במים חמים.'], link: '#/guide/acne' },
  teeth: { area: 'core', prio: 1, minutes: 4, icon: 'tooth', title: 'צחצוח שיניים + חוט דנטלי', why: 'חיוך בריא ונשימה רעננה מתחילים כאן. רופאי שיניים ממליצים על צחצוח פעמיים ביום ושימוש יומי בחוט.', steps: ['לצחצח 2 דקות עם משחה עם פלואוריד.', 'מברשת בזווית 45° לחניכיים, תנועות קטנות ועדינות.', 'חוט דנטלי בין כל השיניים.', 'לא לשטוף את הפה במים מיד אחרי (נותן לפלואוריד לפעול).'], link: '#/guide/oral' },
  'hair-style': { area: 'hair', prio: 3, minutes: 5, icon: 'comb', title: 'סידור שיער', link: '#/hair' },
  'hair-wash': { area: 'hair', prio: 2, minutes: 8, icon: 'droplet', title: 'יום חפיפה', link: '#/guide/hair-care' },
  'hair-cut': { area: 'hair', prio: 4, minutes: 5, icon: 'scissors', title: 'לבחור תספורת ולקבוע תור', why: 'תספורת שמתאימה לצורת הפנים ולסוג השיער היא אחד השינויים הכי מורגשים.', steps: ['להיכנס לספריית התספורות.', 'לשמור 2-3 תספורות שאוהבים.', 'להראות לספר את התמונה ולהסביר כמה זמן יש לך לסדר בבוקר.'], link: '#/hair' },
  workout: { area: 'fitness', prio: 2, icon: 'dumbbell', title: 'אימון', link: '#/fitness' },
  posture: { area: 'posture', prio: 3, minutes: 6, icon: 'posture', title: '5 דקות יציבה', why: 'תרגילי יציבה קצרים מחזקים את הגב העליון ומשחררים את הצוואר מישיבה מול מסכים.', steps: ['הכנסת סנטר – 8 חזרות.', 'מלאך על הקיר – 8 חזרות.', 'פתיחת גומייה או מתיחת חזה במשקוף.', 'חתול-פרה – 8 חזרות.'], link: '#/workout/posture' },
  'nutr-breakfast': { area: 'nutrition', prio: 3, minutes: 10, icon: 'egg', title: 'ארוחת בוקר מאוזנת', why: 'ארוחת בוקר עם חלבון, פחמימה מורכבת ופרי נותנת אנרגיה יציבה לבוקר.', steps: ['לבחור רעיון מתפריט ארוחות הבוקר.', 'לשלב חלבון (ביצה, יוגורט, גבינה, טחינה).', 'להוסיף פרי או ירק.'], link: '#/nutrition' },
  'nutr-veg': { area: 'nutrition', prio: 4, minutes: 3, icon: 'leaf', title: 'חצי צלחת ירקות בארוחה אחת', why: 'ירקות מספקים סיבים, ויטמינים ומינרלים – לעור, לעיכול ולאנרגיה.', steps: ['בארוחת הצהריים או הערב – למלא חצי צלחת בירקות.', 'אפשר סלט, ירקות מבושלים או מוקפצים.'], link: '#/guide/plate' },
  'nutr-protein': { area: 'nutrition', prio: 4, minutes: 3, icon: 'fish', title: 'מקור חלבון בכל ארוחה', why: 'חלבון חשוב לגדילה, לבניית שריר ולתחושת שובע.', steps: ['לבחור מקור חלבון לכל ארוחה: ביצים, קטניות, עוף, דגים, טופו, מוצרי חלב.'], link: '#/guide/protein' },
  'nutr-fruit': { area: 'nutrition', prio: 5, minutes: 2, icon: 'apple', title: 'פרי כנשנוש', why: 'פרי הוא נשנוש מתוק עם סיבים וויטמינים.', steps: ['להכין פרי אחד או שניים לתיק.'], link: '#/nutrition' },
  'nutr-prep': { area: 'nutrition', prio: 6, minutes: 10, icon: 'list', title: 'לתכנן את הארוחות של מחר', why: 'תכנון מראש מונע ארוחות חטופות ועוזר לאכול מגוון.', steps: ['לבחור ארוחת בוקר, צהריים וערב ממסך התזונה.', 'לבדוק מה צריך לקנות.'], link: '#/nutrition' },
  'style-outfit': { area: 'style', prio: 4, minutes: 5, icon: 'shirt', title: 'לבחור לוק למחר', why: 'בחירה מראש חוסכת לחץ בבוקר ועוזרת לגלות שילובים חדשים.', steps: ['לפתוח את הארון הדיגיטלי.', 'לבקש מהסטייליסט החכם הצעה או לבנות לבד.', 'לשמור את הלוק.'], link: '#/style' },
  'style-add': { area: 'style', prio: 3, minutes: 6, icon: 'camera', title: 'להוסיף פריטים לארון הדיגיטלי', why: 'ככל שיש יותר פריטים, הסטייליסט יכול להציע יותר שילובים.', steps: ['לצלם או להוסיף 3-5 פריטים (תמונה לא חובה).', 'לסמן קטגוריה, צבע ואירוע.'], link: '#/style' },
  'style-care': { area: 'style', prio: 6, minutes: 8, icon: 'shoe', title: 'לנקות נעליים ולסדר בגדים', why: 'נעליים נקיות ובגדים מסודרים משדרגים כל לוק.', steps: ['לנגב נעליים במטלית לחה.', 'לקפל או לתלות את הבגדים של השבוע.'], link: '#/guide/clothes-care' },
  'style-learn': { area: 'style', prio: 6, minutes: 4, icon: 'palette', title: 'ללמוד התאמת צבעים', why: 'הבנה של צבעים בסיסיים הופכת כל פריט לקל לשילוב.', steps: ['לקרוא את מדריך התאמת הצבעים.', 'לנסות שילוב אחד חדש מחר.'], link: '#/guide/colors' },
  'sleep-screens': { area: 'sleep', prio: 3, minutes: 1, icon: 'phoneOff', title: 'הפסקת מסכים לפני השינה', why: 'אור ותוכן מגרה מהמסך מקשים להירדם. 30-60 דקות בלי מסך לפני השינה עוזרות לשינה טובה יותר.', steps: ['להניח את הטלפון בצד 30-60 דקות לפני השינה.', 'לקרוא, להתמתח או להכין את התיק למחר במקום.'], link: '#/routine' },
  'sleep-log': { area: 'sleep', prio: 4, minutes: 1, icon: 'bed', title: 'לתעד את השינה של הלילה', why: 'תיעוד עוזר לראות דפוסים ולשפר בהדרגה.', steps: ['להיכנס למסך שינה ושגרה.', 'לרשום מתי נרדמת ומתי קמת ואיך הרגשת.'], link: '#/routine' },
  'sleep-same': { area: 'sleep', prio: 5, minutes: 1, icon: 'clock', title: 'ללכת לישון בשעה הקבועה', why: 'שעת שינה קבועה, גם בסופ״ש, מסדרת את השעון הביולוגי.', steps: ['לבדוק את שעת השינה בשגרה שלך.', 'להתחיל להתארגן לשינה 30 דקות לפני.'], link: '#/routine' },
  'hyg-shower': { area: 'hygiene', prio: 4, minutes: 10, icon: 'droplet', title: 'מקלחת ודאודורנט', why: 'מקלחת אחרי פעילות והקפדה על דאודורנט שומרות על רעננות לאורך היום.', steps: ['להתקלח אחרי אימון או יום חם.', 'לייבש היטב, במיוחד בכפות הרגליים.', 'דאודורנט על עור יבש ונקי.'], link: '#/guide/fresh' },
  'hyg-lips': { area: 'hygiene', prio: 6, minutes: 1, icon: 'lips', title: 'שפתון לחות', why: 'שפתיים יבשות וסדוקות נפוצות במיוחד בחורף וברוח.', steps: ['למרוח שפתון לחות (עדיף עם SPF ביום).', 'לא לקלף עור מהשפתיים.'], link: '#/guide/lips' },
  'hyg-nails': { area: 'hygiene', prio: 7, minutes: 6, icon: 'sparkles', title: 'גזירת ציפורניים', why: 'ציפורניים קצרות ונקיות הן פרט קטן שמורגש.', steps: ['לגזור ישר ולשייף פינות.', 'לנקות מתחת לציפורניים.'], link: '#/guide/fresh' },
  learn: { area: 'core', prio: 8, minutes: 3, icon: 'info', title: 'דקה של למידה', link: '#/learn' },
  reflect: { area: 'core', prio: 2, minutes: 4, icon: 'chart', title: 'סיכום שבועי', why: 'הסתכלות על השבוע עוזרת להבין מה עבד ומה כדאי לשנות.', steps: ['להיכנס למסך ההתקדמות ולראות את הסיכום השבועי.', 'לבחור הרגל אחד לשפר בשבוע הבא.', 'אפשר לשנות קצב או משימות במסך התוכנית.'], link: '#/progress' },
};

const LEARN_ROTATION = ['skin-types', 'spf', 'face-shape', 'protein', 'colors', 'sleep-basics', 'posture-basics', 'hair-care', 'acne', 'plate', 'confidence', 'fresh', 'jaw', 'oral', 'brows', 'products-check'];

function skinSteps(profile, when) {
  const st = profile.skinType;
  const cleanser = { oily: 'ג׳ל ניקוי עדין לעור שומני', dry: 'קרם/חלב ניקוי עדין ללא סבון', sensitive: 'ניקוי עדין מאוד ללא בישום', combination: 'ג׳ל ניקוי עדין', normal: 'ניקוי עדין', unknown: 'ניקוי עדין' }[st] || 'ניקוי עדין';
  const moist = { oily: 'קרם לחות קליל (ג׳ל), "לא קומדוגני"', dry: 'קרם לחות עשיר יותר', sensitive: 'קרם לחות פשוט ללא בישום', combination: 'קרם לחות קליל', normal: 'קרם לחות', unknown: 'קרם לחות קליל' }[st] || 'קרם לחות';
  if (when === 'am') return [
    `לשטוף פנים במים פושרים${st === 'dry' || st === 'sensitive' ? ' (בבוקר אפשר רק מים)' : ` או ${cleanser}`}.`,
    'לייבש בטפיחות עם מגבת נקייה.',
    `${moist} – כמות בגודל אפונה.`,
    'קרם הגנה SPF 30 ומעלה, גם ביום מעונן – הצעד הכי חשוב לעור בריא לאורך זמן.',
  ];
  return [
    `${cleanser} – 30-60 שניות בעיסוי עדין.`,
    'לייבש בטפיחות.',
    ...(profile.goals?.includes('skin') || st === 'oily' ? ['אם יש פצעונים: מוצר טיפולי עדין לפי מדריך הפצעונים (לא חובה, ולא יותר ממוצר אחד חדש בכל פעם).'] : []),
    `${moist}.`,
  ];
}

function hairSteps(profile) {
  const t = profile.hairType;
  if (t === 'curly' || t === 'coily') return ['להרטיב קלות או לרענן עם מים בתרסיס.', 'קרם תלתלים או ג׳ל עדין על שיער לח.', 'לא להבריש יבש – לסרק עם האצבעות.', 'לייבש באוויר או עם מפזר חום.'];
  if (t === 'thin') return ['ספריי נפח או פודרה בשורשים.', 'ייבוש עם פן כשהשיער הפוך לנפח.', 'מעט מאוד מוצר – מוצר כבד משטיח.'];
  return ['להתחיל משיער מעט לח או יבש.', 'כמות קטנה של מוצר (קליי / ווקס / קרם) בין כפות הידיים.', 'לפזר מהשורשים לקצוות ולעצב עם האצבעות.', 'לסיים בסירוק עדין לכיוון הרצוי.'];
}

function washEvery(profile) {
  return { straight: 2, thin: 2, wavy: 3, curly: 4, coily: 5 }[profile.hairType] || 3;
}

/** Weekly workout pattern by level & pace. null = rest day. */
function workoutPattern(level, pace) {
  if (level === 1) return pace === 'light' ? ['full1', 'mobility', null, 'full2', 'walk', null, null]
    : pace === 'intense' ? ['full1', 'mobility', 'full2', 'walk', 'full1', 'mobility', null]
      : ['full1', 'mobility', 'full2', null, 'full1', 'walk', null];
  if (level === 2) return pace === 'light' ? ['upper', 'mobility', 'lower', null, 'full2', null, null]
    : pace === 'intense' ? ['upper', 'lower', 'mobility', 'upper', 'lower', 'walk', null]
      : ['upper', 'lower', 'mobility', 'upper', 'lower', null, null];
  return pace === 'light' ? ['upperAdv', 'mobility', 'lowerAdv', null, 'upper', null, null]
    : pace === 'intense' ? ['upperAdv', 'lowerAdv', 'mobility', 'upperAdv', 'lowerAdv', 'walk', null]
      : ['upperAdv', 'lowerAdv', 'mobility', 'upper', 'lower', 'walk', null];
}

export function workoutFor(profile, program, dayIndex) {
  const level = levelNum(profile.fitnessLevel);
  // gentle start: first week of a long program uses the easier pattern for intermediate+
  const effLevel = dayIndex < 7 && level === 3 && program.length > 7 ? 2 : level;
  const pat = workoutPattern(effLevel, program.pace);
  const id = pat[dayIndex % 7];
  return id ? WORKOUTS[id] : null;
}

export function dayIndexOf(program, key = todayKey()) {
  return Math.max(0, daysBetween(program.startDate, key));
}

/** Build the task list for a date. Deterministic for a given profile/program/date. */
export function tasksFor(key = todayKey()) {
  const s = getState();
  const { profile, program } = s;
  if (!profile || !program) return [];
  const idx = dayIndexOf(program, key);
  const areas = new Set(profile.areas || []);
  const phase = phaseOf(program, idx).n;
  const pace = PACES.find((p) => p.id === program.pace) || PACES[1];
  const budget = Math.round((profile.minutes || 20) * pace.factor);
  const dow = idx % 7;
  const out = [];
  const push = (id, extra = {}) => { const base = T[id]; if (base) out.push({ id, ...base, ...extra }); };

  push('water');
  push('teeth');
  if (areas.has('skin')) {
    push('skin-am', { why: 'ניקוי עדין, לחות והגנה מהשמש הם הבסיס שכל רופא עור ממליץ עליו.', steps: skinSteps(profile, 'am') });
    push('skin-pm', { why: 'בערב מנקים את הלכלוך, הזיעה וקרם ההגנה מהיום ונותנים לעור להתאושש.', steps: skinSteps(profile, 'pm') });
    if (dow === 3) push('pillow');
  }
  if (areas.has('hair')) {
    push('hair-style', { why: 'כמה דקות של סידור נכון עושות הבדל גדול במראה.', steps: hairSteps(profile) });
    if (idx % washEvery(profile) === 0) push('hair-wash', { why: 'חפיפה בתדירות שמתאימה לסוג השיער שלך שומרת על קרקפת בריאה בלי לייבש.', steps: ['להרטיב היטב במים פושרים.', 'שמפו רק על הקרקפת – לעסות עם קצות האצבעות (לא ציפורניים).', 'לשטוף ולמרוח מרכך על האורכים והקצוות בלבד.', 'לשטוף ולייבש בעדינות עם מגבת – בלי לשפשף חזק.'] });
    if ((program.length >= 30 && (idx === 9 || idx % 35 === 9)) || (program.length === 7 && idx === 4)) push('hair-cut');
  }
  if (areas.has('fitness')) {
    const w = workoutFor(profile, program, idx);
    if (w) {
      const minutes = Math.min(w.minutes, Math.max(12, Math.round(budget * 0.6)));
      push('workout', { title: w.name, minutes, workoutId: w.id, why: `מיקוד: ${w.focus}. אימון מותאם לרמה שלך עם חימום ושחרור.`, steps: ['חימום קצר (3-5 דקות).', 'לבצע את התרגילים לפי הסדר, עם מנוחה של 60-90 שניות בין סטים.', 'לשמור על טכניקה – עדיף פחות חזרות ונכון.', 'שחרור ומתיחות בסוף.'], link: `#/workout/${w.id}` });
    } else {
      out.push({ id: 'rest', area: 'fitness', prio: 9, minutes: 0, icon: 'heart', title: 'יום מנוחה והתאוששות', why: 'השרירים מתחזקים בזמן המנוחה. מנוחה היא חלק מהתוכנית – לא דילוג עליה.', steps: ['תנועה קלה בלבד (הליכה רגועה) אם בא לך.', 'לישון טוב ולשתות מים.', 'אם כואב משהו חד – לא להתאמן עליו ולהתייעץ.'], link: '#/fitness?tab=recovery' });
    }
  }
  if (areas.has('posture') && !(areas.has('fitness') && dow % 2 === 1 && phase === 1)) push('posture');
  if (areas.has('nutrition')) {
    const rot = ['nutr-breakfast', 'nutr-veg', 'nutr-protein', 'nutr-fruit', 'nutr-veg', 'nutr-prep', 'nutr-protein'];
    push(rot[dow]);
    if (phase >= 2 && dow % 3 === 0) push('nutr-prep');
  }
  if (areas.has('style')) {
    if (idx < 3) push('style-add');
    else if (idx % 2 === 0) push('style-outfit');
    if (dow === 5) push('style-care');
    if (idx === 4 || idx === 18) push('style-learn');
  }
  if (areas.has('sleep')) {
    push('sleep-screens');
    push('sleep-log');
    if (phase >= 2) push('sleep-same');
  }
  if (areas.has('hygiene')) {
    if (areas.has('fitness') ? !!out.find((t) => t.id === 'workout') : dow % 2 === 0) push('hyg-shower');
    push('hyg-lips');
    if (dow === 6) push('hyg-nails');
  }
  // learning card
  const art = LEARN_ROTATION[idx % LEARN_ROTATION.length];
  push('learn', { articleId: art, why: 'כל יום לומדים משהו קטן – ככה הגלואו אפ נבנה מבפנים.', steps: ['לקרוא את המדריך הקצר של היום.'], link: `#/guide/${art}` });
  if (dow === 6) push('reflect');

  // user custom tasks
  (program.extraTasks || []).forEach((t) => out.push({ id: t.id, area: 'custom', prio: 1, minutes: t.minutes || 5, icon: 'star', title: t.title, why: 'משימה אישית שהוספת.', steps: t.note ? [t.note] : [], custom: true }));

  // remove hidden
  let list = out.filter((t) => !(program.hiddenTasks || []).includes(t.id.replace(/^.*:/, '')) || t.custom);

  // trim to budget (core & custom always stay)
  const total = () => list.reduce((a, t) => a + (t.minutes || 0), 0);
  const sorted = [...list].sort((a, b) => b.prio - a.prio);
  for (const t of sorted) {
    if (total() <= budget * 1.15) break;
    if (t.area === 'core' && t.prio <= 2) continue;
    if (t.custom) continue;
    if (t.id === 'workout' && budget >= 15) continue;
    list = list.filter((x) => x !== t);
  }
  return list;
}

export function taskLibrary() {
  return Object.entries(T).map(([id, t]) => ({ id, ...t }));
}

export function completion(key = todayKey()) {
  const tasks = tasksFor(key).filter((t) => t.id !== 'rest');
  const d = getState().days[key];
  const done = tasks.filter((t) => d?.done?.[t.id]).length;
  return { done, total: tasks.length, pct: tasks.length ? done / tasks.length : 0 };
}

export function streak() {
  const s = getState();
  let key = todayKey();
  const active = (k) => Object.values(s.days[k]?.done || {}).some(Boolean);
  let n = 0;
  if (!active(key)) key = addDays(key, -1);
  while (active(key)) { n++; key = addDays(key, -1); }
  return n;
}

export function bestStreak() {
  const s = getState();
  const keys = Object.keys(s.days).filter((k) => Object.values(s.days[k].done || {}).some(Boolean)).sort();
  let best = 0, cur = 0, prev = null;
  for (const k of keys) {
    cur = prev && daysBetween(prev, k) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur); prev = k;
  }
  return best;
}

export function weekSummary(weekStartKey) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(weekStartKey, i);
    days.push({ key: k, ...completion(k) });
  }
  const done = days.reduce((a, d) => a + d.done, 0);
  const total = days.reduce((a, d) => a + d.total, 0);
  const activeDays = days.filter((d) => d.done > 0).length;
  return { days, done, total, pct: total ? done / total : 0, activeDays };
}

/** Sets a task done/undone and logs related history (skin / workout). */
export function setTaskDone(task, value, key = todayKey()) {
  const d = day(key);
  d.done[task.id] = value;
  if (task.id === 'skin-am' || task.id === 'skin-pm') {
    // the care screen treats done[skin-xx] as "all steps checked"
    const slot = task.id === 'skin-am' ? 'am' : 'pm';
    if (!value) d.skin[slot] = [];
  }
  if (task.id === 'workout' && task.workoutId) {
    d.workouts = d.workouts.filter((w) => w.source !== 'plan');
    if (value) d.workouts.push({ id: task.workoutId, name: task.title, minutes: task.minutes, source: 'plan', at: Date.now() });
  }
  if (!value) delete d.done[task.id];
}

export function totalDone() {
  const s = getState();
  return Object.values(s.days).reduce((a, d) => a + Object.values(d.done || {}).filter(Boolean).length, 0);
}
