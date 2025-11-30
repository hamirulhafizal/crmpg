'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [canInstall, setCanInstall] = useState(true)
  const [isInstalling, setIsInstalling] = useState(false)

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

      // Check if running in fullscreen mode (another indicator of PWA)
      if (window.matchMedia('(display-mode: fullscreen)').matches) {
        return true
      }

      // Check if window controls overlay is present (Windows PWA)
      if (window.matchMedia('(display-mode: window-controls-overlay)').matches) {
        return true
      }

      return false
    }

    // Initial check
    const installed = checkIfInstalled()
    setIsStandalone(installed)

    // Don't set up listeners if already installed
    if (installed) {
      setCanInstall(false)
      return
    }

    // Listen for beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setCanInstall(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Show install button if manifest exists
    const manifestLink = document.querySelector('link[rel="manifest"]')
    if (manifestLink && !installed) {
      setCanInstall(true)
    }

    // Check periodically for standalone mode changes (e.g., after installation)
    const checkInterval = setInterval(() => {
      const isInstalled = checkIfInstalled()
      setIsStandalone(isInstalled)
      
      if (isInstalled) {
        setCanInstall(false)
        clearInterval(checkInterval)
      }
    }, 1000)

    // Also listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleDisplayModeChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setIsStandalone(true)
        setCanInstall(false)
      }
    }

    // Check immediately
    handleDisplayModeChange(mediaQuery)

    // Listen for changes
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange)
    } else {
      // Fallback for older browsers
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
      // Show install prompt (Android/Chrome)
      setIsInstalling(true)
      try {
        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        
        if (outcome === 'accepted') {
          setDeferredPrompt(null)
          // Don't hide button immediately - let standalone check handle it
        }
      } catch (error) {
        console.error('Error showing install prompt:', error)
        // Still show button even if prompt fails
      } finally {
        setIsInstalling(false)
      }
    } else if (isIOS) {
      // Show instructions for iOS in a better way
      const message = 'To install this app on iOS:\n\n1. Tap the share button (square with arrow) at the bottom\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to confirm\n\nAfter installation, the app will appear on your home screen!'
      alert(message)
    } else {
      // For other browsers, try manual installation or show instructions
      console.log('Install prompt not available. Try installing from browser menu.')
      alert('To install this app:\n\n1. Look for an install icon in your browser\'s address bar\n2. Or use your browser\'s menu: More Tools > Create Shortcut\n3. Make sure "Open as window" is checked')
    }
  }

  // Hide button if PWA is already installed
  if (isStandalone) {
    return null
  }

  // Don't show if can't install and no deferred prompt
  if (!canInstall && !deferredPrompt && !isIOS) {
    return null
  }

  return (
    <button
      onClick={handleInstallClick}
      disabled={isInstalling}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
    >
      {isInstalling ? (
        <>
          <svg
            className="animate-spin h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span>Installing...</span>
        </>
      ) : (
        <>
          <svg
            className="w-5 h-5"
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
          <span>Install App</span>
        </>
      )}
    </button>
  )
}

