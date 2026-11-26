// Microsoft Translator (Azure AI Translator) — F0 free tier: 2M characters / month.
// Docs: https://learn.microsoft.com/azure/ai-services/translator/reference/v3-0-translate
export const microsoft = {
  id: 'microsoft',
  batchSize: 100, // API limit is 1000 elements / 50k chars per request
  isConfigured: (s) => !!s.msKey,
  async translate(texts, s) {
    const headers = { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': s.msKey };
    if (s.msRegion) headers['Ocp-Apim-Subscription-Region'] = s.msRegion;
    const res = await fetch('https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hant', {
      method: 'POST', headers, body: JSON.stringify(texts.map(Text => ({ Text }))),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).error?.message || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const data = await res.json();
    return data.map(d => d.translations?.[0]?.text ?? '');
  },
};
