// HTML5 <audio> adapter with the same interface as YouTubeAdapter.
// Used only for content we are allowed to play ourselves (public-domain / licensed audio),
// which is what makes background and lock-screen playback possible.
//
// Caption times are on the YouTube timeline. `offset` = YouTube time − audio time,
// so getTime() returns audio time + offset and seek(t) sets audio time = t − offset.

import { STATE } from './yt-adapter.js';

const LOAD_TIMEOUT_MS = 20000;

export class AudioAdapter {
  /** @param el  an HTMLMediaElement (or a test double with the same API) */
  constructor(el) {
    this.el = el;
    this.handlers = {};
    this.offset = 0;
    this.src = '';
    this.meta = { title: '', author: '' };
    this.state = STATE.UNSTARTED;
    this.ready = false;
    try { el.preservesPitch = true; el.webkitPreservesPitch = true; } catch { /* old browsers */ }
    const set = (s) => { if (this.state !== s) { this.state = s; this.emit('state', s); } };
    el.addEventListener('playing', () => set(STATE.PLAYING));
    el.addEventListener('pause', () => { if (!el.ended) set(STATE.PAUSED); });
    el.addEventListener('waiting', () => { if (!el.paused) set(STATE.BUFFERING); });
    el.addEventListener('ended', () => set(STATE.ENDED));
    el.addEventListener('ratechange', () => this.emit('rate', el.playbackRate));
    el.addEventListener('timeupdate', () => this.emit('timeupdate'));
    el.addEventListener('error', () => { if (this.src) this.emit('error', 'audio'); });
  }

  on(evt, fn) { (this.handlers[evt] ||= new Set()).add(fn); return () => this.handlers[evt].delete(fn); }
  emit(evt, data) { this.handlers[evt]?.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  /**
   * Load a source. Resolves once metadata is known (duration, seekable), so seek() works.
   * @param audio { src, offset }  @param opts { start (YouTube timeline), rate, title, author }
   */
  load(audio, { start = 0, rate = 1, title = '', author = '' } = {}) {
    this.offset = Number(audio.offset) || 0;
    this.meta = { title, author };
    const el = this.el;
    return new Promise((resolve, reject) => {
      const done = () => {
        cleanup();
        this.ready = true;
        this.seek(start);
        this.setRate(rate);
        this.state = STATE.CUED;
        this.emit('ready');
        resolve();
      };
      const fail = () => { cleanup(); this.src = ''; reject(new Error('audio-load')); };
      const timer = setTimeout(fail, LOAD_TIMEOUT_MS);   // stalled network: don't spin forever
      const cleanup = () => { clearTimeout(timer); el.removeEventListener('loadedmetadata', done); el.removeEventListener('error', fail); };
      if (this.src === audio.src && el.readyState >= 1) { done(); return; }
      this.ready = false;
      this.src = audio.src;
      el.addEventListener('loadedmetadata', done);
      el.addEventListener('error', fail);
      el.preload = 'metadata';
      el.src = audio.src;
      el.load?.();
    });
  }

  /** Stop and release the network connection (used when switching back to YouTube). */
  unload() {
    if (!this.src) return;
    this.el.pause();
    this.src = '';
    this.ready = false;
    this.el.removeAttribute('src');
    this.el.load?.();
    this.state = STATE.UNSTARTED;
  }

  get isReady() { return this.ready; }
  play() { const p = this.el.play(); p?.catch?.(e => console.warn('audio play blocked', e)); }
  pause() { this.el.pause(); }
  seek(sec) {
    const d = this.el.duration;
    let a = Math.max(0, sec - this.offset);
    if (Number.isFinite(d) && d > 0) a = Math.min(a, Math.max(0, d - 0.05));
    this.el.currentTime = a;
  }
  getTime() { return (this.el.currentTime || 0) + this.offset; }
  getDuration() { const d = this.el.duration; return Number.isFinite(d) ? d + this.offset : 0; }
  getState() { return this.state; }
  isPlaying() { return this.state === STATE.PLAYING || this.state === STATE.BUFFERING; }
  getRate() { return this.el.playbackRate || 1; }
  setRate(r) { this.el.playbackRate = Math.min(2, Math.max(0.5, Number(r) || 1)); }
  getVideoData() { return { title: this.meta.title, author: this.meta.author }; }
}
