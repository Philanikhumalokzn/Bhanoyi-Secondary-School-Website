const renderCard = (item, clickable = false, context = {}) => {
  const attrs = [
    context.editable ? 'data-editable-card="true"' : '',
    context.sectionKey ? `data-section-key="${context.sectionKey}"` : '',
    item.id ? `data-card-id="${item.id}"` : '',
    typeof context.sortOrder === 'number' ? `data-sort-order="${context.sortOrder}"` : '',
    clickable ? 'data-card-clickable="true"' : 'data-card-clickable="false"'
  ]
    .filter(Boolean)
    .join(' ');

  const content = `<h3>${item.title}</h3><p>${item.body}</p>`;
  if (clickable) {
    return `<a class="card" href="${item.href || '#'}" ${attrs}>${content}</a>`;
  }
  return `<article class="card" ${attrs}>${content}</article>`;
};

const renderLatestNewsSection = (section) => {
  const grouped = (section.items || []).reduce((acc, item, index) => {
    const category = (item.category || 'General').trim() || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push({ ...item, index });
    return acc;
  }, {});

  const categories = Object.entries(grouped);

  return `
    <section class="section ${section.alt ? 'section-alt' : ''} latest-news-shell" id="latest-news">
      <div class="container">
        <h2>${section.title}</h2>
        <div class="latest-news-grid">
          ${categories
            .map(([category, items]) => {
              const slides = items
                .map((item, idx) => {
                  const hasImage = Boolean((item.imageUrl || '').trim());
                  const attrs = [
                    section.editable ? 'data-editable-card="true"' : '',
                    section.sectionKey ? `data-section-key="${section.sectionKey}"` : '',
                    item.id ? `data-card-id="${item.id}"` : '',
                    `data-card-category="${category}"`,
                    `data-card-image-url="${item.imageUrl || ''}"`,
                    typeof item.index === 'number' ? `data-sort-order="${item.index}"` : '',
                    'data-card-clickable="true"'
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return `
                    <a class="latest-news-slide ${idx === 0 ? 'is-active' : ''}" href="${item.href || '#'}" ${attrs}>
                      <img class="latest-news-image ${hasImage ? '' : 'is-hidden'}" src="${hasImage ? item.imageUrl : ''}" alt="${item.title}" loading="lazy" />
                      <div class="latest-news-image-fallback ${hasImage ? 'is-hidden' : ''}">
                        <h4 class="latest-news-fallback-title">${item.title}</h4>
                        <p class="latest-news-fallback-body">${item.body}</p>
                      </div>
                      <div class="latest-news-content">
                        <span class="news-category">${category}</span>
                        <h3>${item.title}</h3>
                        <p>${item.body}</p>
                      </div>
                    </a>
                  `;
                })
                .join('');

              return `
                <article class="panel latest-news-lane">
                  <div class="latest-news-lane-head">
                    <h3>${category}</h3>
                  </div>
                  <div class="latest-news-track" data-news-track data-news-size="${items.length}">
                    ${slides}
                  </div>
                </article>
              `;
            })
            .join('')}
        </div>
      </div>
    </section>
  `;
};

export const renderHeader = (siteContent, pageKey) => {
  const links = siteContent.navigation.map((item) => {
    const current = item.key === pageKey ? ' aria-current="page"' : '';
    return `<li><a href="${item.href}"${current}>${item.label}</a></li>`;
  }).join('');

  const brandVisual = siteContent.school.logoPath
    ? `<img class="brand-logo" src="${siteContent.school.logoPath}" alt="${siteContent.school.name} logo" />`
    : `<span class="brand-mark" aria-hidden="true">${siteContent.school.shortName}</span>`;

  return `
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="index.html" aria-label="${siteContent.school.name} home">
          ${brandVisual}
          <span>${siteContent.school.name}</span>
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

export const renderHero = (hero, pageKey) => {
  if (!hero) {
    return '';
  }

  const cta = (hero.cta || [])
    .map(
      (item) =>
        `<a class="btn ${item.variant === 'secondary' ? 'btn-secondary' : 'btn-primary'}" href="${item.href}">${item.label}</a>`
    )
    .join('');

  const notice = hero.notice
    ? `<aside class="alert-box hero-notice" aria-label="Important announcement" data-page-key="${pageKey || ''}" data-notice-id="${hero.notice.id || ''}">
        <h2 class="hero-notice-title">${hero.notice.title}</h2>
        <p class="hero-notice-body">${hero.notice.body}</p>
        <a class="hero-notice-link" href="${hero.notice.href}">${hero.notice.linkLabel}</a>
      </aside>`
    : '';

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

const renderSectionByType = (section) => {
  if (section.type === 'cards' && section.sectionKey === 'latest_news') {
    return renderLatestNewsSection(section);
  }

  if (section.type === 'cards') {
    const className = section.columns === 3 ? 'three-col' : 'cards';
    return `
      <section class="section ${section.alt ? 'section-alt' : ''}">
        <div class="container">
          <h2>${section.title}</h2>
          <div class="${className}">
            ${section.items
              .map((item, index) =>
                renderCard(item, section.clickable, {
                  editable: Boolean(section.editable),
                  sectionKey: section.sectionKey || '',
                  sortOrder: index
                })
              )
              .join('')}
          </div>
        </div>
      </section>
    `;
  }

  if (section.type === 'split') {
    return `
      <section class="section ${section.alt ? 'section-alt' : ''}">
        <div class="container section-grid">
          <div>
            <h2>${section.title}</h2>
            <p>${section.body}</p>
            ${section.list ? `<ul class="list">${section.list.map((entry) => `<li>${entry}</li>`).join('')}</ul>` : ''}
          </div>
          <aside class="panel">
            <h3>${section.panel.title}</h3>
            <p>${section.panel.body}</p>
            ${section.panel.link ? `<a href="${section.panel.link.href}">${section.panel.link.label}</a>` : ''}
          </aside>
        </div>
      </section>
    `;
  }

  if (section.type === 'contact-cards') {
    return `
      <section class="section ${section.alt ? 'section-alt' : ''}">
        <div class="container">
          <h2>${section.title}</h2>
          <div class="contact-grid">
            ${section.items
              .map(
                (item) => `<article class="panel"><h3>${item.title}</h3><p>${item.body}</p></article>`
              )
              .join('')}
          </div>
        </div>
      </section>
    `;
  }

  if (section.type === 'announcements') {
    return `
      <section class="section ${section.alt ? 'section-alt' : ''}">
        <div class="container">
          <h2>${section.title}</h2>
          <div class="notice-grid">
            ${section.items
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
        </div>
      </section>
    `;
  }

  if (section.type === 'downloads') {
    return `
      <section class="section ${section.alt ? 'section-alt' : ''}">
        <div class="container">
          <h2>${section.title}</h2>
          <div class="download-grid">
            ${section.items
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
        </div>
      </section>
    `;
  }

  return '';
};

export const renderSections = (sections) => sections.map(renderSectionByType).join('');

export const initLatestNewsRotators = () => {
  const tracks = Array.from(document.querySelectorAll('[data-news-track]'));

  tracks.forEach((track) => {
    const slides = Array.from(track.querySelectorAll('.latest-news-slide'));
    const counter = track.parentElement?.querySelector('[data-news-counter]');
    if (slides.length <= 1) return;

    let index = 0;
    window.setInterval(() => {
      slides[index].classList.remove('is-active');
      index = (index + 1) % slides.length;
      slides[index].classList.add('is-active');
      if (counter) {
        counter.textContent = `${index + 1} / ${slides.length}`;
      }
    }, 2000);
  });
};

export const renderFooter = (siteContent) => `
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <h2>${siteContent.school.name}</h2>
        <p>${siteContent.school.tagline}</p>
      </div>
      <div>
        <h3>Contact</h3>
        <p><strong>Phone:</strong> ${siteContent.school.phone}</p>
        <p><strong>Email:</strong> ${siteContent.school.email}</p>
        <p><strong>Address:</strong> ${siteContent.school.address}</p>
      </div>
      <div>
        <h3>School Hours</h3>
        <p>${siteContent.school.hours[0]}</p>
        <p>${siteContent.school.hours[1]}</p>
      </div>
    </div>
    <div class="container footer-bottom">
      <p>© 2026 ${siteContent.school.name}. All rights reserved.</p>
    </div>
  </footer>
`;
