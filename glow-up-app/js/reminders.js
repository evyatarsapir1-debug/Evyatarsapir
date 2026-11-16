// Reminders: fire while the app is open (browser tab or installed PWA).
// Web apps can't schedule notifications when fully closed without a push server,
// and the UI says so honestly.
import { getState, update, todayKey } from './store.js';
import { toast } from './ui.js';

let timer;
let lastScreenBreak = Date.now();

export function notificationsSupported() { return 'Notification' in window; }

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

function notify(title, body) {
  toast(`${title}${body ? ' – ' + body : ''}`, 'bell');
  const s = getState();
  if (s.settings.notifications && notificationsSupported() && Notification.permission === 'granted') {
    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, icon: 'icon.svg', lang: 'he', dir: 'rtl' }));
      } else new Notification(title, { body, icon: 'icon.svg', lang: 'he', dir: 'rtl' });
    } catch { /* toast already shown */ }
  }
}

function tick() {
  const s = getState();
  if (!s.onboarded) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = todayKey();
  const dow = now.getDay();
  for (const r of s.reminders) {
    if (!r.on || r.time !== hhmm) continue;
    if (r.days?.length && !r.days.includes(dow)) continue;
    if (r.lastFired === today + ' ' + hhmm) continue;
    update(() => { r.lastFired = today + ' ' + hhmm; });
    notify('תזכורת GLOW UP', r.title);
  }
  const sb = s.routines?.screenBreak;
  if (sb?.on && document.visibilityState === 'visible' && Date.now() - lastScreenBreak > sb.every * 60000) {
    lastScreenBreak = Date.now();
    notify('הפסקת מסך', 'להסתכל 20 שניות למרחק, לקום ולהתמתח.');
  }
}

export function startReminderLoop() {
  clearInterval(timer);
  timer = setInterval(tick, 15000);
  tick();
}

export const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
