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
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 }); };

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
    const st = __wg.specOf(b).stairs[0];
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

// ---------------------------------------------------------------- homes, elevator, residents
const elev = await g(() => {
  let b = null;
  for (let ix = 0; ix < 10 && !b; ix++) for (let iz = 0; iz < 10 && !b; iz++) b = __wg.cellData(ix, iz).buildings.find((q) => q.interior === 'apartment');
  const e = __wg.specOf(b).elevator, game = __game;
  game.teleport(e.doorPt[0], e.doorPt[1], 0, 0.2);
  const step = (n, f) => { for (let i = 0; i < n; i++) { f && f(); game.time += 1 / 30; game._playFrame(1 / 30); } };
  step(5);
  const prompt = game.player.prompt?.text;
  game.input.pressed.add('interact'); step(70);
  game.input.keys.add('KeyW');
  step(30, () => { game.rig.yaw = Math.atan2(e.insidePt[0] - game.player.x, e.insidePt[1] - game.player.z); game.rig.idle = 0; });
  game.input.keys.delete('KeyW');
  const L = [...game.interiors.loaded.values()].find((l) => l.b === b);
  const inside = L.elevator.contains(game.player.x, game.player.y, game.player.z);
  const panel = document.querySelectorAll('#elevPanel.show .fbtn').length;
  document.querySelector('#elevPanel .fbtn[data-k="2"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const ys = [];
  for (let k = 0; k < 12; k++) { step(10); ys.push(game.player.y); }
  step(60);
  const target = e.floors[2];
  const furniture = L.spec.boxes.length, homes = L.spec.homes.length;
  const residents = game.peds.peds.filter((q) => q.state === 'resident').length;
  return { prompt, inside, panel, ys, final: game.player.y, target, furniture, homes, residents, floors: e.floors.length };
});
check('elevator: call button on the landing', elev.prompt === 'הזמן מעלית', elev.prompt);
check('elevator: walk into the cabin, floor buttons appear', elev.inside && elev.panel >= 2, `${elev.panel} floors`);
const mid = elev.ys.filter((y) => y > 0.3 && y < elev.target - 0.3).length;
check('elevator: rides smoothly between floors (not a teleport)', Math.abs(elev.final - elev.target) < 0.05 && mid >= 3, `y ${elev.ys.map((y) => y.toFixed(1)).join('→')}`);
check('apartments furnished, residents at home', elev.furniture > 200 && elev.residents > 0, `${elev.furniture} furniture boxes, ${elev.homes} apartments, ${elev.residents} residents`);
await shot('10-apartment-corridor');

// ---------------------------------------------------------------- shops, money, clothes, gear
const shopRes = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  const out = {};
  for (const [cell, sign] of [[[7, 5], 'חנות בגדים'], [[2, 5], 'ארסנל הצללים'], [[7, 6], 'פלאפל הכיכר']]) {
    const b = __wg.cellData(cell[0], cell[1]).buildings.find((q) => q.sign === sign);
    const c = __wg.specOf(b).counter;
    game.teleport(c.pt[0], c.pt[1], c.yaw + Math.PI);
    step(10);
    out[sign] = { prompt: game.player.prompt?.text };
    game.input.pressed.add('interact'); step(1);
    out[sign].open = game.state === 'shop';
    const before = game.econ.money, top = game.player.model.app.top, color = game.player.model.app.topColor;
    const btn = [...document.querySelectorAll('#shopPanel .sbuy')].find((x) => !x.disabled);
    btn.click();
    out[sign].paid = before - game.econ.money;
    out[sign].changedClothes = game.player.model.app.top !== top || game.player.model.app.topColor !== color;
    document.querySelector('#shopPanel .sclose').click();
    out[sign].closed = game.state === 'playing';
  }
  out.weapon = game.econ.equipped;
  return out;
});
check('clothing store: buy and wear', shopRes['חנות בגדים'].open && shopRes['חנות בגדים'].paid > 0 && shopRes['חנות בגדים'].changedClothes, JSON.stringify(shopRes['חנות בגדים']));
check('fictional gear store: buy an item', shopRes['ארסנל הצללים'].paid > 0 && !!shopRes.weapon, `${shopRes['ארסנל הצללים'].paid}₪, equipped ${shopRes.weapon}`);
check('food shop: buy food', shopRes['פלאפל הכיכר'].paid > 0 && shopRes['פלאפל הכיכר'].closed);
const fire = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  game.econ.weapons.hp = { ammo: 6 }; game.equip('hp');
  game.teleport(520, 592, Math.PI); step(20);
  const v = game.vehicles.all().filter((q) => !q.driver && !q.isHeli && q.T.kind === 'car').sort((a, b) => Math.hypot(a.x - 520, a.z - 592) - Math.hypot(b.x - 520, b.z - 592))[0];
  if (!v) return { err: 'no target car' };
  v.x = 520; v.z = 576; v.y = 0.15; v.heading = Math.PI / 2; v.vx = v.vz = 0; v.sync();
  game.rig.yaw = Math.PI; game.rig.pitch = 0.05; game.rig.idle = 0; step(3);
  const d0 = v.damage; game.input.pressed.add('fire'); step(10);
  return { d0, d1: v.damage, ammo: game.econ.weapons.hp.ammo };
});
check('gear: energy blast damages a car', fire.d1 > fire.d0, JSON.stringify(fire));
await shot('11-blast');

// ---------------------------------------------------------------- day/night + weather
const env = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  game.env.hour = 22; step(5);
  const night = { win: game.mats.f_plaster.emissiveIntensity, lamp: game.mats.lamp.emissiveIntensity, sun: game.env.sun.intensity, clock: game.env.clockText };
  game.env.hour = 13; game.env.setWeather('rain'); step(400);
  const rain = { visible: game.env.rain.visible, wet: game.env.wet, name: game.env.weatherName };
  game.env.setWeather('clear');
  return { night, rain };
});
check('night: windows and street lamps light up', env.night.win > 0.8 && env.night.lamp > 2 && env.night.sun < 0.5, JSON.stringify(env.night));
check('weather: rain falls and the streets get wet', env.rain.visible && env.rain.wet > 0.1, JSON.stringify(env.rain));

// ---------------------------------------------------------------- the clickable "enter car" button
const btn = await g(() => {
  const game = __game; game.equip(null);
  const v = game.vehicles.all().filter((q) => !q.driver && !q.isHeli && q.T.kind === 'car').sort((a, b) => Math.hypot(a.x - 540, a.z - 580) - Math.hypot(b.x - 540, b.z - 580))[0];
  v.x = 540; v.z = 580; v.y = 0.15; v.heading = 0; v.vx = v.vz = 0; v.damage = 0; v.wrecked = false; v.sync();
  const dp = v.doorPoint();
  game.teleport(dp.x, dp.z, -Math.PI / 2);
  for (let i = 0; i < 10; i++) { game.time += 1 / 30; game._playFrame(1 / 30); }
  const el = document.getElementById('prompt');
  const shown = el.classList.contains('show') ? el.textContent : null;
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  for (let i = 0; i < 90; i++) { game.time += 1 / 30; game._playFrame(1 / 30); }
  const after = game.player.state;
  for (let i = 0; i < 2; i++) { game.time += 1 / 30; game._playFrame(1 / 30); }
  const exitText = el.classList.contains('show') ? el.textContent : null;
  return { shown, after, exitText };
});
check('"היכנס לרכב" button works', !!btn.shown && btn.shown.includes('היכנס לרכב') && btn.after === 'driving', JSON.stringify(btn));
check('"צא מהרכב" button shown while driving', !!btn.exitText && btn.exitText.includes('צא מהרכב'), btn.exitText || '');
const kinds = await g(() => [...new Set([...__game.vehicles.all(), ...__game.traffic.cars].map((v) => v.typeKey))]);
check('variety of cars around', kinds.length >= 6, kinds.join(', '));

// ---------------------------------------------------------------- furniture: sit & sleep
await g(() => { if (__game.player.state === 'driving') __game.player.exitVehicle({ statics: __game.statics, vehicles: __game.vehicles.all() }); });
await sim(2);
const fur = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  let b = null;
  for (let ix = 0; ix < 10 && !b; ix++) for (let iz = 0; iz < 3 && !b; iz++) b = __wg.cellData(ix, iz).buildings.find((q) => q.interior === 'house' && q.h >= 5.6);
  const out = {};
  for (const kind of ['sit', 'sleep']) {
    const s = __wg.specOf(b).seats.find((q) => q.kind === kind && (kind === 'sleep' || q.label === 'כורסה' || q.label === 'ספה'));
    game.teleport(s.x + Math.sin(s.yaw) * 1.3, s.z + Math.cos(s.yaw) * 1.3, s.yaw + Math.PI, s.y + 0.3);
    step(5);
    const prompt = game.player.prompt?.text;
    game.input.pressed.add('interact'); step(70);
    const st = game.player.state, y = game.player.y, lie = game.player.model.body.rotation.x;
    const dist = Math.hypot(game.player.x - s.x, game.player.z - s.z);
    const getUp = game.player.prompt?.text;
    game.input.keys.add('KeyW'); step(15); game.input.keys.delete('KeyW');
    const still = Math.hypot(game.player.x - s.x, game.player.z - s.z) < 0.05;
    game.input.pressed.add('interact'); step(30);
    out[kind] = { prompt, st, y: +(y - s.y).toFixed(2), lie: +lie.toFixed(2), dist: +dist.toFixed(2), getUp, still, after: game.player.state };
  }
  return out;
});
check('furniture: "לשבת" on a sofa/armchair, sits in place', fur.sit.prompt === 'לשבת' && fur.sit.st === 'sitting' && fur.sit.dist < 0.1 && fur.sit.getUp === 'לקום', JSON.stringify(fur.sit));
check('furniture: "לישון" on a bed, lies down', fur.sleep.prompt === 'לישון' && fur.sleep.lie < -1.3 && fur.sleep.y > 0.5, JSON.stringify(fur.sleep));
check('furniture: stays put while seated, "לקום" returns to normal control', fur.sit.still && fur.sleep.still && fur.sit.after === 'foot' && fur.sleep.after === 'foot');

// ---------------------------------------------------------------- phone
await g(() => { __game.teleport(520, 590, Math.PI); });
await page.click('#phoneBtn');
await sim(1);
const ph = await g(() => ({ open: __game.phone.open, apps: document.querySelectorAll('#phone .papp').length }));
check('phone opens from its button', ph.open && ph.apps === 8, `${ph.apps} apps`);
await page.click('#phone .papp[data-go="map"]');
await page.click('#phone .prow[data-place="0"]');
const gps = await g(() => ({ dest: __game.gps.dest?.name, pts: __game.gps.route?.points.length, len: Math.round(__game.gps.route?.length || 0) }));
check('GPS: choose a destination, route follows the roads', !!gps.dest && gps.pts > 3 && gps.len > 500, JSON.stringify(gps));
await shot('12-phone-map');
await page.click('#phone .phome'); await page.click('#phone .papp[data-go="contacts"]'); await page.click('#phone .prow[data-arg="taxi"]');
await page.waitForTimeout(1500);
const nk = await g(() => __game.vehicles.kept.length);
await page.click('#phone .pacts .pbtn');
const taxi = await g(() => __game.vehicles.kept.filter((v) => v.typeKey === 'taxi').length);
check('contacts: calling a taxi brings one', taxi > 0, `${taxi} taxi`);
await page.click('#phone .pend');
await page.click('#phone .phome'); await page.click('#phone .papp[data-go="camera"]'); await page.click('#phone .pbig');
await page.click('#camOverlay .cshoot'); await page.click('#camOverlay .cdone');
check('camera: photo saved to the gallery', (await g(() => __game.phone.photos.length)) > 0);
await page.click('#phone .phome'); await page.click('#phone .papp[data-go="music"]'); await page.click('#phone .prow[data-st="1"]');
check('music: station selected', (await g(() => __game.selectedStation)) === 1);
await page.click('#phone .phome'); await page.click('#phone .papp[data-go="messages"]');
await page.click('#phone .prow[data-arg="roni"]');
await page.click('#phone .pchip[data-r="0"]'); await page.waitForTimeout(900);
const mis = await g(() => ({ active: __game.missions.active, obj: __game.missions.objective()?.text }));
check('messages: reply accepts a mission', mis.active === 'airport', JSON.stringify(mis));
const done = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  const v = game.vehicles.kept.find((q) => q.typeKey === 'taxi');
  const m0 = game.econ.money;
  game.player.forceIntoVehicle(v);
  for (let k = 0; k < 2; k++) { const t = game.missions.tgt; game.chunks.update(t.x, t.z, true); v.x = t.x; v.z = t.z; v.y = 0; v.sync(); step(8); }
  return { state: game.missions.state.airport, earned: game.econ.money - m0 };
});
check('missions: complete the airport pickup and get paid', done.state === 'done' && done.earned > 0, JSON.stringify(done));
await page.click('#phone .phome'); await page.click('#phone .papp[data-go="settings"]');
await page.click('#phone .pwall[data-w="2"]');
check('phone settings: wallpaper changes', (await g(() => __game.phone.settings.wall)) === 2);
await page.click('#phone .pclose');
await g(() => { const v = __game.player.vehicle; __game.player.exitVehicle({ statics: __game.statics, vehicles: __game.vehicles.all() }); });
await sim(2);

// ---------------------------------------------------------------- airport
const air = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  const route = __game.gps.set({ x: -300, z: 514, name: 't' }, { x: 530, z: 545 }); __game.gps.clear();
  game.teleport(-300, 540, 0); step(40);
  const L = [...game.interiors.loaded.values()].find((l) => l.b.interior === 'terminal');
  const staff = game.peds.peds.filter((q) => q.shopKey && q.state === 'shopkeeper').length;
  const travellers = game.peds.peds.filter((q) => q.pts).length;
  const counters = L ? L.spec.counters.length : 0;
  let took = null, landed = null;
  for (let i = 0; i < 30 * 420 && !(took && landed); i++) {
    game.time += 1 / 30; game.airport.update(1 / 30, game.env.hour, -300, 540, []);
    if (!took && game.airport.planes.some((p) => p.state === 'depart' && p.y > 20)) took = Math.round(i / 30);
    if (!landed && game.airport.planes.some((p) => p.state === 'arrive' && p.y < 0.5 && p.speed > 20)) landed = Math.round(i / 30);
  }
  return { route: Math.round(route?.length || 0), terminal: !!L, staff, travellers, counters, belts: L?.belts?.list.length || 0, took, landed, board: game.airport.departures().length };
});
check('airport: reachable by road from the city', air.route > 500, `${air.route}m route`);
check('airport: terminal interior with counters, belts, staff and travellers', air.terminal && air.counters >= 3 && air.belts >= 3 && air.staff > 5 && air.travellers > 8, JSON.stringify(air));
check('airport: planes take off and land', !!air.took && !!air.landed, `takeoff at ${air.took}s, landing at ${air.landed}s`);
const tw = await g(() => {
  const game = __game, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(); game.time += 1 / 30; game._playFrame(1 / 30); } };
  const b = __wg.cellData(-6, 6).buildings.find((q) => q.interior === 'ctower');
  const e = __wg.specOf(b).elevator;
  game.teleport(e.doorPt[0], e.doorPt[1], 0, 0.2); step(5);
  game.input.pressed.add('interact'); step(70);
  game.input.keys.add('KeyW'); step(30, () => { game.rig.yaw = Math.atan2(e.insidePt[0] - game.player.x, e.insidePt[1] - game.player.z); game.rig.idle = 0; }); game.input.keys.delete('KeyW');
  const L = [...game.interiors.loaded.values()].find((l) => l.b === b);
  L.elevator.go(1); step(30 * 25);
  return { y: game.player.y, top: e.floors[1], label: document.querySelector('#elevPanel .fbtn')?.textContent };
});
check('control tower: elevator up to the cab', Math.abs(tw.y - tw.top) < 0.1, JSON.stringify(tw));
await shot('13-tower-cab');

// ---------------------------------------------------------------- fist fights
const fight = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (game.player.state !== 'foot') { game.player.exitVehicle({ statics: game.statics, vehicles: game.vehicles.all() }); step(60); }
  game.equip(null);
  game.teleport(311, 309, 0); step(60);
  const ped = game.peds.peds.find((q) => !q.shopKey && !q.defeated && !q.car);
  if (!ped) return { err: 'no pedestrian' };
  ped.temper = 'flee';
  const place = () => { game.player.setPosition(ped.x, ped.z - 1.0, 0, ped.y + 0.3); game.player.facing = 0; ped.state = 'phone'; ped.timer = 30; ped.x = game.player.x; ped.z = game.player.z + 1.0; };
  const seq = [];
  for (let k = 0; k < 3; k++) { place(); game.input.pressed.add('fire'); step(1); seq.push(game.player.attack?.type); step(22); }
  let n = 0; while (ped.hp > 0 && n++ < 12) { place(); game.input.pressed.add('fire'); step(24); }
  const drops = game.combat.pickups.map((k) => k.amount);
  const m0 = game.econ.money;
  if (game.combat.pickups.length) { const k = game.combat.pickups[0]; game.player.setPosition(k.x, k.z, 0, k.y + 0.3); step(3); }
  const tempers = new Set(game.peds.peds.map((q) => q.temper));
  return { seq, down: ped.state === 'down', drops, earned: game.econ.money - m0, tempers: [...tempers] };
});
check('fight: combo jab -> cross -> kick', JSON.stringify(fight.seq) === '["jabR","jabL","kick"]', JSON.stringify(fight.seq));
check('fight: a person goes down after enough hits (non-graphic)', fight.down, JSON.stringify(fight));
check('fight: dropped money can be collected', fight.drops.length === 0 || ([60, 120, 210].includes(fight.drops[0]) && fight.earned === fight.drops[0]), JSON.stringify({ drops: fight.drops, earned: fight.earned }));
check('fight: people have different personalities', fight.tempers.length >= 4, fight.tempers.join(', '));

// ---------------------------------------------------------------- punching people indoors + guard drops after 3 s
const indoor = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  const ped = game.peds.peds.find((q) => q.state === 'resident' || q.state === 'shopkeeper');
  if (!ped) return { err: 'no indoor person', states: [...new Set(game.peds.peds.map((q) => q.state))] };
  const s0 = ped.state, hp0 = ped.hp;
  game.player.setPosition(ped.x - Math.sin(ped.yaw) * -1.1, ped.z - Math.cos(ped.yaw) * -1.1, 0, ped.y + 0.3);
  game.player.facing = Math.atan2(ped.x - game.player.x, ped.z - game.player.z);
  game.input.pressed.add('fire'); step(20);
  const hit = ped.hp < hp0;
  const stance1 = game.player.combatT > 0;
  step(30 * 3.3);
  return { s0, hit, hp: ped.hp, stance1, stanceAfter3s: game.player.combatT > 0, nowState: ped.state };
});
check('fight: you can punch people inside buildings (shopkeepers / residents)', indoor.hit, JSON.stringify(indoor));
check('fight: guard drops back to normal ~3 s after the last punch', indoor.stance1 && !indoor.stanceAfter3s, JSON.stringify(indoor));

// ---------------------------------------------------------------- my villa, pool, wardrobe, clothes shop, map landmarks
const home = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  const L = game.landmarks().map((l) => l.short);
  game.teleport(850, 864, 0, 0.3); step(20);
  const swimming = game.player.swimming;
  game.teleport(850, 818, 0, 0.3); step(40);
  const V = game.interiors.places().find((l) => l.spec.wardrobe);
  let wardrobe = null;
  if (V) { const w = V.spec.wardrobe; game.teleport(w.pt[0], w.pt[1], 0, w.y + 0.3); step(10); wardrobe = game.player.prompt?.text; }
  const m0 = game.econ.money;
  game.openShop('clothes', 'חנות בגדים');
  const prices = [...document.querySelectorAll('#shopPanel .srow')].map((r) => [r.querySelector('b').textContent, r.querySelector('.sbuy').textContent]);
  const own0 = game.econ.wardrobe.length;
  const btn = [...document.querySelectorAll('#shopPanel .srow')].find((r) => r.querySelector('b').textContent.includes('חליפה') && r.querySelector('.sbuy').textContent !== 'ללבוש')?.querySelector('.sbuy');
  btn?.click();
  game.shop.close();
  const paid = m0 - game.econ.money, top = game.player.model.app.top, owned = game.econ.wardrobe.length - own0;
  return { L, swimming, villa: !!V, wardrobe, prices, paid, top, owned, here: document.getElementById('here').textContent };
});
const price = (name) => home.prices.filter(([n, p]) => n.includes(name) && p !== 'ללבוש').map(([, p]) => +p.replace(/[^\d]/g, ''));
check('map: airport, marina, weapons, ice cream, library, clothes and my home are labelled', ['נמל תעופה', 'מרינה', 'חנות נשקים', 'גלידה', 'ספרייה', 'הבית שלי', 'חנות בגדים'].every((n) => home.L.includes(n)), home.L.join(', '));
check('my home: villa with an interior, a swimmable pool and a wardrobe', home.villa && home.swimming && home.wardrobe === 'ארון בגדים', JSON.stringify({ villa: home.villa, swim: home.swimming, wardrobe: home.wardrobe, here: home.here }));
check('clothes shop: suits ₪2,200–2,500, t-shirts ₪100/₪200, shorts ₪80/₪120', price('חליפה').length >= 4 && price('חליפה').every((p) => p >= 2200 && p <= 2500) && new Set(price('חולצה קצרה')).size === 2 && price('חולצה קצרה').every((p) => p === 100 || p === 200) && price('מכנס קצר').every((p) => p === 80 || p === 120), JSON.stringify(home.prices.slice(0, 16)));
check('clothes shop: buying a suit dresses you and saves it in the wardrobe', home.paid >= 2200 && home.top === 'suit' && home.owned === 1, JSON.stringify({ paid: home.paid, top: home.top, owned: home.owned }));

// ---------------------------------------------------------------- clothes store: try on before buying, hats + shoes
const tryon = await g(() => {
  const game = __game, m0 = game.econ.money, app0 = JSON.stringify(game.player.model.app);
  game.openShop('clothes', 'חנות בגדים');
  const rows = [...document.querySelectorAll('#shopPanel .srow')];
  const priceOf = (txt) => rows.filter((r) => r.querySelector('b').textContent.includes(txt) && r.querySelector('.sbuy').textContent !== 'ללבוש').map((r) => +r.querySelector('.sbuy').textContent.replace(/[^\d]/g, ''));
  const hats = [...priceOf('כובע מצחייה'), ...priceOf('כובע טמבל'), ...priceOf('כובע גרב'), ...priceOf('כובע לבד')];
  const shoes = [...priceOf('נעלי ספורט'), ...priceOf('נעלי עור'), ...priceOf('מגפונים')];
  rows.find((r) => r.textContent.includes('כובע לבד')).click();
  const preview = game.player.model.app.hat, paidForPreview = m0 - game.econ.money;
  rows.find((r) => r.textContent.includes('כובע מצחייה') && r.querySelector('.sbuy').textContent !== 'ללבוש').querySelector('.sbuy').click();
  const bought = game.player.model.app.hat;
  game.shop.close();
  const afterClose = game.player.model.app.hat;
  game.openShop('wardrobe', 'הבית שלי');
  const inWardrobe = [...document.querySelectorAll('#shopPanel .srow')].some((r) => r.textContent.includes('כובע מצחייה'));
  game.shop.close();
  return { hats, shoes, preview, paidForPreview, bought, afterClose, inWardrobe, state: game.state };
});
check('clothes store: hats ₪60/₪100 and shoes ₪120/₪250', tryon.hats.length >= 6 && tryon.hats.every((p) => p === 60 || p === 100) && new Set(tryon.hats).size === 2 && tryon.shoes.length >= 6 && tryon.shoes.every((p) => p === 120 || p === 250) && new Set(tryon.shoes).size === 2, JSON.stringify({ hats: tryon.hats, shoes: tryon.shoes }));
check('clothes store: tap an item to try it on (free), buy keeps it, it is in the home wardrobe', tryon.preview === 'fedora' && tryon.paidForPreview === 0 && tryon.bought === 'cap' && tryon.afterClose === 'cap' && tryon.inWardrobe && tryon.state === 'playing', JSON.stringify(tryon));

// ---------------------------------------------------------------- food goes into the bag, eat it from the bag
const food = await g(() => {
  const game = __game; game.econ.health = 50;
  game.openShop('food', 'גלידת שקיעה'); document.querySelectorAll('#shopPanel .sbuy')[0].click(); game.shop.close();
  game.openShop('food', 'פלאפל הכיכר'); document.querySelectorAll('#shopPanel .sbuy')[0].click(); game.shop.close();
  const inBag = { ...game.econ.items.food }, h0 = game.econ.health;
  game.openBag();
  [...document.querySelectorAll('#bagPanel .srow')].find((r) => r.textContent.includes('פלאפל')).querySelector('.sbuy').click();
  return { inBag, healthBefore: h0, healthAfter: game.econ.health, left: { ...game.econ.items.food }, eating: game.player.eatT > 0, state: game.state };
});
check('food: bought food goes into the bag (not eaten at the counter)', food.inBag.icecream >= 1 && food.inBag.falafel >= 1 && food.healthBefore === 50, JSON.stringify(food.inBag));
check('food: "eat" in the bag heals and plays the eating animation', food.healthAfter === 80 && (food.left.falafel || 0) === food.inBag.falafel - 1 && food.eating && food.state === 'playing', JSON.stringify(food));

// ---------------------------------------------------------------- traffic drivers + carjacking
const jack = await g(() => {
  const game = __game, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (game.player.state !== 'foot') { game.player.state = 'foot'; game.player.vehicle = null; }
  game.teleport(520, 520, 0, 0.3); step(120);
  const withDriver = game.traffic.cars.filter((v) => v.driverPed && v.driverPed.state === 'driving').length;
  const v = game.traffic.cars.filter((c) => c.driverPed && c.T.kind === 'car').sort((a, b) => Math.hypot(a.x - 520, a.z - 520) - Math.hypot(b.x - 520, b.z - 520))[0];
  if (!v) return { withDriver, cars: game.traffic.cars.length };
  v.ai.cruise = v.ai.baseCruise = 0; step(90);
  const dp = v.doorPoint();
  game.teleport(dp.x, dp.z, v.heading, 0.3); step(4);
  const prompt = game.player.prompt?.label;
  const ped = v.driverPed;
  game.input.pressed.add('vehicle'); step(1);
  const states = new Set(); let maxY = 0;
  step(150, () => { states.add(ped.state); if (ped.state === 'thrown') maxY = Math.max(maxY, ped.y - 0.2); });
  return { withDriver, cars: game.traffic.cars.length, prompt, states: [...states], driving: game.player.state === 'driving' && game.player.vehicle === v, left: !game.traffic.cars.includes(v), pedDist: Math.hypot(ped.x - v.x, ped.z - v.z), airborne: maxY };
});
check('traffic: cars have visible drivers', jack.withDriver >= Math.min(4, jack.cars), `${jack.withDriver}/${jack.cars} cars`);
check('carjack: "pull the driver out" button next to a car', jack.prompt === 'הוצא את הנהג', jack.prompt);
check('carjack: driver is pulled out, thrown onto the road, gets up', ['pulled', 'thrown', 'fall'].every((s) => jack.states?.includes(s)) && jack.pedDist > 2, JSON.stringify(jack));
check('carjack: the player drives the taken car', jack.driving && jack.left);
await shot('20-carjack');

// ---------------------------------------------------------------- flyable passenger jet
const fly = await g(() => {
  const game = __game, A = game.airport, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (game.player.state === 'driving') { game.player.vehicle.speed = 0; game.player.vehicle.vx = game.player.vehicle.vz = 0; game.input.pressed.add('vehicle'); step(40); }
  const jet = A.planes.find((q) => q.state === 'parked') || A.planes[0];
  if (jet.state !== 'parked') { jet.state = 'parked'; jet.place(-300, 612, Math.PI); jet.mesh.visible = true; jet.timer = 300; }
  const c = Math.cos(jet.heading), s = Math.sin(jet.heading);
  game.teleport(jet.x + 3.6 * c + 13.4 * s, jet.z - 3.6 * s + 13.4 * c, 0, 0.2); step(6);
  const prompt = game.player.prompt?.label;
  game.input.pressed.add('vehicle'); step(1); step(70);
  const v = game.player.vehicle;
  if (!v || !v.isPlane) return { prompt, state: game.player.state };
  v.x = -900; v.z = 790; v.heading = Math.PI / 2; v.speed = 0;
  game.input.keys.add('KeyW');
  step(30 * 22, () => { if (v.speed > 60) game.input.keys.add('KeyR'); });
  game.input.keys.clear();
  return { prompt, state: game.player.state, alt: v.y, kmh: v.speed * 3.6, gearUp: v.parts.jetMesh.geometry === v.parts.cleanGeo, hidden: !jet.mesh.visible };
});
check('jet: "board plane" button at a parked airliner', fly.prompt === 'היכנס למטוס', fly.prompt);
check('jet: player can fly it — takes off, climbs, retracts the gear', fly.alt > 60 && fly.kmh > 230 && fly.gearUp, JSON.stringify(fly));
await shot('21-flying');
await g(() => { const v = __game.player.vehicle; if (v) { v.x = -600; v.z = 790; v.y = 0; v.vy = 0; v.speed = 0; v.pitch = 0; v.airborne = false; } __game.input.pressed.add('vehicle'); for (let i = 0; i < 40; i++) { __game.time += 1 / 30; __game._playFrame(1 / 30); } });

const calls = await g(() => { __game.renderer.render(__game.scene, __game.camera); return __game.renderer.info.render.calls; });
console.log(`(draw calls on low quality: ${calls})`);
await g(() => __game.save());
check('game saves progress', await g(() => !!localStorage.getItem('azura_city_save_v1')));
check('no runtime errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
