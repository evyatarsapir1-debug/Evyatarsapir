// Settings and save-game persistence (localStorage, guarded so private mode never breaks the game).
const SAVE_KEY = 'azura_city_save_v1';
const SETTINGS_KEY = 'azura_city_settings_v1';

function read(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } }
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } }

export function defaultSettings() {
  const touch = matchMedia('(pointer: coarse)').matches;
  return { quality: touch ? 'low' : 'medium', sensitivity: 1, invertY: false, traffic: touch ? 14 : 22, volume: 0.6, showFps: false };
}
export function loadSettings() { return { ...defaultSettings(), ...(read(SETTINGS_KEY) || {}) }; }
export function saveSettings(s) { write(SETTINGS_KEY, s); }

export function loadGame() { const s = read(SAVE_KEY); return s && s.version === 1 ? s : null; }
export function saveGame(data) { return write(SAVE_KEY, { ...data, version: 1, savedAt: Date.now() }); }
export function hasSave() { return !!loadGame(); }
