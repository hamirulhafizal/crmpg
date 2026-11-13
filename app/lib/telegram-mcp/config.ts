/** Telegram channel media bridge (setup service REST + optional MCP). */

export const DEFAULT_TELEGRAM_MCP_BASE_URL = 'https://mcptelegram.publicgolds.com'

/** Fallback single channel if allowlist fetch fails. */
export const DEFAULT_TELEGRAM_MEDIA_CHAT_ID = '-1487683602'

/**
 * Hardcoded PGG100 content channels (same catalog as mcptelegram allowlist).
 * Prefer live `/api/channel-media/allowlist` when available.
 */
export const DEFAULT_TELEGRAM_MEDIA_CHAT_IDS = [
  '-1769481822',
  '-1529883646',
  '-1227114769',
  '-1487683602',
  '-1443247812',
  '-2025051544',
  '-1205403879',
  '-1490761320',
  '-1191068358',
  '-1232314406',
  '-1497810520',
] as const

export const TELEGRAM_IMPORT_FOLDER = 'telegram-imports'

export function getTelegramMcpBaseUrl(): string {
  return (
    process.env.TELEGRAM_MCP_BASE_URL?.trim() ||
    process.env.TELEGRAM_MCP_URL?.trim()?.replace(/\/mcp\/?$/, '') ||
    DEFAULT_TELEGRAM_MCP_BASE_URL
  ).replace(/\/$/, '')
}

/** @deprecated Prefer getTelegramMediaChatIds() for multi-channel search. */
export function getTelegramMediaChatId(): string {
  const fromList = getTelegramMediaChatIds()[0]
  return process.env.TELEGRAM_MEDIA_CHAT_ID?.trim() || fromList || DEFAULT_TELEGRAM_MEDIA_CHAT_ID
}

/**
 * Multi-channel catalog for search.
 * Only TELEGRAM_MEDIA_CHAT_IDS overrides the hardcoded list.
 * TELEGRAM_MEDIA_CHAT_ID alone is a default/fallback id, not a full catalog replace.
 */
export function getTelegramMediaChatIds(): string[] {
  const multi = process.env.TELEGRAM_MEDIA_CHAT_IDS?.trim()
  if (multi) {
    const ids = multi
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (ids.length) return [...new Set(ids)]
  }
  return [...DEFAULT_TELEGRAM_MEDIA_CHAT_IDS]
}

export function getTelegramMcpApiKey(): string | null {
  return process.env.TELEGRAM_MCP_API_KEY?.trim() || null
}

export function isTelegramMediaConfigured(): boolean {
  return Boolean(getTelegramMcpBaseUrl() && getTelegramMediaChatIds().length)
}

export function isAllowedTelegramChatId(chatId: string): boolean {
  const id = chatId.trim()
  if (!id) return false
  const allowed = new Set(getTelegramMediaChatIds())
  if (allowed.has(id)) return true
  // Accept -100… form when allowlist has short form (or reverse).
  if (id.startsWith('-100') && allowed.has(`-${id.slice(4)}`)) return true
  if (!id.startsWith('-100') && allowed.has(`-100${id.replace(/^-/, '')}`)) return true
  return false
}
