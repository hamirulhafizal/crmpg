'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { createClient } from '@/app/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function resetLinkErrorMessage(raw: string | undefined | null): string {
  const text = raw?.trim() || 'Could not start password reset.'
  if (/code verifier/i.test(text) || /bad_oauth_callback/i.test(text)) {
    return 'This reset link cannot be used from email in a different browser. Request a new reset link, then open the latest email on this device.'
  }
  return text
}

function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const exchanged = useRef(false)

  useEffect(() => {
    if (exchanged.current) return
    exchanged.current = true

    void (async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const hash = new URLSearchParams(
          window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
        )
        const rawError =
          hash.get('error_description') ||
          hash.get('error') ||
          params.get('error_description') ||
          params.get('error')

        if (rawError) {
          const decoded = decodeURIComponent(rawError.replace(/\+/g, ' '))
          setMessage({
            type: 'error',
            text: resetLinkErrorMessage(decoded),
          })
          setReady(true)
          return
        }

        const tokenHash = params.get('token_hash')
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type: 'recovery',
            token_hash: tokenHash,
          })
          if (error) {
            setMessage({
              type: 'error',
              text:
                error.message ||
                'This reset link is invalid or expired. Request a new one from Forgot password.',
            })
            setReady(true)
            return
          }
          window.history.replaceState({}, '', '/reset-password')
        } else {
          const accessToken = hash.get('access_token')
          const refreshToken = hash.get('refresh_token')
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            if (error) {
              setMessage({
                type: 'error',
                text: error.message || 'Could not start password reset.',
              })
              setReady(true)
              return
            }
            window.history.replaceState({}, '', '/reset-password')
          } else if (params.get('code')) {
            const { error } = await supabase.auth.exchangeCodeForSession(params.get('code')!)
            if (error) {
              setMessage({
                type: 'error',
                text: resetLinkErrorMessage(
                  error.message ||
                    'This reset link is invalid or expired. Request a new one from Forgot password.'
                ),
              })
              setReady(true)
              return
            }
            window.history.replaceState({}, '', '/reset-password')
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          setMessage({
            type: 'error',
            text: 'Auth session missing. Request a new reset link and open the latest email on this device.',
          })
          setSessionReady(false)
        } else {
          setSessionReady(true)
          setMessage(null)
        }
      } catch (err: unknown) {
        setMessage({
          type: 'error',
          text: resetLinkErrorMessage(
            err instanceof Error ? err.message : 'Could not start password reset.'
          ),
        })
        setSessionReady(false)
      } finally {
        setReady(true)
      }
    })()
  }, [supabase])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    if (password !== confirmPassword) {
      setMessage({
        type: 'error',
        text: 'Passwords do not match.',
      })
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setMessage({
        type: 'error',
        text: 'Password must be at least 6 characters long.',
      })
      setLoading(false)
      return
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        throw new Error(
          'Auth session missing. Request a new reset link and open it in this browser.'
        )
      }

      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error

      setMessage({
        type: 'success',
        text: 'Password reset successfully! Redirecting to login...',
      })

      await supabase.auth.signOut()
      setTimeout(() => {
        router.push('/login')
      }, 1500)
    } catch (error: unknown) {
      const err = error as { message?: string }
      setMessage({
        type: 'error',
        text: resetLinkErrorMessage(err.message || 'An error occurred. Please try again.'),
      })
    } finally {
      setLoading(false)
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4 py-12">
        <div className="text-center">
          <svg
            className="mx-auto h-8 w-8 animate-spin text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="mt-4 text-slate-600">Verifying reset link…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-semibold text-slate-900">Reset Password</h1>
          <p className="text-slate-600">Enter your new password</p>
        </div>

        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          {message && (
            <div
              className={`rounded-xl p-4 transition-all duration-300 ${
                message.type === 'success'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <p className="text-sm font-medium">{message.text}</p>
              {message.type === 'error' && !sessionReady ? (
                <p className="mt-2 text-sm">
                  <Link href="/forgot-password" className="font-semibold underline">
                    Request a new reset link
                  </Link>
                </p>
              ) : null}
            </div>
          )}

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                disabled={!sessionReady || loading}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                disabled={!sessionReady || loading}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !sessionReady}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-500/30 transition-all duration-200 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>

          <div className="border-t border-slate-200 pt-4 text-center">
            <p className="text-sm text-slate-600">
              Remember your password?{' '}
              <Link
                href="/login"
                className="font-semibold text-blue-600 transition-colors hover:text-blue-700"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white">
          <p className="text-slate-600">Loading...</p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
