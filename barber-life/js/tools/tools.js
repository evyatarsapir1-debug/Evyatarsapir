// Barber tools: clipper with interchangeable guards and taper lever, and a zero-gap trimmer.
// Model frame: origin = centre of the cutting edge, +X along the blade, +Y along the body (handle), +Z away from the
// head. Guard teeth reach from the blade towards the head (-Z), so the guard length is the hair length that stays.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const GUARDS = [
  { id: '0', label: '0', name: 'ללא מסרק', mm: 0.5, color: null },
  { id: '0.5', label: '½', name: 'מסרק ½', mm: 1.5, color: '#9b59b6' },
  { id: '1', label: '1', name: 'מסרק 1', mm: 3, color: '#e74c3c' },
  { id: '1.5', label: '1½', name: 'מסרק 1½', mm: 4.5, color: '#e67e22' },
  { id: '2', label: '2', name: 'מסרק 2', mm: 6, color: '#f1c40f' },
  { id: '3', label: '3', name: 'מסרק 3', mm: 10, color: '#2ecc71' },
  { id: '4', label: '4', name: 'מסרק 4', mm: 13, color: '#1abc9c' },
  { id: '6', label: '6', name: 'מסרק 6', mm: 19, color: '#3498db' },
  { id: '8', label: '8', name: 'מסרק 8', mm: 25, color: '#34495e' },
];
export const LEVER_OPEN_MM = 1.5;

export const TOOLS = {
  clipper: {
    id: 'clipper', name: 'מכונת תספורת', icon: '✂️',
    radius: 0.02, depth: 0.0045, // footprint: half the 46 mm blade along it, a narrow strip across it
    desc: 'להב רחב (46 מ״מ) למסה של השיער. מחליפים מסרקי גובה כדי לקבוע כמה שיער נשאר. ידית הטייפר פתוחה = +1.5 מ״מ, מתאימה לחצאי מספרים במעברים.',
    usesGuards: true,
  },
  trimmer: {
    id: 'trimmer', name: 'מכונת פיניש (טרימר)', icon: '🪒',
    radius: 0.011, depth: 0.003,
    desc: 'להב צר ומדויק (Zero-gap, ‏0.2 מ״מ) לקווי מתאר: מסביב לאוזן, פאות ועורף. משאיר עור כמעט חלק — עובדים בעדינות ובתנועות קצרות.',
    usesGuards: false, fixedMM: 0.2,
  },
  scissors: {
    id: 'scissors', name: 'מספריים ומסרק', icon: '✂',
    radius: 0.016, depth: 0.006,
    desc: 'מספריים על מסרק: המסרק מרים את השיער לגובה שבחרת והמספריים גוזרות את מה שמעליו. לשיער ארוך בחלק העליון, לפוני ולמעברים רכים.',
    usesLength: true,
  },
  thinning: {
    id: 'thinning', name: 'מספרי דילול', icon: '〰',
    radius: 0.012, fraction: 0.32,
    desc: 'להב אחד עם שיניים: גוזר רק חלק מהשערות (כשליש) ומקצר אותן. מוריד נפח ומוסיף טקסטורה בלי לשנות את קו התספורת.',
  },
  duster: {
    id: 'duster', name: 'מברשת צוואר', icon: '🧹',
    radius: 0.07,
    desc: 'מנקה שערות שנחתכו מהגלימה, מהצוואר ומהכתפיים. לקוח יוצא נקי = גימור מקצועי.',
  },
};

/** Comb heights for scissor-over-comb (mm of hair left). */
export const SCISSOR_LENGTHS = [8, 10, 13, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60];

function metal(color = '#d9dadc', rough = 0.22) { return new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough }); }

function buildBlade(width, teeth, mat) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, 0.0018), mat);
  plate.position.set(0, 0.007, 0);
  g.add(plate);
  const toothGeo = new THREE.BoxGeometry(width / teeth * 0.55, 0.004, 0.0016);
  const mover = new THREE.Group();
  for (let i = 0; i < teeth; i++) {
    const t = new THREE.Mesh(toothGeo, mat);
    t.position.set(-width / 2 + (i + 0.5) * width / teeth, 0.0, 0);
    g.add(t);
    const m = new THREE.Mesh(toothGeo, mat);
    m.position.set(-width / 2 + (i + 0.5) * width / teeth, 0.002, 0.0016);
    mover.add(m);
  }
  const movingPlate = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.009, 0.0014), mat);
  movingPlate.position.set(0, 0.008, 0.0017);
  mover.add(movingPlate);
  g.add(mover);
  g.userData.mover = mover;
  return g;
}

function buildGuard(guard) {
  const g = new THREE.Group();
  if (!guard.color) return g;
  const h = guard.mm * 0.001;
  const mat = new THREE.MeshPhysicalMaterial({ color: guard.color, roughness: 0.35, clearcoat: 0.6, transparent: true, opacity: 0.92 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.034, 0.0016), mat);
  plate.position.set(0, 0.016, -0.0022);
  g.add(plate);
  const n = 12;
  for (let i = 0; i < n; i++) {
    // each comb tooth: tall at the cutting edge (= guard length), sloping back along the body
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0, -h); shape.quadraticCurveTo(0.006, -h - 0.001, 0.03, -0.001); shape.lineTo(0.03, 0); shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.0013, bevelEnabled: false });
    // shape x -> along the body (+Y), shape y -> towards the head (-Z), extrusion -> tooth thickness (+X)
    geo.applyMatrix4(_swizzle);
    const tooth = new THREE.Mesh(geo, mat);
    tooth.position.set(-0.023 + i * 0.046 / (n - 1) + 0.00065, -0.001, -0.002);
    g.add(tooth);
  }
  g.userData.mat = mat;
  return g;
}

export class ToolRig {
  constructor(scene) {
    this.root = new THREE.Group(); this.root.name = 'toolRig';
    scene.add(this.root);
    this.models = {
      clipper: this._buildClipper(), trimmer: this._buildTrimmer(),
      scissors: this._buildScissors(false), thinning: this._buildScissors(true), duster: this._buildDuster(),
    };
    this.scissorLen = 40;
    this.pointCut = false;
    this.quality = { clipper: 0.7, trimmer: 0.75, scissors: 0.75, thinning: 1, duster: 1 }; // blade edge sharpness (shop upgrades)
    for (const m of Object.values(this.models)) { m.visible = false; this.root.add(m); }
    this.active = 'clipper';
    this.models.clipper.visible = true;
    this.guard = GUARDS[5];
    this.lever = false;
    this.running = false;
    this._t = 0;
    this.setGuard(this.guard.id);
  }

  _buildClipper() {
    const g = new THREE.Group();
    const steel = metal();
    const blade = buildBlade(0.046, 24, steel);
    g.add(blade);
    g.userData.blade = blade;
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#141416', roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.4 });
    const gold = metal('#c9a45c', 0.3);
    const headHousing = new THREE.Mesh(new RoundedBoxGeometry(0.052, 0.032, 0.024, 3, 0.008), bodyMat);
    headHousing.position.set(0, 0.028, 0.009);
    g.add(headHousing);
    const bodyGeo = new THREE.CylinderGeometry(0.0185, 0.0165, 0.12, 32);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1.25, 1, 0.82);
    body.position.set(0, 0.1, 0.01);
    g.add(body);
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.0165, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
    end.scale.set(1.25, 0.5, 0.82); end.position.set(0, 0.16, 0.01);
    g.add(end);
    for (const y of [0.05, 0.155]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0182, 0.0015, 8, 32), gold);
      ring.rotation.x = Math.PI / 2; ring.scale.set(1.25, 0.82, 1); ring.position.set(0, y, 0.01);
      g.add(ring);
    }
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.002), new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.9 }));
    grip.position.set(0, 0.11, 0.0245);
    g.add(grip);
    const lever = new THREE.Mesh(new RoundedBoxGeometry(0.008, 0.028, 0.008, 2, 0.003), gold);
    lever.position.set(0.028, 0.035, 0.01);
    g.add(lever);
    g.userData.lever = lever;
    const sw = new THREE.Mesh(new RoundedBoxGeometry(0.01, 0.016, 0.004, 2, 0.002), gold);
    sw.position.set(0, 0.08, 0.026);
    g.add(sw);
    // cord
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.165, 0.01), new THREE.Vector3(0, 0.21, 0.0), new THREE.Vector3(0.02, 0.28, -0.04), new THREE.Vector3(0.06, 0.4, -0.12)]);
    const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0028, 8), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.5 }));
    g.add(cord);
    const guardHolder = new THREE.Group();
    g.add(guardHolder);
    g.userData.guardHolder = guardHolder;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  _buildTrimmer() {
    const g = new THREE.Group();
    const steel = metal('#e6e6e8', 0.15);
    const blade = buildBlade(0.04, 30, steel);
    blade.scale.set(1, 0.8, 1);
    g.add(blade);
    g.userData.blade = blade;
    const gold = metal('#d4b26a', 0.25);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0135, 0.13, 32), gold);
    body.position.set(0, 0.085, 0.01);
    g.add(body);
    const neck = new THREE.Mesh(new RoundedBoxGeometry(0.044, 0.02, 0.016, 3, 0.006), steel);
    neck.position.set(0, 0.018, 0.007);
    g.add(neck);
    const knurl = new THREE.Mesh(new THREE.CylinderGeometry(0.0149, 0.0149, 0.05, 32), new THREE.MeshStandardMaterial({ color: '#b08f4c', metalness: 1, roughness: 0.6 }));
    knurl.position.set(0, 0.09, 0.01);
    g.add(knurl);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  _buildScissors(thinning) {
    const g = new THREE.Group();
    const steel = metal('#e3e4e6', 0.12);
    const dark = new THREE.MeshPhysicalMaterial({ color: '#1b1b1d', roughness: 0.35, clearcoat: 0.7 });
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, -0.004); bladeShape.lineTo(0.075, -0.0012); bladeShape.lineTo(0.078, 0); bladeShape.lineTo(0, 0.004); bladeShape.lineTo(0, -0.004);
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.0018, bevelEnabled: false });
    const blades = [];
    for (const k of [0, 1]) {
      const pivot = new THREE.Group();
      const blade = new THREE.Mesh(bladeGeo, steel);
      blade.position.set(-0.035, 0, k ? 0.0018 : 0);
      pivot.add(blade);
      if (thinning && k === 1) {
        for (let i = 0; i < 16; i++) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.0035, 0.0018), steel);
          t.position.set(-0.03 + i * 0.0042, -0.004, 0.0018);
          pivot.add(t);
        }
      }
      const shank = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.0022), steel);
      shank.position.set(-0.05, 0, k ? 0.0018 : 0);
      pivot.add(shank);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0095, 0.0022, 10, 24), dark);
      ring.position.set(-0.073, k ? 0.006 : -0.006, k ? 0.0018 : 0);
      pivot.add(ring);
      g.add(pivot);
      blades.push(pivot);
    }
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.006, 16), metal('#c9a45c', 0.3));
    screw.rotation.x = Math.PI / 2; screw.position.set(-0.035, 0, 0.001);
    g.add(screw);
    // the comb held below the scissors: lifts the hair to the chosen height
    const comb = new THREE.Group();
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.006, 0.002), dark);
    comb.add(spine);
    for (let i = 0; i < 30; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.012, 0.0016), dark);
      tooth.position.set(-0.058 + i * 0.004, -0.008, 0);
      comb.add(tooth);
    }
    comb.position.set(0, 0.012, -0.004);
    g.add(comb);
    g.userData.blades = blades;
    g.userData.comb = comb;
    g.rotation.z = 0;
    // lay the scissors so the blades run along +X (the cutting line) just above the hair ends
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const wrap = new THREE.Group();
    wrap.add(g);
    wrap.userData = g.userData;
    return wrap;
  }

  _buildDuster() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.45 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.1, 20), wood);
    handle.position.y = 0.08; g.add(handle);
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.02, 24), metal('#c9a45c', 0.3));
    ferrule.position.y = 0.025; g.add(ferrule);
    const brush = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), new THREE.MeshStandardMaterial({ color: '#efe6d6', roughness: 1 }));
    brush.scale.set(1, 0.7, 1); brush.position.y = 0.0;
    g.add(brush);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  select(id) {
    if (!TOOLS[id]) return;
    this.active = id;
    for (const [k, m] of Object.entries(this.models)) m.visible = k === id;
  }

  setGuard(id) {
    const gd = GUARDS.find((g) => g.id === id);
    if (!gd) return;
    this.guard = gd;
    const holder = this.models.clipper.userData.guardHolder;
    holder.clear();
    holder.add(buildGuard(gd));
  }

  setLever(open) {
    this.lever = open;
    this.models.clipper.userData.lever.rotation.z = open ? -0.7 : 0;
  }

  get tool() { return TOOLS[this.active]; }

  /** Hair length (mm) the active tool leaves. */
  get cutMM() {
    const t = this.tool;
    if (t.usesLength) return this.scissorLen;
    if (t.id === 'thinning' || t.id === 'duster') return null;
    if (!t.usesGuards) return t.fixedMM;
    return this.guard.mm + (this.lever ? LEVER_OPEN_MM : 0);
  }

  /** Physical standoff of the blade from the scalp (m). */
  get standoff() {
    const t = this.tool;
    if (t.usesLength) return Math.min(this.scissorLen, 30) * 0.001 + 0.004;
    if (t.id === 'thinning') return 0.016;
    if (t.id === 'duster') return 0.025;
    return t.usesGuards && this.guard.color ? this.guard.mm * 0.001 + 0.0015 : 0.0018;
  }

  /** Place the active model on the head surface (world point + normal), body pointing down/away from the head. */
  placeOnHead(point, normal, dt) {
    const tDown = _v2.set(0, -1, 0).addScaledVector(normal, normal.y);
    if (tDown.lengthSq() < 0.02) tDown.set(0, 0, -1).addScaledVector(normal, -normal.z);
    tDown.normalize();
    const Y = _v3.copy(tDown).multiplyScalar(0.94).addScaledVector(normal, 0.34).normalize();
    const X = _v4.crossVectors(Y, normal).normalize();
    const Z = _v5.crossVectors(X, Y).normalize();
    _m.makeBasis(X, Y, Z);
    _q.setFromRotationMatrix(_m);
    _p.copy(point).addScaledVector(normal, this.standoff);
    this._approach(_p, _q, dt, 22);
  }

  rest(pos, dt) {
    _q.setFromEuler(_e.set(-Math.PI / 2, 0, Math.PI / 2 - 0.3));
    this._approach(pos, _q, dt, 7);
  }

  _approach(pos, quat, dt, speed) {
    const k = 1 - Math.exp(-speed * dt);
    this.root.position.lerp(pos, k);
    this.root.quaternion.slerp(quat, k);
  }

  update(dt) {
    this._t += dt;
    const m = this.models[this.active];
    const mover = m.userData.blade?.userData.mover;
    const bl = m.userData.blades;
    if (bl) {
      const open = this.running ? 0.12 + 0.12 * Math.sin(this._t * 22) : 0.18;
      bl[0].rotation.z = open; bl[1].rotation.z = -open;
    }
    if (this.active === 'duster') {
      m.rotation.z = this.running ? Math.sin(this._t * 14) * 0.35 : 0;
      return;
    }
    if (this.running && !bl) {
      if (mover) mover.position.x = Math.sin(this._t * 380) * 0.0012;
      m.position.set((Math.random() - 0.5) * 0.0004, (Math.random() - 0.5) * 0.0004, 0);
    } else {
      if (mover) mover.position.x = 0;
      m.position.set(0, 0, 0);
    }
  }
}

const _swizzle = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _e = new THREE.Euler();
