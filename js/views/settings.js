import { esc, toast, $ } from '../util.js';
import { t } from '../i18n.js';
import { store, DEFAULT_SETTINGS } from '../store.js';
import { testKey, hasKey } from '../youtube/search.js';
import { testProvider, translationStatus } from '../translate/index.js';
import { APP_VERSION, applyTheme } from '../theme.js';
import { backHomeHtml } from '../icons.js';

export function renderSettings(view, rerender) {
  const st = store.settings;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  const sw = (key, label, hint = '') => `<div class="field"><label for="sw-${key}">${esc(label)}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>
    <span class="switch"><input type="checkbox" id="sw-${key}" data-key="${key}" data-type="bool" ${st[key] ? 'checked' : ''}><span></span></span></div>`;
  const skipPreset = [5, 10, 15, 30];
  const isCustomSkip = !skipPreset.includes(+st.skipSeconds);
  const ytStatus = hasKey() ? 'ok' : 'pending';
  // colour swatches show the current theme colour when no custom colour is set
  const cssHex = (name, fallback) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    const m = v.match(/\d+/g);
    return m && m.length >= 3 ? '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('') : fallback;
  };
  const capSwatch = st.capColor || cssHex('--cap-en', '#15191e');
  const hlSwatch = st.hlColor || cssHex('--hl', '#fff4c2');
  const trStatus = translationStatus();

  view.innerHTML = `
    <header class="page-head">${backHomeHtml(esc(t('player.back')))}<h1>${esc(t('set.title'))}</h1></header>

    <div class="group-title">${esc(t('set.account'))}</div>
    <div class="group"><div class="field"><span class="lbl">${esc(t('set.accountNote'))}</span><span class="status pending">${esc(t('set.nextPhase'))}</span></div></div>

    <div class="group-title">${esc(t('set.notifications'))}</div>
    <div class="group"><div class="field"><span class="lbl">${esc(t('set.notificationsNote'))}</span><span class="status pending">${esc(t('set.nextPhase'))}</span></div></div>

    <div class="group-title">${esc(t('set.appearance'))}</div>
    <div class="group">
      <div class="field"><label for="theme">${esc(t('set.theme'))}</label>
        <select id="theme" data-key="theme">${['system', 'light', 'dark'].map(v => opt(v, t('set.theme.' + v), st.theme)).join('')}</select></div>
      <div class="field"><label for="capMode">${esc(t('player.captions'))}</label>
        <select id="capMode" data-key="capMode">${['both', 'en', 'zh', 'blind'].map(v => opt(v, t(v === 'blind' ? 'player.show.blindEn' : 'player.show.' + v), st.capMode)).join('')}</select></div>
      <div class="field"><label for="fontScale">${esc(t('set.fontScale'))}</label>
        <select id="fontScale" data-key="fontScale" data-type="num">${[[0.85, 'S'], [1, 'M'], [1.15, 'L'], [1.3, 'XL'], [1.45, 'XXL']].map(([v, l]) => opt(v, l, st.fontScale)).join('')}</select></div>
      <div class="field"><label for="capColor">${esc(t('set.capColor'))}</label>
        <span><input type="color" id="capColor" data-key="capColor" value="${esc(capSwatch)}"> <button type="button" class="btn ghost" data-reset="capColor">${esc(t('set.resetColor'))}</button></span></div>
      <div class="field"><label for="hlColor">${esc(t('set.hlColor'))}</label>
        <span><input type="color" id="hlColor" data-key="hlColor" value="${esc(hlSwatch)}"> <button type="button" class="btn ghost" data-reset="hlColor">${esc(t('set.resetColor'))}</button></span></div>
    </div>

    <div class="group-title">${esc(t('set.playback'))}</div>
    <div class="group">
      <div class="field"><label for="skipSel">${esc(t('set.skip'))}</label>
        <span><select id="skipSel">${skipPreset.map(v => opt(v, t('player.sec', { n: v }), isCustomSkip ? '' : st.skipSeconds)).join('')}${opt('custom', t('set.custom'), isCustomSkip ? 'custom' : '')}</select>
        <input type="number" id="skipCustom" min="1" max="120" step="1" value="${esc(st.skipSeconds)}" style="width:72px" ${isCustomSkip ? '' : 'hidden'} aria-label="${esc(t('set.custom'))}"></span></div>
      <div class="field"><label for="repeatCount">${esc(t('set.repeatCount'))}</label>
        <select id="repeatCount" data-key="repeatCount" data-type="num">${[0, 1, 2, 3, 5, 10].map(v => opt(v, v ? v + '×' : t('player.infinite'), st.repeatCount)).join('')}</select></div>
      <div class="field"><label for="repeatInterval">${esc(t('set.repeatInterval'))}</label>
        <select id="repeatInterval" data-key="repeatInterval" data-type="num">${[0, 0.5, 1, 2, 3].map(v => opt(v, t('player.sec', { n: v }), st.repeatInterval)).join('')}</select></div>
      ${sw('autoNext', t('set.autoNext'), t('set.autoNextHint'))}
      ${sw('allAutoReplay', t('set.allAutoReplay'))}
      ${sw('preferAudio', t('set.preferAudio'), t('set.preferAudioHint'))}
    </div>

    <div class="group-title">${esc(t('set.gestures'))}</div>
    <div class="group"><div class="field"><span class="lbl tiny" style="font-size:13px">${esc(t('set.gesturesNote'))}</span></div></div>

    <div class="group-title">${esc(t('set.language'))}</div>
    <div class="group">
      <div class="field"><label for="lang">${esc(t('set.uiLang'))}</label>
        <select id="lang" data-key="lang">${opt('zh-TW', '繁體中文', st.lang)}${opt('en', 'English', st.lang)}</select></div>
    </div>

    <div class="group-title">${esc(t('set.services'))}</div>
    <div class="group">
      <div class="field"><span class="lbl tiny" style="font-size:13px">${esc(t('set.servicesNote'))}</span></div>
      <div class="field col">
        <label for="ytKey">${esc(t('set.ytKey'))} <span class="status ${ytStatus === 'ok' ? 'ok' : 'pending'}" id="ytStatus">${esc(t(ytStatus === 'ok' ? 'set.ok' : 'set.pending'))}</span>
          <span class="hint">${esc(t('set.ytKeyHint'))}</span></label>
        <div style="display:flex;gap:8px"><input type="password" id="ytKey" data-key="ytKey" data-lazy autocomplete="off" spellcheck="false" value="${esc(st.ytKey)}" style="flex:1">
          <button type="button" class="btn" id="ytTest">${esc(t('set.test'))}</button></div>
      </div>
      <div class="field"><label for="trProvider">${esc(t('set.trProvider'))} <span class="status ${trStatus === 'ready' ? 'ok' : 'pending'}" id="trStatus">${esc(t(trStatus === 'ready' ? 'set.ok' : 'set.pending'))}</span>
        ${st.trProvider !== 'none' ? `<span class="hint">${esc(t('set.trHint.' + st.trProvider))}</span>` : ''}</label>
        <select id="trProvider" data-key="trProvider">${['microsoft', 'gemini', 'none'].map(v => opt(v, t('set.tr.' + v), st.trProvider)).join('')}</select></div>
      ${st.trProvider === 'microsoft' ? `
        <div class="field col"><label for="msKey">${esc(t('set.msKey'))}</label>
          <input type="password" id="msKey" data-key="msKey" data-lazy autocomplete="off" spellcheck="false" value="${esc(st.msKey)}"></div>
        <div class="field col"><label for="msRegion">${esc(t('set.msRegion'))}</label>
          <input type="text" id="msRegion" data-key="msRegion" data-lazy autocomplete="off" spellcheck="false" value="${esc(st.msRegion)}"></div>` : ''}
      ${st.trProvider === 'gemini' ? `
        <div class="field col"><label for="geminiKey">${esc(t('set.geminiKey'))}<span class="hint">${esc(t('set.geminiNote'))}</span></label>
          <input type="password" id="geminiKey" data-key="geminiKey" data-lazy autocomplete="off" spellcheck="false" value="${esc(st.geminiKey)}"></div>
        <div class="field col"><label for="geminiModel">${esc(t('set.geminiModel'))}</label>
          <input type="text" id="geminiModel" data-key="geminiModel" data-lazy autocomplete="off" spellcheck="false" value="${esc(st.geminiModel)}"></div>` : ''}
      ${st.trProvider !== 'none' ? `<div class="field"><span class="lbl" id="trResult"></span><button type="button" class="btn" id="trTest">${esc(t('set.test'))}</button></div>` : ''}
    </div>

    <div class="group-title">${esc(t('set.about'))}</div>
    <div class="group">
      <div class="field"><span class="lbl">${esc(t('set.version'))}</span><span class="muted">${esc(APP_VERSION)}</span></div>
      <div class="field col"><span class="lbl">${esc(t('set.privacy'))}<span class="hint">${esc(t('set.privacyText'))}</span></span></div>
      <div class="field col"><span class="lbl">${esc(t('set.terms'))}<span class="hint">${esc(t('set.termsText'))}</span></span></div>
      <div class="field col"><span class="lbl">${esc(t('set.feedback'))}<span class="hint">${esc(t('set.feedbackText'))}</span></span></div>
    </div>

    <div class="group-title">${esc(t('set.dev'))}</div>
    <div class="group">
      <div class="field"><a href="tests.html" target="_blank" rel="noopener">${esc(t('set.tests'))}</a></div>
      <div class="field"><a href="tools/caption-timer.html" target="_blank" rel="noopener">${esc(t('set.timer'))}</a></div>
      <div class="field"><button type="button" class="btn" id="resetSettings">${esc(t('set.reset'))}</button></div>
      <div class="field"><button type="button" class="btn danger" id="clearAll">${esc(t('set.clearAll'))}</button></div>
    </div>`;

  const commit = (el) => {
    const key = el.dataset.key;
    if (!key || !(key in DEFAULT_SETTINGS)) return;
    let v = el.dataset.type === 'bool' ? el.checked : el.value;
    if (el.dataset.type === 'num') v = +v;
    if (typeof v === 'string' && el.dataset.lazy) v = v.trim();
    if (store.settings[key] === v) return;
    store.setSetting(key, v);
    if (['theme', 'fontScale', 'capColor', 'hlColor', 'capMode'].includes(key)) applyTheme();
    if (key === 'lang' || key === 'trProvider') { rerender(); return; }
    if (key === 'ytKey') setStatus('ytStatus', v ? 'ok' : 'pending');
    if (['msKey', 'geminiKey', 'trProvider'].includes(key)) setStatus('trStatus', translationStatus() === 'ready' ? 'ok' : 'pending');
    toast(t('common.saved'), 1000);
  };
  view.addEventListener('change', (e) => {
    if (e.target.id === 'skipSel') {
      const c = $('#skipCustom', view);
      if (e.target.value === 'custom') { c.hidden = false; c.focus(); return; }
      c.hidden = true; store.setSetting('skipSeconds', +e.target.value); toast(t('common.saved'), 1000); return;
    }
    if (e.target.id === 'skipCustom') {
      const n = Math.round(+e.target.value);
      if (n >= 1 && n <= 120) { store.setSetting('skipSeconds', n); toast(t('common.saved'), 1000); }
      return;
    }
    commit(e.target);
  });
  view.addEventListener('input', (e) => { if (e.target.type === 'color') commit(e.target); });

  view.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-reset]');
    if (r) { store.setSetting(r.dataset.reset, ''); applyTheme(); rerender(); return; }
    if (e.target.closest('#ytTest')) {
      commit($('#ytKey', view));
      const b = e.target.closest('#ytTest'); b.disabled = true; b.textContent = t('set.testing');
      try { await testKey(); setStatus('ytStatus', 'ok'); }
      catch (err) { setStatus('ytStatus', err.code === 'pending' ? 'pending' : 'err', err.code === 'quota' ? t('err.quota') : ''); }
      finally { b.disabled = false; b.textContent = t('set.test'); }
    }
    if (e.target.closest('#trTest')) {
      view.querySelectorAll('[data-lazy]').forEach(commit);
      const b = e.target.closest('#trTest'); b.disabled = true; b.textContent = t('set.testing');
      const out = $('#trResult', view);
      try { const zh = await testProvider(); out.textContent = `“Good morning, how are you?” → ${zh}`; setStatus('trStatus', 'ok'); }
      catch (err) { out.textContent = err.code === 'pending' ? t('set.pending') : `${t('set.err')}: ${err.message}`; setStatus('trStatus', err.code === 'pending' ? 'pending' : 'err'); }
      finally { b.disabled = false; b.textContent = t('set.test'); }
    }
    if (e.target.closest('#resetSettings')) { store.resetSettings(); applyTheme(); toast(t('set.resetDone')); rerender(); }
    if (e.target.closest('#clearAll') && confirm(t('set.clearAllConfirm'))) {
      try { localStorage.removeItem('listenloop:v1'); sessionStorage.removeItem('listenloop:ytcache'); } catch { /* ignore */ }
      location.reload();
    }
  });

  function setStatus(id, kind, extra = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'status ' + kind;
    el.textContent = t(kind === 'ok' ? 'set.ok' : kind === 'err' ? 'set.err' : 'set.pending') + (extra ? ' · ' + extra : '');
  }
}
