'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/app/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LoginAccountPicker } from '@/app/components/accounts/LoginAccountPicker'
import {
  findSavedAccount,
  findSavedAccountByEmail,
  loadSavedAccounts,
  recordAccountFromSession,
  switchToSavedAccount,
  type SavedAccount,
} from '@/app/lib/auth/saved-accounts'

type LoginView = 'picker' | 'form'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginMethod, setLoginMethod] = useState<'magic' | 'password'>('password')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [view, setView] = useState<LoginView>('form')
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null)
  const [addAccountMode, setAddAccountMode] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  const passwordInputRef = useRef<HTMLInputElement>(null)
  const passwordVisibilityToggleRef = useRef<HTMLInputElement>(null)
  const passwordVisibilityLabelRef = useRef<HTMLSpanElement>(null)
  const initDone = useRef(false)

  const refreshSavedAccounts = useCallback(() => {
    const accounts = loadSavedAccounts()
    setSavedAccounts(accounts)
    return accounts
  }, [])

  const getNextPath = () => {
    if (typeof window === 'undefined') return '/dashboard'
    const requestedNext = new URLSearchParams(window.location.search).get('next') || '/dashboard'
    return requestedNext.startsWith('/') ? requestedNext : '/dashboard'
  }

  const startGoogleLogin = useCallback(async () => {
    setLoading(true)
    setMessage(null)

    try {
      const nextPath = getNextPath()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })

      if (error) throw error
    } catch (error: unknown) {
      setLoading(false)
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred. Please try again.',
      })
    }
  }, [supabase])

  const handleSelectAccount = useCallback(
    async (account: SavedAccount) => {
      setMessage(null)
      setSwitchingUserId(account.userId)

      try {
        const result = await switchToSavedAccount(supabase, account)
        if (result.ok) {
          window.location.replace(getNextPath())
          return
        }

        const isGoogleOnly = !account.password?.trim() && Boolean(account.refreshToken?.trim())
        if (isGoogleOnly) {
          setAddAccountMode(true)
          setMessage({
            type: 'success',
            text: `Continue with Google to sign in as ${account.email}.`,
          })
          await startGoogleLogin()
          return
        }

        setView('form')
        setEmail(account.email)
        setMessage({
          type: 'success',
          text: `Sign in as ${account.email} to continue.`,
        })
      } finally {
        setSwitchingUserId(null)
      }
    },
    [startGoogleLogin, supabase]
  )

  useEffect(() => {
    if (initDone.current || typeof window === 'undefined') return
    initDone.current = true

    const params = new URLSearchParams(window.location.search)
    const accounts = loadSavedAccounts()
    setSavedAccounts(accounts)

    if (params.get('logged_out') === '1') {
      setMessage({ type: 'success', text: 'You have been signed out. Sign in again to continue.' })
      window.history.replaceState({}, '', '/login')
      setView(accounts.length > 0 ? 'picker' : 'form')
      setInitialized(true)
      return
    }

    const forceForm =
      params.get('add_account') === '1' ||
      params.get('switch') === '1' ||
      Boolean(params.get('email')?.trim())

    if (params.get('add_account') === '1') {
      setAddAccountMode(true)
      setView('form')
      setMessage({
        type: 'success',
        text: 'Sign in with another account. Saved accounts stay on this browser only (up to 5).',
      })
      setInitialized(true)
      return
    }

    const switchEmail = params.get('email')?.trim()
    if (params.get('switch') === '1' && switchEmail) {
      setEmail(switchEmail)
      setView('form')
      void (async () => {
        const saved = findSavedAccountByEmail(switchEmail)
        if (saved) {
          await handleSelectAccount(saved)
          return
        }
        setMessage({
          type: 'success',
          text: `Sign in as ${switchEmail} to switch accounts.`,
        })
      })()
      setInitialized(true)
      return
    }

    if (switchEmail) {
      setEmail(switchEmail)
      setView('form')
    } else if (!forceForm && accounts.length > 0) {
      setView('picker')
    } else {
      setView('form')
    }

    setInitialized(true)
  }, [handleSelectAccount])

  useEffect(() => {
    if (view !== 'form') return
    const input = passwordInputRef.current
    const toggle = passwordVisibilityToggleRef.current
    const labelEl = passwordVisibilityLabelRef.current
    if (!input || !toggle || !labelEl) return

    const syncFromToggle = () => {
      const show = toggle.checked
      input.type = show ? 'text' : 'password'
      labelEl.textContent = show ? 'Hide password' : 'Show password'
    }

    toggle.addEventListener('change', syncFromToggle)
    syncFromToggle()

    return () => {
      toggle.removeEventListener('change', syncFromToggle)
    }
  }, [view])

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const nextPath = getNextPath()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })

      if (error) throw error

      setMessage({
        type: 'success',
        text: 'Check your email for the magic link to sign in.',
      })
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred. Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const nextPath = getNextPath()

      if (addAccountMode) {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession()
        if (currentSession?.user) {
          const currentSaved = findSavedAccount(currentSession.user.id)
          await recordAccountFromSession(supabase, currentSession.user, currentSession, {
            password: currentSaved?.password ?? undefined,
          })
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data.user && data.session) {
        await recordAccountFromSession(supabase, data.user, data.session, { password })
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
      router.push(nextPath)
      router.refresh()
    } catch (error: unknown) {
      const err = error as { message?: string }
      let errorMessage = err.message || 'Invalid email or password. Please try again.'

      if (err.message?.includes('Failed to fetch') || err.message?.includes('CORS')) {
        errorMessage =
          'Unable to connect to authentication server. Please check: 1) Supabase project is not paused, 2) Environment variables are set correctly, 3) Try using Google OAuth login instead.'
      } else if (err.message?.includes('Invalid login credentials')) {
        errorMessage =
          'Invalid email or password. Please check your credentials or use "Forgot password?" to reset.'
      } else if (err.message?.includes('Email not confirmed')) {
        errorMessage = 'Please check your email and confirm your account before signing in.'
      }

      setMessage({
        type: 'error',
        text: errorMessage,
      })
    } finally {
      setLoading(false)
    }
  }

  const showBackToPicker = view === 'form' && savedAccounts.length > 0

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <svg
          className="h-8 w-8 animate-spin text-blue-600"
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
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-12">
      <div className={`w-full ${view === 'picker' ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-semibold text-slate-900">
            {view === 'picker' ? 'Choose Account' : 'Welcome Back'}
          </h1>
          <p className="text-slate-600">
            {view === 'picker'
              ? 'Pick a saved account or add another account on this device.'
              : 'Sign in to your account to continue'}
          </p>
        </div>

        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          {message ? (
            <div
              className={`rounded-xl p-4 transition-all duration-300 ${
                message.type === 'success'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <p className="text-sm font-medium">{message.text}</p>
            </div>
          ) : null}

          {view === 'picker' ? (
            <LoginAccountPicker
              accounts={savedAccounts}
              switchingUserId={switchingUserId}
              onSelect={handleSelectAccount}
              onAdd={() => {
                setAddAccountMode(true)
                setView('form')
                setMessage({
                  type: 'success',
                  text: 'Sign in with another account. Saved accounts stay on this browser only (up to 5).',
                })
              }}
            />
          ) : (
            <>
              {showBackToPicker ? (
                <button
                  type="button"
                  onClick={() => {
                    setView('picker')
                    setAddAccountMode(false)
                    setMessage(null)
                  }}
                  className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 transition hover:text-slate-900"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to account picker
                </button>
              ) : null}

              <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setLoginMethod('password')}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                    loginMethod === 'password'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Email & Password
                </button>
                <button hidden type="button" onClick={() => setLoginMethod('magic')}>
                  Magic Link
                </button>
              </div>

              {loginMethod === 'password' ? (
                <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                        Password
                      </label>
                      <Link
                        href="/forgot-password"
                        className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <input
                      ref={passwordInputRef}
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                    <div className="mt-3">
                      <label
                        htmlFor="login-show-password"
                        className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600"
                      >
                        <input
                          ref={passwordVisibilityToggleRef}
                          id="login-show-password"
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded-full border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-200 focus:ring-offset-0"
                        />
                        <span ref={passwordVisibilityLabelRef}>Show password</span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-500/30 transition-all duration-200 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>
              ) : null}

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-slate-500">Or continue with</span>
                </div>
              </div>

              <button
                onClick={() => void startGoogleLogin()}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </button>

              <div className="border-t border-slate-200 pt-4 text-center">
                <p className="text-sm text-slate-600">
                  Don&apos;t have an account?{' '}
                  <Link href="/register" className="font-semibold text-blue-600 transition-colors hover:text-blue-700">
                    Sign up
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
