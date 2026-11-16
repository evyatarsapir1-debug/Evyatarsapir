// Animated exercise demonstrations drawn as SVG.
// Each pose describes joint positions; limbs can be given as angles or as a target
// point that a simple two-bone IK solves. The figure loops A -> B -> A with SMIL.

const UA = 20, FA = 19, TH = 28, SH = 28, NECK = 7, HEAD_R = 8.5;
const DEG = Math.PI / 180;

// angle convention: 0 = straight down, 90 = forward (right), 180 = up, -90 = backward
const dir = (a) => [Math.sin(a * DEG), Math.cos(a * DEG)];
const add = (p, d, l) => [p[0] + d[0] * l, p[1] + d[1] * l];

function ik(root, target, l1, l2, bend) {
  let dx = target[0] - root[0], dy = target[1] - root[1];
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const base = Math.atan2(dy, dx);
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const off = Math.acos(Math.max(-1, Math.min(1, cos)));
  const a = base + off * bend;
  const mid = [root[0] + Math.cos(a) * l1, root[1] + Math.sin(a) * l1];
  const end = [root[0] + dx, root[1] + dy];
  return [mid, end];
}

function limb(root, spec, l1, l2, defBend) {
  if (!spec) return [add(root, [0, 1], l1), add(root, [0, 1], l1 + l2)];
  if (spec.to) return ik(root, spec.to, l1, l2, spec.bend ?? defBend);
  const [a1, a2] = spec.a;
  const m = add(root, dir(a1), l1);
  return [m, add(m, dir(a2), l2)];
}

/** Resolve a side-view pose to points. */
function solve(p) {
  const hip = p.hip, sh = p.sh;
  const tv = [sh[0] - hip[0], sh[1] - hip[1]];
  const tl = Math.hypot(tv[0], tv[1]) || 1;
  const td = [tv[0] / tl, tv[1] / tl];
  // head: continue the torso direction, optionally tilted (degrees, + = toward facing side)
  const tilt = (p.hd || 0) * DEG;
  const hdDir = [td[0] * Math.cos(tilt) - td[1] * Math.sin(tilt), td[0] * Math.sin(tilt) + td[1] * Math.cos(tilt)];
  const neck = add(sh, td, 2);
  const head = add(neck, hdDir, NECK + HEAD_R);
  const [e1, w1] = limb(sh, p.a1, UA, FA, 1);
  const [e2, w2] = limb(sh, p.a2 || p.a1, UA, FA, 1);
  const [k1, f1] = limb(hip, p.l1, TH, SH, -1);
  const [k2, f2] = limb(hip, p.l2 || p.l1, TH, SH, -1);
  const toe = (f, t) => t || [f[0] + (p.face === 'left' ? -8 : 8), f[1] + 1];
  // spine as a quadratic curve; arch bends it perpendicular to the torso
  const arch = p.arch || 0;
  const mid = [(hip[0] + sh[0]) / 2 - td[1] * arch, (hip[1] + sh[1]) / 2 + td[0] * arch];
  return { hip, sh, head, neck, e1, w1, e2, w2, k1, f1, k2, f2, t1: toe(f1, p.toe1), t2: toe(f2, p.toe2), mid };
}

/** Front-view pose (used for lateral raises, jumping jacks, wall angels). */
function solveFront(p) {
  const cx = p.cx ?? 100, sy = p.sy ?? 42, hy = p.hy ?? 80;
  const shL = [cx - 13, sy], shR = [cx + 13, sy];
  const hpL = [cx - 7, hy], hpR = [cx + 7, hy];
  const [u, f] = p.arms; // outward angles from straight down
  const mR = add(shR, dir(u), UA), wR = add(mR, dir(f), FA);
  const mL = [2 * cx - mR[0], mR[1]], wL = [2 * cx - wR[0], wR[1]];
  const s = p.legs || 0;
  const kR = add(hpR, dir(s), TH), fR = add(kR, dir(s), SH);
  const kL = [2 * cx - kR[0], kR[1]], fL = [2 * cx - fR[0], fR[1]];
  const head = [cx, sy - 18];
  return { shL, shR, hpL, hpR, mR, wR, mL, wL, kR, fR, kL, fL, head };
}

const f1 = (n) => Math.round(n * 10) / 10;
const pt = (p) => `${f1(p[0])},${f1(p[1])}`;

function anim(attr, a, b, dur) {
  if (a === b) return '';
  return `<animate attributeName="${attr}" values="${a};${b};${a}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"/>`;
}

function line(a1, a2, b1, b2, cls, dur, w = 7) {
  return `<line class="${cls}" x1="${f1(a1[0])}" y1="${f1(a1[1])}" x2="${f1(a2[0])}" y2="${f1(a2[1])}" stroke-width="${w}" stroke-linecap="round">` +
    anim('x1', f1(a1[0]), f1(b1[0]), dur) + anim('y1', f1(a1[1]), f1(b1[1]), dur) +
    anim('x2', f1(a2[0]), f1(b2[0]), dur) + anim('y2', f1(a2[1]), f1(b2[1]), dur) + '</line>';
}
function circle(a, b, r, cls, dur, fill) {
  return `<circle class="${cls}" cx="${f1(a[0])}" cy="${f1(a[1])}" r="${r}" ${fill ? `fill="${fill}"` : 'fill="none"'} stroke-width="5">` +
    anim('cx', f1(a[0]), f1(b[0]), dur) + anim('cy', f1(a[1]), f1(b[1]), dur) + '</circle>';
}
function path(da, db, cls, dur, w = 8) {
  return `<path class="${cls}" d="${da}" fill="none" stroke-width="${w}" stroke-linecap="round">${anim('d', da, db, dur)}</path>`;
}

function props(list = []) {
  return list.map((p) => {
    if (p.t === 'bench') return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${135 - p.y}" rx="3" fill="var(--surface-2)" stroke="var(--border-strong)"/>`;
    if (p.t === 'box') return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${135 - p.y}" rx="3" fill="var(--surface-2)" stroke="var(--border-strong)"/>`;
    if (p.t === 'bar') return `<line x1="${p.x1}" y1="${p.y}" x2="${p.x2}" y2="${p.y}" stroke="var(--text-3)" stroke-width="4" stroke-linecap="round"/>` +
      (p.posts ? `<line x1="${p.x1}" y1="${p.y}" x2="${p.x1}" y2="135" stroke="var(--border-strong)" stroke-width="3"/><line x1="${p.x2}" y1="${p.y}" x2="${p.x2}" y2="135" stroke="var(--border-strong)" stroke-width="3"/>` : '');
    if (p.t === 'wall') return `<rect x="${p.x - 6}" y="8" width="6" height="127" fill="var(--surface-2)" stroke="var(--border-strong)"/>`;
    if (p.t === 'frame') return `<rect x="${p.x}" y="14" width="5" height="121" fill="var(--surface-2)" stroke="var(--border-strong)"/>`;
    if (p.t === 'post') return `<rect x="${p.x}" y="10" width="6" height="125" rx="2" fill="var(--surface-2)" stroke="var(--border-strong)"/>`;
    if (p.t === 'mat') return `<rect x="${p.x}" y="133" width="${p.w}" height="4" rx="2" fill="rgba(139,92,246,.35)"/>`;
    return '';
  }).join('');
}

/**
 * Build the SVG markup for an exercise demo.
 * fig: { A, B, props, hl:['arms','legs','torso'], db:true, band:[x,y] , front:true, dur }
 */
export function figureSVG(fig, { animate = true } = {}) {
  const dur = fig.dur || 2.6;
  const hl = new Set(fig.hl || []);
  const c = (part) => (hl.has(part) ? 'hl' : 'fig');
  const B = animate ? fig.B : fig.A;
  let body = '';

  if (fig.front) {
    const a = solveFront(fig.A), b = solveFront(B);
    body += line(a.hpL, a.kL, b.hpL, b.kL, c('legs'), dur) + line(a.kL, a.fL, b.kL, b.fL, c('legs'), dur);
    body += line(a.hpR, a.kR, b.hpR, b.kR, c('legs'), dur) + line(a.kR, a.fR, b.kR, b.fR, c('legs'), dur);
    const torsoA = `M${pt(a.shL)} L${pt(a.shR)} L${pt(a.hpR)} L${pt(a.hpL)} Z`;
    const torsoB = `M${pt(b.shL)} L${pt(b.shR)} L${pt(b.hpR)} L${pt(b.hpL)} Z`;
    body += `<path class="${c('torso')}" d="${torsoA}" fill="var(--surface-2)" stroke-width="5" stroke-linejoin="round">${anim('d', torsoA, torsoB, dur)}</path>`;
    body += line(a.shL, a.mL, b.shL, b.mL, c('arms'), dur) + line(a.mL, a.wL, b.mL, b.wL, c('arms'), dur);
    body += line(a.shR, a.mR, b.shR, b.mR, c('arms'), dur) + line(a.mR, a.wR, b.mR, b.wR, c('arms'), dur);
    body += circle(a.head, b.head, HEAD_R, 'fig', dur, 'var(--bg-2)');
    if (fig.db) body += circle(a.wL, b.wL, 3.5, 'hl', dur, 'var(--purple-3)') + circle(a.wR, b.wR, 3.5, 'hl', dur, 'var(--purple-3)');
    if (fig.band) body += line(a.wL, a.wR, b.wL, b.wR, 'band', dur, 2);
  } else {
    const a = solve(fig.A), b = solve(B);
    // far limbs first (faded)
    body += `<g opacity=".38">` +
      line(a.hip, a.k2, b.hip, b.k2, c('legs'), dur) + line(a.k2, a.f2, b.k2, b.f2, c('legs'), dur) + line(a.f2, a.t2, b.f2, b.t2, c('legs'), dur, 5) +
      line(a.sh, a.e2, b.sh, b.e2, c('arms'), dur, 6) + line(a.e2, a.w2, b.e2, b.w2, c('arms'), dur, 6) + '</g>';
    body += path(`M${pt(a.hip)} Q${pt(a.mid)} ${pt(a.sh)}`, `M${pt(b.hip)} Q${pt(b.mid)} ${pt(b.sh)}`, c('torso'), dur, 9);
    body += line(a.hip, a.k1, b.hip, b.k1, c('legs'), dur) + line(a.k1, a.f1, b.k1, b.f1, c('legs'), dur) + line(a.f1, a.t1, b.f1, b.t1, c('legs'), dur, 5);
    body += circle(a.head, b.head, HEAD_R, 'fig', dur, 'var(--bg-2)');
    body += line(a.sh, a.e1, b.sh, b.e1, c('arms'), dur) + line(a.e1, a.w1, b.e1, b.w1, c('arms'), dur);
    if (fig.db) {
      body += circle(a.w1, b.w1, 4, 'hl', dur, 'var(--purple-3)');
      if (fig.db === 2) body += circle(a.w2, b.w2, 4, 'hl', dur, 'var(--purple-3)');
    }
    if (fig.band) body += line(fig.band, a.w1, fig.band, b.w1, 'band', dur, 2);
  }

  return `<svg viewBox="0 0 200 150" role="img" aria-label="${fig.label || 'הדגמת תרגיל'}">
  <style>.fig{stroke:var(--text)} .hl{stroke:var(--purple-3)} .band{stroke:var(--cyan)}</style>
  <line x1="6" y1="136" x2="194" y2="136" stroke="var(--border-strong)" stroke-width="2"/>
  ${props(fig.props)}
  ${body}
</svg>`;
}
