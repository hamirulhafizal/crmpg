export const PORTAL_BRAND = 'PG Gold Saver'

/** Dedicated public URL for customer self-service */
export const PORTAL_BASE_PATH = '/pg-gold-saver'

export const PORTAL_LOGIN_PATH = `${PORTAL_BASE_PATH}/login`
export const PORTAL_PROFILE_PATH = `${PORTAL_BASE_PATH}/profile`

/** Full customer portal sign-in URL for sharing with customers. */
export function customerPortalLoginUrl(origin: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}${PORTAL_LOGIN_PATH}`
}
