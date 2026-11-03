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
      const base = vehicle.T.kind === 'moto' ? 70 : vehicle.T.bus || vehicle.T.truck ? 32 : 45;
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
  mute(on) { if (this.master) this.master.gain.value = on ? 0 : this.volume; }
}
