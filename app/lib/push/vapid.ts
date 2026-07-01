import webpush from 'web-push'

import { getSiteBaseUrl } from '@/app/lib/push/site-url'

export { getSiteBaseUrl }

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@publicgolds.com'

let initialized = false

export function ensureWebPushConfigured(): { ok: true } | { ok: false; error: string } {
  if (!vapidPublicKey || !vapidPrivateKey) {
    return {
      ok: false,
      error:
        'VAPID keys not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.',
    }
  }

  if (!initialized) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    initialized = true
  }

  return { ok: true }
}

export { webpush }
