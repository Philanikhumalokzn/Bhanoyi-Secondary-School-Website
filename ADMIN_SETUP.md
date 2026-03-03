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

## Production AI Update (recommended)
This project supports production AI through a Vercel serverless route: `/api/ai-rewrite`.

### Option A: Direct Google Gemini (no OpenRouter)
Add these environment variables in Vercel:

- `GOOGLE_API_KEY` (required for Gemini)
- `AI_GEMINI_MODEL` (optional; default: `google/gemini-2.0-flash-001`)
- `GOOGLE_GEMINI_API_URL` (optional; default: `https://generativelanguage.googleapis.com/v1beta`)

With this option, selecting **Gemini** in admin AI controls uses Google directly.

### Option B: OpenAI-compatible provider (OpenRouter or similar)
Optional if you also want non-Gemini hosted models.

In your Vercel project settings, add these environment variables:

- `AI_API_KEY` (required for this option)
- `AI_API_URL` (default OpenRouter endpoint: `https://openrouter.ai/api/v1/chat/completions`)
- `AI_MODEL` (example: `qwen/qwen3-4b:free`)
- `AI_HTTP_REFERER` (your deployed URL)
- `AI_APP_TITLE` (any app name)

Important:
- Keep secrets (`GOOGLE_API_KEY`, `AI_API_KEY`) server-side only (no `VITE_` prefix).
- After adding vars, redeploy on Vercel.
- In production, the editor uses `/api/ai-rewrite` automatically when local Ollama URL is loopback.

## Test locally
1. `npm.cmd install`
2. `npm.cmd run dev`
3. Open `http://127.0.0.1:5173/admin.html`

## Safety checks before go-live
Run one command:
- `npm.cmd run preflight`

This command checks environment setup, runs typecheck, then runs build.
