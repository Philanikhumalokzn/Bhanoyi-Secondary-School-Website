const normalizeSectionKey = (value) => String(value || '').trim() || 'enrollment_manager';

const getStorageKey = (sectionKey) => `bhanoyi.enrollmentClasses.${normalizeSectionKey(sectionKey)}`;
const getSettingKey = (sectionKey) => `enrollment_store:${normalizeSectionKey(sectionKey)}`;
const getStaffSessionEmailKey = (sectionKey) => `bhanoyi.staffSession.${normalizeSectionKey(sectionKey)}`;
const getStaffSessionPasswordKey = (sectionKey) => `bhanoyi.staffSessionPassword.${normalizeSectionKey(sectionKey)}`;

const normalizeStore = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
};

const hasMeaningfulEnrollmentData = (store) => {
  const source = normalizeStore(store);
  if (!source) return false;

  const activeGrades = Array.isArray(source.activeGrades) ? source.activeGrades.filter(Boolean) : [];
  const classesByGrade = source.classesByGrade && typeof source.classesByGrade === 'object' && !Array.isArray(source.classesByGrade)
    ? source.classesByGrade
    : {};
  const staffMembers = Array.isArray(source.staffMembers) ? source.staffMembers : [];

  const hasClass = Object.values(classesByGrade).some(
    (value) => Array.isArray(value) && value.some((entry) => String(entry || '').trim())
  );

  return activeGrades.length > 0 || hasClass || staffMembers.length > 0;
};

const getStoreUpdatedAt = (store) => {
  const source = normalizeStore(store);
  if (!source) return 0;

  const topLevel = Number(source.updatedAt);
  if (Number.isFinite(topLevel) && topLevel > 0) {
    return topLevel;
  }

  const metaValue = source._meta;
  if (!metaValue || typeof metaValue !== 'object' || Array.isArray(metaValue)) {
    return 0;
  }

  const metaUpdatedAt = Number(metaValue.updatedAt);
  return Number.isFinite(metaUpdatedAt) && metaUpdatedAt > 0 ? metaUpdatedAt : 0;
};

export const stampEnrollmentStorePayload = (payload, updatedAt = Date.now()) => {
  const source = normalizeStore(payload) || {};
  const existingMeta = source._meta;
  const baseMeta = existingMeta && typeof existingMeta === 'object' && !Array.isArray(existingMeta) ? existingMeta : {};

  return {
    ...source,
    updatedAt,
    _meta: {
      ...baseMeta,
      updatedAt
    }
  };
};

export const readEnrollmentStoreLocal = (storageKey) => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return normalizeStore(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const writeEnrollmentStoreLocal = (storageKey, payload) => {
  const normalized = normalizeStore(payload);
  if (!normalized) return null;
  localStorage.setItem(storageKey, JSON.stringify(normalized));
  return normalized;
};

const getSupabaseConfig = () => {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  return { url, anonKey };
};

const canUseSupabaseRest = () => {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
};

const readSessionAccessToken = async () => {
  try {
    const module = await import('../admin/supabase.client.ts');
    const { data } = await module.supabase.auth.getSession();
    return String(data?.session?.access_token || '').trim();
  } catch {
    return '';
  }
};

const postJsonWithAccessToken = async (url, accessToken, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  return response;
};

const readJsonResponse = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const toErrorMessage = (payload, fallback) =>
  String(payload?.error || payload?.message || payload?.msg || fallback || '')
    .trim();

const readStaffSessionCredentials = (sectionKey) => {
  if (typeof window === 'undefined') {
    return { staffEmail: '', staffPassword: '' };
  }

  const normalizedSectionKey = normalizeSectionKey(sectionKey);
  const staffEmail = String(sessionStorage.getItem(getStaffSessionEmailKey(normalizedSectionKey)) || '')
    .trim()
    .toLowerCase();
  const staffPassword = String(sessionStorage.getItem(getStaffSessionPasswordKey(normalizedSectionKey)) || '').trim();
  return { staffEmail, staffPassword };
};

const fetchEnrollmentStoreRemote = async (sectionKey) => {
  if (!canUseSupabaseRest()) return null;

  const { url, anonKey } = getSupabaseConfig();
  const settingKey = getSettingKey(sectionKey);
  const query = `${url}/rest/v1/site_settings?select=setting_value&setting_key=eq.${encodeURIComponent(settingKey)}&limit=1`;

  try {
    const response = await fetch(query, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      }
    });

    if (!response.ok) return null;
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return null;

    const rawValue = String(rows[0]?.setting_value || '').trim();
    if (!rawValue) return null;
    return normalizeStore(JSON.parse(rawValue));
  } catch {
    return null;
  }
};

export const persistEnrollmentStoreRemote = async (sectionKey, payload) => {
  if (!canUseSupabaseRest()) return false;

  const normalized = normalizeStore(payload);
  if (!normalized) return false;

  const accessToken = await readSessionAccessToken();
  const { url, anonKey } = getSupabaseConfig();
  const settingKey = getSettingKey(sectionKey);

  if (accessToken) {
    try {
      const staffSyncResponse = await postJsonWithAccessToken('/api/staff-auth-sync', accessToken, {
        sectionKey: normalizeSectionKey(sectionKey),
        staffMembers: Array.isArray(normalized.staffMembers) ? normalized.staffMembers : []
      });

      if (staffSyncResponse.ok) {
        const adminResponse = await postJsonWithAccessToken('/api/enrollment-store-admin', accessToken, {
          sectionKey: normalizeSectionKey(sectionKey),
          payload: normalized
        });

        if (adminResponse.ok) {
          return true;
        }

        return false;
      }

      if (staffSyncResponse.status !== 401 && staffSyncResponse.status !== 403) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const { staffEmail, staffPassword } = readStaffSessionCredentials(sectionKey);
  if (!staffEmail || !staffPassword) {
    return false;
  }

  try {
    const response = await fetch('/api/enrollment-store', {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sectionKey: normalizeSectionKey(sectionKey),
        staffEmail,
        staffPassword,
        payload: normalized
      })
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const syncStaffAuthUsersRemote = async (sectionKey, staffMembers) => {
  const result = await syncStaffAuthUsersRemoteDetailed(sectionKey, staffMembers);
  return result.ok;
};

export const syncStaffAuthUsersRemoteDetailed = async (sectionKey, staffMembers) => {
  const accessToken = await readSessionAccessToken();
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: 'No active admin session was found. Please sign in again.',
      syncedCount: 0
    };
  }

  try {
    const response = await postJsonWithAccessToken('/api/staff-auth-sync', accessToken, {
      sectionKey: normalizeSectionKey(sectionKey),
      staffMembers: Array.isArray(staffMembers) ? staffMembers : []
    });

    const payload = await readJsonResponse(response);
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? '' : toErrorMessage(payload, 'Staff auth sync failed.'),
      syncedCount: Number(payload?.syncedCount) || 0
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'Could not reach /api/staff-auth-sync. Check deployment and try again.',
      syncedCount: 0
    };
  }
};

export const syncEnrollmentStoreFromRemote = async (sectionKey, storageKey = getStorageKey(sectionKey)) => {
  const localStore = readEnrollmentStoreLocal(storageKey);
  const remoteStore = await fetchEnrollmentStoreRemote(sectionKey);

  if (!remoteStore) return localStore;

  const remoteHasData = hasMeaningfulEnrollmentData(remoteStore);
  const localHasData = hasMeaningfulEnrollmentData(localStore);

  if (remoteHasData && !localHasData) {
    writeEnrollmentStoreLocal(storageKey, remoteStore);
    return remoteStore;
  }

  if (!localStore || getStoreUpdatedAt(remoteStore) >= getStoreUpdatedAt(localStore)) {
    writeEnrollmentStoreLocal(storageKey, remoteStore);
    return remoteStore;
  }

  return localStore;
};

export const persistEnrollmentStore = async (sectionKey, storageKey, payload) => {
  const stamped = stampEnrollmentStorePayload(payload);
  const savedLocal = writeEnrollmentStoreLocal(storageKey, stamped);
  if (!savedLocal) {
    return { payload: null, savedRemote: false };
  }

  const savedRemote = await persistEnrollmentStoreRemote(sectionKey, savedLocal);
  return {
    payload: savedLocal,
    savedRemote
  };
};
