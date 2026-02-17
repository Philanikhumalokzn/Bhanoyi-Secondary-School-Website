create extension if not exists pgcrypto;

create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  date text not null,
  tag text not null default '',
  title text not null,
  body text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_downloads (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('admissions','policies')),
  title text not null,
  body text not null,
  href text not null,
  link_label text not null default 'Download File',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  email text primary key,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
