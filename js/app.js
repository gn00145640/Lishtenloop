// ListenLoop app shell: hash router, mini bar, theme, service worker.
import { store } from './store.js';
import { applyStaticI18n, t } from './i18n.js';
import { icons } from './icons.js';
import { applyTheme } from './theme.js';
import { esc, toast } from './util.js';
import { playback } from './player/playback.js';
import { renderHome } from './views/home.js';
import { renderFavorites } from './views/favorites.js';
import { renderHistory } from './views/history.js';
import { renderSettings } from './views/settings.js';
import { renderPlayer } from './views/player.js';
import { initAudioPanel } from './views/audio-panel.js';

let cleanup = null;
let renderSeq = 0;

function freshView() {
  // Replace <main> each route so listeners from the previous view are dropped.
  const old = document.getElementById('view');
  const fresh = old.cloneNode(false);
  old.replaceWith(fresh);
  return fresh;
}

async function route() {
  const seq = ++renderSeq;
  const hash = location.hash || '#/home';
  const [, name = 'home', arg] = hash.match(/^#\/([^/]+)(?:\/(.+))?/) || [];
  const isPlayer = name === 'player' && arg;

  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  playback.setPlayerPage(!!isPlayer);
  if (!isPlayer && playback.suspend()) toast(t('player.paused'));

  document.body.classList.toggle('route-player', !!isPlayer);
  const view = freshView();
  const rerender = () => route();

  let ret;
  switch (isPlayer ? 'player' : name) {
    case 'player': ret = await renderPlayer(view, decodeURIComponent(arg)); break;
    case 'favorites': ret = renderFavorites(view); break;
    case 'history': ret = renderHistory(view); break;
    case 'settings': ret = renderSettings(view, rerender); break;
    default: ret = await renderHome(view);
  }
  if (seq !== renderSeq) { if (typeof ret === 'function') ret(); return; }
  cleanup = typeof ret === 'function' ? ret : null;
  renderMiniBar();
  if (!isPlayer) window.scrollTo({ top: 0 });
}

function renderMiniBar() {
  const bar = document.getElementById('miniBar');
  const c = playback.content;
  const show = !!c && !document.body.classList.contains('route-player');
  bar.hidden = !show;
  if (!show) return;
  const title = c.title || playback.adapter.getVideoData().title || c.id;
  // Audio mode keeps playing outside the player page; show that instead of a play icon.
  const playing = playback.source === 'audio' && playback.adapter.isPlaying();
  bar.classList.toggle('is-playing', playing);
  bar.innerHTML = `${c.thumb ? `<img src="${esc(c.thumb)}" alt="" referrerpolicy="no-referrer">` : ''}
    <span class="t">${esc(title)}<small>${esc(playing ? t('audio.playingBg') : (c.channel || ''))}</small></span>${playing ? icons.music : icons.play}`;
  bar.setAttribute('aria-label', `${t(playing ? 'audio.openPlayer' : 'player.play')}: ${title}`);
}

function init() {
  applyTheme();
  applyStaticI18n();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  store.onChange((what) => { if (what === 'settings') applyStaticI18n(); });
  initAudioPanel();
  playback.on('state', () => { if (!document.body.classList.contains('route-player')) renderMiniBar(); });
  document.getElementById('miniBar').addEventListener('click', () => {
    if (playback.content) location.hash = '#/player/' + playback.content.id;
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => toast('✓ online', 1200));
  window.addEventListener('offline', () => toast(t('common.offline'), 3000));
  route();

  if ('serviceWorker' in navigator && window.isSecureContext && !/[?&]nosw\b/.test(location.search)) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  }
}

init();
