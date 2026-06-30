'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/contexts/auth-context'
import { createClient } from '@/app/lib/supabase/client'
import { AccountAvatar } from '@/app/components/accounts/AccountAvatar'
import { RemoveSavedAccountDialog } from '@/app/components/accounts/RemoveSavedAccountDialog'
import {
  accountCanAutoSwitch,
  loadSavedAccounts,
  MAX_SAVED_ACCOUNTS,
  recordAccountFromSession,
  removeSavedAccount,
  savedAccountDisplayLabel,
  type SavedAccount,
} from '@/app/lib/auth/saved-accounts'

type UserProfileMenuProps = {
  /** Raise z-index so the menu works above fullscreen overlays (e.g. profile setup). */
  elevated?: boolean
}

export function UserProfileMenu({ elevated = false }: UserProfileMenuProps) {
  const menuZClass = elevated ? 'z-[250]' : 'z-[100]'
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
  const [accountToRemove, setAccountToRemove] = useState<SavedAccount | null>(null)
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
    if (!open || accountToRemove) return
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
  }, [open, accountToRemove])

  const handleConfirmRemove = () => {
    if (!accountToRemove) return
    removeSavedAccount(accountToRemove.userId)
    refreshSaved()
    setAccountToRemove(null)
  }

  if (loading || !user) return null

  const email = user.email ?? ''
  const displayName = fullName?.trim() || email
  const otherAccounts = Array.from(
    new Map(
      savedAccounts.filter((a) => a.userId !== user.id).map((a) => [a.userId, a])
    ).values()
  )

  return (
    <>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Account menu"
        >
          <AccountAvatar avatarUrl={avatarUrl} fullName={fullName} email={email} size="sm" className="rounded-full" />
        </button>

        {open ? (
          <div
            role="menu"
            className={`absolute right-0 ${menuZClass} mt-2 w-[min(100vw-2rem,320px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10`}
          >
            <div className="border-b border-slate-100 px-4 py-4">
              <div className="flex items-center gap-3">
                <AccountAvatar avatarUrl={avatarUrl} fullName={fullName} email={email} size="sm" className="rounded-full" />
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
                  <div
                    key={account.userId}
                    className="group flex items-center gap-0.5 pr-1 hover:bg-slate-50"
                  >
                    <a
                      href={
                        accountCanAutoSwitch(account)
                          ? `/switch-account?user_id=${encodeURIComponent(account.userId)}`
                          : `/login?switch=1&email=${encodeURIComponent(account.email)}`
                      }
                      role="menuitem"
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-sm text-slate-700"
                      onClick={() => setOpen(false)}
                    >
                      <AccountAvatar
                        avatarUrl={account.avatarUrl}
                        fullName={account.fullName}
                        email={account.email}
                        size="sm"
                        className="rounded-full"
                      />
                      <span className="min-w-0 truncate">{savedAccountDisplayLabel(account)}</span>
                    </a>
                    <button
                      type="button"
                      aria-label={`Remove ${savedAccountDisplayLabel(account)}`}
                      className="mr-1 shrink-0 rounded-lg p-1.5 text-slate-400 opacity-70 transition hover:bg-slate-200/80 hover:text-slate-700 group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setOpen(false)
                        setAccountToRemove(account)
                      }}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
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

      {accountToRemove ? (
        <RemoveSavedAccountDialog
          account={accountToRemove}
          onCancel={() => setAccountToRemove(null)}
          onConfirm={handleConfirmRemove}
        />
      ) : null}
    </>
  )
}
