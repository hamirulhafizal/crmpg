/** Client-safe app origin helper (no Node-only dependencies). */

/**
 * Canonical public app URL from `NEXT_PUBLIC_APP_URL`
 * (falls back to `NEXT_PUBLIC_SITE_URL`, then localhost for local dev).
 */
export function getAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

/** @deprecated Prefer getAppBaseUrl — kept for existing push imports. */
export function getSiteBaseUrl(): string {
  return getAppBaseUrl()
}

/** Hostname label for display (e.g. crmpg.vercel.app). */
export function getAppHostLabel(): string {
  try {
    return new URL(getAppBaseUrl()).host
  } catch {
    return getAppBaseUrl().replace(/^https?:\/\//, '')
  }
}

/** Absolute URL for a path on the app origin. */
export function appUrl(pathname = '/'): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${getAppBaseUrl()}${path}`
}
