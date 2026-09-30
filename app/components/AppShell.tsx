'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react'
import { UserProfileMenu } from '@/app/components/UserProfileMenu'
import { ThemeToggle } from '@/app/components/ThemeToggle'

export type AppNavItem = {
  href: string
  label: string
  description: string
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode
  /** Soft accent for active/hover chip */
  accentClassName: string
  match?: (pathname: string) => boolean
}

function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"
      />
    </svg>
  )
}

function IconGoogleAds(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function IconBilling(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  )
}

function IconPwa(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  )
}

function IconCustomers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  )
}

function IconWhatsApp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  )
}

function IconWorkflows(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="5.5" cy="5.5" r="2" strokeWidth={1.75} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7.5 5.5h6.5c.9 0 1.6.7 1.6 1.6V8.5" />
      <rect x="13" y="3" width="7" height="5" rx="1.25" strokeWidth={1.75} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 5.5H8.2c-.9 0-1.6.7-1.6 1.6v2.4" />
      <rect x="3" y="10" width="7" height="5" rx="1.25" strokeWidth={1.75} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10 12.5h4.3c.9 0 1.6.7 1.6 1.6v1.4" />
      <rect x="14" y="15" width="7" height="5" rx="1.25" strokeWidth={1.75} />
    </svg>
  )
}

function IconLuckyDraw(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
      />
    </svg>
  )
}

function IconExtension(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
      />
    </svg>
  )
}

function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

/** Primary app services — used in the left sidebar. */
export const APP_SERVICE_NAV: AppNavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    description: 'Home overview',
    accentClassName: 'text-slate-700 bg-slate-100',
    icon: IconDashboard,
    match: (p) => p === '/dashboard',
  },
  {
    href: '/google-ads',
    label: 'Google Ads',
    description: 'Subscription',
    accentClassName: 'text-amber-800 bg-amber-50',
    icon: IconGoogleAds,
  },
  {
    href: '/dashboard/billing',
    label: 'Billing & plans',
    description: 'Free / Pro subscription',
    accentClassName: 'text-violet-800 bg-violet-50',
    icon: IconBilling,
  },
  {
    href: '/test-pwa',
    label: 'PWA test',
    description: 'Push & install diagnostics',
    accentClassName: 'text-sky-800 bg-sky-50',
    icon: IconPwa,
  },
  {
    href: '/customers',
    label: 'Customers',
    description: 'Customer management',
    accentClassName: 'text-emerald-800 bg-emerald-50',
    icon: IconCustomers,
    match: (p) => p.startsWith('/customers'),
  },
  {
    href: '/waha-integration',
    label: 'WhatsApp Provider',
    description: 'WhatsApp integration',
    accentClassName: 'text-teal-800 bg-teal-50',
    icon: IconWhatsApp,
  },
  {
    href: '/dashboard/campaigns',
    label: 'Workflows',
    description: 'Multi-step Automation',
    accentClassName: 'text-rose-800 bg-rose-50',
    icon: IconWorkflows,
    match: (p) => p.startsWith('/dashboard/campaigns'),
  },
  {
    href: '/dashboard/lucky-draw',
    label: 'Lucky Draw',
    description: 'Public draw pages',
    accentClassName: 'text-amber-800 bg-amber-50',
    icon: IconLuckyDraw,
    match: (p) => p.startsWith('/dashboard/lucky-draw'),
  },
  {
    href: '/extension-download',
    label: 'Chrome Extension',
    description: 'Download tools',
    accentClassName: 'text-orange-800 bg-orange-50',
    icon: IconExtension,
  },
]

function isNavActive(item: AppNavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

type AppShellProps = {
  children: ReactNode
  /** Short title shown in the top header (desktop + mobile). */
  title?: string
  /** Optional status / actions on the right of the header (before profile). */
  headerExtra?: ReactNode
  /** Hide Google Ads until enrolled (dashboard can pass this). */
  showGoogleAds?: boolean
  className?: string
}

export function AppShell({
  children,
  title = 'Dashboard',
  headerExtra,
  showGoogleAds = true,
  className = '',
}: AppShellProps) {
  const pathname = usePathname() || '/'
  const [mobileOpen, setMobileOpen] = useState(false)
  const panelId = useId()

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  useEffect(() => {
    closeMobile()
  }, [pathname, closeMobile])

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobile()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen, closeMobile])

  const items = APP_SERVICE_NAV.filter((item) => {
    if (item.href === '/google-ads' && !showGoogleAds) return false
    return true
  })

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Services">
      <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Services
      </p>
      {items.map((item) => {
        const active = isNavActive(item, pathname)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={closeMobile}
            className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
              active
                ? `${item.accentClassName} font-semibold shadow-sm ring-1 ring-black/5`
                : 'text-foreground/80 hover:bg-muted'
            }`}
          >
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                active ? 'bg-background/70' : 'bg-muted text-muted-foreground group-hover:bg-background'
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-sm leading-tight">{item.label}</span>
              <span
                className={`mt-0.5 block text-[11px] leading-snug ${
                  active ? 'opacity-80' : 'text-muted-foreground'
                }`}
              >
                {item.description}
              </span>
            </span>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className={`min-h-screen bg-background text-foreground ${className}`.trim()}>
      {/* Mobile drawer backdrop */}
      <div
        className={`fixed inset-0 z-[80] bg-black/40 transition-opacity lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!mobileOpen}
        onClick={closeMobile}
      />

      {/* Sidebar — drawer on mobile, fixed on desktop */}
      <aside
        id={panelId}
        className={`fixed inset-y-0 left-0 z-[90] flex w-[min(100vw-3rem,18rem)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-300 ease-out lg:w-64 lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="App navigation"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="text-sm font-semibold text-sidebar-foreground"
          >
            Public Gold CRM
          </Link>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
            onClick={closeMobile}
            aria-label="Close menu"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        {nav}
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-40 border-b border-border bg-card/95 shadow-sm backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:bg-muted lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-expanded={mobileOpen}
                aria-controls={panelId}
                aria-label="Open menu"
              >
                <IconMenu className="h-5 w-5" />
              </button>
              <h1 className="truncate text-lg font-semibold text-foreground sm:text-xl">{title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {headerExtra}
              <ThemeToggle />
              <UserProfileMenu />
            </div>
          </div>
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  )
}
