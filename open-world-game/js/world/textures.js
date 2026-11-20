// Procedurally painted canvas textures (no external image assets needed).
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { ALL_SIGNS } from './layout.js';

let maxAniso = 4;
export function setAnisotropy(a) { maxAniso = a; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function noise(ctx, w, h, base, amount, count, size = 2, seed = 1) {
  const r = new RNG(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const v = Math.floor(r.float(-amount, amount));
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    ctx.fillRect(r.float(0, w), r.float(0, h), size, size);
  }
}

const cache = {};

// Facade: 4 bays x 4 floors per tile -> map with u = len / 12, v = h / 12.8
function facade(style) {
  const [c, g] = canvas(256, 256);
  const r = new RNG(style.length * 31 + 7);
  const bw = 64, fh = 64;
  const winDark = (lit) => lit ? '#f7d68a' : `rgb(${40 + r.int(0, 20)},${58 + r.int(0, 25)},${78 + r.int(0, 30)})`;
  switch (style) {
    case 'glass': {
      g.fillStyle = '#d9e4ec'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const grd = g.createLinearGradient(x * bw, y * fh, x * bw + bw, y * fh + fh);
        grd.addColorStop(0, '#8ea7bb'); grd.addColorStop(0.5, '#b9cddb'); grd.addColorStop(1, '#7590a6');   // bright = strong reflection (metallic F0)
        g.fillStyle = grd; g.fillRect(x * bw + 2, y * fh + 3, bw - 4, fh - 6);
      }
      g.fillStyle = 'rgba(255,255,255,0.15)';
      for (let y = 0; y < 4; y++) g.fillRect(0, y * fh, 256, 3);
      break;
    }
    case 'office': {
      noise(g, 256, 256, '#e2ded6', 18, 1500, 2, 3);
      for (let y = 0; y < 4; y++) {
        g.fillStyle = winDark(false);
        g.fillRect(0, y * fh + 18, 256, 36);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        for (let x = 0; x < 8; x++) g.fillRect(x * 32, y * fh + 18, 2, 36);
      }
      break;
    }
    case 'concrete':
    case 'plaster': {
      noise(g, 256, 256, style === 'plaster' ? '#f4efe6' : '#dcd8d0', 14, 2500, 2, style.length);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const wx = x * bw + 16, wy = y * fh + 16;
        g.fillStyle = '#9a958c'; g.fillRect(wx - 2, wy - 2, 36, 40);
        g.fillStyle = winDark(false); g.fillRect(wx, wy, 32, 36);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(wx + 15, wy, 2, 36); g.fillRect(wx, wy + 14, 32, 2);
        if (style === 'plaster' && (x + y) % 2 === 0) {
          g.fillStyle = '#c9c3b8'; g.fillRect(wx - 6, wy + 34, 44, 6);
          g.fillStyle = '#8f8a80'; for (let k = 0; k < 6; k++) g.fillRect(wx - 5 + k * 8, wy + 26, 2, 8);
        }
      }
      break;
    }
    case 'brick': {
      g.fillStyle = '#f2ece6'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#d7cdc4';
      for (let y = 0; y < 256; y += 6) { g.fillRect(0, y, 256, 1); for (let x = ((y / 6) % 2) * 6; x < 256; x += 12) g.fillRect(x, y, 1, 6); }
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const wx = x * bw + 18, wy = y * fh + 14;
        g.fillStyle = '#e8e2da'; g.fillRect(wx - 3, wy - 4, 34, 46);
        g.fillStyle = winDark(false); g.fillRect(wx, wy, 28, 38);
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(wx + 13, wy, 2, 38);
      }
      break;
    }
    case 'industrial': {
      noise(g, 256, 256, '#e6e6e6', 10, 1000, 2, 5);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = 0; x < 256; x += 8) g.fillRect(x, 0, 3, 256);
      g.fillStyle = winDark(false);
      for (let x = 0; x < 4; x++) g.fillRect(x * 64 + 8, 8, 48, 14);
      break;
    }
    case 'storefront': { // one shop unit (6m) x 1 floor (4m) -> 256x170 region
      noise(g, 256, 256, '#cfcac2', 10, 800, 2, 9);
      g.fillStyle = '#2b2f33'; g.fillRect(0, 0, 256, 40);
      const grd = g.createLinearGradient(0, 60, 0, 256);
      grd.addColorStop(0, '#6f8ea6'); grd.addColorStop(1, '#2f4252');
      g.fillStyle = grd; g.fillRect(12, 60, 150, 186);
      g.fillStyle = '#3d2b1f'; g.fillRect(180, 80, 64, 176);
      g.fillStyle = '#c9a66b'; g.fillRect(232, 160, 6, 10);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(20, 70, 30, 170);
      g.fillStyle = '#555'; g.fillRect(8, 56, 158, 4); g.fillRect(8, 246, 158, 10);
      break;
    }
  }
  return tex(c);
}

export function getFacade(style) { return cache['f_' + style] ||= facade(style); }

// Night: the same window layout, with a random share of windows lit (used as an emissive map)
function facadeLit(style) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  const r = new RNG(style.length * 97 + 3);
  const lit = () => { const k = r.float(); return k < 0.42 ? (k < 0.08 ? '#bfd4ff' : k < 0.3 ? '#ffd98a' : '#ffc070') : null; };
  const win = (x, y, w, h) => { const col = lit(); if (col) { g.fillStyle = col; g.fillRect(x, y, w, h); } };
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    switch (style) {
      case 'glass': win(x * 64 + 2, y * 64 + 3, 60, 58); break;
      case 'office': win(x * 64, y * 64 + 18, 32, 36); win(x * 64 + 32, y * 64 + 18, 32, 36); break;
      case 'concrete': case 'plaster': win(x * 64 + 16, y * 64 + 16, 32, 36); break;
      case 'brick': win(x * 64 + 18, y * 64 + 14, 28, 38); break;
      case 'industrial': if (y === 0) win(x * 64 + 8, 8, 48, 14); break;
    }
  }
  if (style === 'storefront') { g.fillStyle = '#ffe2a8'; g.fillRect(12, 60, 150, 186); g.fillStyle = '#ffb84a'; g.fillRect(180, 80, 64, 176); }
  return tex(c);
}
export function getFacadeLit(style) { return cache['fl_' + style] ||= facadeLit(style); }

// ---- realism maps (PBR): windows are smooth reflective glass, walls are rough; window recesses / tile grout get depth
function linear(c, repeat = true) { const t = tex(c, repeat); t.colorSpace = THREE.NoColorSpace; return t; }
// window rectangles of each facade style (same layout as the colour + night maps)
function facadeWindows(style, cb) {
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    switch (style) {
      case 'glass': cb(x * 64 + 2, y * 64 + 3, 60, 58); break;
      case 'office': if (x === 0) cb(0, y * 64 + 18, 256, 36); break;
      case 'concrete': case 'plaster': cb(x * 64 + 16, y * 64 + 16, 32, 36); break;
      case 'brick': cb(x * 64 + 18, y * 64 + 14, 28, 38); break;
      case 'industrial': if (y === 0) cb(x * 64 + 8, 8, 48, 14); break;
      case 'storefront': if (x === 0 && y === 0) cb(12, 60, 150, 186); break;
    }
  }
}
// G = roughness, B = metalness (three.js reads those channels)
function facadeRM(style) {
  const [c, g] = canvas(256, 256);
  const r = new RNG(style.length * 13 + 5);
  g.fillStyle = style === 'glass' ? 'rgb(0,150,40)' : style === 'industrial' ? 'rgb(0,170,60)' : 'rgb(0,220,0)'; g.fillRect(0, 0, 256, 256);
  // weathering: patches a little smoother/rougher
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,${r.int(150, 255)},0,0.25)`; g.fillRect(r.float(0, 256), r.float(0, 256), r.float(4, 22), r.float(4, 22)); }
  facadeWindows(style, (x, y, w, h) => { g.fillStyle = `rgb(0,${r.int(10, 30)},${style === 'glass' ? 235 : 200})`; g.fillRect(x, y, w, h); });
  if (style === 'office') { g.fillStyle = 'rgb(0,200,10)'; for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) g.fillRect(x * 32, y * 64 + 18, 2, 36); }
  if (style === 'glass') { g.fillStyle = 'rgb(0,90,180)'; for (let y = 0; y < 4; y++) g.fillRect(0, y * 64, 256, 3); }
  return linear(c);
}
export function getFacadeRM(style) { return cache['frm_' + style] ||= facadeRM(style); }
// height: walls high, window glass recessed, frames slightly raised
function facadeBump(style) {
  const [c, g] = canvas(256, 256);
  noise(g, 256, 256, '#c8c8c8', style === 'glass' ? 4 : 18, 2600, 2, style.length * 7);
  if (style === 'brick') { g.fillStyle = '#8a8a8a'; for (let y = 0; y < 256; y += 6) { g.fillRect(0, y, 256, 1); for (let x = ((y / 6) % 2) * 6; x < 256; x += 12) g.fillRect(x, y, 1, 6); } }
  if (style === 'industrial') { g.fillStyle = '#7a7a7a'; for (let x = 0; x < 256; x += 8) g.fillRect(x, 0, 3, 256); }
  facadeWindows(style, (x, y, w, h) => { g.fillStyle = '#ececec'; g.fillRect(x - 3, y - 3, w + 6, h + 6); g.fillStyle = '#2a2a2a'; g.fillRect(x, y, w, h); });
  return linear(c);
}
export function getFacadeBump(style) { return cache['fb_' + style] ||= facadeBump(style); }
// bump map from any colour texture (dark grout / cracks become recesses)
export function bumpOf(t) {
  const b = new THREE.CanvasTexture(t.image); b.colorSpace = THREE.NoColorSpace;
  b.wrapS = t.wrapS; b.wrapT = t.wrapT; b.anisotropy = t.anisotropy; b.repeat.copy(t.repeat);
  return b;
}


export function getRoof() {
  return cache.roof ||= (() => { const [c, g] = canvas(128, 128); noise(g, 128, 128, '#8b8b88', 30, 2500, 2, 11); return tex(c); })();
}
// ---- realistic ground surfaces: everything tiles seamlessly (each mark is drawn at all 9 wrap offsets) ----
function wrapDraw(N, M, fn) { for (const ox of [-N, 0, N]) for (const oy of [-M, 0, M]) fn(ox, oy); }
function blotches(g, N, M, r, count, rmin, rmax, cols) {
  for (let i = 0; i < count; i++) {
    const x = r.float(0, N), y = r.float(0, M), rad = r.float(rmin, rmax), col = cols[Math.floor(r.float(0, cols.length))];
    wrapDraw(N, M, (ox, oy) => {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    });
  }
}
function speckle(g, N, M, amt, seed) {
  const img = g.getImageData(0, 0, N, M), d = img.data, r = new RNG(seed);
  for (let i = 0; i < d.length; i += 4) {
    let n = (r.float(0, 1) - 0.5) * amt;
    if (r.float(0, 1) < 0.04) n += (r.float(0, 1) - 0.4) * amt * 2.2;   // aggregate stones catching the light
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.95;
  }
  g.putImageData(img, 0, 0);
}
function cracks(g, N, M, r, count, len, col, width) {
  g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < count; i++) {
    let x = r.float(0, N), y = r.float(0, M), a = r.float(0, Math.PI * 2);
    const pts = [[x, y]], n = 4 + Math.floor(r.float(0, len));
    for (let k = 0; k < n; k++) { a += r.float(-0.7, 0.7); x += Math.cos(a) * r.float(3, 9); y += Math.sin(a) * r.float(3, 9); pts.push([x, y]); }
    g.lineWidth = width * r.float(0.6, 1.3);
    wrapDraw(N, M, (ox, oy) => { g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy))); g.stroke(); });
  }
}
function asphaltBase(g, N, M, seed) {
  const r = new RNG(seed);
  g.fillStyle = '#4a4b4c'; g.fillRect(0, 0, N, M);
  blotches(g, N, M, r, 26, 30, 110, ['rgba(30,30,32,0.22)', 'rgba(120,118,112,0.12)', 'rgba(70,64,56,0.16)']);   // worn / sun-bleached areas
  // repair patches: slightly darker, sharp-edged rectangles of newer asphalt
  for (let i = 0; i < 3; i++) {
    const x = r.float(0, N), y = r.float(0, M), w = r.float(20, 70), h = r.float(16, 60);
    wrapDraw(N, M, (ox, oy) => { g.fillStyle = 'rgba(22,22,24,0.32)'; g.fillRect(x + ox, y + oy, w, h); g.strokeStyle = 'rgba(15,15,15,0.5)'; g.lineWidth = 1.2; g.strokeRect(x + ox, y + oy, w, h); });
  }
  speckle(g, N, M, 26, seed + 1);
  cracks(g, N, M, r, 6, 9, 'rgba(18,18,18,0.55)', 0.9);          // hairline cracks
  cracks(g, N, M, r, 2, 12, 'rgba(14,14,14,0.38)', 2.0);           // glossy tar-sealed joints
}
export function getTiles() {
  // sidewalks: poured concrete slabs (2 x 2 per 3 m tile) with expansion joints, mottling, gum and grime stains, cracks
  return cache.tiles ||= (() => {
    const N = 512, [c, g] = canvas(N, N), r = new RNG(71);
    g.fillStyle = '#bdb8ae'; g.fillRect(0, 0, N, N);
    blotches(g, N, N, r, 40, 25, 120, ['rgba(120,112,98,0.16)', 'rgba(255,250,240,0.14)', 'rgba(90,86,80,0.12)']);
    // each slab a slightly different shade
    for (const [x, y] of [[0, 0], [256, 0], [0, 256], [256, 256]]) { g.fillStyle = `rgba(${r.float(0, 1) < 0.5 ? '255,250,240' : '60,55,50'},${r.float(0.02, 0.07)})`; g.fillRect(x, y, 256, 256); }
    speckle(g, N, N, 18, 72);
    // grime collects along the joints
    for (const v of [0, 256, 512]) {
      const gr = g.createLinearGradient(0, v - 14, 0, v + 14); gr.addColorStop(0, 'rgba(70,64,56,0)'); gr.addColorStop(0.5, 'rgba(70,64,56,0.22)'); gr.addColorStop(1, 'rgba(70,64,56,0)');
      g.fillStyle = gr; g.fillRect(0, v - 14, N, 28);
      const gc = g.createLinearGradient(v - 14, 0, v + 14, 0); gc.addColorStop(0, 'rgba(70,64,56,0)'); gc.addColorStop(0.5, 'rgba(70,64,56,0.22)'); gc.addColorStop(1, 'rgba(70,64,56,0)');
      g.fillStyle = gc; g.fillRect(v - 14, 0, 28, N);
    }
    // expansion joints: dark groove with a lit edge
    for (const v of [0, 256]) {
      g.fillStyle = 'rgba(40,36,32,0.85)'; g.fillRect(0, v - 1.5, N, 3); g.fillRect(v - 1.5, 0, 3, N);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, v + 1.5, N, 1); g.fillRect(v + 1.5, 0, 1, N);
    }
    // gum spots and stains
    for (let i = 0; i < 30; i++) { const x = r.float(0, N), y = r.float(0, N), rr = r.float(1.5, 4); g.fillStyle = `rgba(40,38,36,${r.float(0.25, 0.5)})`; g.beginPath(); g.ellipse(x, y, rr, rr * r.float(0.7, 1), r.float(0, 3), 0, Math.PI * 2); g.fill(); }
    blotches(g, N, N, r, 5, 10, 28, ['rgba(50,44,38,0.28)']);
    cracks(g, N, N, r, 4, 12, 'rgba(60,55,50,0.55)', 1);
    return tex(c);
  })();
}
export function getAsphalt() {
  return cache.asphalt ||= (() => { const [c, g] = canvas(512, 512); asphaltBase(g, 512, 512, 13); return tex(c); })();
}
// Road strip texture: across = 14m (u 0..1), along repeats every 12m.
export function getRoad() {
  return cache.road ||= (() => {
    const N = 512, [c, g] = canvas(N, N), r = new RNG(29);
    asphaltBase(g, N, N, 19);
    const m = (v) => (v / 14 + 0.5) * N;
    // tyre tracks: the wheel paths of each lane are darker and smoother (rubber and oil), the middle of the lane
    // collects oil drips
    for (const lane of [-2.3, 2.3]) {
      for (const w of [-0.8, 0.8]) {
        const x = m(lane + w), gr = g.createLinearGradient(x - 16, 0, x + 16, 0);
        gr.addColorStop(0, 'rgba(20,20,22,0)'); gr.addColorStop(0.5, 'rgba(20,20,22,0.28)'); gr.addColorStop(1, 'rgba(20,20,22,0)');
        g.fillStyle = gr; g.fillRect(x - 16, 0, 32, N);
      }
      const gr = g.createLinearGradient(m(lane) - 12, 0, m(lane) + 12, 0);
      gr.addColorStop(0, 'rgba(25,22,18,0)'); gr.addColorStop(0.5, 'rgba(25,22,18,0.3)'); gr.addColorStop(1, 'rgba(25,22,18,0)');
      g.fillStyle = gr; g.fillRect(m(lane) - 12, 0, 24, N);
      for (let i = 0; i < 10; i++) { const y = r.float(0, N), x = m(lane) + r.float(-6, 6), rr = r.float(3, 9); wrapDraw(0, N, (ox, oy) => { const s2 = g.createRadialGradient(x, y + oy, 0, x, y + oy, rr); s2.addColorStop(0, 'rgba(12,10,8,0.45)'); s2.addColorStop(1, 'rgba(12,10,8,0)'); g.fillStyle = s2; g.fillRect(x - rr, y + oy - rr, rr * 2, rr * 2); }); }
    }
    // worn paint: lines drawn on their own layer, then eaten away by noise and tyres before going onto the road
    const [lc, lg] = canvas(N, N);
    lg.fillStyle = '#e9e4d2';
    for (let y = 0; y < N; y += 128) lg.fillRect(m(0) - 4, y, 8, 68);                      // dashed centre line
    lg.fillStyle = '#ecece8'; lg.fillRect(m(-4.6) - 3, 0, 6, N); lg.fillRect(m(4.6) - 3, 0, 6, N);   // lane edges
    const img = lg.getImageData(0, 0, N, N), d = img.data, rr = new RNG(31);
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const y = (i / 4 / N) | 0; d[i + 3] = Math.max(0, 255 * (0.92 - rr.float(0, 0.55) - 0.25 * (Math.sin(y * 0.05) * 0.5 + 0.5) * rr.float(0, 1))); }
    lg.putImageData(img, 0, 0);
    g.drawImage(lc, 0, 0);
    return tex(c);
  })();
}
export function getCrosswalk() {
  return cache.cross ||= (() => {
    const [c, g] = canvas(256, 64);
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(240,240,235,0.95)';
    for (let x = 6; x < 256; x += 24) g.fillRect(x, 4, 13, 56);
    const t = tex(c, false);
    return t;
  })();
}
export function getGrass() {
  // city grass: patchy green with dry, sun-burnt yellow areas and bare soil spots
  return cache.grass ||= (() => {
    const N = 256, [c, g] = canvas(N, N), r = new RNG(14);
    g.fillStyle = '#62803e'; g.fillRect(0, 0, N, N);
    blotches(g, N, N, r, 30, 15, 60, ['rgba(160,150,80,0.35)', 'rgba(60,90,35,0.35)', 'rgba(120,100,60,0.25)', 'rgba(140,130,70,0.3)']);
    const img = g.getImageData(0, 0, N, N), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r.float(0, 1) - 0.5) * 46; d[i] += n * 0.9; d[i + 1] += n; d[i + 2] += n * 0.5; }
    g.putImageData(img, 0, 0);
    return tex(c);
  })();
}
export function getSand() {
  return cache.sand ||= (() => { const [c, g] = canvas(256, 256); noise(g, 256, 256, '#e3cf9c', 25, 9000, 2, 15); return tex(c); })();
}
export function getPlaza() {
  return cache.plaza ||= (() => {
    const [c, g] = canvas(256, 256);
    noise(g, 256, 256, '#cfc6b6', 16, 3000, 2, 16);
    g.fillStyle = 'rgba(80,60,40,0.18)';
    for (let i = 0; i < 256; i += 32) { g.fillRect(i, 0, 2, 256); g.fillRect(0, i, 256, 2); }
    return tex(c);
  })();
}
export function getHouseRoof() {
  return cache.hroof ||= (() => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 128; y += 12) { g.fillRect(0, y, 128, 3); for (let x = (y / 12) % 2 * 8; x < 128; x += 16) g.fillRect(x, y, 2, 12); }
    return tex(c);
  })();
}

// Sign atlas: 4 columns x 8 rows, each 256x64
export const SIGN_COLS = 4, SIGN_ROWS = 20;
export function getSignAtlas() {
  return cache.signs ||= (() => {
    const [c, g] = canvas(1024, 1280);
    const colors = ['#1f4e79', '#7b241c', '#145a32', '#4a235a', '#7e5109', '#1b2631', '#943126', '#0e6251'];
    ALL_SIGNS.forEach((name, i) => {
      const cx = (i % SIGN_COLS) * 256, cy = Math.floor(i / SIGN_COLS) * 64;
      g.fillStyle = colors[i % colors.length]; g.fillRect(cx + 2, cy + 2, 252, 60);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; g.strokeRect(cx + 6, cy + 6, 244, 52);
      g.fillStyle = '#fff'; g.font = 'bold 30px Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
      g.fillText(name, cx + 128, cy + 34, 236);
    });
    const t = tex(c, false);
    return t;
  })();
}
export function signUV(name) {
  const i = Math.max(0, ALL_SIGNS.indexOf(name));
  const u0 = (i % SIGN_COLS) / SIGN_COLS, v1 = 1 - Math.floor(i / SIGN_COLS) / SIGN_ROWS;
  return [u0, v1 - 1 / SIGN_ROWS, u0 + 1 / SIGN_COLS, v1];
}

export function getField() {
  return cache.field ||= (() => {
    const [c, g] = canvas(256, 256);
    noise(g, 256, 256, '#8faa4a', 26, 8000, 2, 18);
    for (let x = 0; x < 256; x += 16) { g.fillStyle = 'rgba(70,90,30,0.45)'; g.fillRect(x, 0, 6, 256); g.fillStyle = 'rgba(200,190,90,0.25)'; g.fillRect(x + 8, 0, 4, 256); }
    return tex(c);
  })();
}
export function getRock() {
  return cache.rock ||= (() => {
    const [c, g] = canvas(256, 256);
    noise(g, 256, 256, '#8a8173', 40, 14000, 3, 19);
    g.fillStyle = 'rgba(60,80,40,0.25)';
    const r = new RNG(9); for (let i = 0; i < 300; i++) g.fillRect(r.float(0, 256), r.float(0, 256), r.float(4, 14), r.float(2, 6));
    return tex(c);
  })();
}
export function getWaterNormalish() {
  return cache.water ||= (() => {
    const [c, g] = canvas(256, 256);
    noise(g, 256, 256, '#2a6f8f', 25, 6000, 3, 17);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    const r = new RNG(5);
    for (let i = 0; i < 80; i++) { g.beginPath(); const x = r.float(0, 256), y = r.float(0, 256); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 3, x + 20, y); g.stroke(); }
    return tex(c);
  })();
}
