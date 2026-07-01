import { getSiteBaseUrl } from '@/app/lib/push/site-url'

/**
 * Declarative Web Push (RFC 8030) payload.
 * @see https://webkit.org/blog/16535/meet-declarative-web-push/
 * @see https://progressier.com/pwa-capabilities/declarative-web-push
 *
 * The OS displays notifications from this JSON — no service worker push handler required
 * on iOS 18.4+ installed PWAs.
 */

export type PushNotificationInput = {
  title: string
  body: string
  navigateUrl?: string
  iconUrl?: string
  imageUrl?: string
  tag?: string
  lang?: string
}

export type DeclarativePushPayload = {
  web_push: 8030
  notification: {
    title: string
    body: string
    navigate: string
    lang: string
    dir: 'ltr' | 'rtl' | 'auto'
    silent: boolean
    icon?: string
    badge?: string
    image?: string
    tag?: string
    /** Legacy alias kept for older WebKit builds */
    navigate_url?: string
  }
}

export function buildDeclarativePushPayloadObject(
  input: PushNotificationInput
): DeclarativePushPayload {
  const baseUrl = getSiteBaseUrl()
  const navigate = input.navigateUrl?.trim() || `${baseUrl}/dashboard`
  const icon = input.iconUrl?.trim() || `${baseUrl}/icons/icon-512.png`

  const notification: DeclarativePushPayload['notification'] = {
    title: input.title,
    body: input.body,
    navigate,
    navigate_url: navigate,
    lang: input.lang || 'en',
    dir: 'ltr',
    silent: false,
    icon,
    badge: icon,
    tag: input.tag || 'pg-crm-notification',
  }

  if (input.imageUrl?.trim()) {
    notification.image = input.imageUrl.trim()
  }

  return {
    web_push: 8030,
    notification,
  }
}

export function buildDeclarativePushPayload(input: PushNotificationInput): string {
  return JSON.stringify(buildDeclarativePushPayloadObject(input))
}
