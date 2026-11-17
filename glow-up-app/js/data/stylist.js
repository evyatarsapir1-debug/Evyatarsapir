// Personal stylist engine: builds complete outfits (top + bottom + shoes, optional layer/accessory)
// from a catalog of garment TYPES – works without any wardrobe and without photos.
// Rules: formality ranges must overlap, explicit "don't pair" rules, color harmony (colorsWork/scoreOutfit).
import { COLOR, COLORS, colorsWork, scoreOutfit } from './style.js';
import { LOOKS, colorName, harmonyColor, fabricHex } from './looks.js';
export { colorName, fabricHex };

// f = formality range [min,max] (1 = very casual, 4 = formal). plain = can be a plain/solid piece.
// colors = typical colors for this garment (first ones are the safest).
export const GARMENTS = [
  // tops
  { id: 'tee', label: 'טי חלקה', slot: 'top', shape: 'tee', f: [1, 2], plain: true, colors: ['white', 'black', 'grey', 'navy', 'beige', 'olive', 'burgundy', 'lightblue', 'brown'], tags: ['casual', 'minimal', 'street', 'sport'] },
  { id: 'oversized-tee', label: 'טי אוברסייז', slot: 'top', shape: 'tee', f: [1, 1], plain: true, colors: ['black', 'white', 'grey', 'beige', 'brown', 'olive'], tags: ['street', 'casual'] },
  { id: 'graphic-tee', label: 'טי עם הדפס', slot: 'top', shape: 'tee', f: [1, 1], plain: false, colors: ['multi', 'black', 'white'], tags: ['street', 'vintage'] },
  { id: 'longsleeve', label: 'טי שרוול ארוך', slot: 'top', shape: 'longsleeve', f: [1, 2], plain: true, colors: ['white', 'black', 'grey', 'navy', 'beige', 'olive'], tags: ['casual', 'minimal'] },
  { id: 'polo', label: 'פולו', slot: 'top', shape: 'polo', f: [2, 3], plain: true, colors: ['navy', 'white', 'black', 'beige', 'olive', 'burgundy'], tags: ['classic', 'elegant', 'casual'] },
  { id: 'oxford', label: 'חולצה מכופתרת (אוקספורד)', slot: 'top', shape: 'shirt', f: [2, 4], plain: true, colors: ['white', 'lightblue', 'navy', 'beige'], tags: ['classic', 'elegant'] },
  { id: 'linen-shirt', label: 'חולצת פשתן', slot: 'top', shape: 'shirt', f: [2, 3], plain: true, colors: ['white', 'beige', 'lightblue', 'olive'], tags: ['classic', 'minimal', 'vintage'] },
  { id: 'knit', label: 'סוודר סרוג דק', slot: 'top', shape: 'longsleeve', f: [2, 4], plain: true, colors: ['navy', 'grey', 'beige', 'brown', 'black', 'burgundy', 'olive'], tags: ['classic', 'elegant', 'minimal'] },
  { id: 'tank', label: 'גופייה', slot: 'top', shape: 'tank', f: [1, 1], plain: true, colors: ['white', 'black', 'grey'], tags: ['sport', 'street'] },
  { id: 'blouse', label: 'חולצה מחויטת / בלוזה', slot: 'top', shape: 'shirt', f: [2, 4], plain: true, colors: ['white', 'black', 'beige', 'pink', 'lightblue', 'burgundy'], tags: ['classic', 'elegant'], fem: true },
  // layers
  { id: 'hoodie', label: 'קפוצ׳ון (פוטר עם כובע)', slot: 'layer', shape: 'hoodie', f: [1, 2], plain: true, colors: ['grey', 'black', 'navy', 'beige', 'olive', 'brown', 'white', 'burgundy'], tags: ['street', 'casual', 'sport'] },
  { id: 'crewneck', label: 'סווטשירט (פוטר בלי כובע)', slot: 'layer', shape: 'sweat', f: [1, 2], plain: true, colors: ['grey', 'navy', 'black', 'beige', 'olive', 'white'], tags: ['casual', 'street', 'minimal'] },
  { id: 'zip-hoodie', label: 'קפוצ׳ון רוכסן', slot: 'layer', shape: 'hoodie', f: [1, 1], plain: true, colors: ['grey', 'black', 'navy'], tags: ['sport', 'street', 'casual'] },
  { id: 'overshirt', label: 'אוברשירט', slot: 'layer', shape: 'shirt', f: [1, 2], plain: true, colors: ['olive', 'beige', 'brown', 'navy', 'black', 'khaki'], tags: ['casual', 'minimal', 'vintage', 'classic'] },
  { id: 'denim-jacket', label: 'ג׳קט ג׳ינס', slot: 'layer', shape: 'jacket', f: [1, 2], plain: true, colors: ['blue', 'denim', 'lightblue', 'black'], tags: ['casual', 'vintage', 'street'] },
  { id: 'bomber', label: 'ג׳קט בומבר', slot: 'layer', shape: 'jacket', f: [1, 2], plain: true, colors: ['black', 'olive', 'navy'], tags: ['street', 'casual'] },
  { id: 'cardigan', label: 'קרדיגן', slot: 'layer', shape: 'jacket', f: [2, 3], plain: true, colors: ['beige', 'grey', 'navy', 'brown'], tags: ['classic', 'vintage', 'minimal'] },
  { id: 'blazer', label: 'בלייזר', slot: 'layer', shape: 'blazer', f: [3, 4], plain: true, colors: ['navy', 'black', 'grey', 'beige'], tags: ['elegant', 'classic'] },
  // bottoms
  { id: 'slim-jeans', label: 'ג׳ינס סלים', slot: 'bottom', shape: 'pants', f: [1, 3], plain: true, colors: ['denim', 'black', 'blue', 'grey'], tags: ['casual', 'classic', 'minimal'] },
  { id: 'straight-jeans', label: 'ג׳ינס ישר', slot: 'bottom', shape: 'pants', f: [1, 2], plain: true, colors: ['blue', 'denim', 'lightblue', 'black', 'grey'], tags: ['casual', 'vintage', 'minimal'] },
  { id: 'baggy-jeans', label: 'ג׳ינס רחב (באגי)', slot: 'bottom', shape: 'wide', f: [1, 1], plain: true, colors: ['lightblue', 'blue', 'denim', 'black'], tags: ['street'] },
  { id: 'chinos', label: 'צ׳ינו', slot: 'bottom', shape: 'pants', f: [2, 3], plain: true, colors: ['beige', 'khaki', 'navy', 'olive', 'black', 'white'], tags: ['classic', 'minimal', 'casual'] },
  { id: 'cargo', label: 'מכנסי קרגו', slot: 'bottom', shape: 'wide', f: [1, 1], plain: true, colors: ['olive', 'black', 'beige', 'khaki'], tags: ['street'] },
  { id: 'joggers', label: 'ג׳וגר מחויט', slot: 'bottom', shape: 'joggers', f: [1, 1], plain: true, colors: ['black', 'grey', 'navy', 'olive'], tags: ['sport', 'street', 'casual'] },
  { id: 'sweatpants', label: 'מכנסי טרנינג', slot: 'bottom', shape: 'joggers', f: [1, 1], plain: true, colors: ['grey', 'black', 'navy'], tags: ['sport'], sportOnly: true },
  { id: 'trousers', label: 'מכנסיים מחויטים', slot: 'bottom', shape: 'pants', f: [3, 4], plain: true, colors: ['black', 'navy', 'grey', 'beige'], tags: ['elegant', 'classic'] },
  { id: 'shorts', label: 'שורט צ׳ינו', slot: 'bottom', shape: 'shorts', f: [1, 2], plain: true, colors: ['beige', 'navy', 'olive', 'black', 'khaki'], tags: ['casual', 'minimal'] },
  { id: 'denim-shorts', label: 'שורט ג׳ינס', slot: 'bottom', shape: 'shorts', f: [1, 1], plain: true, colors: ['blue', 'lightblue', 'denim', 'black'], tags: ['casual', 'street', 'vintage'] },
  { id: 'skirt', label: 'חצאית מידי', slot: 'bottom', shape: 'skirt', f: [2, 4], plain: true, colors: ['black', 'beige', 'navy', 'olive', 'denim', 'burgundy'], tags: ['classic', 'elegant', 'minimal', 'vintage'], fem: true },
  { id: 'wide-trousers', label: 'מכנסיים רחבים מחויטים', slot: 'bottom', shape: 'wide', f: [2, 4], plain: true, colors: ['black', 'beige', 'grey', 'navy', 'white'], tags: ['elegant', 'minimal', 'classic'] },
  // shoes
  { id: 'white-sneakers', label: 'סניקרס לבנות נקיות', slot: 'shoes', shape: 'sneaker', f: [1, 3], plain: true, colors: ['white'], tags: ['casual', 'minimal', 'classic', 'street'] },
  { id: 'chunky-sneakers', label: 'סניקרס מסיביות', slot: 'shoes', shape: 'chunky', f: [1, 1], plain: true, colors: ['white', 'black', 'grey', 'beige'], tags: ['street', 'sport'] },
  { id: 'retro-runners', label: 'נעלי ריצה רטרו', slot: 'shoes', shape: 'sneaker', f: [1, 2], plain: true, colors: ['grey', 'beige', 'navy', 'white'], tags: ['casual', 'vintage', 'street'] },
  { id: 'canvas', label: 'נעלי בד נמוכות', slot: 'shoes', shape: 'sneaker', f: [1, 2], plain: true, colors: ['white', 'black', 'beige'], tags: ['casual', 'vintage', 'minimal'] },
  { id: 'high-tops', label: 'סניקרס גבוהות', slot: 'shoes', shape: 'hightop', f: [1, 1], plain: true, colors: ['black', 'white', 'multi'], tags: ['street'] },
  { id: 'running', label: 'נעלי ספורט', slot: 'shoes', shape: 'chunky', f: [1, 1], plain: true, colors: ['black', 'white', 'grey'], tags: ['sport'] },
  { id: 'loafers', label: 'מוקסינים (לואפרס)', slot: 'shoes', shape: 'loafer', f: [2, 4], plain: true, colors: ['brown', 'black'], tags: ['classic', 'elegant', 'vintage'] },
  { id: 'chelsea', label: 'מגפי צ׳לסי', slot: 'shoes', shape: 'boot', f: [2, 4], plain: true, colors: ['brown', 'black', 'beige'], tags: ['classic', 'elegant', 'minimal'] },
  { id: 'derby', label: 'נעלי דרבי', slot: 'shoes', shape: 'loafer', f: [3, 4], plain: true, colors: ['black', 'brown'], tags: ['elegant', 'classic'] },
  { id: 'slides', label: 'כפכפי סלייד', slot: 'shoes', shape: 'slide', f: [1, 1], plain: true, colors: ['black', 'white', 'beige'], tags: ['sport', 'street'] },
  // accessories
  { id: 'watch', label: 'שעון פשוט', slot: 'acc', shape: 'watch', f: [1, 4], plain: true, colors: ['silver', 'black', 'gold'], tags: ['classic', 'minimal', 'elegant', 'casual'] },
  { id: 'cap', label: 'כובע מצחייה', slot: 'acc', shape: 'cap', f: [1, 1], plain: true, colors: ['black', 'navy', 'beige', 'white'], tags: ['street', 'sport', 'casual'] },
  { id: 'chain', label: 'שרשרת דקה', slot: 'acc', shape: 'chain', f: [1, 3], plain: true, colors: ['silver', 'gold'], tags: ['street', 'casual'] },
  { id: 'belt', label: 'חגורה', slot: 'acc', shape: 'belt', f: [2, 4], plain: true, colors: ['brown', 'black'], tags: ['classic', 'elegant'] },
  { id: 'beanie', label: 'כובע גרב', slot: 'acc', shape: 'cap', f: [1, 1], plain: true, colors: ['black', 'grey', 'beige', 'olive'], tags: ['street', 'casual'] },
];
export const G = Object.fromEntries(GARMENTS.map((g) => [g.id, g]));

// Explicit "don't" rules on top of the formality check. [a, b, why]
const NOPE = [
  ['hoodie', 'trousers', 'קפוצ׳ון עם מכנסיים מחויטים נראה כמו שתי תלבושות שונות'],
  ['hoodie', 'derby', 'נעלי עור רשמיות לא הולכות עם קפוצ׳ון'],
  ['hoodie', 'loafers', 'מוקסינים קלאסיים מתנגשים עם קפוצ׳ון ספורטיבי'],
  ['hoodie', 'polo', 'פולו מתחת לקפוצ׳ון – הצווארון נמעך ולא רואים אותו'],
  ['hoodie', 'knit', 'סוודר מתחת לקפוצ׳ון – שתי שכבות כבדות, חם ומנופח'],
  ['hoodie', 'linen-shirt', 'פשתן קיצי עם קפוצ׳ון חורפי – לא באותה עונה'],
  ['hoodie', 'wide-trousers', 'מכנס מחויט רחב עם קפוצ׳ון – שני סגנונות שונים'],
  ['hoodie', 'chelsea', 'מגפי צ׳לסי מחויטים עם קפוצ׳ון – עדיף סניקרס'],
  ['hoodie', 'blazer', 'קפוצ׳ון מתחת לבלייזר – רק למתקדמים, בדרך כלל נראה מבולגן'],
  ['zip-hoodie', 'derby', 'נעלי עור רשמיות לא הולכות עם קפוצ׳ון'],
  ['crewneck', 'derby', 'סווטשירט עם נעלי עור רשמיות – פער גדול מדי'],
  ['sweatpants', 'loafers', 'טרנינג עם מוקסינים – שני עולמות שונים'],
  ['sweatpants', 'chelsea', 'טרנינג עם מגפיים לא עובד'],
  ['sweatpants', 'derby', 'טרנינג עם נעלי עור לא עובד'],
  ['sweatpants', 'oxford', 'חולצה מכופתרת עם טרנינג נראה לא מתוכנן'],
  ['sweatpants', 'blazer', 'בלייזר עם טרנינג – לא'],
  ['shorts', 'chelsea', 'מגפיים עם שורט נראים כבדים מדי'],
  ['denim-shorts', 'chelsea', 'מגפיים עם שורט נראים כבדים מדי'],
  ['shorts', 'derby', 'נעלי עור רשמיות לא הולכות עם שורט'],
  ['shorts', 'blazer', 'בלייזר עם שורט – רק בלוקים מאוד מתקדמים'],
  ['denim-jacket', 'straight-jeans', 'ג׳ינס על ג׳ינס באותו גוון נראה כמו סט – אם כבר, גוונים שונים מאוד'],
  ['denim-jacket', 'slim-jeans', 'ג׳ינס על ג׳ינס באותו גוון – עדיף מכנס בצבע אחר'],
  ['denim-jacket', 'baggy-jeans', 'ג׳ינס על ג׳ינס – עדיף מכנס בצבע אחר'],
  ['tank', 'trousers', 'גופייה עם מכנסיים מחויטים לא מתאים'],
  ['tank', 'blazer', 'גופייה מתחת לבלייזר – לא ללוק רגיל'],
  ['baggy-jeans', 'derby', 'ג׳ינס רחב עם נעלי עור רשמיות – לא מתחבר'],
  ['cargo', 'derby', 'קרגו עם נעלי עור רשמיות – לא מתחבר'],
  ['cargo', 'loafers', 'קרגו עם מוקסינים – שני סגנונות שונים'],
  ['slides', 'chinos', 'סלייד עם צ׳ינו נראה מרושל'],
  ['slides', 'slim-jeans', 'סלייד עם ג׳ינס – רק לבית'],
  ['slides', 'straight-jeans', 'סלייד עם ג׳ינס – רק לבית'],
  ['slides', 'trousers', 'סלייד עם מכנסיים מחויטים – לא'],
  ['graphic-tee', 'trousers', 'טי עם הדפס גדול לא מתאים למכנס מחויט'],
  ['running', 'trousers', 'נעלי ספורט עם מכנסיים מחויטים'],
  ['running', 'chinos', 'נעלי ריצה טכניות עם צ׳ינו – עדיף סניקרס נקיות'],
];
const NOPE_MAP = new Map();
for (const [a, b, why] of NOPE) { NOPE_MAP.set(a + '|' + b, why); NOPE_MAP.set(b + '|' + a, why); }

export const OCC_F = { school: [1, 2], daily: [1, 2], out: [1, 3], event: [3, 4], sport: [1, 1], date: [2, 3] };
export const OCC_LABEL = { school: 'בית ספר', daily: 'יומיום', out: 'יציאה', date: 'דייט', event: 'אירוע', sport: 'ספורט' };

export const short = (label) => label.replace(/\s*\(.*\)\s*/, '');
const overlap = (a, b) => a[0] <= b[1] && b[0] <= a[1];

/** Why two garments should not be worn together ('' = they're fine). */
export function pairProblem(a, b) {
  if (!a || !b || a.id === b.id) return '';
  const nope = NOPE_MAP.get(a.id + '|' + b.id);
  if (nope) return nope;
  const A = short(a.label), B = short(b.label);
  if (!overlap(a.f, b.f)) return a.f[0] > b.f[1] ? `${A} – רשמי מדי ליד ${B}` : `${A} – ספורטיבי מדי ליד ${B}`;
  return '';
}

// ---- free-text understanding (Hebrew) ----
const WORDS = [
  [/פוטר רוכסן|קפוצ.ון רוכסן|קפוצ.ון עם רוכסן|רוכסן/, 'zip-hoodie'], [/קפוצ|הודי|hoodie/i, 'hoodie'], [/סווטשירט|פוטר בלי כובע|קרו ?נק/, 'crewneck'], [/פוטר/, 'hoodie'],
  [/אוברסייז|oversize/i, 'oversized-tee'], [/הדפס|גרפי|לוגו/, 'graphic-tee'], [/שרוול ארוך/, 'longsleeve'], [/פולו/, 'polo'],
  [/פשתן/, 'linen-shirt'], [/מכופתר|אוקספורד|חולצה מכופתרת|כפתורים/, 'oxford'], [/סוודר|סריג/, 'knit'], [/גופי/, 'tank'], [/בלוזה/, 'blouse'],
  [/(?:^|[\s,.])(?:טי|טישירט|טי-שירט)(?=[\s,.?!]|$)|t-?shirt/i, 'tee'], [/חולצה|חולצות/, 'tee'],
  [/אוברשירט|overshirt/i, 'overshirt'], [/ג.קט ג.ינס|ג׳קט ג׳ינס/, 'denim-jacket'], [/בומבר/, 'bomber'], [/קרדיגן/, 'cardigan'], [/בלייזר|ז.קט מחויט|חליפה/, 'blazer'], [/ג.קט|מעיל/, 'bomber'],
  [/באגי|ג.ינס רחב/, 'baggy-jeans'], [/שורט ג.ינס/, 'denim-shorts'], [/ג.ינס ישר/, 'straight-jeans'], [/ג.ינס/, 'slim-jeans'], [/צ.ינו/, 'chinos'], [/קרגו/, 'cargo'],
  [/ג.וגר/, 'joggers'], [/טרנינג/, 'sweatpants'], [/מחויט|מכנסי בד|מכנס בד/, 'trousers'], [/שורט|מכנס קצר|מכנסיים קצרים/, 'shorts'], [/חצאית/, 'skirt'],
  [/לבנות|סניקרס לבנ/, 'white-sneakers'], [/מסיבי|צ.אנקי/, 'chunky-sneakers'], [/גבוהות|הייטופ/, 'high-tops'], [/מוקסינ|לואפר/, 'loafers'], [/צ.לסי|מגפ/, 'chelsea'],
  [/נעלי עור|דרבי|נעליים אלגנטיות/, 'derby'], [/סלייד|כפכפ/, 'slides'], [/נעלי ריצה|נעלי ספורט/, 'running'], [/סניקרס|נעלי בד/, 'white-sneakers'],
  [/שעון/, 'watch'], [/כובע מצחי|קסקט/, 'cap'], [/שרשר/, 'chain'], [/חגור/, 'belt'], [/כובע גרב/, 'beanie'],
];
const COLOR_WORDS = [
  [/שחור|שחורה|שחורים|שחורות/, 'black'], [/לבן|לבנה|לבנים|לבנות/, 'white'], [/אפור|אפורה|אפורים|אפורות/, 'grey'], [/נייבי|כחול כהה/, 'navy'],
  [/בז׳|בז'|בז(?=[\s,.?!]|$)|קרם/, 'beige'], [/חום|חומה|חומים|חומות/, 'brown'], [/זית/, 'olive'], [/חאקי/, 'khaki'], [/תכלת/, 'lightblue'], [/כחול|כחולה|כחולים/, 'blue'],
  [/ירוק|ירוקה|ירוקים/, 'green'], [/בורדו/, 'burgundy'], [/אדום|אדומה|אדומים/, 'red'], [/ורוד|ורודה|ורודים/, 'pink'], [/סגול|סגולה|סגולים/, 'purple'],
  [/צהוב|צהובה/, 'yellow'], [/כתום|כתומה/, 'orange'],
];
const OCC_WORDS = [[/בית ספר|לבית הספר|בי.ס|כיתה/, 'school'], [/דייט|דייט/, 'date'], [/חתונה|בר מצווה|בת מצווה|אירוע|ערב חג|טקס|רשמי/, 'event'], [/מסיבה|יציאה|לצאת|מועדון|בערב|(?:^|\s)בר(?=[\s,.?!]|$)/, 'out'], [/ספורט|חדר כושר|אימון|ג.ים/, 'sport'], [/יומיום|יום יום|רגיל|קניון|חברים/, 'daily']];
const STYLE_WORDS = [[/סטריט|street|רחוב/i, 'street'], [/קלאסי/, 'classic'], [/מינימל|נקי|פשוט/, 'minimal'], [/אלגנט|מהודר|מחויט/, 'elegant'], [/ספורטיבי/, 'sport'], [/וינטג|רטרו/, 'vintage'], [/קז.ואל|נינוח/, 'casual']];

/** Turn a Hebrew request into stylist constraints. */
export function parseRequest(text = '') {
  const t = ' ' + text.replace(/["'`]/g, (c) => (c === "'" ? '׳' : '')) + ' ';
  const out = { plain: /חלק|חלקות|חלקה|בלי הדפס|ללא הדפס|בלי לוגו|פשוטות/.test(t), anchor: null, anchorColor: null, occasion: null, style: null, avoidQuestion: /מה לא|לא יתאים|לא מתאים|לא הולך|להימנע|אסור/.test(t), wardrobe: /מהארון|מה שיש לי|הבגדים שלי|מהבגדים שלי/.test(t), mentions: [] };
  // find every garment mentioned (with its position) – the first is the anchor
  const found = [];
  for (const [re, id] of WORDS) {
    const m = t.match(re);
    if (m && !found.some((f) => f.id === id || (m.index >= f.at && m.index < f.at + f.len))) found.push({ id, at: m.index, len: m[0].length, generic: /^חולצ/.test(m[0]) });
  }
  // a generic "חולצה" next to a specific top ("חולצה מכופתרת", "חולצת פולו") is that top
  for (let i = found.length - 1; i >= 0; i--) if (found[i].generic && found.some((f) => f !== found[i] && ['top', 'layer'].includes(G[f.id].slot))) found.splice(i, 1);
  found.sort((a, b) => a.at - b.at);
  // "plain shirts only" – a generic "חולצות" there is a constraint, not an anchor
  const real = found;
  out.mentions = real.map((f) => f.id);
  if (real.length) {
    const first = real[0];
    out.anchor = out.plain && first.id === 'tee' && first.generic ? null : first.id;
    // a color word right after the anchor (within ~14 chars) belongs to it
    const after = t.slice(first.at, first.at + first.len + 16);
    for (const [re, c] of COLOR_WORDS) if (re.test(after)) { out.anchorColor = c; break; }
  }
  if (!out.anchorColor && out.anchor) for (const [re, c] of COLOR_WORDS) if (re.test(t)) { out.anchorColor = c; break; }
  for (const [re, o] of OCC_WORDS) if (re.test(t)) { out.occasion = o; break; }
  for (const [re, s] of STYLE_WORDS) if (re.test(t)) { out.style = s; break; }
  if (out.anchorColor && out.anchor && !G[out.anchor].colors.includes(out.anchorColor) && G[out.anchor].slot === 'shoes' && !['white', 'black', 'brown'].includes(out.anchorColor)) out.anchorColor = null;
  return out;
}

// ---- outfit builder ----
function rng(seed) { let r = (Math.abs(seed) % 2147483647) || 7; return () => (r = (r * 16807) % 2147483647) / 2147483647; }

/**
 * Build outfits from garment types.
 * opts: { occasion, style, plain, anchor, anchorColor, fem, prefer:[colorIds], count, seed, owned:[garmentIds] }
 */
function generateOutfits(opts = {}) {
  const occ = opts.occasion || 'daily';
  const occF = OCC_F[occ] || [1, 2];
  const rand = rng(opts.seed || 1);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const anchor = opts.anchor ? G[opts.anchor] : null;
  const okFor = (g) => {
    if (g.fem && !opts.fem && anchor?.id !== g.id) return false;
    if (opts.plain && (g.slot === 'top' || g.slot === 'layer') && !g.plain) return false;
    if (anchor && g.slot !== anchor.slot && pairProblem(g, anchor)) return false;
    if (!overlap(g.f, anchor ? [Math.min(anchor.f[0], occF[1]), Math.max(anchor.f[1], occF[0])] : occF)) return false;
    if (occ === 'sport' && g.slot !== 'acc' && !g.tags.includes('sport')) return false;
    if (anchor?.id !== g.id && g.sportOnly && occ !== 'sport') return false;
    if (anchor?.id !== g.id && ['tank', 'slides'].includes(g.id) && !['sport', 'daily'].includes(occ)) return false;
    if (anchor?.id !== g.id && g.shape === 'shorts' && ['event', 'date'].includes(occ)) return false;
    return true;
  };
  const mid = (occF[0] + occF[1]) / 2;
  const styleBoost = (g) => (opts.style && g.tags.includes(opts.style) ? 3 : 0) + (opts.owned?.includes(g.id) ? 2 : 0) + (g.f[0] <= mid && mid <= g.f[1] ? 2 : 0) + (occ === 'event' && g.f[1] >= 4 ? 3 : 0) + 1;
  const weighted = (arr) => {
    const bag = [];
    arr.forEach((g) => { for (let i = 0; i < styleBoost(g); i++) bag.push(g); });
    return pick(bag);
  };
  const pool = (slot) => GARMENTS.filter((g) => g.slot === slot && okFor(g));
  const colorFor = (g, used) => {
    let cs = g.colors.filter((c) => !(opts.plain && c === 'multi'));
    const pref = (opts.prefer || []).filter((c) => cs.includes(c));
    if (pref.length && rand() < 0.6) cs = pref;
    const good = cs.filter((c) => used.every((u) => colorsWork(c, u)));
    const list = good.length ? good : cs;
    return list[Math.floor(rand() * Math.min(list.length, 5))];
  };
  const results = [];
  const seen = new Set();
  for (let tries = 0; tries < 220 && results.length < (opts.count || 3); tries++) {
    const pieces = [];
    const has = (slot) => pieces.find((p) => p.g.slot === slot);
    const add = (g, color) => { if (!g || has(g.slot) || pieces.some((p) => pairProblem(p.g, g))) return false; pieces.push({ g, color: color || colorFor(g, pieces.map((p) => p.color)) }); return true; };
    if (anchor) add(anchor, opts.anchorColor && (anchor.colors.includes(opts.anchorColor) || anchor.slot !== 'shoes') ? opts.anchorColor : null);
    // a hoodie/crewneck usually goes over a tee – but it is also the "top" visually
    const needLayer = !anchor || anchor.slot !== 'layer';
    if (!has('top')) {
      const tops = pool('top');
      if (anchor?.slot === 'layer' && ['hoodie', 'crewneck', 'zip-hoodie'].includes(anchor.id)) add(pick(tops.filter((g) => ['tee', 'oversized-tee', 'longsleeve'].includes(g.id))) || pick(tops));
      else add(weighted(tops));
    }
    if (!has('bottom')) add(weighted(pool('bottom')));
    if (!has('shoes')) add(weighted(pool('shoes')));
    if (needLayer && !has('layer') && (occ === 'event' ? true : rand() < 0.45)) add(weighted(pool('layer')));
    if (!has('acc') && rand() < 0.55) add(weighted(pool('acc')));
    if (!has('top') || !has('bottom') || !has('shoes')) continue;
    // under a closed hoodie/sweatshirt: a plain white/black/grey tee
    const lay = has('layer'), tp = has('top');
    if (lay && ['hoodie', 'crewneck', 'zip-hoodie'].includes(lay.g.id) && tp) tp.color = ['white', 'black', 'grey'].find((c) => c !== lay.color && colorsWork(c, lay.color)) || 'white';
    // belt: same leather as the shoes, or no belt
    const belt = has('acc')?.g.id === 'belt' ? has('acc') : null;
    const sh = has('shoes');
    if (belt) { if (LEATHER_SHOES.has(sh.g.id)) belt.color = sh.color; else pieces.splice(pieces.indexOf(belt), 1); }
    if (!strictOk(pieces)) continue;
    const key = pieces.map((p) => p.g.id + ':' + p.color).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const sc = scoreOutfit(pieces.map((p) => ({ color: p.color, slot: p.g.slot === 'layer' ? 'layer' : p.g.slot, category: p.g.slot === 'acc' ? (p.g.id === 'watch' ? 'watch' : 'acc') : p.g.slot })));
    if (sc.score < 55) continue;
    // keep a stable reading order: layer, top, bottom, shoes, acc
    const order = { layer: 0, top: 1, bottom: 2, shoes: 3, acc: 4 };
    pieces.sort((a, b) => order[a.g.slot] - order[b.g.slot]);
    results.push({ pieces: pieces.map((p) => ({ id: p.g.id, label: p.g.label, slot: p.g.slot, color: p.color })), score: sc.score, why: whyOf(pieces, occ, sc) });
  }
  return results.sort((a, b) => b.score - a.score);
}

const LEATHER_SHOES = new Set(['loafers', 'derby', 'chelsea']);
const CLOSED = new Set(['hoodie', 'crewneck']);

/** Strict "does this really go together" check (pieces: [{g, color}]). */
export function strictOk(pieces) {
  const main = pieces.filter((p) => p.g.slot !== 'acc');
  const hc = main.map((p) => harmonyColor(p.g.id, p.color));
  const accents = new Set(hc.filter((c) => c === 'multi' || (COLOR[c] && !COLOR[c].neutral)));
  if (accents.size > 1) return false;
  for (let i = 0; i < hc.length; i++) for (let j = i + 1; j < hc.length; j++) if (!colorsWork(hc[i], hc[j])) return false;
  const by = (slot) => pieces.find((p) => p.g.slot === slot);
  const top = by('top'), layer = by('layer'), bottom = by('bottom'), shoes = by('shoes'), belt = pieces.find((p) => p.g.id === 'belt');
  if (layer && top && layer.color === top.color) return false; // layering needs contrast
  const visible = layer && CLOSED.has(layer.g.id) ? layer : top;
  if (visible && bottom && visible.color === bottom.color && visible.color !== 'black') return false;
  if (belt && shoes && LEATHER_SHOES.has(shoes.g.id) && belt.color !== shoes.color) return false;
  if (shoes && bottom && LEATHER_SHOES.has(shoes.g.id) && shoes.color === 'brown' && bottom.color === 'black') return false;
  if (shoes?.g.id === 'chelsea' && shoes.color === 'beige' && bottom?.color === 'beige') return false;
  const multi = pieces.filter((p) => p.color === 'multi').length;
  return multi <= 1;
}

/** "ג׳ינס סלים בצבע כחול כהה (שטיפה כהה)" */
export const pieceName = (p) => {
  const cn = colorName(p.id, p.color);
  return /^(עור|זמש) /.test(cn) ? `${short(p.label)} מ${cn}` : `${short(p.label)} בצבע ${cn}`;
};

function curatedOutfits(opts, rand) {
  const occ = opts.occasion || 'daily';
  const anchor = opts.anchor ? G[opts.anchor] : null;
  const toP = (ps) => ps.map(([g, color]) => ({ g: G[g], color }));
  let list = LOOKS.filter((l) => l.occ.includes(occ) && (!l.fem || opts.fem) && l.pieces.every(([g]) => G[g] && (!G[g].fem || opts.fem)));
  if (opts.plain) list = list.filter((l) => l.pieces.every(([g, c]) => !['top', 'layer'].includes(G[g].slot) || (G[g].plain && c !== 'multi')));
  if (anchor) {
    list = list.filter((l) => l.pieces.some(([g]) => g === anchor.id))
      .map((l) => ({ ...l, recolored: !!(opts.anchorColor && l.pieces.some(([g, c]) => g === anchor.id && c !== opts.anchorColor)), pieces: l.pieces.map(([g, c]) => [g, g === anchor.id && opts.anchorColor ? opts.anchorColor : c]) }))
      .filter((l) => strictOk(toP(l.pieces)));
  }
  const pref = opts.prefer || [];
  const scored = list.map((l) => ({ l, sc: (opts.style && l.st.includes(opts.style) ? 3 : 0) + l.pieces.filter(([g]) => opts.owned?.includes(g)).length * 0.6 + l.pieces.filter(([, c]) => pref.includes(c)).length + rand() * 2.5 }));
  scored.sort((a, b) => b.sc - a.sc);
  const order = { layer: 0, top: 1, bottom: 2, shoes: 3, acc: 4 };
  return scored.map(({ l }) => {
    const pieces = l.pieces.map(([g, color]) => ({ id: g, label: G[g].label, slot: G[g].slot, color })).sort((a, b) => order[a.slot] - order[b.slot]);
    if (!l.recolored) return { name: l.name, curated: true, score: 92, pieces, why: [l.why, `מתאים ל${OCC_LABEL[occ] || 'יומיום'}`] };
    // the proven formula with the user's color – new name and reasons (the original text names other colors)
    const other = pieces.find((p) => p.slot === (anchor.slot === 'bottom' ? 'top' : 'bottom'));
    const gp = l.pieces.map(([g, color]) => ({ g: G[g], color }));
    return { name: `${short(anchor.label)} ${colorName(anchor.id, opts.anchorColor)} עם ${other ? short(other.label) : ''}`.trim(), curated: true, score: 90, pieces, why: whyOf(gp, occ, scoreOutfit(gp.map((p) => ({ color: p.color, slot: p.g.slot, category: p.g.slot })))) };
  });
}

/**
 * Outfits: proven looks first (exact colors), then generated ones that pass the strict check.
 * opts: { occasion, style, plain, anchor, anchorColor, fem, prefer:[colorIds], count, seed, owned:[garmentIds] }
 */
export function buildOutfits(opts = {}) {
  const count = opts.count || 3;
  const rand = rng((opts.seed || 1) * 13 + 5);
  const cur = curatedOutfits(opts, rand);
  // rotate through the proven looks as the seed changes ("עוד לוקים")
  const start = cur.length ? ((opts.seed || 1) * 3) % cur.length : 0;
  const rotated = cur.slice(start).concat(cur.slice(0, start));
  const out = rotated.slice(0, Math.min(count, cur.length >= count ? count : cur.length));
  const keys = new Set(out.map((o) => o.pieces.map((p) => p.id + ':' + p.color).sort().join(',')));
  if (out.length < count) {
    for (const o of generateOutfits({ ...opts, count: count * 3 })) {
      const key = o.pieces.map((p) => p.id + ':' + p.color).sort().join(',');
      if (keys.has(key)) continue;
      keys.add(key);
      out.push({ ...o, name: '' });
      if (out.length >= count) break;
    }
  }
  return out;
}

function whyOf(pieces, occ, sc) {
  const out = [];
  const nonNeutral = pieces.filter((p) => p.g.slot !== 'acc' && COLOR[harmonyColor(p.g.id, p.color)] && !COLOR[harmonyColor(p.g.id, p.color)].neutral);
  if (!nonNeutral.length) out.push('כל הצבעים ניטרליים – נקי ותמיד עובד');
  else if (nonNeutral.length === 1) out.push(`צבע אחד בולט (${colorName(nonNeutral[0].g.id, nonNeutral[0].color)}) והשאר ניטרלי – ככה עושים את זה נכון`);
  const top = pieces.find((p) => p.g.slot === 'layer') || pieces.find((p) => p.g.slot === 'top');
  const bottom = pieces.find((p) => p.g.slot === 'bottom');
  if (top && bottom && top.color !== bottom.color && sc.reasons.some((r) => r.includes('ניגודיות'))) out.push('ניגודיות בין למעלה ולמטה – הגוף נראה מאוזן');
  if (top && bottom && top.color === bottom.color) out.push('מונוכרום (אותו צבע למעלה ולמטה) – נראה גבוה ומתוכנן');
  const shoes = pieces.find((p) => p.g.slot === 'shoes');
  if (shoes) out.push(`${shoes.g.label} – ${shoes.g.f[1] >= 3 ? 'מרימות את הלוק' : 'מתאימות לרמת הקז׳ואל של הלוק'}`);
  out.push(`מתאים ל${OCC_LABEL[occ] || 'יומיום'}`);
  return out.slice(0, 3);
}

/** For one garment (+color): what pairs well, what to avoid, which colors work. */
export function matchFor(anchorId, anchorColor, { fem = false } = {}) {
  const a = G[anchorId];
  if (!a) return null;
  const slots = ['top', 'layer', 'bottom', 'shoes'].filter((s) => s !== a.slot && !(a.slot === 'layer' && s === 'top' && false));
  const good = {}, bad = [];
  for (const s of slots) {
    good[s] = [];
    for (const g of GARMENTS.filter((x) => x.slot === s && (!x.fem || fem))) {
      const p = pairProblem(a, g);
      if (p) bad.push({ id: g.id, label: g.label, why: p });
      else {
        const cols = g.colors.filter((c) => !anchorColor || colorsWork(c, anchorColor)).filter((c) => c !== 'multi').slice(0, 4);
        good[s].push({ id: g.id, label: g.label, colors: cols });
      }
    }
  }
  const colorsGood = anchorColor ? COLORS.filter((c) => c.id !== anchorColor && c.id !== 'multi' && !['gold', 'silver'].includes(c.id) && colorsWork(c.id, anchorColor)).map((c) => c.id) : [];
  const colorsBad = anchorColor ? COLORS.filter((c) => c.id !== anchorColor && c.id !== 'multi' && !['gold', 'silver'].includes(c.id) && !colorsWork(c.id, anchorColor)).map((c) => c.id) : [];
  return { anchor: a, color: anchorColor, good, bad: dedupeBad(bad), colorsGood, colorsBad, tip: ANCHOR_TIP[a.id] || '' };
}
function dedupeBad(bad) { const seen = new Set(); return bad.filter((b) => (seen.has(b.id) ? false : seen.add(b.id))).slice(0, 8); }

const ANCHOR_TIP = {
  hoodie: 'קפוצ׳ון הכי טוב עם ג׳ינס ישר/סלים כהה או ג׳וגר מחויט, סניקרס נקיות, וטי חלקה מתחת שמציצה קצת בשוליים. מידה: הכתפיים לא נופלות יותר מ-3 ס״מ, האורך עד החגורה.',
  crewneck: 'סווטשירט חלק הוא החבר הכי טוב של צ׳ינו וג׳ינס. טריק: צווארון של חולצה מכופתרת שמציץ מעל – לוק "חכם" בלי מאמץ.',
  'zip-hoodie': 'קפוצ׳ון רוכסן פתוח מעל טי חלקה בצבע מנוגד, עם ג׳וגר או ג׳ינס ישר.',
  tee: 'טי חלקה עובדת כמעט עם הכל. הסוד הוא המידה: תפר הכתף על הכתף, שרוול שמגיע לאמצע הזרוע, אורך עד אמצע הרוכסן.',
  'oversized-tee': 'טי אוברסייז צריך מכנס רחב או ישר – לא סקיני. כך הפרופורציות נשמרות.',
  oxford: 'מכופתרת: מכופתרת עד הסוף עם צ׳ינו, או פתוחה מעל טי חלקה עם ג׳ינס. שרוולים מקופלים פעמיים לקז׳ואל.',
  blazer: 'בלייזר עם טי לבנה חלקה + ג׳ינס כהה + סניקרס לבנות = לוק יציאה מושלם. עם מכנס מחויט ונעלי עור = אירוע.',
  'slim-jeans': 'ג׳ינס כהה הוא הבסיס הכי גמיש – הולך מקפוצ׳ון ועד בלייזר.',
  'baggy-jeans': 'ג׳ינס רחב צריך למעלה משהו עם נפח או טי אוברסייז, ונעליים מסיביות שלא "נבלעות" במכנס.',
  joggers: 'ג׳וגר מחויט (לא טרנינג ישן) עם טי חלקה וסניקרס נקיות – נוח ועדיין נראה טוב.',
  'white-sneakers': 'סניקרס לבנות הן הנעליים הכי גמישות שיש. לנקות אותן – זה כל ההבדל.',
};

export const SLOT_LABEL = { top: 'חולצה', layer: 'שכבה עליונה', bottom: 'מכנסיים', shoes: 'נעליים', acc: 'אביזר' };

/** Map a wardrobe item (name/category) to a garment type. */
export function garmentOfItem(item) {
  const p = parseRequest(item.name || '');
  const cand = p.mentions.map((id) => G[id]).find((g) => g && (g.slot === item.category || (item.category === 'layer' && g.slot === 'layer') || (item.category === 'top' && g.slot === 'top') || (['watch', 'jewelry', 'acc'].includes(item.category) && g.slot === 'acc')));
  if (cand) return cand.id;
  return { top: 'tee', layer: 'overshirt', bottom: 'slim-jeans', shoes: 'white-sneakers', watch: 'watch', jewelry: 'chain', acc: 'cap', sport: 'joggers', dress: null }[item.category] || null;
}

// ---- garment illustrations (simple flat silhouettes, colored) ----
const SHAPES = {
  tee: 'M30 18 L42 12 Q50 18 58 12 L70 18 L84 32 L74 42 L68 37 L68 88 L32 88 L32 37 L26 42 L16 32 Z',
  longsleeve: 'M30 18 L42 12 Q50 18 58 12 L70 18 L82 70 L72 72 L68 40 L68 88 L32 88 L32 40 L28 72 L18 70 Z',
  polo: 'M30 18 L42 12 L50 24 L58 12 L70 18 L84 32 L74 42 L68 37 L68 88 L32 88 L32 37 L26 42 L16 32 Z M46 18 L50 34 L54 18',
  shirt: 'M30 18 L42 12 L50 22 L58 12 L70 18 L82 72 L72 74 L68 42 L68 90 L32 90 L32 42 L28 74 L18 72 Z M50 22 L50 90',
  tank: 'M36 12 Q40 30 50 30 Q60 30 64 12 L70 14 L68 34 L68 88 L32 88 L32 34 L30 14 Z',
  hoodie: 'M30 22 Q32 6 50 6 Q68 6 70 22 L84 70 L72 72 L68 44 L68 88 L32 88 L32 44 L28 72 L16 70 Z M40 62 L60 62 L58 76 L42 76 Z M42 22 Q50 30 58 22',
  sweat: 'M30 18 Q50 26 70 18 L84 70 L72 72 L68 44 L68 88 L32 88 L32 44 L28 72 L16 70 Z M32 82 L68 82',
  jacket: 'M30 16 L44 12 L50 20 L56 12 L70 16 L84 72 L72 74 L68 44 L68 90 L32 90 L32 44 L28 74 L16 72 Z M50 20 L50 90 M36 50 L46 50 M54 50 L64 50',
  blazer: 'M30 16 L44 12 L50 46 L56 12 L70 16 L84 72 L72 74 L68 44 L68 90 L32 90 L32 44 L28 74 L16 72 Z M44 12 L40 34 L50 46 M56 12 L60 34 L50 46',
  pants: 'M32 10 L68 10 L70 90 L56 90 L50 34 L44 90 L30 90 Z',
  wide: 'M34 10 L66 10 L76 90 L54 90 L50 36 L46 90 L24 90 Z',
  joggers: 'M32 10 L68 10 L66 82 L56 82 L50 34 L44 82 L34 82 Z M34 82 L44 82 L44 90 L34 90 Z M56 82 L66 82 L66 90 L56 90 Z',
  shorts: 'M30 24 L70 24 L74 64 L54 64 L50 44 L46 64 L26 64 Z',
  skirt: 'M36 14 L64 14 L76 86 L24 86 Z',
  sneaker: 'M14 64 Q16 48 30 48 L46 50 Q56 56 70 58 Q86 60 86 70 L86 76 L14 76 Z M14 76 L86 76 L86 80 L14 80 Z',
  chunky: 'M14 60 Q16 44 30 44 L46 46 Q56 52 70 54 Q86 56 86 66 L86 72 L14 72 Z M12 72 L88 72 L88 82 L12 82 Z',
  hightop: 'M18 26 L42 26 L46 52 Q60 56 74 58 Q88 60 88 70 L88 78 L14 78 Z M14 78 L88 78 L88 82 L14 82 Z',
  loafer: 'M12 66 Q14 54 30 54 L52 56 Q72 58 84 64 Q90 68 88 74 L12 74 Z M40 56 L58 58',
  boot: 'M24 18 L48 18 L50 52 Q66 56 80 60 Q90 64 88 74 L20 74 Z M14 74 L88 74 L88 80 L14 80 Z',
  slide: 'M14 70 L88 70 L88 78 L14 78 Z M30 70 Q50 44 72 70 Z',
  watch: 'M40 10 L60 10 L60 34 L40 34 Z M40 66 L60 66 L60 90 L40 90 Z M50 32 A18 18 0 1 0 50.01 32 Z',
  cap: 'M20 62 Q20 26 50 26 Q80 26 80 62 Z M50 62 L92 62 Q90 72 72 72 L50 72 Z',
  chain: 'M28 20 Q50 80 72 20 M28 20 Q50 70 72 20',
  belt: 'M10 42 L90 42 L90 58 L10 58 Z M40 38 L58 38 L58 62 L40 62 Z',
};
const SHAPE_OF = Object.fromEntries(GARMENTS.map((g) => [g.id, g.shape]));
/** SVG markup for a garment type in a color. */
export function garmentSVG(id, colorId, size = 64) {
  const shape = SHAPES[SHAPE_OF[id] || id] || SHAPES.tee;
  const fill = colorId === 'multi' || !COLOR[colorId] ? 'url(#gmulti)' : fabricHex(id, colorId);
  const isLine = SHAPE_OF[id] === 'chain';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="gmulti" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f472b6"/><stop offset=".5" stop-color="#fbbf24"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><path d="${shape}" fill="${isLine ? 'none' : fill}" stroke="${isLine ? fill : 'rgba(127,127,140,.85)'}" stroke-width="${isLine ? 4 : 2}" stroke-linejoin="round" fill-rule="evenodd"/></svg>`;
}

/** Garment list for prompts. */
export const catalogText = () => GARMENTS.map((g) => `${g.id}=${g.label}`).join('; ');
