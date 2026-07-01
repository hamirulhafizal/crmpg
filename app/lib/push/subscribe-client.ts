import { base64UrlToUint8Array, isIOSDevice, isPWAInstalled } from '@/app/lib/push/client-utils'
import { pushDebug, pushDebugError, pushDebugWarn } from '@/app/lib/push/debug'

declare global {
  interface Window {
    pushManager?: PushManager
  }
}

export type PushSubscribeResult = {
  subscription: PushSubscription
  method: 'window.pushManager' | 'serviceWorker.pushManager'
}

async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null

  try {
    let registration = await navigator.serviceWorker.getRegistration('/')
    if (!registration) {
      pushDebug('subscribe: registering /sw.js…')
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    }
    await navigator.serviceWorker.ready
    return registration
  } catch (error) {
    pushDebugError('subscribe: service worker registration failed', error)
    return null
  }
}

/**
 * Match working Rms flow: subscribe via serviceWorker.pushManager first.
 * iOS declarative push still requires SW registration to access PushManager.
 */
export async function getPushManager(): Promise<{
  pushManager: PushManager
  method: PushSubscribeResult['method']
} | null> {
  if (typeof window === 'undefined') return null

  if ('serviceWorker' in navigator) {
    const registration = await ensureServiceWorkerReady()
    if (registration?.pushManager) {
      pushDebug('getPushManager: using serviceWorker.pushManager (Rms-compatible)')
      return { pushManager: registration.pushManager, method: 'serviceWorker.pushManager' }
    }
    pushDebugWarn('getPushManager: service worker ready but no pushManager')
  }

  if ('pushManager' in window && window.pushManager) {
    pushDebug('getPushManager: using window.pushManager (declarative fallback)')
    return { pushManager: window.pushManager, method: 'window.pushManager' }
  }

  pushDebugError('getPushManager: no PushManager available')
  return null
}

export function isDeclarativePushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    ('pushManager' in window && Boolean(window.pushManager)) ||
    ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)
  )
}

export function supportsWindowPushManager(): boolean {
  return typeof window !== 'undefined' && 'pushManager' in window && Boolean(window.pushManager)
}

export async function subscribeToDeclarativePush(): Promise<PushSubscribeResult> {
  pushDebug('subscribe: starting')

  if (isIOSDevice() && !isPWAInstalled()) {
    throw new Error('On iOS, add the app to Home Screen first, then subscribe.')
  }

  const manager = await getPushManager()
  if (!manager) {
    throw new Error('Push notifications are not supported in this browser.')
  }

  const { pushManager, method } = manager
  pushDebug('subscribe: pushManager ready', { method })

  const existing = await pushManager.getSubscription()
  if (existing) {
    pushDebug('subscribe: reusing existing subscription', {
      endpoint: `${existing.endpoint.slice(0, 48)}…`,
    })
    return { subscription: existing, method }
  }

  pushDebug('subscribe: requesting notification permission…')
  const permission = await Notification.requestPermission()
  pushDebug('subscribe: permission result', { permission })
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied.')
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    pushDebugError('subscribe: NEXT_PUBLIC_VAPID_PUBLIC_KEY missing')
    throw new Error('Push is not configured on the server yet.')
  }

  pushDebug('subscribe: calling pushManager.subscribe…')
  const subscription = await pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(vapidKey).buffer as ArrayBuffer,
  })

  pushDebug('subscribe: success', {
    endpoint: `${subscription.endpoint.slice(0, 48)}…`,
    method,
  })

  return { subscription, method }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  const manager = await getPushManager()
  if (!manager) return null
  return manager.pushManager.getSubscription()
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const subscription = await getExistingPushSubscription()
  if (!subscription) return false
  return subscription.unsubscribe()
}

export function buildDeviceInfoForSubscription(method: PushSubscribeResult['method']) {
  return {
    isIOS: isIOSDevice(),
    isStandalone: isPWAInstalled(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    pushMethod: method,
    supportsDeclarativeWebPush: supportsWindowPushManager(),
  }
}
