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

/** Prefer window.pushManager (Declarative Web Push — no service worker required). */
export async function getPushManager(): Promise<{
  pushManager: PushManager
  method: PushSubscribeResult['method']
} | null> {
  if (typeof window === 'undefined') return null

  if ('pushManager' in window && window.pushManager) {
    pushDebug('getPushManager: using window.pushManager (declarative)')
    return { pushManager: window.pushManager, method: 'window.pushManager' }
  }

  if ('serviceWorker' in navigator) {
    try {
      pushDebug('getPushManager: waiting for serviceWorker.ready…')
      const registration = await navigator.serviceWorker.ready
      if (registration.pushManager) {
        pushDebug('getPushManager: using serviceWorker.pushManager')
        return { pushManager: registration.pushManager, method: 'serviceWorker.pushManager' }
      }
      pushDebugWarn('getPushManager: service worker ready but no pushManager')
    } catch (error) {
      pushDebugWarn('getPushManager: service worker not ready', error)
    }
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
