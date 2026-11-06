// Police and wanted level (0-5 stars). Crimes seen by police (or loud ones anywhere) raise the level; patrol cars
// with sirens chase you, officers get out and try to arrest you; from 3 stars they also shoot (game damage, no gore).
// Stay out of their sight long enough and they lose you. Busted -> the police station; wasted -> the hospital.
import * as THREE from 'three';
import { Vehicle } from '../vehicles/vehicle.js';
import { heightAt } from '../world/terrain.js';

export const POLICE_STATION = { x: 750, z: 112, name: 'תחנת משטרה' };
export const HOSPITAL = { x: 150, z: 212, name: 'בית חולים' };

export class Police {
  constructor(game) {
    this.game = game;
    this.level = 0; this.heat = 0;
    this.unseen = 0;                 // seconds without any officer seeing you
    this.cars = [];                  // pursuit cars
    this.arrestT = 0; this.shootT = 0; this.spawnT = 0;
    this.hud = document.getElementById('wanted');
  }
  get active() { return this.level > 0; }

  // report a crime at (x,z). sev: how many stars it is worth when seen; loud crimes are noticed anywhere
  crime(kind, x, z) {
    const SEV = { punch: 0.6, assault: 1, kill: 2, gunfire: 1, carjack: 1, explosion: 2, copHit: 2, cannon: 3, missile: 3, wreck: 1 };
    const LOUD = { kill: 1, gunfire: 1, explosion: 1, cannon: 1, missile: 1 };
    const sev = SEV[kind] || 1;
    const seen = this._copNear(x, z, 70) || (LOUD[kind] && Math.random() < 0.7) || this.level > 0;
    if (!seen) { this.heat += sev * 0.35; if (this.heat < 1) return; }
    this.heat = 0;
    const before = this.level;
    this.level = Math.min(5, Math.max(this.level, 1) + (this.level > 0 ? sev * 0.5 : sev - 1));
    this.level = Math.round(this.level * 2) / 2;
    if (Math.floor(this.level) > Math.floor(before)) this.game.toast(`${'★'.repeat(Math.floor(this.level))} המשטרה מחפשת אותך!`, 2.5);
    this.unseen = 0; this.lastKnown = { x, z };
  }
  _copNear(x, z, r) {
    for (const c of this.cars) if (!c.removed && Math.hypot(c.x - x, c.z - z) < r) return true;
    for (const v of this.game.traffic.cars) if (v.T.police && Math.hypot(v.x - x, v.z - z) < r) return true;
    for (const p of this.game.peds.peds) if (p.app.cop && Math.hypot(p.x - x, p.z - z) < r) return true;
    return false;
  }

  clear(msg) {
    this.level = 0; this.heat = 0; this.unseen = 0; this.arrestT = 0; this.lastKnown = null;
    for (const c of this.cars) this._remove(c);
    this.cars = [];
    for (const p of this.game.peds.peds) if (p.app.cop && p.copChase) { p.copChase = false; p.state = 'flee'; p.timer = 1; p.fleeFrom = [p.x + 1, p.z]; }
    if (msg) this.game.toast(msg, 3);
  }
  _remove(c) { c.removed = true; this.game.scene.remove(c.object); }

  update(dt, ctx) {
    const g = this.game, P = g.player, pos = g.playerPos(), stars = Math.floor(this.level);
    this._hud(stars, dt);
    if (!stars) { if (this.cars.length) this.clear(); return; }
    // ---- spawn pursuit cars behind you, out of sight, on a road
    const want = Math.min(1 + stars, 5);
    // they know where you are while you stay near where you were last seen
    if (!this.lastKnown) this.lastKnown = { x: pos.x, z: pos.z };
    const known = this.unseen < 2 || Math.hypot(pos.x - this.lastKnown.x, pos.z - this.lastKnown.z) < 70;
    this.cars = this.cars.filter((c) => !c.removed);
    this.spawnT -= dt;
    if (this.cars.length < want && this.spawnT <= 0 && known) {
      this.spawnT = 2.5;
      const a = Math.random() * Math.PI * 2, d = 75 + Math.random() * 40;
      const s = g.roadsideSpot(pos.x + Math.cos(a) * d, pos.z + Math.sin(a) * d);
      if (s && Math.hypot(s.x - pos.x, s.z - pos.z) > 55) {
        const v = new Vehicle('police', 0xf5f5f5, s.x, s.z, s.heading, 0);
        v.driver = 'police'; v.siren = true; v.stuck = 0;
        g.scene.add(v.object); this.cars.push(v);
        g.peds.addDriver?.(v);
      }
    }
    // ---- drive towards you (direct pursuit with physics: they crash into things too)
    let seen = false;
    for (const c of this.cars) {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz);
      if (d > 320) { this._remove(c); continue; }
      if (d < 90) seen = true;
      let e = Math.atan2(dx, dz) - c.heading; e = Math.atan2(Math.sin(e), Math.cos(e));
      const close = d < 14;
      const ctl = { throttle: close ? (Math.abs(c.speed) > 2 ? -1 : 0) : Math.abs(e) > 1.4 ? 0.4 : 1, steer: Math.max(-1, Math.min(1, -e * 2.2)), handbrake: false };
      if (c.wrecked) { ctl.throttle = 0; c.siren = false; }
      c.update(dt, ctl, g.statics, ctx.vehicles);
      // stuck against something: back up, and if still stuck far from view, quietly respawn
      c.stuck = Math.abs(c.speed) < 1 && !close ? c.stuck + dt : 0;
      if (c.stuck > 2.5 && c.stuck < 4) c.update(dt, { throttle: -1, steer: -ctl.steer }, g.statics, ctx.vehicles);
      if (c.stuck > 8 && d > 60) this._remove(c);
      // not gaining on you (blocked by buildings / wrong street): reappear on a road closer behind you
      if (c.best === undefined || d < c.best - 5) { c.best = d; c.prog = 0; } else c.prog += dt;
      if (c.prog > 5 && d > 45 && !c.wrecked && known) {
        const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 25;
        const s = g.roadsideSpot(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r);
        if (s && Math.hypot(s.x - pos.x, s.z - pos.z) > 30) { c.x = s.x; c.z = s.z; c.heading = Math.atan2(pos.x - s.x, pos.z - s.z); c.speed = 0; c.vx = 0; c.vz = 0; c.object.position.set(c.x, c.y || 0, c.z); }
        c.best = undefined;
      }
      // officers get out when the car is next to you and you are on foot
      if (d < 26 && (close || c.prog > 2 || Math.abs(c.speed) < 2) && P.state === 'foot' && !c.deployed && !c.wrecked) { c.deployed = true; g.peds.addCop?.(c.x + 2, c.z, true); }
    }
    for (const p of g.peds.peds) if (p.app.cop && p.copChase && Math.hypot(p.x - pos.x, p.z - pos.z) < 60) seen = true;
    // ---- arrest: an officer (or a police car blocking you while you are stopped) next to you for a moment
    const slow = P.state === 'foot' || (P.state === 'driving' && Math.abs(P.vehicle.speed) < 1.5);
    let grab = false;
    for (const p of g.peds.peds) if (p.app.cop && p.copChase && p.state !== 'dead' && p.state !== 'down' && Math.hypot(p.x - pos.x, p.z - pos.z) < 1.8) grab = true;
    if (!grab && P.state === 'driving') for (const c of this.cars) if (Math.hypot(c.x - pos.x, c.z - pos.z) < 7) grab = slow;
    this.arrestT = grab && slow && stars <= 3 ? this.arrestT + dt : Math.max(0, this.arrestT - dt * 2);
    if (this.arrestT > 2.2) return this.busted();
    // ---- from 3 stars the police open fire (fictional, game damage only)
    this.shootT -= dt;
    if (stars >= 3 && seen && this.shootT <= 0) {
      this.shootT = 1.6 - stars * 0.15;
      const shooter = this.cars.find((c) => Math.hypot(c.x - pos.x, c.z - pos.z) < 45) || g.peds.peds.find((p) => p.app.cop && p.copChase && Math.hypot(p.x - pos.x, p.z - pos.z) < 35);
      if (shooter) {
        const from = new THREE.Vector3(shooter.x, (shooter.y || 0) + 1.4, shooter.z), to = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2, pos.y + 1.2, pos.z + (Math.random() - 0.5) * 2);
        g.weapons._tracer(from, to, 0xffd9a0); g.audio.gunshot?.('pistol');
        if (Math.random() < 0.45) g.hurt(P.state === 'driving' ? 3 : 6, 'משטרה');
      }
    }
    // ---- escaping: out of sight long enough -> stars blink, then they lose you
    this.unseen = seen ? 0 : this.unseen + dt;
    if (seen) this.lastKnown = { x: pos.x, z: pos.z };
    if (this.unseen > 10 + stars * 4) this.clear('איבדו אותך! המשטרה הפסיקה לחפש.');
  }

  busted() {
    const g = this.game, fine = Math.min(g.econ.money, 500 + Math.floor(this.level) * 400);
    g.econ.pay(fine, 'קנס משטרה');
    this.clear();
    g.respawnAt(POLICE_STATION, `נעצרת! שילמת קנס של ₪${fine.toLocaleString('he-IL')} ושוחררת מתחנת המשטרה.`);
  }

  _hud(stars, dt) {
    if (!this.hud) return;
    const half = this.level - stars >= 0.5;
    const html = stars || half ? '★'.repeat(stars) + (half ? '<i>★</i>' : '') + '<s>' + '★'.repeat(5 - stars - (half ? 1 : 0)) + '</s>' : '';
    if (this.hud.dataset.h !== html) { this.hud.innerHTML = html; this.hud.dataset.h = html; }
    this.hud.classList.toggle('blink', stars > 0 && this.unseen > 2);
  }
}
