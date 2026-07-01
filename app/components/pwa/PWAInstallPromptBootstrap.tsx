import Script from 'next/script'

/** Inline script runs before React so we never miss beforeinstallprompt. */
const INSTALL_PROMPT_BOOTSTRAP = `
(function () {
  if (window.__pgcrmInstallPromptInit) return;
  window.__pgcrmInstallPromptInit = true;
  window.__pgcrmDeferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__pgcrmDeferredInstallPrompt = e;
    window.dispatchEvent(new Event('pgcrm-installprompt-ready'));
  });
  window.addEventListener('appinstalled', function () {
    window.__pgcrmDeferredInstallPrompt = null;
    window.dispatchEvent(new Event('pgcrm-installprompt-ready'));
  });
})();
`

export function PWAInstallPromptBootstrap() {
  return (
    <Script id="pwa-install-prompt-bootstrap" strategy="beforeInteractive">
      {INSTALL_PROMPT_BOOTSTRAP}
    </Script>
  )
}
