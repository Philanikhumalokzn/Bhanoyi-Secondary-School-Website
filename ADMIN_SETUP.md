# Admin Setup (Simple Steps)

This project is already coded for admin login and content editing.

## What I already did for you
- Built `admin.html` login and content management screens.
- Added database scripts in `supabase/schema.sql` and `supabase/policies.sql`.
- Added a local admin allowlist (`VITE_ADMIN_EMAILS`) so only approved emails can access admin tools.

## What you still need to do (in Supabase website)
These steps must be done in your Supabase account because they need your private project access.

1. Create a Supabase project.
2. Open SQL Editor and run:
   - `supabase/schema.sql`
   - `supabase/policies.sql`
3. In Supabase Auth, create admin users (email + password).
4. Insert those same admin emails into `public.admin_users` table.

## Local app configuration
1. Copy `.env.example` to `.env.local`.
2. Fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_EMAILS` (comma-separated admin emails)
   - `VITE_OLLAMA_MODEL` (example: `qwen3:4b`)
   - `VITE_OLLAMA_BASE_URL` (default: `http://127.0.0.1:11434`)

## Local AI Update (Ollama) on deployed site
If you open the Vercel site and use **AI Update**, browser CORS rules apply.

On Windows, set Ollama to allow your site origin, then restart Ollama:

1. Open **System Properties → Environment Variables**.
2. Add user variable:
   - Name: `OLLAMA_ORIGINS`
   - Value: `https://bhanoyi-secondary-school-website.vercel.app`
3. Close and reopen Ollama (or restart the Ollama service/app).

You can also run the website locally (`http://127.0.0.1:5173`) to avoid cross-origin issues.

## Test locally
1. `npm.cmd install`
2. `npm.cmd run dev`
3. Open `http://127.0.0.1:5173/admin.html`

## Safety checks before go-live
Run one command:
- `npm.cmd run preflight`

This command checks environment setup, runs typecheck, then runs build.
