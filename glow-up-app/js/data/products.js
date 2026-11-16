// Product guide: generic product types (no brands), what they do, who they're for, what to check.

export const PRODUCT_GROUPS = [
  { id: 'skin', label: 'טיפוח עור', icon: 'sparkles' },
  { id: 'hair', label: 'מוצרי שיער', icon: 'brush' },
  { id: 'hygiene', label: 'היגיינה', icon: 'tooth' },
  { id: 'clothes', label: 'בגדים', icon: 'shirt' },
  { id: 'acc', label: 'אביזרים', icon: 'watch' },
];

export const PRODUCTS = [
  // skin
  { id: 'cleanser', group: 'skin', name: 'סבון/ג׳ל ניקוי פנים', price: [20, 60], use: 'מסיר שומן, זיעה ולכלוך בלי לייבש.', for: 'כולם. ג׳ל לעור שומני, קרם/חלב לעור יבש.', check: ['pH מאוזן / "עדין"', 'ללא בישום לעור רגיש', 'לא סבון גוף'], priority: 1 },
  { id: 'moisturizer', group: 'skin', name: 'קרם לחות', price: [25, 80], use: 'שומר על מחסום העור, מונע יובש וגירוי.', for: 'כולם – גם עור שומני (בגרסה קלה).', check: ['"Non-comedogenic"', 'מרקם לפי סוג העור', 'גליצרין / סרמידים'], priority: 1 },
  { id: 'sunscreen', group: 'skin', name: 'קרם הגנה SPF 30+', price: [35, 100], use: 'מגן מקרינת UV – מונע כוויות, כתמים ונזק לאורך זמן.', for: 'כולם, כל יום.', check: ['SPF 30 ומעלה', 'רחב טווח (UVA/UVB)', 'מרקם שנעים לך – אחרת לא תשתמש/י'], priority: 1 },
  { id: 'acne-treat', group: 'skin', name: 'טיפול נקודתי לפצעונים', price: [25, 70], use: 'בנזואיל פרוקסיד או חומצה סליצילית לפצעונים קלים-בינוניים.', for: 'מי שיש לו פצעונים. לא חובה.', check: ['ריכוז נמוך להתחלה', 'מוצר אחד בכל פעם', 'לקרוא אזהרות'], priority: 2 },
  { id: 'lipbalm', group: 'skin', name: 'שפתון לחות', price: [8, 30], use: 'מונע שפתיים יבשות וסדוקות.', for: 'כולם.', check: ['עדיף עם SPF ליום'], priority: 2 },
  // hair
  { id: 'shampoo', group: 'hair', name: 'שמפו', price: [15, 50], use: 'מנקה את הקרקפת.', for: 'כולם – לפי סוג השיער.', check: ['ללא סולפטים חזקים לשיער מתולתל/יבש', 'נגד קשקשים רק אם יש קשקשים'], priority: 1 },
  { id: 'conditioner', group: 'hair', name: 'מרכך', price: [15, 50], use: 'מרכך ומקל על סירוק, מונע שבירה.', for: 'שיער בינוני-ארוך, מתולתל או יבש.', check: ['על האורכים בלבד, לא על הקרקפת'], priority: 2 },
  { id: 'clay', group: 'hair', name: 'קליי / ווקס לשיער', price: [30, 90], use: 'עיצוב השיער – אחיזה ומרקם.', for: 'שיער קצר-בינוני.', check: ['גימור (מט/מבריק)', 'רמת אחיזה', 'נשטף במים?'], priority: 2 },
  { id: 'curl-cream', group: 'hair', name: 'קרם תלתלים', price: [30, 80], use: 'מגדיר תלתלים ומפחית קרזול.', for: 'שיער גלי ומתולתל.', check: ['ללא אלכוהול מייבש בראש הרשימה'], priority: 2 },
  { id: 'heat-protect', group: 'hair', name: 'תרסיס הגנה מחום', price: [25, 70], use: 'מפחית נזק מפן ומחליק.', for: 'מי שמשתמש בכלי חום.', check: ['להשתמש לפני כל שימוש בחום'], priority: 3 },
  // hygiene
  { id: 'toothpaste', group: 'hygiene', name: 'משחת שיניים עם פלואוריד', price: [8, 25], use: 'מגינה מעששת.', for: 'כולם.', check: ['מכילה פלואוריד'], priority: 1 },
  { id: 'floss', group: 'hygiene', name: 'חוט דנטלי / מברשת בין-שיניים', price: [8, 25], use: 'מנקה בין השיניים – איפה שהמברשת לא מגיעה.', for: 'כולם.', check: ['גודל מברשת בין-שיניים מתאים'], priority: 1 },
  { id: 'deodorant', group: 'hygiene', name: 'דאודורנט', price: [10, 35], use: 'מפחית ריח זיעה.', for: 'כולם מגיל ההתבגרות.', check: ['רול-און או סטיק', 'ללא בישום לעור רגיש'], priority: 1 },
  { id: 'bodywash', group: 'hygiene', name: 'סבון גוף עדין', price: [10, 35], use: 'ניקוי הגוף במקלחת.', for: 'כולם.', check: ['עדין, לא מייבש'], priority: 2 },
  { id: 'razor', group: 'hygiene', name: 'ערכת גילוח / מכונת זקן', price: [20, 200], use: 'גילוח או עיצוב זקן.', for: 'למי שרלוונטי.', check: ['להבים חדשים', 'ג׳ל גילוח לעור רגיש'], priority: 3 },
  // clothes
  { id: 'tees', group: 'clothes', name: 'חולצות טי חלקות', price: [30, 90], use: 'הבסיס של כל ארון.', for: 'כולם.', check: ['כותנה איכותית', 'מידה בכתפיים', 'צבעים ניטרליים'], priority: 1 },
  { id: 'jeans', group: 'clothes', name: 'ג׳ינס כהה בגזרה ישרה', price: [100, 300], use: 'מתאים ליומיום ויציאות.', for: 'כולם.', check: ['גזרה שנוחה בישיבה', 'אורך מתאים לנעל'], priority: 1 },
  { id: 'overshirt', group: 'clothes', name: 'אוברשירט / חולצה מכופתרת', price: [80, 250], use: 'שכבה שמשדרגת לוק פשוט.', for: 'כולם.', check: ['בד שלא מתקמט מהר', 'צבע ניטרלי'], priority: 2 },
  { id: 'sneakers', group: 'clothes', name: 'סניקרס לבנות / ניטרליות', price: [150, 450], use: 'עובדות עם כמעט כל לוק.', for: 'כולם.', check: ['נוחות', 'קל לנקות'], priority: 1 },
  { id: 'sportwear', group: 'clothes', name: 'בגדי ספורט נושמים', price: [50, 200], use: 'לאימונים – מנדפים זיעה.', for: 'מי שמתאמן.', check: ['בד דרייפיט / נושם', 'נעליים מתאימות לסוג הפעילות'], priority: 2 },
  // accessories
  { id: 'watch', group: 'acc', name: 'שעון פשוט', price: [80, 500], use: 'משלים לוק ומשדר סדר.', for: 'כולם.', check: ['גודל ביחס לפרק היד', 'רצועה נוחה'], priority: 3 },
  { id: 'chain', group: 'acc', name: 'שרשרת עדינה', price: [40, 300], use: 'פרט שמוסיף אופי.', for: 'למי שאוהב.', check: ['פלדת אל-חלד / כסף – לא משחירה', 'רגישות לניקל'], priority: 3 },
  { id: 'sunglasses', group: 'acc', name: 'משקפי שמש עם UV400', price: [50, 400], use: 'מגינים על העיניים ומשלימים לוק.', for: 'כולם.', check: ['הגנת UV400', 'צורה לפי צורת הפנים'], priority: 2 },
  { id: 'bag', group: 'acc', name: 'תיק גב פשוט', price: [80, 300], use: 'יומיום ובית ספר.', for: 'כולם.', check: ['רצועות מרופדות', 'תא למחשב'], priority: 3 },
];

export const EXPENSE_CATS = [
  { id: 'skin', label: 'טיפוח', icon: 'sparkles', color: '#c084fc' },
  { id: 'hair', label: 'שיער ותספורות', icon: 'scissors', color: '#22d3ee' },
  { id: 'clothes', label: 'בגדים ונעליים', icon: 'shirt', color: '#f472b6' },
  { id: 'acc', label: 'אביזרים', icon: 'watch', color: '#fbbf24' },
  { id: 'fitness', label: 'כושר', icon: 'dumbbell', color: '#a3e635' },
  { id: 'hygiene', label: 'היגיינה', icon: 'tooth', color: '#60a5fa' },
  { id: 'other', label: 'אחר', icon: 'bag', color: '#9ca3af' },
];
