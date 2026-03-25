let componentsModulePromise;

const loadComponentsModule = () => {
  if (!componentsModulePromise) {
    componentsModulePromise = import('./components.js');
  }

  return componentsModulePromise;
};

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

const installPublicCrudSurfaceGuard = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === '1' || params.get('staff') === '1') return;
  if (document.body.dataset.publicCrudGuardInstalled === 'true') return;

  // If another initialization path has already determined the audience
  // (e.g. `renderSite` detected an active admin/staff session and set
  // `document.body.dataset.audience`), respect that and avoid sanitizing
  // the DOM. This prevents a race where components render admin controls
  // then the guard later removes them because it couldn't detect the
  // session fast enough.
  try {
    const existingAudience = String(document.body.dataset.audience || '').trim();
    if (existingAudience === 'admin' || existingAudience === 'staff') {
      document.body.dataset.publicCrudGuardInstalled = 'true';
      return;
    }
  } catch {
    // ignore and continue with the async detection below
  }

  // If the URL doesn't explicitly request admin/staff, detect a signed-in
  // admin session asynchronously (e.g. Supabase). If a session exists, do
  // not sanitize the DOM. This prevents logged-in admins from losing admin
  // controls when `?admin=1` is not present.
  (async () => {
    try {
      const api = await import('../admin/api.ts');
      if (api && typeof api.getSession === 'function') {
        const session = await api.getSession().catch(() => null);
        if (session) {
          // mark installed to avoid repeated work and exit without sanitizing
          document.body.dataset.publicCrudGuardInstalled = 'true';
          return;
        }
      }
    } catch {
      // ignore and fall back to sanitizing
    }

    const sensitiveSelectors = [
    '[data-post-news]',
    '[data-standings-export]',
    '[data-standings-export-combined]',
    '[data-match-export]',
    '[data-match-reset]',
    '[data-match-clock-start]',
    '[data-match-pause]',
    '[data-match-resume]',
    '[data-match-open-event-side]',
    '[data-match-save-log]',
    '[data-match-edit-event]',
    '[data-match-delete-event]',
    '[data-fixture-generate]',
    '[data-fixture-export]',
    '[data-fixture-export-csv]',
    '[data-fixture-open-fairness-modal]',
    '[data-fixture-rules-preview]',
    '[data-fixture-rules-save]',
    '[data-fixture-approve-resolved]',
    '[data-fixture-approve-anyway]',
    '[data-fixture-save-draft]',
    '[data-enrollment-admin-only]',
    '[data-enrollment-add-staff]',
    '[data-enrollment-open-add-grade]',
    '[data-enrollment-import-learners]',
    '[data-enrollment-bulk-import-learners]',
    '[data-enrollment-add-learner]',
    '[data-calendar-admin-only]',
    '[data-calendar-save]',
    '[data-calendar-new]',
    '[data-calendar-delete]',
    '[data-event-type-add]',
    '[data-event-types-save]',
    '[data-terms-save]',
    '[data-calendar-day-event-delete]',
    '.calendar-color-popover'
  ];

  const sanitize = (root = document) => {
    sensitiveSelectors.forEach((selector) => {
      root.querySelectorAll(selector).forEach((node) => node.remove());
    });

    root.querySelectorAll('[data-editable-card], [data-editable-section]').forEach((node) => {
      node.removeAttribute('data-editable-card');
      node.removeAttribute('data-editable-section');
    });
  };

    sanitize(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          sanitize(node);
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    document.body.dataset.publicCrudGuardInstalled = 'true';
  })();
};

const initCollapsiblePageSections = (pageKey) => {
  const key = String(pageKey || '').trim().toLowerCase();
  if (key !== 'sports') return;

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

      return { section, body, heading, container };
    })
    .filter(Boolean);

  if (!preparedSections.length) return;

  const refreshExpandedSectionHeights = () => {
    preparedSections.forEach((entry) => {
      if (!entry.section.classList.contains('is-expanded')) return;
      entry.body.style.maxHeight = `${entry.body.scrollHeight}px`;
    });
  };

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

  const toggleSection = (entry) => {
    if (entry.section.classList.contains('is-expanded')) {
      collapseSection(entry);
      return;
    }
    openOnly(entry.section);
  };

  const isInteractiveTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        'a, button, input, select, textarea, label, summary, [contenteditable="true"], [data-no-section-toggle]'
      )
    );
  };

  preparedSections.forEach((entry) => {
    entry.section.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (target instanceof Element && isInteractiveTarget(target)) {
        return;
      }

      const clickedInBody = entry.body.contains(target);
      if (clickedInBody) {
        return;
      }

      toggleSection(entry);
    });

    entry.section.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (isInteractiveTarget(target)) return;

      const originatedOnSection = target === entry.section;
      const originatedOnHeading = entry.heading.contains(target);
      if (!originatedOnSection && !originatedOnHeading) return;

      event.preventDefault();
      toggleSection(entry);
    });
  });

  window.addEventListener('resize', () => {
    refreshExpandedSectionHeights();
  });

  if (typeof ResizeObserver === 'function') {
    preparedSections.forEach((entry) => {
      const observer = new ResizeObserver(() => {
        refreshExpandedSectionHeights();
      });
      observer.observe(entry.body);
      const container = entry.body.firstElementChild;
      if (container instanceof HTMLElement) {
        observer.observe(container);
      }
    });
  }
};

// Global logout widget: appears bottom-right on all pages when a user is logged in (admin or staff)
const installGlobalLogout = () => {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector('.global-logout-wrap');
  if (existing) return;

  const wrap = document.createElement('div');
  wrap.className = 'global-logout-wrap';
  wrap.style.position = 'fixed';
  wrap.style.right = '16px';
  wrap.style.bottom = '16px';
  wrap.style.zIndex = '1100';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary global-logout-btn';
  btn.textContent = 'Logout';
  btn.style.display = 'none';

  btn.addEventListener('click', async () => {
    // clear staff session storage keys
    try {
      const toRemove = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const k = sessionStorage.key(i);
        if (!k) continue;
        if (k.startsWith('bhanoyi.staffSession.') || k.startsWith('bhanoyi.staffSessionPassword.')) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // ignore
    }

    // attempt to sign out Supabase admin session if present
    try {
      const api = await import('../admin/api.ts');
      if (api && typeof api.signOut === 'function') {
        await api.signOut();
      }
    } catch {
      // ignore
    }

    // reload to reflect logged-out state
    window.location.reload();
  });

  wrap.appendChild(btn);
  document.body.appendChild(wrap);

  const detect = async () => {
    try {
      let visible = false;

      // detect staff session keys
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const k = sessionStorage.key(i);
        if (!k) continue;
        if (k.startsWith('bhanoyi.staffSession.') && String(sessionStorage.getItem(k) || '').trim()) {
          visible = true;
          break;
        }
      }

      // detect Supabase admin session
      if (!visible) {
        try {
          const api = await import('../admin/api.ts');
          if (api && typeof api.getSession === 'function') {
            const session = await api.getSession().catch(() => null);
            if (session) visible = true;
          }
        } catch {
          // ignore
        }
      }

      btn.style.display = visible ? '' : 'none';
    } catch {
      btn.style.display = 'none';
    }
  };

  detect();
    window.addEventListener('storage', detect);
  
    
};

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    try {
      installGlobalLogout();
    } catch {}
  });
}

export const renderSite = async (siteContent, page) => {
  const params = new URLSearchParams(window.location.search);
  const requestedAdminMode = params.get('admin') === '1';
  let adminMode = requestedAdminMode;
  let staffMode = !adminMode && params.get('staff') === '1';

  const configuredAdminEmails = String(import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);

  const isAllowedAdminEmail = (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !configuredAdminEmails.length) return false;
    return configuredAdminEmails.includes(normalizedEmail);
  };

  const clearAdminQueryFlag = () => {
    try {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('admin');
      window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    } catch {
      // ignore URL cleanup failures
    }
  };

  const resolveAllowedAdminSession = async () => {
    try {
      const api = await import('../admin/api.ts');
      if (!api || typeof api.getSession !== 'function') return null;
      const session = await api.getSession().catch(() => null);
      const email = String(session?.user?.email || '').trim().toLowerCase();
      if (!session || !isAllowedAdminEmail(email)) return null;
      return session;
    } catch {
      return null;
    }
  };

  if (requestedAdminMode) {
    const allowedAdminSession = await resolveAllowedAdminSession();
    if (!allowedAdminSession) {
      adminMode = false;
      clearAdminQueryFlag();
    }
  }

  // If no explicit URL flag is present, try to detect a signed-in admin session
  // (e.g. Supabase session). This ensures admin UI surfaces appear for signed-in
  // admins without needing the `?admin=1` query param before components load.
  if (!adminMode && !staffMode) {
    const allowedAdminSession = await resolveAllowedAdminSession();
    if (allowedAdminSession) {
      adminMode = true;
    }
  }

  document.body.dataset.audience = adminMode ? 'admin' : staffMode ? 'staff' : 'public';

  const {
    initFixtureCreators,
    initPublicFixtureBoards,
    initEnrollmentManagers,
    initLeagueStandings,
    initMatchEventLogs,
    initSchoolCalendars,
    initLatestNewsReaders,
    initLatestNewsRotators,
    renderFooter,
    renderHeader,
    renderSectionByIndex,
    renderPageEmailForms,
    renderSectionsWithContext
  } = await loadComponentsModule();

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
  const normalizedPageOrder = rawPageOrder.filter((token) => validSectionTokens.has(token));

  const renderedTokens = new Set();
  const appendToken = (token, parts) => {
    if (renderedTokens.has(token)) return;
    renderedTokens.add(token);

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
  initPublicFixtureBoards();
  initLeagueStandings();
  initSchoolCalendars();
  initEnrollmentManagers();
  installPublicCrudSurfaceGuard();
};
