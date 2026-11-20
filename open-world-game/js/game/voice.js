// Spoken voices for the people in the city: everything a person says (the speech bubbles) is also spoken out loud
// with the device's Hebrew voice. Every person has a voice of their own - pitch and pace from who they are (women
// higher, big men lower, some fast talkers, some slow) - and the volume falls off with distance. One person speaks
// at a time; urgent lines (fear, anger) cut in before small talk. Works where the browser has a Hebrew voice
// (iPhone / iPad / Android / Windows / Mac usually do); without one the bubbles still show.
export class Voices {
  constructor(game) {
    this.game = game;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voice = null; this.busyUntil = 0; this.queue = [];
    this.enabled = true;
    const pick = () => {
      const all = this.synth?.getVoices?.() || [];
      this.voices = all.filter((v) => /^he|^iw/i.test(v.lang));
      this.voice = this.voices[0] || null;
    };
    if (this.synth) { pick(); this.synth.onvoiceschanged = pick; }
  }
  get available() { return !!(this.synth && this.enabled && this.game.settings?.voices !== false); }
  // a stable voice per person
  _profile(p) {
    if (p.voiceP) return p.voiceP;
    const r = ((Math.sin((p.phase || 1) * 91.7) * 43758.5453) % 1 + 1) % 1, female = !!p.app?.long;
    const big = (p.app?.w || 1) > 1.08;
    p.voiceP = { pitch: female ? 1.15 + r * 0.35 : big ? 0.62 + r * 0.18 : 0.78 + r * 0.3, rate: 0.92 + ((r * 7.3) % 1) * 0.28, vi: Math.floor(r * 10) };
    return p.voiceP;
  }
  // say a line out loud for person p (urgent lines interrupt calm ones)
  speak(p, text, urgent = false) {
    if (!this.available || !text) return;
    const g = this.game, pos = g.playerPos(), d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d > 28 || g.state !== 'playing') return;
    const now = performance.now();
    if (now < this.busyUntil && !urgent) return;
    try {
      if (urgent && now < this.busyUntil) this.synth.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[!?.…]+$/, (m) => m[0]));
      const V = this._profile(p);
      if (this.voices?.length) u.voice = this.voices[V.vi % this.voices.length];
      u.lang = u.voice?.lang || 'he-IL';
      u.pitch = V.pitch; u.rate = V.rate * (urgent ? 1.12 : 1);
      u.volume = Math.max(0.15, Math.min(1, 1.1 - d / 26)) * (g.settings?.volume ?? 0.8);
      this.synth.speak(u);
      this.busyUntil = now + Math.min(3200, 450 + text.length * 70);
      this.last = { text, at: now };
    } catch { /* speech not available on this device */ }
  }
}
