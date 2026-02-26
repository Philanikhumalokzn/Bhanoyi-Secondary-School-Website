import {
  deleteAnnouncement,
  deleteCard,
  deleteDownload,
  deleteHeroNotice,
  getSiteSetting,
  getSession,
  saveAnnouncement,
  saveCard,
  saveDownload,
  saveHeroNotice,
  saveSiteSettings,
  uploadSectionFile,
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
  imageUrls: string[];
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const deepMerge = (base: Record<string, unknown>, updates: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };

  Object.entries(updates).forEach(([key, value]) => {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      result[key] = deepMerge(baseValue, value);
      return;
    }
    result[key] = value;
  });

  return result;
};

const saveSectionOverride = async (section: Element, payload: Record<string, unknown>) => {
  const sectionIndex = getSectionIndex(section);
  if (sectionIndex < 0) {
    throw new Error('Could not resolve section index for this page.');
  }

  const key = sectionOverrideKey(sectionIndex);
  const existingRaw = await getSiteSetting(key);
  let existingValue: Record<string, unknown> = {};

  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (isPlainObject(parsed)) {
        existingValue = parsed;
      }
    } catch {
      existingValue = {};
    }
  }

  const merged = deepMerge(existingValue, payload);

  await saveSiteSettings({
    [key]: JSON.stringify(merged)
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

const createFileEditor = (label = 'Upload image') => {
  const wrapper = document.createElement('label');
  wrapper.className = 'inline-file-editor';

  const span = document.createElement('span');
  span.textContent = label;

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

type SectionAttachment = {
  id: string;
  url: string;
  title: string;
  fileName: string;
  kind: 'image' | 'document';
};

const asAttachmentKind = (file: File): 'image' | 'document' => (file.type.startsWith('image/') ? 'image' : 'document');

const fileNameFromUrl = (url: string) => {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const parts = pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'file';
  } catch {
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'file';
  }
};

const createSectionAssetsEditor = (section: Element) => {
  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls section-assets-inline-controls';

  const existingCards = Array.from(section.querySelectorAll('.section-asset-item'));
  const readState: SectionAttachment[] = existingCards.map((item) => {
    const html = item as HTMLElement;
    const url = (html.dataset.assetUrl || (item.getAttribute('href') ?? '')).trim();
    const title = (html.dataset.assetTitle || item.querySelector('.section-asset-title')?.textContent || '').trim();
    const fileName = (html.dataset.assetFilename || item.querySelector('.section-asset-name')?.textContent || fileNameFromUrl(url)).trim();
    const kind = ((html.dataset.assetKind || '').trim() === 'image' ? 'image' : 'document') as 'image' | 'document';
    return {
      id: html.dataset.assetId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url,
      title,
      fileName,
      kind
    };
  });

  let workingAssets: SectionAttachment[] = readState.map((entry) => ({ ...entry }));
  let assetsList: HTMLElement | null = null;
  let fileInput: HTMLInputElement | null = null;
  let uploadBtn: HTMLButtonElement | null = null;

  const buildAssetsMarkup = (assets: SectionAttachment[]) =>
    assets
      .map((asset) =>
        `<a class="section-asset-item" href="${asset.url}" target="_blank" rel="noopener" data-asset-id="${asset.id}" data-asset-url="${asset.url}" data-asset-title="${asset.title}" data-asset-filename="${asset.fileName}" data-asset-kind="${asset.kind}">
          ${asset.kind === 'image' ? `<img class="section-asset-thumb" src="${asset.url}" alt="${asset.title || asset.fileName}" loading="lazy" />` : ''}
          <span class="section-asset-title">${asset.title || (asset.kind === 'image' ? 'Image' : 'Document')}</span>
          <span class="section-asset-name">${asset.fileName}</span>
        </a>`
      )
      .join('');

  const syncSectionAssetsView = (assets: SectionAttachment[]) => {
    const wrapper = section.querySelector('.section-assets');
    const list = section.querySelector('.section-assets-grid');
    if (!list || !wrapper) return;

    list.innerHTML = buildAssetsMarkup(assets);
    wrapper.classList.toggle('is-hidden', assets.length === 0);
  };

  const renderReadControls = () => {
    controls.innerHTML = '';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit Files';
    editBtn.addEventListener('click', enterEdit);
    controls.appendChild(editBtn);
  };

  const renderAssetRows = () => {
    if (!assetsList) return;
    assetsList.innerHTML = '';

    if (workingAssets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'section-assets-empty';
      empty.textContent = 'No files uploaded for this section yet.';
      assetsList.appendChild(empty);
      return;
    }

    workingAssets.forEach((asset) => {
      const row = document.createElement('div');
      row.className = 'section-asset-edit-row';
      row.innerHTML = `
        <span>${asset.kind === 'image' ? 'Image' : 'Document'}: ${asset.fileName}</span>
      `;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'inline-item-remove';
      removeBtn.textContent = 'Delete';
      removeBtn.addEventListener('click', () => {
        workingAssets = workingAssets.filter((entry) => entry.id !== asset.id);
        renderAssetRows();
      });

      row.appendChild(removeBtn);
      assetsList?.appendChild(row);
    });
  };

  const renderEditControls = () => {
    controls.innerHTML = '';

    const uploadWrap = document.createElement('label');
    uploadWrap.className = 'inline-file-editor';
    uploadWrap.innerHTML = `
      <span>Upload files</span>
    `;

    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
    fileInput.multiple = true;

    uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.textContent = 'Upload';
    uploadBtn.addEventListener('click', async () => {
      const selected = Array.from(fileInput?.files || []);
      if (!selected.length) {
        showStatus('Choose one or more files first.');
        return;
      }

      const button = uploadBtn;
      if (!button) return;

      try {
        button.disabled = true;
        button.textContent = 'Uploading...';

        for (const rawFile of selected) {
          let fileToUpload: File | null = rawFile;
          if (rawFile.type.startsWith('image/')) {
            fileToUpload = await prepareUploadImage(rawFile, { title: 'Adjust image before upload' });
            if (!fileToUpload) {
              continue;
            }
          }

          const url = await uploadSectionFile(fileToUpload);
          const kind = asAttachmentKind(rawFile);
          workingAssets.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            url,
            title: kind === 'image' ? 'Image' : 'Document',
            fileName: fileToUpload.name,
            kind
          });
        }

        renderAssetRows();
        showStatus('Files uploaded. Save section to publish changes.');
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'File upload failed.');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = 'Upload';
        }
      }
    });

    uploadWrap.appendChild(fileInput);
    uploadWrap.appendChild(uploadBtn);

    assetsList = document.createElement('div');
    assetsList.className = 'section-assets-edit-list';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save Files';
    saveBtn.addEventListener('click', async () => {
      try {
        const payloadAssets = workingAssets.map(({ id: _id, ...asset }) => asset);
        await saveSectionOverride(section, {
          attachments: payloadAssets
        });
        syncSectionAssetsView(workingAssets);
        showStatus('Section files updated.');
        renderReadControls();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to save section files.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      workingAssets = readState.map((entry) => ({ ...entry }));
      syncSectionAssetsView(readState);
      renderReadControls();
    });

    controls.appendChild(uploadWrap);
    controls.appendChild(assetsList);
    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);

    renderAssetRows();
  };

  const enterEdit = () => {
    renderEditControls();
  };

  renderReadControls();
  return controls;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load selected image.'));
    };
    image.src = objectUrl;
  });

type CropPanOptions = {
  title?: string;
  aspectRatio?: number;
  outputWidth?: number;
  outputHeight?: number;
};

const openCropPanDialog = async (file: File, options: CropPanOptions = {}) => {
  const image = await loadImageElement(file);
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const aspectRatio = options.aspectRatio && options.aspectRatio > 0 ? options.aspectRatio : sourceRatio;

  let viewWidth = Math.min(760, Math.max(300, Math.floor(window.innerWidth * 0.86)));
  let viewHeight = Math.floor(viewWidth / aspectRatio);
  if (viewHeight > 420) {
    viewHeight = 420;
    viewWidth = Math.floor(viewHeight * aspectRatio);
  }

  const outputWidth = options.outputWidth ?? (aspectRatio >= 1 ? 1920 : Math.round(1920 * aspectRatio));
  const outputHeight = options.outputHeight ?? (aspectRatio >= 1 ? Math.round(1920 / aspectRatio) : 1920);

  return new Promise<File>((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.className = 'image-crop-overlay';
    overlay.innerHTML = `
      <div class="image-crop-panel" role="dialog" aria-modal="true" aria-label="Image crop and pan editor">
        <h3>${options.title || 'Adjust image'}</h3>
        <p class="image-crop-help">Drag to pan, use the slider to zoom, then apply.</p>
        <div class="image-crop-canvas-wrap">
          <canvas class="image-crop-canvas" width="${viewWidth}" height="${viewHeight}"></canvas>
        </div>
        <div class="image-crop-controls">
          <label>
            Zoom
            <input type="range" min="1" max="4" step="0.01" value="1" />
          </label>
        </div>
        <div class="image-crop-actions">
          <button type="button" data-crop-reset>Reset</button>
          <button type="button" data-crop-cancel>Cancel</button>
          <button type="button" data-crop-apply>Apply</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const panel = overlay.querySelector('.image-crop-panel') as HTMLElement | null;
    const canvas = overlay.querySelector('.image-crop-canvas') as HTMLCanvasElement | null;
    const zoomInput = overlay.querySelector('input[type="range"]') as HTMLInputElement | null;
    const resetBtn = overlay.querySelector('[data-crop-reset]') as HTMLButtonElement | null;
    const cancelBtn = overlay.querySelector('[data-crop-cancel]') as HTMLButtonElement | null;
    const applyBtn = overlay.querySelector('[data-crop-apply]') as HTMLButtonElement | null;
    if (!panel || !canvas || !zoomInput || !resetBtn || !cancelBtn || !applyBtn) {
      overlay.remove();
      reject(new Error('Image editor could not be initialized.'));
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      overlay.remove();
      reject(new Error('Image editor is unavailable in this browser.'));
      return;
    }

    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let pointerId: number | null = null;
    let dragStartX = 0;
    let dragStartY = 0;

    const getDrawMetrics = (width: number, height: number) => {
      const baseScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const scaledWidth = image.naturalWidth * baseScale * zoom;
      const scaledHeight = image.naturalHeight * baseScale * zoom;
      const maxPanX = Math.max(0, (scaledWidth - width) / 2);
      const maxPanY = Math.max(0, (scaledHeight - height) / 2);
      panX = clamp(panX, -maxPanX, maxPanX);
      panY = clamp(panY, -maxPanY, maxPanY);

      return {
        scaledWidth,
        scaledHeight,
        drawX: (width - scaledWidth) / 2 + panX,
        drawY: (height - scaledHeight) / 2 + panY,
        maxPanX,
        maxPanY
      };
    };

    const drawPreview = () => {
      const { scaledWidth, scaledHeight, drawX, drawY } = getDrawMetrics(canvas.width, canvas.height);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, drawX, drawY, scaledWidth, scaledHeight);
    };

    const closeDialog = () => {
      overlay.remove();
    };

    const cancelDialog = () => {
      closeDialog();
      reject(new Error('Image edit canceled.'));
    };

    zoomInput.addEventListener('input', () => {
      zoom = clamp(Number(zoomInput.value || '1'), 1, 4);
      drawPreview();
    });

    canvas.addEventListener('pointerdown', (event) => {
      pointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      canvas.classList.add('is-dragging');
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      const diffX = event.clientX - dragStartX;
      const diffY = event.clientY - dragStartY;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      panX += diffX;
      panY += diffY;
      drawPreview();
    });

    const endDrag = (event?: PointerEvent) => {
      if (event && pointerId !== null && event.pointerId !== pointerId) return;
      pointerId = null;
      canvas.classList.remove('is-dragging');
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    resetBtn.addEventListener('click', () => {
      zoom = 1;
      panX = 0;
      panY = 0;
      zoomInput.value = '1';
      drawPreview();
    });

    cancelBtn.addEventListener('click', cancelDialog);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) cancelDialog();
    });

    applyBtn.addEventListener('click', () => {
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = outputWidth;
      outputCanvas.height = outputHeight;

      const outContext = outputCanvas.getContext('2d');
      if (!outContext) {
        reject(new Error('Could not process image output.'));
        closeDialog();
        return;
      }

      const outputScaleX = outputWidth / canvas.width;
      const outputScaleY = outputHeight / canvas.height;
      const baseScaleOut = Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight);
      const scaledWidthOut = image.naturalWidth * baseScaleOut * zoom;
      const scaledHeightOut = image.naturalHeight * baseScaleOut * zoom;
      const drawXOut = (outputWidth - scaledWidthOut) / 2 + panX * outputScaleX;
      const drawYOut = (outputHeight - scaledHeightOut) / 2 + panY * outputScaleY;

      outContext.drawImage(image, drawXOut, drawYOut, scaledWidthOut, scaledHeightOut);

      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      outputCanvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Could not export edited image.'));
            closeDialog();
            return;
          }

          const editedFile = new File([blob], file.name.replace(/\.[a-zA-Z0-9]+$/, '') + (outputType === 'image/png' ? '.png' : '.jpg'), {
            type: outputType
          });
          closeDialog();
          resolve(editedFile);
        },
        outputType,
        0.92
      );
    });

    drawPreview();
  });
};

const prepareUploadImage = async (file: File, options: CropPanOptions = {}) => {
  try {
    return await openCropPanDialog(file, options);
  } catch (error) {
    if (error instanceof Error && error.message === 'Image edit canceled.') {
      return null;
    }
    throw error;
  }
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
  const rawImageUrl = ((item as HTMLElement).dataset.cardImageUrl ||
    (item.querySelector('.latest-news-image') as HTMLImageElement | null)?.getAttribute('src') ||
    (item.querySelector('.card-image') as HTMLImageElement | null)?.getAttribute('src') ||
    '')
    .trim();
  const imageUrls = parseCardImageUrls(rawImageUrl);
  const imageUrl = imageUrls[0] || '';

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
    imageUrls,
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

const parseCardImageUrls = (value: string | null | undefined): string[] => {
  const raw = (value || '').trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const urls = parsed
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter(Boolean);
        if (urls.length) return urls;
      }
    } catch {
      return [raw];
    }
  }

  return [raw];
};

const formatCardImageUrls = (urls: string[]): string => {
  const normalized = urls
    .map((entry) => (entry || '').trim())
    .filter(Boolean);

  if (!normalized.length) return '';
  return normalized.length === 1 ? normalized[0] : JSON.stringify(normalized);
};

type LatestNewsComposerOptions = {
  mode?: 'create' | 'edit';
  record?: CardRecord;
};

const openLatestNewsComposer = (options: LatestNewsComposerOptions = {}) => {
  const existingOverlay = document.querySelector('.news-overlay');
  if (existingOverlay) return;

  const isEditMode = options.mode === 'edit' && Boolean(options.record);
  const editRecord = options.record;
  const composerTitle = isEditMode ? 'Edit post' : 'Create post';
  const composerActionLabel = isEditMode ? 'Save post' : 'Create post';
  const categories = getLatestNewsCategories();
  if (editRecord?.category && !categories.includes(editRecord.category)) {
    categories.push(editRecord.category);
  }
  let workingImageUrls = isEditMode && editRecord ? [...(editRecord.imageUrls || [])] : [];

  const overlay = document.createElement('div');
  overlay.className = 'news-overlay';
  overlay.innerHTML = `
    <div class="news-overlay-panel" role="dialog" aria-modal="true" aria-label="${composerTitle}">
      <h3>${composerTitle}</h3>
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
          Upload image(s) (optional)
          <input type="file" name="imageFile" accept="image/*" multiple />
        </label>
        <div id="news-image-dropzone" class="inline-file-editor" role="button" tabindex="0" aria-label="Upload images">
          <span>Drag and drop images here, or click to select multiple files</span>
        </div>
        <div class="news-overlay-actions news-overlay-queue-row">
          <p id="news-selected-images-meta"></p>
          <button type="button" id="news-clear-selected-images">Clear selected</button>
        </div>
        <div id="news-current-images-wrap" class="${isEditMode ? '' : 'is-hidden'}">
          <p>Current images</p>
          <div id="news-current-images-list"></div>
        </div>
        <div class="news-overlay-actions">
          <button type="button" id="news-overlay-cancel">Cancel</button>
          <button type="submit" id="news-overlay-save">${composerActionLabel}</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const form = overlay.querySelector('#news-overlay-form') as HTMLFormElement | null;
  const categorySelect = overlay.querySelector('#news-category-select') as HTMLSelectElement | null;
  const newCategoryWrap = overlay.querySelector('#news-new-category-wrap') as HTMLElement | null;
  const titleInput = overlay.querySelector('input[name="title"]') as HTMLInputElement | null;
  const subtitleInput = overlay.querySelector('input[name="subtitle"]') as HTMLInputElement | null;
  const bodyInput = overlay.querySelector('textarea[name="body"]') as HTMLTextAreaElement | null;
  const hrefInput = overlay.querySelector('input[name="href"]') as HTMLInputElement | null;
  const newCategoryInput = overlay.querySelector('input[name="newCategory"]') as HTMLInputElement | null;
  const imageInput = overlay.querySelector('input[name="imageFile"]') as HTMLInputElement | null;
  const imageDropzone = overlay.querySelector('#news-image-dropzone') as HTMLElement | null;
  const selectedImagesMeta = overlay.querySelector('#news-selected-images-meta') as HTMLElement | null;
  const clearSelectedImagesBtn = overlay.querySelector('#news-clear-selected-images') as HTMLButtonElement | null;
  const currentImagesWrap = overlay.querySelector('#news-current-images-wrap') as HTMLElement | null;
  const currentImagesList = overlay.querySelector('#news-current-images-list') as HTMLElement | null;
  const cancelBtn = overlay.querySelector('#news-overlay-cancel') as HTMLButtonElement | null;
  const saveBtn = overlay.querySelector('#news-overlay-save') as HTMLButtonElement | null;
  let pendingImageFiles: File[] = [];

  const fileSignature = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

  const syncSelectedImagesMeta = () => {
    if (clearSelectedImagesBtn) {
      clearSelectedImagesBtn.disabled = pendingImageFiles.length === 0;
    }
    if (!selectedImagesMeta) return;
    if (!pendingImageFiles.length) {
      selectedImagesMeta.textContent = 'No new images selected.';
      return;
    }

    const previewNames = pendingImageFiles.slice(0, 3).map((file) => file.name).join(', ');
    const extraCount = Math.max(0, pendingImageFiles.length - 3);
    selectedImagesMeta.textContent =
      extraCount > 0
        ? `${pendingImageFiles.length} new images selected: ${previewNames} + ${extraCount} more`
        : `${pendingImageFiles.length} new images selected: ${previewNames}`;
  };

  const appendPendingFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;

    const seen = new Set(pendingImageFiles.map(fileSignature));
    imageFiles.forEach((file) => {
      const signature = fileSignature(file);
      if (!seen.has(signature)) {
        pendingImageFiles.push(file);
        seen.add(signature);
      }
    });

    syncSelectedImagesMeta();
  };

  imageInput?.addEventListener('change', () => {
    const selected = imageInput.files ? Array.from(imageInput.files) : [];
    appendPendingFiles(selected);
    imageInput.value = '';
  });

  imageDropzone?.addEventListener('click', () => {
    imageInput?.click();
  });

  imageDropzone?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    imageInput?.click();
  });

  imageDropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  imageDropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    const dropped = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
    appendPendingFiles(dropped);
  });

  clearSelectedImagesBtn?.addEventListener('click', () => {
    pendingImageFiles = [];
    syncSelectedImagesMeta();
    showStatus('Selected new images cleared.');
  });

  const pickImageFile = () =>
    new Promise<File | null>((resolve) => {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'image/*';
      picker.addEventListener(
        'change',
        () => {
          const file = picker.files?.[0] ?? null;
          resolve(file && file.size > 0 ? file : null);
        },
        { once: true }
      );
      picker.click();
    });

  const renderCurrentImages = () => {
    if (!currentImagesWrap || !currentImagesList) return;
    currentImagesWrap.classList.toggle('is-hidden', !isEditMode);
    if (!isEditMode) return;

    if (!workingImageUrls.length) {
      currentImagesList.innerHTML = '<p>No images currently attached to this post.</p>';
      return;
    }

    currentImagesList.innerHTML = workingImageUrls
      .map(
        (url, index) => `
          <div class="section-asset-edit-row" data-news-image-index="${index}">
            <span>Image ${index + 1}</span>
            <img class="section-asset-thumb" src="${url}" alt="Post image ${index + 1}" loading="lazy" />
            <button type="button" data-news-image-action="edit" data-news-image-index="${index}">Edit</button>
            <button type="button" data-news-image-action="replace" data-news-image-index="${index}">Replace</button>
            <button type="button" class="inline-item-remove" data-news-image-action="delete" data-news-image-index="${index}">Delete</button>
          </div>
        `
      )
      .join('');
  };

  currentImagesList?.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest('button[data-news-image-action]') as HTMLButtonElement | null;
    if (!button) return;

    event.preventDefault();
    const action = (button.dataset.newsImageAction || '').trim();
    const index = Number(button.dataset.newsImageIndex || '-1');
    if (!Number.isInteger(index) || index < 0 || index >= workingImageUrls.length) return;

    if (action === 'delete') {
      workingImageUrls = workingImageUrls.filter((_, entryIndex) => entryIndex !== index);
      renderCurrentImages();
      showStatus('Image removed from this draft. Save post to publish changes.');
      return;
    }

    if (action !== 'edit' && action !== 'replace') return;

    const picked = await pickImageFile();
    if (!picked) return;

    try {
      button.disabled = true;
      button.textContent = action === 'edit' ? 'Editing...' : 'Replacing...';

      const preparedFile = await prepareUploadImage(picked, {
        title: `${action === 'edit' ? 'Edit' : 'Replace'} image ${index + 1}`
      });
      if (!preparedFile) {
        showStatus('Image update canceled.');
        return;
      }

      const uploadedUrl = await uploadNewsImage(preparedFile);
      workingImageUrls[index] = uploadedUrl;
      renderCurrentImages();
      showStatus(
        action === 'edit'
          ? 'Image edited in this draft. Save post to publish changes.'
          : 'Image replaced in this draft. Save post to publish changes.'
      );
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to update image.');
    } finally {
      button.disabled = false;
      button.textContent = action === 'edit' ? 'Edit' : 'Replace';
    }
  });

  if (isEditMode && editRecord) {
    if (titleInput) titleInput.value = editRecord.title || '';
    if (subtitleInput) subtitleInput.value = editRecord.subtitle || '';
    if (bodyInput) bodyInput.value = editRecord.body || '';
    if (hrefInput) hrefInput.value = editRecord.href || '#';

    if (categorySelect) {
      const hasCategoryOption = Array.from(categorySelect.options).some((option) => option.value === editRecord.category);
      if (hasCategoryOption) {
        categorySelect.value = editRecord.category || 'General';
      } else {
        categorySelect.value = '__new__';
        if (newCategoryWrap) newCategoryWrap.style.display = 'grid';
        if (newCategoryInput) newCategoryInput.value = editRecord.category || '';
      }
    }
  }

  renderCurrentImages();
  syncSelectedImagesMeta();

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
    const selectedCategory = String(formData.get('category') || '').trim();
    const newCategory = String(formData.get('newCategory') || '').trim();
    const imageFiles = pendingImageFiles.filter((file) => file.size > 0);

    const category = selectedCategory === '__new__' ? newCategory : selectedCategory;
    if (!title || !body || !category) {
      showStatus('Title, body, and category are required.');
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = isEditMode ? 'Saving...' : 'Posting...';

      const imageUrls: string[] = [];
      const shouldCropBeforeUpload = imageFiles.length === 1;
      for (let index = 0; index < imageFiles.length; index += 1) {
        const imageFile = imageFiles[index];
        let fileToUpload: File = imageFile;

        if (shouldCropBeforeUpload) {
          const preparedFile = await prepareUploadImage(imageFile, {
            title: 'Adjust article image'
          });
          if (!preparedFile) {
            saveBtn.disabled = false;
            saveBtn.textContent = composerActionLabel;
            showStatus('Image upload canceled.');
            return;
          }
          fileToUpload = preparedFile;
        }

        const uploadedUrl = await uploadNewsImage(fileToUpload);
        imageUrls.push(uploadedUrl);
      }

      let nextSortOrder = 1;
      if (isEditMode && editRecord) {
        nextSortOrder = editRecord.sortOrder;
      } else {
        const currentOrders = Array.from(document.querySelectorAll('.latest-news-slide'))
          .map((el) => Number((el as HTMLElement).dataset.sortOrder || '0'))
          .filter((value) => !Number.isNaN(value));
        nextSortOrder = (currentOrders.length ? Math.max(...currentOrders) : 0) + 1;
      }

      const finalImageUrls = isEditMode
        ? Array.from(new Set([...(workingImageUrls || []), ...imageUrls]))
        : imageUrls;

      await saveCard({
        id: isEditMode ? editRecord?.id : undefined,
        page_key: currentPageKey(),
        section_key: 'latest_news',
        category,
        subtitle,
        title,
        body,
        image_url: formatCardImageUrls(finalImageUrls),
        href,
        sort_order: nextSortOrder
      });

      showStatus(isEditMode ? 'Latest news article updated. Refreshing...' : 'Latest news article posted. Refreshing...');
      overlay.remove();
      window.location.reload();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : isEditMode ? 'Failed to update article.' : 'Failed to post article.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = composerActionLabel;
    }
  });
};

const openStandardCardComposer = (record: CardRecord) => {
  const existingOverlay = document.querySelector('.news-overlay');
  if (existingOverlay) return;

  const overlay = document.createElement('div');
  overlay.className = 'news-overlay';
  overlay.innerHTML = `
    <div class="news-overlay-panel" role="dialog" aria-modal="true" aria-label="Edit card">
      <h3>Edit card</h3>
      <form class="news-overlay-form" id="standard-card-overlay-form">
        <label>
          Title
          <input type="text" name="title" required />
        </label>
        <label>
          Body
          <textarea name="body" rows="4" required></textarea>
        </label>
        ${record.clickable ? `
          <label>
            Link URL
            <input type="url" name="href" value="#" />
          </label>
        ` : ''}
        <label>
          Upload image (optional)
          <input type="file" name="imageFile" accept="image/*" />
        </label>
        <div class="news-overlay-actions">
          <button type="button" id="standard-card-overlay-cancel">Cancel</button>
          <button type="submit" id="standard-card-overlay-save">Save card</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const form = overlay.querySelector('#standard-card-overlay-form') as HTMLFormElement | null;
  const titleInput = overlay.querySelector('input[name="title"]') as HTMLInputElement | null;
  const bodyInput = overlay.querySelector('textarea[name="body"]') as HTMLTextAreaElement | null;
  const hrefInput = overlay.querySelector('input[name="href"]') as HTMLInputElement | null;
  const cancelBtn = overlay.querySelector('#standard-card-overlay-cancel') as HTMLButtonElement | null;
  const saveBtn = overlay.querySelector('#standard-card-overlay-save') as HTMLButtonElement | null;

  if (titleInput) titleInput.value = record.title || '';
  if (bodyInput) bodyInput.value = record.body || '';
  if (hrefInput) hrefInput.value = record.href || '#';

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
    const body = String(formData.get('body') || '').trim();
    const href = String(formData.get('href') || record.href || '#').trim() || '#';
    const imageFile = formData.get('imageFile');

    if (!title || !body) {
      showStatus('Title and body are required.');
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      let imageUrl = record.imageUrl || '';
      if (imageFile instanceof File && imageFile.size > 0) {
        const preparedFile = await prepareUploadImage(imageFile, { title: 'Adjust card image' });
        if (!preparedFile) {
          showStatus('Image upload canceled.');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save card';
          return;
        }
        imageUrl = await uploadNewsImage(preparedFile);
      }

      await saveCard({
        id: record.id,
        page_key: currentPageKey(),
        section_key: record.sectionKey,
        sort_order: record.sortOrder,
        category: '',
        subtitle: '',
        title,
        body,
        image_url: imageUrl,
        href: record.clickable ? href : '#'
      });

      showStatus('Card updated. Refreshing...');
      overlay.remove();
      window.location.reload();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to update card.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save card';
    }
  });
};

const openAnnouncementComposer = (record: AnnouncementRecord) => {
  const existingOverlay = document.querySelector('.news-overlay');
  if (existingOverlay) return;

  const overlay = document.createElement('div');
  overlay.className = 'news-overlay';
  overlay.innerHTML = `
    <div class="news-overlay-panel" role="dialog" aria-modal="true" aria-label="Edit announcement">
      <h3>Edit announcement</h3>
      <form class="news-overlay-form" id="announcement-overlay-form">
        <label>
          Date
          <input type="text" name="date" required />
        </label>
        <label>
          Tag
          <input type="text" name="tag" />
        </label>
        <label>
          Title
          <input type="text" name="title" required />
        </label>
        <label>
          Body
          <textarea name="body" rows="4" required></textarea>
        </label>
        <div class="news-overlay-actions">
          <button type="button" id="announcement-overlay-cancel">Cancel</button>
          <button type="submit" id="announcement-overlay-save">Save announcement</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const form = overlay.querySelector('#announcement-overlay-form') as HTMLFormElement | null;
  const dateInput = overlay.querySelector('input[name="date"]') as HTMLInputElement | null;
  const tagInput = overlay.querySelector('input[name="tag"]') as HTMLInputElement | null;
  const titleInput = overlay.querySelector('input[name="title"]') as HTMLInputElement | null;
  const bodyInput = overlay.querySelector('textarea[name="body"]') as HTMLTextAreaElement | null;
  const cancelBtn = overlay.querySelector('#announcement-overlay-cancel') as HTMLButtonElement | null;
  const saveBtn = overlay.querySelector('#announcement-overlay-save') as HTMLButtonElement | null;

  if (dateInput) dateInput.value = record.date || '';
  if (tagInput) tagInput.value = record.tag || '';
  if (titleInput) titleInput.value = record.title || '';
  if (bodyInput) bodyInput.value = record.body || '';

  cancelBtn?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form || !saveBtn) return;

    const formData = new FormData(form);
    const date = String(formData.get('date') || '').trim();
    const tag = String(formData.get('tag') || '').trim();
    const title = String(formData.get('title') || '').trim();
    const body = String(formData.get('body') || '').trim();

    if (!date || !title || !body) {
      showStatus('Date, title, and body are required.');
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      await saveAnnouncement({
        id: record.id,
        date,
        tag,
        title,
        body
      });

      showStatus('Announcement updated. Refreshing...');
      overlay.remove();
      window.location.reload();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to update announcement.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save announcement';
    }
  });
};

const openDownloadComposer = (record: DownloadRecord) => {
  const existingOverlay = document.querySelector('.news-overlay');
  if (existingOverlay) return;

  const overlay = document.createElement('div');
  overlay.className = 'news-overlay';
  overlay.innerHTML = `
    <div class="news-overlay-panel" role="dialog" aria-modal="true" aria-label="Edit download">
      <h3>Edit download</h3>
      <form class="news-overlay-form" id="download-overlay-form">
        <label>
          Title
          <input type="text" name="title" required />
        </label>
        <label>
          Body
          <textarea name="body" rows="4" required></textarea>
        </label>
        <label>
          Download URL
          <input type="url" name="href" required />
        </label>
        <label>
          Link label
          <input type="text" name="linkLabel" required />
        </label>
        <div class="news-overlay-actions">
          <button type="button" id="download-overlay-cancel">Cancel</button>
          <button type="submit" id="download-overlay-save">Save download</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const form = overlay.querySelector('#download-overlay-form') as HTMLFormElement | null;
  const titleInput = overlay.querySelector('input[name="title"]') as HTMLInputElement | null;
  const bodyInput = overlay.querySelector('textarea[name="body"]') as HTMLTextAreaElement | null;
  const hrefInput = overlay.querySelector('input[name="href"]') as HTMLInputElement | null;
  const linkLabelInput = overlay.querySelector('input[name="linkLabel"]') as HTMLInputElement | null;
  const cancelBtn = overlay.querySelector('#download-overlay-cancel') as HTMLButtonElement | null;
  const saveBtn = overlay.querySelector('#download-overlay-save') as HTMLButtonElement | null;

  if (titleInput) titleInput.value = record.title || '';
  if (bodyInput) bodyInput.value = record.body || '';
  if (hrefInput) hrefInput.value = record.href || '';
  if (linkLabelInput) linkLabelInput.value = record.linkLabel || 'Download File';

  cancelBtn?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form || !saveBtn) return;

    const formData = new FormData(form);
    const title = String(formData.get('title') || '').trim();
    const body = String(formData.get('body') || '').trim();
    const href = String(formData.get('href') || '').trim();
    const linkLabel = String(formData.get('linkLabel') || 'Download File').trim() || 'Download File';

    if (!title || !body || !href) {
      showStatus('Title, body, and download URL are required.');
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      await saveDownload({
        id: record.id,
        section: record.section,
        sort_order: record.sortOrder,
        title,
        body,
        href,
        link_label: linkLabel
      });

      showStatus('Download saved. Refreshing...');
      overlay.remove();
      window.location.reload();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to save download.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save download';
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
    editBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openAnnouncementComposer(record);
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

  bodyEl?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openAnnouncementComposer(record);
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
  let imageFileInput: HTMLInputElement | null = null;
  let imageUploadButton: HTMLButtonElement | null = null;
  let currentImageUrls = [...record.imageUrls];
  let currentImageUrl = currentImageUrls[0] || '';

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
    editBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isLatestNews) {
        openLatestNewsComposer({ mode: 'edit', record: toCardRecord(item) });
        return;
      }
      openStandardCardComposer(toCardRecord(item));
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
          image_url: formatCardImageUrls(currentImageUrls),
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
      currentImageUrls = [...readState.imageUrls];
      currentImageUrl = readState.imageUrl;
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

    if (!imageFileInput) {
      const { wrapper, input, button } = createFileEditor();
      item.appendChild(wrapper);
      imageFileInput = input;
      imageFileInput.multiple = true;
      imageUploadButton = button;

      imageUploadButton.addEventListener('click', async (eventUpload) => {
        eventUpload.preventDefault();
        const uploadBtn = imageUploadButton;
        if (!uploadBtn) return;
        const files = imageFileInput?.files ? Array.from(imageFileInput.files) : [];
        if (!files.length) {
          showStatus('Choose one or more image files first.');
          return;
        }

        try {
          uploadBtn.disabled = true;
          uploadBtn.textContent = 'Uploading...';

          const uploadedUrls: string[] = [];
          for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const preparedFile = await prepareUploadImage(file, {
              title: files.length > 1 ? `Adjust image ${index + 1} of ${files.length}` : 'Adjust image before upload'
            });
            if (!preparedFile) {
              showStatus('Image upload canceled.');
              return;
            }
            const url = await uploadNewsImage(preparedFile);
            uploadedUrls.push(url);
          }

          const mergedUrls = Array.from(new Set([...currentImageUrls, ...uploadedUrls]));
          currentImageUrls = mergedUrls;
          currentImageUrl = mergedUrls[0] || '';
          const liveTitle = isLatestNews ? getLatestNewsTitleText() || readState.title : (titleEl?.textContent ?? readState.title).trim();
          const liveBody = isLatestNews ? getLatestNewsBodyText() || readState.body : (bodyEl?.textContent ?? readState.body).trim();
          syncLatestNewsMedia(
            currentImageUrl,
            liveTitle,
            (subtitleEl?.textContent ?? readState.subtitle).trim(),
            liveBody
          );
          syncStandardCardMedia(currentImageUrl, liveTitle);
          showStatus(
            uploadedUrls.length > 1
              ? `${uploadedUrls.length} images uploaded. Save the card to publish changes.`
              : 'Image uploaded. Save the card to publish changes.'
          );
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
      if (isLatestNews) {
        openLatestNewsComposer({ mode: 'edit', record: toCardRecord(item) });
        return;
      }
      openStandardCardComposer(toCardRecord(item));
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
    editBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDownloadComposer(record);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!record.id) {
        showStatus('This download is from default content and cannot be deleted yet. Edit it first.');
        return;
      }

        bodyEl?.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openDownloadComposer(record);
        });
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
  bodyEl?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDownloadComposer(record);
  });
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
  let panelImageFileInput: HTMLInputElement | null = null;
  let panelImageUploadButton: HTMLButtonElement | null = null;
  let addListItemBtn: HTMLButtonElement | null = null;
  let currentPanelImageUrl = (panelImageEl?.getAttribute('src') ?? '').trim();

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
            imageUrl: currentPanelImageUrl.trim()
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
      currentPanelImageUrl = readState.panelImageUrl;
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
          const preparedFile = await prepareUploadImage(file, { title: 'Adjust panel image' });
          if (!preparedFile) {
            showStatus('Image upload canceled.');
            return;
          }
          const url = await uploadNewsImage(preparedFile);
          currentPanelImageUrl = url;
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

const wireLatestNewsSidePanelInline = (section: Element) => {
  const panel = section.querySelector('.latest-news-side-panel');
  if (!panel) return;

  const titleEl = panel.querySelector('h3');
  const bodyEl = panel.querySelector('p');
  let nameEl = panel.querySelector('.latest-news-side-panel-name') as HTMLElement | null;
  const imageEl = panel.querySelector('.latest-news-side-image') as HTMLImageElement | null;
  let linkEl = panel.querySelector('a') as HTMLAnchorElement | null;
  if (!titleEl || !bodyEl) return;

  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  panel.appendChild(controls);

  const readState = {
    title: (titleEl.textContent ?? '').trim(),
    body: (bodyEl.textContent ?? '').trim(),
    principalName: (nameEl?.textContent ?? 'Dr. G.K.S. Memela').trim(),
    imageUrl: (imageEl?.getAttribute('src') ?? '').trim(),
    linkLabel: (linkEl?.textContent ?? '').trim(),
    linkHref: (linkEl?.getAttribute('href') ?? '').trim()
  };

  let linkUrlEditor: HTMLInputElement | null = null;

  const ensureName = () => {
    if (nameEl) return nameEl;
    const element = document.createElement('p');
    element.className = 'latest-news-side-panel-name';
    element.textContent = 'Dr. G.K.S. Memela';
    if (linkEl) {
      linkEl.before(element);
    } else {
      panel.appendChild(element);
    }
    nameEl = element;
    return element;
  };

  const ensureLink = () => {
    if (linkEl) return linkEl;
    const anchor = document.createElement('a');
    anchor.href = '#';
    anchor.textContent = 'Read more';
    panel.appendChild(anchor);
    linkEl = anchor;
    return anchor;
  };

  const exitEdit = () => {
    setEditable(titleEl, false);
    setEditable(bodyEl, false);
    setEditable(nameEl, false);
    setEditable(linkEl, false);
    if (linkUrlEditor) {
      linkUrlEditor.parentElement?.remove();
      linkUrlEditor = null;
    }
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
    attachAiButton(controls, panel);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        const activeLink = ensureLink();
        const href = (linkUrlEditor?.value ?? activeLink.getAttribute('href') ?? '#').trim() || '#';
        const label = (activeLink.textContent ?? '').trim() || 'Read more';

        await saveSectionOverride(section, {
          sidePanel: {
            title: (titleEl.textContent ?? '').trim(),
            body: (bodyEl.textContent ?? '').trim(),
            principalName: (ensureName().textContent ?? '').trim() || 'Dr. G.K.S. Memela',
            imageUrl: readState.imageUrl,
            link: {
              href,
              label
            }
          }
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
      bodyEl.textContent = readState.body;
      ensureName().textContent = readState.principalName || 'Dr. G.K.S. Memela';
      const activeLink = ensureLink();
      activeLink.textContent = readState.linkLabel || 'Read more';
      activeLink.setAttribute('href', readState.linkHref || '#');
      exitEdit();
      renderReadControls();
    });

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
  };

  const enterEdit = () => {
    const activeName = ensureName();
    const activeLink = ensureLink();
    setEditable(titleEl, true);
    setEditable(bodyEl, true);
    setEditable(activeName, true);
    setEditable(activeLink, true);

    if (!linkUrlEditor) {
      const { wrapper, input } = createUrlEditor('Link URL', activeLink.getAttribute('href') || '#');
      panel.appendChild(wrapper);
      linkUrlEditor = input;
    }

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

const wireHeaderInline = () => {
  const header = document.querySelector('.site-header') as HTMLElement | null;
  if (!header) return;

  const headerInner = header.querySelector('.header-inner');
  if (!headerInner) return;

  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls header-inline-controls';
  headerInner.appendChild(controls);

  const readState = {
    headerBgImage: (header.dataset.headerBgUrl || '').trim()
  };

  let imageFileInput: HTMLInputElement | null = null;
  let imageUploadButton: HTMLButtonElement | null = null;
  let currentHeaderBgImage = readState.headerBgImage;

  const applyHeaderBackground = (url: string) => {
    const normalized = (url || '').trim();
    header.dataset.headerBgUrl = normalized;

    if (!normalized) {
      header.classList.remove('has-header-bg');
      header.style.removeProperty('--header-bg-image');
      return;
    }

    const safeHeaderBgUrl = normalized.replace(/"/g, '\\"');
    header.classList.add('has-header-bg');
    header.style.setProperty('--header-bg-image', `url("${safeHeaderBgUrl}")`);
  };

  const removeEditors = () => {
    imageFileInput?.closest('.inline-file-editor')?.remove();
    imageFileInput = null;
    imageUploadButton = null;
  };

  const renderReadControls = () => {
    controls.innerHTML = '';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit Header';
    editBtn.addEventListener('click', enterEdit);
    controls.appendChild(editBtn);
  };

  const renderEditControls = () => {
    controls.innerHTML = '';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        await saveSiteSettings({
          school_header_bg_image: currentHeaderBgImage.trim()
        });
        showStatus('Header updated. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to update header.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      currentHeaderBgImage = readState.headerBgImage;
      applyHeaderBackground(readState.headerBgImage);
      removeEditors();
      renderReadControls();
    });

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
  };

  const enterEdit = () => {
    renderEditControls();

    if (!imageFileInput) {
      const { wrapper, input, button } = createFileEditor('Upload image');
      controls.appendChild(wrapper);
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
          const preparedFile = await prepareUploadImage(file, {
            title: 'Adjust header background image',
            aspectRatio: 3.2,
            outputWidth: 1920,
            outputHeight: 600
          });
          if (!preparedFile) {
            showStatus('Image upload canceled.');
            return;
          }
          const url = await uploadNewsImage(preparedFile);
          currentHeaderBgImage = url;
          applyHeaderBackground(url);
          showStatus('Header background uploaded. Save to publish changes.');
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
  };

  renderReadControls();
};

const showHomeThemeUploadHint = () => {
  if (currentPageKey() !== 'home') return;
  if (document.getElementById('inline-admin-theme-hint')) return;
  if (sessionStorage.getItem('theme-upload-hint-dismissed') === '1') return;

  const hint = document.createElement('div');
  hint.id = 'inline-admin-theme-hint';
  hint.className = 'inline-admin-theme-hint';
  hint.innerHTML = `
    <p>Tip: click any blank area on this Home page to upload and position a theme background image.</p>
    <button type="button" aria-label="Dismiss theme upload hint">×</button>
  `;

  const closeBtn = hint.querySelector('button');
  closeBtn?.addEventListener('click', () => {
    sessionStorage.setItem('theme-upload-hint-dismissed', '1');
    hint.remove();
  });

  document.body.appendChild(hint);
};

const wireHomeThemeBackgroundUpload = () => {
  if (currentPageKey() !== 'home') return;

  const main = document.getElementById('main-content') as HTMLElement | null;
  if (!main) return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  showHomeThemeUploadHint();

  let uploadInProgress = false;

  const applyThemeBackground = (url: string) => {
    const normalized = (url || '').trim();
    main.dataset.themeBgUrl = normalized;

    if (!normalized) {
      main.classList.remove('has-theme-bg');
      main.style.removeProperty('--site-theme-bg-image');
      return;
    }

    const safeThemeBgUrl = normalized.replace(/"/g, '\\"');
    main.classList.add('has-theme-bg');
    main.style.setProperty('--site-theme-bg-image', `url("${safeThemeBgUrl}")`);
  };

  const isInteractiveTarget = (target: HTMLElement) =>
    Boolean(
      target.closest(
        'a, button, input, textarea, select, [contenteditable="true"], .inline-admin-controls, .site-header, .site-footer, .news-overlay, .news-read-overlay, .image-crop-overlay, .panel, .card, .latest-news-slide, .hero-notice'
      )
    );

  document.addEventListener('click', (event) => {
    if (uploadInProgress) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (!main.contains(target)) return;
    if (isInteractiveTarget(target)) return;

    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      uploadInProgress = true;
      const preparedFile = await prepareUploadImage(file, {
        title: 'Adjust site theme background',
        aspectRatio: 16 / 9,
        outputWidth: 1920,
        outputHeight: 1080
      });
      if (!preparedFile) {
        showStatus('Theme image upload canceled.');
        return;
      }

      showStatus('Uploading theme image...');
      const url = await uploadNewsImage(preparedFile);
      applyThemeBackground(url);
      await saveSiteSettings({
        school_theme_bg_image: url
      });
      showStatus('Home theme background updated.');
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to update theme background.');
    } finally {
      uploadInProgress = false;
    }
  });
};

const wireSectionAssetsInline = (section: Element) => {
  const container = section.querySelector('.container');
  if (!container) return;
  if (container.querySelector('.section-assets-inline-controls')) return;

  const controls = createSectionAssetsEditor(section);
  container.appendChild(controls);
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

  const latestNewsSection = document.querySelector(
    '[data-editable-section="true"][data-section-key="latest_news"]'
  );
  if (latestNewsSection) {
    wireLatestNewsSidePanelInline(latestNewsSection);
  }

  const editableSections = Array.from(document.querySelectorAll('[data-editable-section="true"]'));
  editableSections.forEach(wireSectionAssetsInline);

  wireHeaderInline();
  wireHomeThemeBackgroundUpload();
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
