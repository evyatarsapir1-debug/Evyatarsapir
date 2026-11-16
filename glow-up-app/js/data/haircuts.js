// Haircut library + illustrated previews (original SVG drawings).

export const HAIRCUTS = [
  {
    id: 'low-fade', name: 'לואו פייד', en: 'Low Fade', length: 'short', tags: ['פייד', 'קלאסי'],
    desc: 'מעבר הדרגתי מאוד נמוך – מתחיל ממש מעל האוזן וקו העורף. נקי, עדין ומתאים כמעט לכל מקום, כולל בית ספר ועבודה.',
    face: ['oval', 'square', 'heart', 'long'], hair: ['straight', 'wavy', 'curly', 'coily'], upkeep: 3, styleMin: 5,
    products: ['קליי או משחה לחלק העליון'],
    ask: ['"לואו פייד" – הפייד מתחיל נמוך, מעל האוזן.', 'לציין מספר מכונה למטה (למשל 0 או 1) ואורך למעלה בסנטימטרים.', 'לבקש לסדר את קו העורף בצורה טבעית.'],
    style: ['שיער כמעט יבש.', 'מעט קליי לחלק העליון.', 'לסרק לצד או קדימה עם האצבעות.'],
    svg: { top: 'crop', fade: 'low' },
  },
  {
    id: 'mid-fade', name: 'מיד פייד', en: 'Mid Fade', length: 'short', tags: ['פייד', 'פופולרי'],
    desc: 'הפייד מתחיל באמצע הצד – בערך בגובה הרקה. האיזון הכי פופולרי בין נקי לבולט.',
    face: ['oval', 'round', 'square', 'heart'], hair: ['straight', 'wavy', 'curly', 'coily'], upkeep: 3, styleMin: 5,
    products: ['קליי, משחה או פומייד'],
    ask: ['"מיד פייד" – מתחיל בערך בגובה הרקות.', 'מספר מכונה למטה ואורך למעלה.', 'האם רוצים קו חד (Line up) או טבעי.'],
    style: ['פן קצר לנפח.', 'מוצר מאחור קדימה.', 'לעצב לכיוון הרצוי.'],
    svg: { top: 'textured', fade: 'mid' },
  },
  {
    id: 'high-fade', name: 'היי פייד', en: 'High Fade', length: 'short', tags: ['פייד', 'בולט'],
    desc: 'הפייד עולה גבוה, כמעט עד קו החלק העליון. ניגודיות חזקה ומראה חד ומודרני.',
    face: ['oval', 'round', 'square'], hair: ['straight', 'wavy', 'curly', 'coily'], upkeep: 2, styleMin: 5,
    products: ['קליי או ג׳ל לתלתלים'],
    ask: ['"היי פייד" – עולה כמעט עד הקו העליון של הראש.', 'לבקש מעבר חלק בלי "קווים".', 'לתאם עם החלק העליון – קצר או עם נפח.'],
    style: ['מעט מוצר למעלה בלבד.', 'הצדדים לא צריכים כלום.'],
    svg: { top: 'curly', fade: 'high' },
  },
  {
    id: 'taper', name: 'טייפר', en: 'Taper', length: 'short', tags: ['קלאסי', 'עדין'],
    desc: 'השיער מתקצר בהדרגה רק בפאות ובקו העורף, והצדדים נשארים יחסית מלאים. מראה מסודר, עדין ומקצועי.',
    face: ['oval', 'square', 'long', 'heart', 'diamond'], hair: ['straight', 'wavy', 'curly', 'coily', 'thin'], upkeep: 4, styleMin: 5,
    products: ['משחה או קרם'],
    ask: ['"טייפר" – קיצור הדרגתי רק בפאות ובעורף.', 'לשמור את הצדדים מעט ארוכים.'],
    style: ['קרם או משחה קלה.', 'לסרק לצד או אחורה.'],
    svg: { top: 'sidepart', fade: 'taper' },
  },
  {
    id: 'textured-crop', name: 'טקסצ׳רד קרופ', en: 'Textured Crop', length: 'short', tags: ['מודרני', 'קל לסידור'],
    desc: 'חלק עליון קצר עם הרבה טקסטורה ופוני קצר קדימה, לרוב עם פייד בצדדים. קל מאוד לסדר ונראה טבעי.',
    face: ['oval', 'round', 'square', 'diamond'], hair: ['straight', 'wavy', 'thin'], upkeep: 3, styleMin: 3,
    products: ['קליי מט או ספריי מלח'],
    ask: ['"טקסצ׳רד קרופ" עם פוני קצר.', 'לבקש טקסטורה במספריים (Point cut).', 'פייד בצדדים לפי בחירה.'],
    style: ['ספריי מלח על שיער לח, ייבוש.', 'מעט קליי ולפרוע עם האצבעות קדימה.'],
    svg: { top: 'textured', fade: 'mid' },
  },
  {
    id: 'french-crop', name: 'פרנץ׳ קרופ', en: 'French Crop', length: 'short', tags: ['קלאסי', 'מינימום סידור'],
    desc: 'חלק עליון קצר עם פוני ישר וקצר קדימה וצדדים קצרים. אחד הסגנונות הכי נוחים לתחזוקה.',
    face: ['oval', 'long', 'heart', 'diamond'], hair: ['straight', 'wavy', 'thin'], upkeep: 3, styleMin: 2,
    products: ['מעט משחה או בכלל לא'],
    ask: ['"פרנץ׳ קרופ" עם פוני ישר.', 'לקבוע את גובה הפוני (באמצע המצח או גבוה יותר).'],
    style: ['לסרק קדימה.', 'מוצר רק אם צריך.'],
    svg: { top: 'french', fade: 'low' },
  },
  {
    id: 'buzz', name: 'באז קאט', en: 'Buzz Cut', length: 'short', tags: ['מינימליסטי', 'אפס סידור'],
    desc: 'מכונה באורך אחיד על כל הראש. אפס זמן סידור, מראה נקי וחזק. מדגיש את מבנה הפנים.',
    face: ['oval', 'square', 'diamond'], hair: ['straight', 'wavy', 'curly', 'coily', 'thin'], upkeep: 2, styleMin: 0,
    products: ['קרם הגנה לקרקפת בשמש!'],
    ask: ['"באז" עם מספר מכונה אחיד (למשל 2 או 3).', 'אפשר לבקש פייד קטן בתחתית.'],
    style: ['אין צורך בסידור.', 'קרם לחות וקרם הגנה לקרקפת.'],
    svg: { top: 'buzz', fade: 'none' },
  },
  {
    id: 'crew', name: 'קרו קאט', en: 'Crew Cut', length: 'short', tags: ['קלאסי', 'ספורטיבי'],
    desc: 'צדדים קצרים וחלק עליון קצר שמעט ארוך יותר בקדמה. קלאסי, ספורטיבי ומסודר.',
    face: ['oval', 'round', 'square', 'heart'], hair: ['straight', 'wavy', 'thin'], upkeep: 3, styleMin: 2,
    products: ['מעט משחה'],
    ask: ['"קרו קאט" – צדדים קצרים, למעלה מעט ארוך יותר בקדמה.'],
    style: ['מעט משחה, להרים קלות את הקדמה.'],
    svg: { top: 'crew', fade: 'low' },
  },
  {
    id: 'quiff', name: 'קוויף', en: 'Quiff', length: 'medium', tags: ['נפח', 'בולט'],
    desc: 'חלק עליון ארוך יותר עם נפח קדימה ולמעלה, צדדים קצרים. מאריך את הפנים – מצוין לפנים עגולות.',
    face: ['round', 'square', 'oval'], hair: ['straight', 'wavy'], upkeep: 4, styleMin: 8,
    products: ['פן + קליי או פומייד', 'תרסיס הגנה מחום'],
    ask: ['לשמור 6-8 ס״מ למעלה בקדמה.', 'צדדים קצרים או פייד.'],
    style: ['פן כשמברישים את הקדמה למעלה ואחורה.', 'קליי או פומייד לקיבוע.', 'לעצב עם מסרק או אצבעות.'],
    svg: { top: 'quiff', fade: 'mid' },
  },
  {
    id: 'side-part', name: 'פסוקת צד', en: 'Side Part', length: 'medium', tags: ['אלגנטי', 'אירועים'],
    desc: 'שיער מסורק לצד עם פסוקת ברורה. קלאסי ואלגנטי – מעולה לאירועים ולמראה מסודר.',
    face: ['oval', 'square', 'long', 'heart'], hair: ['straight', 'wavy'], upkeep: 4, styleMin: 5,
    products: ['פומייד או קרם'],
    ask: ['"סייד פארט" עם טייפר או פייד נמוך.', 'אפשר לבקש קו פסוקת מגולח עדין – לא חובה.'],
    style: ['לסרק פסוקת על שיער לח.', 'פומייד או קרם, לסרק לצד.'],
    svg: { top: 'sidepart', fade: 'low' },
  },
  {
    id: 'slick-back', name: 'סליק בק', en: 'Slick Back', length: 'medium', tags: ['אלגנטי'],
    desc: 'שיער באורך בינוני מסורק לאחור בצורה חלקה. דורש אורך וקצת סבלנות לגדל.',
    face: ['oval', 'square', 'diamond'], hair: ['straight', 'wavy'], upkeep: 5, styleMin: 5,
    products: ['פומייד מבריק או קרם'],
    ask: ['לשמור אורך למעלה (8+ ס״מ) וצדדים קצרים יותר.'],
    style: ['מוצר על שיער לח.', 'לסרק לאחור עם מסרק.'],
    svg: { top: 'slick', fade: 'taper' },
  },
  {
    id: 'curly-top', name: 'תלתלים עם פייד', en: 'Curly Top Fade', length: 'short', tags: ['תלתלים', 'מודרני'],
    desc: 'תלתלים טבעיים מלמעלה עם צדדים קצרים. מדגיש את המרקם הטבעי של השיער.',
    face: ['oval', 'round', 'square', 'long'], hair: ['curly', 'coily', 'wavy'], upkeep: 3, styleMin: 4,
    products: ['קרם תלתלים', 'ג׳ל עדין'],
    ask: ['לשמור אורך התלתלים למעלה (בחיתוך יבש אם אפשר).', 'פייד לבחירה בצדדים.'],
    style: ['קרם תלתלים על שיער רטוב.', 'ללחוץ את התלתלים (Scrunch) ולייבש באוויר.', 'לא להבריש יבש.'],
    svg: { top: 'curly', fade: 'mid' },
  },
  {
    id: 'curtains', name: 'פסוקת אמצע (קרטנס)', en: 'Curtains / Middle Part', length: 'medium', tags: ['טרנדי', 'בינוני'],
    desc: 'שיער בינוני עם פסוקת באמצע שנופל לשני הצדדים של המצח. רך ומודרני.',
    face: ['oval', 'square', 'diamond', 'heart'], hair: ['straight', 'wavy'], upkeep: 6, styleMin: 5,
    products: ['ספריי מלח / קרם קל'],
    ask: ['לגדל קדמה עד גובה הגבות בערך.', 'שכבות עדינות לצדדים.'],
    style: ['פסוקת באמצע על שיער לח.', 'פן לכיוון החוץ.', 'מעט קרם לשליטה.'],
    svg: { top: 'curtains', fade: 'none' },
  },
  {
    id: 'long-layers', name: 'שיער ארוך בשכבות', en: 'Long Layers', length: 'long', tags: ['ארוך', 'טבעי'],
    desc: 'שיער ארוך עם שכבות שנותנות תנועה ונפח. מתאים לכל סוגי השיער ולכל המגדרים.',
    face: ['oval', 'round', 'square', 'heart', 'diamond', 'long'], hair: ['straight', 'wavy', 'curly', 'coily', 'thin'], upkeep: 8, styleMin: 5,
    products: ['מרכך', 'שמן/סרום לקצוות', 'הגנה מחום'],
    ask: ['לבקש שכבות ארוכות ולשמור על האורך.', 'לגזום קצוות כל 8-12 שבועות.'],
    style: ['ייבוש עדין.', 'מעט סרום על הקצוות.', 'ציפית סאטן נגד קרזול.'],
    svg: { top: 'long', fade: 'none' },
  },
  {
    id: 'medium-flow', name: 'פלואו בינוני', en: 'Medium Flow', length: 'long', tags: ['רגוע', 'גלי'],
    desc: 'שיער בינוני-ארוך שנזרק לאחור באופן טבעי, עד מעט מתחת לאוזניים. מצוין לשיער גלי.',
    face: ['oval', 'square', 'long'], hair: ['wavy', 'straight'], upkeep: 8, styleMin: 4,
    products: ['ספריי מלח', 'קרם קל'],
    ask: ['לגדל באופן אחיד, לגזום רק קצוות.', 'לשאול על שכבות לתנועה.'],
    style: ['ספריי מלח על שיער לח.', 'לייבש באוויר ולסרק אחורה עם האצבעות.'],
    svg: { top: 'flow', fade: 'none' },
  },
  {
    id: 'bun', name: 'קוקו / באן', en: 'Bun', length: 'long', tags: ['ארוך', 'מעשי'],
    desc: 'שיער ארוך אסוף לקוקו או לבאן. מעשי לאימונים ולימים חמים.',
    face: ['oval', 'square', 'long', 'diamond'], hair: ['straight', 'wavy', 'curly', 'coily'], upkeep: 10, styleMin: 2,
    products: ['גומיות רכות ללא מתכת'],
    ask: ['לשמור אורך אחיד שמספיק לאיסוף.'],
    style: ['לאסוף בעדינות – לא חזק מדי (מתיחה חזקה וקבועה עלולה לפגוע בשורשים).', 'להחליף מיקום הקוקו מדי פעם.'],
    svg: { top: 'bun', fade: 'none' },
  },
];

export const CUT = Object.fromEntries(HAIRCUTS.map((c) => [c.id, c]));

export const HAIR_COLORS = [
  { id: 'black', c: '#1b1714' },
  { id: 'brown', c: '#4a3123' },
  { id: 'light', c: '#8a5a36' },
  { id: 'blonde', c: '#c8a063' },
  { id: 'red', c: '#8f3f22' },
];
export const SKIN_TONES = ['#f2d0b5', '#d9a77f', '#b97d55', '#8a5638', '#5e3a26'];

const TOPS = {
  crop: 'M58 78 C58 46 78 34 100 34 C122 34 142 46 142 78 L140 76 C134 66 128 62 120 64 L116 70 L110 63 L103 70 L97 63 L90 70 L84 63 L78 69 C72 64 64 68 60 78 Z',
  textured: 'M57 80 C55 44 78 30 100 31 C124 30 145 45 143 80 L139 74 L133 63 L127 69 L121 58 L114 67 L108 56 L101 66 L94 56 L88 67 L81 58 L75 69 L68 62 L62 74 Z',
  french: 'M58 80 C58 46 78 34 100 34 C122 34 142 46 142 80 C138 70 132 66 128 66 L72 66 C68 66 62 70 58 80 Z',
  crew: 'M59 78 C59 48 78 37 100 37 C122 37 141 48 141 78 C137 68 128 61 116 59 C104 57 92 58 82 60 C72 63 63 69 59 78 Z',
  quiff: 'M58 80 C57 54 66 42 78 38 C80 22 98 12 120 16 C136 19 144 30 139 41 C144 52 144 66 142 80 C138 68 132 60 120 58 C108 56 94 56 82 58 C72 62 62 70 58 80 Z',
  sidepart: 'M57 82 C55 50 74 34 98 33 C124 32 146 46 143 82 C140 70 134 62 124 58 C112 54 96 54 84 56 C78 50 80 44 82 40 C72 46 62 60 57 82 Z M82 40 L84 56',
  slick: 'M57 82 C55 48 76 32 100 32 C124 32 145 48 143 82 C140 68 132 58 120 56 C108 54 92 54 80 56 C70 60 61 70 57 82 Z',
  curly: '',
  buzz: 'M60 84 C60 52 78 41 100 41 C122 41 140 52 140 84 C136 70 126 60 100 59 C74 60 64 70 60 84 Z',
  curtains: 'M56 104 C50 56 72 32 100 32 C128 32 150 56 144 104 C142 88 140 78 132 70 C124 74 112 70 102 56 C100 54 100 54 98 56 C88 70 76 74 68 70 C60 78 58 88 56 104 Z',
  long: 'M54 170 C40 130 46 60 66 44 C80 32 120 32 134 44 C154 60 160 130 146 170 L138 170 C142 130 140 96 134 76 C126 72 114 66 104 54 C100 50 98 52 96 56 C86 68 74 72 66 76 C60 96 58 130 62 170 Z',
  flow: 'M54 124 C46 70 68 34 100 33 C134 32 156 70 146 124 C144 108 142 92 136 80 C128 64 116 58 100 58 C86 58 72 64 64 80 C58 92 56 108 54 124 Z',
  bun: 'M58 84 C56 50 76 36 100 36 C124 36 144 50 142 84 C138 70 128 60 100 58 C72 60 62 70 58 84 Z',
};

function curls(color) {
  const pts = [[68, 62], [80, 50], [94, 44], [108, 44], [122, 50], [134, 62], [74, 70], [88, 58], [102, 54], [116, 58], [128, 70], [64, 76], [138, 76], [96, 66], [110, 66], [82, 66], [120, 66]];
  return pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${9 + (i % 3)}" fill="${color}"/><circle cx="${x - 2}" cy="${y - 2}" r="3" fill="rgba(255,255,255,.07)"/>`).join('');
}

/** Returns SVG markup of a front-facing head wearing the cut. */
export function haircutSVG(cut, { hairColor = '#2b1d16', skin = '#d9a77f', size } = {}) {
  const { top, fade } = cut.svg;
  const gid = 'f' + cut.id + Math.random().toString(36).slice(2, 6);
  // where the fade reaches full skin (y) and where hair is full (y)
  const fadeMap = { low: [108, 96], mid: [96, 80], high: [82, 66], taper: [112, 104], none: [126, 125] };
  const [skinY, hairY] = fadeMap[fade] || fadeMap.none;
  const skinDark = shade(skin, -18);
  const sideFill = fade === 'none' ? hairColor : `url(#${gid})`;
  const isLong = top === 'long' || top === 'flow' || top === 'curtains';
  const bottom = isLong ? 112 : 118;
  const sides = top === 'buzz' ? '' : `<path d="M58 ${bottom} C56 96 57 80 61 64 L74 60 C71 72 69 84 69 92 C69 100 67 108 65 ${bottom} Z M142 ${bottom} C144 96 143 80 139 64 L126 60 C129 72 131 84 131 92 C131 100 133 108 135 ${bottom} Z" fill="${sideFill}"/>`;
  const topPath = top === 'curly' ? curls(hairColor) : `<path d="${TOPS[top]}" fill="${hairColor}" ${top === 'sidepart' ? `stroke="${shade(hairColor, 25)}" stroke-width="1.2"` : ''}/>`;
  const buzzTex = top === 'buzz' ? `<path d="${TOPS.buzz}" fill="${hairColor}" opacity=".72"/><path d="M60 84 C60 98 62 106 64 112 L68 92 Z M140 84 C140 98 138 106 136 112 L132 92 Z" fill="${hairColor}" opacity=".5"/>` : '';
  const bun = top === 'bun' ? `<circle cx="100" cy="28" r="14" fill="${hairColor}"/><path d="M90 30 C94 22 106 22 110 30" stroke="${shade(hairColor, 25)}" stroke-width="1.5" fill="none"/>` : '';
  const strands = ['slick', 'quiff', 'flow', 'sidepart'].includes(top)
    ? `<g stroke="${shade(hairColor, 28)}" stroke-width="1.2" fill="none" opacity=".7"><path d="M78 52 C92 44 110 42 128 48"/><path d="M74 60 C90 52 112 50 134 56"/><path d="M84 46 C98 38 114 38 126 42"/></g>` : '';
  const longBack = top === 'long' ? `<path d="M60 150 C52 120 54 90 60 76 L140 76 C146 90 148 120 140 150 Z" fill="${shade(hairColor, -10)}"/>` : '';
  return `<svg viewBox="0 0 200 200" ${size ? `width="${size}" height="${size}"` : ''} role="img" aria-label="${cut.name}">
  <defs>
    <linearGradient id="${gid}" x1="0" x2="0" gradientUnits="userSpaceOnUse" y1="${hairY}" y2="${skinY}">
      <stop offset="0" stop-color="${hairColor}"/><stop offset="1" stop-color="${hairColor}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${longBack}
  <path d="M40 200 C44 172 66 160 86 156 L114 156 C134 160 156 172 160 200 Z" fill="var(--purple)" opacity=".85"/>
  <path d="M86 156 L100 172 L114 156" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>
  <rect x="86" y="128" width="28" height="32" rx="10" fill="${skinDark}"/>
  <ellipse cx="59" cy="104" rx="7" ry="11" fill="${skinDark}"/>
  <ellipse cx="141" cy="104" rx="7" ry="11" fill="${skinDark}"/>
  <ellipse cx="100" cy="94" rx="41" ry="50" fill="${skin}"/>
  ${sides}
  ${buzzTex}
  ${topPath}
  ${bun}
  ${strands}
  <g stroke="${shade(skin, -45)}" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".75">
    <path d="M80 90 Q86 87 92 90"/><path d="M108 90 Q114 87 120 90"/>
    <path d="M100 100 L98 112 L102 113"/>
    <path d="M91 124 Q100 129 109 124"/>
  </g>
  <circle cx="86" cy="97" r="2.4" fill="#2a1d18"/><circle cx="114" cy="97" r="2.4" fill="#2a1d18"/>
</svg>`;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v) => Math.max(0, Math.min(255, v));
  const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

export const FACE_SHAPES = [
  { id: 'oval', label: 'אובלי' }, { id: 'round', label: 'עגול' }, { id: 'square', label: 'מרובע' },
  { id: 'long', label: 'ארוך' }, { id: 'heart', label: 'לב' }, { id: 'diamond', label: 'יהלום' },
];
