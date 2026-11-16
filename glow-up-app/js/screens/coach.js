// AI PERSONAL GLOW UP COACH – chat screen.
// Two honest modes: Claude (real AI, needs the user's API key) or the built-in rule-based guide.
import { h, ic, rich, toast, confirmDialog } from '../ui.js';
import { getState, update, uid } from '../store.js';
import { localReply, QUICK } from '../coach-local.js';
import { aiAvailable, askClaude } from '../coach-ai.js';
import { topbar } from './common.js';

let pending = null; // AbortController for an in-flight AI reply

export default function coach(ctx) {
  const s = getState();
  const ai = aiAvailable();
  const root = h('main', { class: 'coach-screen' });
  root.append(topbar('המאמן שלי', {
    sub: ai ? 'מאמן AI אישי · Claude' : 'מדריך מובנה – עונה מתוך התוכן של האפליקציה',
    actions: [h('button', { class: 'icon-btn', 'aria-label': 'ניקוי השיחה', onclick: async () => {
      if (!(await confirmDialog('לנקות את השיחה?', 'כל ההודעות יימחקו מהמכשיר.', { ok: 'ניקוי', danger: true }))) return;
      pending?.abort();
      update((st) => { st.coach.messages = []; });
      ctx.refresh();
    } }, ic('trash'))],
  }));

  root.append(h('div', { class: 'row between mb' },
    h('span', { class: 'mode-pill' + (ai ? ' ai' : '') }, h('i'), ai ? 'AI מחובר' : 'מצב מדריך (ללא AI)'),
    h('button', { class: 'btn sm ghost', onclick: () => ctx.go('#/settings?sec=coach') }, ic('settings'), ai ? 'הגדרות AI' : 'חיבור AI')));
  if (!ai && !s.coach.dismissedInfo) {
    root.append(h('div', { class: 'note', style: { marginBottom: '12px' } }, ic('info'),
      h('div', { class: 'grow' }, 'כרגע המאמן עובד במצב ', h('b', null, 'מדריך מובנה'), ': הוא מבין נושאים נפוצים ועונה מתוך המדריכים, התוכנית והנתונים שלך – אבל הוא לא מודל AI. לתשובות חופשיות לכל שאלה אפשר לחבר את Claude בהגדרות.',
        h('div', { class: 'row mt' }, h('button', { class: 'btn sm', onclick: () => ctx.go('#/settings?sec=coach') }, 'לחיבור'), h('button', { class: 'btn sm ghost', onclick: () => { update((st) => { st.coach.dismissedInfo = true; }); ctx.refresh(); } }, 'הבנתי')))));
  }

  const chat = h('div', { class: 'chat', 'aria-live': 'polite' });
  root.append(chat);
  const drawMessages = () => {
    chat.replaceChildren(...getState().coach.messages.map((m) => bubble(m, ctx, send)));
    if (!getState().coach.messages.length) chat.append(h('div', { class: 'empty' }, ic('bot'), h('div', null, 'אפשר לשאול כל דבר על הגלואו אפ שלך.')));
  };
  drawMessages();

  const quick = h('div', { class: 'chips scroll', style: { marginTop: '14px' } }, QUICK.map((q) => h('button', { class: 'chip', onclick: () => send(q) }, q)));
  root.append(quick);

  // composer (fixed above the nav)
  const ta = h('textarea', { class: 'input', rows: 1, placeholder: 'כתבו שאלה למאמן…', 'aria-label': 'הודעה למאמן', maxlength: 1500,
    oninput: () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; },
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); } } });
  const pre = ctx.query.get('q');
  if (pre) ta.value = pre;
  const sendBtn = h('button', { class: 'btn primary', 'aria-label': 'שליחה', onclick: () => { const v = ta.value.trim(); if (!v) return; ta.value = ''; ta.style.height = 'auto'; send(v); } }, ic('send'));
  root.append(h('div', { class: 'composer' }, h('div', { class: 'composer-inner' }, ta, sendBtn)));

  async function send(text) {
    if (pending) return toast('רגע, המאמן עוד עונה…', 'info');
    const userMsg = { id: uid(), role: 'user', text, at: Date.now() };
    update((st) => { st.coach.messages.push(userMsg); });
    drawMessages();
    scrollEnd();
    if (aiAvailable()) {
      const botMsg = { id: uid(), role: 'assistant', text: '', at: Date.now(), ai: true };
      const el = bubble({ ...botMsg, typing: true }, ctx, send);
      chat.append(el);
      scrollEnd();
      const body = el.querySelector('.body');
      pending = new AbortController();
      try {
        let acc = '';
        const history = getState().coach.messages;
        const full = await askClaude(history, (d) => { acc += d; body.replaceChildren(rich(acc)); scrollEnd(); }, pending.signal);
        botMsg.text = full || acc;
        update((st) => { st.coach.messages.push(botMsg); });
      } catch (e) {
        const fallback = localReply(text);
        const msg = { id: uid(), role: 'assistant', text: `⚠️ ${e.message}\n\nבינתיים, מהמדריך המובנה:\n\n${fallback.text}`, actions: fallback.actions, at: Date.now() };
        update((st) => { st.coach.messages.push(msg); });
      } finally {
        pending = null;
        if (location.hash.startsWith('#/coach')) { drawMessages(); scrollEnd(); }
      }
    } else {
      const typing = bubble({ id: 'typing', role: 'assistant', typing: true }, ctx, send);
      chat.append(typing);
      scrollEnd();
      await new Promise((r) => setTimeout(r, navigator.webdriver ? 50 : 500 + Math.random() * 400));
      const r = localReply(text);
      update((st) => { st.coach.messages.push({ id: uid(), role: 'assistant', text: r.text, actions: r.actions, at: Date.now() }); });
      drawMessages();
      scrollEnd();
    }
  }

  function scrollEnd() { requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })); }
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  return root;
}

function bubble(m, ctx, send) {
  if (m.role === 'user') return h('div', { class: 'msg user' }, m.text);
  const body = h('div', { class: 'body' }, m.typing && !m.text ? h('span', { class: 'typing' }, h('i'), h('i'), h('i')) : rich(m.text || ''));
  const actions = (m.actions || []).filter(Boolean);
  return h('div', { class: 'msg bot' },
    h('div', { class: 'who' }, ic('bot'), m.ai ? 'המאמן · Claude AI' : 'המאמן · מדריך מובנה'),
    body,
    actions.length ? h('div', { class: 'acts' }, actions.map((a) => h('button', { class: 'btn sm', onclick: () => {
      if (a.go) ctx.go(a.go);
      else if (a.ask) send(a.ask);
      else if (a.pace) { update((st) => { st.program.pace = a.pace; }); toast('הקצב עודכן – המשימות הותאמו', 'check'); }
    } }, a.label))) : null);
}
