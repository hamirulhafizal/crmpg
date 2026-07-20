'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/app/lib/supabase/client'
import { sanitizeNextPath } from '@/app/lib/auth/safe-next-path'

/**
 * Fallback handoff when the sealed API is unavailable.
 * iOS opens: /auth/ios-session#access_token=…&refresh_token=…&next=/excel-processor
 * Hash fragments are not sent to the server.
 */
export default function IosSessionPage() {
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      try {
        const hash = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.hash
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')?.trim() ?? ''
        const refreshToken = params.get('refresh_token')?.trim() ?? ''
        const next = sanitizeNextPath(params.get('next'))

        // Clear tokens from the address bar ASAP.
        window.history.replaceState(null, '', '/auth/ios-session')

        if (!accessToken || !refreshToken) {
          window.location.replace(`/login?next=${encodeURIComponent(next)}&ios_handoff=missing_tokens`)
          return
        }

        const supabase = createClient()
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (sessionError) {
          setError(sessionError.message)
          return
        }

        window.location.replace(next)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not restore session')
      }
    })()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {error ? (
          <>
            <p className="text-sm font-medium text-red-700">{error}</p>
            <a
              href="/login"
              className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              Sign in
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
            <p className="mt-4 text-sm text-slate-600">Signing you in from the app…</p>
          </>
        )}
      </div>
    </div>
  )
}
