import {
  initFixtureCreators,
  initMatchEventLogs,
  initSchoolCalendars,
  initLatestNewsReaders,
  initLatestNewsRotators,
  renderFooter,
  renderHeader,
  renderSectionByIndex,
  renderHeroNotice,
  renderPageEmailForms,
  renderHero,
  renderSectionsWithContext
} from './components.js';

const upsertDescriptionMeta = (content) => {
  let element = document.querySelector('meta[name="description"]');
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', 'description');
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
};

const upsertFavicon = (href) => {
  if (!href) {
    return;
  }

  let element = document.querySelector('link[rel="icon"]');
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'icon');
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
};

const bindMobileNav = () => {
  const menuToggle = document.getElementById('menu-toggle');
  const primaryNav = document.getElementById('primary-nav');

  if (!menuToggle || !primaryNav) {
    return;
  }

  menuToggle.addEventListener('click', () => {
    const isOpen = primaryNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  });

  primaryNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 860) {
        primaryNav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation menu');
      }
    });
  });
};

const initCollapsiblePageSections = (pageKey) => {
  const key = String(pageKey || '').trim().toLowerCase();
  if (key !== 'sports' && key !== 'calendar') return;

  const sectionNodes = Array.from(document.querySelectorAll('#main-content > section.section'));
  if (!sectionNodes.length) return;

  const preparedSections = sectionNodes
    .map((section) => {
      if (!(section instanceof HTMLElement)) return null;

      const container = section.querySelector(':scope > .container');
      if (!(container instanceof HTMLElement)) return null;

      const heading = container.querySelector(':scope > h2');
      if (!(heading instanceof HTMLElement)) return null;

      let body = container.querySelector(':scope > .page-section-collapsible-body');
      if (!(body instanceof HTMLElement)) {
        body = document.createElement('div');
        body.className = 'page-section-collapsible-body';

        const nodesToMove = [];
        let cursor = heading.nextSibling;
        while (cursor) {
          nodesToMove.push(cursor);
          cursor = cursor.nextSibling;
        }
        nodesToMove.forEach((node) => body.appendChild(node));
        container.appendChild(body);
      }

      section.classList.add('page-section-collapsible', 'is-collapsed');
      section.tabIndex = 0;
      section.setAttribute('role', 'button');
      section.setAttribute('aria-expanded', 'false');
      heading.classList.add('page-section-collapsible-heading');
      body.style.maxHeight = '0px';

      return { section, body };
    })
    .filter(Boolean);

  if (!preparedSections.length) return;

  const collapseSection = (entry) => {
    entry.section.classList.add('is-collapsed');
    entry.section.classList.remove('is-expanded');
    entry.section.setAttribute('aria-expanded', 'false');
    entry.body.style.maxHeight = '0px';
  };

  const expandSection = (entry) => {
    entry.section.classList.remove('is-collapsed');
    entry.section.classList.add('is-expanded');
    entry.section.setAttribute('aria-expanded', 'true');
    entry.body.style.maxHeight = `${entry.body.scrollHeight}px`;
  };

  const openOnly = (targetSection) => {
    preparedSections.forEach((entry) => {
      if (entry.section === targetSection) {
        expandSection(entry);
      } else {
        collapseSection(entry);
      }
    });
  };

  preparedSections.forEach((entry) => {
    entry.section.addEventListener('click', () => {
      openOnly(entry.section);
    });

    entry.section.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openOnly(entry.section);
    });
  });

  window.addEventListener('resize', () => {
    preparedSections.forEach((entry) => {
      if (!entry.section.classList.contains('is-expanded')) return;
      entry.body.style.maxHeight = `${entry.body.scrollHeight}px`;
    });
  });
};

export const renderSite = (siteContent, page) => {
  document.title = page.metaTitle;
  upsertDescriptionMeta(page.metaDescription);
  upsertFavicon(siteContent.school.logoPath);
  const themeBackgroundImage = (siteContent.school?.themeBackgroundImage || '').trim();
  const themeBackgroundAttr = themeBackgroundImage.replace(/"/g, '&quot;');

  const sectionIndexes = page.sections.map((_, index) => index);
  const preferredSectionOrder = Array.isArray(page.sectionOrder)
    ? page.sectionOrder
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value < page.sections.length)
    : [];
  const orderedSectionIndexes = [
    ...preferredSectionOrder,
    ...sectionIndexes.filter((index) => !preferredSectionOrder.includes(index))
  ];

  const rawPageOrder = Array.isArray(page.pageOrder)
    ? page.pageOrder.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const validSectionTokens = new Set(orderedSectionIndexes.map((index) => `section:${index}`));
  const hasNotice = Boolean(page.hero?.notice);
  const isDesktopViewport = window.matchMedia('(min-width: 860px)').matches;
  const useDesktopHomeHeroNoticeSplit = page.key === 'home' && hasNotice && isDesktopViewport;
  const normalizedPageOrder = rawPageOrder.filter(
    (token) => token === 'hero_intro' || (token === 'hero_notice' && hasNotice) || validSectionTokens.has(token)
  );

  const renderedTokens = new Set();
  const appendToken = (token, parts) => {
    if (renderedTokens.has(token)) return;
    renderedTokens.add(token);

    if (token === 'hero_intro') {
      parts.push(renderHero(page.hero, page.key, { includeNotice: useDesktopHomeHeroNoticeSplit }));
      if (useDesktopHomeHeroNoticeSplit) {
        renderedTokens.add('hero_notice');
      }
      return;
    }

    if (token === 'hero_notice') {
      if (useDesktopHomeHeroNoticeSplit) {
        return;
      }
      parts.push(renderHeroNotice(page.hero, page.key));
      return;
    }

    if (token.startsWith('section:')) {
      const index = Number(token.slice('section:'.length));
      if (Number.isInteger(index) && index >= 0 && index < page.sections.length) {
        parts.push(renderSectionByIndex(page.sections, index, { pageKey: page.key, siteContent, page }));
      }
    }
  };

  const mainBlocks = [];
  if (normalizedPageOrder.length) {
    normalizedPageOrder.forEach((token) => appendToken(token, mainBlocks));
  }

  if (!renderedTokens.has('hero_intro')) {
    mainBlocks.unshift(renderHero(page.hero, page.key, { includeNotice: useDesktopHomeHeroNoticeSplit }));
    renderedTokens.add('hero_intro');
    if (useDesktopHomeHeroNoticeSplit) {
      renderedTokens.add('hero_notice');
    }
  }

  if (hasNotice && !renderedTokens.has('hero_notice') && !useDesktopHomeHeroNoticeSplit) {
    mainBlocks.splice(1, 0, renderHeroNotice(page.hero, page.key));
    renderedTokens.add('hero_notice');
  }

  orderedSectionIndexes.forEach((index) => {
    const token = `section:${index}`;
    if (renderedTokens.has(token)) return;
    appendToken(token, mainBlocks);
  });

  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader(siteContent, page.key)}
    <main id="main-content" class="${themeBackgroundImage ? 'has-theme-bg' : ''}" data-theme-bg-url="${themeBackgroundAttr}">
      ${mainBlocks.join('') || renderSectionsWithContext(page.sections, { pageKey: page.key, siteContent, page })}
      ${renderPageEmailForms(page.key)}
    </main>
    ${renderFooter(siteContent)}
  `;

  const header = app.querySelector('.site-header');
  const headerBgUrl = header?.dataset?.headerBgUrl?.trim();
  if (header && headerBgUrl) {
    const safeHeaderBgUrl = headerBgUrl.replace(/"/g, '\\"');
    header.style.setProperty('--header-bg-image', `url("${safeHeaderBgUrl}")`);
  }

  const main = app.querySelector('#main-content');
  const themeBgUrl = main?.dataset?.themeBgUrl?.trim();
  if (main && themeBgUrl) {
    const safeThemeBgUrl = themeBgUrl.replace(/"/g, '\\"');
    main.style.setProperty('--site-theme-bg-image', `url("${safeThemeBgUrl}")`);
  }

  bindMobileNav();
  initLatestNewsRotators();
  initLatestNewsReaders();
  initMatchEventLogs();
  initFixtureCreators();
  initSchoolCalendars();
  initCollapsiblePageSections(page.key);
};
