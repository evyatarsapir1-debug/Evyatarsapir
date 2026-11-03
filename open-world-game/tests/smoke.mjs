// Automated open-world test (Playwright + headless Chromium).
// The game is stepped with a fixed timestep (__sim) so results don't depend on the speed of the test machine.
// Usage: start a server on :8080 (tests/serve.sh), then: node tests/smoke.mjs [screenshotDir]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = process.env.GAME_URL || 'http://localhost:8080/index.html';
const OUT = process.argv[2] || '.';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('azura_city_settings_v1', JSON.stringify({ quality: 'low', traffic: 12 })));
await page.goto(URL);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
check('loads to main menu', true);
await page.screenshot({ path: `${OUT}/01-menu.png` });
await page.click('#btnNew');
await page.waitForTimeout(500);
await page.click('#cStart');
await page.waitForFunction(() => window.__game.state === 'playing');
check('new game starts', true);

// fixed-step simulation helper inside the page
await page.evaluate(() => {
  window.__sim = (sec, o = {}) => {
    const g = __game, inp = g.input;
    (o.keys || []).forEach((k) => inp.keys.add(k));
    if (o.joy) { inp.joyX = o.joy[0]; inp.joyY = o.joy[1]; }
    const n = Math.round(sec * 30);
    for (let i = 0; i < n; i++) {
      if (i === 0) (o.press || []).forEach((b) => inp.pressed.add(b));
      if (o.each) o.each(g);
      g.time += 1 / 30;
      g._playFrame(1 / 30);
    }
    (o.keys || []).forEach((k) => inp.keys.delete(k));
    inp.joyX = 0; inp.joyY = 0;
  };
});
const sim = (sec, o = {}) => page.evaluate(([s, o]) => {
  if (o.each) o.each = new Function('g', o.each);
  __sim(s, o);
}, [sec, o]);
const g = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); };

// ---------------------------------------------------------------- on foot
await g(() => __game.teleport(530, 545, 0));
for (const [name, yaw] of [['north', Math.PI], ['east', Math.PI / 2], ['south', 0], ['west', -Math.PI / 2]]) {
  const p0 = await g((yaw) => { __game.rig.yaw = yaw; __game.teleport(520, 575 + (yaw === 0 ? -5 : 0), yaw); return { x: __game.player.x, z: __game.player.z }; }, yaw);
  await sim(2, { keys: ['KeyW'] });
  const p1 = await g(() => ({ x: __game.player.x, z: __game.player.z }));
  const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check(`walks ${name}`, d > 3, `${d.toFixed(1)}m in 2s`);
}
let a = await g(() => { __game.teleport(520, 590, Math.PI); return { x: __game.player.x, z: __game.player.z }; });
await sim(2, { keys: ['KeyW', 'ShiftLeft'], each: `g.rig.yaw = Math.PI; g.rig.idle = 0;` });
let b = await g(() => ({ x: __game.player.x, z: __game.player.z }));
check('runs faster with Shift', Math.hypot(b.x - a.x, b.z - a.z) > 9, `${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)}m in 2s`);
await sim(0.25, { press: ['jump'] });
const jy = await g(() => __game.player.y - 0.15);
check('jumps', jy > 0.4, `${jy.toFixed(2)}m`);
await sim(1);
await shot('02-onfoot');

// walls: city hall front wall at z=513 (away from its door at x=550)
await g(() => __game.teleport(535, 509, 0));
await sim(3, { keys: ['KeyW'], each: 'g.rig.yaw = 0; g.rig.idle = 0;' });
const pw = await g(() => __game.player.z);
check('cannot walk through a building', pw < 513, `z=${pw.toFixed(2)} (wall at 513)`);

// walk around a building: go along its 4 sides
const around = await g(() => {
  const cd = __wg.cellData(5, 5); const b = cd.buildings[0];
  return { x0: b.x - b.w / 2 - 1.2, x1: b.x + b.w / 2 + 1.2, z0: b.z - b.d / 2 - 1.2, z1: b.z + b.d / 2 + 1.2 };
});
await g((r) => __game.teleport(r.x0, r.z1, Math.PI), around);
let okAround = true;
for (const [yaw, tx, tz, len] of [[Math.PI, around.x0, around.z0, around.z1 - around.z0], [Math.PI / 2, around.x1, around.z0, around.x1 - around.x0], [0, around.x1, around.z1, around.z1 - around.z0], [-Math.PI / 2, around.x0, around.z1, around.x1 - around.x0]]) {
  await g((yaw) => { __game.rig.yaw = yaw; __game.rig.idle = 0; }, yaw);
  await sim(len / 2.3 + 0.15, { keys: ['KeyW'], each: `g.rig.yaw = ${yaw}; g.rig.idle = 0;` });
  const p = await g(() => ({ x: __game.player.x, z: __game.player.z }));
  if (Math.hypot(p.x - tx, p.z - tz) > 3) okAround = false;
}
check('walks all the way around a building', okAround);

// ---------------------------------------------------------------- interiors
const shop = await g(() => {
  for (let ix = 0; ix < 10; ix++) for (let iz = 0; iz < 10; iz++) {
    const b = __wg.cellData(ix, iz).buildings.find((b) => b.interior === 'shop');
    if (b) { const fx = Math.sign(b.door.x - b.x) * (b.face === 'e' || b.face === 'w' ? 1 : 0), fz = Math.sign(b.door.z - b.z) * (b.face === 'n' || b.face === 's' ? 1 : 0); return { b: { x: b.x, z: b.z, w: b.w, d: b.d, sign: b.sign }, start: [b.door.x + fx * 3, b.door.z + fz * 3], yaw: Math.atan2(-fx, -fz) }; }
  }
});
await g((s) => __game.teleport(s.start[0], s.start[1], s.yaw), shop);
await sim(4, { keys: ['KeyW'], each: `g.rig.yaw = ${shop.yaw}; g.rig.idle = 0;` });
const inShop = await g((s) => { const p = __game.player; return Math.abs(p.x - s.b.x) < s.b.w / 2 && Math.abs(p.z - s.b.z) < s.b.d / 2; }, shop);
check('walks through a door into a shop', inShop, shop.b.sign);
await shot('03-shop-inside');

const stairs = await g(() => {
  for (let ix = 0; ix < 10; ix++) for (let iz = 0; iz < 4; iz++) {
    const b = __wg.cellData(ix, iz).buildings.find((b) => b.interior === 'house' && b.h >= 5.6);
    if (!b) continue;
    const st = b._spec.stairs[0];
    const [x0, z0, x1, z1] = st.rect;
    const mid = st.axis === 'x' ? (z0 + z1) / 2 : (x0 + x1) / 2;
    const start = st.axis === 'x' ? [st.startMin ? x0 + 0.3 : x1 - 0.3, mid] : [mid, st.startMin ? z0 + 0.3 : z1 - 0.3];
    const yaw = st.axis === 'x' ? (st.startMin ? Math.PI / 2 : -Math.PI / 2) : (st.startMin ? 0 : Math.PI);
    return { start, yaw, top: st.y1 };
  }
});
await g((s) => __game.teleport(s.start[0], s.start[1], s.yaw, 0.2), stairs);
await sim(4, { keys: ['KeyW'], each: `g.rig.yaw = ${stairs.yaw}; g.rig.idle = 0;` });
const sy = await g(() => __game.player.y);
check('climbs stairs to the upper floor of a house', sy > stairs.top - 0.3, `y=${sy.toFixed(2)} (upper floor ${stairs.top.toFixed(2)})`);
await shot('04-upstairs');

const ramp = await g(() => {
  const reg = __wg.regionInfo(0, 1); const gar = __wg.cellData(reg.garage[0], reg.garage[1]).garage;
  return { x: gar.x - gar.w / 2 + 4.5, z: gar.z - 15.5 };
});
await g((r) => __game.teleport(r.x, r.z, 0, 0.2), ramp);
await sim(12, { keys: ['KeyW'], each: 'g.rig.yaw = 0; g.rig.idle = 0;' });
const ry = await g(() => __game.player.y);
check('walks up the parking-garage ramp', ry > 3, `y=${ry.toFixed(2)}`);

// ---------------------------------------------------------------- vehicles
await g(() => { __game.teleport(508.5, 538, -Math.PI / 2); });
await sim(1);
const near = await g(() => __game.player.nearVehicle?.T.name || null);
check('vehicle detected nearby', !!near, near || 'none');
await sim(3, { press: ['vehicle'] });
check('enter vehicle (walk to door, open, sit, close)', (await g(() => __game.player.state)) === 'driving');
await shot('05-in-car');
const c0 = await g(() => ({ x: __game.player.vehicle.x, z: __game.player.vehicle.z }));
await sim(4, { keys: ['KeyW'] });
const c1 = await g(() => ({ x: __game.player.vehicle.x, z: __game.player.vehicle.z, s: __game.player.vehicle.speed }));
check('car accelerates and drives', Math.hypot(c1.x - c0.x, c1.z - c0.z) > 15 && c1.s > 6, `${Math.hypot(c1.x - c0.x, c1.z - c0.z).toFixed(0)}m, ${(c1.s * 3.6).toFixed(0)} km/h`);
const h0 = await g(() => __game.player.vehicle.heading);
await sim(1, { keys: ['KeyW', 'KeyA'] });
const h1 = await g(() => __game.player.vehicle.heading);
check('steering turns the car', Math.abs(h1 - h0) > 0.1, `Δheading ${(h1 - h0).toFixed(2)}`);
await g(() => { const v = __game.player.vehicle; v.x = 550; v.z = 490; v.heading = 0; v.vx = 0; v.vz = 20; v.speed = 20; });
await sim(2.5, { keys: ['KeyW'] });
const cz = await g(() => ({ z: __game.player.vehicle.z + __game.player.vehicle.T.L / 2, dmg: __game.player.vehicle.damage }));
check('car cannot drive through a building', cz.z < 513.6, `front at z=${cz.z.toFixed(2)}`);
check('crash causes visual damage', cz.dmg > 0, `damage ${cz.dmg.toFixed(0)}%`);
await sim(1.5, { keys: ['Space'] });
await sim(2, { press: ['vehicle'] });
check('exit vehicle', (await g(() => __game.player.state)) === 'foot');

// long drive east: Azura -> bridge over the bay -> Marina East -> further, never reaching an edge
await g(() => {
  __game.traffic.setDensity(0); __game.traffic.cars.slice().forEach((c) => __game.traffic.remove(c));
  const v = __game.vehicles.kept.at(-1);
  v.x = 620; v.z = 502.25; v.heading = Math.PI / 2; v.vx = v.vz = 0; v.y = 0; v.repair(); v.sync();
  __game.teleport(620, 502.25, Math.PI / 2);
  __game.player.forceIntoVehicle(v);
});
await sim(1);
const steerEast = "const v = g.player.vehicle; const e = (v.z - 502.25); const he = v.heading - Math.PI/2; g.input.joyX = Math.max(-1, Math.min(1, -e * 0.25 + he * 2.5)); g.input.joyY = 1;";
let minY = 0, maxX = 0;
for (let k = 0; k < 6; k++) {
  await sim(25, { each: steerEast });
  const s = await g(() => ({ x: __game.player.vehicle.x, y: __game.player.vehicle.y, z: __game.player.vehicle.z }));
  minY = Math.min(minY, s.y); maxX = s.x;
}
const drv = await g(() => ({ x: __game.player.vehicle.x, z: __game.player.vehicle.z, d: __wg.districtAt(__game.player.vehicle.x, __game.player.vehicle.z) }));
check('long drive east crosses the bridge and keeps going', drv.x > 3000 && minY > -0.3, `reached x=${drv.x.toFixed(0)} (${drv.d}), lowest y=${minY.toFixed(2)}`);
await shot('06-far-east');

// through the tunnel: northbound on x=500
await g(() => { const v = __game.player.vehicle; __game.teleport(502.25, -420, Math.PI); v.x = 502.25; v.z = -420; v.heading = Math.PI; v.vx = v.vz = 0; v.y = 0; __game.chunks.update(v.x, v.z, true); });
const steerNorth = "const v = g.player.vehicle; const e = (v.x - 502.25); const he = v.heading - Math.PI; g.input.joyX = Math.max(-1, Math.min(1, -e * 0.25 + he * 2.5)); g.input.joyY = 1;";
await sim(10, { each: steerNorth });
await shot('07-tunnel');
await sim(20, { each: steerNorth });
const tz = await g(() => __game.player.vehicle.z);
check('drives through the ridge tunnel', tz < -800, `z=${tz.toFixed(0)} (ridge spans -760..-640)`);

// ---------------------------------------------------------------- world streaming far from the start
await g(() => { const v = __game.player.vehicle; v.x = 7500; v.z = -6000; v.y = 0; v.vx = v.vz = 0; __game.chunks.update(7500, -6000, true); });
await sim(2);
const far = await g(() => {
  const n = __game.graph.node(75, -60);
  let roads = 0; for (let i = 70; i < 80; i++) for (let j = -65; j < -55; j++) if (__game.graph.node(i, j).nbrs.length) roads++;
  return { near: __game.chunks.near.size, far: __game.chunks.far.size, phys: __game.chunks.phys.size, roads, d: __wg.districtAt(7500, -6000) };
});
check('world keeps generating 9km from the start', far.near > 0 && far.phys > 0 && far.roads > 0, JSON.stringify(far));
await shot('08-far-away');

// ---------------------------------------------------------------- traffic + pedestrians
await g(() => { __game.player.exitVehicle({ statics: __game.statics, vehicles: __game.vehicles.all() }); });
await sim(2);
await g(() => { __game.traffic.setDensity(18); __game.teleport(311, 309, 0); });
await sim(15);
const tr = await g(() => {
  const cars = __game.traffic.cars;
  const off = cars.filter((c) => { const lx = ((c.x % 100) + 100) % 100, lz = ((c.z % 100) + 100) % 100; return lx > 9 && lx < 91 && lz > 9 && lz < 91; }).length;
  let overlaps = 0;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) if (Math.hypot(cars[i].x - cars[j].x, cars[i].z - cars[j].z) < 1.5) overlaps++;
  return { n: cars.length, moving: cars.filter((c) => c.speed > 1).length, off, overlaps };
});
check('traffic drives on the roads', tr.n > 4 && tr.off === 0, `${tr.n} cars, ${tr.moving} moving, ${tr.off} off-road`);
check('AI cars do not overlap', tr.overlaps === 0, `${tr.overlaps}`);
const peds0 = await g(() => __game.peds.peds.map((p) => [p.x, p.z, p.state]));
await sim(6);
const peds1 = await g(() => __game.peds.peds.map((p) => [p.x, p.z, p.state]));
const moved = peds1.filter((p, i) => peds0[i] && Math.hypot(p[0] - peds0[i][0], p[1] - peds0[i][1]) > 1).length;
const states = [...new Set(peds1.map((p) => p[2]))].join(', ');
check('pedestrians walk around', peds1.length > 5 && moved > 3, `${peds1.length} people, ${moved} moved; states: ${states}`);
await shot('09-street');

const calls = await g(() => { __game.renderer.render(__game.scene, __game.camera); return __game.renderer.info.render.calls; });
console.log(`(draw calls on low quality: ${calls})`);
await g(() => __game.save());
check('game saves progress', await g(() => !!localStorage.getItem('azura_city_save_v1')));
check('no runtime errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
