// Minimap (rotates with the camera) and full city map, both drawn from a pre-rendered top-down image.
import { P, N, ROAD_HALF, BEACH, AIRPORT, RAIL, WORLD_BOUNDS } from '../world/layout.js';

const S = 0.5; // pixels per meter in the base image
const TYPE_COLORS = { D: '#b9b2a6', S: '#d9cdb5', C: '#cbbfa8', A: '#c4cfb6', H: '#b9d39a', I: '#a9a39a', P: '#7fbf63', G: '#d0c3a8', M: '#b0a89c', T: '#c9c0b0', B: '#e0d2b0' };

export class MiniMap {
  constructor(city, graph, canvas, fullCanvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.full = fullCanvas;
    const W = WORLD_BOUNDS;
    this.ox = W.minX - 20; this.oz = W.minZ - 20;
    const w = Math.ceil((W.maxX - W.minX + 40) * S), h = Math.ceil((W.maxZ - W.minZ + 40) * S);
    const img = document.createElement('canvas'); img.width = w; img.height = h;
    const g = img.getContext('2d');
    const X = (x) => (x - this.ox) * S, Z = (z) => (z - this.oz) * S;
    g.fillStyle = '#8fb873'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8d6a6'; g.fillRect(X(BEACH.promenadeX1), 0, w, h);
    g.fillStyle = '#4f9dc9'; g.fillRect(X(BEACH.sandX1), 0, w, h);
    g.fillStyle = '#efe4d2'; g.fillRect(X(BEACH.promenadeX0), 0, (BEACH.promenadeX1 - BEACH.promenadeX0) * S, h);
    g.fillStyle = '#b4b4b0'; g.fillRect(X(AIRPORT.x0), Z(AIRPORT.z0 + 140), (-20 - AIRPORT.x0) * S, (AIRPORT.z1 - AIRPORT.z0 - 140) * S);
    g.fillStyle = '#55585c'; g.fillRect(X(AIRPORT.x0 + 20), Z(350), (-120 - AIRPORT.x0 - 20) * S, 50 * S);
    g.fillStyle = '#8a8178'; g.fillRect(0, Z(RAIL.z - 3.5), w, 7 * S);
    for (const blk of city.blocks) {
      g.fillStyle = TYPE_COLORS[blk.type] || '#ccc';
      g.fillRect(X(blk.ox + ROAD_HALF), Z(blk.oz + ROAD_HALF), (P - 2 * ROAD_HALF) * S, (P - 2 * ROAD_HALF) * S);
    }
    g.fillStyle = '#8d8478';
    const drawB = (b) => g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * S, b.d * S);
    for (const blk of city.blocks) blk.buildings.forEach(drawB);
    city.extra.buildings.forEach(drawB);
    g.strokeStyle = '#ffffff'; g.lineWidth = ROAD_HALF * 2 * S; g.lineCap = 'square';
    for (const [a, b] of graph.edges) { g.beginPath(); g.moveTo(X(a.x), Z(a.z)); g.lineTo(X(b.x), Z(b.z)); g.stroke(); }
    this.img = img; this.X = X; this.Z = Z;
  }

  draw(px, pz, facing, camYaw, markers = []) {
    const c = this.canvas, g = this.ctx, w = c.width, h = c.height;
    const zoom = 1.6; // canvas px per base px
    g.save();
    g.clearRect(0, 0, w, h);
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#4f9dc9'; g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI + camYaw);
    g.scale(zoom, zoom);
    g.drawImage(this.img, -this.X(px), -this.Z(pz));
    for (const m of markers) {
      g.fillStyle = m.color; g.beginPath(); g.arc(this.X(m.x) - this.X(px), this.Z(m.z) - this.Z(pz), 3 / zoom * 2, 0, Math.PI * 2); g.fill();
    }
    // player arrow
    g.rotate(-facing + Math.PI);
    g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 1 / zoom * 1.5;
    g.beginPath(); g.moveTo(0, -6 / zoom * 1.5); g.lineTo(4 / zoom * 1.5, 5 / zoom * 1.5); g.lineTo(0, 2.5 / zoom * 1.5); g.lineTo(-4 / zoom * 1.5, 5 / zoom * 1.5); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // north indicator
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI + camYaw);
    g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.translate(0, -(h / 2 - 12)); g.rotate(-(Math.PI + camYaw)); g.fillText('צ', 0, 0);
    g.restore();
  }

  drawFull(px, pz, facing) {
    const c = this.full, g = c.getContext('2d');
    const rect = c.getBoundingClientRect();
    c.width = rect.width * devicePixelRatio; c.height = rect.height * devicePixelRatio;
    const s = Math.min(c.width / this.img.width, c.height / this.img.height);
    const ox = (c.width - this.img.width * s) / 2, oy = (c.height - this.img.height * s) / 2;
    g.fillStyle = '#4f9dc9'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(this.img, ox, oy, this.img.width * s, this.img.height * s);
    const x = ox + this.X(px) * s, y = oy + this.Z(pz) * s;
    g.save(); g.translate(x, y); g.rotate(-facing + Math.PI);
    g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2 * devicePixelRatio;
    const k = 7 * devicePixelRatio;
    g.beginPath(); g.moveTo(0, -k * 1.4); g.lineTo(k, k); g.lineTo(0, k * 0.4); g.lineTo(-k, k); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // labels
    g.fillStyle = '#1b1b1b'; g.font = `bold ${12 * devicePixelRatio}px sans-serif`; g.textAlign = 'center';
    const label = (t, wx, wz) => g.fillText(t, ox + this.X(wx) * s, oy + this.Z(wz) * s);
    label('מרכז העיר', 500, 380); label('שכונת הגפנים', 150, 60); label('אזור התעשייה', 150, 860);
    label('נמל התעופה', -350, 470); label('חוף אזורה', 1060, 500); label('התחנה המרכזית', 500, 1030);
  }
}
