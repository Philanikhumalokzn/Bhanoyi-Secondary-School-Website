import {
  deleteAnnouncement,
  deleteDownload,
  getSession,
  listAnnouncements,
  listDownloads,
  saveAnnouncement,
  saveDownload,
  signIn,
  signOut
} from './api';
import type { AdminRefs, Announcement, DownloadItem } from './types';

const configuredAdmins = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((entry: string) => entry.trim().toLowerCase())
  .filter(Boolean);

const isAllowedAdmin = (email?: string | null) => {
  if (!email) return false;
  if (configuredAdmins.length === 0) return false;
  return configuredAdmins.includes(email.toLowerCase());
};

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const refs: AdminRefs = {
  authPanel: el<HTMLElement>('auth-panel'),
  adminPanel: el<HTMLElement>('admin-panel'),
  authStatus: el<HTMLElement>('auth-status'),
  adminStatus: el<HTMLElement>('admin-status'),
  announcementList: el<HTMLElement>('announcement-list'),
  downloadList: el<HTMLElement>('download-list'),
  loginForm: el<HTMLFormElement>('login-form'),
  announcementForm: el<HTMLFormElement>('announcement-form'),
  downloadForm: el<HTMLFormElement>('download-form'),
  refreshBtn: el<HTMLButtonElement>('refresh-data'),
  logoutBtn: el<HTMLButtonElement>('logout')
};

const setStatus = (message: string, target: 'auth' | 'admin' = 'admin') => {
  if (target === 'auth') refs.authStatus.textContent = message;
  else refs.adminStatus.textContent = message;
};

const resetAnnouncementForm = () => {
  refs.announcementForm.reset();
  el<HTMLInputElement>('announcement-id').value = '';
  el<HTMLInputElement>('announcement-sort').value = '0';
};

const resetDownloadForm = () => {
  refs.downloadForm.reset();
  el<HTMLInputElement>('download-id').value = '';
  el<HTMLInputElement>('download-sort').value = '0';
  el<HTMLInputElement>('download-label').value = 'Download File';
};

const renderAnnouncements = (items: Announcement[]) => {
  refs.announcementList.innerHTML = items
    .map(
      (item) => `
        <div class="admin-item">
          <div>
            <strong>${item.title}</strong>
            <p>${item.date} ${item.tag ? `• ${item.tag}` : ''}</p>
          </div>
          <div class="admin-item-actions">
            <button data-action="edit" data-id="${item.id}" data-type="announcement">Edit</button>
            <button data-action="delete" data-id="${item.id}" data-type="announcement">Delete</button>
          </div>
        </div>
      `
    )
    .join('');
};

const renderDownloads = (items: DownloadItem[]) => {
  refs.downloadList.innerHTML = items
    .map(
      (item) => `
        <div class="admin-item">
          <div>
            <strong>${item.title}</strong>
            <p>${item.section} • ${item.href}</p>
          </div>
          <div class="admin-item-actions">
            <button data-action="edit" data-id="${item.id}" data-type="download">Edit</button>
            <button data-action="delete" data-id="${item.id}" data-type="download">Delete</button>
          </div>
        </div>
      `
    )
    .join('');
};

let announcementCache: Announcement[] = [];
let downloadCache: DownloadItem[] = [];

const loadData = async () => {
  announcementCache = await listAnnouncements();
  downloadCache = await listDownloads();
  renderAnnouncements(announcementCache);
  renderDownloads(downloadCache);
};

const bindListActions = () => {
  const root = document.body;
  root.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id');
    const type = target.getAttribute('data-type');

    if (!action || !id || !type) return;

    try {
      if (action === 'delete' && type === 'announcement') {
        await deleteAnnouncement(id);
      }
      if (action === 'delete' && type === 'download') {
        await deleteDownload(id);
      }

      if (action === 'edit' && type === 'announcement') {
        const entry = announcementCache.find((item) => item.id === id);
        if (!entry) return;
        el<HTMLInputElement>('announcement-id').value = entry.id;
        el<HTMLInputElement>('announcement-date').value = entry.date;
        el<HTMLInputElement>('announcement-tag').value = entry.tag;
        el<HTMLInputElement>('announcement-title').value = entry.title;
        el<HTMLTextAreaElement>('announcement-body').value = entry.body;
        el<HTMLInputElement>('announcement-sort').value = String(entry.sort_order ?? 0);
        return;
      }

      if (action === 'edit' && type === 'download') {
        const entry = downloadCache.find((item) => item.id === id);
        if (!entry) return;
        el<HTMLInputElement>('download-id').value = entry.id;
        el<HTMLSelectElement>('download-section').value = entry.section;
        el<HTMLInputElement>('download-title').value = entry.title;
        el<HTMLTextAreaElement>('download-body').value = entry.body;
        el<HTMLInputElement>('download-href').value = entry.href;
        el<HTMLInputElement>('download-label').value = entry.link_label;
        el<HTMLInputElement>('download-sort').value = String(entry.sort_order ?? 0);
        return;
      }

      await loadData();
      setStatus('Changes saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Action failed.');
    }
  });
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
        setStatus('This account is not approved for admin access.', 'auth');
        return;
      }

      refs.authPanel.hidden = true;
      refs.adminPanel.hidden = false;
      await loadData();
      setStatus('Login successful.', 'auth');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Login failed.', 'auth');
    }
  });

  refs.announcementForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveAnnouncement({
        id: el<HTMLInputElement>('announcement-id').value || undefined,
        date: el<HTMLInputElement>('announcement-date').value,
        tag: el<HTMLInputElement>('announcement-tag').value,
        title: el<HTMLInputElement>('announcement-title').value,
        body: el<HTMLTextAreaElement>('announcement-body').value,
        sort_order: Number(el<HTMLInputElement>('announcement-sort').value || 0)
      });
      resetAnnouncementForm();
      await loadData();
      setStatus('Announcement saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save announcement.');
    }
  });

  refs.downloadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveDownload({
        id: el<HTMLInputElement>('download-id').value || undefined,
        section: el<HTMLSelectElement>('download-section').value as 'admissions' | 'policies',
        title: el<HTMLInputElement>('download-title').value,
        body: el<HTMLTextAreaElement>('download-body').value,
        href: el<HTMLInputElement>('download-href').value,
        link_label: el<HTMLInputElement>('download-label').value,
        sort_order: Number(el<HTMLInputElement>('download-sort').value || 0)
      });
      resetDownloadForm();
      await loadData();
      setStatus('Download saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save download.');
    }
  });

  refs.refreshBtn.addEventListener('click', async () => {
    await loadData();
    setStatus('Data refreshed.');
  });

  refs.logoutBtn.addEventListener('click', async () => {
    await signOut();
    refs.adminPanel.hidden = true;
    refs.authPanel.hidden = false;
    setStatus('Logged out.', 'auth');
  });
};

const init = async () => {
  bindForms();
  bindListActions();

  try {
    const session = await getSession();
    const sessionEmail = session?.user?.email ?? null;
    if (session && isAllowedAdmin(sessionEmail)) {
      refs.authPanel.hidden = true;
      refs.adminPanel.hidden = false;
      await loadData();
      return;
    }

    if (session && !isAllowedAdmin(sessionEmail)) {
      await signOut();
      setStatus('This account is not approved for admin access.', 'auth');
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Configuration error.', 'auth');
  }
};

init();
