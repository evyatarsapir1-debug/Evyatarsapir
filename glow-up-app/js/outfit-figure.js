// Draws a whole outfit on a neutral mannequin (SVG): pants, shoes, top, open/closed layers and
// accessories, with fabric shading, seams, denim stitching, collars, pockets and soles.
import { fabricHex, DENIM_IDS } from './data/looks.js';

let uidN = 0;
const MANNEQUIN = '#c9c4bd';
const MANNEQUIN_D = '#aea8a0';

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join('');
}
const line = (hex) => (lum(hex) > 0.55 ? 'rgba(0,0,0,.32)' : 'rgba(0,0,0,.55)');
const detail = (hex) => (lum(hex) > 0.5 ? shade(hex, -0.16) : shade(hex, 0.12));

const SHAPE = {
  'tee': 'tee', 'oversized-tee': 'tee-wide', 'graphic-tee': 'tee', 'longsleeve': 'long', 'polo': 'polo', 'oxford': 'shirt', 'linen-shirt': 'shirt',
  'knit': 'knit', 'tank': 'tank', 'blouse': 'shirt', 'hoodie': 'hoodie', 'crewneck': 'crew', 'zip-hoodie': 'zip', 'overshirt': 'open-shirt',
  'denim-jacket': 'open-denim', 'bomber': 'open-bomber', 'cardigan': 'open-cardigan', 'blazer': 'blazer',
  'slim-jeans': 'slim', 'straight-jeans': 'straight', 'baggy-jeans': 'wide', 'chinos': 'straight', 'cargo': 'cargo', 'joggers': 'joggers',
  'sweatpants': 'joggers', 'trousers': 'trousers', 'shorts': 'shorts', 'denim-shorts': 'shorts', 'skirt': 'skirt', 'wide-trousers': 'wide',
  'white-sneakers': 'sneaker', 'chunky-sneakers': 'chunky', 'retro-runners': 'runner', 'canvas': 'canvas', 'high-tops': 'hightop', 'running': 'chunky',
  'loafers': 'loafer', 'chelsea': 'chelsea', 'derby': 'derby', 'slides': 'slide',
};

/**
 * pieces: [{ id, slot, color }] (garment ids from the stylist catalog).
 * Returns SVG markup (viewBox 200x420).
 */
export function outfitFigureSVG(pieces, { width = 150 } = {}) {
  const k = 'of' + (++uidN);
  const by = (slot) => pieces.find((p) => p.slot === slot);
  const top = by('top'), layer = by('layer'), bottom = by('bottom'), shoes = by('shoes');
  const accs = pieces.filter((p) => p.slot === 'acc');
  const hex = (p) => fabricHex(p.id, p.color);
  const out = [];
  const sh = `url(#${k}s)`;
  const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="${line(fill.startsWith('#') ? fill : '#888888')}" stroke-width="1" stroke-linejoin="round" ${extra}/>`;
  const S = (d) => `<path d="${d}" fill="${sh}"/>`; // shading overlay
  const L = (d, c, w = 1, extra = '') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;

  // ---------- mannequin ----------
  const legsVisible = !bottom || ['shorts', 'skirt'].includes(SHAPE[bottom.id]);
  out.push(`<ellipse cx="100" cy="38" rx="18" ry="22" fill="url(#${k}m)"/>`);
  out.push(`<path d="M92 56 L108 56 L109 76 L91 76 Z" fill="${MANNEQUIN_D}"/>`);
  out.push(`<path d="M66 80 Q100 70 134 80 L136 120 L130 206 L70 206 L64 120 Z" fill="${MANNEQUIN}"/>`);
  // arms
  out.push(`<path d="M66 82 L52 200 L62 203 L74 112 Z" fill="${MANNEQUIN}"/><path d="M134 82 L148 200 L138 203 L126 112 Z" fill="${MANNEQUIN}"/>`);
  // legs
  out.push(`<path d="M72 200 L99 200 L97 378 L82 378 Z" fill="${MANNEQUIN}"/><path d="M101 200 L128 200 L118 378 L103 378 Z" fill="${MANNEQUIN}"/>`);
  if (legsVisible) out.push(S('M72 200 L99 200 L97 378 L82 378 Z') + S('M101 200 L128 200 L118 378 L103 378 Z'));

  // ---------- shoes (before pants so the hem sits on the shoe) ----------
  if (shoes) out.push(shoeSVG(SHAPE[shoes.id] || 'sneaker', hex(shoes), P, L, S));

  // ---------- bottom ----------
  if (bottom) out.push(bottomSVG(SHAPE[bottom.id] || 'straight', hex(bottom), DENIM_IDS.has(bottom.id), bottom.id, P, L, S));

  // ---------- top ----------
  const layerShape = layer ? SHAPE[layer.id] : '';
  const closedLayer = ['hoodie', 'crew'].includes(layerShape);
  const hasBelt = accs.some((a) => a.id === 'belt');
  const tuck = !!(bottom && top && !closedLayer && ['shirt', 'polo', 'knit'].includes(SHAPE[top.id]) && (SHAPE[bottom.id] === 'trousers' || hasBelt));
  if (top && !closedLayer) out.push(topSVG(SHAPE[top.id] || 'tee', hex(top), top.id, P, L, S, { tuck }));
  if (top && closedLayer) out.push(topSVG(SHAPE[top.id] === 'tee-wide' ? 'tee-wide' : 'tee', hex(top), top.id, P, L, S, { hemOnly: true }));

  const belt = accs.find((a) => a.id === 'belt');
  if (belt) out.push(accSVG('belt', hex(belt), P, L, { tuck, bottom }));
  // ---------- layer ----------
  if (layer) out.push(layerSVG(layerShape, hex(layer), P, L, S));

  // ---------- hands ----------
  out.push(`<ellipse cx="57" cy="211" rx="6" ry="9" fill="${MANNEQUIN}"/><ellipse cx="143" cy="211" rx="6" ry="9" fill="${MANNEQUIN}"/>`);

  // ---------- accessories ----------
  for (const a of accs.filter((x) => x.id !== 'belt')) out.push(accSVG(a.id, hex(a), P, L, { tuck, bottom }));

  const defs = `<defs>
<linearGradient id="${k}s" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".30"/><stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".62" stop-color="#fff" stop-opacity=".07"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".30"/></linearGradient>
<radialGradient id="${k}m" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#ddd8d1"/><stop offset="1" stop-color="${MANNEQUIN_D}"/></radialGradient>
<radialGradient id="${k}f" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>`;
  const floor = `<ellipse cx="100" cy="398" rx="62" ry="9" fill="url(#${k}f)"/>`;
  return `<svg viewBox="0 0 200 420" width="${width}" height="${Math.round(width * 2.1)}" role="img" aria-label="איור הלוק">${defs}${floor}${out.join('')}</svg>`;
}

function bottomSVG(shape, c, denim, id, P, L, S) {
  const d = {
    slim: 'M71 196 L129 196 L131 232 L119 380 L103 380 L100 240 L97 380 L81 380 L69 232 Z',
    straight: 'M71 196 L129 196 L132 232 L126 382 L103 382 L100 242 L97 382 L74 382 L68 232 Z',
    trousers: 'M71 196 L129 196 L132 232 L125 384 L103 384 L100 242 L97 384 L75 384 L68 232 Z',
    wide: 'M70 196 L130 196 L137 236 L144 386 L104 386 L100 246 L96 386 L56 386 L63 236 Z',
    cargo: 'M70 196 L130 196 L135 236 L134 380 L104 380 L100 246 L96 380 L66 380 L65 236 Z',
    joggers: 'M71 196 L129 196 L132 232 L120 368 L103 368 L100 242 L97 368 L80 368 L68 232 Z',
    shorts: 'M70 196 L130 196 L135 232 L136 268 L103 268 L100 240 L97 268 L64 268 L65 232 Z',
    skirt: 'M73 196 L127 196 L148 332 L52 332 Z',
  }[shape];
  let s = P(d, c) + S(d);
  const dc = detail(c);
  // waistband + fly
  if (shape !== 'skirt') s += L('M71 204 L129 204', dc, 1.2) + L('M100 204 L100 236', dc, 1);
  // creases
  if (shape === 'trousers' || (shape === 'wide' && !denim)) s += L('M86 214 L87 382', 'rgba(255,255,255,.12)', 1.2) + L('M114 214 L113 382', 'rgba(255,255,255,.12)', 1.2);
  if (denim) {
    const st = '#d8a35a';
    s += L('M76 206 Q82 222 92 212', st, 0.9, 'stroke-dasharray="2 1.6" opacity=".8"') + L('M124 206 Q118 222 108 212', st, 0.9, 'stroke-dasharray="2 1.6" opacity=".8"');
    s += L('M103 206 L103 232 Q101 236 100 236', st, 0.9, 'stroke-dasharray="2 1.6" opacity=".75"');
    if (shape !== 'shorts') s += L('M74 236 L80 378', 'rgba(255,255,255,.08)', 3) + L('M126 236 L120 378', 'rgba(255,255,255,.08)', 3);
    // fades on thighs
    s += `<ellipse cx="86" cy="246" rx="7" ry="20" fill="#fff" opacity=".07"/><ellipse cx="114" cy="246" rx="7" ry="20" fill="#fff" opacity=".07"/>`;
    s += `<circle cx="100" cy="200" r="1.6" fill="#c9a24e"/>`;
  }
  if (shape === 'cargo') s += P('M64 264 L80 262 L81 292 L65 294 Z', shade(c, -0.05)) + P('M136 264 L120 262 L119 292 L135 294 Z', shade(c, -0.05));
  if (shape === 'joggers') s += P('M80 362 L97 362 L97 378 L81 378 Z', shade(c, -0.08)) + P('M103 362 L120 362 L119 378 L103 378 Z', shade(c, -0.08));
  if (shape === 'shorts') s += L('M64 262 L97 262 M103 262 L136 262', dc, 1);
  if (shape === 'skirt') s += L('M88 200 L82 330 M112 200 L118 330', 'rgba(0,0,0,.12)', 1.2) + L('M73 204 L127 204', dc, 1.2);
  return s;
}

function topSVG(shape, c, id, P, L, S, { tuck = false, hemOnly = false } = {}) {
  const hem = tuck ? 200 : 210;
  if (hemOnly) {
    // only the hem peeking under a hoodie / sweatshirt
    return P(`M70 206 L130 206 L130 ${hem + 4} L70 ${hem + 4} Z`, c);
  }
  const wide = shape === 'tee-wide';
  const torso = wide ? `M62 80 Q100 70 138 80 L140 124 L136 ${hem + 6} L64 ${hem + 6} L60 124 Z` : `M66 80 Q100 70 134 80 L136 120 L131 ${hem} L69 ${hem} L64 120 Z`;
  let s = '';
  const dc = detail(c);
  if (shape === 'tank') {
    const d = `M79 78 L89 78 Q100 98 111 78 L121 78 L128 120 L131 ${hem} L69 ${hem} L72 120 Z`;
    return P(d, c) + S(d);
  }
  const shortSleeve = shape === 'tee' || shape === 'tee-wide' || shape === 'polo';
  const sl = shortSleeve
    ? (wide ? ['M62 80 L44 128 L60 136 L70 106 Z', 'M138 80 L156 128 L140 136 L130 106 Z'] : ['M66 80 L50 120 L64 127 L71 104 Z', 'M134 80 L150 120 L136 127 L129 104 Z'])
    : ['M66 80 L49 200 L63 204 L74 110 Z', 'M134 80 L151 200 L137 204 L126 110 Z'];
  s += P(sl[0], c) + S(sl[0]) + P(sl[1], c) + S(sl[1]);
  s += P(torso, c) + S(torso);
  if (shape === 'tee' || shape === 'tee-wide' || shape === 'long' || shape === 'knit') s += L('M88 76 Q100 88 112 76', dc, 2);
  if (id === 'graphic-tee') s += `<rect x="84" y="112" width="32" height="30" rx="4" fill="#f472b6" opacity=".9"/><circle cx="100" cy="127" r="9" fill="#fbbf24"/><path d="M86 140 L114 114" stroke="#22d3ee" stroke-width="4"/>`;
  if (shape === 'knit') s += L(`M70 ${hem - 6} L130 ${hem - 6}`, dc, 1) + L(`M70 ${hem - 3} L130 ${hem - 3}`, dc, 1) + L('M50 196 L62 199 M150 196 L138 199', dc, 2);
  if (shape === 'polo') s += P('M88 74 L100 84 L95 92 L84 80 Z', shade(c, -0.04)) + P('M112 74 L100 84 L105 92 L116 80 Z', shade(c, -0.04)) + L('M100 84 L100 104', dc, 1.2) + `<circle cx="100" cy="92" r="1.3" fill="${dc}"/><circle cx="100" cy="100" r="1.3" fill="${dc}"/>`;
  if (shape === 'shirt') {
    s += P('M86 72 L100 86 L94 96 L82 80 Z', shade(c, -0.03)) + P('M114 72 L100 86 L106 96 L118 80 Z', shade(c, -0.03));
    s += L(`M100 86 L100 ${hem}`, dc, 1.1);
    for (let y = 104; y < hem - 4; y += 22) s += `<circle cx="101.8" cy="${y}" r="1.3" fill="${dc}"/>`;
    s += L('M50 194 L62 198 M150 194 L138 198', dc, 2.2);
    if (id === 'oxford') s += P('M108 108 L122 108 L122 122 L108 122 Z', 'none', 'stroke-opacity=".4"');
  }
  return s;
}

function layerSVG(shape, c, P, L, S) {
  const dc = detail(c);
  let s = '';
  const sleeves = ['M66 80 L48 201 L63 205 L75 110 Z', 'M134 80 L152 201 L137 205 L125 110 Z'];
  if (shape === 'hoodie' || shape === 'crew') {
    s += P(sleeves[0], c) + S(sleeves[0]) + P(sleeves[1], c) + S(sleeves[1]);
    const t = 'M65 80 Q100 70 135 80 L137 120 L132 206 L68 206 L63 120 Z';
    s += P(t, c) + S(t);
    s += P('M68 198 L132 198 L132 208 L68 208 Z', shade(c, -0.06)); // rib hem
    s += L('M49 194 L63 198 M151 194 L137 198', dc, 3);
    if (shape === 'hoodie') {
      s += P('M78 82 Q100 104 122 82 L126 70 Q100 56 74 70 Z', shade(c, -0.05));
      s += L('M94 92 L93 122 M106 92 L107 122', shade(c, lum(c) > 0.5 ? -0.3 : 0.35), 1.3);
      s += P('M80 160 L120 160 L127 196 L73 196 Z', shade(c, -0.04)) + L('M80 160 L73 196 M120 160 L127 196', dc, 1);
    } else s += L('M86 76 Q100 90 114 76', dc, 3);
    return s;
  }
  if (shape === 'zip') {
    s += P(sleeves[0], c) + S(sleeves[0]) + P(sleeves[1], c) + S(sleeves[1]);
    const l = 'M65 80 Q82 74 92 78 L95 206 L68 206 L63 120 Z', r = 'M135 80 Q118 74 108 78 L105 206 L132 206 L137 120 Z';
    s += P(l, c) + S(l) + P(r, c) + S(r);
    s += P('M78 82 Q100 100 122 82 L126 70 Q100 58 74 70 Z', shade(c, -0.05));
    s += L('M95 80 L95 206 M105 80 L105 206', '#9aa0a6', 1.4, 'stroke-dasharray="1.5 1"');
    s += P('M68 198 L95 198 L95 208 L68 208 Z', shade(c, -0.06)) + P('M105 198 L132 198 L132 208 L105 208 Z', shade(c, -0.06));
    return s;
  }
  // open layers
  const len = shape === 'open-bomber' ? 202 : shape === 'open-denim' ? 200 : shape === 'blazer' ? 222 : 214;
  const inner = shape === 'blazer' ? 98 : 93;
  const l = `M64 79 Q80 73 90 76 L${inner} 150 L${inner - 1} ${len} L66 ${len} L62 120 Z`;
  const r = `M136 79 Q120 73 110 76 L${200 - inner} 150 L${201 - inner} ${len} L134 ${len} L138 120 Z`;
  s += P(sleeves[0], c) + S(sleeves[0]) + P(sleeves[1], c) + S(sleeves[1]);
  s += P(l, c) + S(l) + P(r, c) + S(r);
  if (shape === 'blazer') {
    s += P('M90 76 L82 98 L94 130 L98 150 Z', shade(c, -0.07)) + P('M110 76 L118 98 L106 130 L102 150 Z', shade(c, -0.07));
    s += `<circle cx="99" cy="168" r="2" fill="${dc}"/><circle cx="99" cy="186" r="2" fill="${dc}"/>`;
    s += L('M70 176 L86 176 M114 176 L130 176', dc, 1.2) + L('M114 110 L126 110', dc, 1.2);
  }
  if (shape === 'open-shirt' || shape === 'open-denim') {
    s += P('M90 76 L84 92 L96 100 Z', shade(c, -0.05)) + P('M110 76 L116 92 L104 100 Z', shade(c, -0.05));
    s += P('M70 104 L86 104 L86 122 L70 122 Z', shade(c, -0.03)) + P('M114 104 L130 104 L130 122 L114 122 Z', shade(c, -0.03));
  }
  if (shape === 'open-denim') {
    const st = '#d8a35a';
    s += L('M70 104 L86 104 M114 104 L130 104 M66 186 L93 186 M107 186 L134 186', st, 0.9, 'stroke-dasharray="2 1.6"');
    s += `<circle cx="78" cy="113" r="1.5" fill="#c9a24e"/><circle cx="122" cy="113" r="1.5" fill="#c9a24e"/>`;
  }
  if (shape === 'open-bomber') s += P(`M66 ${len - 8} L93 ${len - 8} L93 ${len} L66 ${len} Z`, shade(c, -0.08)) + P(`M107 ${len - 8} L134 ${len - 8} L134 ${len} L107 ${len} Z`, shade(c, -0.08)) + L('M84 78 Q100 86 116 78', shade(c, -0.08), 4);
  if (shape === 'open-cardigan') for (let y = 120; y < len - 6; y += 22) s += `<circle cx="${inner - 3}" cy="${y}" r="1.6" fill="${dc}"/>`;
  s += L('M48 196 L63 200 M152 196 L137 200', dc, 2.2);
  return s;
}

function shoeSVG(shape, c, P, L, S) {
  const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `${200 - +x} ${y}`);
  let left = '', soleC = '#f4f3ef', soleH = 5;
  if (shape === 'sneaker' || shape === 'canvas' || shape === 'runner') {
    left = P('M72 370 L98 370 L100 389 L62 390 Q60 380 72 370 Z', c);
    if (shape === 'runner') left += L('M70 382 Q84 374 96 380', shade(c, lum(c) > 0.6 ? -0.25 : 0.3), 2);
    left += L('M80 372 L92 372 M80 376 L93 376', detail(c), 1);
    if (lum(c) > 0.8) soleC = '#e2e0da';
  } else if (shape === 'chunky') {
    left = P('M71 366 L98 366 L100 386 L60 388 Q58 376 71 366 Z', c) + L('M70 378 Q84 370 96 376', detail(c), 2);
    soleH = 9;
  } else if (shape === 'hightop') {
    left = P('M78 352 L98 352 L100 389 L62 390 Q60 378 72 370 L78 366 Z', c) + L('M82 358 L96 358 M82 364 L96 364 M82 370 L96 370', detail(c), 1);
  } else if (shape === 'loafer' || shape === 'derby') {
    left = P('M74 374 L98 373 L100 389 L60 391 Q60 381 74 374 Z', c) + `<path d="M66 384 Q76 377 90 378" stroke="#fff" stroke-opacity=".25" stroke-width="2" fill="none"/>`;
    if (shape === 'loafer') left += L('M76 378 L94 378', detail(c), 1.4);
    else left += L('M82 376 L94 375 M82 380 L95 379', detail(c), 1);
    soleC = '#2a211c'; soleH = 3;
  } else if (shape === 'chelsea') {
    left = P('M78 346 L98 346 L100 389 L60 391 Q60 380 74 374 L78 368 Z', c) + P('M88 350 L97 350 L97 372 L88 372 Z', shade(c, -0.12)) + `<path d="M66 384 Q76 377 90 378" stroke="#fff" stroke-opacity=".2" stroke-width="2" fill="none"/>`;
    soleC = '#2a211c'; soleH = 4;
  } else if (shape === 'slide') {
    left = `<path d="M64 389 L100 389 L100 392 L64 392 Z" fill="${shade(c, -0.1)}"/>` + P('M68 386 Q82 366 98 386 Z', c);
    soleH = 0;
  }
  const sole = soleH ? `<path d="M60 389 L101 388 L101 ${389 + soleH} L59 ${390 + soleH} Z" fill="${soleC}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>` : '';
  const one = left + sole;
  return one + mirror(one);
}

function accSVG(id, c, P, L, { tuck, bottom }) {
  if (id === 'watch') return `<rect x="51" y="195" width="12" height="9" rx="2.5" fill="${c}" stroke="rgba(0,0,0,.45)"/><rect x="54" y="197" width="6" height="5" rx="1.2" fill="#1b1d22"/>`;
  if (id === 'cap') return P('M80 30 Q82 10 100 10 Q118 10 120 30 Z', c) + P('M78 30 L122 30 Q122 36 100 35 Q78 36 78 30 Z', shade(c, -0.08)) + P('M100 32 Q114 32 132 36 Q118 40 100 37 Z', shade(c, -0.12));
  if (id === 'beanie') return P('M80 34 Q80 10 100 10 Q120 10 120 34 Z', c) + P('M79 28 L121 28 L121 36 L79 36 Z', shade(c, -0.08));
  if (id === 'chain') return L('M90 72 Q100 96 110 72', c, 2) + L('M90 72 Q100 96 110 72', '#fff', 0.6, 'opacity=".5"');
  if (id === 'belt') {
    if (!bottom || !tuck) return '';
    return P('M70 197 L130 197 L130 205 L70 205 Z', c) + `<rect x="95" y="196" width="10" height="10" rx="1.5" fill="none" stroke="#c9c3b5" stroke-width="1.6"/>`;
  }
  return '';
}
