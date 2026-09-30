// /** Pure CSS theme toggle — styles driven by #theme-toggle + prefers-color-scheme. */

export const THEME_TOGGLE_ID = 'theme-toggle'

export function ThemeToggle({ className = '' }: { className?: string }) {
  return (
    <label
      htmlFor={THEME_TOGGLE_ID}
      className={`theme-toggle-btn ${className}`.trim()}
      title="Toggle light / dark mode"
      aria-label="Toggle light / dark mode"
      accessKey="m"
    >
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
    </label>
  )
}
