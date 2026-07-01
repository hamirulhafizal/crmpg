'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  CheckCircle,
  Loader2,
  Monitor,
  Send,
  Smartphone,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/app/contexts/auth-context'
import { adminFetch } from '@/app/lib/admin-api-client'
import { getDisplayMode, isIOSDevice, isPWAInstalled } from '@/app/lib/push/client-utils'
import { pushDebug, pushDebugError } from '@/app/lib/push/debug'
import {
  buildDeviceInfoForSubscription,
  getExistingPushSubscription,
  subscribeToDeclarativePush,
} from '@/app/lib/push/subscribe-client'

function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode
  variant?: 'default' | 'secondary' | 'destructive'
}) {
  const cls =
    variant === 'destructive'
      ? 'bg-red-600 text-white'
      : variant === 'secondary'
        ? 'bg-slate-200 text-slate-700'
        : 'bg-slate-900 text-white'
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-slate-100 px-6 py-4">{children}</div>
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">{children}</h2>
}

function CardDescription({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm text-slate-600">{children}</p>
}

function CardContent({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 px-6 py-5">{children}</div>
}

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
      {children}
    </label>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${props.className ?? ''}`}
    />
  )
}

function Btn({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' }) {
  const base =
    'inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50'
  const cls =
    variant === 'outline'
      ? `${base} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`
      : `${base} bg-slate-900 text-white hover:bg-slate-800`
  return (
    <button type="button" className={cls} {...props}>
      {children}
    </button>
  )
}

type BroadcastStats = { sent: number; failed: number; total: number }

export default function TestPWAPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [mounted, setMounted] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [userAgent, setUserAgent] = useState('')
  const [displayMode, setDisplayMode] = useState('Browser')
  const [hasServiceWorker, setHasServiceWorker] = useState(false)
  const [hasPushManager, setHasPushManager] = useState(false)
  const [hasNotification, setHasNotification] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [supportsDeclarativePush, setSupportsDeclarativePush] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(
    null
  )
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null
  )

  const [notificationTitle, setNotificationTitle] = useState('Test Notification')
  const [notificationMessage, setNotificationMessage] = useState(
    'This is a test notification from PG CRM PWA'
  )
  const [notificationDelay, setNotificationDelay] = useState('0')
  const [broadcastTitle, setBroadcastTitle] = useState('Broadcast Notification')
  const [broadcastMessage, setBroadcastMessage] = useState(
    'This is a broadcast message to all devices with the PWA installed'
  )
  const [broadcastStats, setBroadcastStats] = useState<BroadcastStats | null>(null)

  const vapidConfigured = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.length > 20
  )

  const showToast = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, text })
    window.setTimeout(() => setToast(null), 6000)
  }, [])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?next=/test-pwa')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return

    const ios = isIOSDevice()
    setIsIOS(ios)
    setUserAgent(navigator.userAgent)
    setHasServiceWorker('serviceWorker' in navigator)
    setHasPushManager('PushManager' in window)
    setHasNotification('Notification' in window)
    setDisplayMode(getDisplayMode())

    const installed = isPWAInstalled()
    setIsInstalled(installed)
    setIsStandalone(installed)

    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
    }

    const isIOS184Plus =
      ios &&
      (() => {
        const match = navigator.userAgent.match(/Version\/(\d+)\.(\d+)/)
        if (!match) return false
        const major = parseInt(match[1], 10)
        const minor = parseInt(match[2], 10)
        return major > 18 || (major === 18 && minor >= 4)
      })()

    setSupportsDeclarativePush(installed && isIOS184Plus && 'PushManager' in window)
    setPushSupported(
      ('serviceWorker' in navigator && 'PushManager' in window) ||
        ('PushManager' in window && installed) ||
        'Notification' in window
    )

    void getExistingPushSubscription().then(setPushSubscription)
  }, [])

  const subscribeToPush = async () => {
    setIsSubscribing(true)
    pushDebug('test-pwa: subscribe')
    try {
      const { subscription, method } = await subscribeToDeclarativePush()
      setPushSubscription(subscription)
      setNotificationPermission('granted')

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
          deviceInfo: buildDeviceInfoForSubscription(method),
        }),
      })

      showToast(
        'success',
        supportsDeclarativePush
          ? 'Subscribed to Declarative Web Push!'
          : 'Subscribed to push notifications!'
      )
    } catch (error) {
      pushDebugError('test-pwa: subscribe failed', error)
      showToast('error', error instanceof Error ? error.message : 'Subscribe failed')
    } finally {
      setIsSubscribing(false)
    }
  }

  const handleUnsubscribe = async () => {
    if (!pushSubscription) return
    try {
      await pushSubscription.unsubscribe()
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: pushSubscription.toJSON() }),
      })
      setPushSubscription(null)
      showToast('success', 'Unsubscribed from push notifications')
    } catch (error) {
      setPushSubscription(null)
      showToast('info', 'Subscription cleared locally. You may resubscribe.')
    }
  }

  const sendTestNotification = async () => {
    if (!pushSubscription) {
      showToast('error', 'Please subscribe to push notifications first')
      return
    }

    setIsSending(true)
    const delay = Math.min(Math.max(parseInt(notificationDelay, 10) || 0, 0), 300)
    const delayMs = delay * 1000

    try {
      if (delay > 0) {
        showToast('info', `Server waiting ${delay}s — close the app now if testing background delivery`)
      }

      const res = await fetch('/api/push/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: pushSubscription.toJSON(),
          title: notificationTitle,
          message: notificationMessage,
          delay: delayMs,
          navigateUrl: '/test-pwa',
        }),
      })

      const result = await res.json().catch(() => ({}))
      pushDebug('test-pwa: send-test response', result)

      if (!res.ok) {
        if (result.code === 'VAPID_MISMATCH') {
          showToast('error', 'VAPID key mismatch — unsubscribe and subscribe again')
          return
        }
        throw new Error(result.error || 'Failed to send push notification')
      }

      showToast(
        'success',
        delay > 0
          ? `Push sent after ${delay}s delay. Check notifications.`
          : 'Push notification sent! Check your system notifications.'
      )
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Send failed')
    } finally {
      setIsSending(false)
    }
  }

  const sendBroadcastNotification = async () => {
    setIsBroadcasting(true)
    setBroadcastStats(null)
    try {
      const res = await adminFetch('/api/admin/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: broadcastTitle,
          message: broadcastMessage,
          navigateUrl: '/test-pwa',
        }),
      })

      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Admin access required to send broadcast notifications')
        }
        throw new Error(result.error || 'Broadcast failed')
      }

      setBroadcastStats({
        sent: result.sent ?? 0,
        failed: result.failed ?? 0,
        total: result.total ?? 0,
      })

      showToast(
        'success',
        `Broadcast complete: ${result.sent ?? 0} of ${result.total ?? 0} devices received it`
      )
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Broadcast failed')
    } finally {
      setIsBroadcasting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">PWA Test Page</h1>
          <p className="mt-1 text-slate-600">
            Test Progressive Web App features and Declarative Web Push
          </p>
        </div>

        {toast ? (
          <div
            className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : toast.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-blue-200 bg-blue-50 text-blue-900'
            }`}
          >
            {toast.text}
          </div>
        ) : null}

        <div className="grid gap-6">
          {/* Installation Status */}
          <Card>
            <CardHeader>
              <CardTitle>
                {isInstalled ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-slate-400" />
                )}
                Installation Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="PWA Installed" value={isInstalled ? 'Yes' : 'No'} ok={isInstalled} />
              <Row label="Standalone Mode" value={isStandalone ? 'Yes' : 'No'} ok={isStandalone} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Device Type</span>
                <span className="flex items-center gap-2 text-slate-800">
                  {isIOS ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                  {isIOS ? 'iOS' : 'Desktop/Android'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="shrink-0 text-slate-600">User Agent</span>
                <span className="truncate font-mono text-xs text-slate-500">{userAgent || '…'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Declarative Web Push */}
          <Card>
            <CardHeader>
              <CardTitle>
                <Bell className="h-5 w-5" />
                Declarative Web Push
              </CardTitle>
              <CardDescription>
                Test push notifications using Declarative Web Push API and standard Web Push API
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Row label="Push Supported" value={pushSupported ? 'Yes' : 'No'} ok={pushSupported} />

              {mounted && supportsDeclarativePush ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <strong>Declarative Web Push available</strong> — iOS 18.4+ PWA installed. OS
                  handles notifications automatically.
                </div>
              ) : null}

              {pushSupported ? (
                <>
                  <Row label="VAPID Key" value={vapidConfigured ? 'Configured' : 'Not Configured'} ok={vapidConfigured} />
                  <Row
                    label="Notification Permission"
                    value={
                      notificationPermission === 'granted'
                        ? 'Granted'
                        : notificationPermission === 'denied'
                          ? 'Denied'
                          : 'Not Asked'
                    }
                    ok={notificationPermission === 'granted'}
                    bad={notificationPermission === 'denied'}
                  />
                  <Row
                    label="Subscription Status"
                    value={pushSubscription ? 'Subscribed' : 'Not Subscribed'}
                    ok={Boolean(pushSubscription)}
                  />

                  {pushSubscription ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                      <strong>Note:</strong> If VAPID keys changed, unsubscribe and resubscribe.
                      Open DevTools console and filter <code>[PG Push]</code> for debug logs.
                    </div>
                  ) : null}

                  {!pushSubscription ? (
                    <Btn
                      onClick={() => void subscribeToPush()}
                      disabled={
                        isSubscribing ||
                        notificationPermission === 'denied' ||
                        !vapidConfigured
                      }
                    >
                      {isSubscribing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Subscribing…
                        </>
                      ) : (
                        <>
                          <Bell className="h-4 w-4" />
                          Subscribe to Push Notifications
                        </>
                      )}
                    </Btn>
                  ) : (
                    <>
                      <Btn variant="outline" onClick={() => void handleUnsubscribe()}>
                        Unsubscribe
                      </Btn>

                      <div className="space-y-4 border-t border-slate-100 pt-4">
                        <h3 className="font-semibold text-slate-900">Send Test Notification</h3>
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                          <strong>Where to see notifications:</strong>
                          <ul className="mt-2 list-inside list-disc space-y-1 text-blue-700">
                            <li>
                              <strong>Desktop:</strong> Top-right corner (Windows / macOS)
                            </li>
                            <li>
                              <strong>Mobile:</strong> Notification bar at top of screen
                            </li>
                            <li>
                              <strong>Note:</strong> Background the app or lock screen for iOS PWA
                            </li>
                          </ul>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="title">Title</Label>
                          <Input
                            id="title"
                            value={notificationTitle}
                            onChange={(e) => setNotificationTitle(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="message">Message</Label>
                          <Input
                            id="message"
                            value={notificationMessage}
                            onChange={(e) => setNotificationMessage(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="delay">Delay (seconds, max 300)</Label>
                          <Input
                            id="delay"
                            type="number"
                            min={0}
                            max={300}
                            value={notificationDelay}
                            onChange={(e) => setNotificationDelay(e.target.value)}
                          />
                          <p className="text-xs text-slate-500">
                            Set a delay to test when the app is closed. Enter 60 for 1 minute, tap
                            Send, then close the app.
                          </p>
                        </div>
                        <Btn onClick={() => void sendTestNotification()} disabled={isSending}>
                          {isSending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Sending…
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4" />
                              Send Notification
                            </>
                          )}
                        </Btn>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Push not supported in this browser. Declarative Web Push requires iOS 18.4+ PWA
                  installed from Home Screen.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Broadcast */}
          <Card>
            <CardHeader>
              <CardTitle>
                <Bell className="h-5 w-5" />
                Broadcast Notification
              </CardTitle>
              <CardDescription>
                Send a push to all devices subscribed in the database (admin only)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                <strong>How it works:</strong>
                <ul className="mt-2 list-inside list-disc space-y-1 text-blue-700">
                  <li>Subscribed devices are saved to the database</li>
                  <li>Send Broadcast delivers to all active subscriptions</li>
                  <li>Works even when the PWA is closed</li>
                  <li>Perfect for testing with multiple devices</li>
                </ul>
              </div>

              {broadcastStats ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <h4 className="mb-2 font-semibold text-emerald-900">Last Broadcast Results</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-emerald-700">Total:</span>{' '}
                      <strong>{broadcastStats.total}</strong>
                    </div>
                    <div>
                      <span className="text-emerald-700">Sent:</span>{' '}
                      <strong>{broadcastStats.sent}</strong>
                    </div>
                    <div>
                      <span className="text-emerald-700">Failed:</span>{' '}
                      <strong>{broadcastStats.failed}</strong>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="broadcast-title">Broadcast Title</Label>
                <Input
                  id="broadcast-title"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="broadcast-message">Broadcast Message</Label>
                <Input
                  id="broadcast-message"
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                />
              </div>
              <Btn onClick={() => void sendBroadcastNotification()} disabled={isBroadcasting}>
                {isBroadcasting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Broadcasting…
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Send Broadcast Notification
                  </>
                )}
              </Btn>
            </CardContent>
          </Card>

          {/* Browser Capabilities */}
          <Card>
            <CardHeader>
              <CardTitle>Browser Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Row label="Service Worker" value={mounted && hasServiceWorker ? 'Yes' : 'No'} ok={hasServiceWorker} />
                <Row label="Push Manager" value={mounted && hasPushManager ? 'Yes' : 'No'} ok={hasPushManager} />
                <Row label="Notifications" value={mounted && hasNotification ? 'Yes' : 'No'} ok={hasNotification} />
                <Row label="Display Mode" value={mounted ? displayMode : 'Browser'} ok={displayMode === 'Standalone'} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  ok,
  bad,
}: {
  label: string
  value: string
  ok?: boolean
  bad?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <Badge variant={bad ? 'destructive' : ok ? 'default' : 'secondary'}>{value}</Badge>
    </div>
  )
}
