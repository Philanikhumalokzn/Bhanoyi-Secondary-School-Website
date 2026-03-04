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
import { persistEnrollmentStore, syncEnrollmentStoreFromRemote } from '../content/enrollment.persistence.js';
import { exportProfessionalWorkbook } from '../content/professional-export.js';

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

let overlayScrollLockCount = 0;
let overlayLockedScrollY = 0;

const lockOverlayBackgroundScroll = () => {
  overlayScrollLockCount += 1;
  if (overlayScrollLockCount > 1) return;

  overlayLockedScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${overlayLockedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
};

const unlockOverlayBackgroundScroll = () => {
  overlayScrollLockCount = Math.max(0, overlayScrollLockCount - 1);
  if (overlayScrollLockCount > 0) return;

  const scrollY = overlayLockedScrollY;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, scrollY);
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

type AiRewriteOptions = {
  refinementPrompt?: string;
  modelChoice?: 'auto' | 'ollama' | 'gemini';
};

type AiModelChoice = 'auto' | 'ollama' | 'gemini';

const AI_MODEL_STORAGE_KEY = 'inline_admin_ai_model_choice';

const normalizeAiModelChoice = (value?: string): AiModelChoice => {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'gemini') return 'gemini';
  if (normalized === 'ollama') return 'ollama';
  return 'auto';
};

const getPreferredAiModelChoice = (): AiModelChoice => {
  try {
    return normalizeAiModelChoice(window.localStorage.getItem(AI_MODEL_STORAGE_KEY) || 'auto');
  } catch {
    return 'auto';
  }
};

const setPreferredAiModelChoice = (choice: AiModelChoice) => {
  try {
    window.localStorage.setItem(AI_MODEL_STORAGE_KEY, choice);
  } catch {
    // ignore storage failures
  }
};

const shouldUseHostedAiForChoice = (choice: AiModelChoice) =>
  choice === 'gemini'
    ? true
    : choice === 'ollama'
      ? false
      : !isLocalHost() && isLoopbackOllama;

const getAiProviderLabel = (choice: AiModelChoice) => {
  const useHostedAi = shouldUseHostedAiForChoice(choice);
  if (useHostedAi) {
    return choice === 'gemini' ? 'Gemini (Production API)' : 'Hosted AI (Production API)';
  }
  return `Local Ollama (${ollamaModel})`;
};

const normalizeRefinementPrompt = (value?: string) => (typeof value === 'string' ? value.trim() : '');

const rewriteWithHostedAi = async (input: string, options: AiRewriteOptions = {}) => {
  const refinementPrompt = normalizeRefinementPrompt(options.refinementPrompt);
  const modelChoice = options.modelChoice === 'gemini' ? 'gemini' : 'auto';
  const session = await getSession();
  const accessToken = typeof session?.access_token === 'string' ? session.access_token.trim() : '';
  if (!accessToken) {
    throw new Error('Admin session required. Please sign in again.');
  }
  let response: Response;
  try {
    response = await fetch('/api/ai-rewrite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        input,
        refinementPrompt,
        modelChoice
      })
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

const rewriteWithOllama = async (input: string, options: AiRewriteOptions = {}) => {
  const refinementPrompt = normalizeRefinementPrompt(options.refinementPrompt);
  const promptLines = [
    'Rewrite the text for a school website admin editor.',
    'Keep the original meaning and factual details.',
    'Improve grammar, clarity, and readability.',
    'Return only the rewritten text with no quotes or extra labels.'
  ];

  if (refinementPrompt) {
    promptLines.push(`Additional refinement instructions: ${refinementPrompt}`);
  }

  promptLines.push('', input);
  const prompt = promptLines.join('\n');

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
  const aiModelSelect = document.createElement('select');
  aiModelSelect.className = 'inline-ai-model-select';
  aiModelSelect.setAttribute('aria-label', 'AI model');
  aiModelSelect.innerHTML = `
    <option value="auto">AI: Auto</option>
    <option value="ollama">AI: Ollama</option>
    <option value="gemini">AI: Gemini</option>
  `;
  aiModelSelect.value = getPreferredAiModelChoice();

  const aiProviderHint = document.createElement('span');
  aiProviderHint.className = 'inline-ai-provider-hint';

  const refreshInlineProviderHint = () => {
    const choice = normalizeAiModelChoice(aiModelSelect.value);
    aiProviderHint.textContent = `Using: ${getAiProviderLabel(choice)}`;
  };

  refreshInlineProviderHint();
  aiModelSelect.addEventListener('change', () => {
    setPreferredAiModelChoice(normalizeAiModelChoice(aiModelSelect.value));
    refreshInlineProviderHint();
  });

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
      aiModelSelect.disabled = true;
      aiBtn.textContent = 'AI Working...';
      const aiModelChoice = normalizeAiModelChoice(aiModelSelect.value);
      const shouldUseHostedAi = shouldUseHostedAiForChoice(aiModelChoice);
      showStatus(
        shouldUseHostedAi
          ? aiModelChoice === 'gemini'
            ? 'Using production AI (Gemini)...'
            : 'Using production AI...'
          : `Using local Ollama (${ollamaModel})...`
      );
      const rewritten = shouldUseHostedAi
        ? await rewriteWithHostedAi(sourceText, { modelChoice: aiModelChoice })
        : await rewriteWithOllama(sourceText);
      setTargetText(target, rewritten);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      showStatus('AI update applied. Review and save.');
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'AI update failed.');
    } finally {
      aiBtn.disabled = false;
      aiModelSelect.disabled = false;
      aiBtn.textContent = 'AI Update';
    }
  });

  controls.appendChild(aiModelSelect);
  controls.appendChild(aiProviderHint);
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
      ? (item as HTMLElement).dataset.cardBodyHtml ||
        item.querySelector('.latest-news-body')?.textContent ||
        item.querySelector('.latest-news-fallback-body')?.textContent
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

const CALENDAR_EVENT_TYPES_STORAGE_PREFIX = 'bhanoyi.schoolCalendarEventTypes.';
const DEFAULT_CALENDAR_SECTION_KEY = 'school_calendar';

const normalizeCategoryLabel = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();

const dedupeCategoryLabels = (values: string[]) => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((entry) => {
    const label = normalizeCategoryLabel(entry);
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(label);
  });

  return normalized;
};

const getCanonicalCalendarEventTypesStorageKey = () => {
  if (typeof window === 'undefined') {
    return `${CALENDAR_EVENT_TYPES_STORAGE_PREFIX}${DEFAULT_CALENDAR_SECTION_KEY}`;
  }

  try {
    const exact = `${CALENDAR_EVENT_TYPES_STORAGE_PREFIX}${DEFAULT_CALENDAR_SECTION_KEY}`;
    if (window.localStorage.getItem(exact)) {
      return exact;
    }

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) || '';
      if (key.startsWith(CALENDAR_EVENT_TYPES_STORAGE_PREFIX)) {
        return key;
      }
    }
  } catch {
    return `${CALENDAR_EVENT_TYPES_STORAGE_PREFIX}${DEFAULT_CALENDAR_SECTION_KEY}`;
  }

  return `${CALENDAR_EVENT_TYPES_STORAGE_PREFIX}${DEFAULT_CALENDAR_SECTION_KEY}`;
};

const loadCanonicalCalendarEventTypes = () => {
  try {
    const raw = window.localStorage.getItem(getCanonicalCalendarEventTypesStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeCategoryLabels(parsed.map((entry) => String(entry || '')));
  } catch {
    return [];
  }
};

const saveCanonicalCalendarEventTypes = (types: string[]) => {
  const key = getCanonicalCalendarEventTypesStorageKey();
  const normalized = dedupeCategoryLabels(types);
  try {
    window.localStorage.setItem(key, JSON.stringify(normalized));
  } catch {
    return normalized;
  }
  return normalized;
};

const syncCategoryToCanonicalCalendarEventTypes = (categoryRaw: string) => {
  const category = normalizeCategoryLabel(categoryRaw);
  if (!category) return '';

  const existing = loadCanonicalCalendarEventTypes();
  const matched = existing.find((entry) => entry.toLowerCase() === category.toLowerCase());
  if (matched) return matched;

  saveCanonicalCalendarEventTypes([...existing, category]);
  return category;
};

const getLatestNewsCategories = () => {
  const fromLanes = Array.from(document.querySelectorAll('.latest-news-lane-head h3'))
    .map((el) => (el.textContent ?? '').trim())
    .filter(Boolean);

  const fromCards = Array.from(document.querySelectorAll('.latest-news-slide .news-category'))
    .map((el) => (el.textContent ?? '').trim())
    .filter(Boolean);

  const canonicalCalendarTypes = loadCanonicalCalendarEventTypes();
  const defaults = canonicalCalendarTypes.length ? canonicalCalendarTypes : ['General'];
  return dedupeCategoryLabels([...defaults, ...fromLanes, ...fromCards]);
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
  const composerActionLabel = 'Publish';
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
          <div class="news-rich-editor" data-news-rich-editor>
            <div class="news-rich-toolbar" role="toolbar" aria-label="Body formatting">
              <button type="button" data-editor-cmd="bold" title="Bold"><strong>B</strong></button>
              <button type="button" data-editor-cmd="italic" title="Italic"><em>I</em></button>
              <button type="button" data-editor-cmd="underline" title="Underline"><u>U</u></button>
              <button type="button" data-editor-cmd="insertUnorderedList" title="Bulleted list">• List</button>
              <button type="button" data-editor-cmd="insertOrderedList" title="Numbered list">1. List</button>
              <button type="button" data-editor-action="link" title="Insert link">Link</button>
              <button type="button" data-editor-action="clear" title="Clear formatting">Clear</button>
            </div>
            <div class="news-rich-surface" data-news-rich-input contenteditable="true" role="textbox" aria-multiline="true"></div>
          </div>
          <textarea name="body" rows="4" required hidden></textarea>
        </label>
        <div class="news-overlay-ai-options">
          <label>
            AI model
            <select name="aiModelChoice">
              <option value="auto">Auto (recommended)</option>
              <option value="ollama">Local Ollama</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>
          <p id="news-ai-provider-hint" class="news-overlay-ai-provider-hint"></p>
          <label>
            AI refinement prompt (optional)
            <textarea name="aiRefinementPrompt" rows="2" placeholder="Example: Keep a formal school tone and make it concise."></textarea>
          </label>
        </div>
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
          <button type="button" id="news-overlay-proofread">AI Proofread</button>
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
  const bodyEditor = overlay.querySelector('[data-news-rich-input]') as HTMLDivElement | null;
  const hrefInput = overlay.querySelector('input[name="href"]') as HTMLInputElement | null;
  const newCategoryInput = overlay.querySelector('input[name="newCategory"]') as HTMLInputElement | null;
  const imageInput = overlay.querySelector('input[name="imageFile"]') as HTMLInputElement | null;
  const aiModelSelect = overlay.querySelector('select[name="aiModelChoice"]') as HTMLSelectElement | null;
  const aiProviderHint = overlay.querySelector('#news-ai-provider-hint') as HTMLElement | null;
  const imageDropzone = overlay.querySelector('#news-image-dropzone') as HTMLElement | null;
  const selectedImagesMeta = overlay.querySelector('#news-selected-images-meta') as HTMLElement | null;
  const clearSelectedImagesBtn = overlay.querySelector('#news-clear-selected-images') as HTMLButtonElement | null;
  const currentImagesWrap = overlay.querySelector('#news-current-images-wrap') as HTMLElement | null;
  const currentImagesList = overlay.querySelector('#news-current-images-list') as HTMLElement | null;
  const cancelBtn = overlay.querySelector('#news-overlay-cancel') as HTMLButtonElement | null;
  const proofreadBtn = overlay.querySelector('#news-overlay-proofread') as HTMLButtonElement | null;
  const saveBtn = overlay.querySelector('#news-overlay-save') as HTMLButtonElement | null;
  let pendingImageFiles: File[] = [];

  const editorEscapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const bodyHtmlToPlainText = (value: string) => {
    const temp = document.createElement('div');
    temp.innerHTML = value || '';
    return (temp.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const setBodyEditorContent = (value: string) => {
    if (!bodyEditor) return;
    const raw = (value || '').trim();
    if (!raw) {
      bodyEditor.innerHTML = '';
      return;
    }

    const hasHtml = /<[^>]+>/.test(raw);
    bodyEditor.innerHTML = hasHtml ? raw : editorEscapeHtml(raw).replace(/\n/g, '<br>');
  };

  const syncBodyInputFromEditor = () => {
    if (!bodyEditor || !bodyInput) return;
    const html = (bodyEditor.innerHTML || '')
      .replace(/<(div|p|li)>\s*<br\s*\/?><\/(div|p|li)>/gi, '')
      .trim();
    bodyInput.value = html;
  };

  const getBodyPlainText = () => {
    if (!bodyEditor) return '';
    return bodyHtmlToPlainText(bodyEditor.innerHTML || '');
  };

  const setComposerBusy = (busy: boolean, mode: 'proofread' | 'publish') => {
    if (saveBtn) {
      saveBtn.disabled = busy;
      saveBtn.textContent = busy && mode === 'publish' ? 'Publishing...' : composerActionLabel;
    }
    if (proofreadBtn) {
      proofreadBtn.disabled = busy;
      proofreadBtn.textContent = busy && mode === 'proofread' ? 'Proofreading...' : 'AI Proofread';
    }
    if (cancelBtn) {
      cancelBtn.disabled = busy;
    }
    if (aiModelSelect) {
      aiModelSelect.disabled = busy;
    }
    if (bodyEditor) {
      bodyEditor.contentEditable = busy ? 'false' : 'true';
    }
    overlay.querySelectorAll<HTMLButtonElement>('.news-rich-toolbar button').forEach((button) => {
      button.disabled = busy;
    });
  };

  const getComposerCategory = () => {
    const selectedCategory = (categorySelect?.value || '').trim();
    const newCategory = (newCategoryInput?.value || '').trim();
    return selectedCategory === '__new__' ? newCategory : selectedCategory;
  };

  const applyComposerCategory = (nextCategoryRaw: string) => {
    const nextCategory = nextCategoryRaw.trim();
    if (!nextCategory || !categorySelect) return;

    const matchingOption = Array.from(categorySelect.options).find(
      (option) => option.value.trim().toLowerCase() === nextCategory.toLowerCase()
    );

    if (matchingOption) {
      categorySelect.value = matchingOption.value;
      if (newCategoryWrap) newCategoryWrap.style.display = 'none';
      if (newCategoryInput) newCategoryInput.value = '';
      return;
    }

    categorySelect.value = '__new__';
    if (newCategoryWrap) newCategoryWrap.style.display = 'grid';
    if (newCategoryInput) newCategoryInput.value = nextCategory;
  };

  const rewriteWithChoice = async (
    input: string,
    refinementPrompt: string,
    aiModelChoice: AiModelChoice
  ) => {
    const useHostedAi = shouldUseHostedAiForChoice(aiModelChoice);
    if (useHostedAi) {
      return rewriteWithHostedAi(input, {
        refinementPrompt,
        modelChoice: aiModelChoice
      });
    }
    return rewriteWithOllama(input, { refinementPrompt });
  };

  const buildFieldProofreadPrompt = (fieldLabel: string, fieldValue: string, context: {
    title: string;
    subtitle: string;
    category: string;
    body: string;
    href: string;
  }, refinementPrompt: string) => {
    const normalizedField = fieldLabel.trim().toLowerCase();
    const fieldRule =
      normalizedField === 'main heading'
        ? 'Hard-wired default: keep the main heading short and punchy (target 6-12 words). Never include full body detail in the heading.'
        : normalizedField === 'subtitle'
          ? 'Hard-wired default: keep subtitle even shorter than heading (target 4-8 words), supporting the heading without repeating it.'
          : normalizedField === 'body'
            ? 'Hard-wired default: body can be longer; preserve facts and improve clarity, grammar, and flow.'
            : normalizedField === 'category'
              ? 'Hard-wired default: category must remain concise (1-3 words) and newsroom-appropriate.'
              : 'Hard-wired default: keep this field concise and newsroom-appropriate.';

    const refinementLine = refinementPrompt
      ? `Admin refinement instructions (highest priority, override defaults where needed): ${refinementPrompt}`
      : 'Admin refinement instructions: none provided.';

    return [
      'You are proofreading a school news article draft.',
      `Target field to rewrite: ${fieldLabel}`,
      'Rewrite only the target field while considering the full article context below.',
      'Do not move body-length content into heading/subtitle fields.',
      'Keep factual meaning and school-appropriate tone.',
      fieldRule,
      refinementLine,
      'Return only the rewritten target field text with no labels or quotes.',
      '',
      `Main heading: ${context.title}`,
      `Subtitle: ${context.subtitle}`,
      `Category: ${context.category}`,
      `Body: ${context.body}`,
      `Article link: ${context.href}`,
      '',
      `Current ${fieldLabel}: ${fieldValue}`
    ].join('\n');
  };

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
    setBodyEditorContent(editRecord.body || '');
    syncBodyInputFromEditor();
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

  if (!isEditMode) {
    setBodyEditorContent('');
    syncBodyInputFromEditor();
  }

  overlay.querySelectorAll<HTMLButtonElement>('.news-rich-toolbar button').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (!bodyEditor) return;
      bodyEditor.focus();

      const command = button.dataset.editorCmd;
      const action = button.dataset.editorAction;

      if (command) {
        document.execCommand(command, false);
        syncBodyInputFromEditor();
        return;
      }

      if (action === 'link') {
        const url = window.prompt('Enter link URL (https://...)', 'https://');
        if (!url) return;
        document.execCommand('createLink', false, url.trim());
        syncBodyInputFromEditor();
        return;
      }

      if (action === 'clear') {
        document.execCommand('removeFormat', false);
        syncBodyInputFromEditor();
      }
    });
  });

  bodyEditor?.addEventListener('input', () => {
    syncBodyInputFromEditor();
  });

  bodyEditor?.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
    syncBodyInputFromEditor();
  });

  if (aiModelSelect) {
    aiModelSelect.value = getPreferredAiModelChoice();

    const refreshOverlayProviderHint = () => {
      if (!aiProviderHint) return;
      const choice = normalizeAiModelChoice(aiModelSelect.value);
      aiProviderHint.textContent = `Provider in use: ${getAiProviderLabel(choice)}`;
    };

    refreshOverlayProviderHint();
    aiModelSelect.addEventListener('change', () => {
      setPreferredAiModelChoice(normalizeAiModelChoice(aiModelSelect.value));
      refreshOverlayProviderHint();
    });
  }

  renderCurrentImages();
  syncSelectedImagesMeta();

  categorySelect?.addEventListener('change', () => {
    if (!newCategoryWrap) return;
    newCategoryWrap.style.display = categorySelect.value === '__new__' ? 'grid' : 'none';
  });

  proofreadBtn?.addEventListener('click', async () => {
    const currentTitle = (titleInput?.value || '').trim();
    const currentBody = getBodyPlainText();
    const currentCategory = getComposerCategory();
    if (!currentTitle || !currentBody || !currentCategory) {
      showStatus('Add title, body, and category first, then run AI Proofread.');
      return;
    }

    const aiModelChoice = normalizeAiModelChoice(aiModelSelect?.value || 'auto');
    const aiRefinementPrompt = (form?.querySelector('textarea[name="aiRefinementPrompt"]') as HTMLTextAreaElement | null)?.value?.trim() || '';

    const providerMessage = shouldUseHostedAiForChoice(aiModelChoice)
      ? aiModelChoice === 'gemini'
        ? 'AI proofreading via Gemini...'
        : 'AI proofreading via production AI...'
      : `AI proofreading via local Ollama (${ollamaModel})...`;

    try {
      setComposerBusy(true, 'proofread');
      showStatus(providerMessage);

      const context = {
        title: currentTitle,
        subtitle: (subtitleInput?.value || '').trim(),
        category: currentCategory,
        body: currentBody,
        href: (hrefInput?.value || '#').trim() || '#'
      };

      const rewrittenTitle = await rewriteWithChoice(
        buildFieldProofreadPrompt('main heading', context.title, context, aiRefinementPrompt),
        aiRefinementPrompt,
        aiModelChoice
      );
      context.title = rewrittenTitle.trim() || context.title;

      const rewrittenSubtitle = await rewriteWithChoice(
        buildFieldProofreadPrompt('subtitle', context.subtitle, context, aiRefinementPrompt),
        aiRefinementPrompt,
        aiModelChoice
      );
      context.subtitle = rewrittenSubtitle.trim() || context.subtitle;

      const rewrittenCategory = await rewriteWithChoice(
        buildFieldProofreadPrompt('category', context.category, context, aiRefinementPrompt),
        aiRefinementPrompt,
        aiModelChoice
      );
      context.category = rewrittenCategory.trim() || context.category;

      const rewrittenBody = await rewriteWithChoice(
        buildFieldProofreadPrompt('body', context.body, context, aiRefinementPrompt),
        aiRefinementPrompt,
        aiModelChoice
      );
      context.body = rewrittenBody.trim() || context.body;

      if (titleInput) titleInput.value = context.title;
      if (subtitleInput) subtitleInput.value = context.subtitle;
      setBodyEditorContent(context.body);
      syncBodyInputFromEditor();
      applyComposerCategory(context.category);

      showStatus('AI proofread applied. Review, edit further if needed, then Publish.');
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'AI proofreading failed.');
    } finally {
      setComposerBusy(false, 'proofread');
    }
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

    syncBodyInputFromEditor();

    const formData = new FormData(form);
    const title = String(formData.get('title') || '').trim();
    const subtitle = String(formData.get('subtitle') || '').trim();
    const body = String(formData.get('body') || '').trim();
    const href = String(formData.get('href') || '#').trim() || '#';
    const selectedCategory = String(formData.get('category') || '').trim();
    const newCategory = String(formData.get('newCategory') || '').trim();
    const imageFiles = pendingImageFiles.filter((file) => file.size > 0);

    const categoryInput = selectedCategory === '__new__' ? newCategory : selectedCategory;
    const category = syncCategoryToCanonicalCalendarEventTypes(categoryInput);
    const bodyPlain = bodyHtmlToPlainText(body);
    if (!title || !bodyPlain || !category) {
      showStatus('Title, body, and category are required.');
      return;
    }

    const confirmed = window.confirm(
      isEditMode
        ? 'Publish these updates to the article now?'
        : 'Publish this article now?'
    );
    if (!confirmed) {
      showStatus('Publish canceled.');
      return;
    }

    try {
      setComposerBusy(true, 'publish');

      let finalTitle = title;
      let finalSubtitle = subtitle;
      let finalBody = body;

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
            setComposerBusy(false, 'publish');
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
        subtitle: finalSubtitle,
        title: finalTitle,
        body: finalBody,
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
      setComposerBusy(false, 'publish');
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
          category: isLatestNews
            ? syncCategoryToCanonicalCalendarEventTypes((categoryEditor?.value ?? readState.category).trim())
            : '',
          subtitle: isLatestNews ? (subtitleEl?.textContent ?? readState.subtitle).trim() : '',
          title: isLatestNews ? getLatestNewsTitleText() : (titleEl?.textContent ?? '').trim(),
          body: isLatestNews ? getLatestNewsBodyText() : (bodyEl?.textContent ?? '').trim(),
          image_url: formatCardImageUrls(currentImageUrls),
          href: record.clickable ? (urlEditor?.value ?? '#').trim() : '#'
        };

        if (isLatestNews && !payload.category) {
          showStatus('Category is required.');
          return;
        }

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

const wireSportsHouseManagerInline = () => {
  const matchLogSection = document.querySelector(
    '[data-editable-section="true"][data-section-type="match-log"]'
  ) as HTMLElement | null;
  const fixtureSection = document.querySelector(
    '[data-editable-section="true"][data-section-type="fixture-creator"]'
  ) as HTMLElement | null;
  if (!matchLogSection && !fixtureSection) return;

  const matchShell = matchLogSection?.querySelector('[data-match-log="true"]') as HTMLElement | null;
  const fixtureShell = fixtureSection?.querySelector('[data-fixture-creator="true"]') as HTMLElement | null;

  const HOUSE_COLORS = ['#d62828', '#1d4ed8', '#15803d', '#f59e0b', '#7c3aed'];
  const CLASSIC_HOUSE_COLOR_OPTIONS = [
    { label: 'Red', value: '#d62828' },
    { label: 'Blue', value: '#1d4ed8' },
    { label: 'Green', value: '#15803d' },
    { label: 'Yellow', value: '#f59e0b' },
    { label: 'Purple', value: '#7c3aed' },
    { label: 'Orange', value: '#ea580c' },
    { label: 'Teal', value: '#0f766e' },
    { label: 'Brown', value: '#92400e' },
    { label: 'White', value: '#ffffff' },
    { label: 'Black', value: '#111827' },
    { label: 'Grey', value: '#475569' }
  ];
  const enrollmentSectionKey = 'enrollment_manager';
  const enrollmentStorageKey = `bhanoyi.enrollmentClasses.${enrollmentSectionKey}`;
  const enrollmentStoragePrefix = 'bhanoyi.enrollmentClasses.';
  const learnerSurnameNameMigrationFlag = 'bhanoyi.migrations.learnerSurnameName.v1';

  const normalizeHouseColor = (value: unknown, fallback = '#64748b') => {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(raw) || /^#[0-9a-f]{6}$/i.test(raw)) {
      return raw.toLowerCase();
    }
    return fallback;
  };

  const resolveHouseColorLabel = (value: unknown) => {
    const normalizedColor = normalizeHouseColor(value, '#64748b');
    const exactClassicColor = CLASSIC_HOUSE_COLOR_OPTIONS.find((entry) => normalizeHouseColor(entry.value, '') === normalizedColor);
    if (exactClassicColor) {
      return exactClassicColor.label;
    }

    const shortHex = /^#([0-9a-f]{3})$/i;
    const shortMatch = normalizedColor.match(shortHex);
    if (shortMatch) {
      return `#${shortMatch[1].toUpperCase()}`;
    }
    return normalizedColor.toUpperCase();
  };

  const normalizeHouseId = (value: unknown, fallback: string) => {
    const raw = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
    return raw || fallback;
  };

  const normalizeText = (value: unknown, maxLength = 160) =>
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, maxLength);

  const parseConfig = (raw: string) => {
    try {
      const parsed = JSON.parse((raw || '{}').trim());
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const matchConfig = parseConfig(matchShell?.dataset.matchLogConfig || '{}') as {
    houseOptions?: Array<{ id: string; name: string; color?: string }>;
    leftTeamId?: string;
    rightTeamId?: string;
  };
  const fixtureConfig = parseConfig(fixtureShell?.dataset.fixtureConfig || '{}') as {
    houseOptions?: Array<{ id: string; name: string; color?: string }>;
  };

  const baseOptions =
    (Array.isArray(matchConfig.houseOptions) && matchConfig.houseOptions.length
      ? matchConfig.houseOptions
      : Array.isArray(fixtureConfig.houseOptions)
        ? fixtureConfig.houseOptions
        : [])
      .map((entry, index) => ({
        id: normalizeHouseId(entry?.id, `house_${index + 1}`),
        name: normalizeText(entry?.name, 80) || `House ${index + 1}`,
        color: normalizeHouseColor(entry?.color, HOUSE_COLORS[index % HOUSE_COLORS.length])
      }))
      .filter((entry) => Boolean(entry.id));

  if (!baseOptions.length) return;

  const sportingCodesSection = document.querySelector('[data-section-key="sporting_codes"]') as HTMLElement | null;
  const fixtureInsertAnchor = fixtureSection || matchLogSection;
  const existingHouseManagerSection = document.querySelector('[data-inline-house-manager="true"]') as HTMLElement | null;

  let houseManagerSection = existingHouseManagerSection;
  if (!houseManagerSection) {
    houseManagerSection = document.createElement('section');
    houseManagerSection.className = 'section';
    houseManagerSection.dataset.inlineHouseManager = 'true';
    houseManagerSection.innerHTML = `
      <div class="container">
        <article class="panel">
          <h2>Manage Houses</h2>
          <p class="lead">Edit house names used across Sports workflows.</p>
          <div data-inline-house-controls-host="true"></div>
        </article>
      </div>
    `;

    if (sportingCodesSection) {
      sportingCodesSection.insertAdjacentElement('beforebegin', houseManagerSection);
    } else if (fixtureInsertAnchor) {
      fixtureInsertAnchor.insertAdjacentElement('beforebegin', houseManagerSection);
    }
  }

  const controlsHost = houseManagerSection?.querySelector('[data-inline-house-controls-host="true"]');
  if (!controlsHost) return;

  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  controls.dataset.inlineMatchHouseControls = 'true';

  const existingControls = controlsHost.querySelector('[data-inline-match-house-controls="true"]');
  if (existingControls) {
    existingControls.remove();
  }
  controlsHost.appendChild(controls);

  const readState = {
    options: baseOptions,
    leftTeamId: String(matchConfig.leftTeamId || baseOptions[0]?.id || '').trim(),
    rightTeamId: String(matchConfig.rightTeamId || baseOptions[1]?.id || baseOptions[0]?.id || '').trim()
  };

  let editorWrap: HTMLElement | null = null;
  let editors: Array<{ id: string; nameInput: HTMLInputElement; colorInput: HTMLSelectElement }> = [];

  type EnrollmentStoreRoot = Record<string, unknown>;
  type EnrollmentLearnerRecord = {
    key: string;
    storageKey: string;
    grade: string;
    classLetter: string;
    memberType: 'learner' | 'teacher';
    displayName: string;
    admissionNo: string;
    gender: string;
    roleLabel: string;
    houseId: string;
    learnerRef: Record<string, unknown>;
    rootStore: EnrollmentStoreRoot;
  };

  type SportEligibility = 'all' | 'female' | 'male';
  type SportsCodeDefinition = {
    id: string;
    title: string;
    eligibility: SportEligibility;
  };
  type HouseSportsAssignments = Record<string, Record<string, string[]>>;
  type SportsRuleStore = Record<string, SportEligibility>;
  type HouseRoleAssignments = Record<
    string,
    {
      staffRoles: Record<string, string[]>;
      learnerCaptaincies: Record<string, string[]>;
    }
  >;

  type HouseSummarySnapshot = {
    learners: number;
    teachers: number;
    sportingAssigned: number;
    houseManagers: number;
    captaincies: number;
  };

  type AllocationSnapshot = {
    totalLearners: number;
    allocatedLearners: number;
    unallocatedLearners: number;
    totalTeachers: number;
    unallocatedRecords: EnrollmentLearnerRecord[];
    byHouse: Record<string, HouseSummarySnapshot>;
  };

  const sportsAssignmentStorageKey = 'bhanoyi.houseSportsAssignments';
  const sportsRuleStorageKey = 'bhanoyi.houseSportsCodeRules';
  const houseRoleStorageKey = 'bhanoyi.houseRoleAssignments';
  const baseStaffRoleOptions = [
    { id: 'house_manager', label: 'House Manager' },
    { id: 'house_secretary', label: 'House Secretary' },
    { id: 'house_discipline_coordinator', label: 'Discipline Coordinator' },
    { id: 'house_welfare_coordinator', label: 'Welfare Coordinator' },
    { id: 'house_activities_coordinator', label: 'Activities Coordinator' }
  ];

  const toSportCodeId = (value: string, index: number) => {
    const normalized = normalizeText(value, 80)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || `sport_code_${index + 1}`;
  };

  const inferSportEligibility = (title: string): SportEligibility => {
    const normalized = normalizeText(title, 100).toLowerCase();
    if (/\b(girls|ladies|female|women|netball)\b/.test(normalized)) return 'female';
    if (/\b(boys|male|men)\b/.test(normalized)) return 'male';
    return 'all';
  };

  const loadSportRuleStore = (): SportsRuleStore => {
    try {
      const raw = localStorage.getItem(sportsRuleStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const store: SportsRuleStore = {};
      Object.entries(parsed as Record<string, unknown>).forEach(([id, value]) => {
        const normalizedId = normalizeHouseId(id, '');
        if (!normalizedId) return;
        const rawValue = String(value || '').toLowerCase();
        if (rawValue === 'female' || rawValue === 'male') {
          store[normalizedId] = rawValue;
        } else {
          store[normalizedId] = 'all';
        }
      });
      return store;
    } catch {
      return {};
    }
  };

  const persistSportRuleStore = (store: SportsRuleStore) => {
    localStorage.setItem(sportsRuleStorageKey, JSON.stringify(store));
  };

  const loadSportingCodes = (): SportsCodeDefinition[] => {
    const titleSet = new Set<string>();
    const titleNodes = Array.from(
      sportingCodesSection?.querySelectorAll('[data-editable-card="true"] .card-content h3, [data-editable-card="true"] h3') || []
    );

    titleNodes.forEach((node) => {
      const title = normalizeText(node.textContent, 80);
      if (title) {
        titleSet.add(title);
      }
    });

    if (!titleSet.size) {
      ['Football', 'Netball', 'Athletics'].forEach((title) => titleSet.add(title));
    }

    const ruleStore = loadSportRuleStore();
    const normalizedRules: SportsRuleStore = { ...ruleStore };
    const codeById = new Map<string, SportsCodeDefinition>();

    Array.from(titleSet).forEach((title, index) => {
      const id = toSportCodeId(title, index);
      const existing = normalizedRules[id];
      const eligibility = existing || inferSportEligibility(title);
      normalizedRules[id] = eligibility;
      if (!codeById.has(id)) {
        codeById.set(id, { id, title, eligibility });
      }
    });

    persistSportRuleStore(normalizedRules);
    return Array.from(codeById.values()).sort((left, right) => left.title.localeCompare(right.title));
  };

  const loadHouseSportsAssignments = (): HouseSportsAssignments => {
    try {
      const raw = localStorage.getItem(sportsAssignmentStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const normalized: HouseSportsAssignments = {};
      Object.entries(parsed as Record<string, unknown>).forEach(([houseId, byLearner]) => {
        const normalizedHouseId = normalizeHouseId(houseId, '');
        if (!normalizedHouseId || !byLearner || typeof byLearner !== 'object' || Array.isArray(byLearner)) return;
        normalized[normalizedHouseId] = {};
        Object.entries(byLearner as Record<string, unknown>).forEach(([learnerKey, codeList]) => {
          if (!learnerKey) return;
          const values = Array.isArray(codeList)
            ? codeList
                .map((entry) => normalizeHouseId(entry, ''))
                .filter((entry) => Boolean(entry))
            : [];
          if (!values.length) return;
          normalized[normalizedHouseId][learnerKey] = Array.from(new Set(values));
        });
      });
      return normalized;
    } catch {
      return {};
    }
  };

  const persistHouseSportsAssignments = (store: HouseSportsAssignments) => {
    localStorage.setItem(sportsAssignmentStorageKey, JSON.stringify(store));
  };

  const loadHouseRoleAssignments = (): HouseRoleAssignments => {
    try {
      const raw = localStorage.getItem(houseRoleStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

      const normalized: HouseRoleAssignments = {};
      Object.entries(parsed as Record<string, unknown>).forEach(([houseId, value]) => {
        const normalizedHouseId = normalizeHouseId(houseId, '');
        if (!normalizedHouseId || !value || typeof value !== 'object' || Array.isArray(value)) return;

        const rawEntry = value as Record<string, unknown>;
        const rawStaff = rawEntry.staffRoles;
        const rawLearner = rawEntry.learnerCaptaincies;
        const entry = {
          staffRoles: {} as Record<string, string[]>,
          learnerCaptaincies: {} as Record<string, string[]>
        };

        if (rawStaff && typeof rawStaff === 'object' && !Array.isArray(rawStaff)) {
          Object.entries(rawStaff as Record<string, unknown>).forEach(([memberKey, roleIds]) => {
            const normalizedValues = Array.isArray(roleIds)
              ? Array.from(
                  new Set(
                    roleIds
                      .map((roleId) => normalizeHouseId(roleId, ''))
                      .filter((roleId) => Boolean(roleId))
                  )
                )
              : [];
            if (!normalizedValues.length) return;
            entry.staffRoles[memberKey] = normalizedValues;
          });
        }

        if (rawLearner && typeof rawLearner === 'object' && !Array.isArray(rawLearner)) {
          Object.entries(rawLearner as Record<string, unknown>).forEach(([memberKey, codeIds]) => {
            const normalizedValues = Array.isArray(codeIds)
              ? Array.from(
                  new Set(
                    codeIds
                      .map((codeId) => normalizeHouseId(codeId, ''))
                      .filter((codeId) => Boolean(codeId))
                  )
                )
              : [];
            if (!normalizedValues.length) return;
            entry.learnerCaptaincies[memberKey] = normalizedValues;
          });
        }

        normalized[normalizedHouseId] = entry;
      });

      return normalized;
    } catch {
      return {};
    }
  };

  const persistHouseRoleAssignments = (store: HouseRoleAssignments) => {
    localStorage.setItem(houseRoleStorageKey, JSON.stringify(store));
  };

  const houseModal = document.createElement('div');
  houseModal.className = 'inline-house-members-modal is-hidden';
  houseModal.innerHTML = `
    <div class="inline-house-members-backdrop" data-house-members-close="true"></div>
    <article class="panel inline-house-members-panel" role="dialog" aria-modal="true" aria-label="Manage house members">
      <div class="inline-house-members-head">
        <h3 data-house-members-title>Manage House</h3>
        <div class="inline-house-members-head-actions">
          <button type="button" class="btn btn-secondary" data-house-members-export="true">Export house list</button>
          <button type="button" class="btn btn-secondary" data-house-members-close="true">Close</button>
        </div>
      </div>
      <p class="inline-house-members-meta" data-house-members-meta></p>
      <section class="sports-workflow-step is-collapsed inline-house-members-section" data-house-members-section>
        <button type="button" class="sports-workflow-toggle" data-house-members-toggle aria-expanded="false">
          Search and Filter Members
        </button>
        <div class="sports-workflow-body" data-house-members-body>
          <div class="inline-house-members-filter-grid">
            <label>
              Search people
              <input type="search" placeholder="Name, admission, class" data-house-members-search />
            </label>
            <label>
              Sort by
              <select data-house-members-sort>
                <option value="surname_asc">Surname (A–Z)</option>
                <option value="surname_desc">Surname (Z–A)</option>
              </select>
            </label>
            <label>
              Gender
              <select data-house-members-gender-filter>
                <option value="all">All genders</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="unknown">Unspecified</option>
              </select>
            </label>
            <label>
              Sporting code
              <select data-house-members-sport-filter>
                <option value="all">All sporting codes</option>
                <option value="unassigned">Unassigned to sporting code</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section class="sports-workflow-step is-collapsed inline-house-members-section" data-house-members-section>
        <button type="button" class="sports-workflow-toggle" data-house-members-toggle aria-expanded="false">
          Sporting Code Rules
        </button>
        <div class="sports-workflow-body" data-house-members-body>
          <p class="inline-house-members-meta">Set who can be assigned to each code (All learners, Girls only, Boys only).</p>
          <div class="inline-house-sport-rules" data-house-sport-rules></div>
        </div>
      </section>

      <section class="sports-workflow-step is-collapsed inline-house-members-section" data-house-members-section>
        <button type="button" class="sports-workflow-toggle" data-house-members-toggle aria-expanded="false">
          House Roles and Leadership (Admin)
        </button>
        <div class="sports-workflow-body" data-house-members-body>
          <p class="inline-house-members-meta">Assign staff leadership roles and learner captains by sporting code.</p>
          <div class="inline-house-role-grid">
            <div class="inline-house-role-panel">
              <h4>Staff Roles</h4>
              <div class="inline-house-role-list" data-house-role-staff-list></div>
            </div>
            <div class="inline-house-role-panel">
              <h4>Learner Captains</h4>
              <div class="inline-house-role-list" data-house-role-learner-list></div>
            </div>
          </div>
        </div>
      </section>

      <section class="sports-workflow-step is-collapsed inline-house-members-section" data-house-members-section>
        <button type="button" class="sports-workflow-toggle" data-house-members-toggle aria-expanded="false">
          Current Members
        </button>
        <div class="sports-workflow-body" data-house-members-body>
          <div class="inline-house-members-actions inline-house-members-bulk-actions">
            <select data-house-members-bulk-sport></select>
            <button type="button" class="btn btn-primary" data-house-members-assign-sport>Assign code to selected</button>
            <button type="button" class="btn btn-secondary" data-house-members-remove-sport>Remove code from selected</button>
          </div>
          <div class="inline-house-members-list" data-house-members-list></div>
        </div>
      </section>

      <section class="sports-workflow-step is-collapsed inline-house-members-section" data-house-members-section>
        <button type="button" class="sports-workflow-toggle" data-house-members-toggle aria-expanded="false">
          Pull Selected Members to this house
        </button>
        <div class="sports-workflow-body" data-house-members-body>
          <p class="inline-house-members-meta">Select from learners in other houses or unassigned learners.</p>
          <select data-house-members-pull-select multiple size="8"></select>
          <div class="inline-house-members-actions">
            <button type="button" class="btn btn-primary" data-house-members-pull>Pull selected learners</button>
          </div>
        </div>
      </section>
    </article>
  `;
  document.body.appendChild(houseModal);

  const houseModalTitle = houseModal.querySelector('[data-house-members-title]');
  const houseModalMeta = houseModal.querySelector('[data-house-members-meta]');
  const houseModalList = houseModal.querySelector('[data-house-members-list]');
  const houseModalSearch = houseModal.querySelector('[data-house-members-search]');
  const houseModalSort = houseModal.querySelector('[data-house-members-sort]');
  const houseModalGenderFilter = houseModal.querySelector('[data-house-members-gender-filter]');
  const houseModalSportFilter = houseModal.querySelector('[data-house-members-sport-filter]');
  const houseModalRuleList = houseModal.querySelector('[data-house-sport-rules]');
  const houseRoleStaffList = houseModal.querySelector('[data-house-role-staff-list]');
  const houseRoleLearnerList = houseModal.querySelector('[data-house-role-learner-list]');
  const houseModalBulkSportSelect = houseModal.querySelector('[data-house-members-bulk-sport]');
  const houseModalAssignSportButton = houseModal.querySelector('[data-house-members-assign-sport]');
  const houseModalRemoveSportButton = houseModal.querySelector('[data-house-members-remove-sport]');
  const houseModalPullSelect = houseModal.querySelector('[data-house-members-pull-select]');
  const houseModalPullButton = houseModal.querySelector('[data-house-members-pull]');
  const houseModalExportButton = houseModal.querySelector('[data-house-members-export="true"]');
  const houseModalCloseButtons = Array.from(houseModal.querySelectorAll('[data-house-members-close="true"]'));

  if (
    !(houseModalTitle instanceof HTMLElement) ||
    !(houseModalMeta instanceof HTMLElement) ||
    !(houseModalList instanceof HTMLElement) ||
    !(houseModalSearch instanceof HTMLInputElement) ||
    !(houseModalSort instanceof HTMLSelectElement) ||
    !(houseModalGenderFilter instanceof HTMLSelectElement) ||
    !(houseModalSportFilter instanceof HTMLSelectElement) ||
    !(houseModalRuleList instanceof HTMLElement) ||
    !(houseRoleStaffList instanceof HTMLElement) ||
    !(houseRoleLearnerList instanceof HTMLElement) ||
    !(houseModalBulkSportSelect instanceof HTMLSelectElement) ||
    !(houseModalAssignSportButton instanceof HTMLButtonElement) ||
    !(houseModalRemoveSportButton instanceof HTMLButtonElement) ||
    !(houseModalPullSelect instanceof HTMLSelectElement) ||
    !(houseModalPullButton instanceof HTMLButtonElement) ||
    !(houseModalExportButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  let activeHouseId = '';
  let memberSearchValue = '';
  let memberSortValue = 'surname_asc';
  let memberGenderFilterValue = 'all';
  let memberSportFilterValue = 'all';
  let unallocatedSearchValue = '';
  let unallocatedSortValue: 'surname_asc' | 'surname_desc' | 'class_asc' | 'class_desc' = 'surname_asc';
  let selectedMemberKeys = new Set<string>();

  const unallocatedOverlay = document.createElement('div');
  unallocatedOverlay.className = 'inline-house-unallocated-modal is-hidden';
  unallocatedOverlay.innerHTML = `
    <div class="inline-house-unallocated-backdrop" data-house-unallocated-close="true"></div>
    <article class="panel inline-house-unallocated-panel" role="dialog" aria-modal="true" aria-label="Manage unallocated learners">
      <div class="inline-house-unallocated-head">
        <h3>Unallocated Learners</h3>
        <div class="inline-house-members-head-actions">
          <button type="button" class="btn btn-secondary" data-house-unallocated-auto="true">Auto-allocate randomly</button>
          <button type="button" class="btn btn-secondary" data-house-unallocated-close="true">Close</button>
        </div>
      </div>
      <p class="inline-house-members-meta" data-house-unallocated-meta></p>
      <div class="inline-house-unallocated-controls">
        <label>
          Search
          <input type="search" data-house-unallocated-search placeholder="Search by surname, name, class, or admission no." autocomplete="off" />
        </label>
        <label>
          Sort
          <select data-house-unallocated-sort>
            <option value="surname_asc">Surname (A–Z)</option>
            <option value="surname_desc">Surname (Z–A)</option>
            <option value="class_asc">Class (Low–High)</option>
            <option value="class_desc">Class (High–Low)</option>
          </select>
        </label>
      </div>
      <div class="inline-house-unallocated-list" data-house-unallocated-list></div>
    </article>
  `;
  document.body.appendChild(unallocatedOverlay);

  const unallocatedMeta = unallocatedOverlay.querySelector('[data-house-unallocated-meta]');
  const unallocatedSearchInput = unallocatedOverlay.querySelector('[data-house-unallocated-search]');
  const unallocatedSortSelect = unallocatedOverlay.querySelector('[data-house-unallocated-sort]');
  const unallocatedList = unallocatedOverlay.querySelector('[data-house-unallocated-list]');
  const unallocatedAutoButton = unallocatedOverlay.querySelector('[data-house-unallocated-auto="true"]');
  const unallocatedCloseButtons = Array.from(unallocatedOverlay.querySelectorAll('[data-house-unallocated-close="true"]'));

  if (
    !(unallocatedMeta instanceof HTMLElement) ||
    !(unallocatedSearchInput instanceof HTMLInputElement) ||
    !(unallocatedSortSelect instanceof HTMLSelectElement) ||
    !(unallocatedList instanceof HTMLElement) ||
    !(unallocatedAutoButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  const getExpandedHouseSectionMaxHeight = (body: HTMLElement) => {
    return `${Math.max(0, body.scrollHeight)}px`;
  };

  const houseSections = Array.from(houseModal.querySelectorAll('[data-house-members-section]'))
    .map((sectionNode) => {
      if (!(sectionNode instanceof HTMLElement)) return null;
      const toggle = sectionNode.querySelector('[data-house-members-toggle]');
      const body = sectionNode.querySelector('[data-house-members-body]');
      if (!(toggle instanceof HTMLButtonElement) || !(body instanceof HTMLElement)) return null;
      return { sectionNode, toggle, body };
    })
    .filter((entry): entry is { sectionNode: HTMLElement; toggle: HTMLButtonElement; body: HTMLElement } => Boolean(entry));

  const setHouseSectionExpanded = (
    entry: { sectionNode: HTMLElement; toggle: HTMLButtonElement; body: HTMLElement },
    expanded: boolean
  ) => {
    entry.sectionNode.classList.toggle('is-expanded', expanded);
    entry.sectionNode.classList.toggle('is-collapsed', !expanded);
    entry.toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (expanded) {
      entry.body.style.maxHeight = getExpandedHouseSectionMaxHeight(entry.body);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!entry.sectionNode.classList.contains('is-expanded')) return;
          entry.body.style.maxHeight = 'none';
        });
      });
      return;
    }
    entry.body.style.maxHeight = '0px';
  };

  const collapseAllHouseSections = () => {
    houseSections.forEach((entry) => {
      setHouseSectionExpanded(entry, false);
    });
  };

  const refreshExpandedHouseSectionHeights = () => {
    houseSections.forEach((entry) => {
      if (!entry.sectionNode.classList.contains('is-expanded')) return;
      if (entry.body.style.maxHeight === 'none') return;
      entry.body.style.maxHeight = getExpandedHouseSectionMaxHeight(entry.body);
    });
  };

  houseSections.forEach((entry) => {
    setHouseSectionExpanded(entry, false);
    entry.toggle.addEventListener('click', () => {
      const currentlyExpanded = entry.sectionNode.classList.contains('is-expanded');
      setHouseSectionExpanded(entry, !currentlyExpanded);
      requestAnimationFrame(() => {
        refreshExpandedHouseSectionHeights();
      });
    });
  });

  window.addEventListener('resize', () => {
    refreshExpandedHouseSectionHeights();
  });

  const normalizeEnrollmentHouseId = (value: unknown) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');

  const normalizeGender = (value: unknown) => {
    const raw = normalizeText(value, 20).toLowerCase();
    if (raw === 'm' || raw === 'male' || raw === 'boy') return 'Male';
    if (raw === 'f' || raw === 'female' || raw === 'girl') return 'Female';
    if (raw === 'o' || raw === 'other') return 'Other';
    return '';
  };

  const normalizeStaffInitials = (value: unknown) => {
    const raw = String(value || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 8);
    if (!raw) return '';
    return raw.split('').join('.') + '.';
  };

  const inferInitialsFromFirstName = (value: unknown) => {
    const raw = normalizeText(value, 80);
    if (!raw) return '';
    const letters = raw
      .split(/\s+/)
      .map((entry) => entry.charAt(0).toUpperCase())
      .filter(Boolean)
      .join('');
    if (!letters) return '';
    return letters.split('').join('.') + '.';
  };

  const resolveStaffDisplayName = (staffRef: Record<string, unknown>) => {
    const surname = normalizeText(staffRef.surname || '', 80);
    const firstName = normalizeText(staffRef.firstName || '', 80);
    const formatted = [surname, firstName].filter(Boolean).join(' ').trim();
    if (formatted) return formatted;

    const fallbackName = normalizeText(staffRef.name || '', 120);
    if (fallbackName) {
      const parts = fallbackName.split(/\s+/).filter(Boolean);
      if (parts.length <= 1) return fallbackName;
      const legacySurname = parts[parts.length - 1];
      const legacyNames = parts.slice(0, -1).join(' ');
      return [legacySurname, legacyNames].filter(Boolean).join(' ').trim();
    }

    return 'Staff';
  };

  const staffTitleTokens = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'coach', 'mx']);
  const normalizeToken = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\./g, '');
  const resolveSurnameSortKey = (displayName: unknown, options?: { staffLike?: boolean }) => {
    const normalizedName = normalizeText(displayName, 160).toLowerCase();
    if (!normalizedName) return '';
    const parts = normalizedName.split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (options?.staffLike && staffTitleTokens.has(normalizeToken(parts[0]))) {
      parts.shift();
    }
    if (!parts.length) return normalizedName;
    const surname = parts[0];
    const rest = parts.slice(1).join(' ');
    return `${surname} ${rest}`.trim();
  };

  const comparePeopleBySurname = (
    leftName: unknown,
    rightName: unknown,
    options?: { staffLeft?: boolean; staffRight?: boolean; descending?: boolean }
  ) => {
    const leftKey = resolveSurnameSortKey(leftName, { staffLike: Boolean(options?.staffLeft) });
    const rightKey = resolveSurnameSortKey(rightName, { staffLike: Boolean(options?.staffRight) });
    const comparison = leftKey.localeCompare(rightKey);
    return options?.descending ? -comparison : comparison;
  };

  const resolveLearnerDisplayName = (learnerRef: Record<string, unknown>) => {
    const surname = normalizeText(learnerRef.surname || '', 80);
    const firstName = normalizeText(learnerRef.firstName || learnerRef.givenName || '', 80);
    if (surname || firstName) {
      return [surname, firstName].filter(Boolean).join(' ').trim();
    }

    const rawName = normalizeText(learnerRef.name || '', 120);
    if (!rawName) return '';

    if (rawName.includes(',')) {
      const [surnamePart, ...rest] = rawName
        .split(',')
        .map((entry) => normalizeText(entry, 120))
        .filter(Boolean);
      const cleanRest = rest
        .join(' ')
        .split(/\s+/)
        .filter((token) => !staffTitleTokens.has(normalizeToken(token)))
        .join(' ');
      return [surnamePart, cleanRest].filter(Boolean).join(' ').trim();
    }

    const parts = rawName
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => !staffTitleTokens.has(normalizeToken(token)));
    if (parts.length <= 1) return rawName;
    const detectedSurname = parts[parts.length - 1];
    const detectedNames = parts.slice(0, -1).join(' ');
    return [detectedSurname, detectedNames].filter(Boolean).join(' ').trim();
  };

  const runLearnerSurnameNameMigration = () => {
    if (localStorage.getItem(learnerSurnameNameMigrationFlag) === 'done') {
      return;
    }

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(enrollmentStoragePrefix)) continue;

      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

        const rootStore = parsed as Record<string, unknown>;
        const classProfilesByGrade = rootStore.classProfilesByGrade;
        if (!classProfilesByGrade || typeof classProfilesByGrade !== 'object' || Array.isArray(classProfilesByGrade)) {
          continue;
        }

        Object.entries(classProfilesByGrade as Record<string, unknown>).forEach(([, gradeValue]) => {
          if (!gradeValue || typeof gradeValue !== 'object' || Array.isArray(gradeValue)) return;

          Object.entries(gradeValue as Record<string, unknown>).forEach(([, classProfile]) => {
            if (!classProfile || typeof classProfile !== 'object' || Array.isArray(classProfile)) return;
            const profileObject = classProfile as Record<string, unknown>;
            const learners = Array.isArray(profileObject.learners) ? profileObject.learners : [];

            const normalizedLearners = learners
              .map((entry) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
                const learnerRef = entry as Record<string, unknown>;
                const normalizedName = resolveLearnerDisplayName(learnerRef);
                return {
                  ...learnerRef,
                  name: normalizedName || normalizeText(learnerRef.name || '', 120)
                };
              })
              .sort((left, right) => {
                const leftName =
                  left && typeof left === 'object' && !Array.isArray(left)
                    ? resolveLearnerDisplayName(left as Record<string, unknown>)
                    : '';
                const rightName =
                  right && typeof right === 'object' && !Array.isArray(right)
                    ? resolveLearnerDisplayName(right as Record<string, unknown>)
                    : '';
                return leftName.localeCompare(rightName);
              });

            profileObject.learners = normalizedLearners;
          });
        });

        localStorage.setItem(key, JSON.stringify(parsed));
      } catch {
        continue;
      }
    }

    localStorage.setItem(learnerSurnameNameMigrationFlag, 'done');
  };

  runLearnerSurnameNameMigration();

  const collectEnrollmentLearners = (): EnrollmentLearnerRecord[] => {
    const records: EnrollmentLearnerRecord[] = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(enrollmentStoragePrefix)) continue;

      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

        const rootStore = parsed as EnrollmentStoreRoot;
        const classProfilesByGrade = rootStore.classProfilesByGrade;
        if (!classProfilesByGrade || typeof classProfilesByGrade !== 'object' || Array.isArray(classProfilesByGrade)) {
          continue;
        }

        Object.entries(classProfilesByGrade as Record<string, unknown>).forEach(([grade, gradeValue]) => {
          if (!gradeValue || typeof gradeValue !== 'object' || Array.isArray(gradeValue)) return;

          Object.entries(gradeValue as Record<string, unknown>).forEach(([classLetter, classProfile]) => {
            if (!classProfile || typeof classProfile !== 'object' || Array.isArray(classProfile)) return;
            const profileObject = classProfile as Record<string, unknown>;
            const learners = profileObject.learners;
            if (!Array.isArray(learners)) return;

            learners.forEach((learnerEntry, learnerIndex) => {
              if (!learnerEntry || typeof learnerEntry !== 'object' || Array.isArray(learnerEntry)) return;
              const learnerRef = learnerEntry as Record<string, unknown>;
              const displayName = resolveLearnerDisplayName(learnerRef);
              if (!displayName) return;

              const admissionNo = normalizeText(learnerRef.admissionNo || learnerRef.admission, 40);
              const gender = normalizeGender(learnerRef.gender || learnerRef.sex);
              const houseId = normalizeEnrollmentHouseId(learnerRef.houseId || learnerRef.house);
              records.push({
                key: `${key}|${grade}|${classLetter}|${learnerIndex}`,
                storageKey: key,
                grade: normalizeText(grade, 4),
                classLetter: normalizeText(classLetter, 2).toUpperCase(),
                memberType: 'learner',
                displayName,
                admissionNo,
                gender,
                roleLabel: 'Learner',
                houseId,
                learnerRef,
                rootStore
              });
            });
          });
        });

        const staffMembers = Array.isArray(rootStore.staffMembers) ? rootStore.staffMembers : [];
        staffMembers.forEach((staffEntry, staffIndex) => {
          if (!staffEntry || typeof staffEntry !== 'object' || Array.isArray(staffEntry)) return;
          const staffRef = staffEntry as Record<string, unknown>;
          const displayName = resolveStaffDisplayName(staffRef);
          if (!displayName) return;

          const postLevel = normalizeText(staffRef.postLevel, 10).toUpperCase();
          const rank = normalizeText(staffRef.rank, 60);
          const roleLabel = postLevel || rank ? `Teacher · ${[postLevel, rank].filter(Boolean).join(' ')}` : 'Teacher';
          const staffNumber = normalizeText(staffRef.staffNumber || '', 40);
          const gender = normalizeGender(staffRef.gender || '');
          const houseId = normalizeEnrollmentHouseId(staffRef.houseId || staffRef.house);

          records.push({
            key: `${key}|staff|${staffIndex}`,
            storageKey: key,
            grade: '',
            classLetter: '',
            memberType: 'teacher',
            displayName,
            admissionNo: staffNumber,
            gender,
            roleLabel,
            houseId,
            learnerRef: staffRef,
            rootStore
          });
        });
      } catch {
        // ignore invalid enrollment cache entry
      }
    }

    return records;
  };

  const persistEnrollmentRecords = (records: EnrollmentLearnerRecord[]) => {
    const touchedKeys = new Set<string>();
    records.forEach((record) => {
      touchedKeys.add(record.storageKey);
    });

    touchedKeys.forEach((storageKey) => {
      const firstRecord = records.find((record) => record.storageKey === storageKey);
      if (!firstRecord) return;
      localStorage.setItem(storageKey, JSON.stringify(firstRecord.rootStore));
      if (storageKey === enrollmentStorageKey) {
        void persistEnrollmentStore(enrollmentSectionKey, enrollmentStorageKey, firstRecord.rootStore);
      }
    });
  };

  const buildAllocationSnapshot = (): AllocationSnapshot => {
    const records = collectEnrollmentLearners();
    const learners = records.filter((record) => record.memberType === 'learner');
    const teachers = records.filter((record) => record.memberType === 'teacher');
    const allowedHouseIds = new Set(readState.options.map((entry) => entry.id));
    const unallocatedRecords = learners.filter((record) => !record.houseId || !allowedHouseIds.has(record.houseId));
    const assignmentStore = loadHouseSportsAssignments();
    const roleStore = loadHouseRoleAssignments();

    const byHouse = readState.options.reduce<Record<string, HouseSummarySnapshot>>((accumulator, house) => {
      const houseLearners = learners.filter((record) => record.houseId === house.id);
      const houseTeachers = teachers.filter((record) => record.houseId === house.id);
      const houseAssignments = assignmentStore[house.id] || {};
      const roleEntry = roleStore[house.id] || { staffRoles: {}, learnerCaptaincies: {} };
      const sportingAssigned = houseLearners.filter((record) => Array.isArray(houseAssignments[record.key]) && houseAssignments[record.key].length).length;
      const houseManagers = Object.values(roleEntry.staffRoles).filter((roles) => Array.isArray(roles) && roles.includes('house_manager')).length;
      const captaincies = Object.keys(roleEntry.learnerCaptaincies).length;

      accumulator[house.id] = {
        learners: houseLearners.length,
        teachers: houseTeachers.length,
        sportingAssigned,
        houseManagers,
        captaincies
      };
      return accumulator;
    }, {});

    return {
      totalLearners: learners.length,
      allocatedLearners: learners.length - unallocatedRecords.length,
      unallocatedLearners: unallocatedRecords.length,
      totalTeachers: teachers.length,
      unallocatedRecords,
      byHouse
    };
  };

  const renderHouseEditorSummaries = () => {
    if (!editors.length) return;
    const snapshot = buildAllocationSnapshot();

    editors.forEach((entry) => {
      const house = readState.options.find((option) => option.id === entry.id);
      const metrics = snapshot.byHouse[entry.id] || {
        learners: 0,
        teachers: 0,
        sportingAssigned: 0,
        houseManagers: 0,
        captaincies: 0
      };
      const color = normalizeHouseColor(entry.colorInput.value || house?.color || '', '#64748b');
      const colorLabel = resolveHouseColorLabel(color);
      entry.summaryNode.innerHTML = `
        <p class="inline-house-summary-title">
          <span class="enrollment-house-avatar" style="--house-color:${color};"></span>
          <strong>${escapeHtmlText(normalizeText(entry.nameInput.value || house?.name || '', 80) || 'House')}</strong>
        </p>
        <p class="inline-house-summary-meta">Colour: ${escapeHtmlText(colorLabel)}</p>
        <p class="inline-house-summary-meta">Learners: ${metrics.learners} · Teachers: ${metrics.teachers}</p>
        <p class="inline-house-summary-meta">Sporting assigned: ${metrics.sportingAssigned} · Captains: ${metrics.captaincies}</p>
        <p class="inline-house-summary-meta">House managers: ${metrics.houseManagers}</p>
      `;
    });
  };

  const renderOverallAllocationStats = () => {
    if (!overallStatsNode) return;
    const snapshot = buildAllocationSnapshot();
    overallStatsNode.innerHTML = `
      <span class="inline-house-stat-chip">Allocated learners: <strong>${snapshot.allocatedLearners}</strong></span>
      <button type="button" class="inline-house-stat-chip inline-house-stat-chip-action" data-house-open-unallocated="true">Unallocated learners: <strong>${snapshot.unallocatedLearners}</strong></button>
      <span class="inline-house-stat-chip">Total learners: <strong>${snapshot.totalLearners}</strong></span>
      <span class="inline-house-stat-chip">Total teachers: <strong>${snapshot.totalTeachers}</strong></span>
    `;

    const openUnallocatedButton = overallStatsNode.querySelector('[data-house-open-unallocated="true"]');
    if (openUnallocatedButton instanceof HTMLButtonElement) {
      openUnallocatedButton.addEventListener('click', () => {
        renderUnallocatedOverlay();
        unallocatedOverlay.classList.remove('is-hidden');
      });
    }
  };

  const closeUnallocatedOverlay = () => {
    unallocatedOverlay.classList.add('is-hidden');
  };

  const resolveClassLabel = (record: EnrollmentLearnerRecord) =>
    record.grade ? `Grade ${record.grade}${record.classLetter || ''}` : 'Class not set';

  const resolveGradeRank = (record: EnrollmentLearnerRecord) => {
    const normalized = normalizeText(record.grade, 20);
    const numeric = Number.parseInt(normalized.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
  };

  const resolveClassRank = (record: EnrollmentLearnerRecord) => {
    const gradeRank = resolveGradeRank(record);
    const letterRank = normalizeText(record.classLetter, 20)
      .toUpperCase()
      .charCodeAt(0);
    const safeLetterRank = Number.isFinite(letterRank) ? letterRank : Number.POSITIVE_INFINITY;
    return { gradeRank, letterRank: safeLetterRank };
  };

  const getFilteredAndSortedUnallocatedRecords = (records: EnrollmentLearnerRecord[]) => {
    const normalizedSearch = unallocatedSearchValue.trim().toLowerCase();
    const filtered = records.filter((record) => {
      if (!normalizedSearch) return true;
      const classLabel = resolveClassLabel(record);
      const haystack = [record.displayName, record.admissionNo, classLabel, record.gender]
        .map((value) => normalizeText(value, 160).toLowerCase())
        .join(' ');
      return haystack.includes(normalizedSearch);
    });

    filtered.sort((left, right) => {
      if (unallocatedSortValue === 'surname_desc') {
        return comparePeopleBySurname(left.displayName, right.displayName, { descending: true });
      }
      if (unallocatedSortValue === 'class_asc' || unallocatedSortValue === 'class_desc') {
        const leftRank = resolveClassRank(left);
        const rightRank = resolveClassRank(right);
        const gradeDiff = leftRank.gradeRank - rightRank.gradeRank;
        if (gradeDiff !== 0) {
          return unallocatedSortValue === 'class_desc' ? -gradeDiff : gradeDiff;
        }
        const letterDiff = leftRank.letterRank - rightRank.letterRank;
        if (letterDiff !== 0) {
          return unallocatedSortValue === 'class_desc' ? -letterDiff : letterDiff;
        }
      }
      return comparePeopleBySurname(left.displayName, right.displayName, {
        descending: unallocatedSortValue === 'class_desc' ? false : unallocatedSortValue === 'surname_desc'
      });
    });

    return filtered;
  };

  const renderUnallocatedOverlay = () => {
    const snapshot = buildAllocationSnapshot();
    if (unallocatedSearchInput.value !== unallocatedSearchValue) {
      unallocatedSearchInput.value = unallocatedSearchValue;
    }
    if (unallocatedSortSelect.value !== unallocatedSortValue) {
      unallocatedSortSelect.value = unallocatedSortValue;
    }
    const visibleRecords = getFilteredAndSortedUnallocatedRecords(snapshot.unallocatedRecords);
    unallocatedMeta.textContent = `${snapshot.unallocatedLearners} learner${snapshot.unallocatedLearners === 1 ? '' : 's'} currently have no house allocation.${
      visibleRecords.length !== snapshot.unallocatedRecords.length
        ? ` Showing ${visibleRecords.length} result${visibleRecords.length === 1 ? '' : 's'}.`
        : ''
    }`;

    if (!snapshot.unallocatedRecords.length) {
      unallocatedList.innerHTML = '<p class="inline-house-members-empty">All learners are already allocated to houses.</p>';
      return;
    }

    if (!visibleRecords.length) {
      unallocatedList.innerHTML = '<p class="inline-house-members-empty">No unallocated learners match your search.</p>';
      return;
    }

    const rows = visibleRecords
      .map((record) => {
        const classLabel = resolveClassLabel(record);
        return `
          <div class="inline-house-unallocated-item" data-house-unallocated-key="${escapeHtmlAttribute(record.key)}">
            <div class="inline-house-unallocated-main">
              <p class="inline-house-unallocated-name">${escapeHtmlText(record.displayName)}</p>
              <p class="inline-house-unallocated-meta">${escapeHtmlText(classLabel)}${record.admissionNo ? ` · Adm: ${escapeHtmlText(record.admissionNo)}` : ''}${record.gender ? ` · ${escapeHtmlText(record.gender)}` : ''}</p>
            </div>
            <div class="inline-house-unallocated-actions">
              <select data-house-unallocated-target="${escapeHtmlAttribute(record.key)}">
                ${readState.options
                  .map((house) => `<option value="${escapeHtmlAttribute(house.id)}">${escapeHtmlText(house.name)}</option>`)
                  .join('')}
              </select>
              <button type="button" class="btn btn-primary" data-house-unallocated-assign="${escapeHtmlAttribute(record.key)}">Allocate</button>
            </div>
          </div>
        `;
      })
      .join('');

    unallocatedList.innerHTML = rows;
  };

  unallocatedCloseButtons.forEach((button) => {
    button.addEventListener('click', closeUnallocatedOverlay);
  });

  unallocatedSearchInput.addEventListener('input', () => {
    unallocatedSearchValue = unallocatedSearchInput.value;
    renderUnallocatedOverlay();
  });

  unallocatedSortSelect.addEventListener('change', () => {
    const nextValue = unallocatedSortSelect.value;
    if (nextValue === 'surname_desc' || nextValue === 'class_asc' || nextValue === 'class_desc') {
      unallocatedSortValue = nextValue;
    } else {
      unallocatedSortValue = 'surname_asc';
    }
    renderUnallocatedOverlay();
  });

  unallocatedAutoButton.addEventListener('click', () => {
    const snapshot = buildAllocationSnapshot();
    if (!snapshot.unallocatedRecords.length) {
      showStatus('All learners are already allocated.');
      return;
    }

    const candidateHouses = readState.options.map((entry) => entry.id).filter(Boolean);
    if (!candidateHouses.length) {
      showStatus('No house options available for allocation.');
      return;
    }

    snapshot.unallocatedRecords.forEach((record) => {
      const randomHouseId = candidateHouses[Math.floor(Math.random() * candidateHouses.length)];
      record.learnerRef.houseId = randomHouseId;
    });
    persistEnrollmentRecords(snapshot.unallocatedRecords);
    renderUnallocatedOverlay();
    renderHouseEditorSummaries();
    renderOverallAllocationStats();
    renderHouseMembersModal();
    showStatus(`Randomly allocated ${snapshot.unallocatedRecords.length} learner${snapshot.unallocatedRecords.length === 1 ? '' : 's'}.`);
  });

  unallocatedList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const assignButton = target.closest('[data-house-unallocated-assign]') as HTMLButtonElement | null;
    if (!assignButton) return;

    const memberKey = String(assignButton.dataset.houseUnallocatedAssign || '').trim();
    if (!memberKey) return;

    const row = assignButton.closest('[data-house-unallocated-key]') as HTMLElement | null;
    if (!row) return;
    const selector = row.querySelector('[data-house-unallocated-target]') as HTMLSelectElement | null;
    if (!(selector instanceof HTMLSelectElement)) return;
    const houseId = normalizeHouseId(selector.value, '');
    if (!houseId) return;

    const targetRecord = collectEnrollmentLearners().find((record) => record.key === memberKey && record.memberType === 'learner');
    if (!targetRecord) return;
    targetRecord.learnerRef.houseId = houseId;
    persistEnrollmentRecords([targetRecord]);
    renderUnallocatedOverlay();
    renderHouseEditorSummaries();
    renderOverallAllocationStats();
    renderHouseMembersModal();
    const houseName = readState.options.find((entry) => entry.id === houseId)?.name || 'selected house';
    showStatus(`${targetRecord.displayName} allocated to ${houseName}.`);
  });

  const closeHouseModal = () => {
    houseModal.classList.add('is-hidden');
    document.body.classList.remove('inline-house-members-open');
    activeHouseId = '';
    selectedMemberKeys = new Set();
  };

  houseModalCloseButtons.forEach((button) => {
    button.addEventListener('click', closeHouseModal);
  });

  const learnerMatchesEligibility = (record: EnrollmentLearnerRecord, eligibility: SportEligibility) => {
    if (eligibility === 'all') return true;
    const gender = normalizeGender(record.gender).toLowerCase();
    if (eligibility === 'female') return gender === 'female';
    if (eligibility === 'male') return gender === 'male';
    return true;
  };

  const normalizeHouseAssignmentsForMembers = (
    houseAssignments: Record<string, string[]>,
    validMemberKeys: Set<string>,
    validSportCodeIds: Set<string>
  ) => {
    let changed = false;
    const normalized: Record<string, string[]> = {};
    Object.entries(houseAssignments).forEach(([learnerKey, codeIds]) => {
      if (!validMemberKeys.has(learnerKey)) {
        changed = true;
        return;
      }

      const normalizedCodes = Array.from(
        new Set(
          (Array.isArray(codeIds) ? codeIds : [])
            .map((codeId) => normalizeHouseId(codeId, ''))
            .filter((codeId) => Boolean(codeId) && validSportCodeIds.has(codeId))
        )
      );

      if (!normalizedCodes.length) {
        changed = true;
        return;
      }

      normalized[learnerKey] = normalizedCodes;
      if (normalizedCodes.length !== (Array.isArray(codeIds) ? codeIds.length : 0)) {
        changed = true;
      }
    });
    return { normalized, changed };
  };

  const renderHouseMembersModal = () => {
    if (!activeHouseId) return;
    const activeHouse = readState.options.find((entry) => entry.id === activeHouseId);
    if (!activeHouse) {
      closeHouseModal();
      return;
    }

    const sportCodes = loadSportingCodes();
    const sportCodeById = new Map(sportCodes.map((entry) => [entry.id, entry]));
    const validSportCodeIds = new Set(sportCodes.map((entry) => entry.id));

    const enrollmentRecords = collectEnrollmentLearners();
    const members = enrollmentRecords.filter((record) => record.houseId === activeHouse.id);
    const available = enrollmentRecords.filter((record) => record.memberType === 'learner' && record.houseId !== activeHouse.id);
    const houseLabelById = new Map(readState.options.map((entry) => [entry.id, entry.name]));
    const learnerMembers = members.filter((record) => record.memberType === 'learner');
    const validMemberKeys = new Set(learnerMembers.map((record) => record.key));

    const assignmentStore = loadHouseSportsAssignments();
    const houseAssignmentsRaw = assignmentStore[activeHouse.id] || {};
    const { normalized: houseAssignments, changed: assignmentChanged } = normalizeHouseAssignmentsForMembers(
      houseAssignmentsRaw,
      validMemberKeys,
      validSportCodeIds
    );
    assignmentStore[activeHouse.id] = houseAssignments;
    if (assignmentChanged) {
      persistHouseSportsAssignments(assignmentStore);
    }

    const filteredSelected = Array.from(selectedMemberKeys).filter((key) => validMemberKeys.has(key));
    selectedMemberKeys = new Set(filteredSelected);
    const canManageHouseRoles = document.body.classList.contains('inline-admin-active');

    const learnerCount = learnerMembers.length;
    const teacherCount = members.filter((record) => record.memberType === 'teacher').length;

    houseModalTitle.textContent = `Manage ${activeHouse.name}`;
    houseModalMeta.textContent = `${learnerCount} learner${learnerCount === 1 ? '' : 's'}, ${teacherCount} teacher${teacherCount === 1 ? '' : 's'} in this house. ${selectedMemberKeys.size} selected.`;

    houseModalSearch.value = memberSearchValue;
    houseModalSort.value = memberSortValue;
    houseModalGenderFilter.value = memberGenderFilterValue;

    const selectedSportFilter = memberSportFilterValue;
    houseModalSportFilter.innerHTML = '';
    [
      { value: 'all', label: 'All sporting codes' },
      { value: 'unassigned', label: 'Unassigned to sporting code' },
      ...sportCodes.map((entry) => ({ value: entry.id, label: entry.title }))
    ].forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      houseModalSportFilter.appendChild(option);
    });
    houseModalSportFilter.value =
      Array.from(houseModalSportFilter.options).some((entry) => entry.value === selectedSportFilter)
        ? selectedSportFilter
        : 'all';
    memberSportFilterValue = houseModalSportFilter.value;

    houseModalBulkSportSelect.innerHTML = '';
    sportCodes.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.title;
      houseModalBulkSportSelect.appendChild(option);
    });
    houseModalBulkSportSelect.disabled = !sportCodes.length;
    houseModalAssignSportButton.disabled = !sportCodes.length;
    houseModalRemoveSportButton.disabled = !sportCodes.length;

    houseModalRuleList.innerHTML = '';
    const ruleStore = loadSportRuleStore();
    sportCodes.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'inline-house-sport-rule-item';

      const title = document.createElement('p');
      title.className = 'inline-house-sport-rule-title';
      title.textContent = entry.title;

      const select = document.createElement('select');
      select.innerHTML = `
        <option value="all">All learners</option>
        <option value="female">Girls only</option>
        <option value="male">Boys only</option>
      `;
      const selectedRule = ruleStore[entry.id] || entry.eligibility;
      select.value = selectedRule;
      select.addEventListener('change', () => {
        const nextValue = select.value === 'female' || select.value === 'male' ? select.value : 'all';
        const nextStore = loadSportRuleStore();
        nextStore[entry.id] = nextValue;
        persistSportRuleStore(nextStore);
        renderHouseMembersModal();
      });

      row.appendChild(title);
      row.appendChild(select);
      houseModalRuleList.appendChild(row);
    });

    const staffRoleOptions = [
      ...baseStaffRoleOptions,
      ...sportCodes.map((entry) => ({ id: `coach_${entry.id}`, label: `Coach (${entry.title})` }))
    ];
    const roleStore = loadHouseRoleAssignments();
    const houseRoleEntry = roleStore[activeHouse.id] || { staffRoles: {}, learnerCaptaincies: {} };

    const normalizedSearch = memberSearchValue.trim().toLowerCase();
    const descendingSort = memberSortValue === 'surname_desc';
    const matchesSearch = (record: EnrollmentLearnerRecord) => {
      if (!normalizedSearch) return true;
      const classLabel = record.grade ? `grade ${record.grade}${record.classLetter || ''}` : '';
      const haystack = [record.displayName, record.admissionNo, record.gender, classLabel]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    };

    houseRoleStaffList.innerHTML = '';
    const staffMembers = members
      .filter((record) => record.memberType === 'teacher')
      .filter(matchesSearch)
      .sort((left, right) =>
        comparePeopleBySurname(left.displayName, right.displayName, {
          staffLeft: true,
          staffRight: true,
          descending: descendingSort
        })
      );
    if (!staffMembers.length) {
      const empty = document.createElement('p');
      empty.className = 'inline-house-members-empty';
      empty.textContent = 'No staff members assigned to this house yet.';
      houseRoleStaffList.appendChild(empty);
    } else {
      staffMembers.forEach((record) => {
        const row = document.createElement('div');
        row.className = 'inline-house-role-item';

        const title = document.createElement('p');
        title.className = 'inline-house-role-item-title';
        title.textContent = record.displayName;

        const select = document.createElement('select');
        select.multiple = true;
        select.size = Math.min(8, Math.max(4, staffRoleOptions.length));
        const selectedRoles = new Set(Array.isArray(houseRoleEntry.staffRoles[record.key]) ? houseRoleEntry.staffRoles[record.key] : []);
        staffRoleOptions.forEach((optionValue) => {
          const option = document.createElement('option');
          option.value = optionValue.id;
          option.textContent = optionValue.label;
          option.selected = selectedRoles.has(optionValue.id);
          select.appendChild(option);
        });
        select.disabled = !canManageHouseRoles;

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'btn btn-secondary';
        saveButton.textContent = 'Save roles';
        saveButton.disabled = !canManageHouseRoles;
        saveButton.addEventListener('click', () => {
          if (!canManageHouseRoles) return;
          const selected = Array.from(select.selectedOptions)
            .map((entry) => normalizeHouseId(entry.value, ''))
            .filter((entry) => Boolean(entry));
          const nextStore = loadHouseRoleAssignments();
          const nextEntry = nextStore[activeHouse.id] || { staffRoles: {}, learnerCaptaincies: {} };
          if (selected.length) {
            nextEntry.staffRoles[record.key] = Array.from(new Set(selected));
          } else {
            delete nextEntry.staffRoles[record.key];
          }
          nextStore[activeHouse.id] = nextEntry;
          persistHouseRoleAssignments(nextStore);
          showStatus(`Updated staff roles for ${record.displayName}.`);
          renderHouseMembersModal();
        });

        const actions = document.createElement('div');
        actions.className = 'inline-house-members-actions';
        actions.appendChild(saveButton);

        row.appendChild(title);
        row.appendChild(select);
        row.appendChild(actions);
        houseRoleStaffList.appendChild(row);
      });
    }

    houseRoleLearnerList.innerHTML = '';
    const searchableLearnerMembers = learnerMembers
      .filter(matchesSearch)
      .sort((left, right) => comparePeopleBySurname(left.displayName, right.displayName, { descending: descendingSort }));
    if (!searchableLearnerMembers.length) {
      const empty = document.createElement('p');
      empty.className = 'inline-house-members-empty';
      empty.textContent = 'No learners assigned to this house yet.';
      houseRoleLearnerList.appendChild(empty);
    } else {
      searchableLearnerMembers.forEach((record) => {
        const row = document.createElement('div');
        row.className = 'inline-house-role-item';

        const title = document.createElement('p');
        title.className = 'inline-house-role-item-title';
        title.textContent = record.displayName;

        const select = document.createElement('select');
        select.multiple = true;
        select.size = Math.min(8, Math.max(4, sportCodes.length || 4));
        const selectedCodes = new Set(
          Array.isArray(houseRoleEntry.learnerCaptaincies[record.key]) ? houseRoleEntry.learnerCaptaincies[record.key] : []
        );
        sportCodes.forEach((entry) => {
          const option = document.createElement('option');
          option.value = entry.id;
          option.textContent = `Captain (${entry.title})`;
          option.selected = selectedCodes.has(entry.id);
          select.appendChild(option);
        });
        select.disabled = !canManageHouseRoles || !sportCodes.length;

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'btn btn-secondary';
        saveButton.textContent = 'Save captaincies';
        saveButton.disabled = !canManageHouseRoles || !sportCodes.length;
        saveButton.addEventListener('click', () => {
          if (!canManageHouseRoles) return;
          const selected = Array.from(select.selectedOptions)
            .map((entry) => normalizeHouseId(entry.value, ''))
            .filter((entry) => Boolean(entry));
          const nextStore = loadHouseRoleAssignments();
          const nextEntry = nextStore[activeHouse.id] || { staffRoles: {}, learnerCaptaincies: {} };
          if (selected.length) {
            nextEntry.learnerCaptaincies[record.key] = Array.from(new Set(selected));
          } else {
            delete nextEntry.learnerCaptaincies[record.key];
          }
          nextStore[activeHouse.id] = nextEntry;
          persistHouseRoleAssignments(nextStore);
          showStatus(`Updated captaincies for ${record.displayName}.`);
          renderHouseMembersModal();
        });

        const actions = document.createElement('div');
        actions.className = 'inline-house-members-actions';
        actions.appendChild(saveButton);

        row.appendChild(title);
        row.appendChild(select);
        row.appendChild(actions);
        houseRoleLearnerList.appendChild(row);
      });
    }

    const filteredMembers = members
      .map((record) => {
        const assignedCodeIds = Array.isArray(houseAssignments[record.key]) ? houseAssignments[record.key] : [];
        const assignedCodes = assignedCodeIds
          .map((codeId) => sportCodeById.get(codeId))
          .filter((entry): entry is SportsCodeDefinition => Boolean(entry));
        return {
          record,
          assignedCodes
        };
      })
      .filter(({ record, assignedCodes }) => {
        if (normalizedSearch) {
          const classLabel = record.grade ? `grade ${record.grade}${record.classLetter || ''}` : '';
          const haystack = [record.displayName, record.admissionNo, record.gender, classLabel]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(normalizedSearch)) {
            return false;
          }
        }

        if (memberGenderFilterValue !== 'all') {
          const normalizedGender = normalizeGender(record.gender).toLowerCase();
          if (memberGenderFilterValue === 'unknown') {
            if (normalizedGender) {
              return false;
            }
          } else if (normalizedGender !== memberGenderFilterValue) {
            return false;
          }
        }

        if (memberSportFilterValue === 'unassigned') {
          return record.memberType === 'teacher' ? false : assignedCodes.length === 0;
        }

        if (memberSportFilterValue !== 'all') {
          return record.memberType === 'teacher' ? false : assignedCodes.some((entry) => entry.id === memberSportFilterValue);
        }

        return true;
      })
      .sort((left, right) => {
        return comparePeopleBySurname(left.record.displayName, right.record.displayName, {
          staffLeft: left.record.memberType === 'teacher',
          staffRight: right.record.memberType === 'teacher',
          descending: descendingSort
        });
      });

    houseModalList.innerHTML = '';
    if (!members.length) {
      const empty = document.createElement('p');
      empty.className = 'inline-house-members-empty';
      empty.textContent = 'No learners or teachers are currently assigned to this house.';
      houseModalList.appendChild(empty);
    } else if (!filteredMembers.length) {
      const empty = document.createElement('p');
      empty.className = 'inline-house-members-empty';
      empty.textContent = 'No members match the current search/filter criteria.';
      houseModalList.appendChild(empty);
    } else {
      filteredMembers.forEach(({ record, assignedCodes }) => {
          const item = document.createElement('div');
          item.className = 'inline-house-member-item';
          item.classList.toggle('inline-house-member-teacher-row', record.memberType === 'teacher');

          const selectToggle = document.createElement('input');
          selectToggle.type = 'checkbox';
          selectToggle.checked = selectedMemberKeys.has(record.key);
          if (record.memberType !== 'learner') {
            selectToggle.disabled = true;
            selectToggle.title = 'Teacher entries are not part of learner sporting-code batches.';
          }
          selectToggle.addEventListener('change', () => {
            if (record.memberType !== 'learner') {
              selectToggle.checked = false;
              return;
            }
            if (selectToggle.checked) {
              selectedMemberKeys.add(record.key);
            } else {
              selectedMemberKeys.delete(record.key);
            }
            houseModalMeta.textContent = `${learnerCount} learner${learnerCount === 1 ? '' : 's'}, ${teacherCount} teacher${teacherCount === 1 ? '' : 's'} in this house. ${selectedMemberKeys.size} selected.`;
          });

          const summary = document.createElement('p');
          summary.className = 'inline-house-member-summary';
          const classLabel = record.grade ? `Grade ${record.grade}${record.classLetter ? record.classLetter : ''}` : 'Class not set';
          const details = [record.roleLabel || (record.memberType === 'teacher' ? 'Teacher' : 'Learner'), classLabel];
          if (record.admissionNo) details.push(`Adm: ${record.admissionNo}`);
          if (record.gender) details.push(record.gender);
          summary.textContent = `${record.displayName} · ${details.join(' · ')}`;

          const typeBadge = document.createElement('span');
          typeBadge.className = `inline-house-member-type-badge ${record.memberType === 'teacher' ? 'is-teacher' : 'is-learner'}`;
          typeBadge.textContent = record.memberType === 'teacher' ? 'Staff' : 'Learner';

          const assignmentWrap = document.createElement('div');
          assignmentWrap.className = 'inline-house-member-codes';

          if (record.memberType === 'teacher') {
            const teacherTag = document.createElement('span');
            teacherTag.className = 'inline-house-member-code empty';
            teacherTag.textContent = 'Teacher member';
            assignmentWrap.appendChild(teacherTag);
          } else if (!assignedCodes.length) {
            const emptyCode = document.createElement('span');
            emptyCode.className = 'inline-house-member-code empty';
            emptyCode.textContent = 'No sporting code yet';
            assignmentWrap.appendChild(emptyCode);
          } else {
            assignedCodes.forEach((code) => {
              const codeTag = document.createElement('button');
              codeTag.type = 'button';
              codeTag.className = 'inline-house-member-code';
              codeTag.textContent = `Remove ${code.title}`;
              codeTag.addEventListener('click', () => {
                const currentCodes = Array.isArray(houseAssignments[record.key]) ? houseAssignments[record.key] : [];
                const nextCodes = currentCodes.filter((entry) => entry !== code.id);
                if (nextCodes.length) {
                  houseAssignments[record.key] = nextCodes;
                } else {
                  delete houseAssignments[record.key];
                }
                assignmentStore[activeHouse.id] = houseAssignments;
                persistHouseSportsAssignments(assignmentStore);
                renderHouseMembersModal();
                showStatus(`${record.displayName} removed from ${code.title}.`);
              });
              assignmentWrap.appendChild(codeTag);
            });
          }

          const quickAssign = document.createElement('div');
          quickAssign.className = 'inline-house-member-assign';
          if (record.memberType === 'learner') {
            const quickSelect = document.createElement('select');
            sportCodes.forEach((code) => {
              const option = document.createElement('option');
              option.value = code.id;
              option.textContent = code.title;
              quickSelect.appendChild(option);
            });

            const quickButton = document.createElement('button');
            quickButton.type = 'button';
            quickButton.className = 'btn btn-secondary';
            quickButton.textContent = 'Assign';
            quickButton.disabled = !sportCodes.length;
            quickButton.addEventListener('click', () => {
              const selectedCode = sportCodeById.get(quickSelect.value);
              if (!selectedCode) return;
              if (!learnerMatchesEligibility(record, selectedCode.eligibility)) {
                showStatus(`${record.displayName} does not meet ${selectedCode.title} eligibility.`);
                return;
              }
              const currentCodes = new Set(Array.isArray(houseAssignments[record.key]) ? houseAssignments[record.key] : []);
              currentCodes.add(selectedCode.id);
              houseAssignments[record.key] = Array.from(currentCodes);
              assignmentStore[activeHouse.id] = houseAssignments;
              persistHouseSportsAssignments(assignmentStore);
              renderHouseMembersModal();
              showStatus(`${record.displayName} assigned to ${selectedCode.title}.`);
            });

            quickAssign.appendChild(quickSelect);
            quickAssign.appendChild(quickButton);
          }

          const memberMain = document.createElement('div');
          memberMain.className = 'inline-house-member-main';
          memberMain.appendChild(typeBadge);
          memberMain.appendChild(summary);
          memberMain.appendChild(assignmentWrap);
          memberMain.appendChild(quickAssign);

          const removeButton = document.createElement('button');
          removeButton.type = 'button';
          removeButton.className = 'btn btn-secondary';
          removeButton.textContent = 'Remove';
          removeButton.dataset.houseRecordKey = record.key;
          removeButton.addEventListener('click', () => {
            record.learnerRef.houseId = '';
            delete houseAssignments[record.key];
            assignmentStore[activeHouse.id] = houseAssignments;
            persistHouseSportsAssignments(assignmentStore);
            persistEnrollmentRecords([record]);
            renderHouseMembersModal();
            showStatus(`${record.displayName} removed from ${activeHouse.name}.`);
          });

          const actionsWrap = document.createElement('div');
          actionsWrap.className = 'inline-house-member-actions';
          actionsWrap.appendChild(removeButton);

          item.appendChild(selectToggle);
          item.appendChild(memberMain);
          item.appendChild(actionsWrap);
          houseModalList.appendChild(item);
      });

      if (!houseModalList.childElementCount) {
        const empty = document.createElement('p');
        empty.className = 'inline-house-members-empty';
        empty.textContent = 'Members are available but could not be rendered in this view. Try clearing filters.';
        houseModalList.appendChild(empty);
      }
    }

    houseModalPullSelect.innerHTML = '';
    available
      .filter(matchesSearch)
      .sort((left, right) => comparePeopleBySurname(left.displayName, right.displayName, { descending: descendingSort }))
      .forEach((record) => {
        const option = document.createElement('option');
        option.value = record.key;
        const classLabel = record.grade ? `Grade ${record.grade}${record.classLetter ? record.classLetter : ''}` : 'Class not set';
        const fromLabel = record.houseId ? `from ${houseLabelById.get(record.houseId) || 'another house'}` : 'unassigned';
        option.textContent = `${record.displayName} · ${classLabel} · ${fromLabel}`;
        houseModalPullSelect.appendChild(option);
      });

    houseModalPullButton.disabled = !available.length;

    renderHouseEditorSummaries();
    renderOverallAllocationStats();

    requestAnimationFrame(() => {
      refreshExpandedHouseSectionHeights();
    });
  };

  const buildHouseExportRows = (houseId: string) => {
    const activeHouse = readState.options.find((entry) => entry.id === houseId);
    if (!activeHouse) {
      return { activeHouse: null, rows: [] as Array<Record<string, string>> };
    }

    const sportCodes = loadSportingCodes();
    const sportCodeById = new Map(sportCodes.map((entry) => [entry.id, entry]));
    const assignmentStore = loadHouseSportsAssignments();
    const houseAssignments = assignmentStore[activeHouse.id] || {};

    const members = collectEnrollmentLearners()
      .filter((record) => record.houseId === activeHouse.id)
      .sort((left, right) => {
        return comparePeopleBySurname(left.displayName, right.displayName, {
          staffLeft: left.memberType === 'teacher',
          staffRight: right.memberType === 'teacher'
        });
      });

    const rows = members.map((record) => {
      const assignedCodeIds = Array.isArray(houseAssignments[record.key]) ? houseAssignments[record.key] : [];
      const assignedCodes = assignedCodeIds
        .map((codeId) => sportCodeById.get(codeId)?.title || '')
        .filter((entry) => Boolean(entry));
      const classLabel = record.grade ? `Grade ${record.grade}${record.classLetter || ''}` : 'N/A';
      return {
        role: record.memberType === 'teacher' ? 'Teacher' : 'Learner',
        fullName: record.displayName,
        identifier: record.admissionNo || '-',
        gender: record.gender || 'Unspecified',
        className: classLabel,
        sportingCodes: record.memberType === 'teacher' ? 'Teacher member' : assignedCodes.join(', ') || 'Unassigned'
      };
    });

    return { activeHouse, rows };
  };

  houseModalSearch.addEventListener('input', () => {
    memberSearchValue = houseModalSearch.value;
    renderHouseMembersModal();
  });

  houseModalSort.addEventListener('change', () => {
    memberSortValue = houseModalSort.value === 'surname_desc' ? 'surname_desc' : 'surname_asc';
    houseModalSort.value = memberSortValue;
    renderHouseMembersModal();
  });

  houseModalGenderFilter.addEventListener('change', () => {
    memberGenderFilterValue = houseModalGenderFilter.value;
    renderHouseMembersModal();
  });

  houseModalSportFilter.addEventListener('change', () => {
    memberSportFilterValue = houseModalSportFilter.value;
    renderHouseMembersModal();
  });

  const applySportCodeToSelectedMembers = (mode: 'assign' | 'remove') => {
    if (!activeHouseId) return;
    const selectedCodeId = normalizeHouseId(houseModalBulkSportSelect.value, '');
    if (!selectedCodeId) {
      showStatus('Select a sporting code first.');
      return;
    }

    const sportCodes = loadSportingCodes();
    const selectedCode = sportCodes.find((entry) => entry.id === selectedCodeId);
    if (!selectedCode) {
      showStatus('Sporting code not found.');
      return;
    }

    const members = collectEnrollmentLearners().filter(
      (record) => record.houseId === activeHouseId && record.memberType === 'learner'
    );
    const membersByKey = new Map(members.map((record) => [record.key, record]));
    const targetMembers = Array.from(selectedMemberKeys)
      .map((key) => membersByKey.get(key))
      .filter((record): record is EnrollmentLearnerRecord => Boolean(record));

    if (!targetMembers.length) {
      showStatus('Select at least one house member first.');
      return;
    }

    const assignmentStore = loadHouseSportsAssignments();
    const houseAssignments = assignmentStore[activeHouseId] || {};

    let affected = 0;
    let skipped = 0;
    targetMembers.forEach((record) => {
      const canAssign = learnerMatchesEligibility(record, selectedCode.eligibility);
      if (mode === 'assign' && !canAssign) {
        skipped += 1;
        return;
      }

      const currentCodes = new Set(Array.isArray(houseAssignments[record.key]) ? houseAssignments[record.key] : []);
      if (mode === 'assign') {
        const before = currentCodes.size;
        currentCodes.add(selectedCode.id);
        if (currentCodes.size !== before) {
          affected += 1;
        }
      } else {
        const deleted = currentCodes.delete(selectedCode.id);
        if (deleted) {
          affected += 1;
        }
      }

      if (currentCodes.size) {
        houseAssignments[record.key] = Array.from(currentCodes);
      } else {
        delete houseAssignments[record.key];
      }
    });

    assignmentStore[activeHouseId] = houseAssignments;
    persistHouseSportsAssignments(assignmentStore);
    renderHouseMembersModal();

    if (mode === 'assign') {
      showStatus(
        `Assigned ${selectedCode.title} to ${affected} learner${affected === 1 ? '' : 's'}${
          skipped ? ` (${skipped} skipped by gender rule)` : ''
        }.`
      );
    } else {
      showStatus(`Removed ${selectedCode.title} from ${affected} learner${affected === 1 ? '' : 's'}.`);
    }
  };

  houseModalAssignSportButton.addEventListener('click', () => {
    applySportCodeToSelectedMembers('assign');
  });

  houseModalRemoveSportButton.addEventListener('click', () => {
    applySportCodeToSelectedMembers('remove');
  });

  houseModalPullButton.addEventListener('click', () => {
    if (!activeHouseId) return;
    const selectedKeys = Array.from(houseModalPullSelect.selectedOptions).map((option) => option.value);
    if (!selectedKeys.length) {
      showStatus('Select at least one learner to pull into this house.');
      return;
    }

    const recordsByKey = new Map(collectEnrollmentLearners().map((record) => [record.key, record]));
    const selectedRecords = selectedKeys
      .map((key) => recordsByKey.get(key))
      .filter((record): record is EnrollmentLearnerRecord => Boolean(record));

    if (!selectedRecords.length) {
      showStatus('No selected learners were found. Refresh and try again.');
      return;
    }

    selectedRecords.forEach((record) => {
      record.learnerRef.houseId = activeHouseId;
    });
    persistEnrollmentRecords(selectedRecords);
    renderHouseMembersModal();

    const houseName = readState.options.find((entry) => entry.id === activeHouseId)?.name || 'house';
    showStatus(`Pulled ${selectedRecords.length} learner${selectedRecords.length === 1 ? '' : 's'} into ${houseName}.`);
  });

  houseModalExportButton.addEventListener('click', async () => {
    if (!activeHouseId) {
      showStatus('Open a house first, then export its list.');
      return;
    }

    try {
      const { activeHouse, rows } = buildHouseExportRows(activeHouseId);
      if (!activeHouse) {
        showStatus('House details could not be resolved for export.');
        return;
      }

      const safeHouseName = activeHouse.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'house';

      const roleStore = loadHouseRoleAssignments();
      const houseRoleEntry = roleStore[activeHouse.id] || { staffRoles: {}, learnerCaptaincies: {} };
      const staffByKey = new Map(
        collectEnrollmentLearners()
          .filter((record) => record.houseId === activeHouse.id && record.memberType === 'teacher')
          .map((record) => [record.key, record.displayName])
      );
      const managerNames = Object.entries(houseRoleEntry.staffRoles)
        .filter(([, roleIds]) => Array.isArray(roleIds) && roleIds.includes('house_manager'))
        .map(([memberKey]) => staffByKey.get(memberKey) || '')
        .filter((entry) => Boolean(entry));
      const houseManagerSignatureName = managerNames[0] || '____________________________';

      await exportProfessionalWorkbook({
        fileName: `${safeHouseName}-house-register.xlsx`,
        sheetName: 'House Register',
        title: 'Official House Register',
        contextLine: `${activeHouse.name} • ${resolveHouseColorLabel(activeHouse.color)}`,
        contextLineRich: [
          {
            text: `${activeHouse.name} `,
            color: 'FFFFFF'
          },
          {
            text: '• ',
            color: normalizeHouseColor(activeHouse.color, '#64748b').replace('#', '').toUpperCase()
          },
          {
            text: resolveHouseColorLabel(activeHouse.color),
            color: normalizeHouseColor(activeHouse.color, '#64748b').replace('#', '').toUpperCase()
          }
        ],
        metaLine: `Members: ${rows.length}`,
        columns: [
          { header: 'Role', key: 'role', width: 12, align: 'center' },
          { header: 'Full Name', key: 'fullName', width: 30, align: 'left' },
          { header: 'Admission/Staff No.', key: 'identifier', width: 20, align: 'center' },
          { header: 'Gender', key: 'gender', width: 14, align: 'center' },
          { header: 'Class', key: 'className', width: 16, align: 'center' },
          { header: 'Sporting Codes', key: 'sportingCodes', width: 40, align: 'left', wrapText: true }
        ],
        rows,
        note: 'Notice: This register is generated from the current enrollment and house assignment records.',
        signatures: [
          {
            anchor: 'left',
            name: houseManagerSignatureName,
            role: 'House Manager'
          },
          {
            anchor: 'right',
            name: 'Mr. B.C Dlamini',
            role: 'Sports Committee Coordinator',
            shiftColumns: 2
          }
        ]
      });

      showStatus(`${activeHouse.name} house list exported (.xlsx).`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to export house list.');
    }
  });

  const openHouseModal = async (houseId: string) => {
    await syncEnrollmentStoreFromRemote(enrollmentSectionKey, enrollmentStorageKey);
    activeHouseId = houseId;
    memberSearchValue = '';
    memberSortValue = 'surname_asc';
    memberGenderFilterValue = 'all';
    memberSportFilterValue = 'all';
    selectedMemberKeys = new Set();
    collapseAllHouseSections();
    renderHouseMembersModal();
    houseModal.classList.remove('is-hidden');
    document.body.classList.add('inline-house-members-open');
  };

  const renderReadControls = () => {
    controls.innerHTML = '';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Manage Houses';
    editBtn.addEventListener('click', enterEdit);
    controls.appendChild(editBtn);

    const houseButtonList = document.createElement('div');
    houseButtonList.className = 'inline-house-link-list';

    readState.options.forEach((house) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inline-house-link';

      const colorDot = document.createElement('span');
      colorDot.className = 'enrollment-house-avatar';
      colorDot.style.setProperty('--house-color', house.color || '#64748b');

      const label = document.createElement('span');
      label.textContent = house.name;

      button.appendChild(colorDot);
      button.appendChild(label);
      button.addEventListener('click', () => {
        void openHouseModal(house.id);
      });
      houseButtonList.appendChild(button);
    });

    controls.appendChild(houseButtonList);
  };

  const exitEdit = () => {
    if (editorWrap) {
      editorWrap.remove();
      editorWrap = null;
    }
    overallStatsNode = null;
    closeUnallocatedOverlay();
    editors = [];
  };

  const renderEditControls = () => {
    controls.innerHTML = '';

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'inline-house-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save Houses';
    saveBtn.addEventListener('click', async () => {
      try {
        const houseOptions = editors
          .map((entry) => ({
            id: entry.id,
            name: normalizeText(entry.nameInput.value, 80) || entry.id,
            color: normalizeHouseColor(entry.colorInput.value, '#64748b')
          }))
          .filter((entry) => Boolean(entry.id));

        if (houseOptions.length < 2) {
          showStatus('Add at least two house names before saving.');
          return;
        }

        if (matchLogSection) {
          await saveSectionOverride(matchLogSection, {
            type: 'match-log',
            houseOptions,
            leftTeamId: readState.leftTeamId,
            rightTeamId: readState.rightTeamId
          });
        }

        if (fixtureSection) {
          await saveSectionOverride(fixtureSection, {
            type: 'fixture-creator',
            houseOptions
          });
        }

        localStorage.setItem('bhanoyi.sportsHouseOptions', JSON.stringify(houseOptions));
        readState.options = [...houseOptions];
        renderHouseEditorSummaries();
        renderOverallAllocationStats();
        showStatus('House names saved. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to save house names.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      exitEdit();
      renderReadControls();
    });

    actionsWrap.appendChild(saveBtn);
    actionsWrap.appendChild(cancelBtn);
    controls.appendChild(actionsWrap);

    overallStatsNode = document.createElement('div');
    overallStatsNode.className = 'inline-house-overall-stats';
    controls.appendChild(overallStatsNode);
    renderOverallAllocationStats();
  };

  const enterEdit = () => {
    if (editorWrap) {
      return;
    }

    editorWrap = document.createElement('div');
    editorWrap.className = 'inline-admin-controls';
    editors = [];

    readState.options.forEach((house, index) => {
      const { wrapper, input } = createTextEditor('House Name', house.name);
      wrapper.classList.add('inline-match-house-editor');

      const openMembersButton = document.createElement('button');
      openMembersButton.type = 'button';
      openMembersButton.className = 'btn btn-secondary';
      openMembersButton.textContent = 'Open House Members';
      openMembersButton.addEventListener('click', () => {
        openHouseModal(house.id);
      });
      wrapper.appendChild(openMembersButton);

      const colorField = document.createElement('label');
      colorField.className = 'inline-match-house-color';
      colorField.textContent = 'House Color';

      const colorInput = document.createElement('select');
      const normalizedColor = normalizeHouseColor(house.color, HOUSE_COLORS[index % HOUSE_COLORS.length]);
      const selectedColor = CLASSIC_HOUSE_COLOR_OPTIONS.some((entry) => entry.value === normalizedColor)
        ? normalizedColor
        : HOUSE_COLORS[index % HOUSE_COLORS.length];

      CLASSIC_HOUSE_COLOR_OPTIONS.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.value;
        option.textContent = entry.label;
        colorInput.appendChild(option);
      });
      colorInput.value = selectedColor;

      colorField.appendChild(colorInput);
      wrapper.appendChild(colorField);

      const summaryNode = document.createElement('div');
      summaryNode.className = 'inline-house-summary';
      wrapper.appendChild(summaryNode);

      input.addEventListener('input', () => {
        renderHouseEditorSummaries();
        renderOverallAllocationStats();
      });
      colorInput.addEventListener('change', () => {
        renderHouseEditorSummaries();
      });

      editors.push({ id: house.id, nameInput: input, colorInput, summaryNode });
      editorWrap?.appendChild(wrapper);
    });

    controls.after(editorWrap);
    renderEditControls();
    renderHouseEditorSummaries();
  };

  renderReadControls();
};

const wireFixtureCreatorInline = (section: Element) => {
  const container = section.querySelector('.container');
  const shell = section.querySelector('[data-fixture-creator="true"]') as HTMLElement | null;
  if (!container || !shell) return;

  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls';
  container.appendChild(controls);

  let config: {
    sport?: string;
    competition?: string;
    venue?: string;
    houseOptions?: Array<{ id: string; name: string }>;
  } = {};

  try {
    const parsed = JSON.parse((shell.dataset.fixtureConfig || '{}').trim());
    if (parsed && typeof parsed === 'object') {
      config = parsed as typeof config;
    }
  } catch {
    config = {};
  }

  const readState = {
    sport: String(config.sport || '').trim(),
    competition: String(config.competition || '').trim(),
    venue: String(config.venue || '').trim(),
    houseOptions: Array.isArray(config.houseOptions)
      ? config.houseOptions
          .map((entry) => ({
            id: String(entry?.id || '').trim(),
            name: String(entry?.name || '').trim()
          }))
          .filter((entry) => Boolean(entry.id))
      : []
  };

  if (!readState.houseOptions.length) {
    const fallbackInputs = Array.from(section.querySelectorAll('[data-fixture-team]')) as HTMLInputElement[];
    readState.houseOptions = fallbackInputs.map((input, index) => ({
      id: input.value || `house_${index + 1}`,
      name: input.parentElement?.querySelector('span')?.textContent?.trim() || `House ${index + 1}`
    }));
  }

  let editorWrap: HTMLElement | null = null;
  let editors: Array<{ id: string; nameInput: HTMLInputElement; colorInput: HTMLSelectElement; summaryNode: HTMLElement }> = [];
  let overallStatsNode: HTMLElement | null = null;
  let competitionInput: HTMLInputElement | null = null;
  let venueInput: HTMLInputElement | null = null;
  let houseEditors: Array<{ id: string; input: HTMLInputElement }> = [];

  const renderReadControls = () => {
    controls.innerHTML = '';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit Fixture Setup';
    editBtn.addEventListener('click', enterEdit);
    controls.appendChild(editBtn);
  };

  const exitEdit = () => {
    if (editorWrap) {
      editorWrap.remove();
      editorWrap = null;
    }
    sportInput = null;
    competitionInput = null;
    venueInput = null;
    houseEditors = [];
  };

  const renderEditControls = () => {
    controls.innerHTML = '';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save Fixture Setup';
    saveBtn.addEventListener('click', async () => {
      try {
        const houseOptions = houseEditors
          .map((entry) => ({
            id: entry.id,
            name: entry.input.value.trim() || entry.id
          }))
          .filter((entry) => Boolean(entry.id));

        if (houseOptions.length < 2) {
          showStatus('At least two houses are required for fixtures.');
          return;
        }

        await saveSectionOverride(section, {
          type: 'fixture-creator',
          sport: (sportInput?.value || readState.sport).trim(),
          competition: (competitionInput?.value || readState.competition).trim(),
          venue: (venueInput?.value || readState.venue).trim(),
          houseOptions
        });
        showStatus('Fixture setup saved. Refreshing...');
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to save fixture setup.');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      exitEdit();
      renderReadControls();
    });

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
  };

  const enterEdit = () => {
    if (editorWrap) return;

    editorWrap = document.createElement('div');
    editorWrap.className = 'inline-admin-controls';

    const sportEditor = createTextEditor('Sport label', readState.sport || 'Football / Netball');
    sportInput = sportEditor.input;
    sportEditor.wrapper.classList.add('inline-match-house-editor');
    editorWrap.appendChild(sportEditor.wrapper);

    const competitionEditor = createTextEditor('Competition', readState.competition || 'Inter-House League');
    competitionInput = competitionEditor.input;
    competitionEditor.wrapper.classList.add('inline-match-house-editor');
    editorWrap.appendChild(competitionEditor.wrapper);

    const venueEditor = createTextEditor('Venue', readState.venue || 'Main Field');
    venueInput = venueEditor.input;
    venueEditor.wrapper.classList.add('inline-match-house-editor');
    editorWrap.appendChild(venueEditor.wrapper);

    houseEditors = [];
    readState.houseOptions.forEach((house, index) => {
      const editor = createTextEditor(`House ${index + 1} Name`, house.name || `House ${index + 1}`);
      editor.wrapper.classList.add('inline-match-house-editor');
      houseEditors.push({ id: house.id, input: editor.input });
      editorWrap?.appendChild(editor.wrapper);
    });

    controls.after(editorWrap);
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

const wirePageSectionReorder = () => {
  const existingControl = document.querySelector('.section-order-floating-controls');
  if (existingControl) return;

  const sections = Array.from(document.querySelectorAll('[data-editable-section="true"]')) as HTMLElement[];
  if (sections.length < 2) return;

  const controls = document.createElement('div');
  controls.className = 'inline-admin-controls section-order-floating-controls';
  const reorderBtn = document.createElement('button');
  reorderBtn.type = 'button';
  reorderBtn.textContent = 'Reorder Sections';
  controls.appendChild(reorderBtn);
  document.body.appendChild(controls);

  const buildLabel = (section: HTMLElement, fallbackIndex: number) => {
    const heading = (section.querySelector('h2')?.textContent || '').trim();
    if (heading) return heading;
    const sectionKey = (section.dataset.sectionKey || '').trim();
    if (sectionKey) return sectionKey.replace(/_/g, ' ');
    return `Section ${fallbackIndex + 1}`;
  };

  const buildPageOrderRows = () => {
    const rows: Array<{ key: string; label: string; sectionIndex?: number }> = [];

    const heroTitle = (document.querySelector('.hero h1')?.textContent || '').trim();
    rows.push({ key: 'hero_intro', label: heroTitle ? `Welcome section (${heroTitle})` : 'Welcome section' });

    const noticeTitle = (document.querySelector('.hero-notice-title')?.textContent || '').trim();
    if (noticeTitle) {
      rows.push({ key: 'hero_notice', label: `Important notice (${noticeTitle})` });
    }

    const sectionElements = Array.from(document.querySelectorAll('[data-editable-section="true"]')) as HTMLElement[];
    sectionElements.forEach((section, index) => {
      const sectionIndex = Number(section.dataset.sectionIndex || '-1');
      if (!Number.isInteger(sectionIndex) || sectionIndex < 0) return;
      rows.push({
        key: `section:${sectionIndex}`,
        sectionIndex,
        label: buildLabel(section, index)
      });
    });

    return rows;
  };

  const enableDragSort = (list: HTMLElement) => {
    let dragging: HTMLElement | null = null;

    list.addEventListener('dragstart', (event) => {
      const target = (event.target as HTMLElement).closest('[data-drag-row]') as HTMLElement | null;
      if (!target) return;
      dragging = target;
      target.classList.add('is-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', target.dataset.dragKey || 'row');
      }
    });

    list.addEventListener('dragover', (event) => {
      if (!dragging) return;
      event.preventDefault();
      const target = (event.target as HTMLElement).closest('[data-drag-row]') as HTMLElement | null;
      if (!target || target === dragging) return;

      const rect = target.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      list.insertBefore(dragging, before ? target : target.nextSibling);
    });

    const clearDragState = () => {
      if (!dragging) return;
      dragging.classList.remove('is-dragging');
      dragging = null;
    };

    list.addEventListener('drop', (event) => {
      event.preventDefault();
      clearDragState();
    });

    list.addEventListener('dragend', clearDragState);
  };

  const openSectionOrderOverlay = () => {
    if (document.getElementById('section-order-overlay')) return;

    const rows = buildPageOrderRows();
    if (rows.length < 2) {
      showStatus('Need at least two page blocks to reorder.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'news-overlay';
    overlay.id = 'section-order-overlay';
    overlay.innerHTML = `
      <div class="news-overlay-panel" role="dialog" aria-modal="true" aria-label="Reorder sections">
        <h3>Reorder sections</h3>
        <p>Drag rows, or use Move up/down to change page section order.</p>
        <div class="section-reorder-list" id="section-reorder-list"></div>
        <div class="news-overlay-actions">
          <button type="button" id="section-order-cancel">Cancel</button>
          <button type="button" id="section-order-save">Save order</button>
        </div>
      </div>
    `;

    lockOverlayBackgroundScroll();
    document.body.appendChild(overlay);

    const list = overlay.querySelector('#section-reorder-list') as HTMLElement | null;
    const cancel = overlay.querySelector('#section-order-cancel') as HTMLButtonElement | null;
    const save = overlay.querySelector('#section-order-save') as HTMLButtonElement | null;
    if (!list || !save) {
      overlay.remove();
      return;
    }

    list.innerHTML = rows
      .map((row, index) => {
        return `
          <div class="section-reorder-item" data-drag-row="true" data-drag-key="${row.key}" data-page-order-key="${row.key}" data-section-index="${row.sectionIndex ?? ''}" draggable="true">
            <span class="section-reorder-grip" aria-hidden="true">⋮⋮</span>
            <span>${row.label || `Block ${index + 1}`}</span>
            <div class="section-reorder-item-actions">
              <button type="button" data-move-row="up">Move up</button>
              <button type="button" data-move-row="down">Move down</button>
            </div>
          </div>
        `;
      })
      .join('');

    enableDragSort(list);

    list.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button[data-move-row]') as HTMLButtonElement | null;
      if (!button) return;
      event.preventDefault();

      const row = button.closest('[data-drag-row]') as HTMLElement | null;
      if (!row) return;

      const direction = button.dataset.moveRow;
      if (direction === 'up') {
        const prev = row.previousElementSibling;
        if (prev) list.insertBefore(row, prev);
        return;
      }

      if (direction === 'down') {
        const next = row.nextElementSibling;
        if (next) list.insertBefore(next, row);
      }
    });

    const close = () => {
      overlay.remove();
      unlockOverlayBackgroundScroll();
    };
    cancel?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    save.addEventListener('click', async () => {
      const orderedKeys = Array.from(list.querySelectorAll<HTMLElement>('[data-page-order-key]'))
        .map((row) => (row.dataset.pageOrderKey || '').trim())
        .filter(Boolean);

      const orderedIndexes = orderedKeys
        .filter((key) => key.startsWith('section:'))
        .map((key) => Number(key.slice('section:'.length)))
        .filter((value) => Number.isInteger(value) && value >= 0);

      if (!orderedKeys.length || !orderedIndexes.length) {
        showStatus('Could not read section order.');
        return;
      }

      try {
        save.disabled = true;
        save.textContent = 'Saving...';
        await saveSiteSettings({
          [`section_order:${currentPageKey()}`]: JSON.stringify(orderedIndexes),
          [`page_order:${currentPageKey()}`]: JSON.stringify(orderedKeys)
        });
        showStatus('Page order saved. Refreshing...');
        close();
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to save section order.');
      } finally {
        save.disabled = false;
        save.textContent = 'Save order';
      }
    });
  };

  reorderBtn.addEventListener('click', openSectionOrderOverlay);
};

const wireLatestNewsCardsReorder = () => {
  const latestNewsSection = document.querySelector(
    '[data-editable-section="true"][data-section-key="latest_news"]'
  ) as HTMLElement | null;
  if (!latestNewsSection) return;

  const header = latestNewsSection.querySelector('.latest-news-header');
  if (!header) return;
  if (header.querySelector('[data-reorder-news-cards]')) return;

  const reorderBtn = document.createElement('button');
  reorderBtn.type = 'button';
  reorderBtn.className = 'latest-news-post-btn';
  reorderBtn.dataset.reorderNewsCards = 'true';
  reorderBtn.textContent = 'Reorder cards';
  header.appendChild(reorderBtn);

  const enableDragSort = (list: HTMLElement) => {
    let dragging: HTMLElement | null = null;

    list.addEventListener('dragstart', (event) => {
      const target = (event.target as HTMLElement).closest('[data-drag-row]') as HTMLElement | null;
      if (!target) return;
      dragging = target;
      target.classList.add('is-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', target.dataset.dragKey || 'card');
      }
    });

    list.addEventListener('dragover', (event) => {
      if (!dragging) return;
      event.preventDefault();
      const target = (event.target as HTMLElement).closest('[data-drag-row]') as HTMLElement | null;
      if (!target || target === dragging) return;

      const rect = target.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      list.insertBefore(dragging, before ? target : target.nextSibling);
    });

    const clearDragState = () => {
      if (!dragging) return;
      dragging.classList.remove('is-dragging');
      dragging = null;
    };

    list.addEventListener('drop', (event) => {
      event.preventDefault();
      clearDragState();
    });

    list.addEventListener('dragend', clearDragState);
  };

  const openNewsCardOrderOverlay = () => {
    if (document.getElementById('news-cards-order-overlay')) return;

    const slides = Array.from(latestNewsSection.querySelectorAll('.latest-news-slide')) as HTMLElement[];
    if (slides.length < 2) {
      showStatus('Need at least two news cards to reorder.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'news-overlay';
    overlay.id = 'news-cards-order-overlay';
    overlay.innerHTML = `
      <div class="news-overlay-panel" role="dialog" aria-modal="true" aria-label="Reorder latest news cards">
        <h3>Reorder Latest News cards</h3>
        <p>Drag rows, or use Move up/down to change news order.</p>
        <div class="section-reorder-list" id="news-cards-reorder-list"></div>
        <div class="news-overlay-actions">
          <button type="button" id="news-cards-order-cancel">Cancel</button>
          <button type="button" id="news-cards-order-save">Save order</button>
        </div>
      </div>
    `;

    lockOverlayBackgroundScroll();
    document.body.appendChild(overlay);

    const list = overlay.querySelector('#news-cards-reorder-list') as HTMLElement | null;
    const cancel = overlay.querySelector('#news-cards-order-cancel') as HTMLButtonElement | null;
    const save = overlay.querySelector('#news-cards-order-save') as HTMLButtonElement | null;
    if (!list || !save) {
      overlay.remove();
      return;
    }

    list.innerHTML = slides
      .map((slide, index) => {
        const cardId = (slide.dataset.cardId || '').trim();
        const category = (slide.querySelector('.news-category')?.textContent || 'General').trim();
        const title = (
          slide.querySelector('.latest-news-title')?.textContent ||
          slide.querySelector('.latest-news-fallback-title')?.textContent ||
          `News card ${index + 1}`
        ).trim();
        return `
          <div class="section-reorder-item" data-drag-row="true" data-drag-key="news-${index}" data-card-id="${cardId}" draggable="true">
            <span class="section-reorder-grip" aria-hidden="true">⋮⋮</span>
            <span>${title}</span>
            <span class="news-category">${category}</span>
            <div class="section-reorder-item-actions">
              <button type="button" data-move-row="up">Move up</button>
              <button type="button" data-move-row="down">Move down</button>
            </div>
          </div>
        `;
      })
      .join('');

    enableDragSort(list);

    list.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button[data-move-row]') as HTMLButtonElement | null;
      if (!button) return;
      event.preventDefault();

      const row = button.closest('[data-drag-row]') as HTMLElement | null;
      if (!row) return;

      const direction = button.dataset.moveRow;
      if (direction === 'up') {
        const prev = row.previousElementSibling;
        if (prev) list.insertBefore(row, prev);
        return;
      }

      if (direction === 'down') {
        const next = row.nextElementSibling;
        if (next) list.insertBefore(next, row);
      }
    });

    const close = () => {
      overlay.remove();
      unlockOverlayBackgroundScroll();
    };
    cancel?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    save.addEventListener('click', async () => {
      const orderedRows = Array.from(list.querySelectorAll<HTMLElement>('[data-drag-row]'));
      if (!orderedRows.length) {
        showStatus('Could not read card order.');
        return;
      }

      const updates = orderedRows
        .map((row, index) => ({ id: (row.dataset.cardId || '').trim(), sort_order: index + 1 }))
        .filter((entry) => Boolean(entry.id));

      const skipped = orderedRows.length - updates.length;
      if (!updates.length) {
        showStatus('No persisted cards found to reorder yet. Edit cards once to create saved records.');
        return;
      }

      try {
        save.disabled = true;
        save.textContent = 'Saving...';
        await Promise.all(updates.map((entry) => saveCard(entry)));
        showStatus(
          skipped > 0
            ? `News order saved (${skipped} default card${skipped === 1 ? '' : 's'} skipped). Refreshing...`
            : 'News order saved. Refreshing...'
        );
        close();
        window.location.reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Failed to save news order.');
      } finally {
        save.disabled = false;
        save.textContent = 'Save order';
      }
    });
  };

  reorderBtn.addEventListener('click', openNewsCardOrderOverlay);
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

  wireSportsHouseManagerInline();

  const editableFixtureCreatorSections = Array.from(
    document.querySelectorAll('[data-editable-section="true"][data-section-type="fixture-creator"]')
  );
  editableFixtureCreatorSections.forEach(wireFixtureCreatorInline);

  const latestNewsSection = document.querySelector(
    '[data-editable-section="true"][data-section-key="latest_news"]'
  );
  if (latestNewsSection) {
    wireLatestNewsSidePanelInline(latestNewsSection);
  }

  const editableSections = Array.from(document.querySelectorAll('[data-editable-section="true"]'));
  editableSections.forEach(wireSectionAssetsInline);
  wirePageSectionReorder();
  wireLatestNewsCardsReorder();

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
