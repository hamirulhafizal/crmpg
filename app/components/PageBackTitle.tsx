'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

type PageBackLinkProps = {
  href?: string
  label?: string
  className?: string
}

/** Bordered Dashboard back control used beside page titles. */
export function PageBackLink({
  href = '/dashboard',
  label = 'Dashboard',
  className = '',
}: PageBackLinkProps) {
  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${className}`}
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      {label}
    </Link>
  )
}

type PageBackTitleProps = {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
  titleClassName?: string
  backHref?: string
  backLabel?: string
}

/**
 * Page heading with a visible Dashboard back button beside the title.
 * Put this at the top of main content; keep headers to UserProfileMenu only.
 */
export function PageBackTitle({
  title,
  subtitle,
  actions,
  className = '',
  titleClassName = '',
  backHref = '/dashboard',
  backLabel = 'Dashboard',
}: PageBackTitleProps) {
  return (
    <div className={`mb-6 ${className}`.trim()}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <PageBackLink href={backHref} label={backLabel} />
          <div className="min-w-0">
            <h1
              className={`text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl ${titleClassName}`.trim()}
            >
              {title}
            </h1>
            {subtitle ? (
              <div className="mt-1 text-sm leading-relaxed text-slate-600">{subtitle}</div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}
