// Azura City — open world game bootstrap and main loop.
import * as THREE from 'three';
import { generateCity, districtAt, groundHeight } from './world/layout.js';
import { setAnisotropy } from './world/textures.js';
import { makeMaterials, buildStaticWorld, registerCityColliders } from './world/worldBuilder.js';
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
    this.resize();
  }

  async load() {
    const step = async (pct, text) => { $('loadBar').style.width = pct + '%'; $('loadText').textContent = text; await new Promise((r) => setTimeout(r, 0)); };
    await step(5, 'מתכנן את העיר...');
    this.city = generateCity();
    this.graph = new RoadGraph();
    this.statics = new StaticWorld();
    await step(25, 'סולל כבישים ומדרכות...');
    this.mats = makeMaterials();
    this.env = new Environment(this.scene, this.renderer);
    this.world = buildStaticWorld(this.scene, this.city, this.graph, this.statics, this.mats);
    registerCityColliders(this.city, this.statics);
    await step(50, 'בונה שכונות...');
    this.chunks = new ChunkManager(this.scene, this.city, this.mats);
    this.benches = [];
    const addBench = (p) => { if (p.kind === 'bench') this.benches.push(p); };
    for (const b of this.city.blocks) b.props.forEach(addBench);
    this.city.extra.props.forEach(addBench);
    await step(65, 'מחנה רכבים...');
    this.vehicles = new VehicleManager(this.scene, this.city, this.statics);
    this.traffic = new Traffic(this.scene, this.graph, this.statics);
    this.player = new Player(this.scene, defaultAppearance());
    this.rig = new CameraRig(this.camera, this.statics);
    this.input = new Input(this.canvas);
    this.minimap = new MiniMap(this.city, this.graph, $('minimap'), $('fullMap'));
    this.creator = new Creator((app) => this.player.model.setAppearance(app));
    this.applySettings(this.settings);
    bindSettings(this.settings, (s) => { this.applySettings(s); saveSettings(s); });
    await step(80, 'מכין את המרכז...');
    this.menuFocus = new THREE.Vector3(500, 0, 500);
    this.chunks.update(500, 500, true);
    this.vehicles.update(0, 500, 500, []);
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
    if (this.chunks) this.chunks.radius = q === 'low' ? 280 : q === 'medium' ? 380 : 500;
    this.baseRadius = this.chunks?.radius;
    if (this.camera) this.camera.far = q === 'low' ? 900 : 2500;
    this.camera?.updateProjectionMatrix();
    this.traffic?.setDensity(s.traffic);
    if (this.rig) { this.rig.sensitivity = s.sensitivity; this.rig.invertY = s.invertY; }
    this.audio.setVolume(s.volume);
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
    this.player.setPosition(p.x, p.z, p.facing);
    this.player.state = 'foot';
    this.playTime = s.playTime || 0;
    if (s.vehicle) {
      const vd = s.vehicle;
      const v = new Vehicle(vd.type, vd.color, vd.x, vd.z, vd.heading);
      if (vd.y) v.y = Math.max(vd.y, groundHeight(vd.x, vd.z));
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

  startPlaying() {
    this.state = 'playing';
    showScreen(null);
    $('hud').classList.remove('hidden');
    $('touch').classList.toggle('hidden', !this.input.isTouch);
    this.player.object.visible = true;
    this.chunks.update(this.player.x, this.player.z, true);
    this.saveTimer = 0;
    this.lastDistrict = null;
    this.input.endFrame();
  }

  pause() { if (this.state === 'menu') return; this.state = 'paused'; showScreen('pause'); this.audio.mute(true); }
  resume() { this.state = 'playing'; showScreen(null); this.audio.mute(false); this.input.endFrame(); this.clock.getDelta(); }
  openMap() {
    this.state = 'map'; showScreen('mapScreen');
    requestAnimationFrame(() => this.minimap.drawFull(this.player.x, this.player.z, this.player.state === 'driving' ? this.player.vehicle.heading : this.player.facing));
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
        player: { x: v ? v.x : p.x, z: v ? v.z : p.z, facing: p.facing },
        vehicle: v ? { type: v.typeKey, color: v.color, x: v.x, z: v.z, y: v.y, heading: v.heading, damage: v.damage } : null,
        playTime: this.playTime || 0,
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
    else if (this.state === 'playing') this._playFrame(dt);
    this._lights();
    this.renderer.render(this.scene, this.camera);
  }

  _menuFrame(dt) {
    this.menuAngle += dt * 0.05;
    const cx = 520, cz = 520, r = 230;
    const x = cx + Math.cos(this.menuAngle) * r, z = cz + Math.sin(this.menuAngle) * r;
    this.camera.position.set(x, 95, z);
    this.camera.lookAt(cx, 30, cz);
    this.chunks.update(cx, cz);
    this.env.update(new THREE.Vector3(cx, 0, cz));
    this.traffic.update(dt, this.time, cx, cz, [...this.vehicles.all(), ...this.traffic.cars], []);
    this.vehicles.update(dt, cx, cz, [...this.vehicles.all(), ...this.traffic.cars]);
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
    const wide = innerWidth > 700;
    const right = new THREE.Vector3(Math.cos(f), 0, -Math.sin(f)).multiplyScalar(wide ? 0.85 : 0);
    this.camera.position.copy(pos);
    this.camera.lookAt(p.x + right.x * -1, p.y + (wide ? 1.0 : 0.75), p.z + right.z * -1);
    this.env.update(p.object.position);
  }

  _playFrame(dt) {
    const input = this.input, p = this.player;
    input.poll();
    this.playTime = (this.playTime || 0) + dt;
    if (input.wasPressed('pause')) { this.save(); this.pause(); input.endFrame(); return; }
    if (input.wasPressed('map')) { this.openMap(); input.endFrame(); return; }
    if (input.wasPressed('camera')) this.rig.toggleMode();

    const all = [...this.vehicles.all(), ...this.traffic.cars];
    const world = {
      statics: this.statics, vehicles: all, benches: this.benches,
      onVehicleUsed: (v) => this.vehicles.markUsed(v),
    };
    p.update(dt, input, this.rig.yaw, world);
    const v = p.state === 'driving' ? p.vehicle : null;
    if (v && v.lastImpact > 4) { this.rig.shake = Math.min(1, v.lastImpact / 15); this.audio.impact(v.lastImpact); v.lastImpact = 0; }
    if (v) v.horn = input.isHeld('horn');

    const focusX = v ? v.x : p.x, focusZ = v ? v.z : p.z;
    const obstacles = p.state === 'foot' || p.state === 'sitting' ? [{ x: p.x, z: p.z, r: 0.5 }] : [];
    this.traffic.update(dt, this.time, focusX, focusZ, all, obstacles);
    this.vehicles.update(dt, focusX, focusZ, all);
    this.rig.update(dt, input, p);
    const pending = this.chunks.update(focusX, focusZ);
    this.env.update(new THREE.Vector3(focusX, v ? v.y : p.y, focusZ));
    this.world.sea.material.map.offset.x = (this.time * 0.004) % 1;
    this.audio.update(v, p.controls?.throttle || 0, input.isHeld('horn'));

    // adaptive detail: shrink the streaming radius if the device struggles
    this._perfT = (this._perfT || 0) + dt;
    if (this._perfT > 2) {
      this._perfT = 0;
      if (this.fpsAvg < 26 && this.chunks.radius > 220) this.chunks.radius -= 40;
      else if (this.fpsAvg > 50 && this.chunks.radius < this.baseRadius) this.chunks.radius += 20;
    }

    this._hud(dt, v, pending);
    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.save(); }
    input.endFrame();
  }

  _hud(dt, v, pending) {
    const p = this.player;
    // prompt
    const pr = $('prompt');
    if (p.prompt && !this.input.isTouch) {
      pr.innerHTML = `<kbd>${p.prompt.key === 'vehicle' ? 'F' : 'E'}</kbd>${p.prompt.text}`;
      pr.classList.add('show');
    } else pr.classList.remove('show');
    if (p.message) { this.toast(p.message, 2); p.message = null; }
    // speedometer
    const sp = $('speedo');
    if (v) {
      sp.classList.add('show');
      $('speedVal').textContent = Math.round(Math.abs(v.speed) * 3.6);
      $('vehName').textContent = v.isHeli ? `${v.T.name} · גובה ${Math.round(v.y)} מ׳` : v.T.name;
      $('dmgFill').style.width = v.damage + '%';
    } else sp.classList.remove('show');
    // touch controls by context
    if (this.input.isTouch) {
      const mode = v ? (v.isHeli ? 'heli' : 'drive') : (p.state === 'foot' || p.state === 'sitting' ? 'foot' : null);
      document.querySelectorAll('.tbtns').forEach((el) => el.classList.toggle('show', el.classList.contains(mode)));
      $('tInteract').classList.toggle('show', p.prompt?.key === 'interact');
      $('tVehicle').classList.toggle('show', p.prompt?.key === 'vehicle' && !v);
      $('tExit').classList.toggle('show', !!v && p.prompt?.key === 'vehicle');
      $('tExitHeli').classList.toggle('show', !!v && p.prompt?.key === 'vehicle');
      $('runBtn').classList.toggle('on', p.sprint);
      $('joyHint').style.display = this.input.joy.id === null && !v && this.playTime < 30 ? 'block' : 'none';
    }
    // minimap
    this._mmT = (this._mmT || 0) + dt;
    if (this._mmT > 1 / 20) {
      this._mmT = 0;
      this.minimap.draw(v ? v.x : p.x, v ? v.z : p.z, v ? v.heading : p.facing, this.rig.yaw);
    }
    // district name
    this._dT = (this._dT || 0) + dt;
    if (this._dT > 0.5) {
      this._dT = 0;
      const d = districtAt(v ? v.x : p.x, v ? v.z : p.z);
      if (d !== this.lastDistrict) {
        this.lastDistrict = d;
        const el = $('district'); el.textContent = d; el.classList.add('show');
        clearTimeout(this._dTO); this._dTO = setTimeout(() => el.classList.remove('show'), 3000);
      }
      if (this.settings.showFps) $('fps').textContent = `${Math.round(this.fpsAvg)} FPS · ${this.traffic.cars.length} רכבים בתנועה · ${this.chunks.loaded.size} אזורים${pending ? ' · טוען...' : ''}`;
    }
  }

  // Traffic light bulbs — recolored only when a phase changes
  _lights() {
    this._lightT = (this._lightT || 0) - 1;
    if (this._lightT > 0) return;
    this._lightT = 10;
    const { tlSpots, bulbs } = this.world;
    const cols = { r: new THREE.Color(0xff2a1a), y: new THREE.Color(0xffc21a), g: new THREE.Color(0x2aff5a) };
    const off = new THREE.Color(0x1d1d1d);
    let changed = false;
    this._tlCache ||= new Array(tlSpots.length).fill('');
    tlSpots.forEach((s, i) => {
      const st = lightState(s.node, s.axis, this.time);
      if (this._tlCache[i] === st) return;
      this._tlCache[i] = st; changed = true;
      bulbs.setColorAt(i * 3, st === 'r' ? cols.r : off);
      bulbs.setColorAt(i * 3 + 1, st === 'y' ? cols.y : off);
      bulbs.setColorAt(i * 3 + 2, st === 'g' ? cols.g : off);
    });
    if (changed) bulbs.instanceColor.needsUpdate = true;
  }
}

const game = new Game();
window.__game = game; // handy for debugging and automated tests
game.load().catch((e) => {
  console.error(e);
  $('loadText').textContent = 'שגיאה בטעינה: ' + e.message;
});
