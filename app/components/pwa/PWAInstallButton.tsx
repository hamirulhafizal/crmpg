function InstallHomeScreenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17 1H7c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm0 18H7V5h10v14z" />
      <path d="M12 16l-3-3h2V8h2v5h2l-3 3z" />
    </svg>
  )
}

type PWAInstallHomeButtonProps = {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  className?: string
}

export function PWAInstallHomeButton({
  onClick,
  disabled = false,
  loading = false,
  className = '',
}: PWAInstallHomeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-3 rounded-lg px-5 py-3 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <InstallHomeScreenIcon className="h-5 w-5 shrink-0" />
      <span>{loading ? 'Installing…' : 'Install to home screen'}</span>
    </button>
  )
}

type PWAInstallSectionProps = {
  isIOS: boolean
  installPromptReady: boolean
  isInstalling: boolean
  onInstall: () => void
}

export function PWAInstallSection({
  isIOS,
  installPromptReady,
  isInstalling,
  onInstall,
}: PWAInstallSectionProps) {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"
      aria-labelledby="pwa-install-title"
    >
      <h3 id="pwa-install-title" className="text-xl font-semibold text-slate-900 sm:text-2xl">
        How to use this app
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
        PG CRM is a Progressive Web App — install it on your device for quick access and background
        notifications, even when the app is closed.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
        {installPromptReady
          ? 'Tap the button below — Chrome will open the native install dialog with app previews.'
          : 'Waiting for the browser install prompt… interact with the page, then the button will become active.'}
      </p>

      {isIOS ? (
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Tap Share in Safari</li>
          <li>Choose &quot;Add to Home Screen&quot;</li>
          <li>Open the app from your home screen</li>
        </ol>
      ) : null}

      <div className="mt-6">
        <PWAInstallHomeButton
          onClick={onInstall}
          disabled={!installPromptReady}
          loading={isInstalling}
          className="bg-slate-600 text-white hover:bg-slate-700 enabled:bg-blue-600 enabled:hover:bg-blue-700"
        />
      </div>
    </section>
  )
}
