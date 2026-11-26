// A muted, inline <video> that follows the own-audio element.
//
// Why: the sound must never change hands. iOS pauses video when the screen locks, and a
// page cannot start new playback reliably once it is in the background, so switching
// from "video with sound" to "audio" at lock time always stutters. Instead the <audio>
// element is the only sound source the whole time; this video is just a picture slaved
// to its clock. When the page is hidden the picture pauses (the sound keeps going); when
// it comes back the picture re-aligns to the audio and resumes.
//
// Both elements play the same edit of the same media (different resolutions), so their
// raw currentTime values are on the same timeline.

const HARD_SYNC_S = 0.3;     // further apart than this → jump the video
const SOFT_SYNC_S = 0.06;    // between SOFT and HARD → nudge the video's speed
const NUDGE = 0.06;          // ±6 % speed while catching up
const SEEK_COOLDOWN_MS = 1000;

export class VideoFollower {
  /**
   * @param video   HTMLVideoElement (or test double) shown as the picture
   * @param master  HTMLMediaElement that produces the sound
   * @param opts    { now, doc } injectable clock and document for tests
   */
  constructor(video, master, { now = () => performance.now(), doc = globalThis.document } = {}) {
    this.v = video;
    this.m = master;
    this.now = now;
    this.doc = doc;
    this.src = '';
    this.failed = false;
    this.active = false;          // caller wants the picture (video view on the player page)
    this.lastSeekAt = -Infinity;
    this.handlers = {};
    try {
      video.muted = true; video.defaultMuted = true; video.playsInline = true;
      video.setAttribute?.('playsinline', ''); video.setAttribute?.('webkit-playsinline', '');
      video.setAttribute?.('muted', '');
    } catch { /* test double */ }

    const resync = () => this.sync(true);
    for (const ev of ['play', 'playing', 'seeked', 'ratechange']) master.addEventListener(ev, resync);
    master.addEventListener('pause', () => this.pauseVideo());
    master.addEventListener('ended', () => this.pauseVideo());
    video.addEventListener('loadedmetadata', resync);
    video.addEventListener('error', () => {
      if (!this.src) return;
      this.failed = true;
      this.pauseVideo();
      this.emit('fail');
    });
    doc?.addEventListener?.('visibilitychange', () => {
      if (doc.hidden) this.pauseVideo(); else this.sync(true);
    });
  }

  on(evt, fn) { (this.handlers[evt] ||= new Set()).add(fn); return () => this.handlers[evt].delete(fn); }
  emit(evt, data) { this.handlers[evt]?.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  /** Point the picture at a media URL ('' = none). Cheap to call repeatedly. */
  load(src) {
    if (src === this.src) return;
    this.failed = false;
    this.src = src || '';
    this.pauseVideo();
    if (!src) { this.v.removeAttribute?.('src'); this.v.load?.(); return; }
    this.v.preload = 'auto';
    this.v.src = src;
    this.v.load?.();
  }

  setActive(on) {
    this.active = !!on;
    if (this.active) this.sync(true); else this.pauseVideo();
  }

  /** True when the picture should be moving with the sound. */
  get wanted() {
    return this.active && !!this.src && !this.failed && !(this.doc && this.doc.hidden);
  }
  get usable() { return !!this.src && !this.failed; }

  pauseVideo() { if (!this.v.paused) this.v.pause(); }

  /** Align the picture with the sound. Called on media events and every playback tick. */
  sync(force = false) {
    const v = this.v, m = this.m;
    if (!this.wanted) { this.pauseVideo(); return; }
    if (v.readyState < 1 || v.seeking) return;
    const rate = m.playbackRate || 1;
    const playing = !m.paused && !m.ended;
    const diff = v.currentTime - m.currentTime;
    const ad = Math.abs(diff);
    const now = this.now();
    if ((force || !playing || ad > HARD_SYNC_S) && ad > 0.02) {
      // while playing, don't keep jumping a picture that is still buffering
      if (force || !playing || now - this.lastSeekAt > SEEK_COOLDOWN_MS) {
        v.currentTime = m.currentTime;
        this.lastSeekAt = now;
      }
      v.playbackRate = rate;
    } else if (playing && ad > SOFT_SYNC_S) {
      v.playbackRate = rate * (diff > 0 ? 1 - NUDGE : 1 + NUDGE);
    } else if (v.playbackRate !== rate) {
      v.playbackRate = rate;
    }
    if (playing && v.paused) { const p = v.play(); p?.catch?.(() => { /* autoplay refused; next sync retries */ }); }
    else if (!playing && !v.paused) v.pause();
  }
}
