// Generated clients: hair type, starting lengths, a spoken request (haircut + personal wishes), and feedback.
import { HAIRCUTS, HAIRCUT_BY_ID } from './haircuts.js';
import { HAIR_TYPES } from '../hair/hairSystem.js';
import { SKIN_TONES } from '../scene/client.js';
import { mulberry32 } from '../hair/scalp.js';

const NAMES = ['דניאל', 'יוסי', 'עומר', 'איתי', 'נועם', 'אורי', 'רון', 'גיל', 'אלון', 'משה', 'אבי', 'יונתן', 'עידו', 'תומר', 'שי',
  'אריאל', 'מאור', 'דוד', 'אליה', 'נדב', 'עמית', 'ליאור', 'יואב', 'בן', 'אסף', 'רועי', 'שגיא', 'מתן', 'אלעד', 'קובי'];
const CAPES = ['#1d2733', '#2a1f2f', '#1f2a24', '#2b2b2b', '#30251c'];
const GREET = ['היי, מה נשמע?', 'שלום!', 'אהלן, אפשר להתיישב?', 'בוקר טוב!', 'היי, תודה שקיבלת אותי מהר.'];
const EXTRA = [
  'יש לי חתונה בסוף השבוע, אז שיהיה מושלם.', 'אני עובד במשרד, שיהיה מסודר.', 'בפעם הקודמת הצדדים יצאו לא שווים, אז תשים לב לסימטריה.',
  'אני אוהב שזה נקי מאחורה.', 'אין לי הרבה זמן לסדר את השיער בבוקר.', 'הבן שלי אמר שאתה ספר טוב!', '', '',
];
export const PERSONALITIES = {
  relaxed: { name: 'רגוע', strict: 0.9 },
  normal: { name: 'רגיל', strict: 1 },
  picky: { name: 'קפדן', strict: 1.12 },
};

const MODS = {
  keepTop: { text: 'ולהשאיר אורך למעלה', apply: (s) => s, constraint: { zones: ['top', 'crown'], label: 'להשאיר אורך למעלה', kind: 'min', frac: 0.85 } },
  tidyFringe: {
    text: 'ולסדר את הפוני', apply: (s) => ({ ...s, top: { ...s.top, front: Math.max(15, s.top.front - 8) } }),
    constraint: { zones: ['fringe'], label: 'לסדר את הפוני', kind: 'band', frac: 0.2 },
  },
  shorterTop: {
    text: 'ולמעלה קצת יותר קצר מבדרך כלל', apply: (s) => ({ ...s, top: { mid: Math.round(s.top.mid * 0.8), front: Math.round(s.top.front * 0.8), crown: Math.round(s.top.crown * 0.8) } }),
    constraint: { zones: ['top'], label: 'למעלה יותר קצר', kind: 'max', frac: 1.15 },
  },
  notTooShort: { text: 'אבל לא קצר מדי בצדדים', apply: (s) => s, constraint: { zones: ['sideL', 'sideR'], label: 'לא קצר מדי בצדדים', kind: 'min', frac: 0.8 } },
  cleanNeck: { text: 'ושיהיה נקי בעורף', apply: (s) => ({ ...s, outline: true }), constraint: { zones: ['nape'], label: 'עורף נקי', kind: 'max', frac: 1.3 } },
};

/** Starting hair that is long enough for the requested haircut. */
function startLengths(rng, spec) {
  const top = Math.max(spec.top.front, spec.top.mid) + 6 + rng() * 10;
  const side = Math.max(24, (spec.sides[spec.sides.length - 1][1]) + 6) + rng() * 8;
  return { top: Math.min(66, top), crown: Math.min(62, top * 0.85), side: Math.min(56, side), back: Math.min(58, side + 3), nape: Math.min(46, side * 0.7) };
}

export function generateClient({ seed = Date.now(), maxDifficulty = 2, haircutId = null } = {}) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const pool = HAIRCUTS.filter((h) => h.difficulty <= maxDifficulty && h.id !== 'layers');
  const base = haircutId ? HAIRCUT_BY_ID[haircutId] : pick(pool);
  const hairKey = pick(Object.keys(HAIR_TYPES));
  const mods = [];
  if (base.top.mid >= 30 && rng() < 0.55) mods.push('keepTop');
  if (base.top.front >= 30 && rng() < 0.4) mods.push('tidyFringe');
  else if (base.top.mid >= 30 && rng() < 0.2) mods.push('shorterTop');
  if (base.cat !== 'fade' && base.sides[0][1] >= 3 && rng() < 0.3) mods.push('notTooShort');
  if (rng() < 0.3) mods.push('cleanNeck');
  let spec = { ...base };
  for (const m of mods) spec = MODS[m].apply(spec);
  const lengths = startLengths(rng, spec);
  const personality = pick(['relaxed', 'normal', 'normal', 'picky']);
  const name = pick(NAMES);
  const phrase = pick(base.request);
  const modText = mods.length ? ' ' + mods.map((m) => MODS[m].text).join(', ') : '';
  const extra = pick(EXTRA);
  const speech = `${pick(GREET)} ${phrase}${modText}.${extra ? ' ' + extra : ''}`;
  const skin = pick(Object.values(SKIN_TONES));
  return {
    id: `c${seed}`, seed, name, age: 18 + Math.floor(rng() * 45), personality, skin, cape: pick(CAPES),
    preset: { id: `client-${seed}`, name, ...HAIR_TYPES[hairKey], lengths },
    hairKey, base, spec, mods, speech, showsPhoto: rng() < 0.45,
    constraints: [
      { zones: ['sideL', 'sideR', 'back'], label: 'אורך בצדדים ומאחור', kind: 'band', frac: 0.35 },
      { zones: ['top'], label: 'אורך למעלה', kind: 'band', frac: 0.3 },
      ...mods.map((m) => MODS[m].constraint),
    ],
    price: [0, 40, 55, 70, 90, 120][base.difficulty],
  };
}

/** Three answers for "what did the client ask for?" — the right haircut and two similar ones. */
export function requestChoices(client, rng = Math.random) {
  const others = HAIRCUTS.filter((h) => h.id !== client.base.id && h.id !== 'layers')
    .sort((a, b) => Math.abs(a.difficulty - client.base.difficulty) - Math.abs(b.difficulty - client.base.difficulty) || rng() - 0.5)
    .slice(0, 6).sort(() => rng() - 0.5).slice(0, 2);
  return [client.base, ...others].sort(() => rng() - 0.5);
}

/** What the client says when he sees himself in the mirror. */
export function clientFeedback(client, result) {
  const s = result.overall / PERSONALITIES[client.personality].strict;
  const issue = result.bad[0] ? result.bad[0].replace(/\(.*?\)/g, '').trim() : '';
  if (s >= 90) return { mood: '😍', text: 'וואו! זה בדיוק מה שרציתי. אני חוזר רק אליך מעכשיו!', stars: 5 };
  if (s >= 80) return { mood: '😊', text: `יצא ממש טוב, תודה!${issue ? ' רק שמתי לב: ' + issue : ''}`, stars: 4 };
  if (s >= 68) return { mood: '🙂', text: `זה בסדר... ${issue ? 'אבל ' + issue : 'לא בדיוק כמו בתמונה בראש שלי.'}`, stars: 3 };
  if (s >= 52) return { mood: '😕', text: `זה לא ממש מה שביקשתי. ${issue}`, stars: 2 };
  return { mood: '😟', text: `אני לא מרוצה. ${issue} בפעם הבאה תקשיב לבקשה.`, stars: 1 };
}

/** Turns relative constraints into mm limits using the professional result of this client's haircut. */
export function resolveConstraints(constraints, hair) {
  return constraints.map((c) => {
    const vals = c.zones.map((z) => hair.zoneMedian(z, hair.proLengths)).filter((v) => v != null);
    if (!vals.length) return null;
    const ref = vals.reduce((a, b) => a + b, 0) / vals.length;
    const out = { zones: c.zones, label: c.label, weight: c.weight ?? 1 };
    if (c.kind === 'min') out.min = ref * c.frac;
    else if (c.kind === 'max') out.max = Math.max(ref * c.frac, ref + 1.5);
    else { const tol = Math.max(1.5, ref * c.frac); out.min = ref - tol; out.max = ref + tol; }
    return out;
  }).filter(Boolean);
}
