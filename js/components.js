// Shared list items.
import { esc, fmtTime, fmtCount, fmtDate } from './util.js';
import { t, lang } from './i18n.js';
import { icons } from './icons.js';

export function thumbHtml(item, progress) {
  const pct = progress && item.duration ? Math.min(100, Math.round((progress.time / item.duration) * 100)) : 0;
  return `<div class="thumb">
    ${item.thumb ? `<img src="${esc(item.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
    ${item.duration ? `<span class="dur">${fmtTime(item.duration)}</span>` : ''}
    ${pct ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}
  </div>`;
}

/** Horizontal card (rails). */
export function cardHtml(item, { progress, meta } = {}) {
  return `<a class="card-v" href="#/player/${esc(item.id)}">
    ${thumbHtml(item, progress)}
    <div class="t">${esc(item.title)}</div>
    <div class="m">${meta ?? esc(item.channel || '')}</div>
  </a>`;
}

/** Search-result row: thumbnail, title, channel (+avatar), views, duration, date. */
export function videoRowHtml(v) {
  const bits = [];
  if (v.views) bits.push(t('meta.views', { n: fmtCount(v.views, lang()) }));
  if (v.publishedAt) bits.push(fmtDate(v.publishedAt, lang()));
  return `<a class="row" href="#/player/${esc(v.id)}" data-id="${esc(v.id)}">
    ${thumbHtml(v)}
    <div class="body">
      <div class="t">${esc(v.title)}</div>
      <div class="ch">${v.channelThumb ? `<img src="${esc(v.channelThumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${esc(v.channel)}</span></div>
      <div class="m">${bits.map(esc).join(' · ')}</div>
      ${v.isDemo ? `<div class="m">${v.level ? `<span class="badge gray">CEFR ${esc(v.level)}</span> ` : ''}<span class="badge">${esc(t('meta.captioned'))}</span></div>` : ''}
    </div>
  </a>`;
}

export function channelHtml(c) {
  return `<button type="button" class="channel" data-channel="${esc(c.id)}" data-title="${esc(c.title)}">
    <img src="${esc(c.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">
    <div class="n">${esc(c.title)}</div>
    ${c.subs != null ? `<div class="s">${esc(t('meta.subs', { n: fmtCount(c.subs, lang()) }))}</div>` : ''}
  </button>`;
}

export function emptyHtml(msg, icon = 'music') {
  return `<div class="empty">${icons[icon]}<div>${esc(msg)}</div></div>`;
}

export function noticeHtml(msg, kind = '') {
  return `<div class="notice ${kind}">${kind === 'info' ? icons.info : icons.alert}<div>${msg}</div></div>`;
}
