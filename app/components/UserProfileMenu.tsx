'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/contexts/auth-context'
import { createClient } from '@/app/lib/supabase/client'
import {
  accountInitials,
  accountCanAutoSwitch,
  loadSavedAccounts,
  MAX_SAVED_ACCOUNTS,
  recordAccountFromSession,
  type SavedAccount,
} from '@/app/lib/auth/saved-accounts'

function AvatarCircle({
  avatarUrl,
  label,
  size = 'md',
}: {
  avatarUrl: string | null
  label: string
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'
  if (avatarUrl?.trim()) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-white`}
      />
    )
  }
  return (
    <span
      className={`${dim} inline-flex shrink-0 items-center justify-center rounded-full bg-violet-600 font-semibold text-white ring-2 ring-white`}
      aria-hidden
    >
      {label}
    </span>
  )
}

export function UserProfileMenu() {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  const refreshSaved = useCallback(() => {
    setSavedAccounts(loadSavedAccounts())
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
      setFullName(data?.full_name ?? null)
      setAvatarUrl(typeof data?.avatar_url === 'string' ? data.avatar_url : null)
      await recordAccountFromSession(supabase, user, session)
      refreshSaved()
    })()
  }, [user, refreshSaved])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (loading || !user) return null

  const email = user.email ?? ''
  const displayName = fullName?.trim() || email
  const initials = accountInitials(fullName, email)
  const otherAccounts = savedAccounts.filter((a) => a.userId !== user.id)

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <AvatarCircle avatarUrl={avatarUrl} label={initials} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[100] mt-2 w-[min(100vw-2rem,320px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
        >
          <div className="border-b border-slate-100 px-4 py-4">
            <div className="flex items-center gap-3">
              <AvatarCircle avatarUrl={avatarUrl} label={initials} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                <p className="truncate text-xs text-slate-500">{email}</p>
              </div>
            </div>
          </div>

          <div className="py-1">
            <Link
              href="/profile"
              role="menuitem"
              className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Profile settings
            </Link>
            <a
              href="/logout"
              role="menuitem"
              className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Sign out
            </a>
          </div>

          {otherAccounts.length > 0 ? (
            <div className="border-t border-slate-100 py-2">
              <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                Other accounts
              </p>
              {otherAccounts.map((account) => (
                <a
                  key={account.userId}
                  href={
                    accountCanAutoSwitch(account)
                      ? `/switch-account?user_id=${encodeURIComponent(account.userId)}`
                      : `/login?switch=1&email=${encodeURIComponent(account.email)}`
                  }
                  role="menuitem"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setOpen(false)}
                >
                  <AvatarCircle
                    avatarUrl={account.avatarUrl}
                    label={accountInitials(account.fullName, account.email)}
                    size="sm"
                  />
                  <span className="min-w-0 truncate">{account.fullName?.trim() || account.email}</span>
                </a>
              ))}
            </div>
          ) : null}

          {savedAccounts.length < MAX_SAVED_ACCOUNTS ? (
            <div className="border-t border-slate-100 py-1">
              <Link
                href="/login?add_account=1"
                role="menuitem"
                className="block px-4 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-50"
                onClick={() => setOpen(false)}
              >
                Add account
              </Link>
            </div>
          ) : (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              Maximum of 5 saved accounts on this device.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
