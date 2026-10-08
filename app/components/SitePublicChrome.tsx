import Link from 'next/link'
import type { ReactNode } from 'react'
import { CompanyLegalFooter } from '@/app/components/CompanyLegalFooter'
import { COMPANY_NAV } from '@/app/lib/company'

type Props = {
  children: ReactNode
  /** Highlight matching top-nav item by href prefix. */
  activePath?: string
  showPolicyLinks?: boolean
}

export function SitePublicChrome({ children, activePath = '', showPolicyLinks = false }: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              ← Public Gold
            </Link>
            <nav aria-label="Company" className="flex flex-wrap items-center gap-1">
              {COMPANY_NAV.map((item) => {
                const active =
                  activePath === item.href ||
                  (item.href === '/policy/terms'
                    ? activePath.startsWith('/policy')
                    : activePath.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-2.5 py-1.5 text-sm transition ${
                      active
                        ? 'bg-muted font-medium text-sky-400'
                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>

      <CompanyLegalFooter showPolicyLinks={showPolicyLinks} showCompanyLinks />
    </div>
  )
}
