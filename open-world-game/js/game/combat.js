// Fist-fight system (game-style, non-graphic): jab -> cross -> kick combo with smooth animations,
// people with 8 "fight points", personalities that react differently, a clear status bar above heads,
// speech bubbles, and game-money drops (60 / 120 / 210) to pick up when someone is knocked out of the fight.
import * as THREE from 'three';
import { segmentVsBox } from '../physics/collision.js';
import { heightAt } from '../world/terrain.js';
import { fmt } from './economy.js';

const MOVES = {
  jabR: { dur: 0.42, hitAt: 0.15, reach: 1.6, dmg: 1, name: 'אגרוף ימני' },
  jabL: { dur: 0.42, hitAt: 0.15, reach: 1.6, dmg: 1, name: 'אגרוף שמאלי' },
  kick: { dur: 0.66, hitAt: 0.28, reach: 1.9, dmg: 2, name: 'בעיטה' },
};
const COMBO = ['jabR', 'jabL', 'kick'];
const _v = new THREE.Vector3();

function billTexture(amount) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#1e7a3c'; g.beginPath(); g.roundRect(6, 6, 244, 84, 18); g.fill();
  g.strokeStyle = '#bff5c8'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#ffffff'; g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`₪${amount}`, 128, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.combo = 0; this.lastAttack = -10; this.queued = false;
    this.pickups = [];
    this.layer = document.getElementById('npcLayer');
    this.els = new Map();
    this.billGeo = new THREE.BoxGeometry(0.34, 0.05, 0.17);
    this.billMat = new THREE.MeshStandardMaterial({ color: 0x3fae5a, emissive: 0x1e7a3c, emissiveIntensity: 0.4 });
    this.texCache = {};
  }

  // ------------------------------------------------------------------ player attacks
  update(dt, ctx) {
    const { player, input, econ, pedSys } = ctx;
    const now = this.game.time;
    const unarmed = !econ.equipped && player.state === 'foot';
    if (unarmed && input.wasPressed('fire')) this.queued = true;   // press during a strike = buffered follow-up
    const A = player.attack;
    if (A) {
      A.t += dt;
      // short lunge towards the target so a punch thrown from a step away still connects
      if (A.tgt && !A.hit) {
        const dx = A.tgt.x - player.x, dz = A.tgt.z - player.z, d = Math.hypot(dx, dz), want = d - A.m.reach * 0.7;
        if (want > 0.02) { const st = Math.min(want, 5 * dt); player.x += dx / d * st; player.z += dz / d * st; }
        player.facing = Math.atan2(dx, dz);
      }
      if (!A.hit && A.t >= A.m.hitAt) { A.hit = true; this._strike(A, ctx); }
      if (A.t >= A.m.dur) { player.attack = null; player.combatT = 3; }   // guard drops 3 s after the last strike
    }
    if (!player.attack && this.queued && unarmed) {
      this.queued = false;
      if (now - this.lastAttack > 1.0) this.combo = 0;            // combo resets after a pause
      const type = COMBO[this.combo];
      this.combo = (this.combo + 1) % COMBO.length;
      this.lastAttack = now;
      player.attack = { type, m: MOVES[type], t: 0, hit: false };
      player.combatT = 3;
      // auto-aim at the closest person in front (or right next to you)
      const tgt = this._target(player, pedSys.peds, 3.2, -0.2) || this._target(player, pedSys.peds, 1.6, -1.1);
      if (tgt) { player.facing = Math.atan2(tgt.x - player.x, tgt.z - player.z); player.attack.tgt = tgt; }
    }
    if (!unarmed) { this.queued = false; if (player.state !== 'foot') player.attack = null; }
    if (player.combatT > 0) player.combatT -= dt;
    this._pickups(dt, ctx);
    this._overlay(ctx);
  }

  _target(player, peds, reach, cone) {
    const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
    let best = null, bd = reach;
    for (const p of peds) {
      if (p.car || p.state === 'inside' || p.state === 'down' || p.state === 'dead' || p.state === 'dazed' || p.state === 'pulled' || p.state === 'thrown') continue;
      if (Math.abs(p.y - player.y) > 1) continue;
      const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > cone) { bd = d; best = p; }
    }
    return best;
  }

  _strike(A, ctx) {
    const { player, pedSys, vehicles } = ctx;
    const m = A.m;
    const p = A.tgt && Math.hypot(A.tgt.x - player.x, A.tgt.z - player.z) < m.reach + 0.3 && Math.abs(A.tgt.y - player.y) < 1 && A.tgt.state !== 'down' && A.tgt.state !== 'dead' && A.tgt.state !== 'dazed' ? A.tgt : this._target(player, pedSys.peds, m.reach, 0.35);
    let hit = false;
    if (p) {
      const r = pedSys.hit(p, player, m.dmg, A.type === 'kick');
      if (r) {
        hit = true;
        if (r === 'dead') this._drop(p);
        this.game.police?.crime(p.app.cop ? 'copHit' : r === 'dead' ? 'kill' : 'punch', p.x, p.z);
        // bystanders react according to their personality
        // bystanders react according to their personality; after a death everyone nearby runs away
        for (const o of pedSys.peds) if (o !== p && !o.car && Math.hypot(o.x - player.x, o.z - player.z) < (r === 'dead' ? 22 : 14)) { if (r === 'dead') pedSys.scare(o, player, false); else pedSys.react(o, player, false); }
      }
    }
    // a strike that lands on a car leaves a small dent
    const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
    for (const v of vehicles) {
      if (Math.abs(v.x - player.x) > 6 || Math.abs(v.z - player.z) > 6) continue;
      const y = player.y + (A.type === 'kick' ? 0.6 : 1.25);
      if (segmentVsBox(player.x, y, player.z, player.x + fx * m.reach * 0.8, y, player.z + fz * m.reach * 0.8, v.collider, 0.05) < 1) { v.addDamage(4 * m.dmg, -fx, -fz); hit = true; }
    }
    if (hit) { ctx.onShake?.(A.type === 'kick' ? 0.25 : 0.12); this.game.audio?.impact(A.type === 'kick' ? 6 : 3.5); }
  }

  // ------------------------------------------------------------------ money drops
  _drop(p) {
    if (Math.random() > 0.75) return;                       // not everyone carries cash
    const table = p.wealth === 'rich' ? [[120, 0.45], [210, 0.55]] : p.wealth === 'worker' ? [[60, 0.45], [120, 0.45], [210, 0.1]] : [[60, 0.65], [120, 0.28], [210, 0.07]];
    let r = Math.random(), amount = table[0][0];
    for (const [a, w] of table) { if (r < w) { amount = a; break; } r -= w; }
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(this.billGeo, this.billMat); b.position.y = i * 0.05; b.rotation.y = i * 0.4; g.add(b); }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texCache[amount] ||= billTexture(amount), depthTest: false }));
    sp.scale.set(0.9, 0.34, 1); sp.position.y = 0.55; g.add(sp);
    const y = heightAt(p.x, p.z, p.y + 0.5);
    g.position.set(p.x + 0.5, y + 0.15, p.z);
    this.game.scene.add(g);
    this.pickups.push({ g, amount, x: p.x + 0.5, z: p.z, y, t: 120 });
  }
  _pickups(dt, ctx) {
    const pl = ctx.player, pos = this.game.playerPos();
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t -= dt;
      k.g.rotation.y += dt * 2; k.g.position.y = k.y + 0.2 + Math.sin(this.game.time * 3 + i) * 0.06;
      const close = Math.hypot(pos.x - k.x, pos.z - k.z) < 1.4 && Math.abs(pos.y - k.y) < 1.5;
      if (close || k.t <= 0) {
        this.game.scene.remove(k.g);
        this.pickups.splice(i, 1);
        if (close) { ctx.econ.earn(k.amount, 'כסף שנמצא'); this.game.toast(`+${fmt(k.amount)} נוסף לחשבון`, 1.8); this.game.save(); }
      }
    }
    if (pl.state === 'foot' && pl.combatT > 0) { /* fighting stance handled in the character animation */ }
  }

  // ------------------------------------------------------------------ status bars + speech bubbles (DOM, non-graphic)
  _overlay(ctx) {
    const cam = this.game.camera, W = innerWidth, H = innerHeight;
    const live = new Set();
    for (const p of ctx.pedSys.peds) {
      const show = (p.barT > 0 && p.hp < p.maxHp) || p.state === 'down' || (p.state === 'dead' && p.barT > 0) || p.sayT > 0;
      if (!show) continue;
      _v.set(p.x, p.y + 2.15, p.z).project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) continue;
      const d = Math.hypot(p.x - cam.position.x, p.z - cam.position.z);
      if (d > 35) continue;
      live.add(p);
      let el = this.els.get(p);
      if (!el) {
        el = document.createElement('div'); el.className = 'npctag';
        el.innerHTML = '<div class="say"></div><div class="hp"><i></i></div><div class="st"></div>';
        this.layer.appendChild(el); this.els.set(p, el);
      }
      el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * W}px, ${(-_v.y * 0.5 + 0.5) * H}px) translate(-50%, -100%)`;
      const say = el.children[0], hp = el.children[1], st = el.children[2];
      say.textContent = p.sayT > 0 ? p.say : ''; say.style.display = p.sayT > 0 ? 'block' : 'none';
      const showBar = (p.barT > 0 && p.hp < p.maxHp) || p.state === 'down' || (p.state === 'dead' && p.barT > 0);
      hp.style.display = showBar ? 'block' : 'none';
      hp.firstChild.style.width = `${(p.hp / p.maxHp) * 100}%`;
      hp.firstChild.style.background = p.hp > 4 ? '#6fd36f' : p.hp > 2 ? '#f0c040' : '#f07040';
      st.textContent = p.state === 'dead' ? 'מת' : p.state === 'down' ? 'מחוץ לקרב' : p.state === 'fight' ? 'נלחם בחזרה' : '';
      st.style.display = st.textContent ? 'block' : 'none';
    }
    for (const [p, el] of this.els) if (!live.has(p)) { el.remove(); this.els.delete(p); }
  }
}
