// GLOW UP service worker: offline cache for the app shell (network-first for freshness).
const CACHE = 'glowup-v1';
const SHELL = [
  './', './index.html', './css/app.css', './icon.svg', './manifest.webmanifest',
  './js/main.js', './js/ui.js', './js/icons.js', './js/store.js', './js/plan.js', './js/figure.js', './js/tour.js',
  './js/reminders.js', './js/routines.js', './js/coach-local.js', './js/coach-ai.js',
  './js/data/profile.js', './js/data/fitness.js', './js/data/guides.js', './js/data/haircuts.js', './js/data/nutrition.js',
  './js/data/style.js', './js/data/products.js', './js/data/tips.js',
  './js/screens/common.js', './js/screens/onboarding.js', './js/screens/home.js', './js/screens/care.js', './js/screens/hair.js',
  './js/screens/fitness.js', './js/screens/nutrition.js', './js/screens/style.js', './js/screens/coach.js', './js/screens/progress.js',
  './js/screens/routine.js', './js/screens/plans.js', './js/screens/products.js', './js/screens/settings.js', './js/screens/guide.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // never touch API calls
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
