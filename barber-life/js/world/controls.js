// Control layout settings: button size, left-handed layout (joystick on the right), drag-to-move buttons,
// sound effects / music / volume, and restarting the tutorial. Saved per device in localStorage.
import { ctx } from '../game/context.js';
import { sfx } from '../core/sfx.js';

const KEY = 'barber_life_controls';
const $ = (id) => document.getElementById(id);
const DEF = { scale: 1, left: false, pos: {} };

function load() { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; } }

export const controls = {
  cfg: load(),
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch { /* ignore */ } },

  /** Apply size, side and custom positions to the HUD. */
  apply() {
    const hud = $('worldHud'); if (!hud) return;
    hud.style.setProperty('--ctl', this.cfg.scale);
    hud.classList.toggle('lefty', !!this.cfg.left);
    document.body.classList.toggle('lefty', !!this.cfg.left); // also swaps the cutting touchpad
    for (const id of ['joy', 'wActions']) {
      const el = $(id), p = this.cfg.pos[id];
      if (!el) continue;
      if (p) { el.style.left = `${p.x * 100}vw`; el.style.top = `${p.y * 100}vh`; el.style.right = 'auto'; el.style.bottom = 'auto'; el.classList.add('placed'); }
      else { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; el.classList.remove('placed'); }
    }
  },

  open() {
    const c = this.cfg, s = sfx.settings;
    ctx.dialog({
      title: '⚙️ הגדרות',
      html: `
        <h3 class="grp">🎮 שליטה</h3>
        <label class="set-row"><span>גודל הכפתורים</span><input id="setScale" type="range" min="0.75" max="1.4" step="0.05" value="${c.scale}"><b id="setScaleV">${Math.round(c.scale * 100)}%</b></label>
        <label class="set-row"><span>ג׳ויסטיק בצד ימין (שמאליים)</span><input id="setLeft" type="checkbox" ${c.left ? 'checked' : ''}></label>
        <div class="set-row"><span>מיקום הכפתורים</span><button id="setMove" class="btn ghost sm">✋ הזז כפתורים</button><button id="setResetPos" class="btn ghost sm">↺ ברירת מחדל</button></div>
        <p class="muted small">במחשב: W A S D / חיצים לתנועה · Shift ריצה · רווח קפיצה · E פעולה · M מפה · P טלפון · Q משימות · גרירת עכבר מסובבת מצלמה, גלגלת לזום.</p>
        <h3 class="grp">🔊 צליל</h3>
        <label class="set-row"><span>צלילי לחיצות ופעולות</span><input id="setSfx" type="checkbox" ${s.sfx ? 'checked' : ''}></label>
        <label class="set-row"><span>מוזיקת רקע</span><input id="setMusic" type="checkbox" ${s.music ? 'checked' : ''}></label>
        <label class="set-row"><span>עוצמה</span><input id="setVol" type="range" min="0" max="1" step="0.05" value="${s.volume}"><b id="setVolV">${Math.round(s.volume * 100)}%</b></label>
        <h3 class="grp">🎓 הדרכה</h3>
        <div class="set-row"><span>ההדרכה האינטראקטיבית מההתחלה</span><button id="setTut" class="btn ghost sm">▶ הפעל הדרכה</button></div>`,
      buttons: [{ label: 'סגור', primary: true }],
      mount: (b) => {
        b.querySelector('#setScale').addEventListener('input', (e) => { c.scale = +e.target.value; b.querySelector('#setScaleV').textContent = `${Math.round(c.scale * 100)}%`; this.apply(); this.save(); });
        b.querySelector('#setLeft').addEventListener('change', (e) => { c.left = e.target.checked; c.pos = {}; this.apply(); this.save(); });
        b.querySelector('#setMove').addEventListener('click', () => { ctx.closeDialog(); this.editMode(true); });
        b.querySelector('#setResetPos').addEventListener('click', () => { c.pos = {}; c.scale = 1; this.apply(); this.save(); ctx.toast('המיקום והגודל חזרו לברירת המחדל'); });
        b.querySelector('#setSfx').addEventListener('change', (e) => sfx.set('sfx', e.target.checked));
        b.querySelector('#setMusic').addEventListener('change', (e) => sfx.set('music', e.target.checked));
        b.querySelector('#setVol').addEventListener('input', (e) => { sfx.set('volume', +e.target.value); b.querySelector('#setVolV').textContent = `${Math.round(e.target.value * 100)}%`; });
        b.querySelector('#setTut').addEventListener('click', () => { ctx.closeDialog(); ctx.tutorial?.restart(); });
      },
    });
  },

  /** Drag the joystick and the action buttons to where your thumbs are. */
  editMode(on) {
    const hud = $('worldHud');
    hud.classList.toggle('editing', on);
    $('editBar').classList.toggle('hidden', !on);
    this.editing = on;
    if (!on) { this.save(); return; }
    for (const id of ['joy', 'wActions']) {
      const el = $(id);
      if (el._dragBound) continue;
      el._dragBound = true;
      el.addEventListener('pointerdown', (e) => {
        if (!this.editing) return;
        e.stopImmediatePropagation(); e.preventDefault();
        const r = el.getBoundingClientRect();
        const off = { x: e.clientX - r.left, y: e.clientY - r.top };
        el.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const x = Math.min(innerWidth - r.width, Math.max(0, ev.clientX - off.x)), y = Math.min(innerHeight - r.height, Math.max(0, ev.clientY - off.y));
          this.cfg.pos[id] = { x: x / innerWidth, y: y / innerHeight };
          this.apply();
        };
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); this.save(); };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      }, { capture: true });
    }
  },
};
