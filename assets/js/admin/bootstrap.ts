import { getSession, signIn, signOut } from './api';
import {
  readEnrollmentStoreLocal,
  syncEnrollmentStoreFromRemote,
  syncStaffAuthUsersRemote
} from '../content/enrollment.persistence.js';
import { initGlobalLocalStorageRemotePersistence } from '../content/localstore.remote.js';

const enrollmentSectionKey = 'enrollment_manager';
const enrollmentStorageKey = `bhanoyi.enrollmentClasses.${enrollmentSectionKey}`;

const configuredAdmins = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((entry: string) => entry.trim().toLowerCase())
  .filter(Boolean);

const isAllowedAdmin = (email?: string | null) => {
  if (!email) return false;
  if (configuredAdmins.length === 0) return false;
  return configuredAdmins.includes(email.toLowerCase());
};

const redirectToInlineAdmin = () => {
  window.location.href = 'index.html?admin=1';
};

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const refs = {
  authStatus: el<HTMLElement>('auth-status'),
  loginForm: el<HTMLFormElement>('login-form')
};

const setStatus = (message: string) => {
  refs.authStatus.textContent = message;
};

const redirectToStaffLogin = () => {
  window.location.href = 'staff.html';
};

const isKnownStaffAccount = async (email?: string | null) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return false;

  const remoteStore = await syncEnrollmentStoreFromRemote(enrollmentSectionKey, enrollmentStorageKey);
  const localStore = readEnrollmentStoreLocal(enrollmentStorageKey);
  const source = remoteStore || localStore;
  const staffMembers = Array.isArray(source?.staffMembers) ? source.staffMembers : [];

  return staffMembers.some((entry) => String(entry?.loginEmail || entry?.staffEmail || '').trim().toLowerCase() === normalizedEmail);
};

const syncStaffAuthAfterAdminSignIn = async () => {
  const remoteStore = await syncEnrollmentStoreFromRemote(enrollmentSectionKey, enrollmentStorageKey);
  const localStore = readEnrollmentStoreLocal(enrollmentStorageKey);
  const source = remoteStore || localStore;
  const staffMembers = Array.isArray(source?.staffMembers) ? source.staffMembers : [];
  if (!staffMembers.length) return true;
  return syncStaffAuthUsersRemote(enrollmentSectionKey, staffMembers);
};

const bindForms = () => {
  refs.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = el<HTMLInputElement>('email').value;
    const password = el<HTMLInputElement>('password').value;

    try {
      await signIn(email, password);
      const session = await getSession();
      const sessionEmail = session?.user?.email ?? null;

      if (!isAllowedAdmin(sessionEmail)) {
        if (await isKnownStaffAccount(sessionEmail)) {
          setStatus('This is the admin login. Redirecting staff account to the staff workspace...');
          redirectToStaffLogin();
          return;
        }

        await signOut();
        setStatus('This account is not approved for admin access. Use staff login for staff accounts.');
        return;
      }

      const staffSyncOk = await syncStaffAuthAfterAdminSignIn();
      if (!staffSyncOk) {
        setStatus('Admin login succeeded, but staff account sync did not complete. Open Enrollment and wait a moment before testing staff login.');
        redirectToInlineAdmin();
        return;
      }

      setStatus('Login successful. Redirecting...');
      redirectToInlineAdmin();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Login failed.');
    }
  });
};

const init = async () => {
  await initGlobalLocalStorageRemotePersistence();
  bindForms();

  try {
    const session = await getSession();
    const sessionEmail = session?.user?.email ?? null;
    if (session && isAllowedAdmin(sessionEmail)) {
      await syncStaffAuthAfterAdminSignIn().catch(() => false);
      redirectToInlineAdmin();
      return;
    }

    if (session && !isAllowedAdmin(sessionEmail)) {
      if (await isKnownStaffAccount(sessionEmail)) {
        setStatus('This is the admin login. Redirecting staff account to the staff workspace...');
        redirectToStaffLogin();
        return;
      }

      await signOut();
      setStatus('This account is not approved for admin access. Use staff login for staff accounts.');
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Configuration error.');
  }
};

init();
