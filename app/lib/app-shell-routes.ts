/**
 * Paths that use the persistent AppShell (sidebar + header + footer).
 * Kept outside /admin (admin has its own layout shell).
 */
export function isAppShellPath(pathname: string): boolean {
  const p = pathname || '/'
  if (p.startsWith('/admin')) return false

  const prefixes = [
    '/dashboard',
    '/google-ads',
    '/customers',
    '/ws-integration',
    '/waha-integration',
    '/extension-download',
    '/profile',
    '/automated-messages',
    '/excel-processor',
    '/pwa-test',
  ]
  return prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))
}

/** Default header title from the current route. */
export function resolveAppShellTitle(pathname: string): string {
  const p = pathname || '/'

  if (p.startsWith('/dashboard/billing')) return 'Billing & plans'
  if (p.startsWith('/dashboard/campaigns')) return 'Workflows'
  if (p.startsWith('/dashboard/lucky-draw')) return 'Lucky Draw'
  if (p === '/dashboard' || p.startsWith('/dashboard/')) return 'Dashboard'
  if (p.startsWith('/google-ads')) return 'Google Ads'
  if (p.startsWith('/customers')) return 'Customers'
  if (p.startsWith('/ws-integration') || p.startsWith('/waha-integration')) {
    return 'WhatsApp Integration'
  }
  if (p.startsWith('/extension-download')) return 'Chrome Extension'
  if (p.startsWith('/profile')) return 'Edit Profile'
  if (p.startsWith('/automated-messages')) return 'Automated Messages'
  if (p.startsWith('/excel-processor')) return 'Excel Processor'
  if (p.startsWith('/pwa-test')) return 'PWA test'

  return 'Dashboard'
}
