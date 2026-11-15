// Automated test (Playwright + headless Chromium). Checks that every system really works — on the actual hair.
// Usage: ./tests/serve.sh &   then:  node tests/smoke.mjs [screenshotDir]
// The page runs with ?manual so the test steps frames itself (software WebGL is slow).
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = (process.env.GAME_URL || 'http://localhost:8090/index.html') + '?manual';
const OUT = process.argv[2] || '.';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { ctx, page };
}
const settle = (page, n = 30) => page.evaluate((n) => { for (let i = 0; i < n; i++) __barber.frame(1 / 30, false); __barber.frame(1 / 30); }, n);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 });
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const closeModals = (page) => ev(page, () => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));
const stepW = (page, n = 10) => page.evaluate((n) => { for (let i = 0; i < n; i++) __barber.frame(1 / 30, false); }, n);
/** Walk up to the academy reception in the city and talk to the secretary. */
async function enterAcademy(page) {
  await closeModals(page);
  await ev(page, () => { const b = __barber.world.city.buildings.academy; __barber.world.teleport(b.desk.x, b.desk.z); });
  await stepW(page, 10);
  await ev(page, () => __barber.world.interact());
}

const { ctx, page } = await open({ width: 1100, height: 720 });
await page.goto(URL);
await page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
await ev(page, () => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
check('loads to title screen', true);

// ---------------------------------------------------------------- name + hub
await page.click('#btnStart');
check('asks for a name on first start', await page.isVisible('#nameModal'));
await page.fill('#nameInput', 'נועה');
await page.click('#nameSave');
check('game starts in the open world', await ev(page, () => __barber.state.phase === 'world' && !document.getElementById('worldHud').classList.contains('hidden')));
await enterAcademy(page);
check('academy reception opens the school menu', await ev(page, () => !document.getElementById('hub').classList.contains('hidden') && document.getElementById('hubName').textContent === 'נועה' && !document.getElementById('hubCity').classList.contains('hidden')));
const cards = await ev(page, () => [...document.querySelectorAll('[data-go]')].map((b) => b.dataset.go));
check('academy has all sections', ['lessons', 'lab', 'practice', 'clients', 'daily', 'library', 'dictionary', 'awards'].every((c) => cards.includes(c)), cards.join(','));
await settle(page, 2);
await shot(page, '01-hub');

// ---------------------------------------------------------------- free practice (phase-1 behaviour kept)
await page.click('[data-go="practice"]');
await page.click('[data-free="daniel"]');
await page.click('#helpModal [data-close]');
check('free practice starts in 3D', await ev(page, () => __barber.state.phase === 'play' && __barber.hair.count > 10000), await ev(page, () => `${__barber.hair.count} strands`));
await page.click('[data-view="back"]');
await settle(page, 40);
await page.click('.guard[data-guard="1"]');
const pts = await ev(page, () => {
  const V = __barber.camera.position.constructor, out = [];
  for (let a = -0.6; a <= 0.6; a += 0.1) { const v = new V(Math.sin(Math.PI + a) * 0.075, 1.33, Math.cos(Math.PI + a) * 0.095); v.project(__barber.camera); out.push({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }); }
  return out;
});
const before = await ev(page, () => __barber.state.stats.hairsCut);
await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
for (const p of pts) await page.mouse.move(p.x, p.y, { steps: 3 });
await page.mouse.up();
const cutN = (await ev(page, () => __barber.state.stats.hairsCut)) - before;
check('mouse drag on the head cuts hair', cutN > 100, `${cutN} strands`);
check('cut strands are exactly guard length', await ev(page, () => Math.abs(Math.min(...__barber.hair.lengths) - 3) < 0.01));
await settle(page, 60);
check('cut hair falls as clippings', await ev(page, () => __barber.clippings.used > 10));
const th0 = await ev(page, () => __barber.cam.theta);
await page.mouse.move(150, 450); await page.mouse.down(); await page.mouse.move(350, 450, { steps: 5 }); await page.mouse.up();
check('drag outside the head orbits the camera', Math.abs((await ev(page, () => __barber.cam.theta)) - th0) > 0.5);
const s0 = await ev(page, () => __barber.hair.lengths.reduce((a, b) => a + b, 0));
await page.click('#btnUndo');
check('undo restores the hair', (await ev(page, () => __barber.hair.lengths.reduce((a, b) => a + b, 0))) > s0);

// scissors, thinning, duster
await page.click('.tool-card[data-tool="scissors"]');
await page.click('.slen[data-len="30"]');
check('scissors: comb height 30 mm', await ev(page, () => __barber.tools.active === 'scissors' && __barber.tools.cutMM === 30));
const top = await ev(page, () => {
  const ring = []; for (let a = -3.1; a <= 3.1; a += 0.08) for (const y of [0.7, 0.78, 0.86, 0.93, 0.985]) { const r = Math.sqrt(1 - y * y); ring.push([Math.sin(a) * r, y, Math.cos(a) * r]); }
  __barber.strokeDirs(ring);
  const h = __barber.hair; let mx = 0; for (let i = 0; i < h.count; i++) if (h.zone[i] === 'top' && h.dirs[i * 3 + 1] > 0.8) mx = Math.max(mx, h.lengths[i]);
  return mx;
});
check('scissors cut the top to 30 mm', top <= 30.01, `max ${top.toFixed(1)} mm`);
await page.click('.tool-card[data-tool="thinning"]');
const thin = await ev(page, () => {
  const h = __barber.hair, before = h.lengths.slice();
  const ring = []; for (let a = -1; a <= 1; a += 0.05) { const y = 0.5, r = Math.sqrt(1 - y * y); ring.push([Math.sin(a) * r, y, Math.cos(a) * r]); }
  __barber.strokeDirs(ring);
  let touched = 0, inArea = 0;
  for (let i = 0; i < h.count; i++) { const y = h.dirs[i * 3 + 1], z = h.dirs[i * 3 + 2]; if (Math.abs(y - 0.5) < 0.03 && z > 0.7) { inArea++; if (h.lengths[i] < before[i]) touched++; } }
  return { frac: touched / inArea };
});
check('thinning shortens only part of the strands', thin.frac > 0.1 && thin.frac < 0.6, `${Math.round(thin.frac * 100)}% in the stroke`);
await settle(page, 120);
const onCape = await ev(page, () => __barber.clippings.countOnClient());
await page.click('.tool-card[data-tool="duster"]');
await ev(page, () => { const B = __barber; for (const p of [[0.18, 1.1, 0], [-0.18, 1.1, 0], [0, 1.12, 0.12], [0, 1.12, -0.15], [0.12, 0.9, 0.2], [-0.12, 0.9, 0.2], [0, 0.67, 0.3]]) B.clippings.dust(new B.camera.position.constructor(...p), 0.25); });
await settle(page, 90);
const afterDust = await ev(page, () => __barber.clippings.countOnClient());
check('neck duster cleans hair off the cape', onCape > 0 && afterDust < onCape * 0.3, `${onCape} → ${afterDust}`);
await page.click('.tool-card[data-tool="clipper"]');
await page.click('.guard[data-guard="2"]');
await page.click('#btnLever');
check('taper lever adds 1.5 mm', await ev(page, () => __barber.tools.cutMM === 7.5));
await page.waitForTimeout(900);
const sig = await ev(page, () => __barber.hair.lengths.reduce((a, b) => a + b, 0));

// ---------------------------------------------------------------- reload: saved progress
await page.reload();
await page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
const sig2 = await ev(page, () => __barber.hair.lengths.reduce((a, b) => a + b, 0));
check('free-practice haircut is saved and restored after reload', Math.abs(sig - sig2) / sig < 0.001);
check('settings restored (guard 2 + lever)', await ev(page, () => __barber.tools.guard.id === '2' && __barber.tools.lever));
await page.click('#btnStart');
check('no name prompt the second time', await ev(page, () => document.getElementById('nameModal').classList.contains('hidden')));
await enterAcademy(page);

// ---------------------------------------------------------------- library, lab, demo, real analysis
await page.click('[data-go="library"]');
const libCount = await ev(page, () => document.querySelectorAll('[data-cut]').length);
check('haircut library lists dozens of haircuts', libCount >= 30, `${libCount}`);
await ev(page, () => __barber.ctx.showHub());
await page.click('[data-go="lab"]');
check('advanced haircuts locked at rank 1', await ev(page, () => document.querySelector('[data-cut="midFade"]').classList.contains('locked')));
await ev(page, () => { __barber.progress.reward(200, 0); __barber.ctx.showHub(); });
await page.click('[data-go="lab"]');
await page.click('[data-cut="midFade"]');
await page.waitForSelector('#cutPics img', { timeout: 180000 });
check('haircut pictures from 4 sides', (await ev(page, () => document.querySelectorAll('#cutPics img').length)) === 4);
check('numbered steps shown', (await ev(page, () => document.querySelectorAll('.steps-ol li').length)) >= 6);
await shot(page, '02-haircut-detail');
await page.click('#btnLab');
await closeModals(page);
check('lab session on mannequin with a target', await ev(page, () => __barber.session.active && __barber.hair.target && __barber.client.mannequin));
// untouched hair must NOT score well (no points for pressing buttons)
await page.click('#btnFinish');
const r0 = await ev(page, () => __barber.session.lastResult.overall);
check('untouched hair scores low', r0 < 45, `score ${r0}`);
await page.click('#btnContinue');
// demo cuts for real, then restore
await page.click('#btnDemo');
await ev(page, () => __barber.demo.finishNow());
const demoRes = await ev(page, () => { const r = __barber.session.analyze(); return { o: r.overall, s: r.scores }; });
check('3D demo really cuts a professional haircut', demoRes.o >= 85, `score ${demoRes.o}`);
await page.click('[data-view="back"]'); await settle(page, 40);
await shot(page, '03-demo-result');
await page.click('#btnDemo');
check('"back to before demo" restores the hair', await ev(page, () => __barber.hair.lengths.every((v, i) => v === __barber.hair.initial[i])));
// asymmetric work: only one side faded -> symmetry low and the tutor says which side
const asym = await ev(page, () => {
  const B = __barber;
  B.autoCut();
  const ring = []; for (let y = -0.5; y <= 0.4; y += 0.04) for (let a = 1.0; a <= 2.2; a += 0.05) { const r = Math.sqrt(1 - y * y); ring.push([Math.sin(a) * r, y, Math.cos(a) * r]); }
  B.selectGuard('0'); B.strokeDirs(ring);
  const r = B.session.analyze();
  return { sym: r.scores.symmetry, text: r.bad.join(' | '), o: r.overall };
});
check('asymmetric cut detected (symmetry drops, side named)', asym.sym < 0.85 && /סימטריה/.test(asym.text) && /(ימני|שמאלי)/.test(asym.text), `symmetry ${Math.round(asym.sym * 100)}%`);
await ev(page, () => { __barber.hair.regrow(); });
// a hard line: two guards with no blending
const line = await ev(page, () => {
  const B = __barber;
  const band = (g, y0, y1) => { B.selectGuard(g); const d = []; for (let y = y0; y <= y1; y += 0.03) for (let a = 0.9; a <= 5.4; a += 0.05) { const r = Math.sqrt(1 - y * y); d.push([Math.sin(a) * r, y, Math.cos(a) * r]); } B.strokeDirs(d); };
  band('8', -0.8, 0.5); band('0', -0.8, 0.1);
  const r = B.session.analyze();
  return { blend: r.scores.blend, text: r.bad.join(' | ') };
});
check('hard line between guards detected', line.blend < demoRes.s.blend - 0.1 && /קו חד/.test(line.text), `blend ${Math.round(line.blend * 100)}% (demo ${Math.round(demoRes.s.blend * 100)}%)`);
await page.click('#btnFinish');
check('results show tutor sections', await ev(page, () => ['מה פחות טוב', 'איך לתקן'].every((t) => document.getElementById('resultBody').textContent.includes(t))));
await shot(page, '04-tutor');
await page.click('#btnCompare');
check('compare: difference map on', await ev(page, () => __barber.hair.uniforms.uMapMode.value === 2));
await page.click('[data-cmp="pro"]');
check('compare: professional result shown', await ev(page, () => __barber.hair.display === 'pro'));
await settle(page, 30);
await shot(page, '05-pro-view');
await page.click('[data-cmp="mine"]');
await page.click('#btnFinish');
await page.click('#btnEnd');
check('lab result recorded', await ev(page, () => !!__barber.progress.data.haircuts.midFade));
await closeModals(page);

// ---------------------------------------------------------------- lessons
await ev(page, () => __barber.ctx.showHub());
await page.click('[data-go="lessons"]');
check('100 lessons in 10 chapters', (await ev(page, () => document.querySelectorAll('[data-lesson]').length)) === 100);
check('only the first lesson is open', await ev(page, () => document.querySelectorAll('.lesson-item.open').length === 1 && document.querySelector('[data-lesson="L1-2"]').classList.contains('locked')));
await page.click('[data-lesson="L1-1"]');
check('lesson page: explanation + visual + practice', await ev(page, () => !!document.querySelector('.lesson-text') && !!document.querySelector('.lesson-visual svg') && !!document.querySelector('.practice-box')));
await page.click('#btnRunLesson');
const answers = await ev(page, () => [1, 2]);
for (const a of answers) { await page.click(`.choice[data-k="${a}"]`); await page.click('#qNext'); }
check('quiz lesson passed', await ev(page, () => __barber.progress.lessonPassed('L1-1')));
await page.click('#qNextLesson');
await page.click('#btnRunLesson');
await closeModals(page);
await page.click('.tool-card[data-tool="trimmer"]');
check('wrong tool is not accepted', await ev(page, () => /\(1\/2\)/.test(document.getElementById('taskSub').textContent)));
await page.click('.tool-card[data-tool="clipper"]');
await page.click('.tool-card[data-tool="clipper"]');
await page.waitForTimeout(800);
check('pick-tool lesson completes', await ev(page, () => !document.getElementById('resultModal').classList.contains('hidden')));
await page.click('#btnEnd');
await closeModals(page);
check('pick-tool lesson passed', await ev(page, () => __barber.progress.lessonPassed('L1-2')));
// guard lesson
await ev(page, () => __barber.ctx.openLesson('L1-3'));
await page.click('#btnRunLesson');
await closeModals(page);
await page.click('.guard[data-guard="0"]');
await page.click('#btnCheck');
check('wrong guard is not accepted', await ev(page, () => /\(1\/4\)/.test(document.getElementById('taskSub').textContent)));
for (const g of ['2', '3', '1', '6']) { await page.click(`.guard[data-guard="${g}"]`); if (await ev(page, () => __barber.tools.lever)) await page.click('#btnLever'); await page.click('#btnCheck'); }
await page.waitForTimeout(800);
await page.click('#btnEnd');
await closeModals(page);
check('pick-guard lesson passed', await ev(page, () => __barber.progress.lessonPassed('L1-3')));
// tap-zone lesson (chapter 2 lesson 3), unlocked directly for the test
await ev(page, () => { const d = __barber.progress.data; for (const id of ['L1-4', 'L1-5', 'L1-6', 'L1-7', 'L1-8', 'L1-9', 'L1-10', 'L2-1', 'L2-2']) d.lessons[id] = { passed: true, best: 80, tries: 1 }; __barber.progress.save(); __barber.ctx.openLesson('L2-3'); });
await page.click('#btnRunLesson');
await closeModals(page);
const tap = await ev(page, () => {
  const B = __barber, V = B.camera.position.constructor, h = B.state.tapHandler;
  const at = (x, y, z) => ({ dir: new V(x, y, z).normalize() });
  h(at(0, -0.9, 0.2)); // wrong first (face/neck area is not "top")
  h(at(0, 0.98, 0.1)); h(at(0, -0.5, -0.85)); h(at(0.95, 0.2, 0)); h(at(-0.95, 0.2, 0));
  return B.progress.data.lessons['L2-3'];
});
await page.waitForTimeout(800);
check('tap-zone lesson: taps on the 3D head are checked', await ev(page, () => !document.getElementById('resultModal').classList.contains('hidden')));
await page.click('#btnEnd');
await closeModals(page);
check('tap-zone lesson passed', await ev(page, () => __barber.progress.lessonPassed('L2-3')));
void tap;
// chapter exam -> certificate
await ev(page, () => { const d = __barber.progress.data; delete d.lessons['L1-10']; __barber.progress.save(); __barber.ctx.openLesson('L1-10'); });
await page.click('#btnRunLesson');
for (const a of [1, 0, 1, 1, 1]) { await page.click(`.choice[data-k="${a}"]`); await page.click('#qNext'); }
await closeModals(page);
check('exam continues to the practical part', await ev(page, () => __barber.session.active && __barber.session.cfg.spec.id === 'buzz'));
await ev(page, () => __barber.autoCut());
await page.click('#btnFinish');
await page.click('#btnEnd');
check('chapter exam gives a certificate', await ev(page, () => __barber.progress.data.certificates.some((c) => c.id === 'ch1')));
await closeModals(page);

// ---------------------------------------------------------------- client with a real request
await ev(page, () => __barber.ctx.showHub());
const coins0 = await ev(page, () => __barber.progress.data.coins);
await page.click('[data-go="clients"]');
check('client explains his request', await ev(page, () => !document.getElementById('requestModal').classList.contains('hidden') && document.querySelector('.bubble').textContent.length > 10));
const correct = await ev(page, () => __barber.session.cfg.client.base.id);
await page.click(`.choice[data-id="${correct}"]`);
check('understanding the request is checked', await ev(page, () => __barber.session.cfg.understood === true));
await page.click('#reqGo');
await shot(page, '06-client');
await page.click('#btnHygiene');
check('disinfect tools', await ev(page, () => __barber.session.hygiene === true));
await ev(page, () => __barber.autoCut());
await settle(page, 120);
await ev(page, () => { const B = __barber; for (const p of [[0.18, 1.1, 0], [-0.18, 1.1, 0], [0, 1.12, 0.12], [0, 1.12, -0.15], [0.15, 0.9, 0.2], [-0.15, 0.9, 0.2], [0, 0.67, 0.3], [0.2, 0.8, 0], [-0.2, 0.8, 0]]) B.clippings.dust(new B.camera.position.constructor(...p), 0.3); });
await settle(page, 90);
await page.click('#btnFinish');
const cres = await ev(page, () => { const r = __barber.session.lastResult; return { o: r.overall, fb: r.feedback, req: r.scores.request, fin: r.scores.finish }; });
check('client gives feedback after the haircut', !!cres.fb && cres.fb.stars >= 3, `score ${cres.o}, ${cres.fb?.stars}★, request ${Math.round((cres.req ?? 0) * 100)}%, finish ${Math.round((cres.fin ?? 0) * 100)}%`);
await shot(page, '07-client-feedback');
await page.click('#btnEnd');
check('client pays coins', (await ev(page, () => __barber.progress.data.coins)) > coins0);
await closeModals(page);

// ---------------------------------------------------------------- daily, dictionary, awards
await ev(page, () => __barber.ctx.showHub());
await page.click('[data-go="daily"]');
check('daily challenge with a goal', await ev(page, () => !!document.querySelector('.daily-card h3') && !!document.getElementById('btnDaily')));
await ev(page, () => __barber.ctx.showHub());
await page.click('[data-go="dictionary"]');
const all = await ev(page, () => document.querySelectorAll('.term').length);
await page.fill('#dictSearch', 'fade');
const some = await ev(page, () => document.querySelectorAll('.term').length);
check('dictionary search (Hebrew + English)', all >= 50 && some > 0 && some < all, `${all} → ${some}`);
await page.fill('#dictSearch', 'פאות');
check('dictionary finds Hebrew term', (await ev(page, () => document.querySelectorAll('.term').length)) >= 1);
await page.click('[data-zone]');
check('"show on head" highlights a zone in 3D', await ev(page, () => __barber.hair.uniforms.uHighlight.value >= 0 && __barber.state.phase === 'play'));
await page.click('#btnHome');
await page.click('[data-go="awards"]');
check('awards: certificate drawn + achievements', await ev(page, () => document.querySelectorAll('.cert canvas').length >= 1 && document.querySelectorAll('.ach.got').length >= 3));
await shot(page, '08-awards');

// ---------------------------------------------------------------- open world
await ev(page, () => __barber.ctx.showHub());
await page.click('#hubCity');
check('back to the city from the academy (time passed)', await ev(page, () => __barber.state.phase === 'world'));
await closeModals(page);
await ev(page, () => { const L = __barber.progress.data.life; L.minute = 9 * 60 + 30; L.energy = 90; L.weather = 'clear'; __barber.world.sky.setWeather('clear'); });
// walking + walls
const w0 = await ev(page, () => { const b = __barber.world.city.buildings.studio; __barber.world.teleport(b.door.x + b.frame.out[0] * 3, b.door.z + b.frame.out[1] * 3, Math.atan2(b.frame.out[0], b.frame.out[1])); return { ...__barber.world.player.position }; });
await page.keyboard.down('KeyW'); await stepW(page, 45); await page.keyboard.up('KeyW');
const w1 = await ev(page, () => ({ ...__barber.world.player.position }));
check('walk with the keyboard', Math.hypot(w1.x - w0.x, w1.z - w0.z) > 2, `${Math.hypot(w1.x - w0.x, w1.z - w0.z).toFixed(1)} m`);
const wall = await ev(page, () => { const W = __barber.world, c = W.city.colliders.find((k) => k.maxX - k.minX > 6 && k.maxZ - k.minZ > 6); W.teleport((c.minX + c.maxX) / 2, c.minZ - 1, 0); for (let i = 0; i < 60; i++) { W.player.position.z += 0.1; W.collide(W.player.position, 0.32); } return W.player.position.z <= c.minZ; });
check('buildings are solid (collisions)', wall);
check('residents walk and cars drive', await ev(page, () => { const W = __barber.world; const a = W.people.list.map((p) => ({ ...p.mesh.position })), b = W.traffic.cars.map((c) => ({ ...c.mesh.position })); for (let i = 0; i < 30; i++) __barber.frame(1 / 30, false); return W.people.list.some((p, i) => a[i] && Math.hypot(p.mesh.position.x - a[i].x, p.mesh.position.z - a[i].z) > 0.5) && W.traffic.cars.some((c, i) => Math.hypot(c.mesh.position.x - b[i].x, c.mesh.position.z - b[i].z) > 2); }));
check('cars stop for a person on the road', await ev(page, () => { const W = __barber.world, car = W.traffic.cars[0]; const p = car.mesh.position, h = car.mesh.rotation.y; W.teleport(p.x + Math.sin(h) * 4, p.z + Math.cos(h) * 4); for (let i = 0; i < 40; i++) __barber.frame(1 / 30, false); return car.v < 1; }));
check('day and night: street lights at night', await ev(page, () => { const L = __barber.progress.data.life; L.minute = 22 * 60; __barber.frame(1 / 30, false); const night = __barber.world.sky.night; L.minute = 12 * 60; __barber.frame(1 / 30, false); const day = __barber.world.sky.night; L.minute = 9 * 60 + 30; return night > 0.6 && day < 0.2; }));
check('weather: rain', await ev(page, () => { __barber.world.sky.setWeather('rain'); __barber.frame(1 / 30, false); const ok = __barber.world.sky.rain.visible; __barber.world.sky.setWeather('clear'); return ok; }));
await ev(page, () => __barber.world.toggleMap(true));
check('map with important places', await ev(page, () => document.querySelectorAll('.map-item').length >= 12));
console.log('DIALOG?', await ev(page, () => document.getElementById('dialogModal').classList.contains('hidden') ? 'none' : document.getElementById('dialogTitle').textContent));
await page.click('.map-item:nth-child(2)');
check('set a waypoint from the map', await ev(page, () => !!__barber.world.waypoint));
// talk to a resident
const talked = await ev(page, () => { const W = __barber.world, p = W.people.list.find((x) => x.state === 'loop'); W.teleport(p.mesh.position.x + 0.8, p.mesh.position.z); for (let i = 0; i < 8; i++) __barber.frame(1 / 30, false); const it = W.current; if (it?.icon === '💬') { W.interact(); return document.getElementById('dialogTitle').textContent; } return it?.label; });
check('talk to people in the street', /💬/.test(talked || ''), talked);
await closeModals(page);
// a job in a barbershop
await ev(page, () => { const b = __barber.world.city.buildings.fadeHouse; __barber.world.teleport(b.reception.x, b.reception.z); });
await stepW(page, 10);
await ev(page, () => __barber.world.interact());
check('the owner offers a job (rank requirement met)', await ev(page, () => [...document.querySelectorAll('#dialogButtons button')].some((b) => b.textContent.includes('לעבוד כאן'))));
await page.click('#dialogButtons .btn.primary');
check('hired at Fade House', await ev(page, () => __barber.progress.data.life.job?.shopId === 'fadeHouse'));
await closeModals(page);
let seated = false;
for (let k = 0; k < 45 && !seated; k++) { await stepW(page, 60); seated = await ev(page, async () => (await import('./js/world/life.js')).life.runtimes.fadeHouse.waiting.length > 0); }
check('clients walk in from the street and sit down', seated);
await ev(page, () => { const sp = __barber.world.city.buildings.fadeHouse.stationSpots[0].barber; __barber.world.teleport(sp.x, sp.z); });
await stepW(page, 10);
const coinsJob = await ev(page, () => __barber.progress.data.coins);
await ev(page, () => __barber.world.interact());
check('working the chair starts a real haircut', await ev(page, () => __barber.session.active && __barber.state.phase === 'play'));
await page.click(`.choice[data-id="${await ev(page, () => __barber.session.cfg.client.base.id)}"]`);
await page.click('#reqGo');
await page.click('#btnHygiene');
await ev(page, () => __barber.autoCut());
await page.click('#btnFinish');
await page.click('#btnEnd');
check('paid by quality, back in the city, time moved', await ev(page, (c0) => __barber.state.phase === 'world' && __barber.progress.data.coins > c0 && __barber.progress.data.life.jobServed === 1, coinsJob));
await closeModals(page);
await shot(page, '11-city');
// real estate + your own barbershop
await ev(page, () => { __barber.progress.data.coins += 6000; __barber.progress.data.life.minute = 10 * 60; });
await ev(page, () => { const b = __barber.world.city.buildings.p1; __barber.world.teleport(b.inside.x, b.inside.z); });
await stepW(page, 10);
await ev(page, () => __barber.world.interact());
check('property details (size, location, rent, price)', await ev(page, () => /עמדות/.test(document.getElementById('dialogBody').textContent) && /שכירות/.test(document.getElementById('dialogBody').textContent)));
await page.click('#dialogButtons .btn.primary');
await page.waitForTimeout(600);
check('lease signed: branch created', await ev(page, () => !!__barber.progress.data.life.branches.p1));
await page.click('[data-buy="chair_classic"]');
await page.click('[data-buy="chair_classic"]');
await page.click('[data-tab="staff"]');
await page.click('[data-hire="0"]');
check('hire staff with salary + commission terms', await ev(page, () => { const e = __barber.progress.data.life.branches.p1.employees[0]; return !!e && e.salary > 0 && e.commission >= 0; }));
await page.click('[data-tab="design"]');
await page.fill('#brName', 'Fade Kings');
await page.click('#btnRename');
check('own shop furnished in 3D (stations + sign)', await ev(page, () => __barber.world.city.buildings.p1.stationSpots.length === 2));
await page.click('#sheetClose');
await closeModals(page);
let bseated = false;
for (let k = 0; k < 45 && !bseated; k++) { await stepW(page, 60); bseated = await ev(page, async () => (await import('./js/world/life.js')).life.runtimes.p1.waiting.length > 0); }
check('clients come to your shop by themselves', bseated);
await ev(page, () => { const sp = __barber.world.city.buildings.p1.stationSpots[0].barber; __barber.world.teleport(sp.x, sp.z); });
await stepW(page, 10);
await ev(page, () => __barber.world.interact());
await page.click(`.choice[data-id="${await ev(page, () => __barber.session.cfg.client.base.id)}"]`);
await page.click('#reqGo');
await page.click('#btnHygiene');
await ev(page, () => __barber.autoCut());
await page.click('#btnFinish');
await page.click('#btnEnd');
check('your shop: payment, review, customer remembered', await ev(page, () => { const b = __barber.progress.data.life.branches.p1; return b.today.income > 0 && b.reviews.length === 1 && Object.keys(b.customers).length === 1; }));
await closeModals(page);
await shot(page, '12-my-shop');
// life: cafe, clothes, car, sleep + daily accounts
await ev(page, () => { const L = __barber.progress.data.life; L.energy = 40; const b = __barber.world.city.buildings.cafe; __barber.world.teleport(b.counter.x, b.counter.z); });
await stepW(page, 10);
await ev(page, () => __barber.world.interact());
await page.click('#dialogButtons .btn.primary');
check('cafe meal restores energy', await ev(page, () => __barber.progress.data.life.energy > 90));
await ev(page, () => { const b = __barber.world.city.buildings.clothes; __barber.world.teleport(b.racks.x, b.racks.z); });
await stepW(page, 10);
await ev(page, () => __barber.world.interact());
await page.click('.outfit[data-cat="shirt"][data-col="#141414"]');
check('buy clothes and change the look', await ev(page, () => __barber.progress.data.life.outfit.wear.shirt === '#141414'));
await closeModals(page);
await ev(page, () => { __barber.progress.data.coins += 2000; const s = __barber.world.city.buildings.cars.carSpots[0].world; __barber.world.teleport(s.x, s.z); });
await stepW(page, 10);
await ev(page, () => __barber.world.interact());
await page.click('#dialogButtons .btn.primary');
check('buy a car', await ev(page, () => __barber.progress.data.life.cars.length === 1));
await ev(page, () => { const c = __barber.progress.data.life.cars[0]; __barber.world.teleport(c.x + 1, c.z); });
await stepW(page, 10);
await ev(page, () => __barber.world.interact());
await closeModals(page);
const d0 = await ev(page, () => ({ ...__barber.world.driving.mesh.position }));
await page.keyboard.down('KeyW'); await stepW(page, 60); await page.keyboard.up('KeyW');
check('drive the car around the city', await ev(page, (d0) => { const p = __barber.world.driving.mesh.position; return Math.hypot(p.x - d0.x, p.z - d0.z) > 5; }, d0));
await ev(page, () => __barber.world.exitCar());
const beforeSleep = await ev(page, () => ({ coins: __barber.progress.data.coins, day: __barber.progress.data.life.day }));
await ev(page, () => { __barber.progress.data.life.minute = 21 * 60; const b = __barber.world.city.buildings[__barber.progress.data.life.home]; __barber.world.teleport(b.bed.x, b.bed.z); });
await stepW(page, 10);
await ev(page, () => __barber.world.interact());
await page.click('#dialogButtons .btn.primary');
await page.waitForTimeout(500);
check('sleep: new day, daily report, rent and salaries paid', await ev(page, (b) => __barber.progress.data.life.day === b.day + 1 && /סיכום יום/.test(document.getElementById('dialogTitle').textContent) && __barber.progress.data.coins < b.coins && __barber.progress.data.life.branches.p1.ledger.length === 1, beforeSleep));
await shot(page, '13-daily-report');
await closeModals(page);
await page.click('#wPhone');
check('phone: career ladder + money', await ev(page, () => document.querySelectorAll('.ranks .rank').length === 7 && /כספים/.test(document.getElementById('sheetBody').textContent)));
await page.click('#sheetClose');
const lifeSig = await ev(page, () => JSON.stringify({ d: __barber.progress.data.life.day, b: Object.keys(__barber.progress.data.life.branches), c: __barber.progress.data.life.cars.length }));
await ev(page, () => __barber.world.suspend());
await page.reload();
await page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
await page.click('#btnStart');
check('the city life is saved (day, shop, car)', (await ev(page, () => JSON.stringify({ d: __barber.progress.data.life.day, b: Object.keys(__barber.progress.data.life.branches), c: __barber.progress.data.life.cars.length }))) === lifeSig);
await ctx.close();

// ---------------------------------------------------------------- phone
const m = await open({ width: 390, height: 844 }, true);
await m.page.goto(URL);
await m.page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
await ev(m.page, () => { localStorage.setItem('barber_life_v1', JSON.stringify({ profile: { name: 'test' }, seenHelp: true })); });
await m.page.reload();
await m.page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
await m.page.tap('#btnStart');
check('phone: city with joystick, no horizontal overflow', await ev(m.page, () => document.documentElement.scrollWidth <= innerWidth && getComputedStyle(document.getElementById('joy')).display !== 'none'));
await closeModals(m.page);
await ev(m.page, () => __barber.frame(1 / 30));
await shot(m.page, '09-phone-city');
await ev(m.page, () => { __barber.progress.reward(600, 0); __barber.world.suspend(); __barber.ctx.returnTo = 'hub'; __barber.ctx.showHub(); });
await m.page.tap('[data-go="lab"]');
await m.page.tap('[data-cut="lowFade"]');
await m.page.tap('#btnLab');
await ev(m.page, () => __barber.cam.setView('left'));
await settle(m.page, 40);
const c = await ev(m.page, () => { const v = new (__barber.camera.position.constructor)(0.077, 1.34, 0); v.project(__barber.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
const tb = await ev(m.page, () => __barber.state.stats.hairsCut);
const cdp = await m.ctx.newCDPSession(m.page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
await touch('touchStart', c.x - 20, c.y + 20);
for (let k = 0; k <= 10; k++) await touch('touchMove', c.x - 20 + k * 4, c.y + 20 - k * 4);
await touch('touchEnd');
check('phone: touch drag cuts hair in a lab session', (await ev(m.page, () => __barber.state.stats.hairsCut)) - tb > 30);
check('phone: no horizontal overflow in session', await ev(m.page, () => document.documentElement.scrollWidth <= innerWidth));
await settle(m.page, 20);
await shot(m.page, '10-phone-lab');
await m.ctx.close();

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
