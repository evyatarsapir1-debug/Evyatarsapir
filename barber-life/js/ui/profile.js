// Player profile: level and XP, career, money, stats, missions, unlocked equipment and barbershops, achievements.
import { ctx } from '../game/context.js';
import { progress, RANKS, ACHIEVEMENTS } from '../game/progress.js';
import { LESSONS } from '../data/lessons.js';
import { HAIRCUTS } from '../data/haircuts.js';
import { SHOPS, CAREER, CARS, HOMES } from '../world/worldData.js';
import { QUESTS } from '../world/quests.js';
import { CATALOG } from '../game/shopManager.js';

const D = progress.data;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function openProfile(back) {
  const life = ctx.life, s = life?.state;
  const r = progress.rank, nx = progress.nextRank;
  const pct = nx ? Math.round((D.xp - r.xp) / (nx.xp - r.xp) * 100) : 100;
  const passed = LESSONS.filter((l) => progress.lessonPassed(l.id)).length;
  const learned = HAIRCUTS.filter((h) => D.haircuts[h.id]?.learned).length;
  const career = life ? life.career() : CAREER[0];
  const brs = s ? Object.values(s.branches) : [];
  const done = s?.quests || {};
  const owned = new Set();
  for (const br of brs) for (const k of Object.keys(br.items || {})) if (br.items[k]) owned.add(k);
  for (const k of Object.keys(D.shop?.items || {})) if (D.shop.items[k]) owned.add(k);
  const equip = CATALOG.filter((it) => it.cat === 'equipment' || it.cat === 'furniture');
  const equipHtml = equip.map((it) => `<div class="unlock ${owned.has(it.id) ? 'got' : ''}"><b>${owned.has(it.id) ? (it.cat === 'equipment' ? '🧰' : '🪑') : '🔒'}</b><span>${esc(it.name)}</span><small>${owned.has(it.id) ? 'בבעלותך' : `${it.price ?? ''} 🪙`}</small></div>`).join('');
  const shopsHtml = SHOPS.map((sh) => {
    const open = r.id >= sh.needRank;
    return `<div class="unlock ${open ? 'got' : ''}"><b>${open ? '✂️' : '🔒'}</b><span>${esc(sh.name)}</span><small>${open ? (s?.job?.shopId === sh.id ? 'העבודה שלך' : 'פתוחה לעבודה') : `דרגה ${sh.needRank}: ${RANKS[sh.needRank - 1].name}`}</small></div>`;
  }).join('');
  const quest = QUESTS.map((q) => `<li class="${q.id in done ? 'ok' : ''}">${q.id in done ? '✅' : '⬜'} ${q.icon} ${esc(q.title)} <small class="muted">+${q.reward.xp} XP${q.reward.coins ? ` · +${q.reward.coins} 🪙` : ''}</small></li>`).join('');
  const ach = ACHIEVEMENTS.map((a) => `<div class="ach ${D.achievements[a.id] ? 'got' : ''}" title="${esc(a.desc)}"><b>${D.achievements[a.id] ? '🏆' : '🔒'}</b><span>${esc(a.name)}</span><small>${esc(a.desc)}</small></div>`).join('');
  ctx.openSheet('👤 הפרופיל שלי', `
    <div class="profile-head">
      <div class="p-avatar">💈</div>
      <div class="p-main"><h3>${esc(D.profile.name || 'ספר/ית')}</h3>
        <div class="p-level">רמה ${r.id}: <b>${r.name}</b>${nx ? ` · הבאה: ${nx.name}` : ' · רמה מקסימלית'}</div>
        <div class="xpbar big"><i style="width:${pct}%"></i></div><small class="muted">${D.xp} XP${nx ? ` / ${nx.xp}` : ''}</small>
      </div>
    </div>
    <div class="p-stats">
      <div><b>${D.coins.toLocaleString('he-IL')}</b><small>🪙 מטבעות</small></div>
      <div><b>${career.id}/7</b><small>💼 ${esc(career.name)}</small></div>
      <div><b>${passed}/100</b><small>📚 שיעורים</small></div>
      <div><b>${learned}</b><small>✂️ תספורות שנלמדו</small></div>
      <div><b>${D.stats.clients}</b><small>💬 לקוחות</small></div>
      <div><b>${D.certificates.length}</b><small>🎓 תעודות</small></div>
      <div><b>${brs.length}</b><small>💈 מספרות</small></div>
      <div><b>${Object.keys(done).length}/${QUESTS.length}</b><small>📜 משימות</small></div>
    </div>
    <h3 class="grp">📜 משימות</h3><ul class="quest-list">${quest}</ul>
    <h3 class="grp">✂️ מספרות בעיר</h3><div class="unlocks">${shopsHtml}</div>
    ${equipHtml ? `<h3 class="grp">🧰 ציוד</h3><div class="unlocks">${equipHtml}</div>` : ''}
    <h3 class="grp">🚗 נכסים</h3><p>${s ? `דירה: <b>${esc(HOMES.find((h) => h.id === s.home)?.name)}</b> · רכבים: <b>${s.cars.length ? s.cars.map((c) => esc(CARS.find((x) => x.id === c.id)?.name)).join(', ') : 'אין'}</b>` : ''}</p>
    <h3 class="grp">🏆 הישגים (${Object.keys(D.achievements).length}/${ACHIEVEMENTS.length})</h3><div class="achs">${ach}</div>
    <p class="muted small">💾 ההתקדמות נשמרת אוטומטית במכשיר הזה: כסף, מספרות, ציוד, משימות, דרגה ומיקום בעיר.</p>`,
  { back });
}
