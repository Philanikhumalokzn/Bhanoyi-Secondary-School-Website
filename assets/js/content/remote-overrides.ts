type SiteContent = {
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
  title: string;
  body: string;
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
    `${url}/rest/v1/site_cards?select=id,page_key,section_key,title,body,href,sort_order&is_active=eq.true&order=sort_order.asc`,
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

    page.sections = page.sections.map((section) => {
      if (section.type !== 'cards') return section;
      if (!section.sectionKey || section.sectionKey !== sectionKey) return section;

      return {
        ...section,
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          href: item.href || '#'
        }))
      };
    });
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

export const applyRemoteOverrides = async <T extends SiteContent>(siteContent: T): Promise<T> => {
  if (!hasConfig()) {
    return siteContent;
  }

  try {
    const [announcements, downloads, cards, notices] = await Promise.all([
      fetchAnnouncements(),
      fetchDownloads(),
      fetchCards(),
      fetchHeroNotices()
    ]);
    applyAnnouncements(siteContent, announcements);
    applyDownloads(siteContent, downloads);
    applyCards(siteContent, cards);
    applyHeroNotices(siteContent, notices);
    return siteContent;
  } catch {
    return siteContent;
  }
};
