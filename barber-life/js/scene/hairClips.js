// Barber sectioning clips (duckbill clips) that hold the long top hair while the sides are done with the clipper.
// They sit on the hair surface (lifted by the real local hair length), lean along the head, and appear only when
// they make sense: clipper/trimmer in hand and long hair on top. Purely physical props — cutting is unchanged.
import * as THREE from 'three';
import { RADII, surfaceNormal } from '../hair/scalp.js';

const SPOTS = [ // on the parietal ridge ("horseshoe"), where barbers section the top from the sides
  { d: [0, 0.7, 0.66], twist: 0 },
  { d: [-0.66, 0.68, 0.05], twist: 0 },
  { d: [0.66, 0.68, 0.05], twist: 0 },
  { d: [0, 0.7, -0.66], twist: 0 },
];
const MIN_TOP = 22; // mm: shorter hair doesn't need clipping

function buildClip(color) {
  const g = new THREE.Group();
  const plastic = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.9, roughness: 0.25 });
  const L = 0.078;
  // two long jaws, slightly open at the back (spring end), tips touching at the front
  for (const s of [1, -1]) {
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.0035, L), plastic);
    jaw.geometry.translate(0, 0, -L / 2); // pivot at the tip
    jaw.position.set(0, s * 0.0018, L / 2);
    jaw.rotation.x = s * -0.07;
    // grip ridges on the top jaw
    if (s > 0) for (let k = 0; k < 5; k++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0012, 0.0016), plastic);
      r.position.set(0, 0.0022, -0.012 - k * 0.0045); jaw.add(r);
    }
    g.add(jaw);
  }
  // steel spring hinge near the back
  const hinge = new THREE.Mesh(new THREE.TorusGeometry(0.0042, 0.0011, 8, 18), steel);
  hinge.rotation.y = Math.PI / 2; hinge.position.set(0, 0.0005, -L / 2 + 0.014); g.add(hinge);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.014, 8), steel);
  pin.rotation.z = Math.PI / 2; pin.position.copy(hinge.position); g.add(pin);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class HairClips {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'hairClips';
    this.clips = SPOTS.map((s, i) => {
      const c = buildClip(i % 2 ? '#2a2d33' : '#151518');
      c.userData.spot = s;
      const d = new THREE.Vector3(...s.d).normalize();
      const k = 1 / Math.hypot(d.x / RADII.x, d.y / RADII.y, d.z / RADII.z);
      c.userData.surf = d.clone().multiplyScalar(k);          // point on the scalp
      c.userData.n = surfaceNormal(c.userData.surf);           // outward normal
      this.group.add(c);
      return c;
    });
    this.group.visible = false;
    this._t = 0;
  }
  attach(head) { if (this.group.parent !== head) head.add(this.group); }

  /** Re-place the clips on the hair every ~0.4 s; show them only with a clipper/trimmer and long hair on top. */
  update(dt, hair, toolId, playing) {
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.4;
    const want = playing && (toolId === 'clipper' || toolId === 'trimmer');
    let any = false;
    for (const c of this.clips) {
      const { surf, n, spot } = c.userData;
      const len = want ? hair.sampleLength(surf, 0.014) : null;
      const show = len != null && len >= MIN_TOP;
      c.visible = show;
      if (!show) continue;
      any = true;
      // sit on top of the (gathered) hair: about 55% of its length, capped
      const lift = Math.min(len, 60) * 0.00034 + 0.0015;
      c.position.copy(surf).addScaledVector(n, lift);
      // lie along the head: jaws point front→back, tangent to the surface
      const back = new THREE.Vector3(0, 0, -1).addScaledVector(n, n.z).normalize();
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), back.clone().negate(), n);
      c.quaternion.setFromRotationMatrix(m);
      c.rotateY(spot.twist);
    }
    this.group.visible = any;
  }
}
