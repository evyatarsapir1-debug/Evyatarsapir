// Tiny synthesized audio: engine hum that follows speed/throttle, helicopter rotor, horn, impacts.
export class GameAudio {
  constructor() { this.ctx = null; this.volume = 0.6; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(ctx.destination);
      this.engOsc = ctx.createOscillator(); this.engOsc.type = 'sawtooth';
      this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square';
      this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 400;
      this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
      this.engOsc.connect(this.engFilter); this.engOsc2.connect(this.engFilter);
      this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
      this.engOsc.start(); this.engOsc2.start();
      this.hornOsc = ctx.createOscillator(); this.hornOsc.type = 'square'; this.hornOsc.frequency.value = 420;
      this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
      const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1500;
      this.hornOsc.connect(hf); hf.connect(this.hornGain); this.hornGain.connect(this.master); this.hornOsc.start();
    } catch { this.ctx = null; }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  // vehicle: null when on foot
  update(vehicle, throttle, horn) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!vehicle || vehicle.T.kind === 'bike') {
      this.engGain.gain.setTargetAtTime(0, t, 0.1);
    } else if (vehicle.isHeli) {
      const r = vehicle.rotorSpeed;
      this.engOsc.frequency.setTargetAtTime(30 + r * 30, t, 0.1);
      this.engOsc2.frequency.setTargetAtTime(15 + r * 12, t, 0.1);
      this.engFilter.frequency.setTargetAtTime(200 + r * 300, t, 0.1);
      this.engGain.gain.setTargetAtTime(0.05 + r * 0.12, t, 0.1);
    } else {
      const s = Math.min(1, Math.abs(vehicle.speed) / vehicle.T.maxSpeed);
      const gear = (s * 5) % 1;
      const base = vehicle.isPlane ? 120 + (vehicle.thrust || 0) * 160 : vehicle.T.tank ? 26 : vehicle.T.mil ? 34 : vehicle.T.kind === 'moto' ? 70 : vehicle.T.bus || vehicle.T.truck ? 32 : 45;
      this.engOsc.frequency.setTargetAtTime(base + gear * base * 1.4 + s * base, t, 0.05);
      this.engOsc2.frequency.setTargetAtTime((base + gear * base * 1.4 + s * base) / 2, t, 0.05);
      this.engFilter.frequency.setTargetAtTime(300 + Math.abs(throttle) * 900, t, 0.1);
      this.engGain.gain.setTargetAtTime(0.05 + Math.abs(throttle) * 0.07, t, 0.1);
    }
    this.hornGain.gain.setTargetAtTime(horn ? 0.12 : 0, t, 0.02);
  }
  impact(strength) {
    if (!this.ctx || strength < 2) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = 0.25, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = Math.min(0.5, strength * 0.04);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }
  // gunshot: sharp crack (filtered noise burst) + low thump
  gunshot(kind) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, heavy = kind === 'long' || kind === 'heavy';
    const len = heavy ? 0.45 : 0.22, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, heavy ? 4 : 6);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = heavy ? 2200 : kind === 'pistol' ? 3800 : 3000;
    const g = ctx.createGain(); g.gain.value = heavy ? 0.6 : 0.42;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(heavy ? 90 : 140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    og.gain.setValueAtTime(heavy ? 0.5 : 0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.2);
  }
  mute(on) { if (this.master) this.master.gain.value = on ? 0 : this.volume; }
}

// ---------------------------------------------------------------------------
// In-game radio: three procedurally composed stations (no audio files needed),
// plus phone ringtones and notification sounds.
const STATIONS = [
  { name: 'לוס אנטוס FM', genre: 'פופ', bpm: 112, root: 48, prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], lead: 'square', bass: 'sawtooth', drums: 1, pad: 'triangle' },
  { name: 'גלי החוף', genre: 'צ׳יל', bpm: 84, root: 50, prog: [[0, 3, 7, 10], [5, 8, 12, 15], [10, 14, 17, 21], [3, 7, 10, 14]], lead: 'sine', bass: 'triangle', drums: 0.6, pad: 'sine' },
  { name: 'רוק הרכס', genre: 'רוק', bpm: 136, root: 40, prog: [[0, 7, 12], [5, 12, 17], [3, 10, 15], [7, 14, 19]], lead: 'sawtooth', bass: 'sawtooth', drums: 1.3, pad: 'sawtooth' },
];
export { STATIONS };
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Radio {
  constructor(audio) {
    this.audio = audio; this.station = -1; this.volume = 0.5; this.step = 0; this.next = 0; this._timer = null;
  }
  get ctx() { return this.audio.ctx; }
  _out() {
    if (!this.bus) { this.bus = this.ctx.createGain(); this.bus.connect(this.audio.master); }
    this.bus.gain.value = this.volume * 0.5;
    return this.bus;
  }
  play(i) {
    this.audio.unlock();
    if (!this.ctx) return false;
    this.station = i; this.step = 0; this.next = this.ctx.currentTime + 0.1;
    this._out();
    if (!this._timer) this._timer = setInterval(() => this._schedule(), 60);
    return true;
  }
  stop() { this.station = -1; clearInterval(this._timer); this._timer = null; }
  setVolume(v) { this.volume = v; if (this.bus) this.bus.gain.value = v * 0.5; }
  _note(type, freq, t, dur, gain, filter) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.05);
  }
  _noise(t, dur, gain, hp) {
    const ctx = this.ctx;
    if (!this._nb) { this._nb = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = this._nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = this._nb;
    const f = ctx.createBiquadFilter(); f.type = hp ? 'highpass' : 'bandpass'; f.frequency.value = hp ? 7000 : 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t); s.stop(t + dur);
  }
  _kick(t, gain) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.3);
  }
  _schedule() {
    if (this.station < 0 || !this.ctx) return;
    const S = STATIONS[this.station], sixteenth = 60 / S.bpm / 4;
    while (this.next < this.ctx.currentTime + 0.25) {
      const t = this.next, s = this.step % 16, bar = Math.floor(this.step / 16) % S.prog.length;
      const chord = S.prog[bar].map((n) => S.root + 12 + n);
      if (s === 0) for (const n of chord) this._note(S.pad, midi(n), t, sixteenth * 15, 0.05, 1600);
      if (s % 2 === 0) this._note(S.bass, midi(S.root + S.prog[bar][0] - (s % 8 === 6 ? 5 : 0)), t, sixteenth * 1.8, 0.12, 500);
      if (S.drums) {
        if (s % 8 === 0) this._kick(t, 0.5 * S.drums);
        if (s % 8 === 4) this._noise(t, 0.12, 0.25 * S.drums, false);
        if (s % 2 === 0) this._noise(t, 0.03, 0.08 * S.drums, true);
      }
      if (s % 4 === 2 || (S.genre === 'פופ' && s % 3 === 0)) {
        const n = chord[(this.step * 7 + bar) % chord.length] + 12;
        this._note(S.lead, midi(n), t, sixteenth * 1.5, 0.045, 3000);
      }
      this.next += sixteenth; this.step++;
    }
  }
}

export function ringtone(audio, kind = 0, short = false) {
  audio.unlock();
  const ctx = audio.ctx; if (!ctx) return;
  const tunes = [[76, 79, 84, 79], [72, 72, 79, 76], [84, 81, 77, 81]];
  const seq = tunes[kind % tunes.length].slice(0, short ? 2 : 4);
  let t = ctx.currentTime + 0.02;
  for (let rep = 0; rep < (short ? 1 : 2); rep++) for (const n of seq) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = midi(n);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + 0.2); t += 0.17;
  }
}
