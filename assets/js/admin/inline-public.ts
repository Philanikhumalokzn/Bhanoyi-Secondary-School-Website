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
  saveSiteSettings,
  uploadNewsImage,
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
  category: string;
  subtitle: string;
  title: string;
  body: string;
  imageUrl: string;
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

const getSectionIndex = (section: Element): number => {
  const raw = (section as HTMLElement).dataset.sectionIndex || '';
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? -1 : parsed;
};

const sectionOverrideKey = (sectionIndex: number) => `section_override:${currentPageKey()}:${sectionIndex}`;

const saveSectionOverride = async (section: Element, payload: Record<string, unknown>) => {
  const sectionIndex = getSectionIndex(section);
  if (sectionIndex < 0) {
    throw new Error('Could not resolve section index for this page.');
  }

  await saveSiteSettings({
    [sectionOverrideKey(sectionIndex)]: JSON.stringify(payload)
  });
};

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

const createTextEditor = (label: string, value: string) => {
  const wrapper = document.createElement('label');
  wrapper.className = 'inline-url-editor';

  const span = document.createElement('span');
  span.textContent = label;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;

  wrapper.appendChild(span);
  wrapper.appendChild(input);

  return { wrapper, input };
};

const createFileEditor = () => {
  const wrapper = document.createElement('label');
  wrapper.className = 'inline-file-editor';

  const span = document.createElement('span');
  span.textContent = 'Upload news image';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Upload';

  wrapper.appendChild(span);
  wrapper.appendChild(input);
  wrapper.appendChild(button);

  return { wrapper, input, button };
};

const ollamaModel = (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) || 'llama3.2:3b';
const ollamaBaseUrl =
  (import.meta.env.VITE_OLLAMA_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:11434';
const isLocalHost = () =>
  window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
const isLoopbackOllama = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(ollamaBaseUrl);

const getTargetText = (element: Element) => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  return (element.textContent ?? '').trim();
};

const setTargetText = (element: Element, value: string) => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
    return;
  }
  element.textContent = value;
};

const findAiTarget = (root: Element): Element | null => {
  const active = document.activeElement;
  if (active instanceof Element && root.contains(active)) {
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active.getAttribute('contenteditable') === 'true'
    ) {
      return active;
    }
  }

  return root.querySelector('[contenteditable="true"], input[type="text"], input[type="url"], textarea');
};

const rewriteWithHostedAi = async (input: string) => {
  let response: Response;
  try {
    response = await fetch('/api/ai-rewrite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input })
    });
  } catch {
    throw new Error('Could not reach production AI endpoint. Check deployment and try again.');
  }

  const payload = (await response.json().catch(() => ({}))) as { response?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Production AI request failed (${response.status}).`);
  }

  const rewritten = (payload.response ?? '').trim();
  if (!rewritten) {
    throw new Error('Production AI returned an empty result. Try again.');
  }

  return rewritten;
};

const rewriteWithOllama = async (input: string) => {
  const prompt = [
    'Rewrite the text for a school website admin editor.',
    'Keep the original meaning and factual details.',
    'Improve grammar, clarity, and readability.',
    'Return only the rewritten text with no quotes or extra labels.',
    '',
    input
  ].join('\n');

  let response: Response;
  try {
    response = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: ollamaModel,
        prompt,
        stream: false,
        options: {
          temperature: 0.3
        }
      })
    });
  } catch {
    throw new Error('Could not reach local Ollama. Ensure Ollama is running on port 11434.');
  }

  if (!response.ok) {
    if (response.status === 403 || response.status === 405) {
      throw new Error('Ollama request was rejected. Check OLLAMA_ORIGINS and restart Ollama.');
    }
    throw new Error(`Ollama request failed (${response.status}). Ensure Ollama is running and CORS is configured.`);
  }

  const payload = (await response.json()) as { response?: string };
  const rewritten = (payload.response ?? '').trim();
  if (!rewritten) {
    throw new Error('Ollama returned an empty result. Try again.');
  }

  return rewritten;
};

const attachAiButton = (controls: HTMLElement, root: Element) => {
  const aiBtn = document.createElement('button');
  aiBtn.type = 'button';
  aiBtn.textContent = 'AI Update';
  aiBtn.addEventListener('click', async () => {
    const target = findAiTarget(root);
    if (!target) {
      showStatus('Click into a field first, then use AI Update.');
      return;
    }

    const sourceText = getTargetText(target).trim();
    if (!sourceText) {
      showStatus('Add text in the field first, then use AI Update.');
      return;
    }

    try {
      aiBtn.disabled = true;
      aiBtn.textContent = 'AI Working...';
      const shouldUseHostedAi = !isLocalHost() && isLoopbackOllama;
      showStatus(shouldUseHostedAi ? 'Using production AI...' : `Using local Ollama (${ollamaModel})...`);
      const rewritten = shouldUseHostedAi
        ? await rewriteWithHostedAi(sourceText)
        : await rewriteWithOllama(sourceText);
      setTargetText(target, rewritten);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      showStatus('AI update applied. Review and save.');
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'AI update failed.');
    } finally {
      aiBtn.disabled = false;
      aiBtn.textContent = 'AI Update';
    }
  });

  controls.appendChild(aiBtn);
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
  const href = (item as HTMLAnchorElement).getAttribute?.('href') ?? '';
  const sectionKey = (item as HTMLElement).dataset.sectionKey || '';
  const isLatestNews = sectionKey === 'latest_news';
  const title = (
    isLatestNews ? item.querySelector('.latest-news-title')?.textContent : item.querySelector('h3')?.textContent
  )?.trim() || '';
  const body = (
    isLatestNews
      ? item.querySelector('.latest-news-body')?.textContent || item.querySelector('.latest-news-fallback-body')?.textContent
      : item.querySelector('p')?.textContent
  )?.trim() || '';
  const category = ((item as HTMLElement).dataset.cardCategory || getText(item, '.news-category') || 'General').trim();
  const subtitle = ((item as HTMLElement).dataset.cardSubtitle || getText(item, '.latest-news-subtitle') || '').trim();
  const imageUrl = ((item as HTMLElement).dataset.cardImageUrl ||
    (item.querySelector('.latest-news-image') as HTMLImageElement | null)?.getAttribute('src') ||
    (item.querySelector('.card-image') as HTMLImageElement | null)?.getAttribute('src') ||
    '')
    .trim();

  return {
    id: (item as HTMLElement).dataset.cardId || undefined,
    sectionKey,
    sortOrder: Number((item as HTMLElement).dataset.sortOrder || '0'),
    clickable: (item as HTMLElement).dataset.cardClickable === 'true',
    category,
    subtitle,
    title,
    body,
    imageUrl,
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

const getLatestNewsCategories = () => {
  const fromLanes = Array.from(document.querySelectorAll('.latest-news-lane-head h3'))
    .map((el) => (el.textContent ?? '').trim())
    .filter(Boolean);

  const defaults = ['Academics', 'Parents', 'Sports', 'Extra-curricular'];
  return Array.from(new Set([...defaults, ...fromLanes]));
};

const openLatestNewsComposer = () => {
  const existingOverlay = document.querySelector('.news-overlay');
  if (existingOverlay) return;

  const categories = getLatestNewsCategories();
  const overlay = document.createElement('div');
  overlay.className = 'news-overlay';
  overlay.innerHTML = `
    <div class="news-overlay-panel" role="dialog" aria-modal="true" aria-label="Post new article">
      <h3>Post new article</h3>
      <form class="news-overlay-form" id="news-overlay-form">
        <label>
          Title
          <input type="text" name="title" required />
        </label>
        <label>
          Subtitle
          <input type="text" name="subtitle" />
        </label>
        <label>
          Preview / Body
          <textarea name="body" rows="4" required></textarea>
        </label>
        <label>
          Category
          <select name="category" id="news-category-select">
            ${categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}
            <option value="__new__">Add new category</option>
          </select>
        </label>
        <label id="news-new-category-wrap" style="display:none;">
          New category name
          <input type="text" name="newCategory" />
        </label>
        <label>
          Article link (optional)
          <input type="url" name="href" value="#" />
        </label>
        <label>
          Image URL (optional)
          <input type="url" name="imageUrl" />
        </label>
        <label>
          Upload image (optional)
          <input type="file" name="imageFile" accept="image/*" />
        </label>
        <div class="news-overlay-actions">
          <button type="button" id="news-overlay-cancel">Cancel</button>
          <button type="submit" id="news-overlay-save">Post article</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const form = overlay.querySelector('#news-overlay-form') as HTMLFormElement | null;
  const categorySelect = overlay.querySelector('#news-category-select') as HTMLSelectElement | null;
  const newCategoryWrap = overlay.querySelector('#news-new-category-wrap') as HTMLElement | null;
  const cancelBtn = overlay.querySelector('#news-overlay-cancel') as HTMLButtonElement | null;
  const saveBtn = overlay.querySelector('#news-overlay-save') as HTMLButtonElement | null;

  categorySelect?.addEventListener('change', () => {
    if (!newCategoryWrap) return;
    newCategoryWrap.style.display = categorySelect.value === '__new__' ? 'grid' : 'none';
  });

  cancelBtn?.addEventListener('click', () => {
    overlay.remove();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form || !saveBtn) return;

    const formData = new FormData(form);
    const title = String(formData.get('title') || '').trim();
    const subtitle = String(formData.get('subtitle') || '').trim();
    const body = String(formData.get('body') || '').trim();
    const href = String(formData.get('href') || '#').trim() || '#';
    const imageUrlInput = String(formData.get('imageUrl') || '').trim();
    const selectedCategory = String(formData.get('category') || '').trim();
    const newCategory = String(formData.get('newCategory') || '').trim();
    const imageFile = formData.get('imageFile') as File | null;

    const category = selectedCategory === '__new__' ? newCategory : selectedCategory;
    if (!title || !body || !category) {
      showStatus('Title, body, and category are required.');
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Posting...';

      let imageUrl = imageUrlInput;
      if (imageFile && imageFile.size > 0) {
        imageUrl = await uploadNewsImage(imageFile);
      }

      const currentOrders = Array.from(document.querySelectorAll('.latest-news-slide'))
        .map((el) => Number((el as HTMLElement).dataset.sortOrder || '0'))
        .filter((value) => !Number.isNaN(value));
      const nextSortOrder = (currentOrders.length ? Math.max(...currentOrders) : 0) + 1;

      await saveCard({
        page_key: currentPageKey(),
        section_key: 'latest_news',
        category,
        subtitle,
        title,
        body,
        image_url: imageUrl,
        href,
        sort_order: nextSortOrder
      });

      showStatus('Latest news article posted. Refreshing...');
      overlay.remove();
      window.location.reload();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to post article.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Post article';
    }
  });
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
    attachAiButton(controls, item);

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
  const isLatestNews = record.sectionKey === 'latest_news';
  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  if (isLatestNews) {
    controls.classList.add('latest-news-inline-controls');
  }
  controls.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  item.appendChild(controls);

  const newsTitleEl = item.querySelector('.latest-news-title') as HTMLElement | null;
  const titleEl = isLatestNews ? newsTitleEl || item.querySelector('.latest-news-fallback-title') : item.querySelector('h3');
  const bodyEl = isLatestNews ? item.querySelector('.latest-news-body') || item.querySelector('.latest-news-fallback-body') : item.querySelector('p');
  const categoryEl = item.querySelector('.news-category');
  const subtitleEl = item.querySelector('.latest-news-subtitle');
  const visibleBodyEl = item.querySelector('.latest-news-body') as HTMLElement | null;
  const cardImageEl = item.querySelector('.card-image') as HTMLImageElement | null;
  const imageEl = item.querySelector('.latest-news-image') as HTMLImageElement | null;
  const fallbackEl = item.querySelector('.latest-news-image-fallback') as HTMLElement | null;
  const fallbackTitleEl = item.querySelector('.latest-news-fallback-title') as HTMLElement | null;
  const fallbackBodyEl = item.querySelector('.latest-news-fallback-body') as HTMLElement | null;
  const latestNewsTrack = item.closest('[data-news-track]') as HTMLElement | null;

  let urlEditor: HTMLInputElement | null = null;
  let categoryEditor: HTMLInputElement | null = null;
  let imageUrlEditor: HTMLInputElement | null = null;
  let imageFileInput: HTMLInputElement | null = null;
  let imageUploadButton: HTMLButtonElement | null = null;

  const readState = { ...record };

  const syncLatestNewsMedia = (imageUrl: string, title: string, subtitle: string, body: string) => {
    if (!isLatestNews) return;
    const hasImage = Boolean((imageUrl || '').trim());

    if (imageEl) {
      imageEl.classList.toggle('is-hidden', !hasImage);
      imageEl.src = hasImage ? imageUrl : '';
    }

    if (fallbackEl) {
      fallbackEl.classList.toggle('is-hidden', hasImage);
    }

    if (visibleBodyEl) {
      visibleBodyEl.classList.toggle('is-hidden', !hasImage);
    }

    if (fallbackTitleEl) fallbackTitleEl.textContent = subtitle.trim() || title;
    if (fallbackBodyEl) fallbackBodyEl.textContent = body;
    if (newsTitleEl) newsTitleEl.textContent = title;
    if (visibleBodyEl) visibleBodyEl.textContent = body;
  };

  const syncStandardCardMedia = (imageUrl: string, title: string) => {
    if (isLatestNews) return;
    if (!cardImageEl) return;
    const hasImage = Boolean((imageUrl || '').trim());
    cardImageEl.classList.toggle('is-hidden', !hasImage);
    cardImageEl.src = hasImage ? imageUrl : '';
    cardImageEl.alt = title;
  };

  const getLatestNewsTitleText = () => {
    if (!isLatestNews) return (titleEl?.textContent ?? '').trim();
    const isFallbackVisible = Boolean(fallbackEl && !fallbackEl.classList.contains('is-hidden'));
    const source = isFallbackVisible ? fallbackTitleEl?.textContent : newsTitleEl?.textContent;
    return (source ?? newsTitleEl?.textContent ?? fallbackTitleEl?.textContent ?? '').trim();
  };

  const getLatestNewsBodyText = () => {
    if (!isLatestNews) return (bodyEl?.textContent ?? '').trim();
    const isFallbackVisible = Boolean(fallbackEl && !fallbackEl.classList.contains('is-hidden'));
    const source = isFallbackVisible ? fallbackBodyEl?.textContent : visibleBodyEl?.textContent;
    return (source ?? visibleBodyEl?.textContent ?? fallbackBodyEl?.textContent ?? '').trim();
  };

  const setLatestNewsEditingState = (editing: boolean) => {
    if (!isLatestNews || !latestNewsTrack) return;
    latestNewsTrack.dataset.adminPaused = editing ? 'true' : 'false';
    if (!editing) return;

    const slides = Array.from(latestNewsTrack.querySelectorAll('.latest-news-slide'));
    slides.forEach((slide) => {
      slide.classList.toggle('is-active', slide === item);
    });
  };

  const exitEdit = () => {
    setEditable(titleEl, false);
    if (isLatestNews) {
      setEditable(newsTitleEl, false);
      setEditable(fallbackTitleEl, false);
      setEditable(visibleBodyEl, false);
      setEditable(fallbackBodyEl, false);
    }
    setEditable(subtitleEl, false);
    setEditable(bodyEl, false);
    setLatestNewsEditingState(false);
    if (categoryEditor) {
      categoryEditor.parentElement?.remove();
      categoryEditor = null;
    }
    if (imageUrlEditor) {
      imageUrlEditor.parentElement?.remove();
      imageUrlEditor = null;
    }
    if (imageFileInput?.parentElement) {
      imageFileInput.parentElement.remove();
      imageFileInput = null;
      imageUploadButton = null;
    }
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
    attachAiButton(controls, item);

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
          category: isLatestNews ? (categoryEditor?.value ?? readState.category).trim() : '',
          subtitle: isLatestNews ? (subtitleEl?.textContent ?? readState.subtitle).trim() : '',
          title: isLatestNews ? getLatestNewsTitleText() : (titleEl?.textContent ?? '').trim(),
          body: isLatestNews ? getLatestNewsBodyText() : (bodyEl?.textContent ?? '').trim(),
          image_url: (imageUrlEditor?.value ?? readState.imageUrl).trim(),
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
      if (newsTitleEl) newsTitleEl.textContent = readState.title;
      if (subtitleEl) subtitleEl.textContent = readState.subtitle;
      if (bodyEl) bodyEl.textContent = readState.body;
      if (categoryEl) categoryEl.textContent = readState.category;
      syncLatestNewsMedia(readState.imageUrl, readState.title, readState.subtitle, readState.body);
      syncStandardCardMedia(readState.imageUrl, readState.title);
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
    setLatestNewsEditingState(true);
    setEditable(titleEl, true);
    if (isLatestNews) {
      setEditable(newsTitleEl, true);
      setEditable(fallbackTitleEl, true);
      setEditable(visibleBodyEl, true);
      setEditable(fallbackBodyEl, true);
    }
    setEditable(subtitleEl, true);
    setEditable(bodyEl, true);

    if (record.clickable && !urlEditor) {
      const { wrapper, input } = createUrlEditor(isLatestNews ? 'News link URL' : 'Link URL', readState.href || '#');
      item.appendChild(wrapper);
      urlEditor = input;
    }

    if (isLatestNews && !categoryEditor) {
      const { wrapper, input } = createTextEditor('Category', readState.category || 'General');
      item.appendChild(wrapper);
      categoryEditor = input;
    }

    if (!imageUrlEditor) {
      const { wrapper, input } = createUrlEditor('Image URL', readState.imageUrl || '');
      item.appendChild(wrapper);
      imageUrlEditor = input;

      imageUrlEditor.addEventListener('input', () => {
        const liveTitle = isLatestNews ? getLatestNewsTitleText() || readState.title : (titleEl?.textContent ?? readState.title).trim();
        const liveBody = isLatestNews ? getLatestNewsBodyText() || readState.body : (bodyEl?.textContent ?? readState.body).trim();
        syncLatestNewsMedia(
          imageUrlEditor?.value || '',
          liveTitle,
          (subtitleEl?.textContent ?? readState.subtitle).trim(),
          liveBody
        );
        syncStandardCardMedia(imageUrlEditor?.value || '', liveTitle);
      });
    }

    if (!imageFileInput) {
      const { wrapper, input, button } = createFileEditor();
      item.appendChild(wrapper);
      imageFileInput = input;
      imageUploadButton = button;

      imageUploadButton.addEventListener('click', async (eventUpload) => {
        eventUpload.preventDefault();
        const uploadBtn = imageUploadButton;
        if (!uploadBtn) return;
        const file = imageFileInput?.files?.[0];
        if (!file) {
          showStatus('Choose an image file first.');
          return;
        }

        try {
          uploadBtn.disabled = true;
          uploadBtn.textContent = 'Uploading...';
          const url = await uploadNewsImage(file);
          if (imageUrlEditor) imageUrlEditor.value = url;
          const liveTitle = isLatestNews ? getLatestNewsTitleText() || readState.title : (titleEl?.textContent ?? readState.title).trim();
          const liveBody = isLatestNews ? getLatestNewsBodyText() || readState.body : (bodyEl?.textContent ?? readState.body).trim();
          syncLatestNewsMedia(
            url,
            liveTitle,
            (subtitleEl?.textContent ?? readState.subtitle).trim(),
            liveBody
          );
          syncStandardCardMedia(url, liveTitle);
          showStatus('Image uploaded. Save the card to publish changes.');
        } catch (error) {
          showStatus(
            error instanceof Error
              ? `${error.message}. Ensure a public storage bucket named news-images exists.`
              : 'Image upload failed.'
          );
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.textContent = 'Upload';
        }
      });
    }

    renderEditControls();
  };

  renderReadControls();

  syncLatestNewsMedia(readState.imageUrl, readState.title, readState.subtitle, readState.body);
  syncStandardCardMedia(readState.imageUrl, readState.title);

  item.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('.inline-admin-controls')) return;
    if ((event.target as HTMLElement).closest('.inline-url-editor')) return;
    if ((event.target as HTMLElement).closest('.inline-file-editor')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  const editTriggers = isLatestNews
    ? [newsTitleEl, subtitleEl, visibleBodyEl, fallbackTitleEl, fallbackBodyEl]
    : [bodyEl, titleEl];

  editTriggers.forEach((trigger) => {
    trigger?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      enterEdit(event);
    });
  });
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
    attachAiButton(controls, item);

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
    attachAiButton(controls, notice);

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

const wireSplitSectionInline = (section: Element) => {
  const container = section.querySelector('.container');
  const leftCol = section.querySelector('.section-grid > div');
  const panel = section.querySelector('.section-grid > aside.panel');
  if (!container || !leftCol || !panel) return;

  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  container.appendChild(controls);

  const titleEl = leftCol.querySelector('h2');
  const bodyEl = leftCol.querySelector('p');
  const listEl = leftCol.querySelector('.list');
  const panelTitleEl = panel.querySelector('h3');
  const panelBodyEl = panel.querySelector('p');
  const panelLinkEl = panel.querySelector('a') as HTMLAnchorElement | null;
  const panelImageEl = panel.querySelector('.split-panel-image') as HTMLImageElement | null;

  let linkUrlEditor: HTMLInputElement | null = null;
  let panelImageUrlEditor: HTMLInputElement | null = null;
  let panelImageFileInput: HTMLInputElement | null = null;
  let panelImageUploadButton: HTMLButtonElement | null = null;
  let addListItemBtn: HTMLButtonElement | null = null;

  const readState = {
    title: (titleEl?.textContent ?? '').trim(),
    body: (bodyEl?.textContent ?? '').trim(),
    list: listEl ? Array.from(listEl.querySelectorAll('li')).map((li) => (li.textContent ?? '').trim()) : [],
    panelTitle: (panelTitleEl?.textContent ?? '').trim(),
    panelBody: (panelBodyEl?.textContent ?? '').trim(),
    panelLinkLabel: (panelLinkEl?.textContent ?? '').trim(),
    panelLinkHref: panelLinkEl?.getAttribute('href') ?? '',
    panelImageUrl: (panelImageEl?.getAttribute('src') ?? '').trim()
  };

  const syncSplitPanelImage = (imageUrl: string, title: string) => {
    if (!panelImageEl) return;
    const hasImage = Boolean((imageUrl || '').trim());
    panelImageEl.classList.toggle('is-hidden', !hasImage);
    panelImageEl.src = hasImage ? imageUrl : '';
    panelImageEl.alt = title;
  };

  const removeListDeleteButtons = () => {
    listEl?.querySelectorAll('.inline-item-remove').forEach((btn) => btn.remove());
  };

  const addListDeleteButtons = () => {
    if (!listEl) return;
    listEl.querySelectorAll('li').forEach((li) => {
      if (li.querySelector('.inline-item-remove')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inline-item-remove';
      btn.textContent = 'Remove';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        li.remove();
      });
      li.appendChild(btn);
    });
  };

  const renderReadControls = () => {
    controls.innerHTML = '';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', enterEdit);
    controls.appendChild(editBtn);
  };

  const exitEdit = () => {
    setEditable(titleEl, false);
    setEditable(bodyEl, false);
    setEditable(panelTitleEl, false);
    setEditable(panelBodyEl, false);
    setEditable(panelLinkEl, false);
    listEl?.querySelectorAll('li').forEach((li) => setEditable(li, false));
    removeListDeleteButtons();

    if (linkUrlEditor) {
      linkUrlEditor.parentElement?.remove();
      linkUrlEditor = null;
    }
    if (panelImageUrlEditor) {
      panelImageUrlEditor.parentElement?.remove();
      panelImageUrlEditor = null;
    }
    if (panelImageFileInput?.parentElement) {
      panelImageFileInput.parentElement.remove();
      panelImageFileInput = null;
      panelImageUploadButton = null;
    }
    if (addListItemBtn) {
      addListItemBtn.remove();
      addListItemBtn = null;
    }
  };

  const renderEditControls = () => {
    controls.innerHTML = '';
    attachAiButton(controls, section);

    if (listEl) {
      addListItemBtn = document.createElement('button');
      addListItemBtn.type = 'button';
      addListItemBtn.textContent = 'Add List Item';
      addListItemBtn.addEventListener('click', () => {
        const li = document.createElement('li');
        li.textContent = 'New item';
        listEl.appendChild(li);
        setEditable(li, true);
        addListDeleteButtons();
      });
      controls.appendChild(addListItemBtn);
    }

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        const payload: Record<string, unknown> = {
          type: 'split',
          title: (titleEl?.textContent ?? '').trim(),
          body: (bodyEl?.textContent ?? '').trim(),
          panel: {
            title: (panelTitleEl?.textContent ?? '').trim(),
            body: (panelBodyEl?.textContent ?? '').trim(),
            imageUrl: (panelImageUrlEditor?.value ?? readState.panelImageUrl).trim()
          }
        };

        if (listEl) {
          payload.list = Array.from(listEl.querySelectorAll('li'))
            .map((li) => {
              const copy = li.cloneNode(true) as HTMLElement;
              copy.querySelectorAll('.inline-item-remove').forEach((btn) => btn.remove());
              return (copy.textContent ?? '').trim();
            })
            .filter(Boolean);
        }

        if (panelLinkEl || linkUrlEditor) {
          const href = (linkUrlEditor?.value ?? panelLinkEl?.getAttribute('href') ?? '#').trim() || '#';
          const label = (panelLinkEl?.textContent ?? readState.panelLinkLabel).trim();
          payload.panel = {
            ...(payload.panel as Record<string, unknown>),
            link: { href, label }
          };
        }

        await saveSectionOverride(section, payload);
        showStatus('Section saved. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to save section.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (titleEl) titleEl.textContent = readState.title;
      if (bodyEl) bodyEl.textContent = readState.body;
      if (panelTitleEl) panelTitleEl.textContent = readState.panelTitle;
      if (panelBodyEl) panelBodyEl.textContent = readState.panelBody;
      if (panelLinkEl) {
        panelLinkEl.textContent = readState.panelLinkLabel;
        panelLinkEl.setAttribute('href', readState.panelLinkHref || '#');
      }
      syncSplitPanelImage(readState.panelImageUrl, readState.panelTitle);
      if (listEl) {
        listEl.innerHTML = readState.list.map((entry) => `<li>${entry}</li>`).join('');
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
    setEditable(panelTitleEl, true);
    setEditable(panelBodyEl, true);
    setEditable(panelLinkEl, true);
    listEl?.querySelectorAll('li').forEach((li) => setEditable(li, true));
    addListDeleteButtons();

    if (panelLinkEl && !linkUrlEditor) {
      const { wrapper, input } = createUrlEditor('Panel Link URL', panelLinkEl.getAttribute('href') || '#');
      panel.appendChild(wrapper);
      linkUrlEditor = input;
    }

    if (!panelImageUrlEditor) {
      const { wrapper, input } = createUrlEditor('Panel Image URL', readState.panelImageUrl || '');
      panel.appendChild(wrapper);
      panelImageUrlEditor = input;
      panelImageUrlEditor.addEventListener('input', () => {
        syncSplitPanelImage(panelImageUrlEditor?.value || '', (panelTitleEl?.textContent ?? readState.panelTitle).trim());
      });
    }

    if (!panelImageFileInput) {
      const { wrapper, input, button } = createFileEditor();
      panel.appendChild(wrapper);
      panelImageFileInput = input;
      panelImageUploadButton = button;

      panelImageUploadButton.addEventListener('click', async (eventUpload) => {
        eventUpload.preventDefault();
        const uploadBtn = panelImageUploadButton;
        if (!uploadBtn) return;
        const file = panelImageFileInput?.files?.[0];
        if (!file) {
          showStatus('Choose an image file first.');
          return;
        }

        try {
          uploadBtn.disabled = true;
          uploadBtn.textContent = 'Uploading...';
          const url = await uploadNewsImage(file);
          if (panelImageUrlEditor) panelImageUrlEditor.value = url;
          syncSplitPanelImage(url, (panelTitleEl?.textContent ?? readState.panelTitle).trim());
          showStatus('Image uploaded. Save the section to publish changes.');
        } catch (error) {
          showStatus(
            error instanceof Error
              ? `${error.message}. Ensure a public storage bucket named news-images exists.`
              : 'Image upload failed.'
          );
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.textContent = 'Upload';
        }
      });
    }

    renderEditControls();
  };

  renderReadControls();
  syncSplitPanelImage(readState.panelImageUrl, readState.panelTitle);
};

const wireContactCardsInline = (section: Element) => {
  const container = section.querySelector('.container');
  const titleEl = section.querySelector('h2');
  const grid = section.querySelector('.contact-grid');
  if (!container || !titleEl || !grid) return;

  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  container.appendChild(controls);

  const readState = {
    title: (titleEl.textContent ?? '').trim(),
    items: Array.from(grid.querySelectorAll('.panel')).map((panel) => ({
      title: (panel.querySelector('h3')?.textContent ?? '').trim(),
      body: (panel.querySelector('p')?.textContent ?? '').trim()
    }))
  };

  let addCardBtn: HTMLButtonElement | null = null;

  const removeCardDeleteButtons = () => {
    grid.querySelectorAll('.inline-item-remove').forEach((btn) => btn.remove());
  };

  const addCardDeleteButtons = () => {
    grid.querySelectorAll('.panel').forEach((panel) => {
      if (panel.querySelector('.inline-item-remove')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inline-item-remove';
      btn.textContent = 'Remove';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        panel.remove();
      });
      panel.appendChild(btn);
    });
  };

  const setCardsEditable = (enabled: boolean) => {
    setEditable(titleEl, enabled);
    grid.querySelectorAll('.panel').forEach((panel) => {
      setEditable(panel.querySelector('h3'), enabled);
      setEditable(panel.querySelector('p'), enabled);
    });
  };

  const renderReadControls = () => {
    controls.innerHTML = '';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', enterEdit);
    controls.appendChild(editBtn);
  };

  const exitEdit = () => {
    setCardsEditable(false);
    removeCardDeleteButtons();
    if (addCardBtn) {
      addCardBtn.remove();
      addCardBtn = null;
    }
  };

  const renderEditControls = () => {
    controls.innerHTML = '';
    attachAiButton(controls, section);

    addCardBtn = document.createElement('button');
    addCardBtn.type = 'button';
    addCardBtn.textContent = 'Add Card';
    addCardBtn.addEventListener('click', () => {
      const card = document.createElement('article');
      card.className = 'panel';
      card.innerHTML = '<h3>New Contact Title</h3><p>New contact detail</p>';
      grid.appendChild(card);
      setEditable(card.querySelector('h3'), true);
      setEditable(card.querySelector('p'), true);
      addCardDeleteButtons();
    });
    controls.appendChild(addCardBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        const items = Array.from(grid.querySelectorAll('.panel'))
          .map((panel) => ({
            title: (panel.querySelector('h3')?.textContent ?? '').trim(),
            body: (panel.querySelector('p')?.textContent ?? '').trim()
          }))
          .filter((entry) => entry.title || entry.body);

        await saveSectionOverride(section, {
          type: 'contact-cards',
          title: (titleEl.textContent ?? '').trim(),
          items
        });
        showStatus('Section saved. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to save section.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      titleEl.textContent = readState.title;
      grid.innerHTML = readState.items
        .map((item) => `<article class="panel"><h3>${item.title}</h3><p>${item.body}</p></article>`)
        .join('');
      exitEdit();
      renderReadControls();
    });

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
  };

  const enterEdit = () => {
    setCardsEditable(true);
    addCardDeleteButtons();
    renderEditControls();
  };

  renderReadControls();
};

const wireFooterInline = () => {
  const footer = document.querySelector('.site-footer');
  if (!footer) return;

  const footerGrid = footer.querySelector('.footer-grid > div:first-child');
  if (!footerGrid) return;

  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  footerGrid.appendChild(controls);

  const nameEl = footer.querySelector('.footer-school-name');
  const taglineEl = footer.querySelector('.footer-tagline');
  const phoneEl = footer.querySelector('.footer-phone');
  const emailEl = footer.querySelector('.footer-email');
  const addressEl = footer.querySelector('.footer-address');
  const hours1El = footer.querySelector('.footer-hours-1');
  const hours2El = footer.querySelector('.footer-hours-2');

  const readState = {
    school_name: (nameEl?.textContent ?? '').trim(),
    school_tagline: (taglineEl?.textContent ?? '').trim(),
    school_phone: (phoneEl?.textContent ?? '').trim(),
    school_email: (emailEl?.textContent ?? '').trim(),
    school_address: (addressEl?.textContent ?? '').trim(),
    school_hours_1: (hours1El?.textContent ?? '').trim(),
    school_hours_2: (hours2El?.textContent ?? '').trim()
  };

  const exitEdit = () => {
    setEditable(nameEl, false);
    setEditable(taglineEl, false);
    setEditable(phoneEl, false);
    setEditable(emailEl, false);
    setEditable(addressEl, false);
    setEditable(hours1El, false);
    setEditable(hours2El, false);
  };

  const renderReadControls = () => {
    controls.innerHTML = '';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', enterEdit);

    controls.appendChild(editBtn);
  };

  const renderEditControls = () => {
    controls.innerHTML = '';
    attachAiButton(controls, footer);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        await saveSiteSettings({
          school_name: (nameEl?.textContent ?? '').trim(),
          school_tagline: (taglineEl?.textContent ?? '').trim(),
          school_phone: (phoneEl?.textContent ?? '').trim(),
          school_email: (emailEl?.textContent ?? '').trim(),
          school_address: (addressEl?.textContent ?? '').trim(),
          school_hours_1: (hours1El?.textContent ?? '').trim(),
          school_hours_2: (hours2El?.textContent ?? '').trim()
        });
        showStatus('Footer updated. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to update footer.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (nameEl) nameEl.textContent = readState.school_name;
      if (taglineEl) taglineEl.textContent = readState.school_tagline;
      if (phoneEl) phoneEl.textContent = readState.school_phone;
      if (emailEl) emailEl.textContent = readState.school_email;
      if (addressEl) addressEl.textContent = readState.school_address;
      if (hours1El) hours1El.textContent = readState.school_hours_1;
      if (hours2El) hours2El.textContent = readState.school_hours_2;
      exitEdit();
      renderReadControls();
    });

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
  };

  const enterEdit = () => {
    setEditable(nameEl, true);
    setEditable(taglineEl, true);
    setEditable(phoneEl, true);
    setEditable(emailEl, true);
    setEditable(addressEl, true);
    setEditable(hours1El, true);
    setEditable(hours2El, true);
    renderEditControls();
  };

  renderReadControls();
};

const bindInlineActions = () => {
  const heroNotice = document.querySelector('.hero-notice');
  if (heroNotice) {
    wireHeroNoticeInline(heroNotice);
  }

  const noticeItems = Array.from(document.querySelectorAll('.notice-item'));
  noticeItems.forEach(wireAnnouncementInline);

  const editableCards = Array.from(document.querySelectorAll('[data-editable-card="true"]'));
  editableCards.forEach(wireCardInline);

  const editableDownloads = Array.from(document.querySelectorAll('[data-editable-download="true"]'));
  editableDownloads.forEach(wireDownloadInline);

  const editableSplitSections = Array.from(document.querySelectorAll('[data-editable-section="true"][data-section-type="split"]'));
  editableSplitSections.forEach(wireSplitSectionInline);

  const editableContactSections = Array.from(
    document.querySelectorAll('[data-editable-section="true"][data-section-type="contact-cards"]')
  );
  editableContactSections.forEach(wireContactCardsInline);

  wireFooterInline();

  const postNewsButton = document.querySelector('[data-post-news]') as HTMLButtonElement | null;
  postNewsButton?.addEventListener('click', () => {
    openLatestNewsComposer();
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
  bindInlineActions();
  showStatus('Admin mode active. Use inline Edit/Save controls in each section.');
};
