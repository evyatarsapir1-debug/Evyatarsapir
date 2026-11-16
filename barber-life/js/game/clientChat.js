// Talk to the client during the haircut: ask what he wants (sides, top, fringe, line-up) and how it looks so far.
// Answers come from his real request (spec + personal wishes); "how does it look?" analyses the hair right now.
import { ctx } from './context.js';
import { targetLength, guardFor, guardText } from '../data/haircuts.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dir = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
const cm = (mm) => (mm >= 20 ? `${(mm / 10).toFixed(mm % 10 ? 1 : 0)} ס״מ` : `${Math.round(mm * 10) / 10} מ״מ`);
const KEEP = 900;

function sides(c) {
  const s = c.spec;
  const low = targetLength(s, dir(1, -0.65, -0.2)), mid = targetLength(s, dir(1, 0.05, -0.1)), up = targetLength(s, dir(1, 0.45, 0));
  if (low >= KEEP) return 'בצדדים אל תיגע בכלל, רק למעלה.';
  const g = guardFor(low);
  const notShort = c.mods.includes('notTooShort') ? ' ואל תקצר יותר מדי, אני לא אוהב שרואים את הקרקפת.' : '';
  if (up - low > 4) return `למטה ממש קצר — ${low <= 1 ? 'כמעט על אפס' : `בערך ${guardText(g)}`} — ושיעלה בהדרגה, בלי קווים, עד ${cm(Math.min(up, 60))} למעלה בצד.${notShort}`;
  return `בצדדים ומאחור אחיד, בערך ${guardText(g)}${mid !== low ? `, ובאמצע הצד ${cm(mid)}` : ''}.${notShort}`;
}
function top(c) {
  const t = c.spec.top;
  if (t.mid >= KEEP) return 'למעלה לא לגעת בכלל.';
  const keep = c.mods.includes('keepTop') ? ' חשוב לי שיישאר אורך, לא לקצר יותר מדי!' : '';
  const shorter = c.mods.includes('shorterTop') ? ' השבוע תעשה קצת יותר קצר מבדרך כלל.' : '';
  if (t.mid <= 8) return `גם למעלה קצר, בערך ${cm(t.mid)} — מכונה, לא מספריים.`;
  return `למעלה להשאיר בערך ${cm(t.mid)}${t.crown < t.mid - 3 ? `, ומאחור בכתר קצת יותר קצר (${cm(t.crown)})` : ''}. במספריים, שיהיה טבעי.${keep}${shorter}`;
}
function fringe(c) {
  const f = c.spec.top.front;
  if (f >= KEEP) return 'את הפוני תשאיר כמו שהוא.';
  const tidy = c.mods.includes('tidyFringe') ? ' ותסדר אותו יפה, שלא ייכנס לי לעיניים.' : '';
  return f > c.spec.top.mid + 2 ? `קדימה קצת יותר ארוך מלמעלה, בערך ${cm(f)}, שאוכל להרים אותו.${tidy}` : `קדימה בערך ${cm(f)}.${tidy}`;
}
function lineup(c) {
  if (c.spec.outline || c.mods.includes('cleanNeck')) return 'כן! תעשה לי מסגרת: קו נקי בעורף, מסביב לאוזניים ובפאות. עם הטרימר, שיהיה חד.';
  return 'מסגרת חדה לא צריך, רק שיהיה מסודר וטבעי בעורף.';
}
function howLooks(c) {
  const res = ctx.session.analyze();
  const picky = c.personality === 'picky';
  const nm = (z) => z.name.replace(/^ה/, '');
  const acc = res.scores.accuracy ?? 0;
  const bad = res.zones.filter((z) => !z.ok && Math.abs(z.err) > Math.max(1.5, z.mT * 0.2)).sort((a, b) => Math.abs(b.err) - Math.abs(a.err));
  const short = bad.find((z) => z.err < 0);
  if (short && acc < 0.92) return { mood: '😟', text: `רגע... ב${nm(short)} זה יצא יותר קצר ממה שרציתי (${cm(short.mL)} במקום ${cm(short.mT)}). תיזהר מעכשיו, את זה כבר אי אפשר להחזיר.` };
  const long = bad.filter((z) => z.err > 0);
  if (long.length && acc < 0.85) {
    const names = long.slice(0, 2).map(nm).join(' וב');
    return { mood: '🤔', text: `זה מתחיל להיראות טוב, אבל ב${names} עדיין ארוך מדי${long[0].mT < 30 ? ` — אני רוצה שם ${cm(long[0].mT)}` : ''}.${picky ? ' ותבדוק שהצדדים שווים.' : ''}` };
  }
  if (res.scores.blend != null && res.scores.blend < 0.75) return { mood: '😐', text: 'האורכים בסדר, אבל רואים מעבר חד בצד. אפשר לרכך אותו?' };
  if (res.scores.symmetry != null && res.scores.symmetry < 0.8) return { mood: '🤨', text: 'צד אחד נראה לי שונה מהשני. תבדוק במראה?' };
  if (c.spec.outline && res.scores.finish != null && res.scores.finish < 0.8) return { mood: '🙂', text: 'כמעט! חסרה רק המסגרת — קו נקי בעורף ובפאות.' };
  return { mood: '😃', text: 'וואו, זה נראה מעולה! בדיוק מה שרציתי. אפשר לסיים ולנקות.' };
}

const QUESTIONS = [
  { id: 'want', q: 'מה אתה רוצה שנעשה היום?', a: (c) => c.speech },
  { id: 'sides', q: 'כמה לקצר בצדדים ומאחור?', a: sides },
  { id: 'top', q: 'ומה למעלה?', a: top },
  { id: 'fringe', q: 'ומה עם הפוני / קדימה?', a: fringe },
  { id: 'lineup', q: 'לעשות לך מסגרת (קווים)?', a: lineup },
  { id: 'look', q: 'איך זה נראה עד עכשיו?', a: howLooks },
];

/** Opens the conversation; previous questions and answers stay in the chat. */
export function openClientChat(c) {
  if (!c) return;
  const log = (ctx.session._chat ||= []);
  const render = (body) => {
    const chat = log.map((m) => `<div class="chat-row me"><span>${esc(m.q)}</span></div><div class="chat-row them"><b>${m.mood || '🙂'}</b><span>${esc(m.a)}</span></div>`).join('')
      || `<div class="chat-row them"><b>🙂</b><span>${esc(`${c.name} מחכה. אפשר לשאול אותו כל שאלה גם באמצע התספורת.`)}</span></div>`;
    body.innerHTML = `<div class="chat" id="chatLog">${chat}</div><div class="chat-qs">${QUESTIONS.map((q) => `<button class="chat-q" data-q="${q.id}">${esc(q.q)}</button>`).join('')}</div>`;
    const el = body.querySelector('#chatLog'); el.scrollTop = el.scrollHeight;
    body.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const Q = QUESTIONS.find((x) => x.id === b.dataset.q);
      const r = Q.a(c);
      log.push(typeof r === 'string' ? { q: Q.q, a: r } : { q: Q.q, a: r.text, mood: r.mood });
      ctx.sfx?.play('tap');
      render(body);
    }));
  };
  ctx.dialog({ title: `💬 שיחה עם ${c.name}`, html: '<div id="chatMount"></div>', buttons: [{ label: 'חזרה לתספורת', primary: true }], mount: (b) => render(b.querySelector('#chatMount')) });
}
