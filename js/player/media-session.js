// Lock-screen / notification controls via the Media Session API.
// Active only while the app plays its own audio; YouTube manages its own session.

const ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'];
const supported = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator;

let lastPos = 0;

/**
 * @param h { play, pause, prev, next, skip(sec), seekTo(sec), skipSeconds() }
 */
export function enableMediaSession(h) {
  if (!supported()) return;
  const ms = navigator.mediaSession;
  const map = {
    play: () => h.play(),
    pause: () => h.pause(),
    previoustrack: () => h.prev(),
    nexttrack: () => h.next(),
    seekbackward: (d) => h.skip(-(d.seekOffset || h.skipSeconds())),
    seekforward: (d) => h.skip(d.seekOffset || h.skipSeconds()),
    seekto: (d) => { if (Number.isFinite(d.seekTime)) h.seekTo(d.seekTime); },
  };
  for (const a of ACTIONS) { try { ms.setActionHandler(a, map[a]); } catch { /* action unsupported */ } }
}

export function disableMediaSession() {
  if (!supported()) return;
  const ms = navigator.mediaSession;
  for (const a of ACTIONS) { try { ms.setActionHandler(a, null); } catch { /* ignore */ } }
  try { ms.metadata = null; ms.playbackState = 'none'; } catch { /* ignore */ }
}

/** Lock screen shows the current English sentence as the title, the content title as artist. */
export function setMediaMetadata({ sentence, title, channel }) {
  if (!supported() || typeof MediaMetadata === 'undefined') return;
  const base = new URL('icons/', location.href).href;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: sentence || title || 'ListenLoop',
    artist: sentence ? title : (channel || ''),
    album: 'ListenLoop',
    artwork: [
      { src: base + 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: base + 'icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
}

export function setMediaPlaying(playing) {
  if (supported()) try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch { /* ignore */ }
}

/** Throttled to once per second unless forced. */
export function setMediaPosition({ position, duration, rate }, force = false) {
  if (!supported() || !navigator.mediaSession.setPositionState) return;
  const now = Date.now();
  if (!force && now - lastPos < 1000) return;
  lastPos = now;
  if (!(duration > 0)) return;
  try {
    navigator.mediaSession.setPositionState({ duration, playbackRate: rate || 1, position: Math.min(Math.max(0, position), duration) });
  } catch { /* invalid state during load */ }
}
