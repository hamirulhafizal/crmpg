# PGO by G100 – Chrome extension

This extension uses **the same Supabase auth as the webapp** (`app/login`, `app/auth`): email/password and **Google sign-in**.

## Auth setup

1. Open the extension folder (e.g. `extension/ikfaidmmhokhgocfhhddhlahmbikjaed/`).
2. Copy `config.example.js` to `config.js` if you don’t have `config.js` yet.
3. In `config.js`, set:
   - **SUPABASE_URL** = your `NEXT_PUBLIC_SUPABASE_URL` from the webapp `.env`
   - **SUPABASE_ANON_KEY** = your `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the webapp `.env`
   - **WEBAPP_ORIGIN** = your webapp URL (e.g. `https://crmpg.vercel.app` or `http://localhost:3000`) for **Sync to Supabase** (calls `/api/openai/process-row`)

Users can sign in with **email/password** or **Sign in with Google** (same accounts as the webapp). Session is stored in the extension and refreshed automatically.

### Sync to Supabase

**Sync to Supabase** reads the customer table from the current PG Mall business center page, processes each row with OpenAI (same as the webapp’s excel “Process with OpenAI”), then upserts into `public.customers`. Duplicates (same `user_id` + `pg_code`) are overwritten with the latest data. Set **WEBAPP_ORIGIN** in `config.js` so the extension can call your `/api/openai/process-row` endpoint. Keep the popup open until sync finishes.

### Google sign-in (optional)

For "Sign in with Google" to work:

1. In **Supabase Dashboard** → **Authentication** → **Providers**, enable **Google** and configure it (same as for the webapp).
2. In **Authentication** → **URL Configuration** → **Redirect URLs**, add the extension's redirect URL. It looks like `https://<extension-id>.chromiumapp.org/` (get it via `chrome.identity.getRedirectURL()` in the extension context, or from the extension ID on `chrome://extensions`).

## Load in Chrome

1. Open `chrome://extensions/`.
2. Enable “Developer mode”.
3. Click “Load unpacked” and select the extension folder (the one that contains `manifest.json`).
