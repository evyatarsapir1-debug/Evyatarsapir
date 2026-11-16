// Onboarding options. Everything except name is optional; "prefer not to say" is always possible.

export const GOALS = [
  { id: 'skin', label: 'עור נקי ובריא', icon: 'sparkles' },
  { id: 'hair', label: 'שיער ותספורת', icon: 'scissors' },
  { id: 'fit', label: 'כושר וכוח', icon: 'dumbbell' },
  { id: 'posture', label: 'יציבה טובה', icon: 'posture' },
  { id: 'style', label: 'סטייל ולבוש', icon: 'shirt' },
  { id: 'confidence', label: 'ביטחון עצמי', icon: 'smile' },
  { id: 'habits', label: 'הרגלים ושגרה', icon: 'calendar' },
  { id: 'sleep', label: 'שינה טובה יותר', icon: 'moon' },
  { id: 'nutrition', label: 'תזונה ואנרגיה', icon: 'apple' },
];

export const SKIN_TYPES = [
  { id: 'normal', label: 'רגיל', desc: 'לא שומני ולא יבש במיוחד' },
  { id: 'oily', label: 'שומני', desc: 'מבריק באזור המצח והאף, נוטה לפצעונים' },
  { id: 'dry', label: 'יבש', desc: 'מרגיש מתוח, לפעמים מתקלף' },
  { id: 'combination', label: 'מעורב', desc: 'שומני באזור T, יבש בלחיים' },
  { id: 'sensitive', label: 'רגיש', desc: 'מאדים או מגרד בקלות ממוצרים' },
  { id: 'unknown', label: 'לא בטוח/ה', desc: 'נעזור לך לגלות' },
];

export const HAIR_TYPES = [
  { id: 'straight', label: 'חלק', desc: 'נופל ישר, נוטה להשמנה מהירה' },
  { id: 'wavy', label: 'גלי', desc: 'גלים רכים בצורת S' },
  { id: 'curly', label: 'מתולתל', desc: 'תלתלים מוגדרים' },
  { id: 'coily', label: 'מתולתל מאוד', desc: 'תלתלים צפופים וקטנים' },
  { id: 'thin', label: 'דק / דליל', desc: 'קשה לתת לו נפח' },
  { id: 'unknown', label: 'לא בטוח/ה', desc: 'נגלה יחד' },
];

export const HAIR_LENGTHS = [
  { id: 'short', label: 'קצר' },
  { id: 'medium', label: 'בינוני' },
  { id: 'long', label: 'ארוך' },
];

export const STYLES = [
  { id: 'casual', label: 'יומיומי נוח', icon: 'shirt' },
  { id: 'street', label: 'סטריט', icon: 'zap' },
  { id: 'classic', label: 'קלאסי', icon: 'crown' },
  { id: 'sport', label: 'ספורטיבי', icon: 'dumbbell' },
  { id: 'minimal', label: 'מינימליסטי', icon: 'layers' },
  { id: 'elegant', label: 'אלגנטי', icon: 'star' },
  { id: 'vintage', label: 'וינטג׳', icon: 'clock' },
];

export const FITNESS_LEVELS = [
  { id: 'none', label: 'אף פעם לא התאמנתי', desc: 'מתחילים מהבסיס, בלי לחץ' },
  { id: 'beginner', label: 'מתחיל/ה', desc: 'התאמנתי קצת או מדי פעם' },
  { id: 'intermediate', label: 'בינוני', desc: 'מתאמן/ת באופן קבוע כמה חודשים' },
  { id: 'advanced', label: 'מתקדם/ת', desc: 'מתאמן/ת באופן קבוע מעל שנה' },
];

export const CARE_HABITS = [
  { id: 'wash', label: 'שוטף/ת פנים עם סבון פנים' },
  { id: 'moisturizer', label: 'משתמש/ת בקרם לחות' },
  { id: 'spf', label: 'מורח/ת קרם הגנה' },
  { id: 'hairProducts', label: 'משתמש/ת במוצרי שיער' },
  { id: 'floss', label: 'משתמש/ת בחוט דנטלי' },
  { id: 'none', label: 'עדיין אין לי שגרה' },
];

export const MINUTES = [10, 20, 30, 45, 60];

export const AREAS = [
  { id: 'skin', label: 'טיפוח עור', icon: 'sparkles' },
  { id: 'hair', label: 'שיער', icon: 'scissors' },
  { id: 'fitness', label: 'כושר', icon: 'dumbbell' },
  { id: 'posture', label: 'יציבה', icon: 'posture' },
  { id: 'nutrition', label: 'תזונה', icon: 'apple' },
  { id: 'style', label: 'סטייל', icon: 'shirt' },
  { id: 'sleep', label: 'שינה ושגרה', icon: 'moon' },
  { id: 'hygiene', label: 'היגיינה ורעננות', icon: 'tooth' },
];

export const ADDRESS = [
  { id: 'm', label: 'בלשון זכר' },
  { id: 'f', label: 'בלשון נקבה' },
  { id: 'n', label: 'לא משנה לי' },
];

export function labelOf(list, id) {
  const it = list.find((x) => x.id === id);
  return it ? it.label : '';
}
