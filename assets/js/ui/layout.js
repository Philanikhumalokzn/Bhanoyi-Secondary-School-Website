import {
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

const initHomeMobileCarousel = (pageKey) => {
  if (pageKey !== 'home') {
    return;
  }

  const carousel = document.querySelector('[data-mobile-home-carousel]');
  if (!carousel) {
    return;
  }

  const track = carousel.querySelector('[data-mobile-home-track]');
  const dotsRoot = carousel.querySelector('[data-mobile-home-dots]');
  if (!track) {
    return;
  }

  const slides = Array.from(track.querySelectorAll('[data-mobile-home-slide]'));
  if (slides.length <= 1) {
    return;
  }

  const isMobileViewport = () => window.matchMedia('(max-width: 860px)').matches;
  let activeIndex = 0;
  let autoTimer = null;

  const dots = dotsRoot
    ? Array.from(dotsRoot.querySelectorAll('[data-mobile-home-dot]'))
    : [];

  const syncDots = () => {
    dots.forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.classList.toggle('is-active', isActive);
      dot.setAttribute('aria-current', isActive ? 'true' : 'false');
    });
  };

  const scrollToIndex = (index, behavior = 'smooth') => {
    if (!isMobileViewport()) {
      return;
    }
    activeIndex = (index + slides.length) % slides.length;
    const target = slides[activeIndex];
    track.scrollTo({
      left: target.offsetLeft,
      behavior
    });
    syncDots();
  };

  const syncIndexFromScroll = () => {
    if (!isMobileViewport()) {
      return;
    }
    const viewportCenter = track.scrollLeft + track.clientWidth / 2;
    let nearestIndex = activeIndex;
    let nearestDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, index) => {
      const center = slide.offsetLeft + slide.clientWidth / 2;
      const distance = Math.abs(center - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    activeIndex = nearestIndex;
    syncDots();
  };

  const stopAuto = () => {
    if (autoTimer) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }
  };

  const startAuto = () => {
    stopAuto();
    if (!isMobileViewport()) {
      return;
    }
    autoTimer = window.setInterval(() => {
      scrollToIndex(activeIndex + 1);
    }, 5000);
  };

  let scrollDebounce = null;
  track.addEventListener(
    'scroll',
    () => {
      if (!isMobileViewport()) {
        return;
      }
      if (scrollDebounce) {
        window.clearTimeout(scrollDebounce);
      }
      scrollDebounce = window.setTimeout(() => {
        syncIndexFromScroll();
        startAuto();
      }, 120);
    },
    { passive: true }
  );

  track.addEventListener(
    'pointerdown',
    () => {
      stopAuto();
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    if (!isMobileViewport()) {
      stopAuto();
      return;
    }
    scrollToIndex(activeIndex, 'auto');
    startAuto();
  });

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      stopAuto();
      scrollToIndex(index);
      startAuto();
    });
  });

  if (isMobileViewport()) {
    scrollToIndex(0, 'auto');
    startAuto();
  }
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
  const normalizedPageOrder = rawPageOrder.filter(
    (token) => token === 'hero_intro' || (token === 'hero_notice' && hasNotice) || validSectionTokens.has(token)
  );

  const renderedTokens = new Set();
  const appendToken = (token, parts) => {
    if (renderedTokens.has(token)) return;
    renderedTokens.add(token);

    if (token === 'hero_intro') {
      parts.push(renderHero(page.hero, page.key, { includeNotice: false }));
      return;
    }

    if (token === 'hero_notice') {
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
    mainBlocks.unshift(renderHero(page.hero, page.key, { includeNotice: false }));
    renderedTokens.add('hero_intro');
  }

  if (hasNotice && !renderedTokens.has('hero_notice')) {
    mainBlocks.splice(1, 0, renderHeroNotice(page.hero, page.key));
    renderedTokens.add('hero_notice');
  }

  orderedSectionIndexes.forEach((index) => {
    const token = `section:${index}`;
    if (renderedTokens.has(token)) return;
    appendToken(token, mainBlocks);
  });

  const app = document.getElementById('app');
  const renderedMainBlocks = page.key === 'home'
    ? `<div class="mobile-home-carousel" data-mobile-home-carousel><div class="mobile-home-track" data-mobile-home-track>${mainBlocks
        .map((block, index) => `<div class="mobile-home-slide" data-mobile-home-slide="${index}">${block}</div>`)
      .join('')}</div><div class="mobile-home-dots" data-mobile-home-dots>${mainBlocks
      .map((_, index) => `<button type="button" class="mobile-home-dot ${index === 0 ? 'is-active' : ''}" data-mobile-home-dot="${index}" aria-label="Go to section ${index + 1}" aria-current="${index === 0 ? 'true' : 'false'}"></button>`)
      .join('')}</div></div>`
    : mainBlocks.join('') || renderSectionsWithContext(page.sections, { pageKey: page.key, siteContent, page });
  app.innerHTML = `
    ${renderHeader(siteContent, page.key)}
    <main id="main-content" class="${themeBackgroundImage ? 'has-theme-bg' : ''}" data-theme-bg-url="${themeBackgroundAttr}">
      ${renderedMainBlocks}
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
  initHomeMobileCarousel(page.key);
};
