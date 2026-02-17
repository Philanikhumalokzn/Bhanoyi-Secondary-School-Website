import { supabase } from './supabase.client';
import type { Announcement, DownloadItem } from './types';

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
  const payload = {
    date: entry.date ?? '',
    tag: entry.tag ?? '',
    title: entry.title ?? '',
    body: entry.body ?? '',
    sort_order: entry.sort_order ?? 0,
    is_active: true
  };

  if (entry.id) {
    const { error } = await supabase.from('site_announcements').update(payload).eq('id', entry.id);
    if (error) throw toError(error, 'Announcement update failed');
    return;
  }

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
  const payload = {
    section: (entry.section ?? 'admissions') as 'admissions' | 'policies',
    title: entry.title ?? '',
    body: entry.body ?? '',
    href: entry.href ?? '',
    link_label: entry.link_label ?? 'Download File',
    sort_order: entry.sort_order ?? 0,
    is_active: true
  };

  if (entry.id) {
    const { error } = await supabase.from('site_downloads').update(payload).eq('id', entry.id);
    if (error) throw toError(error, 'Download update failed');
    return;
  }

  const { error } = await supabase.from('site_downloads').insert([payload]);
  if (error) throw toError(error, 'Download create failed');
};

export const deleteDownload = async (id: string) => {
  const { error } = await supabase.from('site_downloads').delete().eq('id', id);
  if (error) throw toError(error, 'Download delete failed');
};
