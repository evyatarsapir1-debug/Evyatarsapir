// Wardrobe taxonomy + outfit rules for the smart stylist.

export const CATEGORIES = [
  { id: 'top', label: 'חולצות', icon: 'shirt', slot: 'top' },
  { id: 'layer', label: 'שכבה עליונה', icon: 'layers', slot: 'layer' },
  { id: 'bottom', label: 'מכנסיים / חצאיות', icon: 'ruler', slot: 'bottom' },
  { id: 'dress', label: 'שמלות / אוברול', icon: 'star', slot: 'dress' },
  { id: 'shoes', label: 'נעליים', icon: 'shoe', slot: 'shoes' },
  { id: 'watch', label: 'שעונים', icon: 'watch', slot: 'acc' },
  { id: 'jewelry', label: 'שרשראות ותכשיטים', icon: 'necklace', slot: 'acc' },
  { id: 'acc', label: 'אביזרים', icon: 'bag', slot: 'acc' },
  { id: 'sport', label: 'בגדי ספורט', icon: 'dumbbell', slot: 'sport' },
];

export const OCCASIONS = [
  { id: 'school', label: 'בית ספר' },
  { id: 'daily', label: 'יומיום' },
  { id: 'out', label: 'יציאות' },
  { id: 'event', label: 'אירועים' },
  { id: 'sport', label: 'ספורט' },
];

// neutral: true = goes with almost everything
export const COLORS = [
  { id: 'black', label: 'שחור', hex: '#141414', neutral: true, family: 'neutral' },
  { id: 'white', label: 'לבן', hex: '#f5f5f5', neutral: true, family: 'neutral' },
  { id: 'grey', label: 'אפור', hex: '#8a8a8a', neutral: true, family: 'neutral' },
  { id: 'navy', label: 'נייבי', hex: '#1e2a4a', neutral: true, family: 'blue' },
  { id: 'beige', label: 'בז׳', hex: '#d8c3a5', neutral: true, family: 'earth' },
  { id: 'brown', label: 'חום', hex: '#6b4a2f', neutral: true, family: 'earth' },
  { id: 'denim', label: 'כחול ג׳ינס', hex: '#4a6d99', neutral: true, family: 'blue' },
  { id: 'olive', label: 'ירוק זית', hex: '#6b7040', neutral: false, family: 'green' },
  { id: 'khaki', label: 'חאקי', hex: '#b5a77a', neutral: true, family: 'earth' },
  { id: 'blue', label: 'כחול', hex: '#2f6fe0', neutral: false, family: 'blue' },
  { id: 'lightblue', label: 'תכלת', hex: '#9cc7f0', neutral: false, family: 'blue' },
  { id: 'green', label: 'ירוק', hex: '#2f9e5a', neutral: false, family: 'green' },
  { id: 'red', label: 'אדום', hex: '#c8323a', neutral: false, family: 'red' },
  { id: 'burgundy', label: 'בורדו', hex: '#6d1f2c', neutral: false, family: 'red' },
  { id: 'pink', label: 'ורוד', hex: '#f2a7c3', neutral: false, family: 'red' },
  { id: 'purple', label: 'סגול', hex: '#7c3aed', neutral: false, family: 'purple' },
  { id: 'yellow', label: 'צהוב', hex: '#f2c94c', neutral: false, family: 'yellow' },
  { id: 'orange', label: 'כתום', hex: '#e8792f', neutral: false, family: 'yellow' },
  { id: 'silver', label: 'כסף', hex: '#c0c4cc', neutral: true, family: 'metal' },
  { id: 'gold', label: 'זהב', hex: '#d4a93a', neutral: true, family: 'metal' },
  { id: 'multi', label: 'צבעוני / הדפס', hex: 'conic-gradient(#f472b6,#fbbf24,#22d3ee,#a855f7,#f472b6)', neutral: false, family: 'multi' },
];
export const COLOR = Object.fromEntries(COLORS.map((c) => [c.id, c]));

// pairs of color families that clash in the same look (keep it simple & safe)
const CLASH = new Set(['red|green', 'red|purple', 'yellow|purple', 'red|yellow', 'multi|multi', 'gold|silver']);

export function colorsWork(a, b) {
  const A = COLOR[a], B = COLOR[b];
  if (!A || !B) return true;
  if (A.neutral || B.neutral) return !(CLASH.has(`${A.family}|${B.family}`) || CLASH.has(`${B.family}|${A.family}`));
  if (A.family === B.family) return true; // tone on tone
  return !(CLASH.has(`${A.family}|${B.family}`) || CLASH.has(`${B.family}|${A.family}`));
}

/** Score an outfit (higher = better). Returns { score, reasons[] } */
export function scoreOutfit(items) {
  const reasons = [];
  let score = 50;
  const colors = items.filter((i) => i.slot !== 'acc' || i.category !== 'acc').map((i) => i.color);
  const nonNeutral = [...new Set(colors.filter((c) => COLOR[c] && !COLOR[c].neutral))];
  if (nonNeutral.length === 0) { score += 10; reasons.push('בסיס ניטרלי – נקי ובטוח'); }
  if (nonNeutral.length === 1) { score += 18; reasons.push(`צבע בולט אחד (${COLOR[nonNeutral[0]].label}) על בסיס ניטרלי`); }
  if (nonNeutral.length === 2) { score += colorsWork(nonNeutral[0], nonNeutral[1]) ? 6 : -20; }
  if (nonNeutral.length > 2) { score -= 25; reasons.push('יותר מדי צבעים בולטים'); }
  for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
    if (!colorsWork(colors[i], colors[j])) { score -= 15; reasons.push(`${COLOR[colors[i]]?.label} ו${COLOR[colors[j]]?.label} מתנגשים`); }
  }
  const top = items.find((i) => i.slot === 'top' || i.slot === 'dress');
  const bottom = items.find((i) => i.slot === 'bottom');
  if (top && bottom) {
    const lt = lightness(COLOR[top.color]?.hex), lb = lightness(COLOR[bottom.color]?.hex);
    if (lt != null && lb != null && Math.abs(lt - lb) > 0.25) { score += 8; reasons.push('ניגודיות טובה בין למעלה ולמטה'); }
  }
  const metals = items.filter((i) => i.color === 'gold' || i.color === 'silver').map((i) => i.color);
  if (new Set(metals).size > 1) { score -= 8; reasons.push('כדאי להתאים צבע מתכת אחד'); }
  if (items.some((i) => i.category === 'watch' || i.category === 'jewelry')) { score += 4; reasons.push('אביזר אחד משלים את הלוק'); }
  return { score: Math.max(0, Math.min(100, score)), reasons: [...new Set(reasons)] };
}

function lightness(hex) {
  if (!hex || !hex.startsWith('#')) return null;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Generate outfit suggestions from the user's wardrobe for an occasion. */
export function suggestOutfits(wardrobe, occasion, { count = 3, seed = Date.now() } = {}) {
  const fits = (i) => !i.occasions?.length || i.occasions.includes(occasion);
  const bySlot = (slot) => wardrobe.filter((i) => slotOf(i) === slot && fits(i));
  let rnd = seed % 2147483647 || 7;
  const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const tops = occasion === 'sport' ? [...bySlot('sport'), ...bySlot('top')] : bySlot('top');
  const bottoms = occasion === 'sport' ? [...bySlot('sport').filter((i) => /מכנס|שורט|טייץ/.test(i.name)), ...bySlot('bottom')] : bySlot('bottom');
  const dresses = bySlot('dress');
  const shoes = bySlot('shoes');
  const layers = bySlot('layer');
  const accs = wardrobe.filter((i) => slotOf(i) === 'acc' && fits(i));
  const results = [];
  const seen = new Set();
  for (let tries = 0; tries < 160 && results.length < count; tries++) {
    const items = [];
    const useDress = dresses.length && (!tops.length || !bottoms.length || rand() < 0.3);
    if (useDress) items.push(pick(dresses));
    else {
      if (!tops.length || !bottoms.length) break;
      items.push(pick(tops));
      const b = pick(bottoms);
      if (b && b.id !== items[0].id) items.push(b);
    }
    if (layers.length && (occasion === 'event' || rand() < 0.4)) items.push(pick(layers));
    if (shoes.length) items.push(pick(shoes));
    if (accs.length && rand() < 0.6) items.push(pick(accs));
    const key = items.map((i) => i.id).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const withSlots = items.map((i) => ({ ...i, slot: slotOf(i) }));
    const s = scoreOutfit(withSlots);
    if (s.score >= 50) results.push({ items, ...s });
  }
  return results.sort((a, b) => b.score - a.score);
}

export function slotOf(item) {
  return (CATEGORIES.find((c) => c.id === item.category) || {}).slot || 'acc';
}

export const STYLE_TIPS = {
  casual: 'בסיס של טי חלקה, ג׳ינס וסניקרס נקיות – ומשחקים עם שכבה עליונה.',
  street: 'גזרות רחבות, קפוצ׳ונים, סניקרס בולטות ופריט אחד עם הדפס.',
  classic: 'חולצות מכופתרות, צ׳ינו, נעלי עור ושעון פשוט.',
  sport: 'בדים נושמים, ג׳וגרים מחויטים וסניקרס איכותיות.',
  minimal: 'צבעים ניטרליים, קווים נקיים ומעט מאוד אביזרים.',
  elegant: 'בדים איכותיים, גזרות מחויטות וגוונים כהים.',
  vintage: 'צבעי אדמה, גזרות של פעם ופריטי יד שנייה.',
};
