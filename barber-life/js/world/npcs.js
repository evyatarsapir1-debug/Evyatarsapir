// City residents: they walk the sidewalks around their block, go into shops and come out again, chat with the
// player, and become real clients of barbershops: they walk in, sit and wait, get a haircut in a chair and leave.
import * as THREE from 'three';
import { N, blockCenter } from './worldData.js';
import { buildPerson, animatePerson, randomLook } from './people.js';
import { mulberry32 } from '../hair/scalp.js';

const PATH = 22.0;
const PER = PATH * 8;
const NAMES = ['דניאל', 'יוסי', 'עומר', 'איתי', 'נועם', 'אורי', 'רון', 'גיל', 'אלון', 'משה', 'אבי', 'יונתן', 'עידו', 'תומר', 'שי', 'מיכל', 'נועה', 'שירה', 'רותם', 'מאיה', 'אסף', 'רועי', 'מתן', 'אלעד'];

export const TIPS = [
  'שמעתי שבפייד האוס מחפשים ספר מתחיל. כדאי לדבר עם מוטי.',
  'הדבר הכי חשוב אצל ספר? שיקשיב למה שאני מבקש!',
  'בפעם האחרונה הספר לא ניקה לי את הצוואר. לא חזרתי אליו.',
  'אני תמיד בודק שהספר מחטא את המכונה לפני שהוא מתחיל.',
  'פייד טוב רואים מאחור. שם אי אפשר להסתתר.',
  'משרד הנדל״ן ליד האקדמיה משכיר חנויות. חלומות של כל ספר...',
  'החנות בכיכר העיר הכי יקרה, אבל עוברים שם המון אנשים.',
  'אם המספרה נקייה ויש קפה — אני מוכן לחכות.',
  'לקוח מרוצה מביא חברים. לקוח לא מרוצה מספר לכולם.',
  'ראיתי באקדמיה שמתרגלים על ראשי אימון לפני שנוגעים בלקוחות. חכם.',
  'כשיורד גשם יש פחות אנשים ברחוב. במספרות שקט יותר.',
  'ספר טוב מתחיל במסרק ארוך ויורד בהדרגה. את מה שנחתך אי אפשר להחזיר.',
  'אני הולך לאקדמיה ללמוד ערב אחד בשבוע. גם אתה?',
  'תשמור כסף בצד. שכירות, חשמל, משכורות... זה מצטבר.',
];

function loopPoint(c, s) {
  s = ((s % PER) + PER) % PER;
  const L = PATH * 2, side = Math.floor(s / L), u = s - side * L;
  switch (side) {
    case 0: return { x: c.x - PATH + u, z: c.z - PATH };
    case 1: return { x: c.x + PATH, z: c.z - PATH + u };
    case 2: return { x: c.x + PATH - u, z: c.z + PATH };
    default: return { x: c.x - PATH, z: c.z + PATH - u };
  }
}
function loopParam(c, p) {
  // closest perimeter parameter for a point near the path
  const dx = p.x - c.x, dz = p.z - c.z;
  if (Math.abs(dz) >= Math.abs(dx)) return dz < 0 ? (dx + PATH) : PATH * 4 + (PATH - dx);
  return dx > 0 ? PATH * 2 + (dz + PATH) : PATH * 6 + (PATH - dz);
}

export class People {
  constructor(scene, buildings, count = 22) {
    this.scene = scene;
    this.buildings = buildings;
    this.list = [];
    this.group = new THREE.Group(); this.group.name = 'people';
    scene.add(this.group);
    const rng = mulberry32(77);
    const doors = Object.values(buildings).filter((b) => !b.property || b.ownedBranch);
    this.doorsByBlock = {};
    for (const b of doors) (this.doorsByBlock[b.block.join(',')] ||= []).push(b);
    for (let k = 0; k < count; k++) this.spawn(k % N, Math.floor(k / N) % N, rng);
  }

  spawn(i, j, rng = Math.random, role = 'walker') {
    const look = randomLook(rng);
    const mesh = buildPerson(look);
    this.group.add(mesh);
    const c = blockCenter(i, j);
    const p = { mesh, c, s: rng() * PER, dir: rng() < 0.5 ? 1 : -1, speed: 1.0 + rng() * 0.5, state: 'loop', name: NAMES[Math.floor(rng() * NAMES.length)], seed: Math.floor(rng() * 1e9), role, timer: 3 + rng() * 20, look };
    const q = loopPoint(c, p.s);
    mesh.position.set(q.x, 0.14, q.z);
    this.list.push(p);
    return p;
  }

  /** Make a resident walk to a shop as a client. onSeated(p) is called when he sits down to wait. */
  sendClient(shop, onSeated, info = {}) {
    // a new person appears on the shop's block, away from the door
    const p = this.spawn(shop.block[0], shop.block[1], Math.random, 'client');
    p.c = blockCenter(shop.block[0], shop.block[1]);
    const sd = loopParam(p.c, shop.door);
    p.s = sd + (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 10);
    const q = loopPoint(p.c, p.s);
    p.mesh.position.set(q.x, 0.14, q.z);
    Object.assign(p, info);
    p.shop = shop; p.onSeated = onSeated; p.target = sd; p.state = 'toDoor';
    return p;
  }

  /** Send a waiting client to a chair; after `minutes` of game time (or when released) he leaves. */
  toChair(p, spot) { p.state = 'toChair'; p.goal = spot.world; p.spot = spot; }
  release(p) { p.state = 'leaving'; p.goal = p.shop.inside; }

  remove(p) { this.group.remove(p.mesh); this.list = this.list.filter((x) => x !== p); }

  nearest(pos, maxD = 2.2) {
    let best = null, bd = maxD;
    for (const p of this.list) {
      if (p.state === 'gone') continue;
      const d = Math.hypot(p.mesh.position.x - pos.x, p.mesh.position.z - pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  update(dt) {
    for (const p of this.list.slice()) {
      const m = p.mesh;
      let speed = 0, sitting = false;
      const walkTo = (g, sp = p.speed) => {
        const dx = g.x - m.position.x, dz = g.z - m.position.z, d = Math.hypot(dx, dz);
        if (d < 0.15) return true;
        const st = Math.min(d, sp * dt);
        m.position.x += dx / d * st; m.position.z += dz / d * st;
        m.rotation.y = Math.atan2(dx, dz);
        speed = sp;
        return false;
      };
      switch (p.state) {
        case 'loop': {
          p.timer -= dt;
          p.s += p.dir * p.speed * dt;
          const q = loopPoint(p.c, p.s);
          walkTo(q, p.speed * 2);
          // sometimes visit a shop on this block
          if (p.timer < 0 && p.role === 'walker') {
            p.timer = 15 + Math.random() * 30;
            const ds = this.doorsByBlock[`${Math.round((p.c.x / 62) + 1.5)},${Math.round((p.c.z / 62) + 1.5)}`];
            if (ds && Math.random() < 0.45) { p.shop = ds[Math.floor(Math.random() * ds.length)]; p.target = loopParam(p.c, p.shop.door); p.state = 'toDoor'; p.visit = true; }
          }
          break;
        }
        case 'toDoor': {
          const diff = ((p.target - p.s) % PER + PER * 1.5) % PER - PER / 2;
          if (Math.abs(diff) < 0.5) { p.state = 'enter'; break; }
          p.s += Math.sign(diff) * Math.min(Math.abs(diff), p.speed * 1.2 * dt);
          walkTo(loopPoint(p.c, p.s), p.speed * 2.4);
          break;
        }
        case 'enter':
          if (walkTo(p.shop.door) && true) p.state = 'enter2';
          break;
        case 'enter2':
          if (walkTo(p.shop.inside)) {
            if (p.role === 'client') {
              const seat = p.shop.takeSeat?.(p);
              if (seat) { p.seat = seat; p.state = 'toSeat'; } else { p.state = 'leaving'; p.goal = p.shop.inside; p.onGaveUp?.(p); }
            } else { p.state = 'inside'; p.timer = 10 + Math.random() * 25; }
          }
          break;
        case 'inside':
          p.timer -= dt;
          if (p.timer < 0) p.state = 'exit';
          break;
        case 'toSeat':
          if (walkTo(p.seat.world)) { p.state = 'waiting'; m.rotation.y = p.seat.rot; p.onSeated?.(p); }
          break;
        case 'waiting': sitting = true; break;
        case 'toChair':
          if (walkTo(p.goal)) { p.state = 'inChair'; m.rotation.y = p.spot.rot + Math.PI; }
          break;
        case 'inChair': sitting = true; break;
        case 'leaving':
          p.shop.freeSeat?.(p);
          if (walkTo(p.shop.inside)) p.state = 'exit';
          break;
        case 'exit':
          if (walkTo(p.shop.door)) {
            p.s = loopParam(p.c, p.shop.door);
            p.state = 'loop'; p.role = 'walker'; p.timer = 20 + Math.random() * 30;
            if (p.temporary) { p.state = 'despawn'; p.timer = 25; }
          }
          break;
        case 'despawn': {
          p.timer -= dt;
          p.s += p.dir * p.speed * dt;
          walkTo(loopPoint(p.c, p.s), p.speed * 2);
          if (p.timer < 0) this.remove(p);
          break;
        }
      }
      if (sitting) { m.position.y = 0.14; }
      animatePerson(m, dt, speed, sitting);
    }
  }
}
export { NAMES as PERSON_NAMES };
