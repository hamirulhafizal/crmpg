'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { createClient } from '@/app/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ProfileCompletionDialog } from '@/app/dashboard/_components/ProfileCompletionDialog'
import { isProfileComplete, resolveProfilePhone, resolveFullName } from '@/app/lib/profile/completion'

type ServiceTileProps = {
  href: string
  title: string
  description: string
  borderClassName?: string
  gradientClassName?: string
  iconClassName: string
  icon: ReactNode
}

function ServiceTile({
  href,
  title,
  description,
  borderClassName = 'border-slate-200',
  gradientClassName = 'from-slate-50 to-white',
  iconClassName,
  icon,
}: ServiceTileProps) {
  return (
    <Link
      href={href}
      className={`group rounded-2xl border ${borderClassName} bg-gradient-to-b ${gradientClassName} p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98]`}
    >
      <div
        className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-sm ${iconClassName}`}
      >
        {icon}
      </div>
      <h4 className="text-sm font-semibold leading-tight text-slate-900">{title}</h4>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </Link>
  )
}

function ServiceTileSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
      <div className="mb-3 h-12 w-12 animate-pulse rounded-full bg-violet-200/70" />
      <div className="h-3 w-24 animate-pulse rounded bg-violet-200/70" />
      <div className="mt-2 h-2.5 w-20 animate-pulse rounded bg-violet-100/90" />
    </div>
  )
}

function WahaStatusBadge({
  checking,
  connected,
}: {
  checking: boolean
  connected: boolean
}) {
  if (checking) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
        Checking WhatsApp...
      </span>
    )
  }

  if (connected) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        WhatsApp connected
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
      <span className="h-2 w-2 rounded-full bg-amber-500" />
      WhatsApp not connected
    </span>
  )
}

export default function DashboardPage() {
  const { user, loading, signOut, refreshUser } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [hasActiveWahaSession, setHasActiveWahaSession] = useState(false)
  const [checkingWahaSession, setCheckingWahaSession] = useState(true)
  const [wahaStatusLoaded, setWahaStatusLoaded] = useState(false)
  const wahaStatusLoadedRef = useRef(false)

  const [accountChecksLoading, setAccountChecksLoading] = useState(true)
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false)
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordDialogError, setPasswordDialogError] = useState<string | null>(null)
  const [passwordSubmitLoading, setPasswordSubmitLoading] = useState(false)
  const [showSetupPasswords, setShowSetupPasswords] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [googleAdsEnrolled, setGoogleAdsEnrolled] = useState(false)
  const [checkingGoogleAds, setCheckingGoogleAds] = useState(true)
  const [saasPlanLabel, setSaasPlanLabel] = useState<string | null>(null)
  const [saasActiveCampaigns, setSaasActiveCampaigns] = useState<number | null>(null)
  const [saasMaxCampaigns, setSaasMaxCampaigns] = useState<number | null>(null)
  const [saasWasenderAvailable, setSaasWasenderAvailable] = useState(false)
  const [saasAlert, setSaasAlert] = useState<string | null>(null)
  const [checkingSaas, setCheckingSaas] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      setCheckingAdmin(false)
      return
    }
    let cancelled = false
    setCheckingAdmin(true)
    ;(async () => {
      const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (cancelled) return
      setIsAdmin(!error && data?.role === 'admin')
      setCheckingAdmin(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, supabase])

  useEffect(() => {
    if (!user) {
      setSaasPlanLabel(null)
      setSaasActiveCampaigns(null)
      setSaasMaxCampaigns(null)
      setSaasAlert(null)
      setCheckingSaas(false)
      return
    }
    let cancelled = false
    setCheckingSaas(true)
    ;(async () => {
      try {
        const res = await fetch('/api/saas/me')
        const j = await res.json()
        if (cancelled || !res.ok) return
        const planName = j.subscription?.plan?.name ?? 'Free'
        const isPro = j.flags?.is_pro_active
        const isPlatformAdminUser = j.flags?.is_platform_admin === true
        setSaasPlanLabel(isPlatformAdminUser ? 'Admin (unlimited)' : isPro ? planName : 'Free')
        setSaasActiveCampaigns(j.usage?.active_campaigns ?? 0)
        setSaasMaxCampaigns(j.entitlements?.maxActiveCampaigns ?? 1)
        setSaasWasenderAvailable(j.alerts?.wasender_available === true)

        const alerts = j.alerts ?? {}
        if (alerts.plan_expired) {
          setSaasAlert('Your Pro subscription has expired. Renew to restore unlimited campaigns and WasenderAPI.')
        } else if (alerts.trial_ending_soon && alerts.days_until_expiry != null) {
          setSaasAlert(`Pro trial ends in ${alerts.days_until_expiry} day(s). Subscribe to keep Pro features.`)
        } else if (alerts.subscription_expiring_soon && alerts.days_until_expiry != null) {
          setSaasAlert(`Pro renews in ${alerts.days_until_expiry} day(s).`)
        } else if (alerts.at_campaign_limit) {
          setSaasAlert('You have reached your active campaign limit on the Free plan.')
        } else {
          setSaasAlert(null)
        }
      } catch {
        if (!cancelled) setSaasAlert(null)
      } finally {
        if (!cancelled) setCheckingSaas(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setGoogleAdsEnrolled(false)
      setCheckingGoogleAds(false)
      return
    }
    let cancelled = false
    setCheckingGoogleAds(true)
    ;(async () => {
      try {
        const res = await fetch('/api/google-ads/me')
        const j = await res.json()
        if (cancelled) return
        setGoogleAdsEnrolled(!!j.enrolled)
      } catch {
        if (!cancelled) setGoogleAdsEnrolled(false)
      } finally {
        if (!cancelled) setCheckingGoogleAds(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const checkActiveWahaSession = async (showChecking = false) => {
      if (!cancelled && (showChecking || !wahaStatusLoadedRef.current)) setCheckingWahaSession(true)
      try {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 25000)
        const res = await fetch('/api/waha/sessions', { cache: 'no-store', signal: controller.signal })
        window.clearTimeout(timeout)
        if (!res.ok) {
          if (!cancelled) setHasActiveWahaSession(false)
          return
        }
        const data = await res.json()
        if (cancelled) return
        const sessions = Array.isArray(data?.sessions) ? data.sessions : []
        const active = sessions.some((session: { status?: string }) => {
          const status = String(session?.status || '').toUpperCase()
          return status === 'WORKING' || status === 'CONNECTED'
        })
        setHasActiveWahaSession(active)
      } catch {
        if (!cancelled) setHasActiveWahaSession(false)
      } finally {
        if (!cancelled) {
          wahaStatusLoadedRef.current = true
          setCheckingWahaSession(false)
          setWahaStatusLoaded(true)
        }
      }
    }

    void checkActiveWahaSession(true)

    const handleWindowFocus = () => {
      void checkActiveWahaSession(false)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkActiveWahaSession(false)
      }
    }
    const handlePageShow = () => {
      void checkActiveWahaSession(false)
    }

    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setAccountChecksLoading(true)
      setNeedsPasswordSetup(false)
      setNeedsProfileSetup(false)
      return
    }
    let cancelled = false
    setAccountChecksLoading(true)

    ;(async () => {
      const [passwordResult, profileResult] = await Promise.all([
        supabase.rpc('user_has_password'),
        supabase
          .from('profiles')
          .select('full_name, pgcode, phone, username_pbo, gmail_app_password, gmail_message')
          .eq('id', user.id)
          .maybeSingle(),
      ])

      if (cancelled) return

      if (passwordResult.error) {
        console.error('user_has_password:', passwordResult.error.message)
        setNeedsPasswordSetup(false)
      } else {
        setNeedsPasswordSetup(passwordResult.data === false)
      }

      const profileRow = profileResult.data
      const profileComplete = isProfileComplete(
        {
          full_name: profileRow?.full_name ?? null,
          username_pbo: profileRow?.username_pbo ?? null,
          phone: resolveProfilePhone(profileRow?.phone, user.user_metadata?.phone),
          pgcode: profileRow?.pgcode ?? null,
          gmail_app_password: profileRow?.gmail_app_password ?? null,
          gmail_message: profileRow?.gmail_message ?? null,
        },
        user.user_metadata?.phone,
        user.user_metadata?.full_name
      )
      setNeedsProfileSetup(!profileComplete)

      setAccountChecksLoading(false)
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

  if (accountChecksLoading) {
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
  const showProfileGate = !needsPasswordSetup && needsProfileSetup

  if (showProfileGate && user) {
    return (
      <ProfileCompletionDialog
        userId={user.id}
        userEmail={user.email}
        userMetadata={user.user_metadata}
        onComplete={async () => {
          await refreshUser()
          setNeedsProfileSetup(false)
        }}
      />
    )
  }

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

        {!checkingSaas && saasPlanLabel ? (
          <div className="rounded-2xl border border-violet-200/80 bg-white p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Plan usage</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Current plan: <span className="font-medium text-slate-900">{saasPlanLabel}</span>
                </p>
              </div>
              <Link
                href="/dashboard/billing"
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
              >
                Manage billing
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Active campaigns</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                  {saasActiveCampaigns ?? 0}
                  {saasMaxCampaigns != null && saasMaxCampaigns >= 0 ? ` / ${saasMaxCampaigns}` : ''}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">WhatsApp</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {saasWasenderAvailable ? 'WAHA + WasenderAPI' : 'WAHA only'}
                </p>
              </div>
            </div>
            {saasAlert ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {saasAlert}{' '}
                <Link href="/dashboard/billing" className="font-semibold underline underline-offset-2">
                  View billing
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Admin tools — only for platform admins */}
        {!checkingAdmin && isAdmin && (
          <div className="rounded-2xl border border-slate-300/80 bg-white p-6 shadow-xl md:p-8">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-slate-900">Admin</h3>
              <p className="mt-1 text-xs text-slate-500">Platform management tools</p>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              <ServiceTile
                href="/admin/settings"
                title="Admin Settings"
                description="Web app settings"
                iconClassName="bg-slate-900/90"
                icon={
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
              />

              <ServiceTile
                href="/admin/plans"
                title="SaaS plans"
                description="Free & Pro packages"
                borderClassName="border-violet-200"
                gradientClassName="from-violet-50/80 to-white"
                iconClassName="bg-violet-600"
                icon={
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                }
              />

              <ServiceTile
                href="/admin/workflow-nodes"
                title="Workflow nodes"
                description="Campaign builder palette"
                gradientClassName="from-violet-50/80 to-white"
                iconClassName="bg-violet-600"
                icon={
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
                  </svg>
                }
              />

              <ServiceTile
                href="/admin/lucky-draw-defaults"
                title="Lucky draw defaults"
                description="Platform draw template"
                borderClassName="border-amber-200"
                gradientClassName="from-amber-50/80 to-white"
                iconClassName="bg-amber-500"
                icon={
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
                    />
                  </svg>
                }
              />

              <ServiceTile
                href="/admin/google-ads"
                title="Admin Google Ads"
                description="Campaign management"
                iconClassName="bg-slate-900/90"
                icon={
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                }
              />

              <ServiceTile
                href="/admin/media"
                title="Media library"
                description="R2 images, audio, video, PDF"
                borderClassName="border-indigo-200"
                gradientClassName="from-indigo-50/80 to-white"
                iconClassName="bg-indigo-600"
                icon={
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                }
              />
            </div>
          </div>
        )}

        {/* Dealer / user tools */}
        <div className="rounded-2xl border border-slate-200/50 bg-white p-6 shadow-xl md:p-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">All Services</h3>
              <p className="mt-1 text-xs text-slate-500">Quick access tools</p>
            </div>
            <WahaStatusBadge checking={checkingWahaSession} connected={hasActiveWahaSession} />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {!checkingGoogleAds && googleAdsEnrolled && (
              <ServiceTile
                href="/google-ads"
                title="Google Ads"
                description="Subscription"
                borderClassName="border-amber-200"
                gradientClassName="from-amber-50 to-white"
                iconClassName="bg-amber-500"
                icon={
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            )}

            <ServiceTile
              href="/dashboard/billing"
              title="Billing & plans"
              description="Free / Pro subscription"
              borderClassName="border-violet-200"
              gradientClassName="from-violet-50 to-white"
              iconClassName="bg-violet-600"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              }
            />

            <ServiceTile
              href="/customers"
              title="Customers"
              description="Customer management"
              borderClassName="border-emerald-200"
              gradientClassName="from-emerald-50 to-white"
              iconClassName="bg-emerald-500"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              }
            />

            <ServiceTile
              href="/waha-integration"
              title="WhatsApp Provider"
              description="WhatsApp integration"
              borderClassName="border-teal-200"
              gradientClassName="from-teal-50 to-white"
              iconClassName="bg-teal-500"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              }
            />

            {checkingWahaSession && !wahaStatusLoaded && <ServiceTileSkeleton />}

            {!checkingWahaSession && hasActiveWahaSession && (
              <>
                <ServiceTile
                  href="/dashboard/campaigns"
                  title="Workflows"
                  description="Multi-step Automation"
                  borderClassName="border-rose-200"
                  gradientClassName="from-rose-50 to-white"
                  iconClassName="bg-rose-500"
                  icon={
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <circle cx="5.5" cy="5.5" r="2" strokeWidth={1.75} />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7.5 5.5h6.5c.9 0 1.6.7 1.6 1.6V8.5" />
                      <rect x="13" y="3" width="7" height="5" rx="1.25" strokeWidth={1.75} />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 5.5H8.2c-.9 0-1.6.7-1.6 1.6v2.4" />
                      <rect x="3" y="10" width="7" height="5" rx="1.25" strokeWidth={1.75} />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10 12.5h4.3c.9 0 1.6.7 1.6 1.6v1.4" />
                      <rect x="14" y="15" width="7" height="5" rx="1.25" strokeWidth={1.75} />
                      <circle cx="19.5" cy="19.5" r="2.25" strokeWidth={1.75} />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18.6 19.5l.65.65 1.5-1.5" />
                    </svg>
                  }
                />

                <ServiceTile
                  href="/automated-messages"
                  title="Automated Messages"
                  description="WAHA templates"
                  borderClassName="border-violet-200"
                  gradientClassName="from-violet-50 to-white"
                  iconClassName="bg-violet-500"
                  icon={
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  }
                />
              </>
            )}

            <ServiceTile
              href="/dashboard/lucky-draw"
              title="Lucky Draw"
              description="Public draw pages"
              borderClassName="border-amber-200"
              gradientClassName="from-amber-50 to-white"
              iconClassName="bg-amber-500"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
                  />
                </svg>
              }
            />

            <ServiceTile
              href="/extension-download"
              title="Chrome Extension"
              description="Download tools"
              borderClassName="border-orange-200"
              gradientClassName="from-orange-50 to-white"
              iconClassName="bg-orange-500"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
                  />
                </svg>
              }
            />
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
    </div>
  )
}

