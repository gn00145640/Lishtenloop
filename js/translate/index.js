// Translation provider registry (swappable). Each provider:
//   { id, isConfigured(settings), translate(texts[], settings) → Promise<string[]> }
// Output order/length must match input so timestamps are never disturbed.
import { microsoft } from './microsoft.js';
import { gemini } from './gemini.js';
import { store } from '../store.js';

const providers = { microsoft, gemini };

export function currentProvider(settings = store.settings) {
  return providers[settings.trProvider] || null;
}

export function translationStatus(settings = store.settings) {
  const p = currentProvider(settings);
  if (!p) return 'none';
  return p.isConfigured(settings) ? 'ready' : 'pending';
}

/** Translate English sentences to Traditional Chinese (Taiwan). Batches internally. */
export async function translateTexts(texts, settings = store.settings) {
  const p = currentProvider(settings);
  if (!p || !p.isConfigured(settings)) throw Object.assign(new Error('translation-not-configured'), { code: 'pending' });
  const out = [];
  const BATCH = p.batchSize || 50;
  for (let i = 0; i < texts.length; i += BATCH) {
    const part = texts.slice(i, i + BATCH);
    const res = await p.translate(part, settings);
    if (!Array.isArray(res) || res.length !== part.length) throw new Error('translation-shape-mismatch');
    out.push(...res);
  }
  return out;
}

export async function testProvider(settings = store.settings) {
  const [zh] = await translateTexts(['Good morning, how are you?'], settings);
  return zh;
}
