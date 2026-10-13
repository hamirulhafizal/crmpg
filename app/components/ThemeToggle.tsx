/** Pure CSS theme toggle — styles driven by #theme-toggle + prefers-color-scheme. */

export const THEME_TOGGLE_ID = 'theme-toggle'

type ThemeToggleProps = {
  className?: string
  /** `icon` = header button; `menu` = full-width account menu row. */
  variant?: 'icon' | 'menu'
}

function ThemeIcons() {
  return (
    <>
      <svg
        className="theme-icon-sun h-[1.125rem] w-[1.125rem]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path
          strokeLinecap="round"
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        />
      </svg>
      <svg
        className="theme-icon-moon h-[1.125rem] w-[1.125rem]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
        />
      </svg>
    </>
  )
}

export function ThemeToggle({ className = '', variant = 'icon' }: ThemeToggleProps) {
  if (variant === 'menu') {
    return (
      <label
        htmlFor={THEME_TOGGLE_ID}
        role="menuitem"
        className={`flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 ${className}`.trim()}
        title="Toggle light / dark mode"
        aria-label="Toggle light / dark mode"
        accessKey="m"
      >
        <span>Appearance</span>
        <span className="theme-toggle-btn theme-toggle-btn--menu inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
          <ThemeIcons />
        </span>
      </label>
    )
  }

  return (
    <label
      htmlFor={THEME_TOGGLE_ID}
      className={`theme-toggle-btn ${className}`.trim()}
      title="Toggle light / dark mode"
      aria-label="Toggle light / dark mode"
      accessKey="m"
    >
      <ThemeIcons />
    </label>
  )
}
