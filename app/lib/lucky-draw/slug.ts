const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export function defaultDealerSlugFromUserId(userId: string): string {
  const compact = userId.replace(/-/g, '').toLowerCase()
  return compact.slice(-4) || 'user'
}

export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length > 64) return false
  return SLUG_PATTERN.test(slug)
}

export function luckyDrawPublicPath(dealerSlug: string, pageSlug: string): string {
  return `/${dealerSlug}/${pageSlug}`
}
