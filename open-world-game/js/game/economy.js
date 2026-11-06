// Player wallet, health and inventory (saved with the game).

// Food you can buy: it goes into the bag and you eat it from there ("לאכול").
export const FOODS = {
  icecream:  { name: 'גלידה בגביע', icon: '🍦', heal: 15, color: 0xf6c1d0 },
  icebox:    { name: 'גלידה בקופסה', icon: '🍨', heal: 25, color: 0xf3e3b5 },
  shake:     { name: 'מילקשייק', icon: '🥤', heal: 20, color: 0xd9a6c9 },
  falafel:   { name: 'פלאפל בפיתה', icon: '🧆', heal: 30, color: 0xe2c28a },
  falafelhalf: { name: 'חצי מנה פלאפל', icon: '🧆', heal: 18, color: 0xe2c28a },
  fries:     { name: 'צ׳יפס', icon: '🍟', heal: 10, color: 0xf2c94c },
  pizza:     { name: 'משולש פיצה', icon: '🍕', heal: 15, color: 0xe8a33d },
  pizzabox:  { name: 'פיצה משפחתית', icon: '🍕', heal: 60, color: 0xe8a33d },
  burger:    { name: 'המבורגר', icon: '🍔', heal: 40, color: 0x8a5a33 },
  coffee:    { name: 'קפה', icon: '☕', heal: 8, color: 0x6e4b3a },
  croissant: { name: 'קרואסון', icon: '🥐', heal: 10, color: 0xd9a35c },
  cake:      { name: 'פרוסת עוגה', icon: '🍰', heal: 18, color: 0xf3e3d3 },
  sushi:     { name: 'מגש סושי', icon: '🍣', heal: 45, color: 0xf2f2f2 },
  sandwich:  { name: 'כריך', icon: '🥪', heal: 20, color: 0xe8d29a },
  meal:      { name: 'ארוחה מלאה', icon: '🍱', heal: 45, color: 0xc0392b },
  drink:     { name: 'שתייה קרה', icon: '🧃', heal: 5, color: 0x2e86c1 },
  baguette:  { name: 'באגט', icon: '🥖', heal: 18, color: 0xd9a35c },
  crepe:     { name: 'קרפ', icon: '🥞', heal: 20, color: 0xe8c58a },
  snack:     { name: 'חטיף', icon: '🍫', heal: 20, color: 0x6e4b3a },
};
export class Economy {
  constructor() { this.reset(); }
  reset() {
    this.money = 15000;
    this.health = 100;
    this.items = { flashlight: false, parachute: 0, repairKit: 0, snacks: 0, food: {} };
    this.weapons = {};          // id -> { ammo }
    this.equipped = null;       // weapon id or null
    this.flashlightOn = false;
    this.startOutfit = null;
    this.ownedCars = [];        // bought vehicles [{ type, color }]
    this.wardrobe = [];         // clothes the player owns: [{ id, name, swatch, patch }]
    this.log = [];
  }
  toJSON() { return { money: this.money, health: this.health, items: this.items, weapons: this.weapons, equipped: this.equipped, wardrobe: this.wardrobe, startOutfit: this.startOutfit, ownedCars: this.ownedCars }; }
  load(o) {
    this.reset();
    if (!o) return;
    this.money = o.money ?? this.money; this.health = o.health ?? 100;
    Object.assign(this.items, o.items || {});
    this.items.food = { ...(o.items?.food || {}) };
    if (this.items.snacks > 0) { this.items.food.snack = (this.items.food.snack || 0) + this.items.snacks; this.items.snacks = 0; }
    this.wardrobe = Array.isArray(o.wardrobe) ? o.wardrobe : [];
    this.startOutfit = o.startOutfit || null;
    this.ownedCars = Array.isArray(o.ownedCars) ? o.ownedCars : [];
    this.weapons = o.weapons || {}; this.equipped = o.equipped && this.weapons[o.equipped] ? o.equipped : null;
  }
  ownsCloth(id) { return this.wardrobe.some((w) => w.id === id); }
  addCloth(it) { if (!this.ownsCloth(it.id)) this.wardrobe.push({ id: it.id, name: it.name, swatch: it.swatch, patch: it.patch }); }
  addFood(id, n = 1) { this.items.food[id] = (this.items.food[id] || 0) + n; }
  foodCount() { return Object.values(this.items.food).reduce((a, b) => a + b, 0); }
  eat(id) {
    if (!(this.items.food[id] > 0)) return null;
    this.items.food[id]--; if (!this.items.food[id]) delete this.items.food[id];
    const F = FOODS[id]; this.heal(F.heal); return F;
  }
  canAfford(p) { return this.money >= p; }
  pay(p, what) {
    if (this.money < p) return false;
    this.money -= p;
    this.log.unshift({ what, amount: -p, t: Date.now() });
    this.log.length = Math.min(this.log.length, 20);
    return true;
  }
  earn(p, what) { this.money += p; this.log.unshift({ what, amount: p, t: Date.now() }); }
  hurt(n) { this.health = Math.max(0, this.health - n); }
  heal(n) { this.health = Math.min(100, this.health + n); }
}

export const fmt = (n) => '₪' + Math.round(n).toLocaleString('he-IL');
