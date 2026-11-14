// Automated smoke test (Playwright + headless Chromium).
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

const { ctx, page } = await open({ width: 1100, height: 700 });
await page.goto(URL);
await page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
check('loads to title screen', true);
await page.evaluate(() => localStorage.clear());
await page.click('#btnStart');
check('help shown on first start', await page.isVisible('#helpModal'));
await page.click('#helpModal [data-close]');
check('game starts', await page.evaluate(() => __barber.state.phase === 'play'));

const info = await page.evaluate(() => ({ n: __barber.hair.count, len: Array.from(__barber.hair.lengths.slice(0, 50)) }));
check('thousands of 3D hair strands', info.n > 10000, `${info.n} strands`);

// Pick a screen point on the side of the head (back view) and drag the clipper over it with the mouse.
await page.click('[data-view="back"]');
await settle(page, 40);
await page.click('.guard[data-guard="1"]');
check('guard #1 selected', await page.evaluate(() => __barber.tools.guard.id === '1' && __barber.tools.cutMM === 3));
const pts = await page.evaluate(() => {
  const THREE_V = __barber.camera.position.constructor;
  const out = [];
  for (let a = -0.6; a <= 0.6; a += 0.1) {
    const v = new THREE_V(Math.sin(Math.PI + a) * 0.075, 1.34 - 0.01, Math.cos(Math.PI + a) * 0.095);
    v.project(__barber.camera);
    out.push({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight });
  }
  return out;
});
const before = await page.evaluate(() => __barber.state.stats.hairsCut);
await page.mouse.move(pts[0].x, pts[0].y);
await page.mouse.down();
for (const p of pts) await page.mouse.move(p.x, p.y, { steps: 3 });
await page.mouse.up();
const after = await page.evaluate(() => __barber.state.stats.hairsCut);
check('mouse drag on the head cuts hair', after - before > 100, `${after - before} strands cut`);
const minLen = await page.evaluate(() => Math.min(...__barber.hair.lengths));
check('cut strands are exactly guard length', Math.abs(minLen - 3) < 0.01, `min ${minLen.toFixed(2)} mm`);
await settle(page, 60);
const fallen = await page.evaluate(() => __barber.clippings.used);
check('cut hair falls as clippings', fallen > 10, `${fallen} pieces`);
await shot(page, '01-after-drag');

// Drag outside the head rotates the camera instead.
const th0 = await page.evaluate(() => __barber.cam.theta);
await page.mouse.move(150, 400); await page.mouse.down(); await page.mouse.move(350, 400, { steps: 5 }); await page.mouse.up();
const th1 = await page.evaluate(() => __barber.cam.theta);
check('drag outside the head orbits the camera', Math.abs(th1 - th0) > 0.5);

// Undo restores.
const sumBefore = await page.evaluate(() => __barber.hair.lengths.reduce((a, b) => a + b, 0));
await page.click('#btnUndo');
const sumAfter = await page.evaluate(() => __barber.hair.lengths.reduce((a, b) => a + b, 0));
check('undo restores the hair', sumAfter > sumBefore);

// A full fade by script, then the length map.
const fade = await page.evaluate(() => {
  const B = __barber;
  const ring = (y) => { const d = []; for (let a = 0.9; a <= 5.4; a += 0.04) { const r = Math.sqrt(1 - y * y); d.push([Math.sin(a) * r, y, Math.cos(a) * r]); } return d; };
  for (const [g, y0, y1] of [['0', -0.75, -0.25], ['0.5', -0.3, -0.1], ['1', -0.15, 0.05], ['2', 0.0, 0.2], ['3', 0.15, 0.4]]) {
    B.selectGuard(g);
    for (let y = y0; y <= y1; y += 0.04) B.strokeDirs(ring(y));
  }
  const h = B.hair, z = {};
  for (let i = 0; i < h.count; i++) { const k = h.zone[i]; (z[k] = z[k] || []).push(h.lengths[i]); }
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return { nape: avg(z.nape), side: avg(z.side), top: avg(z.top) };
});
check('fade: nape < sides < top', fade.nape < fade.side && fade.side < fade.top, `nape ${fade.nape.toFixed(1)} / side ${fade.side.toFixed(1)} / top ${fade.top.toFixed(1)} mm`);
await page.click('#btnMap');
check('length map toggles', await page.evaluate(() => __barber.hair.uniforms.uMapMode.value === 1));
await page.click('[data-view="left"]');
await settle(page, 40);
await shot(page, '02-fade-map');
await page.click('#btnMap');

// Trimmer.
await page.click('.tool-card[data-tool="trimmer"]');
check('trimmer selected (0.2 mm)', await page.evaluate(() => __barber.tools.active === 'trimmer' && __barber.tools.cutMM === 0.2));
check('guard panel hidden for trimmer', await page.isHidden('#guardBox'));
await page.click('.tool-card[data-tool="clipper"]');

// Lever.
await page.click('.guard[data-guard="2"]');
await page.click('#btnLever');
check('taper lever adds 1.5 mm', await page.evaluate(() => __barber.tools.cutMM === 7.5));

// Save survives reload.
await page.waitForTimeout(900);
const sig = await page.evaluate(() => __barber.hair.lengths.reduce((a, b) => a + b, 0));
await page.reload();
await page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
const sig2 = await page.evaluate(() => __barber.hair.lengths.reduce((a, b) => a + b, 0));
check('haircut is saved and restored after reload', Math.abs(sig - sig2) / sig < 0.001, `${sig.toFixed(0)} vs ${sig2.toFixed(0)}`);
check('settings restored (guard 2 + lever)', await page.evaluate(() => __barber.tools.guard.id === '2' && __barber.tools.lever));
await page.click('#btnStart');

// Switching clients.
await page.click('#clientChip');
await page.click('.client-item:nth-child(3)');
check('switch to curly-haired client', await page.evaluate(() => __barber.state.clientId === 'avi' && __barber.hair.uniforms.uCurlAmp.value > 0));
await page.evaluate(() => __barber.cam.setView('work'));
await settle(page, 40);
await shot(page, '03-curly-client');

// Reset.
await page.click('#btnReset');
await page.click('#confirmYes');
check('reset regrows hair', await page.evaluate(() => __barber.hair.lengths.every((v, i) => v === __barber.hair.initial[i])));
await ctx.close();

// Phone layout + touch cutting.
const m = await open({ width: 390, height: 844 }, true);
await m.page.goto(URL);
await m.page.waitForFunction(() => window.__barber && __barber.state.phase === 'title', null, { timeout: 180000 });
await m.page.tap('#btnStart');
if (await m.page.isVisible('#helpModal')) await m.page.tap('#helpModal [data-close]');
await m.page.evaluate(() => __barber.cam.setView('left'));
await settle(m.page, 40);
const c = await m.page.evaluate(() => {
  const v = new (__barber.camera.position.constructor)(0.077, 1.34, 0); v.project(__barber.camera);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
});
const tb = await m.page.evaluate(() => __barber.state.stats.hairsCut);
const cdp = await m.ctx.newCDPSession(m.page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
await touch('touchStart', c.x - 20, c.y + 20);
for (let k = 0; k <= 10; k++) await touch('touchMove', c.x - 20 + k * 4, c.y + 20 - k * 4);
await touch('touchEnd');
const ta = await m.page.evaluate(() => __barber.state.stats.hairsCut);
check('touch drag cuts hair on phone', ta - tb > 50, `${ta - tb} strands`);
const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
check('no horizontal overflow on phone', !overflow);
await settle(m.page, 30);
await shot(m.page, '04-phone');
await m.ctx.close();

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
