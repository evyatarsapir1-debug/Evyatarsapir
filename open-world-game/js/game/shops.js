// Shops: every enterable shop has a counter with a shopkeeper. Walk up to the counter and press E (or tap the button)
// to open the store. Catalogue depends on the kind of shop (from its sign).
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { fmt } from './economy.js';
import { TOP_STYLES, TOP_NAMES, BOTTOM_STYLES, BOTTOM_NAMES, HAIR_STYLES, HAIR_NAMES, HAIR_COLORS, CLOTH_COLORS } from '../character/characterModel.js';

const KINDS = [
  ['weapons', ['ארסנל']],
  ['mechanic', ['מוסך']],
  ['barber', ['מספרת']],
  ['clothes', ['אופנת', 'בגדי', 'נעלי', 'תכשיטי']],
  ['equipment', ['אלקטרו', 'משקפי', 'פארם', 'צעצועי', 'ספרים', 'חדר כושר']],
  ['food', ['קפה', 'פיצה', 'בורגר', 'פלאפל', 'מאפיית', 'סושי', 'גלידת', 'מסעדת', 'מכולת', 'סופר', 'יין', 'דלק+', 'פרחי']],
];
export const KIND_NAMES = { weapons: 'חנות ציוד משחק (בדיוני)', mechanic: 'מוסך', barber: 'מספרה', clothes: 'חנות בגדים', equipment: 'חנות ציוד', food: 'אוכל ושתייה' };
export function shopKind(sign) {
  if (!sign) return null;
  for (const [k, words] of KINDS) if (words.some((w) => sign.includes(w))) return k;
  return null;
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const COLOR_PICKS = [0, 1, 2, 3, 4, 6, 8, 12];

// Catalogue for a shop: [{ id, name, desc, price, swatch?, owned?, buy(ctx) -> message }]
function catalogue(kind, ctx) {
  const { econ, player, game } = ctx;
  const app = player.model.app;
  const out = [];
  const wear = (patch, label) => () => { player.model.setAppearance({ ...player.model.app, ...patch }); game.save(); return `לבשת: ${label}`; };
  switch (kind) {
    case 'clothes':
      for (const st of TOP_STYLES) for (const c of COLOR_PICKS.slice(0, 4)) out.push({ id: `top-${st}-${c}`, name: `${TOP_NAMES[st]}`, swatch: CLOTH_COLORS[(c + TOP_STYLES.indexOf(st) * 2) % CLOTH_COLORS.length], price: st === 'jacket' ? 450 : st === 'hoodie' ? 320 : 120, buy: null, patch: { top: st, topColor: (c + TOP_STYLES.indexOf(st) * 2) % CLOTH_COLORS.length } });
      for (const st of BOTTOM_STYLES) for (const c of COLOR_PICKS.slice(2, 5)) out.push({ id: `bot-${st}-${c}`, name: `${BOTTOM_NAMES[st]}`, swatch: CLOTH_COLORS[(c + 5) % CLOTH_COLORS.length], price: st === 'jeans' ? 260 : 180, patch: { bottom: st, bottomColor: (c + 5) % CLOTH_COLORS.length } });
      out.push({ id: 'shoes-0', name: 'נעלי ספורט לבנות', swatch: 0xf2f2f2, price: 350, patch: { shoes: 0 } });
      out.push({ id: 'shoes-1', name: 'נעליים שחורות', swatch: 0x1d1d1f, price: 380, patch: { shoes: 1 } });
      for (const it of out) it.buy = wear(it.patch, it.name);
      break;
    case 'barber':
      for (const st of HAIR_STYLES) out.push({ id: `hair-${st}`, name: `תספורת: ${HAIR_NAMES[st]}`, price: 90, buy: wear({ hairStyle: st }, HAIR_NAMES[st]) });
      HAIR_COLORS.forEach((c, i) => out.push({ id: `hairc-${i}`, name: 'צביעת שיער', swatch: c, price: 140, buy: wear({ hairColor: i }, 'צבע שיער חדש') }));
      break;
    case 'food':
      out.push({ id: 'coffee', name: 'קפה ומאפה', desc: '+15 בריאות', price: 28, buy: () => { econ.heal(15); return 'טעים! +15 בריאות'; } });
      out.push({ id: 'meal', name: 'ארוחה מלאה', desc: '+45 בריאות', price: 65, buy: () => { econ.heal(45); return 'שבע ומרוצה. +45 בריאות'; } });
      out.push({ id: 'feast', name: 'מגש משפחתי', desc: 'בריאות מלאה', price: 140, buy: () => { econ.heal(100); return 'בריאות מלאה!'; } });
      out.push({ id: 'snack', name: 'חטיף לדרך', desc: 'נכנס לתיק (+20 בריאות כשאוכלים)', price: 18, buy: () => { econ.items.snacks++; return 'חטיף נוסף לתיק'; } });
      break;
    case 'equipment':
      out.push({ id: 'flashlight', name: 'פנס', desc: 'מדליק אור קדימה בלילה (L / כפתור "פנס")', price: 220, owned: econ.items.flashlight, buy: () => { econ.items.flashlight = true; return 'קנית פנס. לחץ L כדי להדליק'; } });
      out.push({ id: 'parachute', name: 'מצנח', desc: 'נפתח לבד כשנופלים מגובה (גג, מסוק)', price: 900, buy: () => { econ.items.parachute++; return 'מצנח נוסף לתיק'; } });
      out.push({ id: 'repair', name: 'ערכת תיקון לרכב', desc: 'מתקנת את הרכב שאתה נוהג בו (מהתיק)', price: 600, buy: () => { econ.items.repairKit++; return 'ערכת תיקון נוספה לתיק'; } });
      out.push({ id: 'snack2', name: 'בקבוק מים וחטיף', desc: 'נכנס לתיק', price: 20, buy: () => { econ.items.snacks++; return 'נוסף לתיק'; } });
      break;
    case 'mechanic': {
      const v = game.myVehicleNear(45);
      if (!v) { out.push({ id: 'none', name: 'אין רכב שלך ליד המוסך', desc: 'הגע ברכב והחנה אותו קרוב למוסך', price: 0, disabled: true }); break; }
      out.push({ id: 'repair', name: `תיקון מלא — ${v.T.name}`, desc: `נזק כרגע: ${Math.round(v.damage)}%`, price: 250 + Math.round(v.damage * 6), disabled: v.damage < 1 && !v.wrecked, buy: () => { v.repair(); return 'הרכב תוקן ונראה כמו חדש'; } });
      [0xc0392b, 0x2e86c1, 0x111111, 0xf5f5f5, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22].forEach((c) => out.push({ id: `paint-${c}`, name: 'צביעה מחדש', swatch: c, price: 500, buy: () => { v.setColor(c); v.rebuildLod?.(); return 'הרכב נצבע מחדש'; } }));
      out.push({ id: 'engine', name: 'שדרוג מנוע', desc: `+15% תאוצה ומהירות (רמה ${v.tune || 0}/3)`, price: 2500 * ((v.tune || 0) + 1), disabled: (v.tune || 0) >= 3, buy: () => { v.upgradeEngine(); return 'המנוע שודרג'; } });
      break;
    }
    case 'weapons':
      for (const id of WEAPON_ORDER) {
        const W = WEAPONS[id], have = econ.weapons[id];
        if (!have) out.push({ id: `w-${id}`, name: W.name, desc: `כלי משחק בדיוני · ${W.ammoPack} יחידות`, swatch: W.color, price: W.price, buy: () => { econ.weapons[id] = { ammo: W.ammoPack }; econ.equipped = id; game.equip(id); return `${W.name} — בידיים שלך (G להחלפה)`; } });
        else out.push({ id: `a-${id}`, name: `תחמושת: ${W.name}`, desc: `+${W.ammoPack} (יש ${have.ammo})`, swatch: W.color, price: W.ammoPrice, buy: () => { have.ammo += W.ammoPack; return 'נוספה תחמושת'; } });
      }
      break;
  }
  return out;
}

export class ShopUI {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('shopPanel');
    this.list = this.el.querySelector('.items');
    this.title = this.el.querySelector('.stitle');
    this.money = this.el.querySelector('.smoney');
    this.msg = this.el.querySelector('.smsg');
    this.el.querySelector('.sclose').onclick = () => this.close();
  }
  get open() { return this.el.classList.contains('show'); }
  show(kind, name) {
    this.kind = kind; this.name = name;
    this.el.classList.add('show');
    this.msg.textContent = kind === 'weapons' ? 'כל הפריטים בחנות הם אביזרי משחק בדיוניים.' : '';
    this.render();
  }
  close() { this.el.classList.remove('show'); this.game.closeShop(); }
  render() {
    const g = this.game, econ = g.econ;
    this.title.textContent = `${this.name} · ${KIND_NAMES[this.kind]}`;
    this.money.textContent = `ביתרה: ${fmt(econ.money)}`;
    const items = catalogue(this.kind, { econ, player: g.player, game: g });
    this.list.innerHTML = '';
    for (const it of items) {
      const row = document.createElement('div'); row.className = 'srow';
      const sw = it.swatch !== undefined ? `<span class="sw2" style="background:${hex(it.swatch)}"></span>` : '';
      row.innerHTML = `${sw}<div class="sname"><b>${it.name}</b>${it.desc ? `<small>${it.desc}</small>` : ''}</div>`;
      const btn = document.createElement('button');
      btn.className = 'sbuy'; btn.type = 'button';
      btn.textContent = it.owned ? 'בבעלותך' : it.price ? fmt(it.price) : '—';
      btn.disabled = !!(it.disabled || it.owned || !econ.canAfford(it.price) || !it.buy);
      btn.onclick = () => {
        if (!econ.pay(it.price, it.name)) { this.msg.textContent = 'אין מספיק כסף'; return; }
        this.msg.textContent = it.buy();
        g.save();
        this.render();
      };
      row.appendChild(btn);
      this.list.appendChild(row);
    }
  }
}
