// Synthesized clipper sound (no audio files): motor hum + blade buzz, with a crisp "crunch" while hair is cut.
export class ClipperSound {
  constructor() { this.ctx = null; this.enabled = true; this.level = 0; this.cutting = 0; }

  _init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 118;
    const humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 900;
    const humG = ctx.createGain(); humG.gain.value = 0.12;
    hum.connect(humF).connect(humG).connect(this.master);
    const buzz = ctx.createOscillator(); buzz.type = 'square'; buzz.frequency.value = 236;
    const buzzF = ctx.createBiquadFilter(); buzzF.type = 'bandpass'; buzzF.frequency.value = 1800; buzzF.Q.value = 2;
    const buzzG = ctx.createGain(); buzzG.gain.value = 0.05;
    buzz.connect(buzzF).connect(buzzG).connect(this.master);
    // noise for the cutting crunch
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(i / ctx.sampleRate * 2 * Math.PI * 118));
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2500;
    this.noiseG = ctx.createGain(); this.noiseG.gain.value = 0;
    noise.connect(nf).connect(this.noiseG).connect(this.master);
    hum.start(); buzz.start(); noise.start();
  }

  unlock() { if (!this.enabled) return; this._init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  /** level: 0 = off, 1 = running; cutting: 0..1 how much hair is being cut right now */
  set(level, cutting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = this.enabled ? level : 0;
    this.master.gain.setTargetAtTime(on * 0.55, t, 0.04);
    this.noiseG.gain.setTargetAtTime(on * Math.min(1, cutting) * 0.18, t, 0.03);
  }

  setEnabled(v) { this.enabled = v; if (!v) this.set(0, 0); else this.unlock(); }
}
