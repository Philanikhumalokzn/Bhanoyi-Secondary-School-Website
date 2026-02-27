const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });

const buildPrompt = (input, refinementPrompt = '') => {
  const normalizedRefinement = normalize(refinementPrompt);
  const promptLines = [
    'Rewrite the text for a school website admin editor.',
    'Keep the original meaning and factual details.',
    'Improve grammar, clarity, and readability.',
    'Return only the rewritten text with no quotes or extra labels.'
  ];

  if (normalizedRefinement) {
    promptLines.push(`Additional refinement instructions: ${normalizedRefinement}`);
  }

  promptLines.push('', input);
  return promptLines.join('\n');
};

const normalize = (value) => (typeof value === 'string' ? value.trim() : '');
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

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  const apiKey = normalize(process.env.AI_API_KEY);
  const apiUrl = normalize(process.env.AI_API_URL) || 'https://openrouter.ai/api/v1/chat/completions';
  const defaultModel = normalize(process.env.AI_MODEL) || 'qwen/qwen3-4b:free';
  const geminiModelRaw = normalize(process.env.AI_GEMINI_MODEL) || 'google/gemini-2.0-flash-001';
  const geminiApiKey = normalize(process.env.GOOGLE_API_KEY);
  const geminiApiUrl = normalize(process.env.GOOGLE_GEMINI_API_URL) || 'https://generativelanguage.googleapis.com/v1beta';
  const geminiModel = geminiModelRaw.startsWith('models/')
    ? geminiModelRaw
    : `models/${geminiModelRaw.replace(/^google\//i, '')}`;

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const input = normalize(body?.input);
  const refinementPrompt = normalize(body?.refinementPrompt);
  const modelChoice = normalize(body?.modelChoice).toLowerCase();
  if (!input) {
    return json(400, { error: 'Input text is required.' });
  }

  const wantsGemini = modelChoice === 'gemini';
  const canUseGemini = Boolean(geminiApiKey);
  const canUseOpenAiCompatible = Boolean(apiKey);

  const useGemini = wantsGemini
    ? canUseGemini
    : !canUseOpenAiCompatible && canUseGemini;

  if (!canUseGemini && !canUseOpenAiCompatible) {
    return json(500, { error: 'Configure GOOGLE_API_KEY for Gemini or AI_API_KEY for OpenAI-compatible providers.' });
  }

  if (wantsGemini && !canUseGemini) {
    return json(500, { error: 'GOOGLE_API_KEY is not configured for Gemini.' });
  }

  if (useGemini) {
    let upstream;
    const timeout = makeTimeoutController();
    try {
      upstream = await fetch(`${geminiApiUrl}/${geminiModel}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: timeout.controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: buildPrompt(input, refinementPrompt) }]
            }
          ],
          generationConfig: {
            temperature: 0.3
          }
        })
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        return json(504, { error: 'Gemini request timed out. Try a shorter prompt or retry.' });
      }
      return json(502, { error: 'Could not reach Google Gemini API.' });
    } finally {
      timeout.clear();
    }

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const providerError = normalize(data?.error?.message) || normalize(data?.error) || 'Gemini request failed.';
      return json(502, { error: providerError });
    }

    const responseText = pickGeminiText(data);
    if (!responseText) {
      return json(502, { error: 'Gemini returned an empty response.' });
    }

    return json(200, { response: responseText });
  }

  const model = defaultModel;

  const outboundHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  const httpReferer = normalize(process.env.AI_HTTP_REFERER);
  const appTitle = normalize(process.env.AI_APP_TITLE);
  if (httpReferer) outboundHeaders['HTTP-Referer'] = httpReferer;
  if (appTitle) outboundHeaders['X-Title'] = appTitle;

  let upstream;
  const timeout = makeTimeoutController();
  try {
    upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: outboundHeaders,
      signal: timeout.controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [{ role: 'user', content: buildPrompt(input, refinementPrompt) }]
      })
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      return json(504, { error: 'AI provider timed out. Try a shorter prompt or retry.' });
    }
    return json(502, { error: 'Could not reach AI provider.' });
  } finally {
    timeout.clear();
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const providerError = normalize(data?.error?.message) || normalize(data?.error) || 'Provider request failed.';
    return json(502, { error: providerError });
  }

  const responseText =
    normalize(data?.choices?.[0]?.message?.content) ||
    normalize(data?.choices?.[0]?.text) ||
    normalize(data?.output_text);

  if (!responseText) {
    return json(502, { error: 'AI provider returned an empty response.' });
  }

  return json(200, { response: responseText });
}