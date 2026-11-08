// Flight assistance for the planes (airliner + fighter):
//  * stability mode (on by default): wings level by themselves, altitude is held when you let go, the plane won't
//    stall (it adds power and lowers the nose) and pulls up if you dive at the ground — hard to lose control
//  * assisted take-off: taxis to the runway if needed, lines up, full power, rotates and climbs to a safe height
//  * assisted landing: picks the nearest runway, flies to the final approach, follows a 3° glide path, slows down
//    gradually, flares and brakes to a stop on the centre line
//  * flight HUD (speed, altitude, climb, engine, runway guide), an on-screen runway marker and green approach gates
//  * flight school: take off, fly through 4 rings over the sea and land
import * as THREE from 'three';
import { Vehicle } from '../vehicles/vehicle.js';
import { heightAt } from '../world/terrain.js';
import { clamp, damp } from '../core/mathx.js';

export const RUNWAYS = [
  { id: 'air', name: 'מסלול נמל התעופה', x0: -960, x1: -60, z: 790, w: 56, side: 1 },
  { id: 'base', name: 'מסלול הבסיס הצבאי', x0: -920, x1: -80, z: -720, w: 40, side: -1 },
];
const GLIDE = 0.056;                 // ~3.2° glide path
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3();

export class Flight {
  constructor(game) {
    this.game = game;
    this.stab = true;
    this.auto = null;            // null | { mode: 'takeoff' | 'land', ... }
    this.train = null;
    this.warn = ''; this.warnT = 0;
    this._buildHud();
    this._buildGates();
    this._buildRings();
  }

  // ------------------------------------------------------------------ runway geometry
  // landing direction s: +1 = towards +x (heading +90°), -1 = towards -x. Touchdown zone 150 m past the threshold.
  _rw(r, s) {
    const thr = s > 0 ? r.x0 : r.x1, td = thr + s * 150;
    return { r, s, thr, td, heading: s > 0 ? Math.PI / 2 : -Math.PI / 2, ground: heightAt(td, r.z, 2) };
  }
  // along: metres past the touchdown point (negative = still before it); cross: metres off the centre line
  _rel(rw, x, z) { return { along: (x - rw.td) * rw.s, cross: (z - rw.r.z) }; }
  nearestRunway(x, z) {
    let best = null, bd = Infinity;
    for (const r of RUNWAYS) { const d = Math.hypot(clamp(x, r.x0, r.x1) - x, r.z - z); if (d < bd) { bd = d; best = r; } }
    return { r: best, d: bd };
  }
  onRunway(v) { for (const r of RUNWAYS) if (v.x > r.x0 - 10 && v.x < r.x1 + 10 && Math.abs(v.z - r.z) < r.w / 2) return r; return null; }
  // which runway / direction to land on: the side of the runway you are on decides the direction
  _pickLanding(v) {
    const { r } = this.nearestRunway(v.x, v.z);
    const mid = (r.x0 + r.x1) / 2;
    return this._rw(r, v.x < mid ? 1 : -1);
  }

  // ------------------------------------------------------------------ player buttons
  toggleStab() { this.stab = !this.stab; this.game.toast(this.stab ? 'מצב טיסה יציב: פועל — המטוס מתאזן לבד' : 'מצב טיסה יציב: כבוי — שליטה מלאה', 2.2); }
  toggleAssist(v) {
    if (this.auto) { this.auto = null; v.autoTaxi = false; v.forceAirbrake = false; this.game.toast('הטייס האוטומטי כובה — השליטה שלך', 2); return; }
    const ground = heightAt(v.x, v.z, v.y + 0.5), onGround = v.y <= ground + 0.3;
    if (onGround) {
      const { r, d } = this.nearestRunway(v.x, v.z);
      if (d > 700) { this.game.toast('אין מסלול המראה קרוב. אפשר להמריא ידנית: גז ומשיכה למעלה מעל 210 קמ״ש', 3.5); return; }
      // take off in the direction with the most runway ahead
      const s = Math.abs(v.x - r.x0) < Math.abs(v.x - r.x1) ? 1 : -1;
      const start = s > 0 ? r.x0 + 45 : r.x1 - 45;
      const on = this.onRunway(v) === r;
      this.auto = { mode: 'takeoff', r, s, start, phase: on ? 'line' : 'taxi', heading: s > 0 ? Math.PI / 2 : -Math.PI / 2 };
      this.game.toast(on ? 'המראה אוטומטית: מתיישרים על המסלול ומגבירים מנוע' : 'המראה אוטומטית: נוסעים למסלול ההמראה', 3);
    } else {
      const rw = this._pickLanding(v);
      this.auto = { mode: 'land', rw, phase: 'approach' };
      this.game.toast(`נחיתה מסייעת: ${rw.r.name}. המטוס יתיישר עם המסלול ויאט בהדרגה`, 3.5);
    }
  }

  // ------------------------------------------------------------------ called every frame before the plane's physics
  control(v, ctl, dt, input) {
    const T = v.T, ag = T.agility || 1;
    const ground = Math.max(heightAt(v.x, v.z, v.y + 0.5), -1);
    const agl = v.y - ground, onGround = agl < 0.3;
    const STALL = 46, ROTATE = 58;
    const rollMax = 0.62 + (ag - 1) * 0.35;
    // the player takes over: strong stick input cancels the autopilot in the air
    const stick = Math.abs(ctl.steer || 0) > 0.6 || Math.abs(ctl.lift || 0) > 0.6;
    if (this.auto && !onGround && stick && this.auto.phase !== 'climb' && !(this.auto.mode === 'land' && agl < 20)) {
      this.auto = null; v.forceAirbrake = false; this.game.toast('הטייס האוטומטי כובה — השליטה שלך', 1.8);
    }
    if (this.auto && onGround && this.auto.mode === 'takeoff' && ctl.throttle < -0.5) { this.auto = null; v.autoTaxi = false; this.game.toast('ההמראה בוטלה', 1.5); }
    v.forceAirbrake = false;
    const pt = -v.pitch, sp = v.speed;
    const steerFor = (hd) => { const e = wrap(hd - v.heading); return clamp(-e * 1.4 / rollMax, -1, 1); };          // air: bank towards a heading
    const wheelFor = (hd) => { const e = wrap(hd - v.heading); return clamp(-e * 3, -1, 1); };                       // ground: nose wheel
    const pitchFor = (vy) => { const want = Math.asin(clamp(vy / Math.max(sp, 30), -0.28, 0.25)); return clamp((want - pt) * 6, -1, 1); };
    const A = this.auto;

    if (A?.mode === 'takeoff') {
      const r = A.r, rz = r.z;
      ctl.throttle = 0;
      if (A.phase === 'taxi') {
        // drive to the start of the runway at taxi speed
        const tx = A.start, tz = rz, d = Math.hypot(tx - v.x, tz - v.z);
        const hd = d > 25 ? Math.atan2(tx - v.x, tz - v.z) : A.heading;
        v.autoTaxi = true; v.throttleSet = 0;
        v.speed = damp(v.speed, d > 40 ? 11 : 4, 1.2, dt);
        ctl.steer = wheelFor(hd);
        if (d < 22) A.phase = 'line';
      } else if (A.phase === 'line') {
        v.autoTaxi = true; v.throttleSet = 0;
        v.speed = damp(v.speed, 3, 2, dt);
        ctl.steer = wheelFor(A.heading + clamp((rz - v.z) * A.s * 0.03, -0.3, 0.3));
        if (Math.abs(wrap(A.heading - v.heading)) < 0.06) { A.phase = 'roll'; v.autoTaxi = false; }
      } else if (A.phase === 'roll') {
        v.throttleSet = Math.min(1, (v.throttleSet || 0) + dt * 0.8);
        ctl.steer = wheelFor(A.heading - clamp((v.z - rz) * 0.02, -0.15, 0.15) * A.s);
        if (sp > ROTATE * 0.95) ctl.lift = 1;
        if (!onGround && agl > 3) A.phase = 'climb';
      } else if (A.phase === 'climb') {
        v.throttleSet = 1;
        ctl.steer = steerFor(A.heading); ctl.lift = pitchFor(9 * ag);
        if (agl > 150) { this.auto = null; v.throttleSet = 0.72; this.game.toast('המראה הושלמה! המטוס בטיסה יציבה — אפשר לפנות ולטפס בעצמך', 3); }
      }
      return;
    }

    if (A?.mode === 'land') {
      const rw = A.rw, { along, cross } = this._rel(rw, v.x, v.z);
      const fighter = !!T.fighter, vApp = fighter ? 80 : 72, vRef = fighter ? 70 : 63;
      const dist = -along;                                      // metres to the touchdown point
      ctl.throttle = 0;
      if (onGround) {
        // roll-out: idle, brakes, keep the centre line
        v.throttleSet = 0; ctl.throttle = -1; ctl.lift = 0;
        ctl.steer = wheelFor(rw.heading - clamp(cross * 0.02, -0.2, 0.2) * rw.s);
        if (Math.abs(v.speed) < 1.5) { this.auto = null; ctl.throttle = 0; v.speed = 0; this._landed(v, rw); }
        return;
      }
      // re-route through the final-approach fix if we are badly placed for this runway
      const hdErr = Math.abs(wrap(rw.heading - v.heading));
      const lined = dist > 900 && Math.abs(cross) < Math.max(80, dist * 0.18) && hdErr < 0.7;
      if (A.phase === 'approach' && lined) A.phase = 'final';
      if (A.phase === 'final' && dist < 600 && (Math.abs(cross) > 70 || agl > 90 || hdErr > 0.6)) { A.phase = 'approach'; this.game.toast('לא מיושרים — מסתובבים לניסיון נוסף', 2.5); }
      let hd, altT, vT;
      if (A.phase === 'approach') {
        // fly to a point 3.6 km before touchdown, on the extended centre line
        const fx = rw.td - rw.s * 3600, fz = rw.r.z;
        hd = Math.atan2(fx - v.x, fz - v.z); altT = rw.ground + 210; vT = vApp + 12;
        if (Math.hypot(fx - v.x, fz - v.z) < 600) A.phase = 'final';
      } else {
        // final: aim at a point on the centre line ahead (smooth intercept), follow the glide path down
        const aimAlong = Math.min(along + 750, 0);
        const ax = rw.td + aimAlong * rw.s, az = rw.r.z;
        hd = dist > 120 ? Math.atan2(ax - v.x, az - v.z) : rw.heading;
        altT = rw.ground + Math.max(0, dist) * GLIDE;
        vT = agl > 60 ? vApp : vRef + (vApp - vRef) * clamp(agl / 60, 0, 1);
      }
      let vy = clamp((altT - v.y) * 0.3, -11, 9) + (A.phase === 'final' && dist > 0 ? -sp * GLIDE : 0);
      if (A.phase === 'final' && agl < 14) { vy = -0.9 - agl * 0.12; hd = rw.heading - clamp(cross * 0.01, -0.1, 0.1) * rw.s; }   // flare
      ctl.steer = steerFor(hd); ctl.lift = pitchFor(vy);
      if (A.phase === 'final' && agl < 14) ctl.steer = clamp(ctl.steer, -0.3, 0.3);
      v.throttleSet = damp(v.throttleSet || 0, A.phase === 'final' && agl < 8 ? 0 : clamp(0.42 + (vT - sp) * 0.07, 0.05, 1), 2.5, dt);
      if (sp > vT + 7) v.forceAirbrake = true;
      return;
    }

    // ---- stability mode (manual flying with a safety net)
    if (!this.stab || onGround) return;
    ctl.steer = clamp(ctl.steer || 0, -0.85, 0.85);                             // no extreme banks
    const approach = agl < 60 && (v.throttleSet || 0) < 0.45;                   // you are landing by hand
    if (Math.abs(ctl.lift || 0) < 0.1 && !approach) ctl.lift = clamp(-v.vy * 0.12 - pt * 1.6, -0.6, 0.6);   // hold altitude
    if (sp < STALL + 12 && agl > 5) {                                            // stall protection
      v.throttleSet = Math.max(v.throttleSet || 0, 0.9); ctl.lift = Math.min(ctl.lift || 0, -0.2);
      this._warn('מהירות נמוכה — מוסיף כוח ומוריד את האף');
    }
    if (agl < 40 && v.vy < -7 && !approach) { ctl.lift = 1; this._warn('קרוב לקרקע — מושך למעלה!'); }
  }
  _warn(t) { this.warn = t; this.warnT = 1.5; }

  _landed(v, rw) {
    this.game.toast('נחיתה מוצלחת! המטוס עצר על המסלול', 3);
    if (this.train && this.train.step === this.train.rings.length + 1) this._trainDone();
  }

  // ------------------------------------------------------------------ flight school
  startTraining(kind) {
    const g = this.game, P = g.player;
    if (this.train) this.stopTraining(true);
    const r = kind === 'fighter' ? RUNWAYS[1] : RUNWAYS[0];
    // leave whatever you are in, then sit in a fresh training plane at the east end of the runway (facing west, over the sea)
    g.respawnAt({ x: r.x1 - 60, z: r.z + 40 }, '');
    const v = new Vehicle(kind, kind === 'fighter' ? 0x7d8790 : 0, r.x1 - 45, r.z, -Math.PI / 2, 0);
    v.training = true;
    g.scene.add(v.object); g.vehicles.adopt(v); v.sync();
    P.state = 'driving'; P.vehicle = v; P.ignoreVehicle = v; P.seq = null; v.driver = 'player'; P._attach(v);
    // circuit over the sea west of the runway, ending on a long final approach (landing towards +x)
    const sd = r.side, z = r.z;
    const rings = [[-1700, z, 110], [-2450, z + sd * 380, 170], [-3350, z + sd * 260, 170], [-3300, z, 140]].map(([x, zz, y]) => ({ x, z: zz, y: heightAt(x, zz, 2) + y }));
    this.train = { kind, r, v, rings, step: 0, t: 0 };
    if (r.id === 'air') g.airport.runway = this.train;      // airport traffic holds while you train
    this.stab = true;
    this._ringMeshes(rings);
    g.toast('ברוך הבא לבית הספר לטיסה! עקוב אחרי ההוראות למעלה', 3.5);
    g.save?.();
  }
  stopTraining(silent) {
    if (!this.train) return;
    if (this.game.airport.runway === this.train) this.game.airport.runway = null;
    this.train = null; this.ringGroup.visible = false; this.trainEl.classList.remove('show');
    if (!silent) this.game.toast('האימון הופסק', 1.8);
  }
  _trainDone() {
    const g = this.game, first = !g.econ.flightSchool;
    g.econ.flightSchool = (g.econ.flightSchool || 0) + 1;
    const pay = first ? 1000 : 250;
    g.econ.earn(pay, 'בית ספר לטיסה');
    g.toast(`🎓 סיימת את אימון הטיסה! קיבלת ₪${pay}${first ? ' ותעודת טייס' : ''}`, 4);
    this.stopTraining(true); g.save?.();
  }
  _trainUpdate(dt) {
    const T = this.train, g = this.game, P = g.player, v = T.v;
    if (P.vehicle !== v) { this.stopTraining(); return; }
    const agl = v.y - heightAt(v.x, v.z, v.y + 0.5), n = T.rings.length;
    if (T.step === 0 && agl > 40) { T.step = 1; g.audio.coin?.(); }
    if (T.step >= 1 && T.step <= n) {
      const R = T.rings[T.step - 1];
      if (Math.hypot(v.x - R.x, v.y - R.y, v.z - R.z) < 30) { T.step++; g.audio.coin?.(); g.toast(T.step <= n ? `טבעת ${T.step - 1} מתוך ${n} ✔` : 'כל הטבעות ✔ — עכשיו נחת על המסלול', 2); }
    }
    this.ringMeshes.forEach((m, i) => { m.visible = i >= T.step - 1 || T.step === 0; m.material = i === T.step - 1 ? this.ringOn : this.ringOff; m.rotation.z += dt * 0.4; });
    const steps = ['המראה: לחץ "המראה" או הגבר מנוע ומשוך למעלה', ...T.rings.map((_, i) => `עבור דרך טבעת ${i + 1} (הצהובה המהבהבת)`), 'נחיתה על המסלול — לחץ "נחיתה" או נחת לפי השערים הירוקים'];
    const html = '<b>🎓 בית ספר לטיסה</b>' + steps.map((s, i) => `<div class="${i < T.step ? 'done' : i === T.step ? 'cur' : ''}">${i < T.step ? '✔' : i === T.step ? '▶' : '•'} ${s}</div>`).join('');
    if (this.trainEl.dataset.h !== html) { this.trainEl.innerHTML = html; this.trainEl.dataset.h = html; }
    this.trainEl.classList.add('show');
  }

  // ------------------------------------------------------------------ visuals
  _buildGates() {
    // green frames along the glide path into the runway you are heading for
    const g = new THREE.Group(); g.visible = false;
    const mat = new THREE.MeshBasicMaterial({ color: 0x4cff8a, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
    const frame = (w, h, t) => {
      const parts = new THREE.Group();
      const bar = (bw, bh, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.6), mat); m.position.set(x, y, 0); parts.add(m); };
      bar(w, t, 0, h / 2); bar(w, t, 0, -h / 2); bar(t, h, -w / 2, 0); bar(t, h, w / 2, 0);
      return parts;
    };
    this.gates = [];
    for (let i = 0; i < 8; i++) { const f = frame(70, 44, 2.2); g.add(f); this.gates.push(f); }
    // arrows on the runway threshold
    this.gateGroup = g; this.game.scene.add(g);
  }
  _placeGates(rw) {
    this.gates.forEach((f, i) => {
      const dist = 400 + i * 420, x = rw.td - rw.s * dist;
      f.position.set(x, rw.ground + dist * GLIDE + 6, rw.r.z); f.rotation.set(0, rw.heading, 0);
    });
  }
  _buildRings() {
    this.ringGroup = new THREE.Group(); this.ringGroup.visible = false; this.game.scene.add(this.ringGroup);
    this.ringOn = new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false });
    this.ringOff = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.3, toneMapped: false });
    this.ringGeo = new THREE.TorusGeometry(24, 1.6, 8, 40);
    this.ringMeshes = [];
  }
  _ringMeshes(rings) {
    this.ringMeshes.forEach((m) => this.ringGroup.remove(m)); this.ringMeshes = [];
    rings.forEach((R, i) => {
      const m = new THREE.Mesh(this.ringGeo, this.ringOff); m.position.set(R.x, R.y, R.z);
      const nx = rings[i + 1] || { x: R.x + 500, z: R.z }, px = rings[i - 1] || { x: R.x + 500, z: R.z };
      m.rotation.y = Math.atan2(nx.x - px.x, nx.z - px.z);
      this.ringGroup.add(m); this.ringMeshes.push(m);
    });
    this.ringGroup.visible = true;
  }
  _cockpit(v) {
    // simple cockpit around the eye point: dashboard with glowing displays and the window frame
    if (v.cockpit) return v.cockpit;
    const g = new THREE.Group(), fighter = !!v.T.fighter;
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.7 }), frameM = new THREE.MeshStandardMaterial({ color: fighter ? 0x3a4148 : 0xd9dde2, roughness: 0.6 });
    const scr = new THREE.MeshBasicMaterial({ color: 0x3fd6ff, toneMapped: false }), scr2 = new THREE.MeshBasicMaterial({ color: 0x5dff9a, toneMapped: false });
    const add = (geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); g.add(o); return o; };
    const W = fighter ? 1.0 : 2.4;
    // glare shield + dashboard low in front, small glowing displays, thin window frame out at the sides
    add(new THREE.BoxGeometry(W, 0.06, 0.45), dark, 0, -0.5, 1.15);                               // glare shield
    add(new THREE.BoxGeometry(W, 0.4, 0.08), dark, 0, -0.72, 1.32);                               // panel face
    const nd = fighter ? 2 : 4;
    for (let i = 0; i < nd; i++) add(new THREE.PlaneGeometry(0.17, 0.12), i % 2 ? scr2 : scr, (i - (nd - 1) / 2) * 0.3, -0.64, 1.27).rotation.set(0, Math.PI, 0);   // displays face the pilot
    if (!fighter) {
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.85, 0.04), frameM, sx * W / 2, -0.05, 1.25, 0, sx * -0.4);   // side pillars
      add(new THREE.BoxGeometry(0.03, 0.75, 0.03), frameM, 0, -0.1, 1.38);                       // centre post
      add(new THREE.BoxGeometry(W, 0.05, 0.05), frameM, 0, 0.36, 1.18);                          // top of the windshield
    } else {
      add(new THREE.BoxGeometry(0.16, 0.12, 0.01), new THREE.MeshBasicMaterial({ color: 0x5dff9a, transparent: true, opacity: 0.3, toneMapped: false }), 0, -0.3, 1.05);   // HUD glass
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.03, 1.2), frameM, sx * 0.42, 0.18, 0.7);   // canopy rails
    }
    g.visible = false;                                     // built around the eye point, nose = +z
    g.position.copy(v.parts.seat).add(new THREE.Vector3(0, fighter ? 0.78 : 1.05, 0.15));
    (v.parts.body || v.object).add(g);
    return (v.cockpit = g);
  }
  eye(v, out) {
    const fighter = !!v.T.fighter;
    return out.copy(v.parts.seat).add(_v.set(0, fighter ? 0.78 : 1.05, 0.15)).applyMatrix4((v.parts.body || v.object).matrixWorld);
  }

  _buildHud() {
    const el = document.createElement('div'); el.id = 'flightHud';
    el.innerHTML = `<div class="fh-row"><div class="fh-box"><b id="fhSpd">0</b><small>קמ״ש</small></div><div class="fh-box"><b id="fhAlt">0</b><small>גובה מ׳</small></div><div class="fh-box"><b id="fhVs">0</b><small>טיפוס מ׳/ש</small></div></div>
      <div class="fh-thr"><i id="fhThr"></i><span>מנוע</span></div>
      <div id="fhMode"></div><div id="fhWarn"></div><div id="fhKeys">O = המראה / נחיתה אוטומטית · V = מצב יציב · C = מצלמת תא טייס · W/S = מהירות · A/D = פנייה · רווח/Q = טפס/רד</div>
      <div id="fhGuide"><div id="fhRw"></div><div class="fh-loc"><i id="fhLoc"></i></div><div class="fh-gs"><i id="fhGs"></i></div><div id="fhHint"></div></div>`;
    document.getElementById('hud').appendChild(el);
    this.hud = el;
    const mk = document.createElement('div'); mk.id = 'rwMarker'; mk.innerHTML = '<span>⬇</span><em></em>';
    document.getElementById('hud').appendChild(mk); this.marker = mk;
    const tr = document.createElement('div'); tr.id = 'trainHud'; document.getElementById('hud').appendChild(tr); this.trainEl = tr;
    this.$ = (id) => el.querySelector('#' + id);
  }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    const g = this.game, P = g.player, v = P.state === 'driving' && P.vehicle?.isPlane ? P.vehicle : null;
    if (this.warnT > 0) this.warnT -= dt;
    if (this.train) this._trainUpdate(dt);
    this.hud.classList.toggle('show', !!v);
    if (!v) { if (this.lastPlane?.parts.jetMesh) this.lastPlane.parts.jetMesh.visible = true; this.marker.style.display = 'none'; this.gateGroup.visible = false; if (this.auto) this.auto = null; return; }
    this.lastPlane = v;
    const ground = heightAt(v.x, v.z, v.y + 0.5), agl = v.y - ground;
    this.$('fhSpd').textContent = Math.round(v.speed * 3.6);
    this.$('fhAlt').textContent = Math.round(Math.max(0, agl));
    const vs = Math.round(v.vy || 0); this.$('fhVs').textContent = (vs > 0 ? '▲' : vs < 0 ? '▼' : '') + Math.abs(vs);
    this.$('fhThr').style.height = Math.round((v.throttleSet || 0) * 100) + '%';
    const A = this.auto;
    const mode = A ? (A.mode === 'takeoff' ? ({ taxi: '🛫 טייס אוטומטי: נסיעה למסלול', line: '🛫 מתיישרים על המסלול', roll: '🛫 המראה — מנוע מלא', climb: '🛫 טיפוס לגובה בטוח' }[A.phase]) : (agl < 1 ? '🛬 בלימה על המסלול' : A.phase === 'approach' ? '🛬 טסים לנקודת הגישה' : '🛬 גישה סופית — יורדים במסלול הגלישה')) : this.stab ? '⚖️ מצב יציב פועל' : '✈️ שליטה מלאה';
    this.$('fhMode').textContent = mode;
    this.$('fhWarn').textContent = this.warnT > 0 ? this.warn : '';
    // runway guide: the landing target (or the nearest runway in the direction you would land)
    const rw = A?.mode === 'land' ? A.rw : this._pickLanding(v);
    const { along, cross } = this._rel(rw, v.x, v.z), dist = -along;
    const show = agl > 2 && dist > -200 && dist < 9000;
    this.$('fhGuide').style.display = show ? 'block' : 'none';
    if (show) {
      this.$('fhRw').textContent = `${rw.r.name} · ${dist > 1000 ? (dist / 1000).toFixed(1) + ' ק״מ' : Math.max(0, Math.round(dist)) + ' מ׳'}`;
      // localizer: dot left/right of the centre line (as seen flying towards the runway); glide slope: above/below
      const loc = clamp(-cross * rw.s / Math.max(60, dist * 0.08), -1, 1), gsErr = clamp((v.y - (rw.ground + Math.max(0, dist) * GLIDE)) / Math.max(15, dist * 0.03), -1, 1);
      this.$('fhLoc').style.left = (50 + loc * 45) + '%'; this.$('fhGs').style.top = (50 - gsErr * 45) + '%';
      const hint = Math.abs(gsErr) < 0.25 && Math.abs(loc) < 0.25 ? 'במסלול הגלישה ✔' : (gsErr > 0.25 ? 'גבוה מדי — רד ' : gsErr < -0.25 ? 'נמוך מדי — עלה ' : '') + (loc > 0.25 ? '· פנה שמאלה' : loc < -0.25 ? '· פנה ימינה' : '');
      this.$('fhHint').textContent = hint;
    }
    // gates along the glide path + an on-screen marker at the touchdown point
    this.gateGroup.visible = show && dist > 200;
    if (this.gateGroup.visible) this._placeGates(rw);
    if (show) {
      _v.set(rw.td, rw.ground + 2, rw.r.z).project(g.camera);
      const behind = _v.z > 1;
      let x = (_v.x * 0.5 + 0.5) * innerWidth, y = (-_v.y * 0.5 + 0.5) * innerHeight;
      if (behind) { x = innerWidth - x; y = innerHeight - 40; }
      const m = 50, off = behind || x < m || x > innerWidth - m || y < m || y > innerHeight - m;
      x = clamp(x, m, innerWidth - m); y = clamp(y, m + 40, innerHeight - m);
      this.marker.style.display = 'block';
      this.marker.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      this.marker.classList.toggle('off', off);
      this.marker.querySelector('em').textContent = `מסלול ${dist > 1000 ? (dist / 1000).toFixed(1) + ' ק״מ' : Math.max(0, Math.round(dist)) + ' מ׳'}`;
    } else this.marker.style.display = 'none';
    // cockpit visible only in the cockpit camera
    const ck = this._cockpit(v), inside = g.rig.mode === 'first'; ck.visible = inside;
    if (!v.T.fighter && v.parts.jetMesh) v.parts.jetMesh.visible = !inside;   // airliner: you're inside the hull, show only the cockpit
  }
}
