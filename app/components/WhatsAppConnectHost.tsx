'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/app/contexts/auth-context'
import {
  WhatsAppConnectDialog,
  isWaConnectDialogHidden,
  setWaConnectDialogHidden,
} from '@/app/dashboard/_components/WhatsAppConnectDialog'
import { resolveProfilePhone } from '@/app/lib/profile/completion'
import { createClient } from '@/app/lib/supabase/client'

function WahaStatusBadge({
  checking,
  connected,
  onConnectClick,
}: {
  checking: boolean
  connected: boolean
  onConnectClick?: () => void
}) {
  if (checking) {
    return (
      <Link
        href="/ws-integration"
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
        title="WhatsApp integration"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
        WhatsApp…
      </Link>
    )
  }

  if (connected) {
    return (
      <Link
        href="/ws-integration"
        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
        title="WhatsApp integration"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        WhatsApp ON
      </Link>
    )
  }

  if (onConnectClick) {
    return (
      <button
        type="button"
        onClick={onConnectClick}
        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
        title="Connect WhatsApp"
      >
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        WhatsApp OFF
      </button>
    )
  }

  return (
    <Link
      href="/ws-integration"
      className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
      title="WhatsApp integration"
    >
      <span className="h-2 w-2 rounded-full bg-amber-500" />
      WhatsApp OFF
    </Link>
  )
}

type WhatsAppConnectHostProps = {
  /** When true, keep the badge but do not auto-open the dialog (e.g. password setup). */
  deferPrompt?: boolean
}

/**
 * Header badge + create/reconnect dialog for WhatsApp.
 * Auto-opens when the user has no active session (except on /ws-integration).
 */
export function WhatsAppConnectHost({ deferPrompt = false }: WhatsAppConnectHostProps) {
  const { user, loading } = useAuth()
  const pathname = usePathname() || '/'
  const supabase = useMemo(() => createClient(), [])

  const [hasActiveSession, setHasActiveSession] = useState(false)
  const [hasAnySession, setHasAnySession] = useState(false)
  const [offlineSessionName, setOfflineSessionName] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const statusLoadedRef = useRef(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const dismissedRef = useRef(false)

  const [platformReadOnly, setPlatformReadOnly] = useState(false)
  const [defaultPhone, setDefaultPhone] = useState('')

  const onWsIntegrationPage =
    pathname.startsWith('/ws-integration') || pathname.startsWith('/waha-integration')

  const checkSessions = useCallback(
    async (showChecking = false) => {
      if (!user) return
      if (showChecking || !statusLoadedRef.current) setChecking(true)
      try {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 25000)
        const res = await fetch('/api/waha/sessions', { cache: 'no-store', signal: controller.signal })
        window.clearTimeout(timeout)
        if (!res.ok) {
          setHasActiveSession(false)
          setHasAnySession(false)
          setOfflineSessionName(null)
          return
        }
        const data = await res.json()
        const sessions = Array.isArray(data?.sessions) ? data.sessions : []
        const active = sessions.some((session: { status?: string }) => {
          const status = String(session?.status || '').toUpperCase()
          return status === 'WORKING' || status === 'CONNECTED'
        })
        const firstOffline =
          sessions.find((session: { status?: string; name?: string }) => {
            const status = String(session?.status || '').toUpperCase()
            return status !== 'WORKING' && status !== 'CONNECTED'
          })?.name ||
          sessions[0]?.name ||
          null
        setHasActiveSession(active)
        setHasAnySession(sessions.length > 0)
        setOfflineSessionName(active ? null : firstOffline ? String(firstOffline) : null)
        if (active) {
          setDialogOpen(false)
          dismissedRef.current = false
          setWaConnectDialogHidden(user.id, false)
        }
      } catch {
        setHasActiveSession(false)
        setHasAnySession(false)
        setOfflineSessionName(null)
      } finally {
        statusLoadedRef.current = true
        setChecking(false)
        setStatusLoaded(true)
      }
    },
    [user]
  )

  useEffect(() => {
    if (loading || !user) {
      setChecking(false)
      return
    }
    void checkSessions(true)

    const onFocus = () => void checkSessions(false)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkSessions(false)
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loading, user, checkSessions])

  useEffect(() => {
    if (!user) {
      setPlatformReadOnly(false)
      setDefaultPhone('')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [saasRes, profileRes] = await Promise.all([
          fetch('/api/saas/me'),
          supabase.from('profiles').select('phone').eq('id', user.id).maybeSingle(),
        ])
        if (cancelled) return
        if (saasRes.ok) {
          const j = await saasRes.json()
          const alerts = j.alerts ?? {}
          setPlatformReadOnly(!!(alerts.platform_read_only || alerts.plan_expired))
        }
        const phone = resolveProfilePhone(profileRes.data?.phone, user.user_metadata?.phone)
        setDefaultPhone((phone || '').replace(/\D/g, ''))
      } catch {
        if (!cancelled) setPlatformReadOnly(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, supabase])

  // Auto-open create/reconnect when WhatsApp is offline.
  useEffect(() => {
    if (hasActiveSession) {
      setDialogOpen(false)
      dismissedRef.current = false
      return
    }

    if (
      loading ||
      !user ||
      deferPrompt ||
      onWsIntegrationPage ||
      !statusLoaded ||
      checking ||
      dismissedRef.current
    ) {
      return
    }

    // Always prompt when the user has never created a session.
    // "Don't show again" only suppresses reconnect reminders.
    if (hasAnySession && isWaConnectDialogHidden(user.id)) {
      return
    }

    setDialogOpen(true)
  }, [
    loading,
    user,
    deferPrompt,
    onWsIntegrationPage,
    statusLoaded,
    checking,
    hasActiveSession,
    hasAnySession,
  ])

  const openDialog = () => {
    if (!user) return
    dismissedRef.current = false
    setWaConnectDialogHidden(user.id, false)
    setDialogOpen(true)
  }

  const closeDialog = (opts?: { dontShowAgain?: boolean }) => {
    dismissedRef.current = true
    if (opts?.dontShowAgain && user?.id && hasAnySession) {
      setWaConnectDialogHidden(user.id, true)
    }
    setDialogOpen(false)
  }

  if (loading || !user) return null

  return (
    <>
      <WahaStatusBadge
        checking={checking}
        connected={hasActiveSession}
        onConnectClick={openDialog}
      />
      <WhatsAppConnectDialog
        open={dialogOpen && !deferPrompt}
        onClose={closeDialog}
        userId={user.id}
        hasExistingSession={hasAnySession}
        existingSessionName={offlineSessionName}
        platformReadOnly={platformReadOnly}
        defaultPhone={defaultPhone}
        onSessionCreated={(sessionName) => {
          setHasAnySession(true)
          setOfflineSessionName(sessionName)
        }}
        onConnected={() => {
          setHasActiveSession(true)
          setHasAnySession(true)
          setOfflineSessionName(null)
          setDialogOpen(false)
          dismissedRef.current = false
          setWaConnectDialogHidden(user.id, false)
          void checkSessions(false)
        }}
      />
    </>
  )
}
