// Curated looks: proven outfit formulas with exact colors (what stylists actually put together),
// plus exact color naming ("ג׳ינס בצבע כחול כהה") and fabric shades for realistic drawing.
// No imports on purpose (stylist.js imports this file).

export const DENIM_IDS = new Set(['slim-jeans', 'straight-jeans', 'baggy-jeans', 'denim-shorts', 'denim-jacket']);

// how a color id reads/looks on denim
const DENIM_SHADE = {
  denim: { label: 'כחול כהה (שטיפה כהה)', hex: '#22324f' },
  blue: { label: 'כחול בינוני (שטיפה קלאסית)', hex: '#4b6c97' },
  lightblue: { label: 'כחול בהיר (שטיפה בהירה)', hex: '#8eaccc' },
  black: { label: 'שחור דהוי', hex: '#26272b' },
  grey: { label: 'אפור שטוף', hex: '#7c7f86' },
  white: { label: 'לבן', hex: '#ecebe6' },
};
// realistic fabric tones (a bit softer than the UI swatches)
const FABRIC = {
  black: '#1d1e21', white: '#f1f0ec', grey: '#9a9ca1', navy: '#1f2b45', beige: '#d6c3a3', brown: '#6a4a33', denim: '#2b4266',
  olive: '#5f6440', khaki: '#b3a477', blue: '#2f5fb8', lightblue: '#a9c7e6', green: '#2f7a4c', red: '#b23136', burgundy: '#5e1d2a',
  pink: '#e8a9bf', purple: '#6b3fc9', yellow: '#e7c14e', orange: '#d9772f', silver: '#c3c6cc', gold: '#cfa63c', multi: '#888',
};
export const COLOR_NAME = {
  black: 'שחור', white: 'לבן', grey: 'אפור', navy: 'כחול נייבי', beige: 'בז׳', brown: 'חום', denim: 'כחול ג׳ינס', olive: 'ירוק זית', khaki: 'חאקי',
  blue: 'כחול', lightblue: 'תכלת', green: 'ירוק', red: 'אדום', burgundy: 'בורדו', pink: 'ורוד', purple: 'סגול', yellow: 'צהוב', orange: 'כתום',
  silver: 'כסוף', gold: 'זהב', multi: 'צבעוני / עם הדפס',
};
const LEATHER = { brown: 'עור חום', black: 'עור שחור', beige: 'זמש בז׳' };
const LEATHER_IDS = new Set(['loafers', 'derby', 'chelsea', 'belt']);

/** Exact color name for a garment ("כחול כהה (שטיפה כהה)" for jeans, "עור חום" for loafers). */
export function colorName(gid, cid) {
  if (DENIM_IDS.has(gid) && DENIM_SHADE[cid]) return DENIM_SHADE[cid].label;
  if (LEATHER_IDS.has(gid) && LEATHER[cid]) return LEATHER[cid];
  return COLOR_NAME[cid] || cid || '';
}
/** Realistic fabric color for drawing. */
export function fabricHex(gid, cid) {
  if (DENIM_IDS.has(gid) && DENIM_SHADE[cid]) return DENIM_SHADE[cid].hex;
  return FABRIC[cid] || '#888';
}
/** For harmony checks, washed jeans behave like a neutral denim. */
export const harmonyColor = (gid, cid) => (DENIM_IDS.has(gid) && ['blue', 'lightblue', 'denim'].includes(cid) ? 'denim' : cid);

// ---- proven looks ----
// pieces: [garmentId, colorId]. occ: occasions it fits. st: styles. fem: needs fem garments.
export const LOOKS = [
  // everyday / school
  { name: 'הקלאסיקה הנקייה', occ: ['school', 'daily', 'out'], st: ['casual', 'minimal', 'classic'], pieces: [['tee', 'white'], ['slim-jeans', 'denim'], ['white-sneakers', 'white'], ['watch', 'silver']], why: 'לבן, כחול כהה ולבן – הבסיס שכל סטייליסט מתחיל ממנו. אי אפשר לטעות.' },
  { name: 'שחור ואפור', occ: ['school', 'daily', 'out'], st: ['minimal', 'street', 'casual'], pieces: [['tee', 'black'], ['straight-jeans', 'grey'], ['white-sneakers', 'white']], why: 'שני ניטרליים כהים והנעליים הלבנות "מרימות" את הלוק.' },
  { name: 'קפוצ׳ון אפור יומיומי', occ: ['school', 'daily'], st: ['casual', 'street'], pieces: [['hoodie', 'grey'], ['tee', 'white'], ['slim-jeans', 'denim'], ['white-sneakers', 'white']], why: 'אפור + כחול כהה = שילוב רגוע. הטי הלבנה מציצה בשוליים ונותנת שכבה.' },
  { name: 'קפוצ׳ון שחור על ג׳ינס קלאסי', occ: ['school', 'daily', 'out'], st: ['street', 'casual'], pieces: [['hoodie', 'black'], ['tee', 'white'], ['straight-jeans', 'blue'], ['white-sneakers', 'white'], ['cap', 'black']], why: 'שחור למעלה, כחול בינוני למטה – ניגודיות טובה, והכובע חוזר על השחור.' },
  { name: 'נייבי ובז׳', occ: ['school', 'daily', 'out'], st: ['classic', 'casual', 'minimal'], pieces: [['crewneck', 'navy'], ['tee', 'white'], ['chinos', 'beige'], ['white-sneakers', 'white']], why: 'נייבי ובז׳ זה הזוג הכי "מסודר" שיש – נראה מושקע בלי מאמץ.' },
  { name: 'אוברשירט זית', occ: ['school', 'daily', 'out'], st: ['casual', 'minimal', 'vintage'], pieces: [['overshirt', 'olive'], ['tee', 'white'], ['slim-jeans', 'black'], ['white-sneakers', 'white']], why: 'צבע אחד (זית) על בסיס שחור-לבן. שכבה פתוחה = לוק מעניין.' },
  { name: 'אדמה רגועה', occ: ['school', 'daily'], st: ['vintage', 'casual', 'minimal'], pieces: [['longsleeve', 'beige'], ['straight-jeans', 'blue'], ['retro-runners', 'grey']], why: 'בז׳ וכחול ג׳ינס – רך ונעים. נעלי רטרו אפורות משלימות את הוינטג׳.' },
  { name: 'סטריט רחב', occ: ['school', 'daily', 'out'], st: ['street'], pieces: [['oversized-tee', 'black'], ['baggy-jeans', 'lightblue'], ['chunky-sneakers', 'white'], ['cap', 'black']], why: 'גזרה רחבה למעלה ולמטה עם נעליים מסיביות – הפרופורציות של הסטריט.' },
  { name: 'קרגו לבן-זית', occ: ['daily', 'out', 'school'], st: ['street'], pieces: [['oversized-tee', 'white'], ['cargo', 'olive'], ['chunky-sneakers', 'white'], ['chain', 'silver']], why: 'טי לבנה רחבה וקרגו זית – לוק רחוב נקי, צבע אחד בלבד.' },
  { name: 'שחור מלא + לבן', occ: ['daily', 'out'], st: ['street', 'minimal'], pieces: [['oversized-tee', 'black'], ['cargo', 'black'], ['chunky-sneakers', 'white'], ['chain', 'silver']], why: 'מונוכרום שחור נראה גבוה ומחודד. הסניקרס הלבנות שוברות.' },
  { name: 'ג׳קט ג׳ינס', occ: ['daily', 'out', 'school'], st: ['vintage', 'casual'], pieces: [['denim-jacket', 'blue'], ['tee', 'white'], ['slim-jeans', 'black'], ['canvas', 'white']], why: 'ג׳קט ג׳ינס עם מכנס שחור (לא ג׳ינס כחול!) – ככה נמנעים מ"סט".' },
  { name: 'בומבר שחור', occ: ['out', 'daily', 'school'], st: ['street', 'casual'], pieces: [['bomber', 'black'], ['tee', 'white'], ['straight-jeans', 'blue'], ['white-sneakers', 'white']], why: 'בומבר שחור מעל לבן וג׳ינס קלאסי – פשוט וחד.' },
  { name: 'וינטג׳ רך', occ: ['daily', 'school'], st: ['vintage', 'classic'], pieces: [['cardigan', 'brown'], ['tee', 'white'], ['straight-jeans', 'blue'], ['canvas', 'white']], why: 'קרדיגן חום מעל לבן – חם ונעים, עם ג׳ינס קלאסי.' },
  { name: 'רטרו בז׳', occ: ['daily', 'school'], st: ['vintage', 'casual'], pieces: [['crewneck', 'beige'], ['tee', 'white'], ['straight-jeans', 'denim'], ['retro-runners', 'grey']], why: 'בז׳ ממש עובד עם כחול כהה. נעלי רטרו נותנות אופי.' },
  { name: 'הדפס אחד בלבד', occ: ['daily', 'school', 'out'], st: ['street', 'vintage'], pieces: [['graphic-tee', 'multi'], ['slim-jeans', 'black'], ['high-tops', 'black']], why: 'כשיש הדפס – כל השאר שחור. ככה ההדפס בולט ולא מבולגן.' },
  // summer
  { name: 'קיץ נקי', occ: ['daily'], st: ['casual', 'minimal'], pieces: [['tee', 'navy'], ['shorts', 'beige'], ['white-sneakers', 'white'], ['watch', 'silver']], why: 'נייבי ובז׳ גם בקיץ. שורט מעל הברך, סניקרס נקיות.' },
  { name: 'קיץ ג׳ינס', occ: ['daily'], st: ['casual', 'vintage'], pieces: [['tee', 'white'], ['denim-shorts', 'blue'], ['canvas', 'white']], why: 'לבן וכחול – הלוק הקיצי הכי פשוט.' },
  { name: 'פשתן לים', occ: ['daily', 'out'], st: ['classic', 'minimal'], pieces: [['linen-shirt', 'white'], ['shorts', 'navy'], ['canvas', 'white']], why: 'פשתן לבן פתוח בצוואר ושורט נייבי – קיצי ומושקע.' },
  // going out / date
  { name: 'דייט מנצח', occ: ['date', 'out'], st: ['classic', 'casual', 'elegant'], pieces: [['oxford', 'lightblue'], ['slim-jeans', 'denim'], ['chelsea', 'brown'], ['belt', 'brown'], ['watch', 'silver']], why: 'תכלת, כחול כהה וחום – השילוב הקלאסי. החגורה באותו צבע של הנעליים.' },
  { name: 'שחור על שחור', occ: ['out', 'date'], st: ['minimal', 'street', 'elegant'], pieces: [['tee', 'black'], ['slim-jeans', 'black'], ['chelsea', 'black'], ['chain', 'silver']], why: 'שחור מלא עם מגפיים – חד, גבוה ומסודר. השרשרת הכסופה היא הנגיעה.' },
  { name: 'פולו קלאסי', occ: ['out', 'date', 'daily'], st: ['classic'], pieces: [['polo', 'navy'], ['chinos', 'beige'], ['loafers', 'brown'], ['belt', 'brown']], why: 'פולו נייבי, צ׳ינו בז׳, עור חום – קלאסיקה איטלקית.' },
  { name: 'סוודר בורדו', occ: ['date', 'out'], st: ['classic', 'elegant'], pieces: [['knit', 'burgundy'], ['slim-jeans', 'black'], ['chelsea', 'black']], why: 'בורדו הוא צבע עשיר שעובד מעולה עם שחור. צבע אחד בולט, השאר כהה.' },
  { name: 'בלייזר וטי', occ: ['out', 'date', 'event'], st: ['classic', 'elegant', 'minimal'], pieces: [['blazer', 'navy'], ['tee', 'white'], ['slim-jeans', 'denim'], ['white-sneakers', 'white']], why: 'בלייזר נייבי על טי לבנה וג׳ינס כהה – "חכם-קז׳ואל" במיטבו.' },
  { name: 'פשתן לדייט', occ: ['date', 'out'], st: ['classic', 'minimal'], pieces: [['linen-shirt', 'white'], ['chinos', 'navy'], ['loafers', 'brown'], ['watch', 'silver']], why: 'לבן ונייבי עם עור חום – נקי, מושקע ומתאים לערב קיץ.' },
  { name: 'גווני אדמה', occ: ['out', 'daily', 'date'], st: ['classic', 'vintage'], pieces: [['polo', 'olive'], ['chinos', 'beige'], ['chelsea', 'brown'], ['belt', 'brown']], why: 'זית, בז׳ וחום – כולם מאותה משפחה, לכן הלוק "שקט" ויוקרתי.' },
  { name: 'אוברשירט ערב', occ: ['out', 'date'], st: ['casual', 'minimal'], pieces: [['overshirt', 'black'], ['tee', 'grey'], ['slim-jeans', 'black'], ['chelsea', 'black']], why: 'גווני שחור-אפור עם מגפיים – לוק ערב פשוט וחזק.' },
  // events
  { name: 'אירוע קלאסי', occ: ['event'], st: ['elegant', 'classic'], pieces: [['blazer', 'navy'], ['oxford', 'white'], ['trousers', 'grey'], ['derby', 'brown'], ['belt', 'brown'], ['watch', 'silver']], why: 'נייבי ואפור עם עור חום – הלוק הכי בטוח לחתונה או בר מצווה.' },
  { name: 'אירוע כהה', occ: ['event'], st: ['elegant', 'minimal'], pieces: [['blazer', 'black'], ['oxford', 'white'], ['trousers', 'black'], ['derby', 'black'], ['belt', 'black']], why: 'שחור-לבן קלאסי. הכל בעור שחור – נקי ורשמי.' },
  { name: 'אירוע מודרני', occ: ['event', 'date'], st: ['elegant', 'minimal'], pieces: [['blazer', 'grey'], ['knit', 'black'], ['trousers', 'black'], ['chelsea', 'black']], why: 'סריג שחור דק במקום חולצה מכופתרת – מודרני ועדיין מכובד.' },
  { name: 'אירוע קיץ', occ: ['event'], st: ['classic', 'elegant'], pieces: [['linen-shirt', 'white'], ['trousers', 'beige'], ['loafers', 'brown'], ['belt', 'brown']], why: 'לאירוע בחוץ בקיץ: פשתן לבן, מכנס בז׳ ומוקסינים – אלגנטי בלי להזיע.' },
  { name: 'פולו לאירוע', occ: ['event', 'date'], st: ['minimal', 'elegant'], pieces: [['polo', 'black'], ['trousers', 'grey'], ['loafers', 'black'], ['belt', 'black']], why: 'פולו שחור עם מכנס מחויט – רשמי פחות, מסוגנן יותר.' },
  // sport
  { name: 'אימון שחור', occ: ['sport'], st: ['sport'], pieces: [['tee', 'black'], ['joggers', 'black'], ['running', 'white'], ['cap', 'black']], why: 'שחור מלא לאימון – נראה טוב גם מזיע.' },
  { name: 'אימון אפור', occ: ['sport'], st: ['sport'], pieces: [['tank', 'grey'], ['sweatpants', 'black'], ['running', 'black']], why: 'גופייה אפורה ומכנס שחור – נוח לחדר כושר.' },
  { name: 'קפוצ׳ון לאימון', occ: ['sport', 'daily'], st: ['sport', 'street'], pieces: [['zip-hoodie', 'grey'], ['tee', 'black'], ['joggers', 'black'], ['running', 'white']], why: 'קפוצ׳ון רוכסן אפור פתוח מעל שחור – בדרך לאימון וחזרה.' },
  // fem
  { name: 'חצאית ופשטות', occ: ['school', 'daily', 'out'], st: ['minimal', 'casual'], fem: true, pieces: [['tee', 'white'], ['skirt', 'black'], ['white-sneakers', 'white']], why: 'טי לבנה וחצאית שחורה עם סניקרס – נקי ונוח.' },
  { name: 'מכנס רחב מחויט', occ: ['out', 'daily', 'date'], st: ['minimal', 'elegant'], pieces: [['tee', 'black'], ['wide-trousers', 'beige'], ['white-sneakers', 'white']], why: 'טי שחורה ומכנס רחב בז׳ – אלגנטי ונוח באותו זמן.' },
  { name: 'בלוזה לאירוע', occ: ['event', 'date'], st: ['elegant', 'classic'], fem: true, pieces: [['blouse', 'white'], ['wide-trousers', 'black'], ['loafers', 'black']], why: 'שחור-לבן עם גזרה רחבה – אלגנטי ומודרני.' },
  { name: 'חצאית ערב', occ: ['date', 'out'], st: ['classic', 'elegant'], fem: true, pieces: [['knit', 'black'], ['skirt', 'beige'], ['chelsea', 'black']], why: 'סריג שחור, חצאית בז׳ ומגפיים – לוק ערב רך ומסודר.' },
];
