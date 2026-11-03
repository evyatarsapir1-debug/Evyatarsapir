// Automated smoke test (Playwright + headless Chromium).
// Usage: start a server on :8080 (tests/serve.sh), then: node tests/smoke.mjs [outDir]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = process.env.GAME_URL || 'http://localhost:8080/index.html';
const OUT = process.argv[2] || '.';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
check('loads to main menu', true);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-menu.png` });

await page.click('#btnNew');
await page.waitForTimeout(1200);
await page.click('.preset:nth-child(2)');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/02-creator.png` });
await page.click('#cStart');
await page.waitForFunction(() => window.__game.state === 'playing');
check('new game starts', true);
await page.waitForTimeout(1500);

const g = (fn) => page.evaluate(fn);
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

// --- walking
let p0 = await g(() => ({ x: __game.player.x, z: __game.player.z }));
await hold('KeyW', 1500);
let p1 = await g(() => ({ x: __game.player.x, z: __game.player.z, st: __game.player.state }));
const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z);
check('player walks with W', walked > 1.5, `moved ${walked.toFixed(2)}m`);
await page.keyboard.down('ShiftLeft'); await hold('KeyW', 1000); await page.keyboard.up('ShiftLeft');
let p2 = await g(() => ({ x: __game.player.x, z: __game.player.z }));
const ran = Math.hypot(p2.x - p1.x, p2.z - p1.z);
check('player runs faster with Shift', ran > walked * 0.9, `ran ${ran.toFixed(2)}m in 1s vs walked ${walked.toFixed(2)}m in 1.5s`);
await page.keyboard.press('Space');
await page.waitForTimeout(150);
const jumpY = await g(() => __game.player.y - 0.15);
check('player jumps', jumpY > 0.3, `height ${jumpY.toFixed(2)}`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/03-onfoot.png` });

// --- wall collision on foot: city hall spans z 513..531 around x 550
await g(() => { __game.player.setPosition(550, 509, 0); __game.rig.yaw = 0; });
await hold('KeyW', 2500);
let pw = await g(() => __game.player.z);
check('player cannot walk through a building', pw < 513, `z=${pw.toFixed(2)} (wall at 513)`);

// --- enter vehicle
await g(() => { __game.player.setPosition(508.5, 538, -Math.PI / 2); });
await page.waitForTimeout(500);
const near = await g(() => __game.player.nearVehicle?.T.name || null);
check('vehicle detected nearby', !!near, near || 'none');
await page.keyboard.press('KeyF');
await page.waitForTimeout(2500);
const st = await g(() => __game.player.state);
check('enter vehicle sequence completes', st === 'driving', st);
await page.screenshot({ path: `${OUT}/04-in-car.png` });

// --- driving
const c0 = await g(() => ({ x: __game.player.vehicle.x, z: __game.player.vehicle.z }));
await hold('KeyW', 3000);
const c1 = await g(() => ({ x: __game.player.vehicle.x, z: __game.player.vehicle.z, s: __game.player.vehicle.speed }));
const drove = Math.hypot(c1.x - c0.x, c1.z - c0.z);
check('car accelerates and drives', drove > 10 && c1.s > 5, `moved ${drove.toFixed(1)}m, speed ${(c1.s * 3.6).toFixed(0)} km/h`);
await page.keyboard.down('KeyW'); await hold('KeyA', 800); await page.keyboard.up('KeyW');
const h1 = await g(() => __game.player.vehicle.heading);
check('steering turns the car', Math.abs(h1 - Math.PI) > 0.1, `heading ${h1.toFixed(2)}`);
await page.screenshot({ path: `${OUT}/05-driving.png` });

// --- vehicle vs building collision: drive at the city hall from the north
await g(() => { const v = __game.player.vehicle; v.x = 550; v.z = 490; v.heading = 0; v.vx = 0; v.vz = 20; v.speed = 20; });
await hold('KeyW', 2500);
const cz = await g(() => ({ z: __game.player.vehicle.z, L: __game.player.vehicle.T.L, dmg: __game.player.vehicle.damage }));
check('car cannot drive through a building', cz.z + cz.L / 2 < 513.6, `front at z=${(cz.z + cz.L / 2).toFixed(2)} (wall 513), damage ${cz.dmg.toFixed(0)}`);
check('crash causes visual damage', cz.dmg > 0, `damage ${cz.dmg.toFixed(1)}`);

// --- brake & exit
await hold('KeyS', 1200);
await page.waitForTimeout(800);
await page.keyboard.press('KeyF');
await page.waitForTimeout(1800);
const st2 = await g(() => __game.player.state);
check('exit vehicle', st2 === 'foot', st2);

// --- traffic
await g(() => { __game.player.setPosition(311, 309, 0); });
await page.waitForTimeout(6000);
const tr = await g(() => {
  const cars = __game.traffic.cars;
  const inside = cars.filter((c) => {
    const lx = ((c.x % 100) + 100) % 100, lz = ((c.z % 100) + 100) % 100;
    return lx > 8 && lx < 92 && lz > 8 && lz < 92 && c.x > 0 && c.x < 1000 && c.z > 0 && c.z < 1000;
  });
  const moving = cars.filter((c) => c.speed > 1).length;
  return { n: cars.length, inside: inside.length, moving, parked: __game.vehicles.all().length };
});
check('traffic spawns', tr.n > 5, `${tr.n} AI cars, ${tr.moving} moving, ${tr.parked} parked vehicles`);
check('traffic stays on roads', tr.inside === 0, `${tr.inside} off-road`);
await page.waitForTimeout(8000);
const tr2 = await g(() => {
  const cars = __game.traffic.cars;
  let overlaps = 0;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    if (Math.hypot(cars[i].x - cars[j].x, cars[i].z - cars[j].z) < 1.5) overlaps++;
  }
  return { overlaps, n: cars.length, stopped: cars.filter((c) => c.speed < 0.2).length };
});
check('AI cars do not overlap each other', tr2.overlaps === 0, `${tr2.overlaps} overlapping pairs, ${tr2.stopped}/${tr2.n} stopped (lights)`);
await page.screenshot({ path: `${OUT}/06-traffic.png` });

// --- streaming
const chunks = await g(() => __game.chunks.loaded.size);
await g(() => { __game.player.setPosition(150, 860, 0); });
await page.waitForTimeout(4000);
const chunks2 = await g(() => ({ n: __game.chunks.loaded.size, has: __game.chunks.loaded.has('1,8') }));
check('world streams around the player', chunks2.has, `${chunks}→${chunks2.n} loaded cells`);
await page.screenshot({ path: `${OUT}/07-industrial.png` });

// --- helicopter
await g(() => { __game.player.setPosition(-200, 556, 0); });
await page.waitForTimeout(1500);
await page.keyboard.press('KeyF');
await page.waitForTimeout(2500);
const hs = await g(() => ({ st: __game.player.state, t: __game.player.vehicle?.typeKey }));
check('enter helicopter', hs.st === 'driving' && hs.t === 'heli', JSON.stringify(hs));
await page.waitForTimeout(2500);
await hold('Space', 3000);
const hy = await g(() => __game.player.vehicle?.y || 0);
check('helicopter takes off', hy > 5, `altitude ${hy.toFixed(1)}m`);
await page.screenshot({ path: `${OUT}/08-heli.png` });

// --- save / continue
await g(() => __game.save());
const saved = await g(() => !!localStorage.getItem('azura_city_save_v1'));
check('game saves progress', saved);

check('no runtime errors', errors.length === 0, errors.slice(0, 5).join(' | '));
const fps = await g(() => Math.round(__game.fpsAvg));
console.log(`(software-rendered fps in headless: ${fps})`);
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
