// Feel: press animation + ripple + sound on every button, floating "+coins" text, coins flying to the wallet,
// confetti, a big success banner, and quick fade transitions between the city, the station and menus.
import { sfx } from '../core/sfx.js';

const $ = (id) => document.getElementById(id);
const INSTANT = /[?&]manual/.test(location.search); // tests step frames by hand: no timed fades

function layer() {
  let el = $('fxLayer');
  if (!el) { el = document.createElement('div'); el.id = 'fxLayer'; document.body.appendChild(el); }
  return el;
}

export const fx = {
  init() {
    // every button: ripple + click sound (pointerdown feels instant on phones)
    document.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button, .tap');
      if (!b || b.disabled) return;
      sfx.unlock();
      const r = b.getBoundingClientRect();
      const s = Math.max(r.width, r.height) * 1.6;
      const rip = document.createElement('i');
      rip.className = 'ripple';
      rip.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
      if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
      b.classList.add('has-ripple');
      b.appendChild(rip);
      setTimeout(() => rip.remove(), 520);
      if (!b.dataset.silent) sfx.play(b.closest('.joy') ? 'tap' : 'click');
    }, { capture: true });
    // modals and sheets: a soft sound when they open
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target;
        if (m.attributeName !== 'class' || !(el.classList.contains('modal') || el.id === 'sheet' || el.id === 'mapOverlay')) continue;
        const was = (m.oldValue || '').includes('hidden'), now = el.classList.contains('hidden');
        if (was && !now) { sfx.play('open'); el.classList.remove('pop-in'); void el.offsetWidth; el.classList.add('pop-in'); }
      }
    });
    document.querySelectorAll('.modal, #sheet, #mapOverlay').forEach((el) => mo.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['class'] }));
  },

  /** Floating text at a screen point (or the middle). */
  float(text, { x = innerWidth / 2, y = innerHeight * 0.45, color = '#f0d395', size = 22 } = {}) {
    const el = document.createElement('div');
    el.className = 'fx-float';
    el.textContent = text;
    el.style.cssText = `left:${x}px;top:${y}px;color:${color};font-size:${size}px`;
    layer().appendChild(el);
    setTimeout(() => el.remove(), 1500);
  },

  /** Coins fly from a point to the wallet in the HUD, with a cash sound and "+N". */
  coins(amount, from) {
    if (!amount) return;
    const target = document.querySelector('#worldHud:not(.hidden) #wMoney') || document.querySelector('#hubCoins') || null;
    const tr = target ? target.getBoundingClientRect() : { left: innerWidth - 80, top: 20, width: 40, height: 20 };
    const sx = from?.x ?? innerWidth / 2, sy = from?.y ?? innerHeight / 2;
    const n = Math.min(12, 3 + Math.floor(Math.abs(amount) / 40));
    for (let k = 0; k < n; k++) {
      const c = document.createElement('div');
      c.className = 'fx-coin'; c.textContent = '🪙';
      const dx = tr.left + tr.width / 2 - sx, dy = tr.top + tr.height / 2 - sy;
      c.style.cssText = `left:${sx}px;top:${sy}px;--dx:${dx}px;--dy:${dy}px;--sx:${(Math.random() - 0.5) * 120}px;--sy:${-40 - Math.random() * 80}px;animation-delay:${k * 0.05}s`;
      layer().appendChild(c);
      setTimeout(() => c.remove(), 1300 + k * 50);
    }
    sfx.play(amount > 0 ? 'cash' : 'error');
    this.float(`${amount > 0 ? '+' : ''}${amount} 🪙`, { x: sx, y: sy - 30, color: amount > 0 ? '#f0d395' : '#ff8a7a' });
    if (target) setTimeout(() => { target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); }, 700);
  },

  xp(amount) {
    if (!amount) return;
    const t = document.querySelector('#worldHud:not(.hidden) #wXp');
    const r = t ? t.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
    this.float(`+${Math.round(amount)} XP`, { x: r.left + r.width / 2, y: r.top + 30, color: '#9fd4ff', size: 18 });
  },

  confetti(n = 60) {
    const colors = ['#d9b46a', '#f0d395', '#c8102e', '#1f3f8f', '#ffffff', '#3ecf6b'];
    for (let k = 0; k < n; k++) {
      const c = document.createElement('i');
      c.className = 'fx-confetti';
      c.style.cssText = `left:${Math.random() * 100}vw;background:${colors[k % colors.length]};--dx:${(Math.random() - 0.5) * 200}px;--r:${Math.random() * 720}deg;animation-duration:${1.6 + Math.random() * 1.4}s;animation-delay:${Math.random() * 0.3}s`;
      layer().appendChild(c);
      setTimeout(() => c.remove(), 3400);
    }
  },

  /** A big centred banner: "שלב הושלם!", "קידום!" ... */
  banner(title, sub = '', { sound = 'success', confetti = true } = {}) {
    const el = document.createElement('div');
    el.className = 'fx-banner';
    el.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
    layer().appendChild(el);
    sfx.play(sound);
    if (confetti) this.confetti(40);
    setTimeout(() => el.classList.add('out'), 1900);
    setTimeout(() => el.remove(), 2400);
  },

  /** Quick dip to black and back: the scene switch happens under it (city ↔ station ↔ menus). */
  flash() {
    let el = $('fxFlash');
    if (!el) { el = document.createElement('div'); el.id = 'fxFlash'; document.body.appendChild(el); }
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  },

  /** Fade to black, run fn in the middle, fade back. */
  transition(fn, { label = '' } = {}) {
    let el = $('fxFade');
    if (!el) { el = document.createElement('div'); el.id = 'fxFade'; el.innerHTML = '<span></span>'; document.body.appendChild(el); }
    el.querySelector('span').textContent = label;
    if (this._fading || INSTANT) { fn(); return; }
    this._fading = true;
    el.classList.add('on');
    sfx.play('whoosh');
    setTimeout(() => {
      try { fn(); } finally {
        setTimeout(() => { el.classList.remove('on'); this._fading = false; }, 60);
      }
    }, 230);
  },
};
