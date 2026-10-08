'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { AppShell } from '@/app/components/AppShell'
import { CompanyLegalFooter } from '@/app/components/CompanyLegalFooter'
import { PageContentSkeleton } from '@/app/components/PageContentSkeleton'
import {
  AppShellChromeProvider,
  useAppShellChrome,
} from '@/app/contexts/app-shell-chrome'
import { useAuth } from '@/app/contexts/auth-context'
import { isAppShellPath, resolveAppShellTitle } from '@/app/lib/app-shell-routes'

/**
 * Keeps sidebar/header/footer mounted across app navigations.
 * Remounts chrome when the signed-in user changes (account switch).
 */
export function AppRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/'

  if (!isAppShellPath(pathname)) {
    return <>{children}</>
  }

  return (
    <AuthenticatedAppChromeGate>{children}</AuthenticatedAppChromeGate>
  )
}

/** Remount chrome provider when the signed-in user changes so header extras don't leak. */
function AuthenticatedAppChromeGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return (
    <AppShellChromeProvider key={user?.id || 'anon'}>
      <AuthenticatedAppChrome>{children}</AuthenticatedAppChrome>
    </AppShellChromeProvider>
  )
}

function AuthenticatedAppChrome({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname() || '/'
  const { titleOverride, headerExtra, deferWhatsAppPrompt } = useAppShellChrome()
  const [showGoogleAds, setShowGoogleAds] = useState(false)

  const title = titleOverride || resolveAppShellTitle(pathname)
  const shellKey = user?.id || 'anon'
  const ready = !loading && !!user

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [loading, user, router, pathname])

  useEffect(() => {
    if (!user) {
      setShowGoogleAds(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/google-ads/me', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const j = await res.json()
        if (!cancelled) setShowGoogleAds(!!j.enrolled)
      } catch {
        if (!cancelled) setShowGoogleAds(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Clear body locks left behind by dialogs / interrupted navigations after account switch.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = ''
  }, [shellKey])

  // One AppShell only — swapping whole shells during auth caused double headers.
  return (
    <AppShell
      key={shellKey}
      title={title}
      headerExtra={ready ? headerExtra : undefined}
      showGoogleAds={ready ? showGoogleAds : false}
      deferWhatsAppPrompt={ready ? deferWhatsAppPrompt : true}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1">
          {ready ? children : <PageContentSkeleton />}
        </div>
        <div className="mt-auto shrink-0">
          <CompanyLegalFooter />
        </div>
      </div>
    </AppShell>
  )
}
