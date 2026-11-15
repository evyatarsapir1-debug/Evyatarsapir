// The city of Barber Life: a 4×4 grid of blocks with streets between them, and every place that matters.
// Coordinates: metres, +X east, +Z south, Y up. Block (i, j): column i (west→east), row j (north→south).
export const BLOCK = 48;          // block size incl. sidewalk
export const ROAD = 14;           // road width
export const PITCH = BLOCK + ROAD;
export const N = 4;               // blocks per side
export const SIDEWALK = 3;
export const HALF_CITY = (N / 2) * PITCH;   // 124: outer road centre lines at ±124
export const FRONT = BLOCK / 2 - SIDEWALK;  // building fronts sit 21 m from the block centre

export function blockCenter(i, j) { return { x: (i - (N - 1) / 2) * PITCH, z: (j - (N - 1) / 2) * PITCH }; }

/**
 * Frame of a lot on a block side: the front centre point, the outward direction and the rotation that turns
 * local coordinates (front at z = 0, inside towards +z, x to the right when looking at the building) into world.
 */
export function lotFrame(i, j, side, off = 0) {
  const c = blockCenter(i, j);
  switch (side) {
    case 'n': return { x: c.x + off, z: c.z - FRONT, rot: 0, out: [0, -1] };
    case 's': return { x: c.x - off, z: c.z + FRONT, rot: Math.PI, out: [0, 1] };
    case 'e': return { x: c.x + FRONT, z: c.z + off, rot: -Math.PI / 2, out: [1, 0] };
    default: return { x: c.x - FRONT, z: c.z - off, rot: Math.PI / 2, out: [-1, 0] };
  }
}

// Barbershops that already exist in the city (you can work in them).
export const SHOPS = [
  {
    id: 'fadeHouse', name: 'Fade House', he: 'פייד האוס', block: [2, 1], side: 'n', off: -8, w: 11, d: 12, color: '#1f2b3a', leather: '#141414',
    tier: 1, priceMult: 1.0, commission: 0.5, basePay: 80, needRank: 2, owner: 'מוטי', stations: 3,
    pitch: 'מספרה שכונתית צעירה. מחפשים ספרים מתחילים שמוכנים ללמוד.',
  },
  {
    id: 'classicCuts', name: 'Classic Cuts', he: 'קלאסיק קאטס', block: [1, 2], side: 'e', off: -6, w: 12, d: 12, color: '#3a2a20', leather: '#5a3a1c',
    tier: 2, priceMult: 1.4, commission: 0.55, basePay: 120, needRank: 3, owner: 'שמעון', stations: 3,
    pitch: 'מספרה ותיקה עם לקוחות קבועים. צריך שליטה טובה במספריים ובפיידים.',
  },
  {
    id: 'royalBarbers', name: 'Royal Barbers', he: 'רויאל ברברס', block: [2, 2], side: 's', off: 4, w: 14, d: 13, color: '#141414', leather: '#4a1414',
    tier: 3, priceMult: 2.2, commission: 0.6, basePay: 200, needRank: 5, owner: 'רפאל', stations: 4,
    pitch: 'המספרה היוקרתית בעיר. עובדים כאן רק ספרים מקצועיים.',
  },
];

// Empty shops for rent or sale: your future barbershop branches.
export const PROPERTIES = [
  { id: 'p1', name: 'חנות קטנה ברחוב הדקל', block: [0, 1], side: 'e', off: 2, w: 10, d: 11, stations: 2, traffic: 2, rent: 60, price: 9000 },
  { id: 'p6', name: 'חנות פינתית שקטה', block: [0, 2], side: 'e', off: -4, w: 9, d: 10, stations: 2, traffic: 1, rent: 45, price: 7000 },
  { id: 'p2', name: 'חנות ליד תחנת האוטובוס', block: [2, 0], side: 's', off: 2, w: 12, d: 12, stations: 3, traffic: 3, rent: 110, price: 16000 },
  { id: 'p3', name: 'חזית ברחוב הראשי', block: [1, 0], side: 's', off: -2, w: 12, d: 12, stations: 3, traffic: 4, rent: 150, price: 21000 },
  { id: 'p4', name: 'אולם גדול ליד הפארק', block: [3, 2], side: 'w', off: 0, w: 15, d: 13, stations: 5, traffic: 3, rent: 190, price: 30000 },
  { id: 'p5', name: 'חנות דגל בכיכר העיר', block: [2, 3], side: 'n', off: -3, w: 14, d: 13, stations: 4, traffic: 5, rent: 260, price: 42000 },
];

// Homes: you start in the studio; better apartments can be rented through the real-estate office.
export const HOMES = [
  { id: 'studio', name: 'דירת סטודיו', block: [0, 0], side: 's', off: 0, w: 10, d: 10, rent: 30, comfort: 1 },
  { id: 'apartment', name: 'דירת 3 חדרים', block: [0, 3], side: 'n', off: 3, w: 12, d: 11, rent: 90, comfort: 2, deposit: 400 },
  { id: 'loft', name: 'לופט מעוצב', block: [3, 0], side: 's', off: -3, w: 13, d: 12, rent: 200, comfort: 3, deposit: 1200 },
];

// Other places you can enter.
export const PLACES = [
  { id: 'academy', type: 'academy', name: 'Barber Life Academy', he: 'האקדמיה לספרות', block: [1, 1], side: 'n', off: 0, w: 16, d: 14, color: '#c9a45c' },
  { id: 'realty', type: 'realty', name: 'City Realty', he: 'משרד נדל״ן "העיר"', block: [1, 1], side: 'e', off: 2, w: 10, d: 10, color: '#2f6f5e' },
  { id: 'clothes', type: 'clothes', name: 'Urban Style', he: 'אורבן סטייל — בגדים', block: [2, 1], side: 'w', off: 0, w: 12, d: 12, color: '#7a2b5a' },
  { id: 'cafe', type: 'cafe', name: 'Café Shear', he: 'קפה שיר', block: [1, 2], side: 'n', off: 2, w: 11, d: 10, color: '#8a5a2b' },
  { id: 'cars', type: 'cars', name: 'City Motors', he: 'סוכנות רכב "סיטי מוטורס"', block: [3, 1], side: 'w', off: 0, w: 16, d: 14, color: '#2b4a8a' },
];
export const PARK_BLOCK = [1, 3];

export const CARS = [
  { id: 'scooter', name: 'קטנוע עירוני', price: 1800, speed: 13, color: '#e8c14a', kind: 'scooter' },
  { id: 'hatch', name: 'רכב קטן', price: 6500, speed: 17, color: '#c8102e', kind: 'car' },
  { id: 'suv', name: 'רכב שטח מפואר', price: 18000, speed: 20, color: '#1c1c22', kind: 'car' },
];

export const OUTFITS = {
  shirt: [['#e9e5dc', 'חולצה לבנה', 0], ['#1f3f8f', 'חולצה כחולה', 60], ['#141414', 'חולצה שחורה', 60], ['#7a2b2b', 'חולצת בורדו', 80], ['#2f6b35', 'חולצה ירוקה', 80], ['#c9a45c', 'חולצת זהב', 150]],
  pants: [['#2b2f38', 'ג׳ינס כהה', 0], ['#3a2a20', 'מכנסי צ׳ינו', 70], ['#141414', 'מכנסיים שחורים', 70], ['#8d8a86', 'מכנסיים אפורים', 70]],
  shoes: [['#3a2216', 'נעלי עור', 0], ['#e9e5dc', 'סניקרס לבנות', 90], ['#141414', 'מגפיים שחורים', 110]],
  apron: [[null, 'בלי סינר', 0], ['#141414', 'סינר ספרים שחור', 50], ['#5a3a1c', 'סינר עור', 120]],
};

/** The career ladder of the open world (separate from the academy skill ranks). */
export const CAREER = [
  { id: 1, name: 'תלמיד ספרות', how: 'מתחילים כאן: לומדים באקדמיה.' },
  { id: 2, name: 'ספר מתחיל', how: 'עוברים 10 שיעורים או מגיעים לדרגת "תלמיד ספרות" באקדמיה.' },
  { id: 3, name: 'ספר שעובד במספרה', how: 'מתקבלים לעבודה במספרה בעיר.' },
  { id: 4, name: 'ספר מקצועי', how: 'דרגת "ספר מקצועי" באקדמיה, או 25 לקוחות בעבודה.' },
  { id: 5, name: 'בעל מספרה קטנה', how: 'שוכרים או קונים נכס ופותחים מספרה משלך.' },
  { id: 6, name: 'בעל מספרה מצליחה', how: 'מספרה עם דירוג 4.2+ ו־20 ביקורות או יותר.' },
  { id: 7, name: 'בעל רשת מספרות', how: 'שלוש מספרות או יותר בעיר.' },
];

export const OPEN_HOUR = 9, CLOSE_HOUR = 19;
