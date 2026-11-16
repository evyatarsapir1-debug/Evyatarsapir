// Real AI coach – Claude via the official Anthropic SDK (bundled in vendor/).
// Only active when the user adds their own API key in Settings. The key stays on this device
// and requests go straight from the browser to api.anthropic.com.
import { getState, todayKey } from './store.js';
import { tasksFor, dayIndexOf, streak, completion, PROGRAMS } from './plan.js';
import { labelOf, SKIN_TYPES, HAIR_TYPES, STYLES, FITNESS_LEVELS, AREAS, GOALS } from './data/profile.js';
import { COLOR, CATEGORIES } from './data/style.js';
import { computeTargets, currentWeight } from './transform.js';

export const MODEL = 'claude-opus-5-5';
let clientPromise = null;
let clientKey = '';

export function aiAvailable() {
  const c = getState().coach;
  return c.provider === 'claude' && !!c.apiKey;
}

async function client() {
  const key = getState().coach.apiKey;
  if (!clientPromise || clientKey !== key) {
    clientKey = key;
    clientPromise = import('../vendor/anthropic-sdk.mjs').then(({ default: Anthropic }) => ({
      Anthropic,
      api: new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 }),
    }));
  }
  return clientPromise;
}

const SYSTEM = `את/ה "המאמן של GLOW UP" – מאמן גלואו אפ אישי בתוך אפליקציה בעברית. התחומים: טיפוח עור, שיער ותספורות, כושר ויציבה, תזונה מאוזנת, סטייל ולבוש, שינה ושגרה, היגיינה והתמדה.

איך לדבר:
- עברית ברורה, חמה, ידידותית ומעודדת. תשובות קצרות וממוקדות (בדרך כלל עד 150 מילים), עם צעדים ממוספרים כשמסבירים משימה.
- לפנות למשתמש לפי צורת הפנייה שבפרופיל (זכר/נקבה/ניטרלי).
- אף פעם לא לגרום למשתמש להרגיש רע עם המראה שלו. אין ציוני יופי, אין דירוג פנים או גוף, אין השוואות לאחרים.
- להתבסס רק על מידע אמין ומקובל. אם לא בטוח – לומר זאת. לא להמציא עובדות, מחקרים או מוצרים.

כללי בטיחות (חובה):
- מבוגרים (18+): מותר ורצוי לתת תוכנית שינוי אמיתית – חיטוב בגירעון מתון (עד ~20%, ירידה של 0.5-1% ממשקל הגוף בשבוע), בניית מסה בעודף קטן, חלבון 1.6-2.2 ג׳ לק״ג, עומס הדרגתי באימונים, צעדים. לא לרדת מתחת ל-1500 (גברים) / 1200 (נשים) קלוריות, לא צומות קיצוניים ולא תוספי "שריפת שומן". אם יש במסלול יעדים – להשתמש בהם.
- להתאים המלצות לגיל. מתחת לגיל 18: אין ספירת קלוריות, אין דיאטות, צומות, "חיטוב" או ירידה במשקל כמטרה; אין תוספי תזונה או אבקות בלי רופא; אימוני כוח עם משקל גוף/משקל קל ודגש על טכניקה.
- לא לעודד אימון יתר: לפחות יום מנוחה מלא בשבוע, להפסיק בכאב חד.
- לא להבטיח שינוי מבנה עצמות (לסת, פנים, גובה) בעזרת תרגילים, מיואינג או מכשירים – אין לכך הוכחה.
- לא להמליץ על תרופות מרשם, הליכים קוסמטיים או שינויי גוף מסוכנים.
- להפנות לרופא/ה או איש מקצוע כשיש: כאב חד או פציעה, פריחה/תגובה למוצר, פצעונים קשים או צלקות, נשירת שיער פתאומית, עייפות קבועה, עיסוק מוגזם באוכל/משקל/מראה.
- אם עולה סימן למצוקה נפשית או פגיעה עצמית: להגיב באמפתיה, לעודד לפנות מיד למבוגר שסומכים עליו, לער"ן בטלפון 1201, ובמצב חירום למד"א 101 או למשטרה 100.

אפליקציה: אפשר להפנות למסכים: בית, טיפוח (שגרה, מדריכי עור, מראה הפנים), שיער ותספורות (ספרייה עם שמירה), כושר (אימונים, ספריית תרגילים, התאוששות), תזונה, סטייל (ארון דיגיטלי, סטייליסט, לוקים), שינה ושגרה (תזכורות), התקדמות, מוצרים ותקציב, התוכנית שלי (7/30/90 ימים, קצב).
כשמציעים לוק – להשתמש רק בפריטים מרשימת הארון של המשתמש (אם יש), ולהסביר למה הצבעים עובדים.`;

function profileContext() {
  const s = getState();
  const p = s.profile;
  if (!p) return '';
  const key = todayKey();
  const idx = dayIndexOf(s.program, key);
  const prog = PROGRAMS.find((x) => x.length === s.program.length);
  const comp = completion(key);
  const tasks = tasksFor(key).map((t) => `${s.days[key]?.done?.[t.id] ? '✓' : '○'} ${t.title}`).join('; ');
  let lines = [
    `תאריך היום: ${key}`,
    `צורת פנייה: ${p.address === 'f' ? 'נקבה' : p.address === 'm' ? 'זכר' : 'ניטרלי'}`,
    `גיל: ${p.age}`,
  ];
  if (s.coach.shareProfile) {
    lines = lines.concat([
      `שם: ${p.name}`,
      `מטרות: ${p.goals.map((g) => labelOf(GOALS, g)).join(', ')}`,
      `תחומים לשיפור: ${p.areas.map((a) => labelOf(AREAS, a)).join(', ')}`,
      `סוג עור: ${labelOf(SKIN_TYPES, p.skinType)}`,
      `סוג שיער: ${labelOf(HAIR_TYPES, p.hairType)}, אורך: ${p.hairLength}${p.faceShape ? `, צורת פנים: ${p.faceShape}` : ''}`,
      `סגנון לבוש: ${p.styles.map((x) => labelOf(STYLES, x)).join(', ')}`,
      `ניסיון באימונים: ${labelOf(FITNESS_LEVELS, p.fitnessLevel)}`,
      `זמן פנוי ביום: ${p.minutes} דקות`,
      `תוכנית: ${prog.name}, יום ${idx + 1}, קצב ${s.program.pace}`,
      `רצף התמדה: ${streak()} ימים. היום הושלמו ${comp.done}/${comp.total} משימות.`,
      `משימות היום: ${tasks}`,
    ]);
    if (s.transform?.active) {
      const tg = computeTargets();
      lines.push(`מסלול שינוי פעיל: מטרה ${s.transform.goal}, גובה ${s.transform.heightCm}, משקל ממוצע ${currentWeight()} ק"ג, יעד יומי: ${tg.kcal ? tg.kcal + ' קלוריות, ' : 'ללא יעד קלוריות (מתחת לגיל 18), '}${tg.protein} ג' חלבון, ${tg.steps} צעדים, ${s.transform.daysPerWeek} אימוני כוח בשבוע (${s.transform.equipment}).`);
    }
    if (s.wardrobe.length) {
      const items = s.wardrobe.slice(0, 60).map((w) => `${w.name} (${CATEGORIES.find((c) => c.id === w.category)?.label}, ${COLOR[w.color]?.label})`).join('; ');
      lines.push(`פריטים בארון הדיגיטלי: ${items}`);
    }
  }
  return lines.join('\n');
}

/**
 * Stream a reply. onText(delta) is called as text arrives. Returns the full text.
 * Throws an Error with a Hebrew, user-facing message on failure.
 */
export async function askClaude(history, onText, signal) {
  const { Anthropic, api } = await client();
  // history: [{role:'user'|'assistant', text}] – keep the last turns, must start with a user turn
  let msgs = history.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-20).map((m) => ({ role: m.role, content: m.text }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const system = `${SYSTEM}\n\nמידע על המשתמש (מהאפליקציה):\n${profileContext()}`;
  try {
    const stream = api.beta.messages.stream({
      model: getState().coach.model || MODEL,
      max_tokens: 4000,
      system,
      messages: msgs,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }, { signal });
    stream.on('text', (delta) => onText(delta));
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      throw new Error('המאמן לא יכול לענות על השאלה הזו. אפשר לנסח אחרת או לשאול על נושא אחר.');
    }
    return final.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  } catch (e) {
    if (e?.name === 'AbortError' || signal?.aborted) throw new Error('התשובה בוטלה.');
    if (e instanceof Anthropic.AuthenticationError) throw new Error('מפתח ה-API לא תקין. אפשר לעדכן אותו בהגדרות › המאמן.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('למפתח הזה אין הרשאה למודל. כדאי לבדוק את החשבון ב-Claude Console.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('יותר מדי בקשות כרגע. כדאי לנסות שוב בעוד דקה.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('אין חיבור לשרת. בודקים את האינטרנט ומנסים שוב.');
    if (e instanceof Anthropic.APIError) throw new Error(`שגיאה מהשרת (${e.status ?? '—'}). אפשר לנסות שוב.`);
    throw e instanceof Error ? e : new Error('משהו השתבש. אפשר לנסות שוב.');
  }
}

/** Quick check that a key works (tiny request). */
export async function testKey() {
  const { api } = await client();
  const r = await api.messages.create({ model: getState().coach.model || MODEL, max_tokens: 64, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'ענה במילה אחת: שלום' }] });
  return r.content.some((b) => b.type === 'text');
}
