import { esc, fmtDate, toast, $ } from '../util.js';
import { t, lang } from '../i18n.js';
import { icons, backHomeHtml } from '../icons.js';
import { store } from '../store.js';
import { thumbHtml, emptyHtml } from '../components.js';

const S = { q: '', sort: 'added' };

export function renderFavorites(view) {
  view.innerHTML = `
    <header class="page-head">${backHomeHtml(esc(t('player.back')))}<h1>${esc(t('fav.title'))}</h1></header>
    <div class="search">${icons.search}<input id="fq" type="search" placeholder="${esc(t('fav.searchPh'))}" value="${esc(S.q)}" aria-label="${esc(t('fav.searchPh'))}"></div>
    <div class="chips" style="margin:10px 0 14px" role="group" aria-label="sort">
      ${['added', 'played'].map(k => `<button type="button" class="chip ${S.sort === k ? 'on' : ''}" data-sort="${k}">${esc(t('fav.sort.' + k))}</button>`).join('')}
    </div>
    <div id="favList"></div>`;
  const list = $('#favList', view);

  function render() {
    const favs = store.favorites;
    if (!favs.length) { list.innerHTML = emptyHtml(t('fav.empty'), 'heart'); return; }
    const q = S.q.trim().toLowerCase();
    let items = favs.filter(f => !q || `${f.title} ${f.channel}`.toLowerCase().includes(q));
    items = items.map(f => ({ ...f, prog: store.getProgress(f.id) }));
    if (S.sort === 'added') items.sort((a, b) => b.addedAt - a.addedAt);
    else items.sort((a, b) => (b.prog?.lastPlayedAt || 0) - (a.prog?.lastPlayedAt || 0));
    if (!items.length) { list.innerHTML = emptyHtml(t('fav.noMatch'), 'search'); return; }
    list.innerHTML = `<div class="list">${items.map(f => `
      <div class="row">
        <a href="#/player/${esc(f.id)}" style="display:contents">${thumbHtml(f, f.prog)}</a>
        <div class="body">
          <a href="#/player/${esc(f.id)}" style="color:inherit;text-decoration:none"><div class="t">${esc(f.title || f.id)}</div></a>
          <div class="ch">${esc(f.channel || '')}</div>
          <div class="m">${esc(t('fav.addedOn', { d: fmtDate(f.addedAt, lang()) }))}${f.isDemo ? ` · <span class="badge">${esc(t('meta.captioned'))}</span>` : ''}</div>
          <div class="actions">
            <a class="icon-btn" href="#/player/${esc(f.id)}" aria-label="${esc(t('player.play'))}">${icons.play}</a>
            <button type="button" class="icon-btn" data-remove="${esc(f.id)}" aria-label="${esc(t('fav.remove'))}">${icons.trash}</button>
          </div>
        </div>
      </div>`).join('')}</div>`;
  }

  $('#fq', view).addEventListener('input', (e) => { S.q = e.target.value; render(); });
  view.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) { S.sort = s.dataset.sort; view.querySelectorAll('[data-sort]').forEach(b => b.classList.toggle('on', b === s)); render(); }
    const r = e.target.closest('[data-remove]');
    if (r) { store.removeFavorite(r.dataset.remove); toast(t('fav.removed')); render(); }
  });
  render();
}
