import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

const escapeHtmlAttribute = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeHtmlText = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const stripHtmlTags = (value = '') =>
  String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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

const parseNewsDate = (value) => {
  const raw = (value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const formatNewsDateLabel = (value) => {
  const parsed = parseNewsDate(value) || new Date();
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(parsed);
};

const estimateReadTimeMinutes = (text) => {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
};

const buildNewsMetadata = (item = {}) => {
  const source = item && typeof item === 'object' ? item : {};
  const author = (source.author || source.byline || source.reporter || 'Bhanoyi News Desk').trim() || 'Bhanoyi News Desk';
  const location = (source.location || source.dateline || source.campus || 'Bhanoyi Secondary School').trim() || 'Bhanoyi Secondary School';
  const rawDate = (source.postedAt || source.publishedAt || source.publishedDate || source.date || '').trim();
  const date = parseNewsDate(rawDate) || new Date();
  const publishedLabel = formatNewsDateLabel(rawDate);
  const publishedIso = date.toISOString().split('T')[0];
  const readTimeMinutes = estimateReadTimeMinutes(source.body || '');
  const readTimeLabel = `${readTimeMinutes} min read`;

  return {
    author,
    location,
    publishedLabel,
    publishedIso,
    readTimeLabel
  };
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
  const cardClass = hasImage ? 'card card-has-media' : 'card';
  const content = `
    <img class="card-image ${hasImage ? '' : 'is-hidden'}" src="${hasImage ? primaryImageUrl : ''}" alt="${item.title}" loading="lazy" />
    <div class="card-content">
      <h3>${item.title}</h3>
      <p>${item.body}</p>
    </div>
  `;
  if (clickable) {
    return `<a class="${cardClass}" href="${item.href || '#'}" ${attrs}>${content}</a>`;
  }
  return `<article class="${cardClass}" ${attrs}>${content}</article>`;
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

const isAdminModeEnabled = () => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('admin') === '1';
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
                      const metadata = buildNewsMetadata(item);
                      const imageUrls = parseCardImageUrls(item.imageUrl || '');
                      const primaryImageUrl = imageUrls[0] || '';
                      const imageData = serializeCardImageUrls(imageUrls);
                      const hasImage = Boolean(primaryImageUrl);
                      const normalizedSubtitle = (item.subtitle || '').trim();
                      const fallbackHeading = item.title;
                      const showSubtitle = Boolean(normalizedSubtitle) && normalizedSubtitle.toLowerCase() !== item.title.toLowerCase();
                      const bodyHtml = (item.body || '').trim();
                      const bodyPreview = stripHtmlTags(bodyHtml);
                      const attrs = [
                        section.editable ? 'data-editable-card="true"' : '',
                        section.sectionKey ? `data-section-key="${section.sectionKey}"` : '',
                        item.id ? `data-card-id="${item.id}"` : '',
                        `data-card-category="${category}"`,
                        `data-card-subtitle="${item.subtitle || ''}"`,
                        `data-card-author="${escapeHtmlAttribute(metadata.author)}"`,
                        `data-card-location="${escapeHtmlAttribute(metadata.location)}"`,
                        `data-card-date="${escapeHtmlAttribute(metadata.publishedLabel)}"`,
                        `data-card-date-iso="${escapeHtmlAttribute(metadata.publishedIso)}"`,
                        `data-card-read-time="${escapeHtmlAttribute(metadata.readTimeLabel)}"`,
                        `data-card-body-html="${escapeHtmlAttribute(bodyHtml)}"`,
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
                            <p class="latest-news-meta" aria-label="Article metadata">
                              <span class="latest-news-meta-item"><time datetime="${metadata.publishedIso}">${metadata.publishedLabel}</time></span>
                              <span class="latest-news-meta-item">${metadata.location}</span>
                              <span class="latest-news-meta-item">By ${metadata.author}</span>
                              <span class="latest-news-meta-item">${metadata.readTimeLabel}</span>
                            </p>
                            <h3 class="latest-news-title ${hasImage ? '' : 'is-hidden'}">${item.title}</h3>
                            ${showSubtitle ? `<p class="latest-news-subtitle ${hasImage ? '' : 'is-hidden'}">${normalizedSubtitle}</p>` : ''}
                            <div class="latest-news-preview ${hasImage ? '' : 'is-hidden'}">
                              <div class="latest-news-body">${bodyPreview}</div>
                              <span class="latest-news-read-more">Read more</span>
                            </div>
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
              <div class="latest-news-side-content">
                <h3>${sidePanel.title || 'Principal’s Welcome'}</h3>
                <p>${sidePanel.body || ''}</p>
                ${sidePanel.link ? `<a href="${sidePanel.link.href || '#'}">${sidePanel.link.label || 'Read more'}</a>` : ''}
              </div>
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

const DEFAULT_MATCH_EVENT_TYPES = [
  { key: 'goal', label: 'Goal', icon: '⚽', scoreFor: 'self', allowAssist: true, playerLabel: 'Scorer' },
  { key: 'penalty_goal', label: 'Penalty Goal', icon: '⚽', scoreFor: 'self', allowAssist: false, playerLabel: 'Scorer' },
  { key: 'own_goal', label: 'Own Goal', icon: '⚽', scoreFor: 'opponent', allowAssist: false, playerLabel: 'Player' },
  { key: 'yellow_card', label: 'Yellow Card', icon: '🟨', scoreFor: 'none', allowAssist: false, playerLabel: 'Booked Player' },
  { key: 'red_card', label: 'Red Card', icon: '🟥', scoreFor: 'none', allowAssist: false, playerLabel: 'Sent-off Player' },
  { key: 'injury', label: 'Injury', icon: '🩹', scoreFor: 'none', allowAssist: false, playerLabel: 'Injured Player' },
  { key: 'substitution', label: 'Substitution', icon: '🔁', scoreFor: 'none', allowAssist: false, playerLabel: 'Player' }
];

const normalizeMatchTeams = (sectionTeams = []) => {
  const candidates = Array.isArray(sectionTeams) ? sectionTeams : [];
  const normalized = candidates
    .map((entry, index) => {
      const source = entry && typeof entry === 'object' ? entry : { name: String(entry || '').trim() };
      const name = (source.name || `Team ${index + 1}`).trim() || `Team ${index + 1}`;
      const id = (source.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `team_${index + 1}`).trim();
      const shortName = (source.shortName || name).trim() || name;
      return { id, name, shortName };
    })
    .filter((entry, index, list) =>
      entry.id &&
      entry.name &&
      list.findIndex((candidate) => candidate.id === entry.id) === index
    );

  if (normalized.length >= 2) return normalized;
  return [
    { id: 'home', name: 'Home', shortName: 'Home' },
    { id: 'away', name: 'Away', shortName: 'Away' }
  ];
};

const normalizeMatchEventTypes = (sectionEventTypes = []) => {
  const configured = Array.isArray(sectionEventTypes) ? sectionEventTypes : [];
  if (!configured.length) {
    return DEFAULT_MATCH_EVENT_TYPES;
  }

  const fallbackByKey = new Map(DEFAULT_MATCH_EVENT_TYPES.map((entry) => [entry.key, entry]));
  const normalized = configured
    .map((entry) => {
      const source = entry && typeof entry === 'object' ? entry : { key: String(entry || '').trim() };
      const key = (source.key || '').trim();
      if (!key) return null;

      const fallback = fallbackByKey.get(key) || {};
      return {
        key,
        label: (source.label || fallback.label || key.replace(/_/g, ' ')).trim(),
        icon: (source.icon || fallback.icon || '•').trim(),
        scoreFor: source.scoreFor || fallback.scoreFor || 'none',
        allowAssist: source.allowAssist !== undefined ? Boolean(source.allowAssist) : Boolean(fallback.allowAssist),
        playerLabel: (source.playerLabel || fallback.playerLabel || 'Player').trim()
      };
    })
    .filter(Boolean);

  return normalized.length ? normalized : DEFAULT_MATCH_EVENT_TYPES;
};

const getDefaultMatchPair = (teams = [], leftCandidate = '', rightCandidate = '') => {
  const fallbackLeft = teams[0]?.id || '';
  const resolvedLeft = teams.some((team) => team.id === leftCandidate) ? leftCandidate : fallbackLeft;
  const firstDifferentTeam = teams.find((team) => team.id !== resolvedLeft)?.id || resolvedLeft;
  const resolvedRight = teams.some((team) => team.id === rightCandidate) && rightCandidate !== resolvedLeft
    ? rightCandidate
    : firstDifferentTeam;

  return {
    leftTeamId: resolvedLeft,
    rightTeamId: resolvedRight
  };
};

const renderMatchLogSection = (section, sectionIndex) => {
  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;
  const houseOptions = normalizeMatchTeams(
    Array.isArray(section.houseOptions) && section.houseOptions.length
      ? section.houseOptions
      : section.teams
  );
  const teamPair = getDefaultMatchPair(houseOptions, section.leftTeamId || '', section.rightTeamId || '');
  const eventTypes = normalizeMatchEventTypes(section.eventTypes);
  const initialScores = houseOptions.reduce((acc, team) => {
    const raw = Number(section.initialScores?.[team.id]);
    acc[team.id] = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
    return acc;
  }, {});

  const config = {
    sectionKey: fallbackSectionKey,
    sport: (section.sport || 'Football').trim() || 'Football',
    competition: (section.competition || 'Friendly Match').trim() || 'Friendly Match',
    venue: (section.venue || '').trim(),
    houseOptions,
    leftTeamId: teamPair.leftTeamId,
    rightTeamId: teamPair.rightTeamId,
    eventTypes,
    initialScores
  };

  const leftTeam = houseOptions.find((team) => team.id === teamPair.leftTeamId) || houseOptions[0];
  const rightTeam = houseOptions.find((team) => team.id === teamPair.rightTeamId) || houseOptions[1] || leftTeam;
  const renderHouseOptions = (selectedId) =>
    houseOptions
      .map((team) => `<option value="${team.id}"${team.id === selectedId ? ' selected' : ''}>${team.name}</option>`)
      .join('');

  return `
    <section class="section ${section.alt ? 'section-alt' : ''}" data-editable-section="true" data-section-index="${sectionIndex}" data-section-type="match-log" data-section-key="${fallbackSectionKey}">
      <div class="container">
        <h2>${section.title || 'Live Match Event Log'}</h2>
        ${section.body ? `<p class="lead">${section.body}</p>` : ''}
        <article class="panel match-log-shell" data-match-log="true" data-match-log-id="${fallbackSectionKey}" data-match-log-config="${escapeHtmlAttribute(JSON.stringify(config))}">
          <header class="match-log-header">
            <div>
              <p class="match-log-meta"><strong>${config.sport}</strong> · ${config.competition}${config.venue ? ` · ${config.venue}` : ''}</p>
              <p class="match-log-status" data-match-status aria-live="polite">No events logged yet.</p>
            </div>
            <div class="match-log-header-actions">
              <button type="button" class="btn btn-secondary" data-match-export>Export match log</button>
              <button type="button" class="btn btn-secondary" data-match-reset>Reset log</button>
            </div>
          </header>
          <div class="match-log-team-pickers">
            <label>
              Left column
              <select data-team-select="left">
                ${renderHouseOptions(leftTeam.id)}
              </select>
            </label>
            <label>
              Right column
              <select data-team-select="right">
                ${renderHouseOptions(rightTeam.id)}
              </select>
            </label>
          </div>
          <div class="match-log-table-wrap">
            <table class="match-log-table">
              <thead>
                <tr>
                  <th class="match-log-team-col">
                    <div class="match-log-team-head">
                      <h3 class="match-log-team-title">
                        <span class="match-log-team-name" data-left-team-name>${leftTeam.name}</span>
                        <span class="match-log-team-score">(<span data-left-team-score>${initialScores[leftTeam.id] || 0}</span>)</span>
                      </h3>
                      <button type="button" class="btn btn-secondary" data-match-open-event-side="left">Add event</button>
                    </div>
                  </th>
                  <th class="match-log-minute-col">Minute</th>
                  <th class="match-log-team-col">
                    <div class="match-log-team-head match-log-team-head-right">
                      <h3 class="match-log-team-title">
                        <span class="match-log-team-name" data-right-team-name>${rightTeam.name}</span>
                        <span class="match-log-team-score">(<span data-right-team-score>${initialScores[rightTeam.id] || 0}</span>)</span>
                      </h3>
                      <button type="button" class="btn btn-secondary" data-match-open-event-side="right">Add event</button>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody data-match-table-body>
                <tr>
                  <td class="match-log-empty-cell" colspan="3">No events logged yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="match-log-modal is-hidden" data-match-modal>
            <div class="match-log-modal-backdrop" data-match-close-modal></div>
            <article class="panel match-log-modal-panel" role="dialog" aria-modal="true" aria-label="Add match event">
              <h3 class="match-log-modal-title">Add match event</h3>
              <p class="match-log-modal-subtitle" data-match-modal-team></p>
              <section class="match-log-step" data-match-step="type">
                <h4>Select event type</h4>
                <div class="match-log-event-type-list" data-match-event-types></div>
                <div class="match-log-modal-actions">
                  <button type="button" class="btn btn-secondary" data-match-cancel>Cancel</button>
                  <button type="button" class="btn btn-primary" data-match-next disabled>Next</button>
                </div>
              </section>
              <section class="match-log-step is-hidden" data-match-step="details">
                <h4>Optional event details</h4>
                <form class="match-log-form" data-match-event-form>
                  <div class="match-log-form-grid">
                    <label>
                      Match minute
                      <input type="number" min="0" max="130" step="1" name="minute" inputmode="numeric" placeholder="e.g. 9" />
                    </label>
                    <label>
                      Stoppage (+)
                      <input type="number" min="0" max="30" step="1" name="stoppage" inputmode="numeric" placeholder="e.g. 2" />
                    </label>
                  </div>
                  <div class="match-log-form-grid">
                    <label data-player-label>
                      Player name
                      <input type="text" name="playerName" maxlength="120" placeholder="e.g. Sipho" />
                    </label>
                    <label>
                      Jersey number
                      <input type="text" name="jerseyNumber" maxlength="8" placeholder="e.g. 9" />
                    </label>
                  </div>
                  <label class="match-log-assist-row is-hidden" data-assist-row>
                    Assist by (optional)
                    <input type="text" name="assistName" maxlength="120" placeholder="e.g. Themba" />
                  </label>
                  <label>
                    Notes (optional)
                    <textarea name="notes" rows="3" maxlength="300" placeholder="Additional event context"></textarea>
                  </label>
                  <div class="match-log-modal-actions">
                    <button type="button" class="btn btn-secondary" data-match-back>Back</button>
                    <button type="button" class="btn btn-primary" data-match-save>Save event</button>
                  </div>
                </form>
              </section>
            </article>
          </div>
        </article>
      </div>
    </section>
  `;
};

const getMatchStorageKey = (sectionKey) => {
  const path = typeof window !== 'undefined' ? window.location.pathname : 'sports';
  return `bhanoyi.matchLog.${path}.${sectionKey}`;
};

const getOtherTeamId = (teamId, teams) => {
  const other = teams.find((entry) => entry.id !== teamId);
  return other ? other.id : teamId;
};

const formatMatchMinuteLabel = (minute, stoppage) => {
  if (!Number.isFinite(minute)) return '';
  const base = `${Math.max(0, Math.floor(minute))}`;
  if (Number.isFinite(stoppage) && stoppage > 0) {
    return `${base}+${Math.floor(stoppage)}'`;
  }
  return `${base}'`;
};

const renderMatchEventItem = (event, definition) => {
  const minute = formatMatchMinuteLabel(event.minute, event.stoppage);
  const playerParts = [event.playerName || '', event.jerseyNumber ? `#${event.jerseyNumber}` : ''].filter(Boolean);
  const playerLabel = playerParts.join(' ');
  const detailParts = [
    playerLabel,
    event.assistName ? `Assist: ${event.assistName}` : '',
    event.notes || ''
  ].filter(Boolean);

  return `
    <div class="match-log-event-item" data-event-type="${event.type}">
      <div class="match-log-event-main">
        <span class="match-log-event-icon" aria-hidden="true">${escapeHtmlText(definition?.icon || '•')}</span>
        <strong class="match-log-event-type">${escapeHtmlText(definition?.label || event.type)}</strong>
        ${minute ? `<span class="match-log-event-minute">${minute}</span>` : ''}
      </div>
      ${detailParts.length ? `<p class="match-log-event-detail">${escapeHtmlText(detailParts.join(' · '))}</p>` : ''}
    </div>
  `;
};

const hydrateMatchLog = (matchLogNode) => {
  const rawConfig = (matchLogNode.dataset.matchLogConfig || '').trim();
  if (!rawConfig) return;

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch {
    return;
  }

  const teams = normalizeMatchTeams(config.houseOptions || config.teams);
  if (teams.length < 2) return;
  const persistedPair = getDefaultMatchPair(teams, config.leftTeamId || '', config.rightTeamId || '');
  const eventTypes = normalizeMatchEventTypes(config.eventTypes);
  const eventTypeByKey = new Map(eventTypes.map((entry) => [entry.key, entry]));
  const initialScores = teams.reduce((acc, team) => {
    const raw = Number(config.initialScores?.[team.id]);
    acc[team.id] = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
    return acc;
  }, {});

  const statusNode = matchLogNode.querySelector('[data-match-status]');
  const leftNameNode = matchLogNode.querySelector('[data-left-team-name]');
  const rightNameNode = matchLogNode.querySelector('[data-right-team-name]');
  const leftScoreNode = matchLogNode.querySelector('[data-left-team-score]');
  const rightScoreNode = matchLogNode.querySelector('[data-right-team-score]');
  const tableBodyNode = matchLogNode.querySelector('[data-match-table-body]');
  const leftTeamSelect = matchLogNode.querySelector('[data-team-select="left"]');
  const rightTeamSelect = matchLogNode.querySelector('[data-team-select="right"]');
  const modal = matchLogNode.querySelector('[data-match-modal]');
  const teamLabel = matchLogNode.querySelector('[data-match-modal-team]');
  const exportButton = matchLogNode.querySelector('[data-match-export]');
  const typeStep = matchLogNode.querySelector('[data-match-step="type"]');
  const detailsStep = matchLogNode.querySelector('[data-match-step="details"]');
  const typeListNode = matchLogNode.querySelector('[data-match-event-types]');
  const nextButton = matchLogNode.querySelector('[data-match-next]');
  const backButton = matchLogNode.querySelector('[data-match-back]');
  const saveButton = matchLogNode.querySelector('[data-match-save]');
  const cancelButtons = Array.from(matchLogNode.querySelectorAll('[data-match-cancel], [data-match-close-modal]'));
  const eventForm = matchLogNode.querySelector('[data-match-event-form]');
  const playerLabelNode = matchLogNode.querySelector('[data-player-label]');
  const assistRow = matchLogNode.querySelector('[data-assist-row]');
  const minuteInput = eventForm?.querySelector('input[name="minute"]');
  const stoppageInput = eventForm?.querySelector('input[name="stoppage"]');
  const playerInput = eventForm?.querySelector('input[name="playerName"]');
  const jerseyInput = eventForm?.querySelector('input[name="jerseyNumber"]');
  const assistInput = eventForm?.querySelector('input[name="assistName"]');
  const notesInput = eventForm?.querySelector('textarea[name="notes"]');

  if (!modal || !typeStep || !detailsStep || !typeListNode || !nextButton || !backButton || !saveButton || !eventForm) {
    return;
  }

  const storageKey = getMatchStorageKey(matchLogNode.dataset.matchLogId || config.sectionKey || 'sports_log');
  let state = {
    events: [],
    leftTeamId: persistedPair.leftTeamId,
    rightTeamId: persistedPair.rightTeamId
  };
  let activeTeamId = state.leftTeamId;
  let selectedTypeKey = '';

  const saveState = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      return;
    }
  };

  const loadState = () => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!parsed || !Array.isArray(parsed.events)) return;
      const pair = getDefaultMatchPair(teams, parsed.leftTeamId || state.leftTeamId, parsed.rightTeamId || state.rightTeamId);
      state = {
        leftTeamId: pair.leftTeamId,
        rightTeamId: pair.rightTeamId,
        events: parsed.events
          .filter((entry) => entry && typeof entry === 'object' && eventTypeByKey.has(entry.type))
          .map((entry) => ({
            id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            teamId: teams.some((team) => team.id === entry.teamId) ? entry.teamId : teams[0].id,
            type: entry.type,
            minute: Number.isFinite(Number(entry.minute)) ? Number(entry.minute) : null,
            stoppage: Number.isFinite(Number(entry.stoppage)) ? Number(entry.stoppage) : null,
            playerName: (entry.playerName || '').trim(),
            jerseyNumber: (entry.jerseyNumber || '').trim(),
            assistName: (entry.assistName || '').trim(),
            notes: (entry.notes || '').trim(),
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now()
          }))
      };
    } catch {
      state = {
        events: [],
        leftTeamId: persistedPair.leftTeamId,
        rightTeamId: persistedPair.rightTeamId
      };
    }
  };

  const getCurrentTeams = () => {
    const pair = getDefaultMatchPair(teams, state.leftTeamId, state.rightTeamId);
    const leftTeam = teams.find((team) => team.id === pair.leftTeamId) || teams[0];
    const rightTeam = teams.find((team) => team.id === pair.rightTeamId) || teams.find((team) => team.id !== leftTeam.id) || leftTeam;
    return {
      leftTeam,
      rightTeam
    };
  };

  const computeScores = (leftTeamId, rightTeamId) => {
    const scores = { ...initialScores };
    const selectedTeamIds = new Set([leftTeamId, rightTeamId]);
    state.events.forEach((event) => {
      if (!selectedTeamIds.has(event.teamId)) return;
      const definition = eventTypeByKey.get(event.type);
      if (!definition) return;

      if (definition.scoreFor === 'self') {
        scores[event.teamId] = (scores[event.teamId] || 0) + 1;
        return;
      }

      if (definition.scoreFor === 'opponent') {
        const opponentTeamId = getOtherTeamId(event.teamId, [
          { id: leftTeamId },
          { id: rightTeamId }
        ]);
        scores[opponentTeamId] = (scores[opponentTeamId] || 0) + 1;
      }
    });
    return scores;
  };

  const escapeCsvValue = (value) => {
    const normalized = String(value ?? '').replace(/"/g, '""');
    return `"${normalized}"`;
  };

  const buildMatchExportCsv = () => {
    const { leftTeam, rightTeam } = getCurrentTeams();
    const scores = computeScores(leftTeam.id, rightTeam.id);
    const teamSummary = `${leftTeam.name} ${scores[leftTeam.id] || 0} - ${scores[rightTeam.id] || 0} ${rightTeam.name}`;

    const lines = [
      ['Sport', config.sport || ''].map(escapeCsvValue).join(','),
      ['Competition', config.competition || ''].map(escapeCsvValue).join(','),
      ['Venue', config.venue || ''].map(escapeCsvValue).join(','),
      ['Score', teamSummary].map(escapeCsvValue).join(','),
      '',
      ['Team', 'Minute', 'Event', 'Player', 'Jersey', 'Assist', 'Notes'].map(escapeCsvValue).join(',')
    ];

    const events = state.events
      .filter((event) => event.teamId === leftTeam.id || event.teamId === rightTeam.id)
      .sort((left, right) => {
      const leftMinute = Number.isFinite(left.minute) ? left.minute : Number.MAX_SAFE_INTEGER;
      const rightMinute = Number.isFinite(right.minute) ? right.minute : Number.MAX_SAFE_INTEGER;
      if (leftMinute === rightMinute) {
        return (left.createdAt || 0) - (right.createdAt || 0);
      }
      return leftMinute - rightMinute;
      });

    events.forEach((event) => {
      const definition = eventTypeByKey.get(event.type);
      const teamName = event.teamId === leftTeam.id ? leftTeam.name : rightTeam.name;
      const minute = formatMatchMinuteLabel(event.minute, event.stoppage);
      const row = [
        teamName,
        minute,
        definition?.label || event.type,
        event.playerName || '',
        event.jerseyNumber || '',
        event.assistName || '',
        event.notes || ''
      ];
      lines.push(row.map(escapeCsvValue).join(','));
    });

    return lines.join('\n');
  };

  const render = () => {
    const { leftTeam, rightTeam } = getCurrentTeams();
    state.leftTeamId = leftTeam.id;
    state.rightTeamId = rightTeam.id;
    const scores = computeScores(leftTeam.id, rightTeam.id);

    if (leftNameNode) leftNameNode.textContent = leftTeam.name;
    if (rightNameNode) rightNameNode.textContent = rightTeam.name;
    if (leftScoreNode) leftScoreNode.textContent = String(scores[leftTeam.id] || 0);
    if (rightScoreNode) rightScoreNode.textContent = String(scores[rightTeam.id] || 0);

    if (leftTeamSelect instanceof HTMLSelectElement && leftTeamSelect.value !== leftTeam.id) {
      leftTeamSelect.value = leftTeam.id;
    }
    if (rightTeamSelect instanceof HTMLSelectElement && rightTeamSelect.value !== rightTeam.id) {
      rightTeamSelect.value = rightTeam.id;
    }

    const sortedEvents = state.events
      .filter((event) => event.teamId === leftTeam.id || event.teamId === rightTeam.id)
      .sort((left, right) => {
        const leftMinute = Number.isFinite(left.minute) ? left.minute : Number.MAX_SAFE_INTEGER;
        const rightMinute = Number.isFinite(right.minute) ? right.minute : Number.MAX_SAFE_INTEGER;
        if (leftMinute === rightMinute) {
          return (left.createdAt || 0) - (right.createdAt || 0);
        }
        return leftMinute - rightMinute;
      });

    const leftEvents = sortedEvents.filter((event) => event.teamId === leftTeam.id);
    const rightEvents = sortedEvents.filter((event) => event.teamId === rightTeam.id);

    if (tableBodyNode) {
      const rowCount = Math.max(leftEvents.length, rightEvents.length);
      if (!rowCount) {
        tableBodyNode.innerHTML = '<tr><td class="match-log-empty-cell" colspan="3">No events logged yet.</td></tr>';
      } else {
        const rows = [];
        for (let index = 0; index < rowCount; index += 1) {
          const leftEvent = leftEvents[index] || null;
          const rightEvent = rightEvents[index] || null;
          const referenceEvent = leftEvent || rightEvent;
          const minuteLabel = referenceEvent ? formatMatchMinuteLabel(referenceEvent.minute, referenceEvent.stoppage) : '';
          rows.push(`
            <tr>
              <td>${leftEvent ? renderMatchEventItem(leftEvent, eventTypeByKey.get(leftEvent.type)) : ''}</td>
              <td class="match-log-minute-cell">${escapeHtmlText(minuteLabel || '—')}</td>
              <td>${rightEvent ? renderMatchEventItem(rightEvent, eventTypeByKey.get(rightEvent.type)) : ''}</td>
            </tr>
          `);
        }
        tableBodyNode.innerHTML = rows.join('');
      }
    }

    const eventCount = sortedEvents.length;
    if (statusNode) {
      statusNode.textContent = eventCount ? `${eventCount} event${eventCount === 1 ? '' : 's'} logged.` : 'No events logged yet.';
    }
  };

  const resetModal = () => {
    selectedTypeKey = '';
    typeStep.classList.remove('is-hidden');
    detailsStep.classList.add('is-hidden');
    nextButton.disabled = true;
    typeListNode.innerHTML = eventTypes
      .map(
        (entry) => `
          <label class="match-log-event-option">
            <input type="radio" name="match-event-type" value="${entry.key}" />
            <span class="match-log-event-option-icon" aria-hidden="true">${escapeHtmlText(entry.icon)}</span>
            <span class="match-log-event-option-label">${escapeHtmlText(entry.label)}</span>
          </label>
        `
      )
      .join('');

    eventForm.reset();
    if (assistRow) {
      assistRow.classList.add('is-hidden');
    }
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    resetModal();
  };

  const openModalForTeam = (teamId) => {
    activeTeamId = teamId;
    const team = teams.find((entry) => entry.id === teamId);
    if (teamLabel) {
      teamLabel.textContent = `Team: ${team?.name || 'Selected team'}`;
    }
    resetModal();
    modal.classList.remove('is-hidden');
  };

  typeListNode.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== 'match-event-type') {
      return;
    }
    selectedTypeKey = target.value;
    nextButton.disabled = !selectedTypeKey;
  });

  nextButton.addEventListener('click', () => {
    if (!selectedTypeKey) return;
    const definition = eventTypeByKey.get(selectedTypeKey);
    if (!definition) return;

    if (playerLabelNode) {
      playerLabelNode.firstChild.textContent = `${definition.playerLabel || 'Player name'} `;
    }

    if (assistRow) {
      assistRow.classList.toggle('is-hidden', !definition.allowAssist);
      if (!definition.allowAssist && assistInput instanceof HTMLInputElement) {
        assistInput.value = '';
      }
    }

    typeStep.classList.add('is-hidden');
    detailsStep.classList.remove('is-hidden');
  });

  backButton.addEventListener('click', () => {
    detailsStep.classList.add('is-hidden');
    typeStep.classList.remove('is-hidden');
  });

  saveButton.addEventListener('click', () => {
    if (!selectedTypeKey || !eventTypeByKey.has(selectedTypeKey)) return;

    const minute = Number(minuteInput?.value);
    const stoppage = Number(stoppageInput?.value);
    const playerName = (playerInput?.value || '').trim();
    const jerseyNumber = (jerseyInput?.value || '').trim();
    const assistName = (assistInput?.value || '').trim();
    const notes = (notesInput?.value || '').trim();

    state.events.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      teamId: activeTeamId,
      type: selectedTypeKey,
      minute: Number.isFinite(minute) && minute >= 0 ? Math.floor(minute) : null,
      stoppage: Number.isFinite(stoppage) && stoppage > 0 ? Math.floor(stoppage) : null,
      playerName,
      jerseyNumber,
      assistName,
      notes,
      createdAt: Date.now()
    });

    saveState();
    render();
    closeModal();
  });

  cancelButtons.forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  const openButtons = Array.from(matchLogNode.querySelectorAll('[data-match-open-event-side]'));
  openButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const side = (button.dataset.matchOpenEventSide || '').trim();
      const teamId = side === 'right' ? state.rightTeamId : state.leftTeamId;
      if (!teamId) return;
      openModalForTeam(teamId);
    });
  });

  const syncTeamPair = (side, selectedTeamId) => {
    if (!teams.some((team) => team.id === selectedTeamId)) return;

    const previousLeft = state.leftTeamId;
    const previousRight = state.rightTeamId;

    if (side === 'left') {
      state.leftTeamId = selectedTeamId;
      if (selectedTeamId === previousRight) {
        state.rightTeamId = previousLeft === selectedTeamId
          ? (teams.find((team) => team.id !== selectedTeamId)?.id || selectedTeamId)
          : previousLeft;
      }
    } else {
      state.rightTeamId = selectedTeamId;
      if (selectedTeamId === previousLeft) {
        state.leftTeamId = previousRight === selectedTeamId
          ? (teams.find((team) => team.id !== selectedTeamId)?.id || selectedTeamId)
          : previousRight;
      }
    }

    const normalizedPair = getDefaultMatchPair(teams, state.leftTeamId, state.rightTeamId);
    state.leftTeamId = normalizedPair.leftTeamId;
    state.rightTeamId = normalizedPair.rightTeamId;
    saveState();
    render();
  };

  leftTeamSelect?.addEventListener('change', () => {
    if (!(leftTeamSelect instanceof HTMLSelectElement)) return;
    syncTeamPair('left', leftTeamSelect.value);
  });

  rightTeamSelect?.addEventListener('change', () => {
    if (!(rightTeamSelect instanceof HTMLSelectElement)) return;
    syncTeamPair('right', rightTeamSelect.value);
  });

  matchLogNode.querySelector('[data-match-reset]')?.addEventListener('click', () => {
    state = { events: [] };
    saveState();
    render();
  });

  exportButton?.addEventListener('click', () => {
    const csv = buildMatchExportCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeCompetition = (config.competition || 'match')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const stamp = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `${safeCompetition || 'match'}-event-log-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  });

  loadState();
  render();
};

const isGenericHouseName = (value) => /^house\s*\d+$/i.test(String(value || '').trim());

const resolveFixtureHouseOptions = (section, context = {}) => {
  const ownOptions = normalizeMatchTeams(
    Array.isArray(section.houseOptions) && section.houseOptions.length
      ? section.houseOptions
      : section.teams
  );

  const pageSections = Array.isArray(context?.page?.sections) ? context.page.sections : [];
  const matchLogSection = pageSections.find((entry) => entry?.type === 'match-log');
  const sharedOptions = normalizeMatchTeams(matchLogSection?.houseOptions || []);

  if (!ownOptions.length && sharedOptions.length) {
    return sharedOptions;
  }

  const ownGeneric = ownOptions.length && ownOptions.every((entry) => isGenericHouseName(entry.name));
  const sharedNonGeneric = sharedOptions.length && sharedOptions.some((entry) => !isGenericHouseName(entry.name));

  if (ownGeneric && sharedNonGeneric) {
    return sharedOptions;
  }

  return ownOptions;
};

const renderFixtureCreatorSection = (section, sectionIndex, context = {}) => {
  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;
  const houseOptions = resolveFixtureHouseOptions(section, context);

  const config = {
    sectionKey: fallbackSectionKey,
    sport: (section.sport || '').trim(),
    competition: (section.competition || 'Inter-House League').trim() || 'Inter-House League',
    venue: (section.venue || '').trim(),
    houseOptions
  };

  return `
    <section class="section ${section.alt ? 'section-alt' : ''}" data-editable-section="true" data-section-index="${sectionIndex}" data-section-type="fixture-creator" data-section-key="${fallbackSectionKey}">
      <div class="container">
        <h2>${section.title || 'Season Fixture Creator'}</h2>
        ${section.body ? `<p class="lead">${section.body}</p>` : ''}
        <article class="panel fixture-creator-shell" data-fixture-creator="true" data-fixture-config="${escapeHtmlAttribute(JSON.stringify(config))}">
          <header class="fixture-creator-header">
            <p class="fixture-creator-meta" data-fixture-meta>Choose a sport format to begin.</p>
            <div class="fixture-creator-actions">
              <button type="button" class="btn btn-secondary" data-fixture-generate>Generate fixtures</button>
              <button type="button" class="btn btn-secondary" data-fixture-export>Export CSV</button>
            </div>
          </header>
          <div class="fixture-creator-sport-grid">
            <label>
              Sport code (required)
              <select data-fixture-sport required>
                <option value="">Select sport</option>
                <option value="soccer">Soccer</option>
                <option value="netball">Netball</option>
              </select>
            </label>
          </div>
          <div class="fixture-sport-panel is-hidden" data-fixture-sport-panel="soccer">
            <h3>Soccer Format</h3>
            <div class="fixture-creator-sport-grid">
              <label>
                Halves
                <input type="number" min="2" max="2" step="1" value="2" data-fixture-soccer-halves />
              </label>
              <label>
                Minutes per half
                <input type="number" min="10" max="60" step="1" value="40" data-fixture-soccer-half-minutes />
              </label>
              <label>
                Break minutes
                <input type="number" min="0" max="30" step="1" value="10" data-fixture-soccer-break-minutes />
              </label>
            </div>
          </div>
          <div class="fixture-sport-panel is-hidden" data-fixture-sport-panel="netball">
            <h3>Netball Format</h3>
            <div class="fixture-creator-sport-grid">
              <label>
                Quarters
                <input type="number" min="4" max="4" step="1" value="4" data-fixture-netball-quarters />
              </label>
              <label>
                Minutes per quarter
                <input type="number" min="8" max="20" step="1" value="15" data-fixture-netball-quarter-minutes />
              </label>
              <label>
                Quarter break minutes
                <input type="number" min="0" max="15" step="1" value="3" data-fixture-netball-break-minutes />
              </label>
              <label>
                Half-time minutes
                <input type="number" min="0" max="20" step="1" value="5" data-fixture-netball-half-time-minutes />
              </label>
            </div>
          </div>
          <div class="fixture-creator-team-picks" data-fixture-team-picks>
            ${houseOptions
              .map(
                (team) => `
                  <label class="fixture-team-option">
                    <input type="checkbox" data-fixture-team value="${team.id}" checked />
                    <span>${team.name}</span>
                  </label>
                `
              )
              .join('')}
          </div>
          <p class="fixture-creator-status" data-fixture-status aria-live="polite">Select teams and generate fixtures.</p>
          <div class="fixture-table-wrap">
            <table class="fixture-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Leg</th>
                  <th>Match</th>
                  <th>Date</th>
                  <th>Format</th>
                  <th>Home</th>
                  <th>Away</th>
                </tr>
              </thead>
              <tbody data-fixture-body>
                <tr>
                  <td colspan="7" class="fixture-empty">No fixtures generated yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  `;
};

const buildSingleRoundRobin = (teamIds = []) => {
  const normalized = teamIds.filter(Boolean);
  if (normalized.length < 2) return [];

  const rotation = [...normalized];
  if (rotation.length % 2 !== 0) {
    rotation.push(null);
  }

  const rounds = rotation.length - 1;
  const half = rotation.length / 2;
  const firstLeg = [];

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    const roundMatches = [];
    for (let pairIndex = 0; pairIndex < half; pairIndex += 1) {
      const left = rotation[pairIndex];
      const right = rotation[rotation.length - 1 - pairIndex];
      if (!left || !right) continue;

      let home = left;
      let away = right;
      if ((roundIndex + pairIndex) % 2 === 1) {
        home = right;
        away = left;
      }

      roundMatches.push({
        slotKey: `R${roundIndex + 1}M${pairIndex + 1}`,
        round: roundIndex + 1,
        leg: 'First',
        match: pairIndex + 1,
        homeId: home,
        awayId: away
      });
    }
    firstLeg.push(...roundMatches);

    const fixed = rotation[0];
    const moved = rotation.pop();
    rotation.splice(1, 0, moved);
    rotation[0] = fixed;
  }

  const secondLegOffset = rounds;
  const secondLeg = firstLeg.map((fixture) => ({
    ...fixture,
    slotKey: `R${fixture.round + secondLegOffset}M${fixture.match}`,
    round: fixture.round + secondLegOffset,
    leg: 'Return',
    homeId: fixture.awayId,
    awayId: fixture.homeId
  }));

  return [...firstLeg, ...secondLeg].sort((left, right) => {
    if (left.round === right.round) return left.match - right.match;
    return left.round - right.round;
  });
};

const hydrateFixtureCreator = (fixtureNode) => {
  const rawConfig = (fixtureNode.dataset.fixtureConfig || '').trim();
  if (!rawConfig) return;

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch {
    return;
  }

  const houseOptions = normalizeMatchTeams(config.houseOptions || []);
  if (houseOptions.length < 2) return;

  const teamPickInputs = Array.from(fixtureNode.querySelectorAll('[data-fixture-team]'));
  const sportSelect = fixtureNode.querySelector('[data-fixture-sport]');
  const metaNode = fixtureNode.querySelector('[data-fixture-meta]');
  const soccerPanel = fixtureNode.querySelector('[data-fixture-sport-panel="soccer"]');
  const netballPanel = fixtureNode.querySelector('[data-fixture-sport-panel="netball"]');
  const soccerHalvesInput = fixtureNode.querySelector('[data-fixture-soccer-halves]');
  const soccerHalfMinutesInput = fixtureNode.querySelector('[data-fixture-soccer-half-minutes]');
  const soccerBreakMinutesInput = fixtureNode.querySelector('[data-fixture-soccer-break-minutes]');
  const netballQuartersInput = fixtureNode.querySelector('[data-fixture-netball-quarters]');
  const netballQuarterMinutesInput = fixtureNode.querySelector('[data-fixture-netball-quarter-minutes]');
  const netballBreakMinutesInput = fixtureNode.querySelector('[data-fixture-netball-break-minutes]');
  const netballHalfTimeMinutesInput = fixtureNode.querySelector('[data-fixture-netball-half-time-minutes]');
  const statusNode = fixtureNode.querySelector('[data-fixture-status]');
  const bodyNode = fixtureNode.querySelector('[data-fixture-body]');
  const generateButton = fixtureNode.querySelector('[data-fixture-generate]');
  const exportButton = fixtureNode.querySelector('[data-fixture-export]');

  if (!bodyNode || !generateButton || !exportButton) return;

  let lastFixtures = [];
  let lastSportKey = '';
  let lastSportLabel = '';
  let lastFormatLabel = '';

  const fixtureSectionKey = String(config.sectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator';
  const fixtureDateStorageKey = `bhanoyi.fixtureDates.${fixtureSectionKey}`;
  const fixtureCatalogStorageKey = `bhanoyi.fixtures.${fixtureSectionKey}`;
  const isAdminMode = new URLSearchParams(window.location.search).get('admin') === '1';
  let fixtureDates = {};

  const loadFixtureDates = () => {
    try {
      const raw = localStorage.getItem(fixtureDateStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        fixtureDates = parsed;
      }
    } catch {
      fixtureDates = {};
    }
  };

  const getFixtureId = (fixture) =>
    `${fixtureSectionKey}:${fixture.sportKey}:${fixture.slotKey || `R${fixture.round}M${fixture.match}`}`;

  const parsePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  };

  const sportProfiles = {
    soccer: {
      label: 'Soccer',
      readSetup: () => {
        const halves = 2;
        const minutesPerHalf = parsePositiveInt(
          soccerHalfMinutesInput instanceof HTMLInputElement ? soccerHalfMinutesInput.value : '',
          40
        );
        const breakMinutes = parsePositiveInt(
          soccerBreakMinutesInput instanceof HTMLInputElement ? soccerBreakMinutesInput.value : '',
          10
        );
        return {
          halves,
          minutesPerHalf,
          breakMinutes,
          formatLabel: `${halves} x ${minutesPerHalf} min (break ${breakMinutes} min)`
        };
      }
    },
    netball: {
      label: 'Netball',
      readSetup: () => {
        const quarters = 4;
        const minutesPerQuarter = parsePositiveInt(
          netballQuarterMinutesInput instanceof HTMLInputElement ? netballQuarterMinutesInput.value : '',
          15
        );
        const breakMinutes = parsePositiveInt(
          netballBreakMinutesInput instanceof HTMLInputElement ? netballBreakMinutesInput.value : '',
          3
        );
        const halfTimeMinutes = parsePositiveInt(
          netballHalfTimeMinutesInput instanceof HTMLInputElement ? netballHalfTimeMinutesInput.value : '',
          5
        );
        return {
          quarters,
          minutesPerQuarter,
          breakMinutes,
          halfTimeMinutes,
          formatLabel: `${quarters} x ${minutesPerQuarter} min (quarter break ${breakMinutes} min, half-time ${halfTimeMinutes} min)`
        };
      }
    }
  };

  const selectedSportKey = () => {
    const value = sportSelect instanceof HTMLSelectElement ? sportSelect.value : '';
    return value === 'soccer' || value === 'netball' ? value : '';
  };

  const selectedSportProfile = () => {
    const key = selectedSportKey();
    return key ? { key, ...sportProfiles[key] } : null;
  };

  const refreshSportPanelState = () => {
    const key = selectedSportKey();
    if (soccerPanel instanceof HTMLElement) {
      soccerPanel.classList.toggle('is-hidden', key !== 'soccer');
    }
    if (netballPanel instanceof HTMLElement) {
      netballPanel.classList.toggle('is-hidden', key !== 'netball');
    }

    if (metaNode instanceof HTMLElement) {
      if (!key) {
        metaNode.textContent = 'Choose Soccer or Netball to load fixture format options.';
      } else {
        const profile = selectedSportProfile();
        const setup = profile?.readSetup();
        metaNode.textContent = `${profile?.label || ''} · ${config.competition}${config.venue ? ` · ${config.venue}` : ''}${setup?.formatLabel ? ` · ${setup.formatLabel}` : ''}`;
      }
    }
  };

  const saveFixtureCatalog = (fixtures) => {
    const catalog = {};
    fixtures.forEach((fixture) => {
      const fixtureId = getFixtureId(fixture);
      const sportProfile = sportProfiles[fixture.sportKey] || null;
      const setup = sportProfile?.readSetup?.() || {};
      catalog[fixtureId] = {
        id: fixtureId,
        round: fixture.round,
        leg: fixture.leg,
        match: fixture.match,
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        homeName: teamNameById(fixture.homeId),
        awayName: teamNameById(fixture.awayId),
        title: `${teamNameById(fixture.homeId)} vs ${teamNameById(fixture.awayId)}`,
        sport: sportProfile?.label || '',
        competition: String(config.competition || '').trim(),
        venue: String(config.venue || '').trim(),
        format: String(setup.formatLabel || '').trim(),
        setup
      };
    });

    try {
      localStorage.setItem(fixtureCatalogStorageKey, JSON.stringify(catalog));

      const rawDates = localStorage.getItem(fixtureDateStorageKey);
      const parsedDates = rawDates ? JSON.parse(rawDates) : {};
      const fixtureDatesMap = parsedDates && typeof parsedDates === 'object' ? parsedDates : {};
      const catalogIds = new Set(Object.keys(catalog));
      let datesChanged = false;

      Object.keys(fixtureDatesMap).forEach((fixtureId) => {
        if (!fixtureId.startsWith(`${fixtureSectionKey}:`)) return;
        if (!catalogIds.has(fixtureId)) {
          delete fixtureDatesMap[fixtureId];
          datesChanged = true;
        }
      });

      if (datesChanged) {
        localStorage.setItem(fixtureDateStorageKey, JSON.stringify(fixtureDatesMap));
      }
    } catch {
      return;
    }

    window.dispatchEvent(
      new CustomEvent('bhanoyi:fixtures-updated', {
        detail: {
          sectionKey: fixtureSectionKey
        }
      })
    );
  };

  const fixtureDateLabel = (fixtureId) => {
    const value = String(fixtureDates[fixtureId] || '').trim();
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  };

  const buildCalendarHref = (fixture, fixtureId) => {
    const params = new URLSearchParams();
    params.set('fixtureSectionKey', fixtureSectionKey);
    params.set('fixtureId', fixtureId);
    params.set('fixtureLabel', `${teamNameById(fixture.homeId)} vs ${teamNameById(fixture.awayId)}`);
    const existing = String(fixtureDates[fixtureId] || '').trim();
    if (existing) {
      params.set('date', existing);
    }
    return withAdminQuery(`calendar.html?${params.toString()}`);
  };

  const selectedTeamIds = () =>
    teamPickInputs
      .filter((input) => input instanceof HTMLInputElement && input.checked)
      .map((input) => (input instanceof HTMLInputElement ? input.value : ''))
      .filter((teamId) => houseOptions.some((team) => team.id === teamId));

  const teamNameById = (teamId) => houseOptions.find((team) => team.id === teamId)?.name || teamId;

  const orderedPairKey = (homeId, awayId) => `${homeId}__${awayId}`;

  const splitOrderedPairKey = (key) => {
    const [homeId, awayId] = String(key || '').split('__');
    return { homeId: String(homeId || '').trim(), awayId: String(awayId || '').trim() };
  };

  const reconcileRoundRobinAfterManualEdit = ({ fixtures, teamIds, editedIndex, nextHomeId, nextAwayId }) => {
    const normalizedTeams = Array.from(new Set((teamIds || []).filter(Boolean)));
    if (normalizedTeams.length < 2) {
      return { ok: false, message: 'At least two selected teams are required for round-robin fixtures.' };
    }

    if (!normalizedTeams.includes(nextHomeId) || !normalizedTeams.includes(nextAwayId)) {
      return { ok: false, message: 'Selected teams must be from the active fixture team list.' };
    }

    if (nextHomeId === nextAwayId) {
      return { ok: false, message: 'Home and away teams must be different.' };
    }

    const allOrderedPairs = [];
    normalizedTeams.forEach((homeId) => {
      normalizedTeams.forEach((awayId) => {
        if (homeId === awayId) return;
        allOrderedPairs.push(orderedPairKey(homeId, awayId));
      });
    });

    if (fixtures.length !== allOrderedPairs.length) {
      return {
        ok: false,
        message: 'Fixture count does not match a full home-and-away round-robin for selected teams.'
      };
    }

    const availablePairs = new Set(allOrderedPairs);
    const editedPairKey = orderedPairKey(nextHomeId, nextAwayId);
    if (!availablePairs.has(editedPairKey)) {
      return { ok: false, message: 'Unable to apply this edit while preserving round-robin rules.' };
    }

    const repairedFixtures = fixtures.map((entry) => ({ ...entry }));
    repairedFixtures[editedIndex] = {
      ...repairedFixtures[editedIndex],
      homeId: nextHomeId,
      awayId: nextAwayId
    };
    availablePairs.delete(editedPairKey);

    for (let index = 0; index < repairedFixtures.length; index += 1) {
      if (index === editedIndex) continue;

      const currentPairKey = orderedPairKey(repairedFixtures[index].homeId, repairedFixtures[index].awayId);
      let resolvedPairKey = '';

      if (availablePairs.has(currentPairKey)) {
        resolvedPairKey = currentPairKey;
      } else {
        resolvedPairKey = availablePairs.values().next().value || '';
      }

      if (!resolvedPairKey) {
        return { ok: false, message: 'Could not auto-adjust fixtures to a valid round-robin schedule.' };
      }

      availablePairs.delete(resolvedPairKey);
      const resolvedPair = splitOrderedPairKey(resolvedPairKey);
      repairedFixtures[index] = {
        ...repairedFixtures[index],
        homeId: resolvedPair.homeId,
        awayId: resolvedPair.awayId
      };
    }

    if (availablePairs.size) {
      return { ok: false, message: 'Round-robin auto-adjustment left unmatched fixture pairs.' };
    }

    const changedIndexes = repairedFixtures
      .map((entry, index) => ({
        index,
        changed: entry.homeId !== fixtures[index].homeId || entry.awayId !== fixtures[index].awayId
      }))
      .filter((entry) => entry.changed)
      .map((entry) => entry.index);

    const affectedOtherCount = changedIndexes.filter((index) => index !== editedIndex).length;

    return {
      ok: true,
      fixtures: repairedFixtures,
      affectedOtherCount,
      changedCount: changedIndexes.length
    };
  };

  const renderFixtures = (fixtures) => {
    if (!fixtures.length) {
      bodyNode.innerHTML = '<tr><td colspan="7" class="fixture-empty">Select sport and at least two teams to generate fixtures.</td></tr>';
      if (statusNode) {
        statusNode.textContent = selectedSportKey()
          ? 'Select at least two teams to generate fixtures.'
          : 'Choose Soccer or Netball first, then generate fixtures.';
      }
      return;
    }

    const activeTeamIds = Array.from(new Set(selectedTeamIds()));
    const fallbackFixtureTeamIds = Array.from(
      new Set(fixtures.flatMap((entry) => [entry.homeId, entry.awayId]).filter(Boolean))
    );
    const effectiveTeamIds = activeTeamIds.length ? activeTeamIds : fallbackFixtureTeamIds;
    const effectiveTeamOptions = houseOptions.filter((team) => effectiveTeamIds.includes(team.id));

    const teamOptionMarkup = (selectedId) =>
      (effectiveTeamOptions.length ? effectiveTeamOptions : houseOptions)
        .map(
          (team) => `<option value="${escapeHtmlAttribute(team.id)}" ${team.id === selectedId ? 'selected' : ''}>${escapeHtmlText(team.name)}</option>`
        )
        .join('');

    bodyNode.innerHTML = fixtures
      .map(
        (fixture, index) => `
          <tr data-fixture-row="${index}">
            <td>${fixture.round}</td>
            <td>${fixture.leg}</td>
            <td>R${fixture.round}M${fixture.match}</td>
            <td>
              ${(() => {
                const fixtureId = getFixtureId(fixture);
                const dateValue = String(fixtureDates[fixtureId] || '').trim();
                const label = fixtureDateLabel(fixtureId) || (isAdminMode ? 'Set date in calendar' : 'TBD');
                if (!isAdminMode) {
                  return `<span class="fixture-date-label">${escapeHtmlText(label)}</span>`;
                }
                return `
                  <div class="fixture-date-edit-wrap">
                    <input type="date" class="fixture-inline-input" data-fixture-date-input value="${escapeHtmlAttribute(dateValue)}" />
                    <a class="fixture-date-link" href="${buildCalendarHref(fixture, fixtureId)}">Open calendar</a>
                  </div>
                `;
              })()}
            </td>
            <td>${escapeHtmlText(fixture.formatLabel || '')}</td>
            <td>
              ${isAdminMode
                ? `<select class="fixture-inline-select" data-fixture-home-select>${teamOptionMarkup(fixture.homeId)}</select>`
                : escapeHtmlText(teamNameById(fixture.homeId))}
            </td>
            <td>
              ${isAdminMode
                ? `<select class="fixture-inline-select" data-fixture-away-select>${teamOptionMarkup(fixture.awayId)}</select>`
                : escapeHtmlText(teamNameById(fixture.awayId))}
            </td>
          </tr>
        `
      )
      .join('');

    if (statusNode) {
      statusNode.textContent = `${lastSportLabel}: ${fixtures.length} fixtures generated (${fixtures.filter((entry) => entry.leg === 'First').length} first-leg + ${fixtures.filter((entry) => entry.leg === 'Return').length} return-leg).`;
    }
  };

  const generateFixtures = () => {
    refreshSportPanelState();
    const profile = selectedSportProfile();
    if (!profile) {
      lastFixtures = [];
      lastSportKey = '';
      lastSportLabel = '';
      lastFormatLabel = '';
      renderFixtures(lastFixtures);
      return;
    }

    const teams = selectedTeamIds();
    const setup = profile.readSetup();
    lastSportKey = profile.key;
    lastSportLabel = profile.label;
    lastFormatLabel = String(setup.formatLabel || '').trim();

    lastFixtures = buildSingleRoundRobin(teams).map((fixture) => ({
      ...fixture,
      sportKey: profile.key,
      sportLabel: profile.label,
      formatLabel: lastFormatLabel
    }));
    saveFixtureCatalog(lastFixtures);
    loadFixtureDates();
    renderFixtures(lastFixtures);
  };

  const escapeCsvValue = (value) => {
    const normalized = String(value ?? '').replace(/"/g, '""');
    return `"${normalized}"`;
  };

  exportButton.addEventListener('click', () => {
    if (!lastFixtures.length) {
      generateFixtures();
      if (!lastFixtures.length) return;
    }

    const lines = [
      ['Competition', config.competition || ''].map(escapeCsvValue).join(','),
      ['Sport', lastSportLabel || ''].map(escapeCsvValue).join(','),
      ['Format', lastFormatLabel || ''].map(escapeCsvValue).join(','),
      ['Venue', config.venue || ''].map(escapeCsvValue).join(','),
      '',
      ['Round', 'Leg', 'Match', 'Date', 'Format', 'Home', 'Away'].map(escapeCsvValue).join(',')
    ];

    lastFixtures.forEach((fixture) => {
      const fixtureId = getFixtureId(fixture);
      lines.push(
        [
          fixture.round,
          fixture.leg,
          `R${fixture.round}M${fixture.match}`,
          fixtureDateLabel(fixtureId) || '',
          fixture.formatLabel || '',
          teamNameById(fixture.homeId),
          teamNameById(fixture.awayId)
        ]
          .map(escapeCsvValue)
          .join(',')
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeCompetition = (config.competition || 'season-fixtures')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const stamp = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `${safeCompetition || 'season-fixtures'}-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  });

  generateButton.addEventListener('click', generateFixtures);
  teamPickInputs.forEach((input) => {
    input.addEventListener('change', generateFixtures);
  });

  bodyNode.addEventListener('change', (event) => {
    if (!isAdminMode) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const row = target.closest('[data-fixture-row]');
    if (!(row instanceof HTMLElement)) return;
    const rowIndex = Number.parseInt(row.dataset.fixtureRow || '', 10);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= lastFixtures.length) return;

    const fixture = lastFixtures[rowIndex];
    const fixtureId = getFixtureId(fixture);

    if (target.matches('[data-fixture-date-input]') && target instanceof HTMLInputElement) {
      const nextDate = String(target.value || '').trim();
      if (!nextDate) {
        delete fixtureDates[fixtureId];
      } else {
        fixtureDates[fixtureId] = nextDate;
      }
      localStorage.setItem(fixtureDateStorageKey, JSON.stringify(fixtureDates));
      window.dispatchEvent(
        new CustomEvent('bhanoyi:fixtures-updated', {
          detail: {
            sectionKey: fixtureSectionKey
          }
        })
      );
      renderFixtures(lastFixtures);
      return;
    }

    if (target.matches('[data-fixture-home-select]') && target instanceof HTMLSelectElement) {
      const homeSelect = row.querySelector('[data-fixture-home-select]');
      const awaySelect = row.querySelector('[data-fixture-away-select]');
      const nextHome = String(homeSelect instanceof HTMLSelectElement ? homeSelect.value : '').trim();
      const nextAway = String(awaySelect instanceof HTMLSelectElement ? awaySelect.value : '').trim();
      if (!nextHome || !nextAway) return;

      const repairResult = reconcileRoundRobinAfterManualEdit({
        fixtures: lastFixtures,
        teamIds: selectedTeamIds(),
        editedIndex: rowIndex,
        nextHomeId: nextHome,
        nextAwayId: nextAway
      });

      if (!repairResult.ok) {
        if (statusNode) statusNode.textContent = repairResult.message;
        renderFixtures(lastFixtures);
        return;
      }

      if (repairResult.affectedOtherCount > 0) {
        const proceed = window.confirm(
          `This change affects round-robin balance. ${repairResult.affectedOtherCount} additional fixture(s) will be auto-adjusted so each team plays every other team twice. Continue?`
        );
        if (!proceed) {
          renderFixtures(lastFixtures);
          return;
        }
      }

      lastFixtures = repairResult.fixtures;
      saveFixtureCatalog(lastFixtures);
      renderFixtures(lastFixtures);
      if (statusNode) {
        statusNode.textContent = repairResult.affectedOtherCount > 0
          ? `Fixture updated. ${repairResult.affectedOtherCount} additional fixture(s) auto-adjusted to preserve round-robin rules.`
          : 'Fixture updated with round-robin integrity preserved.';
      }
      return;
    }

    if (target.matches('[data-fixture-away-select]') && target instanceof HTMLSelectElement) {
      const homeSelect = row.querySelector('[data-fixture-home-select]');
      const awaySelect = row.querySelector('[data-fixture-away-select]');
      const nextHome = String(homeSelect instanceof HTMLSelectElement ? homeSelect.value : '').trim();
      const nextAway = String(awaySelect instanceof HTMLSelectElement ? awaySelect.value : '').trim();
      if (!nextHome || !nextAway) return;

      const repairResult = reconcileRoundRobinAfterManualEdit({
        fixtures: lastFixtures,
        teamIds: selectedTeamIds(),
        editedIndex: rowIndex,
        nextHomeId: nextHome,
        nextAwayId: nextAway
      });

      if (!repairResult.ok) {
        if (statusNode) statusNode.textContent = repairResult.message;
        renderFixtures(lastFixtures);
        return;
      }

      if (repairResult.affectedOtherCount > 0) {
        const proceed = window.confirm(
          `This change affects round-robin balance. ${repairResult.affectedOtherCount} additional fixture(s) will be auto-adjusted so each team plays every other team twice. Continue?`
        );
        if (!proceed) {
          renderFixtures(lastFixtures);
          return;
        }
      }

      lastFixtures = repairResult.fixtures;
      saveFixtureCatalog(lastFixtures);
      renderFixtures(lastFixtures);
      if (statusNode) {
        statusNode.textContent = repairResult.affectedOtherCount > 0
          ? `Fixture updated. ${repairResult.affectedOtherCount} additional fixture(s) auto-adjusted to preserve round-robin rules.`
          : 'Fixture updated with round-robin integrity preserved.';
      }
    }
  });

  sportSelect?.addEventListener('change', () => {
    refreshSportPanelState();
    generateFixtures();
  });

  [
    soccerHalvesInput,
    soccerHalfMinutesInput,
    soccerBreakMinutesInput,
    netballQuartersInput,
    netballQuarterMinutesInput,
    netballBreakMinutesInput,
    netballHalfTimeMinutesInput
  ].forEach((input) => {
    input?.addEventListener('change', () => {
      refreshSportPanelState();
      if (lastFixtures.length) {
        generateFixtures();
      }
    });
  });

  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    if (event.key !== fixtureDateStorageKey) return;
    loadFixtureDates();
    renderFixtures(lastFixtures);
  });

  window.addEventListener('bhanoyi:fixtures-updated', (event) => {
    const sectionKey = String(event?.detail?.sectionKey || '').trim();
    if (sectionKey && sectionKey !== fixtureSectionKey) return;
    loadFixtureDates();
    renderFixtures(lastFixtures);
  });

  loadFixtureDates();
  refreshSportPanelState();
  generateFixtures();
};

const renderSchoolCalendarSection = (section, sectionIndex) => {
  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;
  const config = {
    sectionKey: fallbackSectionKey,
    fixtureSectionKey: (section.fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator'
  };

  return `
    <section class="section ${section.alt ? 'section-alt' : ''}" data-section-index="${sectionIndex}" data-section-type="calendar" data-section-key="${fallbackSectionKey}">
      <div class="container">
        <h2>${section.title || 'School Calendar'}</h2>
        ${section.body ? `<p class="lead">${section.body}</p>` : ''}
        <article class="panel school-calendar-shell" data-school-calendar-shell="true" data-school-calendar-config="${escapeHtmlAttribute(JSON.stringify(config))}">
          <div class="school-calendar-admin is-hidden" data-calendar-admin-panel>
            <h3>Calendar Event Editor</h3>
            <form class="school-calendar-form" data-calendar-form>
              <label>
                Event Title
                <input type="text" name="title" maxlength="140" placeholder="e.g. Inter-House Match" required />
              </label>
              <div class="school-calendar-form-grid">
                <label>
                  Event Type
                  <select name="eventType" data-calendar-event-type></select>
                </label>
                <label data-calendar-event-type-custom-row class="is-hidden">
                  Custom Event Type
                  <input type="text" name="eventTypeCustom" maxlength="60" placeholder="e.g. Community Outreach" />
                </label>
              </div>
              <div class="school-calendar-form-grid">
                <label>
                  Start Date
                  <input type="date" name="start" required />
                </label>
                <label>
                  Start Time (optional)
                  <input type="time" name="startTime" />
                </label>
                <label>
                  End Date (optional)
                  <input type="date" name="end" />
                </label>
                <label>
                  End Time (optional)
                  <input type="time" name="endTime" />
                </label>
              </div>
              <label>
                Linked Fixture ID (optional)
                <input type="text" name="fixtureId" maxlength="180" placeholder="Auto-filled from fixture table" />
              </label>
              <label>
                Notes (optional)
                <textarea name="notes" rows="2" maxlength="280" placeholder="Event notes"></textarea>
              </label>
              <div class="school-calendar-actions">
                <button type="submit" class="btn btn-primary" data-calendar-save>Save event</button>
                <button type="button" class="btn btn-secondary" data-calendar-new>New</button>
                <button type="button" class="btn btn-secondary" data-calendar-delete>Delete</button>
              </div>
            </form>
            <p class="school-calendar-status" data-calendar-status aria-live="polite"></p>
            <hr class="school-calendar-divider" />
            <h3>Event Types</h3>
            <div class="school-event-types-editor" data-event-types-editor>
              <div class="school-event-types-list" data-event-types-list></div>
              <div class="school-calendar-actions">
                <button type="button" class="btn btn-secondary" data-event-type-add>Add type</button>
                <button type="button" class="btn btn-secondary" data-event-types-save>Save types</button>
              </div>
              <p class="school-calendar-status" data-event-types-status aria-live="polite"></p>
            </div>
            <hr class="school-calendar-divider" />
            <h3>School Terms</h3>
            <form class="school-terms-form" data-terms-form>
              <div class="school-terms-grid">
                <label>
                  Term 1 Start
                  <input type="date" name="term_1_start" />
                </label>
                <label>
                  Term 1 End
                  <input type="date" name="term_1_end" />
                </label>
                <label>
                  Term 2 Start
                  <input type="date" name="term_2_start" />
                </label>
                <label>
                  Term 2 End
                  <input type="date" name="term_2_end" />
                </label>
                <label>
                  Term 3 Start
                  <input type="date" name="term_3_start" />
                </label>
                <label>
                  Term 3 End
                  <input type="date" name="term_3_end" />
                </label>
                <label>
                  Term 4 Start
                  <input type="date" name="term_4_start" />
                </label>
                <label>
                  Term 4 End
                  <input type="date" name="term_4_end" />
                </label>
              </div>
              <div class="school-calendar-actions">
                <button type="button" class="btn btn-secondary" data-terms-save>Save terms</button>
              </div>
            </form>
            <p class="school-calendar-status" data-terms-status aria-live="polite"></p>
          </div>
          <div class="school-calendar-root" data-school-calendar></div>
          <div class="calendar-day-overlay is-hidden" data-calendar-day-overlay>
            <div class="calendar-day-overlay-panel" role="dialog" aria-modal="true" aria-label="Events for selected day">
              <div class="calendar-day-overlay-header">
                <h3 data-calendar-day-title>Events</h3>
                <button type="button" class="btn btn-secondary" data-calendar-day-close>Close</button>
              </div>
              <div class="calendar-day-overlay-list" data-calendar-day-list></div>
            </div>
          </div>
          <div class="calendar-sports-overlay is-hidden" data-calendar-sports-overlay>
            <div class="calendar-sports-overlay-panel" role="dialog" aria-modal="true" aria-label="Sports event options">
              <div class="calendar-sports-overlay-header">
                <h3>Sports Event Options</h3>
                <button type="button" class="btn btn-secondary" data-calendar-sports-close>Close</button>
              </div>
              <p class="calendar-sports-overlay-text">This event is marked as Sports. Use Fixture Creator for fixture-aware scheduling, or continue with the normal calendar form.</p>
              <div class="school-calendar-actions" data-calendar-sports-actions>
                <button type="button" class="btn btn-primary" data-calendar-sports-open-fixture>Open Fixture Creator</button>
                <button type="button" class="btn btn-secondary" data-calendar-sports-continue>Continue in Calendar</button>
              </div>
              <div class="calendar-sports-frame-wrap is-hidden" data-calendar-sports-frame-wrap>
                <iframe class="calendar-sports-frame" data-calendar-sports-frame title="Fixture Creator" loading="lazy"></iframe>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  `;
};

const hydrateSchoolCalendar = (calendarShell) => {
  const rawConfig = (calendarShell.dataset.schoolCalendarConfig || '').trim();
  if (!rawConfig) return;

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch {
    return;
  }

  const calendarRoot = calendarShell.querySelector('[data-school-calendar]');
  const adminPanel = calendarShell.querySelector('[data-calendar-admin-panel]');
  const form = calendarShell.querySelector('[data-calendar-form]');
  const statusNode = calendarShell.querySelector('[data-calendar-status]');
  const eventTypeSelect = calendarShell.querySelector('[data-calendar-event-type]');
  const eventTypeCustomRow = calendarShell.querySelector('[data-calendar-event-type-custom-row]');
  const eventTypeCustomInput = form?.querySelector('input[name="eventTypeCustom"]');
  const eventTypesListNode = calendarShell.querySelector('[data-event-types-list]');
  const eventTypeAddButton = calendarShell.querySelector('[data-event-type-add]');
  const eventTypesSaveButton = calendarShell.querySelector('[data-event-types-save]');
  const eventTypesStatusNode = calendarShell.querySelector('[data-event-types-status]');
  const termsForm = calendarShell.querySelector('[data-terms-form]');
  const termsStatusNode = calendarShell.querySelector('[data-terms-status]');
  const termsSaveButton = calendarShell.querySelector('[data-terms-save]');
  const newButton = calendarShell.querySelector('[data-calendar-new]');
  const deleteButton = calendarShell.querySelector('[data-calendar-delete]');
  const dayOverlay = calendarShell.querySelector('[data-calendar-day-overlay]');
  const dayOverlayTitle = calendarShell.querySelector('[data-calendar-day-title]');
  const dayOverlayList = calendarShell.querySelector('[data-calendar-day-list]');
  const dayOverlayCloseButton = calendarShell.querySelector('[data-calendar-day-close]');
  const sportsOverlay = calendarShell.querySelector('[data-calendar-sports-overlay]');
  const sportsOverlayCloseButton = calendarShell.querySelector('[data-calendar-sports-close]');
  const sportsOverlayActions = calendarShell.querySelector('[data-calendar-sports-actions]');
  const sportsOverlayOpenFixtureButton = calendarShell.querySelector('[data-calendar-sports-open-fixture]');
  const sportsOverlayContinueButton = calendarShell.querySelector('[data-calendar-sports-continue]');
  const sportsFrameWrap = calendarShell.querySelector('[data-calendar-sports-frame-wrap]');
  const sportsFrame = calendarShell.querySelector('[data-calendar-sports-frame]');
  if (!calendarRoot) return;

  const isAdminMode = new URLSearchParams(window.location.search).get('admin') === '1';
  if (adminPanel) {
    adminPanel.classList.toggle('is-hidden', !isAdminMode);
  }

  const sectionKey = String(config.sectionKey || 'school_calendar').trim() || 'school_calendar';
  const fixtureSectionKey = String(config.fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator';
  const eventsStorageKey = `bhanoyi.schoolCalendarEvents.${sectionKey}`;
  const fixtureDateStorageKey = `bhanoyi.fixtureDates.${fixtureSectionKey}`;
  const fixtureCatalogStorageKey = `bhanoyi.fixtures.${fixtureSectionKey}`;
  const eventTypesStorageKey = `bhanoyi.schoolCalendarEventTypes.${sectionKey}`;
  const termsStorageKey = `bhanoyi.schoolTerms.${sectionKey}`;

  const params = new URLSearchParams(window.location.search);
  const incomingFixtureId = (params.get('fixtureId') || '').trim();
  const incomingFixtureLabel = (params.get('fixtureLabel') || '').trim();
  const incomingDate = (params.get('date') || '').trim();
  const fixtureCreatorOverlayUrl = withAdminQuery('sports.html');

  const normalizeDateString = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const datePart = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (datePart) return datePart[1];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${parsed.getFullYear()}-${month}-${day}`;
  };

  const normalizeTimeString = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const matched = raw.match(/^(\d{2}:\d{2})/);
    if (matched) return matched[1];
    const timePart = raw.match(/T(\d{2}:\d{2})/);
    if (timePart) return timePart[1];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const normalizeDateTimeString = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (direct) {
      return `${direct[1]}T${direct[2]}`;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    const datePart = normalizeDateString(parsed);
    const timePart = normalizeTimeString(parsed);
    if (!datePart || !timePart) return '';
    return `${datePart}T${timePart}`;
  };

  const combineDateAndTime = (dateValue, timeValue) => {
    const date = normalizeDateString(dateValue);
    const time = normalizeTimeString(timeValue);
    if (!date) return '';
    if (!time) return date;
    return `${date}T${time}`;
  };

  const isSportsTypeSelected = () => {
    if (!(eventTypeSelect instanceof HTMLSelectElement)) return false;
    return normalizeEventTypeLabel(eventTypeSelect.value).toLowerCase() === 'sports';
  };

  const eventStartStamp = (eventEntry) => {
    if (eventEntry.start instanceof Date && !Number.isNaN(eventEntry.start.getTime())) {
      return eventEntry.start.getTime();
    }
    const fallback = normalizeDateTimeString(eventEntry.startStr || eventEntry.start || '') || normalizeDateString(eventEntry.startStr || eventEntry.start || '');
    if (!fallback) return Number.MAX_SAFE_INTEGER;
    const parsed = new Date(fallback.includes('T') ? fallback : `${fallback}T00:00`);
    return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
  };

  const toEpochDay = (dateString) => {
    const normalized = normalizeDateString(dateString);
    if (!normalized) return Number.NaN;
    return new Date(`${normalized}T00:00:00`).getTime();
  };

  const addDays = (dateString, days) => {
    const normalized = normalizeDateString(dateString);
    if (!normalized) return '';
    const date = new Date(`${normalized}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const defaultEventTypes = ['Sports', 'Religious', 'Cultural', 'Entertainment', 'Academic'];

  const normalizeEventTypeLabel = (value) => {
    const raw = String(value || '').trim();
    return raw.replace(/\s+/g, ' ');
  };

  const loadEventTypes = () => {
    try {
      const raw = localStorage.getItem(eventTypesStorageKey);
      if (!raw) return [...defaultEventTypes];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...defaultEventTypes];
      const normalized = parsed
        .map((entry) => normalizeEventTypeLabel(entry))
        .filter(Boolean);
      return normalized.length ? Array.from(new Set(normalized)) : [...defaultEventTypes];
    } catch {
      return [...defaultEventTypes];
    }
  };

  const saveEventTypes = (types) => {
    const normalized = Array.from(
      new Set((types || []).map((entry) => normalizeEventTypeLabel(entry)).filter(Boolean))
    );
    localStorage.setItem(eventTypesStorageKey, JSON.stringify(normalized));
    return normalized;
  };

  let eventTypes = loadEventTypes();

  const ensureEventType = (value) => {
    const label = normalizeEventTypeLabel(value);
    if (!label) return '';
    if (!eventTypes.includes(label)) {
      eventTypes.push(label);
      eventTypes = saveEventTypes(eventTypes);
      renderEventTypeOptions();
      renderEventTypesEditor();
    }
    return label;
  };

  const renderEventTypeOptions = () => {
    if (!(eventTypeSelect instanceof HTMLSelectElement)) return;
    const existing = eventTypeSelect.value;
    eventTypeSelect.innerHTML = [
      ...eventTypes.map((type) => `<option value="${escapeHtmlAttribute(type)}">${escapeHtmlText(type)}</option>`),
      '<option value="__custom__">Other (create new type)</option>'
    ].join('');
    if (eventTypes.includes(existing)) {
      eventTypeSelect.value = existing;
    } else if (existing === '__custom__') {
      eventTypeSelect.value = '__custom__';
    } else if (eventTypes.length) {
      eventTypeSelect.value = eventTypes[0];
    }
    toggleCustomTypeField();
  };

  const toggleCustomTypeField = () => {
    if (!(eventTypeSelect instanceof HTMLSelectElement)) return;
    const isCustom = eventTypeSelect.value === '__custom__';
    if (eventTypeCustomRow instanceof HTMLElement) {
      eventTypeCustomRow.classList.toggle('is-hidden', !isCustom);
    }
  };

  const resolveEventTypeFromForm = () => {
    if (!(eventTypeSelect instanceof HTMLSelectElement)) return '';
    if (eventTypeSelect.value === '__custom__') {
      const custom = normalizeEventTypeLabel(
        eventTypeCustomInput instanceof HTMLInputElement ? eventTypeCustomInput.value : ''
      );
      return ensureEventType(custom);
    }
    return ensureEventType(eventTypeSelect.value);
  };

  const renderEventTypesEditor = () => {
    if (!(eventTypesListNode instanceof HTMLElement)) return;
    eventTypesListNode.innerHTML = eventTypes
      .map(
        (type, index) => `
          <div class="school-event-type-row" data-event-type-row="${index}">
            <input type="text" value="${escapeHtmlAttribute(type)}" data-event-type-input="${index}" maxlength="60" />
            <button type="button" class="btn btn-secondary" data-event-type-delete="${index}">Delete</button>
          </div>
        `
      )
      .join('');
  };

  const defaultTerms = [
    { id: 'term_1', label: 'Term 1', start: '', end: '' },
    { id: 'term_2', label: 'Term 2', start: '', end: '' },
    { id: 'term_3', label: 'Term 3', start: '', end: '' },
    { id: 'term_4', label: 'Term 4', start: '', end: '' }
  ];

  const loadTerms = () => {
    try {
      const raw = localStorage.getItem(termsStorageKey);
      if (!raw) return defaultTerms.map((term) => ({ ...term }));
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return defaultTerms.map((term) => ({ ...term }));

      const byId = new Map(
        parsed
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => [
            String(entry.id || '').trim(),
            {
              start: normalizeDateString(entry.start),
              end: normalizeDateString(entry.end)
            }
          ])
      );

      return defaultTerms.map((term) => {
        const matched = byId.get(term.id);
        return {
          ...term,
          start: matched?.start || '',
          end: matched?.end || ''
        };
      });
    } catch {
      return defaultTerms.map((term) => ({ ...term }));
    }
  };

  const saveTerms = (terms) => {
    const payload = terms.map((term) => ({
      id: term.id,
      start: normalizeDateString(term.start),
      end: normalizeDateString(term.end)
    }));
    localStorage.setItem(termsStorageKey, JSON.stringify(payload));
  };

  let terms = loadTerms();

  const getActiveTermRanges = () =>
    terms
      .map((term) => ({
        ...term,
        start: normalizeDateString(term.start),
        end: normalizeDateString(term.end)
      }))
      .filter((term) => {
        const startDay = toEpochDay(term.start);
        const endDay = toEpochDay(term.end);
        return Number.isFinite(startDay) && Number.isFinite(endDay) && endDay >= startDay;
      });

  const snapDateToActiveTerms = (dateString) => {
    const normalized = normalizeDateString(dateString);
    if (!normalized) return '';

    const targetDay = toEpochDay(normalized);
    if (!Number.isFinite(targetDay)) return normalized;

    const activeTerms = getActiveTermRanges();
    if (!activeTerms.length) return normalized;

    const containing = activeTerms.find((term) => {
      const startDay = toEpochDay(term.start);
      const endDay = toEpochDay(term.end);
      return targetDay >= startDay && targetDay <= endDay;
    });
    if (containing) return normalized;

    let nearestDate = normalized;
    let bestDistance = Number.MAX_SAFE_INTEGER;

    activeTerms.forEach((term) => {
      const startDay = toEpochDay(term.start);
      const endDay = toEpochDay(term.end);
      const startDistance = Math.abs(startDay - targetDay);
      const endDistance = Math.abs(endDay - targetDay);

      if (startDistance < bestDistance) {
        bestDistance = startDistance;
        nearestDate = term.start;
      }
      if (endDistance < bestDistance) {
        bestDistance = endDistance;
        nearestDate = term.end;
      }
    });

    return nearestDate;
  };

  const loadEvents = () => {
    try {
      const raw = localStorage.getItem(eventsStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((entry) => entry && typeof entry === 'object' && entry.id && entry.title && entry.start)
        .map((entry) => {
          const savedStart = String(entry.start || '').trim();
          const savedEnd = String(entry.end || '').trim();
          const normalizedStartDateTime = normalizeDateTimeString(savedStart);
          const normalizedStartDate = normalizeDateString(savedStart);
          const normalizedEndDateTime = normalizeDateTimeString(savedEnd);
          const normalizedEndDate = normalizeDateString(savedEnd);

          const isTimed = Boolean(normalizedStartDateTime && savedStart.includes('T')) || entry.allDay === false;
          const startValue = isTimed
            ? normalizedStartDateTime
            : normalizedStartDate;

          let endValue = '';
          if (isTimed) {
            endValue = normalizedEndDateTime || '';
          } else if (normalizedEndDate) {
            endValue = addDays(normalizedEndDate, 1);
          }

          return {
            id: String(entry.id),
            title: String(entry.title),
            start: startValue,
            end: endValue || undefined,
            allDay: !isTimed,
            backgroundColor: String(entry.backgroundColor || '').trim() || undefined,
            borderColor: String(entry.borderColor || '').trim() || undefined,
            textColor: String(entry.textColor || '').trim() || undefined,
            extendedProps: {
              eventType: normalizeEventTypeLabel(entry.eventType || ''),
              fixtureId: String(entry.fixtureId || ''),
              notes: String(entry.notes || '')
            }
          };
        })
        .filter((entry) => Boolean(entry.start));
    } catch {
      return [];
    }
  };

  const saveEvents = (events) => {
    const persistedEvents = events.filter((entry) => !String(entry.id || '').startsWith('termbg:'));
    const serialized = persistedEvents.map((entry) => {
      const isAllDay = entry.allDay !== false;
      const rawStart = String(entry.startStr || entry.start || '').trim();
      const rawEnd = String(entry.endStr || entry.end || '').trim();

      const normalizedStartDate = normalizeDateString(rawStart);
      const normalizedStartDateTime = normalizeDateTimeString(rawStart);
      const normalizedEndDate = normalizeDateString(rawEnd);
      const normalizedEndDateTime = normalizeDateTimeString(rawEnd);

      let storedStart = isAllDay ? normalizedStartDate : normalizedStartDateTime || normalizedStartDate;
      let storedEnd = '';

      if (isAllDay) {
        if (normalizedEndDate) {
          storedEnd = addDays(normalizedEndDate, -1);
        }
      } else {
        storedEnd = normalizedEndDateTime || '';
      }

      return {
        id: entry.id,
        title: entry.title,
        start: storedStart,
        end: storedEnd,
        allDay: isAllDay,
        backgroundColor: String(entry.backgroundColor || '').trim(),
        borderColor: String(entry.borderColor || '').trim(),
        textColor: String(entry.textColor || '').trim(),
        eventType: normalizeEventTypeLabel(entry.extendedProps?.eventType || ''),
        fixtureId: String(entry.extendedProps?.fixtureId || ''),
        notes: String(entry.extendedProps?.notes || '')
      };
    });
    localStorage.setItem(eventsStorageKey, JSON.stringify(serialized));

    try {
      const rawMap = localStorage.getItem(fixtureDateStorageKey);
      const fixtureMap = rawMap ? JSON.parse(rawMap) : {};
      const nextMap = fixtureMap && typeof fixtureMap === 'object' ? fixtureMap : {};

      Object.keys(nextMap).forEach((key) => {
        if (key.startsWith(`${fixtureSectionKey}:`)) {
          delete nextMap[key];
        }
      });

      serialized.forEach((entry) => {
        const fixtureId = String(entry.fixtureId || '').trim();
        const start = normalizeDateString(entry.start);
        if (fixtureId && start) {
          nextMap[fixtureId] = start;
        }
      });

      localStorage.setItem(fixtureDateStorageKey, JSON.stringify(nextMap));
      window.dispatchEvent(
        new CustomEvent('bhanoyi:fixtures-updated', {
          detail: {
            sectionKey: fixtureSectionKey
          }
        })
      );
    } catch {
      return;
    }
  };

  const renderTermBackgroundEvents = (calendarInstance) => {
    calendarInstance
      .getEvents()
      .filter((entry) => String(entry.id || '').startsWith('termbg:'))
      .forEach((entry) => entry.remove());

    getActiveTermRanges().forEach((term) => {
      calendarInstance.addEvent({
        id: `termbg:${term.id}`,
        start: term.start,
        end: addDays(term.end, 1),
        display: 'background',
        allDay: true,
        classNames: ['school-term-bg']
      });
    });
  };

  const hasConfiguredActiveTerms = () => getActiveTermRanges().length > 0;

  const loadFixtureDateMap = () => {
    try {
      const raw = localStorage.getItem(fixtureDateStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed;
    } catch {
      return {};
    }
  };

  const loadFixtureCatalog = () => {
    try {
      const raw = localStorage.getItem(fixtureCatalogStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed;
    } catch {
      return {};
    }
  };

  const buildFixtureEventTitle = (fixtureId, fixtureCatalog) => {
    const entry = fixtureCatalog?.[fixtureId];
    if (entry && typeof entry === 'object') {
      const title = String(entry.title || '').trim();
      if (title) return title;
      const home = String(entry.homeName || '').trim();
      const away = String(entry.awayName || '').trim();
      if (home && away) return `${home} vs ${away}`;
    }
    const [section, round, leg, match, homeId, awayId] = String(fixtureId || '').split(':');
    if (section && round && leg && match && homeId && awayId) {
      return `${homeId} vs ${awayId}`;
    }
    return `Fixture ${fixtureId}`;
  };

  const getContrastTextColor = (hexColor) => {
    const raw = String(hexColor || '').trim().replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return '#1a2a3a';
    const red = Number.parseInt(raw.slice(0, 2), 16);
    const green = Number.parseInt(raw.slice(2, 4), 16);
    const blue = Number.parseInt(raw.slice(4, 6), 16);
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    return luminance > 0.62 ? '#1a2a3a' : '#ffffff';
  };

  const calendarThemePresets = [
    { key: 'blue', bg: '#e7f1ff', border: '#0b5cab', text: '#1a2a3a' },
    { key: 'green', bg: '#e5f7ec', border: '#15803d', text: '#1a2a3a' },
    { key: 'amber', bg: '#fff4dd', border: '#b45309', text: '#1a2a3a' },
    { key: 'rose', bg: '#ffe8ee', border: '#be185d', text: '#1a2a3a' },
    { key: 'slate', bg: '#e9edf3', border: '#334155', text: '#1a2a3a' }
  ];
  const defaultCalendarTheme = calendarThemePresets[0];

  const applyEventTheme = (eventEntry, theme) => {
    if (!eventEntry || !theme) return;
    eventEntry.setProp('backgroundColor', theme.bg);
    eventEntry.setProp('borderColor', theme.border || theme.bg);
    eventEntry.setProp('textColor', theme.text || getContrastTextColor(theme.bg));
  };

  const colorPopover = document.createElement('div');
  colorPopover.className = 'calendar-color-popover is-hidden';
  colorPopover.innerHTML = `
    <p class="calendar-color-popover-title">Event Theme</p>
    <div class="calendar-color-swatches" data-calendar-swatches></div>
    <label class="calendar-color-custom-label">
      Custom color
      <input type="color" data-calendar-color-input value="#0b5cab" />
    </label>
    <button type="button" class="btn btn-secondary" data-calendar-theme-reset>Reset</button>
  `;
  calendarShell.appendChild(colorPopover);

  const swatchWrap = colorPopover.querySelector('[data-calendar-swatches]');
  const colorInput = colorPopover.querySelector('[data-calendar-color-input]');
  const resetThemeBtn = colorPopover.querySelector('[data-calendar-theme-reset]');
  let activeThemeEvent = null;

  if (swatchWrap) {
    swatchWrap.innerHTML = calendarThemePresets
      .map(
        (preset) => `
          <button
            type="button"
            class="calendar-color-swatch"
            data-theme-key="${preset.key}"
            title="${preset.key}"
            style="--swatch-bg: ${preset.bg}; --swatch-border: ${preset.border};"
          ></button>
        `
      )
      .join('');
  }

  const hideColorPopover = () => {
    colorPopover.classList.add('is-hidden');
    activeThemeEvent = null;
  };

  const showColorPopover = (eventEntry, anchorElement) => {
    if (!isAdminMode || !eventEntry || !anchorElement) return;
    activeThemeEvent = eventEntry;
    colorPopover.classList.remove('is-hidden');

    const rootRect = calendarShell.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();
    const left = Math.max(10, anchorRect.left - rootRect.left + anchorRect.width + 8);
    const top = Math.max(10, anchorRect.top - rootRect.top);
    colorPopover.style.left = `${left}px`;
    colorPopover.style.top = `${top}px`;

    const currentBg = String(eventEntry.backgroundColor || eventEntry.borderColor || '#0b5cab').trim();
    if (colorInput instanceof HTMLInputElement && /^#[0-9a-fA-F]{6}$/.test(currentBg)) {
      colorInput.value = currentBg;
    }
  };

  const events = loadEvents();
  let activeOverlayDate = '';
  let isReconcilingFixtures = false;
  let sportsOverlayHandledForCurrentSelection = false;

  const reconcileFixtureEvents = () => {
    if (isReconcilingFixtures) return;
    isReconcilingFixtures = true;

    try {
      const fixtureMapRaw = loadFixtureDateMap();
      const fixtureCatalog = loadFixtureCatalog();
      const fixtureDateEntries = Object.entries(fixtureMapRaw)
        .map(([fixtureId, dateValue]) => [String(fixtureId || '').trim(), normalizeDateString(dateValue)])
        .filter(([fixtureId, dateValue]) => fixtureId.startsWith(`${fixtureSectionKey}:`) && Boolean(dateValue));

      const expectedFixtureIds = new Set(fixtureDateEntries.map(([fixtureId]) => fixtureId));
      const fixtureEvents = calendar
        .getEvents()
        .filter(
          (entry) =>
            entry.display !== 'background' &&
            String(entry.extendedProps?.fixtureId || '').trim().startsWith(`${fixtureSectionKey}:`)
        );

      const fixturesById = new Map();
      fixtureEvents.forEach((entry) => {
        const fixtureId = String(entry.extendedProps?.fixtureId || '').trim();
        if (!fixtureId) return;
        const existing = fixturesById.get(fixtureId) || [];
        existing.push(entry);
        fixturesById.set(fixtureId, existing);
      });

      let hasChanges = false;

      fixtureDateEntries.forEach(([fixtureId, fixtureDate]) => {
        const linkedEntries = fixturesById.get(fixtureId) || [];
        const primaryEntry = linkedEntries[0] || null;

        if (linkedEntries.length > 1) {
          linkedEntries.slice(1).forEach((duplicate) => duplicate.remove());
          hasChanges = true;
        }

        const eventTitle = buildFixtureEventTitle(fixtureId, fixtureCatalog);

        if (!primaryEntry) {
          const newEntry = calendar.addEvent({
            id: `${fixtureId}:event`,
            title: eventTitle,
            start: fixtureDate,
            allDay: true,
            extendedProps: {
              eventType: 'Sports',
              fixtureId,
              notes: '',
              fixtureAuto: true
            }
          });
          applyEventTheme(newEntry, defaultCalendarTheme);
          hasChanges = true;
          return;
        }

        const currentDate = normalizeDateString(primaryEntry.startStr || primaryEntry.start || '');
        if (currentDate !== fixtureDate) {
          if (primaryEntry.allDay === false) {
            const existingTime = normalizeTimeString(primaryEntry.startStr || primaryEntry.start || '');
            primaryEntry.setStart(combineDateAndTime(fixtureDate, existingTime));
          } else {
            primaryEntry.setStart(fixtureDate);
          }
          hasChanges = true;
        }

        if (!String(primaryEntry.title || '').trim()) {
          primaryEntry.setProp('title', eventTitle);
          hasChanges = true;
        }

        const existingType = normalizeEventTypeLabel(primaryEntry.extendedProps?.eventType || '');
        if (!existingType) {
          primaryEntry.setExtendedProp('eventType', ensureEventType('Sports'));
          hasChanges = true;
        }

        if (!primaryEntry.extendedProps?.fixtureAuto) {
          primaryEntry.setExtendedProp('fixtureAuto', true);
          hasChanges = true;
        }
      });

      fixtureEvents.forEach((entry) => {
        const fixtureId = String(entry.extendedProps?.fixtureId || '').trim();
        if (!fixtureId.startsWith(`${fixtureSectionKey}:`)) return;
        if (!expectedFixtureIds.has(fixtureId)) {
          entry.remove();
          hasChanges = true;
        }
      });

      if (hasChanges) {
        saveEvents(calendar.getEvents());
        refreshDayOverlay();
      }
    } finally {
      isReconcilingFixtures = false;
    }
  };

  const formatOverlayDateTitle = (dateString) => {
    const date = new Date(`${normalizeDateString(dateString)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return normalizeDateString(dateString);
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTimeLabel = (eventEntry) => {
    if (eventEntry.allDay) return 'All day';
    const start = normalizeDateTimeString(eventEntry.startStr || eventEntry.start || '');
    const end = normalizeDateTimeString(eventEntry.endStr || eventEntry.end || '');
    const startTime = normalizeTimeString(start);
    const endTime = normalizeTimeString(end);
    if (startTime && endTime) return `${startTime} - ${endTime}`;
    if (startTime) return startTime;
    return 'Timed event';
  };

  const eventOccursOnDate = (eventEntry, dateString) => {
    const targetDay = toEpochDay(dateString);
    if (!Number.isFinite(targetDay)) return false;

    const startDay = toEpochDay(eventEntry.startStr || eventEntry.start || '');
    if (!Number.isFinite(startDay)) return false;

    if (eventEntry.allDay) {
      const endRaw = normalizeDateString(eventEntry.endStr || eventEntry.end || '');
      if (!endRaw) return targetDay === startDay;
      const endDayExclusive = toEpochDay(endRaw);
      return targetDay >= startDay && targetDay < endDayExclusive;
    }

    return targetDay === startDay;
  };

  const hideDayOverlay = () => {
    activeOverlayDate = '';
    if (dayOverlay instanceof HTMLElement) {
      dayOverlay.classList.add('is-hidden');
    }
    if (dayOverlayCloseButton instanceof HTMLButtonElement) {
      dayOverlayCloseButton.blur();
    }
  };

  const hideSportsOverlay = () => {
    if (sportsOverlay instanceof HTMLElement) {
      sportsOverlay.classList.add('is-hidden');
    }
    if (sportsFrameWrap instanceof HTMLElement) {
      sportsFrameWrap.classList.add('is-hidden');
    }
    if (sportsOverlayActions instanceof HTMLElement) {
      sportsOverlayActions.classList.remove('is-hidden');
    }
  };

  const showSportsSelectionOverlay = () => {
    if (!(sportsOverlay instanceof HTMLElement)) return;
    sportsOverlay.classList.remove('is-hidden');
    if (sportsFrameWrap instanceof HTMLElement) {
      sportsFrameWrap.classList.add('is-hidden');
    }
    if (sportsOverlayActions instanceof HTMLElement) {
      sportsOverlayActions.classList.remove('is-hidden');
    }
    if (sportsOverlayOpenFixtureButton instanceof HTMLButtonElement) {
      sportsOverlayOpenFixtureButton.focus();
    }
  };

  const maybePromptSportsFixtureOverlay = () => {
    if (!isAdminMode || !(form instanceof HTMLFormElement)) return;
    if (!isSportsTypeSelected()) return;
    if (sportsOverlayHandledForCurrentSelection) return;

    const idInput = form.querySelector('input[name="id"]');
    const fixtureInput = form.querySelector('input[name="fixtureId"]');
    const eventId = (idInput instanceof HTMLInputElement ? idInput.value : '').trim();
    const linkedFixtureId = (fixtureInput instanceof HTMLInputElement ? fixtureInput.value : '').trim();

    if (eventId || linkedFixtureId) return;

    showSportsSelectionOverlay();
  };

  const writeEventToForm = (eventEntry, anchorElement = null) => {
    if (!isAdminMode || !(form instanceof HTMLFormElement)) return;
    showColorPopover(eventEntry, anchorElement || null);
    const formData = new FormData(form);
    formData.set('id', String(eventEntry.id || ''));
    formData.set('title', String(eventEntry.title || ''));

    const startRaw = String(eventEntry.startStr || eventEntry.start || '');
    const endRaw = String(eventEntry.endStr || eventEntry.end || '');
    const isAllDay = eventEntry.allDay !== false;

    const startDate = normalizeDateString(startRaw);
    const startTime = isAllDay ? '' : normalizeTimeString(startRaw);

    let endDate = '';
    let endTime = '';
    if (endRaw) {
      if (isAllDay) {
        const exclusive = normalizeDateString(endRaw);
        endDate = exclusive ? addDays(exclusive, -1) : '';
      } else {
        endDate = normalizeDateString(endRaw);
        endTime = normalizeTimeString(endRaw);
      }
    }

    formData.set('start', startDate);
    formData.set('startTime', startTime);
    formData.set('end', endDate);
    formData.set('endTime', endTime);
    formData.set('eventType', ensureEventType(eventEntry.extendedProps?.eventType || '') || (eventTypes[0] || ''));
    formData.set('fixtureId', String(eventEntry.extendedProps?.fixtureId || ''));
    formData.set('notes', String(eventEntry.extendedProps?.notes || ''));

    Array.from(form.elements).forEach((field) => {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
      const name = field.name;
      if (!name) return;
      field.value = String(formData.get(name) || '');
    });
    toggleCustomTypeField();
    if (eventTypeCustomInput instanceof HTMLInputElement) {
      eventTypeCustomInput.value = '';
    }

    if (statusNode) {
      statusNode.textContent = 'Editing selected event.';
    }

    sportsOverlayHandledForCurrentSelection = true;
  };

  const renderDayOverlayList = (dateString) => {
    if (!(dayOverlayList instanceof HTMLElement)) return;

    const dayEvents = calendar
      .getEvents()
      .filter((entry) => entry.display !== 'background' && eventOccursOnDate(entry, dateString))
      .sort((left, right) => eventStartStamp(left) - eventStartStamp(right));

    if (!dayEvents.length) {
      dayOverlayList.innerHTML = '<p class="calendar-day-empty">No events on this day.</p>';
      return;
    }

    dayOverlayList.innerHTML = dayEvents
      .map((entry) => {
        const eventType = escapeHtmlText(String(entry.extendedProps?.eventType || 'General'));
        const title = escapeHtmlText(String(entry.title || 'Untitled event'));
        const eventId = escapeHtmlAttribute(String(entry.id || ''));
        const timeLabel = escapeHtmlText(formatTimeLabel(entry));
        return `
          <button type="button" class="calendar-day-event-row" data-calendar-day-event-id="${eventId}">
            <span class="calendar-day-event-time">${timeLabel}</span>
            <span class="calendar-day-event-title">${title}</span>
            <span class="calendar-day-event-type">${eventType}</span>
          </button>
        `;
      })
      .join('');
  };

  const showDayOverlay = (dateString) => {
    const normalized = normalizeDateString(dateString);
    if (!(dayOverlay instanceof HTMLElement) || !normalized) return;
    activeOverlayDate = normalized;
    if (dayOverlayTitle instanceof HTMLElement) {
      dayOverlayTitle.textContent = `Events • ${formatOverlayDateTitle(normalized)}`;
    }
    renderDayOverlayList(normalized);
    dayOverlay.classList.remove('is-hidden');
    const firstRow = dayOverlay.querySelector('[data-calendar-day-event-id]');
    if (firstRow instanceof HTMLButtonElement) {
      firstRow.focus();
    } else if (dayOverlayCloseButton instanceof HTMLButtonElement) {
      dayOverlayCloseButton.focus();
    }
  };

  const refreshDayOverlay = () => {
    if (!activeOverlayDate) return;
    renderDayOverlayList(activeOverlayDate);
  };

  swatchWrap?.addEventListener('click', (event) => {
    const button = (event.target instanceof HTMLElement)
      ? event.target.closest('.calendar-color-swatch')
      : null;
    if (!(button instanceof HTMLButtonElement) || !activeThemeEvent) return;
    const themeKey = (button.dataset.themeKey || '').trim();
    const preset = calendarThemePresets.find((entry) => entry.key === themeKey);
    if (!preset) return;
    applyEventTheme(activeThemeEvent, preset);
    saveEvents(calendar.getEvents());
  });

  colorInput?.addEventListener('input', () => {
    if (!(colorInput instanceof HTMLInputElement) || !activeThemeEvent) return;
    const picked = colorInput.value;
    applyEventTheme(activeThemeEvent, {
      bg: picked,
      border: picked,
      text: getContrastTextColor(picked)
    });
    saveEvents(calendar.getEvents());
  });

  resetThemeBtn?.addEventListener('click', () => {
    if (!activeThemeEvent) return;
    applyEventTheme(activeThemeEvent, defaultCalendarTheme);
    saveEvents(calendar.getEvents());
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('.calendar-color-popover')) return;
    if (target.closest('.fc-event')) return;
    hideColorPopover();
  });

  const calendar = new Calendar(calendarRoot, {
    plugins: [dayGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    height: 'auto',
    editable: isAdminMode,
    eventStartEditable: isAdminMode,
    events,
    eventClick: (info) => {
      if (info.event.display === 'background') return;
      if (!isAdminMode || !(form instanceof HTMLFormElement)) return;
      info.jsEvent.preventDefault();
      writeEventToForm(info.event, info.el);
    },
    dateClick: (info) => {
      showDayOverlay(info.dateStr);
      if (isAdminMode && form instanceof HTMLFormElement) {
        clearForm();
        const startInput = form.querySelector('input[name="start"]');
        if (startInput instanceof HTMLInputElement) {
          startInput.value = info.dateStr;
        }
        if (statusNode) {
          statusNode.textContent = 'Ready to add a new event for selected date.';
        }
      }
    },
    eventDrop: (info) => {
      if (!isAdminMode) {
        info.revert();
        return;
      }

      const fixtureId = String(info.event.extendedProps?.fixtureId || '').trim();
      const rawStartDate = normalizeDateString(info.event.startStr || '');
      const rawStartTime = normalizeTimeString(info.event.startStr || '');
      const rawStart = combineDateAndTime(rawStartDate, rawStartTime);
      if (!rawStart) {
        info.revert();
        if (statusNode) statusNode.textContent = 'Unable to move event to an invalid date.';
        return;
      }

      if (fixtureId && !hasConfiguredActiveTerms()) {
        info.revert();
        if (statusNode) {
          statusNode.textContent = 'Save at least one school term range before moving fixture events.';
        }
        return;
      }

      const snappedStartDate = fixtureId ? snapDateToActiveTerms(rawStartDate) : rawStartDate;
      const snappedStart = combineDateAndTime(snappedStartDate, rawStartTime);
      if (fixtureId && snappedStartDate !== rawStartDate) {
        info.event.setStart(snappedStart);
      }

      saveEvents(calendar.getEvents());
      refreshDayOverlay();

      if (form instanceof HTMLFormElement) {
        const idInput = form.querySelector('input[name="id"]');
        const selectedId = (idInput instanceof HTMLInputElement ? idInput.value : '').trim();
        if (selectedId && selectedId === String(info.event.id || '').trim()) {
          const startInput = form.querySelector('input[name="start"]');
          const startTimeInput = form.querySelector('input[name="startTime"]');
          if (startInput instanceof HTMLInputElement) {
            startInput.value = snappedStartDate;
          }
          if (startTimeInput instanceof HTMLInputElement) {
            startTimeInput.value = rawStartTime;
          }
        }
      }

      if (statusNode) {
        statusNode.textContent = fixtureId && snappedStart !== rawStart
          ? `Event moved. Date snapped to active term (${snappedStart}).`
          : 'Event date updated.';
      }
    }
  });

  calendar.render();
  renderTermBackgroundEvents(calendar);
  reconcileFixtureEvents();

  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    if (event.key === fixtureDateStorageKey || event.key === fixtureCatalogStorageKey) {
      reconcileFixtureEvents();
    }
  });

  window.addEventListener('bhanoyi:fixtures-updated', (event) => {
    const sectionKeyFromEvent = String(event?.detail?.sectionKey || '').trim();
    if (sectionKeyFromEvent && sectionKeyFromEvent !== fixtureSectionKey) return;
    reconcileFixtureEvents();
  });

  dayOverlayCloseButton?.addEventListener('click', () => {
    hideDayOverlay();
  });

  dayOverlay?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target === dayOverlay) {
      hideDayOverlay();
      return;
    }
    const row = target.closest('[data-calendar-day-event-id]');
    if (!(row instanceof HTMLElement)) return;
    const eventId = String(row.dataset.calendarDayEventId || '').trim();
    if (!eventId) return;
    const eventEntry = calendar.getEventById(eventId);
    if (!eventEntry) return;
    if (isAdminMode) {
      writeEventToForm(eventEntry);
    }
    hideDayOverlay();
  });

  dayOverlay?.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      hideDayOverlay();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const row = target.closest('[data-calendar-day-event-id]');
      if (!(row instanceof HTMLElement)) return;
      event.preventDefault();
      const eventId = String(row.dataset.calendarDayEventId || '').trim();
      if (!eventId) return;
      const eventEntry = calendar.getEventById(eventId);
      if (!eventEntry) return;
      if (isAdminMode) {
        writeEventToForm(eventEntry);
      }
      hideDayOverlay();
    }
  });

  sportsOverlayCloseButton?.addEventListener('click', () => {
    hideSportsOverlay();
    sportsOverlayHandledForCurrentSelection = true;
  });

  sportsOverlayContinueButton?.addEventListener('click', () => {
    hideSportsOverlay();
    sportsOverlayHandledForCurrentSelection = true;
    if (statusNode) {
      statusNode.textContent = 'Continue creating this Sports event in calendar form.';
    }
  });

  sportsOverlayOpenFixtureButton?.addEventListener('click', () => {
    if (sportsFrame instanceof HTMLIFrameElement) {
      if (!sportsFrame.src) {
        sportsFrame.src = fixtureCreatorOverlayUrl;
      }
    }
    if (sportsFrameWrap instanceof HTMLElement) {
      sportsFrameWrap.classList.remove('is-hidden');
    }
    if (sportsOverlayActions instanceof HTMLElement) {
      sportsOverlayActions.classList.add('is-hidden');
    }
    sportsOverlayHandledForCurrentSelection = true;
  });

  sportsOverlay?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target === sportsOverlay) {
      hideSportsOverlay();
      sportsOverlayHandledForCurrentSelection = true;
    }
  });

  sportsOverlay?.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      hideSportsOverlay();
      sportsOverlayHandledForCurrentSelection = true;
    }
  });

  const hydrateTermsForm = () => {
    if (!(termsForm instanceof HTMLFormElement)) return;
    terms.forEach((term) => {
      const startInput = termsForm.querySelector(`input[name="${term.id}_start"]`);
      const endInput = termsForm.querySelector(`input[name="${term.id}_end"]`);
      if (startInput instanceof HTMLInputElement) {
        startInput.value = normalizeDateString(term.start);
      }
      if (endInput instanceof HTMLInputElement) {
        endInput.value = normalizeDateString(term.end);
      }
    });
  };

  const clearForm = () => {
    if (!(form instanceof HTMLFormElement)) return;
    form.reset();
    const hiddenId = form.querySelector('input[name="id"]');
    if (hiddenId instanceof HTMLInputElement) {
      hiddenId.value = '';
    }
    if (incomingFixtureId) {
      const fixtureInput = form.querySelector('input[name="fixtureId"]');
      if (fixtureInput instanceof HTMLInputElement) {
        fixtureInput.value = incomingFixtureId;
      }
    }
    if (incomingDate) {
      const startInput = form.querySelector('input[name="start"]');
      if (startInput instanceof HTMLInputElement) {
        startInput.value = normalizeDateString(incomingDate);
      }
    }
    if (incomingFixtureLabel) {
      const titleInput = form.querySelector('input[name="title"]');
      if (titleInput instanceof HTMLInputElement && !titleInput.value.trim()) {
        titleInput.value = incomingFixtureLabel;
      }
    }
    if (eventTypeSelect instanceof HTMLSelectElement) {
      if (eventTypes.length) {
        eventTypeSelect.value = eventTypes[0];
      }
      toggleCustomTypeField();
    }
    if (eventTypeCustomInput instanceof HTMLInputElement) {
      eventTypeCustomInput.value = '';
    }
    sportsOverlayHandledForCurrentSelection = false;
    hideSportsOverlay();
  };

  if (isAdminMode && form instanceof HTMLFormElement) {
    const hiddenId = document.createElement('input');
    hiddenId.type = 'hidden';
    hiddenId.name = 'id';
    form.appendChild(hiddenId);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const titleInput = form.querySelector('input[name="title"]');
      const startInput = form.querySelector('input[name="start"]');
      const startTimeInput = form.querySelector('input[name="startTime"]');
      const endInput = form.querySelector('input[name="end"]');
      const endTimeInput = form.querySelector('input[name="endTime"]');
      const fixtureInput = form.querySelector('input[name="fixtureId"]');
      const notesInput = form.querySelector('textarea[name="notes"]');
      const idInput = form.querySelector('input[name="id"]');

      const title = (titleInput instanceof HTMLInputElement ? titleInput.value : '').trim();
      const startDate = normalizeDateString(startInput instanceof HTMLInputElement ? startInput.value : '');
      const startTime = normalizeTimeString(startTimeInput instanceof HTMLInputElement ? startTimeInput.value : '');
      const endDateInput = normalizeDateString(endInput instanceof HTMLInputElement ? endInput.value : '');
      const endTime = normalizeTimeString(endTimeInput instanceof HTMLInputElement ? endTimeInput.value : '');
      const eventType = resolveEventTypeFromForm();
      const fixtureId = (fixtureInput instanceof HTMLInputElement ? fixtureInput.value : '').trim();
      const notes = (notesInput instanceof HTMLTextAreaElement ? notesInput.value : '').trim();
      const eventId = (idInput instanceof HTMLInputElement ? idInput.value : '').trim();

      const snappedStartDate = fixtureId ? snapDateToActiveTerms(startDate) : startDate;
      const effectiveStartDate = snappedStartDate || startDate;

      const isTimedEvent = Boolean(startTime);
      const start = combineDateAndTime(effectiveStartDate, startTime);

      let end = '';
      if (isTimedEvent) {
        const effectiveEndDate = endDateInput || effectiveStartDate;
        const effectiveEndTime = endTime || startTime;
        end = combineDateAndTime(effectiveEndDate, effectiveEndTime);
        if (end && start) {
          const startStamp = new Date(start).getTime();
          const endStamp = new Date(end).getTime();
          if (Number.isFinite(startStamp) && Number.isFinite(endStamp) && endStamp < startStamp) {
            end = '';
          }
        }
      } else if (endDateInput) {
        const clampedEnd = toEpochDay(endDateInput) < toEpochDay(effectiveStartDate)
          ? effectiveStartDate
          : endDateInput;
        end = addDays(clampedEnd, 1);
      }

      if (!title || !start || !eventType) {
        if (statusNode) statusNode.textContent = 'Title, event type, and start date are required.';
        return;
      }

      if (fixtureId && !hasConfiguredActiveTerms()) {
        if (statusNode) {
          statusNode.textContent = 'Save at least one school term range before scheduling fixture events.';
        }
        return;
      }

      let eventEntry = eventId ? calendar.getEventById(eventId) : null;
      if (!eventEntry) {
        eventEntry = calendar.addEvent({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title,
          start,
          end: end || undefined,
          allDay: !isTimedEvent,
          extendedProps: {
            eventType,
            fixtureId,
            notes
          }
        });
        applyEventTheme(eventEntry, defaultCalendarTheme);
      } else {
        eventEntry.setProp('title', title);
        eventEntry.setStart(start);
        eventEntry.setEnd(end || null);
        eventEntry.setAllDay(!isTimedEvent);
        eventEntry.setExtendedProp('eventType', eventType);
        eventEntry.setExtendedProp('fixtureId', fixtureId);
        eventEntry.setExtendedProp('notes', notes);
      }

      saveEvents(calendar.getEvents());
      refreshDayOverlay();
      if (statusNode) {
        statusNode.textContent = fixtureId && effectiveStartDate !== startDate
          ? `Event saved. Date snapped to active term (${effectiveStartDate}).`
          : 'Event saved.';
      }
      clearForm();
    });

    newButton?.addEventListener('click', () => {
      clearForm();
      if (statusNode) statusNode.textContent = 'Ready for a new event.';
    });

    deleteButton?.addEventListener('click', () => {
      const idInput = form.querySelector('input[name="id"]');
      const eventId = (idInput instanceof HTMLInputElement ? idInput.value : '').trim();
      if (!eventId) {
        if (statusNode) statusNode.textContent = 'Select an event first.';
        return;
      }
      const eventEntry = calendar.getEventById(eventId);
      if (!eventEntry) {
        if (statusNode) statusNode.textContent = 'Selected event not found.';
        return;
      }
      const confirmDelete = window.confirm('Delete this calendar event?');
      if (!confirmDelete) return;
      eventEntry.remove();
      saveEvents(calendar.getEvents());
      refreshDayOverlay();
      clearForm();
      if (statusNode) statusNode.textContent = 'Event deleted.';
    });

    if (eventTypeSelect instanceof HTMLSelectElement) {
      eventTypeSelect.addEventListener('change', () => {
        toggleCustomTypeField();
        if (!isSportsTypeSelected()) {
          sportsOverlayHandledForCurrentSelection = false;
          hideSportsOverlay();
          return;
        }
        maybePromptSportsFixtureOverlay();
      });
    }

    if (eventTypeAddButton instanceof HTMLButtonElement) {
      eventTypeAddButton.addEventListener('click', () => {
        const created = ensureEventType(`New Type ${eventTypes.length + 1}`);
        renderEventTypesEditor();
        if (eventTypeSelect instanceof HTMLSelectElement && created) {
          eventTypeSelect.value = created;
          toggleCustomTypeField();
        }
        if (eventTypesStatusNode) {
          eventTypesStatusNode.textContent = 'Type added. Rename it and click Save types.';
        }
      });
    }

    eventTypesListNode?.addEventListener('click', (event) => {
      const button = event.target instanceof HTMLElement
        ? event.target.closest('[data-event-type-delete]')
        : null;
      if (!(button instanceof HTMLButtonElement)) return;
      const index = Number.parseInt(button.dataset.eventTypeDelete || '', 10);
      if (!Number.isInteger(index) || index < 0 || index >= eventTypes.length) return;
      const removedType = eventTypes[index];
      const usageCount = calendar
        .getEvents()
        .filter(
          (entry) =>
            entry.display !== 'background' &&
            normalizeEventTypeLabel(entry.extendedProps?.eventType || '') === removedType
        ).length;

      const confirmDelete = window.confirm(
        usageCount > 0
          ? `Delete event type "${removedType}"? ${usageCount} event(s) currently use it.`
          : `Delete event type "${removedType}"?`
      );
      if (!confirmDelete) return;

      const fallbackType = eventTypes.find((type, idx) => idx !== index) || 'General';
      if (!eventTypes.includes(fallbackType)) {
        eventTypes.push(fallbackType);
      }

      if (usageCount > 0) {
        calendar
          .getEvents()
          .filter(
            (entry) =>
              entry.display !== 'background' &&
              normalizeEventTypeLabel(entry.extendedProps?.eventType || '') === removedType
          )
          .forEach((entry) => {
            entry.setExtendedProp('eventType', fallbackType);
          });
      }

      eventTypes.splice(index, 1);
      eventTypes = saveEventTypes(eventTypes);
      saveEvents(calendar.getEvents());
      renderEventTypeOptions();
      renderEventTypesEditor();
      if (eventTypesStatusNode) {
        eventTypesStatusNode.textContent = 'Type removed.';
      }
    });

    if (eventTypesSaveButton instanceof HTMLButtonElement) {
      eventTypesSaveButton.addEventListener('click', () => {
        const nextTypes = Array.from(
          calendarShell.querySelectorAll('[data-event-type-input]')
        )
          .map((input) => (input instanceof HTMLInputElement ? input.value : ''))
          .map((value) => normalizeEventTypeLabel(value))
          .filter(Boolean);

        eventTypes = saveEventTypes(nextTypes);
        renderEventTypeOptions();
        renderEventTypesEditor();
        if (eventTypeCustomInput instanceof HTMLInputElement) {
          eventTypeCustomInput.value = '';
        }
        if (eventTypesStatusNode) {
          eventTypesStatusNode.textContent = 'Event types saved.';
        }
      });
    }

    renderEventTypeOptions();
    renderEventTypesEditor();
    clearForm();
  }

  if (isAdminMode && termsForm instanceof HTMLFormElement) {
    hydrateTermsForm();
    termsSaveButton?.addEventListener('click', () => {
      const nextTerms = defaultTerms.map((term) => {
        const startInput = termsForm.querySelector(`input[name="${term.id}_start"]`);
        const endInput = termsForm.querySelector(`input[name="${term.id}_end"]`);
        return {
          ...term,
          start: startInput instanceof HTMLInputElement ? normalizeDateString(startInput.value) : '',
          end: endInput instanceof HTMLInputElement ? normalizeDateString(endInput.value) : ''
        };
      });

      terms = nextTerms;
      saveTerms(terms);
      renderTermBackgroundEvents(calendar);
      if (termsStatusNode) {
        termsStatusNode.textContent = 'School terms saved.';
      }
    });
  }

  const targetDate = normalizeDateString(incomingDate);
  if (targetDate) {
    calendar.gotoDate(targetDate);
  }
};

const renderSectionByType = (section, sectionIndex, context = {}) => {
  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;
  const effectiveSection = resolveContactInformationSection(resolveHomePrincipalSidePanel(section, context), context);

  if (effectiveSection.type === 'calendar') {
    return renderSchoolCalendarSection(effectiveSection, sectionIndex);
  }

  if (effectiveSection.type === 'fixture-creator') {
    return renderFixtureCreatorSection(effectiveSection, sectionIndex, context);
  }

  if (effectiveSection.type === 'match-log') {
    return renderMatchLogSection(effectiveSection, sectionIndex);
  }

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
  const isDesktopViewport = window.matchMedia('(min-width: 860px)').matches;

  tracks.forEach((track) => {
    const rail = track.querySelector('[data-news-rail]');
    if (!rail) return;

    if (isDesktopViewport) {
      rail.style.transition = '';
      rail.style.transform = '';
      const slides = Array.from(rail.querySelectorAll('.latest-news-slide'));
      slides.forEach((slide, index) => {
        slide.classList.toggle('is-active', index === 0);
      });
      return;
    }

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
    let normalizeTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let hasTouchStart = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let hasPointerStart = false;
    let pointerId = null;

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

    const scheduleLoopNormalization = () => {
      if (adminMode) return;
      if (normalizeTimer !== null) {
        window.clearTimeout(normalizeTimer);
      }
      normalizeTimer = window.setTimeout(() => {
        normalizeLoopEdgeIfNeeded();
      }, 460);
    };

    const goToNext = () => {
      if (track.dataset.adminPaused === 'true') return;
      if (adminMode) {
        index = (index + 1) % slides.length;
      } else {
        index += 1;
        if (index > slides.length - 1) {
          index = slides.length - 1;
        }
      }
      applySlidePosition(index, true);
      scheduleLoopNormalization();
    };

    const goToPrevious = () => {
      if (track.dataset.adminPaused === 'true') return;
      if (adminMode) {
        index = (index - 1 + slides.length) % slides.length;
      } else {
        index -= 1;
        if (index < 0) {
          index = 0;
        }
      }
      applySlidePosition(index, true);
      scheduleLoopNormalization();
    };

    const handleManualGesture = (diffX, diffY) => {
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      if (absX < 36 || absX <= absY) return false;

      track.dataset.swipeLockUntil = String(Date.now() + 450);
      if (diffX < 0) {
        goToNext();
      } else {
        goToPrevious();
      }
      restartAutoRotate();
      return true;
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
        handleManualGesture(diffX, diffY);
      }, { passive: true });

      track.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'touch') return;
        pointerId = event.pointerId;
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        hasPointerStart = true;
      });

      track.addEventListener('pointerup', (event) => {
        if (!hasPointerStart) return;
        if (pointerId !== null && event.pointerId !== pointerId) return;

        hasPointerStart = false;
        pointerId = null;

        const diffX = event.clientX - pointerStartX;
        const diffY = event.clientY - pointerStartY;
        handleManualGesture(diffX, diffY);
      });

      track.addEventListener('pointercancel', () => {
        hasPointerStart = false;
        pointerId = null;
      });
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
    const bodyHtml = (currentSlide.dataset.cardBodyHtml || '').trim();
    const image = currentSlide.querySelector('.latest-news-image');
    const imageData = (currentSlide.dataset.cardImageUrl || '').trim();
    const imageUrls = parseCardImageUrls(imageData);
    const imageUrl = image && !image.classList.contains('is-hidden') ? image.getAttribute('src') || '' : '';
    if (!imageUrls.length && imageUrl) {
      imageUrls.push(imageUrl);
    }
    const metadata = buildNewsMetadata({
      author: (currentSlide.dataset.cardAuthor || '').trim(),
      location: (currentSlide.dataset.cardLocation || '').trim(),
      date: (currentSlide.dataset.cardDate || '').trim(),
      body,
      postedAt: (currentSlide.dataset.cardDateIso || '').trim()
    });
    const readTimeFromCard = (currentSlide.dataset.cardReadTime || '').trim();
    if (readTimeFromCard) {
      metadata.readTimeLabel = readTimeFromCard;
    }
    const href = (currentSlide.getAttribute('href') || '#').trim();

    return {
      category,
      title,
      subtitle,
      metadata,
      body,
      bodyHtml,
      imageUrls,
      href
    };
  };

  const overlay = document.createElement('div');
  overlay.id = 'news-read-overlay';
  overlay.className = 'news-read-overlay';
  overlay.innerHTML = `
    <article class="news-read-panel" role="dialog" aria-modal="true" aria-label="Latest news article">
      <div class="news-read-topbar" data-news-sheet-handle>
        <div class="news-read-sheet-thumb" aria-hidden="true"></div>
        <h2 class="news-read-heading" data-news-read-heading></h2>
        <button type="button" class="news-read-close-btn" data-news-close aria-label="Close article">×</button>
      </div>
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
  const heading = overlay.querySelector('[data-news-read-heading]');
  const panel = overlay.querySelector('.news-read-panel');
  const sheetHandle = overlay.querySelector('[data-news-sheet-handle]');
  const isMobileSheetViewport = () => window.matchMedia('(max-width: 640px)').matches;
  let mediaAutoRotateTimer = null;
  let isSheetDragging = false;
  let sheetDragStartY = 0;
  let sheetDragOffsetY = 0;

  const setSheetOffset = (offsetY, animate = false) => {
    if (!(panel instanceof HTMLElement)) return;
    panel.style.transition = animate ? 'transform 220ms ease' : 'none';
    panel.style.transform = `translateY(${Math.max(0, offsetY)}px)`;
  };

  const closeWithSheetAnimation = () => {
    if (!(panel instanceof HTMLElement)) {
      close();
      return;
    }
    const panelHeight = panel.getBoundingClientRect().height;
    setSheetOffset(panelHeight, true);
    window.setTimeout(close, 220);
  };

  const clearMediaCarousel = () => {
    if (mediaAutoRotateTimer !== null) {
      window.clearInterval(mediaAutoRotateTimer);
      mediaAutoRotateTimer = null;
    }
  };

  const setupMediaCarousel = () => {
    if (!dynamic) return;

    const track = dynamic.querySelector('[data-news-read-media-track]');
    const rail = dynamic.querySelector('[data-news-read-media-rail]');
    if (!(track instanceof HTMLElement) || !(rail instanceof HTMLElement)) {
      return;
    }

    const baseSlides = Array.from(rail.querySelectorAll('.news-read-media-slide'));
    if (baseSlides.length <= 1) {
      return;
    }

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

    const slides = Array.from(rail.querySelectorAll('.news-read-media-slide'));
    let index = 1;
    let touchStartX = 0;
    let touchStartY = 0;
    let hasTouchStart = false;

    const applySlidePosition = (nextIndex, animate = true) => {
      rail.style.transition = animate ? 'transform 420ms ease' : 'none';
      rail.style.transform = `translateX(-${nextIndex * 100}%)`;
    };

    const normalizeLoopEdgeIfNeeded = () => {
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
      index = (index + 1) % slides.length;
      applySlidePosition(index, true);
    };

    const goToPrevious = () => {
      index = (index - 1 + slides.length) % slides.length;
      applySlidePosition(index, true);
    };

    const restartAutoRotate = () => {
      clearMediaCarousel();
      mediaAutoRotateTimer = window.setInterval(goToNext, 5000);
    };

    applySlidePosition(index, false);

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

      if (diffX < 0) {
        goToNext();
      } else {
        goToPrevious();
      }
      restartAutoRotate();
    }, { passive: true });

    restartAutoRotate();
  };

  const renderArticle = () => {
    const article = readArticle(laneSlides[currentIndex]);
    if (!dynamic) return;

    clearMediaCarousel();

    dynamic.innerHTML = `
      ${article.imageUrls.length
        ? `<div class="news-read-media"><div class="news-read-media-track" data-news-read-media-track><div class="news-read-media-rail" data-news-read-media-rail>${article.imageUrls
            .map(
              (url) =>
                `<div class="news-read-media-slide"><img class="news-read-image" src="${url}" alt="${article.title}" /></div>`
            )
            .join('')}</div></div></div>`
        : ''}
      <div class="news-read-content">
        ${article.category ? `<p class="news-read-category">${article.category}</p>` : ''}
        <p class="news-read-meta" aria-label="Article metadata">
          <span class="news-read-meta-item">By ${article.metadata.author}</span>
          <span class="news-read-meta-item">${article.metadata.location}</span>
          <span class="news-read-meta-item"><time datetime="${article.metadata.publishedIso}">${article.metadata.publishedLabel}</time></span>
          <span class="news-read-meta-item">${article.metadata.readTimeLabel}</span>
        </p>
        ${article.subtitle ? `<p class="news-read-subtitle">${article.subtitle}</p>` : ''}
        <div class="news-read-body">${article.bodyHtml || article.body || 'No article content provided yet.'}</div>
        ${article.href && article.href !== '#' ? `<a class="btn btn-secondary" href="${article.href}">Open linked page</a>` : ''}
      </div>
    `;

    if (heading) {
      heading.textContent = article.title || 'Latest News';
    }

    if (state) {
      state.textContent = `${currentIndex + 1} of ${laneSlides.length}`;
    }

    setupMediaCarousel();
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
    document.removeEventListener('touchmove', onSheetDragMove);
    document.removeEventListener('touchend', onSheetDragEnd);
    document.removeEventListener('touchcancel', onSheetDragEnd);
    clearMediaCarousel();
    document.body.classList.remove('news-read-open');
    overlay.remove();
  };

  const onSheetDragStart = (clientY) => {
    if (!isMobileSheetViewport()) return;
    isSheetDragging = true;
    sheetDragStartY = clientY;
    sheetDragOffsetY = 0;
    setSheetOffset(0, false);
  };

  const onSheetDragMove = (event) => {
    if (!isSheetDragging) return;

    const clientY = event instanceof TouchEvent
      ? event.touches?.[0]?.clientY
      : event.clientY;

    if (typeof clientY !== 'number') return;
    sheetDragOffsetY = Math.max(0, clientY - sheetDragStartY);
    setSheetOffset(sheetDragOffsetY, false);
  };

  const onSheetDragEnd = () => {
    if (!isSheetDragging) return;
    isSheetDragging = false;

    if (sheetDragOffsetY > 120) {
      closeWithSheetAnimation();
      return;
    }

    sheetDragOffsetY = 0;
    setSheetOffset(0, true);
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

  sheetHandle?.addEventListener('touchstart', (event) => {
    if (!isMobileSheetViewport()) return;
    if (!event.touches || event.touches.length !== 1) return;
    onSheetDragStart(event.touches[0].clientY);
  }, { passive: true });

  document.addEventListener('touchmove', onSheetDragMove, { passive: true });
  document.addEventListener('touchend', onSheetDragEnd);
  document.addEventListener('touchcancel', onSheetDragEnd);

  overlay.querySelector('[data-news-next]')?.addEventListener('click', nextArticle);
  overlay.querySelector('[data-news-prev]')?.addEventListener('click', previousArticle);
  overlay.querySelector('[data-news-close]')?.addEventListener('click', close);
  document.addEventListener('keydown', onKeyDown);
  document.body.classList.add('news-read-open');
  document.body.appendChild(overlay);
  if (panel instanceof HTMLElement) {
    setSheetOffset(panel.getBoundingClientRect().height, false);
    window.requestAnimationFrame(() => {
      setSheetOffset(0, true);
    });
  }
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

export const initMatchEventLogs = () => {
  const logs = Array.from(document.querySelectorAll('[data-match-log="true"]'));
  logs.forEach((log) => hydrateMatchLog(log));
};

export const initFixtureCreators = () => {
  const creators = Array.from(document.querySelectorAll('[data-fixture-creator="true"]'));
  creators.forEach((creator) => hydrateFixtureCreator(creator));
};

export const initSchoolCalendars = () => {
  const calendars = Array.from(document.querySelectorAll('[data-school-calendar-shell="true"]'));
  calendars.forEach((calendar) => hydrateSchoolCalendar(calendar));
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
    ${
      isAdminModeEnabled()
        ? `
    <div class="container footer-admin-tools">
      <form class="gemini-tester" data-gemini-tester="true" novalidate>
        <label for="gemini-test-input">Gemini API Test</label>
        <div class="gemini-tester-row">
          <input id="gemini-test-input" name="prompt" type="text" value="Say OK if the API key works." maxlength="200" />
          <button type="submit" class="btn btn-secondary">Test Key</button>
        </div>
        <p class="gemini-tester-status" data-gemini-status aria-live="polite"></p>
      </form>
    </div>
    `
        : ''
    }
  </footer>
`;
