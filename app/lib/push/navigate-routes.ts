/** In-app paths suitable for declarative push `navigate_url` (relative paths). */
export type PushNavigateRoute = {
  path: string
  label: string
  group?: string
}

export const PUSH_NAVIGATE_ROUTES: PushNavigateRoute[] = [
  { path: '/dashboard', label: 'Dashboard', group: 'Main' },
  { path: '/customers', label: 'Customer management', group: 'Main' },
  { path: '/profile', label: 'Profile settings', group: 'Main' },
  { path: '/dashboard/billing', label: 'Billing & subscription', group: 'Main' },
  { path: '/dashboard/campaigns', label: 'Campaigns', group: 'Marketing' },
  { path: '/dashboard/lucky-draw', label: 'Lucky draw', group: 'Marketing' },
  { path: '/automated-messages', label: 'Automated messages', group: 'Marketing' },
  { path: '/google-ads', label: 'Google Ads', group: 'Marketing' },
  { path: '/waha-integration', label: 'WhatsApp integration', group: 'Integrations' },
  { path: '/excel-processor', label: 'Excel processor', group: 'Tools' },
  { path: '/extension-download', label: 'Chrome extension download', group: 'Tools' },
  { path: '/test-pwa', label: 'PWA test page', group: 'Tools' },
  { path: '/admin/settings', label: 'Admin settings', group: 'Admin' },
  { path: '/admin/plans', label: 'SaaS plans', group: 'Admin' },
  { path: '/admin/media', label: 'Media library', group: 'Admin' },
  { path: '/admin/push', label: 'Push notifications', group: 'Admin' },
  { path: '/admin/lucky-draw-defaults', label: 'Lucky draw defaults', group: 'Admin' },
  { path: '/admin/google-ads', label: 'Admin Google Ads', group: 'Admin' },
  { path: '/admin/workflow-nodes', label: 'Workflow nodes', group: 'Admin' },
]

/** Normalize user input to a safe in-app path or pass through https URL. */
export function normalizePushNavigateInput(raw: string, baseUrl: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return `${baseUrl}/dashboard`
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `${baseUrl.replace(/\/$/, '')}${path}`
}
