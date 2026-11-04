// Azura City — open world game bootstrap and main loop.
import * as THREE from 'three';
import * as WG from './world/worldGen.js';
const { districtAt } = WG;
const _navDir = new THREE.Vector3();
import { heightAt, surfaces } from './world/terrain.js';
import { Pedestrians } from './npc/pedestrians.js';
import { InteriorManager } from './world/interiorManager.js';
import { Economy, fmt } from './game/economy.js';
import { ShopUI, shopKind } from './game/shops.js';
import { WeaponSystem, WEAPONS, WEAPON_ORDER } from './game/weapons.js';
import { shared as vehicleMats } from './vehicles/vehicleModels.js';
import { GPS } from './phone/gps.js';
import { Phone } from './phone/phone.js';
import { Missions, CONTACTS, MISSIONS } from './game/missions.js';
import { Radio } from './core/audio.js';
import { PARK_OFFSET, VILLA } from './world/layout.js';
import { AirportManager, LIVERIES } from './world/airport.js';
import { Combat } from './game/combat.js';
import { setAnisotropy } from './world/textures.js';
import { makeMaterials } from './world/worldBuilder.js';
import { ChunkManager } from './world/chunkManager.js';
import { Environment } from './world/sky.js';
import { StaticWorld } from './physics/collision.js';
import { RoadGraph, lightState } from './traffic/roadGraph.js';
import { Traffic } from './traffic/traffic.js';
import { VehicleManager } from './vehicles/vehicleManager.js';
import { Vehicle } from './vehicles/vehicle.js';
import { Player } from './player/player.js';
import { CameraRig } from './camera/cameraRig.js';
import { Input } from './core/input.js';
import { GameAudio } from './core/audio.js';
import { MiniMap } from './ui/minimap.js';
import { Creator, showScreen, bindSettings } from './ui/menus.js';
import { loadSettings, saveSettings, loadGame, saveGame, hasSave } from './core/storage.js';
import { defaultAppearance } from './character/characterModel.js';

const $ = (id) => document.getElementById(id);
const START = { x: 530, z: 545, facing: -Math.PI / 2 };
const CREATOR_SPOT = { x: 528, z: 548, facing: 0.5 };

class Game {
  constructor() {
    this.state = 'loading';
    this.settings = loadSettings();
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2500);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.fpsAvg = 60;
    this.audio = new GameAudio();
    addEventListener('resize', () => this.resize());
    // block pinch / double-tap zoom of the whole page (Safari ignores user-scalable=no)
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    window.visualViewport?.addEventListener('resize', () => { if (this.state === 'playing') window.scrollTo(0, 0); });
    this.resize();
  }

  async load() {
    const step = async (pct, text) => { $('loadBar').style.width = pct + '%'; $('loadText').textContent = text; await new Promise((r) => setTimeout(r, 0)); };
    await step(5, 'מתכנן את העולם...');
    this.graph = new RoadGraph();
    this.statics = new StaticWorld();
    this.mats = makeMaterials();
    this.env = new Environment(this.scene, this.renderer);
    await step(25, 'סולל כבישים ומדרכות...');
    this.chunks = new ChunkManager(this.scene, this.mats, this.statics, surfaces);
    this.physCells = [];
    this.chunks.onCellsChanged = (cells) => { this.physCells = cells; this.vehicles?.syncCells(cells); };
    await step(45, 'מחנה רכבים...');
    this.vehicles = new VehicleManager(this.scene, this.statics);
    this.traffic = new Traffic(this.scene, this.graph, this.statics);
    this.peds = new Pedestrians(this.scene);
    this.interiors = new InteriorManager(this.scene, this.mats, this.statics);
    this.airport = new AirportManager(this.scene, this.statics, null);
    this.interiors.boardTexture = this.airport.boardTexture;
    this.player = new Player(this.scene, defaultAppearance());
    this.rig = new CameraRig(this.camera, this.statics);
    this.econ = new Economy();
    this.weapons = new WeaponSystem(this.scene, this.statics);
    this.combat = new Combat(this);
    this.flashlight = new THREE.SpotLight(0xfff2d8, 0, 40, 0.5, 0.5, 1.2);
    this.scene.add(this.flashlight, this.flashlight.target);
    this.headlight = new THREE.SpotLight(0xfff4e0, 0, 70, 0.55, 0.45, 1.3);
    this.scene.add(this.headlight, this.headlight.target);
    this.lampLights = [];
    for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffd59a, 0, 24, 1.6); l.visible = false; this.scene.add(l); this.lampLights.push(l); }
    this.input = new Input(this.canvas);
    this.minimap = new MiniMap($('minimap'), $('fullMap'));
    this.creator = new Creator((app) => this.player.model.setAppearance(app));
    this.shop = new ShopUI(this);
    this.gps = new GPS(this.scene, this.graph);
    this.missions = new Missions(this);
    this.radio = new Radio(this.audio);
    this.selectedStation = -1; this.radioOnFoot = false;
    this.phone = new Phone(this);
    this.applySettings(this.settings);
    bindSettings(this.settings, (s) => { this.applySettings(s); saveSettings(s); });
    await step(60, 'בונה שכונות...');
    this.chunks.update(520, 520, true);
    this.vehicles.syncCells(this.physCells);
    this.vehicles.update(0, 520, 520, []);
    // compile shaders up-front to avoid stutter on first view
    this.renderer.compile(this.scene, this.camera);
    await step(100, 'מוכן!');
    this._bindUI();
    this.toMenu();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  applySettings(s) {
    const q = s.quality;
    const pr = Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.env?.setQuality(q);
    if (this.chunks) {
      this.chunks.radius = q === 'low' ? 260 : q === 'medium' ? 360 : 480;
      this.chunks.farRadius = q === 'low' ? 650 : q === 'medium' ? 950 : 1400;
      this.env?.setFogFar(this.chunks.farRadius);
    }
    this.baseRadius = this.chunks?.radius;
    if (this.camera) this.camera.far = (this.chunks?.farRadius || 1000) + 600;
    this.peds?.setDensity(q === 'low' ? 14 : q === 'medium' ? 24 : 34);
    this.camera?.updateProjectionMatrix();
    this.traffic?.setDensity(s.traffic);
    if (this.rig) { this.rig.sensitivity = s.sensitivity; this.rig.invertY = s.invertY; }
    this.audio.setVolume(s.volume);
    if (this.env) { if (s.weather && s.weather !== 'auto') { this.env.setWeather(s.weather); this.env.weatherT = 1e9; } else if (this.env.weatherT > 1e8) this.env.weatherT = 120; }
    $('fps').classList.toggle('hidden', !s.showFps);
    this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  _bindUI() {
    const unlock = () => this.audio.unlock();
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    $('btnContinue').onclick = () => this.continueGame();
    $('btnNew').onclick = () => { this.pendingNew = true; this.toCreator(); };
    $('btnChar').onclick = () => { this.pendingNew = !hasSave(); this.toCreator(); };
    $('btnSettings').onclick = () => { this.settingsBack = 'menu'; showScreen('settings'); };
    $('btnExit').onclick = () => { this.save(); showScreen('exitScreen'); try { window.close(); } catch { /* ignore */ } };
    $('exitBack').onclick = () => this.toMenu();
    $('cBack').onclick = () => (this.creatorBack === 'pause' ? this.pause() : this.toMenu());
    $('cStart').onclick = () => {
      if (this.creatorBack === 'pause') { this.save(); this.resume(); return; }
      if (this.pendingNew || !hasSave()) this.newGame(); else { this.save(true); this.continueGame(); }
    };
    $('sHour').oninput = (e) => { this.env.hour = +e.target.value; };
    $('btnSettings').addEventListener('click', () => { $('sHour').value = this.env.hour; });
    $('pSettings').addEventListener('click', () => { $('sHour').value = this.env.hour; });
    $('sBack').onclick = () => (this.settingsBack === 'pause' ? this.pause() : this.toMenu());
    $('pResume').onclick = () => this.resume();
    $('pMap').onclick = () => this.openMap();
    $('pChar').onclick = () => { this.creatorBack = 'pause'; this.toCreator(true); };
    $('pSettings').onclick = () => { this.settingsBack = 'pause'; showScreen('settings'); };
    $('pHelp').onclick = () => showScreen('help');
    $('hBack').onclick = () => this.pause();
    $('pSave').onclick = () => { this.save(); this.toast('המשחק נשמר'); this.resume(); };
    $('pMenu').onclick = () => { this.save(); this.toMenu(); };
    $('mapClose').onclick = () => this.resume();
    $('bagClose').onclick = () => this.closeBag();
    this._bindFullMap();
    $('prompt').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); const k = $('prompt').dataset.key; if (k) this.input.pressed.add(k); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') { this.save(); this.pause(); } });
  }

  // ------------------------------------------------------------------ states
  toMenu() {
    this.state = 'menu';
    showScreen('menu');
    $('btnContinue').disabled = !hasSave();
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    if (this.player.state === 'driving') this.player.object.visible = true;
    this.player.object.visible = false;
    this.menuAngle = 0;
  }

  toCreator(fromPause = false) {
    this.state = 'creator';
    if (!fromPause) this.creatorBack = 'menu';
    showScreen('creator');
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    const saved = loadGame();
    this.creator.set(fromPause ? this.player.model.app : (!this.pendingNew && saved?.appearance) || this.creator.app);
    $('cStart').textContent = fromPause ? 'שמור מראה' : 'התחל לשחק';
    this.creatorView = { yaw: CREATOR_SPOT.facing };
    this.player.object.visible = true;
    if (!fromPause) {
      this.previewVehicleSafe();
      this.player.setPosition(CREATOR_SPOT.x, CREATOR_SPOT.z, CREATOR_SPOT.facing);
      this.chunks.update(CREATOR_SPOT.x, CREATOR_SPOT.z, true);
    }
  }
  previewVehicleSafe() {
    // make sure the player model is not attached to a vehicle while previewing
    if (this.player.attached) { this.player._detach(); this.player.state = 'foot'; if (this.player.vehicle) this.player.vehicle.driver = null; this.player.vehicle = null; }
  }

  newGame() {
    this.previewVehicleSafe();
    this.player.model.setAppearance(this.creator.app);
    this.player.setPosition(START.x, START.z, START.facing);
    this.player.state = 'foot';
    this.rig.yaw = START.facing; this.rig.pitch = 0.25; this.rig.first = true;
    this.playTime = 0;
    this.econ.reset(); this.equip(null);
    this.missions.load(null); this.gps.clear();
    this.save();
    this.startPlaying();
    this.toast('ברוכים הבאים לאזורה סיטי! מצא רכב חונה ולחץ F (או "כניסה") כדי לנהוג.', 6);
  }

  continueGame() {
    const s = loadGame();
    if (!s) return this.newGame();
    this.previewVehicleSafe();
    this.player.model.setAppearance(s.appearance || defaultAppearance());
    this.creator.app = { ...this.player.model.app };
    const p = s.player;
    this.chunks.update(p.x, p.z, true);
    this.player.setPosition(p.x, p.z, p.facing, p.y);
    this.player.state = 'foot';
    this.playTime = s.playTime || 0;
    this.econ.load(s.econ); this.equip(this.econ.equipped);
    if (s.world) { this.env.hour = s.world.hour ?? 10; this.env.setWeather(s.world.weather || 'clear'); }
    this.gps.clear();
    this.missions.load(s.missions);
    if (s.vehicle) {
      const vd = s.vehicle;
      this.chunks.update(vd.x, vd.z, true);
      const v = new Vehicle(vd.type, vd.color, vd.x, vd.z, vd.heading, vd.y);
      if (vd.y !== undefined) v.y = vd.y;
      v.damage = 0; if (vd.damage) v.addDamage(vd.damage, 0, 0);
      this.scene.add(v.object);
      this.vehicles.adopt(v);
      v.sync();
      this.player.forceIntoVehicle(v);
    }
    this.rig.yaw = s.vehicle ? s.vehicle.heading : p.facing; this.rig.first = true;
    this.startPlaying();
    this.toast('המשחק נטען — ממשיכים מאותה נקודה');
  }

  // ------------------------------------------------------------------ phone services
  playerPos() {
    const p = this.player, v = p.state === 'driving' ? p.vehicle : null;
    return { x: v ? v.x : p.x, z: v ? v.z : p.z, y: v ? v.y : p.y, facing: v ? v.heading : p.facing };
  }
  // named places shown on every map (icon + short name) and used for the "where am I" label
  landmarks() {
    if (this._landmarks) return this._landmarks;
    const find = (cells, pred) => { for (const [i, j] of cells) { const b = WG.cellData(i, j).buildings.find(pred); if (b) return b; } return null; };
    const door = (b) => b && { x: b.door.x + (b.door.x - b.x) * 0.15, z: b.door.z + (b.door.z - b.z) * 0.15 };
    const list = [
      { short: 'הבית שלי', name: 'הבית שלי — וילה עם בריכה', icon: '🏠', color: '#e0533b', x: VILLA.door.x, z: VILLA.door.z - 1 },
      { short: 'נמל תעופה', name: 'נמל התעופה אזורה — טרמינל', icon: '✈', color: '#1f5fa8', x: -300, z: 514 },
      { short: 'מרינה', name: 'מרינה מזרח', icon: '⚓', color: '#0e7c86', x: 2500, z: 510 },
      { short: 'חנות נשקים', name: 'חנות נשקים — ארסנל הצללים', icon: '🎯', color: '#5b2c6f', ...door(find([[2, 5]], (b) => b.sign === 'ארסנל הצללים')) },
      { short: 'חנות בגדים', name: 'חנות בגדים — מרכז העיר', icon: '👕', color: '#c2185b', ...door(find([[7, 5]], (b) => b.sign === 'חנות בגדים')) },
      { short: 'גלידה', name: 'גלידת שקיעה', icon: '🍦', color: '#f39c12', ...door(find([[7, 3]], (b) => b.sign === 'גלידת שקיעה')) },
      { short: 'ספרייה', name: 'ספריית העיר', icon: '📚', color: '#6d4c41', ...door(find([[2, 3]], (b) => b.sign === 'ספריית העיר')) },
    ].filter((L) => Number.isFinite(L.x));
    this.minimap.landmarks = list;
    return (this._landmarks = list);
  }
  places() {
    const find = (cells, pred) => { for (const [i, j] of cells) { const b = WG.cellData(i, j).buildings.find(pred); if (b) return b; } return null; };
    const door = (b) => b && { x: b.door.x + (b.door.x - b.x) * 0.2, z: b.door.z + (b.door.z - b.z) * 0.2 };
    const reg = WG.regionInfo(0, 1);
    const list = [
      ...this.landmarks().map((L) => ({ name: L.name, x: L.x, z: L.z })),
      { name: 'קניון העיר (גבעת הרימון)', ...door(find([reg.mall], (b) => b.mall)) },
      { name: 'פלאפל הכיכר', ...door(find([[7, 6]], (b) => b.sign === 'פלאפל הכיכר')) },
      { name: 'מוסך אזורה', ...door(find([[8, 3], [2, 7]], (b) => b.sign === 'מוסך אזורה')) },
      { name: 'התחנה המרכזית', x: 500, z: 992 },
      { name: 'כיכר העירייה', x: 550, z: 545 },
      { name: 'חוף אזורה', x: 1030, z: 300 },
      { name: 'גשר המפרץ', x: 1500, z: 502 },
      { name: 'מנהרת הרכס', x: 502, z: -620 },
    ];
    const last = this.player.lastVehicle;
    if (last && this.vehicles.kept.includes(last)) list.unshift({ name: `הרכב שלי (${last.T.name})`, x: last.x, z: last.z, radius: 6 });
    return list.filter((p) => Number.isFinite(p.x));
  }
  // a free roadside spot near (x, z) on the right-hand parking lane
  roadsideSpot(x, z) {
    let best = null, bd = Infinity;
    for (let gx = Math.round(x / 100) - 1; gx <= Math.round(x / 100) + 1; gx++) for (let gz = Math.round(z / 100) - 1; gz <= Math.round(z / 100) + 1; gz++) {
      const n = this.graph.node(gx, gz);
      for (const k of n.nbrs) {
        const m = this.graph.get(k);
        const dx = (m.x - n.x) / 100, dz = (m.z - n.z) / 100;
        for (const t of [25, 40, 55, 70]) {
          const px = n.x + dx * t - dz * PARK_OFFSET, pz = n.z + dz * t + dx * PARK_OFFSET;
          const d = Math.hypot(px - x, pz - z);
          if (d < bd && !this.vehicles.all().some((v) => Math.hypot(v.x - px, v.z - pz) < 6)) { bd = d; best = { x: px, z: pz, heading: Math.atan2(dx, dz) }; }
        }
      }
    }
    return best;
  }
  spawnVehicleNear(type, x, z) {
    const s = this.roadsideSpot(x, z);
    if (!s) return null;
    this.chunks.update(s.x, s.z, true);
    const v = new Vehicle(type, undefined, s.x, s.z, s.heading);
    this.scene.add(v.object); this.vehicles.adopt(v); v.sync();
    return v;
  }
  deliverVehicle(v) {
    if (!this.econ.pay(200, 'גרירה')) return 'אין מספיק כסף לגרירה';
    const p = this.playerPos(), s = this.roadsideSpot(p.x, p.z);
    if (!s) return 'אין מקום פנוי בקרבת מקום';
    v.x = s.x; v.z = s.z; v.heading = s.heading; v.y = 0; v.vx = v.vz = 0; v.sync();
    this.player.lastVehicle = v;
    return `ה${v.T.name} מחכה לך בצד הכביש`;
  }
  fastTravel(dest) {
    const p = this.playerPos(), km = Math.hypot(dest.x - p.x, dest.z - p.z) / 1000, cost = Math.round(15 + km * 14);
    if (this.player.state !== 'foot') return 'צריך לצאת מהרכב כדי לעלות למונית';
    if (!this.econ.pay(cost, 'נסיעה במונית')) return `הנסיעה עולה ${fmt(cost)} — אין מספיק כסף`;
    $('fade').classList.add('on');
    setTimeout(() => {
      const s = this.roadsideSpot(dest.x, dest.z) || dest;
      this.teleport(s.x + Math.sin(s.heading || 0) * 0 - 2.5 * Math.cos(s.heading || 0), s.z, 0);
      this.gps.clear();
      $('fade').classList.remove('on');
      this.toast(`הגעת ל${dest.name || 'יעד'} · ${fmt(cost)}`, 3);
    }, 900);
    return `סוגרים! הנסיעה עולה ${fmt(cost)}`;
  }
  callContact(id) {
    const M = this.missions, offer = MISSIONS.find((m) => m.giver === id && M.state[m.id] === 'available');
    const acts = [];
    let line;
    if (offer) { line = offer.offer; acts.push({ text: 'אני בעניין!', run: () => { M.accept(offer.id); return 'מעולה, היעד מסומן לך ב־GPS.'; } }); }
    switch (id) {
      case 'roni': line ||= 'מה קורה? הכל רגוע פה. תתקשר כשבא לך לצאת.'; break;
      case 'mom': line ||= 'חמוד! אכלת משהו היום? תקפוץ לבקר.'; acts.push({ text: 'אני בסדר, אמא', run: () => 'טוב, תשמור על עצמך ❤️' }); break;
      case 'falafel': line ||= 'פלאפל הכיכר, שלום!'; acts.push({ text: 'הזמנה לתיק (₪25)', run: () => { if (!this.econ.pay(25, 'פלאפל')) return 'אין מספיק כסף'; this.econ.items.snacks++; return 'נוסף לתיק. בתיאבון!'; } }); break;
      case 'mechanic': {
        line = 'מאיה מהמוסך. איך אפשר לעזור?';
        const v = this.player.lastVehicle;
        if (v && this.vehicles.kept.includes(v) && this.player.state !== 'driving') acts.push({ text: `שלחי גרר עם ה${v.T.name} (₪200)`, run: () => this.deliverVehicle(v) });
        if (this.player.state === 'driving') acts.push({ text: 'תקני לי את הרכב מרחוק? (₪400)', run: () => { if (!this.econ.pay(400, 'שירות דרך')) return 'אין מספיק כסף'; this.player.vehicle.repair(); return 'ניידת שירות תיקנה לך את הרכב.'; } });
        if (!acts.length) acts.push({ text: 'סתם רציתי להגיד שלום', run: () => 'שלום גם לך! המוסך פתוח תמיד.' });
        break;
      }
      case 'taxi': {
        line = 'מוניות אזורה, לאן נוסעים?';
        acts.push({ text: 'שלחו מונית לכאן', run: () => { const p = this.playerPos(); const v = this.spawnVehicleNear('taxi', p.x, p.z); if (!v) return 'אין מונית פנויה באזור'; this.gps.set({ x: v.x, z: v.z, name: 'המונית', radius: 5 }, p); return 'המונית מחכה לך בצד הכביש — אפשר גם לנהוג בה.'; } });
        if (this.gps.dest) acts.push({ text: `קחו אותי אל ${this.gps.dest.name || 'היעד ב־GPS'}`, run: () => this.fastTravel(this.gps.dest) });
        break;
      }
      case 'airport': {
        const f = this.airport?.departures?.() || [];
        line = f.length ? 'הטיסות הקרובות: ' + f.slice(0, 3).map((x) => `${x.dest} ${x.time} (${x.status})`).join(' · ') : 'נמל התעופה אזורה, טרמינל 1 פתוח 24 שעות.';
        acts.push({ text: 'נווט לטרמינל', run: () => { this.gps.set({ x: -300, z: 514, name: 'נמל התעופה', radius: 14 }, this.playerPos()); return 'הדרך מסומנת ב־GPS.'; } });
        break;
      }
    }
    return { line, actions: acts };
  }
  takePhoto() {
    this.renderer.render(this.scene, this.camera);
    const big = this.renderer.domElement, w = 360, h = Math.round(w * big.height / big.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(big, 0, 0, w, h);
    const p = this.playerPos();
    this.missions.onPhoto({ x: p.x, z: p.z, hour: this.env.hour });
    try { return c.toDataURL('image/jpeg', 0.72); } catch { return null; }
  }
  selectStation(i) {
    this.selectedStation = i;
    if (i < 0) { this.radio.stop(); return; }
    this.radio.play(i);
  }

  startPlaying() {
    this.state = 'playing';
    showScreen(null);
    // drop focus from the name field and undo any scroll the keyboard caused, so the HUD fits the screen again
    document.activeElement?.blur?.(); window.scrollTo(0, 0);
    $('hud').classList.remove('hidden');
    $('touch').classList.toggle('hidden', !this.input.isTouch);
    document.body.classList.toggle('touch', this.input.isTouch);
    this.player.object.visible = true;
    this.chunks.update(this.player.x, this.player.z, true);
    this.saveTimer = 0;
    this.lastDistrict = null;
    this.missions.start();
    this.phone._badge();
    this.input.endFrame();
  }

  _seats() {
    const out = [];
    for (const L of this.interiors.places()) if (L.spec.seats) for (const s of L.spec.seats) if (Math.abs(s.x - this.player.x) < 6 && Math.abs(s.z - this.player.z) < 6) out.push(s);
    return out;
  }
  equip(id) {
    this.econ.equipped = id && this.econ.weapons[id] ? id : null;
    this.weapons.attachGun(this.player, this.econ.equipped);
    this.player.armed = !!this.econ.equipped;
  }
  cycleWeapon() {
    const owned = WEAPON_ORDER.filter((id) => this.econ.weapons[id]);
    if (!owned.length) { this.toast('אין לך ציוד — אפשר לקנות בחנות "ארסנל הצללים"', 2.5); return; }
    const list = [null, ...owned];
    const i = list.indexOf(this.econ.equipped);
    this.equip(list[(i + 1) % list.length]);
    this.toast(this.econ.equipped ? WEAPONS[this.econ.equipped].name : 'ידיים ריקות', 1.5);
  }
  // swap the airport's AI jet for a flyable one at the same spot, and walk the player to its front door
  boardJet(jet, world) {
    const t = this.airport.take(jet);
    const v = new Vehicle('jet', Math.max(0, LIVERIES.indexOf(t.livery)), t.x, t.z, t.heading, 0);
    this.scene.add(v.object);
    this.vehicles.adopt(v);
    world.vehicles.push(v);
    this.player.enterVehicle(v, world);
    this.toast('עלית למטוס — גז להאצה, "משוך" להמראה במהירות 210+ קמ״ש', 4);
    return v;
  }
  // carjacking: the car leaves traffic / airport service and becomes a normal vehicle the player can keep
  jackCar(v) {
    this.traffic.release(v);
    const i = this.airport.service.indexOf(v);
    if (i >= 0) this.airport.service.splice(i, 1);
    v.svc = null;
    this.vehicles.markUsed(v);
  }
  myVehicleNear(r) {
    let best = null, bd = r;
    for (const v of this.vehicles.kept) {
      const d = Math.hypot(v.x - this.player.x, v.z - this.player.z);
      if (d < bd && v.driver !== 'ai') { bd = d; best = v; }
    }
    return best;
  }
  openShop(kind, name) {
    this.state = 'shop'; this.shop.show(kind, name);
    // fitting room: the character turns around to face you so you can see what you try on
    if (this.shop.tryOn) { this._fit = { facing: this.player.facing, yaw: this.player.facing + Math.PI }; this.player.facing += Math.PI; }
  }
  closeShop() {
    if (this.state !== 'shop') return;
    if (this._fit) { this.player.facing = this._fit.facing; this.player.object.rotation.y = this.player.facing; this._fit = null; }
    this.state = 'playing'; this.input.endFrame(); this.clock.getDelta();
  }
  _fittingFrame(dt) {
    const p = this.player, f = p.facing;
    p.model.animate(dt, { speed: 0, grounded: true, mode: 'foot' });
    p.object.position.set(p.x, p.y, p.z); p.object.rotation.y = f;
    this.camera.position.set(p.x + Math.sin(f) * 2.5, p.y + 1.3, p.z + Math.cos(f) * 2.5);
    this.camera.lookAt(p.x, p.y + 0.95, p.z);
    const r = document.querySelector('#shopPanel .creator-panel')?.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    let cx = W / 2;
    if (r && r.width) { const lf = r.left, rf = W - r.right; if (Math.max(lf, rf) > 120) cx = rf >= lf ? (r.right + W) / 2 : r.left / 2; }
    if (Math.abs(cx - W / 2) > 2) this.camera.setViewOffset(W, H, -(cx - W / 2), 0, W, H); else if (this.camera.view?.enabled) this.camera.clearViewOffset();
    if (!this.creatorLight) { this.creatorLight = new THREE.PointLight(0xfff4e6, 0, 12, 1.6); this.scene.add(this.creatorLight); }
    this.creatorLight.intensity = 30;
    this.creatorLight.position.set(p.x + Math.sin(f + 0.5) * 1.8, p.y + 2.2, p.z + Math.cos(f + 0.5) * 1.8);
  }
  hurt(n, why) {
    if (n <= 0) return;
    this.econ.hurt(n);
    $('hurtFlash').classList.remove('on'); void $('hurtFlash').offsetWidth; $('hurtFlash').classList.add('on');
    if (this.econ.health <= 0) this.knockedOut(why);
  }
  knockedOut(why) {
    const fee = Math.min(this.econ.money, 500);
    this.econ.money -= fee; this.econ.health = 100;
    this.previewVehicleSafe();
    if (this.player.state !== 'foot') { const v = this.player.vehicle; if (v) v.driver = null; this.player.vehicle = null; this.player.state = 'foot'; this.player._detach?.(); }
    this.teleport(START.x, START.z, START.facing);
    this.toast(`התעלפת${why ? ' (' + why + ')' : ''} והתעוררת במרכז העיר. טיפול רפואי: ${fmt(fee)}`, 4);
  }
  openBag() {
    this.state = 'bag';
    const el = $('bagPanel'), list = el.querySelector('.items'), E = this.econ, p = this.player;
    const render = () => {
      list.innerHTML = '';
      const row = (name, desc, label, fn, disabled) => {
        const r = document.createElement('div'); r.className = 'srow';
        r.innerHTML = `<div class="sname"><b>${name}</b>${desc ? `<small>${desc}</small>` : ''}</div>`;
        const b = document.createElement('button'); b.className = 'sbuy'; b.type = 'button'; b.textContent = label; b.disabled = !!disabled;
        b.onclick = () => { const m = fn(); if (m) el.querySelector('.smsg').textContent = m; this.save(); render(); };
        r.appendChild(b); list.appendChild(r);
      };
      el.querySelector('.smoney').textContent = `${fmt(E.money)} · בריאות ${Math.round(E.health)}`;
      row(`חטיפים (${E.items.snacks})`, '+20 בריאות', 'לאכול', () => { E.items.snacks--; E.heal(20); return 'ננשנש. +20 בריאות'; }, E.items.snacks < 1 || E.health >= 100);
      const v = p.state === 'driving' ? p.vehicle : this.myVehicleNear(8);
      row(`ערכות תיקון (${E.items.repairKit})`, v ? `ל${v.T.name} (נזק ${Math.round(v.damage)}%)` : 'צריך להיות ליד הרכב שלך', 'לתקן', () => { E.items.repairKit--; v.repair(); return 'הרכב תוקן'; }, E.items.repairKit < 1 || !v);
      row(`מצנחים (${E.items.parachute})`, 'נפתח לבד בנפילה מגובה', '—', () => null, true);
      if (E.items.flashlight) row('פנס', E.flashlightOn ? 'דולק' : 'כבוי', E.flashlightOn ? 'לכבות' : 'להדליק', () => { E.flashlightOn = !E.flashlightOn; return null; });
      row('ידיים ריקות', '', this.econ.equipped ? 'לבחור' : 'נבחר', () => { this.equip(null); return null; }, !this.econ.equipped);
      for (const id of WEAPON_ORDER) if (E.weapons[id]) row(WEAPONS[id].name, `${E.weapons[id].ammo} יחידות · פריט משחק בדיוני`, E.equipped === id ? 'נבחר' : 'לבחור', () => { this.equip(id); return null; }, E.equipped === id);
    };
    el.querySelector('.smsg').textContent = '';
    el.classList.add('show');
    render();
  }
  closeBag() { $('bagPanel').classList.remove('show'); if (this.state === 'bag') { this.state = 'playing'; this.input.endFrame(); this.clock.getDelta(); } }

  // Teleport helper (used by automated tests / debugging); loads the area first so you never fall through the world.
  teleport(x, z, facing = 0, y = 1000) {
    this.chunks.update(x, z, true);
    this.player.setPosition(x, z, facing, y);
    this.interiors.update(0, this.player, true);
    this.rig.yaw = facing; this.rig.first = true;
  }

  pause() { if (this.state === 'menu') return; this.state = 'paused'; showScreen('pause'); this.audio.mute(true); }
  resume() { this.state = 'playing'; showScreen(null); this.audio.mute(false); this.input.endFrame(); this.clock.getDelta(); }
  openMap() {
    this.state = 'map'; showScreen('mapScreen');
    const p = this.playerPos();
    this.fullView = { x: p.x, z: p.z, r: 900 };
    requestAnimationFrame(() => this.drawFullMap());
  }
  drawFullMap() {
    const p = this.playerPos();
    this.minimap.fullRoute = this.gps.route?.points || null;
    this.minimap.fullDest = this.gps.dest || null;
    $('mapClear').classList.toggle('show', !!this.gps.dest);
    this.minimap.drawFull(p.x, p.z, p.facing, this.fullView);
  }
  _bindFullMap() {
    const c = $('fullMap'), pts = new Map();
    let pinch = 0;
    const zoom = (k) => { this.fullView.r = Math.max(120, Math.min(1500, this.fullView.r * k)); this.drawFullMap(); };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
    c.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) {
        const k = devicePixelRatio / this.minimap.fullScale;
        this.fullView.x -= (e.clientX - prev[0]) * k; this.fullView.z -= (e.clientY - prev[1]) * k;
        this.drawFullMap();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoom(pinch / d);
        pinch = d;
      }
    });
    let downAt = null;
    c.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
    const up = (e) => {
      // a tap (not a drag) marks a GPS destination there
      if (pts.size === 1 && downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 8) {
        const r = c.getBoundingClientRect(), k = devicePixelRatio / this.minimap.fullScale;
        const x = this.fullView.x + (e.clientX - r.left - r.width / 2) * k, z = this.fullView.z + (e.clientY - r.top - r.height / 2) * k;
        this.gps.set({ x, z, name: 'נקודה במפה', radius: 15 }, this.playerPos());
        this.drawFullMap();
      }
      pts.delete(e.pointerId); pinch = 0; downAt = null;
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.2 : 0.83); }, { passive: false });
    $('mapIn').onclick = () => zoom(0.7); $('mapOut').onclick = () => zoom(1.4);
    $('mapClear').onclick = () => { this.gps.clear(); this.drawFullMap(); this.toast('הסימון בוטל', 1.5); };
    $('gpsCancel').onclick = (e) => { e.stopPropagation(); this.gps.clear(); this.toast('הניווט בוטל', 1.5); };
    $('gpsCancel').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('mapMe').onclick = () => { const p = this.playerPos(); this.fullView.x = p.x; this.fullView.z = p.z; this.drawFullMap(); };
  }

  save(appearanceOnly = false) {
    if (!this.player) return;
    const prev = loadGame();
    const p = this.player;
    let data;
    if (appearanceOnly && prev) data = { ...prev, appearance: this.creator.app };
    else {
      const v = p.state === 'driving' || p.state === 'entering' || p.state === 'exiting' ? p.vehicle : null;
      data = {
        appearance: p.model.app,
        player: { x: v ? v.x : p.x, z: v ? v.z : p.z, y: v ? v.y : p.y, facing: p.facing },
        vehicle: v ? { type: v.typeKey, color: v.color, x: v.x, z: v.z, y: v.y, heading: v.heading, damage: v.damage } : null,
        playTime: this.playTime || 0,
        econ: this.econ.toJSON(),
        world: { hour: this.env.hour, weather: this.env.weather },
        missions: this.missions.toJSON(),
      };
    }
    saveGame(data);
  }

  toast(text, secs = 3) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('show'), secs * 1000);
  }

  // ------------------------------------------------------------------ frame
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.fpsAvg = this.fpsAvg * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    if (this.state === 'menu' || this.state === 'exit') this._menuFrame(dt);
    else if (this.state === 'creator') this._creatorFrame(dt);
    else if (this.state === 'shop' && this.shop.tryOn) this._fittingFrame(dt);
    else if (this.state === 'playing') this._playFrame(dt);
    this._lights();
    this.renderer.render(this.scene, this.camera);
  }

  // time of day + weather -> every light-dependent material
  _lighting(dt, cx, cz) {
    const L = this.env.tick(dt);
    const n = L.night, M = this.mats;
    for (const st of ['glass', 'office', 'concrete', 'plaster', 'brick', 'industrial', 'storefront']) M['f_' + st].emissiveIntensity = n * (st === 'storefront' ? 1.3 : 1.05);
    M.lamp.emissiveIntensity = 0.6 + n * 2.6;
    M.signs.emissiveIntensity = 0.15 + n * 0.9;
    vehicleMats.head.emissiveIntensity = 0.4 + n * 3;
    vehicleMats.tail.emissiveIntensity = 0.3 + n * 1.6;
    const dry = 1 - L.wet * 0.35;
    for (const k of ['road', 'asphalt', 'lot', 'tiles', 'plaza']) { M[k].roughness = 0.9 - L.wet * 0.55; M[k].color.setScalar(dry); }
    M.water.color.setHex(0x7fb6cf).multiplyScalar(0.35 + 0.65 * (1 - n));
    // street lamps near the player actually light the street at night
    const want = this.settings.quality === 'low' ? 0 : this.settings.quality === 'medium' ? 4 : 8;
    this._lampT = (this._lampT || 0) - dt;
    if (this._lampT <= 0) {
      this._lampT = 0.5;
      const lamps = [];
      for (const [i, j] of this.physCells) for (const l of WG.cellData(i, j).lamps) { const d = (l.x - cx) ** 2 + (l.z - cz) ** 2; if (d < 70 * 70) lamps.push([d, l]); }
      lamps.sort((a, b) => a[0] - b[0]);
      this.lampLights.forEach((pl, k) => {
        const e = lamps[k];
        pl.visible = n > 0.05 && k < want && !!e;
        if (pl.visible) { const l = e[1]; pl.position.set(l.x + l.dx * 1.5, l.y + 6.6, l.z + l.dz * 1.5); }
      });
    }
    for (const pl of this.lampLights) pl.intensity = n * 22;
    return L;
  }

  _menuFrame(dt) {
    this._leaveCreatorView();
    this.menuAngle += dt * 0.05;
    const cx = 520, cz = 520, r = 230;
    const x = cx + Math.cos(this.menuAngle) * r, z = cz + Math.sin(this.menuAngle) * r;
    this.camera.position.set(x, 95, z);
    this.camera.lookAt(cx, 30, cz);
    this.chunks.update(cx, cz);
    this._lighting(dt, cx, cz);
    this.env.update(new THREE.Vector3(cx, 0, cz), dt, this.camera);
    const all = [...this.vehicles.all(), ...this.traffic.cars, ...this.airport.service];
    for (const veh of all) veh.setFar(true);
    this.airport.update(dt, this.env.hour, cx, cz, all);
    this.traffic.update(dt, this.time, cx, cz, all, this.peds.obstacles());
    this.vehicles.update(dt, cx, cz, all, (x, z) => this.chunks.isPhysicsReady(x, z));
    this.peds.update(dt, this.time, { px: cx, pz: cz, player: this.player, vehicles: all, cells: this.physCells, graph: this.graph, statics: this.statics, benches: this.chunks.benches });
  }

  _creatorFrame(dt) {
    const p = this.player;
    this.input.poll();
    if (this.input.lookDX) p.facing += this.input.lookDX * 0.01;
    this.input.endFrame();
    p.model.animate(dt, { speed: 0, grounded: true, mode: 'foot' });
    if (p.state === 'foot') { p.object.position.set(p.x, p.y, p.z); p.object.rotation.y = p.facing; }
    const f = this.creatorView.yaw;
    const camDist = 3.4;
    const pos = new THREE.Vector3(p.x + Math.sin(f) * camDist, p.y + 1.35, p.z + Math.cos(f) * camDist);
    this.camera.position.copy(pos);
    this.camera.lookAt(p.x, p.y + 0.95, p.z);
    // show the character in the free part of the screen next to the panel (shift the projection, not the camera)
    const r = document.querySelector('#creator .creator-panel')?.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    let cx = W / 2;
    if (r && r.width) {
      const leftFree = r.left, rightFree = W - r.right;
      if (Math.max(leftFree, rightFree) > 140) cx = rightFree >= leftFree ? (r.right + W) / 2 : r.left / 2;
    }
    if (Math.abs(cx - W / 2) > 2) this.camera.setViewOffset(W, H, -(cx - W / 2), 0, W, H);
    else if (this.camera.view?.enabled) this.camera.clearViewOffset();
    // studio light so the character is clearly visible even at night
    if (!this.creatorLight) { this.creatorLight = new THREE.PointLight(0xfff4e6, 0, 12, 1.6); this.scene.add(this.creatorLight); }
    this.creatorLight.intensity = 45;
    this.creatorLight.position.set(p.x + Math.sin(f + 0.5) * 2.2, p.y + 2.4, p.z + Math.cos(f + 0.5) * 2.2);
    this.env.update(p.object.position);
  }

  _leaveCreatorView() {
    if (this.camera.view?.enabled) this.camera.clearViewOffset();
    if (this.creatorLight) this.creatorLight.intensity = 0;
  }

  _playFrame(dt) {
    this._leaveCreatorView();
    const input = this.input, p = this.player;
    input.poll();
    this.playTime = (this.playTime || 0) + dt;
    if (input.wasPressed('pause')) { this.save(); this.pause(); input.endFrame(); return; }
    if (input.wasPressed('map')) { this.openMap(); input.endFrame(); return; }
    if (input.wasPressed('camera')) this.rig.toggleMode();
    if (input.wasPressed('bag')) { this.openBag(); input.endFrame(); return; }
    if (input.wasPressed('phone')) this.phone.toggle();
    if (input.wasPressed('cycle')) this.cycleWeapon();
    if (input.wasPressed('light')) { if (this.econ.items.flashlight) this.econ.flashlightOn = !this.econ.flashlightOn; else this.toast('אין לך פנס — אפשר לקנות בחנות ציוד', 2); }
    input.fireByMouse = p.state !== 'foot' ? false : this.econ.equipped ? 'hold' : 'tap';

    const all = [...this.vehicles.all(), ...this.traffic.cars, ...this.airport.service];
    const pedObs = this.peds.obstacles();
    const world = {
      statics: this.statics, vehicles: all, benches: this.chunks.benches, peds: pedObs,
      onVehicleUsed: (v) => this.vehicles.markUsed(v),
      econ: this.econ, onHurt: (n, why) => this.hurt(n, why), onMessage: (m) => this.toast(m, 2),
      seats: this._seats(), pedPositions: this.peds.peds,
      onJack: (v) => this.jackCar(v),
      onYank: (v, ped) => { this.peds.yank(ped, v, p); this.audio.impact?.(3); this.rig.shake = Math.max(this.rig.shake, 0.15); },
    };
    this.interiors.update(dt, p);
    p.update(dt, input, this.rig.yaw, world);
    // board a passenger jet standing at the airport
    if (!p.prompt && p.state === 'foot') {
      const jet = this.airport.boardable(p);
      if (jet) {
        p.prompt = { key: 'vehicle', text: 'היכנס: מטוס נוסעים', label: 'היכנס למטוס' };
        if (input.wasPressed('vehicle') || input.wasPressed('interact')) this.boardJet(jet, world);
      }
    }
    // elevator call buttons on landings
    if (!p.prompt) {
      const ep = this.interiors.promptFor(p);
      if (ep) { p.prompt = { key: 'interact', text: ep.text }; if (input.wasPressed('interact')) ep.action(); }
    }
    // the wardrobe in the villa: change into any clothes you own
    if (!p.prompt && p.state === 'foot') {
      for (const L of this.interiors.places()) {
        const w = L.spec.wardrobe;
        if (!w || Math.abs(w.y - p.y) > 1 || Math.hypot(w.pt[0] - p.x, w.pt[1] - p.z) > 2.0) continue;
        p.prompt = { key: 'interact', text: 'ארון בגדים' };
        if (input.wasPressed('interact')) { this.openShop('wardrobe', 'הבית שלי'); input.endFrame(); return; }
        break;
      }
    }
    // shop counters
    if (!p.prompt && p.state === 'foot') {
      outer: for (const L of this.interiors.places()) {
        const list = [...(L.spec.counter ? [{ ...L.spec.counter, name: L.b.sign }] : []), ...(L.spec.counters || [])];
        for (const c of list) {
          if (c.lobby) continue;
          const kind = shopKind(c.name);
          if (!kind || Math.abs(c.y - p.y) > 1 || Math.hypot(c.pt[0] - p.x, c.pt[1] - p.z) > 2.4) continue;
          p.prompt = { key: 'interact', text: `קנייה — ${c.name}` };
          if (input.wasPressed('interact')) { this.openShop(kind, c.name); input.endFrame(); return; }
          break outer;
        }
      }
    }
    const v = p.state === 'driving' ? p.vehicle : null;
    if (v && v.lastImpact > 4) { this.rig.shake = Math.min(1, v.lastImpact / 15); this.audio.impact(v.lastImpact); if (v.lastImpact > 12) this.hurt(Math.round((v.lastImpact - 12) * 2.5), 'תאונה'); v.lastImpact = 0; }
    if (v) v.horn = input.isHeld('horn');

    const focusX = v ? v.x : p.x, focusZ = v ? v.z : p.z;
    const obstacles = p.state === 'foot' || p.state === 'sitting' ? [{ x: p.x, z: p.z, r: 0.5 }, ...pedObs] : pedObs;
    this.traffic.update(dt, this.time, focusX, focusZ, all, obstacles);
    // every AI car has someone at the wheel
    for (const car of all) if (car.driver === 'ai' && !car.driverPed && !car.isAir && !car.removed) this.peds.addDriver(car);
    this.vehicles.update(dt, focusX, focusZ, all, (x, z) => this.chunks.isPhysicsReady(x, z));
    this.peds.update(dt, this.time, { px: focusX, pz: focusZ, player: p, vehicles: all, cells: this.physCells, graph: this.graph, statics: this.statics, benches: this.chunks.benches, places: this.interiors.places(),
      onPlayerHit: (who, n) => { this.hurt(n, 'קטטה'); this.rig.shake = Math.max(this.rig.shake, 0.3); p.combatT = 3; } });
    this.airport.update(dt, this.env.hour, focusX, focusZ, all);
    // GPS, missions, phone, radio
    const pp = this.playerPos();
    const g = this.gps.update(dt, pp.x, pp.z);
    if (g?.arrived && !g.arrived.mission) this.toast(`הגעת ליעד: ${g.arrived.name || ''}`, 2.5);
    this.missions.update(dt);
    this._phoneT = (this._phoneT || 0) - dt;
    if (this._phoneT <= 0) { this._phoneT = 0.5; this.phone.tick(); }
    const wantRadio = this.selectedStation >= 0 && (p.state === 'driving' || this.radioOnFoot);
    if (wantRadio && this.radio.station !== this.selectedStation) this.radio.play(this.selectedStation);
    if (!wantRadio && this.radio.station >= 0) this.radio.stop();
    if (p.state === 'sitting' && p.seq?.seat.kind === 'sleep' && p.seq.phase === 'idle') this.econ.heal(dt * 3);
    this.combat.update(dt, {
      player: p, input, econ: this.econ, pedSys: this.peds, vehicles: all,
      onShake: (k) => { this.rig.shake = Math.max(this.rig.shake, k); },
    });
    this.weapons.update(dt, {
      player: p, econ: this.econ, input, camera: this.camera, vehicles: all,
      peds: this.peds.peds.filter((q) => q.state !== 'inside' && !q.car && q.state !== 'pulled' && q.state !== 'thrown'),
      scare: (ped, src, hit) => this.peds.scare(ped, src, hit), hurtPlayer: (n) => this.hurt(n, 'פיצוץ'),
      onShake: (k) => { this.rig.shake = Math.max(this.rig.shake, k); }, message: (m) => this.toast(m, 2),
    });
    this.rig.update(dt, input, p);
    // flashlight
    const fl = this.flashlight, on = this.econ.items.flashlight && this.econ.flashlightOn && p.state !== 'driving';
    fl.intensity = on ? 60 : 0;
    if (on) { fl.position.set(p.x, p.y + 1.5, p.z); fl.target.position.set(p.x + Math.sin(p.facing) * 8, p.y + 0.4, p.z + Math.cos(p.facing) * 8); }
    const pending = this.chunks.update(focusX, focusZ);
    const LI = this._lighting(dt, focusX, focusZ);
    this.env.update(new THREE.Vector3(focusX, v ? v.y : p.y, focusZ), dt, this.camera);
    // headlights of the player's car at night
    const hl = this.headlight;
    hl.intensity = v && !v.isHeli && LI.night > 0.3 ? 90 * LI.night : 0;
    if (hl.intensity) {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      hl.position.set(v.x + fx * v.T.L * 0.5, v.y + 0.8, v.z + fz * v.T.L * 0.5);
      hl.target.position.set(v.x + fx * 25, v.y, v.z + fz * 25);
    }
    this.mats.water.map.offset.x = (this.time * 0.01) % 1;
    this.audio.update(v, p.controls?.throttle || 0, input.isHeld('horn'));

    // adaptive detail: shrink the streaming radius if the device struggles
    this._perfT = (this._perfT || 0) + dt;
    if (this._perfT > 2) {
      this._perfT = 0;
      if (this.fpsAvg < 26 && this.chunks.radius > 200) this.chunks.radius -= 40;
      else if (this.fpsAvg > 50 && this.chunks.radius < this.baseRadius) this.chunks.radius += 20;
    }

    const cam = this.camera.position;
    for (const veh of all) veh.setFar(veh !== v && (veh.x - cam.x) ** 2 + (veh.z - cam.z) ** 2 > 45 * 45);
    this._hud(dt, v, pending);
    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.save(); }
    input.endFrame();
  }

  _hud(dt, v, pending) {
    const p = this.player;
    // prompt
    const pr = $('prompt');
    // clickable action button (works with mouse, touch and keyboard)
    if (p.prompt && !(this.input.isTouch && (p.prompt.key === 'vehicle' || p.prompt.key === 'interact'))) {
      const label = p.prompt.key === 'vehicle' ? (v ? (v.isHeli ? 'צא מהמסוק' : v.isPlane ? 'צא מהמטוס' : 'צא מהרכב') : p.prompt.label || 'היכנס לרכב') : p.prompt.text + (p.prompt.seat ? ` · ${p.prompt.seat}` : '');
      const html = this.input.isTouch ? label : `<kbd>${p.prompt.key === 'vehicle' ? 'F' : 'E'}</kbd>${label}${p.prompt.key === 'vehicle' && !v ? ' · ' + p.prompt.text.replace('היכנס: ', '') : ''}`;
      if (pr.dataset.html !== html) { pr.innerHTML = html; pr.dataset.html = html; }
      pr.dataset.key = p.prompt.key;
      pr.classList.add('show');
    } else pr.classList.remove('show');
    if (p.message) { this.toast(p.message, 2); p.message = null; }
    // money, health, equipment
    $('money').textContent = fmt(this.econ.money);
    $('clock').textContent = `${this.env.clockText} · ${this.env.weatherName}`;
    $('hpFill').style.width = this.econ.health + '%';
    $('hpFill').classList.toggle('low', this.econ.health < 30);
    const wid = this.econ.equipped;
    $('weaponHud').textContent = wid && p.state === 'foot' ? `${WEAPONS[wid].name} · ${this.econ.weapons[wid].ammo}` : '';
    $('hud').classList.toggle('armed', !!wid && p.state === 'foot');
    // speedometer
    const sp = $('speedo');
    if (v) {
      sp.classList.add('show');
      $('speedVal').textContent = Math.round(Math.abs(v.speed) * 3.6);
      $('vehName').textContent = v.isAir ? `${v.T.name} · גובה ${Math.round(v.y)} מ׳` : v.T.name;
      $('dmgFill').style.width = v.damage + '%';
    } else sp.classList.remove('show');
    // touch controls by context
    if (this.input.isTouch) {
      const mode = v ? (v.isHeli ? 'heli' : v.isPlane ? 'plane' : 'drive') : (p.state === 'foot' || p.state === 'sitting' ? 'foot' : null);
      document.querySelectorAll('.tbtns').forEach((el) => el.classList.toggle('show', el.classList.contains(mode)));
      $('tInteract').classList.toggle('show', p.prompt?.key === 'interact' && !v);
      if (p.prompt?.key === 'interact') { const t = p.prompt.text + (p.prompt.seat ? ` · ${p.prompt.seat}` : ''); if ($('tInteract').textContent !== t) $('tInteract').textContent = t; }
      $('tVehicle').classList.toggle('show', p.prompt?.key === 'vehicle' && !v);
      { const t = p.prompt?.label || 'היכנס לרכב'; if ($('tVehicle').textContent !== t) $('tVehicle').textContent = t; }
      { const t = v?.isPlane ? 'צא מהמטוס' : 'צא מהרכב'; if ($('tExit').textContent !== t) $('tExit').textContent = t; }
      $('tExit').classList.toggle('show', !!v && !v.isHeli && p.prompt?.key === 'vehicle');
      $('tExitHeli').classList.toggle('show', !!v && v.isHeli && p.prompt?.key === 'vehicle');
      $('runBtn').classList.toggle('on', p.sprint);
      $('tFire').classList.toggle('show', mode === 'foot' && p.state === 'foot');
      const fl = this.econ.equipped ? 'ירי' : 'אגרוף'; if ($('tFire').textContent !== fl) $('tFire').textContent = fl;
      $('tLight').classList.toggle('show', !!this.econ.items.flashlight);
      $('joyHint').style.display = this.input.joy.id === null && !v && this.playTime < 30 ? 'block' : 'none';
    }
    // minimap
    this._mmT = (this._mmT || 0) + dt;
    if (this._mmT > 1 / 20) {
      this._mmT = 0;
      this.minimap.draw(v ? v.x : p.x, v ? v.z : p.z, v ? v.heading : p.facing, this.rig.yaw, this.gps.dest ? [{ x: this.gps.dest.x, z: this.gps.dest.z, color: '#b35cff' }] : [], this.gps.route?.points, this.landmarks());
      const ob = $('objective'), st = this.missions.objective();
      ob.textContent = st ? st.text : ''; ob.classList.toggle('show', !!st);
      const gh = $('gpsHud');
      if (this.gps.dest) {
        const M = this.missions, px = v ? v.x : p.x, pz = v ? v.z : p.z;
        const rem = this.gps.remaining(px, pz);
        // arrival estimate from a smoothed travel speed (walking / driving floor so it never shows "forever")
        const sp = v ? Math.abs(v.speed) : Math.hypot(p.vx || 0, p.vz || 0);
        this._navSpeed = (this._navSpeed ?? sp) * 0.9 + sp * 0.1;
        const eta = rem / Math.max(this._navSpeed, v ? (v.isAir ? 40 : 9) : 1.6);
        const etaTxt = eta < 60 ? `${Math.max(1, Math.round(eta / 10) * 10)} שנ׳` : `${Math.round(eta / 60)} דק׳`;
        gh.querySelector('.gdist').textContent = rem >= 1000 ? `${(rem / 1000).toFixed(1)} ק״מ` : `${Math.round(rem / 10) * 10} מ׳`;
        gh.querySelector('.geta').textContent = `· ${etaTxt}`;
        gh.querySelector('.gname').textContent = `${this.gps.dest.name || 'יעד'}${M.timer !== null ? ` · נשארו ${Math.ceil(M.timer)} שנ׳` : ''}`;
        // arrow: direction of the route ahead relative to where the camera looks
        const aim = this.gps.aimPoint(px, pz);
        this.camera.getWorldDirection(_navDir);
        let rel = Math.atan2(aim[0] - px, aim[1] - pz) - Math.atan2(_navDir.x, _navDir.z);
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        gh.querySelector('.garrow svg').style.transform = `rotate(${-rel}rad)`;
        gh.classList.add('show'); document.body.classList.add('navon');
      } else { gh.classList.remove('show'); document.body.classList.remove('navon'); }
    }
    // district name
    this._dT = (this._dT || 0) + dt;
    if (this._dT > 0.5) {
      this._dT = 0;
      const d = districtAt(v ? v.x : p.x, v ? v.z : p.z);
      // "where am I": the nearest named place within 70 m, otherwise the district — always under the minimap
      const hx = v ? v.x : p.x, hz = v ? v.z : p.z;
      let near = null, nd = 70;
      for (const L of this.landmarks()) { const dd = Math.hypot(L.x - hx, L.z - hz); if (dd < nd) { nd = dd; near = L; } }
      const here = near ? `${near.icon} ${near.short}` : `📍 ${d}`;
      if ($('here').textContent !== here) $('here').textContent = here;
      if (d !== this.lastDistrict) {
        this.lastDistrict = d;
        const el = $('district'); el.textContent = d; el.classList.add('show');
        clearTimeout(this._dTO); this._dTO = setTimeout(() => el.classList.remove('show'), 3000);
      }
      if (this.settings.showFps) $('fps').textContent = `${Math.round(this.fpsAvg)} FPS · ${this.traffic.cars.length} רכבים · ${this.peds.peds.length} אנשים · ${this.chunks.near.size}/${this.chunks.far.size} אזורים${pending ? ' · טוען...' : ''} · (${Math.round(p.x)}, ${Math.round(p.z)})`;
    }
  }

  _lights() {
    this._lightT = (this._lightT || 0) - 1;
    if (this._lightT > 0) return;
    this._lightT = 10;
    this.chunks.updateLights(this.time, lightState);
  }
}

const game = new Game();
window.__game = game; // handy for debugging and automated tests
window.__wg = WG;
game.load().catch((e) => {
  console.error(e);
  $('loadText').textContent = 'שגיאה בטעינה: ' + e.message;
});
