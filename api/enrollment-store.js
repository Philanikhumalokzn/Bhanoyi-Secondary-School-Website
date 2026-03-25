import { normalize, readJsonBody, requireSupabaseUserRequest, sendJson } from './http.js';

const sectionKeyAllowed = 'enrollment_manager';

const getSupabaseServiceConfig = () => {
  const url = normalize(process.env.SUPABASE_URL) || normalize(process.env.VITE_SUPABASE_URL);
  const serviceRoleKey =
    normalize(process.env.SUPABASE_SERVICE_ROLE_KEY) || normalize(process.env.SUPABASE_SERVICE_KEY);
  return { url, serviceRoleKey };
};

const getSettingKey = (sectionKey) => `enrollment_store:${sectionKey}`;

const getHeader = (request, key) => {
  if (!request) return '';
  const headers = request.headers || {};
  if (typeof headers.get === 'function') {
    return normalize(headers.get(key) || '');
  }
  const direct = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (Array.isArray(direct)) return normalize(direct[0] || '');
  return normalize(direct || '');
};

const normalizeStore = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : null;

const fetchCurrentStore = async (url, serviceRoleKey, sectionKey) => {
  const settingKey = getSettingKey(sectionKey);
  const endpoint = `${url}/rest/v1/site_settings?select=setting_value&setting_key=eq.${encodeURIComponent(settingKey)}&limit=1`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  if (!response.ok) {
    throw new Error('Could not load enrollment store from Supabase.');
  }

  const rows = await response.json().catch(() => []);
  if (!Array.isArray(rows) || !rows.length) {
    return null;
  }

  const raw = normalize(rows[0]?.setting_value);
  if (!raw) return null;

  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    return null;
  }
};

const verifyStaffCredentials = (store, email, password) => {
  const source = normalizeStore(store);
  if (!source) return false;

  const normalizedEmail = normalize(email).toLowerCase();
  const normalizedPassword = normalize(password);
  if (!normalizedEmail || !normalizedPassword) return false;

  const staffMembers = Array.isArray(source.staffMembers) ? source.staffMembers : [];
  return staffMembers.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const loginEmail = normalize(entry.loginEmail || entry.staffEmail).toLowerCase();
    const loginPassword = normalize(entry.loginPassword);
    return loginEmail === normalizedEmail && loginPassword === normalizedPassword;
  });
};

const buildPatchedStore = (existingStore, incomingPayload) => {
  const existing = normalizeStore(existingStore) || {};
  const incoming = normalizeStore(incomingPayload) || {};
  const now = Date.now();

  const existingMeta =
    existing._meta && typeof existing._meta === 'object' && !Array.isArray(existing._meta)
      ? existing._meta
      : {};

  return {
    ...existing,
    classProfilesByGrade:
      incoming.classProfilesByGrade && typeof incoming.classProfilesByGrade === 'object' && !Array.isArray(incoming.classProfilesByGrade)
        ? incoming.classProfilesByGrade
        : existing.classProfilesByGrade,
    updatedAt: now,
    _meta: {
      ...existingMeta,
      updatedAt: now
    }
  };
};

const persistStore = async (url, serviceRoleKey, sectionKey, payload) => {
  const settingKey = getSettingKey(sectionKey);
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
        setting_key: settingKey,
        setting_value: JSON.stringify(payload)
      }
    ])
  });

  if (!response.ok) {
    throw new Error('Could not persist enrollment store to Supabase.');
  }
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  if (!url || !serviceRoleKey) {
    return sendJson(response, 500, {
      error: 'Server sync is not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required).'
    });
  }

  let body = {};
  try {
    body = await readJsonBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Invalid JSON body.' });
  }

  const sectionKey = normalize(body.sectionKey) || sectionKeyAllowed;
  if (sectionKey !== sectionKeyAllowed) {
    return sendJson(response, 400, { error: 'Invalid section key.' });
  }

  const payload = normalizeStore(body.payload);
  if (!payload) {
    return sendJson(response, 400, { error: 'Missing or invalid payload.' });
  }

  try {
    const existingStore = await fetchCurrentStore(url, serviceRoleKey, sectionKey);
    if (!existingStore) {
      return sendJson(response, 404, { error: 'Enrollment store does not exist yet.' });
    }

    const hasAuthorizationHeader = Boolean(getHeader(request, 'authorization'));
    let validStaff = false;

    if (hasAuthorizationHeader) {
      const authenticatedUser = await requireSupabaseUserRequest(request, response);
      if (!authenticatedUser) return;

      const normalizedEmail = normalize(authenticatedUser.email).toLowerCase();
      const staffMembers = Array.isArray(existingStore.staffMembers) ? existingStore.staffMembers : [];
      validStaff = staffMembers.some((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const loginEmail = normalize(entry.loginEmail || entry.staffEmail).toLowerCase();
        return loginEmail === normalizedEmail;
      });
    } else {
      const staffEmail = normalize(body.staffEmail || getHeader(request, 'x-staff-email')).toLowerCase();
      const staffPassword = normalize(body.staffPassword || getHeader(request, 'x-staff-password'));
      if (!staffEmail || !staffPassword) {
        return sendJson(response, 401, { error: 'Staff authentication required for enrollment sync.' });
      }

      validStaff = verifyStaffCredentials(existingStore, staffEmail, staffPassword);
    }

    if (!validStaff) {
      return sendJson(response, 403, { error: 'This account is not authorized for staff enrollment sync.' });
    }

    const mergedStore = buildPatchedStore(existingStore, payload);
    await persistStore(url, serviceRoleKey, sectionKey, mergedStore);
    return sendJson(response, 200, { ok: true });
  } catch (error) {
    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Enrollment sync failed.'
    });
  }
}
