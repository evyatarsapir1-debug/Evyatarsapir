// Three playable characters - Miguel, Tavor and Jason. Each one has his own look, place in the city, money, health,
// weapons and wardrobe. Switch with the character wheel (K / the 👥 button): the camera flies up out of the current
// character's life, across the city and down to the other one, who is somewhere else doing his own thing.
import * as THREE from 'three';
import * as WG from '../world/worldGen.js';
import { CharacterModel } from '../character/characterModel.js';
import { fmt } from './economy.js';

export const PROTAGONISTS = [
  { id: 'miguel', name: 'מיגל', role: 'סוחר רכבים לשעבר, ממציא את עצמו מחדש בעיר',
    app: { name: 'מיגל', skin: 3, hairStyle: 'buzz', hairColor: 0, beard: 'stubble', glasses: 'sun', top: 'shirt', topColor: 14, underColor: 0, bottom: 'capri', bottomColor: 18, shoes: 4, shoeStyle: 'sandal', height: 1.08, build: 1.04 } },
  { id: 'tavor', name: 'טבור', role: 'מכונאי קשוח מהנמל, חם מזג ונאמן',
    app: { name: 'טבור', skin: 1, hairStyle: 'bald', hairColor: 2, beard: 'full', glasses: 'none', top: 'tank', topColor: 18, bottom: 'pants', bottomColor: 16, shoes: 1, shoeStyle: 'boot', height: 1.12, build: 1.18 } },
  { id: 'jason', name: 'ג׳ייסון', role: 'נהג מירוצים צעיר מהשכונה, מהיר ושאפתן',
    app: { name: 'ג׳ייסון', skin: 4, hairStyle: 'curly', hairColor: 0, beard: 'goatee', glasses: 'none', top: 'hoodie', topColor: 17, bottom: 'jeans', bottomColor: 10, shoes: 0, shoeStyle: 'sneaker', height: 1.07, build: 0.98 } },
];
const BY_ID = Object.fromEntries(PROTAGONISTS.map((p) => [p.id, p]));
// where each one starts: Miguel at home, Tavor by the harbour warehouses, Jason at the beach cafe
const SPOT_SIGNS = { tavor: 'מחסני הנמל', jason: 'בית קפה החוף' };

export class Characters {
  constructor(game) {
    this.game = game; this.active = 'miguel'; this.data = {}; this.sw = null;
    this._ui();
  }
  get current() { return BY_ID[this.active]; }

  _spot(id, fallback) {
    const sign = SPOT_SIGNS[id];
    if (sign) for (let i = -3; i < 14; i++) for (let j = -3; j < 14; j++) {
      const b = WG.cellData(i, j).buildings.find((q) => q.sign === sign);
      if (b) { const ox = b.door.x - b.x, oz = b.door.z - b.z, d = Math.hypot(ox, oz) || 1; return { x: b.door.x + (ox / d) * 3, z: b.door.z + (oz / d) * 3, facing: Math.atan2(ox, oz) }; }
    }
    return fallback;
  }
  // fresh game: everyone gets his own look, money and place; you start as Miguel
  reset(start) {
    this.active = 'miguel';
    const money = { miguel: 15000, tavor: 9000, jason: 6000 };
    this.data = {};
    for (const P of PROTAGONISTS) {
      const s = P.id === 'miguel' ? start : this._spot(P.id, { x: start.x + 40, z: start.z, facing: 0 });
      this.data[P.id] = { app: { ...P.app }, x: s.x, z: s.z, facing: s.facing, money: money[P.id], health: 100, weapons: {}, equipped: null, wardrobe: [] };
    }
  }
  load(o, start) {
    if (!o || !o.data) { this.reset(start); this.data.miguel.app = { ...this.game.player.model.app, name: 'מיגל' }; return; }
    this.active = BY_ID[o.active] ? o.active : 'miguel'; this.data = o.data;
    for (const P of PROTAGONISTS) if (!this.data[P.id]) { const s = this._spot(P.id, start); this.data[P.id] = { app: { ...P.app }, x: s.x, z: s.z, facing: s.facing, money: 5000, health: 100, weapons: {}, equipped: null, wardrobe: [] }; }
  }
  // the live game state of the character you are playing goes back into his record
  snapshot() {
    const g = this.game, p = g.playerPos(), E = g.econ, d = this.data[this.active];
    if (!d) return;
    Object.assign(d, { app: { ...g.player.model.app }, x: p.x, z: p.z, facing: p.facing, money: E.money, health: E.health, weapons: JSON.parse(JSON.stringify(E.weapons)), equipped: E.equipped, wardrobe: E.wardrobe.slice(), gang: E.gang || null, gangPrev: E.gangPrev || null });
  }
  toJSON() { this.snapshot(); return { active: this.active, data: this.data }; }
  // put a character's record into the live game
  _apply(id) {
    const g = this.game, d = this.data[id], E = g.econ, P = g.player;
    this.active = id;
    P.model.setAppearance(d.app); g.creator.app = { ...d.app };
    E.money = d.money; E.health = d.health; E.weapons = JSON.parse(JSON.stringify(d.weapons || {})); E.wardrobe = (d.wardrobe || []).slice(); E.gang = d.gang || null; E.gangPrev = d.gangPrev || null;
    E.equipped = d.equipped && E.weapons[d.equipped] ? d.equipped : null; g.equip(E.equipped);
    g.chunks.update(d.x, d.z, true);
    P.setPosition(d.x, d.z, d.facing);
    P.state = 'foot';
    g.rig.yaw = d.facing; g.rig.pitch = 0.25; g.rig.first = true;
    this._hud();
  }
  why() {
    const g = this.game, p = g.player;
    if (g.police.level > 0) return 'אי אפשר להחליף דמות כשהמשטרה מחפשת אותך';
    if (g.heist?.active) return 'אי אפשר להחליף דמות באמצע שוד';
    if (p.vehicle && p.vehicle.isAir && p.vehicle.airborne) return 'נחת קודם — אי אפשר להחליף דמות באוויר';
    if (!['foot', 'driving'].includes(p.state)) return 'סיים את מה שאתה עושה ואז החלף דמות';
    return null;
  }

  // ------------------------------------------------------------------ the character wheel
  _ui() {
    const btn = document.createElement('button'); btn.id = 'charBtn'; btn.type = 'button'; btn.setAttribute('aria-label', 'החלף דמות'); btn.textContent = '👥';
    document.getElementById('hud').appendChild(btn);
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.toggle(); });
    const w = document.createElement('div'); w.id = 'charWheel'; document.body.appendChild(w); this.wheel = w;
    w.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('[data-char]'); e.preventDefault(); e.stopPropagation();
      if (!c) { if (e.target === w) this.close(); return; }
      if (c.dataset.char === 'close') this.close(); else this.pick(c.dataset.char);
    });
    const fl = document.createElement('div'); fl.id = 'switchFlash'; document.body.appendChild(fl); this.flash = fl;
  }
  _hud() { const b = document.getElementById('charBtn'); if (b) b.title = this.current.name; }
  toggle() { this.wheel.classList.contains('show') ? this.close() : this.open(); }
  open() {
    const g = this.game; if (g.state !== 'playing' || this.sw) return;
    this.snapshot();
    this._portraits(); this._hud();
    const block = this.why();
    this.wheel.innerHTML = `<div class="cw-box"><h3>החלפת דמות</h3><div class="cw-row">${PROTAGONISTS.map((P, i) => {
      const d = this.data[P.id], me = P.id === this.active, where = WG.districtAt(d.x, d.z) || '';
      return `<button type="button" class="cw-card${me ? ' me' : ''}" data-char="${P.id}" ${me ? 'disabled' : ''}><img src="${this.pics?.[P.id] || ''}" alt=""><b>${P.name}</b><small>${P.role}</small><em>${fmt(d.money)} · ❤ ${Math.round(d.health)}</em>${where ? `<i>📍 ${where}</i>` : ''}<kbd>${i + 1}</kbd>${me ? '<span>משחק עכשיו</span>' : ''}</button>`;
    }).join('')}</div>${block ? `<p class="cw-block">${block}</p>` : ''}<button type="button" class="cw-close" data-char="close">סגור</button></div>`;
    this.wheel.classList.add('show'); this.wheelOpen = true;
    g.state = 'charwheel';
  }
  close() { this.wheel.classList.remove('show'); this.wheelOpen = false; const g = this.game; if (g.state === 'charwheel') { g.state = 'playing'; g.input.endFrame(); g.clock.getDelta(); } }
  pick(id) {
    if (id === this.active || !BY_ID[id]) return;
    const block = this.why(); if (block) { this.game.toast(block, 2.5); return; }
    if (this.game.state !== 'playing' && this.game.state !== 'charwheel') return;
    this.close(); this.switchTo(id);
  }
  // keys 1-3 while the wheel is open
  wheelFrame() {
    const I = this.game.input;
    I.poll();
    for (let i = 0; i < 3; i++) if (I.wasPressed('char' + (i + 1))) { I.endFrame(); this.pick(PROTAGONISTS[i].id); return; }
    if (I.wasPressed('pause') || I.wasPressed('switch')) { this.close(); I.endFrame(); return; }
    I.endFrame();
  }
  // portraits rendered from the real 3D characters (once, and again when someone's look changes)
  _portraits() {
    const key = PROTAGONISTS.map((P) => JSON.stringify(this.data[P.id].app)).join('|');
    if (this.pics && this._picKey === key) return;
    this._picKey = key; this.pics = {};
    try {
      const W = 220, H = 260, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3028, 1.6));
      const key1 = new THREE.DirectionalLight(0xfff1dc, 2.6); key1.position.set(1.2, 2.4, 2.2); sc.add(key1);
      const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4); rim.position.set(-2, 2, -1.5); sc.add(rim);
      const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 20);
      for (const P of PROTAGONISTS) {
        const m = new CharacterModel(this.data[P.id].app); sc.add(m.root);
        m.animate(0.016, { speed: 0, grounded: true, mode: 'foot' });
        const h = m.body.scale.y;
        cam.position.set(0.55, 1.5 * h, 2.3); cam.lookAt(0, 1.38 * h, 0);
        r.render(sc, cam); this.pics[P.id] = cv.toDataURL('image/png');
        sc.remove(m.root); m.root.traverse((o) => { o.geometry?.dispose(); });
      }
      r.dispose(); r.forceContextLoss?.();
    } catch { /* no second context available: cards still work without pictures */ }
  }

  // ------------------------------------------------------------------ switch: up, across, down
  switchTo(id) {
    const g = this.game, p = g.player;
    this.snapshot();
    if (p.state === 'driving' && p.vehicle) {   // leave the car where it is
      const v = p.vehicle; v.speed = 0; v.vx = v.vz = 0; v.driver = null;
      p._detach?.(); p.vehicle = null; p.state = 'foot'; p.object.visible = true; p.object.rotation.set(0, p.facing, 0, 'XYZ');
    }
    const cam = g.camera, from = this.data[this.active], to = this.data[id];
    this.sw = { id, t: 0, applied: false, c0: cam.position.clone(), from: new THREE.Vector3(from.x, 0, from.z), to: new THREE.Vector3(to.x, 0, to.z), h: Math.min(320, 140 + Math.hypot(to.x - from.x, to.z - from.z) * 0.12) };
    g.state = 'switching';
    document.body.classList.add('switching');
    g.audio.mech?.('draw');
  }
  frame(dt) {
    const g = this.game, s = this.sw, cam = g.camera;
    if (!s) { g.state = 'playing'; return; }
    s.t += dt;
    const UP = 1.0, PAN = 1.0, DOWN = 1.1, t = s.t, ease = (k) => k * k * (3 - 2 * k);
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    if (t < UP) {
      const k = ease(t / UP);
      pos.set(THREE.MathUtils.lerp(s.c0.x, s.from.x, k), THREE.MathUtils.lerp(s.c0.y, s.h, k), THREE.MathUtils.lerp(s.c0.z, s.from.z, k) + 0.01);
      look.set(s.from.x, 0, s.from.z);
    } else if (t < UP + PAN) {
      const k = ease((t - UP) / PAN);
      pos.lerpVectors(s.from, s.to, k).setY(s.h); pos.z += 0.01; look.copy(pos).setY(0);
      if (k > 0.5 && !s.applied) { s.applied = true; this._apply(s.id); g.audio.mech?.('in'); }
    } else if (t < UP + PAN + DOWN) {
      if (!s.applied) { s.applied = true; this._apply(s.id); }
      const k = ease((t - UP - PAN) / DOWN), P = g.player, f = P.facing;
      const end = new THREE.Vector3(P.x - Math.sin(f) * 4.5, P.y + 2.2, P.z - Math.cos(f) * 4.5);
      pos.set(THREE.MathUtils.lerp(s.to.x, end.x, k), THREE.MathUtils.lerp(s.h, end.y, k), THREE.MathUtils.lerp(s.to.z + 0.01, end.z, k));
      look.set(P.x, THREE.MathUtils.lerp(0, P.y + 1.3, k), P.z);
    } else {
      this.sw = null; document.body.classList.remove('switching');
      g.state = 'playing'; g.input.endFrame(); g.clock.getDelta();
      this.flash.classList.remove('on'); void this.flash.offsetWidth; this.flash.classList.add('on');
      g.toast(`עכשיו אתה ${this.current.name}`, 2);
      g.save();
      return;
    }
    cam.position.copy(pos); cam.lookAt(look);
    g.chunks.update(pos.x, pos.z);
    g.env.update(new THREE.Vector3(pos.x, 0, pos.z), dt, cam);
    g.player.model.animate(dt, { speed: 0, grounded: true, mode: 'foot' });
    g.player.object.position.set(g.player.x, g.player.y, g.player.z);
  }
}
