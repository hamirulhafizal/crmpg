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
 * Only page `children` swap; auth + Google Ads nav visibility live here once.
 */
export function AppRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/'

  if (!isAppShellPath(pathname)) {
    return <>{children}</>
  }

  return (
    <AppShellChromeProvider>
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

  if (loading || !user) {
    return (
      <AppShell title={title} showGoogleAds={false} deferWhatsAppPrompt>
        <PageContentSkeleton />
        <CompanyLegalFooter />
      </AppShell>
    )
  }

  return (
    <AppShell
      title={title}
      headerExtra={headerExtra}
      showGoogleAds={showGoogleAds}
      deferWhatsAppPrompt={deferWhatsAppPrompt}
    >
      {children}
      <CompanyLegalFooter />
    </AppShell>
  )
}
