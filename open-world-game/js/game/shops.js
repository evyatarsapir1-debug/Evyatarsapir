// Shops: every enterable shop has a counter with a shopkeeper. Walk up to the counter and press E (or tap the button)
// to open the store. Catalogue depends on the kind of shop (from its sign).
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { fmt, FOODS } from './economy.js';
import { TOP_STYLES, TOP_NAMES, BOTTOM_STYLES, BOTTOM_NAMES, HAIR_STYLES, HAIR_NAMES, HAIR_COLORS, CLOTH_COLORS, SHOE_COLORS } from '../character/characterModel.js';

const KINDS = [
  ['weapons', ['חנות נשקים', 'ארסנל']],
  ['mechanic', ['מוסך']],
  ['barber', ['מספרת']],
  ['clothes', ['חנות בגדים', 'אופנת', 'בגדי', 'נעלי', 'תכשיטי']],
  ['equipment', ['אלקטרו', 'משקפי', 'פארם', 'צעצועי', 'ספרים', 'חדר כושר', 'דיוטי פרי']],
  ['food', ['קפה טרמינל', 'קפה', 'פיצה', 'בורגר', 'פלאפל', 'מאפיית', 'סושי', 'גלידת', 'מסעדת', 'מכולת', 'סופר', 'יין', 'דלק+', 'פרחי']],
];
export const KIND_NAMES = { wardrobe: 'ארון בגדים', weapons: 'נשקים ותחמושת', mechanic: 'מוסך', barber: 'מספרה', clothes: 'חנות בגדים', equipment: 'חנות ציוד', food: 'אוכל ושתייה' };
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
      // --- shoes: ₪120 (sneakers) and ₪250 (leather / boots)
      for (const c of [0, 1, 3, 2]) out.push({ id: `snk-${c}`, name: 'נעלי ספורט', desc: 'סוליה לבנה ושרוכים', swatch: SHOE_COLORS[c], price: 120, patch: { shoes: c, shoeStyle: 'sneaker' } });
      for (const c of [1, 4]) out.push({ id: `frm-${c}`, name: 'נעלי עור מבריקות', desc: 'מתאימות לחליפה', swatch: SHOE_COLORS[c], price: 250, patch: { shoes: c, shoeStyle: 'formal' } });
      for (const c of [4, 1, 5]) out.push({ id: `bot-${c}`, name: 'מגפונים', desc: 'עור, עד הקרסול', swatch: SHOE_COLORS[c], price: 250, patch: { shoes: c, shoeStyle: 'boot' } });
      // --- hats: ₪60 and ₪100
      for (const c of [1, 2, 3, 0]) out.push({ id: `cap-${c}`, name: 'כובע מצחייה', swatch: CLOTH_COLORS[c], price: 60, patch: { hat: 'cap', hatColor: c } });
      for (const c of [8, 14]) out.push({ id: `bkt-${c}`, name: 'כובע טמבל', swatch: CLOTH_COLORS[c], price: 60, patch: { hat: 'bucket', hatColor: c } });
      for (const c of [2, 9, 5]) out.push({ id: `bea-${c}`, name: 'כובע גרב', swatch: CLOTH_COLORS[c], price: 100, patch: { hat: 'beanie', hatColor: c } });
      for (const c of [1, 16, 14]) out.push({ id: `fed-${c}`, name: 'כובע לבד אלגנטי', swatch: CLOTH_COLORS[c], price: 100, patch: { hat: 'fedora', hatColor: c } });
      out.push({ id: 'nohat', name: 'בלי כובע', price: 0, label: 'להוריד', patch: { hat: 'none' } });
      for (const it of out) {
        const wearIt = wear(it.patch, it.name);
        if (it.id === 'nohat') { it.buy = wearIt; continue; }
        if (econ.ownsCloth(it.id)) { it.label = 'ללבוש'; it.price = 0; it.buy = wearIt; it.desc = (it.desc ? it.desc + ' · ' : '') + 'בבעלותך — גם בארון בבית'; }
        else it.buy = () => { econ.startOutfit ||= { top: app.top, topColor: app.topColor, bottom: app.bottom, bottomColor: app.bottomColor, shoes: app.shoes, shoeStyle: app.shoeStyle || 'sneaker', hat: app.hat || 'none', hatColor: app.hatColor }; econ.addCloth(it); return wearIt() + ' · נשמר בארון הבגדים בבית'; };
      }
      break;
    }
    case 'wardrobe': {
      // the closet at home: everything you bought, free to change into
      const start = econ.startOutfit || (econ.startOutfit = { top: app.top, topColor: app.topColor, bottom: app.bottom, bottomColor: app.bottomColor, shoes: app.shoes, shoeStyle: app.shoeStyle || 'sneaker', hat: app.hat || 'none', hatColor: app.hatColor });
      out.push({ id: 'start', name: 'הבגדים מההתחלה', swatch: CLOTH_COLORS[start.topColor], price: 0, label: 'ללבוש', patch: start, buy: wear(start, 'הבגדים מההתחלה') });
      for (const w of econ.wardrobe) out.push({ id: w.id, name: w.name, swatch: w.swatch, price: 0, label: 'ללבוש', patch: w.patch, buy: wear(w.patch, w.name) });
      if (econ.wardrobe.some((w) => w.patch.hat)) out.push({ id: 'nohat', name: 'בלי כובע', price: 0, label: 'להוריד', patch: { hat: 'none' }, buy: wear({ hat: 'none' }, 'בלי כובע') });
      if (!econ.wardrobe.length) out.push({ id: 'empty', name: 'הארון עוד ריק', desc: 'בגדים שתקנה בחנות הבגדים (חנות בגדים) יחכו לך כאן', price: 0, disabled: true });
      break;
    }
    case 'barber':
      for (const st of HAIR_STYLES) out.push({ id: `hair-${st}`, name: `תספורת: ${HAIR_NAMES[st]}`, price: 90, patch: { hairStyle: st }, buy: wear({ hairStyle: st }, HAIR_NAMES[st]) });
      HAIR_COLORS.forEach((c, i) => out.push({ id: `hairc-${i}`, name: 'צביעת שיער', swatch: c, price: 140, patch: { hairColor: i }, buy: wear({ hairColor: i }, 'צבע שיער חדש') }));
      break;
    case 'food': {
      // every place sells its own food; it goes into the bag and you eat it from there
      const n = ctx.name || '';
      const menu = /גלידת/.test(n) ? [['icecream', 18], ['icebox', 32], ['shake', 24]]
        : /פלאפל/.test(n) ? [['falafel', 25], ['falafelhalf', 16], ['fries', 12], ['drink', 8]]
        : /פיצה/.test(n) ? [['pizza', 14], ['pizzabox', 60], ['drink', 8]]
        : /בורגר/.test(n) ? [['burger', 45], ['fries', 12], ['shake', 24]]
        : /סושי/.test(n) ? [['sushi', 55], ['drink', 8]]
        : /קפה|מאפיית/.test(n) ? [['coffee', 14], ['croissant', 12], ['cake', 22]]
        : [['sandwich', 22], ['meal', 65], ['drink', 8], ['snack', 18]];
      for (const [id, price] of menu) {
        const F = FOODS[id];
        out.push({ id: `food-${id}`, name: `${F.icon} ${F.name}`, desc: `+${F.heal} בריאות · נכנס לתיק (יש לך ${econ.items.food[id] || 0})`, price,
          buy: () => { econ.addFood(id); return `${F.icon} ${F.name} נוסף לתיק — פותחים את התיק ולוחצים "לאכול"`; } });
      }
      break;
    }
    case 'equipment':
      out.push({ id: 'flashlight', name: 'פנס', desc: 'מדליק אור קדימה בלילה (L / כפתור "פנס")', price: 220, owned: econ.items.flashlight, buy: () => { econ.items.flashlight = true; return 'קנית פנס. לחץ L כדי להדליק'; } });
      out.push({ id: 'parachute', name: 'מצנח', desc: 'נפתח לבד כשנופלים מגובה (גג, מסוק)', price: 900, buy: () => { econ.items.parachute++; return 'מצנח נוסף לתיק'; } });
      out.push({ id: 'repair', name: 'ערכת תיקון לרכב', desc: 'מתקנת את הרכב שאתה נוהג בו (מהתיק)', price: 600, buy: () => { econ.items.repairKit++; return 'ערכת תיקון נוספה לתיק'; } });
      out.push({ id: 'snack2', name: '🍫 חטיף ובקבוק מים', desc: 'נכנס לתיק', price: 20, buy: () => { econ.addFood('snack'); econ.addFood('drink'); return 'נוסף לתיק'; } });
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
        if (!have) out.push({ id: `w-${id}`, name: W.name, desc: `${W.ammoPack} יחידות תחמושת`, swatch: W.color, price: W.price, buy: () => { econ.weapons[id] = { ammo: W.ammoPack }; econ.equipped = id; game.equip(id); return `${W.name} — בידיים שלך (G להחלפה)`; } });
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
  get tryOn() { return this.kind === 'clothes' || this.kind === 'wardrobe' || this.kind === 'barber'; }
  show(kind, name) {
    this.kind = kind; this.name = name;
    this.el.classList.add('show');
    this.el.classList.toggle('side', this.tryOn);
    this.committed = { ...this.game.player.model.app };   // what you wear now (restored if you only try things on)
    this.trying = null;
    this.msg.textContent = kind === 'weapons' ? 'בחר נשק — אחרי הקנייה הוא בידיים שלך (G להחלפה)' : this.tryOn ? 'הקש על פריט כדי למדוד אותו עליך לפני הקנייה' : '';
    this.render();
  }
  close() {
    if (this.tryOn && this.committed) this.game.player.model.setAppearance(this.committed);
    this.trying = null;
    this.el.classList.remove('show'); this.game.closeShop();
  }
  // try an item on (nothing is bought or saved)
  preview(it) {
    if (!it.patch) return;
    this.trying = it.id;
    this.game.player.model.setAppearance({ ...this.committed, ...it.patch });
    this.msg.textContent = `מודד: ${it.name}${it.price && it.label !== 'ללבוש' ? ` · ${fmt(it.price)}` : ''}`;
    this.list.querySelectorAll('.srow').forEach((r) => r.classList.toggle('trying', r.dataset.id === it.id));
  }
  render() {
    const g = this.game, econ = g.econ;
    this.title.textContent = `${this.name} · ${KIND_NAMES[this.kind]}`;
    this.money.textContent = `ביתרה: ${fmt(econ.money)}`;
    const items = catalogue(this.kind, { econ, player: g.player, game: g, name: this.name });
    this.list.innerHTML = '';
    for (const it of items) {
      const row = document.createElement('div'); row.className = 'srow' + (this.trying === it.id ? ' trying' : '') + (it.patch && this.tryOn ? ' can-try' : '');
      row.dataset.id = it.id;
      if (it.patch && this.tryOn) row.onclick = (e) => { if (e.target.closest('.sbuy')) return; this.preview(it); };
      const sw = it.swatch !== undefined ? `<span class="sw2" style="background:${hex(it.swatch)}"></span>` : '';
      row.innerHTML = `${sw}<div class="sname"><b>${it.name}</b>${it.desc ? `<small>${it.desc}</small>` : ''}</div>`;
      const btn = document.createElement('button');
      btn.className = 'sbuy'; btn.type = 'button';
      btn.textContent = it.label || (it.owned ? 'בבעלותך' : it.price ? fmt(it.price) : '—');
      btn.disabled = !!(it.disabled || it.owned || !econ.canAfford(it.price) || !it.buy);
      btn.onclick = () => {
        if (!econ.pay(it.price, it.name)) { this.msg.textContent = 'אין מספיק כסף'; return; }
        if (this.tryOn && this.committed) g.player.model.setAppearance(this.committed);   // drop the preview, then wear what was bought
        this.msg.textContent = it.buy();
        if (this.tryOn) { this.committed = { ...g.player.model.app }; this.trying = null; }
        g.save();
        this.render();
      };
      row.appendChild(btn);
      this.list.appendChild(row);
    }
  }
}
