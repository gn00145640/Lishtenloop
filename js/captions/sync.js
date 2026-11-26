// Caption timing helpers.

/** Index of the sentence playing at time t (last sentence whose start <= t), or -1. */
export function indexAt(sentences, t) {
  let lo = 0, hi = sentences.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sentences[mid].start <= t + 1e-6) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Split running text into sentences on terminal punctuation, keeping quotes together. */
export function splitSentences(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out = [];
  const ABBR = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|U\.S|U\.K|U\.N|e\.g|i\.e|etc|vs|No|a\.m|p\.m)\.$/i;
  let startPos = 0;
  for (let i = 0; i < clean.length; i++) {
    if (!'.!?'.includes(clean[i])) continue;
    let j = i;
    while (j + 1 < clean.length && '.!?'.includes(clean[j + 1])) j++;            // "?!" / "..."
    while (j + 1 < clean.length && `"'”’)]`.includes(clean[j + 1])) j++;          // closing quotes
    const after = clean.slice(j + 1);
    const atEnd = after.trim() === '';
    if (!atEnd && !/^\s+["'“‘(]?[A-Z0-9]/.test(after)) { i = j; continue; }
    const candidate = clean.slice(startPos, j + 1).trim();
    if (!atEnd && ABBR.test(candidate)) { i = j; continue; }
    out.push(candidate);
    startPos = j + 1;
    i = j;
  }
  const rest = clean.slice(startPos).trim();
  if (rest) out.push(rest);
  return out;
}

/** Parse "m:ss text" / "h:mm:ss text" transcript lines (YouTube transcript panel format). */
export function parseTimedLines(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const segs = [];
  let pendingTime = null;
  for (const line of lines) {
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d+))?\s*(.*)$/.exec(line);
    if (m) {
      const t = (+m[1] || 0) * 3600 + (+m[2]) * 60 + (+m[3]) + (m[4] ? +('0.' + m[4]) : 0);
      if (m[5]) segs.push({ start: t, text: m[5] });
      else pendingTime = t;               // time and text on separate lines
    } else if (pendingTime !== null) {
      segs.push({ start: pendingTime, text: line });
      pendingTime = null;
    } else if (segs.length) {
      segs[segs.length - 1].text += ' ' + line;
    }
  }
  return segs;
}

/**
 * Merge timed fragments into sentences. Sentence boundaries inside a fragment get a
 * start time interpolated by character position. Returns [{start,end,text}].
 * @param segs [{start, text}] sorted by start
 * @param totalEnd end time of the last fragment (seconds)
 */
export function mergeSegmentsToSentences(segs, totalEnd) {
  if (!segs.length) return [];
  // Build a char → time map across the concatenated text.
  let full = '';
  const anchors = []; // { pos, time }
  segs.forEach((s, i) => {
    const txt = s.text.replace(/\s+/g, ' ').trim();
    if (!txt) return;
    if (full) full += ' ';
    const segEnd = i + 1 < segs.length ? segs[i + 1].start : (totalEnd ?? s.start + 3);
    anchors.push({ pos: full.length, time: s.start, endPos: full.length + txt.length, endTime: segEnd });
    full += txt;
  });
  const timeAt = (pos) => {
    let a = anchors[0];
    for (const x of anchors) { if (x.pos <= pos) a = x; else break; }
    const frac = Math.min(1, Math.max(0, (pos - a.pos) / Math.max(1, a.endPos - a.pos)));
    return a.time + frac * (a.endTime - a.time);
  };
  const sentences = splitSentences(full);
  const out = [];
  let cursor = 0;
  for (const text of sentences) {
    const pos = full.indexOf(text, cursor);
    const p = pos >= 0 ? pos : cursor;
    cursor = p + text.length;
    out.push({ start: round2(timeAt(p)), end: round2(timeAt(cursor)), text });
  }
  // make contiguous: each end = next start (no gaps that confuse highlighting)
  for (let i = 0; i < out.length - 1; i++) out[i].end = Math.max(out[i].start + 0.3, out[i + 1].start);
  return out;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Detect pauses in a mono PCM signal. Returns { duration, silences:[[start,end],...] } in seconds.
 * Threshold is adaptive: between the 10th (noise) and 70th (speech) percentile of 10 ms RMS frames.
 */
export function detectPauses(samples, sampleRate, { minSilence = 0.12, ratio = 0.12 } = {}) {
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const env = [];
  for (let i = 0; i < samples.length; i += hop) {
    let s = 0; const e = Math.min(i + hop, samples.length);
    for (let j = i; j < e; j++) s += samples[j] * samples[j];
    env.push(Math.sqrt(s / (e - i)));
  }
  const sorted = [...env].sort((a, b) => a - b);
  const noise = sorted[Math.floor(sorted.length * 0.1)] || 0;
  const speech = sorted[Math.floor(sorted.length * 0.7)] || 0;
  const thr = noise + (speech - noise) * ratio;
  const minFrames = Math.round(minSilence * 100);
  const silences = [];
  let st = -1;
  env.forEach((v, i) => {
    if (v < thr) { if (st < 0) st = i; }
    else if (st >= 0) { if (i - st >= minFrames) silences.push([st / 100, i / 100]); st = -1; }
  });
  if (st >= 0 && env.length - st >= minFrames) silences.push([st / 100, env.length / 100]);
  // merge pauses separated by tiny blips (< 60 ms)
  const merged = [];
  for (const s of silences) {
    const last = merged[merged.length - 1];
    if (last && s[0] - last[1] < 0.06) last[1] = s[1]; else merged.push([...s]);
  }
  return { duration: samples.length / sampleRate, silences: merged };
}

/**
 * Estimate sentence timings from text + detected pauses (no ASR).
 * Every sentence boundary must sit in a detected pause. Dynamic programming picks the set
 * of pauses that best matches each sentence's expected duration (from its length and the
 * overall speaking rate) while preferring long pauses (sentence ends usually pause longer).
 * Accuracy is typically a few hundred ms for clearly read material; review with the tool.
 * @returns [{start,end,text}]
 */
export function alignToPauses(texts, silences, duration, { boundaryWeight = 0.12 } = {}) {
  const N = texts.length;
  if (!N) return [];
  const sil = [...silences].sort((a, b) => a[0] - b[0]);
  const speechStart = sil.length && sil[0][0] <= 0.05 ? sil[0][1] : 0;
  const lastSil = sil[sil.length - 1];
  const speechEnd = lastSil && lastSil[1] >= duration - 0.05 ? lastSil[0] : duration;
  const inner = sil.filter(s => s[0] > speechStart && s[1] < speechEnd);
  const weight = (s) => s.replace(/[^A-Za-z0-9]/g, '').length + (s.match(/[,;:—–-]/g) || []).length * 3 + 4;
  const w = texts.map(weight);
  const rate = (speechEnd - speechStart) / w.reduce((a, b) => a + b, 0); // seconds per weight unit

  // nodes: 0 = speech start, 1..M = inner pauses, M+1 = speech end
  const M = inner.length;
  const nodeStart = (j) => (j === 0 ? speechStart : j === M + 1 ? speechEnd : inner[j - 1][1]); // next sentence begins
  const nodeEnd = (j) => (j === 0 ? speechStart : j === M + 1 ? speechEnd : inner[j - 1][0]);   // previous sentence ends
  const nodePenalty = (j) => (j === 0 || j === M + 1 ? 0 : boundaryWeight / Math.max(0.08, inner[j - 1][1] - inner[j - 1][0]));
  const segCost = (i, a, b) => {
    const d = nodeEnd(b) - nodeStart(a);
    if (d <= 0.15) return Infinity;
    const e = w[i] * rate;
    const r = (d - e) / e;
    return r * r * 4;
  };
  if (N > M + 1) {
    // not enough pauses: fall back to proportional split
    let acc = speechStart;
    return texts.map((text, i) => { const s = acc; acc += w[i] * rate; return { text, start: round2(s), end: round2(acc) }; });
  }
  // dp[i][j]: best cost with sentences 0..i-1 placed and sentence i-1 ending at node j
  const INF = Infinity;
  const dp = Array.from({ length: N + 1 }, () => new Float64Array(M + 2).fill(INF));
  const back = Array.from({ length: N + 1 }, () => new Int16Array(M + 2).fill(-1));
  dp[0][0] = 0;
  for (let i = 1; i <= N; i++) {
    const jFrom = i, jTo = i === N ? M + 1 : M - (N - 1 - i);
    for (let j = jFrom; j <= jTo; j++) {
      if (i === N && j !== M + 1) continue;
      if (i < N && j === M + 1) continue;
      for (let a = i - 1; a < j; a++) {
        if (dp[i - 1][a] === INF) continue;
        const c = dp[i - 1][a] + segCost(i - 1, a, j) + nodePenalty(j);
        if (c < dp[i][j]) { dp[i][j] = c; back[i][j] = a; }
      }
    }
  }
  if (dp[N][M + 1] === INF) {
    let acc = speechStart;
    return texts.map((text, i) => { const s = acc; acc += w[i] * rate; return { text, start: round2(s), end: round2(acc) }; });
  }
  const nodes = [M + 1];
  for (let i = N, j = M + 1; i > 0; i--) { j = back[i][j]; nodes.unshift(j); }
  const out = texts.map((text, i) => ({ text, start: round2(nodeStart(nodes[i])), end: round2(nodeEnd(nodes[i + 1])) }));
  // tiny lead-in so the first word isn't clipped when looping
  out.forEach(s => { s.start = round2(Math.max(0, s.start - 0.12)); });
  return out;
}

/** Convert [{start,end,text,zh?}] into the PRD Sentence Object shape. */
export function toSentenceObjects(list, { source = 'transcript', language = 'en', confidence = 1 } = {}) {
  return list.map((s, i) => ({
    sentence_id: `s${String(i + 1).padStart(3, '0')}`,
    start_time: s.start,
    end_time: s.end,
    original_text: s.text,
    translated_text: s.zh || '',
    language, source, confidence,
  }));
}

/** Normalise stored Sentence Objects to the runtime shape {id,start,end,en,zh}. */
export function fromSentenceObjects(arr) {
  return (arr || []).map((s, i) => ({
    id: s.sentence_id || `s${i + 1}`,
    index: i,
    start: +s.start_time,
    end: +s.end_time,
    en: s.original_text || '',
    zh: s.translated_text || '',
    source: s.source || '',
    confidence: s.confidence ?? null,
  })).sort((a, b) => a.start - b.start).map((s, i) => ({ ...s, index: i }));
}
