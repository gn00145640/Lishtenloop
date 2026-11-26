// Thin wrapper over the official YouTube IFrame Player API.
// One instance for the whole app; it is never destroyed while the app runs.
// We never overlay, hide-while-playing, or modify the player (YouTube ToS).

const API_SRC = 'https://www.youtube.com/iframe_api';
let apiPromise;

function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = API_SRC;
    s.async = true;
    s.onerror = () => { apiPromise = null; s.remove(); reject(new Error('yt-api-load')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.YT?.Player) reject(new Error('yt-api-timeout')); }, 15000);
  });
  return apiPromise;
}

export const STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

export class YouTubeAdapter {
  constructor(hostId) {
    this.hostId = hostId;
    this.player = null;
    this.ready = null;
    this.videoId = null;
    this.handlers = {};
    this.lastState = STATE.UNSTARTED;
  }

  on(evt, fn) { (this.handlers[evt] ||= new Set()).add(fn); return () => this.handlers[evt].delete(fn); }
  emit(evt, data) { this.handlers[evt]?.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  /** Load a video. Re-uses the existing player instance (no iframe re-creation). */
  async load(videoId, { start = 0, autoplay = false, rate = 1 } = {}) {
    this.videoId = videoId;
    start = Math.max(0, Math.floor(start));
    if (!this.player) {
      const YT = await loadApi();
      this.ready = new Promise(resolve => {
        this.player = new YT.Player(this.hostId, {
          videoId,
          width: '100%', height: '100%',
          playerVars: {
            playsinline: 1, rel: 0, modestbranding: 1, start,
            autoplay: autoplay ? 1 : 0, enablejsapi: 1, origin: location.origin,
          },
          events: {
            onReady: () => { resolve(); this.setRate(rate); this.emit('ready'); },
            onStateChange: (e) => { this.lastState = e.data; this.emit('state', e.data); },
            onError: (e) => this.emit('error', e.data),
            onPlaybackRateChange: (e) => this.emit('rate', e.data),
          },
        });
      });
      await this.ready;
      return;
    }
    await this.ready;
    if (autoplay) this.player.loadVideoById({ videoId, startSeconds: start });
    else this.player.cueVideoById({ videoId, startSeconds: start });
    this.setRate(rate);
  }

  get isReady() { return !!this.player?.getCurrentTime; }
  play() { this.player?.playVideo?.(); }
  pause() { this.player?.pauseVideo?.(); }
  seek(sec) { this.player?.seekTo?.(Math.max(0, sec), true); }
  getTime() { return this.player?.getCurrentTime?.() ?? 0; }
  getDuration() { return this.player?.getDuration?.() ?? 0; }
  getState() { return this.player?.getPlayerState?.() ?? STATE.UNSTARTED; }
  isPlaying() { const s = this.getState(); return s === STATE.PLAYING || s === STATE.BUFFERING; }
  getRate() { return this.player?.getPlaybackRate?.() ?? 1; }
  setRate(r) {
    if (!this.player?.setPlaybackRate) return;
    const avail = this.player.getAvailablePlaybackRates?.() || [];
    // pick the closest supported rate (YouTube supports 0.25–2 in practice)
    const target = avail.length ? avail.reduce((a, b) => Math.abs(b - r) < Math.abs(a - r) ? b : a) : r;
    this.player.setPlaybackRate(target);
  }
  getVideoData() { return this.player?.getVideoData?.() || {}; }
}
