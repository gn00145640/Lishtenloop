import { esc, fmtTime, toast, sheet, $, $$ } from '../util.js';
import { t } from '../i18n.js';
import { icons } from '../icons.js';
import { store } from '../store.js';
import { playback } from '../player/playback.js';
import { noticeHtml } from '../components.js';
import { translateTexts, translationStatus } from '../translate/index.js';

// Player page: with YouTube as the source, YouTube's own controls handle transport; with
// own audio (demos) the dock shows our panel (js/views/audio-panel.js) over the muted
// synced video or the cover. The app adds speed, repeat-all, favorite (title bar), the
// video/audio view switch and sentence-level loops (captions).
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const LONG_PRESS_MS = 500;
const AUTOSCROLL_PAUSE_MS = 3000;

export async function renderPlayer(view, id) {
  view.innerHTML = `<div class="video-spacer" aria-hidden="true"></div><div class="spinner"></div>`;
  let result;
  try {
    result = await playback.open(id);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="video-spacer"></div><div style="padding:16px">${noticeHtml(esc(t('yt.err.load')))}
      <div class="more"><button class="btn" type="button" onclick="location.reload()">${esc(t('common.retry'))}</button></div></div>`;
    return () => {};
  }
  if (location.hash !== '#/player/' + id) return () => {};      // navigated away meanwhile

  const c = playback.content;
  const sentences = playback.sentences;
  const engine = playback.engine;
  const A = () => playback.adapter;            // active source (YouTube or own audio) — may change
  const S = { rangeAnchor: null, userScrollAt: 0, lastIdx: -1 };
  const cleanups = [];

  view.innerHTML = `
    <div class="video-spacer" aria-hidden="true"></div>
    <div class="p-info">
      <div class="tt"><h1 id="pTitle">${esc(c.title || '')}</h1><div class="ch" id="pChannel">${esc(c.channel || '')}</div></div>
      <div class="p-actions">
        <button type="button" class="speed-btn" id="speedBtn" aria-label="${esc(t('player.speed'))}"></button>
        <button type="button" class="icon-btn" id="allBtn" aria-label="${esc(t('player.mode.all'))}" title="${esc(t('player.mode.all'))}">${icons.repeat}</button>
        <button type="button" class="icon-btn" id="favBtn"></button>
      </div>
    </div>
    <div class="src-row">
      <div class="seg" role="radiogroup" aria-label="${esc(t('audio.source'))}" hidden>
        <button type="button" role="radio" data-view="video">${esc(t('audio.video'))}</button>
        <button type="button" role="radio" data-view="audio">${icons.music}${esc(t('audio.audio'))}</button>
      </div>
      <span class="src-note" id="srcNote"></span>
    </div>
    <div class="loop-status" id="loopStatus" aria-live="polite" hidden>
      <span id="loopText"></span>
      <button type="button" class="btn ghost sm-btn" id="loopStop">${icons.x}${esc(t('player.stopRepeat'))}</button>
    </div>
    <div class="captions" id="caps"></div>`;

  const caps = $('#caps', view);
  const loopStatus = $('#loopStatus', view);

  // ---------- captions ----------
  function renderCaptions() {
    renderCaptionList();
    updateLoopUi(engine.snapshot());
  }
  function renderCaptionList() {
    let top = '';
    if (playback.error != null) {
      const key = 'yt.err.' + playback.error;
      const msg = t(key) === key ? t('yt.err.load') : t(key);
      top += `<div class="cap-empty">${noticeHtml(`${esc(msg)}
        <div style="margin-top:6px"><a href="https://www.youtube.com/watch?v=${esc(c.id)}" target="_blank" rel="noopener">${esc(t('yt.openOnYouTube'))}</a></div>`)}</div>`;
    }
    if (playback.captionsError) {
      caps.innerHTML = top + `<div class="cap-empty">${noticeHtml(esc(t('err.network')))}
        <div class="more"><button class="btn" type="button" onclick="location.reload()">${esc(t('common.retry'))}</button></div></div>`;
      return;
    }
    if (!sentences.length) {
      caps.innerHTML = top + `<div class="cap-empty">
        ${noticeHtml(`<b>${esc(t('player.noCaptionsTitle'))}</b><br>${esc(t('player.noCaptions'))}`)}
        ${noticeHtml(`${esc(t('player.noCaptionsTry'))} <a href="#/home">${esc(t('nav.home'))}</a>`, 'info')}
        <p class="tiny">${esc(t('player.noBackground'))}</p></div>`;
      return;
    }
    const missing = sentences.filter(s => !s.zh).length;
    if (missing) {
      const ready = translationStatus() === 'ready';
      top += `<div class="cap-empty" id="trBox">${noticeHtml(`${esc(t('player.missingZh', { n: missing }))}
        ${ready ? ` <button class="btn" type="button" id="trBtn">${icons.translate}${esc(t('player.translateNow'))}</button>` : `<br>${esc(t('player.trPending'))} <a href="#/settings">${esc(t('nav.settings'))}</a>`}`, 'info')}</div>`;
    }
    caps.innerHTML = top + `<p class="tiny" style="padding:0 16px;margin:4px 0">${esc(t('player.hint'))}${sentences.timing === 'estimated' ? '・' + esc(t('player.timingEstimated')) : ''}</p>` +
      sentences.map(s => `
        <div class="cap" data-i="${s.index}" id="cap-${s.index}">
          <div class="tx">
            <div class="en" lang="en">${esc(s.en)}</div>
            <div class="zh" lang="zh-Hant">${esc(s.zh)}</div>
            <div class="time">${s.index + 1} · ${fmtTime(s.start)}</div>
          </div>
          <button type="button" class="icon-btn rep" data-rep="${s.index}" aria-label="${esc(t('player.repeatThis'))}">${icons.repeatOne}</button>
        </div>`).join('') +
      `<button type="button" class="btn primary resume-auto" id="resumeAuto" hidden>${esc(t('player.resumeAuto'))}</button>`;
    $('#trBtn', caps)?.addEventListener('click', runTranslate);
    $('#resumeAuto', caps).addEventListener('click', () => { S.userScrollAt = 0; scrollToCurrent(true); });
    S.lastIdx = -1;
    markSentence(engine.currentIndex(A().getTime()));
  }

  async function runTranslate() {
    const btn = $('#trBtn', caps);
    if (btn) { btn.disabled = true; btn.textContent = t('player.translating'); }
    const todo = sentences.filter(s => !s.zh);
    try {
      const out = await translateTexts(todo.map(s => s.en));
      const map = {};
      todo.forEach((s, k) => { s.zh = out[k]; map[s.index] = out[k]; });
      store.putTranslations(c.id, map);
      toast(t('player.translated', { n: todo.length }));
      renderCaptions();
    } catch (e) {
      toast(e.code === 'pending' ? t('player.trPending') : `${t('set.err')}: ${e.message}`, 4000);
      if (btn) { btn.disabled = false; btn.textContent = t('player.translateNow'); }
    }
  }

  function markSentence(idx) {
    if (!sentences.length) return;
    $$('.cap', caps).forEach((el, i) => {
      el.classList.toggle('current', i === idx);
      el.classList.toggle('played', idx >= 0 && i < idx);
    });
    S.lastIdx = idx;
    scrollToCurrent(false);
  }

  function scrollToCurrent(force) {
    const el = document.getElementById('cap-' + S.lastIdx);
    const resume = $('#resumeAuto', caps);
    if (!el) return;
    const userBusy = Date.now() - S.userScrollAt < AUTOSCROLL_PAUSE_MS;
    if (userBusy && !force) {
      const r = el.getBoundingClientRect(), cr = caps.getBoundingClientRect();
      if (resume) resume.hidden = r.top >= cr.top && r.bottom <= cr.bottom;
      return;
    }
    if (resume) resume.hidden = true;
    caps.scrollTo({ top: Math.max(0, el.offsetTop - caps.clientHeight * 0.28), behavior: 'smooth' });
  }

  ['wheel', 'touchmove'].forEach(ev => caps.addEventListener(ev, () => { S.userScrollAt = Date.now(); }, { passive: true }));

  // tap → jump; long-press → range; repeat button → single loop
  let pressTimer = null, pressStart = null, longPressed = false;
  caps.addEventListener('pointerdown', (e) => {
    const cap = e.target.closest('.cap');
    if (!cap || e.target.closest('.rep')) return;
    longPressed = false;
    pressStart = { x: e.clientX, y: e.clientY };
    pressTimer = setTimeout(() => { longPressed = true; onLongPress(+cap.dataset.i); }, LONG_PRESS_MS);
  });
  const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
  caps.addEventListener('pointermove', (e) => {
    if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) cancelPress();
  });
  caps.addEventListener('pointerup', cancelPress);
  caps.addEventListener('pointercancel', cancelPress);
  caps.addEventListener('contextmenu', (e) => { if (e.target.closest('.cap')) e.preventDefault(); });
  caps.addEventListener('click', (e) => {
    const rep = e.target.closest('[data-rep]');
    if (rep) {
      const i = +rep.dataset.rep;
      S.rangeAnchor = null;
      if (engine.mode === 'one' && engine.target === i) engine.stop(); else engine.repeatOne(i);
      return;
    }
    const cap = e.target.closest('.cap');
    if (!cap) return;
    if (longPressed) { longPressed = false; return; }
    const i = +cap.dataset.i;
    if (S.rangeAnchor != null) { finishRange(i); return; }
    engine.goTo(i);
    A().play();
    S.userScrollAt = 0;
  });

  function onLongPress(i) {
    try { navigator.vibrate?.(15); } catch { /* not allowed */ }
    if (S.rangeAnchor == null) { S.rangeAnchor = i; updateLoopUi(engine.snapshot()); }
    else finishRange(i);
  }
  function finishRange(i) {
    const a = S.rangeAnchor;
    S.rangeAnchor = null;
    if (a === i) { engine.repeatOne(i); return; }
    engine.setRange(a, i);
  }

  // ---------- title-bar actions ----------
  $('#speedBtn', view).addEventListener('click', chooseSpeed);
  $('#allBtn', view).addEventListener('click', () => {
    S.rangeAnchor = null;
    if (engine.mode === 'all') engine.stop(); else engine.setAll();
  });
  $('#loopStop', view).addEventListener('click', () => {
    S.rangeAnchor = null;
    engine.stop();
    updateLoopUi(engine.snapshot());
  });

  const favBtn = $('#favBtn', view);
  function renderFav() {
    const on = store.isFavorite(c.id);
    favBtn.innerHTML = on ? icons.heartFill : icons.heart;
    favBtn.classList.toggle('on', on);
    favBtn.setAttribute('aria-label', t(on ? 'player.unfav' : 'player.fav'));
    favBtn.setAttribute('aria-pressed', on);
  }
  favBtn.addEventListener('click', () => {
    const vd = A().getVideoData();
    const added = store.toggleFavorite({ ...c, title: c.title || vd.title, channel: c.channel || vd.author, duration: c.duration || A().getDuration() });
    renderFav(); toast(t(added ? 'fav.added' : 'fav.removed'));
  });

  function stepSentence(d) {
    if (!sentences.length) return;
    playback.stepSentence(d);
    S.userScrollAt = 0;
  }

  // ---------- view: muted synced video ⇄ cover only (sound never changes) ----------
  function renderSource() {
    const seg = view.querySelector('.seg');
    const canSwitch = playback.canShowVideo;
    seg.hidden = !canSwitch;
    view.querySelector('.src-row').classList.toggle('has-seg', canSwitch);
    const v = playback.showingVideo ? 'video' : 'audio';
    $$('[data-view]', view).forEach(b => {
      const on = b.dataset.view === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on);
    });
    $('#srcNote', view).textContent = playback.source !== 'audio' ? t('player.noBackground')
      : (playback.showingVideo ? t('audio.noteVideoBg') : t('audio.noteBg'));
  }
  view.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) playback.setView(b.dataset.view);
  });

  async function chooseSpeed() {
    const v = await sheet({ title: t('player.speed'), value: closestSpeed(A().getRate()), options: SPEEDS.map(s => ({ value: s, label: s + 'x' })) });
    if (v != null) { playback.setRate(v); renderSpeed(v); }
  }
  function renderSpeed(r = A().getRate()) {
    $('#speedBtn', view).textContent = `${closestSpeed(r)}x`;
  }

  function updateLoopUi(snap) {
    const allBtn = $('#allBtn', view);
    allBtn.classList.toggle('on', snap.mode === 'all');
    allBtn.setAttribute('aria-pressed', snap.mode === 'all');
    $$('.rep', caps).forEach(b => {
      const on = snap.mode === 'one' && +b.dataset.rep === snap.target;
      b.classList.toggle('on', on);
      b.setAttribute('aria-label', t(on ? 'player.stopRepeat' : 'player.repeatThis'));
    });
    $$('.cap', caps).forEach((el, i) => {
      el.classList.toggle('in-range', snap.mode === 'range' && i >= snap.range.a && i <= snap.range.b);
      el.classList.toggle('range-anchor', S.rangeAnchor === i);
    });
    const count = store.settings.repeatCount;
    let msg = '';
    if (S.rangeAnchor != null) msg = t('player.status.rangePick', { a: S.rangeAnchor + 1 });
    else if (snap.waiting) msg = t('player.status.waiting');
    else if (snap.mode === 'one') msg = t('player.status.one', { i: snap.target + 1, c: count ? t('player.times', { n: snap.pass, max: count }) : t('player.timesInf', { n: snap.pass }) });
    else if (snap.mode === 'range') msg = t('player.status.range', { a: snap.range.a + 1, b: snap.range.b + 1 });
    else if (snap.mode === 'all') msg = t('player.status.all');
    $('#loopText', view).textContent = msg;
    loopStatus.hidden = !msg;
  }

  // ---------- keyboard (desktop) ----------
  const onKey = (e) => {
    if (e.target.closest('input, select, textarea, .sheet')) return;
    const skip = +store.settings.skipSeconds || 10;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); playback.togglePlay(); }
    else if (e.key === 'ArrowLeft') playback.skip(-skip);
    else if (e.key === 'ArrowRight') playback.skip(skip);
    else if (e.key === 'ArrowUp') { e.preventDefault(); stepSentence(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); stepSentence(1); }
    else if (e.key === 'r' && sentences.length) engine.mode === 'one' ? engine.stop() : engine.repeatOne(Math.max(0, engine.indexAt(A().getTime())));
    else if (e.key === 'Escape' && (engine.mode !== 'off' || S.rangeAnchor != null)) { S.rangeAnchor = null; engine.stop(); updateLoopUi(engine.snapshot()); }
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));

  // ---------- subscriptions ----------
  cleanups.push(playback.on('sentence', markSentence));
  cleanups.push(playback.on('loop', (snap) => {
    updateLoopUi(snap);
    if (snap.reason === 'done') toast(t('player.mode.off'));
  }));
  cleanups.push(playback.on('rate', (r) => renderSpeed(r)));
  cleanups.push(playback.on('error', () => renderCaptions()));
  cleanups.push(playback.on('ready', () => fillTitle()));
  cleanups.push(playback.on('view', renderSource));
  cleanups.push(playback.on('source', () => {
    renderSource();
    renderSpeed();
    renderCaptionList();
    updateLoopUi(engine.snapshot());
  }));

  function fillTitle() {
    if (c.title) return;
    const vd = A().getVideoData();
    if (vd.title) {
      c.title = vd.title; c.channel = c.channel || vd.author;
      $('#pTitle', view).textContent = c.title; $('#pChannel', view).textContent = c.channel || '';
      store.putMeta({ id: c.id, title: c.title, channel: c.channel, thumb: c.thumb, duration: A().getDuration() });
    }
  }

  renderFav();
  renderSource();
  renderSpeed(store.settings.rate);
  renderCaptions();
  fillTitle();
  setTimeout(fillTitle, 1500);
  document.title = (c.title ? c.title + ' · ' : '') + 'ListenLoop';
  if (!result.reused && playback.audioFailed) toast(t('audio.fallback'), 3500);
  else if (!result.reused && result.resumedAt > 0) toast(t('player.resumed', { t: fmtTime(result.resumedAt) }));
  playback.tick();
  markSentence(engine.currentIndex(A().getTime()));
  S.userScrollAt = 0;
  scrollToCurrent(true);

  return () => {
    cleanups.forEach(fn => fn());
    document.title = 'ListenLoop';
  };
}

function closestSpeed(r) {
  return SPEEDS.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a), 1);
}
