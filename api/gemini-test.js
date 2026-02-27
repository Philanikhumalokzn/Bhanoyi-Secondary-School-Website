import { normalize, readJsonBody, sendJson } from './http.js';

const PROVIDER_TIMEOUT_MS = 20000;

const makeTimeoutController = () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  return {
    controller,
    clear: () => clearTimeout(timer)
  };
};

const pickGeminiText = (data) => {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
      .map((part) => normalize(part?.text))
      .filter(Boolean)
      .join('\n')
      .trim();
    if (text) return text;
  }
  return '';
};

const toFriendlyProviderError = (message) => {
  const providerMessage = normalize(message);
  const normalized = providerMessage.toLowerCase();

  if (
    normalized.includes('quota exceeded') ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return 'Gemini API quota is currently exhausted. Wait a moment and retry, or use a key/project with more available quota.';
  }

  return providerMessage || 'Gemini request failed.';
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  const apiKey = normalize(process.env.GOOGLE_API_KEY);
  const apiUrl = normalize(process.env.GOOGLE_GEMINI_API_URL) || 'https://generativelanguage.googleapis.com/v1beta';
  const modelRaw = normalize(process.env.AI_GEMINI_MODEL) || 'gemini-2.0-flash-001';
  const model = modelRaw.startsWith('models/') ? modelRaw : `models/${modelRaw.replace(/^google\//i, '')}`;

  if (!apiKey) {
    return sendJson(response, 500, {
      error: 'GOOGLE_API_KEY is missing. Add it in your local .env and restart dev server.'
    });
  }

  let body = {};
  try {
    body = await readJsonBody(request);
  } catch {
    body = {};
  }

  const prompt = normalize(body?.prompt) || 'Reply with exactly: OK';

  let upstream;
  const timeout = makeTimeoutController();
  try {
    upstream = await fetch(`${apiUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: timeout.controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0
        }
      })
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      return sendJson(response, 504, { error: 'Gemini request timed out. Please try again.' });
    }
    return sendJson(response, 502, { error: 'Could not reach Google Gemini API.' });
  } finally {
    timeout.clear();
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const providerError = normalize(data?.error?.message) || normalize(data?.error) || 'Gemini request failed.';
    return sendJson(response, 502, {
      error: toFriendlyProviderError(providerError),
      providerError
    });
  }

  const reply = pickGeminiText(data);
  if (!reply) {
    return sendJson(response, 502, { error: 'Gemini returned an empty response.' });
  }

  return sendJson(response, 200, {
    ok: true,
    model,
    reply
  });
}
