import { normalize, readJsonBody, requireAdminRequest, sendJson } from './http.js';

const sectionKeyAllowed = 'enrollment_manager';
const managedByTag = 'bhanoyi-enrollment-staff';

const getSupabaseServiceConfig = () => {
  const url = normalize(process.env.SUPABASE_URL) || normalize(process.env.VITE_SUPABASE_URL);
  const serviceRoleKey =
    normalize(process.env.SUPABASE_SERVICE_ROLE_KEY) || normalize(process.env.SUPABASE_SERVICE_KEY);
  return { url, serviceRoleKey };
};

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeStaffType = (value) =>
  String(value || '').trim().toLowerCase() === 'non_teaching_staff' ? 'non_teaching_staff' : 'teaching_staff';

const normalizeText = (value, maxLength = 160) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);

const normalizeEmail = (value) => normalizeText(value, 120).toLowerCase();

const normalizePassword = (value) => normalizeText(value, 120);

const buildStaffKey = (entry) => {
  const staffType = normalizeStaffType(entry?.staffType);
  const surname = normalizeText(entry?.surname, 80).toLowerCase();
  const initials = normalizeText(entry?.initials, 40).toLowerCase();
  const staffNumber = normalizeText(entry?.staffNumber, 40).toLowerCase();
  return `${surname}::${initials}::${staffNumber}::${staffType}`;
};

const normalizeStaffMember = (entry) => {
  if (!isRecord(entry)) return null;

  const loginEmail = normalizeEmail(entry.loginEmail || entry.staffEmail || entry.email);
  const loginPassword = normalizePassword(entry.loginPassword);
  const surname = normalizeText(entry.surname, 80);
  const firstName = normalizeText(entry.firstName, 80);
  const initials = normalizeText(entry.initials, 40);

  if (!loginEmail || !loginPassword || !surname) return null;

  return {
    staffType: normalizeStaffType(entry.staffType),
    surname,
    firstName,
    initials,
    staffNumber: normalizeText(entry.staffNumber, 40),
    assignedGrade: normalizeText(entry.assignedGrade, 8),
    assignedClassLetter: normalizeText(entry.assignedClassLetter, 8),
    displayName:
      normalizeText(entry.displayNameOverride || entry.displayName || entry.name, 120) ||
      [surname, firstName].filter(Boolean).join(' ').trim(),
    loginEmail,
    loginPassword,
    staffKey: buildStaffKey(entry)
  };
};

const listManagedStaffUsers = async (url, serviceRoleKey) => {
  const response = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  if (!response.ok) {
    throw new Error('Could not load managed staff auth users.');
  }

  const payload = await response.json().catch(() => ({}));
  const users = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : [];
  return users.filter(
    (user) =>
      isRecord(user) &&
      isRecord(user.app_metadata) &&
      normalize(user.app_metadata.managed_by) === managedByTag &&
      normalize(user.app_metadata.sectionKey || user.user_metadata?.sectionKey) === sectionKeyAllowed
  );
};

const toAuthPayload = (staff) => ({
  email: staff.loginEmail,
  password: staff.loginPassword,
  email_confirm: true,
  user_metadata: {
    accountType: 'staff',
    sectionKey: sectionKeyAllowed,
    staffKey: staff.staffKey,
    displayName: staff.displayName,
    staffNumber: staff.staffNumber,
    assignedGrade: staff.assignedGrade,
    assignedClassLetter: staff.assignedClassLetter,
    staffType: staff.staffType
  },
  app_metadata: {
    managed_by: managedByTag,
    role: 'staff',
    sectionKey: sectionKeyAllowed
  }
});

const readErrorMessage = async (response, fallback) => {
  try {
    const payload = await response.json();
    return normalize(payload?.msg || payload?.message || payload?.error_description || payload?.error) || fallback;
  } catch {
    return fallback;
  }
};

const createAuthUser = async (url, serviceRoleKey, staff) => {
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(toAuthPayload(staff))
  });

  if (!response.ok) {
    const message = await readErrorMessage(response, `Could not create auth user for ${staff.loginEmail}.`);
    throw new Error(message);
  }

  const payload = await response.json().catch(() => ({}));
  return payload?.user || payload;
};

const updateAuthUser = async (url, serviceRoleKey, userId, staff) => {
  const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(toAuthPayload(staff))
  });

  if (!response.ok) {
    const message = await readErrorMessage(response, `Could not update auth user for ${staff.loginEmail}.`);
    throw new Error(message);
  }

  const payload = await response.json().catch(() => ({}));
  return payload?.user || payload;
};

const deleteAuthUser = async (url, serviceRoleKey, userId) => {
  const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  if (!response.ok && response.status !== 404) {
    const message = await readErrorMessage(response, 'Could not delete removed staff auth user.');
    throw new Error(message);
  }
};

const syncManagedStaffUsers = async (url, serviceRoleKey, staffMembers) => {
  const normalizedStaff = (Array.isArray(staffMembers) ? staffMembers : [])
    .map((entry) => normalizeStaffMember(entry))
    .filter(Boolean);

  const seenEmails = new Set();
  normalizedStaff.forEach((staff) => {
    if (seenEmails.has(staff.loginEmail)) {
      throw new Error(`Duplicate staff login email found: ${staff.loginEmail}`);
    }
    seenEmails.add(staff.loginEmail);
  });

  const managedUsers = await listManagedStaffUsers(url, serviceRoleKey);
  const usersByEmail = new Map(managedUsers.map((user) => [normalizeEmail(user.email), user]));
  const usersByStaffKey = new Map(
    managedUsers
      .map((user) => [normalize(user.user_metadata?.staffKey || ''), user])
      .filter(([staffKey]) => Boolean(staffKey))
  );

  const retainedUserIds = new Set();

  for (const staff of normalizedStaff) {
    const matchedUser = usersByStaffKey.get(staff.staffKey) || usersByEmail.get(staff.loginEmail) || null;
    if (matchedUser?.id) {
      const updatedUser = await updateAuthUser(url, serviceRoleKey, matchedUser.id, staff);
      if (updatedUser?.id) retainedUserIds.add(updatedUser.id);
      continue;
    }

    const createdUser = await createAuthUser(url, serviceRoleKey, staff);
    if (createdUser?.id) retainedUserIds.add(createdUser.id);
  }

  for (const user of managedUsers) {
    if (!user?.id) continue;
    if (retainedUserIds.has(user.id)) continue;
    await deleteAuthUser(url, serviceRoleKey, user.id);
  }

  return normalizedStaff.length;
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
      error: 'Server auth sync is not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required).'
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

  try {
    const syncedCount = await syncManagedStaffUsers(url, serviceRoleKey, body.staffMembers);
    return sendJson(response, 200, { ok: true, syncedCount, sectionKey, by: admin.email });
  } catch (error) {
    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Staff auth sync failed.'
    });
  }
}