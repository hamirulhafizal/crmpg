const STORAGE_PREFIX = 'crmpg_wa_avatar_url:v1:'
const DEFAULT_TTL_MS = 24 * 60 * 60_000

type CacheEntry = {
  url: string | null
  expiresAt: number
}

const memory = new Map<string, CacheEntry>()

function storageKey(userId: string, customerId: string): string {
  return `${STORAGE_PREFIX}${userId}:${customerId}`
}

function readStorage(key: string): CacheEntry | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (!parsed || typeof parsed.expiresAt !== 'number') return null
    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key)
      return null
    }
    return {
      url: typeof parsed.url === 'string' ? parsed.url : parsed.url === null ? null : null,
      expiresAt: parsed.expiresAt,
    }
  } catch {
    return null
  }
}

function writeStorage(key: string, entry: CacheEntry): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // Quota / private mode — memory cache still works.
  }
}

export function getCachedWhatsAppAvatarUrl(
  userId: string,
  customerId: string
): string | null | undefined {
  if (!userId || !customerId) return undefined
  const key = storageKey(userId, customerId)

  const mem = memory.get(key)
  if (mem) {
    if (mem.expiresAt > Date.now()) return mem.url
    memory.delete(key)
  }

  const stored = readStorage(key)
  if (!stored) return undefined
  memory.set(key, stored)
  return stored.url
}

export function setCachedWhatsAppAvatarUrl(
  userId: string,
  customerId: string,
  url: string | null,
  ttlMs = DEFAULT_TTL_MS
): void {
  if (!userId || !customerId) return
  const key = storageKey(userId, customerId)
  const entry: CacheEntry = {
    url: url && url.trim() ? url.trim() : null,
    expiresAt: Date.now() + ttlMs,
  }
  memory.set(key, entry)
  writeStorage(key, entry)
}

export function invalidateCachedWhatsAppAvatarUrl(userId: string, customerId: string): void {
  if (!userId || !customerId) return
  const key = storageKey(userId, customerId)
  memory.delete(key)
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}
