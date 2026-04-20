'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { createClient } from '@/app/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PWAInstallPrompt from '@/app/components/PWAInstallPrompt'
import PWAInstallButton from '@/app/components/PWAInstallButton'

export default function DashboardPage() {
  const { user, loading, signOut, refreshUser } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [hasActiveWahaSession, setHasActiveWahaSession] = useState(false)

  const [passwordGateLoading, setPasswordGateLoading] = useState(true)
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordDialogError, setPasswordDialogError] = useState<string | null>(null)
  const [passwordSubmitLoading, setPasswordSubmitLoading] = useState(false)
  const [showSetupPasswords, setShowSetupPasswords] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const rawPhone = String(user.user_metadata?.phone || '').trim()
    let sessionName = rawPhone.replace(/\D/g, '')
    if (sessionName.startsWith('0')) {
      sessionName = `60${sessionName.slice(1)}`
    } else if (sessionName && !sessionName.startsWith('60')) {
      sessionName = `60${sessionName}`
    }

    if (!sessionName) {
      setHasActiveWahaSession(false)
      return () => { cancelled = true }
    }

    fetch(`/api/waha/sessions/${encodeURIComponent(sessionName)}`)
      .then(async (res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const active = data?.status === 'WORKING'
        setHasActiveWahaSession(active)
      })
      .catch(() => {
        if (!cancelled) setHasActiveWahaSession(false)
      })
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    if (!user) {
      setPasswordGateLoading(true)
      setNeedsPasswordSetup(false)
      return
    }
    let cancelled = false
    setPasswordGateLoading(true)

    ;(async () => {
      const { data, error } = await supabase.rpc('user_has_password')
      if (cancelled) return
      if (error) {
        console.error('user_has_password:', error.message)
        setNeedsPasswordSetup(false)
      } else {
        setNeedsPasswordSetup(data === false)
      }
      setPasswordGateLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [user, supabase])

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordDialogError(null)

    if (newPassword.length < 6) {
      setPasswordDialogError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordDialogError('Passwords do not match.')
      return
    }

    setPasswordSubmitLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError

      const { data: hasPw, error: rpcError } = await supabase.rpc('user_has_password')
      if (rpcError) {
        setNeedsPasswordSetup(false)
        await refreshUser()
        setNewPassword('')
        setConfirmNewPassword('')
        setShowSetupPasswords(false)
        return
      }
      if (hasPw === true) {
        setNeedsPasswordSetup(false)
        setNewPassword('')
        setConfirmNewPassword('')
        setShowSetupPasswords(false)
        await refreshUser()
      } else {
        setPasswordDialogError('Password could not be verified. Please try signing in again.')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setPasswordDialogError(message)
    } finally {
      setPasswordSubmitLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600 mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (passwordGateLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600 mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="mt-4 text-slate-600">Loading your account…</p>
        </div>
      </div>
    )
  }

  const showPasswordGate = needsPasswordSetup

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 relative">
      {showPasswordGate && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-setup-title"
          aria-describedby="password-setup-desc"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl border border-slate-200/80 transition-all duration-200">
            <h2 id="password-setup-title" className="text-xl font-semibold text-slate-900 mb-1">
              Create a password
            </h2>
            <p id="password-setup-desc" className="text-sm text-slate-600 mb-6">
              Your account was created with Google and doesn&apos;t have a password yet. Set one so you can also sign in with email and password.
            </p>
            <form onSubmit={handleCreatePassword} className="space-y-4">
              {passwordDialogError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {passwordDialogError}
                </div>
              )}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label htmlFor="dashboard-new-password" className="block text-sm font-medium text-slate-700">
                    New password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSetupPasswords((v) => !v)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors shrink-0"
                    aria-pressed={showSetupPasswords}
                    aria-label={showSetupPasswords ? 'Hide passwords' : 'Show passwords'}
                  >
                    {showSetupPasswords ? 'Hide passwords' : 'Show passwords'}
                  </button>
                </div>
                <input
                  id="dashboard-new-password"
                  type={showSetupPasswords ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="dashboard-confirm-password" className="block text-sm font-medium text-slate-700 mb-2">
                  Confirm password
                </label>
                <input
                  id="dashboard-confirm-password"
                  type={showSetupPasswords ? 'text' : 'password'}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={passwordSubmitLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-blue-500/25"
              >
                {passwordSubmitLoading ? 'Saving…' : 'Save password'}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
            <div className="flex items-center gap-3">
              <Link
                href="/excel-processor"
                className="hidden px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all duration-200 active:scale-[0.98] flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Excel Processor
              </Link>
              <PWAInstallButton />
              <button
                onClick={handleSignOut}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-200 active:scale-[0.98]"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col gap-5 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200/50">
          <h2 className="text-3xl font-semibold text-slate-900 mb-2">
            Welcome back{user.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}!
          </h2>
          <p className="text-slate-600">You&apos;re successfully signed in to your account.</p>
        </div>

        {/* Tools Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200/50">
          <h3 className="text-xl font-semibold text-slate-900 mb-6">Tools</h3>
          <div className="space-y-3">
            <Link hidden
              href="/excel-processor"
              className="block px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-slate-700 font-medium rounded-xl transition-all duration-200 active:scale-[0.98] border border-blue-200"
            >
              <div hidden className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <span className="font-semibold text-slate-900">AI Excel Processor</span>
                    <p className="text-xs text-slate-600">Upload Excel/CSV and process with OpenAI</p>
                  </div>
                </div>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
            <Link
              href="/customers"
              className="block px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 text-slate-700 font-medium rounded-xl transition-all duration-200 active:scale-[0.98] border border-green-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <div>
                    <span className="font-semibold text-slate-900">Customer Management</span>
                    <p className="text-xs text-slate-600">View, edit, and manage your customer database</p>
                  </div>
                </div>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
            <Link
              href="/waha-integration"
              className="block px-4 py-3 bg-gradient-to-r from-green-50 to-teal-50 hover:from-green-100 hover:to-teal-100 text-slate-700 font-medium rounded-xl transition-all duration-200 active:scale-[0.98] border border-green-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <div>
                    <span className="font-semibold text-slate-900">WhatsApp Integration (WAHA)</span>
                    <p className="text-xs text-slate-600">Create session, check status, send messages via WAHA API</p>
                  </div>
                </div>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            {hasActiveWahaSession && (
              <Link
                href="/automated-messages"
                className="block px-4 py-3 bg-gradient-to-r from-violet-50 to-purple-50 hover:from-violet-100 hover:to-purple-100 text-slate-700 font-medium rounded-xl transition-all duration-200 active:scale-[0.98] border border-violet-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <div>
                      <span className="font-semibold text-slate-900">Automated Messages</span>
                      <p className="text-xs text-slate-600">Create and edit birthday &amp; other automated message templates</p>
                    </div>
                  </div>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            )}

            <Link
              href="/extension-download"
              className="block px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 text-slate-700 font-medium rounded-xl transition-all duration-200 active:scale-[0.98] border border-amber-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                  </svg>
                  <div>
                    <span className="font-semibold text-slate-900">Chrome Extension</span>
                    <p className="text-xs text-slate-600">Download extension zip and watch the user guide</p>
                  </div>
                </div>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
            <Link
              hidden
              href="/pwa-test/push"
              className="hidden md:block px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded-xl transition-all duration-200 active:scale-[0.98]"
            >
              <div hidden className="md:flex items-center justify-between">
                <span>Test Declarative Web Push</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200/50">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-slate-900">Account Information</h3>
            <Link
              href="/profile"
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all duration-200 active:scale-[0.98]"
            >
              Edit Profile
            </Link>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <p className="text-slate-900">{user.email}</p>
            </div>
            {user.user_metadata?.phone && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <p className="text-slate-900">{user.user_metadata.phone}</p>
              </div>
            )}
            {user.user_metadata?.avatar_url && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Profile Picture</label>
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Profile"
                  className="w-16 h-16 rounded-full border-2 border-slate-200"
                  onError={(e) => {
                    e.currentTarget.src = 'https://thispersondoesnotexist.com/'
                  }}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">User ID</label>
              <p className="text-sm text-slate-600 font-mono">{user.id}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Account Created</label>
              <p className="text-slate-600">
                {new Date(user.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

      </main>

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  )
}

