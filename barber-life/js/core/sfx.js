// Synthesized UI sounds and background music (no audio files). One AudioContext, created on the first tap.
// sfx.play('click' | 'tap' | 'success' | 'coin' | 'error' | 'door' | 'step' | 'jump' | 'whoosh' | 'level' | 'open' | 'car')
// sfx.music('city' | 'shop' | null) — a soft procedural loop (chords + light beat), different mood per place.

const SETTINGS_KEY = 'barber_life_audio';

function loadSettings() {
  try { return { sfx: true, music: true, volume: 0.8, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { sfx: true, music: true, volume: 0.8 }; }
}

// chord progressions (MIDI notes) per mood
const MOODS = {
  city: { bpm: 84, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]], bass: [45, 41, 43, 40], lead: [72, 74, 76, 79, 76, 74, 72, 69] },
  shop: { bpm: 92, chords: [[50, 53, 57, 60], [55, 58, 62, 65], [48, 52, 55, 59], [53, 57, 60, 64]], bass: [38, 43, 36, 41], lead: [69, 72, 74, 77, 74, 72, 69, 67] },
  night: { bpm: 70, chords: [[52, 55, 59, 62], [48, 52, 55, 59], [50, 53, 57, 60], [47, 50, 54, 57]], bass: [40, 36, 38, 35], lead: [71, 74, 76, 74, 71, 69, 67, 69] },
};
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const sfx = {
  settings: loadSettings(),
  ctx: null,
  mood: null,

  _init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = this.ctx = new AC();
    this.out = ctx.createGain(); this.out.gain.value = this.settings.volume; this.out.connect(ctx.destination);
    this.fx = ctx.createGain(); this.fx.gain.value = this.settings.sfx ? 0.55 : 0; this.fx.connect(this.out);
    this.mus = ctx.createGain(); this.mus.gain.value = 0; this.mus.connect(this.out);
    // soft echo for the music
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.musIn = ctx.createGain(); this.musIn.connect(this.mus);
    this.musIn.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(this.mus);
    const len = ctx.sampleRate * 0.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return true;
  },
  unlock() {
    if (!this._init()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.mood && !this._timer) this._startLoop();
  },
  save() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ } },
  set(key, v) {
    this.settings[key] = v; this.save();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (key === 'volume') this.out.gain.setTargetAtTime(v, t, 0.05);
    if (key === 'sfx') this.fx.gain.setTargetAtTime(v ? 0.55 : 0, t, 0.05);
    if (key === 'music') { this.mus.gain.setTargetAtTime(v && this.mood ? 0.16 : 0, t, 0.3); if (v && this.mood && !this._timer) this._startLoop(); }
  },

  // ---------------------------------------------------------------- one-shot sounds
  _tone(freq, t0, dur, { type = 'sine', vol = 0.3, to = null, attack = 0.005, dest = this.fx } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.02);
  },
  _noise(t0, dur, { vol = 0.2, freq = 1200, q = 1, type = 'bandpass', dest = this.fx } = {}) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(dest); s.start(t0); s.stop(t0 + dur + 0.02);
  },
  play(name) {
    if (!this.settings.sfx) return;
    if (!this._init()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    switch (name) {
      case 'click': this._tone(880, t, 0.06, { type: 'triangle', vol: 0.18, to: 660 }); break;
      case 'tap': this._tone(620, t, 0.05, { type: 'sine', vol: 0.15 }); break;
      case 'open': this._tone(520, t, 0.09, { type: 'sine', vol: 0.16, to: 780 }); this._tone(780, t + 0.06, 0.1, { vol: 0.12 }); break;
      case 'close': this._tone(700, t, 0.09, { type: 'sine', vol: 0.14, to: 420 }); break;
      case 'success': [72, 76, 79, 84].forEach((m, i) => this._tone(hz(m), t + i * 0.08, 0.28, { type: 'triangle', vol: 0.2 })); break;
      case 'level': [67, 72, 76, 79, 84, 88].forEach((m, i) => this._tone(hz(m), t + i * 0.07, 0.4, { type: 'triangle', vol: 0.2 })); this._noise(t + 0.4, 0.5, { vol: 0.08, freq: 6000, type: 'highpass' }); break;
      case 'coin': this._tone(1318, t, 0.08, { type: 'square', vol: 0.08 }); this._tone(1975, t + 0.07, 0.3, { type: 'square', vol: 0.07 }); break;
      case 'cash': for (let k = 0; k < 3; k++) { this._tone(1318 + k * 200, t + k * 0.06, 0.08, { type: 'square', vol: 0.06 }); } this._tone(2637, t + 0.2, 0.35, { type: 'triangle', vol: 0.12 }); this._noise(t, 0.12, { vol: 0.1, freq: 3000 }); break;
      case 'error': this._tone(220, t, 0.16, { type: 'sawtooth', vol: 0.1, to: 180 }); this._tone(196, t + 0.12, 0.2, { type: 'sawtooth', vol: 0.09, to: 150 }); break;
      case 'door': this._noise(t, 0.35, { vol: 0.12, freq: 900, q: 0.7 }); this._tone(1568, t + 0.02, 0.25, { vol: 0.05 }); this._tone(2093, t + 0.1, 0.35, { vol: 0.04 }); break;
      case 'step': this._noise(t, 0.05, { vol: 0.06, freq: 500, q: 1.5, type: 'lowpass' }); break;
      case 'jump': this._tone(300, t, 0.18, { type: 'sine', vol: 0.12, to: 600 }); break;
      case 'land': this._noise(t, 0.09, { vol: 0.12, freq: 300, type: 'lowpass' }); break;
      case 'whoosh': this._noise(t, 0.35, { vol: 0.12, freq: 1400, q: 0.6 }); break;
      case 'car': this._tone(70, t, 0.6, { type: 'sawtooth', vol: 0.1, to: 120 }); this._noise(t, 0.5, { vol: 0.06, freq: 200, type: 'lowpass' }); break;
      case 'snip': this._noise(t, 0.04, { vol: 0.12, freq: 5000, q: 3 }); break;
      case 'task': this._tone(hz(76), t, 0.14, { type: 'triangle', vol: 0.16 }); this._tone(hz(83), t + 0.1, 0.24, { type: 'triangle', vol: 0.16 }); break;
      default: break;
    }
  },

  // ---------------------------------------------------------------- music
  music(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.mus.gain.setTargetAtTime(mood && this.settings.music ? 0.16 : 0, t, 0.6);
    if (mood && !this._timer && this.settings.music) this._startLoop();
  },
  _startLoop() {
    if (!this.ctx) return;
    this._step = 0; this._next = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 120);
  },
  _schedule() {
    if (!this.mood || !this.settings.music) { clearInterval(this._timer); this._timer = null; return; }
    if (document.hidden) return;
    const M = MOODS[this.mood] || MOODS.city;
    const eighth = 60 / M.bpm / 2;
    while (this._next < this.ctx.currentTime + 0.4) {
      const s = this._step, t = this._next;
      const bar = Math.floor(s / 8) % M.chords.length, pos = s % 8;
      const chord = M.chords[bar];
      if (pos === 0) chord.forEach((m) => this._tone(hz(m), t, eighth * 7.5, { type: 'triangle', vol: 0.045, attack: 0.25, dest: this.musIn }));
      if (pos === 0 || pos === 3 || pos === 4) this._tone(hz(M.bass[bar]), t, eighth * 1.6, { type: 'sine', vol: 0.16, dest: this.musIn });
      if (pos % 2 === 1) this._noise(t, 0.04, { vol: 0.035, freq: 8000, type: 'highpass', dest: this.musIn });
      if (pos === 0 || pos === 4) this._noise(t, 0.12, { vol: 0.08, freq: 120, type: 'lowpass', dest: this.musIn });
      if (pos === 2 || pos === 6) this._noise(t, 0.08, { vol: 0.03, freq: 1800, q: 0.8, dest: this.musIn });
      if ((s * 7) % 5 === 0 && pos % 2 === 0) this._tone(hz(M.lead[(s >> 1) % M.lead.length]), t, eighth * 1.8, { type: 'sine', vol: 0.035, attack: 0.02, dest: this.musIn });
      this._step++; this._next += eighth;
    }
  },
};
