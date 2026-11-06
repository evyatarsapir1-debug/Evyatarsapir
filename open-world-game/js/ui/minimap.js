// Minimap (rotates with the camera) and a large city map. Both are drawn from the same generated world data:
// each 100m cell is painted once into a small cached tile, so the maps work everywhere in the endless world.
import { P, ROAD_HALF, CURB_H } from '../world/layout.js';
import { cellData, cellKind, RIDGE } from '../world/worldGen.js';

const TS = 50; // tile pixels per 100m cell (0.5 px / m)
const S = TS / P;
const KIND_COLORS = { p: '#b9c4d6', m: '#e6e9ee', J: '#d6c9ad', E: '#e3d7bd', j: '#9fbf7a', D: '#b9b2a6', S: '#d9cdb5', C: '#cbbfa8', A: '#c4cfb6', H: '#b9d39a', I: '#a9a39a', P: '#7fbf63', G: '#d0c3a8', M: '#b0a89c', T: '#c9c0b0', B: '#e0d2b0', L: '#cbbfa8', K: '#b8b4ac',
  F: '#a8bf6a', W: '#5f8f45', O: '#8fb873', h: '#a8bf6a', X: '#a5ad95', Q: '#4f9dc9' };

// Landmark badges (icon in a coloured circle + name) drawn on any of the maps.
export function drawLandmarks(g, list, toScreen, size, withNames = true, upright = null) {
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const L of list) {
    const pt = toScreen(L.x, L.z);
    if (!pt) continue;
    const [x, y] = pt;
    g.save(); g.translate(x, y); if (upright !== null) g.rotate(upright);
    g.fillStyle = L.color; g.strokeStyle = '#fff'; g.lineWidth = size * 0.14;
    g.beginPath(); g.arc(0, 0, size * 0.62, 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = `${Math.round(size * 0.72)}px sans-serif`; g.fillStyle = '#fff'; g.fillText(L.icon, 0, size * 0.04);
    if (withNames) {
      g.font = `bold ${Math.round(size * 0.62)}px sans-serif`; g.lineWidth = size * 0.22; g.strokeStyle = '#ffffffee'; g.fillStyle = '#1b1b1b';
      g.strokeText(L.short, 0, size * 1.25); g.fillText(L.short, 0, size * 1.25);
    }
    g.restore();
  }
  g.restore();
}

export class MiniMap {
  constructor(canvas, fullCanvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.full = fullCanvas;
    this.tiles = new Map();
  }

  tile(ix, iz) {
    const key = ix + ',' + iz;
    let t = this.tiles.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = TS; c.height = TS;
    const g = c.getContext('2d');
    const cd = cellData(ix, iz);
    const X = (x) => (x - cd.ox) * S, Z = (z) => (z - cd.oz) * S;
    g.fillStyle = KIND_COLORS[cd.kind] || '#8fb873'; g.fillRect(0, 0, TS, TS);
    if (cd.beach) {
      const west = cd.beach.west, xs = west ? [1007, 1022, 1070] : [1993, 1978, 1930];
      g.fillStyle = '#efe4d2'; g.fillRect(X(Math.min(xs[0], xs[1])), 0, 15 * S, TS);
      g.fillStyle = '#e8d6a6'; g.fillRect(X(Math.min(xs[1], xs[2])), 0, 48 * S, TS);
      g.fillStyle = '#4f9dc9'; g.fillRect(west ? X(1070) : 0, 0, 30 * S, TS);
      if (west) { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 7 * S, TS); }
    }
    for (const a of cd.apron) { g.fillStyle = a.name === 'runway' ? '#55585c' : '#b4b4b0'; g.fillRect(X(a.rect[0]), Z(a.rect[1]), (a.rect[2] - a.rect[0]) * S, (a.rect[3] - a.rect[1]) * S); }
    if (cd.rail) { g.fillStyle = '#8a8178'; g.fillRect(X(cd.rail.x0), Z(1042.5), (cd.rail.x1 - cd.rail.x0) * S, 7 * S); }
    if (cd.ridge) {
      g.fillStyle = '#9b8f78';
      g.fillRect(X(cd.ridge.x0), Z(Math.max(cd.ridge.z0, RIDGE.z0)), (cd.ridge.x1 - cd.ridge.x0) * S, (Math.min(cd.ridge.z1, RIDGE.z1) - Math.max(cd.ridge.z0, RIDGE.z0)) * S);
    }
    g.fillStyle = '#8d8478';
    for (const b of cd.buildings) g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * S, b.d * S);
    if (cd.garage) { const q = cd.garage; g.fillStyle = '#9c978d'; g.fillRect(X(q.x - q.w / 2), Z(q.z - q.d / 2), q.w * S, q.d * S); }
    g.fillStyle = cd.bridge ? '#d8d2c4' : '#ffffff';
    const w = ROAD_HALF * 2 * S;
    if (cd.roadH) g.fillRect(0, -w / 2, TS, w);
    if (cd.roadV) g.fillRect(-w / 2, 0, w, TS);
    if (cd.node) g.fillRect(-w / 2, -w / 2, w, w);
    this.tiles.set(key, c);
    if (this.tiles.size > 3000) this.tiles.delete(this.tiles.keys().next().value);
    return c;
  }

  // draw cells covering a world rect onto ctx (already transformed so that 1 unit = 1 base pixel, origin at world (ox, oz))
  _drawArea(g, x0, z0, x1, z1, ox, oz) {
    for (let ix = Math.floor(x0 / P); ix <= Math.floor(x1 / P); ix++)
      for (let iz = Math.floor(z0 / P); iz <= Math.floor(z1 / P); iz++) {
        // roads of a cell's south/east edges are drawn by neighbours; draw in an order that keeps them on top
        g.drawImage(this.tile(ix, iz), (ix * P - ox) * S, (iz * P - oz) * S);
      }
    // second pass: re-draw the road strips that overlap neighbouring tiles
    g.fillStyle = '#ffffff';
    const w = ROAD_HALF * 2 * S;
    for (let ix = Math.floor(x0 / P); ix <= Math.floor(x1 / P); ix++)
      for (let iz = Math.floor(z0 / P); iz <= Math.floor(z1 / P); iz++) {
        const cd = cellData(ix, iz);
        const bx = (ix * P - ox) * S, bz = (iz * P - oz) * S;
        g.fillStyle = cd.bridge ? '#d8d2c4' : '#ffffff';
        if (cd.roadH) g.fillRect(bx, bz - w / 2, TS, w);
        if (cd.roadV) g.fillRect(bx - w / 2, bz, w, TS);
        if (cd.node) g.fillRect(bx - w / 2, bz - w / 2, w, w);
      }
  }

  draw(px, pz, facing, camYaw, markers = [], route = null, landmarks = []) {
    const c = this.canvas, g = this.ctx, w = c.width, h = c.height;
    const zoom = 1.6;
    const R = (w / 2) / zoom / S * 1.45; // world radius visible (corners included)
    g.save();
    g.clearRect(0, 0, w, h);
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#8fb873'; g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI + camYaw);
    g.scale(zoom, zoom);
    this._drawArea(g, px - R, pz - R, px + R, pz + R, px, pz);
    if (route) {
      g.strokeStyle = '#b35cff'; g.lineWidth = 5 / zoom * 1.6; g.lineJoin = 'round'; g.beginPath();
      route.forEach(([x, z], i) => { const a = (x - px) * S, b = (z - pz) * S; i ? g.lineTo(a, b) : g.moveTo(a, b); });
      g.stroke();
    }
    for (const m of markers) {
      g.fillStyle = m.color; g.beginPath(); g.arc((m.x - px) * S, (m.z - pz) * S, 3, 0, Math.PI * 2); g.fill();
    }
    // landmark icons (kept upright); names only when close
    const far = R * 0.95;
    drawLandmarks(g, landmarks.filter((L) => Math.abs(L.x - px) < far && Math.abs(L.z - pz) < far), (x, z) => [(x - px) * S, (z - pz) * S], 9 / zoom, false, -(Math.PI + camYaw));
    g.rotate(-facing + Math.PI);
    const k = 1.5 / zoom;
    g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = k;
    g.beginPath(); g.moveTo(0, -6 * k); g.lineTo(4 * k, 5 * k); g.lineTo(0, 2.5 * k); g.lineTo(-4 * k, 5 * k); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI + camYaw);
    g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.translate(0, -(h / 2 - 12)); g.rotate(-(Math.PI + camYaw)); g.fillText('צ', 0, 0);
    g.restore();
  }

  // view = { x, z, r }: centre and half-height (metres) of the visible area
  drawFull(px, pz, facing, view) {
    const c = this.full, g = c.getContext('2d');
    const rect = c.getBoundingClientRect();
    const W = Math.round(rect.width * devicePixelRatio), H = Math.round(rect.height * devicePixelRatio);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const cx = view.x, cz = view.z;
    const aspect = c.width / c.height;
    const rz = view.r, rx = view.r * aspect;
    const scale = c.height / (2 * rz * S);
    this.fullScale = c.height / (2 * rz); // canvas px per metre
    g.fillStyle = '#8fb873'; g.fillRect(0, 0, c.width, c.height);
    g.save();
    g.scale(scale, scale);
    this._drawArea(g, cx - rx, cz - rz, cx + rx, cz + rz, cx - rx, cz - rz);
    g.restore();
    const W2 = (wx, wz) => [c.width / 2 + (wx - cx) * this.fullScale, c.height / 2 + (wz - cz) * this.fullScale];
    if (this.fullRoute) {
      g.strokeStyle = '#b35cff'; g.lineWidth = 5 * devicePixelRatio; g.lineJoin = 'round'; g.beginPath();
      this.fullRoute.forEach(([x, z], i) => { const [a, b] = W2(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    }
    if (this.fullDest) {
      // destination pin
      const [a, b] = W2(this.fullDest.x, this.fullDest.z), k2 = devicePixelRatio;
      g.fillStyle = '#b35cff'; g.strokeStyle = '#fff'; g.lineWidth = 3 * k2;
      g.beginPath(); g.moveTo(a, b); g.lineTo(a - 9 * k2, b - 16 * k2); g.arc(a, b - 20 * k2, 10 * k2, Math.PI * 0.8, Math.PI * 2.2); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(a, b - 20 * k2, 4 * k2, 0, Math.PI * 2); g.fill();
    }
    const [x, y] = W2(px, pz);
    g.save(); g.translate(x, y); g.rotate(-facing + Math.PI);
    g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2 * devicePixelRatio;
    const k = 7 * devicePixelRatio;
    g.beginPath(); g.moveTo(0, -k * 1.4); g.lineTo(k, k); g.lineTo(0, k * 0.4); g.lineTo(-k, k); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.fillStyle = '#1b1b1b'; g.font = `bold ${13 * devicePixelRatio}px sans-serif`; g.textAlign = 'center';
    const label = (t, wx, wz) => {
      const [sx, sy] = W2(wx, wz);
      if (sx > 0 && sy > 0 && sx < c.width && sy < c.height) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeText(t, sx, sy); g.fillText(t, sx, sy); }
    };
    label('לוס אנטוס', 500, 470); label('מפרץ לוס אנטוס', 1500, 250);
    label('בסיס צבאי', -500, -500); label('בל־ריב (צרפת)', 4500, 470); label('הים', 500, -350); label('הים', 500, 1350);
    const LM = this.landmarks || [];
    drawLandmarks(g, LM.filter((L) => !L.minor), (x, z) => W2(x, z), 15 * devicePixelRatio, true);
    drawLandmarks(g, LM.filter((L) => L.minor), (x, z) => W2(x, z), 12 * devicePixelRatio, view.r < 450);
  }
}
