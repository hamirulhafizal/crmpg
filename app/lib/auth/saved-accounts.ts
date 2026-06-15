import type { Session, SupabaseClient, User } from '@supabase/supabase-js'

export const SAVED_ACCOUNTS_STORAGE_KEY = 'crmpg_saved_accounts_v1'
export const MAX_SAVED_ACCOUNTS = 5

export type SavedAccount = {
  userId: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  /** Stored on this device only — enables one-click account switch. */
  password: string | null
  refreshToken: string | null
  accessToken: string | null
  expiresAt: number | null
  lastUsedAt: number
}

export type RecordAccountOptions = {
  password?: string | null
}

export function loadSavedAccounts(): SavedAccount[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SAVED_ACCOUNTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (row): row is SavedAccount =>
          row &&
          typeof row === 'object' &&
          typeof (row as SavedAccount).userId === 'string' &&
          typeof (row as SavedAccount).email === 'string'
      )
      .map((row) => ({
        userId: row.userId,
        email: row.email,
        fullName: row.fullName ?? null,
        avatarUrl: row.avatarUrl ?? null,
        password: row.password ?? null,
        refreshToken: row.refreshToken ?? null,
        accessToken: row.accessToken ?? null,
        expiresAt: row.expiresAt ?? null,
        lastUsedAt: typeof row.lastUsedAt === 'number' ? row.lastUsedAt : 0,
      }))
      .slice(0, MAX_SAVED_ACCOUNTS)
  } catch {
    return []
  }
}

export function saveSavedAccounts(accounts: SavedAccount[]): void {
  if (typeof window === 'undefined') return
  const sorted = [...accounts]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_SAVED_ACCOUNTS)
  localStorage.setItem(SAVED_ACCOUNTS_STORAGE_KEY, JSON.stringify(sorted))
}

export function findSavedAccount(userId: string): SavedAccount | undefined {
  return loadSavedAccounts().find((a) => a.userId === userId)
}

export function findSavedAccountByEmail(email: string): SavedAccount | undefined {
  const normalized = email.trim().toLowerCase()
  return loadSavedAccounts().find((a) => a.email.trim().toLowerCase() === normalized)
}

export function upsertSavedAccount(
  account: Omit<SavedAccount, 'lastUsedAt'> & { lastUsedAt?: number }
): SavedAccount[] {
  const prev = loadSavedAccounts().find((a) => a.userId === account.userId)
  const now = account.lastUsedAt ?? Date.now()
  const next: SavedAccount = {
    userId: account.userId,
    email: account.email,
    fullName: account.fullName ?? null,
    avatarUrl: account.avatarUrl ?? null,
    password: account.password ?? prev?.password ?? null,
    refreshToken: account.refreshToken ?? prev?.refreshToken ?? null,
    accessToken: account.accessToken ?? prev?.accessToken ?? null,
    expiresAt: account.expiresAt ?? prev?.expiresAt ?? null,
    lastUsedAt: now,
  }
  const existing = loadSavedAccounts().filter((a) => a.userId !== next.userId)
  const merged = [next, ...existing]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_SAVED_ACCOUNTS)
  saveSavedAccounts(merged)
  return merged
}

export function clearAccountCredentials(userId: string): SavedAccount[] {
  const accounts = loadSavedAccounts()
  const next = accounts.map((a) =>
    a.userId === userId
      ? {
          ...a,
          password: null,
          refreshToken: null,
          accessToken: null,
          expiresAt: null,
        }
      : a
  )
  saveSavedAccounts(next)
  return next
}

/** @deprecated Use clearAccountCredentials */
export function clearAccountSessionTokens(userId: string): SavedAccount[] {
  return clearAccountCredentials(userId)
}

export async function recordAccountFromSession(
  supabase: SupabaseClient,
  user: User,
  session?: Session | null,
  options?: RecordAccountOptions
): Promise<SavedAccount[]> {
  const email = user.email?.trim() ?? ''
  if (!email) return loadSavedAccounts()

  let activeSession = session ?? null
  if (!activeSession) {
    const { data } = await supabase.auth.getSession()
    activeSession = data.session
  }

  const prev = findSavedAccount(user.id)

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  return upsertSavedAccount({
    userId: user.id,
    email,
    fullName:
      (typeof profile?.full_name === 'string' && profile.full_name.trim()) ||
      (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null) ||
      null,
    avatarUrl: typeof profile?.avatar_url === 'string' ? profile.avatar_url : null,
    password: options?.password ?? prev?.password ?? null,
    refreshToken: activeSession?.refresh_token ?? prev?.refreshToken ?? null,
    accessToken: activeSession?.access_token ?? prev?.accessToken ?? null,
    expiresAt: activeSession?.expires_at ?? prev?.expiresAt ?? null,
    lastUsedAt: Date.now(),
  })
}

export function accountInitials(fullName: string | null | undefined, email: string): string {
  const name = fullName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export function accountCanAutoSwitch(account: SavedAccount): boolean {
  return Boolean(account.password?.trim() || account.refreshToken?.trim())
}

export type SwitchAccountResult =
  | { ok: true }
  | { ok: false; reason: 'no_credentials' | 'auth_failed' }

export async function switchToSavedAccount(
  supabase: SupabaseClient,
  target: SavedAccount
): Promise<SwitchAccountResult> {
  if (!accountCanAutoSwitch(target)) {
    return { ok: false, reason: 'no_credentials' }
  }

  const {
    data: { session: current },
  } = await supabase.auth.getSession()

  if (current?.user?.id === target.userId) {
    return { ok: true }
  }

  if (current?.user) {
    const currentSaved = findSavedAccount(current.user.id)
    await recordAccountFromSession(supabase, current.user, current, {
      password: currentSaved?.password ?? undefined,
    })
  }

  if (target.password?.trim()) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: target.email,
      password: target.password,
    })
    if (!error && data.user && data.session) {
      await recordAccountFromSession(supabase, data.user, data.session, {
        password: target.password,
      })
      return { ok: true }
    }
  }

  if (target.refreshToken?.trim()) {
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // ignore
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: target.refreshToken,
    })
    if (!error && data.user && data.session) {
      const prev = findSavedAccount(data.user.id)
      await recordAccountFromSession(supabase, data.user, data.session, {
        password: prev?.password ?? undefined,
      })
      return { ok: true }
    }

    const { data: setData, error: setError } = await supabase.auth.setSession({
      access_token: target.accessToken ?? '',
      refresh_token: target.refreshToken,
    })
    if (!setError && setData.user && setData.session) {
      const prev = findSavedAccount(setData.user.id)
      await recordAccountFromSession(supabase, setData.user, setData.session, {
        password: prev?.password ?? undefined,
      })
      return { ok: true }
    }
  }

  return { ok: false, reason: 'auth_failed' }
}
