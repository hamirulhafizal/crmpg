'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function DeclarativeWebPushTestPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [isSupported, setIsSupported] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Status states
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null)
  const [hasServiceWorker, setHasServiceWorker] = useState(false)
  const [hasPushManager, setHasPushManager] = useState(false)
  const [hasNotificationAPI, setHasNotificationAPI] = useState(false)
  const [vapidKeyValid, setVapidKeyValid] = useState<boolean | null>(null)
  const [displayMode, setDisplayMode] = useState<string>('')
  const [isIOS, setIsIOS] = useState(false)
  const [userAgent, setUserAgent] = useState('')
  const [supportsDeclarativePush, setSupportsDeclarativePush] = useState(false)
  const [pushManagerPermissionState, setPushManagerPermissionState] = useState<string | null>(null)
  const [pushManagerSupported, setPushManagerSupported] = useState(false)
  
  // Local notification test states
  const [localNotificationTitle, setLocalNotificationTitle] = useState('Local Test Notification')
  const [localNotificationBody, setLocalNotificationBody] = useState('This is a local notification test from Public Gold CRM!')
  const [localNotificationTag, setLocalNotificationTag] = useState('local-test')
  const [isSendingLocal, setIsSendingLocal] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    // Check if declarative web push is supported
    if (typeof window !== 'undefined') {
      const checkSupport = async () => {
        // Set browser capabilities
        setHasServiceWorker('serviceWorker' in navigator)
        setHasPushManager('PushManager' in window)
        setHasNotificationAPI('Notification' in window)
        
        // Check notification permission
        if ('Notification' in window) {
          setNotificationPermission(Notification.permission)
        }
        
        // Check display mode
        const standaloneMode = window.matchMedia('(display-mode: standalone)').matches
        const fullscreenMode = window.matchMedia('(display-mode: fullscreen)').matches
        const windowControlsMode = window.matchMedia('(display-mode: window-controls-overlay)').matches
        
        if (standaloneMode) {
          setDisplayMode('Standalone')
        } else if (fullscreenMode) {
          setDisplayMode('Fullscreen')
        } else if (windowControlsMode) {
          setDisplayMode('Window Controls Overlay')
        } else {
          setDisplayMode('Browser')
        }
        
        // Check if installed as PWA
        const standalone = (window.navigator as any).standalone || standaloneMode
        setIsInstalled(standalone)
        
        // Check iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        setIsIOS(isIOSDevice)
        setUserAgent(navigator.userAgent)
        
        // Check VAPID key validity
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        setVapidKeyValid(vapidKey ? vapidKey.length >= 80 : false)
        
        // Check for declarative web push support
        // This is typically only available on installed PWAs on iOS Safari 18.4+
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          try {
            const registration = await navigator.serviceWorker.ready
            const pushManager = registration.pushManager
            
            if (pushManager) {
              setIsSupported(true)
              // Get existing subscription
              const existingSubscription = await pushManager.getSubscription()
              setSubscription(existingSubscription)
            }
            
            // Check for declarative web push (iOS 18.4+)
            const isIOS184Plus = isIOSDevice && 
              /Version\/(\d+)\.(\d+)/.test(navigator.userAgent) &&
              (() => {
                const match = navigator.userAgent.match(/Version\/(\d+)\.(\d+)/)
                if (match) {
                  const major = parseInt(match[1])
                  const minor = parseInt(match[2])
                  return major > 18 || (major === 18 && minor >= 4)
                }
                return false
              })()
            
            setSupportsDeclarativePush(standalone && isIOS184Plus && 'PushManager' in window)
            
            // Check PushManager permission state
            if ('PushManager' in window && 'serviceWorker' in navigator) {
              try {
                const registration = await navigator.serviceWorker.ready
                if (registration.pushManager) {
                  setPushManagerSupported(true)
                  const permissionState = await registration.pushManager.permissionState({
                    userVisibleOnly: true
                  })
                  setPushManagerPermissionState(permissionState)
                }
              } catch (error) {
                console.error('Error checking PushManager permission state:', error)
              }
            }
          } catch (error) {
            console.error('Error checking push support:', error)
          }
        }
      }
      
      checkSupport()
    }
  }, [])

  const handleSubscribe = async () => {
    setLoading(true)
    setMessage(null)

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications are not supported in this browser.')
      }

      const registration = await navigator.serviceWorker.ready
      const pushManager = registration.pushManager

      if (!pushManager) {
        throw new Error('PushManager is not available.')
      }

      // Use PushManager.getSubscription() to check for existing subscription
      let currentSubscription = await pushManager.getSubscription()

      if (currentSubscription) {
        setMessage({
          type: 'success',
          text: 'You are already subscribed to push notifications via PushManager.',
        })
        setSubscription(currentSubscription)
        
        // Update permission state
        try {
          const permissionState = await pushManager.permissionState({
            userVisibleOnly: true
          })
          setPushManagerPermissionState(permissionState)
        } catch (error) {
          console.error('Error checking permission state:', error)
        }
        
        setLoading(false)
        return
      }

      // For testing, we'll use a dummy VAPID public key
      // In production, you should generate a real VAPID key pair
      const applicationServerKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!applicationServerKey) {
        throw new Error('VAPID public key is not set.')
      }

      const applicationServerKeyUint8Array = base64UrlToUint8Array(applicationServerKey)

      // Request notification permission first
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      
      if (permission !== 'granted') {
        throw new Error('Notification permission was denied.')
      }

      // Use PushManager to subscribe to push notifications
      // PushManager.subscribe() creates a push subscription
      currentSubscription = await pushManager.subscribe({
        userVisibleOnly: true, // Required: ensures all push messages result in visible notifications
        applicationServerKey: applicationServerKeyUint8Array.buffer as ArrayBuffer, // VAPID public key
      })

      setSubscription(currentSubscription)
      setNotificationPermission('granted')
      
      // Update PushManager permission state after successful subscription
      try {
        const permissionState = await pushManager.permissionState({
          userVisibleOnly: true
        })
        setPushManagerPermissionState(permissionState)
      } catch (error) {
        console.error('Error updating permission state:', error)
      }
      
      setMessage({
        type: 'success',
        text: 'Successfully subscribed to push notifications via PushManager!',
      })
      
      // Save subscription to backend
      try {
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: currentSubscription.toJSON(),
            userAgent: navigator.userAgent,
            deviceInfo: {
              isIOS,
              isStandalone: isInstalled,
              userAgent: navigator.userAgent,
              displayMode,
            },
          }),
        })
      } catch (error) {
        console.error('Error saving subscription:', error)
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || 'Failed to subscribe to push notifications.',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUnsubscribe = async () => {
    setLoading(true)
    setMessage(null)

    try {
      if (subscription) {
        // Remove from backend
        try {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscription: subscription.toJSON(),
            }),
          })
        } catch (error) {
          console.error('Error removing subscription from backend:', error)
        }
        
        // Use PushSubscription.unsubscribe() to remove the subscription
        const unsubscribed = await subscription.unsubscribe()
        
        if (unsubscribed) {
          setSubscription(null)
          
          // Update PushManager permission state after unsubscribe
          try {
            if ('serviceWorker' in navigator) {
              const registration = await navigator.serviceWorker.ready
              if (registration.pushManager) {
                const permissionState = await registration.pushManager.permissionState({
                  userVisibleOnly: true
                })
                setPushManagerPermissionState(permissionState)
              }
            }
          } catch (error) {
            console.error('Error updating permission state:', error)
          }
          
          setMessage({
            type: 'success',
            text: 'Successfully unsubscribed from push notifications via PushManager.',
          })
        } else {
          throw new Error('Failed to unsubscribe')
        }
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || 'Failed to unsubscribe from push notifications.',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTestNotification = async () => {
    if (!subscription) {
      setMessage({
        type: 'error',
        text: 'Please subscribe to push notifications first.',
      })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      // Send push notification through backend API
      const response = await fetch('/api/push/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          title: 'Test Notification',
          message: 'This is a test push notification from Public Gold CRM!',
          delay: 0,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send notification')
      }

      setMessage({
        type: 'success',
        text: 'Test push notification sent! Check your notifications.',
      })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || 'Failed to send test notification.',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleLocalNotification = async () => {
    setIsSendingLocal(true)
    setMessage(null)

    try {
      // Check if Notification API is supported
      if (!('Notification' in window)) {
        throw new Error('Notifications are not supported in this browser.')
      }

      // Check permission
      if (Notification.permission === 'denied') {
        throw new Error('Notification permission is denied. Please enable notifications in your browser settings.')
      }

      if (Notification.permission === 'default') {
        // Request permission first
        const permission = await Notification.requestPermission()
        setNotificationPermission(permission)

        if (permission !== 'granted') {
          throw new Error('Notification permission was denied.')
        }
      }

      // Show local notification using Notification API
      const notification = new Notification(localNotificationTitle, {
        body: localNotificationBody,
        icon: '/icons/image.png',
        badge: '/icons/image.png',
        tag: localNotificationTag,
        requireInteraction: false,
        silent: false,
        data: {
          url: '/dashboard',
          timestamp: Date.now(),
        },
      })

      // Handle notification click
      notification.onclick = () => {
        window.focus()
        notification.close()
        // Optionally navigate to a specific URL
        router.push('/dashboard')
      }

      setMessage({
        type: 'success',
        text: 'Local notification sent! Check your notifications.',
      })

      // Auto-close notification after 5 seconds (optional)
      setTimeout(() => {
        notification.close()
      }, 5000)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || 'Failed to send local notification.',
      })
    } finally {
      setIsSendingLocal(false)
    }
  }

  // Helper function to convert base64url to Uint8Array
  const base64UrlToUint8Array = (base64Url: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    const buffer = new Uint8Array(rawData.length)
    
    for (let i = 0; i < rawData.length; ++i) {
      buffer[i] = rawData.charCodeAt(i)
    }
    
    return buffer
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600 mx-auto"
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
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900">Declarative Web Push Test</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200 space-y-6">
          {/* Status Overview Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Push Notification Status</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Notification Permission */}
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Notification Permission</span>
                  {notificationPermission === 'granted' ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">Granted</span>
                  ) : notificationPermission === 'denied' ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">Denied</span>
                  ) : notificationPermission === 'default' ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-700 rounded-full">Not Asked</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-700 rounded-full">Unknown</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {notificationPermission === 'granted' 
                    ? '✅ Ready to receive notifications'
                    : notificationPermission === 'denied'
                    ? '❌ Permission blocked - enable in browser settings'
                    : notificationPermission === 'default'
                    ? '⏳ Permission will be requested on subscribe'
                    : 'Checking...'}
                </p>
              </div>

              {/* VAPID Key Status */}
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">VAPID Key</span>
                  {vapidKeyValid ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">Valid</span>
                  ) : vapidKeyValid === false ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">Invalid</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-700 rounded-full">Checking</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {vapidKeyValid 
                    ? '✅ Public key configured correctly'
                    : vapidKeyValid === false
                    ? '❌ Public key missing or invalid'
                    : 'Checking...'}
                </p>
              </div>

              {/* Browser Support */}
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Browser Support</span>
                  {(hasServiceWorker && hasPushManager && hasNotificationAPI) ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">Supported</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">Limited</span>
                  )}
                </div>
                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    {hasServiceWorker ? '✅' : '❌'} Service Worker
                  </div>
                  <div className="flex items-center gap-2">
                    {hasPushManager ? '✅' : '❌'} Push Manager
                  </div>
                  <div className="flex items-center gap-2">
                    {hasNotificationAPI ? '✅' : '❌'} Notification API
                  </div>
                </div>
              </div>

              {/* PWA Installation */}
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">PWA Installed</span>
                  {isInstalled ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">Yes</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-700 rounded-full">No</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {isInstalled 
                    ? `✅ Running in ${displayMode} mode`
                    : '⚠️ Install from dashboard for best experience'}
                </p>
              </div>
            </div>
          </div>

          {/* Local Notification Test - Prominent Section */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">🔔 Test Local Notification API</h3>
            <p className="text-sm text-slate-600 mb-4">
              Test the browser&apos;s Notification API directly. This creates a local notification immediately without needing push subscription or server. Perfect for testing notification appearance and permission handling.
            </p>

            <div className="bg-white rounded-xl p-4 border border-green-100 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">Notification API Status</span>
                {hasNotificationAPI ? (
                  <span className="px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">Available</span>
                ) : (
                  <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">Not Available</span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {hasNotificationAPI 
                  ? '✅ Browser Notification API is supported'
                  : '❌ Notification API not supported in this browser'}
              </p>
            </div>

            {hasNotificationAPI && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="local-title" className="block text-sm font-medium text-slate-700">
                      Notification Title
                    </label>
                    <input
                      id="local-title"
                      type="text"
                      value={localNotificationTitle}
                      onChange={(e) => setLocalNotificationTitle(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      placeholder="Enter notification title"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="local-tag" className="block text-sm font-medium text-slate-700">
                      Notification Tag (optional)
                    </label>
                    <input
                      id="local-tag"
                      type="text"
                      value={localNotificationTag}
                      onChange={(e) => setLocalNotificationTag(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      placeholder="notification-tag"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="local-body" className="block text-sm font-medium text-slate-700">
                    Notification Message
                  </label>
                  <textarea
                    id="local-body"
                    value={localNotificationBody}
                    onChange={(e) => setLocalNotificationBody(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all resize-none"
                    placeholder="Enter notification message"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm text-blue-800 mb-2">
                    <strong>💡 Difference:</strong>
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>• <strong>Local Notification</strong> = Immediate, works only when page is open</li>
                    <li>• <strong>Push Notification</strong> = Works even when app is closed, requires subscription</li>
                  </ul>
                </div>

                <button
                  onClick={handleLocalNotification}
                  disabled={isSendingLocal || !hasNotificationAPI}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40"
                >
                  {isSendingLocal ? (
                    <span className="flex items-center justify-center">
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
                      Sending...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      Send Local Notification
                    </span>
                  )}
                </button>
              </div>
            )}

            {!hasNotificationAPI && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-800">
                  ❌ The Notification API is not supported in this browser. Local notifications cannot be tested.
                </p>
              </div>
            )}
          </div>

          {/* Detailed Status Card */}
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Detailed Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Device Type</span>
                <span className="text-sm font-medium text-slate-900">
                  {isIOS ? '📱 iOS' : '💻 Desktop/Android'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Display Mode</span>
                <span className="text-sm font-medium text-slate-900">{displayMode || 'Browser'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Declarative Web Push</span>
                <span className={`text-sm font-medium ${supportsDeclarativePush ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {supportsDeclarativePush ? '✅ Supported' : '❌ Not Supported'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Subscription Status</span>
                <span className={`text-sm font-medium ${subscription ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {subscription ? '✅ Subscribed' : '❌ Not Subscribed'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">PushManager Permission</span>
                <span className={`text-sm font-medium ${
                  pushManagerPermissionState === 'granted' ? 'text-emerald-600' : 
                  pushManagerPermissionState === 'denied' ? 'text-red-600' : 
                  pushManagerPermissionState === 'prompt' ? 'text-yellow-600' : 
                  'text-slate-400'
                }`}>
                  {pushManagerPermissionState ? pushManagerPermissionState.charAt(0).toUpperCase() + pushManagerPermissionState.slice(1) : 'Checking...'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-600">User Agent</span>
                <span className="text-xs text-slate-500 font-mono truncate max-w-xs">
                  {userAgent || 'Loading...'}
                </span>
              </div>
            </div>
          </div>

          {/* PushManager API Status Card */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">PushManager API Status</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-white rounded-xl p-4 border border-purple-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">PushManager Available</span>
                  {pushManagerSupported ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">Yes</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">No</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {pushManagerSupported 
                    ? '✅ PushManager is available through service worker registration'
                    : '❌ PushManager not available'}
                </p>
              </div>

              <div className="bg-white rounded-xl p-4 border border-purple-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Permission State</span>
                  {pushManagerPermissionState ? (
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      pushManagerPermissionState === 'granted' ? 'bg-emerald-100 text-emerald-700' :
                      pushManagerPermissionState === 'denied' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {pushManagerPermissionState}
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-700 rounded-full">Unknown</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {pushManagerPermissionState === 'granted' 
                    ? '✅ Ready to subscribe'
                    : pushManagerPermissionState === 'denied'
                    ? '❌ Permission denied'
                    : pushManagerPermissionState === 'prompt'
                    ? '⏳ Will prompt on subscribe'
                    : 'Checking...'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-purple-100">
              <h4 className="text-sm font-semibold text-slate-900 mb-2">PushManager Methods Available</h4>
              <ul className="space-y-1 text-xs text-slate-700">
                <li className="flex items-center gap-2">
                  {pushManagerSupported ? '✅' : '❌'} <code className="bg-slate-100 px-1.5 py-0.5 rounded">pushManager.getSubscription()</code>
                </li>
                <li className="flex items-center gap-2">
                  {pushManagerSupported ? '✅' : '❌'} <code className="bg-slate-100 px-1.5 py-0.5 rounded">pushManager.subscribe()</code>
                </li>
                <li className="flex items-center gap-2">
                  {pushManagerSupported ? '✅' : '❌'} <code className="bg-slate-100 px-1.5 py-0.5 rounded">pushManager.permissionState()</code>
                </li>
                <li className="flex items-center gap-2">
                  {subscription ? '✅' : '❌'} <code className="bg-slate-100 px-1.5 py-0.5 rounded">subscription.unsubscribe()</code>
                </li>
              </ul>
            </div>
          </div>

          {/* Feature Support Info */}
          {!isInstalled && (
            <div className="p-4 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-xl">
              <p className="text-sm font-medium">
                ⚠️ Declarative Web Push requires the app to be installed as a PWA. Please install the app first from the dashboard.
              </p>
            </div>
          )}

          {supportsDeclarativePush && (
            <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl">
              <p className="text-sm font-medium">
                ✅ Declarative Web Push is supported! Notifications will be handled automatically by the OS.
              </p>
            </div>
          )}

          {!isSupported && isInstalled && !supportsDeclarativePush && (
            <div className="p-4 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-xl">
              <p className="text-sm font-medium">
                ⚠️ Declarative Web Push is not supported on your device or browser. This feature is available on Safari 18.4+ on iOS for installed PWAs.
              </p>
            </div>
          )}

          {/* Message Alert */}
          {message && (
            <div
              className={`p-4 rounded-xl transition-all duration-300 ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              <p className="text-sm font-medium">{message.text}</p>
            </div>
          )}

          {/* Declarative Web Push Info Section */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">About Declarative Web Push</h2>
            
            <div className="space-y-4 text-slate-700">
              <p className="text-slate-700">
                Declarative Web Push is a new feature that allows push notifications to be handled automatically by the operating system without requiring JavaScript execution in a service worker. It&apos;s currently supported in:
              </p>
              
              <div className="bg-white rounded-xl p-4 border border-indigo-100">
                <ul className="space-y-2 list-disc list-inside text-sm">
                  <li><strong>Safari 18.4+ on iOS</strong> (for web apps added to Home Screen)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">How Declarative Web Push Works</h3>
                <p className="text-sm text-slate-600 mb-3">
                  According to <a href="https://webkit.org/blog/16535/meet-declarative-web-push/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">WebKit&apos;s implementation</a>, Declarative Web Push:
                </p>
                <ol className="space-y-2 list-decimal list-inside text-sm text-slate-700">
                  <li><strong>Uses standardized JSON format</strong> - Push messages use a standardized JSON structure that the browser/OS can interpret</li>
                  <li><strong>OS handles notifications</strong> - The operating system displays notifications automatically, even when the app isn&apos;t running</li>
                  <li><strong>Subscription still requires service worker</strong> - While you still subscribe through PushManager (which requires service worker registration), the push event handling is automatic</li>
                  <li><strong>Works when PWA is installed</strong> - Must be installed on Home Screen (standalone mode)</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Push Message Format</h3>
                <p className="text-sm text-slate-600 mb-3">
                  For declarative web push, send push messages in this JSON format:
                </p>
                <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs text-slate-100 font-mono">
{`{
  "title": "Notification Title",
  "body": "Notification message",
  "icon": "https://yoursite.com/icon.png",
  "badge": "https://yoursite.com/badge.png",
  "tag": "notification-tag",
  "data": {
    "url": "https://yoursite.com/action"
  }
}`}
                  </pre>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Benefits</h3>
                <ul className="space-y-2 list-disc list-inside text-sm text-slate-700">
                  <li>Notifications work even when the app is completely closed</li>
                  <li>No service worker push event handler required</li>
                  <li>More reliable - OS handles display automatically</li>
                  <li>Better battery efficiency - less JavaScript execution</li>
                  <li>Works offline and in background</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-semibold text-blue-900 mb-2">📌 Important Notes</h4>
                <ul className="space-y-1 text-sm text-blue-800 list-disc list-inside">
                  <li>You still need to subscribe through PushManager (requires service worker)</li>
                  <li>Subscription uses the same VAPID keys as standard web push</li>
                  <li>The difference is in how push messages are handled (automatic vs. manual)</li>
                  <li>Currently only available on iOS Safari 18.4+ when PWA is installed</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Subscription Status */}
          <div className="pt-6 border-t border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Subscription Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Subscribed:</span>
                <span className={`font-semibold ${subscription ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {subscription ? 'Yes' : 'No'}
                </span>
              </div>
              {subscription && (
                <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-500 font-mono break-all">
                    {JSON.stringify(subscription.toJSON(), null, 2)}
                  </p>
                </div>
              )}
            </div>
          </div>


          {/* Actions */}
          <div className="pt-6 border-t border-slate-200 space-y-3">
            {!subscription ? (
              <button
                onClick={handleSubscribe}
                disabled={loading || !isSupported}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
                    Subscribing...
                  </span>
                ) : (
                  'Subscribe to Push Notifications'
                )}
              </button>
            ) : (
              <>
                <button
                  onClick={handleTestNotification}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40"
                >
                  Send Test Notification
                </button>
                <button
                  onClick={handleUnsubscribe}
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/40"
                >
                  {loading ? 'Unsubscribing...' : 'Unsubscribe'}
                </button>
              </>
            )}
          </div>

          {/* Service Worker Info */}
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Service Worker</h3>
            <p className="text-slate-600 mb-4 text-sm">
              The service worker (<code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">public/sw.js</code>) provides:
            </p>
            <ul className="space-y-2 list-disc list-inside text-sm text-slate-700">
              <li>Basic caching for offline support</li>
              <li>Push notification handling (for standard web push)</li>
              <li>Cache management</li>
            </ul>
            <p className="text-xs text-slate-500 mt-3">
              <strong>Note:</strong> For Declarative Web Push, the service worker is still required for subscription, but push event handling is automatic.
            </p>
          </div>

          {/* Test Page Features */}
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">This Test Page Includes</h3>
            <ul className="space-y-2 list-disc list-inside text-sm text-slate-700">
              <li>Installation status detection</li>
              <li>Declarative Web Push detection (iOS 18.4+)</li>
              <li>Push notification subscription</li>
              <li>Push notification testing (via API)</li>
              <li>Local Notification API testing</li>
              <li>Browser capability detection</li>
              <li>Real-time status monitoring</li>
              <li>VAPID key validation</li>
              <li>PushManager API status</li>
            </ul>
          </div>

          {/* Documentation Links */}
          <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Documentation & Resources</h3>
            <div className="space-y-2 text-sm">
              <div>
                <a
                  href="https://whatpwacando.today/declarative-web-push"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline font-medium"
                >
                  Declarative Web Push Documentation →
                </a>
                <p className="text-xs text-slate-500 ml-0 mt-1">Learn more about declarative web push features</p>
              </div>
              <div>
                <a
                  href="https://webkit.org/blog/16535/meet-declarative-web-push/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline font-medium"
                >
                  WebKit Implementation Details →
                </a>
                <p className="text-xs text-slate-500 ml-0 mt-1">Technical details from WebKit team</p>
              </div>
              <div>
                <a
                  href="https://whatpwacando.today/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline font-medium"
                >
                  What PWA Can Do Today →
                </a>
                <p className="text-xs text-slate-500 ml-0 mt-1">Comprehensive PWA feature documentation</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

