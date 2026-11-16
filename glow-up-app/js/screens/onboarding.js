// First-run registration: builds the personal profile, then generates the plan.
import { h, ic, toast, note } from '../ui.js';
import { update, todayKey, uid } from '../store.js';
import { GOALS, SKIN_TYPES, HAIR_TYPES, HAIR_LENGTHS, STYLES, FITNESS_LEVELS, CARE_HABITS, MINUTES, AREAS, ADDRESS } from '../data/profile.js';
import { PROGRAMS, PACES } from '../plan.js';
import { defaultRoutines } from '../routines.js';

const GOAL_TO_AREA = { skin: ['skin'], hair: ['hair'], fit: ['fitness'], posture: ['posture'], style: ['style'], confidence: ['hygiene', 'style'], habits: ['sleep'], sleep: ['sleep'], nutrition: ['nutrition'] };

export default function onboarding({ done }) {
  const p = {
    name: '', address: 'n', age: 16, goals: [], areas: [], skinType: null, hairType: null, hairLength: 'short',
    styles: [], fitnessLevel: null, careHabits: [], minutes: 20, program: 30, pace: 'normal',
  };
  let step = 0;
  const root = h('div', { class: 'onb' });

  const STEPS = [
    { id: 'welcome', render: welcome, foot: false },
    { id: 'name', render: nameStep, valid: () => p.name.trim().length > 0 },
    { id: 'age', render: ageStep },
    { id: 'goals', render: goalsStep, valid: () => p.goals.length > 0 },
    { id: 'areas', render: areasStep, valid: () => p.areas.length > 0 },
    { id: 'skin', render: () => single('מה סוג העור שלך?', 'זה עוזר להתאים ניקוי, לחות ומוצרים. אפשר לשנות בכל רגע.', SKIN_TYPES, 'skinType'), valid: () => !!p.skinType },
    { id: 'hair', render: hairStep, valid: () => !!p.hairType },
    { id: 'style', render: stylesStep, valid: () => p.styles.length > 0 },
    { id: 'fitness', render: () => single('מה הניסיון שלך באימונים?', 'נבנה אימונים בטוחים שמתאימים בדיוק לרמה שלך.', FITNESS_LEVELS, 'fitnessLevel', true), valid: () => !!p.fitnessLevel },
    { id: 'habits', render: habitsStep },
    { id: 'time', render: timeStep },
    { id: 'program', render: programStep },
    { id: 'analyze', render: analyzeStep, foot: false },
  ];

  function draw() {
    const st = STEPS[step];
    const pct = step / (STEPS.length - 1);
    root.replaceChildren(
      step > 0 && st.id !== 'analyze' ? h('div', { class: 'onb-top' },
        h('button', { class: 'icon-btn flip', 'aria-label': 'חזרה', onclick: () => { step--; draw(); } }, ic('back')),
        h('div', { class: 'onb-progress', role: 'progressbar', 'aria-valuenow': Math.round(pct * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: pct * 100 + '%' } })),
        h('span', { class: 'tiny muted' }, `${step}/${STEPS.length - 2}`)) : null,
      h('div', { class: 'onb-body' }, st.render()),
      st.foot === false ? null : h('div', { class: 'onb-foot' },
        h('button', {
          class: 'btn primary', 'data-next': '',
          onclick: () => {
            if (st.valid && !st.valid()) return toast(st.id === 'name' ? 'איך לקרוא לך? (אפשר גם כינוי)' : 'צריך לבחור לפחות אפשרות אחת', 'info');
            step++; draw();
          },
        }, step === STEPS.length - 2 ? 'לבנות את התוכנית שלי' : 'המשך', ic('back'))));
    const inp = root.querySelector('input[type=text]');
    if (inp) setTimeout(() => inp.focus(), 50);
  }

  function welcome() {
    return h('div', { class: 'welcome-hero' },
      h('div', { class: 'orb' }),
      h('div', { class: 'logo' }, 'GLOW', h('span', null, 'UP')),
      h('p', { class: 'lead', style: { marginTop: '10px' } }, 'המאמן האישי שלך לטיפוח, שיער, כושר, תזונה, סטייל ושגרה – בקצב שלך.'),
      h('div', { class: 'feature-list' },
        ...[['target', 'תוכנית אישית שנבנית לפי התשובות שלך'], ['check', 'משימות יומיות עם הסבר צעד אחר צעד'], ['bot', 'מאמן אישי שעונה על שאלות ועוזר להתמיד'], ['lock', 'הכל נשמר רק במכשיר שלך. בלי חובה להעלות תמונות']]
          .map(([i, t]) => h('div', null, ic(i), t))),
      h('button', { class: 'btn primary block', 'data-next': '', onclick: () => { step = 1; draw(); } }, 'בואו נתחיל', ic('back')),
      h('p', { class: 'tiny muted mt' }, 'לוקח בערך 2 דקות. אפשר לשנות כל תשובה אחר כך בהגדרות.'));
  }

  function nameStep() {
    return h('div', null,
      h('h1', null, 'נעים להכיר! איך לקרוא לך?'),
      h('p', { class: 'lead' }, 'שם או כינוי – רק כדי שהמאמן יפנה אליך אישית.'),
      h('label', { class: 'field' }, h('span', null, 'שם / כינוי'),
        h('input', { class: 'input', type: 'text', maxlength: 24, value: p.name, placeholder: 'לדוגמה: נועם', oninput: (e) => (p.name = e.target.value), onkeydown: (e) => { if (e.key === 'Enter') root.querySelector('[data-next]').click(); } })),
      h('div', { class: 'field' }, h('span', null, 'איך נוח לך שנפנה אליך?'),
        h('div', { class: 'chips' }, ADDRESS.map((a) => h('button', { type: 'button', class: 'chip' + (p.address === a.id ? ' on' : ''), onclick: () => { p.address = a.id; draw(); } }, a.label)))));
  }

  function ageStep() {
    const val = h('div', { class: 'big-num' }, String(p.age));
    const warn = h('div');
    const setWarn = () => {
      warn.replaceChildren(p.age < 13
        ? note('GLOW UP מתאימה בעיקר לגיל 13 ומעלה. אם הגיל שלך צעיר יותר, מומלץ להשתמש בה יחד עם הורה או מבוגר.', 'warn')
        : p.age < 18 ? note('ההמלצות יותאמו לגיל ההתבגרות: אימונים בטוחים, בלי דיאטות, ודגש על שינה וגדילה.') : '');
    };
    setWarn();
    return h('div', null,
      h('h1', null, 'בן/בת כמה את/ה?'),
      h('p', { class: 'lead' }, 'הגיל עוזר לנו להתאים המלצות בטוחות לאימונים, לתזונה ולטיפוח.'),
      val,
      h('input', { type: 'range', min: 10, max: 70, value: p.age, 'aria-label': 'גיל', oninput: (e) => { p.age = +e.target.value; val.textContent = p.age; setWarn(); } }),
      h('div', { class: 'row between tiny muted' }, h('span', null, '10'), h('span', null, '70')),
      h('div', { class: 'mt2' }, warn));
  }

  function goalsStep() {
    return h('div', null,
      h('h1', null, 'מה המטרות שלך?'),
      h('p', { class: 'lead' }, 'אפשר לבחור כמה שרוצים.'),
      h('div', { class: 'opt-grid' }, GOALS.map((g) => h('button', {
        type: 'button', class: 'opt' + (p.goals.includes(g.id) ? ' on' : ''),
        onclick: () => {
          p.goals = p.goals.includes(g.id) ? p.goals.filter((x) => x !== g.id) : [...p.goals, g.id];
          p.areas = [...new Set(p.goals.flatMap((x) => GOAL_TO_AREA[x] || []))];
          draw();
        },
      }, h('span', { class: 'oi' }, ic(g.icon)), h('b', null, g.label)))));
  }

  function areasStep() {
    return h('div', null,
      h('h1', null, 'אילו תחומים לשפר?'),
      h('p', { class: 'lead' }, 'סימנו מראש לפי המטרות שלך – אפשר להוסיף או להוריד. רק התחומים שבחרת ייכנסו למשימות היומיות.'),
      h('div', { class: 'opt-grid' }, AREAS.map((a) => h('button', {
        type: 'button', class: 'opt' + (p.areas.includes(a.id) ? ' on' : ''),
        onclick: () => { p.areas = p.areas.includes(a.id) ? p.areas.filter((x) => x !== a.id) : [...p.areas, a.id]; draw(); },
      }, h('span', { class: 'oi' }, ic(a.icon)), h('b', null, a.label)))));
  }

  function single(title, lead, list, key, asList = false) {
    return h('div', null,
      h('h1', null, title),
      h('p', { class: 'lead' }, lead),
      h('div', { class: asList ? 'opt-list' : 'opt-grid' }, list.map((o) => h('button', {
        type: 'button', class: 'opt' + (p[key] === o.id ? ' on' : ''),
        onclick: () => { p[key] = o.id; draw(); },
      }, h('div', null, h('b', null, o.label), o.desc ? h('small', { style: { display: 'block' } }, o.desc) : null)))));
  }

  function hairStep() {
    return h('div', null,
      single('מה סוג השיער שלך?', 'נתאים מוצרים, תדירות חפיפה ותספורות.', HAIR_TYPES, 'hairType'),
      h('div', { class: 'field mt2' }, h('span', null, 'אורך השיער כרגע'),
        h('div', { class: 'chips' }, HAIR_LENGTHS.map((l) => h('button', { type: 'button', class: 'chip' + (p.hairLength === l.id ? ' on' : ''), onclick: () => { p.hairLength = l.id; draw(); } }, l.label)))));
  }

  function stylesStep() {
    return h('div', null,
      h('h1', null, 'איזה סגנון לבוש את/ה אוהב/ת?'),
      h('p', { class: 'lead' }, 'אפשר לבחור עד 3. הסטייליסט ישתמש בזה כדי להציע לוקים.'),
      h('div', { class: 'opt-grid' }, STYLES.map((s) => h('button', {
        type: 'button', class: 'opt' + (p.styles.includes(s.id) ? ' on' : ''),
        onclick: () => {
          if (p.styles.includes(s.id)) p.styles = p.styles.filter((x) => x !== s.id);
          else if (p.styles.length >= 3) return toast('אפשר לבחור עד 3', 'info');
          else p.styles = [...p.styles, s.id];
          draw();
        },
      }, h('span', { class: 'oi' }, ic(s.icon)), h('b', null, s.label)))));
  }

  function habitsStep() {
    return h('div', null,
      h('h1', null, 'מה כבר עושים היום?'),
      h('p', { class: 'lead' }, 'אין תשובה לא נכונה – זה רק כדי לדעת מאיפה מתחילים.'),
      h('div', { class: 'opt-list' }, CARE_HABITS.map((c) => h('button', {
        type: 'button', class: 'opt' + (p.careHabits.includes(c.id) ? ' on' : ''),
        onclick: () => {
          if (c.id === 'none') p.careHabits = p.careHabits.includes('none') ? [] : ['none'];
          else p.careHabits = p.careHabits.includes(c.id) ? p.careHabits.filter((x) => x !== c.id) : [...p.careHabits.filter((x) => x !== 'none'), c.id];
          draw();
        },
      }, h('b', null, c.label)))));
  }

  function timeStep() {
    return h('div', null,
      h('h1', null, 'כמה זמן פנוי יש לך ביום?'),
      h('p', { class: 'lead' }, 'התוכנית תתאים את כמות המשימות לזמן הזה. גם 10 דקות ביום עושות שינוי.'),
      h('div', { class: 'opt-grid' }, MINUTES.map((m) => h('button', {
        type: 'button', class: 'opt' + (p.minutes === m ? ' on' : ''), onclick: () => { p.minutes = m; draw(); },
      }, h('b', { style: { fontSize: '22px' } }, m === 60 ? '60+' : String(m)), h('small', null, 'דקות ביום')))));
  }

  function programStep() {
    return h('div', null,
      h('h1', null, 'באיזה מסלול להתחיל?'),
      h('p', { class: 'lead' }, 'אפשר להחליף מסלול וקצב בכל רגע.'),
      h('div', { class: 'opt-list' }, PROGRAMS.map((pr) => h('button', {
        type: 'button', class: 'opt' + (p.program === pr.length ? ' on' : ''), onclick: () => { p.program = pr.length; draw(); },
      }, h('span', { class: 'oi' }, ic(pr.icon)), h('div', null, h('b', null, pr.name), h('small', { style: { display: 'block' } }, pr.sub))))),
      h('div', { class: 'field mt2' }, h('span', null, 'קצב'),
        h('div', { class: 'chips' }, PACES.map((pc) => h('button', { type: 'button', class: 'chip' + (p.pace === pc.id ? ' on' : ''), onclick: () => { p.pace = pc.id; draw(); } }, pc.label))),
        h('p', { class: 'small muted', style: { marginTop: '8px' } }, PACES.find((x) => x.id === p.pace).desc)));
  }

  function analyzeStep() {
    const items = ['מנתחים את המטרות שלך', 'מתאימים שגרת טיפוח לסוג העור', 'בוחרים אימונים לפי הרמה שלך', 'מאזנים את המשימות לזמן הפנוי', 'בונים את התוכנית האישית'];
    const ul = h('ul', null, items.map((t) => h('li', null, '○ ' + t)));
    const wrap = h('div', { class: 'analyzing' },
      h('div', { class: 'spinner' }),
      h('h1', null, `רגע, ${p.name.trim()}...`),
      h('p', { class: 'lead' }, 'בונים תוכנית שמתאימה בדיוק לך'),
      ul);
    const fast = document.documentElement.dataset.motion === 'reduce' || navigator.webdriver;
    items.forEach((t, i) => setTimeout(() => {
      const li = ul.children[i]; li.textContent = '✓ ' + t; li.classList.add('ok');
    }, fast ? 20 * (i + 1) : 450 * (i + 1)));
    setTimeout(finish, fast ? 150 : 450 * items.length + 500);
    return wrap;
  }

  function finish() {
    update((s) => {
      s.profile = {
        name: p.name.trim(), address: p.address, age: p.age, goals: p.goals, areas: p.areas.length ? p.areas : ['skin', 'fitness'],
        skinType: p.skinType, hairType: p.hairType, hairLength: p.hairLength, styles: p.styles, fitnessLevel: p.fitnessLevel,
        careHabits: p.careHabits, minutes: p.minutes, createdAt: Date.now(), avatarId: null, faceShape: null, hairColor: 'brown',
      };
      s.program = { length: p.program, startDate: todayKey(), pace: p.pace, extraTasks: [], hiddenTasks: [], history: [] };
      s.routines = defaultRoutines(s.profile);
      s.onboarded = true;
      s.tourDone = false;
      s.coach.messages = [{ id: uid(), role: 'assistant', text: `היי ${p.name.trim()}! אני המאמן של GLOW UP 💜\nבניתי לך ${PROGRAMS.find((x) => x.length === p.program).name} לפי התשובות שלך. אפשר לשאול אותי על טיפוח, תספורות, אימונים, תזונה, לוקים או איך להתמיד – ואני אסביר צעד אחר צעד.`, at: Date.now() }];
    });
    done();
  }

  draw();
  return root;
}
