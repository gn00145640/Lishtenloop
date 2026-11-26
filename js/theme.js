import { store } from './store.js';

export const APP_VERSION = '0.3.0 (prototype)';

/** Apply theme, caption size and colours from settings to :root. */
export function applyTheme() {
  const st = store.settings;
  const root = document.documentElement;
  if (st.theme === 'light' || st.theme === 'dark') root.dataset.theme = st.theme;
  else delete root.dataset.theme;
  root.style.setProperty('--font-scale', String(st.fontScale || 1));
  if (st.capColor) root.style.setProperty('--cap-en', st.capColor); else root.style.removeProperty('--cap-en');
  if (st.hlColor) root.style.setProperty('--hl', st.hlColor); else root.style.removeProperty('--hl');
  ['en', 'zh', 'blind'].forEach(k => document.body.classList.toggle('cap-' + k, st.capMode === k));
  const dark = st.theme === 'dark' || (st.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1114' : '#f6f7f9');
}
