// Menu screens: main menu, character creator, settings, pause, help.
import { PRESETS, SKIN_TONES, HAIR_COLORS, HAIR_STYLES, HAIR_NAMES, TOP_STYLES, TOP_NAMES, BOTTOM_STYLES, BOTTOM_NAMES, CLOTH_COLORS } from '../character/characterModel.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
}

export class Creator {
  constructor(onChange) {
    this.onChange = onChange;
    this.app = { ...PRESETS[0] };
    const pr = $('presets');
    PRESETS.forEach((p, i) => {
      const b = document.createElement('button'); b.className = 'preset'; b.textContent = p.name;
      b.onclick = () => { this.set({ ...p }); };
      pr.appendChild(b);
    });
    this._swatches('cSkin', SKIN_TONES, 'skin');
    this._swatches('cHairColor', HAIR_COLORS, 'hairColor');
    this._swatches('cTopColor', CLOTH_COLORS, 'topColor');
    this._swatches('cBottomColor', CLOTH_COLORS, 'bottomColor');
    this._select('cHair', HAIR_STYLES, HAIR_NAMES, 'hairStyle');
    this._select('cTop', TOP_STYLES, TOP_NAMES, 'top');
    this._select('cBottom', BOTTOM_STYLES, BOTTOM_NAMES, 'bottom');
    $('cShoes').onchange = (e) => this._upd('shoes', +e.target.value);
    $('cHeight').oninput = (e) => this._upd('height', +e.target.value);
    $('cBuild').oninput = (e) => this._upd('build', +e.target.value);
    $('cName').oninput = (e) => { this.app.name = e.target.value || 'שחקן'; };
    $('cRandom').onclick = () => {
      const r = (a) => a[Math.floor(Math.random() * a.length)];
      const ri = (n) => Math.floor(Math.random() * n);
      this.set({ ...this.app, skin: ri(SKIN_TONES.length), hairStyle: r(HAIR_STYLES), hairColor: ri(HAIR_COLORS.length), top: r(TOP_STYLES), topColor: ri(CLOTH_COLORS.length),
        bottom: r(BOTTOM_STYLES), bottomColor: ri(CLOTH_COLORS.length), shoes: ri(2), height: 0.9 + Math.random() * 0.2, build: 0.88 + Math.random() * 0.3 });
    };
  }
  _swatches(id, colors, key) {
    const el = $(id);
    colors.forEach((c, i) => {
      const s = document.createElement('div'); s.className = 'sw'; s.style.background = hex(c); s.dataset.i = i;
      s.onclick = () => this._upd(key, i);
      el.appendChild(s);
    });
  }
  _select(id, list, names, key) {
    const el = $(id);
    for (const v of list) { const o = document.createElement('option'); o.value = v; o.textContent = names[v]; el.appendChild(o); }
    el.onchange = () => this._upd(key, el.value);
  }
  _upd(k, v) { this.app[k] = v; this.refresh(); this.onChange(this.app); }
  set(app) { this.app = { ...app }; this.refresh(); this.onChange(this.app); }
  refresh() {
    const a = this.app;
    $('cName').value = a.name || '';
    for (const [id, key] of [['cSkin', 'skin'], ['cHairColor', 'hairColor'], ['cTopColor', 'topColor'], ['cBottomColor', 'bottomColor']]) {
      $(id).querySelectorAll('.sw').forEach((s) => s.classList.toggle('sel', +s.dataset.i === a[key]));
    }
    $('cHair').value = a.hairStyle; $('cTop').value = a.top; $('cBottom').value = a.bottom; $('cShoes').value = a.shoes;
    $('cHeight').value = a.height; $('cBuild').value = a.build;
    document.querySelectorAll('.preset').forEach((b, i) => b.classList.toggle('sel', PRESETS[i].name === a.name));
  }
}

export function bindSettings(settings, apply) {
  $('sQuality').value = settings.quality;
  $('sSens').value = settings.sensitivity;
  $('sInvert').checked = settings.invertY;
  $('sTraffic').value = settings.traffic;
  $('sVolume').value = settings.volume;
  $('sFps').checked = settings.showFps;
  $('sWeather').value = settings.weather || 'auto';
  const read = () => {
    settings.quality = $('sQuality').value;
    settings.sensitivity = +$('sSens').value;
    settings.invertY = $('sInvert').checked;
    settings.traffic = +$('sTraffic').value;
    settings.volume = +$('sVolume').value;
    settings.showFps = $('sFps').checked;
    settings.weather = $('sWeather').value;
    apply(settings);
  };
  ['sQuality', 'sSens', 'sInvert', 'sTraffic', 'sVolume', 'sFps', 'sWeather'].forEach((id) => { $(id).onchange = read; $(id).oninput = read; });
}
