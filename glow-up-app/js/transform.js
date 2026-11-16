// Transformation engine: personal targets, adaptive weekly review, timeline,
// progressive-overload training and an auto-built meal plan.
// Adults get real calorie targets (moderate, with safety floors). Under 18 there is
// no deficit – the plan builds muscle & appearance while the body is still growing.
import { getState, todayKey, addDays, daysBetween } from './store.js';
import { FOOD, DAY_TEMPLATES } from './data/foods.js';
import { EX } from './data/fitness.js';

export const GOALS = [
  { id: 'cut', label: 'חיטוב והורדת שומן', icon: 'flame', desc: 'להוריד אחוזי שומן, לחשוף שרירים ולהגדיר את הפנים והלסת', adult: true },
  { id: 'bulk', label: 'בניית שריר ומסה', icon: 'dumbbell', desc: 'לבנות גוף גדול וחזק יותר – כתפיים, חזה, גב, ידיים ורגליים' },
  { id: 'recomp', label: 'ריקומפוזיציה', icon: 'refresh', desc: 'לבנות שריר ולהוריד שומן במקביל, בלי לשנות הרבה במשקל' },
  { id: 'face', label: 'שדרוג פנים ומראה', icon: 'face', desc: 'פנים מוגדרות ורעננות יותר, עור, שיער, זקן, יציבה וחיוך' },
];
export const ACTIVITY = [
  { id: 'low', label: 'יושבני', desc: 'רוב היום בישיבה, מעט הליכה', f: 1.35 },
  { id: 'light', label: 'פעיל קצת', desc: 'הליכה יומית / עבודה בעמידה', f: 1.5 },
  { id: 'active', label: 'פעיל', desc: 'הרבה תנועה ביום או עבודה פיזית', f: 1.65 },
  { id: 'very', label: 'פעיל מאוד', desc: 'ספורט תחרותי או עבודה פיזית קשה', f: 1.8 },
];
export const EQUIPMENT = [
  { id: 'gym', label: 'חדר כושר', desc: 'מוטות, מכונות ומשקולות' },
  { id: 'home', label: 'בבית עם משקולות', desc: 'משקולות יד + ספסל/כיסא' },
  { id: 'bodyweight', label: 'בלי ציוד', desc: 'משקל גוף בלבד (ומוט מתח אם יש)' },
];

export const tf = () => getState().transform;
export const isAdult = () => (getState().profile?.age || 0) >= 18;

export function bmi(w = currentWeight(), h = tf()?.heightCm) {
  if (!w || !h) return null;
  return Math.round((w / ((h / 100) ** 2)) * 10) / 10;
}

export function bmr(w, h, age, sex) {
  const s = sex === 'm' ? 5 : sex === 'f' ? -161 : -78;
  return 10 * w + 6.25 * h - 5 * age + s;
}

export function weights() {
  return [...(tf()?.weights || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
}
export function currentWeight() {
  const w = weights();
  if (!w.length) return tf()?.startWeight || null;
  const last7 = w.filter((x) => daysBetween(x.date, todayKey()) < 7);
  const src = last7.length ? last7 : [w[w.length - 1]];
  return Math.round((src.reduce((a, x) => a + x.kg, 0) / src.length) * 10) / 10;
}
/** Average of weigh-ins in [fromDaysAgo, toDaysAgo). */
function avgBetween(fromAgo, toAgo) {
  const key = todayKey();
  const list = weights().filter((x) => { const d = daysBetween(x.date, key); return d >= toAgo && d < fromAgo; });
  if (list.length < 3) return null;
  return list.reduce((a, x) => a + x.kg, 0) / list.length;
}

/** Calculate the daily targets from the profile + transformation settings. */
export function computeTargets(t = tf(), p = getState().profile) {
  const w = currentWeight() || t.startWeight;
  const out = { kcal: null, protein: null, fat: null, carbs: null, steps: 8000, mode: 'maintain', notes: [] };
  if (!w || !t.heightCm) return out;
  const adult = p.age >= 18;
  const b = bmr(w, t.heightCm, p.age, t.sex);
  const act = (ACTIVITY.find((a) => a.id === t.activity) || ACTIVITY[1]).f;
  const tdee = Math.round(b * act);
  out.tdee = tdee;
  const bm = bmi(w, t.heightCm);
  // protein reference weight: use a healthy-BMI weight cap for very high BMI
  const refW = bm > 30 ? 25 * (t.heightCm / 100) ** 2 : w;

  if (!adult) {
    out.mode = 'teen';
    out.protein = Math.round(refW * 1.4);
    out.steps = 9000;
    out.notes.push('בגילך הגוף עוד גדל, ולכן אין יעד קלוריות ואין גירעון. אוכלים לפי רעב – 3 ארוחות ו-1-2 נשנושים – עם חלבון בכל ארוחה. השינוי מגיע מאימון כוח עקבי, שינה וזמן.');
    if (t.goal === 'cut') out.notes.push('אם יש דאגה לגבי משקל – השיחה הכי נכונה היא עם רופא/ת משפחה. בינתיים: אימונים, צעדים, פחות משקאות ממותקים וחטיפים – בלי לספור קלוריות.');
    return out;
  }

  let kcal = tdee;
  let goal = t.goal;
  if (goal === 'face') goal = bm != null && bm > 23 ? 'cut' : 'recomp';
  if (goal === 'cut') {
    if (bm != null && bm < 18.5) { goal = 'recomp'; out.notes.push('המשקל שלך כבר בטווח נמוך, ולכן לא נוריד קלוריות. נתמקד בבניית שריר – זה מה שייתן את המראה המוגדר.'); }
    else if (bm != null && bm < 20.5) { kcal = tdee * 0.9; out.notes.push('גירעון קטן בלבד, כי המשקל שלך כבר נמוך-תקין.'); }
    else kcal = tdee * (bm > 30 ? 0.75 : 0.8);
    out.mode = 'deficit';
    out.steps = 10000;
  }
  if (goal === 'bulk') { kcal = tdee + (p.age < 25 ? 300 : 250); out.mode = 'surplus'; out.steps = 7000; }
  if (goal === 'recomp') { kcal = tdee * 0.95; out.mode = 'maintain'; out.steps = 8500; }
  kcal += t.kcalAdjust || 0;
  const floor = t.sex === 'm' ? 1500 : t.sex === 'f' ? 1200 : 1350;
  if (kcal < floor) { kcal = floor; out.notes.push('הגענו לרצפת הקלוריות הבטוחה – לא יורדים מתחתיה. ההתקדמות תבוא מצעדים ואימונים.'); }
  out.kcal = Math.round(kcal / 10) * 10;
  out.protein = Math.round(refW * (goal === 'bulk' ? 1.8 : 2.0));
  out.fat = Math.round(Math.max(w * 0.7, (out.kcal * 0.25) / 9));
  out.carbs = Math.max(50, Math.round((out.kcal - out.protein * 4 - out.fat * 9) / 4));
  out.effectiveGoal = goal;
  return out;
}

/** Expected weekly change (fraction of bodyweight) for the timeline. */
function weeklyRate(mode) {
  return mode === 'deficit' ? -0.006 : mode === 'surplus' ? 0.003 : 0;
}

export function projection() {
  const t = tf();
  const tg = computeTargets();
  const w = currentWeight();
  if (!t || !w || !t.goalWeight || tg.mode === 'teen') return null;
  const rate = weeklyRate(tg.mode);
  if (!rate) return null;
  const diff = t.goalWeight - w;
  if (Math.sign(diff) !== Math.sign(rate) || Math.abs(diff) < 0.3) return { reached: true };
  const weeks = Math.ceil(Math.abs(diff) / Math.abs(w * rate));
  return { weeks, date: addDays(todayKey(), weeks * 7), perWeek: Math.round(Math.abs(w * rate) * 100) / 100 };
}

/** Adaptive check: compares last 7 days to the 7 before. Returns a suggestion or null. */
export function weeklyReview() {
  const t = tf();
  if (!t || !isAdult()) return null;
  const last = t.adjustments?.[t.adjustments.length - 1];
  if (last && daysBetween(last.date, todayKey()) < 7) return null;
  const now = avgBetween(7, 0), prev = avgBetween(14, 7);
  if (now == null || prev == null) return null;
  const pct = (now - prev) / prev;
  const tg = computeTargets();
  const res = { pct: Math.round(pct * 1000) / 10, now: Math.round(now * 10) / 10, prev: Math.round(prev * 10) / 10 };
  if (tg.mode === 'deficit') {
    if (pct > -0.0025) return { ...res, delta: -150, reason: `ירידה של ${Math.abs(res.pct)}% בלבד בשבוע האחרון – מורידים 150 קלוריות כדי להמשיך להתקדם.` };
    if (pct < -0.012) return { ...res, delta: 150, reason: `ירידה מהירה מדי (${Math.abs(res.pct)}%) – מוסיפים 150 קלוריות כדי לשמור על השריר והאנרגיה.` };
  }
  if (tg.mode === 'surplus') {
    if (pct < 0.001) return { ...res, delta: 150, reason: 'המשקל לא עלה השבוע – מוסיפים 150 קלוריות כדי לבנות שריר.' };
    if (pct > 0.006) return { ...res, delta: -150, reason: 'המשקל עולה מהר מדי (יותר שומן משריר) – מורידים 150 קלוריות.' };
  }
  if (tg.mode === 'maintain' && pct > 0.005) return { ...res, delta: -100, reason: 'המשקל עולה – מורידים מעט כדי לשמור על ריקומפוזיציה.' };
  return { ...res, delta: 0, reason: 'הקצב בדיוק בטווח. ממשיכים באותם יעדים.' };
}

// ---------------- training: progressive overload ----------------
const S = (ex, sets, min, max, inc) => ({ ex, sets, min, max, inc });
const PROGRAMS = {
  gym: {
    3: [
      { name: 'כל הגוף A', items: [S('back-squat', 3, 5, 8, 5), S('bench-press', 3, 5, 8, 2.5), S('cable-row', 3, 8, 12, 2.5), S('lateral-raise', 3, 12, 15, 1), S('plank', 3, 30, 60, 0)] },
      { name: 'כל הגוף B', items: [S('deadlift', 3, 6, 10, 5), S('ohp', 3, 5, 8, 2.5), S('lat-pulldown', 3, 8, 12, 2.5), S('leg-press', 3, 10, 12, 5), S('curl', 2, 10, 12, 1), S('pushdown', 2, 10, 15, 2.5)] },
    ],
    4: [
      { name: 'עליון A', items: [S('bench-press', 4, 5, 8, 2.5), S('cable-row', 3, 8, 12, 2.5), S('ohp', 3, 6, 10, 2.5), S('lat-pulldown', 3, 8, 12, 2.5), S('lateral-raise', 3, 12, 15, 1), S('curl', 2, 10, 12, 1)] },
      { name: 'תחתון A', items: [S('back-squat', 4, 5, 8, 5), S('deadlift', 3, 8, 10, 5), S('leg-press', 3, 10, 12, 5), S('calf-raise', 3, 12, 15, 0), S('plank', 3, 30, 60, 0)] },
      { name: 'עליון B', items: [S('ohp', 4, 5, 8, 2.5), S('lat-pulldown', 3, 8, 12, 2.5), S('floor-press', 3, 8, 12, 2), S('db-row', 3, 8, 12, 2), S('lateral-raise', 3, 12, 15, 1), S('pushdown', 3, 10, 15, 2.5)] },
      { name: 'תחתון B', items: [S('deadlift', 4, 6, 8, 5), S('goblet-squat', 3, 8, 12, 2), S('reverse-lunge', 3, 8, 12, 0), S('glute-bridge', 3, 10, 15, 0), S('leg-raise', 3, 10, 15, 0)] },
    ],
  },
  home: {
    3: [
      { name: 'כל הגוף A', items: [S('goblet-squat', 3, 8, 12, 2), S('floor-press', 3, 8, 12, 2), S('db-row', 3, 8, 12, 2), S('lateral-raise', 3, 12, 15, 1), S('plank', 3, 30, 60, 0)] },
      { name: 'כל הגוף B', items: [S('rdl', 3, 8, 12, 2), S('db-press', 3, 8, 12, 2), S('pushup', 3, 6, 15, 0), S('reverse-lunge', 3, 8, 12, 0), S('curl', 2, 10, 12, 1), S('oh-ext', 2, 10, 12, 1)] },
    ],
    4: [
      { name: 'עליון A', items: [S('floor-press', 4, 8, 12, 2), S('db-row', 4, 8, 12, 2), S('db-press', 3, 8, 12, 2), S('lateral-raise', 3, 12, 15, 1), S('curl', 2, 10, 12, 1)] },
      { name: 'תחתון A', items: [S('goblet-squat', 4, 8, 12, 2), S('rdl', 3, 8, 12, 2), S('reverse-lunge', 3, 8, 12, 0), S('calf-raise', 3, 12, 20, 0), S('dead-bug', 3, 8, 12, 0)] },
      { name: 'עליון B', items: [S('pushup', 4, 6, 15, 0), S('db-row', 3, 10, 12, 2), S('db-press', 3, 8, 12, 2), S('hammer-curl', 2, 10, 12, 1), S('oh-ext', 3, 10, 12, 1)] },
      { name: 'תחתון B', items: [S('rdl', 4, 8, 12, 2), S('step-up', 3, 8, 12, 0), S('glute-bridge', 3, 12, 15, 0), S('side-plank', 3, 20, 45, 0)] },
    ],
  },
  bodyweight: {
    3: [
      { name: 'כל הגוף A', items: [S('pushup', 3, 6, 15, 0), S('inverted-row', 3, 6, 12, 0), S('squat', 3, 12, 20, 0), S('glute-bridge', 3, 12, 20, 0), S('plank', 3, 30, 60, 0)] },
      { name: 'כל הגוף B', items: [S('pike-pushup', 3, 5, 12, 0), S('pullup', 3, 3, 8, 0), S('reverse-lunge', 3, 8, 15, 0), S('bench-dip', 3, 8, 15, 0), S('dead-bug', 3, 8, 12, 0)] },
    ],
    4: [
      { name: 'עליון A', items: [S('pushup', 4, 6, 15, 0), S('inverted-row', 4, 6, 12, 0), S('pike-pushup', 3, 5, 12, 0), S('bench-dip', 3, 8, 15, 0)] },
      { name: 'תחתון A', items: [S('squat', 4, 12, 20, 0), S('reverse-lunge', 3, 8, 15, 0), S('glute-bridge', 3, 12, 20, 0), S('plank', 3, 30, 60, 0)] },
      { name: 'עליון B', items: [S('pullup', 4, 3, 8, 0), S('diamond-pushup', 3, 6, 12, 0), S('pike-pushup', 3, 5, 12, 0), S('superman', 3, 10, 15, 0)] },
      { name: 'תחתון B', items: [S('split-squat', 3, 8, 12, 0), S('step-up', 3, 10, 15, 0), S('calf-raise', 3, 15, 25, 0), S('hollow', 3, 20, 40, 0)] },
    ],
  },
};
// harder / easier variations for bodyweight progression
const HARDER = { 'knee-pushup': 'pushup', pushup: 'diamond-pushup', 'incline-pushup': 'pushup', squat: 'split-squat', 'reverse-lunge': 'split-squat', 'glute-bridge': 'glute-bridge', 'inverted-row': 'pullup', 'bench-dip': 'dips' };
const EASIER = { pushup: 'knee-pushup', 'diamond-pushup': 'pushup', pullup: 'inverted-row', 'inverted-row': 'db-row', 'pike-pushup': 'db-press', 'split-squat': 'reverse-lunge', hollow: 'dead-bug', dips: 'bench-dip', 'side-plank': 'plank', 'leg-raise': 'dead-bug' };
const TIMED = new Set(['plank', 'side-plank', 'hollow', 'wall-sit']);

export function program(t = tf()) {
  const eq = PROGRAMS[t?.equipment] || PROGRAMS.home;
  const days = t?.daysPerWeek >= 4 ? 4 : 3;
  const sessions = eq[days];
  // beginners & teens: keep it simple – the 3-day full body
  return sessions;
}

/** Training-day pattern for the week (0 = program start weekday). */
export function isTrainingDay(key = todayKey()) {
  const t = tf();
  if (!t) return false;
  const idx = ((daysBetween(t.startDate, key) % 7) + 7) % 7;
  const pat = { 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5] }[t.daysPerWeek] || [0, 2, 4];
  return pat.includes(idx);
}

export function nextSession() {
  const t = tf();
  const sessions = program(t);
  const i = (t.sessionCount || 0) % sessions.length;
  return { index: i, ...sessions[i] };
}

export function lastLog(exId) {
  const list = tf()?.lifts?.[exId];
  return list?.length ? list[list.length - 1] : null;
}

/**
 * Double progression: work within [min,max] reps. When every set hits max reps,
 * increase the weight (or move to a harder variation for bodyweight moves).
 */
export function targetFor(slot) {
  const level = getState().profile?.fitnessLevel;
  let exId = slot.ex;
  // swap advanced moves for beginners on first exposure
  if ((level === 'none' || level === 'beginner') && EX[exId]?.level === 3 && !tf()?.lifts?.[exId]) exId = EASIER[exId] || exId;
  const swapped = tf()?.swaps?.[slot.ex];
  if (swapped) exId = swapped;
  const ex = EX[exId];
  const last = lastLog(exId);
  const timed = TIMED.has(exId);
  const unit = timed ? 'שנ׳' : 'חזרות';
  if (!last) {
    return { exId, ex, weight: slot.inc ? null : 0, reps: slot.min, sets: slot.sets, unit, timed, note: slot.inc ? 'אימון ראשון: בחרו משקל שאפשר לעשות איתו ' + slot.min + '-' + slot.max + ' ' + unit + ' בטכניקה מושלמת, עם 2 חזרות "ברזרבה".' : 'אימון ראשון: כמה שאפשר בטכניקה טובה, עד ' + slot.max + ' ' + unit + '.' };
  }
  const allMax = last.sets.length >= slot.sets && last.sets.every((s) => s.r >= slot.max);
  const lastW = Math.max(...last.sets.map((s) => s.w || 0));
  const minReps = Math.min(...last.sets.map((s) => s.r));
  if (allMax) {
    if (slot.inc) return { exId, ex, weight: Math.round((lastW + slot.inc) * 10) / 10, reps: slot.min, sets: slot.sets, unit, timed, up: true, note: `🔥 עמדת ביעד בכל הסטים – מעלים ל-${Math.round((lastW + slot.inc) * 10) / 10} ק״ג!` };
    const harder = HARDER[exId];
    if (harder && harder !== exId && EX[harder]) return { exId, ex, weight: 0, reps: slot.max, sets: slot.sets, unit, timed, up: true, suggestHarder: harder, note: `🔥 שלטת בתרגיל! אפשר להמשיך להוסיף ${unit} או לעבור ל"${EX[harder].name}".` };
    return { exId, ex, weight: 0, reps: slot.max + (timed ? 10 : 2), sets: slot.sets, unit, timed, up: true, note: 'מעולה – מעלים את היעד.' };
  }
  const stalled = stallCount(exId, slot) >= 3;
  if (stalled && slot.inc && lastW > 0) return { exId, ex, weight: Math.round(lastW * 0.9 / slot.inc) * slot.inc, reps: slot.min + 1, sets: slot.sets, unit, timed, note: 'תקיעות של 3 אימונים – שבוע הקלה: מורידים 10% במשקל ובונים חזרה. זה חלק נורמלי מההתקדמות.' };
  return { exId, ex, weight: lastW || (slot.inc ? null : 0), reps: Math.min(slot.max, minReps + 1), sets: slot.sets, unit, timed, note: `היעד: להוסיף חזרה אחת לפחות בסט אחד (בפעם הקודמת: ${last.sets.map((s) => s.r).join('/')}).` };
}

function stallCount(exId, slot) {
  const list = tf()?.lifts?.[exId] || [];
  let n = 0;
  for (let i = list.length - 1; i > 0; i--) {
    const a = list[i], b = list[i - 1];
    const vol = (x) => x.sets.reduce((s, y) => s + (y.w || 1) * y.r, 0);
    if (vol(a) <= vol(b)) n++; else break;
  }
  return n;
}

export const easierOf = (id) => EASIER[id];

// ---------------- food ----------------
export function foodTotals(key = todayKey()) {
  const log = getState().days[key]?.food || [];
  return log.reduce((a, x) => ({ kcal: a.kcal + (x.kcal || 0), p: a.p + (x.p || 0), c: a.c + (x.c || 0), f: a.f + (x.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
}

export function foodEntry(foodId, qty) {
  const f = FOOD[foodId];
  return { id: Math.random().toString(36).slice(2, 9), foodId, name: f.name, qty, unit: f.unit, kcal: Math.round(f.kcal * qty), p: Math.round(f.p * qty * 10) / 10, c: Math.round(f.c * qty * 10) / 10, f: Math.round(f.f * qty * 10) / 10 };
}

const roundQty = (q, unit) => {
  if (/יחידה|פרוסה|קופסה|גביע|סקופ|כף|כפות|חצי|מנה|פחית|שקית|משולש|כוס|פרוסות/.test(unit)) return Math.max(0.5, Math.round(q * 2) / 2);
  return Math.max(0.25, Math.round(q * 4) / 4);
};

/** Builds an example day that hits the calorie & protein targets by scaling portions. */
export function exampleDay(templateIndex, targets) {
  const tpl = DAY_TEMPLATES[templateIndex % DAY_TEMPLATES.length];
  const meals = tpl.meals.map((m) => ({ name: m.name, items: m.items.map(([id, q]) => ({ id, q })) }));
  const all = meals.flatMap((m) => m.items);
  const sum = (key) => all.reduce((a, it) => a + FOOD[it.id][key] * it.q, 0);
  if (targets.protein) {
    const pNow = sum('p');
    const k = Math.max(0.6, Math.min(2.2, targets.protein / pNow));
    all.filter((it) => FOOD[it.id].role === 'p').forEach((it) => { it.q *= k; });
  }
  if (targets.kcal) {
    const fixed = all.filter((it) => FOOD[it.id].role !== 'c' && FOOD[it.id].role !== 'f').reduce((a, it) => a + FOOD[it.id].kcal * it.q, 0);
    const flex = all.filter((it) => ['c', 'f'].includes(FOOD[it.id].role)).reduce((a, it) => a + FOOD[it.id].kcal * it.q, 0);
    const k = Math.max(0.4, Math.min(2.8, (targets.kcal - fixed) / Math.max(1, flex)));
    all.filter((it) => ['c', 'f'].includes(FOOD[it.id].role)).forEach((it) => { it.q *= k; });
  }
  all.forEach((it) => { it.q = roundQty(it.q, FOOD[it.id].unit); });
  const tot = { kcal: Math.round(sum('kcal')), p: Math.round(sum('p')), c: Math.round(sum('c')), f: Math.round(sum('f')) };
  return { name: tpl.name, meals, totals: tot };
}

// ---------------- face protocol ----------------
export function faceProtocol(p = getState().profile, t = tf()) {
  const adult = p.age >= 18;
  const tg = t ? computeTargets(t, p) : null;
  const items = [
    { id: 'fat', icon: 'flame', title: 'אחוז שומן – הגורם מס׳ 1 להגדרת הפנים', impact: 'גבוה',
      why: adult ? 'קו לסת, עצמות לחיים וצוואר מוגדר נחשפים כשאחוז השומן בגוף יורד. אין "הרזיה מקומית" לפנים – זה קורה עם כל הגוף.' : 'בגיל ההתבגרות הפנים עוד מתפתחות ומתחדדות באופן טבעי עם הגדילה. אימון כוח, צעדים ושינה תומכים בזה – בלי דיאטה.',
      steps: adult && tg?.mode === 'deficit' ? [`להישאר ביעד של ${tg.kcal} קלוריות ו-${tg.protein} גרם חלבון.`, `${tg.steps.toLocaleString('he-IL')} צעדים ביום.`, '3-4 אימוני כוח בשבוע לפי התוכנית.', 'הפנים מתחילות להשתנות בדרך כלל אחרי 4-8 שבועות עקביים.'] : adult ? ['שומרים על היעדים שבמסלול.', 'אימוני כוח ושינה – גוף חזק משנה גם את מבנה הצוואר והכתפיים במראה.'] : ['אימוני כוח 3 פעמים בשבוע.', '9,000 צעדים ביום.', 'שינה של 8-10 שעות.', 'פחות משקאות ממותקים וחטיפים – בלי לספור קלוריות.'] },
    { id: 'bloat', icon: 'droplet', title: 'פחות נפיחות בפנים', impact: 'גבוה', freq: 'יומי',
      why: 'אגירת נוזלים "מעגלת" את הפנים מיום ליום. זה החלק הכי מהיר לשינוי – רואים הבדל תוך ימים.',
      steps: ['2.5-3 ליטר מים ביום (יותר בחום/אימון).', 'מלח במידה ובאופן קבוע – פחות אוכל מעובד, חטיפים מלוחים ונקניקים.', '7-9 שעות שינה (מתבגרים 8-10).', 'לא לאכול ארוחה כבדה ומלוחה ממש לפני השינה.', adult ? 'אלכוהול גורם לנפיחות משמעותית – כמה שפחות.' : 'בלי משקאות אנרגיה.', 'בבוקר: שטיפת פנים במים קרים.'] },
    { id: 'skin', icon: 'sparkles', title: 'עור נקי ואחיד', impact: 'גבוה', freq: 'בוקר + ערב',
      why: 'עור בריא ואחיד משנה את כל המראה של הפנים יותר מכמעט כל דבר אחר.',
      steps: ['בוקר: ניקוי עדין → לחות → קרם הגנה SPF 30+ (כל יום!).', adult ? 'ערב: ניקוי → רטינואיד (רטינול או אדפלן) 2-3 פעמים בשבוע בהתחלה → לחות. משפר מרקם, פצעונים וכתמים לאורך זמן.' : 'ערב: ניקוי → לחות. אם יש פצעונים – מוצר טיפולי עדין לפי מדריך הפצעונים.', 'לא לפוצץ פצעונים.', 'פצעונים עמוקים או צלקות – רופא/ת עור (יש טיפולים יעילים).'] },
    { id: 'hair', icon: 'scissors', title: 'תספורת שמתאימה לפנים', impact: 'גבוה', freq: 'כל 3-5 שבועות',
      why: 'התספורת הנכונה יכולה להאריך פנים עגולות, לחדד לסת או לאזן מצח – שינוי מיידי.',
      steps: ['לבחור צורת פנים בספריית התספורות ולשמור 2-3 אפשרויות.', 'צדדים קצרים (פייד) + נפח למעלה מחדדים ומאריכים את הפנים.', 'תספורת קבועה כל 3-5 שבועות – תספורת "מוזנחת" מעגלת את הפנים.'], link: '#/hair?tab=library&len=forme' },
    { id: 'beard', icon: 'brush', title: 'זקן וקווי פנים (למי שרלוונטי)', impact: 'גבוה', freq: 'פעמיים בשבוע',
      why: 'זקן מעוצב יכול "לצייר" קו לסת חד יותר ממה שהוא.',
      steps: ['קו צוואר: 1-2 אצבעות מעל תפוח האדם – לגלח את מה שמתחת.', 'קו לחיים: נקי ומעט מעוגל, לא גבוה מדי.', 'פנים עגולות: יותר אורך בסנטר, צדדים קצרים.', 'פנים ארוכות: צדדים מלאים יותר, סנטר קצר.', 'זקן לא מלא? זיפים קצרים ומסודרים (3-5 מ״מ) נראים הכי טוב.'] },
    { id: 'brows', icon: 'eyebrow', title: 'גבות מסודרות', impact: 'בינוני', freq: 'פעם בשבוע',
      why: 'גבות נקיות ממסגרות את העיניים ומחדדות את המבט.',
      steps: ['לנקות שערות בין הגבות ומתחת לקו בלבד.', 'לא לשנות את הצורה הטבעית.', 'מברשת גבות קטנה כלפי מעלה.'], link: '#/guide/brows' },
    { id: 'posture', icon: 'posture', title: 'יציבה – צוואר ולסת נראים מיד חדים יותר', impact: 'גבוה', freq: 'יומי',
      why: 'ראש שנוטה קדימה (מטלפון ומחשב) מעלים את קו הלסת ומקצר את הצוואר במראה. תיקון יציבה = הבדל שרואים בתמונות מיד.',
      steps: ['הכנסת סנטר: 3×10 ביום.', 'מלאך על הקיר + פתיחת גומייה – 5 דקות.', 'טלפון בגובה העיניים, מסך מחשב בגובה העיניים.', 'אימוני גב (חתירות, מתח) – כתפיים פתוחות.'], link: '#/workout/posture' },
    { id: 'teeth', icon: 'tooth', title: 'חיוך', impact: 'בינוני', freq: 'יומי',
      why: 'חיוך נקי ובהיר משנה את כל הפנים.',
      steps: ['צחצוח פעמיים ביום + חוט דנטלי.', 'פחות קפה/תה/קולה, או לשטוף פה במים אחריהם.', 'הלבנה – דרך רופא/ת שיניים בלבד' + (adult ? '.' : ', ולא לפני גיל 18 בלי המלצה.'), 'שיניים עקומות או נשיכה לא תקינה – אורתודונט (גם למבוגרים).'] },
    { id: 'eyes', icon: 'eye', title: 'עיניים רעננות', impact: 'בינוני', freq: 'יומי',
      why: 'שקיות ועיגולים שחורים קשורים בעיקר לשינה, אלרגיות ונוזלים.',
      steps: ['שינה מספקת וקבועה.', 'כרית מעט גבוהה מפחיתה נפיחות בבוקר.', 'קומפרס קר 2-3 דקות בבוקר.', 'אלרגיה/גודש באף – לטפל (רופא/ת).', 'קרם הגנה ומשקפי שמש – פחות קמטוטי צחוק מהשמש.'] },
  ];
  return items;
}

export const DONT_WORK = [
  { t: 'מיואינג (לחיצת לשון לחך)', d: 'אין הוכחה שזה משנה את מבנה הלסת אצל מבוגרים או בני נוער. לחיצה מוגזמת עלולה לגרום לכאבי לסת.' },
  { t: 'מכשירי לסת ולעיסת מסטיק קשה', d: 'לא משנים עצמות. לעיסה מוגזמת עלולה להעמיס על מפרק הלסת (TMJ) ולגרום לכאב.' },
  { t: 'יוגה לפנים / תרגילי פנים', d: 'לא מוכחים כמשנים מבנה פנים או מורידים שומן מהפנים.' },
  { t: '"הרזיה מקומית" בפנים', d: 'אי אפשר להוריד שומן רק מהפנים. השומן יורד מכל הגוף – והפנים משתנות איתו.' },
  { t: 'תוספים "לחיטוב" ושורפי שומן', d: 'רובם לא עובדים וחלקם מסוכנים. לא מומלצים בכלל, ובטח לא לבני נוער.' },
];
