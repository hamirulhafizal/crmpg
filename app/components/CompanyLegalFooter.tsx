export const COMPANY_LEGAL = {
  name: 'RAKAN AUTOMASI MARKETING',
  registrationNumber: '202603241560 (CA0427505-X)',
} as const

type CompanyLegalFooterProps = {
  /** Dark for marketing landings; light for app / auth screens. */
  variant?: 'light' | 'dark'
  className?: string
}

/**
 * Legal company line for site footers (SSM / company registration).
 */
export function CompanyLegalFooter({ variant = 'light', className = '' }: CompanyLegalFooterProps) {
  const year = new Date().getFullYear()
  const isDark = variant === 'dark'

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
          © {year} {COMPANY_LEGAL.name}
        </p>
        <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Registration No. {COMPANY_LEGAL.registrationNumber}
        </p>
      </div>
    </footer>
  )
}
