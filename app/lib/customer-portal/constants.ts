export const CUSTOMER_PORTAL_COOKIE = 'customer_portal'

/** OTP validity window */
export const OTP_TTL_MS = 10 * 60 * 1000

/** Signed session cookie lifetime */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const OTP_LENGTH = 6

/** Max OTP sends per identifier within the rate window */
export const OTP_SEND_LIMIT = 3
export const OTP_SEND_WINDOW_MS = 15 * 60 * 1000

export const OTP_MAX_VERIFY_ATTEMPTS = 5
