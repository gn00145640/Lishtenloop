// YouTube Data API v3 client (prototype: key from Settings, stored in this browser only).
// Quota: search.list = 100 units, videos.list / channels.list = 1 unit. Results are cached
// for 6 hours to save quota.
import { store } from '../store.js';
import { parseIsoDuration } from '../util.js';

const BASE = 'https://www.googleapis.com/youtube/v3/';
const TTL = 6 * 3600 * 1000;
const CACHE_KEY = 'listenloop:ytcache';

export class YouTubeApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const hasKey = () => !!store.settings.ytKey;

function cacheGet(k) {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}')[k];
    return c && Date.now() - c.at < TTL ? c.v : null;
  } catch { return null; }
}
function cachePut(k, v) {
  try {
    const all = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
    all[k] = { at: Date.now(), v };
    const keys = Object.keys(all);
    if (keys.length > 60) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 60).forEach(x => delete all[x]);
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

async function call(endpoint, params, { noCache = false } = {}) {
  const key = store.settings.ytKey;
  if (!key) throw new YouTubeApiError('pending', 'YouTube API key not configured');
  const qs = new URLSearchParams({ ...params, key });
  const cacheKey = endpoint + '?' + new URLSearchParams(params).toString();
  const cached = noCache ? null : cacheGet(cacheKey);
  if (cached) return cached;
  if (!navigator.onLine) throw new YouTubeApiError('offline', 'offline');
  let res;
  try { res = await fetch(BASE + endpoint + '?' + qs); }
  catch { throw new YouTubeApiError('network', 'network'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason || '';
    if (/quota/i.test(reason)) throw new YouTubeApiError('quota', reason);
    if (res.status === 400 || res.status === 403) throw new YouTubeApiError('key', data.error?.message || reason);
    throw new YouTubeApiError('http', data.error?.message || `HTTP ${res.status}`);
  }
  cachePut(cacheKey, data);
  return data;
}

const pickThumb = (th) => th?.medium?.url || th?.high?.url || th?.default?.url || '';

/** Search videos. Returns { items:[video], nextPageToken } with details (views, duration, channel avatar). */
export async function searchVideos(q, pageToken = '', { channelId } = {}) {
  const params = {
    part: 'snippet', type: 'video', maxResults: '15', q, safeSearch: 'moderate',
    relevanceLanguage: 'en', videoEmbeddable: 'true',
  };
  if (pageToken) params.pageToken = pageToken;
  if (channelId) { params.channelId = channelId; params.order = 'date'; if (!q) delete params.q; }
  const data = await call('search', params);
  const ids = (data.items || []).map(i => i.id?.videoId).filter(Boolean);
  const items = await getVideos(ids);
  return { items, nextPageToken: data.nextPageToken || '', total: data.pageInfo?.totalResults || 0 };
}

/** videos.list for up to 50 ids, plus channel avatars. */
export async function getVideos(ids) {
  if (!ids.length) return [];
  const data = await call('videos', { part: 'snippet,contentDetails,statistics,status', id: ids.join(',') });
  const byId = Object.fromEntries((data.items || []).map(v => [v.id, v]));
  const chIds = [...new Set((data.items || []).map(v => v.snippet.channelId))];
  const avatars = chIds.length ? await getChannelAvatars(chIds) : {};
  return ids.filter(id => byId[id]).map(id => {
    const v = byId[id];
    return {
      id, title: v.snippet.title, channel: v.snippet.channelTitle, channelId: v.snippet.channelId,
      channelThumb: avatars[v.snippet.channelId] || '', thumb: pickThumb(v.snippet.thumbnails),
      duration: parseIsoDuration(v.contentDetails?.duration), views: +v.statistics?.viewCount || 0,
      publishedAt: v.snippet.publishedAt, embeddable: v.status?.embeddable !== false,
      hasCaptions: v.contentDetails?.caption === 'true',
    };
  });
}

async function getChannelAvatars(ids) {
  const data = await call('channels', { part: 'snippet', id: ids.join(',') });
  return Object.fromEntries((data.items || []).map(c => [c.id, pickThumb(c.snippet.thumbnails)]));
}

/** Search channels → [{id,title,thumb,subs}] */
export async function searchChannels(q, pageToken = '') {
  const params = { part: 'snippet', type: 'channel', maxResults: '12', q };
  if (pageToken) params.pageToken = pageToken;
  const data = await call('search', params);
  const ids = (data.items || []).map(i => i.id?.channelId || i.snippet?.channelId).filter(Boolean);
  if (!ids.length) return { items: [], nextPageToken: '' };
  const det = await call('channels', { part: 'snippet,statistics', id: ids.join(',') });
  const byId = Object.fromEntries((det.items || []).map(c => [c.id, c]));
  const items = ids.filter(id => byId[id]).map(id => {
    const c = byId[id];
    return {
      id, title: c.snippet.title, thumb: pickThumb(c.snippet.thumbnails),
      subs: c.statistics?.hiddenSubscriberCount ? null : +c.statistics?.subscriberCount || 0,
    };
  });
  return { items, nextPageToken: data.nextPageToken || '' };
}

/** Lightweight key check (1 unit). */
export async function testKey() {
  await call('videos', { part: 'id', id: 'dQw4w9WgXcQ' }, { noCache: true });
  return true;
}
