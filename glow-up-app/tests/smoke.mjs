// End-to-end smoke test for GLOW UP.
// Usage: serve the app (./tests/serve.sh) then: node tests/smoke.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8090/';
const SHOTS = process.argv[3] || '';
const errors = [];
let passed = 0;
const ok = (name) => { passed++; console.log('  ✓', name); };
const fail = (name, e) => { errors.push(`${name}: ${e}`); console.log('  ✗', name, '-', e); };
async function step(name, fn) { try { await fn(); ok(name); } catch (e) { fail(name, e.message || e); } }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'he-IL' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const expectText = async (t) => { await page.getByText(t, { exact: false }).first().waitFor({ timeout: 4000 }); };
const next = () => page.locator('[data-next]').click();

await page.goto(BASE);

console.log('Stage 1 – onboarding');
await step('welcome screen', async () => { await expectText('בואו נתחיל'); await shot('01-welcome'); });
await step('validation blocks empty name', async () => {
  await next();
  await next();
  await expectText('איך לקרוא לך');
});
await step('fill profile', async () => {
  await page.fill('input[type=text]', 'נועם');
  await page.getByText('בלשון זכר').click();
  await next(); // age
  await page.locator('input[type=range]').fill('15');
  await expectText('גיל ההתבגרות');
  await next(); // goals
  for (const g of ['עור נקי ובריא', 'כושר וכוח', 'סטייל ולבוש', 'שינה טובה יותר', 'יציבה טובה']) await page.getByRole('button', { name: g }).click();
  await shot('02-goals');
  await next(); // areas
  await page.getByRole('button', { name: 'שיער' }).click();
  await page.getByRole('button', { name: 'תזונה' }).click();
  await page.getByRole('button', { name: 'היגיינה ורעננות' }).click();
  await next(); // skin
  await page.getByRole('button', { name: /^שומני/ }).click();
  await next(); // hair
  await page.getByRole('button', { name: /^גלי/ }).click();
  await next(); // style
  await page.getByRole('button', { name: 'סטריט' }).click();
  await page.getByRole('button', { name: 'יומיומי נוח' }).click();
  await next(); // fitness
  await page.getByRole('button', { name: /^מתחיל\/ה/ }).click();
  await next(); // habits
  await page.getByRole('button', { name: /^משתמש\/ת בקרם לחות/ }).click();
  await next(); // time
  await page.getByRole('button', { name: /^30/ }).click();
  await next(); // program
  await page.getByRole('button', { name: /תוכנית 30 ימים/ }).click();
  await next(); // analyze
});

if (errors.length) { console.log('onboarding failed – stopping'); console.log(errors.join('\n')); await browser.close(); process.exit(1); }
console.log('Stage 2 – home + tour');
await step('tour starts after onboarding', async () => { await page.locator('.tour-tip').waitFor({ timeout: 6000 }); await expectText('1. מסך הבית'); await shot('03-tour-1'); });
await step('tour walks all 8 steps across screens', async () => {
  for (let i = 2; i <= 8; i++) {
    await page.locator('[data-tour-next]').click();
    await page.locator('.tour-tip h3', { hasText: `${i}.` }).waitFor({ timeout: 5000 });
    if (i === 4) await shot('04-tour-coach');
  }
  await page.locator('[data-tour-next]').click();
  await page.locator('.tour-layer').waitFor({ state: 'detached', timeout: 3000 });
});
await step('home shows greeting, plan, tasks, tip, shortcuts', async () => {
  await page.waitForURL(/#\/home/);
  await expectText('נועם');
  await expectText('יום 1 מתוך 30');
  await expectText('המשימות להיום');
  await expectText('הטיפ היומי');
  await expectText('כל תחומי הגלואו אפ');
  await shot('05-home');
});

console.log('Stage 3 – tasks & routine');
let firstTask;
await step('complete a task and see progress', async () => {
  firstTask = await page.locator('[data-tour="tasks"] .check').first().getAttribute('data-task');
  await page.locator(`[data-tour="tasks"] .check[data-task="${firstTask}"]`).click();
  await page.locator(`[data-tour="tasks"] .check.on[data-task="${firstTask}"]`).waitFor();
  await page.locator('.streak', { hasText: '1' }).waitFor();
});
await step('task sheet explains step by step', async () => {
  await page.locator('[data-tour="tasks"] .task-body').first().click();
  await expectText('צעד אחר צעד');
  await shot('06-task-sheet');
  await page.keyboard.press('Escape');
});
await step('persistence after reload', async () => {
  await page.reload();
  await page.locator(`[data-tour="tasks"] .check.on[data-task="${firstTask}"]`).waitFor();
  if (await page.locator('.tour-layer').count()) throw new Error('tour reappeared after completion');
});
await step('plans: switch program day, add custom task, pace', async () => {
  await page.goto(BASE + '#/plans');
  await expectText('מסלולי התקדמות');
  await page.getByRole('button', { name: 'משימה אישית' }).click();
  await page.locator('.sheet input').first().fill('10 דקות קריאה');
  await page.locator('.sheet').getByRole('button', { name: 'הוספה' }).click();
  await expectText('10 דקות קריאה');
  await page.locator('.chip', { hasText: 'רגוע' }).click();
  await expectText('הקצב עודכן');
  await page.locator('.chip', { hasText: 'מאוזן' }).click();
  await page.getByRole('tab', { name: 'יום 3', exact: true }).click();
  await expectText('אפשר לסמן משימות רק ביום עצמו');
  await shot('07-plans');
});
await step('routine: edit routine, log sleep, reminder', async () => {
  await page.goto(BASE + '#/routine');
  await expectText('שגרת בוקר');
  await page.locator('.card .check').first().click();
  await page.goto(BASE + '#/routine?tab=sleep');
  await page.locator('[data-sleep-save]').click();
  await expectText('שעות שינה');
  await page.goto(BASE + '#/routine?tab=reminders');
  await page.locator('.chip', { hasText: 'לשתות מים' }).click();
  await expectText('התזכורת נוספה');
  await page.goto(BASE + '#/routine?tab=day');
  await expectText('הוספת פעילות ליום');
});

console.log('Stage 4 – care, hair, style');
await step('skincare routine tracker completes AM task', async () => {
  await page.goto(BASE + '#/care');
  const am = page.locator('[data-tour="skin-routine"] .card').first();
  const n = await am.locator('.check').count();
  for (let i = 0; i < n; i++) await am.locator('.check').nth(i).click();
  await expectText('שגרת הבוקר הושלמה');
  await shot('08-care');
});
await step('add my product', async () => {
  await page.getByRole('button', { name: 'הוספת מוצר' }).click();
  await page.locator('.sheet input').first().fill('ג׳ל ניקוי עדין');
  await page.locator('.sheet').getByRole('button', { name: 'שמירה' }).click();
  await expectText('המוצר שלך: ג׳ל ניקוי עדין');
});
await step('face guides incl. jaw honesty', async () => {
  await page.goto(BASE + '#/guide/jaw');
  await expectText('אין הוכחה מדעית');
});
await step('haircut library, save and detail', async () => {
  await page.goto(BASE + '#/hair');
  await page.locator('.cut-card').first().waitFor();
  const n = await page.locator('.cut-card').count();
  if (n < 12) throw new Error('only ' + n + ' cuts');
  await shot('09-hair');
  await page.locator('.cut-card .save').first().click();
  await page.goto(BASE + '#/hair?tab=saved');
  await page.locator('.cut-card').first().waitFor();
  await page.goto(BASE + '#/cut/mid-fade');
  await expectText('מה להגיד לספר');
});
await step('wardrobe: sample wardrobe + manual item', async () => {
  await page.goto(BASE + '#/style');
  await page.getByRole('button', { name: 'ארון לדוגמה' }).click();
  await page.locator('.ward-item').nth(5).waitFor();
  await page.locator('[data-tour="add-item"]').click();
  await page.locator('.sheet input.input').first().fill('קפוצ׳ון סגול');
  await page.locator('.sheet .swatches button[title="סגול"]').click();
  await page.locator('.sheet').getByRole('button', { name: 'שמירה' }).click();
  await expectText('קפוצ׳ון סגול');
  await shot('10-wardrobe');
});
await step('stylist suggests outfits and saves a look', async () => {
  await page.goto(BASE + '#/style?tab=stylist&occ=school');
  await expectText('הצעה 1');
  await page.getByRole('button', { name: 'שמירת הלוק' }).first().click();
  await page.goto(BASE + '#/style?tab=looks');
  await page.locator('.outfit').first().waitFor();
  await shot('11-looks');
});

await step('stylist: "plain shirts only" builds full outfits (top + pants + shoes)', async () => {
  await page.goto(BASE + '#/style?tab=stylist&mode=dress');
  await page.locator('[data-stylist-q]').fill('רק חולצות חלקות לבית ספר');
  await page.locator('[data-stylist-ask]').click();
  await page.getByText('הלוקים שלך · בית ספר', { exact: false }).waitFor();
  const cards = page.locator('.outfit-card');
  if ((await cards.count()) < 2) throw new Error('expected outfits');
  const txt = await page.locator('.outfit-card').allInnerTexts();
  if (txt.some((t) => t.includes('הדפס'))) throw new Error('printed shirt in plain-only results');
  for (const t of txt) for (const need of ['חולצה', 'מכנסיים', 'נעליים']) if (!t.includes(need) && !(need === 'חולצה' && t.includes('שכבה'))) throw new Error('outfit missing ' + need + ': ' + t.slice(0, 80));
  if (!(await page.locator('[data-plain]').isChecked())) throw new Error('plain toggle not set');
  await shot('27-stylist');
  await page.locator('[data-save-look]').first().click();
  await expectText('הלוק נשמר');
});
await step('stylist: what goes with a hoodie – and what does not', async () => {
  await page.locator('[data-stylist-q]').fill('מה לא מתאים לפוטר אפור?');
  await page.locator('[data-stylist-ask]').click();
  await page.locator('[data-match="hoodie"]').waitFor();
  await page.locator('[data-avoid]', { hasText: 'מכנסיים מחויטים' }).waitFor();
  await page.locator('[data-match="hoodie"]', { hasText: 'ג׳ינס' }).waitFor();
  await expectText('3 לוקים עם קפוצ׳ון אפור');
  await shot('28-match');
});
await step('stylist: from my wardrobe + generic look saved + photos need AI', async () => {
  await page.goto(BASE + '#/style?tab=stylist&mode=wardrobe');
  await expectText('הצעה 1');
  await page.locator('[data-my-pick] .ward-item').first().click();
  await page.locator('[data-my-match]').waitFor();
  await page.goto(BASE + '#/style?tab=looks');
  await page.locator('.pieces').first().waitFor();
  await page.goto(BASE + '#/style?tab=stylist&mode=photos');
  await expectText('התייעצות עם תמונות צריכה AI');
});

console.log('Stage 5 – fitness & nutrition');
await step('exercise library with filters', async () => {
  await page.goto(BASE + '#/fitness?tab=library&lv=all');
  const n = await page.locator('.cut-card').count();
  if (n < 40) throw new Error('only ' + n + ' exercises');
  await page.locator('.chip', { hasText: 'גב' }).first().click();
  await page.locator('.cut-card').first().waitFor();
});
await step('exercise detail: animated demo, muscles, mistakes, levels', async () => {
  await page.goto(BASE + '#/exercise/pushup');
  await expectText('שרירים שעובדים');
  await expectText('טעויות נפוצות');
  await expectText('קל יותר');
  if (!(await page.locator('.media svg animate').count())) throw new Error('no animation');
  await shot('12-exercise');
});
await step('guided workout + history', async () => {
  await page.goto(BASE + '#/workout/full1');
  await page.getByRole('button', { name: 'מצב אימון מודרך' }).click();
  await expectText('סט 1');
  await page.locator('.sheet').getByRole('button', { name: /סיימתי/ }).click();
  await page.locator('.sheet').getByRole('button', { name: 'דילוג' }).first().click();
  await page.keyboard.press('Escape');
  await page.goto(BASE + '#/workout/full1');
  await page.getByRole('button', { name: 'סימון שהאימון בוצע' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'שמירה בהיסטוריה' }).click();
  await page.waitForURL(/tab=history/);
  await expectText('אימון כל הגוף');
});
await step('free workout log', async () => {
  await page.goto(BASE + '#/log?ex=squat');
  await page.locator('.card b', { hasText: 'סקוואט' }).waitFor();
  await page.getByRole('button', { name: 'שמירה' }).click();
  await page.waitForURL(/tab=history/);
});
await step('recovery advice', async () => {
  await page.goto(BASE + '#/fitness?tab=recovery');
  await page.locator('.chip', { hasText: 'כאב חד' }).click();
  await expectText('לא להתאמן על האזור');
});
await step('nutrition: water + menu + meals', async () => {
  await page.goto(BASE + '#/nutrition');
  for (let i = 0; i < 3; i++) await page.locator('[data-water-add]').click();
  await expectText('3 מתוך 8');
  await expectText('לא סופרת קלוריות');
  await page.locator('.list-row', { hasText: 'ארוחת בוקר' }).first().click();
  await page.locator('.sheet .list-row').first().click();
  await expectText('נוסף לתפריט');
  await page.goto(BASE + '#/nutrition?tab=meals&type=lunch&f=vegan');
  await page.locator('.card b').first().waitFor();
  await shot('13-nutrition');
});

console.log('Stage 6 – coach');
await step('coach (built-in guide) answers and is labeled honestly', async () => {
  await page.goto(BASE + '#/coach');
  await expectText('מצב מדריך (ללא AI)');
  await page.locator('.composer textarea').fill('איזו תספורת תתאים לי?');
  await page.locator('.composer .btn').click();
  await page.locator('.msg.bot', { hasText: 'תספורות שכדאי לבדוק' }).waitFor({ timeout: 4000 });
  await page.locator('.chip', { hasText: 'תציע לי לוק לבית ספר' }).click();
  await page.locator('.msg.bot', { hasText: 'לוק לבית ספר' }).waitFor({ timeout: 4000 });
  await page.locator('.composer textarea').fill('אני רוצה לעשות דיאטה ולרזות');
  await page.locator('.composer .btn').click();
  await page.locator('.msg.bot', { hasText: 'בלי דיאטה' }).waitFor({ timeout: 4000 });
  await page.locator('.composer textarea').fill('איך אני מתקדם?');
  await page.locator('.composer .btn').click();
  await page.locator('.msg.bot', { hasText: 'סיכום 7 הימים' }).waitFor({ timeout: 4000 });
  await shot('14-coach');
});
await step('coach prefill from other screens', async () => {
  await page.goto(BASE + '#/coach?q=' + encodeURIComponent('שאלה לבדיקה'));
  if ((await page.locator('.composer textarea').inputValue()) !== 'שאלה לבדיקה') throw new Error('no prefill');
});

console.log('Stage 7 – progress, products, settings');
await step('progress screen', async () => {
  await page.goto(BASE + '#/progress');
  await expectText('הישגים');
  await expectText('יומן תמונות פרטי');
  if (!(await page.locator('.ach .a.on').count())) throw new Error('no achievements unlocked');
  await shot('15-progress');
});
await step('products + shopping list + budget', async () => {
  await page.goto(BASE + '#/products');
  await page.getByRole('button', { name: 'לרשימה' }).first().click();
  await page.goto(BASE + '#/products?tab=budget');
  await page.getByRole('button', { name: 'הגדרת תקציב' }).click();
  await page.locator('.sheet .chip', { hasText: '₪200' }).click();
  await page.getByRole('button', { name: 'הוספת הוצאה' }).click();
  await page.locator('.sheet input[type=number]').fill('45');
  await page.locator('.sheet input').nth(1).fill('קרם הגנה');
  await page.locator('.sheet').getByRole('button', { name: 'שמירה' }).click();
  await expectText('₪155');
  await shot('16-budget');
});
await step('settings: theme toggle + coach section + edit profile', async () => {
  await page.goto(BASE + '#/settings');
  await expectText('מאמן AI');
  await page.locator('.list-row', { hasText: 'מצב כהה' }).locator('input').click({ force: true });
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== 'light') throw new Error('theme not light');
  await shot('17-settings-light');
  await page.locator('.list-row', { hasText: 'מצב כהה' }).locator('input').click({ force: true });
  await page.locator('.list-row', { hasText: 'זמן פנוי ביום' }).click();
  await page.locator('.sheet .chip', { hasText: '20 דקות' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'שמירה' }).click();
  await expectText('20 דקות');
});
await step('all routes render without errors', async () => {
  const routes = ['#/home', '#/care?tab=skin', '#/care?tab=face', '#/hair?tab=guides', '#/learn', '#/guide/acne', '#/fitness', '#/fitness?tab=history', '#/workout/upper', '#/workout/posture', '#/nutrition?tab=learn', '#/style?tab=guides', '#/routine', '#/plans', '#/products?tab=list', '#/settings?sec=coach', '#/progress', '#/coach'];
  for (const r of routes) {
    await page.goto(BASE + r);
    await page.locator('main.screen').waitFor({ timeout: 3000 });
  }
});
await step('bottom navigation works', async () => {
  await page.goto(BASE + '#/home');
  for (const [tab, hash] of [['care', '#/care'], ['fitness', '#/fitness'], ['style', '#/style'], ['coach', '#/coach'], ['home', '#/home']]) {
    await page.locator(`.nav [data-tab="${tab}"]`).click();
    await page.waitForURL(new RegExp(hash.replace('/', '\\/') + '$'));
  }
});
await step('tour can be replayed and skipped', async () => {
  await page.goto(BASE + '#/home');
  await page.getByRole('button', { name: 'הדרכה' }).click();
  await page.locator('.tour-tip').waitFor();
  await page.locator('[data-tour-skip]').click();
  await page.locator('.tour-layer').waitFor({ state: 'detached' });
});
await step('no horizontal overflow on phone width', async () => {
  for (const r of ['#/home', '#/style', '#/fitness?tab=library', '#/coach', '#/progress']) {
    await page.goto(BASE + r);
    await page.locator('main.screen').waitFor();
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > 392) throw new Error(`${r} scrollWidth ${w}`);
  }
});
console.log('Stage 8 – transformation program');
await step('teen: setup without calorie deficit', async () => {
  await page.goto(BASE + '#/home');
  await page.locator('[data-tf-cta]').click();
  await expectText('גרסת נוער');
  await page.locator('input[type=number]').nth(0).fill('170');
  await page.locator('input[type=number]').nth(1).fill('60');
  await expectText('לפי רעב');
  await page.locator('[data-tf-start]').click();
  await expectText('היעדים היומיים שלך');
  await expectText('אין יעד קלוריות');
  await shot('18-tf-teen');
});
await step('transformation tasks appear on home', async () => {
  await page.goto(BASE + '#/home');
  await page.locator('.check[data-task="tf-food"]').waitFor();
  await page.locator('.check[data-task="tf-face"]').waitFor();
  await expectText('השינוי שלי – היום');
});
await step('training session: targets, logging, records', async () => {
  await page.goto(BASE + '#/transform?tab=train');
  await expectText('האימון הבא');
  for (const inp of await page.locator('input[aria-label^="משקל סט"]:not([disabled])').all()) await inp.fill('10');
  await page.locator('[data-tf-finish]').click();
  await expectText('השיאים וההתקדמות שלך');
  await shot('19-tf-train');
});
await step('face protocol checklist', async () => {
  await page.goto(BASE + '#/transform?tab=face');
  await expectText('מה לא עובד');
  for (const id of ['bloat', 'skin', 'posture', 'teeth']) await page.locator(`[data-face="${id}"]`).click();
  await expectText('4/9');
  await shot('20-tf-face');
});
await step('adult: real calorie targets with safety floor', async () => {
  await page.goto(BASE + '#/settings');
  await page.locator('.list-row', { hasText: 'גיל' }).first().click();
  await page.locator('.sheet input[type=range]').fill('28');
  await page.locator('.sheet').getByRole('button', { name: 'שמירה' }).click();
  await page.goto(BASE + '#/transform?setup=1');
  await page.locator('.opt', { hasText: 'חיטוב והורדת שומן' }).click();
  await page.locator('.input[type=number]').nth(1).fill('85');
  await page.locator('.chip', { hasText: 'זכר' }).first().click();
  await page.locator('.input[placeholder="לחישוב לוח זמנים"]').fill('78');
  await page.locator('[data-tf-start]').click();
  await expectText('לוח זמנים משוער');
  const tg = await page.evaluate(async () => (await import('./js/transform.js')).computeTargets());
  if (!(tg.kcal >= 1500 && tg.kcal <= 3200) || tg.mode !== 'deficit' || tg.protein < 120) throw new Error(JSON.stringify(tg));
  const floor = await page.evaluate(async () => { const m = await import('./js/transform.js'); return m.computeTargets({ goal: 'cut', sex: 'f', heightCm: 150, startWeight: 45, activity: 'low', weights: [] }, { age: 60 }); });
  if (floor.kcal < 1200) throw new Error('floor broken ' + floor.kcal);
  await shot('21-tf-adult');
});
await step('progressive overload raises the weight when all sets hit max', async () => {
  const r = await page.evaluate(async () => {
    const m = await import('./js/transform.js'); const st = await import('./js/store.js');
    st.update((s) => { s.transform.lifts['goblet-squat'] = [{ date: '2026-01-01', sets: [{ w: 16, r: 12 }, { w: 16, r: 12 }, { w: 16, r: 12 }] }]; });
    const up = m.targetFor({ ex: 'goblet-squat', sets: 3, min: 8, max: 12, inc: 2 });
    st.update((s) => { s.transform.lifts['goblet-squat'].push({ date: '2026-01-03', sets: [{ w: 18, r: 9 }, { w: 18, r: 8 }, { w: 18, r: 8 }] }); });
    const same = m.targetFor({ ex: 'goblet-squat', sets: 3, min: 8, max: 12, inc: 2 });
    return { up, same };
  });
  if (r.up.weight !== 18 || !r.up.up) throw new Error('no increase ' + JSON.stringify(r.up));
  if (r.same.weight !== 18 || r.same.reps !== 9) throw new Error('wrong hold ' + JSON.stringify(r.same));
});
await step('weekly review auto-adjusts when progress stalls', async () => {
  const rev = await page.evaluate(async () => {
    const m = await import('./js/transform.js'); const st = await import('./js/store.js');
    st.update((s) => { s.transform.adjustments = []; s.transform.weights = Array.from({ length: 14 }, (_, i) => ({ date: st.addDays(st.todayKey(), -i), kg: 85 })); });
    return m.weeklyReview();
  });
  if (!rev || rev.delta !== -150) throw new Error(JSON.stringify(rev));
  await page.goto(BASE + '#/home');
  await page.goto(BASE + '#/transform');
  await page.getByRole('button', { name: /לעדכן \(/ }).click();
  await expectText('היעדים עודכנו');
});
await step('food log + example day reach targets', async () => {
  await page.goto(BASE + '#/transform?tab=food');
  const ex = await page.evaluate(async () => { const m = await import('./js/transform.js'); const tg = m.computeTargets(); return { tg, ex: m.exampleDay(0, tg) }; });
  if (Math.abs(ex.ex.totals.kcal - ex.tg.kcal) > ex.tg.kcal * 0.15) throw new Error('example day off ' + ex.ex.totals.kcal + ' vs ' + ex.tg.kcal);
  await page.locator('[data-food-add]').click();
  await page.locator('.sheet .list-row', { hasText: 'חזה עוף' }).getByRole('button', { name: 'הוספה' }).click();
  await expectText('חזה עוף');
  await page.getByRole('button', { name: 'ליומן' }).first().click();
  await expectText('נוספה ליומן');
  await shot('22-tf-food');
});
await step('body metrics: weight, steps, chart', async () => {
  await page.goto(BASE + '#/transform?tab=body');
  await page.locator('[data-tf-weight]').fill('84.6');
  await page.locator('[data-tf-save]').click();
  await expectText('ממוצע 7 ימים');
  await page.locator('svg[aria-label="גרף משקל"]').waitFor();
  await shot('23-tf-body');
});
await step('coach knows the transformation plan', async () => {
  await page.goto(BASE + '#/coach');
  await page.locator('.composer textarea').fill('איך אני משתנה באמת?');
  await page.locator('.composer .btn').click();
  await page.locator('.msg.bot', { hasText: 'המסלול שלך' }).waitFor({ timeout: 4000 });
});
console.log('Stage 9 – glow-up scan & shopping');
await step('manual scan (no AI): measurements → face shape + plan', async () => {
  await page.goto(BASE + '#/home');
  await page.locator('[data-scan-cta]').click();
  await expectText('בדיקה ידנית');
  for (const [k, v] of [['forehead', '13'], ['cheek', '13.5'], ['jaw', '11.5'], ['length', '19']]) await page.locator(`[data-measure="${k}"]`).fill(v);
  await page.locator('[data-manual-go]').click();
  await expectText('צורת פנים: אובלי');
  await expectText('מה לעשות השבוע');
  await expectText('בגדים לקנות');
  await page.locator('[data-scan-plan] .check').first().click();
  await expectText('1/5 בוצעו');
  await shot('24-scan-manual');
});
await step('scan → shopping list → bought goes to wardrobe', async () => {
  await page.getByRole('button', { name: 'לרשימה' }).first().click();
  await page.goto(BASE + '#/style?tab=shop');
  await expectText('רשימת הקניות שלך');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('glowup.state.v1') || '{}').wardrobe?.length || 0);
  await page.getByRole('button', { name: 'קניתי' }).first().click();
  await expectText('נוסף לארון הדיגיטלי');
  await page.waitForTimeout(150);
  const after = await page.evaluate(async () => (await import('./js/store.js')).getState().wardrobe.length);
  if (after !== before + 1 && after < 1) throw new Error(`wardrobe ${before} -> ${after}`);
  await shot('25-shop');
});
await step('home shows the plan from the scan', async () => {
  await page.goto(BASE + '#/home');
  await expectText('תוכנית הגלואו אפ שלך');
});
await step('delete all data resets to onboarding', async () => {
  await page.goto(BASE + '#/settings');
  await page.locator('.list-row', { hasText: 'מחיקת כל המידע' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'מחיקה מלאה' }).click();
  await expectText('בואו נתחיל');
});

// ---- AI photo scan with a simulated Claude (the viewer's `sample` capability) ----
console.log('Stage 10 – AI photo scan (simulated Claude)');
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push('pageerror(ai): ' + e.message));
  await p2.addInitScript(() => {
    const result = { faceShape: 'square', faceShapeWhy: 'לסת רחבה וזוויתית, מצח ולחיים ברוחב דומה.', strengths: ['גבות מלאות'],
      jaw: { observation: 'קו לסת רחב.', actions: ['הכנסת סנטר 3×10'] },
      hair: { current: 'שיער בינוני ללא צורה', recommended: [{ id: 'textured-crop', why: 'טקסטורה מרככת את הזוויות', askBarber: 'קרופ עם פייד אמצעי' }, { id: 'nope', why: 'x' }], avoid: [{ name: 'באז קאט', why: 'מבליט' }], styling: 'קליי מט', products: ['קליי'] },
      beard: 'זיפים קצרים', skin: { observation: 'אזור T שומני', actions: ['SPF'], seeDermatologist: false }, brows: 'לנקות במרכז',
      body: { seen: true, observation: 'גוף רזה', recommendation: 'bulk', why: 'למלא כתפיים' },
      style: { colors: ['navy', 'olive', 'pink-ish'], colorsWhy: 'מתאים לגוון', buy: [{ name: 'אוברשירט זית', category: 'layer', color: 'olive', why: 'מוסיף נפח', price: '₪150' }], avoid: ['לוגו ענק'] },
      quickWins: [{ title: 'לקבוע תור לספר', minutes: 5 }, { title: 'לקנות קליי', minutes: 10 }], plan: [{ weeks: '1-2', focus: 'שיער', actions: ['תספורת'] }], summary: 'סיכום קצר.' };
    let calls = 0;
    const sample = async () => ({ text: 'שלום! אני המאמן.', truncated: false });
    const stylist = { intro: 'הנה לוקים עם הקפוצ׳ון.', outfits: [{ name: 'לוק רחוב', pieces: [{ slot: 'layer', garment: 'hoodie', label: 'קפוצ׳ון', color: 'grey', fromPhoto: 1 }, { slot: 'top', garment: 'tee', label: 'טי לבנה', color: 'white' }, { slot: 'bottom', garment: 'slim-jeans', label: 'ג׳ינס כהה', color: 'denim' }, { slot: 'shoes', garment: 'white-sneakers', label: 'סניקרס', color: 'nope' }], why: ['ניטרלי ונקי'] }],
      works: ['ג׳ינס כהה'], avoid: [{ what: 'נעלי עור', why: 'רשמי מדי' }], tips: ['מידה נכונה'], items: [{ photo: 1, name: 'קפוצ׳ון אפור', garment: 'hoodie', category: 'layer', color: 'grey' }, { photo: 9, name: 'רפאים', category: 'top', color: 'black' }], missing: [{ name: 'סניקרס לבנות', category: 'shoes', color: 'white', why: 'משלים', price: '₪250' }] };
    sample.json = async (input, opts) => {
      calls++;
      if (/סטייליסט\/ית אישי/.test(String(input))) { window.__styCall = { hasImages: !!opts?.images?.length, prompt: String(input) }; return stylist; }
      window.__scanCall = { hasImages: !!opts?.images?.length, prompt: String(input).slice(0, 2000) }; return result;
    };
    sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg', 'image/png'] } });
    window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('glowup.state.v1', JSON.stringify({ version: 1, onboarded: true, tourDone: true,
      profile: { name: 'בדיקה', address: 'm', age: 16, goals: ['hair'], areas: ['hair'], skinType: 'oily', hairType: 'straight', hairLength: 'medium', styles: ['casual'], fitnessLevel: 'beginner', careHabits: [], minutes: 20, createdAt: 1 },
      program: { length: 30, startDate: today, pace: 'normal', extraTasks: [], hiddenTasks: [], history: [] }, days: {}, reminders: [], savedCuts: [], savedExercises: [], wardrobe: [], looks: [], budget: { monthly: 0, expenses: [] }, shopping: [], myProducts: [], photos: [], scans: [], styleShop: [],
      coach: { messages: [], provider: 'local', apiKey: '', shareProfile: true }, settings: { theme: 'dark', motion: 'reduce' },
      routines: { wake: '07:00', bed: '22:30', morning: [], evening: [], screenBreak: { on: false, every: 45 }, waterGoal: 8, sleepGoal: 9, blocks: [] } }));
  });
  await p2.goto(BASE + '#/scan');
  await step('AI scan: upload photo, analysis, sanitized results', async () => {
    await p2.locator('[data-slot="front"]').waitFor({ timeout: 6000 });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');
    const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.locator('[data-slot="front"]').click()]);
    await chooser.setFiles({ name: 'face.png', mimeType: 'image/png', buffer: png });
    await p2.locator('[data-slot="front"] img').waitFor();
    await p2.locator('[data-scan-go]').click();
    await p2.getByText('צורת פנים: מרובע').waitFor({ timeout: 8000 });
    const call = await p2.evaluate(() => window.__scanCall);
    if (!call?.hasImages) throw new Error('image not sent');
    if (!/מתחת לגיל 18/.test(call.prompt)) throw new Error('teen safety rule missing from prompt');
    await p2.getByText('טקסצ׳רד קרופ').first().waitFor();
    if (await p2.getByText('ההמלצה: חיטוב').count()) throw new Error('teen got cut');
    await p2.getByText('ההמלצה: בניית מסה').waitFor();
    if (SHOTS) await p2.screenshot({ path: `${SHOTS}/26-scan-ai.png`, fullPage: true });
  });
  await step('coach uses the real model when the viewer provides Claude', async () => {
    await p2.goto(BASE + '#/coach');
    await p2.getByText('AI מחובר').waitFor({ timeout: 6000 });
    await p2.locator('.composer textarea').fill('היי');
    await p2.locator('.composer .btn').click();
    await p2.locator('.msg.bot', { hasText: 'אני המאמן' }).waitFor({ timeout: 5000 });
  });
  await step('AI stylist: typed question → Claude outfits, sanitized', async () => {
    await p2.goto(BASE + '#/style?tab=stylist');
    await p2.getByText('מחובר ל-Claude').waitFor({ timeout: 6000 });
    await p2.locator('[data-stylist-q]').fill('רק חולצות חלקות, מה עם פוטר אפור?');
    await p2.locator('[data-stylist-ask]').click();
    await p2.locator('[data-ai-answer]').waitFor({ timeout: 6000 });
    await p2.getByText('לוק רחוב').waitFor();
    await p2.getByText('✗ מה לא יתאים').waitFor();
    const call = await p2.evaluate(() => window.__styCall);
    if (!/רק חולצות חלקות/.test(call.prompt)) throw new Error('plain constraint not sent');
    if (call.hasImages) throw new Error('images sent without photos');
  });
  await step('AI stylist: clothing photos → identified items + outfits', async () => {
    await p2.goto(BASE + '#/style?tab=stylist&mode=photos');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');
    const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.locator('[data-photo="0"]').click()]);
    await chooser.setFiles({ name: 'hoodie.png', mimeType: 'image/png', buffer: png });
    await p2.locator('[data-photo="0"] img').waitFor();
    await p2.locator('[data-photos-go]').click();
    await p2.getByText('מה זיהיתי בתמונות').waitFor({ timeout: 8000 });
    const call = await p2.evaluate(() => window.__styCall);
    if (!call.hasImages) throw new Error('photo not sent');
    if (await p2.getByText('רפאים').count()) throw new Error('item from a non-existent photo kept');
    await p2.getByText('מתמונה 1').first().waitFor();
    await p2.locator('.list-row', { hasText: 'קפוצ׳ון אפור' }).getByRole('button', { name: 'לארון' }).click();
    await p2.getByText('נוסף לארון').waitFor();
    if (SHOTS) await p2.screenshot({ path: `${SHOTS}/29-stylist-photos.png`, fullPage: true });
  });
  await ctx2.close();
}

await browser.close();
console.log(`\n${passed} passed, ${errors.length} problem(s)`);
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
