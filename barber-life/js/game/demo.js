// 3D demonstration: plans a real sequence of strokes for a haircut (longest guard first, then shorter guards lower,
// scissors on top, thinning, trimmer outline) and plays it on the head with the real tools — the hair is really cut.
import * as THREE from 'three';
import { RADII, dirFromAzY, hairMask, hairlineY } from '../hair/scalp.js';
import { GUARDS, LEVER_OPEN_MM } from '../tools/tools.js';
import { targetLength } from '../data/haircuts.js';

/** @returns array of { tool, guard?, lever?, label, points: Vector3[] (unit dirs), lens? } */
export function planDemo(spec) {
  const settings = [];
  for (const g of GUARDS) for (const lever of [false, true]) settings.push({ guard: g, lever, mm: g.mm + (lever ? LEVER_OPEN_MM : 0) });
  settings.sort((a, b) => b.mm - a.mm || a.lever - b.lever);
  const best = (t) => settings.find((s) => s.mm <= t + 0.3) || null;
  const clip = new Map(), top = [], trim = [];
  // sample the whole scalp column by column (upward strokes), classify every point by the tool that gives its length
  for (let az = -Math.PI; az < Math.PI; az += 0.1) {
    for (let y = -0.8; y <= 0.99; y += 0.035) {
      const d = dirFromAzY(az, y, new THREE.Vector3());
      if (hairMask(d) <= 0.02) continue;
      const t = targetLength(spec, d);
      if (t <= 0.3) { trim.push(d); continue; }
      const s = best(t);
      if (t >= 26 || !s || t - s.mm > 1.2) { top.push({ d, len: t }); continue; }
      const key = s.mm.toFixed(1);
      if (!clip.has(key)) clip.set(key, { s, points: [] });
      clip.get(key).points.push(d);
    }
  }
  const steps = [];
  for (const { s, points } of [...clip.values()].sort((a, b) => b.s.mm - a.s.mm)) {
    steps.push({ tool: 'clipper', guard: s.guard.id, lever: s.lever, label: `${s.guard.name}${s.lever ? ' + ידית פתוחה' : ''} (${s.mm} מ״מ)`, points });
  }
  if (top.length) steps.push({ tool: 'scissors', label: 'מספריים על מסרק', points: top.map((p) => p.d), lens: top.map((p) => p.len) });
  if (spec.texture) {
    const tx = top.filter((p, i) => i % 2 === 0 && p.len > 15);
    if (tx.length) steps.push({ tool: 'thinning', label: 'מספרי דילול — טקסטורה', points: tx.map((p) => p.d) });
  }
  if (spec.outline) {
    for (let az = -Math.PI; az < Math.PI; az += 0.05) {
      const d = dirFromAzY(az, hairlineY(Math.abs(az)) + 0.015, new THREE.Vector3());
      if (targetLength(spec, d) <= 3.2) trim.push(d);
    }
  }
  if (trim.length) steps.push({ tool: 'trimmer', label: 'טרימר — עור חלק וקווי מתאר', points: trim });
  return steps;
}

/** Plays a plan on the head. */
export class DemoPlayer {
  constructor(ctx) { this.ctx = ctx; this.plan = null; }

  start(plan, { speed = 1, onStep, onDone } = {}) {
    this.plan = plan; this.si = 0; this.pi = 0; this.speed = speed; this.onStep = onStep; this.onDone = onDone;
    this.stroke = 1000;
    this._applyStep();
  }

  get active() { return !!this.plan; }
  get progress() {
    if (!this.plan) return 1;
    const total = this.plan.reduce((a, s) => a + s.points.length, 0);
    let done = 0;
    for (let i = 0; i < this.si; i++) done += this.plan[i].points.length;
    return (done + this.pi) / total;
  }

  _applyStep() {
    const s = this.plan[this.si];
    if (!s) return;
    const { tools } = this.ctx;
    tools.select(s.tool);
    if (s.guard) tools.setGuard(s.guard);
    if (s.tool === 'clipper') tools.setLever(!!s.lever);
    this.stroke++;
    this.onStep?.(s, this.si);
  }

  stop() { this.plan = null; }

  finishNow() { while (this.plan) this.update(1, 100000); }

  /** Advance; returns the head-local point the tool is at (for placing the 3D tool), or null. */
  update(dt, budget = null) {
    if (!this.plan) return null;
    const { cutAtLocal } = this.ctx;
    let n = budget ?? Math.max(1, Math.round(dt * 900 * this.speed));
    let last = null;
    while (n-- > 0 && this.plan) {
      const s = this.plan[this.si];
      if (!s) { const done = this.onDone; this.plan = null; done?.(); break; }
      if (this.pi >= s.points.length) { this.si++; this.pi = 0; if (this.plan[this.si]) this._applyStep(); continue; }
      const d = s.points[this.pi];
      const local = new THREE.Vector3(d.x * RADII.x, d.y * RADII.y, d.z * RADII.z);
      if (s.tool === 'scissors') this.ctx.tools.scissorLen = s.lens[this.pi];
      cutAtLocal(local, { stroke: this.stroke, demo: true });
      last = local;
      this.pi++;
    }
    return last;
  }
}
