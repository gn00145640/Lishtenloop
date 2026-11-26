// Google Gemini API (free tier). Context-aware sentence translation returned as a JSON array
// of the same length, so caption timestamps stay aligned.
const PROMPT = `You are a subtitle translator. Translate each English subtitle sentence in the JSON array
into natural Traditional Chinese as used in Taiwan (繁體中文，台灣用語). Keep one output per input,
in the same order, do not merge or split items, keep proper nouns recognisable.
Return ONLY a JSON array of strings with exactly the same length as the input.`;

export const gemini = {
  id: 'gemini',
  batchSize: 40,
  isConfigured: (s) => !!s.geminiKey,
  async translate(texts, s) {
    const model = (s.geminiModel || 'gemini-2.5-flash').trim();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT + '\n\nInput:\n' + JSON.stringify(texts) }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
        },
      }),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).error?.message || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '[]';
    const arr = JSON.parse(text);
    if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error('Gemini returned a different number of sentences');
    return arr.map(String);
  },
};
