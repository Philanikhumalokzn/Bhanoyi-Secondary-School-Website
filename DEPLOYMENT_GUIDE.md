# Deployment Guide (Step-by-Step)

This project is ready to deploy as a static frontend with Supabase as backend.

## Before you deploy

1. Ensure local checks pass:
   - `npm.cmd run preflight`
2. Confirm Supabase is set up:
   - ran `supabase/schema.sql`
   - ran `supabase/policies.sql`
   - created at least one Auth user
   - inserted that email into `admin_users`

---

## Option A: Deploy to Vercel (recommended)

1. Go to Vercel and sign in.
2. Click **Add New Project**.
3. Import this GitHub repository.
4. Vercel should auto-detect Vite.
5. In Environment Variables, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_EMAILS`
6. Click **Deploy**.
7. After deploy finishes:
   - open your site URL
   - test `/admin.html`
   - log in and create one announcement

### Vercel build settings (if asked)
- Build command: `npm.cmd run build` (or `npm run build`)
- Output directory: `dist`

---

## Option B: Deploy to Netlify

1. Go to Netlify and sign in.
2. Click **Add new site** → **Import an existing project**.
3. Connect your Git provider and select this repo.
4. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_EMAILS`
6. Deploy site.
7. Test `/admin.html` and create a test announcement.

---

## Post-deploy checklist

1. Public pages load correctly.
2. Logo appears in header and browser tab.
3. `/admin.html` login works.
4. Admin save works for:
   - announcements
   - downloads
5. Public site updates after admin save.
6. Add a backup admin account.

---

## If admin login works but save fails

1. Re-run `supabase/policies.sql`.
2. Confirm user exists in `admin_users` and `is_active = true`.
3. Ensure email in `admin_users` matches admin login email (case-insensitive is supported).
4. Confirm the same email is listed in `VITE_ADMIN_EMAILS`.

---

## Important

I cannot deploy to your Vercel/Netlify account directly from here because it requires your account login and permissions. I can guide every click and troubleshoot instantly.
