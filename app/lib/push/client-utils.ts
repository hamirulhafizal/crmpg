export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    buffer[i] = rawData.charCodeAt(i)
  }

  return buffer
}

export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false

  // iOS Safari — added to home screen
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true
  }

  // Installed PWA — standalone display mode only (strict; avoid false positives)
  return window.matchMedia('(display-mode: standalone)').matches
}

/** True when running inside a normal browser tab (install prompt should show). */
export function isBrowserTab(): boolean {
  return !isPWAInstalled()
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    (('pushManager' in window && Boolean((window as Window).pushManager)) ||
      ('serviceWorker' in navigator && 'PushManager' in window))
  )
}

export function getDisplayMode(): string {
  if (typeof window === 'undefined') return 'Browser'
  if (window.matchMedia('(display-mode: standalone)').matches) return 'Standalone'
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'Fullscreen'
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) {
    return 'Window Controls Overlay'
  }
  return 'Browser'
}
