import {
  initLatestNewsReaders,
  initLatestNewsRotators,
  renderFooter,
  renderHeader,
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

export const renderSite = (siteContent, page) => {
  document.title = page.metaTitle;
  upsertDescriptionMeta(page.metaDescription);
  upsertFavicon(siteContent.school.logoPath);
  const themeBackgroundImage = (siteContent.school?.themeBackgroundImage || '').trim();
  const themeBackgroundAttr = themeBackgroundImage.replace(/"/g, '&quot;');

  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader(siteContent, page.key)}
    <main id="main-content" class="${themeBackgroundImage ? 'has-theme-bg' : ''}" data-theme-bg-url="${themeBackgroundAttr}">
      ${renderHero(page.hero, page.key)}
      ${renderSectionsWithContext(page.sections, { pageKey: page.key, siteContent, page })}
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
};
