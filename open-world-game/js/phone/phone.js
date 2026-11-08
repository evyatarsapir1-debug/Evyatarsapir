// The in-game smartphone. Opens/closes from the phone button (or N). Every app works:
// map + GPS, contacts (real calls with actions), messages with replies, camera + gallery,
// radio, missions, my cars, and phone settings.
import { CONTACTS, MISSIONS } from '../game/missions.js';
import { STATIONS, ringtone } from '../core/audio.js';
import { fmt } from '../game/economy.js';
import { drawLandmarks } from '../ui/minimap.js';

const ICONS = {
  map: '<path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z" fill="none" stroke="#fff" stroke-width="2"/><path d="M9 4v14M15 6v14" stroke="#fff" stroke-width="2"/>',
  contacts: '<circle cx="12" cy="9" r="4" fill="#fff"/><path d="M4 21c1-5 15-5 16 0" fill="#fff"/>',
  messages: '<path d="M3 5h18v11H8l-5 4z" fill="#fff"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="3" fill="#fff"/><circle cx="12" cy="13.5" r="4" fill="#3a3f4a"/><rect x="8" y="4" width="8" height="4" rx="1" fill="#fff"/>',
  music: '<path d="M9 18V5l11-2v13" fill="none" stroke="#fff" stroke-width="2"/><circle cx="6.5" cy="18" r="3" fill="#fff"/><circle cx="17.5" cy="16" r="3" fill="#fff"/>',
  missions: '<path d="M12 2l3 7 7 .6-5.3 4.6L18.4 21 12 17l-6.4 4 1.7-6.8L2 9.6 9 9z" fill="#fff"/>',
  cars: '<path d="M3 15l2-6h14l2 6v4H3z" fill="#fff"/><circle cx="7" cy="19" r="2" fill="#3a3f4a"/><circle cx="17" cy="19" r="2" fill="#3a3f4a"/>',
  flight: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="#fff"/>',
  settings: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" stroke="#fff" stroke-width="2.4"/>',
};
const APPS = [
  ['map', 'מפה', '#2fa36b'], ['contacts', 'אנשי קשר', '#3f8cff'], ['messages', 'הודעות', '#34c759'], ['camera', 'מצלמה', '#5b6170'],
  ['music', 'מוסיקה', '#ff375f'], ['missions', 'משימות', '#ff9f0a'], ['cars', 'הרכבים שלי', '#8e5cf7'], ['flight', 'אימון טיסה', '#0a84ff'], ['settings', 'הגדרות', '#6e7480'],
];
const WALLS = ['linear-gradient(160deg,#1d2b64,#f8cdda)', 'linear-gradient(160deg,#0f2027,#2c5364)', 'linear-gradient(160deg,#ff7e5f,#2b1055)', 'linear-gradient(160deg,#134e5e,#71b280)'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Phone {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('phone');
    this.screen = this.el.querySelector('.pscreen');
    this.time = this.el.querySelector('.ptime');
    this.badge = document.getElementById('phoneBadge');
    this.open = false;
    this.app = 'home';
    this.settings = { ring: 0, bright: 1, wall: 0, sounds: true };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('azura_phone') || '{}')); } catch { /* private mode */ }
    try { this.photos = JSON.parse(localStorage.getItem('azura_photos') || '[]'); } catch { this.photos = []; }
    this.el.querySelector('.phome').onclick = () => this.show('home');
    this.el.querySelector('.pclose').onclick = () => this.toggle(false);
    this.mapView = null;
    this._applySettings();
  }
  _save() { try { localStorage.setItem('azura_phone', JSON.stringify(this.settings)); } catch { /* ignore */ } }
  _applySettings() {
    this.el.querySelector('.pframe').style.filter = `brightness(${this.settings.bright})`;
    this.screen.style.background = WALLS[this.settings.wall];
  }
  toggle(on = !this.open) {
    this.open = on;
    this.el.classList.toggle('show', on);
    if (on) this.show(this.app === 'call' ? 'home' : this.app);
  }
  notify(title, text) {
    if (this.settings.sounds) ringtone(this.game.audio, this.settings.ring, true);
    this.game.toast(`${title}: ${text}`, 3.5);
    this._badge();
    if (this.open && this.app === 'messages') this.show('messages', this.thread);
  }
  _badge() {
    const n = Object.values(this.game.missions.unread).reduce((a, b) => a + b, 0);
    this.badge.textContent = n; this.badge.style.display = n ? 'flex' : 'none';
  }
  tick() {
    if (this.time) this.time.textContent = this.game.env.clockText;
    if (this.open && this.app === 'map') this._drawMap();
    if (this.open && this.app === 'missions' && this.game.missions.timer !== null) {
      const t = this.screen.querySelector('.mtimer'); if (t) t.textContent = `נותרו ${Math.ceil(this.game.missions.timer)} שניות`;
    }
  }

  // ------------------------------------------------------------------ screens
  show(app, arg) {
    this.app = app;
    const s = this.screen;
    s.onclick = null;
    const head = (title, back = 'home') => `<div class="phead"><button class="pback" data-go="${back}" type="button">‹</button><b>${title}</b><span></span></div>`;
    const bind = () => {
      s.querySelectorAll('[data-go]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); this.show(b.dataset.go, b.dataset.arg); }; });
    };
    const g = this.game, M = g.missions;
    switch (app) {
      case 'home': {
        s.innerHTML = `<div class="pwidget"><div class="pclock">${g.env.clockText}</div><div>${g.env.weatherName} · ${fmt(g.econ.money)}</div></div>
          <div class="pgrid">${APPS.map(([id, name, col]) => `<button class="papp" data-go="${id}" type="button"><span class="pico" style="background:${col}"><svg viewBox="0 0 24 24">${ICONS[id]}</svg>${id === 'messages' && Object.values(M.unread).some((x) => x) ? '<i class="pdot"></i>' : ''}</span>${name}</button>`).join('')}</div>`;
        break;
      }
      case 'map': {
        const places = g.places();
        s.innerHTML = head('מפה ו־GPS') + `<canvas class="pmap" width="560" height="560"></canvas>
          <div class="pmapbar"><button type="button" class="pbtn" data-act="me">אני</button><button type="button" class="pbtn" data-act="zin">+</button><button type="button" class="pbtn" data-act="zout">−</button>
          ${g.gps.dest ? `<button type="button" class="pbtn warn" data-act="clear">✕ בטל סימון</button>` : ''}</div>
          <div class="pinfo">${g.gps.dest ? `יעד: <b>${esc(g.gps.dest.name || 'נקודה במפה')}</b> · ${(g.gps.remaining(g.playerPos().x, g.playerPos().z) / 1000).toFixed(2)} ק״מ` : 'הקש על המפה כדי לבחור יעד, או בחר מהרשימה'}</div>
          <div class="plist">${places.map((p, i) => `<button type="button" class="prow" data-place="${i}"><b>${esc(p.name)}</b><small>${(Math.hypot(p.x - g.playerPos().x, p.z - g.playerPos().z) / 1000).toFixed(1)} ק״מ</small></button>`).join('')}</div>`;
        const pos = g.playerPos();
        this.mapView ||= { x: pos.x, z: pos.z, scale: 0.35 };
        if (arg !== 'keep') { this.mapView.x = pos.x; this.mapView.z = pos.z; }
        const cv = s.querySelector('.pmap');
        this._mapEvents(cv);
        s.querySelectorAll('[data-place]').forEach((b) => { b.onclick = () => { const p = places[+b.dataset.place]; this._go(p); }; });
        s.querySelectorAll('[data-act]').forEach((b) => {
          b.onclick = () => {
            const a = b.dataset.act, v = this.mapView;
            if (a === 'me') { v.x = g.playerPos().x; v.z = g.playerPos().z; }
            if (a === 'zin') v.scale = Math.min(2, v.scale * 1.5);
            if (a === 'zout') v.scale = Math.max(0.15, v.scale / 1.5);
            if (a === 'clear') { g.gps.clear(); this.show('map', 'keep'); return; }
            this._drawMap();
          };
        });
        this._drawMap();
        break;
      }
      case 'contacts':
        s.innerHTML = head('אנשי קשר') + `<div class="plist">${Object.entries(CONTACTS).map(([id, c]) => `<button type="button" class="prow" data-go="call" data-arg="${id}"><span class="pav" style="background:${c.color}">${c.name[0]}</span><span><b>${c.name}</b><small>${c.role}</small></span><span class="pcall">חייג</span></button>`).join('')}</div>`;
        break;
      case 'call': this._call(arg); return;
      case 'messages': {
        this.thread = arg;
        if (!arg) {
          const ids = Object.keys(CONTACTS).filter((id) => M.threads[id]?.length);
          s.innerHTML = head('הודעות') + `<div class="plist">${ids.length ? ids.map((id) => { const t = M.threads[id], last = t[t.length - 1]; return `<button type="button" class="prow" data-go="messages" data-arg="${id}"><span class="pav" style="background:${CONTACTS[id].color}">${CONTACTS[id].name[0]}</span><span><b>${CONTACTS[id].name}</b><small>${esc(last.text).slice(0, 42)}</small></span>${M.unread[id] ? `<i class="pcount">${M.unread[id]}</i>` : ''}</button>`; }).join('') : '<div class="pempty">אין הודעות עדיין</div>'}</div>`;
        } else {
          M.unread[arg] = 0; this._badge();
          const t = M.threads[arg] || [], rep = M.replies[arg] || [];
          const quick = rep.length ? rep : [{ text: 'מה נשמע?' }, { text: 'תודה!' }];
          s.innerHTML = head(CONTACTS[arg].name, 'messages') + `<div class="pchat">${t.map((m) => `<div class="pmsg ${m.from}">${esc(m.text)}</div>`).join('')}</div>
            <div class="preplies">${quick.map((r, i) => `<button type="button" class="pchip" data-r="${i}">${esc(r.text)}</button>`).join('')}</div>`;
          const chat = s.querySelector('.pchat'); chat.scrollTop = chat.scrollHeight;
          s.querySelectorAll('[data-r]').forEach((b) => {
            b.onclick = () => {
              const i = +b.dataset.r;
              if (rep.length) M.reply(arg, i);
              else { M.message(arg, quick[i].text, 'me'); setTimeout(() => M.message(arg, this._smallTalk(arg)), 1200); }
              this.show('messages', arg);
              setTimeout(() => { if (this.open && this.app === 'messages' && this.thread === arg) this.show('messages', arg); }, 1500);
            };
          });
        }
        break;
      }
      case 'camera': {
        s.innerHTML = head('מצלמה') + `<button type="button" class="pbig" data-act="shoot">פתח מצלמה וצלם</button>
          <div class="pgal">${this.photos.length ? this.photos.map((p, i) => `<img src="${p.src}" data-i="${i}" alt="תמונה ${i + 1}">`).join('') : '<div class="pempty">הגלריה ריקה</div>'}</div>`;
        s.querySelector('[data-act="shoot"]').onclick = () => this._viewfinder();
        s.querySelectorAll('.pgal img').forEach((im) => { im.onclick = () => this._photo(+im.dataset.i); });
        break;
      }
      case 'music': {
        const r = g.radio;
        s.innerHTML = head('מוסיקה') + `<div class="plist">${STATIONS.map((st, i) => `<button type="button" class="prow ${g.selectedStation === i ? 'on' : ''}" data-st="${i}"><span class="pav" style="background:${['#ff375f', '#30b0c7', '#8e5c2c'][i]}">♪</span><span><b>${st.name}</b><small>${st.genre} · ${st.bpm} BPM</small></span><span class="pcall">${g.selectedStation === i ? (r.station === i ? 'מתנגן' : 'נבחר') : 'נגן'}</span></button>`).join('')}
          <button type="button" class="prow" data-st="-1"><span class="pav" style="background:#555">■</span><span><b>כבה רדיו</b></span></button></div>
          <label class="prange">עוצמה<input type="range" min="0" max="1" step="0.05" value="${r.volume}" id="radioVol"></label>
          <label class="prange"><input type="checkbox" id="radioFoot" ${g.radioOnFoot ? 'checked' : ''}> לנגן גם כשהולכים ברגל</label>
          <div class="pinfo">הרדיו מתנגן אוטומטית כשנכנסים לרכב.</div>`;
        s.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { const i = +b.dataset.st; g.selectStation(i); this.show('music'); }; });
        s.querySelector('#radioVol').oninput = (e) => r.setVolume(+e.target.value);
        s.querySelector('#radioFoot').onchange = (e) => { g.radioOnFoot = e.target.checked; };
        break;
      }
      case 'missions': {
        const act = M.def();
        const rows = MISSIONS.map((m) => {
          const st = M.state[m.id];
          if (!st) return `<div class="prow dim"><span class="pav" style="background:#444">?</span><span><b>משימה נעולה</b><small>תיפתח בהמשך</small></span></div>`;
          const tag = st === 'done' ? '<span class="ptag ok">הושלמה</span>' : st === 'active' ? '<span class="ptag">פעילה</span>' : `<button type="button" class="pcall" data-acc="${m.id}">התחל</button>`;
          return `<div class="prow"><span class="pav" style="background:${CONTACTS[m.giver].color}">${CONTACTS[m.giver].name[0]}</span><span><b>${m.title}</b><small>${CONTACTS[m.giver].name} · ${fmt(m.reward)}</small></span>${tag}</div>`;
        }).join('');
        s.innerHTML = head('משימות') + (act ? `<div class="pcard"><b>${act.title}</b><div>${M.objective().text}</div>${M.timer !== null ? '<div class="mtimer"></div>' : ''}
          <div class="pmapbar"><button type="button" class="pbtn" data-act="nav">נווט ליעד</button><button type="button" class="pbtn warn" data-act="quit">וותר</button></div></div>` : '<div class="pinfo">אין משימה פעילה</div>') + `<div class="plist">${rows}</div>`;
        s.querySelectorAll('[data-acc]').forEach((b) => { b.onclick = () => { M.accept(b.dataset.acc); this.show('missions'); }; });
        const nav = s.querySelector('[data-act="nav"]'); if (nav) nav.onclick = () => { M._target(); this.show('map'); };
        const quit = s.querySelector('[data-act="quit"]'); if (quit) quit.onclick = () => { M.abandon(); this.show('missions'); };
        break;
      }
      case 'flight': {
        // flight school: take off, fly through rings over the sea, land - with the assistance buttons
        const F = g.flight, done = g.econ.flightSchool || 0;
        s.innerHTML = head('אימון טיסה') + `<div class="pcard"><b>🎓 בית הספר לטיסה</b><div>המראה, מעבר דרך 4 טבעות מעל הים ונחיתה על המסלול. כפתורי "המראה אוטומטית", "נחיתה מסייעת" ו"יציב" עוזרים בכל שלב.${done ? `<br>סיימת ${done} אימונים ✔` : '<br>פרס על הסיום הראשון: ₪1,000'}</div></div>
          <div class="plist"><button type="button" class="pbtn" data-tr="jet">✈️ אימון במטוס נוסעים · נמל התעופה</button><button type="button" class="pbtn" data-tr="fighter">🛩️ אימון במטוס קרב · הבסיס הצבאי</button>
          ${F.train ? '<button type="button" class="pbtn warn" data-tr="stop">הפסק את האימון</button>' : ''}</div>
          <div class="pinfo">שליטה: ג׳ויסטיק/חצים = פנייה וגובה · גז / האט = מהירות · מצלמה = תא טייס או מבחוץ</div>`;
        s.querySelectorAll('[data-tr]').forEach((b) => { b.onclick = () => { const k = b.dataset.tr; if (k === 'stop') { F.stopTraining(); this.show('flight'); return; } this.toggle(false); F.startTraining(k); }; });
        break;
      }
      case 'cars': {
        const cars = [...g.vehicles.kept].sort((a, b) => (b.owned ? 1 : 0) - (a.owned ? 1 : 0));
        const pos = g.playerPos();
        s.innerHTML = head('הרכבים שלי') + `<div class="plist">${cars.length ? cars.map((v, i) => `<div class="prow"><span class="pav" style="background:#${v.parts.baseColor.getHexString()}"></span><span><b>${v.T.name}${v.owned ? ' · בבעלותך' : ''}</b><small>${v.driver === 'player' ? 'אתה בתוכו' : `${Math.round(Math.hypot(v.x - pos.x, v.z - pos.z))} מ׳ · נזק ${Math.round(v.damage)}%`}</small></span>
          ${v.driver === 'player' ? '' : `<span class="pbtns"><button type="button" class="pcall" data-nav="${i}">נווט</button><button type="button" class="pcall" data-bring="${i}">הבא אליי ₪200</button></span>`}</div>`).join('') : '<div class="pempty">עוד אין לך רכבים. כל רכב שנהגת בו נשמר כאן.</div>'}</div>`;
        s.querySelectorAll('[data-nav]').forEach((b) => { b.onclick = () => { const v = cars[+b.dataset.nav]; g.gps.set({ x: v.x, z: v.z, name: v.T.name, radius: 6 }, g.playerPos()); this.show('map'); }; });
        s.querySelectorAll('[data-bring]').forEach((b) => { b.onclick = () => { const v = cars[+b.dataset.bring]; const m = g.deliverVehicle(v); g.toast(m, 3); this.show('cars'); }; });
        break;
      }
      case 'settings': {
        const st = this.settings;
        s.innerHTML = head('הגדרות') + `<div class="pset">
          <label>צלצול <select id="pRing">${['צלילי לוס אנטוס', 'קלאסי', 'נצנוץ'].map((n, i) => `<option value="${i}" ${st.ring === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <button type="button" class="pbtn" id="pRingTest">השמע צלצול</button>
          <label>בהירות <input type="range" id="pBright" min="0.5" max="1.2" step="0.05" value="${st.bright}"></label>
          <label>רקע</label><div class="pwalls">${WALLS.map((w, i) => `<button type="button" class="pwall ${st.wall === i ? 'on' : ''}" data-w="${i}" style="background:${w}" aria-label="רקע ${i + 1}"></button>`).join('')}</div>
          <label><input type="checkbox" id="pSounds" ${st.sounds ? 'checked' : ''}> צליל התראות</label></div>`;
        s.querySelector('#pRing').onchange = (e) => { st.ring = +e.target.value; this._save(); ringtone(g.audio, st.ring); };
        s.querySelector('#pRingTest').onclick = () => ringtone(g.audio, st.ring);
        s.querySelector('#pBright').oninput = (e) => { st.bright = +e.target.value; this._applySettings(); this._save(); };
        s.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => { st.wall = +b.dataset.w; this._applySettings(); this._save(); this.show('settings'); }; });
        s.querySelector('#pSounds').onchange = (e) => { st.sounds = e.target.checked; this._save(); };
        break;
      }
    }
    bind();
  }

  _go(p) {
    const g = this.game;
    const r = g.gps.set({ x: p.x, z: p.z, name: p.name, radius: p.radius || 14 }, g.playerPos());
    g.toast(r ? `מסלול ל${p.name}: ${(r.length / 1000).toFixed(1)} ק״מ` : `יעד נקבע: ${p.name}`, 2.5);
    this.show('map', 'keep');
  }

  // ------------------------------------------------------------------ map
  _mapEvents(cv) {
    const pts = new Map();
    let moved = 0, pinch = 0;
    const toWorld = (ev) => {
      const r = cv.getBoundingClientRect(), v = this.mapView;
      const px = (ev.clientX - r.left) / r.width * cv.width, pz = (ev.clientY - r.top) / r.height * cv.height;
      return { x: v.x + (px - cv.width / 2) / (v.scale * 2), z: v.z + (pz - cv.height / 2) / (v.scale * 2) };
    };
    cv.onpointerdown = (e) => { e.stopPropagation(); cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) moved = 0; pinch = 0; };
    cv.onpointermove = (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const r = cv.getBoundingClientRect();
      if (pts.size === 1) {
        const k = cv.width / r.width / (this.mapView.scale * 2);
        this.mapView.x -= (e.clientX - prev[0]) * k; this.mapView.z -= (e.clientY - prev[1]) * k;
        moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]);
      } else {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.mapView.scale = Math.max(0.15, Math.min(2, this.mapView.scale * d / pinch));
        pinch = d; moved = 99;
      }
      this._drawMap();
    };
    cv.onpointerup = (e) => {
      if (pts.size === 1 && moved < 8) { const w = toWorld(e); this._go({ x: w.x, z: w.z, name: 'נקודה במפה', radius: 15 }); }
      pts.delete(e.pointerId); pinch = 0;
    };
    cv.onpointercancel = (e) => { pts.delete(e.pointerId); pinch = 0; };
    cv.onwheel = (e) => { e.preventDefault(); this.mapView.scale = Math.max(0.15, Math.min(2, this.mapView.scale * (e.deltaY < 0 ? 1.2 : 0.83))); this._drawMap(); };
  }
  _drawMap() {
    const cv = this.screen.querySelector('.pmap'); if (!cv) return;
    const g = this.game, ctx = cv.getContext('2d'), v = this.mapView, mm = g.minimap;
    const s = v.scale * 2; // canvas px per meter
    const R = cv.width / 2 / s;
    ctx.save();
    ctx.fillStyle = '#8fb873'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.scale(s / 0.5, s / 0.5); // tiles are 0.5 px per meter
    mm._drawArea(ctx, v.x - R, v.z - R, v.x + R, v.z + R, v.x, v.z);
    ctx.restore();
    const W = (x, z) => [cv.width / 2 + (x - v.x) * s, cv.height / 2 + (z - v.z) * s];
    const route = g.gps.route?.points;
    if (route) {
      ctx.strokeStyle = '#b35cff'; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath();
      route.forEach(([x, z], i) => { const [a, b] = W(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
    }
    drawLandmarks(ctx, g.landmarks(), W, 17, v.scale > 0.12);
    if (g.gps.dest) { const [a, b] = W(g.gps.dest.x, g.gps.dest.z); ctx.fillStyle = '#b35cff'; ctx.beginPath(); ctx.arc(a, b, 10, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); }
    const p = g.playerPos(); const [a, b] = W(p.x, p.z);
    ctx.save(); ctx.translate(a, b); ctx.rotate(-p.facing + Math.PI);
    ctx.fillStyle = '#ff3b30'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 11); ctx.lineTo(0, 5); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ calls
  _call(id) {
    const c = CONTACTS[id], g = this.game, s = this.screen;
    this.app = 'call';
    ringtone(g.audio, this.settings.ring, true);
    s.innerHTML = `<div class="pcallscr"><span class="pav big" style="background:${c.color}">${c.name[0]}</span><b>${c.name}</b><small class="pstate">מחייג...</small>
      <div class="pline"></div><div class="pacts"></div><button type="button" class="pend">נתק</button></div>`;
    s.querySelector('.pend').onclick = () => this.show('contacts');
    setTimeout(() => {
      if (this.app !== 'call') return;
      s.querySelector('.pstate').textContent = 'בשיחה';
      const { line, actions } = g.callContact(id);
      s.querySelector('.pline').textContent = line;
      const box = s.querySelector('.pacts');
      for (const a of actions) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pbtn'; b.textContent = a.text;
        b.onclick = () => { const r = a.run(); s.querySelector('.pline').textContent = r || ''; box.innerHTML = ''; };
        box.appendChild(b);
      }
    }, 1300);
  }

  _smallTalk(id) {
    const lines = {
      roni: ['הכל טוב! מתי נצא לסיבוב?', 'ראית את המטוסים ממריאים מהשדה? מטורף.', 'תבדוק את המשימות בטלפון 😉'],
      mom: ['אכלת היום?', 'תתקשר יותר!', 'אל תנהג מהר מדי.'],
      falafel: ['פתוחים עד חצות!', 'מנה גדולה בדרך?'],
      mechanic: ['הרכב שלך צריך טיפול? בוא למוסך.', 'אני יכולה לשלוח גרר בכל רגע.'],
      taxi: ['המוניות שלנו זמינות 24/7.'],
      airport: ['לוח הטיסות מתעדכן בטרמינל.'],
    }[id] || ['👍'];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  // ------------------------------------------------------------------ camera
  _viewfinder() {
    const g = this.game;
    this.toggle(false);
    const cam = document.getElementById('camOverlay');
    cam.classList.add('show');
    document.getElementById('hud').classList.add('hidden');
    cam.querySelector('.cshoot').onclick = () => {
      const src = g.takePhoto();
      cam.classList.add('flash'); setTimeout(() => cam.classList.remove('flash'), 180);
      if (src) {
        this.photos.unshift({ src, t: g.env.clockText });
        this.photos.length = Math.min(this.photos.length, 9);
        try { localStorage.setItem('azura_photos', JSON.stringify(this.photos)); } catch { this.photos.pop(); }
      }
    };
    cam.querySelector('.cdone').onclick = () => {
      cam.classList.remove('show');
      document.getElementById('hud').classList.remove('hidden');
      this.toggle(true); this.show('camera');
    };
  }
  _photo(i) {
    const p = this.photos[i], s = this.screen;
    s.innerHTML = `<div class="phead"><button class="pback" type="button">‹</button><b>תמונה · ${p.t}</b><button class="pdel" type="button">מחק</button></div><img class="pfull" src="${p.src}" alt="תמונה">`;
    s.querySelector('.pback').onclick = () => this.show('camera');
    s.querySelector('.pdel').onclick = () => { this.photos.splice(i, 1); try { localStorage.setItem('azura_photos', JSON.stringify(this.photos)); } catch { /* ignore */ } this.show('camera'); };
  }
}
