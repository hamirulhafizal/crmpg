'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { isIOSDevice, isPWAInstalled, isPushSupported } from '@/app/lib/push/client-utils'
import { getExistingPushSubscription } from '@/app/lib/push/subscribe-client'
import {
  getDeferredInstallPrompt,
  showNativeInstallPrompt,
  subscribeInstallPrompt,
} from '@/app/lib/push/install-prompt'

export type PWAStatus = {
  isInstalled: boolean
  isBrowserTab: boolean
  isIOS: boolean
  canInstall: boolean
  /** True when the browser native install dialog can be opened via prompt() */
  installPromptReady: boolean
  isInstalling: boolean
  pushSupported: boolean
  notificationPermission: NotificationPermission | null
  isSubscribed: boolean
  installApp: () => Promise<void>
  refreshSubscription: () => Promise<void>
}

function subscribeInstalled(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}

  const mediaQuery = window.matchMedia('(display-mode: standalone)')
  mediaQuery.addEventListener('change', onChange)
  const interval = window.setInterval(onChange, 1500)

  return () => {
    mediaQuery.removeEventListener('change', onChange)
    window.clearInterval(interval)
  }
}

function getInstalledSnapshot() {
  return isPWAInstalled()
}

function getInstalledServerSnapshot() {
  return false
}

export function usePWAStatus(): PWAStatus {
  const isInstalled = useSyncExternalStore(
    subscribeInstalled,
    getInstalledSnapshot,
    getInstalledServerSnapshot
  )

  const hasNativePrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    () => getDeferredInstallPrompt() !== null,
    () => false
  )

  const [isIOS, setIsIOS] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(
    null
  )
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    setIsIOS(isIOSDevice())
  }, [])

  const refreshSubscription = useCallback(async () => {
    if (!isPushSupported()) {
      setPushSupported(false)
      setIsSubscribed(false)
      return
    }

    setPushSupported(true)

    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
    }

    try {
      const sub = await getExistingPushSubscription()
      setIsSubscribed(Boolean(sub))
    } catch {
      setIsSubscribed(false)
    }
  }, [])

  useEffect(() => {
    void refreshSubscription()
  }, [refreshSubscription, isInstalled])

  const installApp = useCallback(async () => {
    if (getDeferredInstallPrompt()) {
      setIsInstalling(true)
      try {
        const outcome = await showNativeInstallPrompt()
        if (outcome === 'accepted') {
          window.setTimeout(() => void refreshSubscription(), 1000)
        }
      } finally {
        setIsInstalling(false)
      }
      return
    }

    if (isIOS) {
      window.alert(
        'To install on iPhone or iPad:\n\n1. Tap Share at the bottom of Safari\n2. Tap "Add to Home Screen"\n3. Tap Add\n\nOpen the app from your home screen, then enable notifications.'
      )
    }
  }, [isIOS, refreshSubscription])

  const installPromptReady = hasNativePrompt || isIOS

  return {
    isInstalled,
    isBrowserTab: !isInstalled,
    isIOS,
    canInstall: !isInstalled,
    installPromptReady,
    isInstalling,
    pushSupported,
    notificationPermission,
    isSubscribed,
    installApp,
    refreshSubscription,
  }
}
