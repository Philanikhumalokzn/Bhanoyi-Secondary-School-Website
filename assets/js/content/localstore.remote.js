const normalizeStorageKey = (value) => String(value || '').trim();

const getSettingKey = (storageKey) => `local_store:${normalizeStorageKey(storageKey)}`;
const getMetaStorageKey = (storageKey) => `${normalizeStorageKey(storageKey)}.__meta`;
const bridgeStateStorageKey = 'bhanoyi.__remotePersistenceBridgeState';
const defaultIgnoredPrefixes = ['sb-', 'supabase.', 'firebase:', '__Secure-', '__Host-'];

let bridgeInstalled = false;
let isBridgePersistInFlight = false;
const bridgePendingByKey = new Map();

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

const dispatchRemotePersistStatus = (storageKey, savedRemote) => {
  try {
    window.dispatchEvent(
      new CustomEvent('bhanoyi:remote-persist-status', {
        detail: {
          storageKey: normalizeStorageKey(storageKey),
          savedRemote: Boolean(savedRemote)
        }
      })
    );
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

const writeLocalRaw = (storageKey, rawValue, updatedAt = Date.now()) => {
  try {
    localStorage.setItem(storageKey, String(rawValue));
    writeUpdatedAtMeta(storageKey, updatedAt);
    return true;
  } catch {
    return false;
  }
};

const removeLocalRaw = (storageKey, updatedAt = Date.now()) => {
  try {
    localStorage.removeItem(storageKey);
    writeUpdatedAtMeta(storageKey, updatedAt);
    return true;
  } catch {
    return false;
  }
};

const parseEnvelope = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const updatedAt = Number(value.updatedAt);
  const normalizedUpdatedAt = Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0;
  const mode = value.mode === 'raw' || value.mode === 'json' ? value.mode : 'json';
  return {
    updatedAt: normalizedUpdatedAt,
    mode,
    deleted: value.deleted === true,
    payload: value.payload
  };
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

    return parseEnvelope(JSON.parse(raw));
  } catch {
    return null;
  }
};

const fetchAllRemoteStoreEnvelopes = async () => {
  if (!canUseSupabaseRest()) return [];

  const { url, anonKey } = getSupabaseConfig();
  const query = `${url}/rest/v1/site_settings?select=setting_key,setting_value&setting_key=like.local_store:*`;

  try {
    const response = await fetch(query, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      }
    });

    if (!response.ok) return [];

    const rows = await response.json();
    if (!Array.isArray(rows)) return [];

    return rows
      .map((entry) => {
        const settingKey = String(entry?.setting_key || '').trim();
        if (!settingKey.startsWith('local_store:')) return null;
        const storageKey = settingKey.slice('local_store:'.length);
        const rawEnvelope = String(entry?.setting_value || '').trim();
        if (!storageKey || !rawEnvelope) return null;
        try {
          const envelope = parseEnvelope(JSON.parse(rawEnvelope));
          if (!envelope) return null;
          return { storageKey, envelope };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
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
    if (remote.mode === 'raw') {
      if (remote.deleted) {
        removeLocalRaw(normalizedStorageKey, remoteUpdatedAt || Date.now());
        return null;
      }
      writeLocalRaw(normalizedStorageKey, String(remote.payload || ''), remoteUpdatedAt || Date.now());
      return remote.payload;
    }

    if (remote.deleted) {
      removeLocalRaw(normalizedStorageKey, remoteUpdatedAt || Date.now());
      return null;
    }

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
    mode: 'json',
    deleted: false,
    payload
  });

  dispatchRemotePersistStatus(normalizedStorageKey, savedRemote);

  return {
    savedLocal,
    savedRemote,
    updatedAt
  };
};

export const persistLocalStorageRaw = async (storageKey, rawValue, { deleted = false } = {}) => {
  const normalizedStorageKey = normalizeStorageKey(storageKey);
  if (!normalizedStorageKey) {
    return { savedRemote: false, updatedAt: 0 };
  }

  const updatedAt = Date.now();
  writeUpdatedAtMeta(normalizedStorageKey, updatedAt);

  const savedRemote = await persistRemoteStoreEnvelope(normalizedStorageKey, {
    updatedAt,
    mode: 'raw',
    deleted: Boolean(deleted),
    payload: deleted ? null : String(rawValue ?? '')
  });

  dispatchRemotePersistStatus(normalizedStorageKey, savedRemote);

  return {
    savedRemote,
    updatedAt
  };
};

const shouldSyncStorageKey = (storageKey, ignoredPrefixes) => {
  const key = normalizeStorageKey(storageKey);
  if (!key) return false;
  if (key === bridgeStateStorageKey) return false;
  if (key.endsWith('.__meta')) return false;
  return !ignoredPrefixes.some((prefix) => key.startsWith(prefix));
};

const flushBridgeQueue = async () => {
  if (isBridgePersistInFlight) return;
  isBridgePersistInFlight = true;

  try {
    while (bridgePendingByKey.size) {
      const [storageKey, pending] = bridgePendingByKey.entries().next().value;
      bridgePendingByKey.delete(storageKey);
      if (pending?.deleted) {
        await persistLocalStorageRaw(storageKey, '', { deleted: true });
      } else {
        await persistLocalStorageRaw(storageKey, pending?.rawValue ?? '');
      }
    }
  } finally {
    isBridgePersistInFlight = false;
  }
};

const queueBridgePersist = (storageKey, rawValue, { deleted = false } = {}) => {
  bridgePendingByKey.set(storageKey, {
    rawValue: rawValue == null ? '' : String(rawValue),
    deleted: Boolean(deleted)
  });
  void flushBridgeQueue();
};

const markBridgeBootstrap = () => {
  try {
    localStorage.setItem(bridgeStateStorageKey, JSON.stringify({ syncedAt: Date.now() }));
  } catch {
    return;
  }
};

const applyRemoteEnvelopeToLocal = (storageKey, envelope) => {
  const normalizedStorageKey = normalizeStorageKey(storageKey);
  if (!normalizedStorageKey || !envelope) return;

  const localUpdatedAt = readUpdatedAtMeta(normalizedStorageKey);
  const remoteUpdatedAt = Number(envelope.updatedAt);
  const shouldApply = !localUpdatedAt || (Number.isFinite(remoteUpdatedAt) && remoteUpdatedAt >= localUpdatedAt);
  if (!shouldApply) return;

  if (envelope.deleted) {
    removeLocalRaw(normalizedStorageKey, remoteUpdatedAt || Date.now());
    return;
  }

  if (envelope.mode === 'raw') {
    writeLocalRaw(normalizedStorageKey, String(envelope.payload ?? ''), remoteUpdatedAt || Date.now());
    return;
  }

  writeLocalStore(normalizedStorageKey, envelope.payload, remoteUpdatedAt || Date.now());
};

export const initGlobalLocalStorageRemotePersistence = async ({
  ignoredPrefixes = defaultIgnoredPrefixes,
  syncAllRemoteKeysOnStart = true
} = {}) => {
  if (bridgeInstalled) return;
  bridgeInstalled = true;

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    originalSetItem.call(this, key, value);
    if (this !== localStorage) return;
    const storageKey = normalizeStorageKey(key);
    if (!shouldSyncStorageKey(storageKey, ignoredPrefixes)) return;
    writeUpdatedAtMeta(storageKey, Date.now());
    queueBridgePersist(storageKey, value);
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    originalRemoveItem.call(this, key);
    if (this !== localStorage) return;
    const storageKey = normalizeStorageKey(key);
    if (!shouldSyncStorageKey(storageKey, ignoredPrefixes)) return;
    writeUpdatedAtMeta(storageKey, Date.now());
    queueBridgePersist(storageKey, '', { deleted: true });
  };

  Storage.prototype.clear = function patchedClear() {
    if (this !== localStorage) {
      originalClear.call(this);
      return;
    }

    const keysToDelete = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!shouldSyncStorageKey(key, ignoredPrefixes)) continue;
      keysToDelete.push(key);
    }

    originalClear.call(this);

    keysToDelete.forEach((key) => {
      writeUpdatedAtMeta(key, Date.now());
      queueBridgePersist(key, '', { deleted: true });
    });
  };

  if (syncAllRemoteKeysOnStart) {
    const remoteEntries = await fetchAllRemoteStoreEnvelopes();
    remoteEntries.forEach((entry) => {
      if (!shouldSyncStorageKey(entry.storageKey, ignoredPrefixes)) return;
      applyRemoteEnvelopeToLocal(entry.storageKey, entry.envelope);
    });
  }

  markBridgeBootstrap();
};
