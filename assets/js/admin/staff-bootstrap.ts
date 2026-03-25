import { getSession, signIn, signOut } from './api';
import { syncEnrollmentStoreFromRemote } from '../content/enrollment.persistence.js';

const enrollmentSectionKey = 'enrollment_manager';
const enrollmentStorageKey = `bhanoyi.enrollmentClasses.${enrollmentSectionKey}`;
const staffSessionKey = `bhanoyi.staffSession.${enrollmentSectionKey}`;
const staffSessionPasswordKey = `bhanoyi.staffSessionPassword.${enrollmentSectionKey}`;

const normalizeText = (value: unknown, maxLength = 160) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);

const normalizeLoginToken = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildDefaultCredentials = (entry: Record<string, unknown>) => {
  const surnameToken = normalizeLoginToken(entry.surname).slice(0, 16) || 'staff';
  const firstToken = normalizeLoginToken(entry.firstName);
  const initialsToken = normalizeLoginToken(entry.initials);
  const firstInitial = (firstToken.charAt(0) || initialsToken.charAt(0) || 'x').toLowerCase();
  const handle = `${surnameToken}${firstInitial}`.slice(0, 24);
  return {
    email: `${handle}@bhanoyi.education`,
    password: handle
  };
};

type StaffAuthRow = {
  loginEmail: string;
  loginPassword: string;
};

const readStaffCredentials = (): StaffAuthRow[] => {
  try {
    const raw = localStorage.getItem(enrollmentStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { staffMembers?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed?.staffMembers)) return [];

    return parsed.staffMembers
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const defaults = buildDefaultCredentials(entry);
        const loginEmail = normalizeText(entry.loginEmail ?? entry.staffEmail ?? defaults.email, 120).toLowerCase();
        const loginPassword = normalizeText(entry.loginPassword ?? defaults.password, 120);
        if (!loginEmail || !loginPassword) return null;
        return { loginEmail, loginPassword };
      })
      .filter((entry): entry is StaffAuthRow => Boolean(entry));
  } catch {
    return [];
  }
};

const loadStaffCredentials = async (): Promise<StaffAuthRow[]> => {
  await syncEnrollmentStoreFromRemote(enrollmentSectionKey, enrollmentStorageKey);
  return readStaffCredentials();
};

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const refs = {
  loginForm: el<HTMLFormElement>('staff-login-form'),
  emailInput: el<HTMLInputElement>('staff-email'),
  passwordInput: el<HTMLInputElement>('staff-password'),
  status: el<HTMLElement>('staff-auth-status')
};

const setStatus = (message: string) => {
  refs.status.textContent = message;
};

const redirectToMyClass = () => {
  window.location.href = 'enrollment.html?staff=1';
};

const resolveSignedInStaff = async () => {
  const session = await getSession().catch(() => null);
  const email = normalizeText(session?.user?.email, 120).toLowerCase();
  if (!email) return null;

  const rows = await loadStaffCredentials();
  return rows.find((row) => row.loginEmail === email) || null;
};

const bindForm = () => {
  refs.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const loginEmail = normalizeText(refs.emailInput.value, 120).toLowerCase();
    const loginPassword = normalizeText(refs.passwordInput.value, 120);
    if (!loginEmail || !loginPassword) {
      setStatus('Enter your staff email and password.');
      return;
    }

    const rows = await loadStaffCredentials();
    if (!rows.length) {
      setStatus('No staff profiles are available yet. Ask admin to add staff first.');
      return;
    }

    const knownStaff = rows.find((row) => row.loginEmail === loginEmail);
    if (!knownStaff) {
      setStatus('This email is not assigned to a staff profile yet.');
      return;
    }

    try {
      await signIn(loginEmail, loginPassword);
      const matched = await resolveSignedInStaff();
      if (!matched) {
        await signOut().catch(() => null);
        setStatus('This account is not linked to an active staff profile.');
        return;
      }

      sessionStorage.setItem(staffSessionKey, matched.loginEmail);
      sessionStorage.setItem(staffSessionPasswordKey, loginPassword);
      setStatus('Login successful. Redirecting...');
      redirectToMyClass();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Invalid login credentials.');
    }
  });
};

const init = async () => {
  bindForm();

  const matched = await resolveSignedInStaff();
  if (matched) {
    sessionStorage.setItem(staffSessionKey, matched.loginEmail);
    redirectToMyClass();
    return;
  }

  sessionStorage.removeItem(staffSessionKey);
  sessionStorage.removeItem(staffSessionPasswordKey);

  if ((await loadStaffCredentials()).length === 0) {
    setStatus('No staff profiles found yet.');
  }
};

void init();
