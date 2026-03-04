const normalizeStorageKey = (value) => String(value || '').trim();

const getSettingKey = (storageKey) => `local_store:${normalizeStorageKey(storageKey)}`;
const getMetaStorageKey = (storageKey) => `${normalizeStorageKey(storageKey)}.__meta`;

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

const readUpdatedAtMeta = (storageKey) => {
  try {
    const raw = localStorage.getItem(getMetaStorageKey(storageKey));
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const updatedAt = Number(parsed?.updatedAt);
    return Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0;
  } catch {
    return 0;
  }
};

const writeUpdatedAtMeta = (storageKey, updatedAt) => {
  const safeUpdatedAt = Number(updatedAt);
  if (!Number.isFinite(safeUpdatedAt) || safeUpdatedAt <= 0) return;
  try {
    localStorage.setItem(getMetaStorageKey(storageKey), JSON.stringify({ updatedAt: safeUpdatedAt }));
  } catch {
    return;
  }
};

const writeLocalStore = (storageKey, payload, updatedAt = Date.now()) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
    writeUpdatedAtMeta(storageKey, updatedAt);
    return true;
  } catch {
    return false;
  }
};

const fetchRemoteStoreEnvelope = async (storageKey) => {
  if (!canUseSupabaseRest()) return null;

  const { url, anonKey } = getSupabaseConfig();
  const settingKey = getSettingKey(storageKey);
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

    const raw = String(rows[0]?.setting_value || '').trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const updatedAt = Number(parsed.updatedAt);
    const normalizedUpdatedAt = Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0;

    return {
      updatedAt: normalizedUpdatedAt,
      payload: parsed.payload
    };
  } catch {
    return null;
  }
};

const persistRemoteStoreEnvelope = async (storageKey, envelope) => {
  if (!canUseSupabaseRest()) return false;

  const accessToken = await readSessionAccessToken();
  if (!accessToken) return false;

  const { url, anonKey } = getSupabaseConfig();
  const settingKey = getSettingKey(storageKey);

  try {
    const response = await fetch(`${url}/rest/v1/site_settings?on_conflict=setting_key`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify([
        {
          setting_key: settingKey,
          setting_value: JSON.stringify(envelope)
        }
      ])
    });

    return response.ok;
  } catch {
    return false;
  }
};

export const syncLocalStoreFromRemote = async (storageKey) => {
  const normalizedStorageKey = normalizeStorageKey(storageKey);
  if (!normalizedStorageKey) return null;

  let localPayload = null;
  try {
    const rawLocal = localStorage.getItem(normalizedStorageKey);
    localPayload = rawLocal ? JSON.parse(rawLocal) : null;
  } catch {
    localPayload = null;
  }

  const localUpdatedAt = readUpdatedAtMeta(normalizedStorageKey);
  const remote = await fetchRemoteStoreEnvelope(normalizedStorageKey);
  if (!remote) return localPayload;

  const remoteUpdatedAt = Number(remote.updatedAt);
  const shouldApplyRemote =
    !localPayload || !localUpdatedAt || (Number.isFinite(remoteUpdatedAt) && remoteUpdatedAt >= localUpdatedAt);

  if (shouldApplyRemote) {
    writeLocalStore(normalizedStorageKey, remote.payload, remoteUpdatedAt || Date.now());
    return remote.payload;
  }

  return localPayload;
};

export const persistLocalStore = async (storageKey, payload) => {
  const normalizedStorageKey = normalizeStorageKey(storageKey);
  if (!normalizedStorageKey) {
    return { savedLocal: false, savedRemote: false, updatedAt: 0 };
  }

  const updatedAt = Date.now();
  const savedLocal = writeLocalStore(normalizedStorageKey, payload, updatedAt);
  if (!savedLocal) {
    return { savedLocal: false, savedRemote: false, updatedAt: 0 };
  }

  const savedRemote = await persistRemoteStoreEnvelope(normalizedStorageKey, {
    updatedAt,
    payload
  });

  return {
    savedLocal,
    savedRemote,
    updatedAt
  };
};
