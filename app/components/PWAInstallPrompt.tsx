'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if running on iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    setIsIOS(isIOSDevice)

    // Comprehensive check if PWA is already installed
    const checkIfInstalled = (): boolean => {
      // Check for iOS standalone mode
      if ((window.navigator as any).standalone === true) {
        return true
      }

      // Check for standalone display mode (Android/Desktop)
      if (window.matchMedia('(display-mode: standalone)').matches) {
        return true
      }

      // Check if running in fullscreen mode
      if (window.matchMedia('(display-mode: fullscreen)').matches) {
        return true
      }

      // Check if window controls overlay is present
      if (window.matchMedia('(display-mode: window-controls-overlay)').matches) {
        return true
      }

      return false
    }

    // Initial check
    const installed = checkIfInstalled()
    setIsStandalone(installed)

    // Don't show prompt if already installed
    if (installed) {
      return
    }

    // Listen for beforeinstallprompt event (Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Show iOS install instructions if on iOS and not installed
    if (isIOSDevice && !installed) {
      setShowPrompt(true)
    }

    // Check periodically for standalone mode changes
    const checkInterval = setInterval(() => {
      const isInstalled = checkIfInstalled()
      setIsStandalone(isInstalled)
      
      if (isInstalled) {
        setShowPrompt(false)
        clearInterval(checkInterval)
      }
    }, 1000)

    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleDisplayModeChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setIsStandalone(true)
        setShowPrompt(false)
      }
    }

    handleDisplayModeChange(mediaQuery)

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange)
    } else {
      mediaQuery.addListener(handleDisplayModeChange)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      clearInterval(checkInterval)
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleDisplayModeChange)
      } else {
        mediaQuery.removeListener(handleDisplayModeChange)
      }
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Show install prompt (Android)
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      
      if (outcome === 'accepted') {
        setShowPrompt(false)
        setDeferredPrompt(null)
      }
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    // Store dismissal in localStorage to avoid showing again for a while
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  // Don't show if already installed
  if (isStandalone) {
    return null
  }

  // Check if user dismissed recently (within 24 hours)
  const dismissedTime = localStorage.getItem('pwa-install-dismissed')
  if (dismissedTime) {
    const hoursSinceDismissal = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60)
    if (hoursSinceDismissal < 24) {
      return null
    }
  }

  if (!showPrompt) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-50 animate-slide-up">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Install App</h3>
              <p className="text-sm text-slate-600">
                {isIOS
                  ? 'Add this app to your home screen for a better experience'
                  : 'Install this app on your device for easy access'}
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {isIOS ? (
          <div className="space-y-3">
            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
              <li>Tap the share button <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg> at the bottom</li>
              <li>Scroll down and tap &quot;Add to Home Screen&quot;</li>
              <li>Tap &quot;Add&quot; to confirm</li>
            </ol>
          </div>
        ) : (
          <button
            onClick={handleInstallClick}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
          >
            Install App
          </button>
        )}
      </div>
    </div>
  )
}

