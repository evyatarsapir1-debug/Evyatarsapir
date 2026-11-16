// One AI layer for the whole app.
// 1) Inside a claude.ai Artifact viewer: the `sample` capability (the viewer's own Claude
//    account, no key; images supported when the artifact declares them).
// 2) Self-hosted: the user's Anthropic API key via the official SDK (coach-ai.js).
// 3) Neither: callers fall back to the built-in, rule-based logic and say so.
import { getState } from './store.js';

let sampleFn = null;
let sampleImages = false;
let ready = null;

/** Resolve the Artifact `sample` capability once (null outside a viewer). */
export function initAI() {
  if (ready) return ready;
  ready = (async () => {
    try {
      if (!window.claude?.use) return;
      const s = await window.claude.use('sample');
      if (!s) return;
      sampleFn = s;
      const lim = await s.limits().catch(() => null);
      sampleImages = !!lim?.images;
    } catch { /* not in a viewer */ }
  })();
  return ready;
}

export const hasSample = () => !!sampleFn;
export const sampleCanSeeImages = () => !!sampleFn && sampleImages;
export const hasKey = () => getState().coach.provider === 'claude' && !!getState().coach.apiKey;
/** True when some real AI model can answer. */
export const aiOn = () => hasSample() || hasKey();
/** True when a real AI model can look at photos. */
export const visionOn = () => sampleCanSeeImages() || hasKey();

const CODE_COPY = {
  not_granted: 'לא אישרת ל-GLOW UP להשתמש ב-Claude. אפשר לאשר מתפריט ההרשאות של הדף.',
  sampling_disabled: 'Claude לא זמין בחשבון הזה.',
  rate_limited: 'יותר מדי בקשות או שהגעת למגבלת השימוש. נסו שוב בעוד כמה דקות.',
  session_expired: 'צריך להתחבר מחדש ל-Claude.',
  image_rejected: 'התמונה לא התקבלה (סוג או גודל). נסו תמונה אחרת – JPG או PNG.',
  images_unavailable: 'בתצוגה הזו אי אפשר לשלוח תמונות ל-Claude.',
  refused: 'Claude לא יכול לעזור בבקשה הזו. נסו לנסח אחרת.',
  empty_completion: 'לא התקבלה תשובה. נסו שוב.',
  invalid_json: 'התשובה לא הגיעה בפורמט הנכון. נסו שוב.',
  cancelled: 'בוטל.',
};
export function aiErrorText(e) {
  if (!e) return 'משהו השתבש. נסו שוב.';
  if (e.code) return CODE_COPY[e.code] || 'שגיאה זמנית בחיבור ל-Claude. נסו שוב.';
  return e.message || 'משהו השתבש. נסו שוב.';
}

/**
 * Ask a real model. `input` is a prompt string or [{role, content}] (starting and ending on user).
 * opts: { onText(text), images: Blob[], json: bool, signal, tier: 'quick'|'default'|'complex', fresh: bool }
 * Resolves the text (or parsed JSON when opts.json).
 */
export async function ask(input, opts = {}) {
  await initAI();
  if (sampleFn) {
    const o = {
      onText: opts.onText ? ({ text }) => opts.onText(text) : undefined,
      signal: opts.signal,
      modelTier: opts.tier || 'default',
    };
    if (opts.images?.length) o.images = opts.images;
    if (opts.fresh) o.cache = false;
    if (opts.json) return sampleFn.json(input, o);
    const r = await sampleFn(input, o);
    return r.text;
  }
  if (hasKey()) {
    const { askRaw } = await import('./coach-ai.js');
    const text = await askRaw(input, opts);
    if (!opts.json) return text;
    return parseJsonLoose(text);
  }
  const err = new Error('אין מודל AI מחובר.');
  err.code = 'no_ai';
  throw err;
}

export function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch { /* keep looking */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* keep looking */ } }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* fall through */ } }
  const err = new Error('התשובה לא הגיעה בפורמט הנכון. נסו שוב.');
  err.code = 'invalid_json';
  throw err;
}
