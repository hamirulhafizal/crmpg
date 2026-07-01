import {
  getDisplayMode,
  isIOSDevice,
  isPWAInstalled,
  isPushSupported,
} from '@/app/lib/push/client-utils'
import { pushDebug, pushDebugError } from '@/app/lib/push/debug'
import { getNotificationPermissionState } from '@/app/lib/push/local-notification'
import {
  getExistingPushSubscription,
  getPushManager,
  supportsWindowPushManager,
} from '@/app/lib/push/subscribe-client'

export type PreflightStatus = 'pass' | 'warn' | 'fail'

export type PreflightCheck = {
  id: string
  label: string
  status: PreflightStatus
  message: string
}

export type PushPreflightResult = {
  ok: boolean
  checks: PreflightCheck[]
  blockers: string[]
  warnings: string[]
}

export type ServerPushStatus = {
  vapidConfigured: boolean
  vapidPublicKeyPresent: boolean
  siteUrl: string
  subscriberCount: number
  dbOk: boolean
  error?: string
}

function check(
  id: string,
  label: string,
  status: PreflightStatus,
  message: string
): PreflightCheck {
  return { id, label, status, message }
}

export async function runClientPushPreflight(): Promise<PushPreflightResult> {
  pushDebug('Preflight: starting client checks')

  const checks: PreflightCheck[] = []
  const isSecure =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'https:' || window.location.hostname === 'localhost')

  checks.push(
    check(
      'secure-context',
      'Secure context (HTTPS)',
      isSecure ? 'pass' : 'fail',
      isSecure ? 'Running on HTTPS or localhost' : 'Push requires HTTPS in production'
    )
  )

  const notificationSupported = typeof window !== 'undefined' && 'Notification' in window
  checks.push(
    check(
      'notification-api',
      'Notification API',
      notificationSupported ? 'pass' : 'fail',
      notificationSupported ? 'Supported' : 'Not supported in this browser'
    )
  )

  const permission = getNotificationPermissionState()
  checks.push(
    check(
      'permission',
      'Notification permission',
      permission === 'granted' ? 'pass' : permission === 'denied' ? 'fail' : 'warn',
      permission === 'granted'
        ? 'Granted'
        : permission === 'denied'
          ? 'Blocked — enable in browser/OS settings'
          : 'Not requested yet'
    )
  )

  const pushSupported = isPushSupported()
  checks.push(
    check(
      'push-api',
      'PushManager available',
      pushSupported ? 'pass' : 'fail',
      pushSupported ? 'PushManager is available' : 'PushManager not available'
    )
  )

  const installed = isPWAInstalled()
  const ios = isIOSDevice()
  checks.push(
    check(
      'pwa-installed',
      'PWA installed (standalone)',
      installed ? 'pass' : ios ? 'fail' : 'warn',
      installed
        ? `Installed (${getDisplayMode()})`
        : ios
          ? 'Required on iOS — Add to Home Screen first'
          : 'Recommended — install for background push'
    )
  )

  const declarative = supportsWindowPushManager()
  checks.push(
    check(
      'declarative-api',
      'window.pushManager (declarative)',
      declarative ? 'pass' : 'warn',
      declarative
        ? 'Declarative Web Push API available'
        : 'Using serviceWorker.pushManager fallback'
    )
  )

  let swRegistered = false
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      swRegistered = Boolean(reg)
      checks.push(
        check(
          'service-worker',
          'Service worker registered',
          swRegistered ? 'pass' : 'warn',
          swRegistered ? 'Registered' : 'Not registered yet'
        )
      )
    } catch (e) {
      checks.push(
        check(
          'service-worker',
          'Service worker registered',
          'warn',
          e instanceof Error ? e.message : 'Could not check service worker'
        )
      )
    }
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  checks.push(
    check(
      'vapid-public',
      'VAPID public key (client)',
      vapidPublic && vapidPublic.length >= 80 ? 'pass' : 'fail',
      vapidPublic && vapidPublic.length >= 80
        ? 'Configured'
        : 'Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY'
    )
  )

  const manager = await getPushManager()
  checks.push(
    check(
      'push-manager',
      'PushManager instance',
      manager ? 'pass' : 'fail',
      manager ? `Ready via ${manager.method}` : 'Could not access PushManager'
    )
  )

  const subscription = await getExistingPushSubscription()
  checks.push(
    check(
      'subscription',
      'Push subscription on device',
      subscription ? 'pass' : 'fail',
      subscription
        ? `Active (${subscription.endpoint.slice(0, 48)}…)`
        : 'Not subscribed — tap Subscribe this device'
    )
  )

  const blockers = checks.filter((c) => c.status === 'fail').map((c) => `${c.label}: ${c.message}`)
  const warnings = checks.filter((c) => c.status === 'warn').map((c) => `${c.label}: ${c.message}`)

  const ok = blockers.length === 0

  pushDebug('Preflight: client result', { ok, blockers, warnings, checks })

  return { ok, checks, blockers, warnings }
}

/** Minimum checks required before sending a push test to this device. */
export async function assertPushTestReady(): Promise<PushPreflightResult> {
  const result = await runClientPushPreflight()

  const requiredIds = new Set([
    'secure-context',
    'notification-api',
    'permission',
    'push-api',
    'vapid-public',
    'push-manager',
    'subscription',
  ])

  const requiredFails = result.checks.filter((c) => requiredIds.has(c.id) && c.status === 'fail')
  if (requiredFails.length > 0) {
    pushDebugError('Preflight: push test blocked', requiredFails)
    return {
      ...result,
      ok: false,
      blockers: requiredFails.map((c) => `${c.label}: ${c.message}`),
    }
  }

  if (isIOSDevice() && !isPWAInstalled()) {
    const msg = 'PWA must be installed on iOS for background declarative push'
    pushDebugError('Preflight: iOS without PWA install', msg)
    return {
      ...result,
      ok: false,
      blockers: [...result.blockers, msg],
    }
  }

  pushDebug('Preflight: push test ready')
  return { ...result, ok: true }
}

export async function assertLocalNotificationReady(): Promise<PushPreflightResult> {
  const result = await runClientPushPreflight()
  const fails = result.checks.filter(
    (c) => ['secure-context', 'notification-api'].includes(c.id) && c.status === 'fail'
  )
  if (fails.length > 0) {
    return {
      ...result,
      ok: false,
      blockers: fails.map((c) => `${c.label}: ${c.message}`),
    }
  }

  if (isIOSDevice() && !isPWAInstalled()) {
    result.warnings.push(
      'PWA installed: Required on iOS — Add to Home Screen for system notifications. In-app preview will still show instantly.'
    )
  } else if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    result.warnings.push(
      'App is in foreground — system banner may be hidden. Look for the in-app preview at the top, or background the app.'
    )
  }

  return { ...result, ok: true }
}

export async function assertSubscribeReady(): Promise<PushPreflightResult> {
  const result = await runClientPushPreflight()
  const requiredIds = new Set(['secure-context', 'notification-api', 'push-api', 'vapid-public', 'push-manager'])
  const fails = result.checks.filter((c) => requiredIds.has(c.id) && c.status === 'fail')
  if (fails.length > 0) {
    return {
      ...result,
      ok: false,
      blockers: fails.map((c) => `${c.label}: ${c.message}`),
    }
  }
  return { ...result, ok: true }
}
