export const sendJson = (response, status, body) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
};

export const readJsonBody = async (request) => {
  if (request?.body && typeof request.body === 'object') {
    return request.body;
  }

  if (typeof request?.body === 'string') {
    return JSON.parse(request.body || '{}');
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
};

export const normalize = (value) => (typeof value === 'string' ? value.trim() : '');
