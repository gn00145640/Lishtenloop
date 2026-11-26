// ListenLoop service worker: caches the app shell + demo captions only.
// YouTube / Google API traffic is never cached or intercepted.
// Cross-origin media (YouTube, VOA audio) is never cached or intercepted.
const CACHE = 'listenloop-shell-v3';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/store.js', 'js/i18n.js', 'js/icons.js', 'js/util.js', 'js/theme.js', 'js/content.js', 'js/components.js',
  'js/player/yt-adapter.js', 'js/player/audio-adapter.js', 'js/player/media-session.js', 'js/player/video-follower.js','js/player/loop-engine.js', 'js/player/playback.js',
  'js/views/audio-panel.js',
  'js/captions/sync.js', 'js/translate/index.js', 'js/translate/microsoft.js', 'js/translate/gemini.js', 'js/youtube/search.js',
  'js/views/home.js', 'js/views/player.js', 'js/views/favorites.js', 'js/views/history.js', 'js/views/settings.js',
  'data/demo/index.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network-first for same-origin GETs (always fresh while online), cache fallback offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
