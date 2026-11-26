import { esc, parseYouTubeId, fmtTime, $ } from '../util.js';
import { t } from '../i18n.js';
import { icons } from '../icons.js';
import { store } from '../store.js';
import { getDemoIndex, ytThumb } from '../content.js';
import { cardHtml, videoRowHtml, channelHtml, emptyHtml, noticeHtml } from '../components.js';
import { searchVideos, searchChannels, hasKey } from '../youtube/search.js';

// Module state survives navigation so "back" from the player keeps the results.
const S = {
  q: '', tab: 'all', level: 'all',
  videos: [], videoToken: '', channels: [], channelToken: '',
  channel: null,            // { id, title } when browsing a channel
  chVideos: [], chToken: '',
  loading: false, error: null, searched: false,
};

export async function renderHome(view) {
  const demos = await getDemoIndex();
  view.innerHTML = `
    <header class="page-head">
      <div class="brand">${icons.logo}<div><b>ListenLoop</b><div class="tiny">${esc(t('app.tagline'))}</div></div></div>
      <div class="head-actions">
        <a class="icon-btn" href="#/favorites" aria-label="${esc(t('nav.favorites'))}" title="${esc(t('nav.favorites'))}">${icons.heart}</a>
        <a class="icon-btn" href="#/settings" aria-label="${esc(t('nav.settings'))}" title="${esc(t('nav.settings'))}">${icons.settings}</a>
      </div>
    </header>
    <form class="search" role="search" id="searchForm">
      ${icons.search}
      <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(t('home.searchPh'))}" value="${esc(S.q)}" aria-label="${esc(t('home.searchPh'))}">
      <button type="button" class="icon-btn" id="clearQ" aria-label="clear" ${S.q ? '' : 'hidden'}>${icons.x}</button>
    </form>
    <div class="chips search-tabs" role="tablist">
      ${['all', 'videos', 'channels'].map(k => `<button type="button" role="tab" class="chip ${S.tab === k ? 'on' : ''}" data-tab="${k}" aria-selected="${S.tab === k}">${esc(t('home.tab.' + k))}</button>`).join('')}
    </div>
    <div id="results"></div>
    <div id="discover"></div>`;

  const form = $('#searchForm', view), input = $('#q', view), clearBtn = $('#clearQ', view);
  form.addEventListener('submit', (e) => { e.preventDefault(); input.blur(); runSearch(input.value); });
  input.addEventListener('input', () => { clearBtn.hidden = !input.value; renderResults(); });
  clearBtn.addEventListener('click', () => {
    input.value = ''; S.q = ''; S.searched = false; S.videos = []; S.channels = []; S.channel = null; S.error = null;
    clearBtn.hidden = true; input.focus(); renderAll();
  });
  view.querySelectorAll('.search-tabs .chip').forEach(b => b.addEventListener('click', () => {
    S.tab = b.dataset.tab;
    view.querySelectorAll('.search-tabs .chip').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    if (S.q && hasKey() && !S.channel) runSearch(S.q, { keepTab: true }); else renderAll();
  }));

  const results = $('#results', view), discover = $('#discover', view);

  results.addEventListener('click', (e) => {
    const ch = e.target.closest('[data-channel]');
    if (ch) { openChannel({ id: ch.dataset.channel, title: ch.dataset.title }); return; }
    const more = e.target.closest('[data-more]');
    if (more) loadMore(more.dataset.more);
    if (e.target.closest('#backToResults')) { S.channel = null; renderAll(); }
    const row = e.target.closest('a.row[data-id]');
    if (row) {
      const v = [...S.videos, ...S.chVideos].find(x => x.id === row.dataset.id);
      if (v) store.putMeta(v);
    }
  });
  discover.addEventListener('click', (e) => {
    const lv = e.target.closest('[data-level]');
    if (lv) { S.level = lv.dataset.level; renderDiscover(); }
  });

  function renderAll() { renderResults(); renderDiscover(); }

  function renderResults() {
    const raw = input.value.trim();
    const directId = parseYouTubeId(raw);
    let html = '';
    if (directId && raw.length >= 11 && !/\s/.test(raw)) {
      html += `<h2 class="section">${esc(t('home.openUrl'))}</h2>
        <div class="list">${videoRowHtml({ id: directId, title: `youtu.be/${directId}`, channel: 'YouTube', thumb: ytThumb(directId) })}</div>`;
      results.innerHTML = html;
      return;
    }
    if (!S.searched && !S.channel) { results.innerHTML = ''; return; }
    if (!hasKey()) { results.innerHTML = `<div style="margin-top:12px">${noticeHtml(esc(t('home.searchPending')))}</div>`; return; }
    if (S.channel) {
      html += `<h2 class="section"><button type="button" class="btn ghost" id="backToResults">${icons.back}${esc(t('home.back'))}</button><small>${esc(S.channel.title)}</small></h2>`;
      html += S.chVideos.length ? `<div class="list">${S.chVideos.map(videoRowHtml).join('')}</div>` : (S.loading ? '' : emptyHtml(t('home.noResults'), 'search'));
      if (S.chToken && !S.loading) html += `<div class="more"><button class="btn" type="button" data-more="ch">${esc(t('home.loadMore'))}</button></div>`;
    } else {
      if (S.error) html += `<div style="margin-top:12px">${noticeHtml(esc(S.error))}</div>`;
      const showCh = S.tab === 'all' || S.tab === 'channels';
      const showV = S.tab === 'all' || S.tab === 'videos';
      if (showCh && S.channels.length) {
        html += `<h2 class="section">${esc(t('home.channels'))}</h2><div class="channels">${S.channels.map(channelHtml).join('')}</div>`;
        if (S.tab === 'channels' && S.channelToken && !S.loading) html += `<div class="more"><button class="btn" type="button" data-more="channels">${esc(t('home.loadMore'))}</button></div>`;
      }
      if (showV && S.videos.length) {
        html += `<h2 class="section">${esc(t('home.videos'))}</h2><div class="list">${S.videos.map(videoRowHtml).join('')}</div>`;
        if (S.videoToken && !S.loading) html += `<div class="more"><button class="btn" type="button" data-more="videos">${esc(t('home.loadMore'))}</button></div>`;
      }
      if (!S.loading && !S.error && S.searched && !((showCh && S.channels.length) || (showV && S.videos.length))) html += emptyHtml(t('home.noResults'), 'search');
    }
    if (S.loading) html += '<div class="spinner" role="progressbar"></div>';
    results.innerHTML = html;
  }

  function renderDiscover() {
    if (S.searched || S.channel) { discover.innerHTML = ''; return; }
    const hist = store.historyList.slice(0, 8);
    const favs = store.favorites.slice(0, 8);
    const levels = [...new Set(demos.map(d => d.level).filter(Boolean))].sort();
    const shown = demos.filter(d => S.level === 'all' || d.level === S.level || (S.level === 'short' && d.duration <= 300));
    let html = '';
    if (!hasKey()) html += `<div style="margin-top:14px">${noticeHtml(esc(t('home.searchPending')), 'info')}</div>`;
    if (hist.length) {
      html += `<h2 class="section">${esc(t('home.continue'))}<a class="tiny" href="#/history">${esc(t('home.allHistory'))}</a></h2><div class="rail">${hist.map(h =>
        cardHtml(h, { progress: h, meta: esc(`${h.channel || ''}${h.channel ? ' · ' : ''}${fmtTime(h.time)} / ${fmtTime(h.duration)}`) })).join('')}</div>`;
    }
    html += `<h2 class="section">${esc(t('home.recommended'))}<small>${esc(t('home.recommendedSub'))}</small></h2>`;
    if (levels.length) {
      html += `<div class="chips" style="margin-bottom:10px">
        <button type="button" class="chip ${S.level === 'all' ? 'on' : ''}" data-level="all">${esc(t('home.filter.all'))}</button>
        ${levels.map(l => `<button type="button" class="chip ${S.level === l ? 'on' : ''}" data-level="${esc(l)}">CEFR ${esc(l)}</button>`).join('')}
        <button type="button" class="chip ${S.level === 'short' ? 'on' : ''}" data-level="short">${esc(t('home.filter.short'))}</button>
      </div>`;
    }
    html += shown.length
      ? `<div class="list">${shown.map(d => videoRowHtml({ ...d, isDemo: true, thumb: d.thumb || ytThumb(d.id) })).join('')}</div>`
      : emptyHtml(t('home.noResults'), 'music');
    if (favs.length) {
      html += `<h2 class="section">${esc(t('home.favorites'))}<a class="tiny" href="#/favorites">${esc(t('home.seeAll'))}</a></h2>
        <div class="rail">${favs.map(f => cardHtml(f, { progress: store.getProgress(f.id) })).join('')}</div>`;
    }
    discover.innerHTML = html;
  }

  async function runSearch(q, { keepTab = false } = {}) {
    q = q.trim();
    S.q = q;
    const directId = parseYouTubeId(q);
    if (directId && !/\s/.test(q)) { location.hash = '#/player/' + directId; return; }
    if (!q) { S.searched = false; renderAll(); return; }
    S.searched = true; S.channel = null; S.error = null;
    if (!keepTab) { /* keep current tab */ }
    renderDiscover();
    if (!hasKey()) { renderResults(); return; }
    S.loading = true; S.videos = []; S.channels = []; renderResults();
    try {
      const wantV = S.tab !== 'channels', wantC = S.tab !== 'videos';
      const [v, c] = await Promise.all([
        wantV ? searchVideos(q) : Promise.resolve({ items: [], nextPageToken: '' }),
        wantC ? searchChannels(q) : Promise.resolve({ items: [], nextPageToken: '' }),
      ]);
      if (S.q !== q) return;
      S.videos = v.items; S.videoToken = v.nextPageToken;
      S.channels = c.items; S.channelToken = c.nextPageToken;
    } catch (e) {
      S.error = errMsg(e);
    } finally {
      S.loading = false;
      renderResults();
    }
  }

  async function openChannel(ch) {
    S.channel = ch; S.chVideos = []; S.chToken = ''; S.loading = true; renderAll();
    try {
      const r = await searchVideos('', '', { channelId: ch.id });
      S.chVideos = r.items; S.chToken = r.nextPageToken;
    } catch (e) { S.error = errMsg(e); S.channel = null; }
    finally { S.loading = false; renderResults(); window.scrollTo({ top: 0 }); }
  }

  async function loadMore(which) {
    S.loading = true; renderResults();
    try {
      if (which === 'videos') { const r = await searchVideos(S.q, S.videoToken); S.videos.push(...r.items); S.videoToken = r.nextPageToken; }
      if (which === 'channels') { const r = await searchChannels(S.q, S.channelToken); S.channels.push(...r.items); S.channelToken = r.nextPageToken; }
      if (which === 'ch') { const r = await searchVideos('', S.chToken, { channelId: S.channel.id }); S.chVideos.push(...r.items); S.chToken = r.nextPageToken; }
    } catch (e) { S.error = errMsg(e); }
    finally { S.loading = false; renderResults(); }
  }

  renderAll();
}

function errMsg(e) {
  switch (e?.code) {
    case 'quota': return t('err.quota');
    case 'key': return t('err.key');
    case 'offline': return t('common.offline');
    case 'pending': return t('home.searchPending');
    default: return t('err.network');
  }
}
