import {
  deleteAnnouncement,
  deleteCard,
  deleteDownload,
  deleteHeroNotice,
  getSession,
  saveAnnouncement,
  saveCard,
  saveDownload,
  saveHeroNotice,
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

type HeroNoticeRecord = {
  pageKey: string;
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

const setEditable = (element: Element | null, enabled: boolean) => {
  if (!element) return;
  const html = element as HTMLElement;
  html.contentEditable = enabled ? 'true' : 'false';
  html.spellcheck = enabled;
  html.classList.toggle('inline-editable-field', enabled);
};

const createUrlEditor = (label: string, value: string) => {
  const wrapper = document.createElement('label');
  wrapper.className = 'inline-url-editor';

  const span = document.createElement('span');
  span.textContent = label;

  const input = document.createElement('input');
  input.type = 'url';
  input.value = value;

  wrapper.appendChild(span);
  wrapper.appendChild(input);

  return { wrapper, input };
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

const toHeroNoticeRecord = (notice: Element): HeroNoticeRecord => ({
  pageKey: (notice as HTMLElement).dataset.pageKey || currentPageKey(),
  title: getText(notice, '.hero-notice-title'),
  body: getText(notice, '.hero-notice-body'),
  href: ((notice.querySelector('.hero-notice-link') as HTMLAnchorElement | null)?.getAttribute('href') ?? '').trim(),
  linkLabel: ((notice.querySelector('.hero-notice-link') as HTMLAnchorElement | null)?.textContent ?? 'View notice').trim()
});

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

const wireAnnouncementInline = (item: Element) => {
  const record = toRecord(item);
  if (!record) return;

  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  item.appendChild(controls);

  const dateEl = item.querySelector('.notice-date');
  const titleEl = item.querySelector('.notice-title');
  const bodyEl = item.querySelector('.notice-body');
  const metaEl = item.querySelector('.notice-meta');

  let tagEl = item.querySelector('.notice-tag');
  let createdTag = false;

  const readState = { ...record };

  const exitEdit = () => {
    setEditable(dateEl, false);
    setEditable(tagEl, false);
    setEditable(titleEl, false);
    setEditable(bodyEl, false);
  };

  const renderReadControls = () => {
    controls.innerHTML = '';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', enterEdit);

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
  };

  const renderEditControls = () => {
    controls.innerHTML = '';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        await saveAnnouncement({
          id: record.id,
          date: (dateEl?.textContent ?? '').trim(),
          tag: (tagEl?.textContent ?? '').trim(),
          title: (titleEl?.textContent ?? '').trim(),
          body: (bodyEl?.textContent ?? '').trim()
        });
        showStatus('Announcement updated. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to update announcement.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (dateEl) dateEl.textContent = readState.date;
      if (tagEl) tagEl.textContent = readState.tag;
      if (titleEl) titleEl.textContent = readState.title;
      if (bodyEl) bodyEl.textContent = readState.body;
      if (!readState.tag && createdTag && tagEl) {
        tagEl.remove();
        tagEl = null;
        createdTag = false;
      }
      exitEdit();
      renderReadControls();
    });

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
  };

  const enterEdit = () => {
    if (!tagEl && metaEl) {
      const newTag = document.createElement('span');
      newTag.className = 'notice-tag';
      newTag.textContent = '';
      metaEl.appendChild(newTag);
      tagEl = newTag;
      createdTag = true;
    }

    setEditable(dateEl, true);
    setEditable(tagEl, true);
    setEditable(titleEl, true);
    setEditable(bodyEl, true);
    renderEditControls();
  };

  renderReadControls();

  bodyEl?.addEventListener('click', () => {
    if (controls.querySelector('button')?.textContent === 'Save') return;
    enterEdit();
  });
};

const wireCardInline = (item: Element) => {
  const record = toCardRecord(item);
  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  item.appendChild(controls);

  const titleEl = item.querySelector('h3');
  const bodyEl = item.querySelector('p');

  let urlEditor: HTMLInputElement | null = null;

  const readState = { ...record };

  const exitEdit = () => {
    setEditable(titleEl, false);
    setEditable(bodyEl, false);
    if (urlEditor) {
      urlEditor.parentElement?.remove();
      urlEditor = null;
    }
  };

  const renderReadControls = () => {
    controls.innerHTML = '';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', enterEdit);

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
  };

  const renderEditControls = () => {
    controls.innerHTML = '';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        const payload = {
          id: record.id,
          page_key: currentPageKey(),
          section_key: record.sectionKey,
          sort_order: record.sortOrder,
          title: (titleEl?.textContent ?? '').trim(),
          body: (bodyEl?.textContent ?? '').trim(),
          href: record.clickable ? (urlEditor?.value ?? '#').trim() : '#'
        };

        await saveCard(payload);
        showStatus('Card saved. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to save card.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (titleEl) titleEl.textContent = readState.title;
      if (bodyEl) bodyEl.textContent = readState.body;
      if (record.clickable && item instanceof HTMLAnchorElement) {
        item.setAttribute('href', readState.href || '#');
      }
      exitEdit();
      renderReadControls();
    });

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
  };

  const enterEdit = (event?: Event) => {
    event?.preventDefault();
    setEditable(titleEl, true);
    setEditable(bodyEl, true);

    if (record.clickable && !urlEditor) {
      const { wrapper, input } = createUrlEditor('Link URL', readState.href || '#');
      item.appendChild(wrapper);
      urlEditor = input;
    }

    renderEditControls();
  };

  renderReadControls();

  item.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('.inline-admin-controls')) return;
    if ((event.target as HTMLElement).closest('.inline-url-editor')) return;
    event.preventDefault();
  });

  bodyEl?.addEventListener('click', enterEdit);
};

const wireDownloadInline = (item: Element) => {
  const record = toDownloadRecord(item);
  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  item.appendChild(controls);

  const titleEl = item.querySelector('h3');
  const bodyEl = item.querySelector('p');
  const linkEl = item.querySelector('a.download-link') as HTMLAnchorElement | null;

  let urlEditor: HTMLInputElement | null = null;

  const readState = { ...record };

  const exitEdit = () => {
    setEditable(titleEl, false);
    setEditable(bodyEl, false);
    setEditable(linkEl, false);
    if (urlEditor) {
      urlEditor.parentElement?.remove();
      urlEditor = null;
    }
  };

  const renderReadControls = () => {
    controls.innerHTML = '';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', enterEdit);

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
  };

  const renderEditControls = () => {
    controls.innerHTML = '';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        await saveDownload({
          id: record.id,
          section: record.section,
          sort_order: record.sortOrder,
          title: (titleEl?.textContent ?? '').trim(),
          body: (bodyEl?.textContent ?? '').trim(),
          href: (urlEditor?.value ?? '').trim(),
          link_label: (linkEl?.textContent ?? 'Download File').trim()
        });
        showStatus('Download saved. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to save download.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (titleEl) titleEl.textContent = readState.title;
      if (bodyEl) bodyEl.textContent = readState.body;
      if (linkEl) {
        linkEl.textContent = readState.linkLabel;
        linkEl.setAttribute('href', readState.href);
      }
      exitEdit();
      renderReadControls();
    });

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
  };

  const enterEdit = () => {
    setEditable(titleEl, true);
    setEditable(bodyEl, true);
    setEditable(linkEl, true);

    if (!urlEditor) {
      const { wrapper, input } = createUrlEditor('Download URL', readState.href);
      item.appendChild(wrapper);
      urlEditor = input;
    }

    renderEditControls();
  };

  renderReadControls();
  bodyEl?.addEventListener('click', enterEdit);
};

const createHeroNoticeElement = () => {
  const heroGrid = document.querySelector('.hero .hero-grid');
  if (!heroGrid) return null;

  const notice = document.createElement('aside');
  notice.className = 'alert-box hero-notice';
  notice.setAttribute('aria-label', 'Important announcement');
  (notice as HTMLElement).dataset.pageKey = currentPageKey();
  notice.innerHTML = `
    <h2 class="hero-notice-title">Important Notice</h2>
    <p class="hero-notice-body">Write the notice details here.</p>
    <a class="hero-notice-link" href="#">View notice</a>
  `;

  heroGrid.appendChild(notice);
  return notice;
};

const wireHeroNoticeInline = (notice: Element, isNew = false) => {
  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  notice.appendChild(controls);

  const titleEl = notice.querySelector('.hero-notice-title');
  const bodyEl = notice.querySelector('.hero-notice-body');
  const linkEl = notice.querySelector('.hero-notice-link') as HTMLAnchorElement | null;

  let urlEditor: HTMLInputElement | null = null;
  const readState = toHeroNoticeRecord(notice);

  const exitEdit = () => {
    setEditable(titleEl, false);
    setEditable(bodyEl, false);
    setEditable(linkEl, false);
    if (urlEditor) {
      urlEditor.parentElement?.remove();
      urlEditor = null;
    }
  };

  const renderReadControls = () => {
    controls.innerHTML = '';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', enterEdit);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      try {
        await deleteHeroNotice(currentPageKey());
        showStatus('Important notice removed. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to remove important notice.');
      }
    });

    controls.appendChild(editBtn);
    controls.appendChild(deleteBtn);
  };

  const renderEditControls = () => {
    controls.innerHTML = '';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        await saveHeroNotice({
          page_key: currentPageKey(),
          title: (titleEl?.textContent ?? '').trim(),
          body: (bodyEl?.textContent ?? '').trim(),
          href: (urlEditor?.value ?? '#').trim(),
          link_label: (linkEl?.textContent ?? 'View notice').trim(),
          is_active: true
        });
        showStatus('Important notice saved. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to save important notice.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (isNew) {
        notice.remove();
        return;
      }

      if (titleEl) titleEl.textContent = readState.title;
      if (bodyEl) bodyEl.textContent = readState.body;
      if (linkEl) {
        linkEl.textContent = readState.linkLabel;
        linkEl.setAttribute('href', readState.href);
      }
      exitEdit();
      renderReadControls();
    });

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
  };

  const enterEdit = () => {
    setEditable(titleEl, true);
    setEditable(bodyEl, true);
    setEditable(linkEl, true);

    if (!urlEditor) {
      const { wrapper, input } = createUrlEditor('Notice URL', readState.href || '#');
      notice.appendChild(wrapper);
      urlEditor = input;
    }

    renderEditControls();
  };

  renderReadControls();

  notice.querySelectorAll('.hero-notice-title, .hero-notice-body, .hero-notice-link').forEach((part) => {
    part.addEventListener('click', (event) => {
      event.preventDefault();
      enterEdit();
    });
  });

  if (isNew) {
    enterEdit();
  }
};

let openHeroNoticeEditor: (() => void) | null = null;

const bindInlineActions = () => {
  const heroNotice = document.querySelector('.hero-notice');
  if (heroNotice) {
    wireHeroNoticeInline(heroNotice);
    openHeroNoticeEditor = () => {
      const editBtn = heroNotice.querySelector('.inline-admin-controls button');
      (editBtn as HTMLButtonElement | null)?.click();
    };
  } else {
    openHeroNoticeEditor = () => {
      const created = createHeroNoticeElement();
      if (!created) {
        showStatus('This page does not have a hero section for an Important Notice.');
        return;
      }
      wireHeroNoticeInline(created, true);
    };
  }

  const noticeItems = Array.from(document.querySelectorAll('.notice-item'));
  noticeItems.forEach(wireAnnouncementInline);

  const editableCards = Array.from(document.querySelectorAll('[data-editable-card="true"]'));
  editableCards.forEach(wireCardInline);

  const editableDownloads = Array.from(document.querySelectorAll('[data-editable-download="true"]'));
  editableDownloads.forEach(wireDownloadInline);
};

const mountToolbar = () => {
  const toolbar = document.createElement('div');
  toolbar.className = 'inline-admin-toolbar';
  toolbar.innerHTML = `
    <strong>Admin Mode</strong>
    <button type="button" id="inline-add-announcement">Add Announcement</button>
    <button type="button" id="inline-edit-hero-notice">Edit Important Notice</button>
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

  const editNoticeBtn = document.getElementById('inline-edit-hero-notice') as HTMLButtonElement | null;
  editNoticeBtn?.addEventListener('click', () => {
    openHeroNoticeEditor?.();
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
  showStatus('Admin mode active. Click content and edit directly on the page.');
};
