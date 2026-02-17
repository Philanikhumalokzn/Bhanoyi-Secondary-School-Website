alter table public.site_announcements enable row level security;
alter table public.site_downloads enable row level security;
alter table public.admin_users enable row level security;

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
