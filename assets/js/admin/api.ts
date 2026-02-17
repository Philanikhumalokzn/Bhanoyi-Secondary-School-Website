import { supabase } from './supabase.client';
import type { Announcement, DownloadItem } from './types';

export type SiteCard = {
  id: string;
  page_key: string;
  section_key: string;
  title: string;
  body: string;
  href: string | null;
  sort_order: number;
  is_active: boolean;
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
    .select('id,page_key,section_key,title,body,href,sort_order,is_active')
    .eq('page_key', pageKey)
    .eq('section_key', sectionKey)
    .order('sort_order', { ascending: true });

  if (error) throw toError(error, 'Card load failed');
  return (data ?? []) as SiteCard[];
};

export const saveCard = async (entry: Partial<SiteCard>) => {
  if (entry.id) {
    const updatePayload: Partial<SiteCard> = {};
    if (entry.title !== undefined) updatePayload.title = entry.title;
    if (entry.body !== undefined) updatePayload.body = entry.body;
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
    title: entry.title ?? '',
    body: entry.body ?? '',
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
