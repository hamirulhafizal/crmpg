import Link from 'next/link'
import { COMPANY, COMPANY_NAV } from '@/app/lib/company'
import { POLICY_CATALOG } from '@/app/lib/policy/catalog'

/** @deprecated Prefer COMPANY from @/app/lib/company */
export const COMPANY_LEGAL = {
  name: COMPANY.name,
  registrationNumber: COMPANY.registrationNumber,
} as const

type CompanyLegalFooterProps = {
  /** Dark for marketing landings; light for app / auth screens. */
  variant?: 'light' | 'dark'
  className?: string
  /** Show links to all published legal policies. */
  showPolicyLinks?: boolean
  /** Show About / Contact / Policies shortcuts. */
  showCompanyLinks?: boolean
}

/**
 * Legal company line for site footers (SSM / company registration).
 */
export function CompanyLegalFooter({
  variant = 'light',
  className = '',
  showPolicyLinks = false,
  showCompanyLinks = false,
}: CompanyLegalFooterProps) {
  const year = new Date().getFullYear()
  const isDark = variant === 'dark'
  const muted = isDark ? 'text-slate-400' : 'text-slate-500'
  const linkClass = isDark
    ? 'underline-offset-2 hover:text-white hover:underline'
    : 'underline-offset-2 hover:text-slate-800 hover:underline'

  return (
    <footer
      className={
        className ||
        (isDark
          ? 'bg-gray-900 py-8 text-white'
          : 'border-t border-slate-200/80 bg-transparent py-6 text-slate-500')
      }
    >
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-700'}`}>
          © {year} {COMPANY.name}
        </p>
        <p className={`mt-1 text-xs ${muted}`}>Registration No. {COMPANY.registrationNumber}</p>

        {showCompanyLinks ? (
          <nav
            aria-label="Company"
            className={`mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs ${muted}`}
          >
            {COMPANY_NAV.map((item, index) => (
              <span key={item.href} className="inline-flex items-center gap-3">
                {index > 0 ? (
                  <span className={isDark ? 'text-slate-600' : 'text-slate-300'} aria-hidden>
                    ·
                  </span>
                ) : null}
                <Link href={item.href} className={linkClass}>
                  {item.label}
                </Link>
              </span>
            ))}
          </nav>
        ) : null}

        {showPolicyLinks ? (
          <nav
            aria-label="Legal policies"
            className={`mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs ${muted}`}
          >
            {POLICY_CATALOG.map((policy, index) => (
              <span key={policy.slug} className="inline-flex items-center gap-3">
                {index > 0 ? (
                  <span className={isDark ? 'text-slate-600' : 'text-slate-300'} aria-hidden>
                    ·
                  </span>
                ) : null}
                <Link href={`/policy/${policy.slug}`} className={linkClass}>
                  {policy.title}
                </Link>
              </span>
            ))}
          </nav>
        ) : null}
      </div>
    </footer>
  )
}
