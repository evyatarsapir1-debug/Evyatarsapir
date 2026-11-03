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
  ['equipment', ['אלקטרו', 'משקפי', 'פארם', 'צעצועי', 'ספרים', 'חדר כושר', 'דיוטי פרי']],
  ['food', ['קפה טרמינל', 'קפה', 'פיצה', 'בורגר', 'פלאפל', 'מאפיית', 'סושי', 'גלידת', 'מסעדת', 'מכולת', 'סופר', 'יין', 'דלק+', 'פרחי']],
];
export const KIND_NAMES = { wardrobe: 'ארון בגדים', weapons: 'חנות ציוד משחק (בדיוני)', mechanic: 'מוסך', barber: 'מספרה', clothes: 'חנות בגדים', equipment: 'חנות ציוד', food: 'אוכל ושתייה' };
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
    case 'clothes': {
      // --- suits (jacket + trousers in the same colour, white shirt and tie)
      const SUITS = [['חליפה שחורה קלאסית', 1, 2500], ['חליפה כחול נייבי', 17, 2450], ['חליפה אפורה פחם', 16, 2400], ['חליפה בורדו', 15, 2350], ['חליפה בז׳ קיצית', 14, 2300], ['חליפה לבנה', 18, 2200]];
      for (const [name, c, price] of SUITS) out.push({ id: `suit-${c}`, name, desc: 'ז׳קט, מכנסיים, חולצה לבנה ועניבה', swatch: CLOTH_COLORS[c], price, patch: { top: 'suit', topColor: c, bottom: 'pants', bottomColor: c, shoes: 1 } });
      // --- t-shirts: premium 200, basic 100
      for (const c of [0, 1, 3, 2]) out.push({ id: `tee200-${c}`, name: 'חולצה קצרה — מותג', desc: 'כותנה איכותית', swatch: CLOTH_COLORS[c], price: 200, patch: { top: 'tshirt', topColor: c } });
      for (const c of [4, 5, 7, 9]) out.push({ id: `tee100-${c}`, name: 'חולצה קצרה — בסיסית', swatch: CLOTH_COLORS[c], price: 100, patch: { top: 'tshirt', topColor: c } });
      // --- shorts: 120 and 80
      for (const c of [14, 17, 1]) out.push({ id: `sh120-${c}`, name: 'מכנס קצר — ברמודה', swatch: CLOTH_COLORS[c], price: 120, patch: { bottom: 'shorts', bottomColor: c } });
      for (const c of [3, 8, 9]) out.push({ id: `sh80-${c}`, name: 'מכנס קצר — ספורט', swatch: CLOTH_COLORS[c], price: 80, patch: { bottom: 'shorts', bottomColor: c } });
      // --- the rest of the store
      for (const st of ['jacket', 'hoodie', 'tank']) for (const c of COLOR_PICKS.slice(0, 3)) { const col = (c + TOP_STYLES.indexOf(st) * 2) % 14; out.push({ id: `top-${st}-${col}`, name: TOP_NAMES[st], swatch: CLOTH_COLORS[col], price: st === 'jacket' ? 450 : st === 'hoodie' ? 320 : 90, patch: { top: st, topColor: col } }); }
      for (const st of ['jeans', 'pants', 'skirt']) for (const c of COLOR_PICKS.slice(2, 5)) { const col = (c + 5) % 14; out.push({ id: `bot-${st}-${col}`, name: BOTTOM_NAMES[st], swatch: CLOTH_COLORS[col], price: st === 'jeans' ? 260 : 180, patch: { bottom: st, bottomColor: col } }); }
      out.push({ id: 'shoes-0', name: 'נעלי ספורט לבנות', swatch: 0xf2f2f2, price: 350, patch: { shoes: 0 } });
      out.push({ id: 'shoes-1', name: 'נעליים שחורות', swatch: 0x1d1d1f, price: 380, patch: { shoes: 1 } });
      for (const it of out) {
        const wearIt = wear(it.patch, it.name);
        if (econ.ownsCloth(it.id)) { it.label = 'ללבוש'; it.price = 0; it.buy = wearIt; it.desc = (it.desc ? it.desc + ' · ' : '') + 'בבעלותך — גם בארון בבית'; }
        else it.buy = () => { econ.startOutfit ||= { top: app.top, topColor: app.topColor, bottom: app.bottom, bottomColor: app.bottomColor, shoes: app.shoes }; econ.addCloth(it); return wearIt() + ' · נשמר בארון הבגדים בבית'; };
      }
      break;
    }
    case 'wardrobe': {
      // the closet at home: everything you bought, free to change into
      const start = econ.startOutfit || (econ.startOutfit = { top: app.top, topColor: app.topColor, bottom: app.bottom, bottomColor: app.bottomColor, shoes: app.shoes });
      out.push({ id: 'start', name: 'הבגדים מההתחלה', swatch: CLOTH_COLORS[start.topColor], price: 0, label: 'ללבוש', buy: wear(start, 'הבגדים מההתחלה') });
      for (const w of econ.wardrobe) out.push({ id: w.id, name: w.name, swatch: w.swatch, price: 0, label: 'ללבוש', buy: wear(w.patch, w.name) });
      if (!econ.wardrobe.length) out.push({ id: 'empty', name: 'הארון עוד ריק', desc: 'בגדים שתקנה בחנות הבגדים (אופנת אזורה) יחכו לך כאן', price: 0, disabled: true });
      break;
    }
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
      btn.textContent = it.label || (it.owned ? 'בבעלותך' : it.price ? fmt(it.price) : '—');
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
