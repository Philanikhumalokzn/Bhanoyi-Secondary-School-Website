import {
  deleteAnnouncement,
  deleteCard,
  deleteDownload,
  getSession,
  saveAnnouncement,
  saveCard,
  saveDownload,
  signOut
} from './api';

type AnnouncementRecord = {
  id: string;
  date: string;
  tag: string;
  title: string;
  body: string;
};

type CardRecord = {
  id?: string;
  sectionKey: string;
  sortOrder: number;
  clickable: boolean;
  title: string;
  body: string;
  href: string;
};

type DownloadRecord = {
  id?: string;
  section: 'admissions' | 'policies';
  sortOrder: number;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
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

const currentPageKey = (): string => document.body.dataset.page || 'home';

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

const toCardRecord = (item: Element): CardRecord => {
  const title = (item.querySelector('h3')?.textContent ?? '').trim();
  const body = (item.querySelector('p')?.textContent ?? '').trim();
  const href = (item as HTMLAnchorElement).getAttribute?.('href') ?? '';

  return {
    id: (item as HTMLElement).dataset.cardId || undefined,
    sectionKey: (item as HTMLElement).dataset.sectionKey || '',
    sortOrder: Number((item as HTMLElement).dataset.sortOrder || '0'),
    clickable: (item as HTMLElement).dataset.cardClickable === 'true',
    title,
    body,
    href
  };
};

const toDownloadRecord = (item: Element): DownloadRecord => {
  const section = (currentPageKey() === 'policies' ? 'policies' : 'admissions') as
    | 'admissions'
    | 'policies';

  return {
    id: (item as HTMLElement).dataset.downloadId || undefined,
    section,
    sortOrder: Number((item as HTMLElement).dataset.sortOrder || '0'),
    title: (item.querySelector('h3')?.textContent ?? '').trim(),
    body: (item.querySelector('p')?.textContent ?? '').trim(),
    href: ((item.querySelector('a.download-link') as HTMLAnchorElement | null)?.getAttribute('href') ?? '').trim(),
    linkLabel: ((item.querySelector('a.download-link') as HTMLAnchorElement | null)?.textContent ?? 'Download File').trim()
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

const editCard = async (record: CardRecord) => {
  const title = prompt('Card title', record.title);
  if (title === null) return;
  const body = prompt('Card body', record.body);
  if (body === null) return;
  let href = record.href;
  if (record.clickable) {
    const nextHref = prompt('Card link URL', record.href || '#');
    if (nextHref === null) return;
    href = nextHref;
  }

  if (!record.id) {
    await saveCard({
      page_key: currentPageKey(),
      section_key: record.sectionKey,
      title,
      body,
      href,
      sort_order: record.sortOrder
    });
  } else {
    await saveCard({ id: record.id, title, body, href });
  }

  showStatus('Card saved. Refreshing...');
  window.location.reload();
};

const addCard = async () => {
  const sectionKey = prompt('Section key (e.g. quick_links, latest_news, upcoming_events)', 'latest_news');
  if (!sectionKey) return;
  const title = prompt('Card title', '');
  if (!title) return;
  const body = prompt('Card body', '');
  if (!body) return;
  const href = prompt('Link URL (use # if not clickable)', '#') ?? '#';

  await saveCard({
    page_key: currentPageKey(),
    section_key: sectionKey,
    title,
    body,
    href,
    sort_order: 0
  });

  showStatus('Card added. Refreshing...');
  window.location.reload();
};

const editDownload = async (record: DownloadRecord) => {
  const title = prompt('Download title', record.title);
  if (title === null) return;
  const body = prompt('Download description', record.body);
  if (body === null) return;
  const href = prompt('Download URL', record.href);
  if (href === null) return;
  const linkLabel = prompt('Button label', record.linkLabel);
  if (linkLabel === null) return;

  await saveDownload({
    id: record.id,
    section: record.section,
    title,
    body,
    href,
    link_label: linkLabel,
    sort_order: record.sortOrder
  });

  showStatus('Download saved. Refreshing...');
  window.location.reload();
};

const addDownload = async () => {
  const page = currentPageKey();
  if (page !== 'admissions' && page !== 'policies') {
    showStatus('Open Admissions or Policies page to add downloads.');
    return;
  }

  const title = prompt('Download title', '');
  if (!title) return;
  const body = prompt('Download description', '');
  if (!body) return;
  const href = prompt('Download URL', '/documents/');
  if (!href) return;
  const linkLabel = prompt('Button label', 'Download File') || 'Download File';

  await saveDownload({
    section: page,
    title,
    body,
    href,
    link_label: linkLabel,
    sort_order: 0
  });

  showStatus('Download added. Refreshing...');
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

  const editableCards = Array.from(document.querySelectorAll('[data-editable-card="true"]'));
  editableCards.forEach((item) => {
    const record = toCardRecord(item);

    const controls = document.createElement('div');
    controls.className = 'inline-admin-controls';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        await editCard(record);
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to edit card.');
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      if (!record.id) {
        showStatus('This card is from default content and cannot be deleted yet. Edit it first.');
        return;
      }

      const ok = confirm('Delete this card?');
      if (!ok) return;

      try {
        await deleteCard(record.id);
        showStatus('Card deleted. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to delete card.');
      }
    });

    controls.appendChild(editBtn);
    controls.appendChild(deleteBtn);
    item.appendChild(controls);

    item.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.inline-admin-controls')) return;
      event.preventDefault();
    });
  });

  const editableDownloads = Array.from(document.querySelectorAll('[data-editable-download="true"]'));
  editableDownloads.forEach((item) => {
    const record = toDownloadRecord(item);

    const controls = document.createElement('div');
    controls.className = 'inline-admin-controls';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', async () => {
      try {
        await editDownload(record);
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to edit download.');
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!record.id) {
        showStatus('This download is from default content and cannot be deleted yet. Edit it first.');
        return;
      }

      const ok = confirm('Delete this download?');
      if (!ok) return;

      try {
        await deleteDownload(record.id);
        showStatus('Download deleted. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to delete download.');
      }
    });

    controls.appendChild(editBtn);
    controls.appendChild(deleteBtn);
    item.appendChild(controls);
  });
};

const mountToolbar = () => {
  const toolbar = document.createElement('div');
  toolbar.className = 'inline-admin-toolbar';
  toolbar.innerHTML = `
    <strong>Admin Mode</strong>
    <button type="button" id="inline-add-announcement">Add Announcement</button>
    <button type="button" id="inline-add-card">Add Card</button>
    <button type="button" id="inline-add-download">Add Download</button>
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

  const addCardBtn = document.getElementById('inline-add-card') as HTMLButtonElement | null;
  addCardBtn?.addEventListener('click', async () => {
    try {
      await addCard();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to add card.');
    }
  });

  const addDownloadBtn = document.getElementById('inline-add-download') as HTMLButtonElement | null;
  addDownloadBtn?.addEventListener('click', async () => {
    try {
      await addDownload();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to add download.');
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
