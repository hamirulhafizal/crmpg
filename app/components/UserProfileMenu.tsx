'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/app/contexts/auth-context'
import { createClient } from '@/app/lib/supabase/client'
import {
  accountInitials,
  accountCanAutoSwitch,
  loadSavedAccounts,
  MAX_SAVED_ACCOUNTS,
  recordAccountFromSession,
  removeSavedAccount,
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

function RemoveAccountDialog({
  account,
  onCancel,
  onConfirm,
}: {
  account: SavedAccount
  onCancel: () => void
  onConfirm: () => void
}) {
  const label = account.fullName?.trim() || account.email
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onCancel])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-account-title"
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <h3 id="remove-account-title" className="text-lg font-semibold text-slate-900">
          Remove account?
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Remove <span className="font-medium text-slate-900">{label}</span> from saved accounts on
          this device. You can add it again later by signing in.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Remove
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

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
  const initials = accountInitials(fullName, email)
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
          <AvatarCircle avatarUrl={avatarUrl} label={initials} />
        </button>

        {open ? (
          <div
            role="menu"
            className={`absolute right-0 ${menuZClass} mt-2 w-[min(100vw-2rem,320px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10`}
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
                      <AvatarCircle
                        avatarUrl={account.avatarUrl}
                        label={accountInitials(account.fullName, account.email)}
                        size="sm"
                      />
                      <span className="min-w-0 truncate">
                        {account.fullName?.trim() || account.email}
                      </span>
                    </a>
                    <button
                      type="button"
                      aria-label={`Remove ${account.fullName?.trim() || account.email}`}
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
        <RemoveAccountDialog
          account={accountToRemove}
          onCancel={() => setAccountToRemove(null)}
          onConfirm={handleConfirmRemove}
        />
      ) : null}
    </>
  )
}
