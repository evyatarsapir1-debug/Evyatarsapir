// Holding up food and clothes shops: point a gun at the shopkeeper. They raise their hands and, as long as you keep
// them covered, throw the cash from the till over the counter to you - bundle after bundle (real 3D notes that fly,
// land and wait for you to pick them up). Lower the gun and they stop; empty the till and the shop has nothing left
// for a while. (Game mechanics only.)
import * as THREE from 'three';
import { shopKind } from './shops.js';
import { fmt } from './economy.js';

const PLEAD = ['בבקשה אל תירה!', 'קח, קח הכול!', 'יש לי ילדים בבית…', 'רק תירגע, אני נותן!', 'זה כל מה שיש!'];
const COOLDOWN = 4 * 60 * 1000;

export class Robbery {
  constructor(game) {
    this.game = game; this.cur = null; this.cash = []; this.robbed = new Map();
    this.noteMat = new THREE.MeshStandardMaterial({ color: 0x4f9a5e, roughness: 0.85 });
    this.bandMat = new THREE.MeshStandardMaterial({ color: 0xf1ead2, roughness: 0.7 });
  }
  _bundle() {
    const g = new THREE.Group();
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.075), this.noteMat); n.castShadow = true; g.add(n);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.037, 0.077), this.bandMat); g.add(b);
    return g;
  }
  // the shop + its keeper when you are inside a food / clothes shop
  _shopHere() {
    const g = this.game, P = g.player;
    for (const L of g.interiors.loaded.values()) {
      const b = L.b, c = L.spec.counter; if (!c) continue;
      const kind = shopKind(b.sign); if (kind !== 'food' && kind !== 'clothes' && kind !== 'weapons') continue;
      if (Math.abs(P.x - b.x) > b.w / 2 || Math.abs(P.z - b.z) > b.d / 2 || Math.abs(P.y - c.y) > 2) continue;
      const keeper = g.peds.peds.find((p) => p.shopKey && p.state !== 'dead' && Math.hypot(p.x - c.keeper[0], p.z - c.keeper[1]) < 1.8);
      return { L, b, c, kind, keeper, key: `${b.x.toFixed(0)},${b.z.toFixed(0)}` };
    }
    return null;
  }
  // the half door into the back of the gun-store counter: kick it open to get to the seller
  _gates(dt) {
    const g = this.game, P = g.player;
    this.gatePrompt = null;
    for (const L of g.interiors.loaded.values()) {
      const G = L.spec.gate; if (!G) continue;
      if (!L.gate) {
        const len = Math.hypot(G.tip[0] - G.hinge[0], G.tip[1] - G.hinge[1]), pivot = new THREE.Group();
        pivot.position.set(G.hinge[0], G.y, G.hinge[1]); pivot.rotation.y = Math.atan2(G.tip[0] - G.hinge[0], G.tip[1] - G.hinge[1]);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, G.h, len), new THREE.MeshStandardMaterial({ color: 0xd9d9d6, roughness: 0.6 })); m.position.set(0, G.h / 2, len / 2); m.castShadow = true; pivot.add(m);
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, len), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.35 })); top.position.set(0, G.h, len / 2); pivot.add(top);
        L.group.add(pivot); L.gate = { pivot, open: G.col.off ? 1 : 0, base: pivot.rotation.y };
        if (G.col.off) pivot.rotation.y = L.gate.base + 1.7;
      }
      const T = L.gate;
      if (G.col.off) { T.open = Math.min(1, T.open + dt * 3); T.pivot.rotation.y = T.base + 1.7 * T.open * (2 - T.open); T.pivot.rotation.z = 0.08 * T.open; continue; }
      const cx = (G.hinge[0] + G.tip[0]) / 2, cz = (G.hinge[1] + G.tip[1]) / 2;
      if (P.state === 'foot' && Math.hypot(P.x - cx, P.z - cz) < 1.6 && Math.abs(P.y - G.y) < 1.5)
        this.gatePrompt = { text: '🦶 פרוץ את דלת הדלפק', action: () => { G.col.off = true; g.audio.impact?.(6); g.rig.shake = Math.max(g.rig.shake, 0.15); const k = g.peds.peds.find((p) => p.shopKey && Math.hypot(p.x - cx, p.z - cz) < 5); if (k) g.peds.say(k, 'היי! מה אתה עושה?!', 2); } };
    }
  }
  promptFor(p) { return p.state === 'foot' ? this.gatePrompt : null; }
  update(dt) {
    const g = this.game, P = g.player;
    this._cashFx(dt);
    this._gates(dt);
    const aiming = P.state === 'foot' && g.econ.equipped && P.armed && (P.aimT > 0 || g.aiming || g.input.mouseAim);
    const R = this.cur;
    if (!R) {
      if (!aiming) return;
      const S = this._shopHere(); if (!S || !S.keeper) return;
      const k = S.keeper, d = Math.hypot(k.x - P.x, k.z - P.z);
      // pointing at the keeper (within ~25 degrees of the direction you face, and close enough)
      const ang = Math.atan2(k.x - P.x, k.z - P.z), diff = Math.abs(((ang - P.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d > 9 || diff > 0.45) return;
      const last = this.robbed.get(S.key);
      if (last && Date.now() - last < COOLDOWN) { if (!this._toldEmpty) { this._toldEmpty = true; g.peds.say(k, 'הקופה ריקה! שדדו אותנו לפני רגע!', 2.5); } return; }
      const till = S.kind === 'weapons' ? 2500 + Math.floor(Math.random() * 2500) : S.kind === 'clothes' ? 1400 + Math.floor(Math.random() * 1800) : 600 + Math.floor(Math.random() * 1100);
      this.cur = { ...S, till, left: till, t: 0, throwT: 0.8, idle: 0 };
      k.state = 'surrender'; k.timer = 999; g.peds._release(k);
      g.peds.say(k, PLEAD[Math.floor(Math.random() * PLEAD.length)], 2.4);
      g.toast(`🔫 שוד! תמשיך לכוון — הוא זורק לך את הכסף מהקופה`, 3);
      return;
    }
    const k = R.keeper;
    if (!k || k.state === 'dead' || Math.hypot(P.x - R.b.x, P.z - R.b.z) > Math.max(R.b.w, R.b.d)) return this._end(k && k.state !== 'dead' ? 'יצאת מהחנות' : 'המוכר לא יכול לתת לך יותר');
    k.state = 'surrender'; k.timer = 999;
    // keep them covered; lower the gun for a few seconds and they stop
    if (aiming) R.idle = 0; else { R.idle += dt; if (R.idle > 3.5) return this._end('הורדת את הנשק — המוכר הפסיק לתת'); }
    R.throwT -= dt;
    if (aiming && R.left > 0 && R.throwT <= 0) {
      R.throwT = 0.65 + Math.random() * 0.4;
      const amt = Math.min(R.left, 80 + Math.floor(Math.random() * 220)); R.left -= amt;
      this._throw(k, amt);
      if (Math.random() < 0.3) g.peds.say(k, PLEAD[Math.floor(Math.random() * PLEAD.length)], 1.6);
    }
    if (R.left <= 0 && !R.emptyTold) { R.emptyTold = true; g.peds.say(k, 'זהו! הקופה ריקה!', 2.4); this.robbed.set(R.key, Date.now()); setTimeout(() => { if (this.cur === R) this._end(null); }, 2500); }
  }
  _end(msg) {
    const R = this.cur; if (!R) return;
    this.cur = null; this._toldEmpty = false;
    if (R.left < R.till) this.robbed.set(R.key, Date.now());
    if (R.keeper && R.keeper.state === 'surrender') { R.keeper.state = 'hide'; R.keeper.timer = 8; }
    if (msg) this.game.toast(msg, 2.2);
  }
  // a bundle of notes tossed over the counter towards you
  _throw(k, amt) {
    const g = this.game, P = g.player, m = this._bundle();
    const from = new THREE.Vector3(k.x, k.y + 1.25, k.z);
    const dx = P.x - k.x, dz = P.z - k.z, d = Math.hypot(dx, dz) || 1;
    const land = Math.min(d - 0.8, 1.6 + Math.random() * 1.6), T = 0.7;
    const tx = k.x + (dx / d) * land + (Math.random() - 0.5) * 0.9, tz = k.z + (dz / d) * land + (Math.random() - 0.5) * 0.9;
    m.position.copy(from); g.scene.add(m);
    const floor = this.cur ? this.cur.c.y + 0.035 : P.y + 0.03;
    this.cash.push({ m, amt, vx: (tx - from.x) / T, vz: (tz - from.z) / T, vy: (floor - from.y + 4.9 * T * T) / T, floor, spin: (Math.random() - 0.5) * 14, landed: false });
    g.audio.mech?.('dry');
  }
  _cashFx(dt) {
    const g = this.game, P = g.player;
    for (let i = this.cash.length - 1; i >= 0; i--) {
      const c = this.cash[i], m = c.m;
      if (!c.landed) {
        c.vy -= 9.8 * dt; m.position.x += c.vx * dt; m.position.y += c.vy * dt; m.position.z += c.vz * dt;
        m.rotation.y += c.spin * dt; m.rotation.x += c.spin * 0.4 * dt;
        if (m.position.y <= c.floor) { m.position.y = c.floor; c.landed = true; m.rotation.x = 0; c.t = 0; }
      } else c.t += dt;
      // pick it up by walking over it (it also gets swept up after a while if you are close)
      const d = Math.hypot(P.x - m.position.x, P.z - m.position.z);
      if (c.landed && (d < 1.0 || (c.t > 6 && d < 3))) {
        g.scene.remove(m); this.cash.splice(i, 1);
        g.econ.earn(c.amt, 'שוד חנות'); g.audio.coin?.();
        this._sum = (this._sum || 0) + c.amt; clearTimeout(this._sumT);
        g.toast(`💵 +${fmt(c.amt)} (סה״כ ${fmt(this._sum)})`, 1.4);
        this._sumT = setTimeout(() => { this._sum = 0; }, 6000);
      } else if (c.landed && c.t > 90) { g.scene.remove(m); this.cash.splice(i, 1); }
    }
  }
}
