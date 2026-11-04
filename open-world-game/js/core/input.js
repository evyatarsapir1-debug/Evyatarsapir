// Unified input: keyboard + mouse on desktop, virtual joystick + swipe camera + contextual buttons on touch screens.
export class Input {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.keys = new Set();
    this.held = new Set();      // logical buttons currently held
    this.pressed = new Set();   // logical buttons pressed this frame
    this.moveX = 0; this.moveY = 0;
    this.joyX = 0; this.joyY = 0;
    this.lookDX = 0; this.lookDY = 0; this.zoom = 0;
    this.enabled = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.joy = { id: null, ox: 0, oy: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.pinch = null;
    this.ui = ui;
    this.lastInput = performance.now();
    this._bind();
  }

  _bind() {
    const keyMap = {
      KeyE: 'interact', KeyF: 'vehicle', KeyC: 'camera', KeyH: 'horn', KeyM: 'map', Escape: 'pause', KeyP: 'pause',
      Space: 'jump', ShiftLeft: 'run', ShiftRight: 'run', KeyQ: 'down', KeyR: 'up', Tab: 'map',
      KeyG: 'cycle', KeyI: 'bag', KeyL: 'light', KeyT: 'fire', KeyN: 'phone',
    };
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.lastInput = performance.now();
      if (!this.keys.has(e.code)) {
        const b = keyMap[e.code];
        if (b) { this.pressed.add(b); }
      }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.held.clear(); });

    const c = this.canvas;
    let mouseDown = false, lx = 0, ly = 0;
    let downX = 0, downY = 0;
    c.addEventListener('mousedown', (e) => { mouseDown = true; lx = downX = e.clientX; ly = downY = e.clientY; if (e.button === 0 && this.fireByMouse === 'hold') { this.pressed.add('fire'); this.mouseFire = true; } });
    // unarmed: a short click (not a camera drag) throws a punch
    addEventListener('mouseup', (e) => { if (mouseDown && this.fireByMouse === 'tap' && e.button === 0 && Math.hypot(e.clientX - downX, e.clientY - downY) < 6) this.pressed.add('fire'); mouseDown = false; this.mouseFire = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === c) { this.lookDX += e.movementX; this.lookDY += e.movementY; return; }
      if (!mouseDown) return;
      this.lookDX += e.clientX - lx; this.lookDY += e.clientY - ly; lx = e.clientX; ly = e.clientY;
    });
    c.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    // Touch: left half = floating joystick, right half = camera swipe, two fingers = pinch zoom
    const joyEl = document.getElementById('joystick'), knob = document.getElementById('joyKnob');
    const R = 55;
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.lastInput = performance.now();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.42 && this.joy.id === null) {
          this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY;
          joyEl.style.left = (t.clientX - 65) + 'px'; joyEl.style.top = (t.clientY - 65) + 'px';
          joyEl.classList.add('active'); knob.style.transform = 'translate(0px,0px)';
        } else if (this.look.id === null) {
          this.look.id = t.identifier; this.look.x = t.clientX; this.look.y = t.clientY;
        } else {
          this.pinch = { a: this.look.id, b: t.identifier, d: 0 };
        }
      }
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const pts = {};
      for (const t of e.touches) pts[t.identifier] = t;
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
          const L = Math.hypot(dx, dy);
          if (L > R) { dx *= R / L; dy *= R / L; }
          this.joyX = dx / R; this.joyY = -dy / R;
          knob.style.transform = `translate(${dx}px,${dy}px)`;
        } else if (t.identifier === this.look.id && !this.pinch) {
          this.lookDX += (t.clientX - this.look.x) * 1.3; this.lookDY += (t.clientY - this.look.y) * 1.3;
          this.look.x = t.clientX; this.look.y = t.clientY;
        }
      }
      if (this.pinch && pts[this.pinch.a] && pts[this.pinch.b]) {
        const d = Math.hypot(pts[this.pinch.a].clientX - pts[this.pinch.b].clientX, pts[this.pinch.a].clientY - pts[this.pinch.b].clientY);
        if (this.pinch.d) this.zoom += (this.pinch.d - d) * 0.03;
        this.pinch.d = d;
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) { this.joy.id = null; this.joyX = this.joyY = 0; joyEl.classList.remove('active'); }
        if (t.identifier === this.look.id) { this.look.id = null; this.pinch = null; }
        if (this.pinch && t.identifier === this.pinch.b) this.pinch = null;
      }
    };
    c.addEventListener('touchend', end); c.addEventListener('touchcancel', end);

    // On-screen buttons (data-btn)
    document.querySelectorAll('[data-btn]').forEach((el) => {
      const b = el.dataset.btn;
      const down = (e) => { e.preventDefault(); e.stopPropagation(); this.held.add(b); this.pressed.add(b); el.classList.add('down'); this.lastInput = performance.now(); };
      const up = (e) => { e.preventDefault(); this.held.delete(b); el.classList.remove('down'); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    });
  }

  isHeld(b) {
    if (this.held.has(b)) return true;
    const k = this.keys;
    switch (b) {
      case 'run': return k.has('ShiftLeft') || k.has('ShiftRight');
      case 'jump': case 'handbrake': return k.has('Space');
      case 'up': return k.has('Space') || k.has('KeyR');
      case 'down': return k.has('KeyQ') || k.has('ControlLeft');
      case 'gas': return false;
      case 'brake': return false;
      case 'horn': return k.has('KeyH');
      case 'fire': return this.mouseFire || k.has('KeyT');
    }
    return false;
  }
  wasPressed(b) { return this.pressed.has(b); }

  // Called once per frame before game logic
  poll() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (x || y) { const L = Math.hypot(x, y); x /= L; y /= L; }
    this.keyX = x; this.keyY = y;
    this.moveX = x || this.joyX; this.moveY = y || this.joyY;
  }
  // Called at the end of each frame
  endFrame() { this.pressed.clear(); this.lookDX = 0; this.lookDY = 0; this.zoom = 0; }
}
