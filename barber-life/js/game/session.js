// A cutting session: one haircut on one head (lab, practice, client, lesson task, challenge).
// Shows the task card, steps, demo, comparison with the professional result, and the analysis + tutor at the end.
import { ctx } from './context.js';
import { analyzeHaircut, CRITERIA } from './analysis.js';
import { targetLength, haircutSteps } from '../data/haircuts.js';
import { planDemo } from './demo.js';
import { resolveConstraints, clientFeedback } from '../data/clients.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const session = {
  cfg: null, elapsed: 0, hygiene: false, demoSnap: null, lastResult: null, cutStarted: false,

  get active() { return !!this.cfg; },

  /**
   * cfg: { kind, title, subtitle, spec, head: { preset, mannequin, skin, cape, seed }, client, allowDemo, allowCompare,
   *        hygiene (bool: require disinfection), zones, onEnd(result) -> {lines:[], passed?, next?} }
   */
  start(cfg) {
    this.cfg = cfg;
    this.elapsed = 0; this.hygiene = false; this.demoSnap = null; this.lastResult = null; this.cutStarted = false;
    const h = cfg.head;
    ctx.setupHead(h.preset, { mannequin: h.mannequin, skin: h.skin, cape: h.cape, seed: h.seed });
    if (cfg.spec) ctx.hair.setTarget((d) => targetLength(cfg.spec, d));
    this.constraints = cfg.client ? resolveConstraints(cfg.client.constraints, ctx.hair) : null;
    ctx.state.tapHandler = cfg.task?.onTap ? (hit) => cfg.task.onTap(hit) : null;
    ctx.cam.setView('work');
    ctx.setMode('cut');
    this._renderBar();
    $('sessionBar').classList.remove('hidden');
    document.body.classList.add('in-session');
    ctx.state.phase = 'play';
  },

  /** Free cutting with no target (phase-1 mode). */
  free(headId) {
    this.stop();
    ctx.setFreeHead(headId);
    ctx.cam.setView('work');
    ctx.state.phase = 'play';
  },

  stop() {
    ctx.demo?.stop();
    if (ctx.hair) { ctx.hair.setDisplay('mine'); ctx.hair.highlightZone(null); }
    ctx.state.tapHandler = null;
    ctx.cam?.setOverview(false);
    this.cfg = null;
    $('sessionBar').classList.add('hidden');
    $('resultModal').classList.add('hidden');
    document.body.classList.remove('in-session');
  },

  _renderBar() {
    const c = this.cfg;
    $('taskTitle').textContent = c.title;
    $('taskSub').textContent = c.subtitle || '';
    $('taskSub').classList.toggle('hidden', !c.subtitle);
    $('btnSteps').classList.toggle('hidden', !c.spec);
    $('btnDemo').classList.toggle('hidden', !c.allowDemo || !c.spec);
    $('cmpGroup').classList.toggle('hidden', !c.allowCompare || !c.spec);
    $('btnHygiene').classList.toggle('hidden', !c.hygiene);
    $('btnHygiene').classList.remove('done');
    $('btnHygiene').textContent = '🧴 חיטוי כלים';
    $('btnFinish').classList.toggle('hidden', !c.spec);
    $('btnRequest').classList.toggle('hidden', !c.client);
    $('btnCheck').classList.toggle('hidden', !c.task?.check);
    $('stepsList').classList.add('hidden');
    $('btnDemo').textContent = '▶ הדגמה';
    this._setCompare('mine');
    if (c.spec) $('stepsList').innerHTML = '<ol>' + haircutSteps(c.spec).map((s) => `<li>${esc(s)}</li>`).join('') + '</ol>';
  },

  _setCompare(mode) {
    if (!ctx.hair) return;
    if (mode === 'pro') { ctx.hair.setDisplay('pro'); if (ctx.state.mapMode === 2) ctx.setMap(0); }
    else { ctx.hair.setDisplay('mine'); ctx.setMap(mode === 'diff' ? 2 : ctx.state.mapMode === 2 ? 0 : ctx.state.mapMode); }
    document.querySelectorAll('[data-cmp]').forEach((b) => b.classList.toggle('active', b.dataset.cmp === mode));
    $('proBadge').classList.toggle('hidden', mode !== 'pro');
  },

  onMapChange(mode) {
    if (!this.cfg) return;
    document.querySelectorAll('[data-cmp]').forEach((b) => b.classList.toggle('active', b.dataset.cmp === (ctx.hair.display === 'pro' ? 'pro' : mode === 2 ? 'diff' : 'mine')));
  },

  onToolChange(id) { this.cfg?.task?.onTool?.(id); },

  /** Lesson tasks without a haircut (tap a zone, pick a tool/guard) report their result here. */
  taskDone(score, lines = [], good = []) {
    const res = { overall: Math.round(score), scores: {}, zones: [], good, bad: lines, fixes: [], elapsed: this.elapsed,
      grade: score >= 90 ? 'מצוין' : score >= 70 ? 'טוב' : 'כדאי לנסות שוב', stars: score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : 2 };
    this.lastResult = res;
    this._showResult(res);
  },

  setPrompt(text) { $('taskSub').textContent = text; $('taskSub').classList.remove('hidden'); },

  onCut() {
    if (this.cfg && !this.cutStarted) this.cutStarted = true;
  },

  onRegrow() { this.demoSnap = null; if (this.cfg) $('btnDemo').textContent = '▶ הדגמה'; },

  update(dt) {
    if (!this.cfg || ctx.state.phase !== 'play') return;
    if (this.cutStarted) this.elapsed += dt;
    const m = Math.floor(this.elapsed / 60), s = Math.floor(this.elapsed % 60);
    $('taskTimer').textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
  },

  onDemoProgress(p) {
    if (ctx.demo.active) $('btnDemo').textContent = `⏸ עצור הדגמה (${Math.round(p * 100)}%)`;
  },

  toggleDemo() {
    const d = ctx.demo;
    if (d.active) { d.stop(); this._restoreTools(this._prevTools); $('btnDemo').textContent = '↺ חזור לפני ההדגמה'; return; }
    if (this.demoSnap) {
      ctx.hair.restore(this.demoSnap); ctx.hair.updateScalp(); ctx.clippings.clear();
      this.demoSnap = null; $('btnDemo').textContent = '▶ הדגמה';
      ctx.toast('השיער חזר למצב שלפני ההדגמה — עכשיו תורך!');
      return;
    }
    this._setCompare('mine');
    this.demoSnap = ctx.hair.snapshot();
    const plan = planDemo(this.cfg.spec);
    ctx.toast(`הדגמה: ${plan.map((p) => p.label).join(' ← ')}`, 4000);
    const prev = this._prevTools = { tool: ctx.tools.active, guard: ctx.tools.guard.id, lever: ctx.tools.lever, len: ctx.tools.scissorLen };
    d.start(plan, {
      speed: 1,
      onStep: (s) => { ctx.refreshToolUI(); $('taskSub').textContent = `הדגמה: ${s.label}`; $('taskSub').classList.remove('hidden'); },
      onDone: () => {
        $('btnDemo').textContent = '↺ חזור לפני ההדגמה';
        $('taskSub').textContent = this.cfg?.subtitle || '';
        this._restoreTools(prev);
        ctx.toast('ההדגמה הסתיימה. סובב את הראש והסתכל מכל הצדדים, ואז "חזור לפני ההדגמה" ונסה בעצמך.', 4200);
      },
    });
  },

  _restoreTools(p) {
    if (!p) return;
    ctx.tools.setGuard(p.guard); ctx.tools.setLever(p.lever); ctx.tools.scissorLen = p.len;
    ctx.selectTool(p.tool, true);
  },

  disinfect() {
    if (this.hygiene) return;
    this.hygiene = true;
    $('btnHygiene').classList.add('done');
    $('btnHygiene').textContent = '✅ הכלים חוטאו';
    ctx.toast('🧴 ריססת וניגבת את המכונה, הלהבים והמסרקים. עבודה נקייה ובטוחה!');
  },

  analyze() {
    const c = this.cfg;
    ctx.demo.stop();
    this._setCompare('mine');
    const res = analyzeHaircut(ctx.hair, c.spec, {
      zones: c.zones,
      constraints: this.constraints,
      understood: c.client ? c.understood : undefined,
      capeHair: c.client && !c.head.mannequin ? ctx.clippings.countOnClient() : null,
      hygiene: c.hygiene ? this.hygiene : null,
    });
    res.elapsed = this.elapsed;
    if (c.client) res.feedback = clientFeedback(c.client, res);
    this.lastResult = res;
    return res;
  },

  finish() {
    if (!this.cfg) return;
    if (ctx.demo.active) { ctx.toast('עצור קודם את ההדגמה'); return; }
    const res = this.analyze();
    this._showResult(res);
  },

  _showResult(res) {
    const c = this.cfg;
    const pct = (v) => Math.round(v * 100);
    const bars = Object.entries(res.scores).filter(([, v]) => v != null).map(([k, v]) => `
      <div class="crit"><span>${CRITERIA[k].icon} ${CRITERIA[k].name}</span>
      <div class="cbar"><i style="width:${pct(v)}%;background:${v >= 0.85 ? '#3ecf6b' : v >= 0.65 ? '#e8c14a' : '#e35b4f'}"></i></div><b>${pct(v)}</b></div>`).join('');
    const list = (title, items, cls) => items.length ? `<div class="fb ${cls}"><h4>${title}</h4><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '';
    const fb = res.feedback ? `<div class="client-say"><span class="mood">${res.feedback.mood}</span><div><b>${esc(c.client.name)} מסתכל במראה:</b><p>“${esc(res.feedback.text)}”</p><div class="stars">${'★'.repeat(res.feedback.stars)}${'☆'.repeat(5 - res.feedback.stars)}</div></div></div>` : '';
    const zones = res.zones.map((z) => `<tr class="${z.ok ? 'ok' : z.err > 0 ? 'long' : 'short'}"><td>${z.name}</td><td>${z.mL.toFixed(1)}</td><td>${z.mT.toFixed(1)}</td><td>${z.ok ? '✓' : (z.err > 0 ? '+' : '') + z.err.toFixed(1)}</td></tr>`).join('');
    const rec = res.recommend && ctx.lessonTitle ? ctx.lessonTitle(res.recommend) : null;
    const preview = c.preview ? c.preview(res) : '';
    $('resultBody').innerHTML = `
      <div class="score-head"><div class="big-score ${res.overall >= 80 ? 'good' : res.overall >= 60 ? 'mid' : 'low'}">${res.overall}</div>
        <div><div class="grade">${res.grade}</div><div class="stars">${'★'.repeat(res.stars)}${'☆'.repeat(5 - res.stars)}</div>
        <div class="muted small">${esc(c.title)} · זמן עבודה ${Math.floor(res.elapsed / 60)}:${String(Math.floor(res.elapsed % 60)).padStart(2, '0')}</div></div></div>
      ${fb}
      <div class="crits">${bars}</div>
      ${preview}
      ${list('👍 מה עשית טוב', res.good, 'good')}
      ${list('⚠️ מה פחות טוב / איפה היו טעויות', res.bad, 'bad')}
      ${list('🛠️ איך לתקן', res.fixes, 'fix')}
      <details class="zones"><summary>אורך לפי אזור (מ״מ): שלך מול המקצועי</summary>
        <table><tr><th>אזור</th><th>שלך</th><th>מקצועי</th><th>הפרש</th></tr>${zones}</table></details>
      ${rec ? `<div class="rec">📚 השיעור המומלץ הבא: <b>${esc(rec)}</b> <button class="btn ghost sm" id="btnRec">לשיעור</button></div>` : ''}`;
    $('btnRetry').classList.toggle('hidden', !!c.client || !c.spec);
    $('btnCompare').classList.toggle('hidden', !c.spec);
    $('btnContinue').classList.toggle('hidden', !c.spec);
    $('resultModal').classList.remove('hidden');
    $('btnRec')?.addEventListener('click', () => { const id = res.recommend; this.end(); ctx.openLesson?.(id); });
  },

  /** Ends the session: rewards are handed out by the mode (onEnd) for the latest result. */
  end() {
    const c = this.cfg;
    if (!c) return;
    const res = this.lastResult;
    $('resultModal').classList.add('hidden');
    const out = res && c.onEnd ? c.onEnd(res) : null;
    this.stop();
    ctx.goHub?.(out);
  },

  retry() {
    $('resultModal').classList.add('hidden');
    ctx.hair.regrow(); ctx.hair.updateScalp(); ctx.clippings.clear(); ctx.state.undo.length = 0;
    this.elapsed = 0; this.cutStarted = false; this.demoSnap = null; $('btnDemo').textContent = '▶ הדגמה';
    ctx.toast('ראש חדש — נסה שוב. אין לחץ, מתרגלים עד שזה יוצא.');
  },

  bind() {
    $('btnFinish').addEventListener('click', () => this.finish());
    $('btnDemo').addEventListener('click', () => this.toggleDemo());
    $('btnSteps').addEventListener('click', () => $('stepsList').classList.toggle('hidden'));
    $('taskSub').addEventListener('click', () => $('taskSub').classList.toggle('expanded'));
    $('btnHygiene').addEventListener('click', () => this.disinfect());
    $('btnRequest').addEventListener('click', () => ctx.showRequest?.(this.cfg.client, true));
    document.querySelectorAll('[data-cmp]').forEach((b) => b.addEventListener('click', () => this._setCompare(b.dataset.cmp)));
    $('btnContinue').addEventListener('click', () => { $('resultModal').classList.add('hidden'); ctx.toast('המשך לתקן. כשתסיים לחץ שוב "סיום ובדיקה".'); });
    $('btnCompare').addEventListener('click', () => { $('resultModal').classList.add('hidden'); this._setCompare('diff'); ctx.cam.setView('back'); ctx.toast('ירוק = אורך נכון, אדום = ארוך מדי, כחול = קצר מדי. לחץ "מקצועי" לראות את התוצאה הרצויה.', 4500); });
    $('btnRetry').addEventListener('click', () => this.retry());
    $('btnEnd').addEventListener('click', () => this.end());
    $('btnCheck').addEventListener('click', () => this.cfg?.task?.check?.());
  },
};
