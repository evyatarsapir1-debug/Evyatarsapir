// App state: persisted in localStorage on this device only.
// Images (profile photo, wardrobe, private progress photos) live in IndexedDB.

const KEY = 'glowup.state.v1';
const listeners = new Set();

export function todayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + n));
}
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function defaultState() {
  return {
    version: 1,
    onboarded: false,
    tourDone: false,
    profile: null,
    program: null,            // { length, startDate, pace, extraTasks:[], hiddenTasks:[] }
    days: {},                 // 'YYYY-MM-DD' -> { done:{taskId:true}, water, sleep, workouts:[], skin:{am,pm}, mood, screenBreaks }
    routines: null,           // built from profile on onboarding
    reminders: [],
    savedCuts: [],
    savedExercises: [],
    wardrobe: [],             // { id, name, category, color, occasions:[], imageId }
    looks: [],                // { id, name, itemIds:[], occasion, created }
    budget: { monthly: 0, expenses: [] },
    shopping: [],             // product ids on the shopping list
    myProducts: [],           // { id, name, type, am, pm }
    photos: [],               // { id, date, note } – image bytes in IndexedDB
    coach: { messages: [], provider: 'local', apiKey: '', shareProfile: true, model: 'claude-opus-5-5' },
    settings: { theme: 'dark', motion: 'auto', notifications: false, units: 'metric' },
    achievementsSeen: [],
    transform: null,          // transformation program (see transform.js)
    scans: [],                // glow-up scans { id, date, result, done, photoId }
    styleShop: [],            // clothes to buy { id, name, category, color, why, price, bought }
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return migrate({ ...defaultState(), ...parsed });
  } catch {
    return defaultState();
  }
}

function migrate(s) {
  // future migrations go here; keep unknown keys intact
  s.coach = { ...defaultState().coach, ...(s.coach || {}) };
  s.settings = { ...defaultState().settings, ...(s.settings || {}) };
  s.budget = { ...defaultState().budget, ...(s.budget || {}) };
  return s;
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('save failed', e); }
  }, 60);
}
export function flush() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

export function getState() { return state; }

/** Mutate the state inside fn, then persist and notify. */
export function update(fn) {
  fn(state);
  persist();
  listeners.forEach((l) => l(state));
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function day(key = todayKey()) {
  if (!state.days[key]) state.days[key] = { done: {}, water: 0, sleep: null, workouts: [], skin: { am: [], pm: [] }, mood: null, screenBreaks: 0 };
  const d = state.days[key];
  d.done ||= {}; d.workouts ||= []; d.skin ||= { am: [], pm: [] }; d.water ||= 0;
  return d;
}

export async function resetAll() {
  localStorage.removeItem(KEY);
  await images.clear();
  state = defaultState();
  listeners.forEach((l) => l(state));
}

export function exportData() {
  const copy = JSON.parse(JSON.stringify(state));
  copy.coach.apiKey = copy.coach.apiKey ? '(הוסר מהייצוא)' : '';
  return copy;
}

export function importData(obj) {
  if (!obj || typeof obj !== 'object' || obj.version !== 1) throw new Error('קובץ לא תקין');
  const keepKey = state.coach.apiKey;
  state = migrate({ ...defaultState(), ...obj });
  if (!state.coach.apiKey || state.coach.apiKey.startsWith('(')) state.coach.apiKey = keepKey;
  flush();
  listeners.forEach((l) => l(state));
}

// ---------------- IndexedDB image store ----------------
const DB = 'glowup-images';
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('img');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('img', mode);
    const st = t.objectStore('img');
    const r = fn(st);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}
const cache = new Map();
export const images = {
  async put(dataUrl) {
    const id = 'img_' + uid();
    await tx('readwrite', (st) => st.put(dataUrl, id));
    cache.set(id, dataUrl);
    return id;
  },
  async get(id) {
    if (!id) return null;
    if (cache.has(id)) return cache.get(id);
    try {
      const v = await tx('readonly', (st) => st.get(id));
      if (v) cache.set(id, v);
      return v || null;
    } catch { return null; }
  },
  async del(id) {
    if (!id) return;
    cache.delete(id);
    try { await tx('readwrite', (st) => st.delete(id)); } catch { /* ignore */ }
  },
  async clear() {
    cache.clear();
    try { await tx('readwrite', (st) => st.clear()); } catch { /* ignore */ }
  },
};

/** <img> that loads lazily from the image store. */
export function storedImg(id, alt = '') {
  const img = document.createElement('img');
  img.alt = alt;
  images.get(id).then((src) => { if (src) img.src = src; });
  return img;
}
