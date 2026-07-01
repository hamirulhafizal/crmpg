/** Client-safe site URL helper (no Node-only dependencies). */

export function getSiteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://publicgolds.com'
}
