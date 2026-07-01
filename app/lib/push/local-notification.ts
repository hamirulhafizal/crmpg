import { getDisplayMode, isIOSDevice, isPWAInstalled } from '@/app/lib/push/client-utils'
import { pushDebug, pushDebugError, pushDebugWarn } from '@/app/lib/push/debug'

export type NotificationPermissionState = NotificationPermission | 'unsupported'

export type LocalNotificationResult = {
  method: 'serviceWorker' | 'notification-constructor' | 'in-app-preview-only'
  systemAttempted: boolean
  inAppPreviewShown: boolean
  hint?: string
}

const DEFAULT_ICON = '/icons/icon-192.png'

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission
}

export function permissionLabel(state: NotificationPermissionState): string {
  switch (state) {
    case 'granted':
      return 'Enabled'
    case 'denied':
      return 'Blocked'
    case 'default':
      return 'Not asked yet'
    default:
      return 'Unsupported'
  }
}

export function permissionBadgeClass(state: NotificationPermissionState): string {
  switch (state) {
    case 'granted':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'denied':
      return 'bg-red-50 text-red-700 ring-red-200'
    case 'default':
      return 'bg-amber-50 text-amber-800 ring-amber-200'
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200'
  }
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null

  try {
    let registration = await navigator.serviceWorker.getRegistration('/')
    if (!registration) {
      pushDebug('localNotification: registering service worker…')
      registration = await navigator.serviceWorker.register('/sw.js')
    }
    await navigator.serviceWorker.ready
    pushDebug('localNotification: service worker ready', {
      scope: registration.scope,
      active: Boolean(registration.active),
    })
    return registration
  } catch (error) {
    pushDebugError('localNotification: service worker unavailable', error)
    return null
  }
}

/** Visible banner inside the page — always shows instantly (for iOS foreground testing). */
function showInAppNotificationPreview(title: string, body: string): void {
  if (typeof document === 'undefined') return

  const existing = document.getElementById('pg-local-notification-preview')
  existing?.remove()

  const wrapper = document.createElement('div')
  wrapper.id = 'pg-local-notification-preview'
  wrapper.setAttribute('role', 'alert')
  wrapper.style.cssText = [
    'position:fixed',
    'top:12px',
    'left:12px',
    'right:12px',
    'z-index:99999',
    'max-width:420px',
    'margin:0 auto',
    'padding:14px 16px',
    'border-radius:16px',
    'background:rgba(255,255,255,0.97)',
    'box-shadow:0 8px 32px rgba(0,0,0,0.18)',
    'border:1px solid rgba(0,0,0,0.08)',
    'font-family:system-ui,-apple-system,sans-serif',
    'animation:pg-notif-slide-in 0.35s ease-out',
  ].join(';')

  const style = document.createElement('style')
  style.textContent = `@keyframes pg-notif-slide-in{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}`
  wrapper.appendChild(style)

  const titleEl = document.createElement('p')
  titleEl.textContent = title
  titleEl.style.cssText = 'margin:0;font-size:15px;font-weight:600;color:#0f172a;line-height:1.3'

  const bodyEl = document.createElement('p')
  bodyEl.textContent = body
  bodyEl.style.cssText = 'margin:6px 0 0;font-size:13px;color:#475569;line-height:1.4'

  const badge = document.createElement('p')
  badge.textContent = 'In-app preview (instant) — system banner may appear when app is backgrounded'
  badge.style.cssText = 'margin:8px 0 0;font-size:11px;color:#64748b'

  wrapper.appendChild(titleEl)
  wrapper.appendChild(bodyEl)
  wrapper.appendChild(badge)
  document.body.appendChild(wrapper)

  window.setTimeout(() => wrapper.remove(), 8000)
  pushDebug('localNotification: in-app preview shown')
}

function foregroundHint(): string | undefined {
  const ios = isIOSDevice()
  const installed = isPWAInstalled()
  const foreground = typeof document !== 'undefined' && document.visibilityState === 'visible'

  if (!foreground) return undefined

  if (ios && installed) {
    return 'On iOS PWA, system notifications usually do NOT appear while the app is open. Swipe home or lock the screen, then try again — or check Notification Center.'
  }
  if (ios && !installed) {
    return 'On iOS, add the app to Home Screen first. System notifications may not show in Safari while this tab is active.'
  }
  if (foreground) {
    return 'App is in foreground — some browsers hide the system banner. Check the in-app preview above, or background the app.'
  }
  return undefined
}

/** In-tab / local notification — tests browser permission without server push. */
export async function showLocalTestNotification(options: {
  title: string
  body: string
  icon?: string
  tag?: string
  showInAppPreview?: boolean
}): Promise<LocalNotificationResult> {
  pushDebug('localNotification: starting', options)

  if (typeof window === 'undefined' || !('Notification' in window)) {
    pushDebugError('localNotification: Notification API unsupported')
    throw new Error('Notifications are not supported in this browser.')
  }

  const ios = isIOSDevice()
  const installed = isPWAInstalled()

  if (ios && !installed) {
    pushDebugWarn('localNotification: iOS Safari tab — PWA install recommended')
  }

  let permission = Notification.permission
  pushDebug('localNotification: current permission', { permission, ios, installed, displayMode: getDisplayMode() })

  if (permission === 'default') {
    permission = await Notification.requestPermission()
    pushDebug('localNotification: permission after request', { permission })
  }

  if (permission !== 'granted') {
    pushDebugError('localNotification: permission not granted', { permission })
    throw new Error('Notification permission is not granted. Enable it in browser settings.')
  }

  const icon = options.icon || DEFAULT_ICON
  const tag = options.tag || `pg-crm-local-${Date.now()}`
  const notificationOptions: NotificationOptions = {
    body: options.body,
    icon,
    badge: icon,
    tag,
    data: { url: '/dashboard', localTest: true },
  }

  const showPreview = options.showInAppPreview !== false
  let inAppPreviewShown = false
  if (showPreview) {
    showInAppNotificationPreview(options.title, options.body)
    inAppPreviewShown = true
  }

  const hint = foregroundHint()
  let method: LocalNotificationResult['method'] = 'in-app-preview-only'
  let systemAttempted = false

  // iOS PWA: ServiceWorker.showNotification is required; Notification constructor often does nothing.
  const preferServiceWorker = ios || installed || 'serviceWorker' in navigator

  if (preferServiceWorker && 'serviceWorker' in navigator) {
    const registration = await getServiceWorkerRegistration()
    if (registration) {
      try {
        pushDebug('localNotification: calling registration.showNotification…', { tag })
        await registration.showNotification(options.title, notificationOptions)
        pushDebug('localNotification: showNotification resolved OK')
        systemAttempted = true
        method = 'serviceWorker'
        return { method, systemAttempted, inAppPreviewShown, hint }
      } catch (error) {
        pushDebugWarn('localNotification: showNotification failed', error)
      }
    }
  }

  // Desktop Chrome / Firefox fallback
  if (!ios) {
    try {
      pushDebug('localNotification: using Notification constructor')
      const notification = new Notification(options.title, notificationOptions)
      systemAttempted = true
      method = 'notification-constructor'
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
      pushDebug('localNotification: Notification constructor created', { tag })
      return { method, systemAttempted, inAppPreviewShown, hint }
    } catch (error) {
      pushDebugError('localNotification: Notification constructor failed', error)
    }
  }

  pushDebugWarn('localNotification: system notification could not be shown — in-app preview only', {
    ios,
    installed,
    hint,
  })

  if (!inAppPreviewShown) {
    showInAppNotificationPreview(options.title, options.body)
    inAppPreviewShown = true
  }

  return {
    method: 'in-app-preview-only',
    systemAttempted,
    inAppPreviewShown,
    hint:
      hint ||
      (ios
        ? 'System notification failed. Ensure PWA is installed from Home Screen and notifications are enabled in iOS Settings.'
        : 'System notification failed. Check service worker registration in DevTools.'),
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'granted') {
    return 'granted'
  }
  return Notification.requestPermission()
}
