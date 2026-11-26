// Loop engine: sentence / range / whole-content repetition on top of any player
// exposing { getTime(), seek(sec), play(), pause() }.
// Pure logic + injected clock so it can be unit-tested without YouTube.

import { indexAt } from '../captions/sync.js';

export const END_EPS = 0.08;        // trigger slightly before the end (polling granularity)
export const SEEK_GUARD_MS = 600;   // ignore stale getTime() values right after a seek
export const LEAVE_MARGIN = 1.5;    // user scrubbed this far outside the loop → follow them

export class LoopEngine {
  /**
   * @param player  { getTime, seek, play, pause }
   * @param getSettings () => ({ repeatCount, repeatInterval, autoNext })
   * @param now     () => ms clock
   */
  constructor(player, getSettings, now = () => performance.now()) {
    this.player = player;
    this.getSettings = getSettings;
    this.now = now;
    this.sentences = [];
    this.mode = 'off';           // off | all | one | range
    this.target = -1;            // sentence index for 'one'
    this.range = null;           // { a, b } sentence indices for 'range'
    this.pass = 1;               // current pass (1-based) for 'one'
    this.waiting = false;        // in the gap between loops
    this.waitUntil = 0;
    this.guardUntil = 0;
    this.jumpTarget = 0;
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(reason) { const s = this.snapshot(reason); this.listeners.forEach(fn => fn(s)); }
  snapshot(reason = '') {
    return { reason, mode: this.mode, target: this.target, range: this.range && { ...this.range }, pass: this.pass, waiting: this.waiting };
  }

  setSentences(list) {
    this.sentences = Array.isArray(list) ? list : [];
    if (!this.sentences.length && (this.mode === 'one' || this.mode === 'range')) this.stop();
  }

  get hasSentences() { return this.sentences.length > 0; }

  indexAt(t) { return indexAt(this.sentences, t); }

  /** Index to highlight right now. */
  currentIndex(t = this.player.getTime()) {
    if (this.mode === 'one' && this.target >= 0) return this.target;
    return this.indexAt(t);
  }

  // ---------- mode changes ----------
  setAll() { this.cancelWait(false); this.mode = 'all'; this.range = null; this.emit('mode'); }

  stop() {
    const wasWaiting = this.waiting;
    this.cancelWait(false);
    this.mode = 'off'; this.range = null; this.target = -1; this.pass = 1;
    if (wasWaiting) this.player.play();     // "停止循環後繼續正常播放"
    this.emit('mode');
  }

  /** Start repeating sentence i from its beginning. */
  repeatOne(i) {
    const s = this.sentences[i];
    if (!s) return;
    this.cancelWait(false);
    this.mode = 'one'; this.target = i; this.pass = 1; this.range = null;
    this.jump(s.start, 0);
    this.player.play();
    this.emit('mode');
  }

  /** Loop sentences a..b (inclusive, any order). */
  setRange(a, b) {
    if (!this.sentences[a] || !this.sentences[b]) return;
    if (a > b) [a, b] = [b, a];
    this.cancelWait(false);
    this.mode = 'range'; this.range = { a, b }; this.target = -1; this.pass = 1;
    const t = this.player.getTime();
    const { start, end } = this.rangeBounds();
    if (t < start || t >= end - END_EPS) this.jump(start, 0);
    this.player.play();
    this.emit('mode');
  }

  rangeBounds() {
    if (!this.range) return null;
    return { start: this.sentences[this.range.a].start, end: this.sentences[this.range.b].end };
  }

  /** User tapped sentence i: jump there; in 'one' mode it becomes the new loop target. */
  goTo(i) {
    const s = this.sentences[i];
    if (!s) return;
    this.cancelWait(false);
    if (this.mode === 'one') { this.target = i; this.pass = 1; this.emit('target'); }
    if (this.mode === 'range' && (i < this.range.a || i > this.range.b)) { this.mode = 'off'; this.range = null; this.emit('mode'); }
    this.jump(s.start, 0);
  }

  /** Called when the user presses play during the gap: resume immediately. */
  cancelWait(resume = true) {
    if (!this.waiting) return;
    this.waiting = false;
    if (resume) { this.player.play(); this.guard(); }
    this.emit('wait');
  }

  // ---------- engine ----------
  jump(start, intervalSec) {
    this.jumpTarget = start;
    if (intervalSec > 0) {
      this.player.pause();
      this.player.seek(start);
      this.waiting = true;
      this.waitUntil = this.now() + intervalSec * 1000;
      this.emit('wait');
    } else {
      this.player.seek(start);
      this.guard();
    }
  }

  guard() { this.guardUntil = this.now() + SEEK_GUARD_MS; }

  /** Poll from a ~50 ms timer while playing. Returns the index to highlight. */
  tick() {
    const now = this.now();
    if (this.waiting) {
      if (now >= this.waitUntil) {
        this.waiting = false;
        this.player.play();
        this.guard();
        this.emit('wait');
      }
      return this.currentIndex(this.jumpTarget);
    }
    const t = this.player.getTime();
    // Right after a seek getTime() may still report the old position.
    if (now < this.guardUntil && Math.abs(t - this.jumpTarget) > 0.6) return this.currentIndex(this.jumpTarget);

    if (this.mode === 'one') {
      const s = this.sentences[this.target];
      if (!s) { this.stop(); return this.indexAt(t); }
      if (t > s.end + LEAVE_MARGIN || t < s.start - LEAVE_MARGIN) {
        // user scrubbed elsewhere in the YouTube player → loop follows them
        const i = this.indexAt(t);
        if (i >= 0) { this.target = i; this.pass = 1; this.emit('target'); }
      } else if (t >= s.end - END_EPS) {
        this.onSentenceEnd();
      }
    } else if (this.mode === 'range') {
      const { start, end } = this.rangeBounds();
      if (t >= end - END_EPS && t < end + LEAVE_MARGIN) this.jump(start, 0);
      else if (t >= end + LEAVE_MARGIN || t < start - LEAVE_MARGIN) { this.mode = 'off'; this.range = null; this.emit('mode'); }
    }
    return this.currentIndex(t);
  }

  onSentenceEnd() {
    const { repeatCount = 0, repeatInterval = 0, autoNext = false } = this.getSettings() || {};
    const s = this.sentences[this.target];
    if (repeatCount > 0 && this.pass >= repeatCount) {
      if (autoNext && this.target < this.sentences.length - 1) {
        this.target += 1; this.pass = 1;
        this.emit('next');
        this.jump(this.sentences[this.target].start, repeatInterval);
      } else {
        // finished: stop looping and keep playing normally
        this.mode = 'off'; this.target = -1; this.pass = 1;
        this.emit('done');
      }
      return;
    }
    this.pass += 1;
    this.emit('pass');
    this.jump(s.start, repeatInterval);
  }

  /** Player reported ENDED. */
  onEnded() {
    if (this.mode === 'all') { this.jump(0, 0); this.player.play(); this.emit('replay'); return true; }
    return false;
  }
}
