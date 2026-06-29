# Chrome Web Store publishing

CRMPG extension updates are published to an **unlisted** Chrome Web Store listing. Chrome auto-updates installed extensions in the background.

## Release flow

1. Bump semver in `extension/ikfaidmmhokhgocfhhddhlahmbikjaed/manifest.json`
   - Example: `1.0.0` → `1.0.1`
2. Merge to `main`
3. GitHub Actions builds a zip and publishes to Chrome Web Store
4. Vercel deploys the web app with the same manifest version
5. Outdated extensions are blocked from sync via `/api/openai/process-row`

## One-time Chrome Web Store setup

1. Register a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) ($5 one-time)
2. Upload the first build manually or via CI
3. Set listing visibility to **Unlisted**
4. Copy the store URL and extension ID

## GitHub secrets

Add these in GitHub → Settings → Secrets and variables → Actions:

| Secret | Purpose |
|--------|---------|
| `CHROME_EXTENSION_ID` | Extension ID from Chrome Web Store |
| `CHROME_CLIENT_ID` | OAuth client ID for Web Store API |
| `CHROME_CLIENT_SECRET` | OAuth client secret |
| `CHROME_REFRESH_TOKEN` | Refresh token for Web Store API |
| `SUPABASE_URL` | Injected into extension `config.js` at build time |
| `SUPABASE_ANON_KEY` | Injected into extension `config.js` at build time |
| `WEBAPP_ORIGIN` | Production app URL, e.g. `https://publicgolds.com` |
| `CHROME_WEB_STORE_EXTENSION_URL` | Full unlisted store URL |

## Privacy policy (Chrome Web Store)

Use this URL in the store listing:

```
https://publicgolds.com/privacy
```

## Chrome Web Store permission justifications

Copy these into the Privacy / Permission fields:

**Single purpose**

> This extension helps KEM Public Gold dealers sync customer data from the official PG Mall Business Center into their CRMPG account. Dealers sign in, read downline/customer data from pages they already have access to, and sync it to CRMPG for CRM and follow-up workflows.

**Host permission**

> The extension runs on `https://*.pgmall.my/*`, the official PG Mall Business Center site where dealers view downline/customer data. Host access is required to read the customer table on pages the signed-in dealer already has permission to view and sync that data to the dealer’s own CRMPG account.

**activeTab**

> `activeTab` is used only when the dealer clicks “Sync to CRMPG” while viewing a PG Mall Business Center page. It grants temporary access to the current tab so the extension can read the customer/downline table from the page the dealer is already viewing. Access is user-initiated and limited to the active tab.

**scripting**

> `scripting` runs page-context logic on the active PG Mall tab when the dealer clicks “Sync to CRMPG”, so customer/downline table data can be read from the Business Center page they are viewing.

**storage**

> `storage` saves the dealer’s login session (Supabase tokens), optional remembered email, sync resume state, and extension version-check cache.

**identity**

> `identity` supports secure OAuth sign-in through Supabase/Chrome identity flow to authenticate the dealer to their own CRMPG account only.

**Remote code**

> Select **No**. The extension does not download or execute remote JavaScript. All code is bundled in the package; network requests are used only for authentication and saving synced data.

**Data usage checkboxes**

- Personally identifiable information — Yes
- Authentication information — Yes
- Website content — Yes
- Location — Yes (if customer location/branch fields are synced)

Check all three certification statements at the bottom.


| Variable | Purpose |
|----------|---------|
| `CHROME_WEB_STORE_EXTENSION_URL` | Shown in extension popup + download page |
| `EXTENSION_MIN_VERSION` | Optional override. Defaults to manifest version |

## Generate Chrome Web Store API credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Chrome Web Store API**
3. Create OAuth credentials (Desktop app or Web application flow)
4. Use Google OAuth flow to obtain a refresh token scoped for Chrome Web Store publish
5. Store credentials only in GitHub Actions secrets

Useful reference: [Chrome Web Store API](https://developer.chrome.com/docs/webstore/api)

## Local commands

```bash
# Build zip to dist/CRMPG-by-KEM.zip
SUPABASE_URL=... SUPABASE_ANON_KEY=... WEBAPP_ORIGIN=... npm run extension:build

# Publish existing zip
CHROME_EXTENSION_ID=... CHROME_CLIENT_ID=... CHROME_CLIENT_SECRET=... CHROME_REFRESH_TOKEN=... npm run extension:publish
```

## Dealer install (one time)

1. Open the unlisted Chrome Web Store link from `/extension-download`
2. Click **Add to Chrome**
3. Pin the extension
4. Sign in and sync

No Developer mode or manual reload needed after the first install.

## Version blocking

- Extension sends `X-Extension-Version` on sync API calls
- Server compares against `EXTENSION_MIN_VERSION` (defaults to manifest version)
- Outdated clients see an update banner and sync is disabled

## Google OAuth redirect URL

If you use Google sign-in in the extension, add the Chrome extension redirect URL in Supabase:

```
https://<extension-id>.chromiumapp.org/
```

The extension ID must stay stable after the first Chrome Web Store publish.
