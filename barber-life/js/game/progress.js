// Player progress: profile, XP and ranks, coins, lessons, haircut records, achievements, certificates.
// Everything lives in one localStorage object (the same key phase 1 used, so old saves keep working).
export const SAVE_KEY = 'barber_life_v1';

export const RANKS = [
  { id: 1, name: 'מתחיל', xp: 0 },
  { id: 2, name: 'תלמיד ספרות', xp: 150 },
  { id: 3, name: 'ספר מתחיל', xp: 500 },
  { id: 4, name: 'ספר מתקדם', xp: 1200 },
  { id: 5, name: 'ספר מקצועי', xp: 2500 },
  { id: 6, name: 'מומחה פיידים', xp: 4000 },
  { id: 7, name: 'מאסטר ברבר', xp: 6000 },
];

export const ACHIEVEMENTS = [
  { id: 'firstCut', name: 'החיתוך הראשון', desc: 'חתוך שיער בפעם הראשונה', xp: 10, coins: 20 },
  { id: 'firstHaircut', name: 'תספורת ראשונה', desc: 'סיים ובדוק תספורת שלמה', xp: 30, coins: 50 },
  { id: 'firstFade', name: 'פייד ראשון', desc: 'סיים פייד עם ציון 60 ומעלה', xp: 50, coins: 80 },
  { id: 'learnNew', name: 'למדתי תספורת חדשה', desc: 'סיים תספורת חדשה במעבדה עם ציון 70+', xp: 40, coins: 60 },
  { id: 'score90', name: 'ציון 90', desc: 'קבל ציון כולל של 90 ומעלה', xp: 80, coins: 120 },
  { id: 'symmetryMaster', name: 'עין של מאסטר', desc: 'סימטריה של 95% ומעלה', xp: 60, coins: 100 },
  { id: 'happyClient', name: 'לקוח מרוצה', desc: 'קבל 4 כוכבים ומעלה מלקוח', xp: 40, coins: 60 },
  { id: 'tenClients', name: '10 לקוחות', desc: 'שרת 10 לקוחות', xp: 100, coins: 150 },
  { id: 'timedCut', name: 'ידיים מהירות', desc: 'סיים תספורת בפחות מ־6 דקות עם ציון 70+', xp: 60, coins: 80 },
  { id: 'cleanFinish', name: 'גימור מושלם', desc: 'לקוח מחוטא ונקי לגמרי בסוף התספורת', xp: 40, coins: 60 },
  { id: 'lessons10', name: '10 שיעורים', desc: 'סיים 10 שיעורים במסלול', xp: 60, coins: 100 },
  { id: 'chapter1', name: 'פרק ראשון', desc: 'סיים את הפרק הראשון וקבל תעודה', xp: 50, coins: 80 },
  { id: 'dailyChallenge', name: 'אתגר יומי', desc: 'השלם אתגר יומי', xp: 50, coins: 80 },
  { id: 'openShop', name: 'בעל מספרה', desc: 'פתח מספרה משלך', xp: 100, coins: 0 },
  { id: 'fullDay', name: 'יום עבודה מלא', desc: 'השלם יום עבודה מלא במספרה', xp: 100, coins: 100 },
  { id: 'proRank', name: 'ספר מקצועי', desc: 'הגע לדרגת ספר מקצועי', xp: 0, coins: 300 },
];

let data = load();
const listeners = new Set();

function load() {
  let d;
  try { d = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { d = {}; }
  d.profile ||= { name: '' };
  d.xp ??= 0;
  d.coins ??= 300;
  d.lessons ||= {};
  d.haircuts ||= {};
  d.achievements ||= {};
  d.certificates ||= [];
  d.daily ||= {};
  d.stats ||= {};
  d.stats.strokes ??= 0; d.stats.hairsCut ??= 0; d.stats.clients ??= 0; d.stats.haircuts ??= 0;
  d.hair ||= {};
  d.history ||= [];
  return d;
}

export const progress = {
  get data() { return data; },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage blocked: keep playing */ }
    for (const f of listeners) f(data);
  },
  onChange(f) { listeners.add(f); },

  get rank() { let r = RANKS[0]; for (const k of RANKS) if (data.xp >= k.xp) r = k; return r; },
  get nextRank() { return RANKS.find((k) => k.xp > data.xp) || null; },

  /** Adds XP/coins and reports a rank-up (returns the new rank or null). */
  reward(xp = 0, coins = 0) {
    const before = this.rank.id;
    data.xp += Math.round(xp);
    data.coins += Math.round(coins);
    const after = this.rank;
    if (after.id >= 5) this.unlock('proRank');
    this.save();
    return after.id > before ? after : null;
  },
  spend(coins) {
    if (data.coins < coins) return false;
    data.coins -= coins; this.save(); return true;
  },

  /** Unlocks an achievement once; returns it if new. */
  unlock(id) {
    if (data.achievements[id]) return null;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return null;
    data.achievements[id] = new Date().toISOString().slice(0, 10);
    data.xp += a.xp; data.coins += a.coins;
    this.save();
    listeners.forEach((f) => f(data, { achievement: a }));
    return a;
  },

  lessonPassed(id) { return !!data.lessons[id]?.passed; },
  recordLesson(id, score, passed) {
    const l = data.lessons[id] ||= { passed: false, best: 0, tries: 0 };
    l.tries++;
    l.best = Math.max(l.best, score ?? 0);
    const first = passed && !l.passed;
    if (passed) l.passed = true;
    this.save();
    return first;
  },

  recordHaircut(id, score, kind) {
    const h = data.haircuts[id] ||= { best: 0, count: 0, learned: false };
    h.count++;
    h.best = Math.max(h.best, score);
    const firstLearn = !h.learned && score >= 70;
    if (score >= 70) h.learned = true;
    data.stats.haircuts++;
    data.history.unshift({ id, score, kind, date: new Date().toISOString() });
    data.history.length = Math.min(data.history.length, 40);
    this.save();
    return firstLearn;
  },

  addCertificate(id, title, score) {
    if (data.certificates.find((c) => c.id === id)) return null;
    const c = { id, title, score: Math.round(score), date: new Date().toLocaleDateString('he-IL'), name: data.profile.name || 'תלמיד/ה' };
    data.certificates.push(c);
    this.save();
    return c;
  },
};
