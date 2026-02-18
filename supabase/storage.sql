insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'news-images',
  'news-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read news images" on storage.objects;
create policy "Public read news images"
on storage.objects
for select
using (bucket_id = 'news-images');

drop policy if exists "Allowlisted admins upload news images" on storage.objects;
create policy "Allowlisted admins upload news images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'news-images'
  and exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
);

drop policy if exists "Allowlisted admins update news images" on storage.objects;
create policy "Allowlisted admins update news images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'news-images'
  and exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
)
with check (
  bucket_id = 'news-images'
  and exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
);

drop policy if exists "Allowlisted admins delete news images" on storage.objects;
create policy "Allowlisted admins delete news images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'news-images'
  and exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'section-files',
  'section-files',
  true,
  26214400,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read section files" on storage.objects;
create policy "Public read section files"
on storage.objects
for select
using (bucket_id = 'section-files');

drop policy if exists "Allowlisted admins upload section files" on storage.objects;
create policy "Allowlisted admins upload section files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'section-files'
  and exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
);

drop policy if exists "Allowlisted admins update section files" on storage.objects;
create policy "Allowlisted admins update section files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'section-files'
  and exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
)
with check (
  bucket_id = 'section-files'
  and exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
);

drop policy if exists "Allowlisted admins delete section files" on storage.objects;
create policy "Allowlisted admins delete section files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'section-files'
  and exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.is_active = true
  )
);
