// Transport controls shown in the player dock while the own-audio source is active
// (YouTube mode uses YouTube's own controls instead). Lives for the whole app session.
import { esc, fmtTime, $ } from '../util.js';
import { t } from '../i18n.js';
import { icons } from '../icons.js';
import { store } from '../store.js';
import { playback } from '../player/playback.js';
import { STATE } from '../player/yt-adapter.js';

export function initAudioPanel() {
  const panel = document.getElementById('audioPanel');
  let seeking = false;

  function build() {
    const c = playback.content || {};
    panel.innerHTML = `
      <div class="ap-bg" style="${c.thumb ? `background-image:url('${esc(c.thumb)}')` : ''}"></div>
      <div class="ap-top"><span class="ap-badge">${icons.music}${esc(t('audio.badge'))}</span></div>
      <div class="ap-ctrls">
        <button type="button" class="ap-btn" data-a="prev" aria-label="${esc(t('audio.prev'))}">${icons.prev}</button>
        <button type="button" class="ap-btn" data-a="back" aria-label="${esc(t('audio.back', { n: skipSec() }))}">${icons.rewind}</button>
        <button type="button" class="ap-btn ap-play" data-a="play" aria-label="${esc(t('player.play'))}">${icons.play}</button>
        <button type="button" class="ap-btn" data-a="fwd" aria-label="${esc(t('audio.fwd', { n: skipSec() }))}">${icons.forward}</button>
        <button type="button" class="ap-btn" data-a="next" aria-label="${esc(t('audio.next'))}">${icons.next}</button>
      </div>
      <div class="ap-seek">
        <span class="ap-time" id="apCur">0:00</span>
        <input type="range" id="apRange" min="0" max="1000" value="0" step="1" aria-label="${esc(t('audio.seek'))}">
        <span class="ap-time" id="apDur">0:00</span>
      </div>`;
    const range = $('#apRange', panel);
    range.addEventListener('input', () => { seeking = true; $('#apCur', panel).textContent = fmtTime(rangeToTime(range.value)); });
    range.addEventListener('change', () => { playback.seekTo(rangeToTime(range.value)); seeking = false; });
    renderState();
    renderTime();
  }

  const skipSec = () => +store.settings.skipSeconds || 10;
  const dur = () => playback.aud.getDuration() || playback.content?.duration || 0;
  const rangeToTime = (v) => (v / 1000) * dur();

  function renderState() {
    const btn = panel.querySelector('[data-a="play"]');
    if (!btn) return;
    const playing = playback.aud.isPlaying() || playback.engine.waiting;
    btn.innerHTML = playing ? icons.pause : icons.play;
    btn.setAttribute('aria-label', t(playing ? 'player.pause' : 'player.play'));
  }
  function renderTime() {
    if (seeking || panel.hidden) return;
    const range = $('#apRange', panel);
    if (!range) return;
    const d = dur(), cur = playback.aud.getTime();
    $('#apCur', panel).textContent = fmtTime(cur);
    $('#apDur', panel).textContent = fmtTime(d);
    range.value = d ? Math.round((cur / d) * 1000) : 0;
  }

  panel.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'play') playback.togglePlay();
    else if (a === 'back') playback.skip(-skipSec());
    else if (a === 'fwd') playback.skip(skipSec());
    else if (a === 'prev') playback.stepSentence(-1);
    else if (a === 'next') playback.stepSentence(1);
  });

  function sync() {
    const on = playback.source === 'audio' && !!playback.content;
    panel.hidden = !on;
    if (on) build();
  }
  playback.on('source', sync);
  playback.on('content', sync);
  playback.on('state', (s) => { if (playback.source === 'audio') { renderState(); if (s === STATE.CUED) renderTime(); } });
  playback.on('loop', renderState);
  playback.on('time', renderTime);
  store.onChange((what) => { if (what === 'settings' && !panel.hidden) build(); });
}
