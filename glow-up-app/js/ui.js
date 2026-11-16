// Small DOM toolkit: element builder, sheets, toasts, confirm dialogs.
import { icon } from './icons.js';

/**
 * h('div', {class:'x', onclick: fn}, child, 'text', [more])
 * Props starting with "on" become listeners; "html" sets innerHTML (trusted only).
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

/** Icon as a DOM node. */
export function ic(name, cls = '') {
  const span = document.createElement('span');
  span.innerHTML = icon(name);
  const svg = span.firstChild;
  if (cls) svg.setAttribute('class', cls);
  return svg;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Very small, safe formatter: escapes, then **bold** and line breaks. */
export function rich(text) {
  const span = document.createElement('span');
  span.innerHTML = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return span;
}

// ---------- toast ----------
let toastWrap;
export function toast(msg, iconName = 'sparkles') {
  if (!toastWrap) {
    toastWrap = h('div', { class: 'toasts', role: 'status' });
    document.body.appendChild(toastWrap);
  }
  const t = h('div', { class: 'toast' }, ic(iconName), h('span', null, msg));
  while (toastWrap.children.length >= 2) toastWrap.firstChild.remove();
  toastWrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2400);
}

// ---------- confetti-ish burst (subtle) ----------
export function burst(x, y) {
  if (document.documentElement.dataset.motion === 'reduce') return;
  const b = h('div', { class: 'burst', style: { left: x + 'px', top: y + 'px' } });
  const colors = ['#c084fc', '#8b5cf6', '#22d3ee', '#f472b6', '#a3e635'];
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14;
    const d = 30 + Math.random() * 30;
    const dot = h('i', { style: { background: colors[i % colors.length] } });
    // custom properties must go through setProperty
    dot.style.setProperty('--x', Math.cos(a) * d + 'px');
    dot.style.setProperty('--y', Math.sin(a) * d + 'px');
    dot.style.setProperty('--r', Math.random() * 360 + 'deg');
    b.appendChild(dot);
  }
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 1000);
}

// ---------- bottom sheet ----------
const openSheets = [];
export function sheet(build, { onClose } = {}) {
  const ov = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' });
  const sh = h('div', { class: 'sheet' }, h('div', { class: 'grab' }));
  ov.appendChild(sh);
  const api = {
    close() {
      if (!ov.isConnected) return;
      ov.remove();
      openSheets.splice(openSheets.indexOf(api), 1);
      document.removeEventListener('keydown', onKey);
      onClose && onClose();
    },
    body: sh,
    rebuild() { sh.replaceChildren(h('div', { class: 'grab' })); append(sh, [build(api)]); },
  };
  const onKey = (e) => { if (e.key === 'Escape' && openSheets[openSheets.length - 1] === api) api.close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov) api.close(); });
  document.addEventListener('keydown', onKey);
  append(sh, [build(api)]);
  document.body.appendChild(ov);
  openSheets.push(api);
  const first = sh.querySelector('input, textarea, select');
  if (first && !first.dataset.noAutofocus && window.matchMedia('(pointer:fine)').matches) setTimeout(() => first.focus(), 60);
  return api;
}
export function closeAllSheets() { [...openSheets].forEach((s) => s.close()); }

export function sheetHead(title, lead, api) {
  return h('div', { class: 'sheet-head' },
    h('div', null, h('h2', null, title), lead ? h('p', { class: 'lead' }, lead) : null),
    h('button', { class: 'icon-btn', 'aria-label': 'סגירה', onclick: () => api.close() }, ic('x')));
}

export function confirmDialog(title, text, { ok = 'אישור', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    sheet((api) => h('div', null,
      h('h2', null, title),
      h('p', { class: 'lead' }, text),
      h('div', { class: 'row mt' },
        h('button', { class: 'btn ghost grow', onclick: () => { answered = true; api.close(); resolve(false); } }, 'ביטול'),
        h('button', { class: 'btn grow ' + (danger ? 'danger' : 'primary'), onclick: () => { answered = true; api.close(); resolve(true); } }, ok))),
    { onClose: () => { if (!answered) resolve(false); } });
  });
}

// ---------- visuals ----------
export function ring(pct, label, sub, size = 92, color = 'url(#rg)') {
  const r = 40, c = 2 * Math.PI * r;
  const wrap = h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' } });
  wrap.innerHTML = `<svg viewBox="0 0 100 100"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c084fc"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
  <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="9"/>
  <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg>`;
  const lbl = h('div', { class: 'lbl' }, h('div', null, label, sub ? h('small', null, sub) : null));
  wrap.appendChild(lbl);
  const arc = wrap.querySelectorAll('circle')[1];
  requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = c * (1 - Math.max(0, Math.min(1, pct))); }));
  return wrap;
}

export function bar(pct) {
  const i = h('i', { style: { width: '0%' } });
  requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = Math.round(Math.max(0, Math.min(1, pct)) * 100) + '%'; }));
  return h('div', { class: 'bar' }, i);
}

export function toggle(checked, onchange, label) {
  return h('label', { class: 'switch' },
    h('input', { type: 'checkbox', checked, 'aria-label': label || '', onchange: (e) => onchange(e.target.checked) }),
    h('span'));
}

export function chips(options, selected, onchange, { multi = true, max = 0 } = {}) {
  const wrap = h('div', { class: 'chips' });
  const sel = new Set(Array.isArray(selected) ? selected : selected != null ? [selected] : []);
  const draw = () => {
    wrap.replaceChildren(...options.map((o) => {
      const id = typeof o === 'string' ? o : o.id;
      const label = typeof o === 'string' ? o : o.label;
      return h('button', {
        type: 'button', class: 'chip' + (sel.has(id) ? ' on' : ''), 'aria-pressed': sel.has(id) ? 'true' : 'false',
        onclick: () => {
          if (multi) {
            if (sel.has(id)) sel.delete(id);
            else { if (max && sel.size >= max) return toast(`אפשר לבחור עד ${max}`, 'info'); sel.add(id); }
            onchange([...sel]);
          } else { sel.clear(); sel.add(id); onchange(id); }
          draw();
        },
      }, o.icon ? ic(o.icon) : null, label);
    }));
  };
  draw();
  return wrap;
}

export function emptyState(iconName, text, action) {
  return h('div', { class: 'empty' }, ic(iconName), h('div', null, text), action || null);
}

export function note(text, kind = '', iconName) {
  const icn = iconName || (kind === 'warn' ? 'alert' : kind === 'med' ? 'heartPulse' : 'info');
  return h('div', { class: 'note ' + kind }, ic(icn), h('div', null, rich(text)));
}

export function listRow({ icon: iconName, title, desc, onclick, right, color }) {
  const tag = onclick ? 'button' : 'div';
  return h(tag, { class: 'list-row', onclick, type: onclick ? 'button' : null },
    iconName ? h('span', { class: 'ico', style: color ? { color, background: color + '22' } : null }, ic(iconName)) : null,
    h('div', { class: 'grow' }, h('div', { class: 't' }, title), desc ? h('div', { class: 'd' }, desc) : null),
    right !== undefined ? right : onclick ? ic('chevron', 'chev') : null);
}

/** Reads an image file and downscales it to a JPEG data URL (keeps storage small). */
export function readImage(file, maxSide = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('not an image'));
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        const s = Math.min(1, maxSide / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function pickImage() {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  });
}
