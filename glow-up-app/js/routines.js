// Daily routine defaults (editable by the user in the routine screen).
import { uid } from './store.js';

export function defaultRoutines(profile) {
  const teen = profile.age < 18;
  const areas = new Set(profile.areas || []);
  const morning = [
    { id: uid(), title: 'לקום ולשתות כוס מים', minutes: 1, on: true },
    { id: uid(), title: 'לסדר את המיטה', minutes: 2, on: true },
    areas.has('skin') ? { id: uid(), title: 'שגרת טיפוח בוקר + קרם הגנה', minutes: 4, on: true } : null,
    { id: uid(), title: 'צחצוח שיניים', minutes: 2, on: true },
    areas.has('hair') ? { id: uid(), title: 'סידור שיער', minutes: 5, on: true } : null,
    { id: uid(), title: 'ארוחת בוקר', minutes: 10, on: true },
    areas.has('posture') ? { id: uid(), title: 'מתיחה קצרה / יציבה', minutes: 3, on: true } : null,
  ].filter(Boolean);
  const evening = [
    { id: uid(), title: 'להכין תיק ובגדים למחר', minutes: 5, on: true },
    { id: uid(), title: 'הפסקת מסכים', minutes: 30, on: areas.has('sleep') },
    areas.has('skin') ? { id: uid(), title: 'שגרת טיפוח ערב', minutes: 4, on: true } : null,
    { id: uid(), title: 'צחצוח שיניים + חוט דנטלי', minutes: 4, on: true },
    { id: uid(), title: 'קריאה / זמן רגוע', minutes: 15, on: true },
  ].filter(Boolean);
  return {
    wake: teen ? '07:00' : '07:00',
    bed: teen ? '22:30' : '23:00',
    morning, evening,
    screenBreak: { on: false, every: 45 },
    waterGoal: 8,
    sleepGoal: teen ? 9 : 8,
    blocks: [],               // day organisation: { id, time, title }
  };
}

/** Sleep duration in hours between bed (HH:MM) and wake (HH:MM). */
export function sleepHours(bed, wake) {
  if (!bed || !wake) return 0;
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

export function minusMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  let t = h * 60 + m - mins;
  t = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
