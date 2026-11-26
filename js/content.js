// Content lookup: built-in demo content (with bilingual captions) + cached YouTube metadata.
import { store } from './store.js';
import { fromSentenceObjects } from './captions/sync.js';
import { getVideos, hasKey } from './youtube/search.js';

let demoIndex = null;
const captionCache = new Map();

export async function getDemoIndex() {
  if (demoIndex) return demoIndex;
  try {
    const res = await fetch('data/demo/index.json');
    if (!res.ok) throw new Error(res.status);
    demoIndex = (await res.json()).items || [];
  } catch (e) {
    console.warn('demo index unavailable', e);
    demoIndex = [];
  }
  return demoIndex;
}

/** Returns content meta {id,title,channel,thumb,duration,isDemo,level,...} or a minimal stub. */
export async function getContent(id) {
  const demo = (await getDemoIndex()).find(d => d.id === id);
  if (demo) return { ...demo, isDemo: true, thumb: demo.thumb || ytThumb(id) };
  const cached = store.getMeta(id);
  if (cached) return cached;
  if (hasKey()) {
    try {
      const [v] = await getVideos([id]);
      if (v) { store.putMeta(v); return v; }
    } catch { /* fall through to stub */ }
  }
  return { id, title: '', channel: '', thumb: ytThumb(id), duration: 0, isDemo: false };
}

/** Sentences for a content id, or [] when no captions exist (demo only in the prototype). */
export async function getCaptions(id) {
  if (captionCache.has(id)) return captionCache.get(id);
  const demo = (await getDemoIndex()).find(d => d.id === id);
  if (!demo?.captions) { captionCache.set(id, []); return []; }
  try {
    const res = await fetch(demo.captions);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const list = fromSentenceObjects(data.sentences);
    // overlay runtime translations for sentences missing Chinese
    const extra = store.getTranslations(id);
    list.forEach(s => { if (!s.zh && extra[s.index]) s.zh = extra[s.index]; });
    list.timing = data.timing || '';   // 'estimated' = auto-aligned, not yet hand-reviewed
    captionCache.set(id, list);
    return list;
  } catch (e) {
    console.warn('captions failed', e);
    return null; // null = load error (distinct from "no captions")
  }
}

export const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
