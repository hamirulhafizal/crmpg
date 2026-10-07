'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/app/contexts/auth-context'
import {
  WhatsAppConnectDialog,
  isWaConnectDialogHidden,
  setWaConnectDialogHidden,
} from '@/app/dashboard/_components/WhatsAppConnectDialog'
import { resolveProfilePhone } from '@/app/lib/profile/completion'
import { createClient } from '@/app/lib/supabase/client'

const WA_STATUS_CACHE_PREFIX = 'wa-connection-status'
const WA_STATUS_CACHE_TTL_MS = 5 * 60 * 1000

type WaStatusCache = {
  connected: boolean
  hasAnySession: boolean
  offlineSessionName: string | null
  checkedAt: number
}

/** In-memory cache so remounts across page navigations skip localStorage + API. */
let memoryWaStatus: { userId: string; data: WaStatusCache } | null = null

function waStatusCacheKey(userId: string) {
  return `${WA_STATUS_CACHE_PREFIX}:${userId}`
}

function isCacheFresh(checkedAt: number) {
  return Date.now() - checkedAt <= WA_STATUS_CACHE_TTL_MS
}

function readWaStatusCache(userId: string): WaStatusCache | null {
  if (!userId) return null

  if (memoryWaStatus?.userId === userId && isCacheFresh(memoryWaStatus.data.checkedAt)) {
    return memoryWaStatus.data
  }

  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(waStatusCacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as WaStatusCache
    if (
      typeof parsed?.checkedAt !== 'number' ||
      typeof parsed?.connected !== 'boolean' ||
      typeof parsed?.hasAnySession !== 'boolean'
    ) {
      return null
    }
    if (!isCacheFresh(parsed.checkedAt)) return null
    const data: WaStatusCache = {
      connected: parsed.connected,
      hasAnySession: parsed.hasAnySession,
      offlineSessionName:
        typeof parsed.offlineSessionName === 'string' ? parsed.offlineSessionName : null,
      checkedAt: parsed.checkedAt,
    }
    memoryWaStatus = { userId, data }
    return data
  } catch {
    return null
  }
}

function writeWaStatusCache(userId: string, value: Omit<WaStatusCache, 'checkedAt'>) {
  if (!userId) return
  const payload: WaStatusCache = { ...value, checkedAt: Date.now() }
  memoryWaStatus = { userId, data: payload }
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(waStatusCacheKey(userId), JSON.stringify(payload))
  } catch {
    // ignore quota / private mode
  }
}

function msUntilCacheExpiry(checkedAt: number) {
  return Math.max(0, WA_STATUS_CACHE_TTL_MS - (Date.now() - checkedAt))
}

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
 * Status is cached 5 minutes (memory + localStorage); navigations reuse cache.
 */
export function WhatsAppConnectHost({ deferPrompt = false }: WhatsAppConnectHostProps) {
  const { user, loading } = useAuth()
  const pathname = usePathname() || '/'
  const supabase = useMemo(() => createClient(), [])
  const userId = user?.id

  const [hasActiveSession, setHasActiveSession] = useState(false)
  const [hasAnySession, setHasAnySession] = useState(false)
  const [offlineSessionName, setOfflineSessionName] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const statusLoadedRef = useRef(false)
  const fetchInFlightRef = useRef(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const dismissedRef = useRef(false)

  const [platformReadOnly, setPlatformReadOnly] = useState(false)
  const [defaultPhone, setDefaultPhone] = useState('')

  const onWsIntegrationPage =
    pathname.startsWith('/ws-integration') || pathname.startsWith('/waha-integration')

  const applyStatus = useCallback(
    (active: boolean, anySession: boolean, offlineName: string | null) => {
      setHasActiveSession(active)
      setHasAnySession(anySession)
      setOfflineSessionName(offlineName)
      if (active && userId) {
        setDialogOpen(false)
        dismissedRef.current = false
        setWaConnectDialogHidden(userId, false)
      }
    },
    [userId]
  )

  const checkSessions = useCallback(
    async (opts?: { showChecking?: boolean; force?: boolean }) => {
      if (!userId) return
      const showChecking = opts?.showChecking ?? false
      const force = opts?.force ?? false

      if (!force) {
        const cached = readWaStatusCache(userId)
        if (cached) {
          applyStatus(cached.connected, cached.hasAnySession, cached.offlineSessionName)
          statusLoadedRef.current = true
          setChecking(false)
          setStatusLoaded(true)
          return
        }
      }

      if (fetchInFlightRef.current) return
      fetchInFlightRef.current = true

      if (showChecking) setChecking(true)
      try {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 25000)
        const res = await fetch('/api/waha/sessions', { cache: 'no-store', signal: controller.signal })
        window.clearTimeout(timeout)
        if (!res.ok) {
          applyStatus(false, false, null)
          writeWaStatusCache(userId, {
            connected: false,
            hasAnySession: false,
            offlineSessionName: null,
          })
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
        const offlineName = active ? null : firstOffline ? String(firstOffline) : null
        applyStatus(active, sessions.length > 0, offlineName)
        writeWaStatusCache(userId, {
          connected: active,
          hasAnySession: sessions.length > 0,
          offlineSessionName: offlineName,
        })
      } catch {
        if (!statusLoadedRef.current) {
          applyStatus(false, false, null)
        }
      } finally {
        fetchInFlightRef.current = false
        statusLoadedRef.current = true
        setChecking(false)
        setStatusLoaded(true)
      }
    },
    [userId, applyStatus]
  )

  // Hydrate from cache before paint on every mount / user change — no "WhatsApp…" flash.
  useLayoutEffect(() => {
    if (loading || !userId) {
      setChecking(false)
      return
    }

    const cached = readWaStatusCache(userId)
    if (cached) {
      applyStatus(cached.connected, cached.hasAnySession, cached.offlineSessionName)
      statusLoadedRef.current = true
      setChecking(false)
      setStatusLoaded(true)
      return
    }

    void checkSessions({ showChecking: true, force: true })
  }, [loading, userId, applyStatus, checkSessions])

  // Auto re-check when the 5-minute cache expires (timer + focus).
  useEffect(() => {
    if (loading || !userId) return

    let expiryTimer: number | undefined

    const scheduleExpiryRefresh = () => {
      if (expiryTimer) window.clearTimeout(expiryTimer)
      const cached = readWaStatusCache(userId)
      const delay = cached ? msUntilCacheExpiry(cached.checkedAt) : 0
      expiryTimer = window.setTimeout(() => {
        void checkSessions({ force: true, showChecking: false }).then(() => {
          scheduleExpiryRefresh()
        })
      }, delay === 0 ? WA_STATUS_CACHE_TTL_MS : delay)
    }

    scheduleExpiryRefresh()

    const onFocusOrVisible = () => {
      void checkSessions({ force: false, showChecking: false })
      scheduleExpiryRefresh()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocusOrVisible()
    }

    window.addEventListener('focus', onFocusOrVisible)
    window.addEventListener('pageshow', onFocusOrVisible)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (expiryTimer) window.clearTimeout(expiryTimer)
      window.removeEventListener('focus', onFocusOrVisible)
      window.removeEventListener('pageshow', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loading, userId, checkSessions])

  useEffect(() => {
    if (!userId || !user) {
      setPlatformReadOnly(false)
      setDefaultPhone('')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [saasRes, profileRes] = await Promise.all([
          fetch('/api/saas/me'),
          supabase.from('profiles').select('phone').eq('id', userId).maybeSingle(),
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
  }, [userId, user, supabase])

  // Auto-open create/reconnect when WhatsApp is offline.
  useEffect(() => {
    if (hasActiveSession) {
      setDialogOpen(false)
      dismissedRef.current = false
      return
    }

    if (
      loading ||
      !userId ||
      deferPrompt ||
      onWsIntegrationPage ||
      !statusLoaded ||
      checking ||
      dismissedRef.current
    ) {
      return
    }

    if (hasAnySession && isWaConnectDialogHidden(userId)) {
      return
    }

    setDialogOpen(true)
  }, [
    loading,
    userId,
    deferPrompt,
    onWsIntegrationPage,
    statusLoaded,
    checking,
    hasActiveSession,
    hasAnySession,
  ])

  const openDialog = () => {
    if (!userId) return
    dismissedRef.current = false
    setWaConnectDialogHidden(userId, false)
    setDialogOpen(true)
    void checkSessions({ force: true, showChecking: false })
  }

  const closeDialog = (opts?: { dontShowAgain?: boolean }) => {
    dismissedRef.current = true
    if (opts?.dontShowAgain && userId && hasAnySession) {
      setWaConnectDialogHidden(userId, true)
    }
    setDialogOpen(false)
  }

  if (loading || !user || !userId) return null

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
        userId={userId}
        hasExistingSession={hasAnySession}
        existingSessionName={offlineSessionName}
        platformReadOnly={platformReadOnly}
        defaultPhone={defaultPhone}
        onSessionCreated={(sessionName) => {
          setHasAnySession(true)
          setOfflineSessionName(sessionName)
          writeWaStatusCache(userId, {
            connected: false,
            hasAnySession: true,
            offlineSessionName: sessionName,
          })
        }}
        onConnected={() => {
          setHasActiveSession(true)
          setHasAnySession(true)
          setOfflineSessionName(null)
          setDialogOpen(false)
          dismissedRef.current = false
          setWaConnectDialogHidden(userId, false)
          writeWaStatusCache(userId, {
            connected: true,
            hasAnySession: true,
            offlineSessionName: null,
          })
          void checkSessions({ force: true, showChecking: false })
        }}
      />
    </>
  )
}
