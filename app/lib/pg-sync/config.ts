const DEFAULT_SYNC_API_BASE = 'https://crmpg-mmini.publicgolds.com'
const DEFAULT_WEBHOOK_PATH = '/api/pg-sync/webhook'

export function pgSyncApiBaseUrl(): string {
  const raw = process.env.PG_SYNC_API_BASE_URL?.trim() || DEFAULT_SYNC_API_BASE
  return raw.replace(/\/$/, '')
}

export function pgSyncWebhookUrl(): string {
  const explicit = process.env.PG_SYNC_WEBHOOK_URL?.trim()
  if (explicit) return explicit

  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://www.publicgolds.com'

  return `${site.replace(/\/$/, '')}${DEFAULT_WEBHOOK_PATH}`
}

export function pgSyncWebhookSecret(): string | null {
  const s = process.env.PG_SYNC_WEBHOOK_SECRET?.trim()
  return s || null
}
