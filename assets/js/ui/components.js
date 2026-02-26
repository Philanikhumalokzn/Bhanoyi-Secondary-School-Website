const escapeHtmlAttribute = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const parseCardImageUrls = (value) => {
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

const serializeCardImageUrls = (urls) => {
  const normalized = (Array.isArray(urls) ? urls : [])
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);

  if (!normalized.length) return '';
  return normalized.length === 1 ? normalized[0] : JSON.stringify(normalized);
};

const renderCard = (item, clickable = false, context = {}) => {
  const imageUrls = parseCardImageUrls(item.imageUrl || '');
  const primaryImageUrl = imageUrls[0] || '';
  const imageData = serializeCardImageUrls(imageUrls);
  const attrs = [
    'data-editable-card="true"',
    context.sectionKey ? `data-section-key="${context.sectionKey}"` : '',
    item.id ? `data-card-id="${item.id}"` : '',
    `data-card-image-url="${escapeHtmlAttribute(imageData)}"`,
    typeof context.sortOrder === 'number' ? `data-sort-order="${context.sortOrder}"` : '',
    clickable ? 'data-card-clickable="true"' : 'data-card-clickable="false"'
  ]
    .filter(Boolean)
    .join(' ');

  const hasImage = Boolean(primaryImageUrl);
  const content = `
    <img class="card-image ${hasImage ? '' : 'is-hidden'}" src="${hasImage ? primaryImageUrl : ''}" alt="${item.title}" loading="lazy" />
    <h3>${item.title}</h3>
    <p>${item.body}</p>
  `;
  if (clickable) {
    return `<a class="card" href="${item.href || '#'}" ${attrs}>${content}</a>`;
  }
  return `<article class="card" ${attrs}>${content}</article>`;
};

const withAdminQuery = (href) => {
  if (!href) return href;
  if (typeof window === 'undefined') return href;

  const adminMode = new URLSearchParams(window.location.search).get('admin') === '1';
  if (!adminMode) return href;

  if (/^(https?:|mailto:|tel:|#)/i.test(href)) {
    return href;
  }

  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.set('admin', '1');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
};

const renderSectionAttachments = (section) => {
  const attachments = Array.isArray(section.attachments) ? section.attachments : [];
  if (!attachments.length) {
    return `<div class="section-assets is-hidden"><h3>Files & Resources</h3><div class="section-assets-grid"></div></div>`;
  }

  const items = attachments
    .map((item) => {
      const url = (item?.url || '').trim();
      if (!url) return '';

      const kind = item.kind === 'image' ? 'image' : 'document';
      const title = (item.title || (kind === 'image' ? 'Image' : 'Document')).trim();
      const fileName = (item.fileName || url.split('/').pop() || 'file').trim();

      return `
        <a class="section-asset-item" href="${url}" target="_blank" rel="noopener" data-asset-url="${url}" data-asset-title="${title}" data-asset-filename="${fileName}" data-asset-kind="${kind}">
          ${kind === 'image' ? `<img class="section-asset-thumb" src="${url}" alt="${title}" loading="lazy" />` : ''}
          <span class="section-asset-title">${title}</span>
          <span class="section-asset-name">${fileName}</span>
        </a>
      `;
    })
    .join('');

  return `
    <div class="section-assets">
      <h3>Files & Resources</h3>
      <div class="section-assets-grid">${items}</div>
    </div>
  `;
};

const renderLatestNewsSection = (section, sectionIndex) => {
  const items = (section.items || []).map((item, index) => ({ ...item, index }));
  const sidePanel = section.sidePanel;
  const hasSidePanel = Boolean(sidePanel && typeof sidePanel === 'object');
  const sidePanelImageUrl = (sidePanel?.imageUrl || '').trim();
  const hasSidePanelImage = Boolean(sidePanelImageUrl);

  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;

  return `
    <section class="section ${section.alt ? 'section-alt' : ''} latest-news-shell" id="latest-news" data-section-index="${sectionIndex}" data-section-type="cards" data-section-key="${fallbackSectionKey}" ${section.editable ? 'data-editable-section="true"' : ''}>
      <div class="container">
        <div class="latest-news-header">
          <h2>${section.title}</h2>
          <button type="button" class="latest-news-post-btn" data-post-news>Post new article</button>
        </div>
        <div class="latest-news-layout ${hasSidePanel ? 'has-side-panel' : ''}">
          <div class="latest-news-grid">
            <article class="panel latest-news-lane">
              <div class="latest-news-track" data-news-track data-news-size="${items.length}">
                <div class="latest-news-rail" data-news-rail>
                  ${items
                    .map((item, idx) => {
                      const category = (item.category || 'General').trim() || 'General';
                      const imageUrls = parseCardImageUrls(item.imageUrl || '');
                      const primaryImageUrl = imageUrls[0] || '';
                      const imageData = serializeCardImageUrls(imageUrls);
                      const hasImage = Boolean(primaryImageUrl);
                      const normalizedSubtitle = (item.subtitle || '').trim();
                      const fallbackHeading = item.title;
                      const showSubtitle = Boolean(normalizedSubtitle) && normalizedSubtitle.toLowerCase() !== item.title.toLowerCase();
                      const attrs = [
                        section.editable ? 'data-editable-card="true"' : '',
                        section.sectionKey ? `data-section-key="${section.sectionKey}"` : '',
                        item.id ? `data-card-id="${item.id}"` : '',
                        `data-card-category="${category}"`,
                        `data-card-subtitle="${item.subtitle || ''}"`,
                        `data-card-image-url="${escapeHtmlAttribute(imageData)}"`,
                        typeof item.index === 'number' ? `data-sort-order="${item.index}"` : '',
                        'data-card-clickable="true"'
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return `
                        <a class="latest-news-slide ${idx === 0 ? 'is-active' : ''}" href="${item.href || '#'}" ${attrs}>
                          <img class="latest-news-image ${hasImage ? '' : 'is-hidden'}" src="${hasImage ? primaryImageUrl : ''}" alt="${item.title}" loading="lazy" />
                          <div class="latest-news-image-fallback ${hasImage ? 'is-hidden' : ''}">
                            <h4 class="latest-news-fallback-title">${fallbackHeading}</h4>
                            <p class="latest-news-fallback-body">${item.body}</p>
                          </div>
                          <div class="latest-news-content">
                            <span class="news-category">${category}</span>
                            <h3 class="latest-news-title ${hasImage ? '' : 'is-hidden'}">${item.title}</h3>
                            ${showSubtitle ? `<p class="latest-news-subtitle ${hasImage ? '' : 'is-hidden'}">${normalizedSubtitle}</p>` : ''}
                            <p class="latest-news-body ${hasImage ? '' : 'is-hidden'}">${item.body}</p>
                          </div>
                        </a>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            </article>
          </div>
          ${hasSidePanel ? `
            <aside class="panel latest-news-side-panel">
              <div class="latest-news-side-media ${hasSidePanelImage ? '' : 'is-hidden'}">
                <img class="latest-news-side-image ${hasSidePanelImage ? '' : 'is-hidden'}" src="${hasSidePanelImage ? sidePanelImageUrl : ''}" alt="${sidePanel.title || 'Principal photo'}" loading="lazy" />
                <p class="latest-news-side-panel-name">${sidePanel.principalName || 'Dr. G.K.S. Memela'}</p>
              </div>
              <h3>${sidePanel.title || 'Principal’s Welcome'}</h3>
              <p>${sidePanel.body || ''}</p>
              ${sidePanel.link ? `<a href="${sidePanel.link.href || '#'}">${sidePanel.link.label || 'Read more'}</a>` : ''}
            </aside>
          ` : ''}
        </div>
      </div>
    </section>
  `;
};

export const renderHeader = (siteContent, pageKey) => {
  const links = siteContent.navigation.map((item) => {
    const current = item.key === pageKey ? ' aria-current="page"' : '';
    return `<li><a href="${withAdminQuery(item.href)}"${current}>${item.label}</a></li>`;
  }).join('');
  const headerBackgroundImage = (siteContent.school?.headerBackgroundImage || '').trim();
  const headerBackgroundAttr = headerBackgroundImage.replace(/"/g, '&quot;');

  const brandVisual = siteContent.school.logoPath
    ? `<img class="brand-logo" src="${siteContent.school.logoPath}" alt="${siteContent.school.name} logo" />`
    : `<span class="brand-mark" aria-hidden="true">${siteContent.school.shortName}</span>`;

  return `
    <header class="site-header ${headerBackgroundImage ? 'has-header-bg' : ''}" data-header-bg-url="${headerBackgroundAttr}">
      <div class="container header-inner">
        <a class="brand" href="${withAdminQuery('index.html')}" aria-label="${siteContent.school.name} home">
          <span class="brand-visual-desktop" aria-hidden="true">${brandVisual}</span>
          <span class="brand-name">${siteContent.school.name}</span>
        </a>
        <button
          id="menu-toggle"
          class="menu-toggle"
          aria-expanded="false"
          aria-controls="primary-nav"
          aria-label="Open navigation menu"
        >
          Menu
        </button>
        <nav id="primary-nav" class="primary-nav" aria-label="Primary">
          <ul>${links}</ul>
        </nav>
      </div>
    </header>
  `;
};

const renderHeroNoticeAside = (notice, pageKey) => {
  if (!notice) return '';

  return `
    <aside class="alert-box hero-notice" aria-label="Important announcement" data-page-key="${pageKey || ''}" data-notice-id="${notice.id || ''}">
      <h2 class="hero-notice-title">${notice.title}</h2>
      <p class="hero-notice-body">${notice.body}</p>
      <a class="hero-notice-link" href="${notice.href}">${notice.linkLabel}</a>
    </aside>
  `;
};

const renderHeroNoticeBlock = (notice, pageKey) => {
  if (!notice) return '';

  return `
    <section class="section section-alt hero-notice-only">
      <div class="container">
        ${renderHeroNoticeAside(notice, pageKey)}
      </div>
    </section>
  `;
};

export const renderHeroNotice = (hero, pageKey) => renderHeroNoticeBlock(hero?.notice, pageKey);

export const renderHero = (hero, pageKey, options = {}) => {
  const includeNotice = options.includeNotice !== false;
  if (!hero) {
    return '';
  }

  const cta = (hero.cta || [])
    .map(
      (item) =>
        `<a class="btn ${item.variant === 'secondary' ? 'btn-secondary' : 'btn-primary'}" href="${item.href}">${item.label}</a>`
    )
    .join('');

  const notice = includeNotice ? renderHeroNoticeAside(hero.notice, pageKey) : '';

  return `
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <p class="eyebrow">${hero.eyebrow || ''}</p>
          <h1>${hero.title}</h1>
          <p class="lead">${hero.lead}</p>
          <div class="hero-cta">${cta}</div>
        </div>
        ${notice}
      </div>
    </section>
  `;
};

const resolveHomePrincipalSidePanel = (section, context = {}) => {
  const pageKey = context.pageKey || '';
  const siteContent = context.siteContent || null;
  if (pageKey !== 'home' || section.sectionKey !== 'latest_news' || !siteContent?.pages?.about?.sections) {
    return section;
  }

  const aboutPrincipalSection = siteContent.pages.about.sections.find(
    (entry) => entry?.type === 'split' && entry?.panel && typeof entry.panel === 'object'
  );

  const aboutPanel = aboutPrincipalSection?.panel || {};
  const existing = section.sidePanel || {};

  return {
    ...section,
    sidePanel: {
      ...existing,
      title: aboutPanel.title || existing.title || 'Principal’s Welcome',
      body: aboutPanel.body || existing.body || '',
      principalName: aboutPanel.principalName || existing.principalName || 'Dr. G.K.S. Memela',
      imageUrl: aboutPanel.imageUrl || existing.imageUrl || '',
      link: aboutPanel.link || existing.link || { href: 'about.html', label: 'Read full message' }
    }
  };
};

const resolveContactInformationSection = (section, context = {}) => {
  const pageKey = context.pageKey || '';
  const school = context.siteContent?.school;
  if (pageKey !== 'contact' || section.type !== 'contact-cards' || !school) {
    return section;
  }

  const title = (section.title || '').trim().toLowerCase();
  if (title !== 'contact information') {
    return section;
  }

  return {
    ...section,
    editable: false,
    items: (section.items || []).map((item) => {
      const itemTitle = (item.title || '').trim().toLowerCase();
      if (itemTitle === 'phone') {
        return { ...item, body: school.phone || '' };
      }
      if (itemTitle === 'email') {
        return { ...item, body: school.email || '' };
      }
      if (itemTitle === 'address') {
        return { ...item, body: school.address || '' };
      }
      return item;
    })
  };
};

const getOrderedSectionEntries = (sections, context = {}) => {
  const entries = sections.map((section, index) => ({ section, index }));
  const order = Array.isArray(context.sectionOrder)
    ? context.sectionOrder
    : Array.isArray(context.page?.sectionOrder)
      ? context.page.sectionOrder
      : [];

  if (!order.length) return entries;

  const rank = new Map(order.map((value, position) => [Number(value), position]));
  return entries.sort((left, right) => {
    const leftRank = rank.has(left.index) ? rank.get(left.index) : Number.MAX_SAFE_INTEGER;
    const rightRank = rank.has(right.index) ? rank.get(right.index) : Number.MAX_SAFE_INTEGER;
    if (leftRank === rightRank) return left.index - right.index;
    return leftRank - rightRank;
  });
};

const renderSectionByType = (section, sectionIndex, context = {}) => {
  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;
  const effectiveSection = resolveContactInformationSection(resolveHomePrincipalSidePanel(section, context), context);

  if (effectiveSection.type === 'cards' && effectiveSection.sectionKey === 'latest_news') {
    return renderLatestNewsSection(effectiveSection, sectionIndex);
  }

  if (effectiveSection.type === 'cards') {
    const className = effectiveSection.columns === 3 ? 'three-col' : 'cards';
    const editableAttr = effectiveSection.editable ? 'data-editable-section="true"' : '';
    return `
      <section class="section ${effectiveSection.alt ? 'section-alt' : ''}" ${editableAttr} data-section-index="${sectionIndex}" data-section-type="cards" data-section-key="${fallbackSectionKey}">
        <div class="container">
          <h2>${effectiveSection.title}</h2>
          <div class="${className}">
            ${effectiveSection.items
              .map((item, index) =>
                renderCard(item, effectiveSection.clickable, {
                  sectionKey: fallbackSectionKey,
                  sortOrder: index
                })
              )
              .join('')}
          </div>
          ${renderSectionAttachments(effectiveSection)}
        </div>
      </section>
    `;
  }

  if (effectiveSection.type === 'split') {
    const panelImageUrl = effectiveSection.panel?.imageUrl || '';
    const hasPanelImage = Boolean(panelImageUrl.trim());
    return `
      <section class="section ${effectiveSection.alt ? 'section-alt' : ''}" data-editable-section="true" data-section-index="${sectionIndex}" data-section-type="split">
        <div class="container section-grid">
          <div>
            <h2>${effectiveSection.title}</h2>
            <p>${effectiveSection.body}</p>
            ${effectiveSection.list ? `<ul class="list">${effectiveSection.list.map((entry) => `<li>${entry}</li>`).join('')}</ul>` : ''}
          </div>
          <aside class="panel">
            <img class="split-panel-image ${hasPanelImage ? '' : 'is-hidden'}" src="${hasPanelImage ? panelImageUrl : ''}" alt="${effectiveSection.panel.title}" loading="lazy" />
            <h3>${effectiveSection.panel.title}</h3>
            <p>${effectiveSection.panel.body}</p>
            ${effectiveSection.panel.link ? `<a href="${effectiveSection.panel.link.href}">${effectiveSection.panel.link.label}</a>` : ''}
          </aside>
        </div>
        ${renderSectionAttachments(effectiveSection)}
      </section>
    `;
  }

  if (effectiveSection.type === 'contact-cards') {
    const editableAttr = effectiveSection.editable === false ? '' : 'data-editable-section="true"';
    return `
      <section class="section ${effectiveSection.alt ? 'section-alt' : ''}" ${editableAttr} data-section-index="${sectionIndex}" data-section-type="contact-cards">
        <div class="container">
          <h2>${effectiveSection.title}</h2>
          <div class="contact-grid">
            ${effectiveSection.items
              .map(
                (item, index) => `<article class="panel" data-contact-index="${index}"><h3>${item.title}</h3><p>${item.body}</p></article>`
              )
              .join('')}
          </div>
          ${renderSectionAttachments(effectiveSection)}
        </div>
      </section>
    `;
  }

  if (effectiveSection.type === 'announcements') {
    return `
      <section class="section ${effectiveSection.alt ? 'section-alt' : ''}" data-editable-section="true" data-section-index="${sectionIndex}" data-section-type="announcements">
        <div class="container">
          <h2>${effectiveSection.title}</h2>
          <div class="notice-grid">
            ${effectiveSection.items
              .map(
                (item) => `
                  <article class="panel notice-item" data-announcement-id="${item.id || ''}">
                    <div class="notice-meta">
                      <span class="notice-date">${item.date}</span>
                      ${item.tag ? `<span class="notice-tag">${item.tag}</span>` : ''}
                    </div>
                    <h3 class="notice-title">${item.title}</h3>
                    <p class="notice-body">${item.body}</p>
                  </article>
                `
              )
              .join('')}
          </div>
          ${renderSectionAttachments(effectiveSection)}
        </div>
      </section>
    `;
  }

  if (effectiveSection.type === 'downloads') {
    return `
      <section class="section ${effectiveSection.alt ? 'section-alt' : ''}" data-editable-section="true" data-section-index="${sectionIndex}" data-section-type="downloads">
        <div class="container">
          <h2>${effectiveSection.title}</h2>
          <div class="download-grid">
            ${effectiveSection.items
              .map((item, index) =>
                `
                  <article class="panel download-item" data-editable-download="true" data-download-id="${item.id || ''}" data-sort-order="${index}">
                    <h3>${item.title}</h3>
                    <p>${item.body}</p>
                    <a class="btn btn-secondary download-link" href="${item.href}">${item.linkLabel || 'Download'}</a>
                  </article>
                `
              )
              .join('')}
          </div>
          ${renderSectionAttachments(effectiveSection)}
        </div>
      </section>
    `;
  }

  return '';
};

export const renderSections = (sections) =>
  getOrderedSectionEntries(sections).map((entry) => renderSectionByType(entry.section, entry.index)).join('');
export const renderSectionsWithContext = (sections, context) =>
  getOrderedSectionEntries(sections, context)
    .map((entry) => renderSectionByType(entry.section, entry.index, context))
    .join('');
export const renderSectionByIndex = (sections, index, context = {}) => {
  if (!Array.isArray(sections)) return '';
  if (index < 0 || index >= sections.length) return '';
  return renderSectionByType(sections[index], index, context);
};

export const renderPageEmailForms = (pageKey) => {
  if (pageKey === 'contact') {
    return `
      <section class="section section-alt">
        <div class="container">
          <article class="panel email-form-panel">
            <h2>Send Us a Message</h2>
            <p class="email-form-lead">Use this form to contact the school office. We will respond as soon as possible.</p>
            <form class="email-form" data-email-form="true" data-endpoint="/api/contact-email" novalidate>
              <label>
                Full Name
                <input type="text" name="fullName" required maxlength="120" autocomplete="name" />
              </label>
              <label>
                Email Address
                <input type="email" name="email" required maxlength="200" autocomplete="email" />
              </label>
              <label>
                Phone Number (optional)
                <input type="tel" name="phone" maxlength="80" autocomplete="tel" />
              </label>
              <label>
                Subject
                <input type="text" name="subject" required maxlength="180" />
              </label>
              <label>
                Message
                <textarea name="message" rows="5" required maxlength="4000"></textarea>
              </label>
              <input class="email-form-honeypot" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
              <div class="email-form-actions">
                <button type="submit" class="btn btn-primary">Send Message</button>
                <p class="email-form-status" data-form-status data-tone="muted" aria-live="polite"></p>
              </div>
            </form>
          </article>
        </div>
      </section>
    `;
  }

  if (pageKey === 'admissions') {
    return `
      <section class="section section-alt">
        <div class="container">
          <article class="panel email-form-panel">
            <h2>Admissions Enquiry</h2>
            <p class="email-form-lead">Submit your details and the admissions office will contact you with the next steps.</p>
            <form class="email-form" data-email-form="true" data-endpoint="/api/admissions-email" novalidate>
              <label>
                Parent / Guardian Name
                <input type="text" name="guardianName" required maxlength="120" autocomplete="name" />
              </label>
              <label>
                Student Name
                <input type="text" name="studentName" required maxlength="120" />
              </label>
              <label>
                Applying Grade
                <input type="text" name="applyingGrade" required maxlength="40" placeholder="e.g. Grade 8" />
              </label>
              <label>
                Email Address
                <input type="email" name="email" required maxlength="200" autocomplete="email" />
              </label>
              <label>
                Phone Number
                <input type="tel" name="phone" required maxlength="80" autocomplete="tel" />
              </label>
              <label>
                Additional Notes (optional)
                <textarea name="message" rows="4" maxlength="4000"></textarea>
              </label>
              <input class="email-form-honeypot" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
              <div class="email-form-actions">
                <button type="submit" class="btn btn-primary">Send Enquiry</button>
                <p class="email-form-status" data-form-status data-tone="muted" aria-live="polite"></p>
              </div>
            </form>
          </article>
        </div>
      </section>
    `;
  }

  return '';
};

export const initLatestNewsRotators = () => {
  const tracks = Array.from(document.querySelectorAll('[data-news-track]'));
  const adminMode = new URLSearchParams(window.location.search).get('admin') === '1';

  tracks.forEach((track) => {
    const rail = track.querySelector('[data-news-rail]');
    if (!rail) return;

    const baseSlides = Array.from(rail.querySelectorAll('.latest-news-slide'));
    const counter = track.parentElement?.querySelector('[data-news-counter]');
    const imageRotators = baseSlides
      .map((slide) => {
        const image = slide.querySelector('.latest-news-image');
        if (!image) return null;

        const imageUrls = parseCardImageUrls((slide.dataset.cardImageUrl || '').trim());
        if (imageUrls.length <= 1) return null;

        const currentSrc = (image.getAttribute('src') || '').trim();
        const initialIndex = Math.max(0, imageUrls.indexOf(currentSrc));
        return {
          image,
          imageUrls,
          index: initialIndex
        };
      })
      .filter(Boolean);

    if (imageRotators.length) {
      window.setInterval(() => {
        if (track.dataset.adminPaused === 'true') {
          return;
        }

        imageRotators.forEach((rotator) => {
          rotator.index = (rotator.index + 1) % rotator.imageUrls.length;
          rotator.image.setAttribute('src', rotator.imageUrls[rotator.index]);
        });
      }, 3000);
    }

    if (baseSlides.length <= 1) return;

    if (!adminMode && !track.dataset.carouselLooped) {
      const firstClone = baseSlides[0].cloneNode(true);
      const lastClone = baseSlides[baseSlides.length - 1].cloneNode(true);
      if (firstClone instanceof HTMLElement) {
        firstClone.dataset.carouselClone = 'true';
      }
      if (lastClone instanceof HTMLElement) {
        lastClone.dataset.carouselClone = 'true';
      }
      rail.appendChild(firstClone);
      rail.insertBefore(lastClone, rail.firstChild);
      track.dataset.carouselLooped = 'true';
    }

    const slides = Array.from(rail.querySelectorAll('.latest-news-slide'));
    const realSlideCount = baseSlides.length;

    let index = adminMode ? 0 : 1;
    let autoRotateTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let hasTouchStart = false;

    const applySlidePosition = (nextIndex, animate = true) => {
      rail.style.transition = animate ? 'transform 420ms ease' : 'none';
      rail.style.transform = `translateX(-${nextIndex * 100}%)`;
      slides.forEach((slide, slideIndex) => {
        slide.classList.toggle('is-active', slideIndex === nextIndex);
      });
      if (counter) {
        const visibleIndex = adminMode
          ? nextIndex
          : ((nextIndex - 1 + realSlideCount) % realSlideCount);
        counter.textContent = `${visibleIndex + 1} / ${realSlideCount}`;
      }
    };

    const normalizeLoopEdgeIfNeeded = () => {
      if (adminMode) return;
      if (index === slides.length - 1) {
        index = 1;
        applySlidePosition(index, false);
        return;
      }
      if (index === 0) {
        index = slides.length - 2;
        applySlidePosition(index, false);
      }
    };

    const goToNext = () => {
      if (track.dataset.adminPaused === 'true') return;
      index = (index + 1) % slides.length;
      applySlidePosition(index, true);
    };

    const goToPrevious = () => {
      if (track.dataset.adminPaused === 'true') return;
      index = (index - 1 + slides.length) % slides.length;
      applySlidePosition(index, true);
    };

    const restartAutoRotate = () => {
      if (autoRotateTimer !== null) {
        window.clearInterval(autoRotateTimer);
      }
      autoRotateTimer = window.setInterval(goToNext, 5000);
    };

    applySlidePosition(index, false);

    if (!adminMode) {
      rail.addEventListener('transitionend', () => {
        normalizeLoopEdgeIfNeeded();
      });

      track.addEventListener('touchstart', (event) => {
        if (!event.touches || event.touches.length !== 1) return;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        hasTouchStart = true;
      }, { passive: true });

      track.addEventListener('touchend', (event) => {
        if (!hasTouchStart || !event.changedTouches || event.changedTouches.length !== 1) return;
        hasTouchStart = false;

        const endX = event.changedTouches[0].clientX;
        const endY = event.changedTouches[0].clientY;
        const diffX = endX - touchStartX;
        const diffY = endY - touchStartY;
        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);

        if (absX < 36 || absX <= absY) return;

        track.dataset.swipeLockUntil = String(Date.now() + 450);
        if (diffX < 0) {
          goToNext();
        } else {
          goToPrevious();
        }
        restartAutoRotate();
      }, { passive: true });
    }

    restartAutoRotate();
  });
};

const openLatestNewsReadOverlay = (slide) => {
  const existing = document.getElementById('news-read-overlay');
  if (existing) {
    existing.remove();
  }

  const lane = slide.closest('.latest-news-lane');
  const laneSlides = lane
    ? Array.from(lane.querySelectorAll('.latest-news-slide:not([data-carousel-clone="true"])'))
    : [slide];
  let currentIndex = Math.max(0, laneSlides.indexOf(slide));

  const readArticle = (currentSlide) => {
    const category = (currentSlide.querySelector('.news-category')?.textContent ?? '').trim();
    const title = (currentSlide.querySelector('.latest-news-title')?.textContent ?? '').trim();
    const subtitle = (currentSlide.querySelector('.latest-news-subtitle')?.textContent ?? '').trim();
    const body = (
      currentSlide.querySelector('.latest-news-body')?.textContent ??
      currentSlide.querySelector('.latest-news-fallback-body')?.textContent ??
      ''
    ).trim();
    const image = currentSlide.querySelector('.latest-news-image');
    const imageData = (currentSlide.dataset.cardImageUrl || '').trim();
    const imageUrls = parseCardImageUrls(imageData);
    const imageUrl = image && !image.classList.contains('is-hidden') ? image.getAttribute('src') || '' : '';
    if (!imageUrls.length && imageUrl) {
      imageUrls.push(imageUrl);
    }
    const href = (currentSlide.getAttribute('href') || '#').trim();

    return {
      category,
      title,
      subtitle,
      body,
      imageUrls,
      href
    };
  };

  const overlay = document.createElement('div');
  overlay.id = 'news-read-overlay';
  overlay.className = 'news-read-overlay';
  overlay.innerHTML = `
    <article class="news-read-panel" role="dialog" aria-modal="true" aria-label="Latest news article">
      <button type="button" class="news-read-close" aria-label="Close article">×</button>
      <div class="news-read-dynamic"></div>
      <div class="news-read-nav ${laneSlides.length > 1 ? '' : 'is-hidden'}">
        <button type="button" class="news-read-nav-btn" data-news-prev>Previous</button>
        <span class="news-read-nav-state" data-news-state></span>
        <button type="button" class="news-read-nav-btn" data-news-next>Next</button>
      </div>
    </article>
  `;

  const dynamic = overlay.querySelector('.news-read-dynamic');
  const state = overlay.querySelector('[data-news-state]');

  const renderArticle = () => {
    const article = readArticle(laneSlides[currentIndex]);
    if (!dynamic) return;

    dynamic.innerHTML = `
      ${article.imageUrls.length
        ? `<div class="news-read-media">${article.imageUrls
            .map(
              (url, index) =>
                `<img class="news-read-image ${index > 0 ? 'news-read-image-secondary' : ''}" src="${url}" alt="${article.title}" />`
            )
            .join('')}</div>`
        : ''}
      <div class="news-read-content">
        ${article.category ? `<p class="news-read-category">${article.category}</p>` : ''}
        <h3>${article.title}</h3>
        ${article.subtitle ? `<p class="news-read-subtitle">${article.subtitle}</p>` : ''}
        <p class="news-read-body">${article.body || 'No article content provided yet.'}</p>
        ${article.href && article.href !== '#' ? `<a class="btn btn-secondary" href="${article.href}">Open linked page</a>` : ''}
      </div>
    `;

    if (state) {
      state.textContent = `${currentIndex + 1} of ${laneSlides.length}`;
    }
  };

  const nextArticle = () => {
    if (laneSlides.length <= 1) return;
    currentIndex = (currentIndex + 1) % laneSlides.length;
    renderArticle();
  };

  const previousArticle = () => {
    if (laneSlides.length <= 1) return;
    currentIndex = (currentIndex - 1 + laneSlides.length) % laneSlides.length;
    renderArticle();
  };

  const close = () => {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      close();
      return;
    }

    if (event.key === 'ArrowRight') {
      nextArticle();
      return;
    }

    if (event.key === 'ArrowLeft') {
      previousArticle();
    }
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  overlay.querySelector('[data-news-next]')?.addEventListener('click', nextArticle);
  overlay.querySelector('[data-news-prev]')?.addEventListener('click', previousArticle);
  overlay.querySelector('.news-read-close')?.addEventListener('click', close);
  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  renderArticle();
};

export const initLatestNewsReaders = () => {
  if (document.body.classList.contains('inline-admin-active')) {
    return;
  }

  const slides = Array.from(document.querySelectorAll('.latest-news-slide:not([data-carousel-clone="true"])'));
  slides.forEach((slide) => {
    slide.addEventListener('click', (event) => {
      const track = slide.closest('[data-news-track]');
      const swipeLockUntil = Number(track?.dataset.swipeLockUntil || '0');
      if (swipeLockUntil > Date.now()) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      openLatestNewsReadOverlay(slide);
    });
  });
};

export const renderFooter = (siteContent) => `
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <h2 class="footer-school-name">${siteContent.school.name}</h2>
        <p class="footer-tagline">${siteContent.school.tagline}</p>
      </div>
      <div>
        <h3>Contact</h3>
        <p><strong>Phone:</strong> <span class="footer-phone">${siteContent.school.phone}</span></p>
        <p><strong>Email:</strong> <span class="footer-email">${siteContent.school.email}</span></p>
        <p><strong>Address:</strong> <span class="footer-address">${siteContent.school.address}</span></p>
      </div>
      <div>
        <h3>School Hours</h3>
        <p class="footer-hours-1">${siteContent.school.hours[0]}</p>
        <p class="footer-hours-2">${siteContent.school.hours[1]}</p>
      </div>
    </div>
    <div class="container footer-bottom">
      <p>© 2026 ${siteContent.school.name}. All rights reserved.</p>
      <p><a class="footer-utility-link" href="${withAdminQuery('email-tester.html')}">Email Tester</a></p>
    </div>
  </footer>
`;
