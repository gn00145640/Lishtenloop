// Small shared helpers.
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 75.3 → "1:15", 3725 → "1:02:05" */
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** ISO-8601 duration (YouTube "PT1H2M3S") → seconds */
export function parseIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

/** Compact count: 1234 → "1.2K" / zh: "1,234" style with 萬 */
export function fmtCount(n, lang = 'zh-TW') {
  n = Number(n);
  if (!Number.isFinite(n)) return '';
  if (lang.startsWith('zh')) {
    if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 0 : 1).replace(/\.0$/, '') + ' 億';
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + ' 萬';
    return n.toLocaleString('zh-TW');
  }
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtDate(iso, lang = 'zh-TW') {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(lang, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Extract an 11-char YouTube video id from a URL or bare id, else null. */
export function parseYouTubeId(input) {
  const v = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  try {
    const u = new URL(v.startsWith('http') ? v : 'https://' + v);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    if (host === 'youtu.be') return valid(u.pathname.slice(1, 12));
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return valid(u.searchParams.get('v'));
      const m = /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
      if (m) return m[1];
    }
  } catch { /* not a URL */ }
  return null;
  function valid(id) { return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null; }
}

let toastTimer;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** Bottom sheet with option chips. Resolves to the chosen value or undefined. */
export function sheet({ title, options, value, extra = '' }) {
  return new Promise(resolve => {
    const bd = document.createElement('div');
    bd.className = 'sheet-backdrop';
    bd.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grab"></div><h3>${esc(title)}</h3>
      <div class="opts">${options.map(o => `<button type="button" class="chip ${o.value === value ? 'on' : ''}" data-v="${esc(JSON.stringify(o.value))}">${esc(o.label)}</button>`).join('')}</div>
      ${extra}</div>`;
    const close = (v) => { bd.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(undefined); };
    bd.addEventListener('click', e => {
      if (e.target === bd) return close(undefined);
      const b = e.target.closest('[data-v]');
      if (b) close(JSON.parse(b.dataset.v));
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bd);
    bd.querySelector('.chip.on, .chip')?.focus();
  });
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
