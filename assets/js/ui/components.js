import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import {
  persistEnrollmentStore,
  readEnrollmentStoreLocal,
  stampEnrollmentStorePayload,
  syncEnrollmentStoreFromRemote
} from '../content/enrollment.persistence.js';
import { persistLocalStore, syncLocalStoreFromRemote } from '../content/localstore.remote.js';
import { exportProfessionalWorkbook } from '../content/professional-export.js';

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
  const bodyText = context.concise ? toConcisePublicText(item.body, 90) : item.body;
  const content = `
    <img class="card-image ${hasImage ? '' : 'is-hidden'}" src="${hasImage ? primaryImageUrl : ''}" alt="${item.title}" loading="lazy" />
    <div class="card-content">
      <h3>${item.title}</h3>
      <p>${bodyText}</p>
    </div>
  `;
  if (clickable) {
    return `<a class="${cardClass}" href="${item.href || '#'}" ${attrs}>${content}</a>`;
  }
  return `<article class="${cardClass}" ${attrs}>${content}</article>`;
};

const isAdminModeEnabled = () => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('admin') === '1';
};

const isStaffModeEnabled = () => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('staff') === '1';
};

const isPublicAudienceEnabled = () => !isAdminModeEnabled() && !isStaffModeEnabled();

const toConcisePublicText = (value, maxChars = 110) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const sentenceMatch = text.match(/^(.{1,200}?[.!?])(?:\s|$)/);
  const sentence = sentenceMatch ? sentenceMatch[1].trim() : text;
  if (sentence.length <= maxChars) return sentence;

  const clipped = sentence.slice(0, maxChars).trim().replace(/[\s,;:.!?-]+$/g, '');
  return `${clipped}...`;
};

const withAudienceQuery = (href) => {
  if (!href) return href;
  if (typeof window === 'undefined') return href;

  const adminMode = isAdminModeEnabled();
  const staffMode = !adminMode && isStaffModeEnabled();
  if (!adminMode && !staffMode) return href;

  if (/^(https?:|mailto:|tel:|#)/i.test(href)) {
    return href;
  }

  try {
    const url = new URL(href, window.location.origin);
    if (adminMode) {
      url.searchParams.set('admin', '1');
      url.searchParams.delete('staff');
    } else {
      url.searchParams.set('staff', '1');
      url.searchParams.delete('admin');
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
};

const ensureToastHost = () => {
  if (typeof document === 'undefined') return null;
  const existing = document.querySelector('[data-app-toast-host]');
  if (existing instanceof HTMLElement) return existing;

  const host = document.createElement('div');
  host.className = 'app-toast-host';
  host.setAttribute('data-app-toast-host', 'true');
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-atomic', 'false');
  document.body.appendChild(host);
  return host;
};

const showSmartToast = (message, { tone = 'info' } = {}) => {
  const text = String(message || '').trim();
  if (!text) return;

  const host = ensureToastHost();
  if (!(host instanceof HTMLElement)) return;

  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.dataset.tone = tone;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.textContent = text;
  host.appendChild(toast);

  const timeout = Math.max(2200, Math.min(6200, 1500 + text.length * 28));
  const closeToast = () => {
    toast.classList.add('is-hiding');
    window.setTimeout(() => {
      toast.remove();
    }, 220);
  };

  window.setTimeout(closeToast, timeout);
};

const portalOverlayToBody = (node, portalKey = '') => {
  if (!(node instanceof HTMLElement) || typeof document === 'undefined') return node;

  const key = String(portalKey || '').trim();
  if (key) {
    node.dataset.overlayPortalKey = key;
    const existing = Array.from(document.querySelectorAll('[data-overlay-portal-key]')).find(
      (entry) => entry instanceof HTMLElement && entry.dataset.overlayPortalKey === key
    );
    if (existing instanceof HTMLElement && existing !== node) {
      existing.remove();
    }
  }

  if (node.parentElement !== document.body) {
    document.body.appendChild(node);
  }

  return node;
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
          ${isAdminModeEnabled() ? '<button type="button" class="latest-news-post-btn" data-post-news>Post new article</button>' : ''}
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

const parseStandingMetric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStandingsTeamOptions = (section, context = {}) => {
  const normalizeOption = (entry, index) => {
    const source = entry && typeof entry === 'object' ? entry : {};
    const id = String(source.id || source.key || source.teamId || `team_${index + 1}`)
      .trim()
      .toLowerCase();
    const name = String(source.name || source.label || source.team || `Team ${index + 1}`).trim() || `Team ${index + 1}`;
    if (!id) return null;
    return { id, name };
  };

  const pageSections = Array.isArray(context?.page?.sections) ? context.page.sections : [];
  const fixtureSectionKey = String(section.fixtureSectionKey || '').trim();
  const linkedFixtureSection = pageSections.find((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.type !== 'fixture-creator') return false;
    if (!fixtureSectionKey) return true;
    return String(entry.sectionKey || '').trim() === fixtureSectionKey;
  });
  const linkedMatchSection = pageSections.find((entry) => entry && typeof entry === 'object' && entry.type === 'match-log');

  const persistedHouseOptions = (() => {
    try {
      const raw = localStorage.getItem('bhanoyi.sportsHouseOptions');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const candidates = [
    Array.isArray(section.houseOptions) ? section.houseOptions : [],
    Array.isArray(linkedFixtureSection?.houseOptions) ? linkedFixtureSection.houseOptions : [],
    Array.isArray(linkedMatchSection?.houseOptions) ? linkedMatchSection.houseOptions : [],
    persistedHouseOptions
  ];

  const picked = candidates.find((entry) => Array.isArray(entry) && entry.length > 0) || [];
  const uniqueById = new Map();
  picked
    .map(normalizeOption)
    .filter(Boolean)
    .forEach((entry) => {
      if (!uniqueById.has(entry.id)) {
        uniqueById.set(entry.id, entry);
      }
    });

  return Array.from(uniqueById.values());
};

const getSortedStandingsRows = (rows) =>
  rows
    .map((entry) => ({
      ...entry,
      mp: parseStandingMetric(entry.mp),
      w: parseStandingMetric(entry.w),
      d: parseStandingMetric(entry.d),
      l: parseStandingMetric(entry.l),
      gf: parseStandingMetric(entry.gf),
      ga: parseStandingMetric(entry.ga),
      gd: parseStandingMetric(entry.gd),
      pts: parseStandingMetric(entry.pts)
    }))
    .sort((left, right) => {
      if (right.pts !== left.pts) return right.pts - left.pts;
      if (right.gd !== left.gd) return right.gd - left.gd;
      if (right.gf !== left.gf) return right.gf - left.gf;
      return String(left.team || '').localeCompare(String(right.team || ''));
    })
    .map((entry, index) => ({ ...entry, position: index + 1 }));

const normalizeStandingsSportCode = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('football') || raw.includes('soccer')) return 'football';
  if (raw.includes('netball')) return 'netball';
  return '';
};

const computeStandingsViewModel = (section, context = {}) => {
  const fixtureSectionKey = String(section.fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator';
  const selectedSport = normalizeStandingsSportCode(context.selectedSport || section.defaultSport || 'football') || 'football';
  const houseOptions = normalizeStandingsTeamOptions(section, context);
  const teamStats = new Map(
    houseOptions.map((team) => [
      team.id,
      {
        teamId: team.id,
        team: team.name,
        mp: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
      }
    ])
  );

  const fixtureCatalog = readLocalStorageObject(getFixtureCatalogStorageKey(fixtureSectionKey));
  const fixtureDateMap = readLocalStorageObject(getFixtureDateStorageKey(fixtureSectionKey));
  const logsByFixture = readLocalStorageObject(getMatchLogByFixtureStorageKey(fixtureSectionKey));

  let latestUpdatedAt = 0;

  Object.entries(fixtureCatalog).forEach(([fixtureId, fixtureData]) => {
    const fixture = fixtureData && typeof fixtureData === 'object' ? fixtureData : {};
    const fixtureSport = normalizeStandingsSportCode(fixture.sport || '');
    if (selectedSport && fixtureSport && fixtureSport !== selectedSport) return;
    const stamp = splitFixtureStampGlobal(fixtureDateMap[fixtureId]);
    if (!stamp.date) return;

    const homeId = String(fixture.homeId || '').trim().toLowerCase();
    const awayId = String(fixture.awayId || '').trim().toLowerCase();
    if (!homeId || !awayId || homeId === awayId) return;

    const entry = logsByFixture[fixtureId];
    if (!entry || typeof entry !== 'object') return;

    const homeScore = Number(entry.homeScore);
    const awayScore = Number(entry.awayScore);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;

    const eventCount = Array.isArray(entry.events) ? entry.events.length : 0;
    const hasResult =
      eventCount > 0 ||
      entry.hasResult === true ||
      entry.isFinal === true ||
      entry.markedPlayed === true;
    if (!hasResult) return;

    if (!teamStats.has(homeId)) {
      teamStats.set(homeId, {
        teamId: homeId,
        team: String(fixture.homeName || homeId).trim() || homeId,
        mp: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
      });
    }
    if (!teamStats.has(awayId)) {
      teamStats.set(awayId, {
        teamId: awayId,
        team: String(fixture.awayName || awayId).trim() || awayId,
        mp: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
      });
    }

    const home = teamStats.get(homeId);
    const away = teamStats.get(awayId);

    home.mp += 1;
    away.mp += 1;
    home.gf += homeScore;
    home.ga += awayScore;
    away.gf += awayScore;
    away.ga += homeScore;

    if (homeScore > awayScore) {
      home.w += 1;
      home.pts += 3;
      away.l += 1;
    } else if (awayScore > homeScore) {
      away.w += 1;
      away.pts += 3;
      home.l += 1;
    } else {
      home.d += 1;
      away.d += 1;
      home.pts += 1;
      away.pts += 1;
    }

    const updatedAt = Number(entry.updatedAt);
    if (Number.isFinite(updatedAt) && updatedAt > latestUpdatedAt) {
      latestUpdatedAt = updatedAt;
    }
  });

  let rows = Array.from(teamStats.values()).map((entry) => ({
    ...entry,
    gd: entry.gf - entry.ga
  }));

  if (!rows.length && Array.isArray(section.items) && section.items.length) {
    rows = section.items.map((item, index) => {
      const gf = parseStandingMetric(item.gf);
      const ga = parseStandingMetric(item.ga);
      return {
        position: parseStandingMetric(item.position) || index + 1,
        team: (item.team || '').trim() || `Team ${index + 1}`,
        mp: parseStandingMetric(item.mp),
        w: parseStandingMetric(item.w),
        d: parseStandingMetric(item.d),
        l: parseStandingMetric(item.l),
        gf,
        ga,
        gd: gf - ga,
        pts: parseStandingMetric(item.pts)
      };
    });
  }

  const sortedRows = getSortedStandingsRows(rows);
  const sectionLastUpdated = String(section.lastUpdated || '').trim();
  const computedLastUpdated = latestUpdatedAt
    ? new Date(latestUpdatedAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : '';

  return {
    fixtureSectionKey,
    selectedSport,
    rows: sortedRows,
    lastUpdated: computedLastUpdated || sectionLastUpdated || 'N/A',
    sortNote: (section.sortNote || '').trim() || 'Tie-break order: Pts > GD > GF',
    houseOptions
  };
};

const renderStandingsRowsMarkup = (rows) =>
  rows
    .map(
      (item, index) => `
        <tr class="${index === 0 ? 'standings-row-leading' : ''}">
          <td>${item.position}</td>
          <th scope="row">${escapeHtmlText(item.team)}</th>
          <td>${item.mp}</td>
          <td>${item.w}</td>
          <td>${item.d}</td>
          <td>${item.l}</td>
          <td>${item.gf}</td>
          <td>${item.ga}</td>
          <td>${item.gd}</td>
          <td><strong>${item.pts}</strong></td>
        </tr>
      `
    )
    .join('');

const renderLeagueStandingsSection = (section, sectionIndex, context = {}) => {
  const viewModel = computeStandingsViewModel(section, context);
  const standingsConfig = {
    fixtureSectionKey: viewModel.fixtureSectionKey,
    selectedSport: viewModel.selectedSport,
    houseOptions: viewModel.houseOptions,
    items: Array.isArray(section.items) ? section.items : [],
    lastUpdated: String(section.lastUpdated || '').trim(),
    sortNote: String(section.sortNote || '').trim()
  };

  return `
    <section class="section ${section.alt ? 'section-alt' : ''}" data-section-index="${sectionIndex}" data-section-type="league-standings" data-league-standings="true" data-standings-config="${escapeHtmlAttribute(JSON.stringify(standingsConfig))}">
      <div class="container">
        <h2>${section.title}</h2>
        ${section.subtitle ? `<p class="standings-subtitle">${section.subtitle}</p>` : ''}
        <article class="panel standings-panel">
          <div class="standings-sport-switch" role="tablist" aria-label="Select sport">
            <button type="button" class="standings-sport-tab ${viewModel.selectedSport === 'football' ? 'is-active' : ''}" data-standings-sport-tab="football" aria-selected="${viewModel.selectedSport === 'football' ? 'true' : 'false'}">Football</button>
            <span class="standings-sport-separator" aria-hidden="true">/</span>
            <button type="button" class="standings-sport-tab ${viewModel.selectedSport === 'netball' ? 'is-active' : ''}" data-standings-sport-tab="netball" aria-selected="${viewModel.selectedSport === 'netball' ? 'true' : 'false'}">Netball</button>
            ${isAdminModeEnabled() ? '<button type="button" class="btn btn-secondary standings-export-btn" data-standings-export>Export standings</button>' : ''}
          </div>
          <div class="standings-table-wrap" role="region" aria-label="League standings" tabindex="0">
            <table class="standings-table">
              <thead>
                <tr>
                  <th scope="col">Pos</th>
                  <th scope="col">Team</th>
                  <th scope="col">MP</th>
                  <th scope="col">W</th>
                  <th scope="col">D</th>
                  <th scope="col">L</th>
                  <th scope="col">GF</th>
                  <th scope="col">GA</th>
                  <th scope="col">GD</th>
                  <th scope="col">Pts</th>
                </tr>
              </thead>
              <tbody data-standings-body>
                ${renderStandingsRowsMarkup(viewModel.rows)}
              </tbody>
            </table>
          </div>
          <p class="standings-meta">
            <span data-standings-last-updated>Last Updated: ${escapeHtmlText(viewModel.lastUpdated)}</span>
            <span data-standings-sort-note>${escapeHtmlText(viewModel.sortNote)}</span>
          </p>
        </article>
      </div>
    </section>
  `;
};

const hydrateLeagueStandings = (standingsNode) => {
  const rawConfig = String(standingsNode?.dataset?.standingsConfig || '').trim();
  if (!rawConfig) return;

  let section;
  try {
    section = JSON.parse(rawConfig);
  } catch {
    return;
  }

  if (!section || typeof section !== 'object') return;

  const bodyNode = standingsNode.querySelector('[data-standings-body]');
  const lastUpdatedNode = standingsNode.querySelector('[data-standings-last-updated]');
  const sortNoteNode = standingsNode.querySelector('[data-standings-sort-note]');
  const sportTabs = Array.from(standingsNode.querySelectorAll('[data-standings-sport-tab]'));
  const exportButton = standingsNode.querySelector('[data-standings-export]');
  if (!(bodyNode instanceof HTMLElement)) return;

  const fixtureSectionKey = String(section.fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator';
  const fixtureCatalogStorageKey = getFixtureCatalogStorageKey(fixtureSectionKey);
  const fixtureDateStorageKey = getFixtureDateStorageKey(fixtureSectionKey);
  const matchLogStorageKey = getMatchLogByFixtureStorageKey(fixtureSectionKey);
  let selectedSport = normalizeStandingsSportCode(section.selectedSport || 'football') || 'football';

  const currentViewModel = () => computeStandingsViewModel(section, { selectedSport });

  const buildStandingsExportBaseName = (sportLabel) => {
    const safeSport = String(sportLabel || 'football')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const stamp = new Date().toISOString().slice(0, 10);
    return `inter-house-${safeSport || 'football'}-standings-${stamp}`;
  };

  const refresh = () => {
    const viewModel = currentViewModel();
    bodyNode.innerHTML = renderStandingsRowsMarkup(viewModel.rows);
    selectedSport = viewModel.selectedSport;
    sportTabs.forEach((tab) => {
      if (!(tab instanceof HTMLButtonElement)) return;
      const tabSport = normalizeStandingsSportCode(tab.dataset.standingsSportTab || '');
      const active = tabSport === selectedSport;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (lastUpdatedNode instanceof HTMLElement) {
      lastUpdatedNode.textContent = `Last Updated: ${viewModel.lastUpdated}`;
    }
    if (sortNoteNode instanceof HTMLElement) {
      sortNoteNode.textContent = viewModel.sortNote;
    }
  };

  sportTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (!(tab instanceof HTMLButtonElement)) return;
      const nextSport = normalizeStandingsSportCode(tab.dataset.standingsSportTab || '');
      if (!nextSport || nextSport === selectedSport) return;
      selectedSport = nextSport;
      refresh();
    });
  });

  exportButton?.addEventListener('click', async () => {
    if (!isAdminModeEnabled()) return;

    const viewModel = currentViewModel();
    if (!Array.isArray(viewModel.rows) || !viewModel.rows.length) {
      showSmartToast('No standings data to export yet.', { tone: 'info' });
      return;
    }

    const sportLabel = selectedSport === 'netball' ? 'Netball' : 'Football';
    const subtitle = String(section.subtitle || '').trim();

    const rows = viewModel.rows.map((row) => ({
      pos: Number(row.position || 0),
      team: String(row.team || '').trim(),
      mp: Number(row.mp || 0),
      w: Number(row.w || 0),
      d: Number(row.d || 0),
      l: Number(row.l || 0),
      gf: Number(row.gf || 0),
      ga: Number(row.ga || 0),
      gd: Number(row.gd || 0),
      pts: Number(row.pts || 0)
    }));

    try {
      await exportProfessionalWorkbook({
        fileName: `${buildStandingsExportBaseName(sportLabel)}.xlsx`,
        sheetName: `${sportLabel} Standings`,
        title: 'Official League Standings',
        contextLine: subtitle ? `${subtitle} • ${sportLabel}` : `Inter-House League • ${sportLabel}`,
        metaLine: `Last Updated: ${viewModel.lastUpdated}`,
        columns: [
          { header: 'Pos', key: 'pos', width: 7, align: 'center' },
          { header: 'Team', key: 'team', width: 22, align: 'left' },
          { header: 'MP', key: 'mp', width: 7, align: 'center' },
          { header: 'W', key: 'w', width: 7, align: 'center' },
          { header: 'D', key: 'd', width: 7, align: 'center' },
          { header: 'L', key: 'l', width: 7, align: 'center' },
          { header: 'GF', key: 'gf', width: 7, align: 'center' },
          { header: 'GA', key: 'ga', width: 7, align: 'center' },
          { header: 'GD', key: 'gd', width: 7, align: 'center' },
          { header: 'Pts', key: 'pts', width: 7, align: 'center' }
        ],
        rows,
        note: String(viewModel.sortNote || '').trim() || 'Tie-break order: Pts > GD > GF',
        afterRows: ({ sheet, dataStartRow }) => {
          const topRow = dataStartRow;
          ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].forEach((columnLabel) => {
            const cell = sheet.getCell(`${columnLabel}${topRow}`);
            cell.font = {
              ...(cell.font || {}),
              bold: true
            };
          });
        }
      });
      showSmartToast('Standings exported (.xlsx).', { tone: 'success' });
    } catch {
      showSmartToast('Could not export standings right now.', { tone: 'error' });
    }
  });

  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    if (
      event.key !== fixtureCatalogStorageKey &&
      event.key !== fixtureDateStorageKey &&
      event.key !== matchLogStorageKey
    ) {
      return;
    }
    refresh();
  });

  window.addEventListener('bhanoyi:fixtures-updated', (event) => {
    const sectionFromEvent = String(event?.detail?.sectionKey || '').trim();
    if (sectionFromEvent && sectionFromEvent !== fixtureSectionKey) return;
    refresh();
  });

  window.addEventListener('bhanoyi:match-log-updated', (event) => {
    const sectionFromEvent = String(event?.detail?.fixtureSectionKey || '').trim();
    if (sectionFromEvent && sectionFromEvent !== fixtureSectionKey) return;
    refresh();
  });

  refresh();
};

export const renderHeader = (siteContent, pageKey) => {
  const adminMode = isAdminModeEnabled();
  const staffMode = !adminMode && isStaffModeEnabled();
  const publicNavKeys = new Set(['home', 'about', 'academics', 'sports', 'admissions', 'policies', 'contact']);

  const links = siteContent.navigation
    .filter((item) => {
      if (adminMode || staffMode) return true;
      const key = String(item?.key || '').trim().toLowerCase();
      return publicNavKeys.has(key);
    })
    .flatMap((item) => {
      if (!item) return [];

      if (item.adminOnly) {
        if (adminMode) {
          return [item];
        }

        if (staffMode && String(item.key || '') === 'enrollment') {
          return [{ ...item, label: 'My Class', href: 'enrollment.html' }];
        }

        return [];
      }

      return [item];
    })
    .map((item) => {
      const current = item.key === pageKey ? ' aria-current="page"' : '';
      return `<li><a href="${withAudienceQuery(item.href)}"${current}>${item.label}</a></li>`;
    })
    .join('');
  const headerBackgroundImage = (siteContent.school?.headerBackgroundImage || '').trim();
  const headerBackgroundAttr = headerBackgroundImage.replace(/"/g, '&quot;');

  const brandVisual = siteContent.school.logoPath
    ? `<img class="brand-logo" src="${siteContent.school.logoPath}" alt="${siteContent.school.name} logo" />`
    : `<span class="brand-mark" aria-hidden="true">${siteContent.school.shortName}</span>`;

  return `
    <header class="site-header ${headerBackgroundImage ? 'has-header-bg' : ''}" data-header-bg-url="${headerBackgroundAttr}">
      <div class="container header-inner">
        <a class="brand" href="${withAudienceQuery('index.html')}" aria-label="${siteContent.school.name} home">
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

  const notice = includeNotice ? renderHeroNoticeAside(hero.notice, pageKey) : '';
  const leadText = isPublicAudienceEnabled() ? toConcisePublicText(hero.lead, 120) : hero.lead;

  return `
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <p class="eyebrow">${hero.eyebrow || ''}</p>
          <h1>${hero.title}</h1>
          <p class="lead">${leadText}</p>
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

const ADMIN_SECTION_COPY_BY_KEY = Object.freeze({
  latest_news: { title: 'Manage Latest News' },
  quick_links: { title: 'Manage Quick Links' },
  upcoming_events: { title: 'Manage Upcoming Events' },
  school_culture: { title: 'Manage School Culture' },
  academic_programme: { title: 'Manage Academic Programmes' },
  sports_match_log: {
    title: 'Log Live Match Events',
    body: 'Sports committee can log live football or netball match events as they happen. Score updates automatically when goals are logged.'
  },
  sports_fixture_creator: {
    title: 'Create Season Fixtures',
    body: 'Generate the full home-and-away round-robin schedule for the selected houses.'
  },
  sporting_codes: { title: 'Manage Sporting Codes' },
  school_calendar: {
    title: 'Manage School Calendar',
    body: 'Admins can add and manage school events here. Fixture date edits from Sports open this calendar.'
  },
  admission_support: { title: 'Manage Admission Support' },
  policy_categories: { title: 'Manage Policy Categories' },
  public_information_areas: { title: 'Manage Public Information Areas' }
});

const ADMIN_SECTION_TITLE_BY_PUBLIC = Object.freeze({
  'check notices & announcements': 'Manage Notices & Announcements',
  'discover vision and values': 'Manage Vision and Values',
  'review curriculum information': 'Manage Curriculum Information',
  'plan training and fixtures': 'Manage Training and Fixtures',
  'check application requirements': 'Manage Application Requirements',
  'download admission forms & documents': 'Manage Admission Documents',
  'download policy documents': 'Manage Policy Documents',
  'find contact information': 'Manage Contact Information',
  'check office hours': 'Manage Office Hours'
});

const resolveAudienceSectionCopy = (section, context = {}) => {
  if (!isAdminModeEnabled()) {
    return section;
  }

  const sectionKey = String(section.sectionKey || '').trim();
  const byKey = sectionKey ? ADMIN_SECTION_COPY_BY_KEY[sectionKey] : null;
  const normalizedTitle = String(section.title || '').trim().toLowerCase();
  const titleByPublic = normalizedTitle ? ADMIN_SECTION_TITLE_BY_PUBLIC[normalizedTitle] : '';

  const nextTitle = byKey?.title || titleByPublic || section.title;
  const nextBody = byKey?.body || section.body;

  if (nextTitle === section.title && nextBody === section.body) {
    return section;
  }

  return {
    ...section,
    title: nextTitle,
    body: nextBody
  };
};

const isAdminOnlySectionForPublic = (section) => {
  const type = String(section?.type || '').trim().toLowerCase();
  return type === 'match-log';
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

const DEFAULT_HOUSE_COLORS = ['#d62828', '#1d4ed8', '#15803d', '#f59e0b', '#7c3aed'];

const normalizeHouseColor = (value, fallback = '#64748b') => {
  const raw = String(value || '').trim();
  return /^#([0-9a-fA-F]{6})$/.test(raw) ? raw.toLowerCase() : fallback;
};

const normalizeMatchTeams = (sectionTeams = []) => {
  const candidates = Array.isArray(sectionTeams) ? sectionTeams : [];
  const normalized = candidates
    .map((entry, index) => {
      const source = entry && typeof entry === 'object' ? entry : { name: String(entry || '').trim() };
      const name = (source.name || `Team ${index + 1}`).trim() || `Team ${index + 1}`;
      const id = (source.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `team_${index + 1}`).trim();
      const shortName = (source.shortName || name).trim() || name;
      const color = normalizeHouseColor(source.color, DEFAULT_HOUSE_COLORS[index % DEFAULT_HOUSE_COLORS.length]);
      return { id, name, shortName, color };
    })
    .filter((entry, index, list) =>
      entry.id &&
      entry.name &&
      list.findIndex((candidate) => candidate.id === entry.id) === index
    );

  if (normalized.length >= 2) return normalized;
  return [
    { id: 'home', name: 'Home', shortName: 'Home', color: DEFAULT_HOUSE_COLORS[0] },
    { id: 'away', name: 'Away', shortName: 'Away', color: DEFAULT_HOUSE_COLORS[1] }
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

const getExpandedWorkflowBodyMaxHeight = (body) => {
  if (!(body instanceof HTMLElement)) {
    return '0px';
  }
  const target = Math.max(0, body.scrollHeight);
  return `${target}px`;
};

const initSportsWorkflowSteps = (rootNode) => {
  const steps = Array.from(rootNode.querySelectorAll('[data-sports-workflow-step]'))
    .map((stepNode) => {
      if (!(stepNode instanceof HTMLElement)) return null;
      const toggle = stepNode.querySelector('[data-sports-workflow-toggle]');
      const body = stepNode.querySelector('[data-sports-workflow-body]');
      if (!(toggle instanceof HTMLButtonElement) || !(body instanceof HTMLElement)) return null;
      return {
        id: String(stepNode.dataset.sportsWorkflowId || '').trim(),
        stepNode,
        toggle,
        body
      };
    })
    .filter(Boolean);

  const setExpanded = (entry, expanded) => {
    if (!entry) return;
    entry.stepNode.classList.toggle('is-expanded', expanded);
    entry.stepNode.classList.toggle('is-collapsed', !expanded);
    entry.toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    entry.body.style.maxHeight = expanded ? getExpandedWorkflowBodyMaxHeight(entry.body) : '0px';
  };

  steps.forEach((entry) => {
    const startsExpanded = entry.stepNode.classList.contains('is-expanded');
    setExpanded(entry, startsExpanded);
    entry.toggle.addEventListener('click', () => {
      const isExpanded = entry.stepNode.classList.contains('is-expanded');
      setExpanded(entry, !isExpanded);
    });
  });

  window.addEventListener('resize', () => {
    steps.forEach((entry) => {
      if (!entry.stepNode.classList.contains('is-expanded')) return;
      entry.body.style.maxHeight = getExpandedWorkflowBodyMaxHeight(entry.body);
    });
  });

  return {
    expandStep: (id) => {
      const key = String(id || '').trim();
      if (!key) return;
      const matched = steps.find((entry) => entry.id === key);
      if (!matched) return;
      setExpanded(matched, true);
    },
    expandAll: () => {
      steps.forEach((entry) => {
        setExpanded(entry, true);
      });
    }
  };
};

const renderMatchLogSection = (section, sectionIndex) => {
  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;
  const inputSuffix = String(fallbackSectionKey || 'sports_log').replace(/[^a-zA-Z0-9_-]/g, '_');
  const playerOptionsId = `match-player-options-${inputSuffix}`;
  const assistOptionsId = `match-assist-options-${inputSuffix}`;
  const fixtureSectionKey = (section.fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator';
  const houseOptions = normalizeMatchTeams(
    Array.isArray(section.houseOptions) && section.houseOptions.length
      ? section.houseOptions
      : section.teams
  );
  const teamPair = getDefaultMatchPair(houseOptions, section.leftTeamId || '', section.rightTeamId || '');
  const eventTypes = normalizeMatchEventTypes(section.eventTypes);
  const pauseReasons = (Array.isArray(section.pauseReasons) ? section.pauseReasons : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  const initialScores = houseOptions.reduce((acc, team) => {
    const raw = Number(section.initialScores?.[team.id]);
    acc[team.id] = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
    return acc;
  }, {});

  const config = {
    sectionKey: fallbackSectionKey,
    fixtureSectionKey,
    sport: (section.sport || 'Football').trim() || 'Football',
    competition: (section.competition || 'Friendly Match').trim() || 'Friendly Match',
    venue: (section.venue || '').trim(),
    houseOptions,
    leftTeamId: teamPair.leftTeamId,
    rightTeamId: teamPair.rightTeamId,
    eventTypes,
    pauseReasons,
    initialScores
  };

  const leftTeam = houseOptions.find((team) => team.id === teamPair.leftTeamId) || houseOptions[0];
  const rightTeam = houseOptions.find((team) => team.id === teamPair.rightTeamId) || houseOptions[1] || leftTeam;
  return `
    <section class="section ${section.alt ? 'section-alt' : ''} match-log-modal-host" data-editable-section="true" data-section-index="${sectionIndex}" data-section-type="match-log" data-section-key="${fallbackSectionKey}">
      <div class="match-log-workspace-modal is-hidden" data-match-workspace-modal>
        <div class="match-log-workspace-backdrop" data-match-workspace-close></div>
        <article class="panel match-log-workspace-panel" role="dialog" aria-modal="true" aria-label="Log Live Match Events">
          <header class="match-log-workspace-head">
            <div>
              <h2>${section.title || 'Log Live Match Events'}</h2>
              ${section.body ? `<p class="lead">${section.body}</p>` : ''}
            </div>
            <button type="button" class="btn btn-secondary" data-match-workspace-close>Close</button>
          </header>
          <article class="match-log-shell" data-match-log="true" data-match-log-id="${fallbackSectionKey}" data-match-log-config="${escapeHtmlAttribute(JSON.stringify(config))}">
          <section class="sports-workflow-step is-expanded" data-sports-workflow-step data-sports-workflow-id="setup-log">
            <button type="button" class="sports-workflow-toggle" data-sports-workflow-toggle aria-expanded="true">
              <span>Set Up Match Logging</span>
            </button>
            <div class="sports-workflow-body" data-sports-workflow-body>
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
                  Match day
                  <select data-matchday-select>
                    <option value="">Select fixture date</option>
                  </select>
                </label>
                <label>
                  Fixture
                  <select data-match-fixture-select>
                    <option value="">Select match on chosen date</option>
                  </select>
                </label>
              </div>
              <p class="match-log-status" data-match-selected-fixture aria-live="polite">Choose a fixture date, then pick a match to log.</p>
              <div class="match-log-clock-panel">
                <div class="match-log-clock-grid">
                  <p class="match-log-clock-item">
                    <span>Match clock</span>
                    <strong data-match-clock>00:00</strong>
                  </p>
                  <p class="match-log-clock-item">
                    <span>Interruptions</span>
                    <strong data-match-interruption-clock>00:00</strong>
                  </p>
                </div>
                <div class="match-log-clock-actions">
                  <button type="button" class="btn btn-secondary" data-match-clock-start>Start match clock</button>
                  <label>
                    Pause reason
                    <select data-match-pause-reason>
                      <option value="">Select reason</option>
                      ${(config.pauseReasons.length ? config.pauseReasons : ['Injury', 'Weather delay', 'Equipment issue', 'Crowd disturbance', 'Official timeout'])
                        .map((reason) => `<option value="${escapeHtmlAttribute(reason)}">${escapeHtmlText(reason)}</option>`)
                        .join('')}
                    </select>
                  </label>
                  <button type="button" class="btn btn-secondary" data-match-pause>Pause match</button>
                  <button type="button" class="btn btn-secondary" data-match-resume>Resume match</button>
                </div>
                <p class="match-log-status" data-match-clock-status aria-live="polite">Match clock not started.</p>
              </div>
            </div>
          </section>
          <section class="sports-workflow-step is-collapsed" data-sports-workflow-step data-sports-workflow-id="log-events">
            <button type="button" class="sports-workflow-toggle" data-sports-workflow-toggle aria-expanded="false">
              <span>Log and Review Match Events</span>
            </button>
            <div class="sports-workflow-body" data-sports-workflow-body>
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
              <div class="match-log-player-stats">
                <h4>Player stats</h4>
                <p class="match-log-status" data-match-player-stats-status aria-live="polite">No player stats yet.</p>
                <div class="match-log-player-highlights" data-match-player-highlights>
                  <div class="match-log-player-highlight-card">
                    <span class="match-log-player-highlight-label">Top scorer</span>
                    <strong data-match-highlight-scorer>—</strong>
                  </div>
                  <div class="match-log-player-highlight-card">
                    <span class="match-log-player-highlight-label">Top assister</span>
                    <strong data-match-highlight-assister>—</strong>
                  </div>
                  <div class="match-log-player-highlight-card">
                    <span class="match-log-player-highlight-label">Most booked</span>
                    <strong data-match-highlight-booked>—</strong>
                  </div>
                </div>
                <div class="match-log-table-wrap">
                  <table class="match-log-table match-log-player-stats-table">
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>Player</th>
                        <th>Admission</th>
                        <th>Goals</th>
                        <th>Assists</th>
                        <th>Yellow</th>
                        <th>Red</th>
                        <th>Events</th>
                      </tr>
                    </thead>
                    <tbody data-match-player-stats-body>
                      <tr>
                        <td class="match-log-empty-cell" colspan="8">No player stats yet.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="match-log-footer-actions">
                <button type="button" class="btn btn-primary" data-match-save-log>Save match log</button>
                <p class="match-log-status" data-match-save-status aria-live="polite">Auto-save is on for every logged event.</p>
              </div>
            </div>
          </section>
          <div class="match-log-modal is-hidden" data-match-modal>
            <div class="match-log-modal-backdrop" data-match-close-modal></div>
            <article class="panel match-log-modal-panel" role="dialog" aria-modal="true" aria-label="Add match event">
              <h3 class="match-log-modal-title">Add match event</h3>
              <p class="match-log-modal-subtitle" data-match-modal-team></p>
              <div class="match-log-form-grid">
                <label>
                  Team
                  <select data-match-modal-team-select></select>
                </label>
              </div>
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
                      <input type="text" name="playerName" maxlength="120" placeholder="Start typing player name" list="${playerOptionsId}" autocomplete="off" />
                      <datalist id="${playerOptionsId}" data-match-player-options></datalist>
                    </label>
                    <label>
                      Jersey number
                      <input type="text" name="jerseyNumber" maxlength="8" placeholder="e.g. 9" />
                    </label>
                  </div>
                  <label class="match-log-assist-row is-hidden" data-assist-row>
                    Assist by (optional)
                    <input type="text" name="assistName" maxlength="120" placeholder="Start typing assister name" list="${assistOptionsId}" autocomplete="off" />
                    <datalist id="${assistOptionsId}" data-match-assist-options></datalist>
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
        </article>
      </div>
    </section>
  `;
};

const getMatchStorageKey = (sectionKey) => {
  const path = typeof window !== 'undefined' ? window.location.pathname : 'sports';
  return `bhanoyi.matchLog.${path}.${sectionKey}`;
};

const getMatchLogByFixtureStorageKey = (fixtureSectionKey) =>
  `bhanoyi.matchLogByFixture.${String(fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator'}`;

const getFixtureCatalogStorageKey = (fixtureSectionKey) =>
  `bhanoyi.fixtures.${String(fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator'}`;

const getFixtureDateStorageKey = (fixtureSectionKey) =>
  `bhanoyi.fixtureDates.${String(fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator'}`;

const readLocalStorageObject = (key) => {
  try {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return {};
    const raw = localStorage.getItem(normalizedKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
};

const normalizeFixtureDateOnlyGlobal = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}-${day}`;
};

const normalizeFixtureTimeOnlyGlobal = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const direct = raw.match(/T(\d{2}:\d{2})/);
  if (direct) return direct[1];
  const match = raw.match(/^(\d{2}:\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const normalizeFixtureStampGlobal = (value) => {
  const date = normalizeFixtureDateOnlyGlobal(value);
  if (!date) return '';
  const time = normalizeFixtureTimeOnlyGlobal(value);
  return time ? `${date}T${time}` : date;
};

const splitFixtureStampGlobal = (value) => {
  const normalized = normalizeFixtureStampGlobal(value);
  if (!normalized) return { date: '', time: '' };
  const [datePart, timePart] = normalized.split('T');
  return {
    date: datePart || '',
    time: timePart || ''
  };
};

const loadMatchLogByFixtureStore = (fixtureSectionKey) => {
  try {
    const raw = localStorage.getItem(getMatchLogByFixtureStorageKey(fixtureSectionKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveMatchLogByFixtureStore = (fixtureSectionKey, store) => {
  const key = getMatchLogByFixtureStorageKey(fixtureSectionKey);
  const safeStore = store && typeof store === 'object' ? store : {};
  localStorage.setItem(key, JSON.stringify(safeStore));
  void persistLocalStore(key, safeStore);
  return key;
};

const summarizeMatchLogEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return {
      eventCount: 0,
      scoreLabel: 'No log yet',
      compactLabel: 'No log yet'
    };
  }

  const eventCount = Array.isArray(entry.events) ? entry.events.length : 0;
  const homeName = String(entry.homeName || 'Home').trim() || 'Home';
  const awayName = String(entry.awayName || 'Away').trim() || 'Away';
  const homeScore = Number.isFinite(Number(entry.homeScore)) ? Number(entry.homeScore) : 0;
  const awayScore = Number.isFinite(Number(entry.awayScore)) ? Number(entry.awayScore) : 0;
  const scoreLabel = `${homeName} ${homeScore} - ${awayScore} ${awayName}`;
  const compactLabel = eventCount
    ? `${eventCount} event${eventCount === 1 ? '' : 's'} • ${homeScore}-${awayScore}`
    : 'No log yet';

  return {
    eventCount,
    scoreLabel,
    compactLabel
  };
};

const normalizeMatchPlayerEntry = (entry, fallback = {}) => {
  if (!entry || typeof entry !== 'object') return null;

  const name = String(entry.name || entry.playerName || '').trim();
  if (!name) return null;

  const admissionNo = String(entry.admissionNo || entry.admission || '').trim();
  const houseId = String(entry.houseId || fallback.houseId || '').trim().toLowerCase();
  const baseId = String(entry.id || '').trim();
  const normalizedNameKey = name.toLowerCase().replace(/\s+/g, ' ').trim();
  const id = baseId || admissionNo || `${houseId || 'team'}:${normalizedNameKey}`;

  return {
    id,
    name,
    admissionNo,
    houseId,
    gender: String(entry.gender || '').trim(),
    jerseyNumber: String(entry.jerseyNumber || '').trim(),
    sportingCodes: Array.isArray(entry.sportingCodes)
      ? Array.from(
          new Set(
            entry.sportingCodes
              .map((value) => String(value || '').trim())
              .filter(Boolean)
          )
        )
      : []
  };
};

const normalizeMatchPlayersForTeam = (players, fallback = {}) => {
  const seen = new Set();
  const normalized = [];

  (Array.isArray(players) ? players : []).forEach((entry) => {
    const player = normalizeMatchPlayerEntry(entry, fallback);
    if (!player) return;
    const dedupeKey = `${player.id}::${player.name.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    normalized.push(player);
  });

  return normalized.sort((left, right) => left.name.localeCompare(right.name));
};

const inferSportCodeMatches = (sportLabel, sportingCodes = []) => {
  const normalizedSport = String(sportLabel || '').trim().toLowerCase();
  if (!normalizedSport) return false;

  const hasSoccerLike = normalizedSport.includes('soccer') || normalizedSport.includes('football');
  const hasNetballLike = normalizedSport.includes('netball');

  const normalizedCodes = (Array.isArray(sportingCodes) ? sportingCodes : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  if (!normalizedCodes.length) return false;

  if (hasSoccerLike) {
    return normalizedCodes.some((entry) => entry.includes('soccer') || entry.includes('football'));
  }

  if (hasNetballLike) {
    return normalizedCodes.some((entry) => entry.includes('netball'));
  }

  return normalizedCodes.some((entry) => normalizedSport.includes(entry) || entry.includes(normalizedSport));
};

const loadEnrollmentPlayersByHouse = (homeId, awayId, sportLabel) => {
  const targetHouseIds = new Set(
    [String(homeId || '').trim().toLowerCase(), String(awayId || '').trim().toLowerCase()].filter(Boolean)
  );
  const byHouse = {
    [String(homeId || '').trim().toLowerCase()]: [],
    [String(awayId || '').trim().toLowerCase()]: []
  };

  if (!targetHouseIds.size) return byHouse;

  const enrollmentKeys = Object.keys(localStorage).filter((key) => key.startsWith('bhanoyi.enrollmentClasses.'));
  const houseBuckets = new Map();

  enrollmentKeys.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const profiles = parsed?.classProfilesByGrade;
      if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) return;

      Object.values(profiles).forEach((gradeProfiles) => {
        if (!gradeProfiles || typeof gradeProfiles !== 'object' || Array.isArray(gradeProfiles)) return;
        Object.values(gradeProfiles).forEach((profile) => {
          const learners = Array.isArray(profile?.learners) ? profile.learners : [];
          learners.forEach((learner) => {
            if (!learner || typeof learner !== 'object') return;
            const houseId = String(learner.houseId || '').trim().toLowerCase();
            if (!targetHouseIds.has(houseId)) return;
            const name = String(learner.name || '').trim();
            if (!name) return;

            const admissionNo = String(learner.admissionNo || '').trim();
            const entry = {
              id: admissionNo || `${houseId}:${name.toLowerCase().replace(/\s+/g, ' ').trim()}`,
              name,
              admissionNo,
              houseId,
              gender: String(learner.gender || '').trim(),
              sportingCodes: Array.isArray(learner.sportingCodes)
                ? learner.sportingCodes.map((value) => String(value || '').trim()).filter(Boolean)
                : []
            };

            if (!houseBuckets.has(houseId)) {
              houseBuckets.set(houseId, []);
            }
            houseBuckets.get(houseId).push(entry);
          });
        });
      });
    } catch {
      return;
    }
  });

  targetHouseIds.forEach((houseId) => {
    const allPlayers = normalizeMatchPlayersForTeam(houseBuckets.get(houseId) || [], { houseId });
    const sportFiltered = allPlayers.filter((player) => inferSportCodeMatches(sportLabel, player.sportingCodes));
    byHouse[houseId] = sportFiltered.length ? sportFiltered : allPlayers;
  });

  return byHouse;
};

const normalizeFixturePlayersByTeam = (fixture, storedPlayersByTeam, fallbackPlayersByTeam = null) => {
  if (!fixture) return {};
  const homeId = String(fixture.homeId || '').trim();
  const awayId = String(fixture.awayId || '').trim();

  const stored = storedPlayersByTeam && typeof storedPlayersByTeam === 'object' ? storedPlayersByTeam : {};
  const fallback = fallbackPlayersByTeam && typeof fallbackPlayersByTeam === 'object' ? fallbackPlayersByTeam : {};

  const homePlayers = normalizeMatchPlayersForTeam(
    stored[homeId] || stored.homePlayers || fallback[homeId] || fallback.homePlayers || [],
    { houseId: homeId }
  );
  const awayPlayers = normalizeMatchPlayersForTeam(
    stored[awayId] || stored.awayPlayers || fallback[awayId] || fallback.awayPlayers || [],
    { houseId: awayId }
  );

  if (homePlayers.length || awayPlayers.length) {
    return {
      [homeId]: homePlayers,
      [awayId]: awayPlayers
    };
  }

  const derived = loadEnrollmentPlayersByHouse(homeId, awayId, fixture.sport || '');
  return {
    [homeId]: normalizeMatchPlayersForTeam(derived[homeId] || [], { houseId: homeId }),
    [awayId]: normalizeMatchPlayersForTeam(derived[awayId] || [], { houseId: awayId })
  };
};

const buildPlayerEventIndex = (events, fixture, playersByTeam) => {
  if (!fixture) return [];
  const playerById = new Map();

  [fixture.homeId, fixture.awayId].forEach((teamId) => {
    const teamPlayers = normalizeMatchPlayersForTeam(playersByTeam?.[teamId] || [], { houseId: teamId });
    teamPlayers.forEach((player) => {
      playerById.set(player.id, player);
    });
  });

  const index = new Map();

  (Array.isArray(events) ? events : []).forEach((event) => {
    const teamId = String(event?.teamId || '').trim();
    if (!teamId) return;

    const eventType = String(event?.type || '').trim();
    const playerName = String(event?.playerName || '').trim();
    const playerId = String(event?.playerId || '').trim();
    if (!playerName && !playerId) return;

    const resolved = playerById.get(playerId) || null;
    const key = `${teamId}::${playerId || playerName.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    const existing =
      index.get(key) ||
      {
        key,
        teamId,
        playerId: playerId || (resolved?.id || ''),
        name: playerName || (resolved?.name || ''),
        admissionNo: String(event?.playerAdmissionNo || resolved?.admissionNo || '').trim(),
        totalEvents: 0,
        assistCount: 0,
        eventTypes: {},
        lastEventAt: 0
      };

    existing.totalEvents += 1;
    if (eventType) {
      existing.eventTypes[eventType] = (existing.eventTypes[eventType] || 0) + 1;
    }
    const createdAt = Number(event?.createdAt);
    if (Number.isFinite(createdAt) && createdAt > existing.lastEventAt) {
      existing.lastEventAt = createdAt;
    }

    index.set(key, existing);

    const assistName = String(event?.assistName || '').trim();
    const assistId = String(event?.assistId || '').trim();
    if (!assistName && !assistId) return;

    const resolvedAssist = playerById.get(assistId) || null;
    const assistKey = `${teamId}::${assistId || assistName.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    const assistExisting =
      index.get(assistKey) ||
      {
        key: assistKey,
        teamId,
        playerId: assistId || (resolvedAssist?.id || ''),
        name: assistName || (resolvedAssist?.name || ''),
        admissionNo: String(event?.assistAdmissionNo || resolvedAssist?.admissionNo || '').trim(),
        totalEvents: 0,
        assistCount: 0,
        eventTypes: {},
        lastEventAt: 0
      };

    assistExisting.assistCount += 1;
    if (Number.isFinite(createdAt) && createdAt > assistExisting.lastEventAt) {
      assistExisting.lastEventAt = createdAt;
    }

    index.set(assistKey, assistExisting);
  });

  return Array.from(index.values()).sort((left, right) => {
    if (left.teamId !== right.teamId) return left.teamId.localeCompare(right.teamId);
    return left.name.localeCompare(right.name);
  });
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

const MATCH_CONTROL_EVENT_DEFINITIONS = {
  match_pause: {
    key: 'match_pause',
    label: 'Match paused',
    icon: '⏸️',
    scoreFor: 'none'
  },
  match_resume: {
    key: 'match_resume',
    label: 'Match resumed',
    icon: '▶️',
    scoreFor: 'none'
  }
};

const formatClockDuration = (milliseconds) => {
  const safeMs = Number.isFinite(Number(milliseconds)) ? Math.max(0, Math.floor(Number(milliseconds))) : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const renderMatchEventItem = (event, definition, options = {}) => {
  const editable = options.editable === true;
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
      ${editable
        ? `
          <div class="match-log-event-actions">
            <button type="button" class="btn btn-secondary" data-match-edit-event="${escapeHtmlAttribute(event.id || '')}">Edit</button>
            <button type="button" class="btn btn-secondary" data-match-delete-event="${escapeHtmlAttribute(event.id || '')}">Delete</button>
          </div>
        `
        : ''}
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

  const sectionKey = String(config.sectionKey || matchLogNode.dataset.matchLogId || 'sports_log').trim() || 'sports_log';
  const fixtureSectionKey = String(config.fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator';
  const fixtureCatalogStorageKey = `bhanoyi.fixtures.${fixtureSectionKey}`;
  const fixtureDateStorageKey = `bhanoyi.fixtureDates.${fixtureSectionKey}`;
  const matchLogStoreStorageKey = getMatchLogByFixtureStorageKey(fixtureSectionKey);

  const eventTypes = normalizeMatchEventTypes(config.eventTypes);
  const pauseReasons = (Array.isArray(config.pauseReasons) ? config.pauseReasons : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  try {
    const persistedHouseOptions = (Array.isArray(config.houseOptions) ? config.houseOptions : [])
      .map((entry, index) => ({
        id: String(entry?.id || `house_${index + 1}`).trim().toLowerCase(),
        name: String(entry?.name || `House ${index + 1}`).trim() || `House ${index + 1}`,
        color: normalizeHouseColor(entry?.color, DEFAULT_HOUSE_COLORS[index % DEFAULT_HOUSE_COLORS.length])
      }))
      .filter((entry) => Boolean(entry.id));
    if (persistedHouseOptions.length) {
      localStorage.setItem('bhanoyi.sportsHouseOptions', JSON.stringify(persistedHouseOptions));
    }
  } catch {
    // ignore house option persistence errors
  }
  const eventTypeByKey = new Map([
    ...eventTypes.map((entry) => [entry.key, entry]),
    ...Object.values(MATCH_CONTROL_EVENT_DEFINITIONS).map((entry) => [entry.key, entry])
  ]);
  const baseInitialScores = config.initialScores && typeof config.initialScores === 'object' ? config.initialScores : {};

  const statusNode = matchLogNode.querySelector('[data-match-status]');
  const selectedFixtureNode = matchLogNode.querySelector('[data-match-selected-fixture]');
  const matchClockNode = matchLogNode.querySelector('[data-match-clock]');
  const interruptionClockNode = matchLogNode.querySelector('[data-match-interruption-clock]');
  const clockStatusNode = matchLogNode.querySelector('[data-match-clock-status]');
  const startClockButton = matchLogNode.querySelector('[data-match-clock-start]');
  const pauseButton = matchLogNode.querySelector('[data-match-pause]');
  const resumeButton = matchLogNode.querySelector('[data-match-resume]');
  const pauseReasonSelect = matchLogNode.querySelector('[data-match-pause-reason]');
  const leftNameNode = matchLogNode.querySelector('[data-left-team-name]');
  const rightNameNode = matchLogNode.querySelector('[data-right-team-name]');
  const leftScoreNode = matchLogNode.querySelector('[data-left-team-score]');
  const rightScoreNode = matchLogNode.querySelector('[data-right-team-score]');
  const tableBodyNode = matchLogNode.querySelector('[data-match-table-body]');
  const playerStatsBodyNode = matchLogNode.querySelector('[data-match-player-stats-body]');
  const playerStatsStatusNode = matchLogNode.querySelector('[data-match-player-stats-status]');
  const topScorerNode = matchLogNode.querySelector('[data-match-highlight-scorer]');
  const topAssisterNode = matchLogNode.querySelector('[data-match-highlight-assister]');
  const mostBookedNode = matchLogNode.querySelector('[data-match-highlight-booked]');
  const matchDaySelect = matchLogNode.querySelector('[data-matchday-select]');
  const fixtureSelect = matchLogNode.querySelector('[data-match-fixture-select]');
  const modal = matchLogNode.querySelector('[data-match-modal]');
  const teamLabel = matchLogNode.querySelector('[data-match-modal-team]');
  const modalTeamSelect = matchLogNode.querySelector('[data-match-modal-team-select]');
  const exportButton = matchLogNode.querySelector('[data-match-export]');
  const saveLogButton = matchLogNode.querySelector('[data-match-save-log]');
  const saveStatusNode = matchLogNode.querySelector('[data-match-save-status]');
  const typeStep = matchLogNode.querySelector('[data-match-step="type"]');
  const detailsStep = matchLogNode.querySelector('[data-match-step="details"]');
  const typeListNode = matchLogNode.querySelector('[data-match-event-types]');
  const nextButton = matchLogNode.querySelector('[data-match-next]');
  const backButton = matchLogNode.querySelector('[data-match-back]');
  const saveButton = matchLogNode.querySelector('[data-match-save]');
  const cancelButtons = Array.from(matchLogNode.querySelectorAll('[data-match-cancel], [data-match-close-modal]'));
  const workspaceModal = matchLogNode.closest('[data-match-workspace-modal]');
  const workspaceCloseButtons = Array.from(
    (workspaceModal instanceof HTMLElement ? workspaceModal.querySelectorAll('[data-match-workspace-close]') : [])
  );
  const eventForm = matchLogNode.querySelector('[data-match-event-form]');
  const playerLabelNode = matchLogNode.querySelector('[data-player-label]');
  const assistRow = matchLogNode.querySelector('[data-assist-row]');
  const minuteInput = eventForm?.querySelector('input[name="minute"]');
  const stoppageInput = eventForm?.querySelector('input[name="stoppage"]');
  const playerInput = eventForm?.querySelector('input[name="playerName"]');
  const jerseyInput = eventForm?.querySelector('input[name="jerseyNumber"]');
  const assistInput = eventForm?.querySelector('input[name="assistName"]');
  const notesInput = eventForm?.querySelector('textarea[name="notes"]');
  const playerOptionsNode = matchLogNode.querySelector('[data-match-player-options]');
  const assistOptionsNode = matchLogNode.querySelector('[data-match-assist-options]');

  portalOverlayToBody(workspaceModal, `match-log-workspace:${sectionKey}`);
  portalOverlayToBody(modal, `match-log-modal:${sectionKey}`);

  if (
    !(matchDaySelect instanceof HTMLSelectElement) ||
    !(fixtureSelect instanceof HTMLSelectElement) ||
    !modal ||
    !typeStep ||
    !detailsStep ||
    !typeListNode ||
    !nextButton ||
    !backButton ||
    !saveButton ||
    !eventForm
  ) {
    return;
  }

  const workflowSteps = initSportsWorkflowSteps(matchLogNode);
  const openButtons = Array.from(matchLogNode.querySelectorAll('[data-match-open-event-side]'));

  const parseDateTimeStamp = (stamp) => {
    const normalized = normalizeFixtureStampGlobal(stamp);
    if (!normalized) return Number.MAX_SAFE_INTEGER;
    const parsed = splitFixtureStampGlobal(normalized);
    const candidate = parsed.time ? `${parsed.date}T${parsed.time}` : `${parsed.date}T23:59`;
    const epoch = new Date(candidate).getTime();
    return Number.isFinite(epoch) ? epoch : Number.MAX_SAFE_INTEGER;
  };

  const formatDateLabel = (dateValue) => {
    const normalized = normalizeFixtureDateOnlyGlobal(dateValue);
    if (!normalized) return 'Unknown date';
    const parsed = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return normalized;
    return parsed.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  let fixtureCatalog = {};
  let fixtureDateMap = {};
  let fixtureOptions = [];
  let logsByFixture = loadMatchLogByFixtureStore(fixtureSectionKey);
  let selectedDate = '';
  let selectedFixtureId = '';
  let activeTeamId = '';
  let selectedTypeKey = '';
  let editingEventId = '';
  let currentEvents = [];
  let currentPlayersByTeam = {};
  let matchStartedAt = null;
  let interruptionAccumulatedMs = 0;
  let activePauseStartedAt = null;
  let activePauseReason = '';
  let pauseCompensationStartedAt = null;
  let clockTickerId = null;
  const canEditEvents = isAdminModeEnabled();

  const getCurrentFixture = () => fixtureOptions.find((entry) => entry.fixtureId === selectedFixtureId) || null;

  const getInitialScoreForTeam = (teamId) => {
    const raw = Number(baseInitialScores?.[teamId]);
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  };

  const getMatchElapsedMs = (referenceTime = Date.now()) => {
    if (!Number.isFinite(Number(matchStartedAt))) return 0;
    return Math.max(0, Number(referenceTime) - Number(matchStartedAt));
  };

  const getInterruptionElapsedMs = (referenceTime = Date.now()) => {
    const base = Number.isFinite(Number(interruptionAccumulatedMs)) ? Math.max(0, Number(interruptionAccumulatedMs)) : 0;
    if (!Number.isFinite(Number(activePauseStartedAt))) return base;
    return base + Math.max(0, Number(referenceTime) - Number(activePauseStartedAt));
  };

  const getMatchMinuteFromClock = (referenceTime = Date.now()) => Math.floor(getMatchElapsedMs(referenceTime) / 60000);

  const renderClockStatus = () => {
    const fixture = getCurrentFixture();
    const hasFixture = Boolean(fixture);
    const started = Number.isFinite(Number(matchStartedAt));
    const paused = Number.isFinite(Number(activePauseStartedAt));

    if (matchClockNode) {
      matchClockNode.textContent = formatClockDuration(started ? getMatchElapsedMs() : 0);
    }
    if (interruptionClockNode) {
      interruptionClockNode.textContent = formatClockDuration(started ? getInterruptionElapsedMs() : 0);
    }

    if (startClockButton instanceof HTMLButtonElement) {
      startClockButton.disabled = !hasFixture || started;
    }
    if (pauseButton instanceof HTMLButtonElement) {
      const hasReason = pauseReasonSelect instanceof HTMLSelectElement ? Boolean(String(pauseReasonSelect.value || '').trim()) : true;
      pauseButton.disabled = !hasFixture || !started || paused || !hasReason;
    }
    if (resumeButton instanceof HTMLButtonElement) {
      resumeButton.disabled = !hasFixture || !started || !paused;
    }
    if (pauseReasonSelect instanceof HTMLSelectElement) {
      if (!pauseReasons.length && pauseReasonSelect.options.length <= 1) {
        pauseReasonSelect.innerHTML = '<option value="">Select reason</option>';
      }
      pauseReasonSelect.disabled = !hasFixture || !started || paused;
    }

    if (clockStatusNode) {
      if (!hasFixture) {
        clockStatusNode.textContent = 'Select a fixture to start timing.';
      } else if (!started) {
        clockStatusNode.textContent = 'Match clock not started.';
      } else if (paused) {
        clockStatusNode.textContent = `Match paused${activePauseReason ? `: ${activePauseReason}` : ''}.`;
      } else {
        clockStatusNode.textContent = 'Match clock running.';
      }
    }
  };

  const ensureClockTicker = () => {
    if (clockTickerId) return;
    clockTickerId = window.setInterval(() => {
      renderClockStatus();
    }, 1000);
  };

  const getFixtureEntry = (fixture) => {
    if (!fixture) return null;
    const stored = logsByFixture[fixture.fixtureId];
    const safeStored = stored && typeof stored === 'object' ? stored : {};
    const initialScores = {
      [fixture.homeId]: getInitialScoreForTeam(fixture.homeId),
      [fixture.awayId]: getInitialScoreForTeam(fixture.awayId),
      ...(safeStored.initialScores && typeof safeStored.initialScores === 'object' ? safeStored.initialScores : {})
    };

    return {
      fixtureId: fixture.fixtureId,
      fixtureSectionKey,
      date: fixture.date,
      kickoff: fixture.time,
      sport: fixture.sport,
      competition: fixture.competition,
      venue: fixture.venue,
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      homeName: fixture.homeName,
      awayName: fixture.awayName,
      initialScores,
      homeScore: Number.isFinite(Number(safeStored.homeScore)) ? Number(safeStored.homeScore) : initialScores[fixture.homeId] || 0,
      awayScore: Number.isFinite(Number(safeStored.awayScore)) ? Number(safeStored.awayScore) : initialScores[fixture.awayId] || 0,
      matchStartedAt: Number.isFinite(Number(safeStored.matchStartedAt)) ? Number(safeStored.matchStartedAt) : null,
      interruptionAccumulatedMs: Number.isFinite(Number(safeStored.interruptionAccumulatedMs))
        ? Math.max(0, Number(safeStored.interruptionAccumulatedMs))
        : 0,
      activePauseStartedAt: Number.isFinite(Number(safeStored.activePauseStartedAt)) ? Number(safeStored.activePauseStartedAt) : null,
      activePauseReason: String(safeStored.activePauseReason || '').trim(),
      events: Array.isArray(safeStored.events) ? safeStored.events : [],
      playersByTeam: normalizeFixturePlayersByTeam(
        fixture,
        safeStored.playersByTeam || {
          homePlayers: safeStored.homePlayers,
          awayPlayers: safeStored.awayPlayers
        },
        fixture.playersByTeam || {
          homePlayers: fixture.homePlayers,
          awayPlayers: fixture.awayPlayers
        }
      )
    };
  };

  const sanitizeEventsForFixture = (fixture, events) => {
    if (!fixture) return [];
    return (Array.isArray(events) ? events : [])
      .filter((entry) => entry && typeof entry === 'object' && eventTypeByKey.has(entry.type))
      .map((entry) => {
        const type = String(entry.type || '').trim();
        const isMatchScoped = String(entry.scope || '').trim() === 'match' || type.startsWith('match_');
        return {
          id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          scope: isMatchScoped ? 'match' : 'team',
          teamId: isMatchScoped ? '' : entry.teamId === fixture.awayId ? fixture.awayId : fixture.homeId,
          type,
          minute: Number.isFinite(Number(entry.minute)) ? Number(entry.minute) : null,
          stoppage: Number.isFinite(Number(entry.stoppage)) ? Number(entry.stoppage) : null,
          playerName: String(entry.playerName || '').trim(),
          jerseyNumber: String(entry.jerseyNumber || '').trim(),
          assistName: String(entry.assistName || '').trim(),
          playerId: String(entry.playerId || '').trim(),
          playerAdmissionNo: String(entry.playerAdmissionNo || '').trim(),
          playerHouseId: String(entry.playerHouseId || '').trim(),
          playerGender: String(entry.playerGender || '').trim(),
          assistId: String(entry.assistId || '').trim(),
          assistAdmissionNo: String(entry.assistAdmissionNo || '').trim(),
          reason: String(entry.reason || '').trim(),
          notes: String(entry.notes || '').trim(),
          createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now()
        };
      });
  };

  const getPlayersForTeam = (teamId) => {
    const fixture = getCurrentFixture();
    if (!fixture) return [];
    const normalizedTeamId = teamId === fixture.awayId ? fixture.awayId : fixture.homeId;
    return normalizeMatchPlayersForTeam(currentPlayersByTeam?.[normalizedTeamId] || [], { houseId: normalizedTeamId });
  };

  const findPlayerByTypedName = (teamId, typedName) => {
    const normalizedName = String(typedName || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normalizedName) return null;

    const teamPlayers = getPlayersForTeam(teamId);
    return (
      teamPlayers.find((player) => String(player.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === normalizedName) ||
      null
    );
  };

  const renderAutocompleteOptions = () => {
    const fixture = getCurrentFixture();
    if (!(playerOptionsNode instanceof HTMLDataListElement) || !(assistOptionsNode instanceof HTMLDataListElement)) return;
    if (!fixture) {
      playerOptionsNode.innerHTML = '';
      assistOptionsNode.innerHTML = '';
      return;
    }

    const teamPlayers = getPlayersForTeam(activeTeamId || fixture.homeId);
    const optionsMarkup = teamPlayers
      .map((player) => {
        const meta = [player.admissionNo ? `Adm ${player.admissionNo}` : '', player.jerseyNumber ? `#${player.jerseyNumber}` : '']
          .filter(Boolean)
          .join(' · ');
        return `<option value="${escapeHtmlAttribute(player.name)}" label="${escapeHtmlAttribute(meta || player.name)}"></option>`;
      })
      .join('');

    playerOptionsNode.innerHTML = optionsMarkup;
    assistOptionsNode.innerHTML = optionsMarkup;
  };

  const computeScores = (fixture) => {
    if (!fixture) return {};
    const scores = {
      [fixture.homeId]: Number(getFixtureEntry(fixture)?.initialScores?.[fixture.homeId] || 0),
      [fixture.awayId]: Number(getFixtureEntry(fixture)?.initialScores?.[fixture.awayId] || 0)
    };

    currentEvents.forEach((event) => {
      const definition = eventTypeByKey.get(event.type);
      if (!definition) return;
      if (definition.scoreFor === 'self') {
        scores[event.teamId] = (scores[event.teamId] || 0) + 1;
        return;
      }
      if (definition.scoreFor === 'opponent') {
        const opponentTeamId = getOtherTeamId(event.teamId, [
          { id: fixture.homeId },
          { id: fixture.awayId }
        ]);
        scores[opponentTeamId] = (scores[opponentTeamId] || 0) + 1;
      }
    });

    return scores;
  };

  const persistCurrentFixtureLog = () => {
    const fixture = getCurrentFixture();
    if (!fixture) return;
    const scores = computeScores(fixture);
    const baseEntry = getFixtureEntry(fixture);
    const normalizedPlayersByTeam = normalizeFixturePlayersByTeam(
      fixture,
      currentPlayersByTeam,
      fixture.playersByTeam || {
        homePlayers: fixture.homePlayers,
        awayPlayers: fixture.awayPlayers
      }
    );
    const playerEventIndex = buildPlayerEventIndex(currentEvents, fixture, normalizedPlayersByTeam);

    logsByFixture[fixture.fixtureId] = {
      ...baseEntry,
      events: [...currentEvents],
      matchStartedAt: Number.isFinite(Number(matchStartedAt)) ? Number(matchStartedAt) : null,
      interruptionAccumulatedMs: Number.isFinite(Number(interruptionAccumulatedMs)) ? Math.max(0, Number(interruptionAccumulatedMs)) : 0,
      activePauseStartedAt: Number.isFinite(Number(activePauseStartedAt)) ? Number(activePauseStartedAt) : null,
      activePauseReason: String(activePauseReason || '').trim(),
      playersByTeam: normalizedPlayersByTeam,
      homePlayers: normalizedPlayersByTeam[fixture.homeId] || [],
      awayPlayers: normalizedPlayersByTeam[fixture.awayId] || [],
      playerEventIndex,
      homeScore: Number(scores[fixture.homeId] || 0),
      awayScore: Number(scores[fixture.awayId] || 0),
      updatedAt: Date.now()
    };
    saveMatchLogByFixtureStore(fixtureSectionKey, logsByFixture);
    if (saveStatusNode) {
      saveStatusNode.textContent = 'Auto-saved to DB.';
    }
    window.dispatchEvent(
      new CustomEvent('bhanoyi:match-log-updated', {
        detail: {
          fixtureSectionKey,
          fixtureId: fixture.fixtureId
        }
      })
    );
  };

  const loadCurrentFixtureLog = () => {
    const fixture = getCurrentFixture();
    if (!fixture) {
      currentEvents = [];
      currentPlayersByTeam = {};
      matchStartedAt = null;
      interruptionAccumulatedMs = 0;
      activePauseStartedAt = null;
      activePauseReason = '';
      pauseCompensationStartedAt = null;
      return;
    }
    const entry = getFixtureEntry(fixture);
    currentEvents = sanitizeEventsForFixture(fixture, entry?.events || []);
    matchStartedAt = Number.isFinite(Number(entry?.matchStartedAt)) ? Number(entry.matchStartedAt) : null;
    interruptionAccumulatedMs = Number.isFinite(Number(entry?.interruptionAccumulatedMs))
      ? Math.max(0, Number(entry.interruptionAccumulatedMs))
      : 0;
    activePauseStartedAt = Number.isFinite(Number(entry?.activePauseStartedAt)) ? Number(entry.activePauseStartedAt) : null;
    activePauseReason = String(entry?.activePauseReason || '').trim();
    pauseCompensationStartedAt = null;
    currentPlayersByTeam = normalizeFixturePlayersByTeam(
      fixture,
      entry?.playersByTeam || {
        homePlayers: entry?.homePlayers,
        awayPlayers: entry?.awayPlayers
      },
      fixture.playersByTeam || {
        homePlayers: fixture.homePlayers,
        awayPlayers: fixture.awayPlayers
      }
    );
  };

  const populateFixtureData = () => {
    try {
      const rawCatalog = localStorage.getItem(fixtureCatalogStorageKey);
      const parsedCatalog = rawCatalog ? JSON.parse(rawCatalog) : {};
      fixtureCatalog = parsedCatalog && typeof parsedCatalog === 'object' ? parsedCatalog : {};
    } catch {
      fixtureCatalog = {};
    }

    try {
      const rawDates = localStorage.getItem(fixtureDateStorageKey);
      const parsedDates = rawDates ? JSON.parse(rawDates) : {};
      fixtureDateMap = parsedDates && typeof parsedDates === 'object' ? parsedDates : {};
    } catch {
      fixtureDateMap = {};
    }

    const entries = Object.entries(fixtureCatalog)
      .map(([fixtureId, fixtureData]) => {
        const fixture = fixtureData && typeof fixtureData === 'object' ? fixtureData : {};
        const stamp = splitFixtureStampGlobal(fixtureDateMap[fixtureId]);
        if (!stamp.date) return null;

        return {
          fixtureId,
          date: stamp.date,
          time: stamp.time,
          homeId: String(fixture.homeId || '').trim(),
          awayId: String(fixture.awayId || '').trim(),
          homeName: String(fixture.homeName || fixture.homeId || 'Home').trim() || 'Home',
          awayName: String(fixture.awayName || fixture.awayId || 'Away').trim() || 'Away',
          sport: String(fixture.sport || config.sport || '').trim(),
          competition: String(fixture.competition || config.competition || '').trim(),
          venue: String(fixture.venue || config.venue || '').trim(),
          playersByTeam:
            fixture.playersByTeam && typeof fixture.playersByTeam === 'object' && !Array.isArray(fixture.playersByTeam)
              ? fixture.playersByTeam
              : {},
          homePlayers: Array.isArray(fixture.homePlayers) ? fixture.homePlayers : [],
          awayPlayers: Array.isArray(fixture.awayPlayers) ? fixture.awayPlayers : [],
          round: Number(fixture.round || 0),
          match: Number(fixture.match || 0),
          stamp: normalizeFixtureStampGlobal(fixtureDateMap[fixtureId])
        };
      })
      .filter(Boolean)
      .filter((entry) => entry.homeId && entry.awayId && entry.homeId !== entry.awayId)
      .sort((left, right) => {
        const leftStamp = parseDateTimeStamp(left.stamp);
        const rightStamp = parseDateTimeStamp(right.stamp);
        if (leftStamp !== rightStamp) return leftStamp - rightStamp;
        if (left.round !== right.round) return left.round - right.round;
        if (left.match !== right.match) return left.match - right.match;
        return left.fixtureId.localeCompare(right.fixtureId);
      });

    fixtureOptions = entries;
    logsByFixture = loadMatchLogByFixtureStore(fixtureSectionKey);
  };

  const fixtureDates = () =>
    Array.from(new Set(fixtureOptions.map((entry) => entry.date))).sort((left, right) => {
      return parseDateTimeStamp(`${left}T00:00`) - parseDateTimeStamp(`${right}T00:00`);
    });

  const fixturesForSelectedDate = () =>
    fixtureOptions.filter((entry) => entry.date === selectedDate).sort((left, right) => {
      const leftStamp = parseDateTimeStamp(left.stamp);
      const rightStamp = parseDateTimeStamp(right.stamp);
      if (leftStamp !== rightStamp) return leftStamp - rightStamp;
      if (left.round !== right.round) return left.round - right.round;
      if (left.match !== right.match) return left.match - right.match;
      return left.fixtureId.localeCompare(right.fixtureId);
    });

  const fixturesForDate = (dateValue) =>
    fixtureOptions.filter((entry) => entry.date === dateValue).sort((left, right) => {
      const leftStamp = parseDateTimeStamp(left.stamp);
      const rightStamp = parseDateTimeStamp(right.stamp);
      if (leftStamp !== rightStamp) return leftStamp - rightStamp;
      if (left.round !== right.round) return left.round - right.round;
      if (left.match !== right.match) return left.match - right.match;
      return left.fixtureId.localeCompare(right.fixtureId);
    });

  const confirmFixtureSwitch = (nextFixtureId) => {
    const previousFixture = getCurrentFixture();
    if (!previousFixture || !nextFixtureId || nextFixtureId === previousFixture.fixtureId) {
      return true;
    }

    const nextFixture = fixtureOptions.find((entry) => entry.fixtureId === nextFixtureId);
    if (!nextFixture) return true;

    const nextLabel = `${nextFixture.homeName} vs ${nextFixture.awayName}`;
    const message = `Switch to ${nextLabel}? This will log events for a different fixture.`;
    return window.confirm(message);
  };

  const renderFixturePickers = () => {
    const availableDates = fixtureDates();
    if (!selectedDate || !availableDates.includes(selectedDate)) {
      selectedDate = availableDates[0] || '';
    }

    matchDaySelect.innerHTML = [
      '<option value="">Select fixture date</option>',
      ...availableDates.map((dateValue) => {
        const label = formatDateLabel(dateValue);
        return `<option value="${escapeHtmlAttribute(dateValue)}"${dateValue === selectedDate ? ' selected' : ''}>${escapeHtmlText(label)}</option>`;
      })
    ].join('');

    const todaysFixtures = fixturesForSelectedDate();
    if (!selectedFixtureId || !todaysFixtures.some((entry) => entry.fixtureId === selectedFixtureId)) {
      selectedFixtureId = todaysFixtures[0]?.fixtureId || '';
    }

    fixtureSelect.innerHTML = [
      '<option value="">Select match on chosen date</option>',
      ...todaysFixtures.map((fixture) => {
        const kickoff = fixture.time || 'TBD';
        const label = `${kickoff} • ${fixture.homeName} vs ${fixture.awayName}`;
        return `<option value="${escapeHtmlAttribute(fixture.fixtureId)}"${fixture.fixtureId === selectedFixtureId ? ' selected' : ''}>${escapeHtmlText(label)}</option>`;
      })
    ].join('');
  };

  const escapeCsvValue = (value) => {
    const normalized = String(value ?? '').replace(/"/g, '""');
    return `"${normalized}"`;
  };

  const buildMatchExportCsv = () => {
    const fixture = getCurrentFixture();
    if (!fixture) return '';
    const scores = computeScores(fixture);
    const teamSummary = `${fixture.homeName} ${scores[fixture.homeId] || 0} - ${scores[fixture.awayId] || 0} ${fixture.awayName}`;

    const lines = [
      ['Sport', fixture.sport || config.sport || ''].map(escapeCsvValue).join(','),
      ['Competition', fixture.competition || config.competition || ''].map(escapeCsvValue).join(','),
      ['Venue', fixture.venue || config.venue || ''].map(escapeCsvValue).join(','),
      ['Date', fixture.date || ''].map(escapeCsvValue).join(','),
      ['Kickoff', fixture.time || ''].map(escapeCsvValue).join(','),
      ['Fixture', `${fixture.homeName} vs ${fixture.awayName}`].map(escapeCsvValue).join(','),
      ['Score', teamSummary].map(escapeCsvValue).join(','),
      '',
      ['Team', 'Minute', 'Event', 'Player', 'Jersey', 'Assist', 'Notes'].map(escapeCsvValue).join(',')
    ];

    const events = [...currentEvents].sort((left, right) => {
      const leftMinute = Number.isFinite(left.minute) ? left.minute : Number.MAX_SAFE_INTEGER;
      const rightMinute = Number.isFinite(right.minute) ? right.minute : Number.MAX_SAFE_INTEGER;
      if (leftMinute === rightMinute) {
        return (left.createdAt || 0) - (right.createdAt || 0);
      }
      return leftMinute - rightMinute;
    });

    events.forEach((event) => {
      const definition = eventTypeByKey.get(event.type);
      const teamName = event.scope === 'match'
        ? 'Match'
        : event.teamId === fixture.homeId
          ? fixture.homeName
          : fixture.awayName;
      const minute = formatMatchMinuteLabel(event.minute, event.stoppage);
      lines.push(
        [
          teamName,
          minute,
          definition?.label || event.type,
          event.playerName || '',
          event.jerseyNumber || '',
          event.assistName || '',
          event.notes || ''
        ]
          .map(escapeCsvValue)
          .join(',')
      );
    });

    return lines.join('\n');
  };

  const render = () => {
    const fixture = getCurrentFixture();

    if (!fixture) {
      if (leftNameNode) leftNameNode.textContent = 'Home';
      if (rightNameNode) rightNameNode.textContent = 'Away';
      if (leftScoreNode) leftScoreNode.textContent = '0';
      if (rightScoreNode) rightScoreNode.textContent = '0';
      if (tableBodyNode) {
        tableBodyNode.innerHTML = '<tr><td class="match-log-empty-cell" colspan="3">Choose a fixture date and match to start logging.</td></tr>';
      }
      if (playerStatsBodyNode) {
        playerStatsBodyNode.innerHTML = '<tr><td class="match-log-empty-cell" colspan="8">Choose a fixture to view player stats.</td></tr>';
      }
      if (playerStatsStatusNode) {
        playerStatsStatusNode.textContent = 'Choose a fixture to view player stats.';
      }
      if (topScorerNode) topScorerNode.textContent = '—';
      if (topAssisterNode) topAssisterNode.textContent = '—';
      if (mostBookedNode) mostBookedNode.textContent = '—';
      if (statusNode) {
        statusNode.textContent = fixtureOptions.length
          ? 'No match selected yet.'
          : 'No scheduled fixtures found. Finalize fixture dates first.';
      }
      if (selectedFixtureNode) {
        selectedFixtureNode.textContent = fixtureOptions.length
          ? 'Select a match to continue.'
          : 'No fixture dates available yet.';
      }
      if (saveLogButton instanceof HTMLButtonElement) {
        saveLogButton.disabled = true;
      }
      if (saveStatusNode) {
        saveStatusNode.textContent = 'Auto-save is on for every logged event.';
      }
      openButtons.forEach((button) => {
        if (button instanceof HTMLButtonElement) {
          button.disabled = true;
        }
      });
      renderClockStatus();
      syncModalTeamState();
      renderAutocompleteOptions();
      return;
    }

    const scores = computeScores(fixture);
    const sortedEvents = [...currentEvents].sort((left, right) => {
      const leftMinute = Number.isFinite(left.minute) ? left.minute : Number.MAX_SAFE_INTEGER;
      const rightMinute = Number.isFinite(right.minute) ? right.minute : Number.MAX_SAFE_INTEGER;
      if (leftMinute === rightMinute) {
        return (left.createdAt || 0) - (right.createdAt || 0);
      }
      return leftMinute - rightMinute;
    });

    const homeEvents = sortedEvents.filter((event) => event.scope !== 'match' && event.teamId === fixture.homeId);
    const awayEvents = sortedEvents.filter((event) => event.scope !== 'match' && event.teamId === fixture.awayId);
    const neutralEvents = sortedEvents.filter((event) => event.scope === 'match' || !event.teamId);

    if (leftNameNode) leftNameNode.textContent = fixture.homeName;
    if (rightNameNode) rightNameNode.textContent = fixture.awayName;
    if (leftScoreNode) leftScoreNode.textContent = String(scores[fixture.homeId] || 0);
    if (rightScoreNode) rightScoreNode.textContent = String(scores[fixture.awayId] || 0);

    if (tableBodyNode) {
      const rowCount = Math.max(homeEvents.length, awayEvents.length, neutralEvents.length);
      if (!rowCount) {
        tableBodyNode.innerHTML = '<tr><td class="match-log-empty-cell" colspan="3">No events logged for this fixture yet.</td></tr>';
      } else {
        const rows = [];
        for (let index = 0; index < rowCount; index += 1) {
          const homeEvent = homeEvents[index] || null;
          const awayEvent = awayEvents[index] || null;
          const neutralEvent = neutralEvents[index] || null;
          const reference = homeEvent || awayEvent || neutralEvent;
          const minuteLabel = reference ? formatMatchMinuteLabel(reference.minute, reference.stoppage) : '';
          rows.push(`
            <tr>
              <td>${homeEvent ? renderMatchEventItem(homeEvent, eventTypeByKey.get(homeEvent.type), { editable: canEditEvents }) : ''}</td>
              <td class="match-log-minute-cell">${neutralEvent
                ? renderMatchEventItem(neutralEvent, eventTypeByKey.get(neutralEvent.type), { editable: false })
                : escapeHtmlText(minuteLabel || '—')}</td>
              <td>${awayEvent ? renderMatchEventItem(awayEvent, eventTypeByKey.get(awayEvent.type), { editable: canEditEvents }) : ''}</td>
            </tr>
          `);
        }
        tableBodyNode.innerHTML = rows.join('');
      }
    }

    if (selectedFixtureNode) {
      selectedFixtureNode.textContent = `${formatDateLabel(fixture.date)}${fixture.time ? ` • ${fixture.time}` : ''} • ${fixture.homeName} vs ${fixture.awayName}`;
    }
    if (saveLogButton instanceof HTMLButtonElement) {
      saveLogButton.disabled = false;
    }
    if (saveStatusNode && !String(saveStatusNode.textContent || '').trim()) {
      saveStatusNode.textContent = 'Auto-save is on for every logged event.';
    }
    if (statusNode) {
      statusNode.textContent = sortedEvents.length
        ? `${sortedEvents.length} event${sortedEvents.length === 1 ? '' : 's'} logged for selected fixture.`
        : 'No events logged for selected fixture.';
    }

    const playerStats = buildPlayerEventIndex(currentEvents, fixture, currentPlayersByTeam)
      .map((entry) => {
        const eventTypes = entry && typeof entry.eventTypes === 'object' ? entry.eventTypes : {};
        const goals = Number(eventTypes.goal || 0) + Number(eventTypes.penalty_goal || 0);
        const assists = Number(entry.assistCount || 0);
        const yellowCards = Number(eventTypes.yellow_card || 0);
        const redCards = Number(eventTypes.red_card || 0);
        const events = Number(entry.totalEvents || 0);
        return {
          teamId: String(entry.teamId || '').trim(),
          teamName: String(entry.teamId || '').trim() === fixture.awayId ? fixture.awayName : fixture.homeName,
          playerName: String(entry.name || '').trim(),
          admissionNo: String(entry.admissionNo || '').trim(),
          goals,
          assists,
          yellowCards,
          redCards,
          events
        };
      })
      .filter((entry) => entry.playerName)
      .sort((left, right) => {
        if (left.teamName !== right.teamName) return left.teamName.localeCompare(right.teamName);
        if (left.goals !== right.goals) return right.goals - left.goals;
        if (left.assists !== right.assists) return right.assists - left.assists;
        return left.playerName.localeCompare(right.playerName);
      });

    if (playerStatsBodyNode) {
      if (!playerStats.length) {
        playerStatsBodyNode.innerHTML = '<tr><td class="match-log-empty-cell" colspan="8">No player stats yet for this fixture.</td></tr>';
      } else {
        playerStatsBodyNode.innerHTML = playerStats
          .map(
            (entry) => `
              <tr>
                <td>${escapeHtmlText(entry.teamName)}</td>
                <td>${escapeHtmlText(entry.playerName)}</td>
                <td>${escapeHtmlText(entry.admissionNo || '—')}</td>
                <td>${entry.goals}</td>
                <td>${entry.assists}</td>
                <td>${entry.yellowCards}</td>
                <td>${entry.redCards}</td>
                <td>${entry.events}</td>
              </tr>
            `
          )
          .join('');
      }
    }

    if (playerStatsStatusNode) {
      if (!playerStats.length) {
        playerStatsStatusNode.textContent = 'No player stats yet for selected fixture.';
      } else {
        playerStatsStatusNode.textContent = `${playerStats.length} player${playerStats.length === 1 ? '' : 's'} with recorded stats.`;
      }
    }

    const topScorer = playerStats
      .filter((entry) => entry.goals > 0)
      .sort((left, right) => {
        if (left.goals !== right.goals) return right.goals - left.goals;
        return left.playerName.localeCompare(right.playerName);
      })[0] || null;

    const topAssister = playerStats
      .filter((entry) => entry.assists > 0)
      .sort((left, right) => {
        if (left.assists !== right.assists) return right.assists - left.assists;
        return left.playerName.localeCompare(right.playerName);
      })[0] || null;

    const mostBooked = playerStats
      .map((entry) => ({
        ...entry,
        bookings: entry.yellowCards + entry.redCards
      }))
      .filter((entry) => entry.bookings > 0)
      .sort((left, right) => {
        if (left.bookings !== right.bookings) return right.bookings - left.bookings;
        return left.playerName.localeCompare(right.playerName);
      })[0] || null;

    if (topScorerNode) {
      topScorerNode.textContent = topScorer
        ? `${topScorer.playerName} (${topScorer.goals})`
        : 'No goals yet';
    }

    if (topAssisterNode) {
      topAssisterNode.textContent = topAssister
        ? `${topAssister.playerName} (${topAssister.assists})`
        : 'No assists yet';
    }

    if (mostBookedNode) {
      mostBookedNode.textContent = mostBooked
        ? `${mostBooked.playerName} (${mostBooked.bookings})`
        : 'No cards yet';
    }

    openButtons.forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = false;
      }
    });

    renderClockStatus();
    syncModalTeamState();
    renderAutocompleteOptions();
  };

  const resetModal = () => {
    selectedTypeKey = '';
    editingEventId = '';
    typeStep.classList.remove('is-hidden');
    detailsStep.classList.add('is-hidden');
    nextButton.disabled = true;
    saveButton.textContent = 'Save event';
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
    renderAutocompleteOptions();
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    pauseCompensationStartedAt = null;
    resetModal();
  };

  const openWorkspaceModal = () => {
    if (!(workspaceModal instanceof HTMLElement)) return;
    workspaceModal.classList.remove('is-hidden');
    document.body.classList.add('match-log-workspace-open');
    workflowSteps?.expandAll();
  };

  const closeWorkspaceModal = () => {
    if (!(workspaceModal instanceof HTMLElement)) return;
    workspaceModal.classList.add('is-hidden');
    closeModal();
    document.body.classList.remove('match-log-workspace-open');
  };

  const syncModalTeamState = () => {
    const fixture = getCurrentFixture();
    if (!(modalTeamSelect instanceof HTMLSelectElement)) {
      if (teamLabel && fixture) {
        const teamName = activeTeamId === fixture.awayId ? fixture.awayName : fixture.homeName;
        teamLabel.textContent = `Team: ${teamName}`;
      }
      return;
    }

    if (!fixture) {
      modalTeamSelect.innerHTML = '<option value="">Select team</option>';
      modalTeamSelect.disabled = true;
      if (teamLabel) teamLabel.textContent = '';
      renderAutocompleteOptions();
      return;
    }

    const validTeamIds = new Set([fixture.homeId, fixture.awayId]);
    if (!validTeamIds.has(activeTeamId)) {
      activeTeamId = fixture.homeId;
    }

    modalTeamSelect.disabled = false;
    modalTeamSelect.innerHTML = `
      <option value="${escapeHtmlAttribute(fixture.homeId)}">${escapeHtmlText(fixture.homeName)}</option>
      <option value="${escapeHtmlAttribute(fixture.awayId)}">${escapeHtmlText(fixture.awayName)}</option>
    `;
    modalTeamSelect.value = activeTeamId;

    if (teamLabel) {
      const teamName = activeTeamId === fixture.awayId ? fixture.awayName : fixture.homeName;
      teamLabel.textContent = `Team: ${teamName}`;
    }

    renderAutocompleteOptions();
  };

  const openModalForTeam = (teamId) => {
    const fixture = getCurrentFixture();
    if (!fixture || !teamId) return;
    if (Number.isFinite(Number(matchStartedAt)) && !Number.isFinite(Number(activePauseStartedAt))) {
      pauseCompensationStartedAt = Date.now();
    }
    openWorkspaceModal();
    workflowSteps?.expandStep('log-events');
    activeTeamId = teamId === fixture.awayId ? fixture.awayId : fixture.homeId;
    syncModalTeamState();
    resetModal();
    modal.classList.remove('is-hidden');
  };

  const openModalForEdit = (eventId) => {
    const fixture = getCurrentFixture();
    if (!fixture || !eventId) return;
    const existing = currentEvents.find((entry) => String(entry.id || '') === String(eventId));
    if (!existing) return;
    if (existing.scope === 'match') return;

    openWorkspaceModal();
    workflowSteps?.expandStep('log-events');
    resetModal();

    activeTeamId = existing.teamId === fixture.awayId ? fixture.awayId : fixture.homeId;
    syncModalTeamState();

    selectedTypeKey = existing.type;
    const definition = eventTypeByKey.get(selectedTypeKey);
    if (!definition) return;

    if (playerLabelNode) {
      playerLabelNode.firstChild.textContent = `${definition.playerLabel || 'Player name'} `;
    }

    if (assistRow) {
      assistRow.classList.toggle('is-hidden', !definition.allowAssist);
    }

    const selectedTypeInput = typeListNode.querySelector(`input[name="match-event-type"][value="${CSS.escape(selectedTypeKey)}"]`);
    if (selectedTypeInput instanceof HTMLInputElement) {
      selectedTypeInput.checked = true;
    }

    if (minuteInput instanceof HTMLInputElement) {
      minuteInput.value = Number.isFinite(existing.minute) ? String(existing.minute) : '';
    }
    if (stoppageInput instanceof HTMLInputElement) {
      stoppageInput.value = Number.isFinite(existing.stoppage) ? String(existing.stoppage) : '';
    }
    if (playerInput instanceof HTMLInputElement) {
      playerInput.value = String(existing.playerName || '').trim();
    }
    if (jerseyInput instanceof HTMLInputElement) {
      jerseyInput.value = String(existing.jerseyNumber || '').trim();
    }
    if (assistInput instanceof HTMLInputElement) {
      assistInput.value = String(existing.assistName || '').trim();
    }
    if (notesInput instanceof HTMLTextAreaElement) {
      notesInput.value = String(existing.notes || '').trim();
    }

    editingEventId = String(existing.id || '').trim();
    saveButton.textContent = 'Update event';
    typeStep.classList.add('is-hidden');
    detailsStep.classList.remove('is-hidden');
    modal.classList.remove('is-hidden');
    renderAutocompleteOptions();
  };

  const applyFixtureSelection = () => {
    loadCurrentFixtureLog();
    render();
  };

  const refreshFromStorage = () => {
    const previousFixtureId = selectedFixtureId;
    const previousDate = selectedDate;
    populateFixtureData();

    const availableDates = fixtureDates();
    selectedDate = availableDates.includes(previousDate) ? previousDate : availableDates[0] || '';

    const fixturesForDay = fixturesForSelectedDate();
    selectedFixtureId = fixturesForDay.some((entry) => entry.fixtureId === previousFixtureId)
      ? previousFixtureId
      : fixturesForDay[0]?.fixtureId || '';

    renderFixturePickers();
    applyFixtureSelection();
  };

  typeListNode.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== 'match-event-type') return;
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
    const fixture = getCurrentFixture();
    if (!fixture) return;
    if (!selectedTypeKey || !eventTypeByKey.has(selectedTypeKey)) return;
    if (!activeTeamId || (activeTeamId !== fixture.homeId && activeTeamId !== fixture.awayId)) return;

    const minute = Number(minuteInput?.value);
    const stoppage = Number(stoppageInput?.value);
    const playerName = (playerInput?.value || '').trim();
    const jerseyNumber = (jerseyInput?.value || '').trim();
    const assistName = (assistInput?.value || '').trim();
    const notes = (notesInput?.value || '').trim();
    const selectedPlayer = findPlayerByTypedName(activeTeamId, playerName);
    const selectedAssist = findPlayerByTypedName(activeTeamId, assistName);

    const nextEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scope: 'team',
      teamId: activeTeamId,
      type: selectedTypeKey,
      minute: Number.isFinite(minute) && minute >= 0 ? Math.floor(minute) : null,
      stoppage: Number.isFinite(stoppage) && stoppage > 0 ? Math.floor(stoppage) : null,
      playerName: selectedPlayer?.name || playerName,
      playerId: selectedPlayer?.id || '',
      playerAdmissionNo: selectedPlayer?.admissionNo || '',
      playerHouseId: selectedPlayer?.houseId || activeTeamId,
      playerGender: selectedPlayer?.gender || '',
      jerseyNumber,
      assistName: selectedAssist?.name || assistName,
      assistId: selectedAssist?.id || '',
      assistAdmissionNo: selectedAssist?.admissionNo || '',
      notes,
      createdAt: Date.now()
    };

    if (editingEventId) {
      const index = currentEvents.findIndex((entry) => String(entry.id || '') === String(editingEventId));
      if (index >= 0) {
        const existingCreatedAt = Number(currentEvents[index]?.createdAt);
        currentEvents[index] = {
          ...nextEvent,
          id: editingEventId,
          createdAt: Number.isFinite(existingCreatedAt) ? existingCreatedAt : Date.now(),
          updatedAt: Date.now()
        };
      }
    } else {
      currentEvents.push(nextEvent);
    }

    pauseCompensationStartedAt = null;
    persistCurrentFixtureLog();
    render();
    closeModal();
  });

  tableBodyNode?.addEventListener('click', (event) => {
    if (!canEditEvents) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const deleteButton = target.closest('[data-match-delete-event]');
    if (deleteButton instanceof HTMLElement) {
      const eventId = String(deleteButton.dataset.matchDeleteEvent || '').trim();
      if (!eventId) return;
      const existing = currentEvents.find((entry) => String(entry.id || '') === eventId);
      if (!existing) return;

      const confirmed = window.confirm('Delete this event from the match log?');
      if (!confirmed) return;

      currentEvents = currentEvents.filter((entry) => String(entry.id || '') !== eventId);
      persistCurrentFixtureLog();
      render();
      return;
    }

    const editButton = target.closest('[data-match-edit-event]');
    if (editButton instanceof HTMLElement) {
      const eventId = String(editButton.dataset.matchEditEvent || '').trim();
      if (!eventId) return;
      openModalForEdit(eventId);
    }
  });

  cancelButtons.forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  workspaceCloseButtons.forEach((button) => {
    button.addEventListener('click', closeWorkspaceModal);
  });

  workspaceModal?.addEventListener('click', (event) => {
    if (event.target === workspaceModal) {
      closeWorkspaceModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Escape') return;
    if (!(workspaceModal instanceof HTMLElement)) return;
    if (workspaceModal.classList.contains('is-hidden')) return;
    if (!modal.classList.contains('is-hidden')) {
      closeModal();
      return;
    }
    closeWorkspaceModal();
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  openButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const fixture = getCurrentFixture();
      if (!fixture) return;
      const side = (button.dataset.matchOpenEventSide || '').trim();
      const teamId = side === 'right' ? fixture.awayId : fixture.homeId;
      openModalForTeam(teamId);
    });
  });

  matchDaySelect.addEventListener('change', () => {
    const nextDate = String(matchDaySelect.value || '').trim();
    const nextFixtures = fixturesForDate(nextDate);
    const nextFixtureId = nextFixtures[0]?.fixtureId || '';

    if (!confirmFixtureSwitch(nextFixtureId)) {
      matchDaySelect.value = selectedDate;
      return;
    }

    selectedDate = nextDate;
    selectedFixtureId = '';
    renderFixturePickers();
    applyFixtureSelection();
  });

  fixtureSelect.addEventListener('change', () => {
    const nextFixtureId = String(fixtureSelect.value || '').trim();
    if (!confirmFixtureSwitch(nextFixtureId)) {
      fixtureSelect.value = selectedFixtureId;
      return;
    }

    selectedFixtureId = nextFixtureId;
    applyFixtureSelection();
  });

  modalTeamSelect?.addEventListener('change', () => {
    const fixture = getCurrentFixture();
    if (!(modalTeamSelect instanceof HTMLSelectElement) || !fixture) return;
    const nextTeamId = String(modalTeamSelect.value || '').trim();
    activeTeamId = nextTeamId === fixture.awayId ? fixture.awayId : fixture.homeId;
    syncModalTeamState();
    renderAutocompleteOptions();
  });

  pauseReasonSelect?.addEventListener('change', () => {
    renderClockStatus();
  });

  startClockButton?.addEventListener('click', () => {
    const fixture = getCurrentFixture();
    if (!fixture) return;
    if (Number.isFinite(Number(matchStartedAt))) return;

    const now = Date.now();
    matchStartedAt = now;
    interruptionAccumulatedMs = 0;
    activePauseStartedAt = null;
    activePauseReason = '';
    pauseCompensationStartedAt = null;
    if (pauseReasonSelect instanceof HTMLSelectElement) {
      pauseReasonSelect.value = '';
    }
    persistCurrentFixtureLog();
    render();
  });

  pauseButton?.addEventListener('click', () => {
    const fixture = getCurrentFixture();
    if (!fixture) return;
    if (!Number.isFinite(Number(matchStartedAt))) return;
    if (Number.isFinite(Number(activePauseStartedAt))) return;

    const reason = pauseReasonSelect instanceof HTMLSelectElement ? String(pauseReasonSelect.value || '').trim() : '';
    if (!reason) return;

    const now = Date.now();
    const compensationStart = Number(pauseCompensationStartedAt);
    const compensatedPauseStart =
      Number.isFinite(compensationStart) && compensationStart > 0 && compensationStart <= now
        ? compensationStart
        : now;
    activePauseStartedAt = compensatedPauseStart;
    activePauseReason = reason;
    pauseCompensationStartedAt = null;
    currentEvents.push({
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      scope: 'match',
      teamId: '',
      type: 'match_pause',
      minute: getMatchMinuteFromClock(compensatedPauseStart),
      stoppage: null,
      playerName: '',
      jerseyNumber: '',
      assistName: '',
      playerId: '',
      playerAdmissionNo: '',
      playerHouseId: '',
      playerGender: '',
      assistId: '',
      assistAdmissionNo: '',
      reason,
      notes: reason,
      createdAt: now
    });
    persistCurrentFixtureLog();
    render();
  });

  resumeButton?.addEventListener('click', () => {
    const fixture = getCurrentFixture();
    if (!fixture) return;
    if (!Number.isFinite(Number(matchStartedAt))) return;
    if (!Number.isFinite(Number(activePauseStartedAt))) return;

    const now = Date.now();
    const reason = String(activePauseReason || '').trim();
    interruptionAccumulatedMs = getInterruptionElapsedMs(now);
    activePauseStartedAt = null;
    activePauseReason = '';
    pauseCompensationStartedAt = null;
    if (pauseReasonSelect instanceof HTMLSelectElement) {
      pauseReasonSelect.value = '';
    }

    currentEvents.push({
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      scope: 'match',
      teamId: '',
      type: 'match_resume',
      minute: getMatchMinuteFromClock(now),
      stoppage: null,
      playerName: '',
      jerseyNumber: '',
      assistName: '',
      playerId: '',
      playerAdmissionNo: '',
      playerHouseId: '',
      playerGender: '',
      assistId: '',
      assistAdmissionNo: '',
      reason,
      notes: reason ? `Resumed after: ${reason}` : 'Play resumed',
      createdAt: now
    });
    persistCurrentFixtureLog();
    render();
  });

  matchLogNode.querySelector('[data-match-reset]')?.addEventListener('click', () => {
    const fixture = getCurrentFixture();
    if (!fixture) return;
    const confirmed = window.confirm(
      `Reset ${fixture.homeName} vs ${fixture.awayName}? This will remove all logged events.`
    );
    if (!confirmed) return;
    currentEvents = [];
    matchStartedAt = null;
    interruptionAccumulatedMs = 0;
    activePauseStartedAt = null;
    activePauseReason = '';
    pauseCompensationStartedAt = null;
    if (pauseReasonSelect instanceof HTMLSelectElement) {
      pauseReasonSelect.value = '';
    }
    persistCurrentFixtureLog();
    render();
  });

  exportButton?.addEventListener('click', () => {
    const fixture = getCurrentFixture();
    if (!fixture) return;
    const csv = buildMatchExportCsv();
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeFixture = `${fixture.homeName}-vs-${fixture.awayName}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `${safeFixture || 'match'}-event-log-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  });

  saveLogButton?.addEventListener('click', () => {
    const fixture = getCurrentFixture();
    if (!fixture) return;
    if (saveStatusNode) {
      saveStatusNode.textContent = 'Saving match log to DB...';
    }

    if (saveLogButton instanceof HTMLButtonElement) {
      saveLogButton.disabled = true;
    }

    Promise.resolve(persistLocalStore(matchLogStoreStorageKey, logsByFixture))
      .then(() => {
        if (saveStatusNode) {
          saveStatusNode.textContent = 'Match log saved to DB.';
        }
      })
      .catch(() => {
        if (saveStatusNode) {
          saveStatusNode.textContent = 'Could not save to DB right now. Please try again.';
        }
      })
      .finally(() => {
        const activeFixture = getCurrentFixture();
        if (saveLogButton instanceof HTMLButtonElement) {
          saveLogButton.disabled = !activeFixture;
        }
      });
  });

  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    if (
      event.key !== fixtureCatalogStorageKey &&
      event.key !== fixtureDateStorageKey &&
      event.key !== matchLogStoreStorageKey
    ) {
      return;
    }
    refreshFromStorage();
  });

  window.addEventListener('bhanoyi:fixtures-updated', (event) => {
    const sectionFromEvent = String(event?.detail?.sectionKey || '').trim();
    if (sectionFromEvent && sectionFromEvent !== fixtureSectionKey) return;
    refreshFromStorage();
  });

  window.addEventListener('bhanoyi:match-log-updated', (event) => {
    const sectionFromEvent = String(event?.detail?.fixtureSectionKey || '').trim();
    if (sectionFromEvent && sectionFromEvent !== fixtureSectionKey) return;
    if (String(event?.detail?.fixtureId || '').trim() === selectedFixtureId) {
      logsByFixture = loadMatchLogByFixtureStore(fixtureSectionKey);
      loadCurrentFixtureLog();
      render();
      return;
    }
    logsByFixture = loadMatchLogByFixtureStore(fixtureSectionKey);
  });

  window.addEventListener('bhanoyi:open-match-log-modal', (event) => {
    const sectionFromEvent = String(event?.detail?.fixtureSectionKey || '').trim();
    if (sectionFromEvent && sectionFromEvent !== fixtureSectionKey) return;

    const requestedFixtureId = String(event?.detail?.fixtureId || '').trim();
    const requestedDate = normalizeFixtureDateOnlyGlobal(event?.detail?.fixtureDate || '');
    const preferredSide = String(event?.detail?.preferredSide || 'left').trim();

    if (!requestedFixtureId) return;
    refreshFromStorage();

    const matchedFixture = fixtureOptions.find((entry) => entry.fixtureId === requestedFixtureId);
    if (!matchedFixture) return;

    selectedDate = requestedDate || matchedFixture.date || selectedDate;
    selectedFixtureId = requestedFixtureId;
    renderFixturePickers();
    applyFixtureSelection();
    openWorkspaceModal();

    const teamId = preferredSide === 'right' ? matchedFixture.awayId : matchedFixture.homeId;
    activeTeamId = teamId;
    syncModalTeamState();
  });

  const params = new URLSearchParams(window.location.search);
  const requestedFixtureId = String(params.get('logFixtureId') || '').trim();
  const requestedDate = normalizeFixtureDateOnlyGlobal(params.get('logDate') || '');
  const requestedSection = String(params.get('logFixtureSectionKey') || '').trim();

  const initializeMatchLogState = () => {
    ensureClockTicker();
    populateFixtureData();
    if (requestedSection && requestedSection !== fixtureSectionKey) {
      selectedDate = fixtureDates()[0] || '';
    } else if (requestedDate) {
      selectedDate = requestedDate;
    } else {
      selectedDate = fixtureDates()[0] || '';
    }

    renderFixturePickers();

    if (!requestedSection || requestedSection === fixtureSectionKey) {
      if (requestedFixtureId && fixtureOptions.some((entry) => entry.fixtureId === requestedFixtureId)) {
        selectedFixtureId = requestedFixtureId;
        const matchedFixture = fixtureOptions.find((entry) => entry.fixtureId === requestedFixtureId);
        selectedDate = matchedFixture?.date || selectedDate;
        renderFixturePickers();
        openWorkspaceModal();
      }
    }

    applyFixtureSelection();
    syncModalTeamState();
    renderAutocompleteOptions();
  };

  void syncLocalStoreFromRemote(matchLogStoreStorageKey)
    .catch(() => null)
    .finally(() => {
      initializeMatchLogState();
    });
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
        <h2>${section.title || 'View Season Fixtures'}</h2>
        ${section.body ? `<p class="lead">${section.body}</p>` : ''}
        <article class="panel fixture-creator-shell" data-fixture-creator="true" data-fixture-config="${escapeHtmlAttribute(JSON.stringify(config))}">
          <section class="sports-workflow-step is-collapsed" data-sports-workflow-step data-sports-workflow-id="setup-fixtures">
            <button type="button" class="sports-workflow-toggle" data-sports-workflow-toggle aria-expanded="false">
              <span>Set Up and Generate Fixtures</span>
            </button>
            <div class="sports-workflow-body" data-sports-workflow-body>
              <header class="fixture-creator-header">
                <p class="fixture-creator-meta" data-fixture-meta>Choose a sport format to begin.</p>
                <div class="fixture-creator-actions">
                  <label class="fixture-autofill-toggle">
                    <input type="checkbox" data-fixture-auto-fill />
                    <span>Auto-fill dates (use rules)</span>
                  </label>
                  <button type="button" class="btn btn-secondary" data-fixture-generate>1) Generate live fixtures</button>
                  <button type="button" class="btn btn-secondary" data-fixture-export>Export Fixture File</button>
                  <button type="button" class="btn btn-secondary" data-fixture-export-csv>Export CSV</button>
                </div>
              </header>
              <p class="fixture-creator-flow">Workflow: 1) Generate live fixtures → 2) Preview candidate dates (optional) → 3) Apply previewed dates (optional) → 4) Review fairness and confirm.</p>
              <div class="fixture-creator-sport-grid">
                <label>
                  Sport code (required)
                  <select data-fixture-sport required>
                    <option value="">Select sport</option>
                    <option value="soccer">Soccer</option>
                    <option value="netball">Netball</option>
                  </select>
                </label>
                <label>
                  Matches per opponent per leg
                  <input type="number" min="1" max="6" step="1" value="1" data-fixture-meetings-per-leg />
                </label>
                <div class="fixture-fairness-control" data-fixture-fairness-dropdown>
                  <span class="fixture-fairness-label">Fixture fairness rules</span>
                  <button
                    type="button"
                    class="btn btn-secondary fixture-fairness-toggle"
                    data-fixture-open-fairness-modal
                    aria-haspopup="dialog"
                  >Add Fairness Rules</button>
                  <p class="fixture-fairness-summary" data-fixture-fairness-summary></p>
                  <select data-fixture-fairness-rules multiple class="is-hidden" aria-hidden="true" tabindex="-1">
                    <option value="equal_matches_season" selected>Every team plays the same number of matches each season</option>
                    <option value="equal_matches_leg" selected>Every team plays the same number of matches in each leg</option>
                    <option value="balanced_home_away" selected>Each team keeps balanced home/away matches per leg and season</option>
                    <option value="equal_round_participation" selected>Each team has balanced round participation within each leg</option>
                    <option value="unique_opponent_per_leg" selected>No duplicate opponent pairing in the same leg</option>
                    <option value="no_double_round_booking" selected>No team plays more than once in a single round</option>
                    <option value="fifa_no_self_match" selected>No self-fixtures (team cannot play itself)</option>
                  </select>
                </div>
              </div>
              <div class="enrollment-class-modal fixture-fairness-modal is-hidden" data-fixture-fairness-modal>
                <div class="enrollment-class-modal-backdrop" data-fixture-close-fairness-modal></div>
                <article class="panel enrollment-class-modal-panel fixture-fairness-modal-panel" role="dialog" aria-modal="true" aria-label="Fixture fairness rules">
                  <h3>Fixture Fairness Rules</h3>
                  <p class="enrollment-class-modal-subtitle" data-fixture-fairness-subtitle>Select rules, then click Apply (state only).</p>
                  <div class="fixture-fairness-checklist">
                    <label class="fixture-fairness-option">
                      <input type="checkbox" data-fixture-fairness-check value="equal_matches_season" checked />
                      <span>Every team plays the same number of matches each season</span>
                    </label>
                    <label class="fixture-fairness-option">
                      <input type="checkbox" data-fixture-fairness-check value="equal_matches_leg" checked />
                      <span>Every team plays the same number of matches in each leg</span>
                    </label>
                    <label class="fixture-fairness-option">
                      <input type="checkbox" data-fixture-fairness-check value="balanced_home_away" checked />
                      <span>Each team keeps balanced home/away matches per leg and season</span>
                    </label>
                    <label class="fixture-fairness-option">
                      <input type="checkbox" data-fixture-fairness-check value="equal_round_participation" checked />
                      <span>Each team has balanced round participation within each leg</span>
                    </label>
                    <label class="fixture-fairness-option">
                      <input type="checkbox" data-fixture-fairness-check value="unique_opponent_per_leg" checked />
                      <span>No duplicate opponent pairing in the same leg</span>
                    </label>
                    <label class="fixture-fairness-option">
                      <input type="checkbox" data-fixture-fairness-check value="no_double_round_booking" checked />
                      <span>No team plays more than once in a single round</span>
                    </label>
                    <label class="fixture-fairness-option">
                      <input type="checkbox" data-fixture-fairness-check value="fifa_no_self_match" checked />
                      <span>No self-fixtures (team cannot play itself)</span>
                    </label>
                  </div>
                  <div class="enrollment-class-modal-actions">
                    <button type="button" class="btn btn-secondary" data-fixture-close-fairness-modal>Close</button>
                    <button type="button" class="btn btn-primary" data-fixture-apply-fairness-rules>Apply rules</button>
                  </div>
                </article>
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
            </div>
          </section>
          <section class="sports-workflow-step is-collapsed" data-sports-workflow-step data-sports-workflow-id="rules-fixtures">
            <button type="button" class="sports-workflow-toggle" data-sports-workflow-toggle aria-expanded="false">
              <span>Set Auto-fill Date Rules</span>
            </button>
            <div class="sports-workflow-body" data-sports-workflow-body>
              <div class="fixture-date-rules" data-fixture-date-rules>
                <div class="fixture-creator-sport-grid">
                  <label>
                    Start scheduling from
                    <input type="date" data-fixture-rule-start-date />
                  </label>
                  <label>
                    Minimum days between fixtures
                    <input type="number" min="1" max="30" step="1" value="7" data-fixture-rule-gap-days />
                  </label>
                  <label>
                    Matches per day
                    <input type="number" min="1" max="20" step="1" value="1" data-fixture-rule-matches-per-day />
                  </label>
                  <label>
                    Kickoff start time
                    <input type="time" value="14:00" data-fixture-rule-kickoff-time />
                  </label>
                  <label>
                    Minutes between same-day matches
                    <input type="number" min="15" max="360" step="5" value="120" data-fixture-rule-kickoff-gap-minutes />
                  </label>
                </div>
                <div class="fixture-rule-weekdays" data-fixture-rule-weekdays>
                  ${[
                    ['1', 'Mon'],
                    ['2', 'Tue'],
                    ['3', 'Wed'],
                    ['4', 'Thu'],
                    ['5', 'Fri'],
                    ['6', 'Sat'],
                    ['0', 'Sun']
                  ]
                    .map(
                      ([value, label]) => `
                        <label class="fixture-rule-day-chip">
                          <input type="checkbox" data-fixture-rule-weekday value="${value}" />
                          <span>${label}</span>
                        </label>
                      `
                    )
                    .join('')}
                </div>
                <div class="fixture-rule-flags">
                  <label>
                    <input type="checkbox" data-fixture-rule-use-terms checked />
                    <span>Only schedule within configured school terms</span>
                  </label>
                  <label>
                    <input type="checkbox" data-fixture-rule-avoid-academic checked />
                    <span>Avoid dates with Academic calendar events</span>
                  </label>
                </div>
                <label>
                  Excluded date ranges (optional)
                  <textarea rows="3" data-fixture-rule-exclusions placeholder="One range per line, e.g. 2026-04-01 to 2026-04-05"></textarea>
                </label>
                <div class="fixture-creator-actions">
                  <button type="button" class="btn btn-secondary" data-fixture-rules-preview>2) Preview candidate dates</button>
                  <button type="button" class="btn btn-secondary" data-fixture-rules-save>Save rules</button>
                </div>
                <p class="fixture-creator-status" data-fixture-rules-status aria-live="polite"></p>
                <div class="fixture-rules-preview is-hidden" data-fixture-rules-preview-output></div>
              </div>
            </div>
          </section>
          <section class="sports-workflow-step is-collapsed" data-sports-workflow-step data-sports-workflow-id="review-fixtures">
            <button type="button" class="sports-workflow-toggle" data-sports-workflow-toggle aria-expanded="false">
              <span>Review and Finalize Fixtures</span>
            </button>
            <div class="sports-workflow-body" data-sports-workflow-body>
              <div class="fixture-approval-panel is-hidden" data-fixture-approval-panel>
                <p class="fixture-creator-status" data-fixture-approval-status aria-live="polite"></p>
                <div class="fixture-creator-actions">
                  <button type="button" class="btn btn-secondary" data-fixture-approve-resolved>4) Finalize & sync (after fixes)</button>
                  <button type="button" class="btn btn-secondary" data-fixture-approve-anyway>4) Finalize & sync (approve with unfairnesses)</button>
                </div>
              </div>
              <div class="fixture-template-row">
                <label>
                  Use previous generated fixture as template
                  <select data-fixture-template-select>
                    <option value="">No template selected</option>
                  </select>
                </label>
              </div>
              <div class="fixture-table-wrap">
                <table class="fixture-table">
                  <thead>
                    <tr>
                      <th>Round</th>
                      <th>Leg</th>
                      <th>Match</th>
                      <th>Date</th>
                      <th>Kickoff</th>
                      <th>Format</th>
                      <th>Home</th>
                      <th>Away</th>
                      <th>Match Log</th>
                    </tr>
                  </thead>
                  <tbody data-fixture-body>
                    <tr>
                      <td colspan="9" class="fixture-empty">No fixtures generated yet.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="fixture-table-actions">
                <button type="button" class="btn btn-secondary" data-fixture-save-draft>Save fixture draft</button>
              </div>
            </div>
          </section>
        </article>
      </div>
    </section>
  `;
};

const renderPublicFixtureBoardSection = (section, sectionIndex) => {
  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;
  const fixtureSectionKey = String(section.sectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator';
  const config = {
    sectionKey: fallbackSectionKey,
    fixtureSectionKey,
    sport: String(section.sport || '').trim(),
    competition: String(section.competition || '').trim()
  };

  return `
    <section class="section ${section.alt ? 'section-alt' : ''}" data-section-index="${sectionIndex}" data-section-type="fixture-board" data-section-key="${fallbackSectionKey}">
      <div class="container">
        <h2>Upcoming Matches</h2>
        ${section.body ? `<p class="lead">${section.body}</p>` : ''}
        <article class="panel public-fixture-board" data-public-fixture-board="true" data-public-fixture-config="${escapeHtmlAttribute(JSON.stringify(config))}">
          <header class="public-fixture-head">
            <div>
              <p class="public-fixture-meta"><strong>${escapeHtmlText(config.sport || 'Sport')}</strong>${config.competition ? ` · ${escapeHtmlText(config.competition)}` : ''}</p>
              <p class="public-fixture-status" data-public-fixture-status aria-live="polite">Showing the next scheduled fixtures.</p>
            </div>
            <label>
              Match day
              <select data-public-fixture-date>
                <option value="">Select fixture date</option>
              </select>
            </label>
          </header>
          <div class="public-fixture-leg-grid">
            <section class="public-fixture-leg-card">
              <h3>First Leg</h3>
              <ul class="public-fixture-list" data-public-fixture-first-leg>
                <li class="public-fixture-empty">No first-leg fixtures for this day.</li>
              </ul>
            </section>
            <section class="public-fixture-leg-card">
              <h3>Second Leg (Return)</h3>
              <ul class="public-fixture-list" data-public-fixture-return-leg>
                <li class="public-fixture-empty">No return fixtures for this day.</li>
              </ul>
            </section>
          </div>
        </article>
      </div>
    </section>
  `;
};

const renderEnrollmentManagerSection = (section, sectionIndex) => {
  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;
  const staffMode = isStaffModeEnabled() && !isAdminModeEnabled();
  const config = {
    sectionKey: fallbackSectionKey,
    title: (section.title || 'Enrollment Management').trim() || 'Enrollment Management',
    body: (section.body || '').trim()
  };

  return `
    <section class="section ${section.alt ? 'section-alt' : ''}" data-section-index="${sectionIndex}" data-section-type="enrollment-manager" data-section-key="${fallbackSectionKey}">
      <div class="container">
        <article class="panel enrollment-manager-shell" data-enrollment-manager="true" data-enrollment-config="${escapeHtmlAttribute(JSON.stringify(config))}">
          <section class="sports-workflow-step is-collapsed" data-enrollment-workflow-step data-enrollment-workflow-id="staff">
            <button type="button" class="sports-workflow-toggle" data-enrollment-workflow-toggle aria-expanded="false">Staff</button>
            <div class="sports-workflow-body enrollment-workflow-body" data-enrollment-workflow-body>
              <section class="enrollment-staff-section">
                <div class="enrollment-staff-head">
                  <h3>Staff</h3>
                  <p class="enrollment-class-empty">Add staff members, set post level (PL1–PL4), and assign each to a house.</p>
                </div>
                <div class="enrollment-staff-form" data-enrollment-staff-form>
                  <select data-enrollment-staff-type>
                    <option value="teaching_staff">Teaching staff</option>
                    <option value="non_teaching_staff">Non-teaching staff</option>
                  </select>
                  <select data-enrollment-staff-title>
                    <option value="Mr.">Mr.</option>
                    <option value="Mrs.">Mrs.</option>
                    <option value="Ms.">Ms.</option>
                    <option value="Miss">Miss</option>
                    <option value="Dr.">Dr.</option>
                    <option value="Prof.">Prof.</option>
                    <option value="Coach">Coach</option>
                    <option value="Mx.">Mx.</option>
                  </select>
                  <input type="text" maxlength="20" data-enrollment-staff-initials placeholder="Initials (e.g. N.K.)" />
                  <input type="text" maxlength="80" data-enrollment-staff-first-name placeholder="First name" />
                  <input type="text" maxlength="80" data-enrollment-staff-surname placeholder="Surname" />
                  <input type="text" maxlength="40" data-enrollment-staff-number placeholder="Staff no. (optional)" />
                  <select data-enrollment-staff-gender>
                    <option value="">Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  <select data-enrollment-staff-post-level>
                    <option value="PL1">PL1 · Educator</option>
                    <option value="PL2">PL2 · Departmental Head</option>
                    <option value="PL3">PL3 · Deputy Principal</option>
                    <option value="PL4">PL4 · Principal</option>
                  </select>
                  <select data-enrollment-staff-assigned-class></select>
                  <input type="text" maxlength="80" data-enrollment-staff-subject placeholder="Subject / Department (optional)" />
                  <input type="email" maxlength="120" data-enrollment-staff-email placeholder="Email (optional)" />
                  <input type="text" maxlength="30" data-enrollment-staff-phone placeholder="Phone (optional)" />
                  <textarea rows="2" maxlength="280" data-enrollment-staff-notes placeholder="Notes (optional)"></textarea>
                  <button type="button" class="btn btn-secondary" data-enrollment-add-staff>Add staff member</button>
                </div>
                <div class="enrollment-house-row" data-enrollment-staff-house-row></div>
                <div class="enrollment-people-controls">
                  <label class="enrollment-class-modal-field">
                    Search people
                    <input type="search" maxlength="140" data-enrollment-staff-search placeholder="Search by surname, initials, staff no., subject" />
                  </label>
                  <label class="enrollment-class-modal-field">
                    Sort by
                    <select data-enrollment-staff-sort>
                      <option value="surname_asc">Surname (A–Z)</option>
                      <option value="surname_desc">Surname (Z–A)</option>
                    </select>
                  </label>
                </div>
                <div class="enrollment-staff-list" data-enrollment-staff-list></div>
              </section>
            </div>
          </section>

          <section class="sports-workflow-step is-expanded" data-enrollment-workflow-step data-enrollment-workflow-id="manage-enrollment">
            <button type="button" class="sports-workflow-toggle" data-enrollment-workflow-toggle aria-expanded="true">${staffMode ? 'My Class' : 'Manage Enrollment'}</button>
            <div class="sports-workflow-body enrollment-workflow-body" data-enrollment-workflow-body>
              <div class="enrollment-manager-actions">
                <button type="button" class="btn btn-secondary" data-enrollment-open-add-grade>Add grade</button>
              </div>
              <p class="enrollment-class-empty">Grades/classes are saved automatically when you click Add grade or Add class.</p>
              <div class="enrollment-grade-list" data-enrollment-grade-list></div>
              <p class="enrollment-status" data-enrollment-status aria-live="polite"></p>
            </div>
          </section>
          <div class="enrollment-grade-modal is-hidden" data-enrollment-grade-modal>
            <div class="enrollment-class-modal-backdrop" data-enrollment-close-grade-modal></div>
            <article class="panel enrollment-class-modal-panel" role="dialog" aria-modal="true" aria-label="Add grade">
              <h3>Add Grade</h3>
              <p class="enrollment-class-modal-subtitle">Select a grade to add back.</p>
              <label class="enrollment-class-modal-field">
                Grade
                <select data-enrollment-grade-select></select>
              </label>
              <div class="enrollment-class-modal-actions">
                <button type="button" class="btn btn-secondary" data-enrollment-close-grade-modal>Cancel</button>
                <button type="button" class="btn btn-primary" data-enrollment-add-grade>Add grade</button>
              </div>
            </article>
          </div>
          <div class="enrollment-class-modal is-hidden" data-enrollment-class-modal>
            <div class="enrollment-class-modal-backdrop" data-enrollment-close-modal></div>
            <article class="panel enrollment-class-modal-panel" role="dialog" aria-modal="true" aria-label="Add class">
              <h3>Add Class</h3>
              <p class="enrollment-class-modal-subtitle" data-enrollment-modal-grade></p>
              <label class="enrollment-class-modal-field">
                Class Letter
                <select data-enrollment-class-select></select>
              </label>
              <div class="enrollment-class-modal-actions">
                <button type="button" class="btn btn-secondary" data-enrollment-close-modal>Cancel</button>
                <button type="button" class="btn btn-primary" data-enrollment-add-class>Add class</button>
              </div>
            </article>
          </div>
          <div class="enrollment-manage-modal is-hidden" data-enrollment-manage-modal>
            <div class="enrollment-class-modal-backdrop" data-enrollment-close-manage-modal></div>
            <article class="panel enrollment-class-modal-panel" role="dialog" aria-modal="true" aria-label="Manage class">
              <h3>Manage Class</h3>
              <p class="enrollment-class-modal-subtitle" data-enrollment-manage-title></p>
              <div class="enrollment-class-modal-actions enrollment-class-modal-actions-top">
                <button type="button" class="btn btn-secondary" data-enrollment-clear-learners data-enrollment-admin-only>Clear class list</button>
              </div>
              <section class="sports-workflow-step is-collapsed enrollment-class-modal-section" data-manage-workflow-step data-manage-workflow-id="class-details">
                <button type="button" class="sports-workflow-toggle" data-manage-workflow-toggle aria-expanded="false">Class Details</button>
                <div class="sports-workflow-body enrollment-workflow-body" data-manage-workflow-body>
                  <div class="enrollment-class-manage-grid">
                    <label class="enrollment-class-modal-field">
                      Class Teacher
                      <select data-enrollment-manage-teacher>
                        <option value="">Select teacher</option>
                      </select>
                      <button type="button" class="btn btn-secondary" data-enrollment-open-staff-workflow data-enrollment-admin-only>Add / manage teachers</button>
                    </label>
                    <label class="enrollment-class-modal-field">
                      Room
                      <input type="text" maxlength="40" data-enrollment-manage-room placeholder="e.g. Block B / Room 4" />
                    </label>
                    <label class="enrollment-class-modal-field">
                      Capacity
                      <input type="number" min="1" max="120" step="1" data-enrollment-manage-capacity placeholder="e.g. 45" />
                    </label>
                  </div>
                  <label class="enrollment-class-modal-field">
                    Notes
                    <textarea rows="3" maxlength="600" data-enrollment-manage-notes placeholder="Class notes"></textarea>
                  </label>
                </div>
              </section>

              <section class="sports-workflow-step is-expanded enrollment-class-modal-section" data-manage-workflow-step data-manage-workflow-id="learners">
                <button type="button" class="sports-workflow-toggle" data-manage-workflow-toggle aria-expanded="true">Learners</button>
                <div class="sports-workflow-body enrollment-workflow-body" data-manage-workflow-body>
                  <section class="enrollment-learner-section">
                    <div class="enrollment-import-row" data-enrollment-admin-only>
                      <label class="enrollment-class-modal-field">
                        Import Format
                        <select data-enrollment-import-format>
                          <option value="excel" selected>Excel (.xlsx, .xls)</option>
                          <option value="csv">CSV (.csv)</option>
                        </select>
                      </label>
                      <label class="enrollment-class-modal-field enrollment-import-file-field">
                        File
                        <input type="file" data-enrollment-import-file accept=".xlsx,.xls" />
                      </label>
                      <button type="button" class="btn btn-secondary" data-enrollment-import-learners>Import class list</button>
                    </div>
                    <div class="enrollment-import-row" data-enrollment-admin-only>
                      <label class="enrollment-class-modal-field enrollment-import-file-field">
                        Bulk Excel files
                        <input type="file" data-enrollment-bulk-import-files accept=".xlsx,.xls" multiple />
                      </label>
                      <button type="button" class="btn btn-secondary" data-enrollment-bulk-import-learners>Bulk upload class files</button>
                    </div>
                    <div class="enrollment-learner-form" data-enrollment-admin-only>
                      <input type="text" maxlength="120" data-enrollment-learner-name placeholder="Learner name" />
                      <input type="text" maxlength="40" data-enrollment-learner-admission placeholder="Admission no. (optional)" />
                      <select data-enrollment-learner-gender>
                        <option value="">Gender (optional)</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                      <button type="button" class="btn btn-secondary" data-enrollment-add-learner>Add learner</button>
                    </div>
                    <div class="enrollment-people-controls">
                      <label class="enrollment-class-modal-field">
                        Search learners
                        <input type="search" maxlength="140" data-enrollment-learner-search placeholder="Search by surname, admission, gender" />
                      </label>
                      <label class="enrollment-class-modal-field">
                        Sort by
                        <select data-enrollment-learner-sort>
                          <option value="surname_asc">Surname (A–Z)</option>
                          <option value="surname_desc">Surname (Z–A)</option>
                        </select>
                      </label>
                    </div>
                    <div class="enrollment-learner-list" data-enrollment-learner-list></div>
                  </section>
                </div>
              </section>
              <div class="enrollment-class-modal-actions">
                <button type="button" class="btn btn-secondary" data-enrollment-close-manage-modal>Close</button>
                <button type="button" class="btn btn-primary" data-enrollment-save-manage>Save class</button>
              </div>
            </article>
          </div>
        </article>
      </div>
    </section>
  `;
};

const hydrateEnrollmentManager = (managerNode) => {
  const rawConfig = String(managerNode?.dataset?.enrollmentConfig || '').trim();
  if (!rawConfig) return;

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch {
    return;
  }

  const gradeListNode = managerNode.querySelector('[data-enrollment-grade-list]');
  const statusNode = managerNode.querySelector('[data-enrollment-status]');
  const addGradeTrigger = managerNode.querySelector('[data-enrollment-open-add-grade]');
  const gradeModal = managerNode.querySelector('[data-enrollment-grade-modal]');
  const gradeSelect = managerNode.querySelector('[data-enrollment-grade-select]');
  const addGradeButton = managerNode.querySelector('[data-enrollment-add-grade]');
  const closeGradeButtons = Array.from(managerNode.querySelectorAll('[data-enrollment-close-grade-modal]'));
  const classModal = managerNode.querySelector('[data-enrollment-class-modal]');
  const modalGradeNode = managerNode.querySelector('[data-enrollment-modal-grade]');
  const classSelect = managerNode.querySelector('[data-enrollment-class-select]');
  const addClassButton = managerNode.querySelector('[data-enrollment-add-class]');
  const closeButtons = Array.from(managerNode.querySelectorAll('[data-enrollment-close-modal]'));
  const manageModal = managerNode.querySelector('[data-enrollment-manage-modal]');
  const manageTitleNode = managerNode.querySelector('[data-enrollment-manage-title]');
  const manageTeacherSelect = managerNode.querySelector('[data-enrollment-manage-teacher]');
  const openStaffWorkflowButton = managerNode.querySelector('[data-enrollment-open-staff-workflow]');
  const manageRoomInput = managerNode.querySelector('[data-enrollment-manage-room]');
  const manageCapacityInput = managerNode.querySelector('[data-enrollment-manage-capacity]');
  const manageNotesInput = managerNode.querySelector('[data-enrollment-manage-notes]');
  const learnerNameInput = managerNode.querySelector('[data-enrollment-learner-name]');
  const learnerAdmissionInput = managerNode.querySelector('[data-enrollment-learner-admission]');
  const learnerGenderSelect = managerNode.querySelector('[data-enrollment-learner-gender]');
  const learnerSearchInput = managerNode.querySelector('[data-enrollment-learner-search]');
  const learnerSortSelect = managerNode.querySelector('[data-enrollment-learner-sort]');
  const addLearnerButton = managerNode.querySelector('[data-enrollment-add-learner]');
  const importFormatSelect = managerNode.querySelector('[data-enrollment-import-format]');
  const importFileInput = managerNode.querySelector('[data-enrollment-import-file]');
  const importLearnersButton = managerNode.querySelector('[data-enrollment-import-learners]');
  const bulkImportFileInput = managerNode.querySelector('[data-enrollment-bulk-import-files]');
  const bulkImportLearnersButton = managerNode.querySelector('[data-enrollment-bulk-import-learners]');
  const clearLearnersButtons = Array.from(managerNode.querySelectorAll('[data-enrollment-clear-learners]'));
  const learnerListNode = managerNode.querySelector('[data-enrollment-learner-list]');
  const staffWorkflowStep = managerNode.querySelector('[data-enrollment-workflow-id="staff"]');
  const staffTypeSelect = managerNode.querySelector('[data-enrollment-staff-type]');
  const staffTitleSelect = managerNode.querySelector('[data-enrollment-staff-title]');
  const staffInitialsInput = managerNode.querySelector('[data-enrollment-staff-initials]');
  const staffFirstNameInput = managerNode.querySelector('[data-enrollment-staff-first-name]');
  const staffSurnameInput = managerNode.querySelector('[data-enrollment-staff-surname]');
  const staffNumberInput = managerNode.querySelector('[data-enrollment-staff-number]');
  const staffGenderSelect = managerNode.querySelector('[data-enrollment-staff-gender]');
  const staffPostLevelSelect = managerNode.querySelector('[data-enrollment-staff-post-level]');
  const staffAssignedClassSelect = managerNode.querySelector('[data-enrollment-staff-assigned-class]');
  const staffSubjectInput = managerNode.querySelector('[data-enrollment-staff-subject]');
  const staffEmailInput = managerNode.querySelector('[data-enrollment-staff-email]');
  const staffPhoneInput = managerNode.querySelector('[data-enrollment-staff-phone]');
  const staffNotesInput = managerNode.querySelector('[data-enrollment-staff-notes]');
  const addStaffButton = managerNode.querySelector('[data-enrollment-add-staff]');
  const staffSearchInput = managerNode.querySelector('[data-enrollment-staff-search]');
  const staffSortSelect = managerNode.querySelector('[data-enrollment-staff-sort]');
  const staffHouseRowNode = managerNode.querySelector('[data-enrollment-staff-house-row]');
  const staffListNode = managerNode.querySelector('[data-enrollment-staff-list]');
  const saveManageButtons = Array.from(managerNode.querySelectorAll('[data-enrollment-save-manage]'));
  const closeManageButtons = Array.from(managerNode.querySelectorAll('[data-enrollment-close-manage-modal]'));
  const adminOnlyBlocks = Array.from(managerNode.querySelectorAll('[data-enrollment-admin-only]'));

  if (
    !(gradeListNode instanceof HTMLElement) ||
    !(addGradeTrigger instanceof HTMLButtonElement) ||
    !(gradeModal instanceof HTMLElement) ||
    !(gradeSelect instanceof HTMLSelectElement) ||
    !(addGradeButton instanceof HTMLButtonElement) ||
    !(classModal instanceof HTMLElement) ||
    !(classSelect instanceof HTMLSelectElement) ||
    !(addClassButton instanceof HTMLButtonElement) ||
    !(manageModal instanceof HTMLElement) ||
    !(manageTeacherSelect instanceof HTMLSelectElement) ||
    !(openStaffWorkflowButton instanceof HTMLButtonElement) ||
    !(manageRoomInput instanceof HTMLInputElement) ||
    !(manageCapacityInput instanceof HTMLInputElement) ||
    !(manageNotesInput instanceof HTMLTextAreaElement) ||
    !(learnerNameInput instanceof HTMLInputElement) ||
    !(learnerAdmissionInput instanceof HTMLInputElement) ||
    !(learnerGenderSelect instanceof HTMLSelectElement) ||
    !(learnerSearchInput instanceof HTMLInputElement) ||
    !(learnerSortSelect instanceof HTMLSelectElement) ||
    !(addLearnerButton instanceof HTMLButtonElement) ||
    !(importFormatSelect instanceof HTMLSelectElement) ||
    !(importFileInput instanceof HTMLInputElement) ||
    !(importLearnersButton instanceof HTMLButtonElement) ||
    !(bulkImportFileInput instanceof HTMLInputElement) ||
    !(bulkImportLearnersButton instanceof HTMLButtonElement) ||
    !clearLearnersButtons.length ||
    !(learnerListNode instanceof HTMLElement) ||
    !(staffTypeSelect instanceof HTMLSelectElement) ||
    !(staffTitleSelect instanceof HTMLSelectElement) ||
    !(staffInitialsInput instanceof HTMLInputElement) ||
    !(staffFirstNameInput instanceof HTMLInputElement) ||
    !(staffSurnameInput instanceof HTMLInputElement) ||
    !(staffNumberInput instanceof HTMLInputElement) ||
    !(staffGenderSelect instanceof HTMLSelectElement) ||
    !(staffPostLevelSelect instanceof HTMLSelectElement) ||
    !(staffAssignedClassSelect instanceof HTMLSelectElement) ||
    !(staffSubjectInput instanceof HTMLInputElement) ||
    !(staffEmailInput instanceof HTMLInputElement) ||
    !(staffPhoneInput instanceof HTMLInputElement) ||
    !(staffNotesInput instanceof HTMLTextAreaElement) ||
    !(addStaffButton instanceof HTMLButtonElement) ||
    !(staffSearchInput instanceof HTMLInputElement) ||
    !(staffSortSelect instanceof HTMLSelectElement) ||
    !(staffHouseRowNode instanceof HTMLElement) ||
    !(staffListNode instanceof HTMLElement) ||
    !saveManageButtons.length
  ) {
    return;
  }

  portalOverlayToBody(gradeModal, `enrollment-grade-modal:${String(config.sectionKey || 'enrollment_manager').trim()}`);
  portalOverlayToBody(classModal, `enrollment-class-modal:${String(config.sectionKey || 'enrollment_manager').trim()}`);
  portalOverlayToBody(manageModal, `enrollment-manage-modal:${String(config.sectionKey || 'enrollment_manager').trim()}`);

  const enrollmentWorkflowSteps = Array.from(managerNode.querySelectorAll('[data-enrollment-workflow-step]'))
    .map((stepNode) => {
      if (!(stepNode instanceof HTMLElement)) return null;
      const toggle = stepNode.querySelector('[data-enrollment-workflow-toggle]');
      const body = stepNode.querySelector('[data-enrollment-workflow-body]');
      if (!(toggle instanceof HTMLButtonElement) || !(body instanceof HTMLElement)) return null;
      return { stepNode, toggle, body };
    })
    .filter(Boolean);

  const setEnrollmentWorkflowExpanded = (entry, expanded) => {
    if (!entry) return;
    entry.stepNode.classList.toggle('is-expanded', expanded);
    entry.stepNode.classList.toggle('is-collapsed', !expanded);
    entry.toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    entry.body.style.maxHeight = expanded ? getExpandedWorkflowBodyMaxHeight(entry.body) : '0px';
  };

  const refreshEnrollmentWorkflowHeights = () => {
    enrollmentWorkflowSteps.forEach((entry) => {
      if (!entry.stepNode.classList.contains('is-expanded')) return;
      entry.body.style.maxHeight = getExpandedWorkflowBodyMaxHeight(entry.body);
    });
  };

  enrollmentWorkflowSteps.forEach((entry) => {
    const startsExpanded = entry.stepNode.classList.contains('is-expanded');
    setEnrollmentWorkflowExpanded(entry, startsExpanded);
    entry.toggle.addEventListener('click', () => {
      const expanded = entry.stepNode.classList.contains('is-expanded');
      setEnrollmentWorkflowExpanded(entry, !expanded);
    });
  });

  const manageModalWorkflowSteps = Array.from(manageModal.querySelectorAll('[data-manage-workflow-step]'))
    .map((stepNode) => {
      if (!(stepNode instanceof HTMLElement)) return null;
      const toggle = stepNode.querySelector('[data-manage-workflow-toggle]');
      const body = stepNode.querySelector('[data-manage-workflow-body]');
      if (!(toggle instanceof HTMLButtonElement) || !(body instanceof HTMLElement)) return null;
      return { stepNode, toggle, body };
    })
    .filter(Boolean);

  const setManageModalWorkflowExpanded = (entry, expanded) => {
    if (!entry) return;
    entry.stepNode.classList.toggle('is-expanded', expanded);
    entry.stepNode.classList.toggle('is-collapsed', !expanded);
    entry.toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    entry.body.style.maxHeight = expanded ? getExpandedWorkflowBodyMaxHeight(entry.body) : '0px';
  };

  const refreshManageModalWorkflowHeights = () => {
    manageModalWorkflowSteps.forEach((entry) => {
      if (!entry.stepNode.classList.contains('is-expanded')) return;
      entry.body.style.maxHeight = getExpandedWorkflowBodyMaxHeight(entry.body);
    });
  };

  manageModalWorkflowSteps.forEach((entry) => {
    const startsExpanded = entry.stepNode.classList.contains('is-expanded');
    setManageModalWorkflowExpanded(entry, startsExpanded);
    entry.toggle.addEventListener('click', () => {
      const expanded = entry.stepNode.classList.contains('is-expanded');
      setManageModalWorkflowExpanded(entry, !expanded);
      requestAnimationFrame(() => {
        refreshManageModalWorkflowHeights();
      });
    });
  });

  window.addEventListener('resize', () => {
    refreshEnrollmentWorkflowHeights();
    refreshManageModalWorkflowHeights();
  });

  const isAdminMode = new URLSearchParams(window.location.search).get('admin') === '1';
  const isStaffMode = !isAdminMode && new URLSearchParams(window.location.search).get('staff') === '1';
  const sectionKey = String(config.sectionKey || 'enrollment_manager').trim() || 'enrollment_manager';
  const storageKey = `bhanoyi.enrollmentClasses.${sectionKey}`;
  const enrollmentStoragePrefix = 'bhanoyi.enrollmentClasses.';
  const learnerSurnameNameMigrationFlag = 'bhanoyi.migrations.learnerSurnameName.v1';
  const gradeNumbers = Array.from({ length: 7 }, (_, index) => String(index + 6));
  const allLetters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
  const defaultSchoolHouseOptions = Array.from({ length: 5 }, (_, index) => ({
    id: `house_${index + 1}`,
    name: `House ${index + 1}`,
    color: DEFAULT_HOUSE_COLORS[index % DEFAULT_HOUSE_COLORS.length]
  }));
  const sportsHouseStorageKey = 'bhanoyi.sportsHouseOptions';

  const loadSchoolHouseOptions = () => {
    try {
      const rawStored = localStorage.getItem(sportsHouseStorageKey);
      if (rawStored) {
        const parsed = JSON.parse(rawStored);
        if (Array.isArray(parsed) && parsed.length) {
          const fromStored = parsed
            .map((entry, index) => ({
              id: String(entry?.id || `house_${index + 1}`).trim().toLowerCase(),
              name: String(entry?.name || `House ${index + 1}`).trim() || `House ${index + 1}`,
              color: normalizeHouseColor(entry?.color, DEFAULT_HOUSE_COLORS[index % DEFAULT_HOUSE_COLORS.length])
            }))
            .filter((entry) => Boolean(entry.id));
          if (fromStored.length) {
            return fromStored;
          }
        }
      }

      const rawFixtureCatalog = localStorage.getItem('bhanoyi.fixtures.sports_fixture_creator');
      if (rawFixtureCatalog) {
        const parsedCatalog = JSON.parse(rawFixtureCatalog);
        if (parsedCatalog && typeof parsedCatalog === 'object' && !Array.isArray(parsedCatalog)) {
          const byId = new Map();
          Object.values(parsedCatalog).forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            const homeId = String(entry.homeId || '').trim().toLowerCase();
            const awayId = String(entry.awayId || '').trim().toLowerCase();
            const homeName = String(entry.homeName || '').trim();
            const awayName = String(entry.awayName || '').trim();
            if (homeId && homeName && !byId.has(homeId)) byId.set(homeId, homeName);
            if (awayId && awayName && !byId.has(awayId)) byId.set(awayId, awayName);
          });

          const fromCatalog = Array.from(byId.entries())
            .map(([id, name], index) => ({
              id,
              name,
              color: DEFAULT_HOUSE_COLORS[index % DEFAULT_HOUSE_COLORS.length]
            }))
            .slice(0, 5);
          if (fromCatalog.length >= 2) {
            return fromCatalog;
          }
        }
      }
    } catch {
      return [...defaultSchoolHouseOptions];
    }

    return [...defaultSchoolHouseOptions];
  };

  const schoolHouseOptions = loadSchoolHouseOptions();

  let selectedGrade = '';
  let selectedAddGrade = '';
  let activeGrades = [];
  let classesByGrade = {};
  let classProfilesByGrade = {};
  let staffMembers = [];
  let selectedManageGrade = '';
  let selectedManageLetter = '';
  let manageLearners = [];
  let learnerSearchValue = '';
  let learnerSortValue = 'surname_asc';
  let staffSearchValue = '';
  let staffSortValue = 'surname_asc';
  let selectedStaffHouseId = '';
  const staffSessionKey = `bhanoyi.staffSession.${sectionKey}`;
  const staffSessionPasswordKey = `bhanoyi.staffSessionPassword.${sectionKey}`;
  let staffSessionEmail = '';
  let loggedInStaff = null;
  let hasAutoOpenedAssignedClass = false;
  let pendingRemoteEnrollmentPayload = null;
  let isRemoteEnrollmentSaveInFlight = false;

  const staffPostLevelRanks = {
    PL1: 'Educator',
    PL2: 'Departmental Head',
    PL3: 'Deputy Principal',
    PL4: 'Principal'
  };

  const normalizeLetter = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
  const normalizeText = (value, maxLength = 300) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
  const staffTitleTokens = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'coach', 'mx']);

  const normalizeToken = (value) => String(value || '').trim().toLowerCase().replace(/\./g, '');
  const resolveSurnameSortKey = (value, options = {}) => {
    const normalizedValue = normalizeText(value, 160).toLowerCase();
    if (!normalizedValue) return '';
    const parts = normalizedValue.split(/\s+/).filter(Boolean);
    if (!parts.length) return '';

    if (options.staffLike && staffTitleTokens.has(normalizeToken(parts[0]))) {
      parts.shift();
    }

    if (!parts.length) return normalizedValue;
    const surname = parts[0];
    const rest = parts.slice(1).join(' ');
    return `${surname} ${rest}`.trim();
  };

  const normalizeLoginToken = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const toSportCodeId = (value, index) => {
    const normalized = normalizeText(value, 80)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || `sport_code_${index + 1}`;
  };

  const getSportingCodeDefinitions = () => {
    const fallbackTitles = ['Football', 'Netball', 'Athletics'];
    const content = typeof window !== 'undefined' ? window.__BHANOYI_SITE_CONTENT__ : null;
    const sportsSections = Array.isArray(content?.pages?.sports?.sections) ? content.pages.sports.sections : [];
    const sportingSection = sportsSections.find((entry) => String(entry?.sectionKey || '') === 'sporting_codes');
    const titles = Array.from(
      new Set(
        Array.isArray(sportingSection?.items)
          ? sportingSection.items
              .map((item) => normalizeText(item?.title || '', 80))
              .filter(Boolean)
          : []
      )
    );
    const effectiveTitles = titles.length ? titles : fallbackTitles;
    return effectiveTitles.map((title, index) => ({
      id: toSportCodeId(title, index),
      title
    }));
  };

  const findSportingCodeTitle = (matcher) => {
    const definitions = getSportingCodeDefinitions();
    const found = definitions.find((entry) => matcher(normalizeText(entry.title, 80).toLowerCase()));
    return found ? found.title : '';
  };

  const getDefaultSportingCodesByGender = (gender) => {
    const normalizedGender = normalizeText(gender, 20).toLowerCase();
    if (normalizedGender === 'male') {
      const football = findSportingCodeTitle((title) => title.includes('football'));
      return football ? [football] : [];
    }
    if (normalizedGender === 'female') {
      const netball = findSportingCodeTitle((title) => title.includes('netball'));
      return netball ? [netball] : [];
    }
    return [];
  };

  const withLearnerDefaultSportingCodes = (learner) => {
    if (!learner || typeof learner !== 'object') return learner;
    const hasCodes = Array.isArray(learner.sportingCodes) && learner.sportingCodes.length > 0;
    if (hasCodes) return learner;
    const defaults = getDefaultSportingCodesByGender(learner.gender || '');
    if (!defaults.length) return learner;
    return {
      ...learner,
      sportingCodes: defaults
    };
  };

  const formatSportingCodesSummary = (codes) => {
    const normalizedCodes = Array.isArray(codes) ? codes.map((entry) => normalizeText(entry, 80)).filter(Boolean) : [];
    if (!normalizedCodes.length) return 'No sporting code selected';
    if (normalizedCodes.length <= 2) return normalizedCodes.join(', ');
    return `${normalizedCodes.slice(0, 2).join(', ')} +${normalizedCodes.length - 2} more`;
  };

  const houseSportsAssignmentStorageKey = 'bhanoyi.houseSportsAssignments';

  const loadHouseSportsAssignments = () => {
    try {
      const raw = localStorage.getItem(houseSportsAssignmentStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const persistHouseSportsAssignments = (store) => {
    localStorage.setItem(houseSportsAssignmentStorageKey, JSON.stringify(store));
  };

  const syncHouseAssignmentsForClass = (grade, letter, learners) => {
    const normalizedGrade = String(grade || '').trim();
    const normalizedLetter = normalizeLetter(letter);
    if (!normalizedGrade || !normalizedLetter) return;

    const normalizedLearners = normalizeLearners(learners);
    const classKeyPrefix = `${storageKey}|${normalizedGrade}|${normalizedLetter}|`;
    const codeDefinitions = getSportingCodeDefinitions();
    const codeIdByTitle = new Map(
      codeDefinitions.map((entry) => [normalizeText(entry.title, 80).toLowerCase(), entry.id])
    );
    const assignmentStore = loadHouseSportsAssignments();

    Object.values(assignmentStore).forEach((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      Object.keys(value).forEach((learnerKey) => {
        if (learnerKey.startsWith(classKeyPrefix)) {
          delete value[learnerKey];
        }
      });
    });

    normalizedLearners.forEach((learner, index) => {
      const houseId = normalizeText(learner.houseId || '', 40).toLowerCase();
      if (!houseId) return;
      const learnerKey = `${classKeyPrefix}${index}`;
      const codeIds = Array.from(
        new Set(
          (Array.isArray(learner.sportingCodes) ? learner.sportingCodes : [])
            .map((entry) => normalizeText(entry, 80).toLowerCase())
            .map((entry) => codeIdByTitle.get(entry) || '')
            .filter(Boolean)
        )
      );
      if (!codeIds.length) return;
      if (!assignmentStore[houseId] || typeof assignmentStore[houseId] !== 'object' || Array.isArray(assignmentStore[houseId])) {
        assignmentStore[houseId] = {};
      }
      assignmentStore[houseId][learnerKey] = codeIds;
    });

    Object.keys(assignmentStore).forEach((houseId) => {
      const byLearner = assignmentStore[houseId];
      if (!byLearner || typeof byLearner !== 'object' || Array.isArray(byLearner)) {
        delete assignmentStore[houseId];
        return;
      }
      if (Object.keys(byLearner).length === 0) {
        delete assignmentStore[houseId];
      }
    });

    persistHouseSportsAssignments(assignmentStore);
  };

  const persistLiveLearnerAssignments = () => {
    if (!selectedManageGrade || !selectedManageLetter) return;
    const existingProfile = getClassProfile(selectedManageGrade, selectedManageLetter);
    const normalizedLearners = normalizeLearners(manageLearners);

    setClassProfile(selectedManageGrade, selectedManageLetter, {
      teacher: existingProfile.teacher,
      room: existingProfile.room,
      capacity: String(normalizedLearners.length),
      notes: existingProfile.notes,
      learners: normalizedLearners
    });

    syncHouseAssignmentsForClass(selectedManageGrade, selectedManageLetter, normalizedLearners);
    saveStore();
  };

  const buildDefaultStaffCredentials = (staffLike) => {
    const surnameToken = normalizeLoginToken(staffLike?.surname || '').slice(0, 16) || 'staff';
    const firstToken = normalizeLoginToken(staffLike?.firstName || '');
    const initialsToken = normalizeLoginToken(staffLike?.initials || '');
    const firstInitial = (firstToken.charAt(0) || initialsToken.charAt(0) || 'x').toLowerCase();
    const handle = `${surnameToken}${firstInitial}`.slice(0, 24);
    return {
      email: `${handle}@bhanoyi.education`,
      password: handle
    };
  };

  const dedupeLetters = (values) => {
    const seen = new Set();
    const normalized = [];
    (Array.isArray(values) ? values : []).forEach((entry) => {
      const letter = normalizeLetter(entry);
      if (!letter || seen.has(letter)) return;
      seen.add(letter);
      normalized.push(letter);
    });
    return normalized.sort((left, right) => left.localeCompare(right));
  };

  const normalizeClassesStore = (store) => {
    const base = {};
    gradeNumbers.forEach((grade) => {
      const values = store && typeof store === 'object' ? store[grade] : [];
      base[grade] = dedupeLetters(values);
    });
    return base;
  };

  const normalizeLearner = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const allowedRclRoles = ['', 'President', 'Deputy President', 'Secretary', 'Treasurer', 'Class Representative'];

    const formatLearnerName = (rawName, surnameValue, firstNameValue) => {
      const surname = normalizeText(surnameValue, 80);
      const firstName = normalizeText(firstNameValue, 80);
      if (surname || firstName) {
        return [surname, firstName].filter(Boolean).join(' ').trim();
      }

      const normalizedRawName = normalizeText(rawName, 120);
      if (!normalizedRawName) return '';

      if (normalizedRawName.includes(',')) {
        const [surnamePart, ...rest] = normalizedRawName
          .split(',')
          .map((part) => normalizeText(part, 120))
          .filter(Boolean);
        const cleanRest = rest
          .join(' ')
          .split(/\s+/)
          .filter((token) => !staffTitleTokens.has(normalizeToken(token)))
          .join(' ');
        return [surnamePart, cleanRest].filter(Boolean).join(' ').trim();
      }

      const tokens = normalizedRawName
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => !staffTitleTokens.has(normalizeToken(token)));
      if (tokens.length <= 1) return normalizedRawName;
      const detectedSurname = tokens[tokens.length - 1];
      const detectedGivenNames = tokens.slice(0, -1).join(' ');
      return [detectedSurname, detectedGivenNames].filter(Boolean).join(' ').trim();
    };

    const normalizeGender = (value) => {
      const raw = normalizeText(value, 20).toLowerCase();
      if (!raw) return '';
      if (raw === 'm' || raw === 'male' || raw === 'boy' || raw === 'boys') return 'Male';
      if (raw === 'f' || raw === 'female' || raw === 'girl' || raw === 'girls') return 'Female';
      if (raw === 'o' || raw === 'other') return 'Other';
      return '';
    };

    const normalizeHouseId = (value) => {
      const raw = normalizeText(value, 30).toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (!raw) return '';
      return schoolHouseOptions.some((house) => house.id === raw) ? raw : '';
    };

    const normalizeRclRole = (value) => {
      const role = normalizeText(value, 40);
      if (!role) return '';
      return allowedRclRoles.includes(role) ? role : '';
    };

    const normalizeSportingCodes = (value) => {
      if (Array.isArray(value)) {
        return Array.from(
          new Set(
            value
              .map((entry) => normalizeText(entry, 40))
              .filter(Boolean)
          )
        ).slice(0, 8);
      }

      const raw = normalizeText(value, 240);
      if (!raw) return [];
      return Array.from(
        new Set(
          raw
            .split(',')
            .map((entry) => normalizeText(entry, 40))
            .filter(Boolean)
        )
      ).slice(0, 8);
    };

    const name = formatLearnerName(entry.name, entry.surname, entry.firstName || entry.givenName);
    const admissionNo = normalizeText(entry.admissionNo || entry.admission || '', 40);
    const gender = normalizeGender(entry.gender || entry.sex || '');
    const houseId = normalizeHouseId(entry.houseId || entry.house || '');
    const rclRole = normalizeRclRole(entry.rclRole || entry.rcl || '');
    const sportingCodes = normalizeSportingCodes(entry.sportingCodes || entry.sportsCodes || entry.sports || '');
    if (!name) return null;
    return { name, admissionNo, gender, houseId, rclRole, sportingCodes };
  };

  const normalizeLearners = (values) => {
    const seen = new Map();
    const learners = [];
    (Array.isArray(values) ? values : []).forEach((entry) => {
      const learner = normalizeLearner(entry);
      if (!learner) return;
      const key = `${learner.name.toLowerCase()}::${learner.admissionNo.toLowerCase()}`;
      if (seen.has(key)) {
        const existingIndex = seen.get(key);
        const existing = learners[existingIndex];
        learners[existingIndex] = {
          name: existing.name,
          admissionNo: existing.admissionNo || learner.admissionNo,
          gender: existing.gender || learner.gender,
          houseId: existing.houseId || learner.houseId,
          rclRole: existing.rclRole || learner.rclRole,
          sportingCodes:
            Array.isArray(existing.sportingCodes) && existing.sportingCodes.length
              ? existing.sportingCodes
              : learner.sportingCodes
        };
        return;
      }
      seen.set(key, learners.length);
      learners.push(learner);
    });

    const resolveLearnerSortKey = (nameValue) => {
      const normalizedName = normalizeText(nameValue, 120).toLowerCase();
      if (!normalizedName) return '';
      const [surname = '', ...rest] = normalizedName.split(/\s+/).filter(Boolean);
      return `${surname} ${rest.join(' ')}`.trim();
    };

    return learners.sort((left, right) => resolveLearnerSortKey(left.name).localeCompare(resolveLearnerSortKey(right.name)));
  };

  const normalizeStaffPostLevel = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'PL2' || normalized === 'PL3' || normalized === 'PL4') {
      return normalized;
    }
    return 'PL1';
  };

  const normalizeStaffType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'non_teaching_staff' ? 'non_teaching_staff' : 'teaching_staff';
  };

  const normalizeStaffTitle = (value) => {
    const allowed = ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.', 'Coach', 'Mx.'];
    const normalized = normalizeText(value, 20);
    return allowed.includes(normalized) ? normalized : 'Mr.';
  };

  const normalizeStaffInitials = (value) => {
    const raw = String(value || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 8);
    if (!raw) return '';
    return raw.split('').join('.') + '.';
  };

  const inferInitialsFromFirstName = (value) => {
    const raw = normalizeText(value, 80);
    if (!raw) return '';
    const letters = raw
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase())
      .filter(Boolean)
      .join('');
    if (!letters) return '';
    return letters.split('').join('.') + '.';
  };

  const inferFromLegacyName = (value) => {
    const normalized = normalizeText(value, 120);
    if (!normalized) {
      return {
        title: 'Mr.',
        firstName: '',
        surname: '',
        initials: ''
      };
    }

    const parts = normalized.split(/\s+/).filter(Boolean);
    const knownTitles = ['mr.', 'mrs.', 'ms.', 'miss', 'dr.', 'prof.', 'coach', 'mx.'];
    let title = 'Mr.';
    if (parts.length && knownTitles.includes(parts[0].toLowerCase())) {
      title = normalizeStaffTitle(parts.shift());
    }

    const surname = parts.length ? parts[parts.length - 1] : normalized;
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    const initials = inferInitialsFromFirstName(firstName || surname);

    return {
      title,
      firstName: normalizeText(firstName, 80),
      surname: normalizeText(surname, 80),
      initials
    };
  };

  const formatStaffDefaultDisplayName = (staff) => {
    const surname = normalizeText(staff?.surname, 80);
    const firstName = normalizeText(staff?.firstName, 80);
    const formatted = [surname, firstName].filter(Boolean).join(' ').trim();
    if (formatted) return formatted;

    const fallbackName = normalizeText(staff?.name, 120);
    if (!fallbackName) return '';
    const parts = fallbackName.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return fallbackName;
    const detectedSurname = parts[parts.length - 1];
    const detectedGivenNames = parts.slice(0, -1).join(' ');
    return [detectedSurname, detectedGivenNames].filter(Boolean).join(' ').trim();
  };

  const resolveStaffDisplayName = (staff) => {
    return formatStaffDefaultDisplayName(staff);
  };

  const normalizeStaffMember = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const normalizeGender = (value) => {
      const raw = normalizeText(value, 20).toLowerCase();
      if (!raw) return '';
      if (raw === 'm' || raw === 'male' || raw === 'boy') return 'Male';
      if (raw === 'f' || raw === 'female' || raw === 'girl') return 'Female';
      if (raw === 'o' || raw === 'other') return 'Other';
      return '';
    };

    const normalizeHouseId = (value) => {
      const raw = normalizeText(value, 30).toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (!raw) return '';
      return schoolHouseOptions.some((house) => house.id === raw) ? raw : '';
    };

    const legacy = inferFromLegacyName(entry.name);
    const title = normalizeStaffTitle(entry.title || legacy.title);
    const firstName = normalizeText(entry.firstName || '', 80) || legacy.firstName;
    const surname = normalizeText(entry.surname || '', 80) || legacy.surname;
    const initials = normalizeStaffInitials(entry.initials || '') || legacy.initials;
    if (!surname) return null;

    const postLevel = normalizeStaffPostLevel(entry.postLevel || 'PL1');
    const assignedGradeRaw = normalizeText(entry.assignedGrade || '', 4);
    const assignedGrade = gradeNumbers.includes(assignedGradeRaw) ? assignedGradeRaw : '';
    const assignedClassLetter = normalizeLetter(entry.assignedClassLetter || entry.assignedLetter || '');
    const defaultCredentials = buildDefaultStaffCredentials({ surname, firstName, initials });
    const loginEmail = normalizeText(entry.loginEmail || entry.staffEmail || '', 120).toLowerCase() || defaultCredentials.email;
    const loginPassword = normalizeText(entry.loginPassword || '', 120) || defaultCredentials.password;
    const displayNameOverride = normalizeText(entry.displayNameOverride || entry.displayName || '', 120);
    const normalized = {
      staffType: normalizeStaffType(entry.staffType || entry.roleType || ''),
      title,
      initials,
      firstName,
      surname,
      displayNameOverride,
      displayName: '',
      name: '',
      loginEmail,
      loginPassword,
      staffNumber: normalizeText(entry.staffNumber || '', 40),
      gender: normalizeGender(entry.gender || ''),
      postLevel,
      rank: staffPostLevelRanks[postLevel] || 'Educator',
      assignedGrade,
      assignedClassLetter,
      subject: normalizeText(entry.subject || '', 80),
      email: normalizeText(entry.email || '', 120),
      phone: normalizeText(entry.phone || '', 30),
      notes: normalizeText(entry.notes || '', 280),
      houseId: normalizeHouseId(entry.houseId || entry.house || '')
    };

    normalized.displayName = resolveStaffDisplayName(normalized);
    normalized.name = normalized.displayName;
    return normalized;
  };

  const normalizeStaffMembers = (values) => {
    const seen = new Set();
    const normalized = [];
    (Array.isArray(values) ? values : []).forEach((entry) => {
      const staff = normalizeStaffMember(entry);
      if (!staff) return;
      const dedupeKey = `${String(staff.surname || '').toLowerCase()}::${String(staff.initials || '').toLowerCase()}::${String(staff.staffNumber || '').toLowerCase()}::${String(staff.staffType || '').toLowerCase()}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      normalized.push(staff);
    });
    return normalized;
  };

  const isStaffAssignedToClass = (staff, grade, letter) => {
    if (!staff) return false;
    const assignedGrade = String(staff.assignedGrade || '').trim();
    const assignedLetter = normalizeLetter(staff.assignedClassLetter || '');
    return assignedGrade === String(grade || '').trim() && assignedLetter === normalizeLetter(letter);
  };

  const resolveLoggedInStaff = () => {
    if (!staffSessionEmail) return null;
    return (
      staffMembers.find(
        (entry) => normalizeText(entry.loginEmail || '', 120).toLowerCase() === normalizeText(staffSessionEmail, 120).toLowerCase()
      ) || null
    );
  };

  const syncStaffSession = () => {
    loggedInStaff = resolveLoggedInStaff();
    if (!loggedInStaff) {
      staffSessionEmail = '';
      sessionStorage.removeItem(staffSessionKey);
      sessionStorage.removeItem(staffSessionPasswordKey);
      return;
    }
    staffSessionEmail = loggedInStaff.loginEmail;
    sessionStorage.setItem(staffSessionKey, staffSessionEmail);
  };

  const syncCapacityWithLearners = () => {
    manageCapacityInput.value = String(manageLearners.length);
  };

  const normalizeTabularCell = (value) => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().split('T')[0];
    if (typeof value === 'object') {
      if (value && typeof value.text === 'string') return normalizeText(value.text, 200);
      if (value && typeof value.result === 'string') return normalizeText(value.result, 200);
      if (value && typeof value.richText === 'object' && Array.isArray(value.richText)) {
        return normalizeText(value.richText.map((entry) => entry?.text || '').join(''), 200);
      }
      return normalizeText(String(value), 200);
    }
    return normalizeText(String(value), 200);
  };

  const parseCsvLine = (line) => {
    const cells = [];
    let current = '';
    let index = 0;
    let inQuotes = false;

    while (index < line.length) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 2;
          continue;
        }
        inQuotes = !inQuotes;
        index += 1;
        continue;
      }

      if (char === ',' && !inQuotes) {
        cells.push(current);
        current = '';
        index += 1;
        continue;
      }

      current += char;
      index += 1;
    }

    cells.push(current);
    return cells.map((entry) => normalizeTabularCell(entry));
  };

  const parseCsvRows = (text) =>
    String(text || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^\uFEFF/, ''))
      .map((line) => parseCsvLine(line))
      .filter((cells) => cells.some((entry) => String(entry || '').trim()));

  const extractLearnersFromRows = (rows) => {
    const tabularRows = Array.isArray(rows)
      ? rows
          .map((row) => (Array.isArray(row) ? row.map((cell) => normalizeTabularCell(cell)) : []))
          .filter((row) => row.some((cell) => cell))
      : [];

    if (!tabularRows.length) return [];

    const header = tabularRows[0].map((cell) => normalizeText(cell, 120).toLowerCase());
    const findColumn = (candidates) =>
      header.findIndex((entry) => candidates.some((candidate) => entry === candidate || entry.includes(candidate)));

    const nameIndex = findColumn(['name', 'learner name', 'student name', 'learner', 'student', 'full name']);
    const admissionIndex = findColumn(['admission', 'admission no', 'admission number', 'adm no', 'admission id']);
    const genderIndex = findColumn(['gender', 'sex']);
    const hasHeader = nameIndex >= 0 || admissionIndex >= 0 || genderIndex >= 0;
    const startRow = hasHeader ? 1 : 0;

    const learners = [];
    for (let rowIndex = startRow; rowIndex < tabularRows.length; rowIndex += 1) {
      const row = tabularRows[rowIndex];
      if (!Array.isArray(row) || !row.length) continue;

      const fallbackName = row.find((entry) => normalizeText(entry, 120));
      const fallbackAdmission = row.length > 1 ? normalizeText(row[1], 40) : '';

      const name = nameIndex >= 0 ? normalizeText(row[nameIndex], 120) : normalizeText(fallbackName, 120);
      const admissionNo =
        admissionIndex >= 0 && admissionIndex !== nameIndex
          ? normalizeText(row[admissionIndex], 40)
          : normalizeText(fallbackAdmission, 40);
      const gender =
        genderIndex >= 0 && genderIndex !== nameIndex
          ? normalizeText(row[genderIndex], 20)
          : '';

      const learner = normalizeLearner({ name, admissionNo, gender });
      if (!learner) continue;
      learners.push(learner);
    }

    return normalizeLearners(learners);
  };

  const parseLearnersFromCsvFile = async (file) => {
    const text = await file.text();
    return extractLearnersFromRows(parseCsvRows(text));
  };

  const parseSimplifiedExcelFullName = (value) => {
    const toTitleToken = (token) => {
      const normalized = normalizeText(token, 60);
      if (!normalized) return '';
      return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
    };

    const raw = normalizeText(value, 180);
    if (!raw) return '';

    const commaIndex = raw.indexOf(',');
    if (commaIndex < 0) {
      return toTitleToken(raw);
    }

    const surname = toTitleToken(raw.slice(0, commaIndex));
    const rightPart = normalizeText(raw.slice(commaIndex + 1), 120);
    const firstName = toTitleToken(rightPart.split(/\s+/)[0]);

    if (!surname && !firstName) return '';
    if (!firstName) return surname;
    if (!surname) return firstName;
    return normalizeText(`${firstName} ${surname}`, 120);
  };

  const extractLearnersFromSimplifiedExcelRows = (rows) => {
    const learners = [];

    const normalizeGender = (value) => {
      const raw = normalizeText(value, 20).toLowerCase();
      if (raw === 'm' || raw === 'male' || raw === 'boy') return 'Male';
      if (raw === 'f' || raw === 'female' || raw === 'girl') return 'Female';
      if (raw === 'o' || raw === 'other') return 'Other';
      return '';
    };

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!Array.isArray(row) || !row.length) return;

      const parsedAdmission = normalizeText(row[0], 40);
      const parsedNameFromNewLayout = parseSimplifiedExcelFullName(row[1]);
      const parsedGenderFromNewLayout = normalizeGender(row[2]);

      const parsedName = parsedNameFromNewLayout || parseSimplifiedExcelFullName(row[0]);
      if (!parsedName) return;

      const parsedGender = parsedGenderFromNewLayout || normalizeGender(row[1]);
      const admissionNo = parsedNameFromNewLayout ? parsedAdmission : '';

      learners.push({ name: parsedName, admissionNo, gender: parsedGender });
    });

    return normalizeLearners(learners);
  };

  const parseLearnersFromExcelFile = async (file) => {
    const buffer = await file.arrayBuffer();
    const rows = [];

    try {
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.worksheets.find((sheet) => sheet.actualRowCount > 0) || workbook.worksheets[0];
      if (worksheet) {
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          rows.push(values.map((entry) => normalizeTabularCell(entry)));
        });
      }
    } catch {
      // Continue to SheetJS fallback for .xls and other workbook variants.
    }

    if (!rows.length) {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: false,
        cellText: true
      });
      const firstSheetName = Array.isArray(workbook.SheetNames) && workbook.SheetNames.length ? workbook.SheetNames[0] : '';
      const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      if (!worksheet) return [];

      const parsedRows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        defval: ''
      });

      (Array.isArray(parsedRows) ? parsedRows : []).forEach((row) => {
        rows.push(Array.isArray(row) ? row.map((entry) => normalizeTabularCell(entry)) : []);
      });
    }

    if (!rows.length) return [];

    const firstRow = Array.isArray(rows[0]) ? rows[0] : [];
    const firstRowLower = firstRow.map((entry) => normalizeText(entry, 120).toLowerCase());
    const hasHeaderKeywords = firstRowLower.some((entry) => /name|learner|student|admission|gender/.test(entry));

    if (!hasHeaderKeywords) {
      const simplifiedLearners = extractLearnersFromSimplifiedExcelRows(rows);
      if (simplifiedLearners.length) {
        return simplifiedLearners;
      }
    }

    return extractLearnersFromRows(rows);
  };

  const parseClassKeyFromImportFileName = (name) => {
    const baseName = String(name || '')
      .trim()
      .replace(/\.[^.]+$/, '');
    if (!baseName) return null;

    const match = baseName.match(/^(\d{1,2})\s*([a-zA-Z])$/);
    if (!match) return null;

    const grade = String(match[1] || '').trim();
    const letter = normalizeLetter(match[2] || '');
    if (!gradeNumbers.includes(grade) || !letter) return null;
    return { grade, letter };
  };

  const classExistsInStore = (grade, letter) => {
    const classes = Array.isArray(classesByGrade[grade]) ? classesByGrade[grade] : [];
    return classes.some((entry) => normalizeLetter(entry) === normalizeLetter(letter));
  };

  const getImportFormat = () => {
    const format = String(importFormatSelect.value || '').trim().toLowerCase();
    return format === 'csv' ? 'csv' : 'excel';
  };

  const syncImportInputAccept = () => {
    const format = getImportFormat();
    importFileInput.accept = format === 'csv' ? '.csv,text/csv' : '.xlsx,.xls';
  };

  const defaultProfile = () => ({
    teacher: '',
    room: '',
    capacity: '',
    notes: '',
    learners: []
  });

  const normalizeProfile = (profile) => {
    const source = profile && typeof profile === 'object' ? profile : {};
    const capacityRaw = normalizeText(source.capacity, 4);
    return {
      teacher: normalizeText(source.teacher, 120),
      room: normalizeText(source.room, 40),
      capacity: /^\d+$/.test(capacityRaw) ? String(Math.max(1, Math.min(120, Number.parseInt(capacityRaw, 10)))) : '',
      notes: normalizeText(source.notes, 600),
      learners: normalizeLearners(source.learners)
    };
  };

  const normalizeProfilesStore = (store, classStore) => {
    const source = store && typeof store === 'object' && !Array.isArray(store) ? store : {};
    const normalized = {};
    gradeNumbers.forEach((grade) => {
      const gradeProfiles = source[grade] && typeof source[grade] === 'object' && !Array.isArray(source[grade]) ? source[grade] : {};
      const classLetters = Array.isArray(classStore[grade]) ? classStore[grade] : [];
      const mapped = {};
      classLetters.forEach((letter) => {
        mapped[letter] = normalizeProfile(gradeProfiles[letter]);
      });
      normalized[grade] = mapped;
    });
    return normalized;
  };

  const defaultLoadedStore = () => ({
    activeGrades: [...gradeNumbers],
    classesByGrade: normalizeClassesStore({}),
    classProfilesByGrade: normalizeProfilesStore({}, normalizeClassesStore({})),
    staffMembers: []
  });

  const normalizeLoadedStore = (parsed) => {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaultLoadedStore();
    }

    const parsedActive = Array.isArray(parsed.activeGrades)
      ? parsed.activeGrades
          .map((entry) => String(entry || '').trim())
          .filter((entry) => gradeNumbers.includes(entry))
      : [];

    const normalizedActive = parsedActive.length
      ? Array.from(new Set(parsedActive)).sort((left, right) => Number(left) - Number(right))
      : [...gradeNumbers];

    const rawClasses =
      parsed.classesByGrade && typeof parsed.classesByGrade === 'object' && !Array.isArray(parsed.classesByGrade)
        ? parsed.classesByGrade
        : parsed;

    const normalizedClasses = normalizeClassesStore(rawClasses);
    return {
      activeGrades: normalizedActive,
      classesByGrade: normalizedClasses,
      classProfilesByGrade: normalizeProfilesStore(parsed.classProfilesByGrade, normalizedClasses),
      staffMembers: normalizeStaffMembers(parsed.staffMembers)
    };
  };

  const runLearnerSurnameNameMigration = () => {
    if (localStorage.getItem(learnerSurnameNameMigrationFlag) === 'done') {
      return { migratedAny: false, migratedCurrentStore: false };
    }

    let migratedAny = false;
    let migratedCurrentStore = false;

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(enrollmentStoragePrefix)) continue;

      const existingStore = readEnrollmentStoreLocal(key);
      if (!existingStore || typeof existingStore !== 'object' || Array.isArray(existingStore)) continue;

      const normalizedStore = normalizeLoadedStore(existingStore);
      const existingUpdatedAt = Number(existingStore?.updatedAt ?? existingStore?._meta?.updatedAt);
      const stampedPayload = Number.isFinite(existingUpdatedAt) && existingUpdatedAt > 0
        ? stampEnrollmentStorePayload(normalizedStore, existingUpdatedAt)
        : stampEnrollmentStorePayload(normalizedStore);

      localStorage.setItem(key, JSON.stringify(stampedPayload));
      migratedAny = true;
      if (key === storageKey) {
        migratedCurrentStore = true;
      }
    }

    localStorage.setItem(learnerSurnameNameMigrationFlag, 'done');
    return { migratedAny, migratedCurrentStore };
  };

  const loadStore = () => normalizeLoadedStore(readEnrollmentStoreLocal(storageKey));

  const buildStorePayload = () => ({
    activeGrades: [...activeGrades],
    classesByGrade: normalizeClassesStore(classesByGrade),
    classProfilesByGrade: normalizeProfilesStore(classProfilesByGrade, classesByGrade),
    staffMembers: normalizeStaffMembers(staffMembers)
  });

  const flushRemoteEnrollmentSave = async () => {
    if (isRemoteEnrollmentSaveInFlight || !pendingRemoteEnrollmentPayload) return;

    isRemoteEnrollmentSaveInFlight = true;
    const payload = pendingRemoteEnrollmentPayload;
    pendingRemoteEnrollmentPayload = null;

    try {
      const result = await persistEnrollmentStore(sectionKey, storageKey, payload);
      if (!result.savedRemote && statusNode) {
        statusNode.textContent = 'Saved on this device only. Remote sync unavailable right now.';
      }
    } finally {
      isRemoteEnrollmentSaveInFlight = false;
      if (pendingRemoteEnrollmentPayload) {
        void flushRemoteEnrollmentSave();
      }
    }
  };

  const saveStore = ({ syncRemote = true, preserveTimestamp = false } = {}) => {
    const basePayload = buildStorePayload();
    let payload;

    if (!syncRemote && preserveTimestamp) {
      const existing = readEnrollmentStoreLocal(storageKey);
      const existingUpdatedAt = Number(existing?.updatedAt ?? existing?._meta?.updatedAt);
      payload = Number.isFinite(existingUpdatedAt) && existingUpdatedAt > 0
        ? stampEnrollmentStorePayload(basePayload, existingUpdatedAt)
        : basePayload;
    } else {
      payload = stampEnrollmentStorePayload(basePayload);
    }

    localStorage.setItem(storageKey, JSON.stringify(payload));

    if (!syncRemote) return;
    pendingRemoteEnrollmentPayload = payload;
    void flushRemoteEnrollmentSave();
  };

  const getMissingGrades = () => gradeNumbers.filter((grade) => !activeGrades.includes(grade));

  const closeGradeModal = () => {
    gradeModal.classList.add('is-hidden');
    selectedAddGrade = '';
    gradeSelect.innerHTML = '';
  };

  const openGradeModal = () => {
    if (!isAdminMode) return;
    const missing = getMissingGrades();
    if (!missing.length) {
      if (statusNode) {
        statusNode.textContent = 'All grades (6 to 12) are already added.';
      }
      return;
    }

    selectedAddGrade = missing[0];
    gradeSelect.innerHTML = missing
      .map((grade) => `<option value="${escapeHtmlAttribute(grade)}">Grade ${escapeHtmlText(grade)}</option>`)
      .join('');
    gradeSelect.value = selectedAddGrade;
    gradeModal.classList.remove('is-hidden');
  };

  const getAvailableLetters = (grade) => {
    const existing = Array.isArray(classesByGrade[grade]) ? classesByGrade[grade] : [];
    const existingSet = new Set(existing.map((entry) => normalizeLetter(entry)).filter(Boolean));
    return allLetters.filter((letter) => !existingSet.has(letter));
  };

  const closeModal = () => {
    classModal.classList.add('is-hidden');
    selectedGrade = '';
    classSelect.innerHTML = '';
  };

  const closeManageModal = () => {
    manageModal.classList.add('is-hidden');
    closeLearnerProfileModal();
    closeLearnerSportsModal();
    selectedManageGrade = '';
    selectedManageLetter = '';
    manageLearners = [];
    learnerNameInput.value = '';
    learnerAdmissionInput.value = '';
    learnerGenderSelect.value = '';
    importFileInput.value = '';
    bulkImportFileInput.value = '';
    manageCapacityInput.value = '';
  };

  const getClassProfile = (grade, letter) => {
    const normalizedGrade = String(grade || '').trim();
    const normalizedLetter = normalizeLetter(letter);
    if (!normalizedGrade || !normalizedLetter) return defaultProfile();
    const gradeProfiles =
      classProfilesByGrade[normalizedGrade] &&
      typeof classProfilesByGrade[normalizedGrade] === 'object' &&
      !Array.isArray(classProfilesByGrade[normalizedGrade])
        ? classProfilesByGrade[normalizedGrade]
        : {};
    return normalizeProfile(gradeProfiles[normalizedLetter]);
  };

  const setClassProfile = (grade, letter, profile) => {
    const normalizedGrade = String(grade || '').trim();
    const normalizedLetter = normalizeLetter(letter);
    if (!normalizedGrade || !normalizedLetter) return;
    if (!classProfilesByGrade[normalizedGrade] || typeof classProfilesByGrade[normalizedGrade] !== 'object') {
      classProfilesByGrade[normalizedGrade] = {};
    }
    classProfilesByGrade[normalizedGrade][normalizedLetter] = normalizeProfile(profile);
  };

  const syncClassTeachersFromStaffAssignments = () => {
    const assignedByClass = new Map();

    staffMembers.forEach((staff) => {
      if (normalizeStaffType(staff?.staffType || '') !== 'teaching_staff') return;
      const grade = String(staff?.assignedGrade || '').trim();
      const letter = normalizeLetter(staff?.assignedClassLetter || '');
      if (!grade || !letter) return;

      const classes = Array.isArray(classesByGrade[grade]) ? classesByGrade[grade] : [];
      if (!classes.includes(letter)) return;

      const key = `${grade}|${letter}`;
      if (assignedByClass.has(key)) return;
      assignedByClass.set(key, normalizeText(resolveStaffDisplayName(staff), 120));
    });

    assignedByClass.forEach((teacherName, key) => {
      const [grade, letter] = key.split('|');
      if (!grade || !letter) return;
      const profile = getClassProfile(grade, letter);
      if (normalizeText(profile.teacher || '', 120) === teacherName) return;
      setClassProfile(grade, letter, {
        ...profile,
        teacher: teacherName
      });
    });
  };

  const canCurrentUserManageClass = (grade, letter) => {
    if (isAdminMode) return true;
    if (!isStaffMode) return false;
    return isStaffAssignedToClass(loggedInStaff, grade, letter);
  };

  const canCurrentUserEditLearnerAssignments = (grade = selectedManageGrade, letter = selectedManageLetter) => {
    if (isAdminMode) return true;
    if (!isStaffMode) return false;
    return canCurrentUserManageClass(grade, letter);
  };

  let activeLearnerProfileIndex = -1;
  const learnerProfileModal = document.createElement('div');
  learnerProfileModal.className = 'enrollment-class-modal is-hidden';
  learnerProfileModal.setAttribute('data-enrollment-learner-profile-modal', 'true');
  learnerProfileModal.innerHTML = `
    <div class="enrollment-class-modal-backdrop" data-enrollment-close-learner-profile></div>
    <article class="panel enrollment-class-modal-panel" role="dialog" aria-modal="true" aria-label="Learner profile">
      <h3>Learner Profile</h3>
      <p class="enrollment-class-modal-subtitle" data-enrollment-learner-profile-title></p>
      <div class="enrollment-class-manage-grid">
        <label class="enrollment-class-modal-field">
          Full name
          <input type="text" maxlength="120" data-enrollment-learner-profile-name />
        </label>
        <label class="enrollment-class-modal-field">
          Admission no.
          <input type="text" maxlength="40" data-enrollment-learner-profile-admission />
        </label>
        <label class="enrollment-class-modal-field">
          Gender
          <select data-enrollment-learner-profile-gender>
            <option value="">Unspecified</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label class="enrollment-class-modal-field">
          RCL role
          <select data-enrollment-learner-profile-rcl></select>
        </label>
        <label class="enrollment-class-modal-field">
          House
          <select data-enrollment-learner-profile-house></select>
        </label>
      </div>
      <label class="enrollment-class-modal-field">
        Sporting codes
        <select multiple size="6" data-enrollment-learner-profile-sporting></select>
      </label>
      <div class="enrollment-class-modal-actions">
        <button type="button" class="btn btn-secondary" data-enrollment-close-learner-profile>Close</button>
        <button type="button" class="btn btn-primary" data-enrollment-save-learner-profile>Save profile</button>
      </div>
    </article>
  `;
  document.body.appendChild(learnerProfileModal);

  const learnerProfileTitleNode = learnerProfileModal.querySelector('[data-enrollment-learner-profile-title]');
  const learnerProfileNameInput = learnerProfileModal.querySelector('[data-enrollment-learner-profile-name]');
  const learnerProfileAdmissionInput = learnerProfileModal.querySelector('[data-enrollment-learner-profile-admission]');
  const learnerProfileGenderSelect = learnerProfileModal.querySelector('[data-enrollment-learner-profile-gender]');
  const learnerProfileRclSelect = learnerProfileModal.querySelector('[data-enrollment-learner-profile-rcl]');
  const learnerProfileHouseSelect = learnerProfileModal.querySelector('[data-enrollment-learner-profile-house]');
  const learnerProfileSportingSelect = learnerProfileModal.querySelector('[data-enrollment-learner-profile-sporting]');
  const learnerProfileSaveButton = learnerProfileModal.querySelector('[data-enrollment-save-learner-profile]');
  const learnerProfileCloseButtons = Array.from(
    learnerProfileModal.querySelectorAll('[data-enrollment-close-learner-profile]')
  );

  const closeLearnerProfileModal = () => {
    learnerProfileModal.classList.add('is-hidden');
    activeLearnerProfileIndex = -1;
  };

  const renderLearnerProfileModal = (index) => {
    if (
      !(learnerProfileTitleNode instanceof HTMLElement) ||
      !(learnerProfileNameInput instanceof HTMLInputElement) ||
      !(learnerProfileAdmissionInput instanceof HTMLInputElement) ||
      !(learnerProfileGenderSelect instanceof HTMLSelectElement) ||
      !(learnerProfileRclSelect instanceof HTMLSelectElement) ||
      !(learnerProfileHouseSelect instanceof HTMLSelectElement) ||
      !(learnerProfileSportingSelect instanceof HTMLSelectElement)
    ) {
      return;
    }

    if (!Number.isFinite(index) || index < 0 || index >= manageLearners.length) return;

    const learner = manageLearners[index];
    const canEditAssignments = canCurrentUserEditLearnerAssignments();
    const sportingCodeDefinitions = getSportingCodeDefinitions();
    const rclRoleOptions = ['', 'President', 'Deputy President', 'Secretary', 'Treasurer', 'Class Representative'];

    learnerProfileTitleNode.textContent = `Grade ${selectedManageGrade}${selectedManageLetter} • ${learner.name}`;
    learnerProfileNameInput.value = String(learner.name || '');
    learnerProfileAdmissionInput.value = String(learner.admissionNo || '');
    learnerProfileGenderSelect.value = String(learner.gender || '');
    learnerProfileRclSelect.innerHTML = rclRoleOptions
      .map((role) => `<option value="${escapeHtmlAttribute(role)}" ${String(learner.rclRole || '') === role ? 'selected' : ''}>${escapeHtmlText(role || 'No RCL role')}</option>`)
      .join('');

    learnerProfileHouseSelect.innerHTML = [
      '<option value="">Unassigned</option>',
      ...schoolHouseOptions.map(
        (house) =>
          `<option value="${escapeHtmlAttribute(house.id)}" ${learner.houseId === house.id ? 'selected' : ''}>${escapeHtmlText(house.name)}</option>`
      )
    ].join('');

    const learnerSportingCodes = Array.isArray(learner.sportingCodes) ? learner.sportingCodes : [];
    learnerProfileSportingSelect.innerHTML = sportingCodeDefinitions
      .map((entry) => {
        const selected = learnerSportingCodes.some(
          (value) => normalizeText(value, 80).toLowerCase() === normalizeText(entry.title, 80).toLowerCase()
        )
          ? 'selected'
          : '';
        return `<option value="${escapeHtmlAttribute(entry.title)}" ${selected}>${escapeHtmlText(entry.title)}</option>`;
      })
      .join('');

    learnerProfileNameInput.disabled = !canEditAssignments;
    learnerProfileAdmissionInput.disabled = !canEditAssignments;
    learnerProfileGenderSelect.disabled = !canEditAssignments;
    learnerProfileRclSelect.disabled = !canEditAssignments;
    learnerProfileHouseSelect.disabled = !canEditAssignments;
    learnerProfileSportingSelect.disabled = !canEditAssignments;
    if (learnerProfileSaveButton instanceof HTMLButtonElement) {
      learnerProfileSaveButton.disabled = !canEditAssignments;
    }
  };

  const openLearnerProfileModal = (index) => {
    if (!Number.isFinite(index) || index < 0 || index >= manageLearners.length) return;
    activeLearnerProfileIndex = index;
    renderLearnerProfileModal(index);
    learnerProfileModal.classList.remove('is-hidden');
  };

  learnerProfileCloseButtons.forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    button.addEventListener('click', closeLearnerProfileModal);
  });

  learnerProfileModal.addEventListener('click', (event) => {
    if (event.target === learnerProfileModal) {
      closeLearnerProfileModal();
    }
  });

  learnerProfileSaveButton?.addEventListener('click', () => {
    if (!canCurrentUserEditLearnerAssignments()) return;
    if (
      !(learnerProfileNameInput instanceof HTMLInputElement) ||
      !(learnerProfileAdmissionInput instanceof HTMLInputElement) ||
      !(learnerProfileGenderSelect instanceof HTMLSelectElement) ||
      !(learnerProfileRclSelect instanceof HTMLSelectElement) ||
      !(learnerProfileHouseSelect instanceof HTMLSelectElement) ||
      !(learnerProfileSportingSelect instanceof HTMLSelectElement)
    ) {
      return;
    }

    const index = activeLearnerProfileIndex;
    if (!Number.isFinite(index) || index < 0 || index >= manageLearners.length) return;

    const sportingCodes = Array.from(learnerProfileSportingSelect.selectedOptions)
      .map((entry) => normalizeText(entry.value, 80))
      .filter(Boolean);

    const normalizedLearner = normalizeLearner({
      ...manageLearners[index],
      name: learnerProfileNameInput.value,
      admissionNo: learnerProfileAdmissionInput.value,
      gender: learnerProfileGenderSelect.value,
      rclRole: learnerProfileRclSelect.value,
      houseId: learnerProfileHouseSelect.value,
      sportingCodes
    });

    if (!normalizedLearner) {
      if (statusNode) {
        statusNode.textContent = 'Learner name is required.';
      }
      return;
    }

    manageLearners[index] = normalizedLearner;
    persistLiveLearnerAssignments();
    renderManageLearners();
    closeLearnerProfileModal();
  });

  let activeLearnerSportsIndex = -1;
  const learnerSportsModal = document.createElement('div');
  learnerSportsModal.className = 'enrollment-class-modal is-hidden';
  learnerSportsModal.setAttribute('data-enrollment-learner-sports-modal', 'true');
  learnerSportsModal.innerHTML = `
    <div class="enrollment-class-modal-backdrop" data-enrollment-close-learner-sports></div>
    <article class="panel enrollment-class-modal-panel" role="dialog" aria-modal="true" aria-label="Learner sporting codes">
      <h3>Sporting Codes</h3>
      <p class="enrollment-class-modal-subtitle" data-enrollment-learner-sports-title></p>
      <label class="enrollment-class-modal-field">
        Assign sporting codes
        <select multiple size="7" data-enrollment-learner-sports-select></select>
      </label>
      <div class="enrollment-class-modal-actions">
        <button type="button" class="btn btn-secondary" data-enrollment-close-learner-sports>Close</button>
        <button type="button" class="btn btn-primary" data-enrollment-save-learner-sports>Save sporting codes</button>
      </div>
    </article>
  `;
  document.body.appendChild(learnerSportsModal);

  const learnerSportsTitleNode = learnerSportsModal.querySelector('[data-enrollment-learner-sports-title]');
  const learnerSportsSelect = learnerSportsModal.querySelector('[data-enrollment-learner-sports-select]');
  const learnerSportsSaveButton = learnerSportsModal.querySelector('[data-enrollment-save-learner-sports]');
  const learnerSportsCloseButtons = Array.from(
    learnerSportsModal.querySelectorAll('[data-enrollment-close-learner-sports]')
  );

  const closeLearnerSportsModal = () => {
    learnerSportsModal.classList.add('is-hidden');
    activeLearnerSportsIndex = -1;
  };

  const openLearnerSportsModal = (index) => {
    if (!(learnerSportsTitleNode instanceof HTMLElement) || !(learnerSportsSelect instanceof HTMLSelectElement)) return;
    if (!Number.isFinite(index) || index < 0 || index >= manageLearners.length) return;

    const learner = manageLearners[index];
    const canEditAssignments = canCurrentUserEditLearnerAssignments();
    const sportingCodeDefinitions = getSportingCodeDefinitions();
    const assignedCodes = Array.isArray(learner.sportingCodes) ? learner.sportingCodes : [];
    const defaultCode = getDefaultSportingCodesByGender(learner.gender || '')[0] || 'No default code';

    activeLearnerSportsIndex = index;
    learnerSportsTitleNode.textContent = `${learner.name} • ${learner.gender || 'Unspecified gender'} • Default: ${defaultCode}`;
    learnerSportsSelect.innerHTML = sportingCodeDefinitions
      .map((entry) => {
        const selected = assignedCodes.some(
          (value) => normalizeText(value, 80).toLowerCase() === normalizeText(entry.title, 80).toLowerCase()
        )
          ? 'selected'
          : '';
        return `<option value="${escapeHtmlAttribute(entry.title)}" ${selected}>${escapeHtmlText(entry.title)}</option>`;
      })
      .join('');

    learnerSportsSelect.disabled = !canEditAssignments;
    if (learnerSportsSaveButton instanceof HTMLButtonElement) {
      learnerSportsSaveButton.disabled = !canEditAssignments;
    }

    learnerSportsModal.classList.remove('is-hidden');
  };

  learnerSportsCloseButtons.forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    button.addEventListener('click', closeLearnerSportsModal);
  });

  learnerSportsModal.addEventListener('click', (event) => {
    if (event.target === learnerSportsModal) {
      closeLearnerSportsModal();
    }
  });

  learnerSportsSaveButton?.addEventListener('click', () => {
    if (!canCurrentUserEditLearnerAssignments()) return;
    if (!(learnerSportsSelect instanceof HTMLSelectElement)) return;

    const index = activeLearnerSportsIndex;
    if (!Number.isFinite(index) || index < 0 || index >= manageLearners.length) return;

    const selectedCodes = Array.from(learnerSportsSelect.selectedOptions)
      .map((entry) => normalizeText(entry.value, 80))
      .filter(Boolean);

    const normalizedLearner = normalizeLearner({
      ...manageLearners[index],
      sportingCodes: selectedCodes
    });
    if (!normalizedLearner) return;

    manageLearners[index] = normalizedLearner;
    persistLiveLearnerAssignments();
    renderManageLearners();
    closeLearnerSportsModal();
  });

  learnerSearchInput.addEventListener('input', () => {
    learnerSearchValue = learnerSearchInput.value;
    renderManageLearners();
  });

  learnerSortSelect.addEventListener('change', () => {
    learnerSortValue = learnerSortSelect.value === 'surname_desc' ? 'surname_desc' : 'surname_asc';
    learnerSortSelect.value = learnerSortValue;
    renderManageLearners();
  });

  staffSearchInput.addEventListener('input', () => {
    staffSearchValue = staffSearchInput.value;
    renderStaffMembers();
  });

  staffSortSelect.addEventListener('change', () => {
    staffSortValue = staffSortSelect.value === 'surname_desc' ? 'surname_desc' : 'surname_asc';
    staffSortSelect.value = staffSortValue;
    renderStaffMembers();
  });

  const renderManageLearners = () => {
    if (!manageLearners.length) {
      learnerListNode.innerHTML = '<p class="enrollment-class-empty">No learners added yet.</p>';
      requestAnimationFrame(() => {
        refreshManageModalWorkflowHeights();
      });
      return;
    }

    const canEditAssignments = canCurrentUserEditLearnerAssignments();
    const normalizedSearch = normalizeText(learnerSearchValue, 140).toLowerCase();
    const filteredLearners = manageLearners
      .map((learner, index) => ({ learner, index }))
      .filter(({ learner }) => {
        if (!normalizedSearch) return true;
        const haystack = [learner.name, learner.admissionNo, learner.gender]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => {
        const leftKey = resolveSurnameSortKey(left.learner.name);
        const rightKey = resolveSurnameSortKey(right.learner.name);
        const comparison = leftKey.localeCompare(rightKey);
        return learnerSortValue === 'surname_desc' ? -comparison : comparison;
      });

    if (!filteredLearners.length) {
      learnerListNode.innerHTML = '<p class="enrollment-class-empty">No learners match the current search.</p>';
      requestAnimationFrame(() => {
        refreshManageModalWorkflowHeights();
      });
      return;
    }

    learnerListNode.innerHTML = filteredLearners
      .map(({ learner, index }) => {
        const sportingCodes = Array.isArray(learner.sportingCodes) ? learner.sportingCodes : [];
        const assignedSportsLabel = formatSportingCodesSummary(sportingCodes);
        const defaultSportCode = getDefaultSportingCodesByGender(learner.gender || '')[0] || 'No default code';
        const topGenderLabel = learner.gender || 'Unspecified';

        const houseOptionsMarkup = schoolHouseOptions
          .map(
            (house) => `
              <label class="enrollment-house-choice">
                <input
                  type="radio"
                  name="enrollment_learner_house_${index}"
                  value="${escapeHtmlAttribute(house.id)}"
                  data-enrollment-learner-house-index="${index}"
                  ${learner.houseId === house.id ? 'checked' : ''}
                  ${canEditAssignments ? '' : 'disabled'}
                />
                <span class="enrollment-house-avatar" style="--house-color:${escapeHtmlAttribute(house.color || '#64748b')};"></span>
                <span>${escapeHtmlText(house.name)}</span>
              </label>
            `
          )
          .join('');

        return `
          <div class="enrollment-learner-item">
            <div class="enrollment-learner-summary">
              <div class="enrollment-learner-topline">
                <span class="enrollment-learner-name">${escapeHtmlText(learner.name)}${learner.admissionNo ? ` • ${escapeHtmlText(learner.admissionNo)}` : ''}</span>
                <div class="enrollment-learner-topmeta">
                  <span class="enrollment-class-empty">${escapeHtmlText(topGenderLabel)}</span>
                  <button
                    type="button"
                    class="enrollment-learner-sport-chip"
                    data-enrollment-open-learner-sports-index="${index}"
                    title="Assigned: ${escapeHtmlAttribute(assignedSportsLabel)}"
                  >${escapeHtmlText(defaultSportCode)}</button>
                </div>
              </div>
              <div class="enrollment-house-row">
                ${houseOptionsMarkup}
              </div>
            </div>
            ${isAdminMode ? `<div class="enrollment-learner-actions"><button type="button" class="enrollment-class-remove" data-enrollment-remove-learner-index="${index}" aria-label="Remove learner ${escapeHtmlAttribute(learner.name)}" title="Remove learner ${escapeHtmlAttribute(learner.name)}">×</button></div>` : ''}
          </div>
        `;
      })
      .join('');

    requestAnimationFrame(() => {
      refreshManageModalWorkflowHeights();
    });
  };

  const renderStaffHouseSelector = () => {
    const optionsMarkup = schoolHouseOptions
      .map(
        (house) => `
          <label class="enrollment-house-choice">
            <input
              type="radio"
              name="enrollment_staff_house_form"
              value="${escapeHtmlAttribute(house.id)}"
              data-enrollment-staff-form-house="${escapeHtmlAttribute(house.id)}"
              ${selectedStaffHouseId === house.id ? 'checked' : ''}
              ${isAdminMode ? '' : 'disabled'}
            />
            <span class="enrollment-house-avatar" style="--house-color:${escapeHtmlAttribute(house.color || '#64748b')};"></span>
            <span>${escapeHtmlText(house.name)}</span>
          </label>
        `
      )
      .join('');

    const clearOption = `
      <label class="enrollment-house-choice enrollment-house-choice-clear">
        <input
          type="radio"
          name="enrollment_staff_house_form"
          value=""
          data-enrollment-staff-form-house=""
          ${selectedStaffHouseId ? '' : 'checked'}
          ${isAdminMode ? '' : 'disabled'}
        />
        <span>Unassigned</span>
      </label>
    `;

    staffHouseRowNode.innerHTML = optionsMarkup + clearOption;
  };

  const getClassOptionRows = () =>
    activeGrades
      .map((grade) => {
        const classes = Array.isArray(classesByGrade[grade]) ? classesByGrade[grade] : [];
        return classes.map((letter) => ({ grade, letter }));
      })
      .flat()
      .sort((left, right) => {
        const byGrade = Number(left.grade) - Number(right.grade);
        if (byGrade !== 0) return byGrade;
        return left.letter.localeCompare(right.letter);
      });

  const parseAssignedClassValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw || !raw.includes('|')) {
      return { assignedGrade: '', assignedClassLetter: '' };
    }
    const [gradeRaw, letterRaw] = raw.split('|');
    const assignedGrade = gradeNumbers.includes(String(gradeRaw || '').trim()) ? String(gradeRaw || '').trim() : '';
    const assignedClassLetter = normalizeLetter(letterRaw || '');
    return { assignedGrade, assignedClassLetter };
  };

  const renderStaffAssignedClassOptions = () => {
    const options = getClassOptionRows();
    staffAssignedClassSelect.innerHTML = [
      '<option value="">Assigned class (optional)</option>',
      ...options.map(
        (entry) =>
          `<option value="${escapeHtmlAttribute(`${entry.grade}|${entry.letter}`)}">Grade ${escapeHtmlText(entry.grade)}${escapeHtmlText(entry.letter)}</option>`
      )
    ].join('');
  };

  const renderManageTeacherOptions = (selectedTeacher = '') => {
    const selected = normalizeText(selectedTeacher || '', 120);
    const teacherNames = Array.from(
      new Set(
        staffMembers
          .filter((staff) => normalizeStaffType(staff?.staffType || '') === 'teaching_staff')
          .map((staff) => normalizeText(resolveStaffDisplayName(staff), 120))
          .filter(Boolean)
      )
    ).sort((left, right) => resolveSurnameSortKey(left, { staffLike: true }).localeCompare(resolveSurnameSortKey(right, { staffLike: true })));

    const hasSelectedInStaff = selected && teacherNames.includes(selected);
    manageTeacherSelect.innerHTML = [
      '<option value="">Select teacher</option>',
      ...teacherNames.map(
        (name) => `<option value="${escapeHtmlAttribute(name)}" ${selected === name ? 'selected' : ''}>${escapeHtmlText(name)}</option>`
      ),
      ...(selected && !hasSelectedInStaff
        ? [`<option value="${escapeHtmlAttribute(selected)}" selected>Legacy teacher: ${escapeHtmlText(selected)}</option>`]
        : [])
    ].join('');
  };

  const renderStaffMembers = () => {
    if (!staffMembers.length) {
      staffListNode.innerHTML = '<p class="enrollment-class-empty">No staff members added yet.</p>';
      return;
    }

    const normalizedSearch = normalizeText(staffSearchValue, 140).toLowerCase();
    const filteredStaff = staffMembers
      .map((staff, index) => ({ staff, index }))
      .filter(({ staff }) => {
        if (!normalizedSearch) return true;
        const assignedClass = staff.assignedGrade && staff.assignedClassLetter ? `${staff.assignedGrade}${staff.assignedClassLetter}` : '';
        const haystack = [
          resolveStaffDisplayName(staff),
          staff.staffNumber,
          staff.subject,
          staff.email,
          assignedClass,
          staff.gender
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => {
        const leftKey = resolveSurnameSortKey(left.staff.surname || resolveStaffDisplayName(left.staff), { staffLike: true });
        const rightKey = resolveSurnameSortKey(right.staff.surname || resolveStaffDisplayName(right.staff), { staffLike: true });
        const comparison = leftKey.localeCompare(rightKey);
        return staffSortValue === 'surname_desc' ? -comparison : comparison;
      });

    if (!filteredStaff.length) {
      staffListNode.innerHTML = '<p class="enrollment-class-empty">No staff members match the current search.</p>';
      return;
    }

    staffListNode.innerHTML = filteredStaff
      .map(({ staff, index }) => {
        const displayName = resolveStaffDisplayName(staff);
        const details = [
          staff.staffType === 'non_teaching_staff' ? 'Non-teaching staff' : 'Teaching staff',
          staff.postLevel ? `${staff.postLevel} · ${staff.rank || staffPostLevelRanks[staff.postLevel] || ''}` : '',
          staff.gender || '',
          staff.staffNumber ? `No: ${staff.staffNumber}` : '',
          staff.assignedGrade && staff.assignedClassLetter ? `Class: ${staff.assignedGrade}${staff.assignedClassLetter}` : '',
          staff.loginEmail ? `Login: ${staff.loginEmail}` : '',
          staff.loginPassword ? `Default password: ${staff.loginPassword}` : '',
          staff.subject || '',
          staff.email || '',
          staff.phone || ''
        ]
          .filter(Boolean)
          .join(' • ');

        const houseOptionsMarkup = schoolHouseOptions
          .map(
            (house) => `
              <label class="enrollment-house-choice">
                <input
                  type="radio"
                  name="enrollment_staff_house_${index}"
                  value="${escapeHtmlAttribute(house.id)}"
                  data-enrollment-staff-house-index="${index}"
                  ${staff.houseId === house.id ? 'checked' : ''}
                  ${isAdminMode ? '' : 'disabled'}
                />
                <span class="enrollment-house-avatar" style="--house-color:${escapeHtmlAttribute(house.color || '#64748b')};"></span>
                <span>${escapeHtmlText(house.name)}</span>
              </label>
            `
          )
          .join('');

        const clearChoice = isAdminMode
          ? `
              <label class="enrollment-house-choice enrollment-house-choice-clear">
                <input
                  type="radio"
                  name="enrollment_staff_house_${index}"
                  value=""
                  data-enrollment-staff-house-index="${index}"
                  ${staff.houseId ? '' : 'checked'}
                />
                <span>Unassigned</span>
              </label>
            `
          : '';

        return `
          <div class="enrollment-learner-item enrollment-staff-item">
            <div class="enrollment-learner-summary">
              <span>${escapeHtmlText(displayName)}${details ? ` • ${escapeHtmlText(details)}` : ''}</span>
              ${isAdminMode ? `
                <label class="enrollment-class-modal-field enrollment-staff-display-override-field">
                  Assigned class
                  <select data-enrollment-staff-assigned-class-index="${index}">
                    <option value="">No class assigned</option>
                    ${getClassOptionRows()
                      .map((entry) => {
                        const value = `${entry.grade}|${entry.letter}`;
                        const selected =
                          String(staff.assignedGrade || '') === String(entry.grade || '') &&
                          normalizeLetter(staff.assignedClassLetter || '') === normalizeLetter(entry.letter || '')
                            ? 'selected'
                            : '';
                        return `<option value="${escapeHtmlAttribute(value)}" ${selected}>Grade ${escapeHtmlText(entry.grade)}${escapeHtmlText(entry.letter)}</option>`;
                      })
                      .join('')}
                  </select>
                </label>
              ` : ''}
              ${staff.notes ? `<span class="enrollment-class-empty">${escapeHtmlText(staff.notes)}</span>` : ''}
              <div class="enrollment-house-row">
                ${houseOptionsMarkup}
                ${clearChoice}
              </div>
            </div>
            <div class="enrollment-learner-actions">
              ${isAdminMode ? `<button type="button" class="enrollment-class-remove" data-enrollment-remove-staff-index="${index}" aria-label="Remove staff ${escapeHtmlAttribute(displayName)}" title="Remove staff ${escapeHtmlAttribute(displayName)}">×</button>` : ''}
            </div>
          </div>
        `;
      })
      .join('');

    renderManageTeacherOptions(manageTeacherSelect.value);
  };

  const clearStaffForm = () => {
    staffTypeSelect.value = 'teaching_staff';
    staffTitleSelect.value = 'Mr.';
    staffInitialsInput.value = '';
    staffFirstNameInput.value = '';
    staffSurnameInput.value = '';
    staffNumberInput.value = '';
    staffGenderSelect.value = '';
    staffPostLevelSelect.value = 'PL1';
    staffAssignedClassSelect.value = '';
    staffSubjectInput.value = '';
    staffEmailInput.value = '';
    staffPhoneInput.value = '';
    staffNotesInput.value = '';
    selectedStaffHouseId = '';
    renderStaffHouseSelector();
  };

  const openManageModal = (grade, letter) => {
    const normalizedGrade = String(grade || '').trim();
    const normalizedLetter = normalizeLetter(letter);
    if (!normalizedGrade || !normalizedLetter) return;
    const classes = Array.isArray(classesByGrade[normalizedGrade]) ? classesByGrade[normalizedGrade] : [];
    if (!classes.includes(normalizedLetter)) return;
    if (!canCurrentUserManageClass(normalizedGrade, normalizedLetter)) return;

    selectedManageGrade = normalizedGrade;
    selectedManageLetter = normalizedLetter;
    learnerSearchValue = '';
    learnerSortValue = 'surname_asc';
    learnerSearchInput.value = '';
    learnerSortSelect.value = learnerSortValue;
    const classLabel = `Grade ${normalizedGrade}${normalizedLetter}`;
    if (manageTitleNode instanceof HTMLElement) {
      manageTitleNode.textContent = classLabel;
    }

    const profile = getClassProfile(normalizedGrade, normalizedLetter);
    renderManageTeacherOptions(profile.teacher);
    manageRoomInput.value = profile.room;
    manageNotesInput.value = profile.notes;
    manageLearners = [...profile.learners];
    syncCapacityWithLearners();
    learnerNameInput.value = '';
    learnerAdmissionInput.value = '';
    learnerGenderSelect.value = '';

    const canEditAssignments = canCurrentUserEditLearnerAssignments(normalizedGrade, normalizedLetter);
    manageTeacherSelect.disabled = !isAdminMode;
    manageRoomInput.disabled = !isAdminMode;
    manageCapacityInput.disabled = true;
    manageCapacityInput.readOnly = true;
    manageNotesInput.disabled = !isAdminMode;
    learnerNameInput.disabled = !isAdminMode;
    learnerAdmissionInput.disabled = !isAdminMode;
    learnerGenderSelect.disabled = !isAdminMode;
    addLearnerButton.disabled = !isAdminMode;
    importFormatSelect.disabled = !isAdminMode;
    importFileInput.disabled = !isAdminMode;
    importLearnersButton.disabled = !isAdminMode;
    bulkImportFileInput.disabled = !isAdminMode;
    bulkImportLearnersButton.disabled = !isAdminMode;
    clearLearnersButtons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.disabled = !isAdminMode;
    });
    saveManageButtons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.disabled = !canEditAssignments;
      button.classList.toggle('is-hidden', false);
    });

    importFormatSelect.value = 'excel';
    syncImportInputAccept();
    importFileInput.value = '';
    bulkImportFileInput.value = '';

    const classDetailsStep = manageModalWorkflowSteps.find(
      (entry) => entry.stepNode.dataset.manageWorkflowId === 'class-details'
    );
    setManageModalWorkflowExpanded(classDetailsStep, false);

    renderManageLearners();
    manageModal.classList.remove('is-hidden');
    requestAnimationFrame(() => {
      refreshManageModalWorkflowHeights();
    });
  };

  const openModalForGrade = (grade) => {
    if (!isAdminMode) return;
    const availableLetters = getAvailableLetters(grade);
    if (!availableLetters.length) {
      if (statusNode) {
        statusNode.textContent = `All class letters are already in use for Grade ${grade}.`;
      }
      return;
    }

    selectedGrade = grade;
    classSelect.innerHTML = availableLetters
      .map((letter) => `<option value="${letter}">${letter}</option>`)
      .join('');
    if (modalGradeNode) {
      modalGradeNode.textContent = `Grade ${grade}`;
    }
    classModal.classList.remove('is-hidden');
  };

  const render = () => {
    addGradeTrigger.disabled = !isAdminMode || getMissingGrades().length === 0;
    addGradeTrigger.classList.toggle('is-hidden', !isAdminMode);
    adminOnlyBlocks.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.classList.toggle('is-hidden', !isAdminMode);
    });

    if (staffWorkflowStep instanceof HTMLElement) {
      staffWorkflowStep.classList.toggle('is-hidden', !isAdminMode);
    }

    const staffReadOnly = !isAdminMode;
    staffTypeSelect.disabled = staffReadOnly;
    staffTitleSelect.disabled = staffReadOnly;
    staffInitialsInput.disabled = staffReadOnly;
    staffFirstNameInput.disabled = staffReadOnly;
    staffSurnameInput.disabled = staffReadOnly;
    staffNumberInput.disabled = staffReadOnly;
    staffGenderSelect.disabled = staffReadOnly;
    staffPostLevelSelect.disabled = staffReadOnly;
    staffAssignedClassSelect.disabled = staffReadOnly;
    staffSubjectInput.disabled = staffReadOnly;
    staffEmailInput.disabled = staffReadOnly;
    staffPhoneInput.disabled = staffReadOnly;
    staffNotesInput.disabled = staffReadOnly;
    addStaffButton.disabled = staffReadOnly;
    openStaffWorkflowButton.disabled = staffReadOnly;
    renderStaffAssignedClassOptions();
    renderStaffHouseSelector();
    renderStaffMembers();
    syncStaffSession();

    const staffAssignedGrade = isStaffMode && loggedInStaff ? String(loggedInStaff.assignedGrade || '').trim() : '';
    const staffAssignedLetter = isStaffMode && loggedInStaff ? normalizeLetter(loggedInStaff.assignedClassLetter || '') : '';
    const hasAssignedClassInStore =
      Boolean(staffAssignedGrade && staffAssignedLetter) &&
      Array.isArray(classesByGrade[staffAssignedGrade]) &&
      classesByGrade[staffAssignedGrade].some((entry) => normalizeLetter(entry) === staffAssignedLetter);

    const visibleGrades =
      isStaffMode
        ? hasAssignedClassInStore
          ? [staffAssignedGrade]
          : []
        : activeGrades;

    gradeListNode.innerHTML = visibleGrades
      .map((grade) => {
        const allGradeClasses = Array.isArray(classesByGrade[grade]) ? classesByGrade[grade] : [];
        const classes =
          isStaffMode && hasAssignedClassInStore
            ? allGradeClasses.filter(
                (letter) => String(grade) === staffAssignedGrade && normalizeLetter(letter) === staffAssignedLetter
              )
            : allGradeClasses;
        const chips = classes.length
          ? classes
              .map((letter) => {
                const classLabel = `${grade}${letter}`;
                const canManage = canCurrentUserManageClass(grade, letter);
                if (!isAdminMode && !canManage) {
                  return `<span class="enrollment-class-chip">${escapeHtmlText(classLabel)}</span>`;
                }

                return `
                  <span class="enrollment-class-item">
                    <button
                      type="button"
                      class="enrollment-class-chip enrollment-class-chip-button"
                      data-enrollment-open-manage-grade="${escapeHtmlAttribute(grade)}"
                      data-enrollment-open-manage-letter="${escapeHtmlAttribute(letter)}"
                      aria-label="Manage class ${escapeHtmlAttribute(classLabel)}"
                    >${escapeHtmlText(classLabel)}</button>
                    ${isAdminMode ? `
                      <button
                        type="button"
                        class="enrollment-class-remove"
                        data-enrollment-remove-grade="${escapeHtmlAttribute(grade)}"
                        data-enrollment-remove-letter="${escapeHtmlAttribute(letter)}"
                        aria-label="Remove class ${escapeHtmlAttribute(classLabel)}"
                        title="Remove class ${escapeHtmlAttribute(classLabel)}"
                      >×</button>
                    ` : ''}
                  </span>
                `;
              })
              .join('')
          : '<span class="enrollment-class-empty">No classes added yet.</span>';

        const addDisabled = !isAdminMode || getAvailableLetters(grade).length === 0;

        return `
          <article class="enrollment-grade-card" data-enrollment-grade="${grade}">
            <div class="enrollment-grade-head">
              <h3>Grade ${grade}</h3>
              <div class="enrollment-grade-actions">
                ${isAdminMode ? `<button type="button" class="btn btn-secondary" data-enrollment-open-add="${grade}"${addDisabled ? ' disabled' : ''}>Add class</button>` : ''}
                ${isAdminMode ? `<button type="button" class="btn btn-secondary" data-enrollment-remove-grade="${grade}">Remove grade</button>` : ''}
              </div>
            </div>
            <div class="enrollment-class-list">${chips}</div>
          </article>
        `;
      })
      .join('');

    if (statusNode) {
      if (!visibleGrades.length) {
        statusNode.textContent = isAdminMode
          ? 'No grades currently active. Use Add grade to create one.'
          : isStaffMode
            ? 'No assigned class found for your profile. Ask admin to assign your class.'
            : 'No grades currently active.';
      } else {
        statusNode.textContent = isAdminMode
          ? 'Use Add class to create classes and click any class to manage details.'
          : isStaffMode
            ? loggedInStaff
              ? `My Class active for ${resolveStaffDisplayName(loggedInStaff)}. You can update house, RCL roles, and sporting codes for your assigned class.`
              : 'Sign in at /staff=1 to open My Class.'
            : 'Enrollment classes are visible in read-only mode.';
      }
    }

    if (isStaffMode && hasAssignedClassInStore && !hasAutoOpenedAssignedClass && !selectedManageGrade && !selectedManageLetter) {
      hasAutoOpenedAssignedClass = true;
      openManageModal(staffAssignedGrade, staffAssignedLetter);
    }

    refreshEnrollmentWorkflowHeights();
  };

  const learnerNameMigrationResult = runLearnerSurnameNameMigration();
  const loaded = loadStore();
  activeGrades = loaded.activeGrades;
  classesByGrade = loaded.classesByGrade;
  classProfilesByGrade = loaded.classProfilesByGrade;
  staffMembers = normalizeStaffMembers(loaded.staffMembers);
  syncClassTeachersFromStaffAssignments();
  if (learnerNameMigrationResult.migratedCurrentStore) {
    saveStore({ syncRemote: true, preserveTimestamp: true });
  }
  staffSessionEmail = normalizeText(sessionStorage.getItem(staffSessionKey) || '', 120).toLowerCase();
  syncStaffSession();

  if (isStaffMode && !loggedInStaff) {
    window.location.href = 'staff.html';
    return;
  }

  renderStaffHouseSelector();
  renderStaffAssignedClassOptions();
  renderStaffMembers();
  render();

  const hydrateStoreFromRemote = async () => {
    const remoteStore = await syncEnrollmentStoreFromRemote(sectionKey, storageKey);
    if (!remoteStore) return;

    const normalizedRemote = normalizeLoadedStore(remoteStore);
    const currentPayload = buildStorePayload();
    const samePayload = JSON.stringify(normalizedRemote) === JSON.stringify(currentPayload);
    if (samePayload) return;

    activeGrades = normalizedRemote.activeGrades;
    classesByGrade = normalizedRemote.classesByGrade;
    classProfilesByGrade = normalizedRemote.classProfilesByGrade;
    staffMembers = normalizeStaffMembers(normalizedRemote.staffMembers);
    syncClassTeachersFromStaffAssignments();
    saveStore({ syncRemote: false, preserveTimestamp: true });
    staffSessionEmail = normalizeText(sessionStorage.getItem(staffSessionKey) || '', 120).toLowerCase();
    syncStaffSession();

    if (isStaffMode && !loggedInStaff) {
      window.location.href = 'staff.html';
      return;
    }

    renderStaffHouseSelector();
    renderStaffAssignedClassOptions();
    renderStaffMembers();
    render();
  };

  void hydrateStoreFromRemote();

  gradeListNode.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const removeButton = target.closest('[data-enrollment-remove-letter]');
    if (removeButton instanceof HTMLButtonElement) {
      if (!isAdminMode) return;

      const grade = String(removeButton.dataset.enrollmentRemoveGrade || '').trim();
      const letter = normalizeLetter(removeButton.dataset.enrollmentRemoveLetter || '');
      if (!grade || !letter) return;

      const confirmRemove = window.confirm(`Remove class ${grade}${letter}?`);
      if (!confirmRemove) return;

      classesByGrade[grade] = dedupeLetters((classesByGrade[grade] || []).filter((entry) => normalizeLetter(entry) !== letter));
      if (
        classProfilesByGrade[grade] &&
        typeof classProfilesByGrade[grade] === 'object' &&
        !Array.isArray(classProfilesByGrade[grade])
      ) {
        delete classProfilesByGrade[grade][letter];
      }
      saveStore();
      render();
      if (statusNode) {
        statusNode.textContent = `Class ${grade}${letter} removed.`;
      }
      if (selectedManageGrade === grade && selectedManageLetter === letter) {
        closeManageModal();
      }
      return;
    }

    const removeGradeButton = target.closest('[data-enrollment-remove-grade]');
    if (removeGradeButton instanceof HTMLButtonElement && !removeGradeButton.dataset.enrollmentRemoveLetter) {
      if (!isAdminMode) return;
      const grade = String(removeGradeButton.dataset.enrollmentRemoveGrade || '').trim();
      if (!grade) return;

      const confirmRemove = window.confirm(`Remove Grade ${grade} and all its classes?`);
      if (!confirmRemove) return;

      activeGrades = activeGrades.filter((entry) => entry !== grade);
      classesByGrade[grade] = [];
      classProfilesByGrade[grade] = {};
      saveStore();
      render();
      if (statusNode) {
        statusNode.textContent = `Grade ${grade} removed.`;
      }
      if (selectedManageGrade === grade) {
        closeManageModal();
      }
      return;
    }

    const manageButton = target.closest('[data-enrollment-open-manage-letter]');
    if (manageButton instanceof HTMLButtonElement) {
      const grade = String(manageButton.dataset.enrollmentOpenManageGrade || '').trim();
      const letter = normalizeLetter(manageButton.dataset.enrollmentOpenManageLetter || '');
      if (!grade || !letter) return;
      openManageModal(grade, letter);
      return;
    }

    const button = target.closest('[data-enrollment-open-add]');
    if (!(button instanceof HTMLButtonElement)) return;
    const grade = String(button.dataset.enrollmentOpenAdd || '').trim();
    if (!grade) return;
    openModalForGrade(grade);
  });

  addGradeTrigger.addEventListener('click', () => {
    openGradeModal();
  });

  gradeSelect.addEventListener('change', () => {
    selectedAddGrade = String(gradeSelect.value || '').trim();
  });

  closeGradeButtons.forEach((button) => {
    button.addEventListener('click', closeGradeModal);
  });

  gradeModal.addEventListener('click', (event) => {
    if (event.target === gradeModal) {
      closeGradeModal();
    }
  });

  addGradeButton.addEventListener('click', () => {
    if (!isAdminMode) return;
    const grade = String(selectedAddGrade || gradeSelect.value || '').trim();
    if (!grade || !gradeNumbers.includes(grade) || activeGrades.includes(grade)) return;

    activeGrades = [...activeGrades, grade].sort((left, right) => Number(left) - Number(right));
    classesByGrade[grade] = dedupeLetters(classesByGrade[grade] || []);
    saveStore();
    render();
    if (statusNode) {
      statusNode.textContent = `Grade ${grade} added.`;
    }
    closeGradeModal();
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  syncImportInputAccept();

  importFormatSelect.addEventListener('change', () => {
    syncImportInputAccept();
    importFileInput.value = '';
  });

  closeManageButtons.forEach((button) => {
    button.addEventListener('click', closeManageModal);
  });

  openStaffWorkflowButton.addEventListener('click', () => {
    if (!isAdminMode) return;
    closeManageModal();
    const staffStepEntry = enrollmentWorkflowSteps.find(
      (entry) => entry.stepNode.dataset.enrollmentWorkflowId === 'staff'
    );
    const manageStepEntry = enrollmentWorkflowSteps.find(
      (entry) => entry.stepNode.dataset.enrollmentWorkflowId === 'manage-enrollment'
    );
    if (manageStepEntry) {
      setEnrollmentWorkflowExpanded(manageStepEntry, false);
    }
    if (staffStepEntry) {
      setEnrollmentWorkflowExpanded(staffStepEntry, true);
      staffFirstNameInput.focus();
    }
  });

  classModal.addEventListener('click', (event) => {
    if (event.target === classModal) {
      closeModal();
    }
  });

  manageModal.addEventListener('click', (event) => {
    if (event.target === manageModal) {
      closeManageModal();
    }
  });

  learnerListNode.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const profileButton = target.closest('[data-enrollment-open-learner-profile-index]');
    if (profileButton instanceof HTMLButtonElement) {
      const index = Number.parseInt(String(profileButton.dataset.enrollmentOpenLearnerProfileIndex || ''), 10);
      if (!Number.isFinite(index) || index < 0 || index >= manageLearners.length) return;
      openLearnerProfileModal(index);
      return;
    }

    const sportsButton = target.closest('[data-enrollment-open-learner-sports-index]');
    if (sportsButton instanceof HTMLButtonElement) {
      const index = Number.parseInt(String(sportsButton.dataset.enrollmentOpenLearnerSportsIndex || ''), 10);
      if (!Number.isFinite(index) || index < 0 || index >= manageLearners.length) return;
      openLearnerSportsModal(index);
      return;
    }

    if (!isAdminMode) return;
    const removeLearnerButton = target.closest('[data-enrollment-remove-learner-index]');
    if (!(removeLearnerButton instanceof HTMLButtonElement)) return;
    const index = Number.parseInt(String(removeLearnerButton.dataset.enrollmentRemoveLearnerIndex || ''), 10);
    if (!Number.isFinite(index) || index < 0 || index >= manageLearners.length) return;
    manageLearners.splice(index, 1);
    syncCapacityWithLearners();
    renderManageLearners();
  });

  learnerListNode.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'radio') return;
    if (target.dataset.enrollmentLearnerHouseIndex === undefined) return;
    if (!canCurrentUserEditLearnerAssignments()) return;

    const index = Number.parseInt(String(target.dataset.enrollmentLearnerHouseIndex || ''), 10);
    if (!Number.isFinite(index) || index < 0 || index >= manageLearners.length) return;

    const current = manageLearners[index];
    const nextHouseId = schoolHouseOptions.some((house) => house.id === target.value) ? target.value : '';
    const normalizedLearner = normalizeLearner({
      ...current,
      houseId: nextHouseId
    });
    if (!normalizedLearner) return;

    manageLearners[index] = normalizedLearner;
    persistLiveLearnerAssignments();
    renderManageLearners();
  });

  staffHouseRowNode.addEventListener('change', (event) => {
    if (!isAdminMode) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'radio') return;
    selectedStaffHouseId = schoolHouseOptions.some((house) => house.id === target.value) ? target.value : '';
  });

  staffListNode.addEventListener('click', (event) => {
    if (!isAdminMode) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const removeButton = target.closest('[data-enrollment-remove-staff-index]');
    if (!(removeButton instanceof HTMLButtonElement)) return;

    const index = Number.parseInt(String(removeButton.dataset.enrollmentRemoveStaffIndex || ''), 10);
    if (!Number.isFinite(index) || index < 0 || index >= staffMembers.length) return;

    const staffName = String(resolveStaffDisplayName(staffMembers[index]) || 'this staff member').trim();
    const confirmed = window.confirm(`Remove ${staffName} from staff list?`);
    if (!confirmed) return;
    staffMembers.splice(index, 1);
    syncClassTeachersFromStaffAssignments();
    saveStore();
    renderStaffMembers();
    if (statusNode) {
      statusNode.textContent = `${staffName} removed from staff list.`;
    }
  });

  staffListNode.addEventListener('change', (event) => {
    if (!isAdminMode) return;
    const target = event.target;

    if (target instanceof HTMLSelectElement && target.dataset.enrollmentStaffAssignedClassIndex !== undefined) {
      const index = Number.parseInt(String(target.dataset.enrollmentStaffAssignedClassIndex || ''), 10);
      if (!Number.isFinite(index) || index < 0 || index >= staffMembers.length) return;
      const parsedClass = parseAssignedClassValue(target.value);
      const current = staffMembers[index];
      const updated = normalizeStaffMember({
        ...current,
        assignedGrade: parsedClass.assignedGrade,
        assignedClassLetter: parsedClass.assignedClassLetter
      });
      if (!updated) return;
      staffMembers[index] = updated;
      syncClassTeachersFromStaffAssignments();
      saveStore();
      syncStaffSession();
      renderStaffMembers();
      if (statusNode) {
        statusNode.textContent = `Class assignment updated for ${resolveStaffDisplayName(updated)}.`;
      }
      return;
    }

    if (!(target instanceof HTMLInputElement) || target.type !== 'radio') return;
    const rawIndex = target.dataset.enrollmentStaffHouseIndex;
    if (rawIndex === undefined) return;
    const index = Number.parseInt(String(rawIndex), 10);
    if (!Number.isFinite(index) || index < 0 || index >= staffMembers.length) return;

    const houseId = schoolHouseOptions.some((house) => house.id === target.value) ? target.value : '';
    staffMembers[index] = {
      ...staffMembers[index],
      houseId
    };
    saveStore();
    if (statusNode) {
      statusNode.textContent = `${resolveStaffDisplayName(staffMembers[index])} house assignment updated.`;
    }
  });

  addStaffButton.addEventListener('click', () => {
    if (!isAdminMode) return;

    const parsedAssignedClass = parseAssignedClassValue(staffAssignedClassSelect.value);

    const normalized = normalizeStaffMember({
      staffType: staffTypeSelect.value,
      title: staffTitleSelect.value,
      initials: staffInitialsInput.value,
      firstName: staffFirstNameInput.value,
      surname: staffSurnameInput.value,
      loginEmail: staffEmailInput.value,
      staffNumber: staffNumberInput.value,
      gender: staffGenderSelect.value,
      postLevel: staffPostLevelSelect.value,
      assignedGrade: parsedAssignedClass.assignedGrade,
      assignedClassLetter: parsedAssignedClass.assignedClassLetter,
      subject: staffSubjectInput.value,
      email: staffEmailInput.value,
      phone: staffPhoneInput.value,
      notes: staffNotesInput.value,
      houseId: selectedStaffHouseId
    });

    if (!normalized) {
      if (statusNode) {
        statusNode.textContent = 'Enter at least surname (plus title/initials defaults) before adding staff.';
      }
      return;
    }

    const duplicate = staffMembers.some(
      (entry) =>
        String(entry.surname || '').toLowerCase() === String(normalized.surname || '').toLowerCase() &&
        String(entry.initials || '').toLowerCase() === String(normalized.initials || '').toLowerCase() &&
        String(entry.staffNumber || '').toLowerCase() === String(normalized.staffNumber || '').toLowerCase()
    );
    if (duplicate) {
      if (statusNode) {
        statusNode.textContent = `${resolveStaffDisplayName(normalized)} is already in staff list.`;
      }
      return;
    }

    staffMembers = normalizeStaffMembers([...staffMembers, normalized]);
    syncClassTeachersFromStaffAssignments();
    saveStore();
    syncStaffSession();
    renderStaffMembers();
    clearStaffForm();
    if (statusNode) {
      statusNode.textContent = `${resolveStaffDisplayName(normalized)} added. Login: ${normalized.loginEmail} | Password: ${normalized.loginPassword}`;
    }
  });

  addClassButton.addEventListener('click', () => {
    if (!isAdminMode || !selectedGrade) return;
    const letter = normalizeLetter(classSelect.value);
    if (!letter) return;

    classesByGrade[selectedGrade] = dedupeLetters([...(classesByGrade[selectedGrade] || []), letter]);
    setClassProfile(selectedGrade, letter, getClassProfile(selectedGrade, letter));
    syncClassTeachersFromStaffAssignments();
    saveStore();
    render();
    if (statusNode) {
      statusNode.textContent = `Class ${selectedGrade}${letter} added.`;
    }
    closeModal();
  });

  addLearnerButton.addEventListener('click', () => {
    if (!isAdminMode || !selectedManageGrade || !selectedManageLetter) return;
    const learner = normalizeLearner({
      name: learnerNameInput.value,
      admissionNo: learnerAdmissionInput.value,
      gender: learnerGenderSelect.value
    });
    const learnerWithDefaults = withLearnerDefaultSportingCodes(learner);
    if (!learnerWithDefaults) {
      if (statusNode) {
        statusNode.textContent = 'Enter a learner name before adding.';
      }
      return;
    }

    const duplicate = manageLearners.some(
      (entry) =>
        entry.name.toLowerCase() === learnerWithDefaults.name.toLowerCase() &&
        String(entry.admissionNo || '').toLowerCase() === String(learnerWithDefaults.admissionNo || '').toLowerCase()
    );
    if (duplicate) {
      if (statusNode) {
        statusNode.textContent = `${learnerWithDefaults.name} is already in this class.`;
      }
      return;
    }

    manageLearners = [...manageLearners, learnerWithDefaults];
    learnerNameInput.value = '';
    learnerAdmissionInput.value = '';
    learnerGenderSelect.value = '';
    syncCapacityWithLearners();
    renderManageLearners();
  });

  importLearnersButton.addEventListener('click', async () => {
    if (!isAdminMode || !selectedManageGrade || !selectedManageLetter) return;
    const file = importFileInput.files && importFileInput.files.length ? importFileInput.files[0] : null;
    if (!file) {
      if (statusNode) {
        statusNode.textContent = 'Choose an import file first.';
      }
      return;
    }

    const format = getImportFormat();
    const originalLabel = importLearnersButton.textContent;
    importLearnersButton.disabled = true;
    importLearnersButton.textContent = 'Importing...';
    try {
      const importedLearners =
        format === 'csv' ? await parseLearnersFromCsvFile(file) : await parseLearnersFromExcelFile(file);

      if (!importedLearners.length) {
        if (statusNode) {
          statusNode.textContent = `No learners found in the selected ${format.toUpperCase()} file.`;
        }
        return;
      }

      const beforeCount = manageLearners.length;
      const importedWithDefaults = importedLearners.map((learner) => withLearnerDefaultSportingCodes(learner));
      manageLearners = normalizeLearners([...manageLearners, ...importedWithDefaults]);
      const addedCount = Math.max(0, manageLearners.length - beforeCount);
      syncCapacityWithLearners();
      renderManageLearners();
      importFileInput.value = '';

      if (statusNode) {
        statusNode.textContent =
          addedCount > 0
            ? `${addedCount} learner${addedCount === 1 ? '' : 's'} imported to Class ${selectedManageGrade}${selectedManageLetter}.`
            : 'Imported list matched existing learners (no new records added).';
      }
    } catch {
      if (statusNode) {
        statusNode.textContent = `Could not import the selected ${format.toUpperCase()} file.`;
      }
    } finally {
      importLearnersButton.disabled = !isAdminMode;
      importLearnersButton.textContent = originalLabel;
    }
  });

  bulkImportLearnersButton.addEventListener('click', async () => {
    if (!isAdminMode || !selectedManageGrade || !selectedManageLetter) return;

    const selectedFiles = Array.from(bulkImportFileInput.files || []);
    if (!selectedFiles.length) {
      if (statusNode) {
        statusNode.textContent = 'Choose one or more Excel class files first.';
      }
      return;
    }

    const originalLabel = bulkImportLearnersButton.textContent;
    bulkImportLearnersButton.disabled = true;
    bulkImportLearnersButton.textContent = 'Bulk importing...';

    const invalidNameFiles = [];
    const unconfiguredClassFiles = [];
    const parseFailedFiles = [];
    const emptyFiles = [];
    let duplicateClassTargets = 0;
    const byClassKey = new Map();

    try {
      for (const file of selectedFiles) {
        const target = parseClassKeyFromImportFileName(file?.name || '');
        if (!target) {
          invalidNameFiles.push(String(file?.name || 'Unknown file'));
          continue;
        }

        if (!classExistsInStore(target.grade, target.letter)) {
          unconfiguredClassFiles.push(`${target.grade}${target.letter}`);
          continue;
        }

        let importedLearners = [];
        try {
          importedLearners = await parseLearnersFromExcelFile(file);
        } catch {
          parseFailedFiles.push(String(file?.name || `${target.grade}${target.letter}`));
          continue;
        }

        if (!importedLearners.length) {
          emptyFiles.push(`${target.grade}${target.letter}`);
          continue;
        }

        const classKey = `${target.grade}|${target.letter}`;
        if (byClassKey.has(classKey)) {
          duplicateClassTargets += 1;
        }

        const normalizedLearners = normalizeLearners(
          importedLearners.map((learner) => withLearnerDefaultSportingCodes(learner))
        );
        byClassKey.set(classKey, {
          grade: target.grade,
          letter: target.letter,
          learners: normalizedLearners
        });
      }

      if (!byClassKey.size) {
        if (statusNode) {
          statusNode.textContent = 'No valid class files were imported. Use names like 10A, 10 B, 11C.';
        }
        return;
      }

      let updatedClasses = 0;
      let totalLearners = 0;

      byClassKey.forEach((entry) => {
        const existingProfile = getClassProfile(entry.grade, entry.letter);
        const normalizedLearners = normalizeLearners(entry.learners);

        setClassProfile(entry.grade, entry.letter, {
          teacher: existingProfile.teacher,
          room: existingProfile.room,
          capacity: String(normalizedLearners.length),
          notes: existingProfile.notes,
          learners: normalizedLearners
        });

        syncHouseAssignmentsForClass(entry.grade, entry.letter, normalizedLearners);

        if (selectedManageGrade === entry.grade && selectedManageLetter === entry.letter) {
          manageLearners = [...normalizedLearners];
          syncCapacityWithLearners();
          renderManageLearners();
        }

        updatedClasses += 1;
        totalLearners += normalizedLearners.length;
      });

      saveStore();
      render();
      bulkImportFileInput.value = '';

      if (statusNode) {
        const skipNotes = [
          invalidNameFiles.length ? `${invalidNameFiles.length} invalid filename${invalidNameFiles.length === 1 ? '' : 's'}` : '',
          unconfiguredClassFiles.length
            ? `${unconfiguredClassFiles.length} file${unconfiguredClassFiles.length === 1 ? '' : 's'} for unconfigured classes`
            : '',
          emptyFiles.length ? `${emptyFiles.length} empty class list${emptyFiles.length === 1 ? '' : 's'}` : '',
          parseFailedFiles.length ? `${parseFailedFiles.length} unreadable file${parseFailedFiles.length === 1 ? '' : 's'}` : '',
          duplicateClassTargets ? `${duplicateClassTargets} duplicate class file${duplicateClassTargets === 1 ? '' : 's'} (latest kept)` : ''
        ].filter(Boolean);

        statusNode.textContent =
          `Bulk import updated ${updatedClasses} class${updatedClasses === 1 ? '' : 'es'} with ${totalLearners} learner${
            totalLearners === 1 ? '' : 's'
          }.` + (skipNotes.length ? ` Skipped: ${skipNotes.join(', ')}.` : '');
      }
    } finally {
      bulkImportLearnersButton.disabled = !isAdminMode;
      bulkImportLearnersButton.textContent = originalLabel;
    }
  });

  const clearLearnersHandler = () => {
    if (!isAdminMode || !selectedManageGrade || !selectedManageLetter) return;
    if (!manageLearners.length) {
      if (statusNode) {
        statusNode.textContent = 'This class has no learners to clear.';
      }
      return;
    }

    const confirmClear = window.confirm(
      `Clear all learners from Class ${selectedManageGrade}${selectedManageLetter}?`
    );
    if (!confirmClear) return;

    manageLearners = [];
    syncCapacityWithLearners();
    renderManageLearners();
    if (statusNode) {
      statusNode.textContent = `Class ${selectedManageGrade}${selectedManageLetter} learner list cleared.`;
    }
  };

  clearLearnersButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.addEventListener('click', clearLearnersHandler);
  });

  const saveManageHandler = () => {
    if (!selectedManageGrade || !selectedManageLetter) return;
    if (!canCurrentUserEditLearnerAssignments(selectedManageGrade, selectedManageLetter)) return;
    const normalizedCapacity = String(manageLearners.length);
    const existingProfile = getClassProfile(selectedManageGrade, selectedManageLetter);
    const normalizedLearners = normalizeLearners(manageLearners);

    setClassProfile(selectedManageGrade, selectedManageLetter, {
      teacher: isAdminMode ? normalizeText(manageTeacherSelect.value, 120) : existingProfile.teacher,
      room: isAdminMode ? normalizeText(manageRoomInput.value, 40) : existingProfile.room,
      capacity: normalizedCapacity,
      notes: isAdminMode ? normalizeText(manageNotesInput.value, 600) : existingProfile.notes,
      learners: normalizedLearners
    });

    syncHouseAssignmentsForClass(selectedManageGrade, selectedManageLetter, normalizedLearners);

    saveStore();
    if (statusNode) {
      statusNode.textContent = isAdminMode
        ? `Class ${selectedManageGrade}${selectedManageLetter} updated.`
        : `My Class (${selectedManageGrade}${selectedManageLetter}) assignments saved.`;
    }
    closeManageModal();
  };

  saveManageButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.addEventListener('click', saveManageHandler);
  });
};

const buildSingleRoundRobin = (teamIds = [], matchesPerOpponentPerLeg = 1) => {
  const normalized = teamIds.filter(Boolean);
  if (normalized.length < 2) return [];
  const normalizedMatchesPerLeg = Math.min(6, Math.max(1, Number.parseInt(String(matchesPerOpponentPerLeg || '').trim(), 10) || 1));

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

  const firstLegRepeated = [];
  for (let cycleIndex = 0; cycleIndex < normalizedMatchesPerLeg; cycleIndex += 1) {
    const roundOffset = cycleIndex * rounds;
    const invertOrientation = cycleIndex % 2 === 1;
    firstLeg.forEach((fixture) => {
      const homeId = invertOrientation ? fixture.awayId : fixture.homeId;
      const awayId = invertOrientation ? fixture.homeId : fixture.awayId;
      const nextRound = fixture.round + roundOffset;
      firstLegRepeated.push({
        ...fixture,
        slotKey: `R${nextRound}M${fixture.match}`,
        round: nextRound,
        leg: 'First',
        homeId,
        awayId
      });
    });
  }

  const secondLegOffset = rounds * normalizedMatchesPerLeg;
  const secondLeg = firstLegRepeated.map((fixture) => ({
    ...fixture,
    slotKey: `R${fixture.round + secondLegOffset}M${fixture.match}`,
    round: fixture.round + secondLegOffset,
    leg: 'Return',
    homeId: fixture.awayId,
    awayId: fixture.homeId
  }));

  return [...firstLegRepeated, ...secondLeg].sort((left, right) => {
    if (left.round === right.round) return left.match - right.match;
    return left.round - right.round;
  });
};

const buildGenerationTeamOrders = (teamIds = [], maxVariants = 120) => {
  const normalized = Array.from(new Set((teamIds || []).filter(Boolean)));
  if (!normalized.length) return [];

  const variants = [];
  const seen = new Set();
  const addVariant = (order) => {
    const normalizedOrder = Array.from(new Set((order || []).filter(Boolean)));
    if (normalizedOrder.length !== normalized.length) return;
    const key = normalizedOrder.join('|');
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(normalizedOrder);
  };

  addVariant(normalized);

  for (let shift = 1; shift < normalized.length && variants.length < maxVariants; shift += 1) {
    const rotated = [...normalized.slice(shift), ...normalized.slice(0, shift)];
    addVariant(rotated);
    if (variants.length >= maxVariants) break;
    addVariant([...rotated].reverse());
  }

  let randomGuard = 0;
  while (variants.length < maxVariants && randomGuard < maxVariants * 8) {
    randomGuard += 1;
    const shuffled = [...normalized];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = shuffled[index];
      shuffled[index] = shuffled[swapIndex];
      shuffled[swapIndex] = current;
    }
    addVariant(shuffled);
  }

  return variants;
};

const hydrateFixtureCreator = (fixtureNode) => {
  if (!(fixtureNode instanceof HTMLElement)) return;

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

  if (fixtureNode.dataset.fixtureHydrated === '1') return;
  fixtureNode.dataset.fixtureHydrated = '1';

  const teamPickInputs = Array.from(fixtureNode.querySelectorAll('[data-fixture-team]'));
  const autoFillToggle = fixtureNode.querySelector('[data-fixture-auto-fill]');
  const rulesPanel = fixtureNode.querySelector('[data-fixture-date-rules]');
  const rulesStatusNode = fixtureNode.querySelector('[data-fixture-rules-status]');
  const ruleStartDateInput = fixtureNode.querySelector('[data-fixture-rule-start-date]');
  const ruleGapDaysInput = fixtureNode.querySelector('[data-fixture-rule-gap-days]');
  const ruleMatchesPerDayInput = fixtureNode.querySelector('[data-fixture-rule-matches-per-day]');
  const ruleKickoffTimeInput = fixtureNode.querySelector('[data-fixture-rule-kickoff-time]');
  const ruleKickoffGapMinutesInput = fixtureNode.querySelector('[data-fixture-rule-kickoff-gap-minutes]');
  const ruleWeekdayInputs = Array.from(fixtureNode.querySelectorAll('[data-fixture-rule-weekday]'));
  const ruleUseTermsInput = fixtureNode.querySelector('[data-fixture-rule-use-terms]');
  const ruleAvoidAcademicInput = fixtureNode.querySelector('[data-fixture-rule-avoid-academic]');
  const ruleExclusionsInput = fixtureNode.querySelector('[data-fixture-rule-exclusions]');
  const rulesPreviewButton = fixtureNode.querySelector('[data-fixture-rules-preview]');
  const rulesSaveButton = fixtureNode.querySelector('[data-fixture-rules-save]');
  const rulesPreviewNode = fixtureNode.querySelector('[data-fixture-rules-preview-output]');
  const sportSelect = fixtureNode.querySelector('[data-fixture-sport]');
  const fairnessOpenButton = fixtureNode.querySelector('[data-fixture-open-fairness-modal]');
  const fairnessSummaryNode = fixtureNode.querySelector('[data-fixture-fairness-summary]');
  const fairnessRulesSelect = fixtureNode.querySelector('[data-fixture-fairness-rules]');
  const fairnessModal = fixtureNode.querySelector('[data-fixture-fairness-modal]');
  const fairnessOptionsNode = fixtureNode.querySelector('[data-fixture-fairness-options]');
  const fairnessRuleCheckboxes = Array.from(fixtureNode.querySelectorAll('[data-fixture-fairness-check]'));
  const fairnessCloseButtons = Array.from(fixtureNode.querySelectorAll('[data-fixture-close-fairness-modal]'));
  const fairnessApplyButton = fixtureNode.querySelector('[data-fixture-apply-fairness-rules]');
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
  const meetingsPerLegInput = fixtureNode.querySelector('[data-fixture-meetings-per-leg]');
  const statusNode = fixtureNode.querySelector('[data-fixture-status]');
  const bodyNode = fixtureNode.querySelector('[data-fixture-body]');
  const generateButton = fixtureNode.querySelector('[data-fixture-generate]');
  const exportButton = fixtureNode.querySelector('[data-fixture-export]');
  const exportCsvButton = fixtureNode.querySelector('[data-fixture-export-csv]');
  const approvalPanelNode = fixtureNode.querySelector('[data-fixture-approval-panel]');
  const approvalStatusNode = fixtureNode.querySelector('[data-fixture-approval-status]');
  const approveResolvedButton = fixtureNode.querySelector('[data-fixture-approve-resolved]');
  const approveAnywayButton = fixtureNode.querySelector('[data-fixture-approve-anyway]');
  const saveDraftButton = fixtureNode.querySelector('[data-fixture-save-draft]');
  const fixtureTemplateSelect = fixtureNode.querySelector('[data-fixture-template-select]');

  if (!bodyNode || !generateButton || !exportButton) return;

  const workflowSteps = initSportsWorkflowSteps(fixtureNode);
  const normalizeText = (value, maxLength = 300) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);

  let lastFixtures = [];
  let lastSportKey = '';
  let lastSportLabel = '';
  let lastFormatLabel = '';
  let lastPreviewDateMap = null;
  let lastPreviewFixtureSignature = '';
  let lastPreviewMatchesPerDay = 1;
  let pendingFixtureApproval = false;
  let approvedWithUnfairness = false;
  let lastRenderedFixtureOrder = [];
  let pinnedFixtureSlotKeys = new Set();
  let currentUnfairnessReport = {
    hasUnfairness: false,
    fixtureReasons: {},
    teamIssues: [],
    affectedFixtureCount: 0
  };

  const fixtureSectionKey = String(config.sectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator';
  const fairnessModalPortalKey = `fixture-fairness-modal:${fixtureSectionKey}`;
  const fixtureDateStorageKey = `bhanoyi.fixtureDates.${fixtureSectionKey}`;
  const fixtureCatalogStorageKey = `bhanoyi.fixtures.${fixtureSectionKey}`;
  const matchLogByFixtureStorageKey = getMatchLogByFixtureStorageKey(fixtureSectionKey);
  const fixtureRulesStorageKey = `bhanoyi.fixtureDateRules.${fixtureSectionKey}`;
  const fixtureCreatorStateStorageKey = `bhanoyi.fixtureCreatorState.${fixtureSectionKey}`;
  const fixtureHistoryStorageKey = `bhanoyi.fixtureHistory.${fixtureSectionKey}`;
  const defaultRulesBucket = 'default';
  const defaultFairnessRuleIds = [
    'equal_matches_season',
    'equal_matches_leg',
    'balanced_home_away',
    'equal_round_participation',
    'unique_opponent_per_leg',
    'no_double_round_booking',
    'fifa_no_self_match'
  ];
  const isAdminMode = new URLSearchParams(window.location.search).get('admin') === '1';
  let fixtureDates = {};
  let fixtureCreatorState = {
    lastSport: '',
    sports: {}
  };
  let fixtureTemplateHistory = [];
  let selectedFixtureTemplateId = '';

  window.addEventListener('bhanoyi:remote-persist-status', (event) => {
    const key = String(event?.detail?.storageKey || '').trim();
    if (
      key !== fixtureCatalogStorageKey &&
      key !== fixtureDateStorageKey &&
      key !== fixtureRulesStorageKey &&
      key !== fixtureCreatorStateStorageKey &&
      key !== fixtureHistoryStorageKey
    ) {
      return;
    }

    const savedRemote = event?.detail?.savedRemote === true;
    if (statusNode instanceof HTMLElement) {
      statusNode.textContent = savedRemote
        ? 'Saved remotely.'
        : 'Saved on this device only. Remote sync unavailable right now.';
    }
  });

  portalOverlayToBody(fairnessModal, fairnessModalPortalKey);

  if (rulesPanel instanceof HTMLElement) {
    rulesPanel.classList.toggle('is-hidden', !isAdminMode);
  }
  if (fairnessRulesSelect instanceof HTMLSelectElement) {
    fairnessRulesSelect.disabled = !isAdminMode;
  }
  if (fairnessOpenButton instanceof HTMLButtonElement) {
    fairnessOpenButton.disabled = false;
  }
  if (autoFillToggle instanceof HTMLInputElement) {
    autoFillToggle.disabled = !isAdminMode;
    autoFillToggle.checked = false;
  }

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

  const loadFixtureCreatorState = () => {
    try {
      const raw = localStorage.getItem(fixtureCreatorStateStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      fixtureCreatorState = {
        lastSport: String(parsed.lastSport || '').trim(),
        sports: parsed.sports && typeof parsed.sports === 'object' ? parsed.sports : {}
      };
    } catch {
      fixtureCreatorState = {
        lastSport: '',
        sports: {}
      };
    }
  };

  const saveFixtureCreatorState = () => {
    try {
      localStorage.setItem(fixtureCreatorStateStorageKey, JSON.stringify(fixtureCreatorState));
      void persistLocalStore(fixtureCreatorStateStorageKey, fixtureCreatorState);
    } catch {
      return;
    }
  };

  const loadFixtureTemplateHistory = () => {
    try {
      const raw = localStorage.getItem(fixtureHistoryStorageKey);
      if (!raw) {
        fixtureTemplateHistory = [];
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        fixtureTemplateHistory = [];
        return;
      }

      fixtureTemplateHistory = parsed
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          id: String(entry.id || '').trim(),
          sportKey: String(entry.sportKey || '').trim(),
          createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
          fixtures: Array.isArray(entry.fixtures) ? entry.fixtures : [],
          fixtureDates:
            entry.fixtureDates && typeof entry.fixtureDates === 'object' && !Array.isArray(entry.fixtureDates)
              ? entry.fixtureDates
              : {}
        }))
        .filter((entry) => entry.id && (entry.sportKey === 'soccer' || entry.sportKey === 'netball'))
        .sort((left, right) => right.createdAt - left.createdAt);
    } catch {
      fixtureTemplateHistory = [];
    }
  };

  const saveFixtureTemplateHistory = () => {
    const payload = fixtureTemplateHistory.slice(0, 60);
    localStorage.setItem(fixtureHistoryStorageKey, JSON.stringify(payload));
    void persistLocalStore(fixtureHistoryStorageKey, payload);
  };

  const normalizeFixtureStoredSportKey = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'soccer' || raw === 'football') return 'soccer';
    if (raw === 'netball') return 'netball';
    return '';
  };

  const fixtureTemplateSignature = (fixtures) =>
    (Array.isArray(fixtures) ? fixtures : [])
      .map((entry) => {
        const round = parsePositiveInt(entry?.round, 1);
        const leg = String(entry?.leg || '').trim();
        const match = parsePositiveInt(entry?.match, 1);
        const homeId = String(entry?.homeId || '').trim();
        const awayId = String(entry?.awayId || '').trim();
        return `${round}:${leg}:${match}:${homeId}:${awayId}`;
      })
      .join('|');

  const renderFixtureTemplateOptions = () => {
    if (!(fixtureTemplateSelect instanceof HTMLSelectElement)) return;
    const activeSport = selectedSportKey();
    const options = fixtureTemplateHistory
      .filter((entry) => !activeSport || entry.sportKey === activeSport)
      .map((entry) => {
        const dateLabel = new Date(entry.createdAt).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const sportLabel = entry.sportKey === 'netball' ? 'Netball' : 'Soccer';
        const fixtureCount = Array.isArray(entry.fixtures) ? entry.fixtures.length : 0;
        return `<option value="${escapeHtmlAttribute(entry.id)}">${escapeHtmlText(`${sportLabel} • ${dateLabel} • ${fixtureCount} fixtures`)}</option>`;
      });

    fixtureTemplateSelect.innerHTML = [
      '<option value="">No template selected</option>',
      ...options
    ].join('');

    const hasSelectedTemplateOption = Array.from(fixtureTemplateSelect.options).some(
      (option) => String(option.value || '').trim() === selectedFixtureTemplateId
    );

    if (selectedFixtureTemplateId && hasSelectedTemplateOption) {
      fixtureTemplateSelect.value = selectedFixtureTemplateId;
    } else {
      selectedFixtureTemplateId = '';
      fixtureTemplateSelect.value = '';
    }
  };

  const addFixtureHistorySnapshot = (sportKey, fixtures) => {
    const normalizedSport = String(sportKey || '').trim();
    if ((normalizedSport !== 'soccer' && normalizedSport !== 'netball') || !Array.isArray(fixtures) || !fixtures.length) {
      return;
    }

    const sanitized = sanitizeStoredFixturesForSport(normalizedSport, fixtures);
    if (!sanitized.length) return;

    const nextSignature = fixtureTemplateSignature(sanitized);
    const nextFixtureDates = getFixtureDateSnapshot(sanitized);
    const latestSameSport = fixtureTemplateHistory.find((entry) => entry.sportKey === normalizedSport);
    if (latestSameSport && fixtureTemplateSignature(latestSameSport.fixtures) === nextSignature) {
      latestSameSport.createdAt = Date.now();
      latestSameSport.fixtures = sanitized;
      latestSameSport.fixtureDates = nextFixtureDates;
      fixtureTemplateHistory = [
        latestSameSport,
        ...fixtureTemplateHistory.filter((entry) => entry !== latestSameSport)
      ].slice(0, 60);
      saveFixtureTemplateHistory();
      renderFixtureTemplateOptions();
      return;
    }

    fixtureTemplateHistory.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sportKey: normalizedSport,
      createdAt: Date.now(),
      fixtures: sanitized,
      fixtureDates: nextFixtureDates
    });
    fixtureTemplateHistory = fixtureTemplateHistory.slice(0, 60);
    saveFixtureTemplateHistory();
    renderFixtureTemplateOptions();
  };

  const dispatchFixtureSyncEvent = () => {
    window.dispatchEvent(
      new CustomEvent('bhanoyi:fixtures-updated', {
        detail: {
          sectionKey: fixtureSectionKey
        }
      })
    );
  };

  const persistFixtureDatesToStorage = () => {
    localStorage.setItem(fixtureDateStorageKey, JSON.stringify(fixtureDates));
    void persistLocalStore(fixtureDateStorageKey, fixtureDates);
    dispatchFixtureSyncEvent();
  };

  const getFixtureId = (fixture) =>
    `${fixtureSectionKey}:${fixture.sportKey}:${fixture.slotKey || `R${fixture.round}M${fixture.match}`}`;

  const getFixtureDateSnapshot = (fixtures, sourceMap = fixtureDates) => {
    const ids = new Set((Array.isArray(fixtures) ? fixtures : []).map((fixture) => getFixtureId(fixture)).filter(Boolean));
    const source = sourceMap && typeof sourceMap === 'object' ? sourceMap : {};

    return Object.fromEntries(
      Object.entries(source)
        .filter(([fixtureId, value]) => ids.has(fixtureId) && Boolean(normalizeFixtureStamp(value)))
        .map(([fixtureId, value]) => [fixtureId, normalizeFixtureStamp(value)])
    );
  };

  const replaceActiveSportFixtureDates = (fixtures, nextSnapshot = {}, { persist = true } = {}) => {
    const activeSportKey = normalizeFixtureStoredSportKey(fixtures?.[0]?.sportKey || selectedSportKey());
    const keptEntries = Object.entries(fixtureDates).filter(([fixtureId]) => {
      if (!fixtureId.startsWith(`${fixtureSectionKey}:`)) return true;
      const fixtureSportKey = normalizeFixtureStoredSportKey(String(fixtureId).split(':')[1] || '');
      return !activeSportKey || fixtureSportKey !== activeSportKey;
    });

    const scopedSnapshot = getFixtureDateSnapshot(fixtures, nextSnapshot);
    fixtureDates = Object.fromEntries([...keptEntries, ...Object.entries(scopedSnapshot)]);

    if (persist) {
      persistFixtureDatesToStorage();
    }

    return scopedSnapshot;
  };

  const autoFillFixtureDatesSilently = (fixtures) => {
    const result = buildAutoFillDateMap(fixtures);
    if (!result.ok) return false;

    fixtureDates = {
      ...fixtureDates,
      ...result.dateMap
    };
    persistFixtureDatesToStorage();
    return true;
  };

  const fixtureSignature = (fixtures) => fixtures.map((fixture) => getFixtureId(fixture)).join('|');

  const fixtureSlotKey = (fixture) => String(fixture?.slotKey || `R${fixture?.round}M${fixture?.match}`).trim();

  const normalizePinnedSlotKeys = (input) =>
    Array.from(
      new Set(
        (Array.isArray(input) ? input : [])
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
      )
    );

  const buildPinnedFixturesBySlot = (fixtures, pinnedSlots, teamIds) => {
    const validTeams = new Set((teamIds || []).filter(Boolean));
    const pinnedSet = new Set(normalizePinnedSlotKeys(Array.from(pinnedSlots || [])));
    const map = {};

    (fixtures || []).forEach((fixture) => {
      const slotKey = fixtureSlotKey(fixture);
      if (!slotKey || !pinnedSet.has(slotKey)) return;
      const homeId = String(fixture.homeId || '').trim();
      const awayId = String(fixture.awayId || '').trim();
      if (!homeId || !awayId || homeId === awayId) return;
      if (!validTeams.has(homeId) || !validTeams.has(awayId)) return;
      map[slotKey] = { homeId, awayId };
    });

    return map;
  };

  const getPinnedFixtureIndexes = (fixtures) =>
    (fixtures || [])
      .map((fixture, index) => ({ slotKey: fixtureSlotKey(fixture), index }))
      .filter(({ slotKey }) => slotKey && pinnedFixtureSlotKeys.has(slotKey))
      .map(({ index }) => index);

  const parsePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  };

  const parseNonNegativeInt = (value, fallback) => {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
  };

  const parseMatchesPerOpponentPerLeg = (value, fallback = 1) => {
    const normalizedFallback = fallback == null ? 1 : fallback;
    const parsed = parsePositiveInt(value, normalizedFallback);
    return Math.min(6, Math.max(1, parsed));
  };

  const configuredMatchesPerOpponentPerLeg = () =>
    parseMatchesPerOpponentPerLeg(
      meetingsPerLegInput instanceof HTMLInputElement ? meetingsPerLegInput.value : '',
      1
    );

  const activeRulesBucket = () => {
    const sportValue = String(sportSelect instanceof HTMLSelectElement ? sportSelect.value : '').trim();
    return sportValue === 'soccer' || sportValue === 'netball' ? sportValue : defaultRulesBucket;
  };

  const loadRulesBundle = () => {
    try {
      const raw = localStorage.getItem(fixtureRulesStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const saveRulesBundle = (bundle) => {
    const safeBundle = bundle && typeof bundle === 'object' ? bundle : {};
    localStorage.setItem(fixtureRulesStorageKey, JSON.stringify(safeBundle));
    void persistLocalStore(fixtureRulesStorageKey, safeBundle);
  };

  const buildDateRulesPayload = (rules) => ({
    startDate: rules.startDate,
    gapDays: rules.gapDays,
    matchesPerDay: rules.matchesPerDay,
    kickoffTime: rules.kickoffTime,
    kickoffGapMinutes: rules.kickoffGapMinutes,
    weekdays: rules.weekdays,
    useTerms: rules.useTerms,
    avoidAcademic: rules.avoidAcademic,
    exclusionRaw: rules.exclusionRaw
  });

  const persistDateRulesForBucket = (bucket, rules) => {
    const normalizedBucket = String(bucket || '').trim() || defaultRulesBucket;
    const bundle = loadRulesBundle();
    bundle[normalizedBucket] = buildDateRulesPayload(rules);
    saveRulesBundle(bundle);
  };

  const normalizeDateOnly = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${parsed.getFullYear()}-${month}-${day}`;
  };

  const normalizeTimeOnly = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/^(\d{2}):(\d{2})/);
    if (!match) return '';
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return '';
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };

  const combineFixtureDateTime = (dateValue, timeValue) => {
    const date = normalizeDateOnly(dateValue);
    if (!date) return '';
    const time = normalizeTimeOnly(timeValue);
    return time ? `${date}T${time}` : date;
  };

  const normalizeFixtureStamp = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const datePart = normalizeDateOnly(raw);
    if (!datePart) return '';
    const timePart = normalizeTimeOnly(raw.includes('T') ? raw.split('T')[1] : raw);
    return timePart ? `${datePart}T${timePart}` : datePart;
  };

  const splitFixtureStamp = (value) => {
    const normalized = normalizeFixtureStamp(value);
    if (!normalized) return { date: '', time: '' };
    const [datePart, timePart] = normalized.split('T');
    return { date: datePart || '', time: normalizeTimeOnly(timePart || '') };
  };

  const addMinutesToTime = (timeValue, minutesToAdd) => {
    const base = normalizeTimeOnly(timeValue);
    if (!base) return '';
    const [hours, minutes] = base.split(':').map((entry) => Number.parseInt(entry, 10));
    const total = (((hours * 60 + minutes + minutesToAdd) % (24 * 60)) + (24 * 60)) % (24 * 60);
    const nextHours = Math.floor(total / 60);
    const nextMinutes = total % 60;
    return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
  };

  const toEpochDay = (dateString) => {
    const normalized = normalizeDateOnly(dateString);
    if (!normalized) return Number.NaN;
    return new Date(`${normalized}T00:00:00`).getTime();
  };

  const addDays = (dateString, days) => {
    const normalized = normalizeDateOnly(dateString);
    if (!normalized) return '';
    const date = new Date(`${normalized}T00:00:00`);
    date.setDate(date.getDate() + days);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  };

  const loadTermsFromStorage = () => {
    const termKeys = Object.keys(localStorage).filter((key) => key.startsWith('bhanoyi.schoolTerms.'));
    const ranges = [];

    termKeys.forEach((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        parsed.forEach((term) => {
          const start = normalizeDateOnly(term?.start);
          const end = normalizeDateOnly(term?.end);
          if (!start || !end) return;
          const startDay = toEpochDay(start);
          const endDay = toEpochDay(end);
          if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || endDay < startDay) return;
          ranges.push({ start, end });
        });
      } catch {
        return;
      }
    });

    return ranges;
  };

  const loadAcademicDatesFromCalendar = () => {
    const eventKeys = Object.keys(localStorage).filter((key) => key.startsWith('bhanoyi.schoolCalendarEvents.'));
    const academicDates = new Set();

    eventKeys.forEach((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        parsed.forEach((entry) => {
          const eventType = String(entry?.eventType || '').trim().toLowerCase();
          if (eventType !== 'academic') return;
          const start = normalizeDateOnly(entry?.start);
          const endRaw = normalizeDateOnly(entry?.end);
          if (!start) return;
          if (!endRaw) {
            academicDates.add(start);
            return;
          }
          let cursor = start;
          const endEpoch = toEpochDay(endRaw);
          let guard = 0;
          while (toEpochDay(cursor) <= endEpoch && guard < 400) {
            academicDates.add(cursor);
            cursor = addDays(cursor, 1);
            guard += 1;
          }
        });
      } catch {
        return;
      }
    });

    return academicDates;
  };

  const parseExclusionRanges = (text) => {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const ranges = [];
    for (const line of lines) {
      const matched = line.match(/^(\d{4}-\d{2}-\d{2})(?:\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2}))?$/i);
      if (!matched) {
        return { ok: false, message: `Invalid exclusion line: "${line}"` };
      }
      const start = normalizeDateOnly(matched[1]);
      const end = normalizeDateOnly(matched[2] || matched[1]);
      if (!start || !end) {
        return { ok: false, message: `Invalid exclusion date: "${line}"` };
      }
      if (toEpochDay(end) < toEpochDay(start)) {
        return { ok: false, message: `Exclusion end is before start: "${line}"` };
      }
      ranges.push({ start, end });
    }

    return { ok: true, ranges };
  };

  const collectDateRules = () => {
    const startDate = normalizeDateOnly(ruleStartDateInput instanceof HTMLInputElement ? ruleStartDateInput.value : '');
    const gapDays = parsePositiveInt(ruleGapDaysInput instanceof HTMLInputElement ? ruleGapDaysInput.value : '', 7);
    const matchesPerDay = parsePositiveInt(
      ruleMatchesPerDayInput instanceof HTMLInputElement ? ruleMatchesPerDayInput.value : '',
      1
    );
    const kickoffTime = normalizeTimeOnly(
      ruleKickoffTimeInput instanceof HTMLInputElement ? ruleKickoffTimeInput.value : '14:00'
    );
    const kickoffGapMinutes = parsePositiveInt(
      ruleKickoffGapMinutesInput instanceof HTMLInputElement ? ruleKickoffGapMinutesInput.value : '',
      120
    );
    const weekdays = ruleWeekdayInputs
      .filter((input) => input instanceof HTMLInputElement && input.checked)
      .map((input) => Number.parseInt(String(input.value || '').trim(), 10))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    const useTerms = ruleUseTermsInput instanceof HTMLInputElement ? ruleUseTermsInput.checked : true;
    const avoidAcademic = ruleAvoidAcademicInput instanceof HTMLInputElement ? ruleAvoidAcademicInput.checked : true;
    const exclusionRaw = ruleExclusionsInput instanceof HTMLTextAreaElement ? ruleExclusionsInput.value : '';

    const parsedExclusions = parseExclusionRanges(exclusionRaw);
    if (!parsedExclusions.ok) {
      return { ok: false, message: parsedExclusions.message };
    }

    if (!startDate) {
      return { ok: false, message: 'Set a start date for auto-fill rules.' };
    }

    if (!weekdays.length) {
      return { ok: false, message: 'Select at least one allowed weekday for auto-fill.' };
    }

    const terms = loadTermsFromStorage();
    if (useTerms && !terms.length) {
      return { ok: false, message: 'No school terms found. Configure terms in Calendar before auto-fill.' };
    }

    return {
      ok: true,
      rules: {
        startDate,
        gapDays,
        matchesPerDay,
        kickoffTime,
        kickoffGapMinutes,
        weekdays,
        useTerms,
        avoidAcademic,
        exclusionRaw,
        exclusions: parsedExclusions.ranges,
        terms,
        academicDates: avoidAcademic ? loadAcademicDatesFromCalendar() : new Set()
      }
    };
  };

  const saveDateRules = () => {
    const collected = collectDateRules();
    if (!collected.ok) {
      if (rulesStatusNode) rulesStatusNode.textContent = collected.message;
      return false;
    }

    persistDateRulesForBucket(activeRulesBucket(), collected.rules);
    if (rulesStatusNode) rulesStatusNode.textContent = 'Date rules saved.';
    return true;
  };

  const hydrateDateRules = (bucket = activeRulesBucket()) => {
    try {
      const bundle = loadRulesBundle();
      const normalizedBucket = String(bucket || '').trim() || defaultRulesBucket;
      const parsed = bundle[normalizedBucket] || bundle[defaultRulesBucket];
      if (!parsed || typeof parsed !== 'object') return;

      if (ruleStartDateInput instanceof HTMLInputElement) {
        ruleStartDateInput.value = normalizeDateOnly(parsed.startDate || '');
      }
      if (ruleGapDaysInput instanceof HTMLInputElement) {
        ruleGapDaysInput.value = String(parsePositiveInt(parsed.gapDays, 7));
      }
      if (ruleMatchesPerDayInput instanceof HTMLInputElement) {
        ruleMatchesPerDayInput.value = String(parsePositiveInt(parsed.matchesPerDay, 1));
      }
      if (ruleKickoffTimeInput instanceof HTMLInputElement) {
        ruleKickoffTimeInput.value = normalizeTimeOnly(parsed.kickoffTime || '14:00') || '14:00';
      }
      if (ruleKickoffGapMinutesInput instanceof HTMLInputElement) {
        ruleKickoffGapMinutesInput.value = String(parsePositiveInt(parsed.kickoffGapMinutes, 120));
      }
      if (ruleUseTermsInput instanceof HTMLInputElement) {
        ruleUseTermsInput.checked = parsed.useTerms !== false;
      }
      if (ruleAvoidAcademicInput instanceof HTMLInputElement) {
        ruleAvoidAcademicInput.checked = parsed.avoidAcademic !== false;
      }
      if (ruleExclusionsInput instanceof HTMLTextAreaElement) {
        ruleExclusionsInput.value = String(parsed.exclusionRaw || '').trim();
      }

      const savedWeekdays = Array.isArray(parsed.weekdays)
        ? parsed.weekdays
            .map((entry) => Number.parseInt(String(entry || '').trim(), 10))
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [];

      ruleWeekdayInputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        const day = Number.parseInt(String(input.value || '').trim(), 10);
        input.checked = savedWeekdays.includes(day);
      });
    } catch {
      return;
    }
  };

  const isWithinAnyRange = (dateString, ranges) => {
    const day = toEpochDay(dateString);
    if (!Number.isFinite(day)) return false;
    return ranges.some((range) => {
      const start = toEpochDay(range.start);
      const end = toEpochDay(range.end);
      return Number.isFinite(start) && Number.isFinite(end) && day >= start && day <= end;
    });
  };

  const isDateAllowedByRules = (dateString, rules) => {
    const normalized = normalizeDateOnly(dateString);
    if (!normalized) return false;
    const date = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;

    if (!rules.weekdays.includes(date.getDay())) return false;
    if (rules.useTerms && !isWithinAnyRange(normalized, rules.terms)) return false;
    if (rules.avoidAcademic && rules.academicDates.has(normalized)) return false;
    if (rules.exclusions.length && isWithinAnyRange(normalized, rules.exclusions)) return false;
    return true;
  };

  const buildAutoFillDateMap = (inputFixtures) => {
    const collected = collectDateRules();
    if (!collected.ok) {
      return { ok: false, message: collected.message };
    }

    persistDateRulesForBucket(activeRulesBucket(), collected.rules);

    const rules = collected.rules;
    let cursor = rules.startDate;
    const nextDates = {};

    const matchesPerDay = Math.max(1, rules.matchesPerDay);
    const allTeams = Array.from(
      new Set(
        inputFixtures
          .flatMap((fixture) => [String(fixture.homeId || '').trim(), String(fixture.awayId || '').trim()])
          .filter(Boolean)
      )
    );

    const teamPlayCount = Object.fromEntries(allTeams.map((teamId) => [teamId, 0]));
    const teamIdleStreak = Object.fromEntries(allTeams.map((teamId) => [teamId, 0]));
    const teamFirstSlotCount = Object.fromEntries(allTeams.map((teamId) => [teamId, 0]));
    const pendingPriorityTeams = new Set();
    const remainingFixtures = inputFixtures.map((fixture) => ({ ...fixture }));

    const teamHasRemainingFixture = (teamId) =>
      remainingFixtures.some((fixture) => fixture.homeId === teamId || fixture.awayId === teamId);

    const fixtureIncludesAnyTeam = (fixture, teamSet) =>
      teamSet.has(String(fixture.homeId || '').trim()) || teamSet.has(String(fixture.awayId || '').trim());

    const takeDailyFixtureSet = () => {
      const selected = [];
      const selectedTeams = new Set();

      const sortedRemaining = [...remainingFixtures].sort((left, right) => {
        const leftRound = parsePositiveInt(left?.round, 1);
        const rightRound = parsePositiveInt(right?.round, 1);
        if (leftRound !== rightRound) return leftRound - rightRound;
        const leftMatch = parsePositiveInt(left?.match, 1);
        const rightMatch = parsePositiveInt(right?.match, 1);
        return leftMatch - rightMatch;
      });
      const earliestRound = sortedRemaining.length ? parsePositiveInt(sortedRemaining[0]?.round, 1) : null;

      const fixturesForEarliestRound =
        earliestRound === null
          ? []
          : sortedRemaining.filter((fixture) => parsePositiveInt(fixture?.round, 1) === earliestRound);

      const pickBestFixture = (candidates, { preferPriorityTeams, isFirstSlot }) => {
        let best = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        candidates.forEach((fixture, index) => {
          const homeId = String(fixture.homeId || '').trim();
          const awayId = String(fixture.awayId || '').trim();

          const idleScore = (teamIdleStreak[homeId] || 0) + (teamIdleStreak[awayId] || 0);
          const playCountScore = -((teamPlayCount[homeId] || 0) + (teamPlayCount[awayId] || 0));
          const priorityScore =
            preferPriorityTeams && (pendingPriorityTeams.has(homeId) || pendingPriorityTeams.has(awayId)) ? 25 : 0;
          const firstSlotPenalty = isFirstSlot ? -((teamFirstSlotCount[homeId] || 0) + (teamFirstSlotCount[awayId] || 0)) : 0;
          const stableJitter = (Number.parseInt(String(fixture.round || 0), 10) * 7 + Number.parseInt(String(fixture.match || 0), 10) * 13 + index) % 3;

          const score = idleScore * 20 + playCountScore * 8 + priorityScore + firstSlotPenalty + stableJitter;
          if (score > bestScore) {
            best = fixture;
            bestScore = score;
          }
        });

        return best;
      };

      while (selected.length < matchesPerDay) {
        const currentPool = fixturesForEarliestRound.length ? fixturesForEarliestRound : sortedRemaining;
        const nonConflicting = currentPool.filter((fixture) => {
          const homeId = String(fixture.homeId || '').trim();
          const awayId = String(fixture.awayId || '').trim();
          if (!homeId || !awayId || homeId === awayId) return false;
          if (selectedTeams.has(homeId) || selectedTeams.has(awayId)) return false;
          return true;
        });

        if (!nonConflicting.length) break;

        const mustPlayCandidates = nonConflicting.filter((fixture) => fixtureIncludesAnyTeam(fixture, pendingPriorityTeams));
        const candidatePool = mustPlayCandidates.length ? mustPlayCandidates : nonConflicting;
        const picked = pickBestFixture(candidatePool, {
          preferPriorityTeams: mustPlayCandidates.length > 0,
          isFirstSlot: selected.length === 0
        });

        if (!picked) break;

        selected.push(picked);
        selectedTeams.add(String(picked.homeId || '').trim());
        selectedTeams.add(String(picked.awayId || '').trim());
      }

      return selected;
    };

    let dateGuard = 0;
    while (remainingFixtures.length && dateGuard < 4000) {
      let probe = cursor;
      let guard = 0;
      while (guard < 2000 && !isDateAllowedByRules(probe, rules)) {
        probe = addDays(probe, 1);
        guard += 1;
      }

      if (guard >= 2000 || !probe) {
        return {
          ok: false,
          message: 'Could not find enough valid dates for all fixtures with the current rules.'
        };
      }

      const dailyFixtures = takeDailyFixtureSet();
      if (!dailyFixtures.length) {
        cursor = addDays(probe, 1);
        dateGuard += 1;
        continue;
      }

      if (dailyFixtures[0]) {
        const firstHome = String(dailyFixtures[0].homeId || '').trim();
        const firstAway = String(dailyFixtures[0].awayId || '').trim();
        if (firstHome) teamFirstSlotCount[firstHome] = (teamFirstSlotCount[firstHome] || 0) + 1;
        if (firstAway) teamFirstSlotCount[firstAway] = (teamFirstSlotCount[firstAway] || 0) + 1;
      }

      const playedToday = new Set();

      const orderedDailyFixtures = [...dailyFixtures].sort((left, right) => {
        const leftRound = parsePositiveInt(left?.round, 1);
        const rightRound = parsePositiveInt(right?.round, 1);
        if (leftRound !== rightRound) return leftRound - rightRound;
        const leftMatch = parsePositiveInt(left?.match, 1);
        const rightMatch = parsePositiveInt(right?.match, 1);
        return leftMatch - rightMatch;
      });

      orderedDailyFixtures.forEach((fixture, slotIndex) => {
        const fixtureId = getFixtureId(fixture);
        const slotTime = rules.kickoffTime
          ? addMinutesToTime(rules.kickoffTime, slotIndex * Math.max(1, rules.kickoffGapMinutes))
          : '';
        nextDates[fixtureId] = combineFixtureDateTime(probe, slotTime);

        const homeId = String(fixture.homeId || '').trim();
        const awayId = String(fixture.awayId || '').trim();
        if (homeId) {
          playedToday.add(homeId);
          teamPlayCount[homeId] = (teamPlayCount[homeId] || 0) + 1;
          teamIdleStreak[homeId] = 0;
          pendingPriorityTeams.delete(homeId);
        }
        if (awayId) {
          playedToday.add(awayId);
          teamPlayCount[awayId] = (teamPlayCount[awayId] || 0) + 1;
          teamIdleStreak[awayId] = 0;
          pendingPriorityTeams.delete(awayId);
        }
      });

      allTeams.forEach((teamId) => {
        if (playedToday.has(teamId)) return;
        if (!teamHasRemainingFixture(teamId)) {
          pendingPriorityTeams.delete(teamId);
          return;
        }
        teamIdleStreak[teamId] = (teamIdleStreak[teamId] || 0) + 1;
        pendingPriorityTeams.add(teamId);
      });

      const assignedIds = new Set(dailyFixtures.map((fixture) => getFixtureId(fixture)));
      for (let index = remainingFixtures.length - 1; index >= 0; index -= 1) {
        const fixtureId = getFixtureId(remainingFixtures[index]);
        if (assignedIds.has(fixtureId)) {
          remainingFixtures.splice(index, 1);
        }
      }

      cursor = addDays(probe, Math.max(1, rules.gapDays));
      dateGuard += 1;
    }

    if (remainingFixtures.length) {
      return {
        ok: false,
        message: 'Could not assign dates fairly for all fixtures with the current rules. Try reducing matches per day or relaxing date constraints.'
      };
    }

    return {
      ok: true,
      dateMap: nextDates,
      matchesPerDay
    };
  };

  const renderAutoFillPreview = (inputFixtures, dateMap, matchesPerDay = 1) => {
    if (!(rulesPreviewNode instanceof HTMLElement)) return;
    lastPreviewDateMap = { ...dateMap };
    lastPreviewFixtureSignature = fixtureSignature(inputFixtures);
    lastPreviewMatchesPerDay = Math.max(1, parsePositiveInt(matchesPerDay, 1));

    const rows = inputFixtures
      .map((fixture) => {
        const fixtureId = getFixtureId(fixture);
        const date = String(dateMap[fixtureId] || '').trim();
        const matchup = `${teamNameById(fixture.homeId)} vs ${teamNameById(fixture.awayId)}`;
        return `<tr><td>R${fixture.round}M${fixture.match}</td><td>${escapeHtmlText(matchup)}</td><td>${escapeHtmlText(date)}</td></tr>`;
      })
      .join('');

    rulesPreviewNode.innerHTML = `
      <p class="fixture-creator-status">Preview only: dates are not saved until auto-fill is applied.</p>
      <div class="fixture-table-wrap">
        <table class="fixture-table">
          <thead>
            <tr>
              <th>Match</th>
              <th>Fixture</th>
              <th>Candidate Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="fixture-rules-preview-actions">
        <button type="button" class="btn btn-primary" data-fixture-rules-apply-preview>Apply previewed dates</button>
      </div>
    `;
    rulesPreviewNode.classList.remove('is-hidden');
  };

  const buildAutoFillPreview = () => {
    if (!lastFixtures.length) {
      if (rulesStatusNode) {
        rulesStatusNode.textContent = 'Generate fixtures first, then preview candidate dates.';
      }
      return;
    }

    const result = buildAutoFillDateMap(lastFixtures);
    if (!result.ok) {
      if (rulesStatusNode) rulesStatusNode.textContent = result.message;
      return;
    }

    renderAutoFillPreview(lastFixtures, result.dateMap, result.matchesPerDay);
    workflowSteps?.expandStep('rules-fixtures');
    if (rulesStatusNode) {
      rulesStatusNode.textContent = `Candidate dates previewed (${result.matchesPerDay} ${result.matchesPerDay === 1 ? 'match' : 'matches'} per day). Click "Apply previewed dates" to stage them in draft.`;
    }
  };

  const autoFillFixtureDates = (fixtures) => {
    const result = buildAutoFillDateMap(fixtures);
    if (!result.ok) {
      if (statusNode) statusNode.textContent = result.message;
      if (rulesStatusNode) rulesStatusNode.textContent = result.message;
      return false;
    }

    fixtureDates = {
      ...fixtureDates,
      ...result.dateMap
    };

    persistFixtureDatesToStorage();

    if (statusNode) {
      statusNode.textContent = `Fixtures updated live: ${fixtures.length} dates auto-filled (${result.matchesPerDay} ${result.matchesPerDay === 1 ? 'match' : 'matches'} per day).`;
    }
    if (rulesStatusNode) {
      rulesStatusNode.textContent = `Auto-fill completed with current date rules (${result.matchesPerDay} ${result.matchesPerDay === 1 ? 'match' : 'matches'} per day). Calendar events refreshed.`;
    }
    renderAutoFillPreview(fixtures, result.dateMap, result.matchesPerDay);
    workflowSteps?.expandStep('review-fixtures');
    return true;
  };

  const applyPreviewedDates = () => {
    if (!lastPreviewDateMap || !lastPreviewFixtureSignature) {
      if (rulesStatusNode) {
        rulesStatusNode.textContent = 'No preview is available. Click Preview candidate dates first.';
      }
      return;
    }

    const currentSignature = fixtureSignature(lastFixtures);
    if (currentSignature !== lastPreviewFixtureSignature) {
      if (rulesStatusNode) {
        rulesStatusNode.textContent = 'Fixtures changed after preview. Please preview again before applying.';
      }
      return;
    }

    fixtureDates = {
      ...fixtureDates,
      ...lastPreviewDateMap
    };

    persistFixtureDatesToStorage();

    if (statusNode) {
      statusNode.textContent = `Applied previewed dates to ${lastFixtures.length} fixtures (${lastPreviewMatchesPerDay} ${lastPreviewMatchesPerDay === 1 ? 'match' : 'matches'} per day).`;
    }
    if (rulesStatusNode) {
      rulesStatusNode.textContent = `Previewed dates applied (${lastPreviewMatchesPerDay} ${lastPreviewMatchesPerDay === 1 ? 'match' : 'matches'} per day). Calendar events refreshed.`;
    }
    renderFixtures(lastFixtures);
    workflowSteps?.expandStep('review-fixtures');
  };

  const sportProfiles = {
    soccer: {
      label: 'Soccer',
      readSetup: () => {
        const halves = 2;
        const matchesPerOpponentPerLeg = configuredMatchesPerOpponentPerLeg();
        const minutesPerHalf = parsePositiveInt(
          soccerHalfMinutesInput instanceof HTMLInputElement ? soccerHalfMinutesInput.value : '',
          40
        );
        const breakMinutes = parseNonNegativeInt(
          soccerBreakMinutesInput instanceof HTMLInputElement ? soccerBreakMinutesInput.value : '',
          10
        );
        return {
          halves,
          matchesPerOpponentPerLeg,
          minutesPerHalf,
          breakMinutes,
          formatLabel: `${halves} x ${minutesPerHalf} min (${breakMinutes === 0 ? 'no break' : `break ${breakMinutes} min`}) · ${matchesPerOpponentPerLeg}x per opponent per leg`
        };
      }
    },
    netball: {
      label: 'Netball',
      readSetup: () => {
        const quarters = 4;
        const matchesPerOpponentPerLeg = configuredMatchesPerOpponentPerLeg();
        const minutesPerQuarter = parsePositiveInt(
          netballQuarterMinutesInput instanceof HTMLInputElement ? netballQuarterMinutesInput.value : '',
          15
        );
        const breakMinutes = parseNonNegativeInt(
          netballBreakMinutesInput instanceof HTMLInputElement ? netballBreakMinutesInput.value : '',
          3
        );
        const halfTimeMinutes = parseNonNegativeInt(
          netballHalfTimeMinutesInput instanceof HTMLInputElement ? netballHalfTimeMinutesInput.value : '',
          5
        );
        return {
          quarters,
          matchesPerOpponentPerLeg,
          minutesPerQuarter,
          breakMinutes,
          halfTimeMinutes,
          formatLabel: `${quarters} x ${minutesPerQuarter} min (${breakMinutes === 0 ? 'no break' : `break ${breakMinutes} min`}, ${halfTimeMinutes === 0 ? 'no half-time' : `half-time ${halfTimeMinutes} min`}) · ${matchesPerOpponentPerLeg}x per opponent per leg`
        };
      }
    }
  };

  const selectedSportKey = () => {
    const value = sportSelect instanceof HTMLSelectElement ? sportSelect.value : '';
    return value === 'soccer' || value === 'netball' ? value : '';
  };

  const selectedFairnessRuleIds = () => {
    if (!(fairnessRulesSelect instanceof HTMLSelectElement)) {
      return [...defaultFairnessRuleIds];
    }

    const selected = Array.from(fairnessRulesSelect.selectedOptions)
      .map((option) => String(option.value || '').trim())
      .filter(Boolean);

    return Array.from(new Set(selected));
  };

  const fairnessRuleLabelById = (ruleId) => {
    if (!(fairnessRulesSelect instanceof HTMLSelectElement)) return String(ruleId || '').trim();
    const match = Array.from(fairnessRulesSelect.options).find(
      (option) => String(option.value || '').trim() === String(ruleId || '').trim()
    );
    return match ? normalizeText(match.textContent || match.label || match.value, 160) : String(ruleId || '').trim();
  };

  const fairnessModalSubtitleNode = fairnessModal instanceof HTMLElement
    ? fairnessModal.querySelector('[data-fixture-fairness-subtitle]')
    : null;

  const selectedTeamIdsForFairnessChecks = () => {
    const selected = Array.from(new Set(selectedTeamIds()));
    if (selected.length) return selected;
    return Array.from(new Set((lastFixtures || []).flatMap((entry) => [entry.homeId, entry.awayId]).filter(Boolean)));
  };

  const evaluateFairnessRuleCompatibility = (ruleIds = []) => {
    const normalizedRuleIds = Array.from(
      new Set(
        (Array.isArray(ruleIds) ? ruleIds : [])
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
      )
    );

    const teamIds = selectedTeamIdsForFairnessChecks();
    if (teamIds.length < 2) {
      return {
        ok: true,
        reason: 'Select at least two teams to evaluate rule compatibility.'
      };
    }

    const profile = selectedSportProfile();
    if (!profile) {
      return {
        ok: true,
        reason: 'Choose a sport to evaluate fairness rule compatibility.'
      };
    }

    const setup = profile.readSetup();
    const matchesPerOpponentPerLeg = parseMatchesPerOpponentPerLeg(setup.matchesPerOpponentPerLeg, 1);
    const formatLabel = String(setup?.formatLabel || '').trim();
    const generationOrders = buildGenerationTeamOrders(teamIds, 40);
    const pinnedBySlot = buildPinnedFixturesBySlot(lastFixtures, pinnedFixtureSlotKeys, teamIds);
    let lastFailureReason = '';

    const hasFeasibleCandidate = generationOrders.some((teamOrder) => {
      const candidateFixtures = buildSingleRoundRobin(teamOrder, matchesPerOpponentPerLeg).map((fixture) => ({
        ...fixture,
        sportKey: profile.key,
        sportLabel: profile.label,
        formatLabel
      }));

      const pinnedIndexes = [];
      const constrainedFixtures = candidateFixtures.map((fixture, index) => {
        const slotKey = fixtureSlotKey(fixture);
        const pinned = pinnedBySlot[slotKey];
        if (!pinned) return fixture;
        pinnedIndexes.push(index);
        return {
          ...fixture,
          homeId: pinned.homeId,
          awayId: pinned.awayId
        };
      });

      const repairResult = repairRoundRobinFixtureSet({
        fixtures: constrainedFixtures,
        teamIds: teamOrder,
        lockedIndexes: pinnedIndexes,
        matchesPerOpponentPerLeg
      });
      if (!repairResult.ok) {
        lastFailureReason = repairResult.message;
        return false;
      }

      const fairnessResult = enforceSelectedFairnessRules({
        fixtures: repairResult.fixtures,
        teamIds: teamOrder,
        selectedRuleIds: normalizedRuleIds,
        lockedIndexes: pinnedIndexes
      });
      if (!fairnessResult.ok) {
        lastFailureReason = fairnessResult.message;
        return false;
      }

      return true;
    });

    return {
      ok: hasFeasibleCandidate,
      reason: normalizeText(
        hasFeasibleCandidate
          ? ''
          : (lastFailureReason || 'This rule conflicts with current pinned/manual constraints for all tested team orders.'),
        220
      )
    };
  };

  const selectedFairnessRuleIdsFromModal = () =>
    fairnessRuleCheckboxes
      .filter((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked)
      .map((checkbox) => String(checkbox.value || '').trim())
      .filter(Boolean);

  const refreshFairnessRuleCompatibilityUi = () => {
    if (!fairnessRuleCheckboxes.length) return;

    const modalSelectedRuleIds = selectedFairnessRuleIdsFromModal();
    const selectedSet = new Set(modalSelectedRuleIds);
    const selectedCompatibility = evaluateFairnessRuleCompatibility(modalSelectedRuleIds);

    fairnessRuleCheckboxes.forEach((checkbox) => {
      if (!(checkbox instanceof HTMLInputElement)) return;
      const ruleId = String(checkbox.value || '').trim();
      const optionNode = checkbox.closest('.fixture-fairness-option');
      if (!(optionNode instanceof HTMLElement)) return;

      const clearIncompatibility = () => {
        checkbox.disabled = false;
        optionNode.classList.remove('is-disabled');
        optionNode.removeAttribute('title');
      };

      if (!ruleId || selectedSet.has(ruleId)) {
        clearIncompatibility();
        return;
      }

      const candidateRuleIds = [...selectedSet, ruleId];
      const compatibility = evaluateFairnessRuleCompatibility(candidateRuleIds);
      if (compatibility.ok) {
        clearIncompatibility();
        return;
      }

      const reason = compatibility.reason || 'This rule conflicts with current selected rules and pinned/manual constraints.';
      checkbox.disabled = true;
      optionNode.classList.add('is-disabled');
      optionNode.setAttribute('title', reason);
    });

    if (!(fairnessModalSubtitleNode instanceof HTMLElement)) return;
    if (!modalSelectedRuleIds.length) {
      fairnessModalSubtitleNode.textContent =
        'No rules selected. Fixtures can be generated without fairness checks.';
      return;
    }

    fairnessModalSubtitleNode.textContent = selectedCompatibility.ok
      ? `Selected ${modalSelectedRuleIds.length} rule${modalSelectedRuleIds.length === 1 ? '' : 's'}. Incompatible options are disabled automatically.`
      : `Current selected rules conflict with existing constraints: ${selectedCompatibility.reason || 'Unable to satisfy all selected fairness rules.'}`;
  };

  const refreshFairnessSummary = () => {
    if (!(fairnessSummaryNode instanceof HTMLElement)) return;
    const labels = selectedFairnessRuleIds()
      .map((ruleId) => fairnessRuleLabelById(ruleId))
      .map((label) => normalizeText(label, 160))
      .filter(Boolean);

    if (!labels.length) {
      fairnessSummaryNode.textContent = 'No fairness rules selected.';
      return;
    }

    fairnessSummaryNode.textContent = `Selected fairness rules (${labels.length}): ${labels.join(', ')}`;
  };

  const syncFairnessCheckboxesFromState = () => {
    if (!fairnessRuleCheckboxes.length) return;
    const selected = new Set(selectedFairnessRuleIds());
    fairnessRuleCheckboxes.forEach((checkbox) => {
      if (!(checkbox instanceof HTMLInputElement)) return;
      const ruleId = String(checkbox.value || '').trim();
      checkbox.checked = ruleId ? selected.has(ruleId) : false;
    });
    refreshFairnessRuleCompatibilityUi();
  };

  const renderFairnessDropdownOptions = () => {
    if (!(fairnessOptionsNode instanceof HTMLElement) || !(fairnessRulesSelect instanceof HTMLSelectElement)) return;
    const ruleItems = Array.from(fairnessRulesSelect.options)
      .map((option, index) => {
        const optionLabel = normalizeText(option.textContent || option.label || option.value, 200);
        return `<li class="fixture-fairness-list-item">${escapeHtmlText(optionLabel || `Rule ${index + 1}`)}</li>`;
      })
      .join('');

    fairnessOptionsNode.innerHTML = `<ul class="fixture-fairness-list">${ruleItems}</ul>`;
  };

  const setSelectedFairnessRuleIds = (ruleIds = []) => {
    if (!(fairnessRulesSelect instanceof HTMLSelectElement)) return;
    const requested = new Set(
      (Array.isArray(ruleIds) ? ruleIds : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    );

    Array.from(fairnessRulesSelect.options).forEach((option) => {
      option.selected = requested.has(String(option.value || '').trim());
    });

    refreshFairnessSummary();
    syncFairnessCheckboxesFromState();
  };

  const setSelectedTeamIds = (teamIds) => {
    const allowed = new Set((teamIds || []).filter((teamId) => houseOptions.some((team) => team.id === teamId)));
    teamPickInputs.forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.checked = allowed.has(input.value);
    });
  };

  const readSportSetupValues = (sportKey) => {
    const matchesPerOpponentPerLeg = configuredMatchesPerOpponentPerLeg();
    if (sportKey === 'soccer') {
      return {
        matchesPerOpponentPerLeg,
        halfMinutes: parsePositiveInt(
          soccerHalfMinutesInput instanceof HTMLInputElement ? soccerHalfMinutesInput.value : '',
          40
        ),
        breakMinutes: parseNonNegativeInt(
          soccerBreakMinutesInput instanceof HTMLInputElement ? soccerBreakMinutesInput.value : '',
          10
        )
      };
    }

    if (sportKey === 'netball') {
      return {
        matchesPerOpponentPerLeg,
        quarterMinutes: parsePositiveInt(
          netballQuarterMinutesInput instanceof HTMLInputElement ? netballQuarterMinutesInput.value : '',
          15
        ),
        breakMinutes: parseNonNegativeInt(
          netballBreakMinutesInput instanceof HTMLInputElement ? netballBreakMinutesInput.value : '',
          3
        ),
        halfTimeMinutes: parseNonNegativeInt(
          netballHalfTimeMinutesInput instanceof HTMLInputElement ? netballHalfTimeMinutesInput.value : '',
          5
        )
      };
    }

    return {};
  };

  const applySportSetupValues = (sportKey, setup = {}) => {
    if (meetingsPerLegInput instanceof HTMLInputElement) {
      meetingsPerLegInput.value = String(parseMatchesPerOpponentPerLeg(setup.matchesPerOpponentPerLeg, 1));
    }

    if (sportKey === 'soccer') {
      if (soccerHalfMinutesInput instanceof HTMLInputElement) {
        soccerHalfMinutesInput.value = String(parsePositiveInt(setup.halfMinutes, 40));
      }
      if (soccerBreakMinutesInput instanceof HTMLInputElement) {
        soccerBreakMinutesInput.value = String(parseNonNegativeInt(setup.breakMinutes, 10));
      }
      return;
    }

    if (sportKey === 'netball') {
      if (netballQuarterMinutesInput instanceof HTMLInputElement) {
        netballQuarterMinutesInput.value = String(parsePositiveInt(setup.quarterMinutes, 15));
      }
      if (netballBreakMinutesInput instanceof HTMLInputElement) {
        netballBreakMinutesInput.value = String(parseNonNegativeInt(setup.breakMinutes, 3));
      }
      if (netballHalfTimeMinutesInput instanceof HTMLInputElement) {
        netballHalfTimeMinutesInput.value = String(parseNonNegativeInt(setup.halfTimeMinutes, 5));
      }
    }
  };

  const sanitizeStoredFixturesForSport = (sportKey, fixtures) => {
    if (!Array.isArray(fixtures)) return [];
    return fixtures
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        slotKey: String(entry.slotKey || '').trim() || `R${entry.round}M${entry.match}`,
        round: parsePositiveInt(entry.round, 1),
        leg: String(entry.leg || '').trim() || 'First',
        match: parsePositiveInt(entry.match, 1),
        homeId: String(entry.homeId || '').trim(),
        awayId: String(entry.awayId || '').trim(),
        sportKey,
        sportLabel: String(entry.sportLabel || '').trim(),
        formatLabel: String(entry.formatLabel || '').trim()
      }))
      .filter((entry) => entry.homeId && entry.awayId && entry.homeId !== entry.awayId);
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
    const normalizeStoredSportKey = (value) => {
      const raw = String(value || '').trim().toLowerCase();
      if (raw === 'soccer' || raw === 'football') return 'soccer';
      if (raw === 'netball') return 'netball';
      return '';
    };

    const resolveCatalogEntrySportKey = (fixtureId, entry) => {
      const parts = String(fixtureId || '').split(':');
      return normalizeStoredSportKey(parts[1]) || normalizeStoredSportKey(entry?.sportKey || entry?.sport || '');
    };

    const activeSportKey = normalizeStoredSportKey(fixtures[0]?.sportKey || selectedSportKey());
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
        sportKey: fixture.sportKey,
        sport: sportProfile?.label || '',
        competition: String(config.competition || '').trim(),
        venue: String(config.venue || '').trim(),
        format: String(setup.formatLabel || '').trim(),
        setup
      };
    });

    try {
      const rawCatalog = localStorage.getItem(fixtureCatalogStorageKey);
      const parsedCatalog = rawCatalog ? JSON.parse(rawCatalog) : {};
      const existingCatalog = parsedCatalog && typeof parsedCatalog === 'object' ? parsedCatalog : {};
      const nextCatalog = {};

      Object.entries(existingCatalog).forEach(([fixtureId, entry]) => {
        if (!fixtureId.startsWith(`${fixtureSectionKey}:`)) {
          nextCatalog[fixtureId] = entry;
          return;
        }

        if (activeSportKey && resolveCatalogEntrySportKey(fixtureId, entry) === activeSportKey) {
          return;
        }

        nextCatalog[fixtureId] = entry;
      });

      Object.assign(nextCatalog, catalog);

      localStorage.setItem(fixtureCatalogStorageKey, JSON.stringify(nextCatalog));
      void persistLocalStore(fixtureCatalogStorageKey, nextCatalog);

      const rawDates = localStorage.getItem(fixtureDateStorageKey);
      const parsedDates = rawDates ? JSON.parse(rawDates) : {};
      const fixtureDatesMap = parsedDates && typeof parsedDates === 'object' ? parsedDates : {};
      const catalogIds = new Set(Object.keys(catalog));
      let datesChanged = false;

      Object.keys(fixtureDatesMap).forEach((fixtureId) => {
        if (!fixtureId.startsWith(`${fixtureSectionKey}:`)) return;
        if (activeSportKey && resolveCatalogEntrySportKey(fixtureId, existingCatalog[fixtureId]) !== activeSportKey) {
          return;
        }
        if (!catalogIds.has(fixtureId)) {
          delete fixtureDatesMap[fixtureId];
          datesChanged = true;
        }
      });

      if (datesChanged) {
        localStorage.setItem(fixtureDateStorageKey, JSON.stringify(fixtureDatesMap));
        void persistLocalStore(fixtureDateStorageKey, fixtureDatesMap);
      }
    } catch {
      return;
    }

    dispatchFixtureSyncEvent();
  };

  const fixtureDateLabel = (fixtureId) => {
    const value = normalizeFixtureStamp(fixtureDates[fixtureId]);
    if (!value) return '';
    const parsed = splitFixtureStamp(value);
    const date = new Date(`${parsed.date}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    const dateLabel = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
    return parsed.time ? `${dateLabel} ${parsed.time}` : dateLabel;
  };

  const buildCalendarHref = (fixture, fixtureId) => {
    const params = new URLSearchParams();
    params.set('fixtureSectionKey', fixtureSectionKey);
    params.set('fixtureId', fixtureId);
    params.set('fixtureLabel', `${teamNameById(fixture.homeId)} vs ${teamNameById(fixture.awayId)}`);
    const existing = normalizeFixtureStamp(fixtureDates[fixtureId]);
    if (existing) {
      params.set('date', existing);
    }
    return withAudienceQuery(`calendar.html?${params.toString()}`);
  };

  const selectedTeamIds = () =>
    teamPickInputs
      .filter((input) => input instanceof HTMLInputElement && input.checked)
      .map((input) => (input instanceof HTMLInputElement ? input.value : ''))
      .filter((teamId) => houseOptions.some((team) => team.id === teamId));

  const teamNameById = (teamId) => houseOptions.find((team) => team.id === teamId)?.name || teamId;

  const orderedPairKey = (homeId, awayId) => `${homeId}__${awayId}`;

  const unorderedPairKey = (teamA, teamB) => {
    const left = String(teamA || '').trim();
    const right = String(teamB || '').trim();
    if (!left || !right || left === right) return '';
    return [left, right].sort((a, b) => a.localeCompare(b)).join('__');
  };

  const splitUnorderedPairKey = (key) => {
    const [teamA, teamB] = String(key || '').split('__');
    return { teamA: String(teamA || '').trim(), teamB: String(teamB || '').trim() };
  };

  const splitOrderedPairKey = (key) => {
    const [homeId, awayId] = String(key || '').split('__');
    return { homeId: String(homeId || '').trim(), awayId: String(awayId || '').trim() };
  };

  const selectedFairnessRuleSet = () => new Set(selectedFairnessRuleIds());

  const buildFairnessReport = (fixtures, teamIds, selectedRuleIds = []) => {
    const normalizedFixtures = Array.isArray(fixtures) ? fixtures : [];
    const normalizedTeams = Array.from(new Set((teamIds || []).filter(Boolean)));
    const selectedRules = new Set((Array.isArray(selectedRuleIds) ? selectedRuleIds : []).filter(Boolean));
    const fixtureReasons = {};
    const teamIssues = [];

    const appendFixtureReason = (fixtureId, reason) => {
      const normalizedFixtureId = String(fixtureId || '').trim();
      const normalizedReason = String(reason || '').trim();
      if (!normalizedFixtureId || !normalizedReason) return;
      const existing = Array.isArray(fixtureReasons[normalizedFixtureId]) ? fixtureReasons[normalizedFixtureId] : [];
      if (!existing.includes(normalizedReason)) {
        existing.push(normalizedReason);
      }
      fixtureReasons[normalizedFixtureId] = existing;
    };

    const appendTeamIssue = (reason) => {
      const normalizedReason = String(reason || '').trim();
      if (!normalizedReason) return;
      if (!teamIssues.includes(normalizedReason)) {
        teamIssues.push(normalizedReason);
      }
    };

    const appendReasonForTeamInFixtures = (scopeFixtures, teamId, reason) => {
      (scopeFixtures || []).forEach((fixture) => {
        if (fixture.homeId !== teamId && fixture.awayId !== teamId) return;
        appendFixtureReason(getFixtureId(fixture), reason);
      });
    };

    const legLabels = Array.from(new Set(normalizedFixtures.map((entry) => String(entry.leg || '').trim()).filter(Boolean)));

    if (selectedRules.has('fifa_no_self_match')) {
      normalizedFixtures.forEach((fixture) => {
        if (String(fixture.homeId || '').trim() !== String(fixture.awayId || '').trim()) return;
        const reason = `Invalid fixture: ${teamNameById(fixture.homeId)} is scheduled to play itself.`;
        appendTeamIssue(reason);
        appendFixtureReason(getFixtureId(fixture), reason);
      });
    }

    if (selectedRules.has('unique_opponent_per_leg')) {
      legLabels.forEach((legLabel) => {
        const legFixtures = normalizedFixtures.filter((entry) => String(entry.leg || '').trim() === legLabel);
        const pairMap = {};
        legFixtures.forEach((fixture) => {
          const pairKey = unorderedPairKey(fixture.homeId, fixture.awayId);
          if (!pairKey) return;
          pairMap[pairKey] = Array.isArray(pairMap[pairKey]) ? pairMap[pairKey] : [];
          pairMap[pairKey].push(fixture);
        });

        Object.entries(pairMap).forEach(([pairKey, list]) => {
          if (!Array.isArray(list) || list.length <= 1) return;
          const { teamA, teamB } = splitUnorderedPairKey(pairKey);
          const reason = `Duplicate pairing in ${legLabel} leg: ${teamNameById(teamA)} vs ${teamNameById(teamB)} appears ${list.length} times.`;
          appendTeamIssue(reason);
          list.forEach((fixture) => appendFixtureReason(getFixtureId(fixture), reason));
        });
      });
    }

    if (selectedRules.has('equal_matches_leg')) {
      legLabels.forEach((legLabel) => {
        const legFixtures = normalizedFixtures.filter((entry) => String(entry.leg || '').trim() === legLabel);
        const countByTeam = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));
        legFixtures.forEach((fixture) => {
          if (fixture.homeId in countByTeam) countByTeam[fixture.homeId] += 1;
          if (fixture.awayId in countByTeam) countByTeam[fixture.awayId] += 1;
        });

        const values = Object.values(countByTeam);
        if (!values.length) return;
        const min = Math.min(...values);
        const max = Math.max(...values);
        if (min === max) return;

        normalizedTeams.forEach((teamId) => {
          if ((countByTeam[teamId] || 0) === min && (countByTeam[teamId] || 0) === max) return;
          const reason = `${teamNameById(teamId)} has ${countByTeam[teamId]} match(es) in ${legLabel} leg, expected ${min}-${max} equality.`;
          appendTeamIssue(reason);
          appendReasonForTeamInFixtures(legFixtures, teamId, reason);
        });
      });
    }

    if (selectedRules.has('equal_matches_season')) {
      const countByTeam = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));
      normalizedFixtures.forEach((fixture) => {
        if (fixture.homeId in countByTeam) countByTeam[fixture.homeId] += 1;
        if (fixture.awayId in countByTeam) countByTeam[fixture.awayId] += 1;
      });

      const values = Object.values(countByTeam);
      if (values.length) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        if (min !== max) {
          normalizedTeams.forEach((teamId) => {
            const reason = `${teamNameById(teamId)} has ${countByTeam[teamId]} match(es) this season, expected equal totals.`;
            appendTeamIssue(reason);
            appendReasonForTeamInFixtures(normalizedFixtures, teamId, reason);
          });
        }
      }
    }

    if (selectedRules.has('no_double_round_booking') || selectedRules.has('equal_round_participation')) {
      legLabels.forEach((legLabel) => {
        const legFixtures = normalizedFixtures.filter((entry) => String(entry.leg || '').trim() === legLabel);
        const roundLabels = Array.from(new Set(legFixtures.map((entry) => Number(entry.round)).filter(Number.isFinite)));
        const participationByTeam = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));

        roundLabels.forEach((roundValue) => {
          const roundFixtures = legFixtures.filter((entry) => Number(entry.round) === Number(roundValue));
          const appearances = {};
          roundFixtures.forEach((fixture) => {
            appearances[fixture.homeId] = (appearances[fixture.homeId] || 0) + 1;
            appearances[fixture.awayId] = (appearances[fixture.awayId] || 0) + 1;
          });

          Object.entries(appearances).forEach(([teamId, count]) => {
            if (teamId in participationByTeam) {
              participationByTeam[teamId] = (participationByTeam[teamId] || 0) + (count > 0 ? 1 : 0);
            }

            if (selectedRules.has('no_double_round_booking') && count > 1) {
              const reason = `${teamNameById(teamId)} is scheduled ${count} times in round ${roundValue} (${legLabel} leg).`;
              appendTeamIssue(reason);
              roundFixtures
                .filter((fixture) => fixture.homeId === teamId || fixture.awayId === teamId)
                .forEach((fixture) => appendFixtureReason(getFixtureId(fixture), reason));
            }
          });
        });

        if (selectedRules.has('equal_round_participation')) {
          const values = Object.values(participationByTeam);
          if (values.length) {
            const min = Math.min(...values);
            const max = Math.max(...values);
            if (max - min > 1) {
              normalizedTeams.forEach((teamId) => {
                const reason = `${teamNameById(teamId)} has uneven round participation in ${legLabel} leg (${participationByTeam[teamId]} rounds).`;
                appendTeamIssue(reason);
                appendReasonForTeamInFixtures(legFixtures, teamId, reason);
              });
            }
          }
        }
      });
    }

    if (selectedRules.has('balanced_home_away')) {
      legLabels.forEach((legLabel) => {
        const legFixtures = normalizedFixtures.filter((entry) => String(entry.leg || '').trim() === legLabel);
        const homeCount = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));
        const awayCount = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));
        legFixtures.forEach((fixture) => {
          if (fixture.homeId in homeCount) homeCount[fixture.homeId] += 1;
          if (fixture.awayId in awayCount) awayCount[fixture.awayId] += 1;
        });

        normalizedTeams.forEach((teamId) => {
          const delta = Math.abs((homeCount[teamId] || 0) - (awayCount[teamId] || 0));
          if (delta <= 1) return;
          const reason = `${teamNameById(teamId)} has unbalanced home/away in ${legLabel} leg (${homeCount[teamId]} home vs ${awayCount[teamId]} away).`;
          appendTeamIssue(reason);
          appendReasonForTeamInFixtures(legFixtures, teamId, reason);
        });
      });

      const seasonHome = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));
      const seasonAway = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));
      normalizedFixtures.forEach((fixture) => {
        if (fixture.homeId in seasonHome) seasonHome[fixture.homeId] += 1;
        if (fixture.awayId in seasonAway) seasonAway[fixture.awayId] += 1;
      });
      normalizedTeams.forEach((teamId) => {
        const delta = Math.abs((seasonHome[teamId] || 0) - (seasonAway[teamId] || 0));
        if (delta === 0) return;
        const reason = `${teamNameById(teamId)} has unbalanced home/away over the full season (${seasonHome[teamId]} home vs ${seasonAway[teamId]} away).`;
        appendTeamIssue(reason);
        appendReasonForTeamInFixtures(normalizedFixtures, teamId, reason);
      });
    }

    const flattenedReasons = Object.fromEntries(
      Object.entries(fixtureReasons).map(([fixtureId, reasons]) => [fixtureId, Array.from(new Set(reasons)).join(' ')])
    );

    return {
      hasUnfairness: Object.keys(flattenedReasons).length > 0,
      fixtureReasons: flattenedReasons,
      teamIssues,
      affectedFixtureCount: Object.keys(flattenedReasons).length
    };
  };

  const rebalanceHomeAwayForScope = ({ fixtures, teamIds, lockedIndexSet, scopeIndexes, tolerance }) => {
    const allIndexes = Array.isArray(scopeIndexes) ? [...scopeIndexes] : [];
    const teamList = Array.from(new Set((teamIds || []).filter(Boolean)));
    if (!teamList.length || !allIndexes.length) return false;

    let changed = false;
    let guard = 0;

    const countHomeAway = () => {
      const home = Object.fromEntries(teamList.map((teamId) => [teamId, 0]));
      const away = Object.fromEntries(teamList.map((teamId) => [teamId, 0]));
      allIndexes.forEach((index) => {
        const fixture = fixtures[index];
        if (!fixture) return;
        if (fixture.homeId in home) home[fixture.homeId] += 1;
        if (fixture.awayId in away) away[fixture.awayId] += 1;
      });
      return { home, away };
    };

    while (guard < 2000) {
      guard += 1;
      const { home, away } = countHomeAway();
      const deltas = Object.fromEntries(teamList.map((teamId) => [teamId, (home[teamId] || 0) - (away[teamId] || 0)]));
      const over = teamList.filter((teamId) => deltas[teamId] > tolerance);
      const under = teamList.filter((teamId) => deltas[teamId] < -tolerance);
      if (!over.length || !under.length) break;

      let swapIndex = -1;
      for (const index of allIndexes) {
        if (lockedIndexSet.has(index)) continue;
        const fixture = fixtures[index];
        if (!fixture) continue;
        if (deltas[fixture.homeId] > tolerance && deltas[fixture.awayId] < -tolerance) {
          swapIndex = index;
          break;
        }
      }

      if (swapIndex < 0) break;
      const target = fixtures[swapIndex];
      fixtures[swapIndex] = {
        ...target,
        homeId: target.awayId,
        awayId: target.homeId
      };
      changed = true;
    }

    return changed;
  };

  const enforceSelectedFairnessRules = ({ fixtures, teamIds, selectedRuleIds = [], lockedIndexes = [] }) => {
    const normalizedFixtures = (fixtures || []).map((entry) => ({ ...entry }));
    const normalizedTeams = Array.from(new Set((teamIds || []).filter(Boolean)));
    const selectedRules = new Set((Array.isArray(selectedRuleIds) ? selectedRuleIds : []).filter(Boolean));
    const lockedIndexSet = new Set(
      (Array.isArray(lockedIndexes) ? lockedIndexes : [])
        .filter((index) => Number.isInteger(index) && index >= 0 && index < normalizedFixtures.length)
    );

    if (selectedRules.has('balanced_home_away') && normalizedTeams.length) {
      const legLabels = Array.from(new Set(normalizedFixtures.map((entry) => String(entry.leg || '').trim()).filter(Boolean)));
      legLabels.forEach((legLabel) => {
        const scopeIndexes = normalizedFixtures
          .map((entry, index) => ({ entry, index }))
          .filter(({ entry }) => String(entry.leg || '').trim() === legLabel)
          .map(({ index }) => index);
        rebalanceHomeAwayForScope({
          fixtures: normalizedFixtures,
          teamIds: normalizedTeams,
          lockedIndexSet,
          scopeIndexes,
          tolerance: 1
        });
      });

      rebalanceHomeAwayForScope({
        fixtures: normalizedFixtures,
        teamIds: normalizedTeams,
        lockedIndexSet,
        scopeIndexes: normalizedFixtures.map((_, index) => index),
        tolerance: 0
      });
    }

    const report = buildFairnessReport(normalizedFixtures, normalizedTeams, Array.from(selectedRules));
    if (report.hasUnfairness) {
      return {
        ok: false,
        message:
          report.teamIssues[0] ||
          'Selected fairness rules cannot be satisfied with the current pinned/manual constraints.',
        report
      };
    }

    return {
      ok: true,
      fixtures: normalizedFixtures,
      report
    };
  };

  const inferMatchesPerOpponentPerLegFromFixtures = (fixtures, teamIds) => {
    const normalizedTeams = Array.from(new Set((teamIds || []).filter(Boolean)));
    if (normalizedTeams.length < 2) return 1;

    const allUnorderedPairs = [];
    normalizedTeams.forEach((homeId, leftIndex) => {
      normalizedTeams.slice(leftIndex + 1).forEach((awayId) => {
        const pairKey = unorderedPairKey(homeId, awayId);
        if (pairKey) allUnorderedPairs.push(pairKey);
      });
    });
    if (!allUnorderedPairs.length) return 1;

    const legLabels = Array.from(new Set((fixtures || []).map((entry) => String(entry.leg || '').trim()).filter(Boolean)));
    if (!legLabels.length) return 1;

    const legCounts = legLabels
      .map((legLabel) => (fixtures || []).filter((entry) => String(entry.leg || '').trim() === legLabel).length)
      .filter((count) => Number.isFinite(count) && count > 0);
    if (!legCounts.length) return 1;

    const inferred = legCounts[0] / allUnorderedPairs.length;
    if (!Number.isInteger(inferred) || inferred <= 0) return 1;
    const consistent = legCounts.every((count) => count === allUnorderedPairs.length * inferred);
    return consistent ? inferred : 1;
  };

  const validateNoDuplicatePairingsPerLeg = (fixtures, teamIds, expectedMeetingsPerOpponentPerLeg = null) => {
    const normalizedTeams = Array.from(new Set((teamIds || []).filter(Boolean)));
    if (normalizedTeams.length < 2) {
      return { ok: false, message: 'At least two selected teams are required for round-robin fixtures.' };
    }

    const allUnorderedPairs = [];
    normalizedTeams.forEach((homeId, leftIndex) => {
      normalizedTeams.slice(leftIndex + 1).forEach((awayId) => {
        const pairKey = unorderedPairKey(homeId, awayId);
        if (pairKey) allUnorderedPairs.push(pairKey);
      });
    });

    const meetingsPerOpponentPerLeg = parseMatchesPerOpponentPerLeg(
      expectedMeetingsPerOpponentPerLeg,
      inferMatchesPerOpponentPerLegFromFixtures(fixtures, normalizedTeams)
    );
    const expectedMatchesPerLeg = allUnorderedPairs.length * meetingsPerOpponentPerLeg;
    const legLabels = Array.from(new Set((fixtures || []).map((entry) => String(entry.leg || '').trim()).filter(Boolean)));
    if (!legLabels.length) {
      return { ok: false, message: 'Fixture legs are missing; unable to validate leg pairing rules.' };
    }

    for (const legLabel of legLabels) {
      const legFixtures = fixtures.filter((entry) => String(entry.leg || '').trim() === legLabel);
      if (legFixtures.length !== expectedMatchesPerLeg) {
        return {
          ok: false,
          message: `${legLabel} leg does not contain a complete set of unique opponent fixtures.`
        };
      }

      const pairCounts = Object.fromEntries(allUnorderedPairs.map((pairKey) => [pairKey, 0]));
      for (const fixture of legFixtures) {
        if (!normalizedTeams.includes(fixture.homeId) || !normalizedTeams.includes(fixture.awayId)) {
          return { ok: false, message: 'Fixture teams must come from the selected team list.' };
        }

        const pairKey = unorderedPairKey(fixture.homeId, fixture.awayId);
        if (!pairKey) {
          return { ok: false, message: 'Home and away teams must be different.' };
        }

        if (!(pairKey in pairCounts)) {
          return {
            ok: false,
            message: `${teamNameById(fixture.homeId)} and ${teamNameById(fixture.awayId)} are not a valid pairing for ${legLabel} leg.`
          };
        }
        pairCounts[pairKey] += 1;
      }

      const invalidPair = Object.entries(pairCounts).find(([, count]) => count !== meetingsPerOpponentPerLeg);
      if (invalidPair) {
        const { teamA, teamB } = splitUnorderedPairKey(invalidPair[0]);
        return {
          ok: false,
          message: `${teamNameById(teamA)} and ${teamNameById(teamB)} appear ${invalidPair[1]} time(s) in ${legLabel} leg; expected ${meetingsPerOpponentPerLeg}.`
        };
      }
    }

    return { ok: true };
  };

  const validateHomeAwayBalancePerLeg = (fixtures, teamIds) => {
    const normalizedTeams = Array.from(new Set((teamIds || []).filter(Boolean)));
    if (!normalizedTeams.length) {
      return { ok: false, message: 'At least one team is required for fairness checks.' };
    }

    const legLabels = Array.from(new Set((fixtures || []).map((entry) => String(entry.leg || '').trim()).filter(Boolean)));
    if (!legLabels.length) {
      return { ok: false, message: 'Fixture legs are missing; unable to validate home/away fairness.' };
    }

    for (const legLabel of legLabels) {
      const homeCount = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));
      const awayCount = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));
      const legFixtures = fixtures.filter((entry) => String(entry.leg || '').trim() === legLabel);

      legFixtures.forEach((fixture) => {
        const homeId = String(fixture.homeId || '').trim();
        const awayId = String(fixture.awayId || '').trim();
        if (homeId in homeCount) homeCount[homeId] += 1;
        if (awayId in awayCount) awayCount[awayId] += 1;
      });

      const imbalances = normalizedTeams
        .map((teamId) => ({
          teamId,
          delta: Math.abs((homeCount[teamId] || 0) - (awayCount[teamId] || 0))
        }))
        .filter((entry) => entry.delta > 1);

      if (imbalances.length) {
        const first = imbalances[0];
        return {
          ok: false,
          message: `${teamNameById(first.teamId)} has an unfair home/away split in ${legLabel} leg.`
        };
      }
    }

    return { ok: true };
  };

  const buildHomeAwayUnfairnessReport = (fixtures, teamIds) => {
    const normalizedTeams = Array.from(new Set((teamIds || []).filter(Boolean)));
    if (!normalizedTeams.length) {
      return {
        hasUnfairness: false,
        fixtureReasons: {},
        teamIssues: [],
        affectedFixtureCount: 0
      };
    }

    const fixtureReasons = {};
    const teamIssues = [];
    const appendFixtureReason = (fixtureId, reason) => {
      const normalizedId = String(fixtureId || '').trim();
      const normalizedReason = String(reason || '').trim();
      if (!normalizedId || !normalizedReason) return;
      const existing = Array.isArray(fixtureReasons[normalizedId]) ? fixtureReasons[normalizedId] : [];
      if (!existing.includes(normalizedReason)) {
        existing.push(normalizedReason);
      }
      fixtureReasons[normalizedId] = existing;
    };

    const legLabels = Array.from(new Set((fixtures || []).map((entry) => String(entry.leg || '').trim()).filter(Boolean)));
    legLabels.forEach((legLabel) => {
      const legFixtures = (fixtures || []).filter((entry) => String(entry.leg || '').trim() === legLabel);
      if (!legFixtures.length) return;

      const homeCount = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));
      const awayCount = Object.fromEntries(normalizedTeams.map((teamId) => [teamId, 0]));
      legFixtures.forEach((fixture) => {
        const homeId = String(fixture.homeId || '').trim();
        const awayId = String(fixture.awayId || '').trim();
        if (homeId in homeCount) homeCount[homeId] += 1;
        if (awayId in awayCount) awayCount[awayId] += 1;
      });

      normalizedTeams
        .map((teamId) => ({
          teamId,
          home: homeCount[teamId] || 0,
          away: awayCount[teamId] || 0,
          delta: Math.abs((homeCount[teamId] || 0) - (awayCount[teamId] || 0))
        }))
        .filter((entry) => entry.delta > 1)
        .forEach((issue) => {
          const explanation = `${teamNameById(issue.teamId)} has ${issue.home} home vs ${issue.away} away in ${legLabel} leg (difference ${issue.delta}).`;
          teamIssues.push(explanation);
          legFixtures.forEach((fixture) => {
            if (fixture.homeId !== issue.teamId && fixture.awayId !== issue.teamId) return;
            appendFixtureReason(getFixtureId(fixture), explanation);
          });
        });
    });

    const flattenedReasons = Object.fromEntries(
      Object.entries(fixtureReasons).map(([fixtureId, reasons]) => [fixtureId, reasons.join(' ')])
    );

    return {
      hasUnfairness: Object.keys(flattenedReasons).length > 0,
      fixtureReasons: flattenedReasons,
      teamIssues,
      affectedFixtureCount: Object.keys(flattenedReasons).length
    };
  };

  const fairnessTeamIdsForFixtures = (fixtures) => {
    const selected = Array.from(new Set(selectedTeamIds()));
    if (selected.length) return selected;
    return Array.from(new Set((fixtures || []).flatMap((entry) => [entry.homeId, entry.awayId]).filter(Boolean)));
  };

  const refreshCurrentUnfairnessReport = (fixtures) => {
    currentUnfairnessReport = buildFairnessReport(
      fixtures,
      fairnessTeamIdsForFixtures(fixtures),
      selectedFairnessRuleIds()
    );
  };

  const refreshFixtureApprovalUi = () => {
    if (!(approvalPanelNode instanceof HTMLElement) || !(approvalStatusNode instanceof HTMLElement)) return;

    const shouldShow = isAdminMode && pendingFixtureApproval && lastFixtures.length > 0;
    approvalPanelNode.classList.toggle('is-hidden', !shouldShow);
    if (!shouldShow) return;

    if (currentUnfairnessReport.hasUnfairness) {
      approvalStatusNode.textContent = `${currentUnfairnessReport.affectedFixtureCount} fixture(s) violate selected fairness rules. Resolve highlighted rows while the live calendar and standings stay in sync.`;
    } else {
      approvalStatusNode.textContent = 'Live fixture draft is synced. Use the confirmation step only to validate fairness after review.';
    }

    if (approveResolvedButton instanceof HTMLButtonElement) {
      approveResolvedButton.disabled = currentUnfairnessReport.hasUnfairness;
    }
    if (approveAnywayButton instanceof HTMLButtonElement) {
      approveAnywayButton.disabled = currentUnfairnessReport.hasUnfairness;
    }
  };

  const persistActiveSportState = () => {
    const activeSport = selectedSportKey();
    if (!activeSport) return;

    const selectedIds = selectedTeamIds();
    const fallbackIds = Array.from(
      new Set(
        lastFixtures
          .flatMap((entry) => [String(entry.homeId || '').trim(), String(entry.awayId || '').trim()])
          .filter(Boolean)
      )
    );
    const persistedTeamIds = selectedIds.length ? selectedIds : fallbackIds;

    fixtureCreatorState.lastSport = activeSport;
    fixtureCreatorState.sports[activeSport] = {
      selectedTeamIds: persistedTeamIds,
      fairnessRuleIds: selectedFairnessRuleIds(),
      fixtures: lastFixtures.map((entry) => ({ ...entry })),
      fixtureDates: getFixtureDateSnapshot(lastFixtures),
      pinnedSlotKeys: Array.from(pinnedFixtureSlotKeys),
      setup: readSportSetupValues(activeSport),
      formatLabel: String(lastFormatLabel || '').trim(),
      generatedAt: Date.now()
    };
    saveFixtureCreatorState();
  };

  const repairRoundRobinFixtureSet = ({ fixtures, teamIds, lockedIndexes = [], matchesPerOpponentPerLeg = 1 }) => {
    const normalizedTeams = Array.from(new Set((teamIds || []).filter(Boolean)));
    const normalizedMatchesPerLeg = parseMatchesPerOpponentPerLeg(matchesPerOpponentPerLeg, 1);
    if (normalizedTeams.length < 2) {
      return { ok: false, message: 'At least two selected teams are required for round-robin fixtures.' };
    }

    const allUnorderedPairs = [];
    normalizedTeams.forEach((homeId, leftIndex) => {
      normalizedTeams.slice(leftIndex + 1).forEach((awayId) => {
        const pairKey = unorderedPairKey(homeId, awayId);
        if (pairKey) allUnorderedPairs.push(pairKey);
      });
    });

    const legs = Array.from(new Set((fixtures || []).map((entry) => String(entry.leg || '').trim()).filter(Boolean)));
    if (!legs.length) {
      return { ok: false, message: 'Fixture legs are missing; cannot preserve leg rules.' };
    }

    const expectedMatchesPerLeg = allUnorderedPairs.length * normalizedMatchesPerLeg;
    if ((fixtures || []).length !== expectedMatchesPerLeg * legs.length) {
      return {
        ok: false,
        message: 'Fixture count does not match a full home-and-away round-robin for selected teams.'
      };
    }

    const repairedFixtures = (fixtures || []).map((entry) => ({ ...entry }));
    const lockedIndexSet = new Set(
      (lockedIndexes || []).filter((index) => Number.isInteger(index) && index >= 0 && index < repairedFixtures.length)
    );

    for (const lockedIndex of lockedIndexSet) {
      const fixture = repairedFixtures[lockedIndex];
      const homeId = String(fixture?.homeId || '').trim();
      const awayId = String(fixture?.awayId || '').trim();
      if (!normalizedTeams.includes(homeId) || !normalizedTeams.includes(awayId) || homeId === awayId) {
        return { ok: false, message: 'A pinned or locked fixture has an invalid team selection for this team set.' };
      }
    }

    for (const legLabel of legs) {
      const legIndexes = repairedFixtures
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => String(entry.leg || '').trim() === legLabel)
        .map(({ index }) => index);

      if (legIndexes.length !== expectedMatchesPerLeg) {
        return {
          ok: false,
          message: `${legLabel} leg does not contain the required number of fixtures.`
        };
      }

      const availablePairCounts = Object.fromEntries(allUnorderedPairs.map((pairKey) => [pairKey, normalizedMatchesPerLeg]));
      const unresolvedIndexes = [];

      for (const index of legIndexes) {
        if (!lockedIndexSet.has(index)) continue;
        const fixture = repairedFixtures[index];
        const pairKey = unorderedPairKey(fixture.homeId, fixture.awayId);
        if (!pairKey || !(pairKey in availablePairCounts) || availablePairCounts[pairKey] <= 0) {
          return { ok: false, message: 'Pinned fixtures conflict with each other in the same leg. Unpin or adjust one of them.' };
        }
        availablePairCounts[pairKey] -= 1;
      }

      for (const index of legIndexes) {
        if (lockedIndexSet.has(index)) continue;
        const fixture = repairedFixtures[index];
        const pairKey = unorderedPairKey(fixture.homeId, fixture.awayId);
        if (pairKey && pairKey in availablePairCounts && availablePairCounts[pairKey] > 0) {
          availablePairCounts[pairKey] -= 1;
          continue;
        }
        unresolvedIndexes.push(index);
      }

      for (const index of unresolvedIndexes) {
        const nextPairKey = Object.entries(availablePairCounts).find(([, remaining]) => remaining > 0)?.[0] || '';
        if (!nextPairKey) {
          return { ok: false, message: 'Could not auto-adjust fixtures to a valid round-robin schedule.' };
        }

        availablePairCounts[nextPairKey] -= 1;
        const { teamA, teamB } = splitUnorderedPairKey(nextPairKey);
        const current = repairedFixtures[index];
        let nextPair = { homeId: teamA, awayId: teamB };

        if (current.homeId === teamA || current.awayId === teamB) {
          nextPair = { homeId: teamA, awayId: teamB };
        } else if (current.homeId === teamB || current.awayId === teamA) {
          nextPair = { homeId: teamB, awayId: teamA };
        }

        repairedFixtures[index] = {
          ...current,
          homeId: nextPair.homeId,
          awayId: nextPair.awayId
        };
      }

      if (Object.values(availablePairCounts).some((remaining) => remaining > 0)) {
        return { ok: false, message: 'Round-robin auto-adjustment left unmatched fixture pairs.' };
      }
    }

    const legValidation = validateNoDuplicatePairingsPerLeg(repairedFixtures, normalizedTeams, normalizedMatchesPerLeg);
    if (!legValidation.ok) {
      return legValidation;
    }

    const changedIndexes = repairedFixtures
      .map((entry, index) => ({
        index,
        changed: entry.homeId !== fixtures[index].homeId || entry.awayId !== fixtures[index].awayId
      }))
      .filter((entry) => entry.changed)
      .map((entry) => entry.index);

    return {
      ok: true,
      fixtures: repairedFixtures,
      changedIndexes,
      changedCount: changedIndexes.length
    };
  };

  const reconcileRoundRobinAfterManualEdit = ({
    fixtures,
    teamIds,
    editedIndex,
    nextHomeId,
    nextAwayId,
    lockedIndexes = [],
    selectedRuleIds = [],
    matchesPerOpponentPerLeg = 1
  }) => {
    const normalizedTeams = Array.from(new Set((teamIds || []).filter(Boolean)));
    if (normalizedTeams.length < 2) {
      return { ok: false, message: 'At least two selected teams are required for round-robin fixtures.' };
    }

    let resolvedHomeId = String(nextHomeId || '').trim();
    let resolvedAwayId = String(nextAwayId || '').trim();

    if (!normalizedTeams.includes(resolvedHomeId) || !normalizedTeams.includes(resolvedAwayId)) {
      return { ok: false, message: 'Selected teams must be from the active fixture team list.' };
    }

    if (resolvedHomeId === resolvedAwayId) {
      const currentFixture = fixtures[editedIndex] || null;
      const currentHomeId = String(currentFixture?.homeId || '').trim();
      const currentAwayId = String(currentFixture?.awayId || '').trim();

      const canInvertCurrentFixture =
        currentHomeId &&
        currentAwayId &&
        currentHomeId !== currentAwayId &&
        (resolvedHomeId === currentHomeId || resolvedHomeId === currentAwayId);

      if (!canInvertCurrentFixture) {
        return { ok: false, message: 'Home and away teams must be different.' };
      }

      resolvedHomeId = currentAwayId;
      resolvedAwayId = currentHomeId;
    }

    const editedPairKey = unorderedPairKey(resolvedHomeId, resolvedAwayId);
    if (!editedPairKey) {
      return { ok: false, message: 'Unable to apply this edit while preserving round-robin rules.' };
    }

    const repairedFixtures = fixtures.map((entry) => ({ ...entry }));
    repairedFixtures[editedIndex] = {
      ...repairedFixtures[editedIndex],
      homeId: resolvedHomeId,
      awayId: resolvedAwayId
    };
    const effectiveLockedIndexes = Array.from(new Set([editedIndex, ...(lockedIndexes || [])]));
    const repairResult = repairRoundRobinFixtureSet({
      fixtures: repairedFixtures,
      teamIds: normalizedTeams,
      lockedIndexes: effectiveLockedIndexes,
      matchesPerOpponentPerLeg
    });
    if (!repairResult.ok) {
      return repairResult;
    }

    const changedIndexes = repairResult.changedIndexes || [];

    const fairnessResult = enforceSelectedFairnessRules({
      fixtures: repairResult.fixtures,
      teamIds: normalizedTeams,
      selectedRuleIds,
      lockedIndexes: effectiveLockedIndexes
    });
    if (!fairnessResult.ok) {
      return {
        ok: false,
        message: fairnessResult.message
      };
    }

    const affectedOtherCount = changedIndexes.filter((index) => index !== editedIndex).length;

    return {
      ok: true,
      fixtures: fairnessResult.fixtures,
      affectedOtherCount,
      changedCount: changedIndexes.length
    };
  };

  const renderFixtures = (fixtures) => {
    if (!fixtures.length) {
      currentUnfairnessReport = {
        hasUnfairness: false,
        fixtureReasons: {},
        teamIssues: [],
        affectedFixtureCount: 0
      };
      pendingFixtureApproval = false;
      approvedWithUnfairness = false;
      lastRenderedFixtureOrder = [];
      bodyNode.innerHTML = '<tr><td colspan="9" class="fixture-empty">Select sport and at least two teams to generate fixtures.</td></tr>';
      if (statusNode) {
        statusNode.textContent = selectedSportKey()
          ? 'Select at least two teams to generate fixtures.'
          : 'Choose Soccer or Netball first, then generate fixtures.';
      }
      refreshFixtureApprovalUi();
      return;
    }

    refreshCurrentUnfairnessReport(fixtures);
    const unfairnessByFixtureId = currentUnfairnessReport.fixtureReasons || {};

    const activeTeamIds = Array.from(new Set(selectedTeamIds()));
    const fallbackFixtureTeamIds = Array.from(
      new Set(fixtures.flatMap((entry) => [entry.homeId, entry.awayId]).filter(Boolean))
    );
    const effectiveTeamIds = activeTeamIds.length ? activeTeamIds : fallbackFixtureTeamIds;
    const effectiveTeamOptions = houseOptions.filter((team) => effectiveTeamIds.includes(team.id));
    const logsByFixture = loadMatchLogByFixtureStore(fixtureSectionKey);

    const parseFixtureEpoch = (fixtureId) => {
      const normalizedStamp = normalizeFixtureStamp(fixtureDates[fixtureId]);
      if (!normalizedStamp) return Number.MAX_SAFE_INTEGER;
      const stamp = splitFixtureStamp(normalizedStamp);
      if (!stamp.date) return Number.MAX_SAFE_INTEGER;
      const iso = `${stamp.date}T${stamp.time || '23:59'}`;
      const value = new Date(iso).getTime();
      return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
    };

    const renderedFixtures = fixtures
      .map((fixture, index) => {
        const fixtureId = getFixtureId(fixture);
        const stamp = splitFixtureStamp(fixtureDates[fixtureId]);
        const epoch = parseFixtureEpoch(fixtureId);
        return {
          fixture,
          index,
          fixtureId,
          stamp,
          epoch
        };
      })
      .sort((left, right) => {
        if (left.epoch !== right.epoch) return left.epoch - right.epoch;
        if (left.fixture.round !== right.fixture.round) return left.fixture.round - right.fixture.round;
        if (left.fixture.match !== right.fixture.match) return left.fixture.match - right.fixture.match;
        return left.fixtureId.localeCompare(right.fixtureId);
      });

    lastRenderedFixtureOrder = renderedFixtures.map(({ fixture }) => fixture);

    const teamOptionMarkup = (selectedId) =>
      (effectiveTeamOptions.length ? effectiveTeamOptions : houseOptions)
        .map(
          (team) => `<option value="${escapeHtmlAttribute(team.id)}" ${team.id === selectedId ? 'selected' : ''}>${escapeHtmlText(team.name)}</option>`
        )
        .join('');

    bodyNode.innerHTML = renderedFixtures
      .map(
        ({ fixture, index, fixtureId, stamp }) => `
          <tr data-fixture-row="${index}" class="${unfairnessByFixtureId[fixtureId] ? 'fixture-row-unfair' : ''}" ${
            unfairnessByFixtureId[fixtureId]
              ? `title="${escapeHtmlAttribute(unfairnessByFixtureId[fixtureId])}"`
              : ''
          }>
            <td>${fixture.round}</td>
            <td>${fixture.leg}</td>
            <td>
              <div class="fixture-match-cell">
                ${(() => {
                  if (!isAdminMode) return '';
                  const slotKey = fixtureSlotKey(fixture);
                  const isPinned = pinnedFixtureSlotKeys.has(slotKey);
                  return `
                    <button
                      type="button"
                      class="fixture-pin-toggle ${isPinned ? 'is-pinned' : ''}"
                      data-fixture-pin-toggle
                      data-fixture-slot-key="${escapeHtmlAttribute(slotKey)}"
                      aria-pressed="${isPinned ? 'true' : 'false'}"
                      title="${isPinned ? 'Unpin this fixed fixture constraint' : 'Pin this fixture as a fixed constraint'}"
                    >📌</button>
                  `;
                })()}
                <span class="fixture-match-code">R${fixture.round}M${fixture.match}</span>
                ${
                  unfairnessByFixtureId[fixtureId]
                    ? '<span class="fixture-unfair-flag" aria-label="Fairness issue">Fairness</span>'
                    : ''
                }
              </div>
            </td>
            <td>
              ${(() => {
                const dateValue = stamp.date;
                const label = fixtureDateLabel(fixtureId) || (isAdminMode ? 'Set date in calendar' : 'TBD');
                if (!isAdminMode) {
                  return `<span class="fixture-date-label">${escapeHtmlText(label)}</span>`;
                }
                return `
                  <div class="fixture-date-edit-wrap">
                    <input type="date" class="fixture-inline-input" data-fixture-date-input value="${escapeHtmlAttribute(dateValue)}" />
                    <a class="fixture-date-link" href="${buildCalendarHref(fixture, fixtureId)}">Open<wbr> calendar</a>
                  </div>
                `;
              })()}
            </td>
            <td>
              ${(() => {
                const timeValue = stamp.time;
                if (!isAdminMode) {
                  return `<span class="fixture-date-label">${escapeHtmlText(timeValue || 'TBD')}</span>`;
                }
                return `<input type="time" class="fixture-inline-input" data-fixture-time-input value="${escapeHtmlAttribute(timeValue)}" />`;
              })()}
            </td>
            <td>${escapeHtmlText(fixture.formatLabel || '').replace(/\s\(/g, ' <wbr>(').replace(/\)\s+/g, ')<wbr> ')}</td>
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
            <td>
              ${(() => {
                const storedLog = logsByFixture[fixtureId];
                const summaryMeta = summarizeMatchLogEntry(storedLog);
                const summaryLabel = summaryMeta.compactLabel || 'No log yet';
                if (!isAdminMode) {
                  return `<span class="fixture-date-label">${escapeHtmlText(summaryLabel)}</span>`;
                }

                return `
                  <div class="fixture-date-edit-wrap">
                    <span class="fixture-date-label">${escapeHtmlText(summaryLabel)}</span>
                    <button
                      type="button"
                      class="fixture-date-link"
                      data-fixture-open-log
                      data-fixture-log-id="${escapeHtmlAttribute(fixtureId)}"
                      data-fixture-log-date="${escapeHtmlAttribute(stamp.date || '')}"
                    >${summaryMeta.eventCount > 0 ? 'Edit<wbr> log' : 'Log<wbr> match'}</button>
                  </div>
                `;
              })()}
            </td>
          </tr>
        `
      )
      .join('');

    if (statusNode) {
      if (isAdminMode && pendingFixtureApproval) {
        statusNode.textContent = currentUnfairnessReport.hasUnfairness
          ? `Live draft synced: ${currentUnfairnessReport.affectedFixtureCount} fixture(s) have fairness concerns. Hover highlighted rows and review them.`
          : 'Live draft synced: fairness checks passed and calendar/log views are up to date.';
      } else if (isAdminMode && approvedWithUnfairness && currentUnfairnessReport.hasUnfairness) {
        statusNode.textContent = `Fixtures approved with fairness warnings (${currentUnfairnessReport.affectedFixtureCount} highlighted fixture${currentUnfairnessReport.affectedFixtureCount === 1 ? '' : 's'}).`;
      } else {
        statusNode.textContent = `${lastSportLabel}: ${fixtures.length} fixtures generated (${fixtures.filter((entry) => entry.leg === 'First').length} first-leg + ${fixtures.filter((entry) => entry.leg === 'Return').length} return-leg).`;
      }
    }

    refreshFixtureApprovalUi();
  };

  const generateFixtures = ({ autoFillDates = false } = {}) => {
    refreshSportPanelState();
    const profile = selectedSportProfile();
    if (!profile) {
      lastFixtures = [];
      pinnedFixtureSlotKeys = new Set();
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
    const matchesPerOpponentPerLeg = parseMatchesPerOpponentPerLeg(setup.matchesPerOpponentPerLeg, 1);

    const pinnedBySlot = buildPinnedFixturesBySlot(lastFixtures, pinnedFixtureSlotKeys, teams);
    const selectedRules = selectedFairnessRuleIds();
    const generationOrders = buildGenerationTeamOrders(teams, 120);
    const selectedTemplateEntry = fixtureTemplateHistory.find((entry) => entry.id === selectedFixtureTemplateId) || null;

    let templateCandidate = null;
    if (selectedTemplateEntry && selectedTemplateEntry.sportKey === profile.key) {
      const templateFixtures = sanitizeStoredFixturesForSport(profile.key, selectedTemplateEntry.fixtures || []).map((fixture) => ({
        ...fixture,
        sportKey: profile.key,
        sportLabel: profile.label,
        formatLabel: lastFormatLabel
      }));
      const templateMeetingsPerLeg = inferMatchesPerOpponentPerLegFromFixtures(templateFixtures, teams);
      const templateTeamIds = Array.from(
        new Set(templateFixtures.flatMap((fixture) => [fixture.homeId, fixture.awayId]).filter(Boolean))
      ).sort();
      const selectedTeamSet = Array.from(new Set(teams)).sort();
      if (
        templateFixtures.length &&
        templateMeetingsPerLeg === matchesPerOpponentPerLeg &&
        templateTeamIds.length === selectedTeamSet.length &&
        templateTeamIds.every((teamId, index) => teamId === selectedTeamSet[index])
      ) {
        templateCandidate = {
          fixtures: templateFixtures,
          teamOrder: teams
        };
      }
    }

    let successfulGeneration = null;
    let generationFailureReason = 'Unable to generate fixtures that satisfy selected fairness rules.';

    const generationCandidates = templateCandidate
      ? [{ teamOrder: templateCandidate.teamOrder, fixtures: templateCandidate.fixtures }, ...generationOrders.map((teamOrder) => ({ teamOrder }))]
      : generationOrders.map((teamOrder) => ({ teamOrder }));

    generationCandidates.some((candidate) => {
      const teamOrder = Array.isArray(candidate.teamOrder) ? candidate.teamOrder : teams;
      const nextFixtures = Array.isArray(candidate.fixtures)
        ? candidate.fixtures.map((fixture) => ({ ...fixture }))
        : buildSingleRoundRobin(teamOrder, matchesPerOpponentPerLeg).map((fixture) => ({
            ...fixture,
            sportKey: profile.key,
            sportLabel: profile.label,
            formatLabel: lastFormatLabel
          }));

      const pinnedIndexes = [];
      const constrainedFixtures = nextFixtures.map((fixture, index) => {
        const slotKey = fixtureSlotKey(fixture);
        const pinned = pinnedBySlot[slotKey];
        if (!pinned) return fixture;
        pinnedIndexes.push(index);
        return {
          ...fixture,
          homeId: pinned.homeId,
          awayId: pinned.awayId
        };
      });

      const pinRepairResult = repairRoundRobinFixtureSet({
        fixtures: constrainedFixtures,
        teamIds: teamOrder,
        lockedIndexes: pinnedIndexes,
        matchesPerOpponentPerLeg
      });

      if (!pinRepairResult.ok) {
        generationFailureReason = `Pinned fixture constraints conflict with round-robin fairness. ${pinRepairResult.message}`;
        return false;
      }

      const fairnessEnforcement = enforceSelectedFairnessRules({
        fixtures: pinRepairResult.fixtures,
        teamIds: teamOrder,
        selectedRuleIds: selectedRules,
        lockedIndexes: pinnedIndexes
      });

      if (!fairnessEnforcement.ok) {
        generationFailureReason = `Selected fairness rules could not be satisfied with current pinned/manual constraints. ${fairnessEnforcement.message}`;
        return false;
      }

      const generationValidation = validateNoDuplicatePairingsPerLeg(
        fairnessEnforcement.fixtures,
        teamOrder,
        matchesPerOpponentPerLeg
      );
      if (!generationValidation.ok) {
        generationFailureReason = generationValidation.message;
        return false;
      }

      successfulGeneration = {
        fixtures: fairnessEnforcement.fixtures,
        pinnedIndexes
      };
      return true;
    });

    if (!successfulGeneration) {
      lastFixtures = [];
      renderFixtures(lastFixtures);
      if (statusNode) {
        statusNode.textContent = generationFailureReason;
      }
      return;
    }

    lastFixtures = successfulGeneration.fixtures;
    pinnedFixtureSlotKeys = new Set(
      successfulGeneration.pinnedIndexes
        .map((index) => fixtureSlotKey(lastFixtures[index]))
        .filter(Boolean)
    );

    refreshCurrentUnfairnessReport(lastFixtures);
    if (isAdminMode) {
      pendingFixtureApproval = true;
      approvedWithUnfairness = false;
      saveFixtureCatalog(lastFixtures);
      replaceActiveSportFixtureDates(lastFixtures, {}, { persist: false });
      const appliedDates = autoFillDates ? autoFillFixtureDates(lastFixtures) : autoFillFixtureDatesSilently(lastFixtures);
      if (!appliedDates) {
        persistFixtureDatesToStorage();
      }
      loadFixtureDates();
      persistActiveSportState();
      addFixtureHistorySnapshot(profile.key, lastFixtures);
      renderFixtures(lastFixtures);
      if (statusNode) {
        statusNode.textContent = currentUnfairnessReport.hasUnfairness
          ? `Fixtures generated and synced live with fairness concerns in ${currentUnfairnessReport.affectedFixtureCount} fixture(s).`
          : appliedDates
            ? 'Fixtures generated and synced live. Calendar, log views, and standings are up to date.'
            : 'Fixtures generated and synced live. Calendar events will appear after dates are assigned.';
      }
      showSmartToast('Fixtures generated and synced live.', { tone: 'success' });
      return;
    }

    pendingFixtureApproval = false;
    approvedWithUnfairness = false;
    saveFixtureCatalog(lastFixtures);
    addFixtureHistorySnapshot(profile.key, lastFixtures);
    loadFixtureDates();
    if (autoFillDates && isAdminMode) {
      autoFillFixtureDates(lastFixtures);
      loadFixtureDates();
    }

    persistActiveSportState();

    renderFixtures(lastFixtures);
  };

  const restoreSavedStateForSport = (sportKey) => {
    const key = String(sportKey || '').trim();
    if (key !== 'soccer' && key !== 'netball') return false;

    const saved = fixtureCreatorState.sports?.[key];
    if (!saved || typeof saved !== 'object') return false;

    const sanitizedFixtures = sanitizeStoredFixturesForSport(key, saved.fixtures || []);
    if (!sanitizedFixtures.length) return false;

    const fixtureTeamIds = Array.from(
      new Set(
        sanitizedFixtures
          .flatMap((entry) => [String(entry.homeId || '').trim(), String(entry.awayId || '').trim()])
          .filter(Boolean)
      )
    );

    const selectedIds = Array.isArray(saved.selectedTeamIds)
      ? saved.selectedTeamIds.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];
    const restoredTeamIds = selectedIds.length ? selectedIds : fixtureTeamIds;
    if (restoredTeamIds.length) {
      setSelectedTeamIds(restoredTeamIds);
    }

    setSelectedFairnessRuleIds(saved.fairnessRuleIds);

    applySportSetupValues(key, saved.setup || {});
    refreshSportPanelState();

    const profile = selectedSportProfile();
    if (!profile) return false;

    const teams = selectedTeamIds();
    const effectiveTeams = teams.length ? teams : fixtureTeamIds;

    const expectedSavedMeetings = parseMatchesPerOpponentPerLeg(saved?.setup?.matchesPerOpponentPerLeg, null);
    const integrity = validateNoDuplicatePairingsPerLeg(sanitizedFixtures, effectiveTeams, expectedSavedMeetings);
    if (!integrity.ok) return false;
    const setup = profile.readSetup();
    lastSportKey = key;
    lastSportLabel = profile.label;
    lastFormatLabel = String(setup.formatLabel || saved.formatLabel || '').trim();
    pinnedFixtureSlotKeys = new Set(normalizePinnedSlotKeys(saved.pinnedSlotKeys));
    pendingFixtureApproval = false;
    lastFixtures = sanitizedFixtures.map((entry) => ({
      ...entry,
      sportKey: key,
      sportLabel: profile.label,
      formatLabel: String(entry.formatLabel || lastFormatLabel || '').trim()
    }));
    pinnedFixtureSlotKeys = new Set(
      Array.from(pinnedFixtureSlotKeys).filter((slotKey) =>
        lastFixtures.some((fixture) => fixtureSlotKey(fixture) === slotKey)
      )
    );

    refreshCurrentUnfairnessReport(lastFixtures);
    approvedWithUnfairness = currentUnfairnessReport.hasUnfairness;

    saveFixtureCatalog(lastFixtures);
    replaceActiveSportFixtureDates(lastFixtures, saved.fixtureDates || {});
    loadFixtureDates();
    renderFixtures(lastFixtures);

    if (statusNode) {
      statusNode.textContent = `${profile.label}: loaded last saved fixture state.`;
    }
    showSmartToast(`${profile.label}: loaded last saved fixture state.`, { tone: 'info' });
    return true;
  };

  const normalizeCatalogSportKey = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'soccer') return 'soccer';
    if (raw === 'netball') return 'netball';
    return '';
  };

  const inferSportFromCatalog = () => {
    try {
      const raw = localStorage.getItem(fixtureCatalogStorageKey);
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return '';
      const sportKeys = Array.from(new Set(
        Object.entries(parsed)
          .flatMap(([fixtureId, entry]) => {
            const idSport = normalizeCatalogSportKey(String(fixtureId || '').split(':')[1] || '');
            const valueSport = normalizeCatalogSportKey(entry?.sportKey || entry?.sport || '');
            return [idSport, valueSport].filter(Boolean);
          })
      ));
      return sportKeys[0] || '';
    } catch {
      return '';
    }
  };

  const restorePublishedCatalogForSport = (sportKey) => {
    let key = String(sportKey || '').trim();
    if (key !== 'soccer' && key !== 'netball') {
      key = inferSportFromCatalog();
    }
    if (key !== 'soccer' && key !== 'netball') return false;

    let parsedCatalog = {};
    try {
      const raw = localStorage.getItem(fixtureCatalogStorageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return false;
      parsedCatalog = parsed;
    } catch {
      return false;
    }

    const reconstructedFixtures = Object.entries(parsedCatalog)
      .map(([fixtureId, entry]) => {
        const parts = String(fixtureId || '').split(':');
        const fixtureSportKey =
          normalizeCatalogSportKey(parts[1]) ||
          normalizeCatalogSportKey(entry?.sportKey || entry?.sport || '');
        if (fixtureSportKey !== key) return null;
        if (!entry || typeof entry !== 'object') return null;
        const fallbackSlot = `${String(entry.leg || 'First')}::R${parsePositiveInt(entry.round, 1)}M${parsePositiveInt(entry.match, 1)}`;
        return {
          slotKey: String(parts.slice(2).join(':') || entry.slotKey || fallbackSlot).trim(),
          round: parsePositiveInt(entry.round, 1),
          leg: String(entry.leg || '').trim() || 'First',
          match: parsePositiveInt(entry.match, 1),
          homeId: String(entry.homeId || '').trim(),
          awayId: String(entry.awayId || '').trim(),
          sportKey: fixtureSportKey,
          sportLabel: String(entry.sport || '').trim(),
          formatLabel: String(entry.format || '').trim()
        };
      })
      .filter(Boolean)
      .filter((entry) => entry.homeId && entry.awayId && entry.homeId !== entry.awayId)
      .sort((left, right) => {
        if (left.round !== right.round) return left.round - right.round;
        if (left.match !== right.match) return left.match - right.match;
        return left.slotKey.localeCompare(right.slotKey);
      });

    if (!reconstructedFixtures.length) return false;

    const fixtureTeamIds = Array.from(
      new Set(reconstructedFixtures.flatMap((entry) => [entry.homeId, entry.awayId]).filter(Boolean))
    );
    const integrity = validateNoDuplicatePairingsPerLeg(reconstructedFixtures, fixtureTeamIds);
    if (!integrity.ok) return false;

    if (fixtureTeamIds.length) {
      setSelectedTeamIds(fixtureTeamIds);
    }

    const profile = selectedSportProfile();
    if (!profile) return false;
    const setup = profile.readSetup();

    lastSportKey = key;
    lastSportLabel = profile.label;
    lastFormatLabel = String(setup.formatLabel || reconstructedFixtures[0]?.formatLabel || '').trim();
    pendingFixtureApproval = false;
    approvedWithUnfairness = false;
    pinnedFixtureSlotKeys = new Set();
    lastFixtures = reconstructedFixtures.map((entry) => ({
      ...entry,
      sportLabel: profile.label,
      formatLabel: String(entry.formatLabel || lastFormatLabel || '').trim()
    }));

    refreshCurrentUnfairnessReport(lastFixtures);
    loadFixtureDates();
    renderFixtures(lastFixtures);

    if (statusNode) {
      statusNode.textContent = `${profile.label}: restored ${lastFixtures.length} saved fixture(s) from published catalog.`;
    }
    return true;
  };

  const escapeCsvValue = (value) => {
    const normalized = String(value ?? '').replace(/"/g, '""');
    return `"${normalized}"`;
  };

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const buildExportBaseName = () => {
    const safeCompetition = (config.competition || 'season-fixtures')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const stamp = new Date().toISOString().slice(0, 10);
    return `${safeCompetition || 'season-fixtures'}-${stamp}`;
  };

  const getFixtureEpochForExport = (fixture) => {
    const fixtureId = getFixtureId(fixture);
    const stamp = splitFixtureStamp(fixtureDates[fixtureId]);
    if (!stamp.date) return Number.MAX_SAFE_INTEGER;
    const parsed = new Date(`${stamp.date}T${stamp.time || '23:59'}`).getTime();
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  };

  const getExportFixtures = () => {
    if (lastRenderedFixtureOrder.length === lastFixtures.length && lastRenderedFixtureOrder.length > 0) {
      return [...lastRenderedFixtureOrder];
    }

    return [...lastFixtures].sort((left, right) => {
      const leftEpoch = getFixtureEpochForExport(left);
      const rightEpoch = getFixtureEpochForExport(right);
      if (leftEpoch !== rightEpoch) return leftEpoch - rightEpoch;
      if (left.round !== right.round) return left.round - right.round;
      if (left.match !== right.match) return left.match - right.match;
      return getFixtureId(left).localeCompare(getFixtureId(right));
    });
  };

  const buildVisibleMatchLabelMap = (fixtures) => {
    const scopeCounts = {};
    const labels = {};

    (fixtures || []).forEach((fixture) => {
      const scopeKey = `${Number(fixture?.round) || 0}::${String(fixture?.leg || '').trim()}`;
      scopeCounts[scopeKey] = (scopeCounts[scopeKey] || 0) + 1;
      const fixtureId = getFixtureId(fixture);
      labels[fixtureId] = `R${fixture.round}M${scopeCounts[scopeKey]}`;
    });

    return labels;
  };

  const buildFixtureCsvContent = () => {
    const exportFixtures = getExportFixtures();
    const visibleMatchLabelById = buildVisibleMatchLabelMap(exportFixtures);
    const lines = [
      ['Competition', config.competition || ''].map(escapeCsvValue).join(','),
      ['Sport', lastSportLabel || ''].map(escapeCsvValue).join(','),
      ['Format', lastFormatLabel || ''].map(escapeCsvValue).join(','),
      ['Venue', config.venue || ''].map(escapeCsvValue).join(','),
      '',
      ['Round', 'Leg', 'Match', 'Date', 'Kickoff', 'Format', 'Home', 'Away'].map(escapeCsvValue).join(',')
    ];

    exportFixtures.forEach((fixture) => {
      const fixtureId = getFixtureId(fixture);
      const stampValue = splitFixtureStamp(fixtureDates[fixtureId]);
      lines.push(
        [
          fixture.round,
          fixture.leg,
          visibleMatchLabelById[fixtureId] || `R${fixture.round}M${fixture.match}`,
          stampValue.date || '',
          stampValue.time || '',
          fixture.formatLabel || '',
          teamNameById(fixture.homeId),
          teamNameById(fixture.awayId)
        ]
          .map(escapeCsvValue)
          .join(',')
      );
    });

    return lines.join('\n');
  };

  exportButton.addEventListener('click', async () => {
    if (!lastFixtures.length) {
      generateFixtures();
      if (!lastFixtures.length) return;
    }

    const baseName = buildExportBaseName();

    const formatFriendlyDate = (dateValue) => {
      const normalized = normalizeDateOnly(dateValue);
      if (!normalized) return 'TBD';
      const parsed = new Date(`${normalized}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return normalized;
      return parsed.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    };

    try {
      const exportFixtures = getExportFixtures();
      const visibleMatchLabelById = buildVisibleMatchLabelMap(exportFixtures);
      const compactFormatLabel = (value) => {
        const raw = normalizeText(value, 220);
        if (!raw) return '';
        const structureMatch = raw.match(/(\d+)\s*x\s*(\d+)\s*min/i);
        const repeatMatch = raw.match(/(\d+)x\s+per\s+opponent\s+per\s+leg/i);
        if (structureMatch) {
          const base = `${structureMatch[1]}x${structureMatch[2]} min`;
          const repeatSuffix = repeatMatch ? ` · ${repeatMatch[1]}x/leg` : '';
          return `${base}${repeatSuffix}`;
        }
        return raw.length > 30 ? `${raw.slice(0, 27)}…` : raw;
      };

      const fixtureRows = [];
      let previousRound = Number.NaN;
      let previousLeg = '';
      let secondLegBannerInserted = false;

      exportFixtures.forEach((fixture) => {
        const fixtureId = getFixtureId(fixture);
        const stampValue = splitFixtureStamp(fixtureDates[fixtureId]);
        const normalizedLeg = String(fixture.leg || '').trim();
        const isNewLeg = normalizedLeg !== previousLeg;
        const isNewRound = Number(fixture.round) !== Number(previousRound);

        if (!secondLegBannerInserted && /^return$/i.test(normalizedLeg)) {
          fixtureRows.push({
            round: 'SECOND LEG STARTS',
            leg: '',
            match: '',
            date: '',
            kickoff: '',
            format: '',
            home: '',
            away: '',
            __kind: 'leg-break'
          });
          secondLegBannerInserted = true;
        }

        if (isNewLeg || isNewRound) {
          fixtureRows.push({
            round: `Round ${fixture.round} • ${normalizedLeg || 'Leg'}`,
            leg: '',
            match: '',
            date: '',
            kickoff: '',
            format: '',
            home: '',
            away: '',
            __kind: 'round-break'
          });
        }

        fixtureRows.push({
          round: fixture.round,
          leg: normalizedLeg,
          match: visibleMatchLabelById[fixtureId] || `R${fixture.round}M${fixture.match}`,
          date: formatFriendlyDate(stampValue.date),
          kickoff: stampValue.time || 'TBD',
          format: compactFormatLabel(fixture.formatLabel || ''),
          home: teamNameById(fixture.homeId),
          away: teamNameById(fixture.awayId),
          __kind: 'fixture'
        });

        previousRound = Number(fixture.round);
        previousLeg = normalizedLeg;
      });

      const selectedRuleLabels = selectedFairnessRuleIds()
        .map((ruleId) => fairnessRuleLabelById(ruleId))
        .map((label) => normalizeText(label, 200))
        .filter(Boolean);
      const firstLegCount = exportFixtures.filter((entry) => String(entry.leg || '').trim() === 'First').length;
      const returnLegCount = exportFixtures.filter((entry) => String(entry.leg || '').trim() === 'Return').length;
      const fixtureTeamCount = Array.from(new Set(exportFixtures.flatMap((entry) => [entry.homeId, entry.awayId]).filter(Boolean))).length;
      const pinnedCount = getPinnedFixtureIndexes(lastFixtures).length;

      await exportProfessionalWorkbook({
        fileName: `${baseName}.xlsx`,
        sheetName: 'Fixtures',
        title: 'Official Sports Fixture',
        contextLine: `${config.competition || 'Inter-House League'}${lastSportLabel ? ` • ${lastSportLabel}` : ''}`,
        metaLine: config.venue ? `Venue: ${config.venue}` : '',
        columns: [
          { header: 'Round', key: 'round', width: 8, align: 'center' },
          { header: 'Leg', key: 'leg', width: 11, align: 'center' },
          { header: 'Match', key: 'match', width: 12, align: 'center' },
          { header: 'Date', key: 'date', width: 18, align: 'center' },
          { header: 'Kickoff', key: 'kickoff', width: 10, align: 'center' },
          { header: 'Format', key: 'format', width: 28, align: 'center', wrapText: true },
          { header: 'Home', key: 'home', width: 17, align: 'left' },
          { header: 'Away', key: 'away', width: 17, align: 'left' }
        ],
        rows: fixtureRows,
        note: 'Important NB: Fixtures subject to change without prior notice.',
        signatures: [
          {
            anchor: 'right',
            name: 'Mr. B.C Dlamini',
            role: 'Sports Committee Coordinator',
            shiftColumns: 2
          }
        ],
        footerSections: [
          {
            title: 'Fixture Summary',
            lines: [
              `Total fixtures: ${exportFixtures.length} (${firstLegCount} First leg, ${returnLegCount} Return leg).`,
              `Teams scheduled: ${fixtureTeamCount}.`,
              `Matches per opponent per leg: ${configuredMatchesPerOpponentPerLeg()}.`,
              `Pinned fixture constraints: ${pinnedCount}.`,
              currentUnfairnessReport.hasUnfairness
                ? `Fairness check status: ${currentUnfairnessReport.affectedFixtureCount} fixture(s) currently flagged.`
                : 'Fairness check status: no active fairness violations in current draft.'
            ]
          },
          {
            title: 'Applied Fairness Rules',
            lines: selectedRuleLabels.length
              ? selectedRuleLabels.map((label, index) => `${index + 1}. ${label}`)
              : ['No fairness rules selected by admin.']
          }
        ],
        afterRows: ({ sheet, dataStartRow }) => {
          const endColumn = 'H';
          fixtureRows.forEach((row, rowIndex) => {
            if (!row.__kind || row.__kind === 'fixture') return;
            const targetRow = dataStartRow + rowIndex;
            sheet.mergeCells(`A${targetRow}:${endColumn}${targetRow}`);
            const titleCell = sheet.getCell(`A${targetRow}`);
            titleCell.value = row.round || '';
            titleCell.font = {
              name: 'Calibri',
              size: row.__kind === 'leg-break' ? 10.5 : 10,
              bold: true,
              color: { argb: 'FF173A5E' }
            };
            titleCell.alignment = {
              horizontal: row.__kind === 'leg-break' ? 'center' : 'left',
              vertical: 'middle'
            };
            titleCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: row.__kind === 'leg-break' ? 'FFEAF3FF' : 'FFF5FAFF' }
            };
            sheet.getRow(targetRow).height = row.__kind === 'leg-break' ? 22 : 20;
          });
        }
      });
      showSmartToast('Professional fixture file exported (.xlsx).', { tone: 'success' });
      return;
    } catch {
      downloadBlob(
        new Blob([buildFixtureCsvContent()], { type: 'text/csv;charset=utf-8' }),
        `${baseName}.csv`
      );
      showSmartToast('Exported CSV fallback.', { tone: 'info' });
    }
  });

  exportCsvButton?.addEventListener('click', () => {
    if (!lastFixtures.length) {
      generateFixtures();
      if (!lastFixtures.length) return;
    }

    const baseName = buildExportBaseName();
    downloadBlob(
      new Blob([buildFixtureCsvContent()], { type: 'text/csv;charset=utf-8' }),
      `${baseName}.csv`
    );
    showSmartToast('CSV fixture exported.', { tone: 'success' });
  });

  generateButton.addEventListener('click', () => {
    const wantsAutoFill = isAdminMode && autoFillToggle instanceof HTMLInputElement && autoFillToggle.checked;
    generateFixtures({ autoFillDates: wantsAutoFill });
    workflowSteps?.expandStep('review-fixtures');
    const statusMessage = String(statusNode?.textContent || '').trim();
    if (statusMessage) {
      const isError = /unable|could not|required|select|missing|invalid|no\s+school\s+terms/i.test(statusMessage);
      showSmartToast(statusMessage, { tone: isError ? 'error' : 'success' });
    }
  });
  teamPickInputs.forEach((input) => {
    input.addEventListener('change', generateFixtures);
  });

  const applyFairnessRulesSelection = () => {
    persistActiveSportState();
    if (!lastFixtures.length) return;

    const enforcement = enforceSelectedFairnessRules({
      fixtures: lastFixtures,
      teamIds: fairnessTeamIdsForFixtures(lastFixtures),
      selectedRuleIds: selectedFairnessRuleIds(),
      lockedIndexes: getPinnedFixtureIndexes(lastFixtures)
    });

    if (!enforcement.ok) {
      currentUnfairnessReport =
        enforcement.report ||
        buildFairnessReport(lastFixtures, fairnessTeamIdsForFixtures(lastFixtures), selectedFairnessRuleIds());
      pendingFixtureApproval = true;
      approvedWithUnfairness = false;
      renderFixtures(lastFixtures);
      if (statusNode) {
        statusNode.textContent = `Selected fairness rules require adjustments: ${enforcement.message}`;
      }
      return;
    }

    lastFixtures = enforcement.fixtures;
    refreshCurrentUnfairnessReport(lastFixtures);
    if (isAdminMode) {
      pendingFixtureApproval = true;
      approvedWithUnfairness = false;
    } else {
      pendingFixtureApproval = false;
      approvedWithUnfairness = currentUnfairnessReport.hasUnfairness;
      saveFixtureCatalog(lastFixtures);
    }
    persistActiveSportState();
    renderFixtures(lastFixtures);
    if (statusNode) {
      statusNode.textContent = 'Fairness rules updated and applied to current fixtures.';
    }
  };

  const resolveFairnessModalNode = () => {
    if (fairnessModal instanceof HTMLElement) {
      return portalOverlayToBody(fairnessModal, fairnessModalPortalKey);
    }
    const existing = document.querySelector(`[data-overlay-portal-key="${fairnessModalPortalKey}"]`);
    return existing instanceof HTMLElement ? existing : null;
  };

  const closeFairnessModal = () => {
    const modalNode = resolveFairnessModalNode();
    if (!(modalNode instanceof HTMLElement)) return;
    modalNode.classList.add('is-hidden');
    modalNode.style.removeProperty('display');
    modalNode.style.removeProperty('visibility');
    modalNode.style.removeProperty('opacity');
    modalNode.style.removeProperty('pointer-events');
  };

  const openFairnessModal = () => {
    const modalNode = resolveFairnessModalNode();
    if (!(modalNode instanceof HTMLElement)) {
      if (statusNode) {
        statusNode.textContent = 'Could not open fairness rules modal. Please refresh and try again.';
      }
      showSmartToast('Could not open fairness rules modal.', { tone: 'error' });
      return;
    }

    syncFairnessCheckboxesFromState();
    refreshFairnessRuleCompatibilityUi();
    modalNode.classList.remove('is-hidden');
    modalNode.style.display = 'grid';
    modalNode.style.visibility = 'visible';
    modalNode.style.opacity = '1';
    modalNode.style.pointerEvents = 'auto';
  };

  fairnessOpenButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openFairnessModal();
  });

  fixtureNode.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const trigger = target.closest('[data-fixture-open-fairness-modal]');
    if (!(trigger instanceof HTMLButtonElement)) return;
    event.preventDefault();
    event.stopPropagation();
    openFairnessModal();
  });

  fairnessRulesSelect?.addEventListener('change', () => {
    refreshFairnessSummary();
    renderFairnessDropdownOptions();
  });

  fairnessCloseButtons.forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    button.addEventListener('click', () => {
      closeFairnessModal();
    });
  });

  fairnessRuleCheckboxes.forEach((checkbox) => {
    if (!(checkbox instanceof HTMLInputElement)) return;
    checkbox.addEventListener('change', () => {
      refreshFairnessRuleCompatibilityUi();
    });
  });

  fairnessApplyButton?.addEventListener('click', () => {
    const selectedRuleIds = fairnessRuleCheckboxes
      .filter((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked)
      .map((checkbox) => String(checkbox.value || '').trim())
      .filter(Boolean);

    if (!selectedRuleIds.length) {
      const allowNoRules = window.confirm(
        'No fairness rules are selected. Continue without fairness checks? This may allow uneven or conflicting fixtures.'
      );
      if (!allowNoRules) {
        return;
      }
    }

    setSelectedFairnessRuleIds(selectedRuleIds);
    closeFairnessModal();
    showSmartToast(
      selectedRuleIds.length === 0
        ? 'No fairness rules selected.'
        : `Applied ${selectedRuleIds.length} fairness rule${selectedRuleIds.length === 1 ? '' : 's'}.`,
      { tone: selectedRuleIds.length === 0 ? 'info' : 'success' }
    );
  });

  resolveFairnessModalNode()?.addEventListener('click', (event) => {
    if (event.target === resolveFairnessModalNode()) {
      closeFairnessModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeFairnessModal();
  });

  rulesSaveButton?.addEventListener('click', () => {
    const saved = saveDateRules();
    if (saved) {
      showSmartToast('Fixture date rules saved.', { tone: 'success' });
      return;
    }
    const statusMessage = String(rulesStatusNode?.textContent || '').trim();
    if (statusMessage) {
      showSmartToast(statusMessage, { tone: 'error' });
    }
  });

  rulesPreviewButton?.addEventListener('click', () => {
    buildAutoFillPreview();
    const statusMessage = String(rulesStatusNode?.textContent || '').trim();
    if (statusMessage) {
      const isError = /generate fixtures first|could not|invalid|set a start date|select at least one/i.test(statusMessage);
      showSmartToast(statusMessage, { tone: isError ? 'error' : 'success' });
    }
  });

  rulesPreviewNode?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-fixture-rules-apply-preview]');
    if (!(button instanceof HTMLButtonElement)) return;
    applyPreviewedDates();
    const statusMessage = String(rulesStatusNode?.textContent || statusNode?.textContent || '').trim();
    if (statusMessage) {
      const isError = /no preview|please preview again|changed after preview|invalid|could not/i.test(statusMessage);
      showSmartToast(statusMessage, { tone: isError ? 'error' : 'success' });
    }
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
      const dateInput = row.querySelector('[data-fixture-date-input]');
      const timeInput = row.querySelector('[data-fixture-time-input]');
      const nextDate = String(dateInput instanceof HTMLInputElement ? dateInput.value : '').trim();
      const nextTime = String(timeInput instanceof HTMLInputElement ? timeInput.value : '').trim();
      const nextStamp = combineFixtureDateTime(nextDate, nextTime);
      if (!nextStamp) {
        delete fixtureDates[fixtureId];
      } else {
        fixtureDates[fixtureId] = nextStamp;
      }
      if (isAdminMode) {
        pendingFixtureApproval = true;
        approvedWithUnfairness = false;
      }
      persistFixtureDatesToStorage();
      renderFixtures(lastFixtures);
      return;
    }

    if (target.matches('[data-fixture-time-input]') && target instanceof HTMLInputElement) {
      const dateInput = row.querySelector('[data-fixture-date-input]');
      const timeInput = row.querySelector('[data-fixture-time-input]');
      const nextDate = String(dateInput instanceof HTMLInputElement ? dateInput.value : '').trim();
      const nextTime = String(timeInput instanceof HTMLInputElement ? timeInput.value : '').trim();
      const nextStamp = combineFixtureDateTime(nextDate, nextTime);
      if (!nextStamp) {
        delete fixtureDates[fixtureId];
      } else {
        fixtureDates[fixtureId] = nextStamp;
      }
      if (isAdminMode) {
        pendingFixtureApproval = true;
        approvedWithUnfairness = false;
      }
      persistFixtureDatesToStorage();
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
        nextAwayId: nextAway,
        lockedIndexes: getPinnedFixtureIndexes(lastFixtures),
        selectedRuleIds: selectedFairnessRuleIds(),
        matchesPerOpponentPerLeg: configuredMatchesPerOpponentPerLeg()
      });

      if (!repairResult.ok) {
        if (statusNode) statusNode.textContent = repairResult.message;
        renderFixtures(lastFixtures);
        return;
      }

      lastFixtures = repairResult.fixtures;
      refreshCurrentUnfairnessReport(lastFixtures);
      pendingFixtureApproval = isAdminMode;
      approvedWithUnfairness = !isAdminMode && currentUnfairnessReport.hasUnfairness;
      saveFixtureCatalog(lastFixtures);
      persistActiveSportState();
      renderFixtures(lastFixtures);
      if (statusNode) {
        if (pendingFixtureApproval) {
          statusNode.textContent = currentUnfairnessReport.hasUnfairness
            ? `Live fixture draft updated with fairness concerns in ${currentUnfairnessReport.affectedFixtureCount} fixture(s).`
            : 'Live fixture draft updated and synced.';
        } else {
          statusNode.textContent = repairResult.affectedOtherCount > 0
            ? `Fixture updated. ${repairResult.affectedOtherCount} additional fixture(s) auto-adjusted to preserve round-robin rules.`
            : 'Fixture updated with round-robin integrity preserved.';
        }
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
        nextAwayId: nextAway,
        lockedIndexes: getPinnedFixtureIndexes(lastFixtures),
        selectedRuleIds: selectedFairnessRuleIds(),
        matchesPerOpponentPerLeg: configuredMatchesPerOpponentPerLeg()
      });

      if (!repairResult.ok) {
        if (statusNode) statusNode.textContent = repairResult.message;
        renderFixtures(lastFixtures);
        return;
      }

      lastFixtures = repairResult.fixtures;
      refreshCurrentUnfairnessReport(lastFixtures);
      pendingFixtureApproval = isAdminMode;
      approvedWithUnfairness = !isAdminMode && currentUnfairnessReport.hasUnfairness;
      saveFixtureCatalog(lastFixtures);
      persistActiveSportState();
      renderFixtures(lastFixtures);
      if (statusNode) {
        if (pendingFixtureApproval) {
          statusNode.textContent = currentUnfairnessReport.hasUnfairness
            ? `Live fixture draft updated with fairness concerns in ${currentUnfairnessReport.affectedFixtureCount} fixture(s).`
            : 'Live fixture draft updated and synced.';
        } else {
          statusNode.textContent = repairResult.affectedOtherCount > 0
            ? `Fixture updated. ${repairResult.affectedOtherCount} additional fixture(s) auto-adjusted to preserve round-robin rules.`
            : 'Fixture updated with round-robin integrity preserved.';
        }
      }
    }
  });

  bodyNode.addEventListener('click', (event) => {
    if (!isAdminMode) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const pinToggle = target.closest('[data-fixture-pin-toggle]');
    if (pinToggle instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      const row = pinToggle.closest('[data-fixture-row]');
      if (!(row instanceof HTMLElement)) return;
      const rowIndex = Number.parseInt(row.dataset.fixtureRow || '', 10);
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= lastFixtures.length) return;

      const fixture = lastFixtures[rowIndex];
      const slotKey = fixtureSlotKey(fixture);
      if (!slotKey) return;

      if (pinnedFixtureSlotKeys.has(slotKey)) {
        pinnedFixtureSlotKeys.delete(slotKey);
      } else {
        pinnedFixtureSlotKeys.add(slotKey);
      }

      const enforcement = enforceSelectedFairnessRules({
        fixtures: lastFixtures,
        teamIds: fairnessTeamIdsForFixtures(lastFixtures),
        selectedRuleIds: selectedFairnessRuleIds(),
        lockedIndexes: getPinnedFixtureIndexes(lastFixtures)
      });

      if (!enforcement.ok) {
        if (pinnedFixtureSlotKeys.has(slotKey)) {
          pinnedFixtureSlotKeys.delete(slotKey);
        } else {
          pinnedFixtureSlotKeys.add(slotKey);
        }
        if (statusNode) {
          statusNode.textContent = `Pin action rejected: ${enforcement.message}`;
        }
        renderFixtures(lastFixtures);
        return;
      }

      lastFixtures = enforcement.fixtures;

      if (isAdminMode) {
        pendingFixtureApproval = true;
        approvedWithUnfairness = false;
      }
      saveFixtureCatalog(lastFixtures);
      persistActiveSportState();
      renderFixtures(lastFixtures);
      if (statusNode) {
        statusNode.textContent = pinnedFixtureSlotKeys.has(slotKey)
          ? 'Fixture pinned. Auto-generate will keep this match fixed and rebalance the rest to preserve round-robin fairness.'
          : 'Fixture unpinned. Auto-generate can now rebalance this slot normally.';
      }
      return;
    }

    const trigger = target.closest('[data-fixture-open-log]');
    if (!(trigger instanceof HTMLElement)) return;

    event.preventDefault();
    const fixtureId = String(trigger.dataset.fixtureLogId || '').trim();
    const fixtureDate = normalizeFixtureDateOnlyGlobal(trigger.dataset.fixtureLogDate || '');
    if (!fixtureId) return;

    window.dispatchEvent(
      new CustomEvent('bhanoyi:open-match-log-modal', {
        detail: {
          fixtureSectionKey,
          fixtureId,
          fixtureDate,
          preferredSide: 'left'
        }
      })
    );
  });

  const approveFixturePreview = ({ allowUnfairness = false } = {}) => {
    if (!isAdminMode) return;
    if (!lastFixtures.length) return;

    refreshCurrentUnfairnessReport(lastFixtures);
    const hasUnfairness = currentUnfairnessReport.hasUnfairness;

    if (hasUnfairness) {
      pendingFixtureApproval = true;
      approvedWithUnfairness = false;
      renderFixtures(lastFixtures);
      if (statusNode) {
        statusNode.textContent = 'Selected fairness rules are mandatory. Resolve highlighted issues before finalizing.';
      }
      showSmartToast('Selected fairness rules are mandatory and cannot be bypassed.', { tone: 'info' });
      return;
    }

    pendingFixtureApproval = false;
    approvedWithUnfairness = hasUnfairness && allowUnfairness;
    persistFixtureDatesToStorage();
    saveFixtureCatalog(lastFixtures);
    persistActiveSportState();
    renderFixtures(lastFixtures);

    if (statusNode) {
      statusNode.textContent = approvedWithUnfairness
        ? `Fixtures approved with fairness warnings (${currentUnfairnessReport.affectedFixtureCount} highlighted fixture${currentUnfairnessReport.affectedFixtureCount === 1 ? '' : 's'}).`
        : 'Fixtures approved after fairness validation.';
    }

    showSmartToast(
      approvedWithUnfairness
        ? 'Fixtures approved with fairness warnings and synced to calendar.'
        : 'Fixtures approved and synced to calendar.',
      { tone: approvedWithUnfairness ? 'info' : 'success' }
    );
  };

  approveResolvedButton?.addEventListener('click', () => {
    approveFixturePreview({ allowUnfairness: false });
  });

  approveAnywayButton?.addEventListener('click', () => {
    approveFixturePreview({ allowUnfairness: true });
  });

  saveDraftButton?.addEventListener('click', () => {
    if (!lastFixtures.length) {
      if (statusNode) {
        statusNode.textContent = 'No fixtures to save yet. Generate fixtures first.';
      }
      showSmartToast('No fixtures to save yet. Generate fixtures first.', { tone: 'error' });
      return;
    }

    saveFixtureCatalog(lastFixtures);
    persistActiveSportState();
    persistFixtureDatesToStorage();
    if (statusNode) {
      statusNode.textContent = 'Fixture draft saved and kept live for calendar, match logs, and standings.';
    }
    showSmartToast('Fixture draft saved and synced live.', { tone: 'success' });
  });

  fixtureTemplateSelect?.addEventListener('change', () => {
    selectedFixtureTemplateId = String(fixtureTemplateSelect.value || '').trim();
    if (!selectedFixtureTemplateId) {
      if (statusNode instanceof HTMLElement) {
        statusNode.textContent = 'No template selected.';
      }
      return;
    }

    const templateEntry = fixtureTemplateHistory.find((entry) => entry.id === selectedFixtureTemplateId);
    if (!templateEntry) {
      if (statusNode instanceof HTMLElement) {
        statusNode.textContent = 'Selected template was not found.';
      }
      return;
    }

    if (sportSelect instanceof HTMLSelectElement && sportSelect.value !== templateEntry.sportKey) {
      sportSelect.value = templateEntry.sportKey;
      refreshSportPanelState();
    }

    const profile = selectedSportProfile();
    const targetSportKey = profile?.key || templateEntry.sportKey;
    const targetSportLabel = profile?.label || (templateEntry.sportKey === 'netball' ? 'Netball' : 'Soccer');
    const setup = profile?.readSetup?.() || {};
    const normalizedFormatLabel = String(setup.formatLabel || '').trim();

    const templateFixtures = sanitizeStoredFixturesForSport(targetSportKey, templateEntry.fixtures || []).map((entry) => ({
      ...entry,
      sportKey: targetSportKey,
      sportLabel: targetSportLabel,
      formatLabel: String(entry.formatLabel || normalizedFormatLabel || '').trim()
    }));

    if (!templateFixtures.length) {
      if (statusNode instanceof HTMLElement) {
        statusNode.textContent = 'Selected template has no valid fixtures to load.';
      }
      return;
    }

    const templateTeamIds = Array.from(
      new Set(templateFixtures.flatMap((entry) => [entry.homeId, entry.awayId]).filter(Boolean))
    );
    if (templateTeamIds.length) {
      setSelectedTeamIds(templateTeamIds);
    }

    lastSportKey = targetSportKey;
    lastSportLabel = targetSportLabel;
    lastFormatLabel = normalizedFormatLabel || String(templateFixtures[0]?.formatLabel || '').trim();
    lastFixtures = templateFixtures;
    pinnedFixtureSlotKeys = new Set();
    pendingFixtureApproval = true;
    approvedWithUnfairness = false;
    refreshCurrentUnfairnessReport(lastFixtures);
    replaceActiveSportFixtureDates(lastFixtures, {}, { persist: false });
    persistActiveSportState();
    saveFixtureCatalog(lastFixtures);
    const restoredTemplateDates = replaceActiveSportFixtureDates(lastFixtures, templateEntry.fixtureDates || {});
    if (!Object.keys(restoredTemplateDates).length) {
      autoFillFixtureDatesSilently(lastFixtures);
    }
    loadFixtureDates();
    persistActiveSportState();
    renderFixtures(lastFixtures);

    if (statusNode instanceof HTMLElement) {
      const hasTemplateDates = Object.keys(getFixtureDateSnapshot(lastFixtures)).length > 0;
      statusNode.textContent = hasTemplateDates
        ? `Template loaded and synced (${lastFixtures.length} fixtures). Calendar and standings now follow this ${targetSportLabel.toLowerCase()} fixture set.`
        : `Template loaded and synced (${lastFixtures.length} fixtures). Standings and logs are live; calendar events will appear after dates are assigned.`;
    }
  });

  sportSelect?.addEventListener('change', () => {
    hydrateDateRules(activeRulesBucket());
    const activeSport = selectedSportKey();
    if (activeSport) {
      fixtureCreatorState.lastSport = activeSport;
      saveFixtureCreatorState();
    }
    refreshSportPanelState();
    renderFixtureTemplateOptions();
    if (!restoreSavedStateForSport(activeSport)) {
      setSelectedFairnessRuleIds(defaultFairnessRuleIds);
      pinnedFixtureSlotKeys = new Set();
      generateFixtures();
    }
  });

  [
    soccerHalvesInput,
    soccerHalfMinutesInput,
    soccerBreakMinutesInput,
    netballQuartersInput,
    netballQuarterMinutesInput,
    netballBreakMinutesInput,
    netballHalfTimeMinutesInput,
    meetingsPerLegInput
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
    if (event.key !== fixtureDateStorageKey && event.key !== matchLogByFixtureStorageKey) return;
    loadFixtureDates();
    renderFixtures(lastFixtures);
  });

  window.addEventListener('bhanoyi:fixtures-updated', (event) => {
    const sectionKey = String(event?.detail?.sectionKey || '').trim();
    if (sectionKey && sectionKey !== fixtureSectionKey) return;
    loadFixtureDates();
    renderFixtures(lastFixtures);
  });

  window.addEventListener('bhanoyi:match-log-updated', (event) => {
    const sectionKey = String(event?.detail?.fixtureSectionKey || '').trim();
    if (sectionKey && sectionKey !== fixtureSectionKey) return;
    renderFixtures(lastFixtures);
  });

  const bootstrapFixtureCreatorState = async () => {
    await Promise.all([
      syncLocalStoreFromRemote(fixtureCatalogStorageKey),
      syncLocalStoreFromRemote(fixtureDateStorageKey),
      syncLocalStoreFromRemote(fixtureRulesStorageKey),
      syncLocalStoreFromRemote(fixtureCreatorStateStorageKey),
      syncLocalStoreFromRemote(fixtureHistoryStorageKey)
    ]).catch(() => null);

    loadFixtureDates();
    loadFixtureCreatorState();
    loadFixtureTemplateHistory();
    if (sportSelect instanceof HTMLSelectElement) {
      const savedSport = String(fixtureCreatorState.lastSport || '').trim();
      const fallbackSport = inferSportFromCatalog();
      const bootSport = savedSport === 'soccer' || savedSport === 'netball' ? savedSport : fallbackSport;
      if (bootSport === 'soccer' || bootSport === 'netball') {
        sportSelect.value = bootSport;
      }
    }
    hydrateDateRules(activeRulesBucket());
    refreshSportPanelState();
    renderFixtureTemplateOptions();
    refreshFairnessSummary();
    renderFairnessDropdownOptions();
    const bootSport = selectedSportKey();
    if (!restoreSavedStateForSport(bootSport) && !restorePublishedCatalogForSport(bootSport || inferSportFromCatalog())) {
      generateFixtures();
    }
  };

  void bootstrapFixtureCreatorState();
};

const renderSchoolCalendarSection = (section, sectionIndex) => {
  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;
  const adminMode = isAdminModeEnabled();
  const config = {
    sectionKey: fallbackSectionKey,
    fixtureSectionKey: (section.fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator'
  };

  return `
    <section class="section ${section.alt ? 'section-alt' : ''}" data-section-index="${sectionIndex}" data-section-type="calendar" data-section-key="${fallbackSectionKey}">
      <div class="container">
        <h2>${section.title || 'View School Calendar'}</h2>
        ${section.body ? `<p class="lead">${section.body}</p>` : ''}
        <article class="panel school-calendar-shell" data-school-calendar-shell="true" data-school-calendar-config="${escapeHtmlAttribute(JSON.stringify(config))}">
          <div class="calendar-event-editor-backdrop is-hidden" data-calendar-editor-backdrop></div>
          <section class="calendar-workflow-step is-expanded" data-calendar-workflow-step data-calendar-default-open>
            <button type="button" class="calendar-workflow-toggle" data-calendar-workflow-toggle aria-expanded="true">
              <span>View Calendar Month</span>
            </button>
            <div class="calendar-workflow-body" data-calendar-workflow-body>
              <div class="school-calendar-root" data-school-calendar></div>
            </div>
          </section>
          ${
            adminMode
              ? `
          <section class="calendar-workflow-step is-collapsed" data-calendar-workflow-step data-calendar-admin-only>
            <button type="button" class="calendar-workflow-toggle" data-calendar-workflow-toggle aria-expanded="false">
              <span>Create Event</span>
            </button>
            <div class="calendar-workflow-body" data-calendar-workflow-body>
              <div class="school-calendar-admin is-hidden" data-calendar-admin-panel>
                <div class="calendar-editor-head">
                  <button type="button" class="btn btn-secondary" data-calendar-editor-close>Close editor</button>
                </div>
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
              </div>
            </div>
          </section>
          <section class="calendar-workflow-step is-collapsed" data-calendar-workflow-step data-calendar-admin-only>
            <button type="button" class="calendar-workflow-toggle" data-calendar-workflow-toggle aria-expanded="false">
              <span>Manage Event Types</span>
            </button>
            <div class="calendar-workflow-body" data-calendar-workflow-body>
              <div class="school-event-types-editor" data-event-types-editor>
                <div class="school-event-types-list" data-event-types-list></div>
                <div class="school-calendar-actions">
                  <button type="button" class="btn btn-secondary" data-event-type-add>Add type</button>
                  <button type="button" class="btn btn-secondary" data-event-types-save>Save types</button>
                </div>
                <p class="school-calendar-status" data-event-types-status aria-live="polite"></p>
              </div>
            </div>
          </section>
          <section class="calendar-workflow-step is-collapsed" data-calendar-workflow-step data-calendar-admin-only>
            <button type="button" class="calendar-workflow-toggle" data-calendar-workflow-toggle aria-expanded="false">
              <span>Set School Terms</span>
            </button>
            <div class="calendar-workflow-body" data-calendar-workflow-body>
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
          </section>
              `
              : ''
          }
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
                <h3>Choose Sports Event Options</h3>
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
  const editorBackdrop = calendarShell.querySelector('[data-calendar-editor-backdrop]');
  const editorCloseButton = calendarShell.querySelector('[data-calendar-editor-close]');
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

  portalOverlayToBody(dayOverlay, 'calendar-day-overlay');
  portalOverlayToBody(sportsOverlay, 'calendar-sports-overlay');
  portalOverlayToBody(editorBackdrop, 'calendar-editor-backdrop');

  const adminOnlyBlocks = Array.from(calendarShell.querySelectorAll('[data-calendar-admin-only]'));
  const workflowSteps = Array.from(calendarShell.querySelectorAll('[data-calendar-workflow-step]'))
    .map((stepNode) => {
      if (!(stepNode instanceof HTMLElement)) return null;
      const toggle = stepNode.querySelector('[data-calendar-workflow-toggle]');
      const body = stepNode.querySelector('[data-calendar-workflow-body]');
      if (!(toggle instanceof HTMLButtonElement) || !(body instanceof HTMLElement)) return null;
      return { stepNode, toggle, body };
    })
    .filter(Boolean);
  if (!calendarRoot) return;

  const isAdminMode = new URLSearchParams(window.location.search).get('admin') === '1';
  if (adminPanel) {
    adminPanel.classList.toggle('is-hidden', !isAdminMode);
  }
  adminOnlyBlocks.forEach((block) => {
    if (!(block instanceof HTMLElement)) return;
    block.classList.toggle('is-hidden', !isAdminMode);
  });

  const setWorkflowStepExpanded = (entry, expanded) => {
    if (!entry) return;
    const isMonthViewStep = entry.stepNode.hasAttribute('data-calendar-default-open');
    const expandedHeight = isMonthViewStep ? `${Math.max(0, entry.body.scrollHeight)}px` : getExpandedWorkflowBodyMaxHeight(entry.body);
    entry.stepNode.classList.toggle('is-expanded', expanded);
    entry.stepNode.classList.toggle('is-collapsed', !expanded);
    entry.toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    entry.body.style.maxHeight = expanded ? expandedHeight : '0px';
  };

  const refreshWorkflowHeights = () => {
    workflowSteps.forEach((entry) => {
      if (!entry.stepNode.classList.contains('is-expanded')) return;
      setWorkflowStepExpanded(entry, true);
    });
  };

  workflowSteps.forEach((entry) => {
    const startsExpanded =
      entry.stepNode.classList.contains('is-expanded') || entry.stepNode.hasAttribute('data-calendar-default-open');
    setWorkflowStepExpanded(entry, startsExpanded);

    entry.toggle.addEventListener('click', () => {
      const isExpanded = entry.stepNode.classList.contains('is-expanded');
      setWorkflowStepExpanded(entry, !isExpanded);
    });
  });

  const expandWorkflowStepFor = (node) => {
    if (!(node instanceof HTMLElement)) return;
    const parentStep = node.closest('[data-calendar-workflow-step]');
    if (!(parentStep instanceof HTMLElement)) return;
    const matched = workflowSteps.find((entry) => entry.stepNode === parentStep);
    if (!matched) return;
    setWorkflowStepExpanded(matched, true);
  };

  window.addEventListener('resize', () => {
    refreshWorkflowHeights();
  });

  const openEventEditorOverlay = () => {
    if (!isAdminMode || !(adminPanel instanceof HTMLElement)) return;
    expandWorkflowStepFor(adminPanel);
    adminPanel.classList.remove('is-hidden');
    adminPanel.classList.add('is-event-editor-open');
    if (editorBackdrop instanceof HTMLElement) {
      editorBackdrop.classList.remove('is-hidden');
    }
  };

  const closeEventEditorOverlay = () => {
    if (!(adminPanel instanceof HTMLElement)) return;
    adminPanel.classList.remove('is-event-editor-open');
    if (editorBackdrop instanceof HTMLElement) {
      editorBackdrop.classList.add('is-hidden');
    }
  };

  const sectionKey = String(config.sectionKey || 'school_calendar').trim() || 'school_calendar';
  const fixtureSectionKey = String(config.fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator';
  const eventsStorageKey = `bhanoyi.schoolCalendarEvents.${sectionKey}`;
  const fixtureDateStorageKey = `bhanoyi.fixtureDates.${fixtureSectionKey}`;
  const fixtureCatalogStorageKey = `bhanoyi.fixtures.${fixtureSectionKey}`;
  const eventTypesStorageKey = `bhanoyi.schoolCalendarEventTypes.${sectionKey}`;
  const termsStorageKey = `bhanoyi.schoolTerms.${sectionKey}`;

  window.addEventListener('bhanoyi:remote-persist-status', (event) => {
    const key = String(event?.detail?.storageKey || '').trim();
    if (
      key !== eventsStorageKey &&
      key !== eventTypesStorageKey &&
      key !== termsStorageKey &&
      key !== fixtureDateStorageKey &&
      key !== fixtureCatalogStorageKey
    ) {
      return;
    }

    const savedRemote = event?.detail?.savedRemote === true;
    if (statusNode instanceof HTMLElement) {
      statusNode.textContent = savedRemote
        ? 'Saved remotely.'
        : 'Saved on this device only. Remote sync unavailable right now.';
    }
  });

  const params = new URLSearchParams(window.location.search);
  const incomingFixtureId = (params.get('fixtureId') || '').trim();
  const incomingFixtureLabel = (params.get('fixtureLabel') || '').trim();
  const incomingDate = (params.get('date') || '').trim();
  const fixtureCreatorOverlayUrl = withAudienceQuery('sports.html');

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
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  };

  const defaultEventTypes = ['Sports', 'Religious', 'Cultural', 'Entertainment', 'Academic'];

  const normalizeEventTypeLabel = (value) => {
    const raw = String(value || '').trim();
    return raw.replace(/\s+/g, ' ');
  };

  const eventTypeIconMap = {
    sports: '🏆',
    religious: '🕊️',
    cultural: '🎭',
    entertainment: '🎉',
    academic: '📘',
    meeting: '🗓️',
    assembly: '📣',
    exam: '📝',
    holiday: '🌴',
    community: '🤝'
  };

  const resolveEventTypeIcon = (value) => {
    const normalized = normalizeEventTypeLabel(value).toLowerCase();
    if (!normalized) return '📅';
    if (eventTypeIconMap[normalized]) return eventTypeIconMap[normalized];
    if (normalized.includes('sport')) return '🏆';
    if (normalized.includes('academ') || normalized.includes('exam') || normalized.includes('test')) return '📘';
    if (normalized.includes('relig')) return '🕊️';
    if (normalized.includes('cult')) return '🎭';
    if (normalized.includes('entertain') || normalized.includes('fun')) return '🎉';
    if (normalized.includes('meeting') || normalized.includes('staff')) return '🗓️';
    return '📌';
  };

  const formatEventTypeWithIcon = (value) => {
    const label = normalizeEventTypeLabel(value);
    if (!label) return '📅 General';
    return `${resolveEventTypeIcon(label)} ${label}`;
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
    void persistLocalStore(eventTypesStorageKey, normalized);
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
      ...eventTypes.map(
        (type) => `<option value="${escapeHtmlAttribute(type)}">${escapeHtmlText(formatEventTypeWithIcon(type))}</option>`
      ),
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
            <span class="school-event-type-icon" aria-hidden="true">${escapeHtmlText(resolveEventTypeIcon(type))}</span>
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
    void persistLocalStore(termsStorageKey, payload);
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
    void persistLocalStore(eventsStorageKey, serialized);

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
        const startDate = normalizeDateString(entry.start);
        const startTime = normalizeTimeString(entry.start);
        const startStamp = startDate ? (startTime ? `${startDate}T${startTime}` : startDate) : '';
        if (fixtureId && startStamp) {
          nextMap[fixtureId] = startStamp;
        }
      });

      localStorage.setItem(fixtureDateStorageKey, JSON.stringify(nextMap));
      void persistLocalStore(fixtureDateStorageKey, nextMap);
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

  let events = loadEvents();
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
        .map(([fixtureId, dateValue]) => {
          const raw = String(dateValue || '').trim();
          const datePart = normalizeDateString(raw);
          const timePart = normalizeTimeString(raw);
          const stamp = datePart ? (timePart ? `${datePart}T${timePart}` : datePart) : '';
          return [String(fixtureId || '').trim(), stamp];
        })
        .filter(([fixtureId, stamp]) => fixtureId.startsWith(`${fixtureSectionKey}:`) && Boolean(stamp));

      const expectedFixtureIds = new Set(fixtureDateEntries.map(([fixtureId]) => fixtureId));
      const fixtureEvents = calendar
        .getEvents()
        .filter(
          (entry) =>
            entry.display !== 'background' &&
            String(entry.extendedProps?.fixtureId || '').trim().startsWith(`${fixtureSectionKey}:`)
        );

      const existingStyleByFixtureId = new Map();
      fixtureEvents.forEach((entry) => {
        const fixtureId = String(entry.extendedProps?.fixtureId || '').trim();
        if (!fixtureId || existingStyleByFixtureId.has(fixtureId)) return;
        existingStyleByFixtureId.set(fixtureId, {
          backgroundColor: String(entry.backgroundColor || '').trim(),
          borderColor: String(entry.borderColor || '').trim(),
          textColor: String(entry.textColor || '').trim(),
          eventType: normalizeEventTypeLabel(entry.extendedProps?.eventType || 'Sports'),
          notes: String(entry.extendedProps?.notes || '')
        });
      });

      const hasChanges = fixtureEvents.length > 0 || expectedFixtureIds.size > 0;

      if (fixtureEvents.length) {
        fixtureEvents.forEach((entry) => entry.remove());
      }

      fixtureDateEntries.forEach(([fixtureId, fixtureStamp]) => {
        const eventTitle = buildFixtureEventTitle(fixtureId, fixtureCatalog);
        const fixtureDate = normalizeDateString(fixtureStamp);
        const fixtureTime = normalizeTimeString(fixtureStamp);
        const fixtureStart = fixtureTime ? `${fixtureDate}T${fixtureTime}` : fixtureDate;
        const isTimedFixture = Boolean(fixtureTime);

        const existingStyle = existingStyleByFixtureId.get(fixtureId) || {};

        const newEntry = calendar.addEvent({
          id: `${fixtureId}:event`,
          title: eventTitle,
          start: fixtureStart,
          allDay: !isTimedFixture,
          backgroundColor: existingStyle.backgroundColor || undefined,
          borderColor: existingStyle.borderColor || undefined,
          textColor: existingStyle.textColor || undefined,
          extendedProps: {
            eventType: existingStyle.eventType || 'Sports',
            fixtureId,
            notes: existingStyle.notes || '',
            fixtureAuto: true
          }
        });

        if (!existingStyle.backgroundColor && !existingStyle.borderColor && !existingStyle.textColor) {
          applyEventTheme(newEntry, defaultCalendarTheme);
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

  const truncateCalendarTitle = (value, maxLength = 22) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= maxLength) return text;
    if (maxLength <= 3) return '...';
    return `${text.slice(0, maxLength - 3).trimEnd()}...`;
  };

  const shortFixtureTeamCode = (value) => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return 'TBD';
    const compact = normalized.replace(/[^A-Za-z0-9]/g, '');
    const source = compact || normalized.replace(/\s+/g, '');
    return source.slice(0, 3).toUpperCase() || normalized.slice(0, 3).toUpperCase();
  };

  const compactCalendarEventTitle = (eventEntry) => {
    const rawTitle = String(eventEntry?.title || '').trim();
    const fixtureId = String(eventEntry?.extendedProps?.fixtureId || '').trim();

    if (fixtureId) {
      const matched = rawTitle.match(/^(.+?)\s+(?:vs|v\.?|versus)\s+(.+)$/i);
      if (matched) {
        const homeCode = shortFixtureTeamCode(matched[1]);
        const awayCode = shortFixtureTeamCode(matched[2]);
        return `${homeCode} vs ${awayCode}`;
      }
      return truncateCalendarTitle(rawTitle, 13);
    }

    return truncateCalendarTitle(rawTitle, 20);
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
    openEventEditorOverlay();
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
        const eventTypeWithIcon = escapeHtmlText(formatEventTypeWithIcon(eventType));
        const title = escapeHtmlText(String(entry.title || 'Untitled event'));
        const eventId = escapeHtmlAttribute(String(entry.id || ''));
        const timeLabel = escapeHtmlText(formatTimeLabel(entry));
        return `
          <div class="calendar-day-event-row" data-calendar-day-event-id="${eventId}">
            <button type="button" class="calendar-day-event-open" data-calendar-day-event-open="${eventId}">
              <span class="calendar-day-event-time">${timeLabel}</span>
              <span class="calendar-day-event-title">${title}</span>
              <span class="calendar-day-event-type">${eventTypeWithIcon}</span>
            </button>
            ${
              isAdminMode
                ? `<button type="button" class="btn btn-secondary calendar-day-event-delete" data-calendar-day-event-delete="${eventId}" aria-label="Delete ${title}">Delete</button>`
                : ''
            }
          </div>
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
    const firstRow = dayOverlay.querySelector('[data-calendar-day-event-open]');
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

  const handleDaySelection = (dateString) => {
    const normalized = normalizeDateString(dateString);
    if (!normalized) return;

    showDayOverlay(normalized);
    if (isAdminMode && form instanceof HTMLFormElement) {
      clearForm();
      const startInput = form.querySelector('input[name="start"]');
      if (startInput instanceof HTMLInputElement) {
        startInput.value = normalized;
      }
      if (statusNode) {
        statusNode.textContent = 'Ready to add a new event for selected date.';
      }
    }
  };

  const deleteCalendarEventById = (eventId, { closeEditor = false } = {}) => {
    const normalizedId = String(eventId || '').trim();
    if (!normalizedId) {
      if (statusNode) statusNode.textContent = 'Select an event first.';
      showSmartToast('Select an event first.', { tone: 'error' });
      return false;
    }

    const eventEntry = calendar.getEventById(normalizedId);
    if (!eventEntry) {
      if (statusNode) statusNode.textContent = 'Selected event not found.';
      showSmartToast('Selected event not found.', { tone: 'error' });
      return false;
    }

    const title = String(eventEntry.title || 'this event').trim() || 'this event';
    const confirmDelete = window.confirm(`Delete event "${title}"?`);
    if (!confirmDelete) return false;

    eventEntry.remove();
    saveEvents(calendar.getEvents());
    refreshDayOverlay();

    if (form instanceof HTMLFormElement) {
      const idInput = form.querySelector('input[name="id"]');
      const selectedId = (idInput instanceof HTMLInputElement ? idInput.value : '').trim();
      if (selectedId && selectedId === normalizedId) {
        clearForm();
      }
    }

    if (closeEditor) {
      closeEventEditorOverlay();
    }

    if (statusNode) statusNode.textContent = 'Event deleted.';
    showSmartToast('Event deleted.', { tone: 'success' });
    return true;
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
    dayMaxEvents: 3,
    eventOrder: 'start,-duration,allDay,title',
    editable: isAdminMode,
    eventStartEditable: isAdminMode,
    events,
    eventContent: (arg) => {
      if (arg.event.display === 'background') return true;
      const typeLabel = normalizeEventTypeLabel(arg.event.extendedProps?.eventType || 'General');
      const icon = resolveEventTypeIcon(typeLabel);
      const compactTitle = compactCalendarEventTitle(arg.event);

      const wrapper = document.createElement('div');
      wrapper.className = 'calendar-event-content';

      if (arg.timeText) {
        const timeNode = document.createElement('span');
        timeNode.className = 'calendar-event-time';
        timeNode.textContent = arg.timeText;
        wrapper.appendChild(timeNode);
      }

      const titleNode = document.createElement('span');
      titleNode.className = 'calendar-event-title';
      titleNode.textContent = `${icon} ${compactTitle || arg.event.title}`;
      wrapper.appendChild(titleNode);

      return { domNodes: [wrapper] };
    },
    eventClick: (info) => {
      if (info.event.display === 'background') return;
      if (!isAdminMode || !(form instanceof HTMLFormElement)) {
        showDayOverlay(info.event.startStr || info.event.start || '');
        return;
      }
      info.jsEvent.preventDefault();
      writeEventToForm(info.event, info.el);
    },
    dateClick: (info) => {
      handleDaySelection(info.dateStr);
    },
    dayCellDidMount: (info) => {
      const top = info.el.querySelector('.fc-daygrid-day-top');
      if (!(top instanceof HTMLElement)) return;
      top.classList.add('calendar-day-click-zone');
      top.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleDaySelection(info.date);
      });
    },
    moreLinkClick: (info) => {
      handleDaySelection(info.date);
      return 'none';
    },
    datesSet: () => {
      renderDayEventCountBadges();
      window.requestAnimationFrame(() => {
        refreshWorkflowHeights();
      });
    },
    eventsSet: () => {
      renderDayEventCountBadges();
      window.requestAnimationFrame(() => {
        refreshWorkflowHeights();
      });
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

  const renderDayEventCountBadges = () => {
    const allEvents = calendar
      .getEvents()
      .filter((entry) => entry.display !== 'background');

    const dayCells = Array.from(calendarRoot.querySelectorAll('.fc-daygrid-day[data-date]'));
    dayCells.forEach((cell) => {
      if (!(cell instanceof HTMLElement)) return;
      const dateString = String(cell.dataset.date || '').trim();
      const frame = cell.querySelector('.fc-daygrid-day-frame');
      if (!dateString || !(frame instanceof HTMLElement)) return;

      const existing = frame.querySelector('[data-calendar-day-total-badge]');
      if (existing instanceof HTMLElement) {
        existing.remove();
      }

      const totalForDay = allEvents.filter((entry) => eventOccursOnDate(entry, dateString)).length;
      if (totalForDay <= 3) return;

      const badge = document.createElement('span');
      badge.className = 'calendar-day-total-badge';
      badge.setAttribute('data-calendar-day-total-badge', 'true');
      badge.setAttribute('aria-label', `${totalForDay} events scheduled for this day`);
      badge.textContent = String(totalForDay);
      frame.appendChild(badge);
    });
  };

  calendar.render();
  refreshWorkflowHeights();
  window.setTimeout(() => {
    refreshWorkflowHeights();
  }, 0);
  window.setTimeout(() => {
    refreshWorkflowHeights();
  }, 180);
  renderTermBackgroundEvents(calendar);
  reconcileFixtureEvents();
  renderDayEventCountBadges();

  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    if (event.key === eventsStorageKey || event.key === eventTypesStorageKey || event.key === termsStorageKey) {
      refreshCalendarStateFromStorage();
      return;
    }
    if (
      event.key === fixtureDateStorageKey ||
      event.key === fixtureCatalogStorageKey
    ) {
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

    const deleteButton = target.closest('[data-calendar-day-event-delete]');
    if (deleteButton instanceof HTMLButtonElement) {
      const eventId = String(deleteButton.dataset.calendarDayEventDelete || '').trim();
      if (!eventId) return;
      deleteCalendarEventById(eventId, { closeEditor: false });
      return;
    }

    const openButton = target.closest('[data-calendar-day-event-open]');
    if (!(openButton instanceof HTMLButtonElement)) return;
    const eventId = String(openButton.dataset.calendarDayEventOpen || '').trim();
    if (!eventId) return;
    const eventEntry = calendar.getEventById(eventId);
    if (!eventEntry) return;
    if (isAdminMode) {
      writeEventToForm(eventEntry);
      hideDayOverlay();
    }
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
      const row = target.closest('[data-calendar-day-event-open]');
      if (!(row instanceof HTMLElement)) return;
      event.preventDefault();
      const eventId = String(row.dataset.calendarDayEventOpen || '').trim();
      if (!eventId) return;
      const eventEntry = calendar.getEventById(eventId);
      if (!eventEntry) return;
      if (isAdminMode) {
        writeEventToForm(eventEntry);
        hideDayOverlay();
      }
    }
  });

  editorCloseButton?.addEventListener('click', () => {
    closeEventEditorOverlay();
  });

  editorBackdrop?.addEventListener('click', () => {
    closeEventEditorOverlay();
  });

  document.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key !== 'Escape') return;
    closeEventEditorOverlay();
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
      const startTimeInput = form.querySelector('input[name="startTime"]');
      if (startInput instanceof HTMLInputElement) {
        startInput.value = normalizeDateString(incomingDate);
      }
      if (startTimeInput instanceof HTMLInputElement) {
        startTimeInput.value = normalizeTimeString(incomingDate);
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
        showSmartToast('Title, event type, and start date are required.', { tone: 'error' });
        return;
      }

      if (fixtureId && !hasConfiguredActiveTerms()) {
        if (statusNode) {
          statusNode.textContent = 'Save at least one school term range before scheduling fixture events.';
        }
        showSmartToast('Save at least one school term range before scheduling fixture events.', { tone: 'error' });
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
      showSmartToast(
        fixtureId && effectiveStartDate !== startDate
          ? `Event saved. Date snapped to active term (${effectiveStartDate}).`
          : 'Event saved.',
        { tone: 'success' }
      );
      clearForm();
    });

    newButton?.addEventListener('click', () => {
      clearForm();
      if (statusNode) statusNode.textContent = 'Ready for a new event.';
      showSmartToast('Ready for a new event.', { tone: 'info' });
    });

    deleteButton?.addEventListener('click', () => {
      const idInput = form.querySelector('input[name="id"]');
      const eventId = (idInput instanceof HTMLInputElement ? idInput.value : '').trim();
      deleteCalendarEventById(eventId, { closeEditor: false });
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
        showSmartToast('Event type added. Rename it and save types.', { tone: 'success' });
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
          ? `Delete event type "${removedType}"? ${usageCount} event(s) will be reassigned.`
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
      showSmartToast('Event type removed.', { tone: 'success' });
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
        showSmartToast('Event types saved.', { tone: 'success' });
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
      showSmartToast('School terms saved.', { tone: 'success' });
    });
  }

  const refreshCalendarStateFromStorage = () => {
    eventTypes = loadEventTypes();
    terms = loadTerms();

    if (isAdminMode && form instanceof HTMLFormElement) {
      renderEventTypeOptions();
      renderEventTypesEditor();
      clearForm();
    }

    if (isAdminMode && termsForm instanceof HTMLFormElement) {
      hydrateTermsForm();
    }

    calendar
      .getEvents()
      .filter((entry) => entry.display !== 'background')
      .forEach((entry) => entry.remove());

    events = loadEvents();
    events.forEach((entry) => {
      calendar.addEvent(entry);
    });

    renderTermBackgroundEvents(calendar);
    reconcileFixtureEvents();
    refreshDayOverlay();
    renderDayEventCountBadges();
  };

  const bootstrapCalendarRemoteSync = async () => {
    await Promise.all([
      syncLocalStoreFromRemote(eventsStorageKey),
      syncLocalStoreFromRemote(eventTypesStorageKey),
      syncLocalStoreFromRemote(termsStorageKey),
      syncLocalStoreFromRemote(fixtureDateStorageKey),
      syncLocalStoreFromRemote(fixtureCatalogStorageKey)
    ]).catch(() => null);

    refreshCalendarStateFromStorage();
  };

  void bootstrapCalendarRemoteSync();

  const targetDate = normalizeDateString(incomingDate);
  if (targetDate) {
    calendar.gotoDate(targetDate);
  }
};

const renderSectionByType = (section, sectionIndex, context = {}) => {
  if (!isAdminModeEnabled() && isAdminOnlySectionForPublic(section)) {
    return '';
  }

  const fallbackSectionKey = section.sectionKey || `section_${sectionIndex}`;
  const publicConcise = isPublicAudienceEnabled();
  const effectiveSection = resolveAudienceSectionCopy(
    resolveContactInformationSection(resolveHomePrincipalSidePanel(section, context), context),
    context
  );

  if (effectiveSection.type === 'calendar') {
    return renderSchoolCalendarSection(effectiveSection, sectionIndex);
  }

  if (effectiveSection.type === 'fixture-creator') {
    if (!isAdminModeEnabled()) {
      return renderPublicFixtureBoardSection(effectiveSection, sectionIndex);
    }
    return renderFixtureCreatorSection(effectiveSection, sectionIndex, context);
  }

  if (effectiveSection.type === 'match-log') {
    return renderMatchLogSection(effectiveSection, sectionIndex);
  }

  if (effectiveSection.type === 'enrollment-manager') {
    return renderEnrollmentManagerSection(effectiveSection, sectionIndex);
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
                  sortOrder: index,
                  concise: publicConcise
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
            <p>${publicConcise ? toConcisePublicText(effectiveSection.body, 120) : effectiveSection.body}</p>
            ${effectiveSection.list
              ? `<ul class="list">${effectiveSection.list
                  .map((entry) => `<li>${publicConcise ? toConcisePublicText(entry, 88) : entry}</li>`)
                  .join('')}</ul>`
              : ''}
          </div>
          <aside class="panel">
            <img class="split-panel-image ${hasPanelImage ? '' : 'is-hidden'}" src="${hasPanelImage ? panelImageUrl : ''}" alt="${effectiveSection.panel.title}" loading="lazy" />
            <h3>${effectiveSection.panel.title}</h3>
            <p>${publicConcise ? toConcisePublicText(effectiveSection.panel.body, 110) : effectiveSection.panel.body}</p>
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
                (item, index) => `<article class="panel" data-contact-index="${index}"><h3>${item.title}</h3><p>${publicConcise ? toConcisePublicText(item.body, 90) : item.body}</p></article>`
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
                    <p class="notice-body">${publicConcise ? toConcisePublicText(item.body, 100) : item.body}</p>
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
                    <p>${publicConcise ? toConcisePublicText(item.body, 95) : item.body}</p>
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

  if (effectiveSection.type === 'league-standings') {
    return renderLeagueStandingsSection(effectiveSection, sectionIndex, context);
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

const hydratePublicFixtureBoard = (boardNode) => {
  const rawConfig = String(boardNode?.dataset?.publicFixtureConfig || '').trim();
  if (!rawConfig) return;

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch {
    return;
  }

  const fixtureSectionKey = String(config.fixtureSectionKey || 'sports_fixture_creator').trim() || 'sports_fixture_creator';
  const fixtureCatalogStorageKey = getFixtureCatalogStorageKey(fixtureSectionKey);
  const fixtureDateStorageKey = getFixtureDateStorageKey(fixtureSectionKey);

  const statusNode = boardNode.querySelector('[data-public-fixture-status]');
  const dateSelect = boardNode.querySelector('[data-public-fixture-date]');
  const firstLegList = boardNode.querySelector('[data-public-fixture-first-leg]');
  const returnLegList = boardNode.querySelector('[data-public-fixture-return-leg]');

  if (!(dateSelect instanceof HTMLSelectElement) || !(firstLegList instanceof HTMLElement) || !(returnLegList instanceof HTMLElement)) {
    return;
  }

  let selectedDate = '';
  let fixtureCatalog = {};
  let fixtureDateMap = {};

  const parseDateTimeStamp = (stamp) => {
    const normalized = normalizeFixtureStampGlobal(stamp);
    if (!normalized) return Number.MAX_SAFE_INTEGER;
    const parsed = splitFixtureStampGlobal(normalized);
    const candidate = parsed.time ? `${parsed.date}T${parsed.time}` : `${parsed.date}T23:59`;
    const epoch = new Date(candidate).getTime();
    return Number.isFinite(epoch) ? epoch : Number.MAX_SAFE_INTEGER;
  };

  const formatDateLabel = (dateValue) => {
    const normalized = normalizeFixtureDateOnlyGlobal(dateValue);
    if (!normalized) return 'Unknown date';
    const parsed = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return normalized;
    return parsed.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTimeLabel = (value) => {
    const normalized = normalizeFixtureTimeOnlyGlobal(value);
    return normalized || 'TBD';
  };

  const resolveLegBucket = (fixture) => {
    const raw = String(fixture?.leg || fixture?.legLabel || '').trim().toLowerCase();
    if (/(return|second|leg\s*2|\b2\b)/i.test(raw)) return 'return';
    if (/(first|leg\s*1|\b1\b)/i.test(raw)) return 'first';
    return 'first';
  };

  const readFixtures = () => {
    const rows = Object.entries(fixtureCatalog)
      .map(([fixtureId, fixtureData]) => {
        const fixture = fixtureData && typeof fixtureData === 'object' ? fixtureData : {};
        const stamp = splitFixtureStampGlobal(fixtureDateMap[fixtureId]);
        if (!stamp.date) return null;

        const homeName = String(fixture.homeName || fixture.homeId || 'Home').trim() || 'Home';
        const awayName = String(fixture.awayName || fixture.awayId || 'Away').trim() || 'Away';
        if (!homeName || !awayName) return null;

        return {
          fixtureId,
          date: stamp.date,
          time: stamp.time,
          legBucket: resolveLegBucket(fixture),
          homeName,
          awayName,
          stamp: normalizeFixtureStampGlobal(fixtureDateMap[fixtureId])
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const leftStamp = parseDateTimeStamp(left.stamp);
        const rightStamp = parseDateTimeStamp(right.stamp);
        if (leftStamp !== rightStamp) return leftStamp - rightStamp;
        return left.fixtureId.localeCompare(right.fixtureId);
      });

    return rows;
  };

  const renderFixtures = (targetNode, fixtures, emptyText) => {
    if (!fixtures.length) {
      targetNode.innerHTML = `<li class="public-fixture-empty">${escapeHtmlText(emptyText)}</li>`;
      return;
    }

    targetNode.innerHTML = fixtures
      .map(
        (fixture) => `
          <li class="public-fixture-item">
            <p class="public-fixture-time">${escapeHtmlText(formatTimeLabel(fixture.time))}</p>
            <p class="public-fixture-teams">${escapeHtmlText(fixture.homeName)} <span aria-hidden="true">vs</span> ${escapeHtmlText(fixture.awayName)}</p>
          </li>
        `
      )
      .join('');
  };

  const render = () => {
    const allFixtures = readFixtures();
    const now = Date.now();
    const dates = Array.from(new Set(allFixtures.map((entry) => entry.date))).sort((left, right) => {
      return parseDateTimeStamp(`${left}T00:00`) - parseDateTimeStamp(`${right}T00:00`);
    });

    const nextUpcomingFixture = allFixtures.find((entry) => parseDateTimeStamp(entry.stamp) >= now) || null;
    const nextUpcomingDate = nextUpcomingFixture?.date || '';
    const fallbackDate = nextUpcomingDate || dates[dates.length - 1] || '';

    if (!selectedDate || !dates.includes(selectedDate)) {
      selectedDate = fallbackDate;
    }

    dateSelect.innerHTML = [
      '<option value="">Select fixture date</option>',
      ...dates.map((dateValue) => {
        const label = formatDateLabel(dateValue);
        return `<option value="${escapeHtmlAttribute(dateValue)}"${dateValue === selectedDate ? ' selected' : ''}>${escapeHtmlText(label)}</option>`;
      })
    ].join('');

    const fixturesForDay = allFixtures.filter((entry) => entry.date === selectedDate);
    const firstLegFixtures = fixturesForDay.filter((entry) => entry.legBucket === 'first');
    const returnLegFixtures = fixturesForDay.filter((entry) => entry.legBucket === 'return');

    renderFixtures(firstLegList, firstLegFixtures, 'No first-leg fixtures for this day.');
    renderFixtures(returnLegList, returnLegFixtures, 'No return fixtures for this day.');

    if (statusNode) {
      if (!allFixtures.length) {
        statusNode.textContent = 'No fixtures published yet.';
      } else if (!selectedDate) {
        statusNode.textContent = 'Choose a day to view fixtures.';
      } else {
        statusNode.textContent = `${fixturesForDay.length} fixture${fixturesForDay.length === 1 ? '' : 's'} on ${formatDateLabel(selectedDate)}.`;
      }
    }
  };

  const refresh = () => {
    fixtureCatalog = readLocalStorageObject(fixtureCatalogStorageKey);
    fixtureDateMap = readLocalStorageObject(fixtureDateStorageKey);
    render();
  };

  dateSelect.addEventListener('change', () => {
    selectedDate = String(dateSelect.value || '').trim();
    render();
  });

  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    if (event.key !== fixtureCatalogStorageKey && event.key !== fixtureDateStorageKey) return;
    refresh();
  });

  window.addEventListener('bhanoyi:fixtures-updated', (event) => {
    const sectionFromEvent = String(event?.detail?.sectionKey || '').trim();
    if (sectionFromEvent && sectionFromEvent !== fixtureSectionKey) return;
    refresh();
  });

  void Promise.all([
    syncLocalStoreFromRemote(fixtureCatalogStorageKey),
    syncLocalStoreFromRemote(fixtureDateStorageKey)
  ])
    .catch(() => null)
    .finally(() => {
      refresh();
    });
};

export const initPublicFixtureBoards = () => {
  const boards = Array.from(document.querySelectorAll('[data-public-fixture-board="true"]'));
  boards.forEach((board) => hydratePublicFixtureBoard(board));
};

export const initFixtureCreators = () => {
  const creators = Array.from(document.querySelectorAll('[data-fixture-creator="true"]'));
  creators.forEach((creator) => hydrateFixtureCreator(creator));
};

export const initSchoolCalendars = () => {
  const calendars = Array.from(document.querySelectorAll('[data-school-calendar-shell="true"]'));
  calendars.forEach((calendar) => hydrateSchoolCalendar(calendar));
};

export const initEnrollmentManagers = () => {
  const managers = Array.from(document.querySelectorAll('[data-enrollment-manager="true"]'));
  managers.forEach((manager) => hydrateEnrollmentManager(manager));
};

export const initLeagueStandings = () => {
  const tables = Array.from(document.querySelectorAll('[data-league-standings="true"]'));
  tables.forEach((table) => hydrateLeagueStandings(table));
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
      ${
        isAdminModeEnabled()
          ? `<p><a class="footer-utility-link" href="${withAudienceQuery('email-tester.html')}">Email Tester</a></p>`
          : ''
      }
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
