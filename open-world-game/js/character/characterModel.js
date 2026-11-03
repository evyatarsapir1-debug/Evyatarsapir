// Procedural, rigged humanoid with customizable look and code-driven animation
// (idle breathing, walk, run, jump, sit, drive, ride, door-open reach).
import * as THREE from 'three';
import { damp, clamp } from '../core/mathx.js';

export const SKIN_TONES = [0xf6d7c3, 0xe9b98f, 0xc98e62, 0xa86f48, 0x7b4a2c, 0x4f2f1d];
export const HAIR_COLORS = [0x1b1410, 0x3b2416, 0x6b4325, 0xa8743b, 0xd9b26a, 0xb5402a, 0x9a9a9a, 0x2a3f8f];
export const HAIR_STYLES = ['short', 'buzz', 'long', 'ponytail', 'curly', 'mohawk', 'bun', 'bald'];
export const HAIR_NAMES = { short: 'קצר', buzz: 'מגולח', long: 'ארוך', ponytail: 'קוקו', curly: 'מתולתל', mohawk: 'מוהיקן', bun: 'פקעת', bald: 'קרחת' };
export const TOP_STYLES = ['tshirt', 'jacket', 'tank', 'hoodie'];
export const TOP_NAMES = { tshirt: 'חולצת טי', jacket: 'ז׳קט', tank: 'גופייה', hoodie: 'קפוצ׳ון' };
export const BOTTOM_STYLES = ['jeans', 'shorts', 'skirt', 'pants'];
export const BOTTOM_NAMES = { jeans: 'ג׳ינס', shorts: 'מכנס קצר', skirt: 'חצאית', pants: 'מכנס בד' };
export const CLOTH_COLORS = [0xffffff, 0x1d1d1f, 0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x34495e, 0x95a5a6, 0x2c3e50, 0x16a085, 0xd35480, 0x6e4b3a];

export const PRESETS = [
  { name: 'נועם', skin: 1, hairStyle: 'short', hairColor: 1, top: 'jacket', topColor: 8, bottom: 'jeans', bottomColor: 10, shoes: 1, height: 1.0, build: 1.0 },
  { name: 'מאיה', skin: 0, hairStyle: 'ponytail', hairColor: 3, top: 'tshirt', topColor: 6, bottom: 'skirt', bottomColor: 1, shoes: 0, height: 0.95, build: 0.92 },
  { name: 'דניאל', skin: 3, hairStyle: 'curly', hairColor: 0, top: 'hoodie', topColor: 4, bottom: 'pants', bottomColor: 1, shoes: 0, height: 1.03, build: 1.08 },
  { name: 'תמר', skin: 2, hairStyle: 'long', hairColor: 5, top: 'tank', topColor: 12, bottom: 'shorts', bottomColor: 3, shoes: 1, height: 0.97, build: 0.95 },
];
export function defaultAppearance() { return { ...PRESETS[0] }; }

const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8);

export class CharacterModel {
  constructor(appearance) {
    this.root = new THREE.Group();
    this.mats = {
      skin: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
      hair: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      top: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      bottom: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      shoes: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      eye: new THREE.MeshBasicMaterial({ color: 0x111111 }),
    };
    this._build();
    this.phase = 0;
    this.blink = 0;
    this.cur = {}; // current joint angles
    this.setAppearance(appearance || defaultAppearance());
  }

  _mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = false;
    parent.add(m); return m;
  }
  _pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  _build() {
    const M = this.mats;
    const body = this.body = this._pivot(this.root, 0, 0, 0);
    const hips = this.hips = this._pivot(body, 0, 0.95, 0);
    this.pelvis = this._mesh(new THREE.BoxGeometry(0.32, 0.18, 0.2), M.bottom, hips, 0, 0.02, 0);
    const spine = this.spine = this._pivot(hips, 0, 0.08, 0);
    const torso = this.torso = this._mesh(cap(0.15, 0.26), M.top, spine, 0, 0.24, 0);
    torso.scale.set(1.18, 1, 0.75);
    this.chest = torso;
    const neck = this.neck = this._pivot(spine, 0, 0.5, 0);
    this._mesh(cap(0.05, 0.06), M.skin, neck, 0, 0.03, 0);
    const head = this.head = this._pivot(neck, 0, 0.14, 0.01);
    const skull = this._mesh(new THREE.SphereGeometry(0.115, 16, 12), M.skin, head, 0, 0, 0);
    skull.scale.set(0.92, 1.05, 1);
    this._mesh(new THREE.SphereGeometry(0.035, 8, 6), M.skin, head, 0, -0.01, 0.11); // nose
    this.eyes = [];
    for (const s of [-1, 1]) this.eyes.push(this._mesh(new THREE.SphereGeometry(0.016, 8, 6), M.eye, head, s * 0.04, 0.025, 0.098));
    this.hairGroup = this._pivot(head, 0, 0, 0);
    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = this._pivot(spine, s * 0.21, 0.42, 0);
      const upper = this._mesh(cap(0.055, 0.2), M.top, sh, 0, -0.14, 0);
      const elbow = this._pivot(sh, 0, -0.29, 0);
      const lower = this._mesh(cap(0.048, 0.2), M.skin, elbow, 0, -0.13, 0);
      const hand = this._mesh(new THREE.SphereGeometry(0.052, 8, 6), M.skin, elbow, 0, -0.28, 0.01);
      this.arms.push({ sh, upper, elbow, lower, hand, s });
    }
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = this._pivot(hips, s * 0.09, -0.04, 0);
      const upper = this._mesh(cap(0.08, 0.3), M.bottom, hip, 0, -0.21, 0);
      const knee = this._pivot(hip, 0, -0.43, 0);
      const lower = this._mesh(cap(0.065, 0.3), M.bottom, knee, 0, -0.2, 0);
      const foot = this._mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), M.shoes, knee, 0, -0.44, 0.05);
      this.legs.push({ hip, upper, knee, lower, foot, s });
    }
    this.skirt = this._mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.36, 12, 1, true), M.bottom, hips, 0, -0.15, 0);
    this.skirt.material = M.bottom;
    this.hood = this._mesh(new THREE.TorusGeometry(0.11, 0.045, 6, 12), M.top, spine, 0, 0.5, -0.06);
    this.hood.rotation.x = Math.PI / 2.4;
  }

  _hair(style) {
    const g = this.hairGroup, M = this.mats.hair;
    while (g.children.length) { const c = g.children.pop(); c.geometry.dispose(); }
    const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = this._mesh(geo, M, g, x, y, z); m.scale.set(sx, sy, sz); return m; };
    const capGeo = new THREE.SphereGeometry(0.122, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    switch (style) {
      case 'short': add(capGeo, 0, 0.012, -0.005, 0.95, 1.05, 1.05); break;
      case 'buzz': add(capGeo, 0, 0.005, 0, 0.93, 1.0, 1.0); break;
      case 'long':
        add(capGeo, 0, 0.012, -0.005, 0.97, 1.08, 1.06);
        add(new THREE.BoxGeometry(0.24, 0.32, 0.08), 0, -0.13, -0.08);
        break;
      case 'ponytail':
        add(capGeo, 0, 0.012, -0.005, 0.95, 1.06, 1.05);
        add(cap(0.04, 0.16), 0, -0.06, -0.15).rotation.x = 0.4;
        break;
      case 'curly':
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          add(new THREE.SphereGeometry(0.05, 6, 5), Math.cos(a) * 0.1, 0.06 + (i % 2) * 0.03, Math.sin(a) * 0.1 - 0.01);
        }
        add(capGeo, 0, 0.03, -0.005, 1.05, 1.1, 1.1);
        break;
      case 'mohawk':
        add(capGeo, 0, 0.0, 0, 0.92, 0.98, 0.98);
        add(new THREE.BoxGeometry(0.035, 0.08, 0.22), 0, 0.12, -0.01);
        break;
      case 'bun':
        add(capGeo, 0, 0.012, -0.005, 0.95, 1.06, 1.05);
        add(new THREE.SphereGeometry(0.055, 10, 8), 0, 0.1, -0.09);
        break;
      default: break;
    }
  }

  setAppearance(app) {
    this.app = { ...app };
    const M = this.mats;
    M.skin.color.setHex(SKIN_TONES[app.skin] ?? SKIN_TONES[1]);
    M.hair.color.setHex(HAIR_COLORS[app.hairColor] ?? HAIR_COLORS[0]);
    M.top.color.setHex(CLOTH_COLORS[app.topColor] ?? 0x2e86c1);
    M.bottom.color.setHex(CLOTH_COLORS[app.bottomColor] ?? 0x34495e);
    M.shoes.color.setHex(app.shoes === 1 ? 0x1d1d1f : 0xf2f2f2);
    this._hair(app.hairStyle);
    const top = app.top;
    for (const a of this.arms) {
      a.upper.material = top === 'tank' ? M.skin : M.top;
      a.lower.material = top === 'jacket' || top === 'hoodie' ? M.top : M.skin;
    }
    this.hood.visible = top === 'hoodie';
    const b = app.bottom;
    for (const l of this.legs) {
      l.upper.material = b === 'skirt' ? M.skin : M.bottom;
      l.lower.material = b === 'shorts' || b === 'skirt' ? M.skin : M.bottom;
    }
    this.skirt.visible = b === 'skirt';
    const h = clamp(app.height || 1, 0.85, 1.15), w = clamp(app.build || 1, 0.8, 1.25);
    this.body.scale.set(w, h, w);
    this.torso.scale.set(1.18 * w, 1, 0.75 * (0.9 + w * 0.1));
  }

  // state: { speed, run, grounded, vy, mode, steer, doorReach }
  animate(dt, s) {
    const t = this.cur;
    const target = {};
    const mode = s.mode || 'foot';
    const speed = s.speed || 0;
    const runK = clamp((speed - 2) / 3.5, 0, 1);
    const moveK = clamp(speed / 1.4, 0, 1);
    this.phase += dt * (speed / (1.3 + runK * 0.9)) * Math.PI * 2 * 0.5;
    const ph = this.phase;
    const sin = Math.sin(ph), cos = Math.cos(ph);
    let hipsY = 0.95, bodyLean = 0, bodyZ = 0;

    if (mode === 'foot') {
      const swing = (0.42 + runK * 0.45) * moveK;
      target.legL = -sin * swing; target.legR = sin * swing;
      target.kneeL = Math.max(0, cos) * (0.3 + runK * 1.0) * moveK + 0.05;
      target.kneeR = Math.max(0, -cos) * (0.3 + runK * 1.0) * moveK + 0.05;
      target.armL = sin * (0.35 + runK * 0.6) * moveK; target.armR = -sin * (0.35 + runK * 0.6) * moveK;
      target.elbowL = -0.15 - runK * 1.1; target.elbowR = -0.15 - runK * 1.1;
      target.armSide = 0.08;
      bodyLean = 0.04 * moveK + runK * 0.18;
      hipsY = 0.95 - Math.abs(Math.sin(ph)) * 0.035 * moveK - runK * 0.04;
      const breathe = Math.sin(performance.now() * 0.002) * 0.015 * (1 - moveK);
      target.spine = breathe + bodyLean;
      if (!s.grounded) {
        const up = s.vy > 0;
        target.legL = up ? -0.6 : -0.25; target.legR = up ? 0.15 : 0.05;
        target.kneeL = up ? 0.9 : 0.35; target.kneeR = up ? 0.7 : 0.3;
        target.armL = -0.5; target.armR = -0.5; target.armSide = 0.35;
        target.elbowL = -0.6; target.elbowR = -0.6;
      }
      if (s.doorReach) { target.armR = -1.2; target.elbowR = -0.2; }
    } else if (mode === 'sit' || mode === 'drive' || mode === 'passenger') {
      target.legL = -1.45; target.legR = -1.45; target.kneeL = 1.4; target.kneeR = 1.4;
      target.spine = -0.05; target.armSide = 0.12;
      hipsY = 0.5;
      if (mode === 'drive') {
        const st = (s.steer || 0) * 0.35;
        target.armL = -1.05 + st; target.armR = -1.05 - st; target.elbowL = -0.55; target.elbowR = -0.55;
        target.legL = -1.25; target.legR = -1.25; target.kneeL = 1.1; target.kneeR = 1.1;
      } else { target.armL = -0.35; target.armR = -0.35; target.elbowL = -0.9; target.elbowR = -0.9; }
    } else if (mode === 'ride') { // bicycle / motorcycle
      const pedal = s.pedal ? Math.sin(ph * 1.2) : 0;
      target.legL = -0.95 + pedal * 0.35; target.legR = -0.95 - pedal * 0.35;
      target.kneeL = 1.2 - pedal * 0.3; target.kneeR = 1.2 + pedal * 0.3;
      target.armL = -1.15; target.armR = -1.15; target.elbowL = -0.2; target.elbowR = -0.2;
      target.spine = 0.35; target.armSide = 0.15;
      hipsY = 0.62;
      bodyZ = -0.05;
    }
    const k = 14;
    for (const key of ['legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR', 'spine', 'armSide']) {
      t[key] = damp(t[key] ?? 0, target[key] ?? 0, k, dt);
    }
    t.hipsY = damp(t.hipsY ?? hipsY, hipsY, k, dt);
    this.hips.position.y = t.hipsY;
    this.hips.position.z = bodyZ;
    this.spine.rotation.x = t.spine;
    this.legs[0].hip.rotation.x = t.legL; this.legs[1].hip.rotation.x = t.legR;
    this.legs[0].knee.rotation.x = t.kneeL; this.legs[1].knee.rotation.x = t.kneeR;
    this.arms[0].sh.rotation.x = t.armL; this.arms[1].sh.rotation.x = t.armR;
    this.arms[0].sh.rotation.z = -t.armSide; this.arms[1].sh.rotation.z = t.armSide;
    this.arms[0].elbow.rotation.x = t.elbowL; this.arms[1].elbow.rotation.x = t.elbowR;
    this.head.rotation.x = -t.spine * 0.6;
    // blinking
    this.blink -= dt;
    const closed = this.blink < 0.12;
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = closed ? 0.2 : 1;
  }
}
