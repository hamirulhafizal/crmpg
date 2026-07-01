'use client'

import { useEffect, useRef, useState } from 'react'
import { usePWAStatus } from '@/app/hooks/usePWAStatus'
import { PWAInstallHomeButton, PWAInstallSection } from '@/app/components/pwa/PWAInstallButton'
import {
  buildDeviceInfoForSubscription,
  subscribeToDeclarativePush,
} from '@/app/lib/push/subscribe-client'
import { isPushSupported } from '@/app/lib/push/client-utils'

export function PWADashboardSetup() {
  const {
    isInstalled,
    isBrowserTab,
    isIOS,
    installPromptReady,
    isInstalling,
    pushSupported,
    notificationPermission,
    isSubscribed,
    installApp,
    refreshSubscription,
  } = usePWAStatus()

  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNotificationStep, setShowNotificationStep] = useState(false)
  const wasInstalledRef = useRef(isInstalled)

  useEffect(() => {
    if (isInstalled && !wasInstalledRef.current) {
      setShowNotificationStep(true)
    }
    wasInstalledRef.current = isInstalled
  }, [isInstalled])

  useEffect(() => {
    // Step 2 only after the app is actually installed (standalone), not in a browser tab
    if (isInstalled && pushSupported && !isSubscribed && notificationPermission !== 'denied') {
      setShowNotificationStep(true)
    }
  }, [isInstalled, pushSupported, isSubscribed, notificationPermission])

  const handleEnableNotifications = async () => {
    setEnabling(true)
    setError(null)

    try {
      if (!isPushSupported()) {
        throw new Error('Push notifications are not supported in this browser.')
      }

      const { subscription, method } = await subscribeToDeclarativePush()

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
          deviceInfo: buildDeviceInfoForSubscription(method),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save subscription.')
      }

      await refreshSubscription()
      setShowNotificationStep(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enable notifications.')
    } finally {
      setEnabling(false)
    }
  }

  const showInstallSection = isBrowserTab
  const showPushCard =
    isInstalled &&
    showNotificationStep &&
    pushSupported &&
    !isSubscribed &&
    notificationPermission !== 'denied'

  if (!showInstallSection && !showPushCard) {
    return null
  }

  return (
    <div className="space-y-4">
      {showInstallSection ? (
        <PWAInstallSection
          isIOS={isIOS}
          installPromptReady={installPromptReady}
          isInstalling={isInstalling}
          onInstall={() => void installApp()}
        />
      ) : null}

      {showPushCard ? (
        <section
          className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-lg"
          aria-labelledby="pwa-push-title"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <div>
                <h3 id="pwa-push-title" className="text-lg font-semibold text-slate-900">
                  Enable notifications
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Step 2 of 2 — declarative web push. The OS delivers notifications even when PG CRM
                  is closed; no service worker required on iOS 18.4+.
                </p>
                {error ? (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleEnableNotifications()}
              disabled={enabling}
              className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
            >
              {enabling ? 'Enabling…' : 'Enable notifications'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

/** Compact install button for the dashboard header */
export function PWADashboardInstallButton() {
  const { isBrowserTab, installPromptReady, isInstalling, installApp } = usePWAStatus()

  if (!isBrowserTab) return null

  return (
    <PWAInstallHomeButton
      onClick={() => void installApp()}
      disabled={!installPromptReady}
      loading={isInstalling}
      className="inline-flex bg-blue-600 text-white hover:bg-blue-700"
    />
  )
}
