// Real quality check of a haircut. Everything is measured on the actual strands — never on which buttons were used.
// Scores: accuracy (length vs target), symmetry (left vs right), blend (smooth transitions, no lines),
// uniformity (no missed patches), finish (outline, clean cape, hygiene), request (what the client asked for).
import { ZONE_KEYS, ZONE_NAMES, heightName } from '../hair/scalp.js';
import { guardFor, guardText } from '../data/haircuts.js';

const AZ_BINS = 36, Y_BINS = 24, Y0 = -0.8, Y1 = 1.0;
const tolOf = (t) => Math.max(0.6, t * 0.12);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

export const CRITERIA = {
  accuracy: { name: 'דיוק האורך', icon: '📏' },
  symmetry: { name: 'סימטריה', icon: '⚖️' },
  blend: { name: 'מעברים', icon: '🌫️' },
  uniformity: { name: 'אחידות', icon: '🧩' },
  finish: { name: 'גימור וניקיון', icon: '✨' },
  request: { name: 'התאמה לבקשה', icon: '💬' },
};

function sideWord(az) { return az < 0 ? 'ימין' : 'שמאל'; }
function placeName(az, y) {
  const a = Math.abs(az);
  const where = a < 0.9 ? 'בקדמה' : a < 2.2 ? `בצד ${sideWord(az)}` : 'מאחור';
  return `${where}, ${heightName(y)}`;
}
function fixFor(mm) {
  if (mm <= 0.3) return 'טרימר';
  if (mm > 26) return `מספריים על מסרק (${Math.round(mm)} מ״מ)`;
  return guardText(guardFor(mm));
}

/**
 * @param hair HairSystem with an active target
 * @param spec haircut spec (for outline/texture rules)
 * @param opts { constraints?: [{zone, min?, max?, label, weight?}], understood?: bool,
 *               capeHair?: number|null, hygiene?: bool|null, zones?: string[] }
 */
export function analyzeHaircut(hair, spec, opts = {}) {
  const n = hair.count, L = hair.lengths, T = hair.proLengths, D = hair.dirs;
  const zoneFilter = opts.zones ? new Set(opts.zones.map((z) => ZONE_KEYS.indexOf(z))) : null;
  // ---- bins
  const bins = new Map();
  const binOf = (i) => {
    const x = D[i * 3], y = D[i * 3 + 1], z = D[i * 3 + 2];
    const az = Math.atan2(x, z);
    const ai = Math.min(AZ_BINS - 1, Math.floor((az + Math.PI) / (2 * Math.PI) * AZ_BINS));
    const yi = Math.max(0, Math.min(Y_BINS - 1, Math.floor((y - Y0) / (Y1 - Y0) * Y_BINS)));
    return [ai, yi];
  };
  const zoneStats = {};
  for (const k of ZONE_KEYS) zoneStats[k] = { len: [], tgt: [], err: [] };
  let spots = 0, counted = 0;
  for (let i = 0; i < n; i++) {
    if (zoneFilter && !zoneFilter.has(hair.zoneIdx[i])) continue;
    const [ai, yi] = binOf(i);
    const key = ai * Y_BINS + yi;
    let b = bins.get(key);
    if (!b) bins.set(key, b = { ai, yi, len: [], tgt: [], idx: [] });
    b.len.push(L[i]); b.tgt.push(T[i]); b.idx.push(i);
    const zs = zoneStats[ZONE_KEYS[hair.zoneIdx[i]]];
    zs.len.push(L[i]); zs.tgt.push(T[i]); zs.err.push(L[i] - T[i]);
    counted++;
  }
  for (const b of bins.values()) {
    b.mL = median(b.len); b.mT = median(b.tgt); b.tol = tolOf(b.mT);
    b.az = (b.ai + 0.5) / AZ_BINS * 2 * Math.PI - Math.PI;
    b.y = Y0 + (b.yi + 0.5) / Y_BINS * (Y1 - Y0);
  }
  const binList = [...bins.values()].filter((b) => b.len.length >= 4);

  // ---- accuracy (bin medians, weighted by strand count). Too short is worse: it cannot be fixed.
  let accW = 0, accS = 0, tooLongW = 0, tooShortW = 0;
  for (const b of binList) {
    const e = b.mL - b.mT, w = b.len.length;
    let sc = 1;
    if (e > b.tol) { sc = clamp01(1 - (e - b.tol) / (b.tol * 4)); tooLongW += w; }
    else if (e < -b.tol) { sc = clamp01(1 - (-e - b.tol) / (b.tol * 2)); tooShortW += w; }
    accS += sc * w; accW += w;
  }
  const accuracy = accW ? accS / accW : 0;

  // ---- uniformity: strands left much longer than their (correct) neighbours = missed spots
  const spotBins = [];
  for (const b of binList) {
    if (Math.abs(b.mL - b.mT) > b.tol * 1.5) continue;
    let s = 0;
    for (let k = 0; k < b.len.length; k++) if (b.len[k] > b.tgt[k] + tolOf(b.tgt[k]) * 2.5) s++;
    spots += s;
    if (s / b.len.length > 0.12) spotBins.push(b);
  }
  const uniformity = clamp01(1 - (counted ? spots / counted : 0) * 9);

  // ---- symmetry: deviation from target on the left vs the right (handles asymmetric styles too)
  let symS = 0, symW = 0, worstSym = null;
  for (const b of binList) {
    if (b.ai >= AZ_BINS / 2) continue; // right half (az < 0); compare with mirrored left bin
    const m = bins.get((AZ_BINS - 1 - b.ai) * Y_BINS + b.yi);
    if (!m || m.len.length < 4) continue;
    const a = Math.abs(b.az);
    if (a < 0.5 || a > Math.PI - 0.5) continue; // the centre line has no mirror partner worth comparing
    const dev = (b.mL - b.mT) - (m.mL - m.mT);
    const tol = (b.tol + m.tol) / 2;
    const w = Math.min(b.len.length, m.len.length);
    symS += clamp01(1 - Math.max(0, Math.abs(dev) - tol * 0.5) / (tol * 2.5)) * w; symW += w;
    if (Math.abs(dev) > tol && (!worstSym || Math.abs(dev) > Math.abs(worstSym.dev))) worstSym = { dev, b, m };
  }
  const symmetry = symW ? symS / symW : 1;

  // ---- blend: in every column up the head, the change between neighbouring heights must follow the target
  let blS = 0, blW = 0, worstLine = null;
  for (let ai = 0; ai < AZ_BINS; ai++) {
    for (let yi = 0; yi < Y_BINS - 1; yi++) {
      const b0 = bins.get(ai * Y_BINS + yi), b1 = bins.get(ai * Y_BINS + yi + 1);
      if (!b0 || !b1 || b0.len.length < 4 || b1.len.length < 4) continue;
      const dA = b1.mL - b0.mL, dT = b1.mT - b0.mT;
      const stepTol = Math.max(1.2, 0.22 * Math.max(b0.mT, b1.mT));
      const ex = Math.max(0, Math.abs(dA - dT) - stepTol);
      blS += clamp01(ex / stepTol); blW++;
      if (ex > 0 && (!worstLine || ex > worstLine.ex)) worstLine = { ex, b0, b1, dA, dT };
    }
  }
  const blend = blW ? clamp01(1 - (blS / blW) * 2.2) : 1;

  // ---- finish: outline (neckline / ears / sideburns), clean cape, hygiene
  const finishParts = [];
  let outlineBad = 0, outlineN = 0;
  if (spec?.outline) {
    for (let i = 0; i < n; i++) {
      if (hair.mask[i] > 0.6) continue;
      const z = hair.zone[i];
      if (z !== 'nape' && z !== 'sideburn' && z !== 'side' && z !== 'back') continue;
      if (zoneFilter && !zoneFilter.has(hair.zoneIdx[i])) continue;
      outlineN++;
      if (L[i] > T[i] + tolOf(T[i]) * 1.5) outlineBad++;
    }
    if (outlineN) finishParts.push(clamp01(1 - outlineBad / outlineN * 2.5));
  }
  if (opts.capeHair != null) finishParts.push(clamp01(1 - opts.capeHair / 120));
  if (opts.hygiene != null) finishParts.push(opts.hygiene ? 1 : 0.3);
  const finish = finishParts.length ? finishParts.reduce((a, b) => a + b, 0) / finishParts.length : null;

  // ---- per-zone summary
  const zones = [];
  for (const k of ZONE_KEYS) {
    const zs = zoneStats[k];
    if (zs.len.length < 10) continue;
    const mL = median(zs.len), mT = median(zs.tgt), tol = Math.max(1.2, mT * 0.2); // a zone spans a gradient: looser than per bin
    zones.push({ key: k, name: ZONE_NAMES[k], mL, mT, err: mL - mT, tol, ok: Math.abs(mL - mT) <= tol });
  }

  // ---- client request
  let request = null;
  const reqLines = [];
  if (opts.constraints && opts.constraints.length) {
    let s = 0, w = 0;
    for (const c of opts.constraints) {
      const vals = c.zones.map((z) => zones.find((q) => q.key === z)).filter(Boolean);
      if (!vals.length) continue;
      const v = vals.reduce((a, q) => a + q.mL, 0) / vals.length;
      let sc = 1;
      if (c.min != null && v < c.min) sc = clamp01(1 - (c.min - v) / Math.max(3, c.min * 0.4));
      if (c.max != null && v > c.max) sc = Math.min(sc, clamp01(1 - (v - c.max) / Math.max(3, c.max * 0.6)));
      const wt = c.weight ?? 1;
      s += sc * wt; w += wt;
      reqLines.push({ label: c.label, ok: sc > 0.8, value: v, sc });
    }
    request = w ? s / w : null;
    if (request != null && opts.understood === false) request *= 0.85;
    if (request != null) request = request * 0.6 + accuracy * 0.4; // the whole haircut must match too
  }

  // Symmetry, smooth blends and an even surface mean nothing if the haircut was not actually done:
  // untouched (or barely touched) hair is perfectly "symmetric". Those criteria count only as far as the work is done.
  const workF = clamp01((accuracy - 0.1) / 0.5);
  const scores = {
    accuracy, symmetry: symmetry * workF, blend: blend * workF, uniformity: uniformity * workF,
    finish: finish == null ? null : finish * (0.4 + 0.6 * workF), request,
  };
  const weights = { accuracy: 0.3, symmetry: 0.2, blend: 0.2, uniformity: 0.1, finish: 0.1, request: 0.15 };
  let tot = 0, wsum = 0;
  for (const [k, v] of Object.entries(scores)) if (v != null) { tot += v * weights[k]; wsum += weights[k]; }
  const overall = Math.round((tot / wsum) * 100);

  // ---- tutor feedback
  const good = [], bad = [], fixes = [];
  const pct = (v) => Math.round(v * 100);
  if (accuracy >= 0.85) good.push(`האורכים קרובים מאוד לתוצאה המקצועית (${pct(accuracy)}%).`);
  if (scores.symmetry >= 0.88) good.push('שני צדי הראש סימטריים — עבודה מדויקת משני הכיוונים.');
  if (scores.blend >= 0.85) good.push('המעברים חלקים, בלי קווים חדים בין המסרקים.');
  if (scores.uniformity >= 0.9) good.push('לא נשארו איים של שיער ארוך — התנועות היו חופפות.');
  if (scores.finish != null && scores.finish >= 0.85) good.push('גימור נקי: קווי מתאר מסודרים ולקוח נקי.');
  if (request != null && request >= 0.85) good.push('התספורת תואמת את מה שהלקוח ביקש.');

  for (const z of zones) {
    if (z.ok) continue;
    const diff = Math.abs(z.err).toFixed(1);
    if (z.err > 0) {
      bad.push(`${z.name} ארוך מדי בכ־${diff} מ״מ (יצא ${z.mL.toFixed(1)}, צריך ${z.mT.toFixed(1)}).`);
      fixes.push(`${z.name}: עבור שוב עם ${fixFor(z.mT)}. אפשר לתקן את זה עכשיו — לחץ "המשך לתקן".`);
    } else {
      bad.push(`${z.name} קצר מדי בכ־${diff} מ״מ (יצא ${z.mL.toFixed(1)}, צריך ${z.mT.toFixed(1)}).`);
      fixes.push(`${z.name}: שיער שנחתך קצר מדי אי אפשר להחזיר. בפעם הבאה התחל במסרק ארוך יותר ורד בהדרגה, ובדוק את האורך בחיווי לפני שאתה חותך.`);
    }
  }
  if (worstSym) {
    const longer = worstSym.dev > 0 ? 'ימין' : 'שמאל';
    const other = longer === 'ימין' ? 'שמאל' : 'ימין';
    bad.push(`חוסר סימטריה: הצד ה${longer === 'ימין' ? 'ימני' : 'שמאלי'} של הלקוח ארוך מה${other === 'ימין' ? 'ימני' : 'שמאלי'} בכ־${Math.abs(worstSym.dev).toFixed(1)} מ״מ, ${heightName(worstSym.b.y)}.`);
    fixes.push(`סימטריה: הסתכל מאחור ("אחור") ומלמעלה, ועבור שוב על הצד ה${longer === 'ימין' ? 'ימני' : 'שמאלי'} באותו מסרק ובאותו גובה כמו בצד השני.`);
  }
  if (worstLine && blend < 0.85) {
    const yb = (worstLine.b0.y + worstLine.b1.y) / 2;
    const shorter = Math.min(worstLine.b0.mL, worstLine.b1.mL), longer = Math.max(worstLine.b0.mL, worstLine.b1.mL);
    bad.push(`קו חד במעבר ${placeName(worstLine.b0.az, yb)}: קפיצה מ־${shorter.toFixed(1)} ל־${longer.toFixed(1)} מ״מ.`);
    fixes.push(`מעבר: על הקו עצמו השתמש במסרק שבין שני האורכים (${fixFor((shorter + longer) / 2)}) או בידית טייפר פתוחה, בתנועה קצרה שמתעקלת החוצה ("הוצאה").`);
  }
  if (spotBins.length && uniformity < 0.92) {
    const b = spotBins[0];
    bad.push(`נשארו איים של שיער ארוך ${placeName(b.az, b.y)}.`);
    fixes.push('אחידות: עבוד בתנועות חופפות (כל תנועה עוברת על חצי מהקודמת), ובדוק במפת האורכים 🌈 שאין נקודות בצבע אחר.');
  }
  if (spec?.outline && outlineN && outlineBad / outlineN > 0.08) {
    bad.push('קווי המתאר (עורף, פאות, מסביב לאוזן) לא נקיים.');
    fixes.push('גימור: עבור עם הטרימר לאורך קו העורף, מסביב לאוזניים ובפאות, בתנועות קצרות ועדינות.');
  }
  if (opts.capeHair != null && opts.capeHair > 30) {
    bad.push(`נשארו כ־${opts.capeHair} שערות על הגלימה ועל הצוואר.`);
    fixes.push('ניקיון: קח את מברשת הצוואר 🧹 והעבר אותה על הכתפיים והצוואר לפני שהלקוח קם.');
  }
  if (opts.hygiene === false) {
    bad.push('הכלים לא חוטאו לפני העבודה.');
    fixes.push('היגיינה: לפני כל לקוח לוחצים "🧴 חיטוי כלים". זה שומר על הלקוח ועל המוניטין שלך.');
  }
  for (const r of reqLines) if (!r.ok) bad.push(`הבקשה "${r.label}" לא קוימה (נמדד ${r.value.toFixed(0)} מ״מ).`);
  if (opts.understood === false) bad.push('הבקשה לא הובנה נכון בהתחלה — תמיד מוודאים עם הלקוח לפני שמתחילים.');

  // ---- which lesson next (weakest criterion)
  const weakest = Object.entries(scores).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1])[0];
  const recommend = { accuracy: tooShortW > tooLongW ? 'L3-4' : 'L3-2', symmetry: 'L5-8', blend: 'L5-7', uniformity: 'L3-9', finish: 'L9-1', request: 'L9-6' }[weakest[0]];

  return {
    overall, scores, zones, good, bad, fixes, recommend, weakest: weakest[0],
    grade: overall >= 90 ? 'מצוין' : overall >= 80 ? 'טוב מאוד' : overall >= 70 ? 'טוב' : overall >= 55 ? 'צריך שיפור' : 'כדאי לנסות שוב',
    stars: overall >= 92 ? 5 : overall >= 82 ? 4 : overall >= 70 ? 3 : overall >= 55 ? 2 : 1,
    requestLines: reqLines,
  };
}
