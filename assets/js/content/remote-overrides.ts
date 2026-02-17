type SiteContent = {
  school: any;
  pages: Record<string, { hero?: any; sections: Array<any> }>;
};

type AnnouncementRow = {
  id: string;
  date: string;
  tag: string;
  title: string;
  body: string;
};

type DownloadRow = {
  id: string;
  section: 'admissions' | 'policies';
  title: string;
  body: string;
  href: string;
  link_label: string;
};

type CardRow = {
  id: string;
  page_key: string;
  section_key: string;
  category: string;
  subtitle: string;
  title: string;
  body: string;
  image_url: string;
  href: string | null;
  sort_order: number;
};

type HeroNoticeRow = {
  id: string;
  page_key: string;
  title: string;
  body: string;
  href: string;
  link_label: string;
  is_active: boolean;
};

type SiteSettingRow = {
  setting_key: string;
  setting_value: string;
};

const getConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return { url, key };
};

const hasConfig = () => {
  const { url, key } = getConfig();
  return Boolean(url && key);
};

const restHeaders = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`
});

const fetchAnnouncements = async (): Promise<AnnouncementRow[]> => {
  const { url, key } = getConfig();
  if (!url || !key) return [];

  const response = await fetch(
    `${url}/rest/v1/site_announcements?select=id,date,tag,title,body&is_active=eq.true&order=sort_order.asc`,
    { headers: restHeaders(key) }
  );

  if (!response.ok) return [];
  return (await response.json()) as AnnouncementRow[];
};

const fetchDownloads = async (): Promise<DownloadRow[]> => {
  const { url, key } = getConfig();
  if (!url || !key) return [];

  const response = await fetch(
    `${url}/rest/v1/site_downloads?select=id,section,title,body,href,link_label&is_active=eq.true&order=sort_order.asc`,
    { headers: restHeaders(key) }
  );

  if (!response.ok) return [];
  return (await response.json()) as DownloadRow[];
};

const fetchCards = async (): Promise<CardRow[]> => {
  const { url, key } = getConfig();
  if (!url || !key) return [];

  const response = await fetch(
    `${url}/rest/v1/site_cards?select=id,page_key,section_key,category,subtitle,title,body,image_url,href,sort_order&is_active=eq.true&order=sort_order.asc`,
    { headers: restHeaders(key) }
  );

  if (!response.ok) return [];
  return (await response.json()) as CardRow[];
};

const fetchHeroNotices = async (): Promise<HeroNoticeRow[]> => {
  const { url, key } = getConfig();
  if (!url || !key) return [];

  const response = await fetch(
    `${url}/rest/v1/site_hero_notice?select=id,page_key,title,body,href,link_label,is_active`,
    { headers: restHeaders(key) }
  );

  if (!response.ok) return [];
  return (await response.json()) as HeroNoticeRow[];
};

const fetchSiteSettings = async (): Promise<SiteSettingRow[]> => {
  const { url, key } = getConfig();
  if (!url || !key) return [];

  const response = await fetch(
    `${url}/rest/v1/site_settings?select=setting_key,setting_value`,
    { headers: restHeaders(key) }
  );

  if (!response.ok) return [];
  return (await response.json()) as SiteSettingRow[];
};

const applyAnnouncements = (siteContent: SiteContent, rows: AnnouncementRow[]) => {
  if (rows.length === 0) return;
  const home = siteContent.pages.home;
  if (!home) return;

  home.sections = home.sections.map((section) => {
    if (section.type !== 'announcements') return section;
    return {
      ...section,
      items: rows
    };
  });
};

const applyDownloads = (siteContent: SiteContent, rows: DownloadRow[]) => {
  if (rows.length === 0) return;

  const bySection = {
    admissions: rows.filter((row) => row.section === 'admissions'),
    policies: rows.filter((row) => row.section === 'policies')
  };

  const rewrite = (pageKey: 'admissions' | 'policies', items: DownloadRow[]) => {
    if (items.length === 0) return;
    const page = siteContent.pages[pageKey];
    if (!page) return;

    page.sections = page.sections.map((section) => {
      if (section.type !== 'downloads') return section;
      return {
        ...section,
        items: items.map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          href: row.href,
          linkLabel: row.link_label || 'Download File'
        }))
      };
    });
  };

  rewrite('admissions', bySection.admissions);
  rewrite('policies', bySection.policies);
};

const applyCards = (siteContent: SiteContent, rows: CardRow[]) => {
  if (rows.length === 0) return;

  const grouped = rows.reduce<Record<string, CardRow[]>>((acc, row) => {
    const key = `${row.page_key}::${row.section_key}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([groupKey, items]) => {
    const [pageKey, sectionKey] = groupKey.split('::');
    const page = siteContent.pages[pageKey];
    if (!page) return;

    page.sections = page.sections.map((section, sectionIndex) => {
      if (section.type !== 'cards') return section;
      const effectiveSectionKey = section.sectionKey || `section_${sectionIndex}`;
      if (effectiveSectionKey !== sectionKey) return section;

      return {
        ...section,
        items: items.map((item) => ({
          id: item.id,
          category: item.category || 'General',
          subtitle: item.subtitle || '',
          title: item.title,
          body: item.body,
          imageUrl: item.image_url || '',
          href: item.href || '#'
        }))
      };
    });
  });
};

const applySectionOverrides = (siteContent: SiteContent, rows: SiteSettingRow[]) => {
  if (rows.length === 0) return;

  rows.forEach((row) => {
    const match = /^section_override:([^:]+):(\d+)$/.exec(row.setting_key);
    if (!match) return;

    const [, pageKey, indexValue] = match;
    const sectionIndex = Number(indexValue);
    if (Number.isNaN(sectionIndex)) return;

    const page = siteContent.pages[pageKey];
    if (!page || !Array.isArray(page.sections)) return;
    if (!page.sections[sectionIndex]) return;

    try {
      const override = JSON.parse(row.setting_value);
      if (!override || typeof override !== 'object') return;
      page.sections[sectionIndex] = {
        ...page.sections[sectionIndex],
        ...override
      };
    } catch {
      return;
    }
  });
};

const applyHeroNotices = (siteContent: SiteContent, rows: HeroNoticeRow[]) => {
  if (rows.length === 0) return;

  rows.forEach((row) => {
    const page = siteContent.pages[row.page_key];
    if (!page || !page.hero) return;

    page.hero.notice = row.is_active
      ? {
          id: row.id,
          title: row.title,
          body: row.body,
          href: row.href,
          linkLabel: row.link_label || 'View notice'
        }
      : null;
  });
};

const applySiteSettings = (siteContent: SiteContent, rows: SiteSettingRow[]) => {
  if (rows.length === 0) return;

  const map = rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.setting_key] = row.setting_value;
    return acc;
  }, {});

  if (map.school_name !== undefined) siteContent.school.name = map.school_name;
  if (map.school_tagline !== undefined) siteContent.school.tagline = map.school_tagline;
  if (map.school_phone !== undefined) siteContent.school.phone = map.school_phone;
  if (map.school_email !== undefined) siteContent.school.email = map.school_email;
  if (map.school_address !== undefined) siteContent.school.address = map.school_address;

  const hours1 = map.school_hours_1;
  const hours2 = map.school_hours_2;
  if (hours1 !== undefined || hours2 !== undefined) {
    const existingHours = Array.isArray(siteContent.school.hours) ? siteContent.school.hours : ['', ''];
    siteContent.school.hours = [
      hours1 !== undefined ? hours1 : existingHours[0] || '',
      hours2 !== undefined ? hours2 : existingHours[1] || ''
    ];
  }
};

export const applyRemoteOverrides = async <T extends SiteContent>(siteContent: T): Promise<T> => {
  if (!hasConfig()) {
    return siteContent;
  }

  try {
    const [announcements, downloads, cards, notices, settings] = await Promise.all([
      fetchAnnouncements(),
      fetchDownloads(),
      fetchCards(),
      fetchHeroNotices(),
      fetchSiteSettings()
    ]);
    applyAnnouncements(siteContent, announcements);
    applyDownloads(siteContent, downloads);
    applyCards(siteContent, cards);
    applyHeroNotices(siteContent, notices);
    applySiteSettings(siteContent, settings);
    applySectionOverrides(siteContent, settings);
    return siteContent;
  } catch {
    return siteContent;
  }
};
