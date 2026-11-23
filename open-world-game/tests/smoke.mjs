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
await page.addInitScript(() => { localStorage.setItem('azura_city_settings_v1', JSON.stringify({ quality: 'low', traffic: 12 })); localStorage.setItem('azura_dev_menu', '1'); });   // test entry: the developer menu, no 35 s intro
await page.goto(URL);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
check('loads to main menu', true);
await page.screenshot({ path: `${OUT}/01-menu.png` });
await page.click('#btnNew');
await page.waitForTimeout(500);
if (await page.isVisible('#cStart')) await page.click('#cStart');
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
  const reg = __wg.regionInfo(2, 0); const gar = __wg.cellData(reg.garage[0], reg.garage[1]).garage;
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

// drive east over the bridge to the marina island (the world ends at the sea)
await g(() => {
  __game.traffic.setDensity(0); __game.traffic.cars.slice().forEach((c) => __game.traffic.remove(c));
  const v = __game.vehicles.kept.at(-1);
  v.x = 620; v.z = 502.25; v.heading = Math.PI / 2; v.vx = v.vz = 0; v.y = 0; v.repair(); v.sync();
  __game.teleport(620, 502.25, Math.PI / 2);
  __game.player.forceIntoVehicle(v);
});
await sim(1);
const steerEast = "const v = g.player.vehicle; const e = (v.z - 502.25); const he = v.heading - Math.PI/2; g.input.joyX = Math.max(-1, Math.min(1, -e * 0.25 + he * 2.5)); g.input.joyY = 1;";
let minY = 0;
for (let k = 0; k < 8; k++) {
  await sim(15, { each: steerEast });
  const s = await g(() => ({ x: __game.player.vehicle.x, y: __game.player.vehicle.y }));
  minY = Math.min(minY, s.y);
  if (s.x > 2150) break;
}
const drv = await g(() => ({ x: __game.player.vehicle.x, z: __game.player.vehicle.z, d: __wg.districtAt(__game.player.vehicle.x, __game.player.vehicle.z) }));
check('drive over the bridge to the marina island', drv.x > 2050 && minY > -0.3, `reached x=${drv.x.toFixed(0)} (${drv.d}), lowest y=${minY.toFixed(2)}`);
await shot('06-marina');
await sim(1, { keys: ['Space'] }); await sim(2, { press: ['vehicle'] });

// ---------------------------------------------------------------- beyond the city: open sea you can swim in
const sea = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (game.player.state !== 'foot') { game.player.state = 'foot'; game.player.vehicle = null; game.player._detach?.(); }
  game.teleport(500, -300, 0, 0.5); step(30);
  let buildings = 0; for (let i = -2; i < 12; i++) for (let j = -6; j < -1; j++) buildings += __wg.cellData(i, j).buildings.length;
  const farKinds = new Set(); for (const [i, j] of [[75, -60], [-30, 20], [40, 40], [5, 15]]) farKinds.add(__wg.cellKind(i, j));
  return { swimming: game.player.swimming, d: __wg.districtAt(500, -300), buildings, farKinds: [...farKinds], beachH: __wg.baseHeight(500, -12), seaH: __wg.baseHeight(500, -300) };
});
check('beyond the city is open sea (no towns, no houses) and you can swim in it', sea.swimming && sea.buildings === 0 && sea.farKinds.length === 1 && sea.farKinds[0] === 'Q', JSON.stringify(sea));
check('the city coast has a sandy beach that slopes into the sea', sea.beachH > -0.1 && sea.seaH < -3, JSON.stringify(sea));
await shot('07-open-sea');

// ---------------------------------------------------------------- traffic + pedestrians
await g(() => { if (__game.player.vehicle) __game.player.exitVehicle({ statics: __game.statics, vehicles: __game.vehicles.all() }); });
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
  for (const [cell, sign] of [[[7, 5], 'חנות בגדים'], [[2, 5], 'חנות נשקים'], [[7, 6], 'פלאפל הכיכר']]) {
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
check('fictional gear store: buy an item', shopRes['חנות נשקים'].paid > 0 && !!shopRes.weapon, `${shopRes['חנות נשקים'].paid}₪, equipped ${shopRes.weapon}`);
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
check('night: windows and street lamps light up', env.night.win > 0.6 && env.night.lamp > 2 && env.night.sun < 0.5, JSON.stringify(env.night));
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
check('phone opens from its button', ph.open && ph.apps === 10, `${ph.apps} apps`);
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
await page.click('#camOverlay .cshoot', { timeout: 180000 }); await page.click('#camOverlay .cdone');
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
  // the police are tested on their own further down; here they stay out of it
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { if (game.police.level) game.police.clear(); game.time += 1 / 30; game._playFrame(1 / 30); } };
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
  const dead = ped.state === 'dead';
  step(30 * 20);   // 20 s later: still lying there, does not get up
  return { seq, down: dead, stillDead: ped.state === 'dead' && game.peds.peds.includes(ped), drops, earned: game.econ.money - m0, tempers: [...tempers] };
});
check('fight: combo jab -> cross -> kick', JSON.stringify(fight.seq) === '["jabR","jabL","kick"]', JSON.stringify(fight.seq));
check('fight: when the health bar runs out the person dies and does not get up (no gore)', fight.down && fight.stillDead, JSON.stringify(fight));
check('fight: dropped money can be collected', fight.drops.length === 0 || ([60, 120, 210].includes(fight.drops[0]) && fight.earned === fight.drops[0]), JSON.stringify({ drops: fight.drops, earned: fight.earned }));
check('fight: people have different personalities', fight.tempers.length >= 4, fight.tempers.join(', '));

// ---------------------------------------------------------------- punching people indoors + guard drops after 3 s
const indoor = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  const ped = game.peds.peds.find((q) => q.state === 'resident' || q.state === 'shopkeeper'); if (ped) ped.temper = 'call';   // a person who never fights back (others may get angry and join in)
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
check('my home: villa with an interior, a swimmable pool and a wardrobe', home.villa && home.swimming && (home.wardrobe || '').includes('ארון בגדים'), JSON.stringify({ villa: home.villa, swim: home.swimming, wardrobe: home.wardrobe, here: home.here }));
check('clothes shop: suits ₪2,200–2,500, short sleeves ₪120 and long sleeves ₪180 in many colours, luxury hoodies ₪1,200, shorts ₪80/₪120', price('חליפה').length >= 4 && price('חליפה').every((p) => p >= 2200 && p <= 2500) && price('חולצה קצרה').length >= 6 && price('חולצה קצרה').every((p) => p === 120) && price('חולצה ארוכה').length >= 6 && price('חולצה ארוכה').every((p) => p === 180) && price('קפוצ׳ון').filter((p) => p === 1200).length === 2 && price('מכנס קצר').every((p) => p === 80 || p === 120), JSON.stringify(home.prices.slice(0, 22)));
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
check('clothes store: hats ₪60/₪100 (balaclava ₪150) and shoes ₪120/₪250', tryon.hats.length >= 6 && tryon.hats.every((p) => p === 60 || p === 100 || p === 150) && new Set(tryon.hats).size === 3 && tryon.shoes.length >= 6 && tryon.shoes.every((p) => p === 120 || p === 250) && new Set(tryon.shoes).size === 2, JSON.stringify({ hats: tryon.hats, shoes: tryon.shoes }));
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

// ---------------------------------------------------------------- luna park at the marina
const luna = await g(() => {
  const game = __game, L = game.luna, P = game.player, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') return { err: 'not on foot', state: P.state };
  game.teleport(L.wheelPt.x, L.wheelPt.z, 0, 0.3); step(5);
  const wPrompt = P.prompt?.text, m0 = game.econ.money;
  game.input.pressed.add('interact'); step(1);
  const wPaid = m0 - game.econ.money;
  let top = 0; step(30 * 36); top = P.y;
  step(30 * 40);
  const wEnd = P.state;
  game.teleport(L.coasterPt.x, L.coasterPt.z, 0, 0.3); step(5);
  const cPrompt = P.prompt?.text, m1 = game.econ.money;
  game.input.pressed.add('interact'); step(1);
  const cPaid = m1 - game.econ.money, cState = P.state;
  for (let i = 0; i < 30 * 90 && P.state === 'riding'; i++) step(1);
  return { wPrompt, wPaid, top, wEnd, cPrompt, cPaid, cState, cEnd: P.state };
});
check('luna park: Ferris wheel costs ₪10, lifts you high and lets you off', luna.wPaid === 10 && luna.top > 25 && luna.wEnd === 'foot', JSON.stringify(luna));
check('luna park: roller coaster costs ₪20, full ride then off', luna.cPaid === 20 && luna.cState === 'riding' && luna.cEnd === 'foot', JSON.stringify(luna));

// ---------------------------------------------------------------- beach people in swimwear, jet skis and boats
const beach = await g(() => {
  const game = __game, P = game.player, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { P.vehicle && (P.vehicle.speed = 0); game.input.pressed.add('vehicle'); step(40); }
  game.teleport(1045, 250, Math.PI / 2, 0.3); step(60);
  const people = game.peds.peds.filter((q) => q.app.swim);
  const states = [...new Set(people.map((q) => q.state))];
  // the pier at z=250: walk to its end, take the jet ski
  game.teleport(1096, 251.2, Math.PI / 2, 0.6); step(40);
  const jet = game.vehicles.all().find((v) => v.T.jetski && Math.hypot(v.x - 1099, v.z - 253.4) < 6);
  if (jet) { const dp = jet.doorPoint(); game.teleport(dp.x, Math.min(dp.z, 251.2), Math.PI / 2, 0.6); step(10); }
  const prompt = P.prompt?.text;
  game.input.pressed.add('vehicle'); step(1); step(70);
  const riding = P.state === 'driving' && !!P.vehicle?.isBoat, ridingType = P.vehicle?.typeKey;
  let x0 = P.vehicle?.x, maxX = 0, minY = 99, maxY = -99;
  game.input.keys.add('KeyW'); step(30 * 6, () => {});
  for (let i = 0; i < 30 * 6; i++) { game.time += 1 / 30; game._playFrame(1 / 30); const v = P.vehicle; if (!v) break; maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
  game.input.keys.clear();
  // turn back to the beach at full speed: must stop at the shore, never drive onto the sand
  const v = P.vehicle; if (v) { v.heading = -Math.PI / 2; v.vx = v.vz = 0; }
  game.input.keys.add('KeyW'); step(30 * 12); game.input.keys.clear();
  const shoreX = P.vehicle?.x;
  const aiBoats = game.boats.list.length, aiDrivers = game.boats.list.filter((b) => b.driverPed).length;
  return { people: people.length, states, jet: !!jet, prompt, riding, ridingType, x0, maxX, yRange: [minY, maxY], shoreX, aiBoats, aiDrivers };
});
check('beach: people in swimwear sunbathing, sitting, walking and swimming', beach.people >= 6 && beach.states.length >= 3, JSON.stringify({ people: beach.people, states: beach.states }));
check('jet ski at the pier: board it and ride on the water', beach.jet && beach.riding && beach.maxX > beach.x0 + 40 && beach.yRange[1] < -0.8, JSON.stringify(beach));
check('boats stay in the water (stop at the shore)', beach.shoreX > 1060, `stopped at x=${beach.shoreX?.toFixed(1)}`);
check('boats and jet skis with drivers cruise the bay', beach.aiBoats >= 4 && beach.aiDrivers >= 4, JSON.stringify({ ai: beach.aiBoats, drivers: beach.aiDrivers }));
await g(() => { const game = __game, P = game.player; if (P.vehicle) { P.vehicle.vx = P.vehicle.vz = 0; P.vehicle.speed = 0; game.input.pressed.add('vehicle'); for (let i = 0; i < 40; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } } });

// ---------------------------------------------------------------- military base: soldiers, tank with cannon, fighter jet, patrols
const mil = await g(() => {
  const game = __game, P = game.player, I = game.input, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { if (P.vehicle) { P.vehicle.vx = P.vehicle.vz = 0; P.vehicle.speed = 0; } I.pressed.add('vehicle'); step(40); }
  game.teleport(-450, -200, 0, 0.3); step(60);
  let buildings = 0; for (let i = -10; i < 0; i++) for (let j = -10; j < 0; j++) buildings += __wg.cellData(i, j).buildings.length;
  const soldiers = game.peds.peds.filter((q) => q.app.soldier).length;
  game.teleport(-312, -286, 0, 0.3); step(40);
  const tank = game.vehicles.all().find((v) => v.T.tank);
  if (!tank) return { buildings, soldiers, err: 'no tank' };
  const dp = tank.doorPoint(); game.teleport(dp.x, dp.z, 0, 0.3); step(5);
  const tLabel = P.prompt?.label; I.pressed.add('vehicle'); step(80);
  const inTank = P.state === 'driving' && P.vehicle === tank;
  const t0 = tank.parts.turret.rotation.y;
  step(60, () => { game.rig.yaw = tank.heading + 1.2; game.rig.idle = 0; });
  const turned = Math.abs(tank.parts.turret.rotation.y - t0);
  const ex0 = game.weapons.fx.length; I.pressed.add('fire'); step(1); const shells = game.military.shells.length; step(60);
  const boom = game.weapons.fx.length > ex0 || game.military.puffs.length > 5;
  tank.vx = tank.vz = 0; tank.speed = 0; I.pressed.add('vehicle'); step(40);
  game.teleport(-690, -510, 0, 0.3); step(40);
  const jet = game.vehicles.all().find((v) => v.T.fighter);
  if (!jet) return { buildings, soldiers, tLabel, inTank, turned, shells, boom, err: 'no jet' };
  const jp = jet.doorPoint(); game.teleport(jp.x, jp.z, 0, 0.3); step(5);
  const jLabel = P.prompt?.label; I.pressed.add('vehicle'); step(60);
  const inJet = P.state === 'driving' && P.vehicle === jet;
  jet.x = -900; jet.z = -720; jet.heading = Math.PI / 2; jet.speed = 0;
  I.held.add('gas'); step(90); I.held.delete('gas');
  step(30 * 9, () => { I.joyY = jet.speed > 55 ? -0.8 : 0; I.held.add('gas'); /* joystick pulled down = climb, + speed held */ }); I.held.delete('gas');
  I.joyY = 0;
  const alt = jet.y, kmh = jet.speed * 3.6;
  jet.x = -500; jet.z = -720; jet.y = 0; jet.vy = 0; jet.speed = 0; jet.pitch = 0; jet.roll = 0; jet.throttleSet = 0; jet.thrust = 0; jet.airborne = false; step(5);
  I.pressed.add('vehicle'); step(40);
  return { buildings, soldiers, tLabel, inTank, turned, shells, boom, jLabel, inJet, alt, kmh, patrol: game.military.patrol.length, onFoot: P.state };
});
check('military base: buildings and soldiers on guard / patrol', mil.buildings >= 7 && mil.soldiers >= 6, JSON.stringify({ b: mil.buildings, s: mil.soldiers }));
check('tank: "enter tank", turret follows the camera, the cannon fires and explodes', mil.tLabel === 'היכנס לטנק' && mil.inTank && mil.turned > 0.3 && mil.shells === 1 && mil.boom, JSON.stringify(mil));
check('fighter jet: "board plane", take off from the base runway and fly', mil.jLabel === 'היכנס למטוס' && mil.inJet && mil.alt > 80 && mil.kmh > 240 && mil.onFoot === 'foot', JSON.stringify(mil));
const gate = await g(() => { const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } }; const dens = game.traffic.target; game.traffic.setDensity(0); game.teleport(-497, 40, Math.PI, 0.3); step(5); for (const c of game.traffic.cars.slice()) game.traffic.remove(c); step(90); const closed = game.military.gateOpen; game.teleport(-497, -28, Math.PI, 0.3); step(75); return { closed, open: game.military.gateOpen, passable: game.military.gateCol.off, restore: game.traffic.setDensity(dens) }; });
check('base gate: the barrier arm lifts when you arrive', gate.closed < 0.05 && gate.open > 0.95 && gate.passable, JSON.stringify(gate));
check('fighter jets patrol over the city', mil.patrol >= 4, `${mil.patrol} jets`);

// ---------------------------------------------------------------- fighter missiles destroy cars, tank shells too, easy landing, France
const strike = await g(() => {
  const game = __game, P = game.player, I = game.input, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { if (P.vehicle) { P.vehicle.vx = P.vehicle.vz = 0; P.vehicle.speed = 0; } I.pressed.add('vehicle'); step(40); }
  game.teleport(-690, -510, 0, 0.3); step(40);
  const jet = game.vehicles.all().find((v) => v.T.fighter);
  const jp = jet.doorPoint(); game.teleport(jp.x, jp.z, 0, 0.3); step(5); I.pressed.add('vehicle'); step(60);
  // a target car 400 m ahead on the runway, the jet flying level towards it
  const car = game.spawnVehicleNear('sedan', -300, -10) || game.vehicles.all().find((v) => v.T.kind === 'car' && !v.T.mil);
  car.x = -300; car.z = -720; car.y = 0; car.heading = 0; car.vx = car.vz = 0; car.sync();
  jet.x = -750; jet.z = -720; jet.y = 60; jet.heading = Math.PI / 2; jet.speed = 90; jet.pitch = 0.08; jet.roll = 0; jet.vy = 0; jet.throttleSet = 0.6; jet.airborne = true;
  I.pressed.add('fire'); step(1); const fired = (game.military.missiles || []).length;
  step(90);
  const destroyed = car.wrecked, burning = game.weapons.burning.length > 0;
  // landing: glide down onto the runway with the throttle at idle — should touch down without damage
  car.x = -300; car.z = -640; car.sync();   // tow the wreck off the runway first
  jet.x = -950; jet.z = -720; jet.y = 40; jet.heading = Math.PI / 2; jet.speed = 72; jet.pitch = 0.06; jet.roll = 0.3; jet.vy = -4; jet.throttleSet = 0.25; jet.damage = 0; jet.airborne = true;
  let landedAt = null;
  for (let i = 0; i < 30 * 40 && landedAt === null; i++) { I.joyY = jet.y > 12 ? 0.25 : 0; /* joystick pushed up = descend */ step(1); if (!jet.airborne && jet.y < 0.5) landedAt = i; }
  I.joyY = 0;
  const landDamage = jet.damage;
  step(30 * 25);
  const stoppedSpeed = Math.abs(jet.speed);
  I.held.add('brake'); step(90); I.held.delete('brake'); const planeRev = jet.speed; step(60);
  I.pressed.add('vehicle'); step(40);
  return { fired, destroyed, burning, landed: landedAt !== null, landDamage, stoppedSpeed, planeRev, onFoot: P.state };
});
check('fighter: fires missiles that blow up a car (wrecked + burning)', strike.fired >= 1 && strike.destroyed && strike.burning, JSON.stringify(strike));
check('fighter: brake held when stopped = taxi backwards', strike.planeRev < -2, `speed ${strike.planeRev?.toFixed(1)}`);
check('fighter: easy landing on the runway without damage, rolls to a stop', strike.landed && strike.landDamage < 20 && strike.stoppedSpeed < 2 && strike.onFoot === 'foot', JSON.stringify(strike));
const fr = await g(async () => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  game.teleport(4905, 360, Math.PI, 0.3); step(60);
  let french = 0, shops = 0, terminal = false, tower = false, jet = false; for (let i = 45; i < 55; i++) for (let j = 0; j < 10; j++) { const cd = __wg.cellData(i, j); for (const b of cd.buildings) { if (b.french) french++; if (b.interior === 'shop') shops++; if (b.sign === 'נמל התעופה בל־ריב') terminal = true; if (b.sign === 'מגדל פיקוח' && i >= 45) tower = true; } if (cd.parking.some((q) => q.type === 'jet')) jet = true; }
  let sea = 0; for (let x = 1100; x < 4500; x += 100) if (__wg.cellKind(Math.floor(x / 100), 5) === 'Q') sea++;
  const iron = __wg.cellData(50, 4).props.some((p) => p.kind === 'ironTower');
  return { french, shops, sea, iron, terminal, tower, jet, d: __wg.districtAt(4905, 360), runway: __wg.cellData(50, 9).apron.some((a) => a.name === 'runway'), landing: !!game.flight && (await import('./js/game/flight.js')).RUNWAYS.some((r) => r.id === 'belle') };
});
check('France (Belle-Rive) ~3.5 km across the sea: Paris-style buildings, shops, iron tower', fr.french > 40 && fr.shops > 10 && fr.iron && fr.sea >= 25 && fr.d.includes('בל־ריב'), JSON.stringify(fr));
check('Belle-Rive airport: runway with landing assist, terminal, control tower, a parked airliner to fly home', fr.runway && fr.terminal && fr.tower && fr.jet && fr.landing, JSON.stringify(fr));

// ---------------------------------------------------------------- Los Antos: name and shop counts
const la = await g(() => {
  const n = {}; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (const b of __wg.cellData(i, j).buildings) if (b.interior === 'shop' && b.sign) n[b.sign] = (n[b.sign] || 0) + 1;
  return { clothes: n['חנות בגדים'] || 0, weapons: n['חנות נשקים'] || 0, ice: n['גלידת שקיעה'] || 0, falafel: n['פלאפל הכיכר'] || 0, title: document.title, d: __wg.districtAt(470, 470) };
});
check('city is called Los Antos', la.title === 'לוס אנטוס', la.title);
check('Los Antos: 7 clothes, 6 weapons, 1 ice-cream and 3 falafel shops (fewer, more open space)', la.clothes === 7 && la.weapons === 6 && la.ice === 1 && la.falafel === 3, JSON.stringify(la));

// ---------------------------------------------------------------- crashes, rider thrown off a motorbike, reversing with the brake
const crash = await g(() => {
  const game = __game, P = game.player, I = game.input, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { if (P.vehicle) { P.vehicle.vx = P.vehicle.vz = 0; P.vehicle.speed = 0; P.vehicle.y = Math.max(0, P.vehicle.y); P.vehicle.airborne = false; } I.pressed.add('vehicle'); step(40); }
  const dens = game.traffic.target; game.traffic.setDensity(0); game.traffic.cars.slice().forEach((c) => game.traffic.remove(c));
  game.teleport(560, 502, Math.PI / 2, 0.3); step(10);
  const a = game.spawnVehicleNear('sedan', 550, 502), t = game.spawnVehicleNear('hatch', 600, 502);
  t.x = 600; t.z = 502.5; t.heading = 0; t.vx = t.vz = 0; t.sync();
  P.forceIntoVehicle(a); a.x = 584; a.z = 502.9; a.heading = Math.PI / 2; a.vx = 22; a.vz = 0; a.speed = 22; a.sync();
  let bits = 0; step(25, () => { bits = Math.max(bits, game.crashes.bits.length); });
  const car = { bits, other: t.damage, spun: Math.abs(Math.atan2(Math.sin(t.heading), Math.cos(t.heading))) };
  a.vx = a.vz = 0; a.speed = 0; I.held.add('brake'); step(60); I.held.delete('brake'); const carRev = a.speed;
  I.pressed.add('vehicle'); step(40);
  const bike = game.spawnVehicleNear('moto', 520, 560), suv = game.spawnVehicleNear('suv', 560, 560);
  suv.x = 590; suv.z = 502.5; suv.heading = 0; suv.vx = suv.vz = 0; suv.sync();
  P.forceIntoVehicle(bike); bike.x = 578; bike.z = 502.4; bike.heading = Math.PI / 2; bike.vx = 18; bike.vz = 0; bike.speed = 18; bike.sync();
  game.econ.health = 100;   // earlier tests may have left the player hurt; the crash itself costs ~25 health
  const states = new Set(); step(30 * 6, () => states.add(P.state));
  game.traffic.setDensity(dens);
  return { car, carRev, states: [...states], end: P.state, bikeFallen: !!bike.fallen };
});
check('car crash: parts and sparks fly, the hit car is damaged and spins', crash.car.bits > 10 && crash.car.other > 10 && crash.car.spun > 0.1, JSON.stringify(crash.car));
check('brake reverses (cars)', crash.carRev < -2, `speed ${crash.carRev.toFixed(1)}`);
check('motorbike into a car at speed: the rider is thrown off, then gets up', crash.states.includes('ejected') && crash.end === 'foot' && crash.bikeFallen, JSON.stringify(crash));

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
  // earlier tests can leave the player hurt and an airliner taxiing / landing on this runway: start clean
  game.econ.health = 100; game.police.clear?.();
  for (const q of A.planes) if (q !== jet && (q.state === 'depart' || q.state === 'arrive')) { q.state = 'away'; q.mesh.visible = false; q.gate = null; q.timer = 300; if (A.runway === q) A.runway = null; }
  game.input.keys.add('KeyW');
  step(30 * 26, () => { if (v.speed > 60) game.input.keys.add('KeyR'); });   // gentler controls: a slower, steadier climb
  game.input.keys.clear();
  return { prompt, state: game.player.state, alt: v.y, kmh: v.speed * 3.6, gearUp: v.parts.jetMesh.geometry === v.parts.cleanGeo, hidden: !jet.mesh.visible };
});
check('jet: "board plane" button at a parked airliner', fly.prompt === 'היכנס למטוס', fly.prompt);
check('jet: player can fly it — takes off, climbs, retracts the gear', fly.alt > 30 && fly.kmh > 200 && fly.gearUp, JSON.stringify(fly));
await shot('21-flying');
await g(() => { const v = __game.player.vehicle; if (v) { v.x = -600; v.z = 790; v.y = 0; v.vy = 0; v.speed = 0; v.pitch = 0; v.airborne = false; } __game.input.pressed.add('vehicle'); for (let i = 0; i < 40; i++) { __game.time += 1 / 30; __game._playFrame(1 / 30); } });

// ---------------------------------------------------------------- police / wanted level, hospital, car dealership
const pol = await g(() => {
  const game = __game, P = game.player, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (game.player.state !== 'foot') { const v = game.player.vehicle; v.speed = 0; v.vx = v.vz = 0; game.input.pressed.add('vehicle'); step(40); }
  const W = window.__wg, st = W.cellData(7, 1).buildings.find((b) => b.sign === 'תחנת משטרה'), ho = W.cellData(1, 2).buildings.find((b) => b.sign === 'בית חולים');
  game.econ.money = 20000;
  game.teleport(530, 545, 0, 0.3); step(10);
  for (let k = 0; k < 7; k++) game.police.crime('gunfire', P.x, P.z); step(1);
  const lv = game.police.level, hud = document.querySelectorAll('#wanted > :not(s)').length + (document.getElementById('wanted').textContent.length ? 1 : 0);
  let maxCars = 0, cop = false, m0 = game.econ.money;
  for (let i = 0; i < 30 * 60 && game.police.level > 0; i++) { game.time += 1 / 30; game._playFrame(1 / 30); maxCars = Math.max(maxCars, game.police.cars.length); cop = cop || game.peds.peds.some((q) => q.copChase); }
  const busted = { level: game.police.level, atStation: Math.hypot(P.x - 750, P.z - 112) < 10, fine: m0 - game.econ.money };
  // escape: wanted again, then leave the area and stay out of sight
  game.police.setWanted(2, P.x, P.z); game.teleport(-300, 520, 0, 0.3);
  let t = 0; while (game.police.level > 0 && t < 100) { step(30, () => game.police.cars.forEach((c) => game.police._remove(c))); t++; if (t === 3) game.teleport(200, 560, 0, 0.3); }
  const escaped = game.police.level === 0;
  // wasted -> hospital
  game.hurt(500, 'test'); step(3);
  const hosp = Math.hypot(P.x - 150, P.z - 212) < 10 && game.econ.health > 50;
  // dealership: buy a car, it appears next to the shop and is saved
  const d = W.cellData(8, 3).buildings.find((b) => b.sign === 'סוכנות רכב');
  game.teleport(d.door.x, d.door.z, 0, 0.3); step(10);
  game.econ.money = 200000; game.openShop('dealer', 'סוכנות רכב');
  const rows = document.querySelectorAll('#shopPanel .srow').length;
  [...document.querySelectorAll('#shopPanel .srow')].find((r) => r.textContent.includes('רכב ספורט'))?.querySelector('.sbuy')?.click();
  game.shop.close();
  const car = game.vehicles.kept.find((v) => v.owned);
  game.save();
  const saved = JSON.parse(localStorage.getItem('azura_city_save_v1')).econ.ownedCars || [];
  return { stations: [!!st, !!ho, !!d], lv, hud, maxCars, cop, busted, escaped, t, hosp, rows, car: car && Math.round(Math.hypot(car.x - d.door.x, car.z - d.door.z)), saved: saved.length, paid: 200000 - game.econ.money };
});
check('police station, hospital and car dealership exist', pol.stations.every(Boolean), JSON.stringify(pol.stations));
check('wanted: a crime gives stars, shown on the HUD', pol.lv >= 1 && pol.hud > 0, `level ${pol.lv}`);
check('wanted: patrol cars chase you, officers get out', pol.maxCars >= 2 && pol.cop, `cars ${pol.maxCars}, cop on foot ${pol.cop}`);
check('wanted: standing still -> busted, fined, released at the police station', pol.busted.level === 0 && pol.busted.atStation && pol.busted.fine > 0, JSON.stringify(pol.busted));
check('wanted: leaving the area and staying unseen loses the police', pol.escaped, `${pol.t}s`);
check('wasted -> wake up at the hospital', pol.hosp);
check('dealership: buying a car spawns it next to the shop and saves it', pol.rows >= 10 && pol.car !== undefined && pol.car < 40 && pol.saved >= 1 && pol.paid > 0, JSON.stringify({ rows: pol.rows, car: pol.car, saved: pol.saved, paid: pol.paid }));
await shot('22-police');

// ---------------------------------------------------------------- GTA-style escape: out of sight -> stars blink -> gone, police leave
const esc = await g(() => {
  const game = __game, P = game.player, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  game.teleport(530, 545, 0, 0.3); step(10);
  game.police.setWanted(2, P.x, P.z); step(30 * 8, () => { game.police.arrestT = 0; });   // dodge the officers while the chase builds up
  const chased = game.police.cars.length;
  game.teleport(250, 300, 0, 0.3);                     // run off a few blocks away, out of their sight
  // (a teleport can land right next to a passing patrol; in the game you would have run away from it)
  for (const c of game.police.cars.slice()) if (Math.hypot(c.x - P.x, c.z - P.z) < 80) game.police._remove(c);
  for (const q of game.peds.peds) if (q.app.cop && q.copChase && Math.hypot(q.x - P.x, q.z - P.z) < 40) { q.copChase = false; q.state = 'walk'; }
  let blinkAt = -1, t = 0;
  while (game.police.level > 0 && t < 115 * 30) { step(1); t++; if (blinkAt < 0 && document.getElementById('wanted').classList.contains('blink')) blinkAt = t / 30; }
  const leaving = (game.police.gone || []).length;
  step(30 * 16);
  return { chased, blinkAt, escapedAt: t / 30, level: game.police.level, leaving, left: (game.police.gone || []).length + game.police.cars.length, hud: document.getElementById('wanted').innerHTML, atStation: Math.hypot(P.x - 750, P.z - 112) < 10 };
});
check('escape: stars blink as soon as the police lose sight of you', esc.blinkAt > 0 && esc.blinkAt < 4, JSON.stringify(esc));
check('escape: after 90 s out of their sight (or out of their reach) the stars disappear (not arrested)', esc.level === 0 && !esc.atStation && esc.escapedAt > 60 && esc.escapedAt < 96 && esc.hud === '', JSON.stringify(esc));
check('escape: the patrol cars switch off their sirens and drive away, then are gone', esc.left === 0);

// ---------------------------------------------------------------- pursuit along the streets
const chase = await g(() => {
  const game = __game, P = game.player, Po = game.police, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  const onRoad = (x, z) => { const mx = ((x % 100) + 100) % 100, mz = ((z % 100) + 100) % 100; return Math.min(mx, 100 - mx) < 12 || Math.min(mz, 100 - mz) < 12; };   // road + parking lane
  game.teleport(550, 500, 0, 0.3); step(5);
  Po.setWanted(2, P.x, P.z);
  let samples = 0, road = 0, arrive = -1, jumps = 0; const last = new Map();
  for (let i = 0; i < 30 * 35; i++) {
    Po.arrestT = 0; step(1);
    for (const c of Po.cars) {
      const L = last.get(c); if (L && Math.hypot(c.x - L[0], c.z - L[1]) > 5) jumps++; last.set(c, [c.x, c.z]);
      const d = Math.hypot(c.x - P.x, c.z - P.z);
      if (d > 45) { samples++; if (onRoad(c.x, c.z)) road++; }
      if (d < 25 && arrive < 0) arrive = i / 30;
    }
  }
  Po.clear();
  return { pct: Math.round(100 * road / Math.max(1, samples)), arrive, jumps };
});
check('police: patrol cars drive to you along the streets (route planning) and arrive', chase.pct >= 70 && chase.arrive > 0 && chase.arrive < 30, JSON.stringify(chase));
check('police: no patrol car ever jumps / teleports closer', chase.jumps === 0);

// ---------------------------------------------------------------- fist fights: people fight back with real moves
const brawl = await g(() => {
  const game = __game, P = game.player, step = (n) => { for (let i = 0; i < n; i++) { if (game.police.level) game.police.clear(); game.time += 1 / 30; game._playFrame(1 / 30); } };
  game.equip(null); game.teleport(311, 309, 0, 0.3); step(20);
  const q = game.peds.peds.filter((o) => !o.car && !o.shopKey && o.app && !o.app.long && !o.app.cop && !o.app.gang && !['inside', 'shopkeeper', 'resident', 'dead', 'guard'].includes(o.state)) /* a man: women don't start fist fights, officers arrest */.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
  if (!q) return {};
  q.temper = 'fight'; q.skill = 1; q.hp = q.maxHp = 16; q.state = 'walk';
  game.teleport(q.x, q.z - 1.3, 0, 0.3); step(2);
  const states = new Set(), atks = new Set(); const h0 = game.econ.health; let fx = 0, minH = 100;
  for (let i = 0; i < 30 * 16 && q.state !== 'dead' && q.state !== 'flee'; i++) {
    if (i % 9 === 0 && q.state !== 'knocked' && q.state !== 'getup') game.input.pressed.add('fire');
    minH = Math.min(minH, game.econ.health); if (game.econ.health < 30) game.econ.health = 100;
    step(1); states.add(q.state); if (q.atk) atks.add(q.atk.type); if (q.pose === 'block' || q.pose === 'slip') states.add(q.pose); fx = Math.max(fx, game.hitfx.live.length);
  }
  return { states: [...states], atks: [...atks], tookDmg: minH < h0, fx };
});
check('fight: a hit person fights back with several different strikes', brawl.states?.includes('fight') && brawl.atks?.length >= 2 && brawl.tookDmg, JSON.stringify(brawl));
check('fight: fighters block / slip punches, get knocked down and get back up', brawl.states?.some((s) => s === 'block' || s === 'slip') && brawl.states?.includes('knocked') && brawl.states?.includes('getup'), JSON.stringify(brawl.states));
check('fight: impact effects appear when blows land (no blood)', brawl.fx > 0);

// ---------------------------------------------------------------- flight assistance + flight school
const fly2 = await g(() => {
  const game = __game, P = game.player, F = game.flight, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  F.startTraining('jet'); step(3);
  const v = P.vehicle, inPlane = !!v?.isPlane;
  game.input.pressed.add('assist'); step(1);
  let t = 0; while (t < 30 * 90 && (F.auto || v.y < 5)) { step(1); t++; }
  const takeoff = { alt: Math.round(v.y), auto: !!F.auto, trainStep: F.train?.step };
  const y0 = v.y; let maxRoll = 0; step(30 * 15, () => { maxRoll = Math.max(maxRoll, Math.abs(v.roll)); });
  const stable = { dAlt: Math.round(v.y - y0), maxRoll };
  const m0 = game.econ.money;
  for (const R of F.train.rings) { v.x = R.x + 40; v.z = R.z; v.y = R.y; step(2); v.x = R.x; step(2); }
  v.x = -5000; v.z = 790; v.y = 320; v.heading = Math.PI / 2; v.pitch = 0; v.roll = 0; v.vy = 0; v.speed = 80; v.throttleSet = 0.6;
  game.input.pressed.add('assist'); step(1);
  t = 0; while (t < 30 * 200 && F.auto) { step(1); t++; }
  const landed = { stopped: Math.abs(v.speed) < 2, runway: F.onRunway(v)?.id, dmg: Math.round(v.damage), paid: game.econ.money - m0, school: game.econ.flightSchool };
  const hud = !document.querySelector('#flightHud.show') && document.getElementById('speedo').classList.contains('show');   // no top readouts, speed in the speedometer
  game.input.pressed.add('vehicle'); step(60);
  return { inPlane, takeoff, stable, landed, hud };
});
check('flight school: starts in a plane on the runway (speed in the speedometer, no top readouts)', fly2.inPlane && fly2.hud, JSON.stringify(fly2));
check('flight: assisted take-off climbs to a safe height by itself', fly2.takeoff.alt > 100 && !fly2.takeoff.auto && fly2.takeoff.trainStep >= 1, JSON.stringify(fly2.takeoff));
check('flight: stability mode keeps the plane level and at its altitude hands-off', Math.abs(fly2.stable.dAlt) < 25 && fly2.stable.maxRoll < 0.1, JSON.stringify(fly2.stable));
check('flight: assisted landing lines up, slows down and stops on the runway undamaged', fly2.landed.stopped && fly2.landed.runway === 'air' && fly2.landed.dmg < 10, JSON.stringify(fly2.landed));
check('flight school: rings + landing complete the course and pay the reward', fly2.landed.paid >= 250 && fly2.landed.school >= 1);

// ---------------------------------------------------------------- weapons: magazines, reload, draw / holster
const gun = await g(() => {
  const game = __game, P = game.player, W = game.weapons, step = (n, f) => { for (let i = 0; i < n; i++) { if (game.police.level) game.police.clear(); f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  game.teleport(530, 562, 0, 0.3); step(5);
  game.econ.weapons.x4 = { ammo: 70 }; game.equip('x4');
  const d0 = P.drawK; step(25); const drawn = P.drawK === 1 && W.gun.visible;
  const inv = game.econ.weapons.x4;
  step(30 * 5, () => game.input.keys.add('KeyT')); game.input.keys.clear();
  const emptied = inv.mag === 0 && !!W.reloading;
  let magOut = false; step(30 * 3, () => { if (W.gunMag && !W.gunMag.visible) magOut = true; });
  const reloaded = inv.mag === 30 && inv.ammo === 40;
  step(5, () => game.input.keys.add('KeyT')); game.input.keys.clear(); step(10);
  game.input.pressed.add('reload'); step(1); const manual = !!W.reloading; step(30 * 2.2);
  const ik = W.ikW > 0.9;
  game.equip(null); step(1); const holstering = !!W.holstering; step(15);
  return { d0, drawn, emptied, magOut, reloaded, manual, full: inv.mag === 30, ik, holstering, gone: !W.gun && !W.holstering };
});
check('weapons: drawing the weapon is animated (it comes up from the hip)', gun.d0 === 0 && gun.drawn, JSON.stringify(gun));
check('weapons: a magazine runs empty and reloads by itself (magazine drops out, a new one goes in)', gun.emptied && gun.magOut && gun.reloaded);
check('weapons: manual reload (X / "טעינה") tops the magazine up', gun.manual && gun.full);
check('weapons: two-handed weapons keep the support hand on the gun (IK)', gun.ik);
check('weapons: putting the weapon away is animated too', gun.holstering && gun.gone);

// ---------------------------------------------------------------- run over: fast = stays down for good (no gore), slow = knocked over
const ro = await g(() => {
  const dbg = [];
  const game = __game, P = game.player, step = (n, f) => { for (let i = 0; i < n; i++) { if (game.police.level) game.police.clear(); f && f(i); game.time += 1 / 30; const ox = P.x, oz = P.z, h0 = game.econ.health; game._playFrame(1 / 30); if (Math.hypot(P.x - ox, P.z - oz) > 5 || game.econ.health < h0 - 5) dbg.push([Math.round(ox), Math.round(oz), Math.round(P.x), Math.round(P.z), P.state, Math.round(game.econ.health)]); } };
  if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  const run = (kmh, first = 335, gap = 18, n = 4) => {
    game.econ.health = 100; game.teleport(300, 590, 0, 0.3); step(5);
    // clear the lane: a car left there by an earlier run would be crashed into at full speed
    for (const o of [...game.vehicles.all(), ...game.traffic.cars]) if (o.x > 285 && o.x < 560 && Math.abs(o.z - 597.75) < 5) { o.z += 40; o.speed = 0; o.vx = o.vz = 0; o.sync(); }
    // patrol cars from the previous tests (also the ones driving away) must not be in the lane either
    for (const c of [...game.police.cars, ...(game.police.gone || [])]) game.police._remove(c); game.police.cars = []; game.police.gone = [];
    const v = game.spawnVehicleNear('sedan', 300, 600); v.x = 300; v.z = 597.75; v.heading = Math.PI / 2; v.sync();
    P.state = 'driving'; P.vehicle = v; v.driver = 'player'; P.ignoreVehicle = v; P._attach(v);
    const people = [];
    for (let i = 0; i < n; i++) { const x = first + i * gap, z = 597.75; const q = game.peds._add({ x, z, state: 'wander', pts: [[x, z], [x + 0.3, z + 0.2]], wi: 0, timer: 99, ix: 3, iz: 5, corner: 0, dir: 1 }); people.push(q); }
    game.peds._colors();
    const seen = new Map();
    step(30 * (kmh > 30 ? 5.5 : 9), () => { v.speed = kmh / 3.6; v.vx = Math.sin(v.heading) * v.speed; v.vz = Math.cos(v.heading) * v.speed; for (const q of people) { const st = seen.get(q) || new Set(); st.add(q.state); seen.set(q, st); } });
    step(30 * 4);
    v.speed = 0; v.vx = v.vz = 0; game.input.pressed.add('vehicle'); step(60);
    return { dead: people.filter((q) => q.state === 'dead').length, hit: people.filter((q) => seen.get(q).has('thrown') || seen.get(q).has('fall')).length, up: people.filter((q) => seen.get(q).has('fall') && q.state !== 'dead' && q.state !== 'fall').length };
  };
  const out = { fast: run(60, 330, 4, 4), slow: run(25, 306, 0, 1) }; out.dbg = dbg.slice(0, 12); return out;   // fast: a tight group crossing in front of the car   // slow: someone 4 m in front of the bumper, too late to step aside
});
check('run over at speed: people are hit (no instant dodging) and stay down for good (no gore)', ro.fast.hit >= 2 && ro.fast.dead >= 2 && ro.fast.dead === ro.fast.hit, JSON.stringify(ro));
check('a slow bump only knocks a person over; they get back up', ro.slow.hit >= 1 && ro.slow.dead === 0, JSON.stringify(ro.slow));

// ---------------------------------------------------------------- police only come for repeated gunfire
const calm = await g(() => {
  const game = __game, P = game.player, Po = game.police, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  Po.clear(); Po.shots = []; game.teleport(530, 562, 0, 0.3); step(5);
  game.econ.weapons.p7 = { ammo: 60 }; game.equip('p7'); step(20);
  for (let i = 0; i < 3; i++) { game.input.pressed.add('fire'); step(12); }
  const afterFew = Po.level;
  ['punch', 'kill', 'assault', 'carjack', 'copHit'].forEach((k) => Po.crime(k, P.x, P.z));
  const afterOther = Po.level;
  game.econ.weapons.x4 = { ammo: 90 }; game.equip('x4'); step(25);
  step(30 * 2, () => game.input.keys.add('KeyT')); game.input.keys.clear();
  const afterBurst = Po.level;
  Po.clear(); game.equip(null); step(15);
  return { afterFew, afterOther, afterBurst };
});
check('police: a few shots, punches, run-overs or taking cars do not call the police', calm.afterFew === 0 && calm.afterOther === 0, JSON.stringify(calm));
check('police: repeated gunfire (a burst) brings the police', calm.afterBurst >= 1, JSON.stringify(calm));

// ---------------------------------------------------------------- banks + fictional heists
const bank = await g(() => {
  const game = __game, P = game.player, H = game.heist, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  game.police.clear(); game.econ.health = 100; game.econ.heists = {};
  const banks = ['central', 'harbor', 'local', 'gold'].map((id) => { const b = H.bankBuilding(id), I = H.info(id); return !!(b && b.interior === 'bank' && I?.vault && I?.security && I.drawers.length); });
  const sizes = new Set(['central', 'harbor', 'local', 'gold'].map((id) => { const b = H.bankBuilding(id); return Math.round(b.w * b.d); })).size;
  const go = (pt, y, f = 0) => { game.teleport(pt[0], pt[1], f, y + 0.6); step(3); };
  const press = () => { game.input.pressed.add('interact'); step(1); };
  // the neighbourhood bank heist, start to finish
  const I = H.info('local'); go(I.start.pt, I.start.y, Math.PI); step(60);   // walk in: staff, customers and the guard are inside
  const prompt = P.prompt?.text || ''; const m0 = game.econ.money;
  const idle = !H.active;                                   // just walking in starts nothing
  go(I.drawers[0].pt, I.drawers[0].y); step(2);            // slip behind the counter: the robbery begins
  const started = !!H.active, alarm = H.active?.alarm, stars = game.police.level;
  step(10); let peopleReacted = game.peds.peds.filter((q) => q.heistReacted).length;
  let guard = 0;
  while (H.active && guard++ < 30) {
    const S = H.stage();
    if (S.type === 'escape') { game.police.clear(); step(3); continue; }
    const t = H.targets().find((q) => !q.taken); if (!t) { step(5); continue; }
    if (S.type === 'loot' && S.from === 'vault' && H.gates[H.active.id]?.locked) { const gt = I.vault.gate; go(gt.pad, gt.y); H.unlockGate(H.active.id); step(60); continue; }   // the bar gate (code game tested separately)
    if (S.type === 'vault' && !H.active.hasKey) { go(I.start.pt, I.start.y); H.onExplosion({ x: t.pt[0], y: t.y + 1, z: t.pt[1] }); step(30 * 3); game.econ.health = 100; continue; }   // no button: a grenade / sticky bomb on the door blows it
    go(t.pt, t.y); press(); step(Math.ceil(S.dur * 30) + 3);
    if (S.type === 'unlock') step(30 * 6);
    if (S.type === 'vault') { go(I.start.pt, I.start.y); step(30 * 8); game.econ.health = 100; }   // charge set: step back from the blast
  }
  step(30);
  const L = [...game.interiors.loaded.values()].find((q) => q.b.bank?.id === 'local');
  const lootGone = L?.lootObj ? Object.values(L.lootObj).filter((o) => !o.grp.visible).length : 0, lootAll = L?.lootObj ? Object.keys(L.lootObj).length : 0;
  const paid = game.econ.money - m0, rec = (game.econ.heists || {}).local, status = H.status('local').state;
  game.save(); const saved = JSON.parse(localStorage.getItem('azura_city_save_v1')).econ.heists?.local?.count;
  return { banks, sizes, prompt, idle, lootGone, lootAll, started, alarm, stars, done: !H.active, paid, rec: !!rec, status, saved, peopleReacted, reward: document.getElementById('heistReward').classList.contains('show') };
});
check('banks: four different banks you can enter (vault, security room, tellers)', bank.banks.every(Boolean) && bank.sizes === 4, JSON.stringify(bank.banks));
check('heist: no "start" button — walking in is fine, robbing (behind the counter / weapon out) starts it', !bank.prompt.includes('התחל שוד') && bank.idle && bank.started, bank.prompt);
check('heist: the cash and gold you take disappear from the bank', bank.lootAll > 0 && bank.lootGone === bank.lootAll, `${bank.lootGone}/${bank.lootAll}`);
check('heist: alarm, police stars and people reacting (hide / flee / call)', bank.alarm && bank.stars >= 2 && bank.peopleReacted > 0, JSON.stringify(bank));
check('heist: completing it pays the bank loot into the account, with the money animation', bank.done && bank.paid === 150000 && bank.reward, JSON.stringify(bank));
const vkey = await g(() => {
  const game = __game, P = game.player, H = game.heist, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  game.police.clear(); game.econ.health = 100; game.econ.heists = {};
  const I = H.info('central'); game.teleport(I.start.pt[0], I.start.pt[1], Math.PI, I.start.y + 0.6); step(60);
  H.start('central', false); const A = H.active;
  A.stage = 1; A.targets = null; A.keyHolder = undefined;   // central: 0 security, 1 vault
  step(2);
  // make sure someone holds the key, then take him down
  if (!A.keyHolder) { H._assignKey(A); if (!A.keyHolder && A.staff.length) A.keyHolder = A.staff[0]; }
  const kh = A.keyHolder; if (!kh) return { err: 'no staff' };
  kh.state = 'dead'; kh.timer = 45; step(3);
  const dropped = !!A.keyObj;
  game.teleport(A.keyObj.position.x, A.keyObj.position.z, 0, A.keyObj.position.y + 0.5); step(3);
  const takePrompt = P.prompt?.text || ''; game.input.pressed.add('interact'); step(2);
  const hasKey = A.hasKey;
  const t = H.targets()[0]; game.teleport(t.pt[0], t.pt[1], 0, t.y + 0.6); step(3);
  const prompt = P.prompt?.text || '';
  H.fail('בדיקה'); game.police.clear(); game.econ.heists = {};
  return { dropped, takePrompt, hasKey, prompt };
});
check('bank vault: the guard / teller with the key drops it when taken down; with the key the vault opens (or blow it without)', vkey.dropped && vkey.takePrompt.includes('קח את המפתח') && vkey.hasKey && vkey.prompt.includes('פתח עם מפתח'), JSON.stringify(vkey));
const gold = await g(async () => {
  const game = __game, P = game.player, H = game.heist, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  game.police.clear(); game.econ.health = 100; game.econ.heists = {}; if (H.active) H.fail('בדיקה');
  const I = H.info('gold'), v = I.vault; game.teleport(v.outside[0], v.outside[1], 0, v.y + 0.6); step(60);
  const vg = game.peds.peds.filter((q) => q.vaultGuard && q.state !== 'dead' && Math.hypot(q.x - v.outside[0], q.z - v.outside[1]) < 4).length;
 
  game.teleport(I.start.pt[0], I.start.pt[1], 0, I.start.y + 0.6); step(5);
  H.onExplosion({ x: v.outside[0], y: v.y + 1, z: v.outside[1] }); step(30 * 4);   // a grenade at the vault door, heist not even started
  const blown = H.doors.gold?.mode, stage = H.stage()?.type, from = H.stage()?.from;
  const gt = v.gate; game.teleport(gt.pad[0], gt.pad[1], 0, gt.y + 0.6); game.police.clear(); step(4);
  const lockedBlocks = !H.gates.gold.open && !!gt; const padPrompt = P.prompt?.text || '';
  const lootBefore = H.targets().find((q) => !q.taken); game.teleport(lootBefore.pt[0], lootBefore.pt[1], 0, lootBefore.y + 0.6); step(3);
  const lootPromptLocked = P.prompt?.text || '';
  game.teleport(gt.pad[0], gt.pad[1], 0, gt.y + 0.6); step(3);
  game.input.pressed.add('interact'); step(1);
  const opened = !!document.getElementById('codeGame'), st = H._cg;
  // play it: stop each rolling digit on the code's digit; one wrong stop first
  let wrong = 0; if (st) { st.v = (st.code[0] + 1) % 10; document.querySelector('#codeGame .cg-lock').dispatchEvent(new Event('pointerdown')); wrong = st.miss; }
  for (let i = 0; i < 4 && st; i++) { st.v = st.code[st.i]; document.querySelector('#codeGame .cg-lock')?.dispatchEvent(new Event('pointerdown')); }
  await new Promise((r) => setTimeout(r, 900));
  const closed = !document.getElementById('codeGame'), unlocked = H.gates.gold.locked === false; step(60);
  const gateUp = H.gates.gold.open > 0.9 && gt.col.off !== undefined;
  const L = [...game.interiors.loaded.values()].find((q) => q.b.bank?.id === 'gold'), colOff = L.spec.bank.vault.gate.col.off;
  game.teleport(lootBefore.pt[0], lootBefore.pt[1], 0, lootBefore.y + 0.6); step(3);
  const lootPrompt = P.prompt?.text || '';
  H.fail('בדיקה'); game.police.clear(); game.econ.heists = {};
  return { vg, blown, stage, from, padPrompt, lootPromptLocked, opened, wrong, closed, unlocked, gateUp, colOff, lootPrompt, state: game.state };
});
check('gold bank: two armed guards at the vault door', gold.vg >= 2, JSON.stringify(gold));
check('bank vault: a grenade / sticky bomb at the vault door blows it open (any stage, even before the heist started)', gold.blown && gold.blown !== 'closed' && gold.stage === 'loot' && gold.from === 'vault', JSON.stringify(gold));
check('bank vault: bar gate inside — locked, money unreachable until you crack the code (keypad prompt)', gold.padPrompt.includes('סורגים') && !gold.lootPromptLocked, JSON.stringify(gold));
check('bank vault: code mini game — stop each digit on the code, mistakes counted, solving lifts the bars and the money is yours', gold.opened && gold.wrong === 1 && gold.closed && gold.unlocked && gold.gateUp && gold.colOff && gold.lootPrompt.length > 0 && gold.state === 'playing', JSON.stringify(gold));
check('heist: result is saved and the robbed bank closes for a while', bank.rec && bank.saved === 1 && bank.status === 'cooldown');

// ---------------------------------------------------------------- garage: drive onto the turntable, live mods, before/after, pay, save
const gar = await g(async () => {
  const WG = await import('./js/world/worldGen.js');
  const game = __game, P = game.player, T = game.tuning;
  const step = (n) => { for (let i = 0; i < n; i++) { if (game.police.level) game.police.clear(); game.time += 1 / 30; if (game.state === 'tuning') T.frame(1 / 30); else game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  game.econ.money = 60000;
  const bld = WG.cellData(8, 3).buildings.find((q) => q.garage);
  game.teleport(bld.door.x, bld.door.z, 0); step(40);
  const L = [...game.interiors.loaded.values()].find((q) => q.spec.workshop);
  if (!L) return { err: 'no workshop' };
  const W = L.spec.workshop, v = game.spawnVehicleNear('sedan', W.bay.pt[0], W.bay.pt[1]);
  v.x = W.bay.pt[0]; v.z = W.bay.pt[1]; v.y = W.y; v.heading = W.bay.yaw; v.speed = 0; v.sync();
  P.state = 'driving'; P.vehicle = v; v.driver = 'player'; P.ignoreVehicle = v; P._attach(v);
  step(5);
  const prompt = P.prompt?.text || '';
  game.input.pressed.add('interact'); step(1);
  const opened = game.state === 'tuning' && document.getElementById('tunePanel').classList.contains('show');
  const wheelGeo0 = v.parts.wheels[0].spin.children[0].geometry, m0 = game.econ.money, accel0 = v.T.accel;
  T.setCat('rim'); T.pick('rim', 2);
  const livePreview = v.parts.wheels[0].spin.children[0].geometry !== wheelGeo0 && game.econ.money === m0;
  T.buy(); step(3); const working = !!T.s.work && !!T.mech; step(80);
  T.setCat('spoiler'); T.pick('spoiler', 2); T.buy(); step(70);
  T.setCat('engine'); T.pick('engine', 1); T.buy(); step(70);
  T.setCat('color'); T.pick('color', 0x27ae60); T.buy(); step(100);
  const kit = v.parts.kit.children.length, paid = m0 - game.econ.money, faster = v.T.accel > accel0;
  T.toggleBefore(); step(1); const beforeShowsOld = v.mods.rim === 0 && v.parts.kit.children.length === 0; T.toggleBefore(); step(1);
  T.setCat('own'); T.pick('own', 1); T.buy(); step(70);
  T.close(); step(3);
  game.save(); const sv = JSON.parse(localStorage.getItem('azura_city_save_v1')).econ.ownedCars.find((c) => c.type === 'sedan' && c.mods);
  return { prompt, opened, livePreview, working, kit, paid, faster, beforeShowsOld, back: game.state === 'playing', saved: sv && sv.mods.rim === 2 && sv.mods.spoiler === 2 && sv.mods.color === 0x27ae60 };
});
check('garage: driving onto the turntable inside the workshop offers the garage and opens it', gar.prompt.includes('מוסך') && gar.opened, JSON.stringify(gar));
check('garage: picking a part shows it on the car right away, before paying', gar.livePreview);
check('garage: buying it — the mechanic works on the car, the money is paid, parts and performance change', gar.working && gar.kit > 0 && gar.paid > 0 && gar.faster, JSON.stringify(gar));
check('garage: before / after view, and the mods are saved with your registered car', gar.beforeShowsOld && gar.back && gar.saved, JSON.stringify(gar));

// ---------------------------------------------------------------- three playable characters (Miguel, Tavor, Jason)
const ch = await g(() => {
  const game = __game, C = game.chars, P = game.player;
  const step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; if (game.state === 'switching') C.frame(1 / 30); else game._playFrame(1 / 30); } };
  game.police.clear(); if (game.heist.active) game.heist.fail?.('test');
  if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  const startName = C.current.name, m0 = game.econ.money;
  C.open(); const wheel = document.getElementById('charWheel').classList.contains('show') && document.querySelectorAll('.cw-card').length === 3;
  const other = C.active === 'tavor' ? 'jason' : 'tavor';
  C.pick(other); const switching = game.state === 'switching';
  for (let i = 0; i < 150 && game.state === 'switching'; i++) step(1);
  const now = C.active, look = P.model.app.name, otherMoney = game.econ.money, d = Math.hypot(P.x - C.data[startName === 'מיגל' ? 'miguel' : C.active].x, 0);
  game.econ.money += 123;  // something only this character earns
  C.switchTo('miguel'); for (let i = 0; i < 150 && game.state === 'switching'; i++) step(1);
  const backMoney = game.econ.money;
  game.police.setWanted?.(2); const blocked = !!C.why(); game.police.clear();
  game.save(); const sv = JSON.parse(localStorage.getItem('azura_city_save_v1')).chars;
  return { startName, wheel, switching, now, other, look, otherMoney, m0, backMoney, blocked, saved: sv && Object.keys(sv.data).length === 3 && sv.data[other].money === otherMoney + 123, d };
});
check('characters: wheel with Miguel, Tavor and Jason; switching flies the camera to the other one', ch.wheel && ch.switching && ch.now === ch.other && ['טבור', 'ג׳ייסון'].includes(ch.look), JSON.stringify(ch));
check('characters: each has his own money, saved separately; switching is blocked while wanted', ch.backMoney === ch.m0 && ch.saved && ch.blocked, JSON.stringify(ch));

// ---------------------------------------------------------------- gun store laid out like a real one
const gs = await g(async () => {
  const WG = await import('./js/world/worldGen.js'), IN = await import('./js/world/interiors.js');
  const b = WG.cellData(8, 1).buildings.find((q) => q.sign === 'חנות נשקים'), S = IN.interiorSpec(b);
  const glass = S.boxes.filter((x) => x.mat === 'glass').length, lamps = S.boxes.filter((x) => x.mat === 'lamp').length;
  return { boxes: S.boxes.length, glass, lamps, signs: S.signs.map((x) => x.name), counter: !!S.counter, room: S.rooms[0].rect };
});
check('gun store: compact store with glass counter, wall displays, shelves, ceiling lights and brand signs', gs.boxes > 400 && gs.glass >= 4 && gs.lamps >= 4 && gs.counter && gs.signs.includes('נץ שטח'), JSON.stringify({ ...gs, room: undefined }));

// ---------------------------------------------------------------- gangs: ABC (green) and BC (blue), phone app, crew that follows / drives / fights, turf takeover
const gang = await g(() => {
  const game = __game, P = game.player, Gs = game.gangs;
  const step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  game.police.clear(); if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  if (game.econ.gang) Gs.leave(false, true);
  game.econ.health = 100; game.teleport(114, 114, 0); step(90);
  const C = Gs.crews.north;
  const counts = { spawned: C.members.length, gang: C.G.id, cars: C.cars.filter((v) => v.typeKey !== 'moto').length, bikes: C.cars.filter((v) => v.typeKey === 'moto').length, carColor: C.cars[0]?.parts.baseColor.getHex(), signs: (C.signs || []).length };
  const looks = { models: C.members.filter((m) => m.cm).length, bandanas: C.members.filter((m) => m.modelApp.mask === 'bandana').length, chains: C.members.filter((m) => m.modelApp.chain).length, guns: C.members.filter((m) => m.app.gun).length, weaponMeshes: C.members.filter((m) => m.weapon).length };
  const inside = Gs.inside;
  // walking right up to them does nothing - they only talk
  const L = C.members.find((m) => m.gangRole === 'leader'); game.teleport(L.x + 1.2, L.z + 1.2, 0); step(30 * 4);
  const calm = C.hostile === 0 && C.members.every((m) => m.state !== 'copChase');
  // provoke: hit one and the crew comes for you and shoots (game damage)
  const m = C.members.find((q) => q.gangRole === 'member' && q.app.gun && q.state !== 'dead');
  game.teleport(m.x + 8, m.z + 8, 0); step(5);
  game.peds.hit(m, P, 1, false);
  let hurt = 0; step(30 * 8, () => { if (game.econ.health < 50) { hurt += 100 - game.econ.health; game.econ.health = 100; } });
  hurt += 100 - game.econ.health; game.econ.health = 100;
  const chase = C.members.filter((q) => q.state === 'copChase' || q.state === 'gangFight').length;
  C.hostile = 0; game.teleport(498, 515, 0); step(40);
  // phone: join ABC, call the crew
  game.phone.toggle(true); game.phone.show('gang');
  const apps = !!document.querySelector('[data-join="abc"]') && !!document.querySelector('[data-join="bc"]');
  document.querySelector('[data-join="abc"]').click(); const joined = game.econ.gang, chain = !!P.model.app.chain;
  document.querySelector('[data-g="call"]').click(); game.phone.toggle(false);
  const arrivals = (Gs.arrivals || []).map((a) => [a.v.typeKey, a.riders.length]);
  step(30 * 30); const near = Gs.followers.filter((f) => Math.hypot(f.x - P.x, f.z - P.z) < 12).length;
  const parkedOnRoad = (Gs.rides || []).every((v) => Math.min(Math.abs(v.x - Math.round(v.x / 100) * 100), Math.abs(v.z - Math.round(v.z / 100) * 100)) < 6.5);
  const ownF = Gs.followers[0], ownHp = ownF.hp; game.peds.hit(ownF, P, 5, false); const ownSafe = ownF.hp === ownHp;
  // somebody starts a fight with you: the crew goes for him without being told
  const brawler = game.peds.peds.filter((o) => !o.gangId && !o.follower && !o.app.cop && o.state !== 'dead' && !o.car && !o.shopKey).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
  let defend = 0;
  if (brawler) { brawler.x = P.x + 3; brawler.z = P.z + 1; brawler.state = 'fight'; brawler.atkCool = 0.4; step(30 * 5, () => { game.econ.health = 100; defend = Math.max(defend, Gs.followers.filter((f) => f.state === 'gangFight' && f.target === brawler).length); }); }
  const orderStill = Gs.order;
  // drive: they ride behind in the crew's cars / bikes, and get out when you do
  const v = game.spawnVehicleNear('sedan', 503.5, 515); v.x = 503.5; v.z = 515; v.heading = 0; v.sync(); step(5);
  const dp = v.doorPoint(); game.teleport(dp.x, dp.z, 0); step(3); game.input.pressed.add('vehicle'); step(70);
  const I = game.input; step(30 * 5, () => { I.joyY = 1; I.joyX = 0; }); step(30 * 1.5, () => { I.joyY = -1; }); I.joyY = 0; step(30 * 3);   // roll to a stop before getting out
  const convoy = Gs.convoy.length, convoyColor = Gs.convoy[0]?.v.parts.baseColor.getHex(), behind = Gs.convoy.map((c) => ((c.v.x - v.x) * Math.sin(v.heading) + (c.v.z - v.z) * Math.cos(v.heading)));
  game.input.pressed.add('vehicle'); step(90); step(30 * 3);
  const out = Gs.convoy.length === 0 && Gs.followers.every((f) => f.state !== 'convoy'), nearAfter = Gs.followers.filter((f) => Math.hypot(f.x - P.x, f.z - P.z) < 9).length;
  // war: take the BC neighbourhood
  game.teleport(118, 905, 0); step(150); Gs.call(); step(30 * 26);
  Gs.attack();
  for (let k = 0; k < 90 && !(game.econ.turf || {}).south; k++) step(30, () => { game.econ.health = 100; });
  const owner = (game.econ.turf || {}).south;
  // leave with the X button: back to a normal person, the crew goes home
  game.phone.toggle(true); game.phone.show('gang'); document.querySelector('[data-g="leave"]').click(); game.phone.toggle(false);
  const left = game.econ.gang, crewLeft = Gs.followers.length;
  game.econ.turf = {}; game.econ.health = 100; game.teleport(530, 545, 0); step(30);
  return { ...counts, looks, inside, calm, chase, hurt, apps, joined, chain, near, arrivals, ownSafe, parkedOnRoad, defend, orderStill, gift: (game.econ.gangCars || {}).abc, convoy, convoyColor, behind, out, nearAfter, owner, left, crewLeft, zones: (game.minimap.zones || []).length };
});
check('gangs: ABC (green) and BC (blue) turfs with signs; full-body members with bandanas, chains and weapons; crew cars and bikes in the crew colour', gang.spawned >= 10 && gang.gang === 'abc' && gang.cars >= 3 && gang.bikes >= 2 && gang.carColor === 0x1f7a35 && gang.signs === 4 && gang.looks.models >= 8 && gang.looks.bandanas >= 6 && gang.looks.chains === gang.spawned && gang.looks.weaponMeshes >= 6 && gang.inside === 'north' && gang.zones === 2, JSON.stringify(gang));
check('gangs: walking right up to them is fine (no shooting) - hurt one and the crew comes for you and shoots', gang.calm && gang.chase >= 2 && gang.hurt > 0, JSON.stringify({ calm: gang.calm, chase: gang.chase, hurt: gang.hurt }));
check('gangs: phone app - join a crew (their colour, chain and a car in the crew colour); call your boys: 3 cars x2 and 2 bikes drive to you, they get out and follow; you cannot hurt your own', gang.apps && gang.joined === 'abc' && gang.chain && gang.gift && JSON.stringify(gang.arrivals) === JSON.stringify([['muscle', 2], ['suv', 2], ['sedan', 2], ['moto', 1], ['moto', 1]]) && gang.near >= 5 && gang.ownSafe && gang.parkedOnRoad, JSON.stringify({ apps: gang.apps, joined: gang.joined, gift: gang.gift, arrivals: gang.arrivals, near: gang.near, ownSafe: gang.ownSafe, parkedOnRoad: gang.parkedOnRoad }));
check('gangs: somebody starts a fight with you - your crew goes for him on its own (no order needed)', gang.defend >= 3 && gang.orderStill === 'follow', JSON.stringify({ defend: gang.defend, order: gang.orderStill }));
check('gangs: in a car the crew rides behind you in the crew cars, and gets out when you do', gang.convoy >= 2 && gang.convoyColor === 0x1f7a35 && gang.behind.every((b) => b < -3) && gang.out && gang.nearAfter >= 2, JSON.stringify({ convoy: gang.convoy, behind: gang.behind, out: gang.out, nearAfter: gang.nearAfter }));
check('gangs: "attack!" - the crew fights the rival gang and the neighbourhood is taken over; X in the app leaves the gang', gang.owner === 'abc' && gang.left === null && gang.crewLeft === 0, JSON.stringify({ owner: gang.owner, left: gang.left, crewLeft: gang.crewLeft }));

// ---------------------------------------------------------------- holding up a shop
const rob = await g(async () => {
  const WG = await import('./js/world/worldGen.js'), IN = await import('./js/world/interiors.js');
  const game = __game, P = game.player;
  const step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  game.police.clear();
  const bld = WG.cellData(7, 6).buildings.find((q) => q.sign === 'פלאפל הכיכר'), c = IN.interiorSpec(bld).counter;
  game.teleport(c.pt[0], c.pt[1], 0, c.y + 0.3); step(40);
  const k = game.peds.peds.find((q) => q.shopKey && Math.hypot(q.x - c.keeper[0], q.z - c.keeper[1]) < 1.8);
  if (!k) return { err: 'no keeper' };
  P.x = c.pt[0] - (c.keeper[0] - c.pt[0]) * 0.8; P.z = c.pt[1] - (c.keeper[1] - c.pt[1]) * 0.8;
  game.econ.weapons.p7 = { ammo: 40 }; game.equip('p7'); step(20);
  const m0 = game.econ.money;
  step(30 * 7, () => { P.aimT = 1.5; game.aiming = true; P.facing = Math.atan2(k.x - P.x, k.z - P.z); });
  const started = !!game.robbery.cur || game.robbery.robbed.size > 0, hands = k.state, thrown = game.robbery.cash.length;
  for (const cs of [...game.robbery.cash]) { if (!cs.landed) continue; P.x = cs.m.position.x; P.z = cs.m.position.z; step(2, () => { P.aimT = 1.5; }); }
  const got = game.econ.money - m0;
  game.aiming = false; game.equip(null); step(30 * 4);
  return { started, hands, thrown, got };
});
check('shop robbery: aim at the shopkeeper — hands up, he throws cash bundles, you pick them up', rob.started && rob.hands === 'surrender' && rob.thrown > 0 && rob.got > 0, JSON.stringify(rob));

// ---------------------------------------------------------------- UI: character dial, no nav strip, no character picker in the lobby; open stairwell
const ui = await g(async () => {
  const IN = await import('./js/world/interiors.js'), LY = await import('./js/world/layout.js'), WG = await import('./js/world/worldGen.js');
  const btn = document.getElementById('charBtn'), r = btn.getBoundingClientRect(), dial = !!document.getElementById('charDial');
  const nav = getComputedStyle(document.getElementById('gpsHud')).display;
  const lobbyChar = !!document.getElementById('btnChar');
  const villa = WG.cellData(LY.VILLA.bx, LY.VILLA.bz).buildings.find((q) => q.villa || q.interior === 'villa');
  const S = villa && IN.interiorSpec(villa), ground = S?.rooms[0];
  return { btn: !!btn, right: innerWidth - r.right < 40, dial, nav, lobbyChar, ceil: ground?.ceilRects?.length || 0 };
});
check('character switch: the 👥 button on the right opens the character window (no dial at the bottom)', ui.btn && ui.right && !ui.dial, JSON.stringify(ui));
check('no navigation strip at the top (route only on the map); no character picker in the lobby', ui.nav === 'none' && !ui.lobbyChar, JSON.stringify(ui));
const nav = await g(() => {
  const game = __game, step = (n) => { for (let i = 0; i < n; i++) { game.time += 1 / 30; game._playFrame(1 / 30); } };
  const P = game.player; if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  game.teleport(-300, 612, 0, 0.3); step(5);
  game.gps.set({ x: 5000, z: 958, name: 'בל־ריב' }, game.playerPos()); step(25);
  const onFoot = getComputedStyle(document.getElementById('gpsHud')).display;
  const v = game.spawnVehicleNear('boat', 1060, 640) || game.spawnVehicleNear('heli', -300, 640);
  P.state = 'driving'; P.vehicle = v; v.driver = 'player'; P.ignoreVehicle = v; P._attach(v); step(25);
  const inBoat = getComputedStyle(document.getElementById('gpsHud')).display;
  game.gps.set({ x: 530, z: 545, name: 'בית' }, game.playerPos()); step(25);
  const local = getComputedStyle(document.getElementById('gpsHud')).display;
  game.gps.clear(); v.speed = 0; game.input.pressed.add('vehicle'); step(60);
  return { onFoot, inBoat, local, type: v.typeKey };
});
check('navigation strip only when flying / sailing to another country', nav.onFoot === 'none' && nav.inBoat !== 'none' && nav.local === 'none', JSON.stringify(nav));
check('villa: no ceiling over the stairwell (the stairs go up through an opening)', ui.ceil === 2, JSON.stringify(ui));

// ---------------------------------------------------------------- people talk back (spoken voice + bubble) and react to you
const talk = await g(() => {
  const game = __game, P = game.player, step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  const said = []; const sp = game.voices.speak.bind(game.voices); game.voices.speak = (p, text, urgent) => { said.push(text); };
  if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  game.police.clear(); game.equip(null); game.teleport(530, 560, 0, 0.3); step(60);
  const pick = (ex) => game.peds.peds.find((o) => o !== ex && !o.car && !o.shopKey && !o.keep && o.app && !o.app.cop && ['walk', 'wander', 'idle'].includes(o.state) && Math.hypot(o.x - P.x, o.z - P.z) < 80);
  const q = pick(); if (!q) return { err: 'nobody' };
  q.temper = 'flee'; step(40, () => { P.x = q.x - 0.6; P.z = q.z; P.y = q.y; });
  const bump = said.slice();
  game.econ.weapons.p7 = { ammo: 30 }; game.equip('p7'); step(15);
  const q2 = pick(q); if (!q2) return { bump, err: 'no second' };
  q2.temper = 'call'; game.teleport(q2.x, q2.z - 6, 0, q2.y + 0.3); step(2);
  step(20, () => { game.aiming = true; P.aimT = 1.5; P.facing = Math.atan2(q2.x - P.x, q2.z - P.z); });
  const res = { bump, said: said.slice(), q2: q2.state, stars: game.police.level };
  game.aiming = false; game.equip(null); game.police.clear(); game.voices.speak = sp;
  return res;
});
check('people talk back out loud when you get in their face (own voice, varied lines)', talk.bump?.length >= 1, JSON.stringify(talk));
check('pointing a weapon at someone: they react by character - this one calls the police (1 star)', talk.q2 === 'callHelp' && talk.stars >= 1 && talk.said.length >= 2, JSON.stringify(talk));

// ---------------------------------------------------------------- thrown sticky bomb sticks to a car, blows it up, it burns
const sticky = await g(() => {
  const game = __game, P = game.player, I = game.input, step = (n, f) => { for (let i = 0; i < n; i++) { if (game.police.level) game.police.clear(); f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { I.pressed.add('vehicle'); step(60); }
  game.econ.health = 100; game.teleport(530, 545, 0, 0.3); step(10);
  const car = game.spawnVehicleNear('sedan', 530, 553); car.x = 530; car.z = 553; car.heading = Math.PI / 2; car.speed = 0; car.sync();
  P.x = 530; P.z = 545; P.facing = 0; game.rig.yaw = 0; game.rig.pitch = 0.05;
  game.econ.weapons.fc = { ammo: 1 }; game.equip('fc'); step(20, () => { game.rig.yaw = 0; });
  I.pressed.add('fire'); let stuck = false, timer = false;
  step(30 * 6, () => { P.facing = 0; game.rig.yaw = 0; const q = game.weapons.charges[0]; if (q?.stuck?.v === car) stuck = true; if (document.getElementById('bombTimer').classList.contains('show')) timer = true; });
  const res = { stuck, timer, wrecked: !!car.wrecked, burning: game.weapons.burning.some((b) => b.v === car), flames: game.weapons.fx.filter((f) => f.type === 'flame').length };
  game.equip(null); game.econ.health = 100; game.police.clear();
  return res;
});
check('sticky bomb: thrown, sticks to the car, 5 s timer, the car blows up and burns with real flames', sticky.stuck && sticky.timer && sticky.wrecked && sticky.burning && sticky.flames > 0, JSON.stringify(sticky));

const calls = await g(() => { __game.renderer.render(__game.scene, __game.camera); return __game.renderer.info.render.calls; });
console.log(`(draw calls on low quality: ${calls})`);
await g(() => __game.save());
check('game saves progress', await g(() => !!localStorage.getItem('azura_city_save_v1')));
// ---------------------------------------------------------------- police give up after 3 minutes; wardrobe at home; parachute as gear; no flashlight
const misc = await g(async () => {
  const game = __game, P = game.player, Pol = game.police;
  const step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  // a chase where they keep spotting you but never catch you: they leave ~3 minutes after the last shots
  game.teleport(520, 520, 0); step(20); Pol.clear(); Pol.setWanted(2, P.x, P.z);
  let gaveUp = -1;
  for (let k = 1; k <= 30 && gaveUp < 0; k++) { game.teleport(520 + (k % 2 ? 90 : -60) + (k % 3) * 25, 520, 0); step(30 * 8, () => { game.econ.health = 100; Pol.arrestT = 0; }); if (!Pol.level) gaveUp = k * 8; }
  Pol.clear(); game.econ.health = 100;
  // wardrobe downstairs at home
  const { VILLA } = await import('./js/world/layout.js');
  game.teleport(VILLA.door.x, VILLA.door.z + 3, 0); step(60);
  const L = game.interiors.places().find((q) => q.spec.wardrobes); const w = L?.spec.wardrobes[1];
  if (w) { game.teleport(w.pt[0], w.pt[1], 0, w.y); step(10); }
  const wPrompt = P.prompt?.text || ''; game.input.pressed.add('interact'); step(2);
  const wOpen = game.state === 'shop'; game.shop.close(); step(2);
  // parachute in the equipment cycle
  const keepW = game.econ.weapons; game.econ.weapons = {}; game.equip(null); game.econ.items.parachute = 1; game.cycleWeapon(); step(3);
  const gear = game.econ.gear, hud = document.getElementById('weaponHud').textContent, pack = !!game._pack?.visible;
  game.cycleWeapon(); step(2); game.econ.weapons = keepW;
  // flashlight is gone (shop and button)
  game.openShop('equipment', 'חנות ציוד'); const flash = /פנס/.test(document.getElementById('shopPanel').textContent); game.shop.close();
  game.teleport(530, 545, 0); step(20);
  return { gaveUp, wPrompt, wOpen, gear, hud, pack, flash, lightBtn: !!document.getElementById('tLight') };
});
check('police: a chase in which they keep seeing you but never catch you ends about 3 minutes after the last shots', misc.gaveUp >= 150 && misc.gaveUp <= 200, JSON.stringify({ gaveUp: misc.gaveUp }));
check('home: a wardrobe downstairs by the door - change into the clothes you bought', misc.wPrompt.includes('ארון') && misc.wOpen, JSON.stringify({ prompt: misc.wPrompt, open: misc.wOpen }));
check('gear: the parachute is part of the equipment (G) - the pack shows on your back; no flashlight in the game', misc.gear === 'chute' && misc.hud.includes('מצנח') && misc.pack && !misc.flash && !misc.lightBtn, JSON.stringify(misc));

// ---------------------------------------------------------------- bank door guards (armed, carry the vault keys) + the crew button
const guards = await g(() => {
  const game = __game, P = game.player, H = game.heist;
  const step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  game.police.clear(); game.econ.health = 100;
  const I = H.info('central'); game.teleport(I.start.pt[0], I.start.pt[1], Math.PI, I.start.y + 0.6); step(90);
  const gd = game.peds.peds.filter((q) => q.doorGuard);
  const look = gd.map((q) => ({ gun: !!q.app.gun, model: !!q.cm, rifle: q.weaponKind === 'rifle', vest: !!q.cm?.vest?.visible }));
  // the crew button: hidden when you are not in a gang, there (and calling) when you are
  const btn = document.getElementById('gangBtn'), hidden = getComputedStyle(btn).display === 'none';
  game.gangs.join('abc'); step(2); const shown = getComputedStyle(btn).display !== 'none';
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); step(5); const called = game.gangs.followers.length;
  game.gangs.leave(false, true); game.econ.gangCars = {}; game.teleport(530, 545, 0); step(20);
  return { n: gd.length, look, hidden, shown, called };
});
check('bank: two armed guards stand at the entrance (full body, uniform, vest, rifle)', guards.n === 2 && guards.look.every((l) => l.gun && l.model && l.rifle && l.vest), JSON.stringify(guards));
check('gangs: a crew button on the screen while you are in a gang - tap it and your boys come', guards.hidden && guards.shown && guards.called >= 4, JSON.stringify({ hidden: guards.hidden, shown: guards.shown, called: guards.called }));

// ---------------------------------------------------------------- skydiving: jump out of a helicopter high above the clouds
const sky = await g(() => {
  const game = __game, P = game.player;
  const step = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); game.time += 1 / 30; game._playFrame(1 / 30); } };
  if (P.state !== 'foot') { game.input.pressed.add('vehicle'); step(60); }
  game.police.clear(); game.econ.health = 100; game.econ.items.parachute = 0; game.teleport(530, 545, 0); step(20);
  const v = game.spawnVehicleNear('heli', P.x + 6, P.z); v.x = P.x + 6; v.z = P.z; v.sync(); step(5);
  const dp = v.doorPoint(); game.teleport(dp.x, dp.z, 0); step(3); game.input.pressed.add('vehicle'); step(80);
  v.y = 880; v.vy = 0; step(20);
  const prompt = P.prompt?.text || '';
  game.input.pressed.add('vehicle'); step(2);
  const jumped = P.state === 'foot' && P.skydive, gotChute = game.econ.items.parachute === 1;
  step(30 * 5); game.frame(); const fall = { vy: P.vy, btn: document.querySelector('[data-btn="jump"]').textContent, clouds: game.clouds.mesh.visible, y: P.y };
  game.input.pressed.add('jump'); step(30 * 2); const opened = P.parachute && !P.skydive, slow = P.vy > -12;
  let n = 0; while (!P.grounded && n < 30 * 120) { step(30); n += 30; }
  return { prompt, jumped, gotChute, fall, opened, slow, landed: P.grounded, health: game.econ.health };
});
check('skydiving: jump out of the helicopter high up into free fall (parachute given), clouds below', sky.prompt.includes('קפוץ') && sky.jumped && sky.gotChute && sky.fall.vy < -40 && sky.fall.btn === 'פתח מצנח' && sky.fall.clouds, JSON.stringify(sky));
check('skydiving: "open parachute" opens the canopy, you glide down and land safely', sky.opened && sky.slow && sky.landed && sky.health === 100, JSON.stringify(sky));

// ---------------------------------------------------------------- GTA-style entry: loading pictures, 10% every 3 s, into the game, no pause menu
{
  await page.evaluate(() => __game.renderer.setAnimationLoop(null));   // the main test page stops drawing so the timing below is not starved of CPU
  const ip = await browser.newPage({ viewport: { width: 844, height: 390 } });
  ip.on('pageerror', (e) => errors.push('intro pageerror: ' + e.message));
  await ip.addInitScript(() => { localStorage.clear(); localStorage.setItem('azura_city_settings_v1', JSON.stringify({ quality: 'low' }));
    window.__pctLog = []; document.addEventListener('DOMContentLoaded', () => { const el = document.getElementById('loadPct'); new MutationObserver(() => window.__pctLog.push([el.textContent, performance.now() / 1000])).observe(el, { childList: true, subtree: true, characterData: true }); }); });
  await ip.goto(URL);
  await ip.waitForTimeout(13000);
  const mid = await ip.evaluate(() => ({ shown: document.getElementById('loading').classList.contains('show'), slides: document.querySelectorAll('#loading .ld-slide').length, cap: document.getElementById('ldCap').textContent, state: window.__game?.state }));
  await ip.screenshot({ path: `${OUT}/00-intro.png`, timeout: 120000 });
  const swoop = await ip.waitForFunction(() => window.__game?.state === 'switching', null, { timeout: 90000, polling: 50 }).then(() => true, () => false);   // the sky-down entry shot
  const swoopAt = await ip.evaluate(() => performance.now() / 1000);
  await ip.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 90000 });
  const end = await ip.evaluate(async () => ({ log: window.__pctLog, at: performance.now() / 1000, extras: ['#ldCap', '#loading .bar', '#loadText', '#loading .ld-spin'].some((q) => { const e = document.querySelector(q); return e && getComputedStyle(e).display !== 'none'; }), pauseBtn: !!document.getElementById('pauseBtn'), pauseScreen: !!document.getElementById('pause'),
    imgs: await Promise.all([...document.querySelectorAll('.ld-slide')].map((s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); i.src = s.style.backgroundImage.slice(5, -2); }))) }));
  await ip.keyboard.press('Escape'); await ip.waitForTimeout(400);
  const escState = await ip.evaluate(() => __game.state);
  const pcts = end.log.map((e) => e[0]), t90 = end.log.find((e) => e[0] === '90%')?.[1] || 0;
  const gaps = end.log.slice(2).map((e, i) => e[1] - end.log[i + 1][1]);
  check('entry: GTA-style loading screen with pictures from the game (no caption / bar - only the percentage)', mid.shown && mid.slides >= 6 && end.imgs.every((w) => w > 0) && !end.extras, JSON.stringify({ ...mid, imgs: end.imgs, extras: end.extras }));
  check('entry: 10% every 3 seconds up to 90%', ['10%', '20%', '30%', '40%', '50%', '60%', '70%', '80%', '90%'].every((p) => pcts.includes(p)) && gaps.every((g) => g > 2.6 && g < 3.4) && !pcts.includes('100%'), JSON.stringify(end.log.map((e) => [e[0], +e[1].toFixed(1)])));
  check('entry: after 90% it waits 3 + 5 seconds and goes into the game with the character-switch shot (from the sky down onto you)', swoop && swoopAt - t90 > 7.3 && swoopAt - t90 < 10.5, `90% at ${t90.toFixed(1)}s, entry shot at ${swoopAt.toFixed(1)}s, playing at ${end.at.toFixed(1)}s`);
  check('no pause button / pause menu in the game (Escape does not stop it)', !end.pauseBtn && !end.pauseScreen && escState === 'playing', JSON.stringify({ pauseBtn: end.pauseBtn, pauseScreen: end.pauseScreen, escState }));
  await ip.close();
}

check('no runtime errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
