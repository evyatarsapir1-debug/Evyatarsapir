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
  await page.getByRole('button', { name: /שומני/ }).click();
  await next(); // hair
  await page.getByRole('button', { name: /^גלי/ }).click();
  await next(); // style
  await page.getByRole('button', { name: 'סטריט' }).click();
  await page.getByRole('button', { name: 'יומיומי נוח' }).click();
  await next(); // fitness
  await page.getByRole('button', { name: /מתחיל\/ה/ }).click();
  await next(); // habits
  await page.getByRole('button', { name: /קרם לחות/ }).click();
  await next(); // time
  await page.getByRole('button', { name: /^30/ }).click();
  await next(); // program
  await page.getByRole('button', { name: /תוכנית 30 ימים/ }).click();
  await next(); // analyze
});

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
  await page.getByRole('tab', { name: 'יום 3' }).click();
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
  await expectText('סקוואט');
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
  await page.locator('.msg.bot', { hasText: 'לא בונה דיאטות' }).waitFor({ timeout: 4000 });
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
await step('delete all data resets to onboarding', async () => {
  await page.goto(BASE + '#/settings');
  await page.locator('.list-row', { hasText: 'מחיקת כל המידע' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'מחיקה מלאה' }).click();
  await expectText('בואו נתחיל');
});

await browser.close();
console.log(`\n${passed} passed, ${errors.length} problem(s)`);
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
