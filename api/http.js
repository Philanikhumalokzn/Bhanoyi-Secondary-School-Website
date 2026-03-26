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

const getHeaderValue = (request, headerName) => {
  if (!request) return '';

  if (typeof request.headers?.get === 'function') {
    return normalize(request.headers.get(headerName) || '');
  }

  const headers = request.headers || {};
  const direct = headers[headerName] ?? headers[headerName.toLowerCase()] ?? headers[headerName.toUpperCase()];
  if (Array.isArray(direct)) {
    return normalize(direct[0] || '');
  }
  return normalize(direct || '');
};

const extractBearerToken = (request) => {
  const authorization = getHeaderValue(request, 'authorization');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? normalize(match[1]) : '';
};

const configuredAdminEmails = () => {
  const raw =
    normalize(process.env.ADMIN_EMAILS) ||
    normalize(process.env.VITE_ADMIN_EMAILS);

  return raw
    .split(',')
    .map((entry) => normalize(entry).toLowerCase())
    .filter(Boolean);
};

const resolveSupabaseConfig = () => {
  const url = normalize(process.env.SUPABASE_URL) || normalize(process.env.VITE_SUPABASE_URL);
  const anonKey = normalize(process.env.SUPABASE_ANON_KEY) || normalize(process.env.VITE_SUPABASE_ANON_KEY);
  return { url, anonKey };
};

export const requireSupabaseUserRequest = async (request, response) => {
  const token = extractBearerToken(request);
  if (!token) {
    sendJson(response, 401, { error: 'Authentication required.' });
    return null;
  }

  const { url, anonKey } = resolveSupabaseConfig();
  if (!url || !anonKey) {
    sendJson(response, 500, {
      error: 'Supabase auth is not configured on the server (SUPABASE_URL and SUPABASE_ANON_KEY required).'
    });
    return null;
  }

  let upstream;
  try {
    upstream = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`
      }
    });
  } catch {
    sendJson(response, 502, { error: 'Could not validate session.' });
    return null;
  }

  if (!upstream.ok) {
    sendJson(response, 401, { error: 'Invalid or expired session.' });
    return null;
  }

  const userPayload = await upstream.json().catch(() => ({}));
  const email = normalize(userPayload?.email).toLowerCase();
  if (!email) {
    sendJson(response, 401, { error: 'Authenticated account is missing an email address.' });
    return null;
  }

  return {
    email,
    token,
    user: userPayload
  };
};

export const requireAdminRequest = async (request, response) => {
  const authenticatedUser = await requireSupabaseUserRequest(request, response);
  if (!authenticatedUser) return null;

  const { email } = authenticatedUser;
  const allowedEmails = configuredAdminEmails();

  if (!allowedEmails.length) {
    sendJson(response, 500, { error: 'No admin email allow-list configured on the server.' });
    return null;
  }

  if (!email || !allowedEmails.includes(email)) {
    sendJson(response, 403, { error: 'This account is not authorized for admin actions.' });
    return null;
  }

  return { email };
};
