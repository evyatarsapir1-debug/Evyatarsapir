// Police and wanted level (0-5 stars). Crimes seen by police (or loud ones anywhere) raise the level; patrol cars
// with sirens chase you, officers get out and try to arrest you; from 3 stars they also shoot (game damage, no gore).
// Stay out of their sight long enough and they lose you. Busted -> the police station; wasted -> the hospital.
import * as THREE from 'three';
import { Vehicle } from '../vehicles/vehicle.js';
import { heightAt } from '../world/terrain.js';
import { segmentVsBox } from '../physics/collision.js';

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
    this.unseen = 0; this.lastKnown = { x, z }; this.sinceCrime = 0;
  }
  _copNear(x, z, r) {
    for (const c of this.cars) if (!c.removed && Math.hypot(c.x - x, c.z - z) < r) return true;
    for (const v of this.game.traffic.cars) if (v.T.police && Math.hypot(v.x - x, v.z - z) < r) return true;
    for (const p of this.game.peds.peds) if (p.app.cop && Math.hypot(p.x - x, p.z - z) < r) return true;
    return false;
  }

  clear(msg) {
    this.level = 0; this.heat = 0; this.unseen = 0; this.arrestT = 0; this.lastKnown = null;
    this.gone = this.gone || [];
    for (const c of this.cars) { if (msg && !c.wrecked) { c.siren = false; c.leaveT = 15; this.gone.push(c); } else this._remove(c); }
    this.cars = [];
    for (const p of this.game.peds.peds) if (p.app.cop && p.copChase) { p.copChase = false; p.chaseTo = null; p.state = 'walk'; p.timer = 4; }
    if (msg) this.game.toast(msg, 3);
  }
  _remove(c) { c.removed = true; this.game.scene.remove(c.object); }

  // can someone at (ax,az) see the player at (bx,bz)? buildings block the view
  _los(ax, az, bx, bz, ay = 1.5, by = 1.5) {
    const list = this.game.statics.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), this._q || (this._q = []));
    for (const c of list) if (c.y1 > Math.max(ay, by) + 0.5 && c.y1 - c.y0 > 4 && segmentVsBox(ax, ay, az, bx, by, bz, c, -0.3) < 0.98) return false;
    return true;
  }
  _sees(x, z, y, pos, r) {
    const d = Math.hypot(pos.x - x, pos.z - z);
    return d < 18 || (d < r && this._los(x, z, pos.x, pos.z, (y || 0) + 1.5, pos.y + 1.4));
  }

  update(dt, ctx) {
    const g = this.game, P = g.player, pos = g.playerPos(), stars = Math.floor(this.level);
    this._leaving(dt, ctx, pos);
    this._hud(stars, dt);
    if (!stars) { if (this.cars.length) this.clear(); return; }
    const want = Math.min(1 + stars, 5);
    if (!this.lastKnown) this.lastKnown = { x: pos.x, z: pos.z };
    const hunting = this.unseen === 0;            // they saw you last frame: they know exactly where you are
    this.sinceCrime = (this.sinceCrime ?? 99) + dt;
    // still at the scene (or the crime just happened): more units are sent and blocked cars find a way to you
    const nearSpot = Math.hypot(pos.x - this.lastKnown.x, pos.z - this.lastKnown.z) < 40;
    const informed = hunting || this.sinceCrime < 4 || nearSpot;
    this.cars = this.cars.filter((c) => !c.removed);
    // ---- reinforcements only while they can see you; once you are out of sight no new cars appear
    this.spawnT -= dt;
    if (this.cars.length < want && this.spawnT <= 0 && informed) {
      this.spawnT = 2.5;
      const a = Math.random() * Math.PI * 2, d = 75 + Math.random() * 40;
      const s = g.roadsideSpot(this.lastKnown.x + Math.cos(a) * d, this.lastKnown.z + Math.sin(a) * d);
      if (s && Math.hypot(s.x - pos.x, s.z - pos.z) > 55) {
        const v = new Vehicle('police', 0xf5f5f5, s.x, s.z, s.heading, 0);
        v.driver = 'police'; v.siren = true; v.stuck = 0;
        g.scene.add(v.object); this.cars.push(v);
        g.peds.addDriver?.(v);
      }
    }
    // ---- pursuit: drive at you while they see you; otherwise search around where you were last seen
    let seen = false;
    for (const c of this.cars) {
      const dP = Math.hypot(pos.x - c.x, pos.z - c.z);
      if (dP > 360) { this._remove(c); continue; }
      const sees = !c.wrecked && this._sees(c.x, c.z, c.y, pos, 70);
      if (sees) seen = true;
      let tx = pos.x, tz = pos.z;
      if (!hunting) {
        // search: drive to the last known spot, then cruise around it
        if (!c.search || Math.hypot(c.search.x - c.x, c.search.z - c.z) < 12 || c.searchT <= 0) {
          const a = Math.random() * Math.PI * 2, r = c.search ? 25 + Math.random() * 55 : 0;
          c.search = { x: this.lastKnown.x + Math.cos(a) * r, z: this.lastKnown.z + Math.sin(a) * r }; c.searchT = 9;
        }
        c.searchT -= dt; tx = c.search.x; tz = c.search.z;
      } else c.search = null;
      const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
      let e = Math.atan2(dx, dz) - c.heading; e = Math.atan2(Math.sin(e), Math.cos(e));
      const close = hunting && d < 14;
      const cruise = hunting ? 1 : 0.55;
      const ctl = { throttle: close ? (Math.abs(c.speed) > 2 ? -1 : 0) : (Math.abs(e) > 1.4 ? 0.4 : cruise), steer: Math.max(-1, Math.min(1, -e * 2.2)), handbrake: false };
      if (c.wrecked) { ctl.throttle = 0; c.siren = false; }
      c.update(dt, ctl, g.statics, ctx.vehicles);
      c.stuck = Math.abs(c.speed) < 1 && !close ? c.stuck + dt : 0;
      if (c.stuck > 2.5 && c.stuck < 4) c.update(dt, { throttle: -1, steer: -ctl.steer }, g.statics, ctx.vehicles);
      if (c.stuck > 8 && dP > 60) this._remove(c);
      // blocked by buildings while they can see you: reappear on a road closer (only while hunting)
      if (c.best === undefined || dP < c.best - 5) { c.best = dP; c.prog = 0; } else c.prog += dt;
      if (c.prog > 5 && dP > 45 && !c.wrecked && informed) {
        const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 25;
        const s = g.roadsideSpot(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r);
        if (s && Math.hypot(s.x - pos.x, s.z - pos.z) > 30) { c.x = s.x; c.z = s.z; c.heading = Math.atan2(pos.x - s.x, pos.z - s.z); c.speed = 0; c.vx = 0; c.vz = 0; c.object.position.set(c.x, c.y || 0, c.z); }
        c.best = undefined;
      }
      // officers get out when the car is next to you and you are on foot
      if ((dP < 26 || (dP < 42 && Math.abs(c.speed) < 1.5 && sees)) && hunting && (close || c.prog > 2 || Math.abs(c.speed) < 2) && P.state === 'foot' && !c.deployed && !c.wrecked) { c.deployed = true; g.peds.addCop?.(c.x + 2, c.z, true); }
    }
    for (const p of g.peds.peds) if (p.app.cop && p.copChase && p.state !== 'dead' && this._sees(p.x, p.z, p.y, pos, 45)) seen = true;
    // officers on foot who lost you go to the last place they saw you
    for (const p of g.peds.peds) if (p.app.cop && p.copChase) p.chaseTo = hunting ? null : this.lastKnown;
    // ---- arrest: an officer (or a police car blocking you while you are stopped) next to you for a moment
    const slow = P.state === 'foot' || (P.state === 'driving' && Math.abs(P.vehicle.speed) < 1.5);
    let grab = false;
    for (const p of g.peds.peds) if (p.app.cop && p.copChase && p.state !== 'dead' && p.state !== 'down' && Math.hypot(p.x - pos.x, p.z - pos.z) < 2.1) grab = true;
    if (!grab && P.state === 'driving') for (const c of this.cars) if (Math.hypot(c.x - pos.x, c.z - pos.z) < 7) grab = slow;
    this.arrestT = grab && slow && stars <= 3 ? this.arrestT + dt : Math.max(0, this.arrestT - dt * 2);
    if (this.arrestT > 2.2) return this.busted();
    // ---- from 3 stars the police open fire (fictional, game damage only)
    this.shootT -= dt;
    if (stars >= 3 && seen && this.shootT <= 0) {
      this.shootT = 1.6 - stars * 0.15;
      const shooter = this.cars.find((c) => !c.wrecked && Math.hypot(c.x - pos.x, c.z - pos.z) < 45 && this._los(c.x, c.z, pos.x, pos.z)) || g.peds.peds.find((p) => p.app.cop && p.copChase && Math.hypot(p.x - pos.x, p.z - pos.z) < 35 && this._los(p.x, p.z, pos.x, pos.z));
      if (shooter) {
        const from = new THREE.Vector3(shooter.x, (shooter.y || 0) + 1.4, shooter.z), to = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2, pos.y + 1.2, pos.z + (Math.random() - 0.5) * 2);
        g.weapons._tracer(from, to, 0xffd9a0); g.audio.gunshot?.('pistol');
        if (Math.random() < 0.45) g.hurt(P.state === 'driving' ? 3 : 6, 'משטרה');
      }
    }
    // ---- escaping: out of sight -> the stars blink; stay hidden until the timer runs out and they give up for good
    // hiding right where they last saw you barely helps: you have to get away from that spot
    this.unseen = seen ? 0 : this.unseen + dt * (nearSpot ? 0.35 : 1);
    if (seen) this.lastKnown = { x: pos.x, z: pos.z };
    if (this.unseen > this.escapeTime) this.clear('התחמקת! הכוכבים נעלמו — המשטרה הפסיקה לחפש אותך.');
  }
  get escapeTime() { return 6 + Math.floor(this.level) * 2.5; }   // 1 star: 8.5 s ... 5 stars: 18.5 s out of sight

  // cars that gave up: siren off, drive away from you, then disappear out of the way
  _leaving(dt, ctx, pos) {
    if (!this.gone?.length) return;
    for (const c of this.gone) {
      c.leaveT -= dt;
      const dx = c.x - pos.x, dz = c.z - pos.z, d = Math.hypot(dx, dz);
      let e = Math.atan2(dx, dz) - c.heading; e = Math.atan2(Math.sin(e), Math.cos(e));
      if (!c.wrecked) c.update(dt, { throttle: 0.6, steer: Math.max(-1, Math.min(1, -e * 1.5)), handbrake: false }, this.game.statics, ctx.vehicles);
      if (d > 90 || c.leaveT <= 0) this._remove(c);
    }
    this.gone = this.gone.filter((c) => !c.removed);
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
    this.hud.classList.toggle('blink', stars > 0 && this.unseen > 1.5);
  }
}
