// Story missions of the open world: always one clear mission with a place to go (GPS), what to do, the reward,
// and what comes next. Completed missions are saved (D.life.quests) and pay XP + coins once.
import { ctx } from '../game/context.js';
import { progress } from '../game/progress.js';
import { SHOPS, PROPERTIES } from './worldData.js';
import { LESSONS } from '../data/lessons.js';
import { fx } from '../ui/fx.js';

const D = progress.data;
const passedCount = () => LESSONS.filter((l) => progress.lessonPassed(l.id)).length;
const branches = (life) => Object.values(life.state.branches);
const saveGoal = () => Math.min(...PROPERTIES.map((p) => p.rent * 7)) + 400;

/** Mission list in story order. target(life) → { x, z, label } (where the GPS points). */
export const QUESTS = [
  {
    id: 'firstLesson', title: 'השיעור הראשון', icon: '🎓',
    what: 'גש לאקדמיה, דבר עם המזכירה ועבור שיעור אחד במסלול השיעורים.',
    reward: { xp: 40, coins: 60 },
    done: () => passedCount() >= 1,
    progress: () => `${Math.min(1, passedCount())}/1 שיעורים`,
    target: (L) => ({ ...L.world.city.buildings.academy.desk, label: 'האקדמיה לספרות' }),
  },
  {
    id: 'getJob', title: 'מצא עבודה', icon: '💼',
    what: 'לך למספרה Fade House ודבר עם מוטי, הבעלים. הוא מקבל ספרים מתחילים.',
    reward: { xp: 50, coins: 80 },
    done: (L) => !!L.state.job || L.state.everEmployed,
    target: (L) => ({ ...L.world.city.buildings.fadeHouse.reception, label: 'Fade House — מוטי' }),
  },
  {
    id: 'firstClient', title: 'הלקוח הראשון', icon: '💈',
    what: 'בשעות הפתיחה (9:00–19:00) גש לכיסא שלך במספרה ושרת לקוח שמחכה. הקשב לבקשה שלו!',
    reward: { xp: 60, coins: 100 },
    done: (L) => L.state.jobServed >= 1 || branches(L).some((b) => b.reviews.length),
    target: (L) => {
      const id = L.state.job?.shopId || 'fadeHouse';
      return { ...L.world.city.buildings[id].stationSpots[0].barber, label: 'הכיסא שלך במספרה' };
    },
  },
  {
    id: 'lessons5', title: 'משפרים את הידיים', icon: '📚',
    what: 'עבור 5 שיעורים באקדמיה. ככל שתלמד יותר — הציונים, הטיפים והעמלה עולים.',
    reward: { xp: 80, coins: 120 },
    done: () => passedCount() >= 5,
    progress: () => `${Math.min(5, passedCount())}/5 שיעורים`,
    target: (L) => ({ ...L.world.city.buildings.academy.desk, label: 'האקדמיה' }),
  },
  {
    id: 'fiveClients', title: 'ספר עובד', icon: '✂️',
    what: 'שרת 5 לקוחות בעבודה. כל לקוח מרוצה = עמלה גבוהה יותר + טיפ.',
    reward: { xp: 100, coins: 150 },
    done: (L) => L.state.jobServed >= 5 || branches(L).length > 0,
    progress: (L) => `${Math.min(5, L.state.jobServed)}/5 לקוחות`,
    target: (L) => { const id = L.state.job?.shopId || 'fadeHouse'; return { ...L.world.city.buildings[id].stationSpots[0].barber, label: 'הכיסא שלך' }; },
  },
  {
    id: 'save', title: 'חוסכים למספרה', icon: '🐷',
    what: 'עבוד בכיסא, אכול זול וישן בזמן. חסוך מספיק כסף כדי לשכור חנות משלך.',
    reward: { xp: 80, coins: 0 },
    done: (L) => D.coins >= saveGoal() || branches(L).length > 0,
    progress: () => `${Math.max(0, D.coins).toLocaleString('he-IL')}/${saveGoal().toLocaleString('he-IL')} 🪙`,
    target: (L) => { const id = L.state.job?.shopId || 'fadeHouse'; return { ...L.world.city.buildings[id].stationSpots[0].barber, label: 'עבודה בכיסא' }; },
  },
  {
    id: 'property', title: 'מספרה משלך', icon: '🔑',
    what: 'גש למשרד הנדל״ן או ישירות לנכס עם שלט "להשכרה". בדוק תנועה, גודל ומחיר — ושכור או קנה.',
    reward: { xp: 150, coins: 0 },
    done: (L) => branches(L).length > 0,
    target: (L) => ({ ...L.world.city.buildings.realty.desk, label: 'משרד הנדל״ן' }),
  },
  {
    id: 'firstChair', title: 'פותחים את הדלת', icon: '🪑',
    what: 'בדלפק של המספרה שלך: קנה כיסא ספר, בחר שם וצבעים. בלי כיסא — אין לקוחות.',
    reward: { xp: 80, coins: 100 },
    done: (L) => branches(L).some((b) => b.stations > 0),
    target: (L) => { const b = branches(L)[0]; return b ? { ...L.world.city.buildings[b.propId].reception, label: `ניהול "${b.name}"` } : null; },
  },
  {
    id: 'ownClients', title: 'הלקוחות הראשונים שלך', icon: '⭐',
    what: 'לקוחות נכנסים מהרחוב בשעות הפתיחה. שרת 5 לקוחות במספרה שלך וקבל ביקורות.',
    reward: { xp: 120, coins: 200 },
    done: (L) => branches(L).reduce((a, b) => a + b.reviews.length, 0) >= 5,
    progress: (L) => `${Math.min(5, branches(L).reduce((a, b) => a + b.reviews.length, 0))}/5 ביקורות`,
    target: (L) => { const b = branches(L)[0]; return b ? { ...L.world.city.buildings[b.propId].stationSpots[0]?.barber || L.world.city.buildings[b.propId].reception, label: `הכיסא שלך ב"${b.name}"` } : null; },
  },
  {
    id: 'hire', title: 'גייס עובד', icon: '🤝',
    what: 'קנה כיסא שני וגייס ספר בניהול > צוות. קבע שכר ועמלה הוגנים — עובד לא מרוצה עוזב.',
    reward: { xp: 120, coins: 150 },
    done: (L) => branches(L).some((b) => b.employees.length > 0),
    target: (L) => { const b = branches(L)[0]; return b ? { ...L.world.city.buildings[b.propId].reception, label: 'ניהול > צוות' } : null; },
  },
  {
    id: 'success', title: 'מספרה מצליחה', icon: '🏆',
    what: 'הגע לדירוג 4.2 ומעלה עם 20 ביקורות: תספורות טובות, ניקיון, ציוד ועיצוב.',
    reward: { xp: 250, coins: 400 },
    done: (L) => L.career().id >= 6,
    target: (L) => { const b = branches(L)[0]; return b ? { ...L.world.city.buildings[b.propId].reception, label: b.name } : null; },
  },
  {
    id: 'chain', title: 'רשת מספרות', icon: '👑',
    what: 'פתח 3 מספרות בעיר. גייס צוות טוב לכל סניף ונהל את הכסף בחכמה.',
    reward: { xp: 500, coins: 1000 },
    done: (L) => branches(L).length >= 3,
    progress: (L) => `${branches(L).length}/3 מספרות`,
    target: (L) => ({ ...L.world.city.buildings.realty.desk, label: 'משרד הנדל״ן' }),
  },
];

export const quests = {
  init(life) {
    this.life = life;
    const s = life.state;
    // first load of an existing save: missions already achieved are marked done quietly (no flood of rewards)
    if (!s.quests) { s.quests = {}; for (const q of QUESTS) { if (q.done(life)) s.quests[q.id] = 0; else break; } }
  },
  get current() { return QUESTS.find((q) => !(q.id in this.life.state.quests)) || null; },
  get next() { const c = this.current; return c ? QUESTS[QUESTS.indexOf(c) + 1] || null : null; },
  completedCount() { return Object.keys(this.life.state.quests).length; },
  target() { const q = this.current; try { return q?.target(this.life) || null; } catch { return null; } },

  /** Checks the current mission; pays and celebrates when it is done. */
  check() {
    const L = this.life;
    let q = this.current, guard = 0;
    while (q && q.done(L) && guard++ < 3) {
      L.state.quests[q.id] = L.state.day;
      progress.reward(q.reward.xp, q.reward.coins);
      L.save();
      const nx = this.current;
      fx.banner(`${q.icon} משימה הושלמה!`, `${q.title} · +${q.reward.xp} XP${q.reward.coins ? ` · +${q.reward.coins} 🪙` : ''}`, { sound: 'level' });
      if (q.reward.coins) setTimeout(() => fx.coins(q.reward.coins), 500);
      if (nx) setTimeout(() => ctx.toast?.(`📜 משימה חדשה: ${nx.icon} ${nx.title}`, 3500), 2300);
      q = nx;
    }
  },

  /** The mission log panel content. */
  render() {
    const q = this.current, L = this.life;
    if (!q) return { title: '👑 כל המשימות הושלמו!', html: '<p>אתה בעל רשת מספרות. המשך לשדרג, לגייס ולשמור על הדירוג.</p>' };
    const t = this.target();
    const pr = q.progress ? q.progress(L) : '';
    const nx = this.next;
    return {
      title: `${q.icon} ${q.title}`,
      html: `
        <div class="q-row"><i>📋</i><span>${q.what}</span></div>
        ${t ? `<div class="q-row"><i>📍</i><span>לאן: <b>${t.label}</b></span></div>` : ''}
        ${pr ? `<div class="q-row"><i>📊</i><span>התקדמות: <b>${pr}</b></span></div>` : ''}
        <div class="q-row"><i>🎁</i><span>פרס: <b>+${q.reward.xp} XP${q.reward.coins ? ` · +${q.reward.coins} 🪙` : ''}</b></span></div>
        ${nx ? `<div class="q-row muted"><i>⏭️</i><span>אחר כך: ${nx.icon} ${nx.title}</span></div>` : ''}`,
    };
  },
};
export { SHOPS };
