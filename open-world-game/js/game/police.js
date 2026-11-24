// Police and wanted level (0-5 stars). Repeated gunfire (6+ shots in 20 s) brings the police; patrol cars
// with sirens chase you, officers get out and try to arrest you; from 3 stars they also shoot (game damage, no gore).
// Stay out of their sight long enough and they lose you. Busted -> the police station; wasted -> the hospital.
import * as THREE from 'three';
import { Vehicle } from '../vehicles/vehicle.js';
import { heightAt } from '../world/terrain.js';
import { segmentVsBox } from '../physics/collision.js';
import { P } from '../world/layout.js';

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
  // Only gunfire brings the police: shots are counted over the last 20 s. 6 shots -> 1 star, every 8 more -> another
  // star (max 5). Heavy weapons count more. Punches, running people over, taking cars etc. no longer call the police.
  crime(kind, x, z) {
    const W = { gunfire: 1, explosion: 2, cannon: 3, missile: 3 }[kind];
    if (!W) return;
    const now = this.game.time;
    this.shots = (this.shots || []).filter((t) => now - t < 20);
    for (let i = 0; i < W; i++) this.shots.push(now);
    const n = this.shots.length;
    if (n < 6) return;
    const want = Math.min(5, 1 + Math.floor((n - 6) / 8));
    const before = this.level;
    if (want > this.level) this.level = want;
    if (Math.floor(this.level) > Math.floor(before)) this.game.toast(before ? `${'★'.repeat(Math.floor(this.level))} המשטרה מגבירה את המרדף!` : '★ יריות רבות — המשטרה בדרך!', 2.5);
    this.unseen = 0; this.lastKnown = { x, z }; this.sinceCrime = 0; if (!before) this.noReach = 0;
  }
  // set a wanted level directly (tests / scripted events)
  setWanted(n, x, z) { const before = this.level; this.level = Math.max(this.level, n); this.unseen = 0; this.lastKnown = { x, z }; this.sinceCrime = 0; if (!before) this.noReach = 0; }
  _copNear(x, z, r) {
    for (const c of this.cars) if (!c.removed && Math.hypot(c.x - x, c.z - z) < r) return true;
    for (const v of this.game.traffic.cars) if (v.T.police && Math.hypot(v.x - x, v.z - z) < r) return true;
    for (const p of this.game.peds.peds) if (p.app.cop && Math.hypot(p.x - x, p.z - z) < r) return true;
    return false;
  }

  clear(msg) {
    this.level = 0; this.heat = 0; this.unseen = 0; this.noReach = 0; this.arrestT = 0; this.lastKnown = null;
    this.gone = this.gone || [];
    for (const c of this.cars) { if (msg && !c.wrecked) { c.siren = false; c.leaveT = 15; this.gone.push(c); } else this._remove(c); }
    this.cars = [];
    for (const p of this.game.peds.peds) if (p.app.cop && (p.copChase || p.cordon)) { p.copChase = false; p.cordon = false; p.chaseTo = null; p.state = 'walk'; p.timer = 4; p.angryT = 0; }
    this.siege = null;
    if (msg) this.game.toast(msg, 3);
  }
  _remove(c) { c.removed = true; this.game.scene.remove(c.object); }
  // the building is surrounded (bank robbery): two patrol cars parked across the street in front of the entrance and
  // officers behind them, weapons on the door. They hold while you are inside; the moment you come out the chase starts.
  cordon(b) {
    const g = this.game; if (this.siege || !b?.door) return;
    const d = b.door, L = Math.hypot(d.x - b.x, d.z - b.z) || 1, ux = (d.x - b.x) / L, uz = (d.z - b.z) / L, rx = -uz, rz = ux;
    const face = Math.atan2(-ux, -uz);                   // looking at the door
    this.siege = { b, hold: true, cops: [], cars: [] };
    for (const k of [-1, 1]) {
      const s = g.roadsideSpot(d.x + ux * 13 + rx * k * 5, d.z + uz * 13 + rz * k * 5); if (!s) continue;
      const v = new Vehicle('police', 0xf5f5f5, s.x, s.z, face + Math.PI / 2 * k * 0.8, 0);
      v.driver = 'police'; v.siren = true; v.stuck = 0; v.cordon = true; v.deployed = true;
      g.scene.add(v.object); this.cars.push(v); this.siege.cars.push(v);
    }
    for (let i = 0; i < 4; i++) {
      const x = d.x + ux * (9 + (i % 2) * 1.5) + rx * (i - 1.5) * 2.6, z = d.z + uz * (9 + (i % 2) * 1.5) + rz * (i - 1.5) * 2.6;
      const p = g.peds.addCop?.(x, z, false, true); if (!p) continue;
      p.state = 'guard'; p.yaw = p.baseYaw = face; p.homeSpot = { x, z, yaw: face, state: 'guard', y: 0 }; p.app.gun = true; p.gunOut = true; p.cordon = true;
      this.siege.cops.push(p);
    }
    this.level = Math.max(this.level, 3);
  }
  _siege(dt, pos) {
    const S = this.siege; if (!S) return;
    const b = S.b, inside = Math.abs(pos.x - b.x) < b.w / 2 + 0.5 && Math.abs(pos.z - b.z) < b.d / 2 + 0.5;
    if (S.hold && !inside) {
      // you came out: everybody goes after you
      S.hold = false;
      for (const p of S.cops) if (p.state !== 'dead') { p.state = 'copChase'; p.copChase = true; p.chaseTo = null; p.gunOut = true; p.angryT = 45; this.game.peds.say?.(p, ['משטרה! זרוק את הנשק!', 'הוא יוצא! עצור!', 'ידיים למעלה!'][Math.floor(Math.random() * 3)], 2); }
      for (const c of S.cars) c.cordon = false;
      this.unseen = 0; this.lastKnown = { x: pos.x, z: pos.z };
    }
  }

  // can someone at (ax,az) see the player at (bx,bz)? buildings block the view
  _los(ax, az, bx, bz, ay = 1.5, by = 1.5) {
    const list = this.game.statics.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), this._q || (this._q = []));
    for (const c of list) if (c.y1 > Math.max(ay, by) + 0.5 && c.y1 - c.y0 > 4 && segmentVsBox(ax, ay, az, bx, by, bz, c, -0.3) < 0.98) return false;
    return true;
  }
  _sees(x, z, y, pos, r) {
    const d = Math.hypot(pos.x - x, pos.z - z);
    return d < 12 || (d < r && this._los(x, z, pos.x, pos.z, (y || 0) + 1.5, pos.y + 1.4));
  }

  // A* over the street network (junction nodes every 100 m) from the road nearest to (x0,z0) to the one nearest (x1,z1)
  _roadNode(x, z) {
    const G = this.game.graph, gx = Math.round(x / P), gz = Math.round(z / P);
    let best = null, bd = Infinity;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const n = G.node(gx + i, gz + j); if (!n.nbrs.length) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  _route(x0, z0, x1, z1) {
    const G = this.game.graph, s = this._roadNode(x0, z0), t = this._roadNode(x1, z1);
    if (!s || !t) return null;
    if (s === t) return [t];   // same junction: go there, then straight to the goal
    const open = [s], came = new Map(), gS = new Map([[s.key, 0]]), h = (n) => Math.hypot(n.x - t.x, n.z - t.z);
    const fS = new Map([[s.key, h(s)]]), closed = new Set();
    for (let it = 0; it < 900 && open.length; it++) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (fS.get(open[i].key) < fS.get(open[bi].key)) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === t) { const path = [t]; let k = t.key; while (came.has(k)) { const p = came.get(k); path.unshift(p); k = p.key; } return path; }   // starts with the junction nearest the car
      closed.add(cur.key);
      for (const nk of cur.nbrs) {
        if (closed.has(nk)) continue;
        const n = G.get(nk), gv = gS.get(cur.key) + Math.hypot(n.x - cur.x, n.z - cur.z);
        if (gv < (gS.get(nk) ?? Infinity)) { came.set(nk, cur); gS.set(nk, gv); fS.set(nk, gv + h(n)); if (!open.includes(n)) open.push(n); }
      }
    }
    return null;
  }

  _returnFire(dt, P, pos) {
    const g = this.game;
    // ---- officers / soldiers you attacked shoot back at once, each with his own rhythm (game damage only)
    for (const q of g.peds.peds) {
      if (!(q.angryT > 0) || q.state === 'dead') continue;
      q.angryT -= dt; q.shotT = (q.shotT ?? 0.4) - dt;
      if (q.pose !== 'aimGun' || q.shotT > 0) continue;
      const d = Math.hypot(q.x - pos.x, q.z - pos.z); if (d > 40 || !this._los(q.x, q.z, pos.x, pos.z)) continue;
      const pain = g.peds.pain(q);   // a wounded shooter fires slower and misses more
      q.shotT = ((q.app.soldier ? 0.35 : q.doorGuard ? 0.45 : 0.6) + Math.random() * 0.4) * (1 + pain * 1.5);
      const from = new THREE.Vector3(q.x + Math.sin(q.yaw) * 0.55, q.y + 1.38, q.z + Math.cos(q.yaw) * 0.55);
      const hit = Math.random() < (q.doorGuard ? (d < 12 ? 0.55 : 0.36) : (d < 12 ? 0.45 : 0.28)) * (1 - pain);
      const to = hit ? new THREE.Vector3(pos.x, pos.y + 1.1, pos.z) : new THREE.Vector3(pos.x + (Math.random() - 0.5) * 3, pos.y + 0.3 + Math.random() * 1.5, pos.z + (Math.random() - 0.5) * 3);
      g.weapons.npcShot(from, to, q.app.soldier ? 'rifle' : 'pistol', g.audio);
      if (hit) g.shotHit(q.app.soldier ? 'חייל' : q.doorGuard ? 'מאבטח' : 'משטרה');
    }
  }

  update(dt, ctx) {
    const g = this.game, P = g.player, pos = g.playerPos(), stars = Math.floor(this.level);
    this._leaving(dt, ctx, pos);
    this._hud(stars, dt);
    this._returnFire(dt, P, pos);
    if (!stars) { if (this.cars.length || this.siege) this.clear(); return; }
    this._siege(dt, pos);
    const want = Math.min(1 + stars, 5);
    if (!this.lastKnown) this.lastKnown = { x: pos.x, z: pos.z };
    const hunting = this.unseen === 0;            // they saw you last frame: they know exactly where you are
    this.sinceCrime = (this.sinceCrime ?? 99) + dt;
    // still at the scene (or the crime just happened): more units are sent and blocked cars find a way to you
    const nearSpot = Math.hypot(pos.x - this.lastKnown.x, pos.z - this.lastKnown.z) < 40;
    const informed = hunting || this.sinceCrime < 4 || nearSpot;
    this.cars = this.cars.filter((c) => !c.removed);
    // ---- reinforcements: a new patrol car sets off from a street 120-180 m away and drives to you along the roads
    this.spawnT -= dt;
    if (this.cars.length < want && this.spawnT <= 0 && informed) {
      this.spawnT = 0.4;                       // keep trying until a good street is found
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 60;
      const s = g.roadsideSpot(this.lastKnown.x + Math.cos(a) * d, this.lastKnown.z + Math.sin(a) * d);
      const sd = s ? Math.hypot(s.x - pos.x, s.z - pos.z) : 0;
      if (s && sd > 90 && (sd > 130 || !this._los(s.x, s.z, pos.x, pos.z))) {
        this.spawnT = 3;
        const v = new Vehicle('police', 0xf5f5f5, s.x, s.z, s.heading, 0);
        v.driver = 'police'; v.siren = true; v.stuck = 0;
        g.scene.add(v.object); this.cars.push(v);
        g.peds.addDriver?.(v);
      }
    }
    // ---- pursuit along the streets: plan a route over the road network, follow it, slow down for corners;
    //      the last stretch (you in sight, close) is driven straight at you
    let seen = false, reached = false;
    for (const c of this.cars) {
      if (c.cordon) { c.update(dt, { throttle: 0, steer: 0, handbrake: true }, g.statics, ctx.vehicles); continue; }   // parked across the street in front of the bank
      const dP = Math.hypot(pos.x - c.x, pos.z - c.z);
      if (dP > 420) { this._remove(c); continue; }
      const sees = !c.wrecked && this._sees(c.x, c.z, c.y, pos, 55);
      if (sees) seen = true;
      if (dP < 25) reached = true;
      // goal: you (while they know where you are) or a search point around where you were last seen
      let gx = pos.x, gz = pos.z;
      if (!hunting) {
        if (!c.search || Math.hypot(c.search.x - c.x, c.search.z - c.z) < 15 || c.searchT <= 0) {
          const a = Math.random() * Math.PI * 2, r = c.search ? 30 + Math.random() * 70 : 0;
          c.search = { x: this.lastKnown.x + Math.cos(a) * r, z: this.lastKnown.z + Math.sin(a) * r }; c.searchT = 14; c.route = null;
        }
        c.searchT -= dt; gx = c.search.x; gz = c.search.z;
      } else c.search = null;
      const direct = hunting && (dP < 40 && sees || dP < 16);
      c.routeT = (c.routeT || 0) - dt;
      if (!direct && (!c.route || c.routeT <= 0 || !c.route.length)) {
        const r = this._route(c.x, c.z, gx, gz); c.routeT = 2;
        // already driving away from the first junction towards the second one? skip the first
        if (r && r.length > 1) { const a = r[0], b = r[1], sx = b.x - a.x, sz = b.z - a.z, u = ((c.x - a.x) * sx + (c.z - a.z) * sz) / (sx * sx + sz * sz || 1); if (u > 0.05 && u < 1) { c.lastNode = a; r.shift(); } }
        c.route = r;
      }
      let tx = gx, tz = gz, corner = false;
      if (!direct && c.route && c.route.length) {
        while (c.route.length && Math.hypot(c.route[0].x - c.x, c.route[0].z - c.z) < 9) c.lastNode = c.route.shift();
        if (c.route.length) {
          // pure pursuit: project the car onto the street it is on, then aim 12 m further along the route
          const n0 = c.route[0], prev = c.lastNode && Math.hypot(c.lastNode.x - n0.x, c.lastNode.z - n0.z) < 160 ? c.lastNode : null;
          let px = c.x, pz = c.z;
          if (prev) {
            const sx = n0.x - prev.x, sz = n0.z - prev.z, L2 = sx * sx + sz * sz || 1;
            const u = Math.max(0, Math.min(1, ((c.x - prev.x) * sx + (c.z - prev.z) * sz) / L2));
            px = prev.x + sx * u; pz = prev.z + sz * u;
          }
          let left = 12, ax = px, az = pz;
          const pts = [n0, ...c.route.slice(1, 3)];
          tx = n0.x; tz = n0.z;
          for (const q of pts) {
            const seg = Math.hypot(q.x - ax, q.z - az);
            if (seg >= left) { tx = ax + (q.x - ax) * left / seg; tz = az + (q.z - az) * left / seg; left = 0; break; }
            left -= seg; ax = q.x; az = q.z; tx = q.x; tz = q.z;
          }
          if (left > 0 && c.route.length <= 1) { const gd = Math.hypot(gx - ax, gz - az) || 1; tx = ax + (gx - ax) * Math.min(1, left / gd); tz = az + (gz - az) * Math.min(1, left / gd); }
          const n1 = c.route[1];
          if (n1) {   // a turn coming up at the next junction: brake into it
            const a1 = prev ? Math.atan2(n0.x - prev.x, n0.z - prev.z) : Math.atan2(n0.x - c.x, n0.z - c.z), a2 = Math.atan2(n1.x - n0.x, n1.z - n0.z);
            corner = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) > 0.6 && Math.hypot(n0.x - c.x, n0.z - c.z) < 35;
          }
        }
      }
      if (direct) {
        // pull up next to you, not into you: aim a few metres to the side and stop short
        const ux = (pos.x - c.x) / (dP || 1), uz = (pos.z - c.z) / (dP || 1), side = c.side ??= (Math.random() < 0.5 ? 1 : -1);
        tx = pos.x - ux * 6 + uz * 4 * side; tz = pos.z - uz * 6 - ux * 4 * side;
      }
      const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
      let e = Math.atan2(dx, dz) - c.heading; e = Math.atan2(Math.sin(e), Math.cos(e));
      const close = hunting && (dP < 16 || (direct && d < 4));
      const vWant = close ? 0 : corner ? 11 : Math.abs(e) > 0.9 ? 8 : direct ? Math.min(14, dP * 0.35) : (hunting || informed) ? (dP < 60 ? 18 : 30) : 15;   // racing in with the siren, slower when searching
      const sp = c.speed;
      const ctl = { throttle: sp < vWant - 1 ? (Math.abs(e) > 1.4 ? 0.5 : 1) : sp > vWant + 2 ? -0.8 : 0.15, steer: Math.max(-1, Math.min(1, -e * 2.2)), handbrake: false };
      if (close && Math.abs(sp) < 1.5) ctl.throttle = 0;
      if (c.wrecked || c.noDriver) { ctl.throttle = 0; ctl.steer = 0; }
      c.update(dt, ctl, g.statics, ctx.vehicles);
      // stuck against something: back up and try again; a car that stays stuck out of sight is replaced by another unit
      c.stuck = Math.abs(c.speed) < 1 && !close ? c.stuck + dt : (c.stuck > 1.5 && c.stuck < 3.6 ? c.stuck + dt : 0);
      if (c.stuck > 1.5 && c.stuck < 3.6) c.update(dt, { throttle: -1, steer: ctl.steer > 0 ? -1 : 1 }, g.statics, ctx.vehicles);
      if (c.stuck > 3.6 && c.stuck < 4) c.route = null;
      if (c.stuck > 10 && dP > 60 && !sees) this._remove(c);
      // officers get out when the car is next to you and you are on foot
      if ((dP < 26 || (dP < 42 && Math.abs(c.speed) < 1.5 && sees)) && hunting && (close || Math.abs(c.speed) < 2) && (P.state === 'foot' || Math.abs(P.vehicle?.speed || 0) < 5) && !c.deployed && !c.wrecked) { c.deployed = true; g.peds.addCop?.(c.x + 2, c.z, true); if (dP < 40) g.peds.addCop?.(c.x - 2, c.z, true); }
    }
    for (const p of g.peds.peds) if (p.app.cop && p.copChase && p.state !== 'dead' && Math.hypot(p.x - pos.x, p.z - pos.z) < 25) reached = true;
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
      const shooter = g.peds.peds.find((p) => p.app.cop && p.copChase && p.state !== 'dead' && p.pose === 'aimGun' && Math.hypot(p.x - pos.x, p.z - pos.z) < 35 && this._los(p.x, p.z, pos.x, pos.z));   // only officers on foot, never from inside a car
      if (shooter) {
        const from = new THREE.Vector3(shooter.x + Math.sin(shooter.yaw) * 0.55, (shooter.y || 0) + 1.38, shooter.z + Math.cos(shooter.yaw) * 0.55), to = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2, pos.y + 1.2, pos.z + (Math.random() - 0.5) * 2);
        g.weapons.npcShot(from, to, 'pistol', g.audio);
        if (Math.random() < 0.45) g.shotHit('משטרה');
      }
    }
    // ---- escaping: out of sight -> the stars blink. They give up after 50 s without seeing you,
    //      or after 50 s in which no officer managed to get to you (you are out of their reach)
    // a glimpse of you no longer wipes out your escape: it only costs some of the time you have been out of sight
    if (seen) { if (this.unseen > 0 && !this.wasSeen) this.unseen = Math.max(0, this.unseen - 20); else if (reached || this.unseen < 1) this.unseen = 0; }
    else this.unseen += dt;
    this.wasSeen = seen;
    this.noReach = reached ? 0 : (this.noReach || 0) + dt;
    if (seen) this.lastKnown = { x: pos.x, z: pos.z };
    if (this.unseen > this.escapeTime) this.clear('התחמקת! הכוכבים נעלמו — המשטרה הפסיקה לחפש אותך.');
    else if (this.noReach > this.escapeTime) this.clear('המשטרה לא הצליחה להגיע אליך — הם עזבו. הכוכבים נעלמו.');
    // three minutes after your last shots, if they have not caught up with you, they give up the chase
    else if ((this.sinceCrime ?? 0) > this.giveUpTime && !reached) this.clear('3 דקות והמשטרה לא תפסה אותך — הם עזבו. הכוכבים נעלמו.');
  }
  get escapeTime() { return 90; }    // a minute and a half out of sight (or out of reach) and the police give up
  get giveUpTime() { return 180; }   // and never more than three minutes after the last shots unless they have you cornered

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
    g.heist?.fail('נעצרת');
    g.respawnAt(POLICE_STATION, `נעצרת! שילמת קנס של ₪${fine.toLocaleString('he-IL')} ושוחררת מתחנת המשטרה.`);
  }

  _hud(stars, dt) {
    if (!this.hud) return;
    const half = this.level - stars >= 0.5;
    // countdown to escape: shown once they lost sight of you (or have not reached you for a while)
    const lost = Math.max(this.unseen > 1.5 ? this.unseen : 0, (this.noReach || 0) > 20 ? this.noReach : 0);
    const chase = Math.max(0, this.giveUpTime - (this.sinceCrime ?? 0));   // the three-minute limit counts down too
    const left = lost > 0 ? Math.max(0, Math.ceil(Math.min(this.escapeTime - lost, chase))) : (this.sinceCrime ?? 0) > 60 ? Math.ceil(chase) : 0;
    const html = stars || half ? '<span class="st">' + '★'.repeat(stars) + (half ? '<i>★</i>' : '') + '<s>' + '★'.repeat(5 - stars - (half ? 1 : 0)) + '</s></span>' + (left ? `<b>${this.unseen > 1.5 ? 'מסתתר' : lost > 0 ? 'מחוץ להישג' : 'מרדף'} · ${left}</b>` : '') : '';
    if (this.hud.dataset.h !== html) { this.hud.innerHTML = html; this.hud.dataset.h = html; }
    this.hud.classList.toggle('blink', stars > 0 && this.unseen > 1.5);
  }
}
