// GLOW UP – entry point: router, bottom navigation, theme, reminders.
import { h, ic, closeAllSheets } from './ui.js';
import { getState, subscribe } from './store.js';
import { startReminderLoop } from './reminders.js';
import { maybeStartTour } from './tour.js';

import onboarding from './screens/onboarding.js';
import home from './screens/home.js';
import care from './screens/care.js';
import hair, { haircutDetail } from './screens/hair.js';
import fitness, { exerciseDetail, workoutScreen, workoutLog } from './screens/fitness.js';
import nutrition from './screens/nutrition.js';
import style from './screens/style.js';
import coach from './screens/coach.js';
import progress from './screens/progress.js';
import routine from './screens/routine.js';
import plans from './screens/plans.js';
import products from './screens/products.js';
import settings from './screens/settings.js';
import guide, { learn } from './screens/guide.js';
import transform from './screens/transform.js';
import scan from './screens/scan.js';
import { initAI } from './ai.js';

const ROUTES = {
  home: { render: home, tab: 'home' },
  care: { render: care, tab: 'care' },
  hair: { render: hair, tab: 'care' },
  cut: { render: haircutDetail, tab: 'care' },
  guide: { render: guide, tab: null },
  learn: { render: learn, tab: 'home' },
  fitness: { render: fitness, tab: 'fitness' },
  exercise: { render: exerciseDetail, tab: 'fitness' },
  workout: { render: workoutScreen, tab: 'fitness' },
  log: { render: workoutLog, tab: 'fitness' },
  nutrition: { render: nutrition, tab: 'home' },
  style: { render: style, tab: 'style' },
  coach: { render: coach, tab: 'coach' },
  progress: { render: progress, tab: 'home' },
  routine: { render: routine, tab: 'home' },
  plans: { render: plans, tab: 'home' },
  products: { render: products, tab: 'home' },
  settings: { render: settings, tab: null },
  transform: { render: transform, tab: 'home' },
  scan: { render: scan, tab: 'home' },
};

const TABS = [
  { id: 'home', label: 'בית', icon: 'home', hash: '#/home' },
  { id: 'care', label: 'טיפוח', icon: 'sparkles', hash: '#/care' },
  { id: 'coach', label: 'המאמן שלי', icon: 'bot', hash: '#/coach', special: true },
  { id: 'fitness', label: 'כושר', icon: 'dumbbell', hash: '#/fitness' },
  { id: 'style', label: 'סטייל', icon: 'shirt', hash: '#/style' },
];
// Visual order in RTL: home (right) → care → coach (center) → fitness → style (left)

const app = document.getElementById('app');
let navEl;
let lastDepth = 0;
const history = [];

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = raw.split('?');
  const [name, ...params] = path.split('/').map(decodeURIComponent);
  return { name: ROUTES[name] ? name : 'home', params, query: new URLSearchParams(qs || '') };
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
export function back(fallback = '#/home') {
  if ((window.__glowNav || 0) > 0) { window.__glowNav -= 2; window.history.back(); }
  else go(fallback);
}

function applyTheme() {
  const s = getState().settings;
  const root = document.documentElement;
  root.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
  if (s.motion === 'reduce') root.dataset.motion = 'reduce'; else delete root.dataset.motion;
  document.querySelector('meta[name="theme-color"]').content = s.theme === 'light' ? '#faf9ff' : '#07060b';
}

function buildNav(active) {
  if (!navEl) {
    navEl = h('nav', { class: 'nav', 'aria-label': 'ניווט ראשי' }, h('div', { class: 'nav-inner' }));
    document.body.appendChild(navEl);
  }
  const inner = navEl.firstChild;
  inner.replaceChildren(...TABS.map((t) => h('button', {
    class: (t.special ? 'coach-tab ' : '') + (active === t.id ? 'on' : ''),
    'aria-current': active === t.id ? 'page' : null,
    'data-tab': t.id,
    onclick: () => { if (active === t.id && t.id !== 'coach') window.scrollTo({ top: 0, behavior: 'smooth' }); go(t.hash); },
  }, t.special ? h('span', { class: 'bub' }, ic(t.icon)) : ic(t.icon), h('span', null, t.label))));
}

export function render() {
  const s = getState();
  applyTheme();
  closeAllSheets();
  if (!s.onboarded) {
    if (navEl) navEl.style.display = 'none';
    app.replaceChildren(onboarding({ done: () => { go('#/home'); render(); setTimeout(() => maybeStartTour(true), 500); } }));
    return;
  }
  const route = parseHash();
  const def = ROUTES[route.name];
  const depth = route.params.length + (def.tab ? 0 : 1);
  const ctx = {
    ...route,
    go, back,
    refresh: () => softRefresh(),
  };
  const screen = def.render(ctx);
  screen.classList.add('screen');
  if (depth < lastDepth) screen.classList.add('back-anim');
  lastDepth = depth;
  const shell = h('div', { class: 'shell' }, screen);
  app.replaceChildren(shell);
  if (navEl) navEl.style.display = '';
  buildNav(def.tab);
  currentCtx = ctx; currentDef = def;
}

let currentCtx, currentDef;
/** Re-render the current screen while keeping scroll position. */
function softRefresh() {
  if (!currentDef) return render();
  const y = window.scrollY;
  const screen = currentDef.render(currentCtx);
  screen.classList.add('screen');
  screen.style.animation = 'none';
  const shell = app.querySelector('.shell');
  if (!shell) return render();
  shell.replaceChildren(screen);
  window.scrollTo(0, y);
}

window.addEventListener('hashchange', () => {
  window.__glowNav = Math.max(0, (window.__glowNav || 0) + 1);
  const prev = lastHash;
  lastHash = location.hash;
  if (history[history.length - 2] === location.hash) history.pop(); else history.push(location.hash);
  render();
  if (prev !== location.hash) window.scrollTo(0, 0);
});
let lastHash = location.hash;
history.push(location.hash || '#/home');

subscribe(() => applyTheme());

render();
startReminderLoop();
// light up AI features once the viewer's Claude (or none) is known
initAI().then(() => { if (getState().onboarded && /^#\/(coach|scan|home|style)/.test(location.hash || '#/home')) softRefresh(); });
if (getState().onboarded) setTimeout(() => maybeStartTour(false), 600);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
