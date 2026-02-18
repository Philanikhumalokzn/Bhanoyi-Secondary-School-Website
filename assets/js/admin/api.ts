import { supabase } from './supabase.client';
import type { Announcement, DownloadItem } from './types';

export type SiteCard = {
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
  is_active: boolean;
};

export type HeroNotice = {
  id: string;
  page_key: string;
  title: string;
  body: string;
  href: string;
  link_label: string;
  is_active: boolean;
};

export type SiteSetting = {
  setting_key: string;
  setting_value: string;
};

export const getSiteSetting = async (settingKey: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('site_settings')
    .select('setting_value')
    .eq('setting_key', settingKey)
    .maybeSingle();

  if (error) throw toError(error, 'Site setting load failed');
  return (data?.setting_value as string | undefined) ?? null;
};

const toMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error';
};

const toError = (error: unknown, context: string) => new Error(`${context}: ${toMessage(error)}`);

export const signIn = async (email: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw toError(error, 'Login failed');
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw toError(error, 'Logout failed');
};

export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toError(error, 'Session check failed');
  return data.session;
};

export const listAnnouncements = async (): Promise<Announcement[]> => {
  const { data, error } = await supabase
    .from('site_announcements')
    .select('id,date,tag,title,body,sort_order,is_active')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Announcement[];
};

export const saveAnnouncement = async (entry: Partial<Announcement>) => {
  if (entry.id) {
    const updatePayload: Partial<Announcement> = {};
    if (entry.date !== undefined) updatePayload.date = entry.date;
    if (entry.tag !== undefined) updatePayload.tag = entry.tag;
    if (entry.title !== undefined) updatePayload.title = entry.title;
    if (entry.body !== undefined) updatePayload.body = entry.body;
    if (entry.sort_order !== undefined) updatePayload.sort_order = entry.sort_order;
    if (entry.is_active !== undefined) updatePayload.is_active = entry.is_active;

    const { error } = await supabase.from('site_announcements').update(updatePayload).eq('id', entry.id);
    if (error) throw toError(error, 'Announcement update failed');
    return;
  }

  const payload = {
    date: entry.date ?? '',
    tag: entry.tag ?? '',
    title: entry.title ?? '',
    body: entry.body ?? '',
    sort_order: entry.sort_order ?? 0,
    is_active: true
  };

  const { error } = await supabase.from('site_announcements').insert([payload]);
  if (error) throw toError(error, 'Announcement create failed');
};

export const deleteAnnouncement = async (id: string) => {
  const { error } = await supabase.from('site_announcements').delete().eq('id', id);
  if (error) throw toError(error, 'Announcement delete failed');
};

export const listDownloads = async (): Promise<DownloadItem[]> => {
  const { data, error } = await supabase
    .from('site_downloads')
    .select('id,section,title,body,href,link_label,sort_order,is_active')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DownloadItem[];
};

export const saveDownload = async (entry: Partial<DownloadItem>) => {
  if (entry.id) {
    const updatePayload: Partial<DownloadItem> = {};
    if (entry.section !== undefined) updatePayload.section = entry.section;
    if (entry.title !== undefined) updatePayload.title = entry.title;
    if (entry.body !== undefined) updatePayload.body = entry.body;
    if (entry.href !== undefined) updatePayload.href = entry.href;
    if (entry.link_label !== undefined) updatePayload.link_label = entry.link_label;
    if (entry.sort_order !== undefined) updatePayload.sort_order = entry.sort_order;
    if (entry.is_active !== undefined) updatePayload.is_active = entry.is_active;

    const { error } = await supabase.from('site_downloads').update(updatePayload).eq('id', entry.id);
    if (error) throw toError(error, 'Download update failed');
    return;
  }

  const payload = {
    section: (entry.section ?? 'admissions') as 'admissions' | 'policies',
    title: entry.title ?? '',
    body: entry.body ?? '',
    href: entry.href ?? '',
    link_label: entry.link_label ?? 'Download File',
    sort_order: entry.sort_order ?? 0,
    is_active: true
  };

  const { error } = await supabase.from('site_downloads').insert([payload]);
  if (error) throw toError(error, 'Download create failed');
};

export const deleteDownload = async (id: string) => {
  const { error } = await supabase.from('site_downloads').delete().eq('id', id);
  if (error) throw toError(error, 'Download delete failed');
};

export const listCards = async (pageKey: string, sectionKey: string): Promise<SiteCard[]> => {
  const { data, error } = await supabase
    .from('site_cards')
    .select('id,page_key,section_key,category,subtitle,title,body,image_url,href,sort_order,is_active')
    .eq('page_key', pageKey)
    .eq('section_key', sectionKey)
    .order('sort_order', { ascending: true });

  if (error) throw toError(error, 'Card load failed');
  return (data ?? []) as SiteCard[];
};

export const saveCard = async (entry: Partial<SiteCard>) => {
  if (entry.id) {
    const updatePayload: Partial<SiteCard> = {};
    if (entry.category !== undefined) updatePayload.category = entry.category;
    if (entry.subtitle !== undefined) updatePayload.subtitle = entry.subtitle;
    if (entry.title !== undefined) updatePayload.title = entry.title;
    if (entry.body !== undefined) updatePayload.body = entry.body;
    if (entry.image_url !== undefined) updatePayload.image_url = entry.image_url;
    if (entry.href !== undefined) updatePayload.href = entry.href;
    if (entry.sort_order !== undefined) updatePayload.sort_order = entry.sort_order;
    if (entry.is_active !== undefined) updatePayload.is_active = entry.is_active;

    const { error } = await supabase.from('site_cards').update(updatePayload).eq('id', entry.id);
    if (error) throw toError(error, 'Card update failed');
    return;
  }

  const payload = {
    page_key: entry.page_key ?? 'home',
    section_key: entry.section_key ?? '',
    category: entry.category ?? '',
    subtitle: entry.subtitle ?? '',
    title: entry.title ?? '',
    body: entry.body ?? '',
    image_url: entry.image_url ?? '',
    href: entry.href ?? null,
    sort_order: entry.sort_order ?? 0,
    is_active: true
  };

  const { error } = await supabase.from('site_cards').insert([payload]);
  if (error) throw toError(error, 'Card create failed');
};

export const deleteCard = async (id: string) => {
  const { error } = await supabase.from('site_cards').delete().eq('id', id);
  if (error) throw toError(error, 'Card delete failed');
};

export const uploadNewsImage = async (file: File) => {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const safeExt = (extension || 'jpg').toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

  const { error } = await supabase.storage.from('news-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });

  if (error) throw toError(error, 'Image upload failed');

  const { data } = supabase.storage.from('news-images').getPublicUrl(path);
  return data.publicUrl;
};

export const saveHeroNotice = async (entry: Partial<HeroNotice> & { page_key: string }) => {
  const payload = {
    page_key: entry.page_key,
    title: entry.title ?? '',
    body: entry.body ?? '',
    href: entry.href ?? '#',
    link_label: entry.link_label ?? 'View notice',
    is_active: entry.is_active ?? true
  };

  const { error } = await supabase.from('site_hero_notice').upsert(payload, { onConflict: 'page_key' });
  if (error) throw toError(error, 'Important notice save failed');
};

export const deleteHeroNotice = async (pageKey: string) => {
  const { error } = await supabase
    .from('site_hero_notice')
    .upsert(
      {
        page_key: pageKey,
        title: '',
        body: '',
        href: '#',
        link_label: 'View notice',
        is_active: false
      },
      { onConflict: 'page_key' }
    );

  if (error) throw toError(error, 'Important notice delete failed');
};

export const saveSiteSettings = async (entries: Record<string, string>) => {
  const payload: SiteSetting[] = Object.entries(entries).map(([setting_key, setting_value]) => ({
    setting_key,
    setting_value
  }));

  const { error } = await supabase.from('site_settings').upsert(payload, { onConflict: 'setting_key' });
  if (error) throw toError(error, 'Site settings save failed');
};
