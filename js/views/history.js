import { esc, fmtDate, fmtTime, toast } from '../util.js';
import { t, lang } from '../i18n.js';
import { icons, backHomeHtml } from '../icons.js';
import { store } from '../store.js';
import { thumbHtml, emptyHtml } from '../components.js';

export function renderHistory(view) {
  function render() {
    const items = store.historyList;
    const total = Math.round(items.reduce((a, h) => a + (h.listenedSec || 0), 0) / 60);
    view.innerHTML = `
      <header class="page-head">${backHomeHtml(esc(t('player.back')))}<h1>${esc(t('hist.title'))}</h1>
        ${items.length ? `<button type="button" class="btn ghost danger" id="clearHist">${esc(t('hist.clear'))}</button>` : ''}</header>
      ${items.length ? `<p class="tiny" style="margin:0 0 12px">${esc(t('hist.listened', { m: total }))}</p>` : ''}
      ${items.length ? `<div class="list">${items.map(h => {
        const pct = h.duration ? Math.min(100, Math.round((h.time / h.duration) * 100)) : 0;
        return `<div class="row">
          <a href="#/player/${esc(h.id)}" style="display:contents">${thumbHtml(h, h)}</a>
          <div class="body">
            <a href="#/player/${esc(h.id)}" style="color:inherit;text-decoration:none"><div class="t">${esc(h.title || h.id)}</div></a>
            <div class="ch">${esc(h.channel || '')}</div>
            <div class="m">${esc(t('hist.lastAt', { d: fmtDate(h.lastPlayedAt, lang()), t: fmtTime(h.time) }))} · ${esc(t('hist.progress', { p: pct }))}</div>
            <div class="actions">
              <a class="icon-btn" href="#/player/${esc(h.id)}" aria-label="${esc(t('player.play'))}">${icons.play}</a>
              <button type="button" class="icon-btn" data-remove="${esc(h.id)}" aria-label="${esc(t('hist.remove'))}">${icons.trash}</button>
            </div>
          </div></div>`;
      }).join('')}</div>` : emptyHtml(t('hist.empty'), 'history')}`;
  }
  view.onclick = (e) => {
    const r = e.target.closest('[data-remove]');
    if (r) { store.removeHistory(r.dataset.remove); render(); }
    if (e.target.closest('#clearHist') && confirm(t('hist.clearConfirm'))) { store.clearHistory(); toast(t('hist.cleared')); render(); }
  };
  render();
  return () => { view.onclick = null; };
}
