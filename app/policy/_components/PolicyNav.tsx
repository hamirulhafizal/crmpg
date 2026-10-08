'use client'

import Link from 'next/link'
import { POLICY_CATALOG, type PolicySlug } from '@/app/lib/policy/catalog'

export function PolicyNav({ activeSlug }: { activeSlug: PolicySlug }) {
  return (
    <nav
      aria-label="Policies"
      className="rounded-2xl border border-border bg-card p-2 shadow-sm"
    >
      <ul className="space-y-0.5">
        {POLICY_CATALOG.map((policy) => {
          const active = policy.slug === activeSlug
          return (
            <li key={policy.slug}>
              <Link
                href={`/policy/${policy.slug}`}
                className={`block rounded-xl px-3.5 py-2.5 text-sm transition ${
                  active
                    ? 'bg-muted font-medium text-sky-400'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {policy.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
