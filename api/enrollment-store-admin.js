import { normalize, readJsonBody, requireAdminRequest, sendJson } from './http.js';

const sectionKeyAllowed = 'enrollment_manager';

const getSupabaseServiceConfig = () => {
  const url = normalize(process.env.SUPABASE_URL) || normalize(process.env.VITE_SUPABASE_URL);
  const serviceRoleKey =
    normalize(process.env.SUPABASE_SERVICE_ROLE_KEY) || normalize(process.env.SUPABASE_SERVICE_KEY);
  return { url, serviceRoleKey };
};

const getSettingKey = (sectionKey) => `enrollment_store:${sectionKey}`;

const normalizeStore = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : null;

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

  const admin = await requireAdminRequest(request, response);
  if (!admin) return;

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
    await persistStore(url, serviceRoleKey, sectionKey, payload);
    return sendJson(response, 200, { ok: true });
  } catch (error) {
    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Enrollment admin sync failed.'
    });
  }
}
