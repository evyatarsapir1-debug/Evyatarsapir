// Player wallet, health and inventory (saved with the game).
export class Economy {
  constructor() { this.reset(); }
  reset() {
    this.money = 15000;
    this.health = 100;
    this.items = { flashlight: false, parachute: 0, repairKit: 0, snacks: 0 };
    this.weapons = {};          // id -> { ammo }
    this.equipped = null;       // weapon id or null
    this.flashlightOn = false;
    this.log = [];
  }
  toJSON() { return { money: this.money, health: this.health, items: this.items, weapons: this.weapons, equipped: this.equipped }; }
  load(o) {
    this.reset();
    if (!o) return;
    this.money = o.money ?? this.money; this.health = o.health ?? 100;
    Object.assign(this.items, o.items || {});
    this.weapons = o.weapons || {}; this.equipped = o.equipped && this.weapons[o.equipped] ? o.equipped : null;
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
