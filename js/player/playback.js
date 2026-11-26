// App-wide playback service: one YouTube player + one <audio> element, the loop engine
// and progress persistence. Views subscribe to it; navigating between pages never
// creates another player.
//
// Sources:
//   'video' — the official YouTube IFrame player (any video; foreground only).
//   'audio' — our own HTML5 audio for content that ships an `audio` field
//             (public-domain demo media): background + lock-screen playback, no ads.
import { YouTubeAdapter, STATE } from './yt-adapter.js';
import { AudioAdapter } from './audio-adapter.js';
import { LoopEngine } from './loop-engine.js';
import { enableMediaSession, disableMediaSession, setMediaMetadata, setMediaPlaying, setMediaPosition } from './media-session.js';
import { store } from '../store.js';
import { getContent, getCaptions } from '../content.js';

const TICK_MS = 50;
const IDLE_TICK_MS = 250;
const SAVE_EVERY_MS = 5000;

class Playback {
  constructor() {
    this.yt = new YouTubeAdapter('ytHost');
    this.aud = new AudioAdapter(document.getElementById('audioEl'));
    this.source = 'video';
    this.engine = new LoopEngine(this.yt, () => store.settings);
    this.content = null;
    this.sentences = [];
    this.captionsError = false;
    this.error = null;
    this.idx = -1;
    this.handlers = {};
    this.timer = null;
    this.lastSave = 0;
    this.lastTickAt = 0;
    this.listenedAcc = 0;
    this.loading = null;

    for (const a of [this.yt, this.aud]) {
      a.on('state', (s) => { if (a === this.adapter) this.onState(s); });
      a.on('error', (code) => { if (a === this.adapter) { this.error = code; this.emit('error', code); } });
      a.on('rate', (r) => { if (a === this.adapter) { this.emit('rate', r); this.pushPosition(true); } });
      a.on('ready', () => { if (a === this.adapter) this.emit('ready'); });
    }
    // Backgrounded pages may throttle setInterval; timeupdate keeps loops and the lock screen moving.
    this.aud.on('timeupdate', () => { if (this.source === 'audio') this.tick(); });

    this.engine.onChange((snap) => {
      if (snap.reason === 'mode') this.saveSoon();
      this.emit('loop', snap);
    });

    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('pagehide', () => this.save());
  }

  /** The adapter of the active source. */
  get adapter() { return this.source === 'audio' ? this.aud : this.yt; }
  get hasAudio() { return !!this.content?.audio?.src; }

  on(evt, fn) { (this.handlers[evt] ||= new Set()).add(fn); return () => this.handlers[evt].delete(fn); }
  emit(evt, data) { this.handlers[evt]?.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  onState(s) {
    if (s === STATE.PLAYING) this.startTimer();
    if (s === STATE.ENDED) {
      if (!this.engine.onEnded()) this.save();
    }
    if (s === STATE.PAUSED || s === STATE.ENDED) { this.tick(); this.save(); }
    if (this.source === 'audio') { setMediaPlaying(s === STATE.PLAYING || s === STATE.BUFFERING); this.pushPosition(true); }
    this.emit('state', s);
  }

  /** Open content. Re-opening the current id keeps the player state untouched. */
  async open(id) {
    if (this.content?.id === id && this.loading === null) return { reused: true };
    if (this.loading?.id === id) return this.loading.promise;
    const promise = (async () => {
      if (this.content) this.save();
      this.error = null;
      this.audioFailed = false;
      const content = await getContent(id);
      const captions = await getCaptions(id);
      this.adapter.pause?.();
      this.content = content;
      this.captionsError = captions === null;
      this.sentences = captions || [];
      this.engine.stop();
      this.engine.setSentences(this.sentences);
      this.idx = -1;
      const prog = store.getProgress(id);
      const start = prog && prog.time > 3 && !(prog.duration && prog.time > prog.duration - 5) ? prog.time - 1 : 0;
      document.getElementById('playerDock').hidden = false;
      const src = this.hasAudio && store.settings.preferAudio ? 'audio' : 'video';
      try {
        await this.activate(src, start);
      } catch (e) {
        if (src !== 'audio') throw e;
        // audio unavailable (offline / moved) → fall back to the YouTube video
        console.warn('audio source failed, falling back to video', e);
        this.audioFailed = true;
        this.error = null;
        await this.activate('video', start);
      }
      this.startTimer();
      if (prog?.mode === 'all' || (!prog && store.settings.allAutoReplay)) this.engine.setAll();
      this.emit('content', this.content);
      return { reused: false, resumedAt: start };
    })();
    this.loading = { id, promise };
    try { return await promise; } finally { this.loading = null; }
  }

  /** Load the current content into the given source at `start` (YouTube timeline). */
  async activate(src, start) {
    const c = this.content;
    const rate = store.settings.rate;
    if (src === 'audio') {
      if (this.yt.isReady && this.yt.isPlaying()) this.yt.pause();
      this.source = 'audio';
      this.engine.player = this.aud;
      await this.aud.load(c.audio, { start, rate, title: c.title, author: c.channel });
      enableMediaSession({
        play: () => this.togglePlay(true),
        pause: () => this.togglePlay(false),
        prev: () => this.stepSentence(-1),
        next: () => this.stepSentence(1),
        skip: (d) => this.skip(d),
        seekTo: (t) => this.seekTo(t),
        skipSeconds: () => +store.settings.skipSeconds || 10,
      });
      this.updateMetadata();
      this.pushPosition(true);
    } else {
      this.aud.pause();
      disableMediaSession();
      this.source = 'video';
      this.engine.player = this.yt;
      await this.yt.load(c.id, { start, autoplay: false, rate });
    }
    document.getElementById('playerDock').classList.toggle('audio-mode', src === 'audio');
    this.emit('source', src);
  }

  /** Switch between YouTube video and own audio, keeping position, speed and loop mode. */
  async setSource(src) {
    if (!this.content || src === this.source || this.switching) return;
    if (src === 'audio' && !this.hasAudio) return;
    this.switching = true;
    try {
      const t = this.adapter.isReady ? this.adapter.getTime() : 0;
      const wasPlaying = this.adapter.isReady && (this.adapter.isPlaying() || this.engine.waiting);
      this.engine.cancelWait(false);
      this.adapter.pause();
      this.save();
      this.error = null;
      store.setSetting('preferAudio', src === 'audio');
      await this.activate(src, t);
      this.engine.jumpTarget = t;
      this.engine.guard();
      if (wasPlaying) this.adapter.play();
      this.startTimer();
    } finally { this.switching = false; }
  }

  startTimer() {
    this.lastTickAt = performance.now();
    if (this.timerMs !== TICK_MS) this.restartTimer(TICK_MS);
  }

  tick() {
    const a = this.adapter;
    if (!a.isReady) return;
    const playing = a.isPlaying();
    const idx = this.engine.tick();
    const t = a.getTime();
    const now = performance.now();
    if (playing) this.listenedAcc += Math.min(1, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;
    if (idx !== this.idx) { this.idx = idx; this.emit('sentence', idx); if (this.source === 'audio') this.updateMetadata(); }
    this.emit('time', t);
    if (this.source === 'audio') this.pushPosition();
    if (playing && now - this.lastSave > SAVE_EVERY_MS) this.save();
    // keep polling while paused too (slower), so seeks/taps while paused still update the highlight
    const want = playing || this.engine.waiting ? TICK_MS : IDLE_TICK_MS;
    if (this.timerMs !== want) this.restartTimer(want);
  }

  restartTimer(ms) {
    clearInterval(this.timer);
    this.timerMs = ms;
    this.timer = setInterval(() => this.tick(), ms);
  }

  updateMetadata() {
    const c = this.content;
    if (!c) return;
    const s = this.sentences[this.idx];
    setMediaMetadata({ sentence: s?.en || '', title: c.title || '', channel: c.channel || '' });
  }

  pushPosition(force = false) {
    if (this.source !== 'audio' || !this.aud.isReady) return;
    setMediaPosition({ position: this.aud.el.currentTime, duration: this.aud.el.duration, rate: this.aud.getRate() }, force);
  }

  saveSoon() { clearTimeout(this._saveT); this._saveT = setTimeout(() => this.save(), 300); }

  save() {
    const a = this.adapter;
    if (!this.content || !a.isReady) return;
    this.lastSave = performance.now();
    const t = a.getTime();
    const duration = a.getDuration() || this.content.duration || 0;
    if (t < 1 && !store.getProgress(this.content.id)) return; // never started
    const s = this.sentences[this.engine.currentIndex(t)];
    const c = this.content;
    store.saveProgress({
      id: c.id, title: c.title || a.getVideoData().title || '', channel: c.channel || a.getVideoData().author || '',
      thumb: c.thumb, isDemo: !!c.isDemo, duration,
      time: t, sentenceId: s?.id || null, sentenceIndex: s ? s.index : -1,
      rate: a.getRate(), mode: this.engine.mode, source: this.source,
      addListened: Math.round(this.listenedAcc),
    });
    this.listenedAcc = 0;
  }

  // ---- controls used by views and the lock screen ----
  /** @param want  true = play, false = pause, undefined = toggle */
  togglePlay(want) {
    if (this.engine.waiting) {
      if (want === false) this.engine.cancelWait(false); else this.engine.cancelWait(true);
      return;
    }
    const playing = this.adapter.isPlaying();
    if (want === undefined ? playing : !want) this.adapter.pause(); else this.adapter.play();
  }
  skip(delta) {
    this.seekTo(this.adapter.getTime() + delta);
  }
  seekTo(t) {
    const max = Math.max(0, this.adapter.getDuration() - 0.5);
    t = Math.min(Math.max(0, t), max);
    this.adapter.seek(t);
    this.engine.jumpTarget = t;
    this.engine.guard();
    this.tick();
  }
  stepSentence(d) {
    if (!this.sentences.length) { this.skip(d * (+store.settings.skipSeconds || 10)); return; }
    const cur = this.engine.currentIndex(this.adapter.getTime());
    const i = Math.min(this.sentences.length - 1, Math.max(0, (cur < 0 ? 0 : cur) + d));
    this.engine.goTo(i);
    this.adapter.play();
  }
  setRate(r) {
    this.adapter.setRate(r);
    store.setSetting('rate', r);
  }
  /** Called when leaving the player page: YouTube must not play hidden/in background.
   *  Own audio keeps playing (that is the point of audio mode). */
  suspend() {
    if (this.source === 'audio') return false;
    if (this.yt.isReady && this.yt.isPlaying()) { this.yt.pause(); return true; }
    if (this.engine.waiting) { this.engine.cancelWait(false); return true; }
    return false;
  }
}

export const playback = new Playback();
