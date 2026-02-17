alter table if exists public.site_announcements enable row level security;
alter table if exists public.site_downloads enable row level security;
alter table if exists public.site_cards enable row level security;
alter table if exists public.site_hero_notice enable row level security;
alter table if exists public.admin_users enable row level security;
alter table if exists public.site_settings enable row level security;

-- Public read for website visitors
drop policy if exists "Public read announcements" on public.site_announcements;
create policy "Public read announcements"
on public.site_announcements
for select
using (is_active = true);

drop policy if exists "Public read downloads" on public.site_downloads;
create policy "Public read downloads"
on public.site_downloads
for select
using (is_active = true);

drop policy if exists "Public read cards" on public.site_cards;
create policy "Public read cards"
on public.site_cards
for select
using (is_active = true);

drop policy if exists "Public read site settings" on public.site_settings;
create policy "Public read site settings"
on public.site_settings
for select
using (true);

do $$
begin
  if to_regclass('public.site_hero_notice') is not null then
    execute 'drop policy if exists "Public read hero notice" on public.site_hero_notice';
    execute 'create policy "Public read hero notice" on public.site_hero_notice for select using (true)';
  end if;
end $$;

-- Admin list is private
drop policy if exists "Admin users can read allowlist" on public.admin_users;
create policy "Admin users can read allowlist"
on public.admin_users
for select
to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email') and is_active = true);

-- Only allow authenticated users in allowlist to change content
drop policy if exists "Allowlisted admins manage announcements" on public.site_announcements;
create policy "Allowlisted admins manage announcements"
on public.site_announcements
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
);

drop policy if exists "Allowlisted admins manage downloads" on public.site_downloads;
create policy "Allowlisted admins manage downloads"
on public.site_downloads
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
);

drop policy if exists "Allowlisted admins manage cards" on public.site_cards;
create policy "Allowlisted admins manage cards"
on public.site_cards
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
);

drop policy if exists "Allowlisted admins manage site settings" on public.site_settings;
create policy "Allowlisted admins manage site settings"
on public.site_settings
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
);

do $$
begin
  if to_regclass('public.site_hero_notice') is not null then
    execute 'drop policy if exists "Allowlisted admins manage hero notice" on public.site_hero_notice';
    execute $policy$
      create policy "Allowlisted admins manage hero notice"
      on public.site_hero_notice
      for all
      to authenticated
      using (
        exists (
          select 1 from public.admin_users au
          where lower(au.email) = lower(auth.jwt() ->> 'email')
            and au.is_active = true
        )
      )
      with check (
        exists (
          select 1 from public.admin_users au
          where lower(au.email) = lower(auth.jwt() ->> 'email')
            and au.is_active = true
        )
      )
    $policy$;
  end if;
end $$;
