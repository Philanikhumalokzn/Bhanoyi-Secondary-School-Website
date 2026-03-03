import { getSession, signIn, signOut } from './api';

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
        await signOut();
        setStatus('This account is not approved for admin access.');
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
  bindForms();

  try {
    const session = await getSession();
    const sessionEmail = session?.user?.email ?? null;
    if (session && isAllowedAdmin(sessionEmail)) {
      redirectToInlineAdmin();
      return;
    }

    if (session && !isAllowedAdmin(sessionEmail)) {
      await signOut();
      setStatus('This account is not approved for admin access.');
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Configuration error.');
  }
};

init();
