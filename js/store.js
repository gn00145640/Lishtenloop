// Local persistence (prototype: this browser only; cloud sync is a later phase).
// Everything is wrapped in try/catch: storage can be unavailable (private mode etc.).

const KEY = 'listenloop:v1';
const SCHEMA = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  // Appearance
  theme: 'system',            // system | light | dark
  lang: 'zh-TW',              // zh-TW | en
  fontScale: 1,               // 0.85 – 1.4
  capColor: '',               // '' = theme default
  hlColor: '',
  // Playback
  rate: 1,                    // remembered playback speed
  skipSeconds: 10,
  repeatCount: 0,             // 0 = infinite
  repeatInterval: 0,          // seconds between loops
  autoNext: false,            // after N repeats, move on to next sentence
  allAutoReplay: false,       // default Repeat All when opening content
  capMode: 'both',            // both | en | zh | blind (English blurred until played)
  demoView: 'video',          // demos (own audio): 'video' = muted synced video, 'audio' = cover only. Sound is the same either way.
  // Services (stored only in this browser)
  ytKey: '',
  trProvider: 'microsoft',    // microsoft | gemini | none
  msKey: '',
  msRegion: '',
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
});

function blank() {
  return { schema: SCHEMA, settings: { ...DEFAULT_SETTINGS }, favorites: [], history: {}, meta: {}, translations: {} };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const d = JSON.parse(raw);
    const b = blank();
    return {
      schema: SCHEMA,
      settings: { ...b.settings, ...(d.settings || {}) },
      favorites: Array.isArray(d.favorites) ? d.favorites : [],
      history: d.history && typeof d.history === 'object' ? d.history : {},
      meta: d.meta && typeof d.meta === 'object' ? d.meta : {},
      translations: d.translations && typeof d.translations === 'object' ? d.translations : {},
    };
  } catch {
    return blank();
  }
}

function save(what) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota / disabled */ }
  listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } });
}

export const store = {
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** For tests: replace in-memory state without touching other keys. */
  _reset(data) { state = data ? { ...blank(), ...data } : blank(); },
  _reload() { state = load(); },

  // ----- settings -----
  get settings() { return state.settings; },
  setSetting(key, value) {
    if (!(key in DEFAULT_SETTINGS)) throw new Error('Unknown setting ' + key);
    state.settings[key] = value;
    save('settings');
  },
  resetSettings() {
    const keep = { ytKey: state.settings.ytKey, msKey: state.settings.msKey, msRegion: state.settings.msRegion, geminiKey: state.settings.geminiKey };
    state.settings = { ...DEFAULT_SETTINGS, ...keep };
    save('settings');
  },

  // ----- content metadata cache (title/thumb for non-demo videos) -----
  getMeta(id) { return state.meta[id] || null; },
  putMeta(item) {
    if (!item?.id) return;
    state.meta[item.id] = { ...state.meta[item.id], ...item, cachedAt: Date.now() };
    // keep cache bounded
    const ids = Object.keys(state.meta);
    if (ids.length > 300) {
      ids.sort((a, b) => state.meta[a].cachedAt - state.meta[b].cachedAt).slice(0, ids.length - 300).forEach(k => delete state.meta[k]);
    }
    save('meta');
  },

  // ----- favorites -----
  get favorites() { return state.favorites; },
  isFavorite(id) { return state.favorites.some(f => f.id === id); },
  addFavorite(item) {
    if (!item?.id || this.isFavorite(item.id)) return;
    state.favorites.unshift({
      id: item.id, title: item.title || '', channel: item.channel || '', thumb: item.thumb || '',
      duration: item.duration || 0, isDemo: !!item.isDemo, addedAt: Date.now(),
    });
    save('favorites');
  },
  removeFavorite(id) {
    state.favorites = state.favorites.filter(f => f.id !== id);
    save('favorites');
  },
  toggleFavorite(item) {
    if (this.isFavorite(item.id)) { this.removeFavorite(item.id); return false; }
    this.addFavorite(item); return true;
  },

  // ----- history / playback progress -----
  get historyList() {
    return Object.values(state.history).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  },
  getProgress(id) { return state.history[id] || null; },
  saveProgress(entry) {
    if (!entry?.id) return;
    const prev = state.history[entry.id] || {};
    state.history[entry.id] = {
      ...prev, ...entry,
      listenedSec: (prev.listenedSec || 0) + (entry.addListened || 0),
      lastPlayedAt: Date.now(),
    };
    delete state.history[entry.id].addListened;
    save('history');
  },
  removeHistory(id) { delete state.history[id]; save('history'); },
  clearHistory() { state.history = {}; save('history'); },

  // ----- runtime translations cache: { [contentId]: { [sentenceIndex]: text } } -----
  getTranslations(id) { return state.translations[id] || {}; },
  putTranslations(id, map) {
    state.translations[id] = { ...(state.translations[id] || {}), ...map };
    save('translations');
  },
};
