// Menus and screens: hub, haircut library & lab, practice, clients, daily challenge, lessons, dictionary, awards.
import { ctx } from '../game/context.js';
import { progress, RANKS, ACHIEVEMENTS } from '../game/progress.js';
import { session } from '../game/session.js';
import { HAIRCUTS, HAIRCUT_BY_ID, CATEGORY_NAMES, DIFFICULTY_NAMES, haircutSteps, haircutSVG, targetLength } from '../data/haircuts.js';
import { LESSONS, LESSON_BY_ID, CHAPTERS, LESSON_SPECS } from '../data/lessons.js';
import { TERMS } from '../data/dictionary.js';
import { generateClient, requestChoices, PERSONALITIES } from '../data/clients.js';
import { HAIR_PRESETS } from '../hair/hairSystem.js';
import { ZONE_NAMES, zoneKeyOf, mulberry32 } from '../hair/scalp.js';
import { TOOLS } from '../tools/tools.js';
import { illu } from './illustrations.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const D = progress.data;
const stars = (n, max = 5) => '★'.repeat(n) + '☆'.repeat(max - n);
export const specById = (id) => HAIRCUT_BY_ID[id] || LESSON_SPECS[id];
const requiredRank = (h) => Math.max(1, h.difficulty - 1);
const today = () => new Date().toISOString().slice(0, 10);

// ================================================================ navigation
let sheetBackFn = null;
function openSheet(title, html, { back = null, mount = null } = {}) {
  $('sheetTitle').textContent = title;
  $('sheetBody').innerHTML = html;
  $('sheetBody').scrollTop = 0;
  sheetBackFn = back;
  $('sheet').classList.remove('hidden');
  $('hub').classList.add('hidden');
  mount?.($('sheetBody'));
}
function closeSheet() { $('sheet').classList.add('hidden'); }

export function showHub() {
  closeSheet();
  $('hud').classList.add('hidden');
  $('hub').classList.remove('hidden');
  $('hubCity').classList.toggle('hidden', !ctx.world);
  ctx.state.phase = 'hub';
  ctx.state.hover = null;
  renderHub();
}

function enter3D() {
  closeSheet();
  $('hub').classList.add('hidden');
  $('hud').classList.remove('hidden');
  ctx.state.phase = 'play';
  ctx.refreshToolUI();
  if (!D.seenHelp) { D.seenHelp = true; progress.save(); $('helpModal').classList.remove('hidden'); }
}

function goHub(out) {
  // sessions started in the city return to the city; sessions started in the academy return to the academy
  if (ctx.returnTo === 'world' && ctx.world) {
    ctx.world.resume();
    if (out?.lines?.length) showReward(out.title || 'סיכום', out.lines);
    return;
  }
  if (ctx.world) ctx.academyMinutes = (ctx.academyMinutes || 0) + 35;
  showHub();
  if (out?.reopen) out.reopen();
  if (out?.lines?.length) showReward(out.title || 'סיכום', out.lines);
}

function showReward(title, lines) {
  $('rewardTitle').textContent = title;
  $('rewardBody').innerHTML = `<ul class="reward-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  $('rewardModal').classList.remove('hidden');
}

// ================================================================ hub
const CARDS = [
  { go: 'lessons', icon: '📚', title: 'מסלול לימוד', sub: () => `${LESSONS.filter((l) => progress.lessonPassed(l.id)).length}/100 שיעורים` },
  { go: 'lab', icon: '🔬', title: 'מעבדת תספורות', sub: () => 'בחר תספורת, צפה בהדגמה ובצע' },
  { go: 'practice', icon: '🎯', title: 'מצב אימונים', sub: () => 'ראש אימון, בלי לחץ ובלי זמן' },
  { go: 'clients', icon: '💬', title: 'לקוחות', sub: () => `${D.stats.clients} לקוחות עד עכשיו` },
  { go: 'daily', icon: '🏅', title: 'אתגר יומי', sub: () => (D.daily[today()]?.done ? '✅ הושלם היום' : 'אתגר חדש מחכה') },
  { go: 'library', icon: '📖', title: 'ספריית תספורות', sub: () => `${HAIRCUTS.length} תספורות` },
  { go: 'dictionary', icon: '📕', title: 'מילון ספרות', sub: () => `${TERMS.length} מושגים` },
  { go: 'awards', icon: '🎓', title: 'תעודות והישגים', sub: () => `${D.certificates.length} תעודות · ${Object.keys(D.achievements).length} הישגים` },
];
export const hubCards = CARDS;
const GO = {};

function renderHub() {
  const r = progress.rank, nx = progress.nextRank;
  $('hubName').textContent = D.profile.name || 'ספר/ית';
  $('hubRank').textContent = `דרגה ${r.id}: ${r.name}`;
  $('hubCoins').textContent = D.coins;
  const p = nx ? (D.xp - r.xp) / (nx.xp - r.xp) : 1;
  $('hubXp').style.width = `${Math.round(p * 100)}%`;
  $('hubXpText').textContent = nx ? `${D.xp} XP · עוד ${nx.xp - D.xp} XP לדרגת ${nx.name}` : `${D.xp} XP · הדרגה הגבוהה ביותר!`;
  $('hubGrid').innerHTML = CARDS.map((c) => `<button class="hub-card" data-go="${c.go}"><span class="hc-icon">${c.icon}</span><b>${c.title}</b><small>${esc(c.sub())}</small></button>`).join('');
  $('hubGrid').querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => GO[b.dataset.go]()));
}

// ================================================================ rewards shared by all haircut modes
function haircutRewards(res, spec, kind, { firstLearn = false } = {}) {
  const lines = [], ach = [];
  const add = (a) => { if (a) { ach.push(a); lines.push(`🏆 הישג: ${a.name} (+${a.xp} XP, +${a.coins} 🪙)`); } };
  add(progress.unlock('firstHaircut'));
  if (spec.cat === 'fade' && res.overall >= 60) add(progress.unlock('firstFade'));
  if (firstLearn) add(progress.unlock('learnNew'));
  if (res.overall >= 90) add(progress.unlock('score90'));
  if (res.scores.symmetry >= 0.95 && res.overall >= 60) add(progress.unlock('symmetryMaster'));
  if (res.elapsed > 0 && res.elapsed < 360 && res.overall >= 70) add(progress.unlock('timedCut'));
  void kind;
  return lines;
}
function rankLine(up) { return up ? `⬆️ עלית לדרגה ${up.id}: ${up.name}!` : null; }

// ================================================================ library + lab + practice
const picCache = new Map();
function haircutPictures(spec, el) {
  const key = spec.id;
  const show = (urls) => {
    el.innerHTML = urls.map((u, i) => `<figure><img src="${u}" alt=""><figcaption>${['חזית', 'צד', 'אחור', 'למעלה'][i]}</figcaption></figure>`).join('');
  };
  if (picCache.has(key)) { show(picCache.get(key)); return; }
  el.innerHTML = '<div class="muted small">מכין תמונות תלת־ממד מכל הצדדים...</div>';
  setTimeout(() => {
    if (ctx.state.headKey !== 'mannequin' || session.active) ctx.setupHead(HAIR_PRESETS.mannequin, { mannequin: true });
    const h = ctx.hair;
    h.setTarget((d) => targetLength(spec, d));
    h.setDisplay('pro');
    const urls = [[0, 1.45], [Math.PI / 2, 1.45], [Math.PI, 1.4], [Math.PI, 0.35]].map(([t, p]) => ctx.renderView(t, p, 0.6, ctx.isMobile ? 200 : 256));
    h.setDisplay('mine');
    h.setTarget(null);
    picCache.set(key, urls);
    show(urls);
  }, 30);
}

function libraryItem(h, mode) {
  const best = D.haircuts[h.id]?.best;
  const locked = mode === 'lab' && progress.rank.id < requiredRank(h);
  return `<button class="lib-item ${locked ? 'locked' : ''}" data-cut="${h.id}">
    <span class="lib-svg">${haircutSVG(h, 64)}</span>
    <span class="lib-text"><b>${esc(h.he)}</b><small>${esc(h.name)} · ${stars(h.difficulty)} ${DIFFICULTY_NAMES[h.difficulty]}</small>
    ${locked ? `<small class="lock">🔒 נפתח בדרגה ${RANKS[requiredRank(h) - 1].name}</small>` : best != null ? `<small class="best">שיא: ${best}</small>` : ''}</span></button>`;
}

function openLibrary(mode = 'browse') {
  const title = mode === 'lab' ? 'מעבדת תספורות — בחר תספורת' : mode === 'practice' ? 'תרגול תספורת שלמדת' : 'ספריית תספורות';
  let list = HAIRCUTS;
  if (mode === 'practice') list = HAIRCUTS.filter((h) => D.haircuts[h.id]?.learned);
  const groups = Object.keys(CATEGORY_NAMES).map((cat) => {
    const items = list.filter((h) => h.cat === cat);
    if (!items.length) return '';
    return `<h3 class="grp">${CATEGORY_NAMES[cat]}</h3><div class="lib-grid">${items.map((h) => libraryItem(h, mode)).join('')}</div>`;
  }).join('');
  const empty = mode === 'practice' && !list.length ? '<p class="muted">עדיין לא למדת תספורת. תספורת נחשבת "נלמדה" אחרי ציון 70 במעבדה, בשיעור או אצל לקוח.</p>' : '';
  const intro = mode === 'lab' ? '<p class="muted">במעבדה רואים את התספורת מכל הצדדים, צופים בהדגמה, מבצעים בעצמך על ראש אימון — והמורה מראה טעויות ואיך לתקן.</p>' : '';
  openSheet(title, intro + empty + groups, {
    back: showHub,
    mount: (b) => b.querySelectorAll('[data-cut]').forEach((el) => el.addEventListener('click', () => openHaircut(el.dataset.cut, mode))),
  });
}

function openHaircut(id, mode = 'browse') {
  const h = HAIRCUT_BY_ID[id];
  const locked = progress.rank.id < requiredRank(h);
  const learned = D.haircuts[id]?.learned;
  const lesson = LESSONS.find((l) => l.task.haircut === id || l.task.cut?.haircut === id);
  const heads = [['mannequin', 'חלק'], ['mannequinWavy', 'גלי'], ['mannequinCurly', 'מתולתל']];
  openSheet(h.he, `
    <div class="cut-head"><div class="cut-svg-big">${haircutSVG(h, 110)}</div>
      <div><div class="en">${esc(h.name)}</div><div>${stars(h.difficulty)} · רמת קושי ${DIFFICULTY_NAMES[h.difficulty]} · ${CATEGORY_NAMES[h.cat]}</div>
      ${D.haircuts[id] ? `<div class="muted small">שיא אישי: ${D.haircuts[id].best} · ${D.haircuts[id].count} ביצועים</div>` : ''}</div></div>
    <p>${esc(h.desc)}</p>
    <h3 class="grp">התוצאה המקצועית מכל הצדדים</h3>
    <div class="pics" id="cutPics"></div>
    <h3 class="grp">שלבי העבודה</h3>
    <ol class="steps-ol">${haircutSteps(h).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    ${lesson ? `<p class="muted small">📚 שיעור במסלול: ${esc(lesson.title)} (פרק ${lesson.ch})</p>` : ''}
    <h3 class="grp">ביצוע</h3>
    ${locked ? `<p class="lock">🔒 כדי לבצע במעבדה צריך דרגת ${RANKS[requiredRank(h) - 1].name}. בינתיים אפשר לקרוא וללמוד.</p>` : `
      <div class="muted small">סוג שיער בראש האימון:</div>
      <div class="chips" id="headChips">${heads.map(([k, n], i) => `<button class="chip-btn ${i === 0 ? 'active' : ''}" data-head="${k}">${n}</button>`).join('')}</div>
      <div class="row"><button class="btn primary" id="btnLab">🔬 בצע במעבדה</button>
      ${learned ? '<button class="btn ghost" id="btnPractice">🎯 תרגול חוזר</button>' : ''}</div>`}`,
  {
    back: () => openLibrary(mode),
    mount: (b) => {
      haircutPictures(h, b.querySelector('#cutPics'));
      let head = 'mannequin';
      b.querySelectorAll('[data-head]').forEach((el) => el.addEventListener('click', () => {
        head = el.dataset.head;
        b.querySelectorAll('[data-head]').forEach((x) => x.classList.toggle('active', x === el));
      }));
      b.querySelector('#btnLab')?.addEventListener('click', () => startHaircut(h, 'lab', head));
      b.querySelector('#btnPractice')?.addEventListener('click', () => startHaircut(h, 'practice', head));
    },
  });
}

function startHaircut(spec, kind, headKey = 'mannequin') {
  session.start({
    kind, title: `${kind === 'lab' ? 'מעבדה' : 'תרגול'}: ${spec.he}`,
    subtitle: kind === 'lab' ? 'צפה ב"שלבים" וב"הדגמה", ובצע בעצמך. "סיום ובדיקה" כשתסיים.' : 'בלי לחץ ובלי זמן. אפשר לבדוק, לתקן ולנסות שוב.',
    spec, head: { preset: HAIR_PRESETS[headKey], mannequin: true }, allowDemo: true, allowCompare: true,
    onEnd: (res) => {
      const firstLearn = progress.recordHaircut(spec.id, res.overall, kind);
      const xp = (kind === 'lab' ? 20 : 10) + res.overall * 0.3 + (firstLearn ? 60 : 0);
      const coins = firstLearn ? 40 : 5;
      const up = progress.reward(xp, coins);
      const lines = [`ציון: ${res.overall} (${res.grade})`, `+${Math.round(xp)} XP, +${coins} 🪙`];
      if (firstLearn) lines.push(`📗 למדת תספורת חדשה: ${spec.he}`);
      lines.push(...haircutRewards(res, spec, kind, { firstLearn }));
      const rl = rankLine(up); if (rl) lines.push(rl);
      return { title: spec.he, lines, reopen: () => openHaircut(spec.id, kind === 'lab' ? 'lab' : 'practice') };
    },
  });
  enter3D();
}

function openPractice() {
  const heads = ['mannequin', 'mannequinWavy', 'mannequinCurly', 'daniel', 'yoni', 'avi'];
  openSheet('מצב אימונים', `
    <p class="muted">כאן אין זמן, אין לקוח ואין לחץ. אפשר לעצור, להסתובב, לבטל, לתקן ולהתחיל מחדש כמה שרוצים.</p>
    <h3 class="grp">🎯 תרגול תספורת שלמדת</h3>
    <p class="muted small">חזרה על תספורת עם יעד, הדגמה, השוואה למקצועי ובדיקה.</p>
    <button class="btn primary" id="btnLearned">בחר תספורת שלמדת</button>
    <h3 class="grp">✋ אימון חופשי (בלי יעד)</h3>
    <p class="muted small">ספר מה שתרצה. השיער נשמר אוטומטית לכל ראש.</p>
    <div class="client-list">${heads.map((k) => { const p = HAIR_PRESETS[k]; return `<button class="client-item" data-free="${k}"><i class="sw" style="background:${p.color}"></i><span><b>${esc(p.name)}</b><small>${esc(p.hairType)}</small></span></button>`; }).join('')}</div>`,
  {
    back: showHub,
    mount: (b) => {
      b.querySelector('#btnLearned').addEventListener('click', () => openLibrary('practice'));
      b.querySelectorAll('[data-free]').forEach((el) => el.addEventListener('click', () => { session.free(el.dataset.free); enter3D(); ctx.toast('אימון חופשי — העבודה נשמרת אוטומטית'); }));
    },
  });
}

// ================================================================ clients
function openClients() {
  const c = generateClient({ seed: Date.now() % 1e9, maxDifficulty: Math.min(5, progress.rank.id + 1) });
  startClient(c, {});
}

/** Seats a client, shows his request (with a comprehension question), and runs the haircut. */
function startClient(c, { title = null, onEnd = null } = {}) {
  session.start({
    kind: 'client', title: title || `לקוח: ${c.name}`, subtitle: `“${c.speech}”`, spec: c.spec, client: c,
    head: { preset: c.preset, skin: c.skin, cape: c.cape, seed: c.seed % 100000 }, hygiene: true, allowDemo: false, allowCompare: false,
    onEnd: onEnd || ((res) => clientRewards(c, res)),
  });
  enter3D();
  showRequest(c, false);
}

function clientRewards(c, res, factor = 0.6) {
  const fb = res.feedback;
  const pay = Math.round(c.price * factor * (0.3 + 0.7 * res.overall / 100));
  const tip = fb.stars >= 5 ? 20 : fb.stars >= 4 ? 10 : 0;
  D.stats.clients++;
  const firstLearn = progress.recordHaircut(c.base.id, res.overall, 'client');
  const up = progress.reward(10 + res.overall * 0.5, pay + tip);
  const lines = [`${fb.mood} ${c.name}: ${stars(fb.stars)}`, `תשלום: ${pay} 🪙${tip ? ` + טיפ ${tip} 🪙` : ''}`, `+${Math.round(10 + res.overall * 0.5)} XP`];
  const add = (a) => { if (a) lines.push(`🏆 הישג: ${a.name} (+${a.xp} XP, +${a.coins} 🪙)`); };
  if (fb.stars >= 4) add(progress.unlock('happyClient'));
  if (D.stats.clients >= 10) add(progress.unlock('tenClients'));
  if (session.hygiene && res.scores.finish >= 0.95) add(progress.unlock('cleanFinish'));
  lines.push(...haircutRewards(res, c.base, 'client', { firstLearn }));
  const rl = rankLine(up); if (rl) lines.push(rl);
  progress.save();
  return { title: `${c.name} יצא מהמספרה`, lines, pay: pay + tip, stars: fb.stars };
}

function clientPhotos(c) {
  if (c.photos) return c.photos;
  const h = ctx.hair;
  h.setDisplay('pro');
  c.photos = [[0, 1.45], [Math.PI / 2, 1.45], [Math.PI, 1.4]].map(([t, p]) => ctx.renderView(t, p, 0.6, 180));
  h.setDisplay('mine');
  return c.photos;
}

function showRequest(c, reopen) {
  const pers = PERSONALITIES[c.personality];
  const photos = c.showsPhoto ? `<div class="pics small-pics">${clientPhotos(c).map((u) => `<img src="${u}" alt="">`).join('')}</div><div class="muted small">הלקוח מראה לך תמונה של מה שהוא רוצה</div>` : '';
  // no quiz and no ✓/✗ here: you listen, watch a demo if you want, and cut. You are graded only when you press ✓.
  session.cfg.understood = true;
  $('requestBody').innerHTML = `
    <div class="req-head"><span class="req-avatar">🧔</span><div><b>${esc(c.name)}</b>, ${c.age}<div class="muted small">שיער ${esc(c.preset.hairType)} · לקוח ${pers.name}</div></div></div>
    <div class="bubble">“${esc(c.speech)}”</div>
    ${photos}
    ${reopen ? '' : `<details class="howto" open><summary>📋 ההוראות לפני שמתחילים</summary><ol>${haircutSteps(c.spec).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></details>`}
    ${reopen ? '<div class="row"><button class="btn primary" id="reqGo">סגור</button></div>' : `
    <div class="row req-start">
      <button class="btn primary" id="reqDemo">▶ קודם הדגמה, ואז אני</button>
      <button class="btn ghost" id="reqGo">✂️ להתחיל לבד</button>
    </div>
    <p class="muted small">אין כאן מבחן ואין זמן לחוץ: מספרים בקצב שלך, ושואלים את הלקוח (💬) מתי שרוצים. כשאתה חושב שסיימת — לוחצים <b>✓ סיימתי</b> ומקבלים ציון. זכור: חיטוי כלים לפני, מברשת צוואר בסוף.</p>`}`;
  $('requestModal').classList.remove('hidden');
  $('reqGo').addEventListener('click', () => $('requestModal').classList.add('hidden'));
  $('reqDemo')?.addEventListener('click', () => { $('requestModal').classList.add('hidden'); session.introDemo(); });
}
ctx.showRequest = showRequest;

// ================================================================ daily challenge
const GOALS = [
  { id: 'score', text: (h) => `בצע ${h.he} עם ציון 75 ומעלה`, ok: (r) => r.overall >= 75 },
  { id: 'time', text: (h) => `בצע ${h.he} תוך 8 דקות עם ציון 65 ומעלה`, ok: (r) => r.overall >= 65 && r.elapsed <= 480 },
  { id: 'symmetry', text: (h) => `בצע ${h.he} עם סימטריה של 90% ומעלה (ציון 60+)`, ok: (r) => r.overall >= 60 && r.scores.symmetry >= 0.9 },
  { id: 'clean', text: (h) => `בצע ${h.he} עם גימור וניקיון של 90% ומעלה`, ok: (r) => r.overall >= 60 && r.scores.finish >= 0.9 },
];
function dailyChallenge() {
  const d = today();
  const seed = d.split('-').reduce((a, v) => a * 100 + +v, 0);
  const rng = mulberry32(seed);
  const pool = HAIRCUTS.filter((h) => h.difficulty <= Math.min(5, progress.rank.id + 1) && h.id !== 'layers');
  const h = pool[Math.floor(rng() * pool.length)];
  const goal = GOALS[Math.floor(rng() * GOALS.length)];
  return { date: d, seed, haircut: h, goal, reward: { xp: 100, coins: 150 } };
}
function openDaily() {
  const ch = dailyChallenge();
  const done = D.daily[ch.date];
  openSheet('אתגר יומי', `
    <div class="daily-card"><div class="cut-svg-big">${haircutSVG(ch.haircut, 110)}</div>
    <div><div class="muted small">${new Date().toLocaleDateString('he-IL')}</div><h3>${esc(ch.goal.text(ch.haircut))}</h3>
    <div>פרס: ${ch.reward.xp} XP + ${ch.reward.coins} 🪙</div>
    ${done?.done ? `<div class="ok-text">✅ השלמת את האתגר היום (ציון ${done.score}). אתגר חדש מחר!</div>` : done ? `<div class="muted">ניסיון אחרון: ${done.score}. אפשר לנסות שוב.</div>` : ''}</div></div>
    <p class="muted">האתגר מתבצע על לקוח אמיתי עם שיער משלו. אחרי שתסיים, המורה יבדוק אם עמדת ביעד.</p>
    ${done?.done ? '' : '<button class="btn primary" id="btnDaily">🏅 התחל את האתגר</button>'}`,
  {
    back: showHub,
    mount: (b) => b.querySelector('#btnDaily')?.addEventListener('click', () => {
      const c = generateClient({ seed: ch.seed, haircutId: ch.haircut.id });
      startClient(c, {
        title: `אתגר יומי: ${ch.haircut.he}`,
        onEnd: (res) => {
          const out = clientRewards(c, res, 0.4);
          const ok = ch.goal.ok(res);
          D.daily[ch.date] = { done: ok || !!D.daily[ch.date]?.done, score: res.overall };
          if (ok) {
            const up = progress.reward(ch.reward.xp, ch.reward.coins);
            out.lines.unshift(`🏅 עמדת באתגר היומי! +${ch.reward.xp} XP, +${ch.reward.coins} 🪙`);
            const a = progress.unlock('dailyChallenge'); if (a) out.lines.push(`🏆 הישג: ${a.name}`);
            const rl = rankLine(up); if (rl) out.lines.push(rl);
          } else out.lines.unshift(`האתגר לא הושלם: ${ch.goal.text(ch.haircut)}. נסה שוב!`);
          progress.save();
          out.title = 'אתגר יומי';
          return out;
        },
      });
    }),
  });
}

// ================================================================ lessons
const lessonUnlocked = (l) => l.index === 0 || progress.lessonPassed(LESSONS[l.index - 1].id);
ctx.lessonTitle = (id) => { const l = LESSON_BY_ID[id]; return l ? `${l.title} (פרק ${l.ch})` : null; };

function openLessons(focusCh = null) {
  const firstOpen = LESSONS.find((l) => !progress.lessonPassed(l.id));
  const curCh = focusCh || firstOpen?.ch || 10;
  const html = CHAPTERS.map((ch) => {
    const ls = LESSONS.filter((l) => l.ch === ch.id);
    const passed = ls.filter((l) => progress.lessonPassed(l.id)).length;
    return `<details class="chapter" ${ch.id === curCh ? 'open' : ''}><summary><span>${ch.icon} פרק ${ch.id}: ${ch.title}</span><small>${passed}/10</small></summary>
      <div class="lesson-list">${ls.map((l) => {
        const st = progress.lessonPassed(l.id) ? 'done' : lessonUnlocked(l) ? 'open' : 'locked';
        const best = D.lessons[l.id]?.best;
        return `<button class="lesson-item ${st}" data-lesson="${l.id}"><span class="li-n">${st === 'done' ? '✓' : st === 'locked' ? '🔒' : l.n}</span>
          <span class="li-t"><b>${esc(l.title)}</b><small>${l.exam ? 'מבחן פרק · ' : ''}${typeName(l.task)}${best ? ` · שיא ${best}` : ''}</small></span></button>`;
      }).join('')}</div></details>`;
  }).join('');
  const total = LESSONS.filter((l) => progress.lessonPassed(l.id)).length;
  openSheet('מסלול לימוד — 100 שיעורים', `<div class="xpbar big"><i style="width:${total}%"></i></div><p class="muted small">${total} מתוך 100 שיעורים הושלמו. שיעור נפתח אחרי שעוברים את הקודם — אפשר לחזור על כל שיעור בכל זמן.</p>${html}`, {
    back: showHub,
    mount: (b) => b.querySelectorAll('[data-lesson]').forEach((el) => el.addEventListener('click', () => openLesson(el.dataset.lesson))),
  });
}
function typeName(t) {
  return { quiz: 'שאלות', tapZone: 'תרגול על הראש', pickTool: 'בחירת כלי', pickGuard: 'בחירת מסרק', cut: 'תספורת מעשית', client: 'לקוח', exam: 'מבחן + מעשי' }[t.type];
}

function openLesson(id) {
  const l = LESSON_BY_ID[id];
  if (!l) return;
  const unlocked = lessonUnlocked(l);
  const passed = progress.lessonPassed(id);
  const t = l.task;
  const cutSpec = t.haircut ? specById(t.haircut) : t.cut ? specById(t.cut.haircut) : null;
  const visual = illu(l.visual) || (cutSpec ? haircutSVG(cutSpec, 120) : '');
  let taskInfo = '';
  if (t.type === 'cut') taskInfo = `תספורת: <b>${esc(cutSpec.he)}</b> · ציון נדרש ${t.pass}${t.timeLimit ? ` · עד ${t.timeLimit / 60} דקות` : ''}`;
  else if (t.type === 'client') taskInfo = `לקוח אמיתי · ציון נדרש ${t.pass}${t.needFinish ? ` · גימור ${Math.round(t.needFinish * 100)}%` : ''}`;
  else if (t.type === 'exam') taskInfo = `${t.questions.length} שאלות (80% לפחות) ואז ${t.cut ? `תספורת ${esc(specById(t.cut.haircut).he)} (ציון ${t.cut.pass})` : `לקוח (ציון ${t.client.pass})`}`;
  else if (t.type === 'quiz') taskInfo = `${t.questions.length} שאלות · 70% לעבור`;
  else taskInfo = typeName(t);
  openSheet(`פרק ${l.ch} · שיעור ${l.n}`, `
    <h2 class="lesson-title">${esc(l.title)}</h2>
    <div class="lesson-visual">${visual}</div>
    <div class="lesson-text">${l.text}</div>
    <div class="practice-box"><b>🏋️ תרגול מעשי:</b> ${esc(l.practice)}<div class="muted small">משימה: ${taskInfo}</div></div>
    ${cutSpec ? `<details class="zones"><summary>📋 שלבי העבודה</summary><ol class="steps-ol">${haircutSteps(cutSpec).map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
    ${passed ? `<p class="ok-text">✓ עברת את השיעור (שיא ${D.lessons[id].best}). אפשר לחזור עליו מתי שרוצים.</p>` : ''}
    ${unlocked ? `<button class="btn primary" id="btnRunLesson">${passed ? '↺ חזור על השיעור' : '▶ התחל'}</button>` : `<p class="lock">🔒 השיעור ייפתח אחרי שתעבור את השיעור הקודם.</p>`}`,
  {
    back: () => openLessons(l.ch),
    mount: (b) => b.querySelector('#btnRunLesson')?.addEventListener('click', () => runLesson(l)),
  });
}
ctx.openLesson = (id) => openLesson(id);

function lessonComplete(l, score, passed, extra = []) {
  const first = progress.recordLesson(l.id, Math.round(score), passed);
  const lines = [passed ? `✅ עברת את השיעור "${l.title}" (ציון ${Math.round(score)})` : `השיעור לא הושלם (ציון ${Math.round(score)}). אפשר לנסות שוב — ככה לומדים.`, ...extra];
  if (first) {
    const base = l.exam ? [120, 100] : ['cut', 'client'].includes(l.task.type) ? [60, 40] : [30, 20];
    const up = progress.reward(base[0], base[1]);
    lines.push(`+${base[0]} XP, +${base[1]} 🪙`);
    const rl = rankLine(up); if (rl) lines.push(rl);
    const passedCount = LESSONS.filter((x) => progress.lessonPassed(x.id)).length;
    if (passedCount >= 10) { const a = progress.unlock('lessons10'); if (a) lines.push(`🏆 הישג: ${a.name}`); }
    if (l.exam) {
      const ch = CHAPTERS[l.ch - 1];
      const title = l.ch === 10 ? 'מאסטר ברבר — סיום מסלול 100 השיעורים' : `סיום פרק ${l.ch}: ${ch.title}`;
      const cert = progress.addCertificate(`ch${l.ch}`, title, score);
      if (cert) lines.push(`🎓 קיבלת תעודה: ${title}! (בתעודות והישגים)`);
      if (l.ch === 1) { const a = progress.unlock('chapter1'); if (a) lines.push(`🏆 הישג: ${a.name}`); }
    }
    const next = LESSONS[l.index + 1];
    if (next) lines.push(`🔓 נפתח השיעור הבא: ${next.title}`);
  }
  return lines;
}

function runLesson(l) {
  const t = l.task;
  const reopenNext = (passed) => () => openLesson(passed && LESSONS[l.index + 1] ? LESSONS[l.index + 1].id : l.id);
  if (t.type === 'quiz') return runQuiz(l, t.questions, 0.7, (score, passed) => {
    const lines = lessonComplete(l, score, passed);
    quizSummary(l, score, passed, lines);
  });
  if (t.type === 'exam') return runQuiz(l, t.questions, 0.8, (qScore, qPassed) => {
    if (!qPassed) { quizSummary(l, qScore, false, lessonComplete(l, qScore * 0.5, false, ['במבחן צריך 80% בשאלות לפני החלק המעשי.'])); return; }
    const finishPractical = (res, passedPractical) => {
      const score = (qScore + res.overall) / 2;
      return { title: l.title, lines: lessonComplete(l, score, passedPractical, [`שאלות: ${Math.round(qScore)} · מעשי: ${res.overall}`]), reopen: reopenNext(passedPractical) };
    };
    if (t.cut) runCutLesson(l, t.cut, (res) => finishPractical(res, res.overall >= t.cut.pass));
    else runClientLesson(l, t.client, (res) => finishPractical(res, res.overall >= t.client.pass));
  });
  if (t.type === 'cut') return runCutLesson(l, t, (res) => {
    const timeOk = !t.timeLimit || res.elapsed <= t.timeLimit;
    const passed = res.overall >= t.pass && timeOk;
    const extra = t.timeLimit && !timeOk ? [`הזמן: ${Math.round(res.elapsed)} שניות — יותר מ־${t.timeLimit}.`] : [];
    return { title: l.title, lines: lessonComplete(l, res.overall, passed, extra), reopen: reopenNext(passed) };
  });
  if (t.type === 'client') return runClientLesson(l, t, (res) => {
    const finOk = !t.needFinish || (res.scores.finish ?? 0) >= t.needFinish;
    const passed = res.overall >= t.pass && finOk;
    const extra = t.needFinish && !finOk ? [`גימור וניקיון: ${Math.round((res.scores.finish ?? 0) * 100)}% — צריך ${Math.round(t.needFinish * 100)}%. חטא כלים לפני, ונקה עם המברשת בסוף.`] : [];
    return { title: l.title, lines: lessonComplete(l, res.overall, passed, extra), reopen: reopenNext(passed) };
  });
  // 3D tasks without a haircut
  const task = makeTask(l);
  // start with a tool that is not the first answer, so the player has to choose it
  if (t.type === 'pickTool') ctx.selectTool(t.rounds[0].tool === 'duster' ? 'clipper' : 'duster', true);
  if (t.type === 'pickGuard') ctx.selectTool('clipper', true);
  session.start({
    kind: 'lesson', title: `שיעור: ${l.title}`, subtitle: task.prompt(), spec: null,
    head: { preset: HAIR_PRESETS.mannequin, mannequin: true }, task,
    onEnd: (res) => { const passed = res.overall >= 60; return { title: l.title, lines: lessonComplete(l, res.overall, passed), reopen: reopenNext(passed) }; },
  });
  enter3D();
}

function runCutLesson(l, t, onEnd) {
  const spec = specById(t.haircut);
  session.start({
    kind: 'lesson', title: `שיעור: ${l.title}`, subtitle: `${spec.he} — ציון ${t.pass}${t.timeLimit ? `, עד ${t.timeLimit / 60} דקות` : ''}`,
    spec, head: { preset: HAIR_PRESETS[t.head || 'mannequin'], mannequin: true }, allowDemo: !t.timeLimit, allowCompare: true, onEnd,
  });
  enter3D();
}

function runClientLesson(l, t, onEnd) {
  const c = generateClient({ seed: Date.now() % 1e9, maxDifficulty: t.opts?.maxDifficulty ?? 2, haircutId: t.opts?.haircutId || null });
  if (t.opts?.personality) c.personality = t.opts.personality;
  if (t.opts?.showsPhoto) c.showsPhoto = true;
  if (t.opts?.hairKey) c.preset = { ...c.preset, ...hairTypeOverride(t.opts.hairKey) };
  startClient(c, { title: `שיעור: ${l.title}`, onEnd: (res) => { const out = onEnd(res); clientRewards(c, res, 0.3); return out; } });
}
function hairTypeOverride(key) {
  const map = { curly: HAIR_PRESETS.mannequinCurly, coarse: { hairType: 'עבה וקשה', color: '#121012', curlAmp: 0.0009, curlFreq: 180, width: 0.0015 } };
  const p = map[key] || {};
  return { hairType: p.hairType, color: p.color, curlAmp: p.curlAmp, curlFreq: p.curlFreq, width: p.width };
}

/** 3D lesson tasks: tap a zone on the head, pick the right tool, pick the right guard. */
function makeTask(l) {
  const t = l.task;
  let i = 0, mistakes = 0;
  const rounds = t.type === 'tapZone' ? t.zones : t.rounds;
  const done = () => {
    const score = Math.max(30, 100 - mistakes * 15);
    session.taskDone(score, mistakes ? [`${mistakes} טעויות בדרך — זה בסדר, ככה לומדים.`] : [], mistakes ? [] : ['הכול נכון מהניסיון הראשון!']);
  };
  const next = () => { i++; if (i >= rounds.length) setTimeout(done, 700); else session.setPrompt(task.prompt()); };
  const task = {
    prompt() {
      const r = rounds[i];
      if (t.type === 'tapZone') return `(${i + 1}/${rounds.length}) גע על הראש ב${ZONE_NAMES[r]}`;
      if (t.type === 'pickTool') return `(${i + 1}/${rounds.length}) ${r.q} — בחר בלוח הכלים`;
      return `(${i + 1}/${rounds.length}) בחר מסרק (וידית אם צריך) שמשאיר ${r.mm} מ״מ, ולחץ "✓ בדוק"`;
    },
  };
  if (t.type === 'tapZone') task.onTap = (hit) => {
    if (i >= rounds.length) return;
    const want = rounds[i], got = zoneKeyOf(hit.dir);
    if (got === want) { ctx.hair.highlightZone(want); ctx.toast(`✅ נכון! זה ${ZONE_NAMES[want]}`); setTimeout(() => ctx.hair.highlightZone(null), 1200); next(); }
    else { mistakes++; ctx.hair.highlightZone(want); ctx.toast(`זה ${ZONE_NAMES[got]}. ${ZONE_NAMES[want]} מסומן עכשיו בזהב — נסה שוב.`, 3000); setTimeout(() => ctx.hair.highlightZone(null), 1600); }
  };
  if (t.type === 'pickTool') task.onTool = (id) => {
    if (i >= rounds.length) return;
    const r = rounds[i];
    if (id === r.tool) { ctx.toast(`✅ נכון! ${r.why}`, 3000); next(); }
    else { mistakes++; ctx.toast(`לא בדיוק: ${TOOLS[id].name} — ${TOOLS[id].desc.split('.')[0]}. נסה שוב.`, 3200); }
  };
  if (t.type === 'pickGuard') task.check = () => {
    if (i >= rounds.length) return;
    const r = rounds[i], tl = ctx.tools;
    if (tl.active === 'clipper' && Math.abs(tl.cutMM - r.mm) < 0.01) { ctx.toast(`✅ נכון! ${tl.guard.name}${tl.lever ? ' עם ידית פתוחה' : ''} = ${r.mm} מ״מ`, 2600); next(); }
    else {
      mistakes++;
      const have = tl.active === 'clipper' ? `${tl.cutMM} מ״מ` : 'לא בחרת מכונה';
      ctx.toast(`עכשיו נבחר: ${have}. צריך ${r.mm} מ״מ. רמז: ½=1.5, 1=3, 2=6, 3=10, 4=13, 6=19, 8=25, ידית פתוחה +1.5.`, 4200);
    }
  };
  return task;
}

function runQuiz(l, questions, need, onDone) {
  let qi = 0, correct = 0;
  const render = () => {
    const q = questions[qi];
    openSheet(`${l.title} — שאלה ${qi + 1}/${questions.length}`, `
      <div class="quiz"><div class="qbar"><i style="width:${(qi / questions.length) * 100}%"></i></div>
      <h3>${esc(q.q)}</h3><div class="choices">${q.a.map((a, k) => `<button class="choice" data-k="${k}">${esc(a)}</button>`).join('')}</div>
      <div id="qFeedback"></div><button class="btn primary hidden" id="qNext">${qi + 1 < questions.length ? 'לשאלה הבאה' : 'סיום'}</button></div>`,
    {
      back: () => openLesson(l.id),
      mount: (b) => {
        b.querySelectorAll('.choice').forEach((btn) => btn.addEventListener('click', () => {
          const k = +btn.dataset.k, ok = k === q.c;
          if (ok) correct++;
          b.querySelectorAll('.choice').forEach((x) => { x.disabled = true; x.classList.toggle('right', +x.dataset.k === q.c); x.classList.toggle('wrong', x === btn && !ok); });
          b.querySelector('#qFeedback').innerHTML = `<p class="${ok ? 'ok-text' : 'bad-text'}">${ok ? '✅ נכון!' : '❌ לא נכון.'} ${esc(q.why)}</p>`;
          b.querySelector('#qNext').classList.remove('hidden');
        }));
        b.querySelector('#qNext').addEventListener('click', () => {
          qi++;
          if (qi < questions.length) render();
          else { const score = (correct / questions.length) * 100; onDone(score, score / 100 >= need - 1e-9); }
        });
      },
    });
  };
  render();
}

function quizSummary(l, score, passed, lines) {
  const next = LESSONS[l.index + 1];
  openSheet(l.title, `<div class="score-head"><div class="big-score ${passed ? 'good' : 'low'}">${Math.round(score)}</div><div class="grade">${passed ? 'עברת!' : 'עוד קצת תרגול'}</div></div>
    <ul class="reward-list">${lines.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="row"><button class="btn ghost" id="qAgain">↺ חזור על השיעור</button>${passed && next ? `<button class="btn primary" id="qNextLesson">לשיעור הבא: ${esc(next.title)}</button>` : ''}</div>`,
  {
    back: () => openLessons(l.ch),
    mount: (b) => {
      b.querySelector('#qAgain').addEventListener('click', () => openLesson(l.id));
      b.querySelector('#qNextLesson')?.addEventListener('click', () => openLesson(next.id));
    },
  });
}

// ================================================================ dictionary
function openDictionary(back = showHub) {
  openSheet('מילון ספרות מקצועי', `
    <input id="dictSearch" class="text-input" placeholder="חיפוש בעברית או באנגלית (למשל: fade, פאות)" />
    <div id="dictList" class="dict-list"></div>`,
  {
    back,
    mount: (b) => {
      const list = b.querySelector('#dictList');
      const render = (q) => {
        const s = q.trim().toLowerCase();
        const items = TERMS.filter((t) => !s || t.he.includes(s) || t.en.toLowerCase().includes(s) || t.text.includes(s));
        list.innerHTML = items.length ? items.map((t, i) => `<div class="term"><div class="term-illu">${illu(t.illu)}</div><div class="term-body">
          <b>${esc(t.he)}</b> <span class="en">${esc(t.en)}</span><p>${esc(t.text)}</p>
          <div class="row">${t.zone ? `<button class="btn ghost sm" data-zone="${t.zone}" data-i="${i}">👁 הצג על הראש</button>` : ''}${t.cut ? `<button class="btn ghost sm" data-cutlink="${t.cut}">📖 בספרייה</button>` : ''}</div></div></div>`).join('')
          : '<p class="muted">לא נמצא מונח. נסה מילה אחרת.</p>';
        list.querySelectorAll('[data-zone]').forEach((el) => el.addEventListener('click', () => {
          const term = items[+el.dataset.i];
          session.start({ kind: 'view', title: `${term.he} — ${term.en}`, subtitle: term.text, spec: null, head: { preset: HAIR_PRESETS.mannequin, mannequin: true } });
          ctx.hair.highlightZone(el.dataset.zone);
          ctx.cam.setView(el.dataset.zone.startsWith('side') ? (el.dataset.zone.endsWith('R') ? 'right' : 'left') : el.dataset.zone === 'nape' || el.dataset.zone === 'back' || el.dataset.zone === 'crown' ? 'back' : el.dataset.zone === 'fringe' ? 'front' : 'top');
          enter3D();
          ctx.toast('האזור מסומן בזהב. לחץ ⌂ כדי לחזור.', 3000);
        }));
        list.querySelectorAll('[data-cutlink]').forEach((el) => el.addEventListener('click', () => openHaircut(el.dataset.cutlink, 'browse')));
      };
      b.querySelector('#dictSearch').addEventListener('input', (e) => render(e.target.value));
      render('');
    },
  });
}

// ================================================================ awards
function drawCertificate(c) {
  const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 850;
  const g = cv.getContext('2d');
  g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, 1200, 850);
  g.strokeStyle = '#b8913f'; g.lineWidth = 18; g.strokeRect(30, 30, 1140, 790);
  g.lineWidth = 3; g.strokeRect(60, 60, 1080, 730);
  g.textAlign = 'center'; g.direction = 'rtl';
  g.fillStyle = '#1b1408'; g.font = 'bold 44px Georgia, serif'; g.fillText('BARBER LIFE ACADEMY', 600, 150);
  g.fillStyle = '#b8913f'; g.font = 'bold 72px "Segoe UI", Arial, sans-serif'; g.fillText('תעודת הצטיינות', 600, 260);
  g.fillStyle = '#333'; g.font = '34px "Segoe UI", Arial, sans-serif'; g.fillText('מוענקת בזאת ל', 600, 340);
  g.fillStyle = '#1b1408'; g.font = 'bold 64px "Segoe UI", Arial, sans-serif'; g.fillText(c.name, 600, 430);
  g.fillStyle = '#333'; g.font = '34px "Segoe UI", Arial, sans-serif'; g.fillText('על השלמה בהצלחה של', 600, 510);
  g.fillStyle = '#1b1408'; g.font = 'bold 40px "Segoe UI", Arial, sans-serif'; g.fillText(c.title, 600, 575);
  g.fillStyle = '#555'; g.font = '28px "Segoe UI", Arial, sans-serif';
  g.fillText(`ציון: ${c.score} · תאריך: ${c.date}`, 600, 650);
  g.strokeStyle = '#999'; g.lineWidth = 2; g.beginPath(); g.moveTo(780, 730); g.lineTo(1040, 730); g.stroke();
  g.font = '24px "Segoe UI", Arial, sans-serif'; g.fillText('מנהל האקדמיה', 910, 765);
  g.fillStyle = '#c8102e'; g.beginPath(); g.arc(250, 720, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 40px Georgia'; g.fillText('💈', 250, 735);
  return cv;
}

function openAwards(back = showHub) {
  const r = progress.rank;
  const ranks = RANKS.map((k) => `<div class="rank ${k.id <= r.id ? 'got' : ''}"><b>${k.id}</b><span>${k.name}</span><small>${k.xp} XP</small></div>`).join('');
  const certs = D.certificates.length ? D.certificates.map((c, i) => `<div class="cert"><div class="cert-img" data-ci="${i}"></div><b>${esc(c.title)}</b><small>${c.date} · ציון ${c.score}</small><button class="btn ghost sm" data-dl="${i}">⬇ הורדה</button></div>`).join('')
    : '<p class="muted">עוד אין תעודות. כל מבחן סוף פרק במסלול הלימוד נותן תעודה.</p>';
  const ach = ACHIEVEMENTS.map((a) => `<div class="ach ${D.achievements[a.id] ? 'got' : ''}"><span>${D.achievements[a.id] ? '🏆' : '🔒'}</span><div><b>${a.name}</b><small>${a.desc}${D.achievements[a.id] ? ` · ${D.achievements[a.id]}` : ''}</small></div></div>`).join('');
  const hist = D.history.slice(0, 10).map((h) => `<li>${esc(HAIRCUT_BY_ID[h.id]?.he || specById(h.id)?.he || h.id)} — ${h.score} <small class="muted">(${{ lab: 'מעבדה', practice: 'תרגול', client: 'לקוח' }[h.kind] || h.kind})</small></li>`).join('');
  openSheet('תעודות והישגים', `
    <h3 class="grp">דרגות במקצוע (אקדמיה)</h3><div class="ranks">${ranks}</div>
    <h3 class="grp">🎓 תעודות</h3><div class="certs">${certs}</div>
    <h3 class="grp">🏆 משימות והישגים</h3><div class="achs">${ach}</div>
    ${hist ? `<h3 class="grp">📈 תספורות אחרונות</h3><ul class="hist">${hist}</ul>` : ''}`,
  {
    back,
    mount: (b) => {
      b.querySelectorAll('[data-ci]').forEach((el) => { const cv = drawCertificate(D.certificates[+el.dataset.ci]); cv.style.width = '100%'; el.appendChild(cv); });
      b.querySelectorAll('[data-dl]').forEach((el) => el.addEventListener('click', () => {
        const c = D.certificates[+el.dataset.dl];
        const a = document.createElement('a');
        a.href = drawCertificate(c).toDataURL('image/png');
        a.download = `barber-life-${c.id}.png`;
        a.click();
      }));
    },
  });
}

// ================================================================ init
function askName(after) {
  $('nameInput').value = D.profile.name || '';
  $('nameModal').classList.remove('hidden');
  setTimeout(() => $('nameInput').focus(), 50);
  const saveName = () => {
    const v = $('nameInput').value.trim();
    if (!v) { $('nameInput').focus(); return; }
    D.profile.name = v; progress.save();
    $('nameModal').classList.add('hidden');
    after?.();
  };
  $('nameSave').onclick = saveName;
  $('nameInput').onkeydown = (e) => { if (e.key === 'Enter') saveName(); };
}

export function initScreens() {
  Object.assign(GO, {
    lessons: () => openLessons(), lab: () => openLibrary('lab'), practice: openPractice, clients: openClients, daily: openDaily,
    library: () => openLibrary('browse'), dictionary: openDictionary, awards: openAwards,
  });
  ctx.goHub = goHub;
  ctx.showHub = showHub;
  ctx.openSheet = openSheet;
  ctx.enter3D = enter3D;
  ctx.startClient = startClient;
  ctx.clientRewards = clientRewards;
  ctx.registerHubCard = (card, fn) => { if (!CARDS.find((c) => c.go === card.go)) CARDS.push(card); GO[card.go] = fn; };
  session.bind();
  $('btnStart').addEventListener('click', () => {
    $('title').classList.remove('show');
    ctx.sound.unlock();
    const go = () => { if (ctx.startWorld) ctx.startWorld(); else showHub(); };
    if (!D.profile.name) askName(go); else { go(); ctx.toast(`ברוך שובך, ${D.profile.name}!`); }
  });
  $('btnHowTo').addEventListener('click', () => $('helpModal').classList.remove('hidden'));
  $('profileChip').addEventListener('click', () => askName(renderHub));
  const away = () => (ctx.returnTo === 'world' && ctx.world ? ctx.world.resume() : showHub());
  $('sheetBack').addEventListener('click', () => (sheetBackFn ? sheetBackFn() : away()));
  $('sheetClose').addEventListener('click', away);
  $('hubCity').addEventListener('click', () => ctx.world?.resume());
  $('btnHome').addEventListener('click', () => {
    if (session.active && session.cfg.kind !== 'view' && session.cfg.spec) {
      $('leaveText').textContent = 'העבודה הנוכחית לא תיבדק ולא תקבל עליה ניקוד.';
      $('leaveModal').classList.remove('hidden');
    } else { session.stop(); away(); }
  });
  $('leaveYes').addEventListener('click', () => {
    $('leaveModal').classList.add('hidden');
    const c = session.cfg?.client;
    session.stop();
    if (c && ctx.returnTo === 'world') ctx.onClientAbandoned?.();
    away();
  });
  $('clientChip').addEventListener('click', () => {
    if (session.active) { ctx.toast('בחירת ראש זמינה באימון חופשי. כרגע אתה בתוך משימה.'); return; }
    renderFreeList(); $('clientModal').classList.remove('hidden');
  });
  ctx.openAwards = openAwards;
  ctx.openDictionary = openDictionary;
  ctx.showReward = showReward;
  ctx.dialog = dialog;
  ctx.closeDialog = () => $('dialogModal').classList.add('hidden');
  ctx.showWorldHelp = () => $('worldHelp').classList.remove('hidden');
  progress.onChange((d, ev) => { if (ev?.achievement && ctx.state.phase === 'play') ctx.announce(ev.achievement); });
}

/** Generic dialog: { title, html, buttons: [{ label, primary, disabled, action }], mount(body) } */
function dialog({ title, html = '', buttons = [{ label: 'סגור', primary: true }], mount = null }) {
  $('dialogTitle').textContent = title;
  $('dialogBody').innerHTML = html;
  const bar = $('dialogButtons');
  bar.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = `btn ${b.primary ? 'primary' : 'ghost'}`;
    el.textContent = b.label;
    el.disabled = !!b.disabled;
    el.addEventListener('click', () => { $('dialogModal').classList.add('hidden'); b.action?.(); });
    bar.appendChild(el);
  }
  $('dialogModal').classList.remove('hidden');
  mount?.($('dialogBody'));
}

function renderFreeList() {
  const list = $('clientList');
  list.innerHTML = '';
  for (const k of ['daniel', 'yoni', 'avi', 'mannequin', 'mannequinWavy', 'mannequinCurly']) {
    const p = HAIR_PRESETS[k];
    const b = document.createElement('button');
    b.className = 'client-item' + (k === ctx.state.headKey ? ' active' : '');
    b.innerHTML = `<i class="sw" style="background:${p.color}"></i><span><b>${esc(p.name)}</b><small>${esc(p.hairType)} · עליון ${p.lengths.top} מ״מ · צדדים ${p.lengths.side} מ״מ</small></span>`;
    b.addEventListener('click', () => { $('clientModal').classList.add('hidden'); if (k !== ctx.state.headKey) { session.free(k); ctx.toast(`${p.name} — אימון חופשי`); } });
    list.appendChild(b);
  }
}

export { openHaircut, openLesson, openLibrary };
