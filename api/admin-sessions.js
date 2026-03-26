import { normalize, readJsonBody, requireAdminRequest, sendJson } from './http.js';

const SESSIONS_SETTING_KEY = 'admin_active_sessions_v1';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

const getSupabaseServiceConfig = () => {
  const url = normalize(process.env.SUPABASE_URL) || normalize(process.env.VITE_SUPABASE_URL);
  const serviceRoleKey =
    normalize(process.env.SUPABASE_SERVICE_ROLE_KEY) || normalize(process.env.SUPABASE_SERVICE_KEY);
  return { url, serviceRoleKey };
};

const nowTimestamp = () => Date.now();

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeSessionId = (value) => normalize(value).slice(0, 140);

const normalizePin = (value) => normalize(value).slice(0, 80);

const readHeaderValue = (request, key) => {
  if (!request) return '';
  const headers = request.headers || {};
  if (typeof headers.get === 'function') {
    return normalize(headers.get(key) || '');
  }
  const direct = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (Array.isArray(direct)) return normalize(direct[0] || '');
  return normalize(direct || '');
};

const readAdminPinFromRequest = (request, body) =>
  normalizePin(body?.adminPin || readHeaderValue(request, 'x-admin-extra-pin') || readHeaderValue(request, 'x-admin-pin'));

const getExpectedAdminPin = () =>
  normalizePin(process.env.ADMIN_EXTRA_PIN || process.env.ADMIN_SECURITY_PIN || process.env.ADMIN_PIN || '');

const ensurePinAuthorized = (request, response, body) => {
  const expectedPin = getExpectedAdminPin();
  if (!expectedPin) {
    sendJson(response, 500, { error: 'Admin extra PIN is not configured on the server.' });
    return false;
  }

  const suppliedPin = readAdminPinFromRequest(request, body);
  if (!suppliedPin || suppliedPin !== expectedPin) {
    sendJson(response, 403, { error: 'Invalid admin PIN.' });
    return false;
  }

  return true;
};

const fetchSessionsState = async (url, serviceRoleKey) => {
  const endpoint = `${url}/rest/v1/site_settings?select=setting_value&setting_key=eq.${encodeURIComponent(SESSIONS_SETTING_KEY)}&limit=1`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  if (!response.ok) {
    throw new Error('Could not load admin sessions state.');
  }

  const rows = await response.json().catch(() => []);
  const raw = Array.isArray(rows) && rows[0] ? normalize(rows[0].setting_value) : '';
  if (!raw) {
    return {
      globalRevokeBefore: 0,
      sessions: []
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const globalRevokeBefore = Number(parsed?.globalRevokeBefore) || 0;
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    return {
      globalRevokeBefore: Number.isFinite(globalRevokeBefore) ? globalRevokeBefore : 0,
      sessions: sessions.filter(isRecord)
    };
  } catch {
    return {
      globalRevokeBefore: 0,
      sessions: []
    };
  }
};

const persistSessionsState = async (url, serviceRoleKey, state) => {
  const endpoint = `${url}/rest/v1/site_settings?on_conflict=setting_key`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([
      {
        setting_key: SESSIONS_SETTING_KEY,
        setting_value: JSON.stringify(state)
      }
    ])
  });

  if (!response.ok) {
    throw new Error('Could not persist admin sessions state.');
  }
};

const toSessionView = (session, now) => {
  const sessionId = normalizeSessionId(session.sessionId);
  const email = normalize(session.email).toLowerCase();
  const createdAt = Number(session.createdAt) || now;
  const lastSeenAt = Number(session.lastSeenAt) || createdAt;
  const revokedAt = Number(session.revokedAt) || 0;
  const userAgent = normalize(session.userAgent).slice(0, 260);

  return {
    sessionId,
    email,
    createdAt,
    lastSeenAt,
    revokedAt,
    userAgent
  };
};

const pruneAndNormalizeState = (state, now) => {
  const inputSessions = Array.isArray(state?.sessions) ? state.sessions : [];
  const normalizedSessions = inputSessions
    .map((entry) => toSessionView(entry, now))
    .filter((entry) => entry.sessionId && entry.email)
    .filter((entry) => now - entry.lastSeenAt <= SESSION_TTL_MS)
    .slice(-300);

  return {
    globalRevokeBefore: Number(state?.globalRevokeBefore) || 0,
    sessions: normalizedSessions
  };
};

const isSessionRevoked = (session, globalRevokeBefore) => {
  const revokedAt = Number(session.revokedAt) || 0;
  const createdAt = Number(session.createdAt) || 0;
  const revokedByGlobalCutoff = (Number(globalRevokeBefore) || 0) > 0 && createdAt > 0 && createdAt <= Number(globalRevokeBefore);
  return revokedAt > 0 || revokedByGlobalCutoff;
};

const upsertSession = (sessions, nextSession, globalRevokeBefore = 0) => {
  const nextId = normalizeSessionId(nextSession.sessionId);
  const nextEmail = normalize(nextSession.email).toLowerCase();
  const existingIndex = sessions.findIndex(
    (entry) => normalizeSessionId(entry.sessionId) === nextId && normalize(entry.email).toLowerCase() === nextEmail
  );

  if (existingIndex >= 0) {
    const existing = sessions[existingIndex];
    const existingRevoked = isSessionRevoked(existing, globalRevokeBefore);

    if (existingRevoked) {
      sessions[existingIndex] = {
        ...nextSession,
        createdAt: nextSession.createdAt,
        revokedAt: 0
      };
      return;
    }

    sessions[existingIndex] = {
      ...existing,
      ...nextSession,
      createdAt: Number(existing.createdAt) || nextSession.createdAt,
      revokedAt: Number(existing.revokedAt) || 0
    };
    return;
  }

  sessions.push(nextSession);
};

export default async function handler(request, response) {
  const allowedMethods = ['GET', 'POST', 'DELETE'];
  if (!allowedMethods.includes(request.method || '')) {
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  const admin = await requireAdminRequest(request, response);
  if (!admin) return;

  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  if (!url || !serviceRoleKey) {
    return sendJson(response, 500, {
      error: 'Server sync is not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required).'
    });
  }

  let body = {};
  if (request.method !== 'GET') {
    try {
      body = await readJsonBody(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid JSON body.' });
    }
  }

  const now = nowTimestamp();

  try {
    const currentState = pruneAndNormalizeState(await fetchSessionsState(url, serviceRoleKey), now);

    if (request.method === 'POST') {
      const action = normalize(body.action || 'heartbeat').toLowerCase();
      const sessionId = normalizeSessionId(body.sessionId);
      if (!sessionId) {
        return sendJson(response, 400, { error: 'Session ID is required.' });
      }

      const nextSession = {
        sessionId,
        email: admin.email,
        userAgent: normalize(body.userAgent).slice(0, 260),
        createdAt: now,
        lastSeenAt: now,
        revokedAt: 0
      };

      upsertSession(currentState.sessions, nextSession, currentState.globalRevokeBefore);
      const nextState = pruneAndNormalizeState(currentState, now);
      await persistSessionsState(url, serviceRoleKey, nextState);

      const ownSession = nextState.sessions.find(
        (entry) => entry.sessionId === sessionId && entry.email === admin.email
      );

      const revoked = ownSession ? isSessionRevoked(ownSession, nextState.globalRevokeBefore) : false;

      return sendJson(response, 200, {
        ok: true,
        action: action || 'heartbeat',
        revoked,
        checkedAt: now
      });
    }

    if (request.method === 'GET') {
      if (!ensurePinAuthorized(request, response, body)) return;

      const activeSessions = currentState.sessions
        .filter((entry) => entry.email === admin.email)
        .filter((entry) => !isSessionRevoked(entry, currentState.globalRevokeBefore))
        .sort((left, right) => right.lastSeenAt - left.lastSeenAt);

      return sendJson(response, 200, {
        ok: true,
        sessions: activeSessions,
        checkedAt: now
      });
    }

    if (!ensurePinAuthorized(request, response, body)) return;

    const scope = normalize(body.scope || '').toLowerCase();
    if (scope === 'all') {
      const nextState = {
        ...currentState,
        globalRevokeBefore: now,
        sessions: currentState.sessions.map((entry) =>
          entry.email === admin.email ? { ...entry, revokedAt: now } : entry
        )
      };
      await persistSessionsState(url, serviceRoleKey, pruneAndNormalizeState(nextState, now));
      return sendJson(response, 200, { ok: true, scope: 'all', revokedAt: now });
    }

    if (scope === 'one') {
      const sessionId = normalizeSessionId(body.sessionId);
      if (!sessionId) {
        return sendJson(response, 400, { error: 'Session ID is required for individual logout.' });
      }

      const nextState = {
        ...currentState,
        sessions: currentState.sessions.map((entry) => {
          if (entry.email !== admin.email) return entry;
          if (entry.sessionId !== sessionId) return entry;
          return {
            ...entry,
            revokedAt: now
          };
        })
      };

      await persistSessionsState(url, serviceRoleKey, pruneAndNormalizeState(nextState, now));
      return sendJson(response, 200, { ok: true, scope: 'one', revokedAt: now, sessionId });
    }

    return sendJson(response, 400, { error: 'Invalid revoke scope.' });
  } catch (error) {
    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Admin session operation failed.'
    });
  }
}
