# Go-Live Checklist (No Jargon)

Use this before launching the site publicly.

## 1) Admin access safety
- [ ] `.env.local` has `VITE_ADMIN_EMAILS` with real admin emails.
- [ ] Supabase table `admin_users` includes those same emails.
- [ ] You can log in at `/admin.html` with an approved email.
- [ ] A non-approved email cannot access admin.

## 2) Content checks
- [ ] School phone, email, address, and hours are correct.
- [ ] Announcements are current and relevant.
- [ ] All download links open correctly.
- [ ] Logo and favicon appear on all pages.

## 3) Technical checks
- [ ] `npm.cmd run typecheck` passes.
- [ ] `npm.cmd run build` passes.
- [ ] `npm.cmd run preflight` passes.

## 4) Hosting checks
- [ ] Add env values in hosting platform (same as `.env.local`).
- [ ] Deploy latest build.
- [ ] Test public pages and `/admin.html` on live URL.

## 5) Final safety
- [ ] Keep at least 2 admin accounts (backup access).
- [ ] Save a copy of `.env.local` values in secure password manager.
- [ ] Set a monthly reminder to review announcements/downloads.
