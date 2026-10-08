'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/app/lib/supabase/client'
import { findSavedAccount, switchToSavedAccount } from '@/app/lib/auth/saved-accounts'

function hardGo(url: string) {
  // Full document load — clears stuck view-transition layers and remounts AppShell.
  window.location.replace(url)
}

export default function SwitchAccountPage() {
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      try {
        const userId = new URLSearchParams(window.location.search).get('user_id')?.trim() ?? ''
        if (!userId) {
          hardGo('/dashboard')
          return
        }

        const target = findSavedAccount(userId)
        if (!target) {
          hardGo('/dashboard')
          return
        }

        const supabase = createClient()
        const result = await switchToSavedAccount(supabase, target)

        if (result.ok) {
          hardGo('/dashboard')
          return
        }

        hardGo(`/login?switch=1&email=${encodeURIComponent(target.email)}`)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not switch account')
      }
    })()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {error ? (
          <>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
            <a
              href="/dashboard"
              className="mt-4 inline-block text-sm font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400"
            >
              Back to dashboard
            </a>
          </>
        ) : (
          <>
            <svg
              className="mx-auto h-8 w-8 animate-spin text-violet-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="mt-4 text-sm text-muted-foreground">Switching account…</p>
          </>
        )}
      </div>
    </div>
  )
}
