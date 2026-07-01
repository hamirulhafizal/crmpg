# PWA Setup

Progressive Web App features for Public Gold CRM at **https://publicgolds.com**.

## Environment variables

Add to `.env` (local) and Vercel production:

```bash
# Site URL (required for notification icons and tap-through links)
NEXT_PUBLIC_SITE_URL=https://publicgolds.com

# VAPID keys for Web Push — generate once and keep stable
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@publicgolds.com
```

Generate keys:

```bash
node -e "const w=require('web-push'); const k=w.generateVAPIDKeys(); console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY='+k.publicKey); console.log('VAPID_PRIVATE_KEY='+k.privateKey)"
```

**Important:** Changing VAPID keys invalidates existing device subscriptions. Users must re-enable notifications.

## Database migration

Apply migration `060_push_subscriptions.sql` (device-scoped push endpoints in Supabase).

## User flow (dashboard)

1. **Install app** — card on `/dashboard` when not installed (Android install prompt, iOS Add to Home Screen steps).
2. **Enable notifications** — step 2 card appears after install; uses declarative Web Push (iOS 18.4+ installed PWA) with service worker fallback on Android/desktop.

## Admin test broadcast

- Page: `/admin/push` (admin role only)
- Send title, message, optional image (uploaded to R2 via Media library), optional tap URL
- Broadcasts to all rows in `push_subscriptions`

## Files

| Area | Path |
|------|------|
| Manifest | `public/manifest.json` |
| Service worker | `public/sw.js` |
| Dashboard setup UI | `app/components/pwa/PWADashboardSetup.tsx` |
| Subscribe API | `app/api/push/subscribe` |
| Admin broadcast | `app/api/admin/push/broadcast` |
| Dev diagnostics | `/pwa-test/push` |

## Platform notes

| Platform | Install | Background push |
|----------|---------|-----------------|
| iOS Safari 18.4+ (installed) | Add to Home Screen | Declarative Web Push |
| Android Chrome | Install prompt | Standard Web Push |
| Desktop Chrome/Edge | Install prompt | Standard Web Push |

## Testing checklist

1. Run migration on Supabase
2. Set VAPID + `NEXT_PUBLIC_SITE_URL` env vars
3. Log in → open `/dashboard` → install app
4. Enable notifications on step 2 card
5. As admin → `/admin/push` → send test message
6. Close/kill the PWA → confirm notification still arrives
