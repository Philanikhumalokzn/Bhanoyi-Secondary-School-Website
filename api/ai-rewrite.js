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

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  const apiKey = normalize(process.env.AI_API_KEY);
  const apiUrl = normalize(process.env.AI_API_URL) || 'https://openrouter.ai/api/v1/chat/completions';
  const model = normalize(process.env.AI_MODEL) || 'qwen/qwen3-4b:free';

  if (!apiKey) {
    return json(500, { error: 'AI_API_KEY is not configured in Vercel.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const input = normalize(body?.input);
  const refinementPrompt = normalize(body?.refinementPrompt);
  if (!input) {
    return json(400, { error: 'Input text is required.' });
  }

  const outboundHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  const httpReferer = normalize(process.env.AI_HTTP_REFERER);
  const appTitle = normalize(process.env.AI_APP_TITLE);
  if (httpReferer) outboundHeaders['HTTP-Referer'] = httpReferer;
  if (appTitle) outboundHeaders['X-Title'] = appTitle;

  let upstream;
  try {
    upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: outboundHeaders,
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [{ role: 'user', content: buildPrompt(input, refinementPrompt) }]
      })
    });
  } catch {
    return json(502, { error: 'Could not reach AI provider.' });
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