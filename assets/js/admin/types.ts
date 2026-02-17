export type Announcement = {
  id: string;
  date: string;
  tag: string;
  title: string;
  body: string;
  sort_order: number;
  is_active: boolean;
};

export type DownloadItem = {
  id: string;
  section: 'admissions' | 'policies';
  title: string;
  body: string;
  href: string;
  link_label: string;
  sort_order: number;
  is_active: boolean;
};

export type AdminRefs = {
  authPanel: HTMLElement;
  adminPanel: HTMLElement;
  authStatus: HTMLElement;
  adminStatus: HTMLElement;
  announcementList: HTMLElement;
  downloadList: HTMLElement;
  loginForm: HTMLFormElement;
  announcementForm: HTMLFormElement;
  downloadForm: HTMLFormElement;
  refreshBtn: HTMLButtonElement;
  logoutBtn: HTMLButtonElement;
};
