// UX test: phone in landscape (touch), fresh save. Plays the whole interactive tutorial with real taps and checks
// that every step only advances after the action, that the pointer targets the right button, plus jump, controls
// settings, quests, GPS, profile, doors, car animation and saving.
// Usage: ./tests/serve.sh &   then:  node tests/ux.mjs [screenshotDir]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = (process.env.GAME_URL || 'http://localhost:8090/index.html') + '?manual';
const OUT = process.argv[2] || '.';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const ev = (fn, arg) => page.evaluate(fn, arg);
const stepW = (n = 10) => page.evaluate((n) => { for (let i = 0; i < n; i++) __barber.frame(1 / 30, false); }, n);
const render = () => page.evaluate(() => __barber.frame(1 / 30, true));
const shot = async (name) => { await render(); await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 }); };
const tutStep = () => ev(() => { const t = __barber.progress.data.life?.tutorial; return t ? (t.done ? 'done' : t.step) : null; });
/** let the tutorial's rAF loop run (it is driven by real time, not by our frame stepping) */
const wait = (ms) => page.waitForTimeout(ms);
const pointerOn = (sel) => ev((sel) => {
  const a = document.getElementById('tutRing'); const el = document.querySelector(sel);
  if (!a || a.classList.contains('hidden') || !el) return false;
  const r = el.getBoundingClientRect(), q = a.getBoundingClientRect();
  return Math.abs(q.left + 6 - r.left) < 3 && Math.abs(q.top + 6 - r.top) < 3;
}, sel);
const waitStep = async (n, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await tutStep()) === n) return true; await stepW(2); await wait(120); } return false; };

await page.goto(URL);
await page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
await ev(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
await page.tap('#btnStart');
await page.fill('#nameInput', 'רון');
await page.tap('#nameSave');
await stepW(15); await wait(400);
check('fresh player: tutorial starts automatically at step 1', (await tutStep()) === 0);
check('no old help popup over the tutorial', await ev(() => document.getElementById('worldHelp').classList.contains('hidden')));
check('step 1 points at the joystick', await pointerOn('#joy'));
await shot('u01-tutorial-move');

// --- 1. move: real touch drag on the joystick
const jr = await ev(() => { const r = document.getElementById('joy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
const cdp = await context.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
await touch('touchStart', jr.x, jr.y); await touch('touchMove', jr.x, jr.y - 30); await touch('touchMove', jr.x, jr.y - 50);
await wait(150);
check('dragging the joystick moves the stick', await ev(() => Math.abs(__barber.world.joy.y) > 0.5));
await stepW(5); await wait(300);
check('step 1 does not advance before walking 12 m', (await tutStep()) === 0);
for (let k = 0; k < 10 && (await tutStep()) === 0; k++) { await stepW(30); await wait(150); }
await touch('touchEnd');
check('walking 12 m completes step 1', await waitStep(1), `step ${await tutStep()}`);
await wait(1700); await stepW(2); await wait(300);
check('step 2 points at the map button', await pointerOn('#wMap'));

// --- 2. map: open then close
await page.tap('#wMap'); await wait(400);
check('map opens; step waits for closing', (await tutStep()) === 1 && await ev(() => !document.getElementById('mapOverlay').classList.contains('hidden')));
await shot('u02-map');
await page.tap('#mapClose');
check('closing the map completes step 2', await waitStep(2));
await wait(1700);

// --- 3. talk to a person (GPS shows the nearest resident)
await stepW(3); await wait(300);
check('step 3: GPS chip shows a target', await ev(() => !document.getElementById('gpsChip').classList.contains('hidden')));
await ev(() => { const w = __barber.world, n = w.people.list.find((p) => p.state === 'loop'); n.speed = 0.001; w.teleport(n.mesh.position.x + 1, n.mesh.position.z); });
await stepW(12); await wait(300);
check('interact button appears next to a person', await ev(() => !document.getElementById('wInteract').classList.contains('hidden') && /דבר עם/.test(document.getElementById('wInteract').textContent)));
check('step 3 points at the interact button', await pointerOn('#wInteract'));
await page.tap('#wInteract'); await wait(300);
check('talking completes step 3', await waitStep(3));
await ev(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));
await wait(1700);

// --- 4. enter the barbershop (wrong building gives a hint)
await ev(() => { const b = __barber.world.city.buildings.cafe; __barber.world.teleport(b.inside.x, b.inside.z); });
await stepW(5); await wait(500);
check('entering the wrong building shows a specific hint', await ev(() => /לא המספרה/.test(document.getElementById('tutHint').textContent)));
await ev(() => { const b = __barber.world.city.buildings.fadeHouse; __barber.world.teleport(b.door.x, b.door.z); });
await stepW(20);
check('sliding doors open when walking up', await ev(() => __barber.world.city.buildings.fadeHouse.doorOpen > 0.5));
await shot('u03-door');
await ev(() => { const b = __barber.world.city.buildings.fadeHouse; __barber.world.teleport(b.inside.x, b.inside.z); });
await stepW(3);
check('entering Fade House completes step 4', await waitStep(4));
await wait(1700);

// --- 5. get the job (talk to the owner, press the primary button)
await ev(() => { const b = __barber.world.city.buildings.fadeHouse; __barber.world.teleport(b.reception.x, b.reception.z); });
await stepW(12); await wait(300);
await page.tap('#wInteract'); await wait(300);
check('owner dialog: pointer on "I want to work here"', await pointerOn('#dialogButtons .btn.primary'));
await page.tap('#dialogButtons .btn.primary');
check('getting hired completes step 5', await waitStep(5));
await wait(1700);

// --- 6. learn: academy → lessons → pass the first lesson
await ev(() => { const b = __barber.world.city.buildings.academy; __barber.world.teleport(b.desk.x, b.desk.z); });
await stepW(12); await wait(200);
await page.tap('#wInteract'); await wait(300);
await ev(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));
await wait(300);
check('in the academy the pointer is on "lessons"', await pointerOn('[data-go="lessons"]'));
await shot('u04-academy');
await ev(() => { __barber.progress.recordLesson('L1-1', 100, true); });
check('passing a lesson completes step 6', await waitStep(6));
await wait(1700);

// --- 7. clipper + scissors in the simulation (practice head)
await stepW(1); await wait(300);
check('pointer on practice mode', await pointerOn('[data-go="practice"]'));
await page.tap('[data-go="practice"]'); await wait(200);
await page.tap('[data-free="daniel"]'); await wait(200);
await ev(() => document.getElementById('helpModal').classList.add('hidden'));
await ev(() => __barber.selectTool('trimmer'));
await wait(400);
check('station: pointer on the clipper button', await pointerOn('[data-tool="clipper"]'));
await shot('u05-station-tutorial');
await ev(() => { __barber.selectTool('clipper'); __barber.ctx.cutCount.clipper = (__barber.ctx.cutCount.clipper || 0) + 12; });
await wait(400);
check('after clipper strokes: pointer moves to scissors', await pointerOn('[data-tool="scissors"]'));
check('step 7 not done with clipper only', (await tutStep()) === 6);
await ev(() => { __barber.selectTool('scissors'); __barber.ctx.cutCount.scissors = (__barber.ctx.cutCount.scissors || 0) + 12; });
check('clipper + scissors completes step 7', await waitStep(7));
await wait(1700);

// --- 8. serve a real client at work (back to the city first)
check('step 8 tells you how to get back to the city', await ev(() => /חזור לעיר|חזרה לעיר/.test(document.getElementById('tutText').textContent)));
await ev(() => __barber.world.resume());
await ev(async () => { const L = (await import('./js/world/life.js')).life; L.state.minute = 6 * 60; });
await stepW(3); await wait(400);
check('shop closed: tutorial offers "wait for opening"', await ev(() => !document.getElementById('tutAction').classList.contains('hidden')));
await page.tap('#tutAction'); await wait(200);
check('waiting jumps to 9:00', await ev(async () => (await import('./js/world/life.js')).life.hour >= 9));
await ev(() => { const sp = __barber.world.city.buildings.fadeHouse.stationSpots[0].barber; __barber.world.teleport(sp.x, sp.z); });
let seated = false;
for (let k = 0; k < 60 && !seated; k++) { await stepW(30); await wait(30); seated = await ev(async () => (await import('./js/world/life.js')).life.runtimes.fadeHouse.waiting.length > 0); }
check('tutorial brings a client quickly', seated);
await stepW(12);
await page.tap('#wInteract'); await wait(300);
check('serving starts a real haircut', await ev(() => __barber.state.phase === 'play' && !!__barber.session.cfg?.client));
await ev(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));
await ev(() => { __barber.autoCut(__barber.session.cfg.spec); __barber.session.finish(); });
await wait(200);
check('client checks the mirror then the result shows', await ev(() => !document.getElementById('resultModal').classList.contains('hidden')));
const coins0 = await ev(() => __barber.progress.data.coins);
await ev(() => document.getElementById('btnEnd').click());
await ev(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));
check('paid for the haircut', (await ev(() => __barber.progress.data.coins)) > coins0);
check('serving completes step 8', await waitStep(8));
await stepW(60);
check('client walks to the reception to pay', await ev(() => __barber.world.people.list.some((p) => ['looking', 'toPay', 'paying'].includes(p.state))));
await wait(1700);

// --- 9. money → phone
await ev(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'))); // promotion notices
await stepW(2); await wait(300);
check('step 9 points at the phone', await pointerOn('#wPhone'));
await page.tap('#wPhone');
check('opening the phone completes step 9', await waitStep(9));
await ev(() => __barber.world.resume());
await wait(1700);

// --- 10. realty
await ev(() => { const b = __barber.world.city.buildings.realty; __barber.world.teleport(b.desk.x, b.desk.z); });
await stepW(12); await wait(300);
await page.tap('#wInteract');
check('visiting the realty office finishes the tutorial', await waitStep('done', 5000));
await ev(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));
await ev(() => __barber.world.resume()); // leave the realty screen
await wait(2500);
check('tutorial card gone; mission log visible', await ev(() => document.getElementById('tutCard').classList.contains('hidden') && getComputedStyle(document.getElementById('questPanel')).display !== 'none'));

// ---------------------------------------------------------------- missions + GPS
const q = await ev(async () => { const m = await import('./js/world/quests.js'); return { cur: m.quests.current?.id, done: Object.keys(__barber.progress.data.life.quests) }; });
check('missions: finished ones saved, a current mission is shown', q.done.includes('firstLesson') && q.done.includes('getJob') && q.done.includes('firstClient') && !!q.cur, JSON.stringify(q));
await stepW(10);
check('GPS points to the mission place', await ev(() => !document.getElementById('gpsChip').classList.contains('hidden') && __barber.world.gpsArrow.visible));
await page.tap('#questHead');
check('mission log collapses and expands', await ev(() => document.getElementById('questPanel').classList.contains('min')));
await page.tap('#questHead');
await shot('u06-city-hud');

// ---------------------------------------------------------------- jump, run, settings
await ev(() => { const b = __barber.world.city.buildings.academy; __barber.world.teleport(b.door.x + 4, b.door.z + 4); });
await page.tap('#wJump');
await stepW(6);
const air = await ev(() => __barber.world.air);
check('jump button: player leaves the ground', air > 0.2, air.toFixed(2));
await stepW(30);
check('player lands again', await ev(() => __barber.world.air === 0));
await page.tap('#wRun');
check('run toggle', await ev(() => __barber.world.run && document.getElementById('wRun').classList.contains('on')));
await page.tap('#wRun');
await page.tap('#wSettings'); await wait(200);
check('settings dialog opens', await ev(() => !!document.getElementById('setScale')));
await ev(() => { const s = document.getElementById('setScale'); s.value = '1.3'; s.dispatchEvent(new Event('input')); const l = document.getElementById('setLeft'); l.checked = true; l.dispatchEvent(new Event('change')); });
const joyX = await ev(() => document.getElementById('joy').getBoundingClientRect().left);
check('bigger buttons + joystick moves to the right (left-handed)', joyX > 600 && await ev(() => getComputedStyle(document.getElementById('worldHud')).getPropertyValue('--ctl').trim() === '1.3'));
await ev(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));
await shot('u07-lefty');
await ev(() => document.getElementById('wSettings').click()); await wait(100);
await ev(() => document.getElementById('setMove').click()); await wait(100);
check('move-buttons mode', await ev(() => document.getElementById('worldHud').classList.contains('editing')));
const ar = await ev(() => { const r = document.getElementById('wActions').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 }; });
await touch('touchStart', ar.x, ar.y); for (let k = 1; k <= 6; k++) await touch('touchMove', ar.x, ar.y - k * 20); await touch('touchEnd');
check('dragging moves the action buttons and saves', await ev(() => !!JSON.parse(localStorage.getItem('barber_life_controls')).pos.wActions));
await page.tap('#editDone');
await ev(() => { document.getElementById('wSettings').click(); }); await wait(100);
await ev(() => { document.getElementById('setResetPos').click(); const l = document.getElementById('setLeft'); l.checked = false; l.dispatchEvent(new Event('change')); });
await ev(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));

// ---------------------------------------------------------------- car enter/exit animation
await ev(() => { __barber.progress.data.coins += 5000; });
await ev(async () => {
  const L = (await import('./js/world/life.js')).life; const w = __barber.world;
  const st = { id: 'scooter', x: w.player.position.x + 3, z: w.player.position.z, h: 0 }; L.state.cars.push(st); w.spawnCarMesh(st);
  w.enterCar(st);
});
await stepW(5);
check('entering a car is animated (walk to the door first)', await ev(() => __barber.world.anim?.type === 'enter' && !__barber.world.driving));
await stepW(40);
check('then driving', await ev(() => !!__barber.world.driving && !__barber.world.player.visible));
await ev(() => __barber.world.exitCar());
await stepW(5);
check('getting out is animated', await ev(() => __barber.world.anim?.type === 'exit' && __barber.world.player.visible));
await stepW(30);
check('back on foot', await ev(() => !__barber.world.anim && !__barber.world.driving && __barber.world.player.scale.x === 1));

// ---------------------------------------------------------------- staff barbers animate
check('staff barbers stand in the job shop', await ev(async () => (await import('./js/world/life.js')).life.runtimes.fadeHouse.staffMeshes.length >= 1));

// ---------------------------------------------------------------- profile + save/continue
await page.tap('#wPhone'); await wait(200);
await page.tap('[data-app="profile"]'); await wait(200);
check('profile shows level, missions and achievements', await ev(() => { const t = document.getElementById('sheetBody').textContent; return /רמה/.test(t) && /משימות/.test(t) && /הישגים/.test(t); }));
await shot('u08-profile');
await ev(() => document.getElementById('sheetBack').click());
await ev(() => __barber.world.resume());
const saved = await ev(() => { __barber.ctx.life.savePos(); const d = JSON.parse(localStorage.getItem('barber_life_v1')); return { coins: d.coins, job: d.life.job?.shopId, quests: Object.keys(d.life.quests).length, tut: d.life.tutorial.done, pos: d.life.pos }; });
check('save holds money, job, missions, tutorial and position', saved.coins > 0 && saved.job === 'fadeHouse' && saved.quests >= 3 && saved.tut && !!saved.pos, JSON.stringify(saved));
await page.reload();
await page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
await page.tap('#btnStart');
await stepW(5); await wait(300);
check('reload continues from the same point (no tutorial again)', await ev((p) => { const w = __barber.world.player.position; return Math.hypot(w.x - p.x, w.z - p.z) < 1 && __barber.progress.data.life.tutorial.done; }, saved.pos));

// ---------------------------------------------------------------- existing players can replay the tutorial
await ev(() => { document.getElementById('wSettings').click(); }); await wait(100);
await ev(() => document.getElementById('setTut').click()); await wait(300);
check('tutorial can be restarted from settings', (await tutStep()) === 0);
await page.tap('#tutSkip'); await wait(150);
await ev(() => document.querySelector('#dialogButtons .btn:not(.primary)').click()); await wait(200);
check('tutorial can be skipped', (await tutStep()) === 'done');

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
