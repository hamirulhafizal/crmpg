import { getSiteBaseUrl } from '@/app/lib/push/site-url'

/**
 * Declarative Web Push (RFC 8030) payload.
 * Format aligned with working Rms implementation + WebKit spec.
 * @see https://webkit.org/blog/16535/meet-declarative-web-push/
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

/** Matches Rms + WebKit — string "8030" for broad client compatibility. */
export type DeclarativePushPayload = {
  web_push: '8030'
  notification: {
    title: string
    body: string
    navigate_url: string
    /** WebKit spec field — included alongside navigate_url */
    navigate?: string
    tag?: string
    sound?: string
    icon?: string
    badge?: string
    image?: string
    lang?: string
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
    navigate_url: navigate,
    navigate,
    tag: input.tag || 'pg-crm-notification',
    sound: 'default',
    icon,
    badge: icon,
    lang: input.lang || 'en',
  }

  if (input.imageUrl?.trim()) {
    notification.image = input.imageUrl.trim()
  }

  return {
    web_push: '8030',
    notification,
  }
}

export function buildDeclarativePushPayload(input: PushNotificationInput): string {
  return JSON.stringify(buildDeclarativePushPayloadObject(input))
}
