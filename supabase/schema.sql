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

create table if not exists public.site_cards (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  section_key text not null,
  category text not null default '',
  title text not null,
  body text not null,
  image_url text not null default '',
  href text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table if exists public.site_cards
  add column if not exists category text not null default '';

alter table if exists public.site_cards
  add column if not exists image_url text not null default '';

create table if not exists public.site_hero_notice (
  id uuid primary key default gen_random_uuid(),
  page_key text not null unique,
  title text not null default '',
  body text not null default '',
  href text not null default '#',
  link_label text not null default 'View notice',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  email text primary key,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  setting_key text primary key,
  setting_value text not null default '',
  updated_at timestamptz not null default now()
);
