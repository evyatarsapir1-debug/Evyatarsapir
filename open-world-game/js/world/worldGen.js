// Infinite, deterministic world generator.
// The world is an endless grid of 100m cells grouped into 1km regions:
//   region (0,0)  = Azura City (hand-designed map)      region (1,*) = the bay (beaches, water, bridges)
//   region (-1,0) = airport                              region (0,-1) = countryside with a rock ridge + tunnels
//   every other region = a generated town or open countryside.
// Roads form one continuous lattice: towns have a road every 100m, the countryside has arterial roads every 500m,
// arterials cross the bay on bridges and the ridge through tunnels — no road ever ends at the edge of the map.
import { RNG, hash2 } from '../core/rng.js';
import { P, ROAD_HALF, PARK_OFFSET, CURB_H, generateBlock, blockType, markInteriors, faceVector, DISTRICT_NAMES, RAIL } from './layout.js';
import { makeBox, makeCircle, makeSurface } from '../physics/collision.js';
import { interiorSpec, garageSpec } from './interiors.js';

export const WATER_Y = -1.0;
export const RIDGE = { x0: -60, x1: 1060, z0: -760, z1: -640, h: 42 };
export const TUNNEL_H = 8, TUNNEL_HALF = 9.5;
const URBAN = new Set('DSCAHPGMTBLKIVUJEpm'.split(''));
const TOWN_NAMES = ['נווה ים', 'כפר אלונים', 'רמת השקד', 'עין הדקל', 'קריית הגפן', 'נאות הברוש', 'גבעת הכלנית', 'כרם התאנה'];
const COUNTRY_NAMES = ['עמק השקדים', 'שדות הזהב', 'יער האלונים', 'מישור הרוח', 'גבעות הכלנית', 'נחל הצפצפות'];
const mod = (a, n) => ((a % n) + n) % n;

// --------------------------------------------------------------------------- regions & cell kinds
const regionCache = new Map();
export function regionInfo(rx, rz) {
  const key = rx + ',' + rz;
  let r = regionCache.get(key);
  if (r) return r;
  const rng = new RNG(hash2(rx, rz, 21));
  let type;
  if (rx === 0 && rz === 0) type = 'azura';
  else if (rx === -1 && rz === -1) type = 'base';
  else if (rx === 4 && rz === 0) type = 'france';
  else if (rx === 1) type = 'bay';
  else if (rx === -1 && rz === 0) type = 'airport';
  else if ((rx === 0 || rx === -1) && rz === -1) type = 'country';
  else if ((rx === 0 && rz === 1) || (rx === 2 && rz === 0)) type = 'town';
  else type = rng.float() < 0.45 ? 'town' : 'country';
  r = { rx, rz, type, rng };
  if (type === 'town') {
    r.cx = rx * 10 + 5 + rng.float(-0.6, 0.6);
    r.cz = rz * 10 + 5 + rng.float(-0.6, 0.6);
    r.R = rng.float(2.3, 3.5);
    r.name = rx === 2 && rz === 0 ? 'מרינה מזרח' : rx === 0 && rz === 1 ? 'גבעת הרימון' : TOWN_NAMES[hash2(rx, rz, 5) % TOWN_NAMES.length];
    r.mall = [Math.floor(r.cx) + 1, Math.floor(r.cz)];
    r.garage = [Math.floor(r.cx) - 1, Math.floor(r.cz)];
  }
  r.countryName = COUNTRY_NAMES[hash2(rx, rz, 6) % COUNTRY_NAMES.length];
  regionCache.set(key, r);
  return r;
}

// The world is the city and what belongs to it: Azura (0,0), the airport (-1,0), the bay with its beach and bridge (1,0)
// and the marina island with the luna park (2,0). Everything else is open sea you can swim and sail in.
export const isLandRegion = (rx, rz) => (rz === 0 && rx >= -1 && rx <= 2) || (rx === -1 && rz === -1) || (rx === 4 && rz === 0);   // + the military base, + 'Belle-Rive' (a French town across the sea)
const kindCache = new Map();
export function cellKind(ix, iz) {
  const key = ix * 1000003 + iz;
  let k = kindCache.get(key);
  if (k) return k;
  const rx = Math.floor(ix / 10), rz = Math.floor(iz / 10), lx = mod(ix, 10), lz = mod(iz, 10);
  if (iz === 10 && ix >= 0 && ix <= 9) { kindCache.set(key, 'R'); return 'R'; }   // the railway strip south of the city
  if (!isLandRegion(rx, rz)) { kindCache.set(key, 'Q'); return 'Q'; }
  const reg = regionInfo(rx, rz);
  const h = hash2(ix, iz, 31) % 100;
  const country = () => (h < 38 ? 'F' : h < 62 ? 'W' : h < 90 ? 'O' : 'h');
  switch (reg.type) {
    case 'azura': k = blockType(ix, iz); break;
    case 'bay': k = lx === 0 ? 'Y' : lx === 9 ? 'Z' : 'Q'; break;
    case 'airport': k = 'X'; break;
    case 'base': k = 'N'; break;
    case 'france': {
      // a compact French town: Haussmann blocks around a central square with the iron tower, parks, and an airstrip
      const d = Math.hypot(lx + 0.5 - 5, lz + 0.5 - 4.5);
      if (lz === 9 && lx >= 1 && lx <= 8) k = 'j';
      else if (lx < 1 || lx > 8 || lz < 1 || lz > 8 || d > 3.7) k = 'Q';
      else if (d < 0.8) k = 'E';
      else k = h < 16 ? 'P' : 'J';
      break;
    }
    case 'town': {
      const d = Math.hypot(ix + 0.5 - reg.cx, iz + 0.5 - reg.cz);
      if (d > reg.R || lx < 1 || lx > 8 || lz < 1 || lz > 8) {
        // the marina is an island: only a short causeway from the bridge to the town, the rest is sea
        k = rx === 2 && rz === 0 && (iz === 4 || iz === 5) && lx <= 2 ? 'F' : 'Q'; break;
      }
      if (ix === reg.mall[0] && iz === reg.mall[1]) { k = 'L'; break; }
      if (ix === reg.garage[0] && iz === reg.garage[1]) { k = 'K'; break; }
      if (rx === 2 && rz === 0 && ix === 25 && iz === 5) { k = 'U'; break; }   // marina luna park
      if (d < 1.2) k = h < 60 ? 'C' : h < 80 ? 'A' : 'S';
      else if (d < 2.2) k = h < 35 ? 'C' : h < 65 ? 'A' : h < 78 ? 'P' : h < 88 ? 'G' : 'M';
      else k = h < 55 ? 'H' : h < 80 ? 'A' : h < 90 ? 'P' : 'I';
      break;
    }
    default: k = country();
  }
  kindCache.set(key, k);
  return k;
}
export function isUrban(ix, iz) { return URBAN.has(cellKind(ix, iz)); }
const isWaterCell = (ix, iz) => cellKind(ix, iz) === 'Q';

// --------------------------------------------------------------------------- road lattice
// segH(gx,gz): road along z = gz*100 from x = gx*100 to (gx+1)*100
const inBase = (ix, iz) => ix >= -10 && ix <= -1 && iz >= -10 && iz <= -1;
export function segH(gx, gz) {
  if (inBase(gx, gz) && inBase(gx, gz - 1)) return false;          // inside the base: its own roads / taxiways
  if (isUrban(gx, gz - 1) || isUrban(gx, gz)) return true;
  if ((isWaterCell(gx, gz - 1) || isWaterCell(gx, gz)) && !isBridgeLine(gx, gz)) return false;   // no roads into the sea
  if (mod(gz, 5) === 0) {
    // arterial; skip through the ridge (there are tunnels on the vertical arterials instead)
    const z = gz * P;
    if (z > RIDGE.z0 - 10 && z < RIDGE.z1 + 10 && gx * P + P > RIDGE.x0 && gx * P < RIDGE.x1) return false;
    return true;
  }
  return false;
}
// segV(gx,gz): road along x = gx*100 from z = gz*100 to (gz+1)*100
export function segV(gx, gz) {
  if (inBase(gx, gz) || inBase(gx - 1, gz)) return gx === -5 && gz >= -2;   // access road: airport road -> base gate
  if (isWaterCell(gx - 1, gz) && isWaterCell(gx, gz)) return false;
  if ((isWaterCell(gx - 1, gz) || isWaterCell(gx, gz)) && !(isUrban(gx - 1, gz) || isUrban(gx, gz))) return false; // no roads along open water
  if (isUrban(gx - 1, gz) || isUrban(gx, gz)) return true;
  if (mod(gx, 5) === 0) {
    if (gx === -5 && gz >= 0 && gz <= 9) return false; // runway area of the airport
    return true;
  }
  return false;
}
export function nodeNbrs(gx, gz) {
  const n = [];
  if (segH(gx, gz)) n.push([gx + 1, gz]);
  if (segH(gx - 1, gz)) n.push([gx - 1, gz]);
  if (segV(gx, gz)) n.push([gx, gz + 1]);
  if (segV(gx, gz - 1)) n.push([gx, gz - 1]);
  return n;
}
export function hasLightsAt(gx, gz, nbrCount) {
  const n = nbrCount ?? nodeNbrs(gx, gz).length;
  if (n < 3) return false;
  if (n === 4) return true;
  return isUrban(gx - 1, gz - 1) || isUrban(gx, gz - 1) || isUrban(gx - 1, gz) || isUrban(gx, gz);
}
export function isBridgeLine(gx, gz) { return gz === 5 && gx >= 10 && gx <= 19; }

// --------------------------------------------------------------------------- terrain height
function bayHeight(x) {
  const xx = Math.min(x, 3000 - x);  // the east shore mirrors the west shore
  if (xx < 1007) return 0;
  if (xx <= 1022) return CURB_H;
  if (xx <= 1040) return 0.02;
  if (xx <= 1090) return 0.02 - 1.52 * (xx - 1040) / 50;
  if (xx <= 1110) return -1.5 - 2.5 * (xx - 1090) / 20;
  return -4;
}
// open sea next to land: sand beach first (or the road shoulder next to the city), then the sea floor drops away
const seaCache = new Map();
function seaShore(ix, iz) {
  const key = ix * 1000003 + iz;
  let s = seaCache.get(key);
  if (s) return s;
  s = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (!dx && !dz) continue;
    const k = cellKind(ix + dx, iz + dz);
    if (k !== 'Q') s.push({ x0: (ix + dx) * P, z0: (iz + dz) * P, x1: (ix + dx + 1) * P, z1: (iz + dz + 1) * P, urban: URBAN.has(k) });
  }
  seaCache.set(key, s);
  return s;
}
export function seaHeight(x, z) {
  const ix = Math.floor(x / P), iz = Math.floor(z / P);
  let best = Infinity;
  for (const r of seaShore(ix, iz)) {
    const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
    best = Math.min(best, Math.hypot(dx, dz) - (r.urban ? ROAD_HALF + 0.5 : 0));
  }
  if (best < 0) return 0;
  if (best < 14) return 0.02;
  if (best < 40) return 0.02 - (best - 14) / 26 * 4.5;
  return -4.5;
}
export function shoreDist(x, z) {
  const ix = Math.floor(x / P), iz = Math.floor(z / P);
  let best = Infinity;
  for (const r of seaShore(ix, iz)) { const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1); best = Math.min(best, Math.hypot(dx, dz) - (r.urban ? ROAD_HALF + 0.5 : 0)); }
  return best;
}
export function baseHeight(x, z) {
  if (x >= 1000 && x < 2000 && z >= 0 && z < 1000) {
    const xx = Math.min(x, 3000 - x);
    if (xx >= 1007 && xx <= 1022) {
      const lz = mod(z, 500);
      if (lz < ROAD_HALF || lz > 500 - ROAD_HALF) return 0; // road crossing the promenade
    }
    return bayHeight(x);
  }
  const ix = Math.floor(x / P), iz = Math.floor(z / P);
  if (isWaterCell(ix, iz)) return seaHeight(x, z);
  if (isUrban(ix, iz)) {
    const lx = x - ix * P, lz = z - iz * P;
    if (lx > ROAD_HALF && lx < P - ROAD_HALF && lz > ROAD_HALF && lz < P - ROAD_HALF) return CURB_H;
  }
  return 0;
}

// --------------------------------------------------------------------------- districts
export function districtAt(x, z) {
  const ix = Math.floor(x / P), iz = Math.floor(z / P);
  const rx = Math.floor(ix / 10), rz = Math.floor(iz / 10);
  const reg = regionInfo(rx, rz);
  if (isWaterCell(ix, iz) && !(x >= 1000 && x < 2000 && z >= 0 && z < 1000)) return shoreDist(x, z) < 14 ? 'חוף הים' : 'הים הפתוח';
  if (reg.type === 'bay') {
    const xx = Math.min(x, 3000 - x);
    if (xx < 1095) return x < 1500 ? 'חוף לוס אנטוס' : 'חוף מרינה';
    return mod(z, 500) < 12 || mod(z, 500) > 488 ? 'גשר המפרץ' : 'מפרץ לוס אנטוס';
  }
  if (reg.type === 'airport') return 'נמל התעופה לוס אנטוס';
  if (reg.type === 'base') return 'בסיס צבאי';
  if (reg.type === 'france') return cellKind(ix, iz) === 'j' ? 'שדה התעופה בל־ריב' : cellKind(ix, iz) === 'E' ? 'כיכר מגדל הברזל · בל־ריב' : 'בל־ריב, צרפת';
  if (reg.type === 'azura') {
    if (z > 1003 && x > 380 && x < 620) return 'התחנה המרכזית';
    return DISTRICT_NAMES[cellKind(ix, iz)] || 'לוס אנטוס';
  }
  if (iz === 10 && x > 380 && x < 620) return 'התחנה המרכזית';
  if (reg.type === 'town' && isUrban(ix, iz)) return reg.name;
  return reg.countryName;
}

// --------------------------------------------------------------------------- airport content
// Landside (road z=500) -> terminal -> gates/apron -> taxiway -> runway, from north to south.
export const AIRPORT = {
  gates: [-360, -300, -240], gateZ: 612, taxiZ: 710, runwayZ: 790, runwayW: -960, runwayE: -60,
};
const AIRPORT_ITEMS = (() => {
  const b = [
    { x: -300, z: 555, w: 180, d: 50, h: 18, style: 'glass', color: 0xd0dbe3, face: 'n', sign: 'נמל התעופה לוס אנטוס', airport: true, interior: 'terminal' },
    { x: -760, z: 640, w: 80, d: 56, h: 24, style: 'industrial', color: 0xb8c0c5, face: 's', interior: 'hangar', sign: 'האנגר לוס אנטוס' },
    { x: -560, z: 640, w: 12, d: 12, h: 38, style: 'glass', color: 0x9fb8cc, face: 'n', interior: 'ctower', sign: 'מגדל פיקוח' },
  ];
  const p = [{ kind: 'helipad', x: -85, z: 625 }];
  // jet bridges from the terminal to each gate
  for (const gx of AIRPORT.gates) p.push({ kind: 'jetbridge', x: gx - 4.2, z: 588, y: 0 });
  // runway edge lights, taxiway centre line
  for (let x = AIRPORT.runwayW; x <= AIRPORT.runwayE; x += 60) for (const z of [762, 818]) p.push({ kind: 'rlight', x, z, y: 0 });
  for (let x = -900; x <= -80; x += 12) p.push({ kind: 'tline', x, z: 710, y: 0 });
  const parking = [];
  // surface car park west of the terminal
  for (let r = 0; r < 4; r++) for (let k = 0; k < 18; k++) parking.push({ x: -555 + k * 3.4, z: 522 + r * 16, rot: 0 });
  // taxi rank + buses at the kerb in front of the terminal
  for (let k = 0; k < 5; k++) parking.push({ x: -345 + k * 7, z: 512, rot: -Math.PI / 2, type: 'taxi', fixed: true });
  parking.push({ x: -275, z: 512, rot: -Math.PI / 2, type: 'bus', fixed: true }, { x: -245, z: 512, rot: -Math.PI / 2, type: 'bus', fixed: true });
  // service vehicles parked on the apron (drivable)
  parking.push({ x: -420, z: 600, rot: 0, type: 'tug', fixed: true }, { x: -180, z: 600, rot: 0, type: 'fuel', fixed: true }, { x: -440, z: 600, rot: 0, type: 'van', fixed: true });
  return { b, p, parking };
})();
export const AIRPORT_AREAS = {
  carpark: [-562, 512, -490, 586], plaza: [-395, 506, -205, 530], apron: [-640, 586, -60, 700], taxiway: [-920, 700, -60, 720],
  conn1: [-945, 720, -905, 762], conn2: [-100, 720, -60, 762], runway: [AIRPORT.runwayW - 20, 760, AIRPORT.runwayE + 20, 820],
};
export const AIRPORT_GARAGE = { x: -150, z: 565, w: 64, d: 44, levels: 4, levelH: 3.15 };

// --------------------------------------------------------------------------- military base (x -1000..0, z -1000..0)
// Gate on the access road (x=-500) from the airport road (z=0); runway along z=-720; hangars, HQ, control centre,
// barracks, garages, watchtowers, fence; fighter jets, tanks, APCs, jeeps and trucks; soldiers on guard and patrol.
export const BASE = { x0: -960, x1: -40, z0: -960, z1: -40, gateX: -500, runwayZ: -720, runway: [-920, -740, -80, -700] };
const BASE_ITEMS = (() => {
  const b = [
    { x: -420, z: -150, w: 30, d: 20, h: 10, style: 'concrete', color: 0x8a8f6a, face: 'w', sign: 'מפקדה', interior: 'hall', mil: true },
    { x: -420, z: -235, w: 20, d: 16, h: 14, style: 'concrete', color: 0x7d8466, face: 'w', sign: 'מרכז שליטה', interior: 'hall', mil: true },
    { x: -600, z: -150, w: 40, d: 16, h: 9.6, style: 'concrete', color: 0x9a9a7a, face: 'e', sign: 'מגורי חיילים', interior: 'apartment', mil: true },
    { x: -600, z: -235, w: 40, d: 16, h: 9.6, style: 'concrete', color: 0x9a9a7a, face: 'e', sign: 'מגורי חיילים', interior: 'apartment', mil: true },
    { x: -300, z: -360, w: 44, d: 20, h: 8, style: 'industrial', color: 0x6f7560, face: 's', sign: 'מוסך צבאי', mil: true },
    { x: -800, z: -470, w: 54, d: 40, h: 16, style: 'industrial', color: 0x7a7f6c, face: 'n', sign: 'האנגר', mil: true },
    { x: -680, z: -470, w: 54, d: 40, h: 16, style: 'industrial', color: 0x7a7f6c, face: 'n', sign: 'האנגר', mil: true },
    { x: -538, z: -100, w: 8, d: 6, h: 3.4, style: 'concrete', color: 0xd8d2bd, face: 'e', mil: true },   // gate house
  ];
  const p = [];
  for (const [x, z] of [[-950, -50], [-50, -50], [-950, -950], [-50, -950], [-500, -950], [-950, -500], [-50, -500], [-560, -52]]) p.push({ kind: 'watchtower', x, z });
  p.push({ kind: 'barrier', x: -500, z: -40 }, { kind: 'helipad', x: -200, z: -560 }, { kind: 'flagpole', x: -455, z: -150 });
  p.push({ kind: 'windsock', x: -100, z: -760 });
  for (let x = -900; x <= -100; x += 50) for (const z of [-744, -696]) p.push({ kind: 'rlight', x, z, y: 0 });
  const parking = [
    { x: -805, z: -525, rot: Math.PI, type: 'fighter' }, { x: -680, z: -525, rot: Math.PI, type: 'fighter' }, { x: -560, z: -525, rot: Math.PI, type: 'fighter' },
    { x: -330, z: -300, rot: 0, type: 'tank' }, { x: -312, z: -300, rot: 0, type: 'tank' }, { x: -294, z: -300, rot: 0, type: 'tank' },
    { x: -270, z: -300, rot: 0, type: 'apc' }, { x: -254, z: -300, rot: 0, type: 'apc' },
    { x: -470, z: -120, rot: 0, type: 'mjeep' }, { x: -470, z: -110, rot: 0, type: 'mjeep' }, { x: -470, z: -100, rot: 0, type: 'mjeep' },
    { x: -230, z: -400, rot: Math.PI / 2, type: 'mtruck' }, { x: -230, z: -415, rot: Math.PI / 2, type: 'mtruck' },
    { x: -200, z: -560, rot: 0, type: 'heli' },
  ].map((q) => ({ ...q, fixed: true }));
  // soldiers: gate guards, guards by the buildings, chatting pairs, patrols along the fence and the hangars
  const people = [
    { x: -512, z: -46, yaw: 0, state: 'guard' }, { x: -488, z: -46, yaw: 0, state: 'guard' },
    { x: -403, z: -142, yaw: -Math.PI / 2, state: 'guard' }, { x: -403, z: -228, yaw: -Math.PI / 2, state: 'guard' },
    { x: -560, z: -192, yaw: Math.PI / 2, state: 'guard' }, { x: -557, z: -192, yaw: -Math.PI / 2, state: 'guard' },
    { x: -330, z: -320, yaw: 0.3, state: 'guard' }, { x: -326, z: -318, yaw: Math.PI + 0.3, state: 'guard' },
    { x: -740, z: -520, yaw: Math.PI, state: 'guard' },
    { x: -480, z: -60, state: 'wander', pts: [[-480, -60], [-120, -60], [-120, -300], [-480, -300]] },
    { x: -900, z: -100, state: 'wander', pts: [[-900, -100], [-900, -420], [-620, -420], [-620, -100]] },
    { x: -760, z: -540, state: 'wander', pts: [[-860, -545], [-520, -545], [-520, -560], [-860, -560]] },
    { x: -360, z: -180, state: 'wander', pts: [[-380, -180], [-470, -180], [-470, -260], [-380, -260]] },
    { x: -250, z: -330, state: 'wander', pts: [[-340, -330], [-220, -330], [-220, -280], [-340, -280]] },
  ];
  return { b, p, parking, people };
})();
export const BASE_AREAS = {
  runway: BASE.runway, apron: [-880, -560, -470, -500], taxi: [-900, -700, -870, -560], taxi2: [-140, -700, -110, -560],
  roadIn: [-506, -330, -494, -40], roadE: [-494, -205, -120, -195], roadH: [-506, -330, -200, -320], lotT: [-345, -312, -240, -288],
  lotJ: [-478, -128, -462, -92], heliPad: [-215, -575, -185, -545], hq: [-440, -168, -404, -132],
};
const FEATURED = [
  { x: -85, z: 625, rot: 0, type: 'heli' },
  { x: -85, z: 655, rot: Math.PI / 2, type: 'heli' },
  { x: 560, z: 994.4, rot: -Math.PI / 2, type: 'bus' },
  { x: 150, z: 994.4, rot: -Math.PI / 2, type: 'truck' },
  { x: 1012, z: 300, rot: 0, type: 'bicycle' }, { x: 1012, z: 302, rot: 0, type: 'bicycle' },
  { x: 1012, z: 640, rot: 0, type: 'moto' },
  { x: 505.6, z: 450, rot: Math.PI, type: 'sports' },
  { x: 505.6, z: 538, rot: Math.PI, type: 'sedan' },
  { x: 494.4, z: 560, rot: 0, type: 'luxury' },
];

// --------------------------------------------------------------------------- cell data
const dataCache = new Map();
export function cellData(ix, iz) {
  const key = ix + ',' + iz;
  let d = dataCache.get(key);
  if (d) { dataCache.delete(key); dataCache.set(key, d); return d; }
  d = generateCell(ix, iz);
  dataCache.set(key, d);
  if (dataCache.size > 2500) dataCache.delete(dataCache.keys().next().value);
  return d;
}
export function peekCell(ix, iz) { return dataCache.get(ix + ',' + iz); }

function inRect(x, z, r, pad = 0) { return x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad; }

function generateCell(ix, iz) {
  const kind = cellKind(ix, iz);
  const urban = URBAN.has(kind);
  const ox = ix * P, oz = iz * P;
  const rng = new RNG(hash2(ix, iz, 77));
  let blk;
  if (urban) blk = generateBlock(ix, iz, kind);
  else blk = { bx: ix, bz: iz, type: kind, ox, oz, buildings: [], props: [], parking: [], ground: 'grass', paths: [] };
  const d = {
    key: ix + ',' + iz, ix, iz, ox, oz, kind, urban, region: regionInfo(Math.floor(ix / 10), Math.floor(iz / 10)),
    buildings: blk.buildings, props: blk.props, parking: blk.parking, paths: blk.paths, ground: blk.ground, garage: blk.garage || null,
    keepOut: [], water: null, beach: null, bridge: null, ridge: null, rail: null, apron: [], lamps: [], tl: [],
    colliders: [], surfaces: [], peds: urban,
  };
  const B = d.buildings, PR = d.props;

  // special areas that cross cells
  const cellRect = [ox, oz, ox + P, oz + P];
  if (kind !== 'Q' && kind !== 'N' && oz < RIDGE.z1 && oz + P > RIDGE.z0 && ox < RIDGE.x1 && ox + P > RIDGE.x0) {
    d.ridge = { x0: Math.max(ox, RIDGE.x0), x1: Math.min(ox + P, RIDGE.x1), z0: Math.max(oz, RIDGE.z0), z1: Math.min(oz + P, RIDGE.z1) };
    d.keepOut.push([RIDGE.x0 - 8, RIDGE.z0 - 8, RIDGE.x1 + 8, RIDGE.z1 + 8]);
  }
  if (kind === 'R') {
    d.rail = { x0: Math.max(ox, 0), x1: Math.min(ox + P, 1000), bufferW: ox <= 0, bufferE: ox + P >= 1000 };
    d.keepOut.push([ox - 1, RAIL.z - 6, ox + P + 1, RAIL.z + 6]);
    if (ox < RAIL.platformX1 && ox + P > RAIL.platformX0) {
      const x0 = Math.max(ox, RAIL.platformX0), x1 = Math.min(ox + P, RAIL.platformX1);
      d.rail.platform = [x0, RAIL.platformZ0, x1, RAIL.platformZ1];
      d.surfaces.push(makeSurface(x0, RAIL.platformZ0, x1, RAIL.platformZ1, 0.5));
      d.keepOut.push([x0 - 2, RAIL.platformZ0 - 2, x1 + 2, RAIL.platformZ1]);
      const cx = (RAIL.platformX0 + RAIL.platformX1) / 2;
      if (cx >= ox && cx < ox + P) PR.push({ kind: 'platformRoof', x: cx, z: (RAIL.platformZ0 + RAIL.platformZ1) / 2, w: 160, d: 14, y: 0.5 });
    }
  }

  // ------------------------------------------------ non-urban content
  if (kind === 'X') {
    for (const b of AIRPORT_ITEMS.b) if (b.x >= ox && b.x < ox + P && b.z >= oz && b.z < oz + P) B.push({ ...b });
    for (const p of AIRPORT_ITEMS.p) if (p.x >= ox && p.x < ox + P && p.z >= oz && p.z < oz + P) PR.push({ ...p });
    for (const s of AIRPORT_ITEMS.parking) if (s.x >= ox && s.x < ox + P && s.z >= oz && s.z < oz + P) d.parking.push({ ...s });
    for (const [name, r] of Object.entries(AIRPORT_AREAS)) {
      const x0 = Math.max(ox, r[0]), z0 = Math.max(oz, r[1]), x1 = Math.min(ox + P, r[2]), z1 = Math.min(oz + P, r[3]);
      if (x1 > x0 && z1 > z0) d.apron.push({ name, rect: [x0, z0, x1, z1] });
    }
    if (AIRPORT_GARAGE.x >= ox && AIRPORT_GARAGE.x < ox + P && AIRPORT_GARAGE.z >= oz && AIRPORT_GARAGE.z < oz + P) d.garage = { ...AIRPORT_GARAGE };
    for (const r of Object.values(AIRPORT_AREAS)) d.keepOut.push(r);
    d.keepOut.push([-640, 506, -20, 600]);
    if (!d.apron.length && oz < 900) addTrees(d, rng, rng.int(2, 8));
  } else if (kind === 'j') {
    // Belle-Rive airstrip: runway + taxi apron, windsock, a small terminal; a fighter and a plane to fly back with
    const R = [4080, 932, 4920, 968], A = [4400, 905, 4620, 930];
    for (const [name, r] of [['runway', R], ['apron', A]]) {
      const x0 = Math.max(ox, r[0]), z0 = Math.max(oz, r[1]), x1 = Math.min(ox + P, r[2]), z1 = Math.min(oz + P, r[3]);
      if (x1 > x0 && z1 > z0) d.apron.push({ name, rect: [x0, z0, x1, z1] });
    }
    for (let x = 4100; x <= 4900; x += 50) if (x >= ox && x < ox + P) for (const z of [928, 972]) PR.push({ kind: 'rlight', x, z, y: 0 });
    if (ix === 41) PR.push({ kind: 'windsock', x: 4120, z: 985 });
    if (ix === 45) { d.parking.push({ x: 4450, z: 918, rot: Math.PI / 2, type: 'fighter', fixed: true }, { x: 4480, z: 918, rot: Math.PI / 2, type: 'fighter', fixed: true }); B.push({ x: 4540, z: 985, w: 30, d: 14, h: 6, style: 'glass', color: 0xdfe6ea, face: 'n', sign: 'מסוף בל־ריב' }); }
  } else if (kind === 'p') {
    d.peopleSpots = [
      { key: 'cop:0', x: ix * P + 42, z: iz * P + 16, yaw: Math.PI, state: 'guard', outfit: 'cop' },
      { key: 'cop:1', x: ix * P + 58, z: iz * P + 16, yaw: Math.PI, state: 'guard', outfit: 'cop' },
      { key: 'cop:2', x: ix * P + 30, z: iz * P + 70, state: 'wander', outfit: 'cop', pts: [[ix * P + 20, iz * P + 70], [ix * P + 80, iz * P + 70], [ix * P + 80, iz * P + 12], [ix * P + 20, iz * P + 12]] },
    ];
  } else if (kind === 'N') {
    const BI = BASE_ITEMS, inCell = (q) => q.x >= ox && q.x < ox + P && q.z >= oz && q.z < oz + P;
    for (const b of BI.b) if (inCell(b)) B.push({ ...b });
    for (const p of BI.p) if (inCell(p)) PR.push({ ...p });
    for (const q of BI.parking) if (inCell(q)) d.parking.push({ ...q });
    d.peopleSpots = BI.people.map((q, i) => ({ ...q, key: `base:${i}`, y: 0, yaw: q.yaw ?? 0, outfit: 'soldier' })).filter(inCell);
    for (const [name, r] of Object.entries(BASE_AREAS)) {
      const x0 = Math.max(ox, r[0]), z0 = Math.max(oz, r[1]), x1 = Math.min(ox + P, r[2]), z1 = Math.min(oz + P, r[3]);
      if (x1 > x0 && z1 > z0) d.apron.push({ name, rect: [x0, z0, x1, z1] });
    }
    // perimeter fence (split per cell), gap at the gate
    const F = BASE, seg = (x0, z0, x1, z1) => { if (x1 - x0 > 0.5 || z1 - z0 > 0.5) { PR.push({ kind: 'fence', x0, z0, x1, z1 }); } };
    const cx0 = Math.max(ox, F.x0), cx1 = Math.min(ox + P, F.x1), cz0 = Math.max(oz, F.z0), cz1 = Math.min(oz + P, F.z1);
    if (cx1 > cx0) {
      if (F.z0 >= oz && F.z0 < oz + P) seg(cx0, F.z0, cx1, F.z0);
      if (F.z1 >= oz && F.z1 < oz + P) { seg(cx0, F.z1, Math.min(cx1, F.gateX - 12), F.z1); seg(Math.max(cx0, F.gateX + 12), F.z1, cx1, F.z1); }
    }
    if (cz1 > cz0) {
      if (F.x0 >= ox && F.x0 < ox + P) seg(F.x0, cz0, F.x0, cz1);
      if (F.x1 >= ox && F.x1 < ox + P) seg(F.x1, cz0, F.x1, cz1);
    }
    if (!d.apron.length) addTrees(d, rng, rng.int(0, 3));
  } else if (kind === 'Y' || kind === 'Z') {
    const west = kind === 'Y';
    const X = (x) => (west ? x : 3000 - x);
    d.beach = { west };
    d.water = west ? [1060, oz, 1100, oz + P] : [1900, oz, 1940, oz + P];
    const nearRoad = (z) => mod(z, 500) < 14 || mod(z, 500) > 486;
    for (const z of [oz + 16, oz + 48, oz + 80]) {
      if (nearRoad(z)) continue;
      PR.push({ kind: 'palm', x: X(1024), z, s: 1, y: 0.02 });
      if (rng.chance(0.6)) PR.push({ kind: 'bench', x: X(1018), z: z + 14, rot: west ? -Math.PI / 2 : Math.PI / 2 });
    }
    if (mod(iz, 3) === 0 && !nearRoad(oz + 50)) PR.push({ kind: 'lifeguard', x: X(1058), z: oz + 50, y: 0 });
    if (rng.chance(0.5) && !nearRoad(oz + 30)) PR.push({ kind: 'umbrella', x: X(1032 + rng.float(0, 10)), z: oz + 30, color: rng.pick([0xe74c3c, 0x2e86c1, 0xf1c40f]), y: 0.02 });
    // wooden piers with jet skis and motor boats moored at the end (on the city beach)
    if (west && (iz === 2 || iz === 7)) {
      const pz = oz + 50, x0 = 1036, x1 = 1104;
      PR.push({ kind: 'pier', x0, x1, z: pz, y: 0.25 });
      d.surfaces.push(makeSurface(x0, pz - 1.3, x1, pz + 1.3, 0.25));
      d.parking.push({ x: 1099, z: pz + 3.4, rot: Math.PI / 2, type: 'jetski', fixed: true, y: WATER_Y - 0.25 });
      d.parking.push({ x: 1092, z: pz + 3.4, rot: Math.PI / 2, type: 'jetski', fixed: true, y: WATER_Y - 0.25 });
      d.parking.push({ x: 1098, z: pz - 4.0, rot: Math.PI / 2, type: 'boat', fixed: true, y: WATER_Y - 0.4 });
    }
    // people in swimwear: sunbathing on towels, sitting on the sand, strolling by the water, swimming
    if (west && iz >= 0 && iz <= 9) {
      d.beachSpots = [];
      const TOWELS = [0xe74c3c, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe84393, 0xffffff, 0x8e44ad];
      for (let k = 0; k < 7; k++) {
        const z = oz + 8 + k * 12.5 + rng.float(-2, 2);
        if (nearRoad(z)) continue;
        const x = 1027 + rng.float(0, 12), yaw = rng.float(-0.4, 0.4) + Math.PI / 2;
        const st = rng.float() < 0.55 ? 'sunbathe' : 'beachsit';
        PR.push({ kind: 'towel', x, z, rot: yaw, color: TOWELS[k % TOWELS.length], y: baseHeight(x, z) });
        d.beachSpots.push({ key: `beach:${ix},${iz}:${k}`, x: x + (st === 'sunbathe' ? 0 : 0.2), z, y: baseHeight(x, z) + 0.01, yaw: st === 'sunbathe' ? yaw - Math.PI / 2 : yaw + Math.PI / 2, state: st });
        if (st === 'beachsit' && rng.chance(0.5)) PR.push({ kind: 'umbrella', x: x - 1.6, z: z + 1.2, color: TOWELS[(k + 3) % TOWELS.length], y: baseHeight(x, z) });
      }
      for (let k = 0; k < 2; k++) {
        const z = oz + 20 + k * 50;
        if (nearRoad(z)) continue;
        const pts = [[1046, z - 20], [1048, z + 20], [1044, z]];
        d.beachSpots.push({ key: `beach:${ix},${iz}:w${k}`, x: 1046, z, y: baseHeight(1056, z), yaw: 0, state: 'wander', pts });
      }
      for (let k = 0; k < 2; k++) {
        const z = oz + 30 + k * 40;
        if (nearRoad(z) || nearRoad(z + 14) || nearRoad(z - 14)) continue;
        d.beachSpots.push({ key: `beach:${ix},${iz}:s${k}`, x: 1098 + k * 6, z, y: WATER_Y - 0.55, yaw: 0, state: 'swimmer' });
      }
    }
  } else if (kind === 'Q') {
    d.water = [ox, oz, ox + P, oz + P];
  } else if (!urban) {
    // countryside
    if (kind === 'F') { d.ground = 'field'; addTreeLine(d, rng); if (rng.chance(0.6)) for (let k = 0; k < rng.int(3, 8); k++) addProp(d, { kind: 'hay', x: ox + rng.float(20, 80), z: oz + rng.float(20, 80), rot: rng.float(0, 3) }); }
    else if (kind === 'W') addTrees(d, rng, rng.int(45, 70));
    else if (kind === 'O') { addTrees(d, rng, rng.int(6, 14)); for (let k = 0; k < rng.int(1, 4); k++) addProp(d, { kind: 'rock', x: ox + rng.float(15, 85), z: oz + rng.float(15, 85), s: rng.float(0.8, 2.2), rot: rng.float(0, 6) }); }
    else if (kind === 'h') {
      if (!d.ridge && !d.rail) {
        B.push({ x: ox + 34, z: oz + 30, w: 12, d: 10, h: 6, style: 'plaster', color: 0xf0e2c8, face: 'n', house: true, roofColor: 0x8a3f30, interior: 'house' });
        B.push({ x: ox + 68, z: oz + 62, w: 18, d: 24, h: 9, style: 'industrial', color: 0xa8432f, face: 'w', sign: 'חוות השקד' });
        d.parking.push({ x: ox + 46, z: oz + 26, rot: 0, type: rng.pick(['suv', 'truck', 'hatch']) });
        for (let k = 0; k < 5; k++) addProp(d, { kind: 'hay', x: ox + 50 + rng.float(-6, 30), z: oz + 80 + rng.float(-4, 6), rot: rng.float(0, 3) });
      }
      addTrees(d, rng, 6);
      d.ground = 'field';
    }
  }
  for (const f of FEATURED) if (f.x >= ox && f.x < ox + P && f.z >= oz && f.z < oz + P) d.parking.push({ ...f, fixed: true });

  // ------------------------------------------------ bridges over the bay (owned by the cell south of the line)
  if (isBridgeLine(ix, iz)) {
    const x0 = Math.max(ox, 1022), x1 = Math.min(ox + P, 1978);
    if (x1 > x0) {
      d.bridge = { x0, x1, z: oz };
      d.surfaces.push(makeSurface(x0, oz - 9.5, x1, oz + 9.5, 0));
      const rx0 = Math.max(x0, 1026), rx1 = Math.min(x1, 1974);
      if (rx1 > rx0) for (const s of [-1, 1]) d.colliders.push(makeBox((rx0 + rx1) / 2, oz + s * 9.7, (rx1 - rx0) / 2, 0.2, 0, -0.5, 1.15));
    }
  }

  // ------------------------------------------------ roads owned by this cell (north + west edge, NW node)
  d.roadH = segH(ix, iz);
  d.roadV = segV(ix, iz);
  const nn = nodeNbrs(ix, iz);
  d.node = nn.length ? { gx: ix, gz: iz, x: ox, z: oz, nbrs: nn, lights: hasLightsAt(ix, iz, nn.length) } : null;
  const urbanSide = (sx, sz) => isUrban(sx, sz);
  const segs = [];
  if (d.roadH) segs.push({ ax: ox, az: oz, bx: ox + P, bz: oz, dir: [1, 0], sideA: [ix, iz - 1], sideB: [ix, iz], endNodes: [[ix, iz], [ix + 1, iz]] });
  if (d.roadV) segs.push({ ax: ox, az: oz, bx: ox, bz: oz + P, dir: [0, 1], sideA: [ix, iz], sideB: [ix - 1, iz], endNodes: [[ix, iz], [ix, iz + 1]] });
  d.segs = segs;
  for (const s of segs) {
    const r = [-s.dir[1], s.dir[0]]; // right of travel along +dir
    const bridge = s.dir[0] === 1 && isBridgeLine(ix, iz);
    const urbanA = urbanSide(...s.sideA), urbanB = urbanSide(...s.sideB);
    s.crossA = nodeNbrs(...s.endNodes[0]).length >= 3;
    s.crossB = nodeNbrs(...s.endNodes[1]).length >= 3;
    // street lamps
    if (urbanA || urbanB || bridge) {
      for (const [t, side] of [[0.25, 1], [0.75, -1]]) {
        const x = s.ax + (s.bx - s.ax) * t + r[0] * side * (ROAD_HALF + 1), z = s.az + (s.bz - s.az) * t + r[1] * side * (ROAD_HALF + 1);
        if (!bridge && Math.min(x, 3000 - x) > 1030 && x > 1000 && x < 2000) continue;
        const lamp = { x, z, dx: -r[0] * side, dz: -r[1] * side, y: bridge ? 0 : Math.max(0, baseHeight(x, z)) };
        d.lamps.push(lamp);
        d.colliders.push(makeCircle(x, z, 0.2, 0, 7));
      }
    }
    // curb parking on urban sides
    for (const [side, isU] of [[1, urbanA], [-1, urbanB]]) {
      if (!isU || bridge || !rng.chance(0.38)) continue;
      const t = rng.float(22, 78);
      const x = s.ax + s.dir[0] * t + r[0] * side * PARK_OFFSET * (s.dir[0] === 1 ? -1 : -1);
      const z = s.az + s.dir[1] * t + r[1] * side * PARK_OFFSET * (s.dir[0] === 1 ? -1 : -1);
      // cars park in the direction of the adjacent lane (right-hand traffic)
      const off = [x - (s.ax + s.dir[0] * t), z - (s.az + s.dir[1] * t)];
      // travel direction whose right side is 'off'
      const heading = Math.atan2(off[1], -off[0]) ;
      d.parking.push({ x, z, rot: heading, curb: true });
    }
  }
  // traffic lights at the owned node
  if (d.node && d.node.lights) {
    for (const [gx, gz] of d.node.nbrs) {
      const fx = gx * P, fz = gz * P;
      const L = Math.hypot(ox - fx, oz - fz), dd = [(ox - fx) / L, (oz - fz) / L], r = [-dd[1], dd[0]];
      const x = ox - dd[0] * (ROAD_HALF + 1.2) + r[0] * (ROAD_HALF + 1.0);
      const z = oz - dd[1] * (ROAD_HALF + 1.2) + r[1] * (ROAD_HALF + 1.0);
      d.tl.push({ node: d.node, axis: Math.abs(dd[1]) > 0.5 ? 'z' : 'x', x, z, d: dd, r, y: Math.max(0, baseHeight(x, z)) });
      d.colliders.push(makeCircle(x, z, 0.2, 0, 5));
    }
  }

  // ------------------------------------------------ colliders + surfaces for buildings/props
  for (const b of B) {
    b.door = b.door || (() => { const [fx, fz] = faceVector(b.face); const half = (fx !== 0 ? b.w : b.d) / 2; return { x: b.x + fx * (half + 0.3), z: b.z + fz * (half + 0.3), face: b.face }; })();
    if (b.interior) {
      d.lazyInteriors ||= [];
      d.lazyInteriors.push(b);   // interior physics is built only when the player gets close (cellPhysics)
    } else {
      const h = b.house ? b.h + Math.min(b.w, b.d) * 0.35 : b.h;
      d.colliders.push(makeBox(b.x, b.z, b.w / 2, b.d / 2, 0, 0, h + CURB_H));
    }
  }
  if (d.garage) { const g = garageSpec(d.garage); d.colliders.push(...g.colliders); d.surfaces.push(...g.surfaces); d.parking.push(...g.parking); }
  for (const p of PR) propColliders(p, d.colliders);
  if (d.ridge) ridgeColliders(d);
  d.benches = PR.filter((p) => p.kind === 'bench').map((p) => ({ ...p, y: p.y ?? (urban ? CURB_H : Math.max(0, baseHeight(p.x, p.z))) }));
  return d;
}

function blocked(d, x, z, pad = 0) { return d.keepOut.some((r) => inRect(x, z, r, pad)); }
function addProp(d, p) { if (!blocked(d, p.x, p.z, 3)) d.props.push(p); }
function addTrees(d, rng, n) {
  for (let k = 0, tries = 0; k < n && tries < n * 4; tries++) {
    const x = d.ox + rng.float(12, 88), z = d.oz + rng.float(12, 88);
    if (blocked(d, x, z, 4)) continue;
    d.props.push({ kind: 'tree', x, z, s: rng.float(0.8, 1.6), y: 0 });
    k++;
  }
}
function addTreeLine(d, rng) {
  const side = rng.int(0, 3);
  for (let t = 14; t < 88; t += rng.float(7, 11)) {
    const x = side < 2 ? d.ox + t : d.ox + (side === 2 ? 13 : 87);
    const z = side < 2 ? d.oz + (side === 0 ? 13 : 87) : d.oz + t;
    if (!blocked(d, x, z, 4)) d.props.push({ kind: 'tree', x, z, s: rng.float(0.9, 1.3), y: 0 });
  }
}

export function propColliders(p, out) {
  switch (p.kind) {
    case 'tree': case 'palm': out.push(makeCircle(p.x, p.z, 0.3 * (p.s || 1), 0, 6)); break;
    case 'bench': out.push(makeBox(p.x, p.z, 0.85, 0.3, p.rot || 0, 0, 0.9)); break;
    case 'bin': out.push(makeCircle(p.x, p.z, 0.3, 0, 1)); break;
    case 'hedge': out.push(makeBox(p.x, p.z, p.w / 2, p.d / 2, 0, 0, 1.5)); break;
    case 'fence': out.push(makeBox((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, Math.max(0.1, (p.x1 - p.x0) / 2), Math.max(0.1, (p.z1 - p.z0) / 2), 0, 0, 3)); break;
    case 'watchtower': for (const sx of [-1.6, 1.6]) for (const sz of [-1.6, 1.6]) out.push(makeCircle(p.x + sx, p.z + sz, 0.2, 0, 7)); break;
    case 'flagpole': out.push(makeCircle(p.x, p.z, 0.15, 0, 10)); break;
    case 'cafeTable': out.push(makeCircle(p.x, p.z, 0.45, 0, 0.8)); break;
    case 'ironTower': for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(makeCircle(p.x + sx * 19, p.z + sz * 19, 2.2, 0, 12)); out.push(makeBox(p.x, p.z, 12, 12, 0, 29.4, 30.6)); break;
    case 'lounger': out.push(makeBox(p.x, p.z, 0.35, 0.95, p.rot || 0, 0, 0.6)); break;
    case 'parasol': out.push(makeCircle(p.x, p.z, 0.12, 0, 2.4)); break;
    case 'container': out.push(makeBox(p.x, p.z, 3.0, 1.2, p.rot || 0, 0, 2.6)); break;
    case 'chimney': out.push(makeCircle(p.x, p.z, 1.6, 0, p.h)); break;
    case 'pump': out.push(makeBox(p.x, p.z, 0.5, 0.35, 0, 0, 1.8)); break;
    case 'canopy':
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(makeCircle(p.x + sx * (p.w / 2 - 1), p.z + sz * (p.d / 2 - 1), 0.3, 0, 5));
      out.push(makeBox(p.x, p.z, p.w / 2, p.d / 2, 0, 5, 5.6));
      break;
    case 'pond': out.push(makeCircle(p.x, p.z, p.r - 0.5, 0, 0.6, 'water')); break;
    case 'fountain': out.push(makeCircle(p.x, p.z, 4.2, 0, 1.0)); out.push(makeCircle(p.x, p.z, 0.8, 0, 4.0)); break;
    case 'tower': out.push(makeCircle(p.x, p.z, 3, 0, p.h + 4)); break;
    case 'plane': out.push(makeBox(p.x, p.z, 1.6, 13, p.rot, 0, 5)); out.push(makeBox(p.x, p.z, 14, 1.4, p.rot, 1.5, 3)); break;
    case 'lifeguard': out.push(makeBox(p.x, p.z, 1.4, 1.4, 0, -1, 4.5)); break;
    case 'platformRoof': for (let k = -3; k <= 3; k++) out.push(makeCircle(p.x + k * (p.w / 7), p.z, 0.25, 0, 5)); break;
    case 'hay': out.push(makeCircle(p.x, p.z, 0.9, 0, 1.6)); break;
    case 'rock': out.push(makeCircle(p.x, p.z, 1.1 * (p.s || 1), 0, 1.4 * (p.s || 1))); break;
    case 'umbrella': out.push(makeCircle(p.x, p.z, 0.15, 0, 2.4)); break;
    case 'jetbridge': for (const dz of [-3, 4]) out.push(makeCircle(p.x, p.z + dz, 0.35, 0, 2.8)); out.push(makeBox(p.x, p.z, 1.5, 8, 0, 2.8, 5.6)); break;
  }
}

// Ridge: solid rock except tunnel bores at the arterial roads (x = multiples of 500)
export function ridgeHeight(x, z) {
  const ef = Math.min(1, Math.min(z - RIDGE.z0, RIDGE.z1 - z) / 4);
  if (ef <= 0) return 0;
  const end = Math.min(1, (x - RIDGE.x0) / 70, (RIDGE.x1 - x) / 70);
  if (end <= 0) return 0;
  const n = Math.sin(x * 0.031) * 0.12 + Math.sin(x * 0.0113 + z * 0.05) * 0.1 + Math.sin(z * 0.09) * 0.06;
  const mid = 1 - Math.pow((z - (RIDGE.z0 + RIDGE.z1) / 2) / ((RIDGE.z1 - RIDGE.z0) / 2), 2) * 0.35;
  const e = end * end * (3 - 2 * end), f = ef * ef * (3 - 2 * ef);
  return RIDGE.h * f * e * mid * (0.85 + n);
}
export function tunnelLines(x0, x1) {
  const out = [];
  for (let L = Math.ceil(x0 / 500) * 500; L <= x1; L += 500) out.push(L);
  return out;
}
function ridgeColliders(d) {
  const r = d.ridge;
  const gaps = tunnelLines(r.x0 - TUNNEL_HALF, r.x1 + TUNNEL_HALF).filter((L) => L >= RIDGE.x0 && L <= RIDGE.x1);
  // solid spans between tunnels
  let x = r.x0;
  const spans = [];
  for (const L of gaps) {
    if (L - TUNNEL_HALF - 0.6 > x) spans.push([x, Math.min(r.x1, L - TUNNEL_HALF - 0.6)]);
    x = Math.max(x, L + TUNNEL_HALF + 0.6);
  }
  if (x < r.x1) spans.push([x, r.x1]);
  const zi0 = Math.max(r.z0, RIDGE.z0 + 1.5), zi1 = Math.min(r.z1, RIDGE.z1 - 1.5);
  for (const [a, b] of spans) {
    if (b - a < 0.5) continue;
    let hmax = 0;
    for (let s = 0; s <= 6; s++) for (let t = 0; t <= 6; t++) hmax = Math.max(hmax, ridgeHeight(a + (b - a) * s / 6, zi0 + (zi1 - zi0) * t / 6));
    if (hmax < 0.5) continue;
    d.colliders.push(makeBox((a + b) / 2, (zi0 + zi1) / 2, (b - a) / 2, (zi1 - zi0) / 2, 0, -1, hmax, 'rock'));
  }
  for (const L of gaps) {
    if (L < r.x0 - TUNNEL_HALF || L > r.x1 + TUNNEL_HALF) continue;
    // tunnel walls and the rock above the bore
    for (const s of [-1, 1]) d.colliders.push(makeBox(L + s * (TUNNEL_HALF + 0.3), (r.z0 + r.z1) / 2, 0.3, (r.z1 - r.z0) / 2, 0, 0, TUNNEL_H + 0.5, 'tunnel'));
    d.colliders.push(makeBox(L, (zi0 + zi1) / 2, TUNNEL_HALF + 0.6, (zi1 - zi0) / 2, 0, TUNNEL_H, RIDGE.h, 'rock'));
  }
}

// Physics for a cell, built on first use: adds the walls/floors/stairs/elevator shafts of enterable buildings.
// Loose furniture colliders are added by the InteriorManager only while the interior is loaded.
export function cellPhysics(d) {
  if (!d.physDone) {
    d.physDone = true;
    for (const b of d.lazyInteriors || []) {
      const spec = interiorSpec(b);
      for (const c of spec.colliders) if (c.tag !== 'furniture') d.colliders.push(c);
      d.surfaces.push(...spec.surfaces);
    }
  }
  return d;
}
export const specOf = interiorSpec;

// convenience used by the vehicle manager / spawn logic
export { faceVector };
