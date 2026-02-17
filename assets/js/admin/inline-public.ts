import { deleteAnnouncement, getSession, saveAnnouncement, signOut } from './api';

type AnnouncementRecord = {
  id: string;
  date: string;
  tag: string;
  title: string;
  body: string;
};

const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((entry: string) => entry.trim().toLowerCase())
  .filter(Boolean);

const isAllowed = (email?: string | null) => {
  if (!email) return false;
  return adminEmails.includes(email.toLowerCase());
};

const getText = (root: Element, selector: string) =>
  (root.querySelector(selector)?.textContent ?? '').trim();

const showStatus = (message: string) => {
  const existing = document.getElementById('inline-admin-status');
  if (existing) {
    existing.textContent = message;
    return;
  }

  const status = document.createElement('div');
  status.id = 'inline-admin-status';
  status.className = 'inline-admin-status';
  status.textContent = message;
  document.body.appendChild(status);
};

const toRecord = (item: Element): AnnouncementRecord | null => {
  const id = (item as HTMLElement).dataset.announcementId;
  if (!id) return null;

  return {
    id,
    date: getText(item, '.notice-date'),
    tag: getText(item, '.notice-tag'),
    title: getText(item, '.notice-title'),
    body: getText(item, '.notice-body')
  };
};

const editRecord = async (record: AnnouncementRecord) => {
  const date = prompt('Announcement date', record.date);
  if (date === null) return;
  const tag = prompt('Announcement tag', record.tag);
  if (tag === null) return;
  const title = prompt('Announcement title', record.title);
  if (title === null) return;
  const body = prompt('Announcement body', record.body);
  if (body === null) return;

  await saveAnnouncement({ id: record.id, date, tag, title, body });
  showStatus('Announcement updated. Refreshing...');
  window.location.reload();
};

const addRecord = async () => {
  const date = prompt('New announcement date (e.g. 20 Feb 2026)', '');
  if (!date) return;
  const tag = prompt('Tag (optional)', '') ?? '';
  const title = prompt('Title', '');
  if (!title) return;
  const body = prompt('Body', '');
  if (!body) return;

  await saveAnnouncement({ date, tag, title, body, sort_order: 0 });
  showStatus('Announcement added. Refreshing...');
  window.location.reload();
};

const bindInlineActions = () => {
  const noticeItems = Array.from(document.querySelectorAll('.notice-item'));

  noticeItems.forEach((item) => {
    const record = toRecord(item);
    if (!record) return;

    const controls = document.createElement('div');
    controls.className = 'inline-admin-controls';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', async () => {
      try {
        await editRecord(record);
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to edit announcement.');
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      const ok = confirm('Delete this announcement?');
      if (!ok) return;

      try {
        await deleteAnnouncement(record.id);
        showStatus('Announcement deleted. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to delete announcement.');
      }
    });

    controls.appendChild(editBtn);
    controls.appendChild(deleteBtn);
    item.appendChild(controls);

    const bodyEl = item.querySelector('.notice-body');
    bodyEl?.addEventListener('click', async () => {
      try {
        await editRecord(record);
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to edit announcement.');
      }
    });
  });
};

const mountToolbar = () => {
  const toolbar = document.createElement('div');
  toolbar.className = 'inline-admin-toolbar';
  toolbar.innerHTML = `
    <strong>Admin Mode</strong>
    <button type="button" id="inline-add-announcement">Add Announcement</button>
    <button type="button" id="inline-admin-logout">Logout</button>
  `;
  document.body.appendChild(toolbar);

  const addBtn = document.getElementById('inline-add-announcement') as HTMLButtonElement | null;
  addBtn?.addEventListener('click', async () => {
    try {
      await addRecord();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to add announcement.');
    }
  });

  const logoutBtn = document.getElementById('inline-admin-logout') as HTMLButtonElement | null;
  logoutBtn?.addEventListener('click', async () => {
    await signOut();
    window.location.href = 'admin.html';
  });
};

export const initInlinePublicAdmin = async () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') !== '1') return;

  const session = await getSession();
  const email = session?.user?.email ?? null;
  if (!isAllowed(email)) {
    await signOut();
    showStatus('Admin mode denied for this account.');
    return;
  }

  document.body.classList.add('inline-admin-active');
  mountToolbar();
  bindInlineActions();
  showStatus('Admin mode active. Click an announcement body to edit.');
};
