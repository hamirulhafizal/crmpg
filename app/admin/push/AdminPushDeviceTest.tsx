'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getNotificationPermissionState,
  permissionBadgeClass,
  permissionLabel,
  requestNotificationPermission,
  showLocalTestNotification,
  type NotificationPermissionState,
} from '@/app/lib/push/local-notification'
import {
  buildDeviceInfoForSubscription,
  getExistingPushSubscription,
  subscribeToDeclarativePush,
  unsubscribeFromPush,
} from '@/app/lib/push/subscribe-client'
import { pushDebug, pushDebugError } from '@/app/lib/push/debug'
import {
  assertLocalNotificationReady,
  assertPushTestReady,
  assertSubscribeReady,
  runClientPushPreflight,
  type PreflightCheck,
  type ServerPushStatus,
} from '@/app/lib/push/preflight'

const DELAY_PRESETS = [
  { label: 'Instant', seconds: 0 },
  { label: '10 sec', seconds: 10 },
  { label: '30 sec', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '2 min', seconds: 120 },
] as const

type DeviceTestProps = {
  title: string
  message: string
  onSubscriptionsChanged?: () => void
}

function statusIcon(status: PreflightCheck['status']) {
  switch (status) {
    case 'pass':
      return '✓'
    case 'warn':
      return '!'
    case 'fail':
      return '✗'
  }
}

function statusClass(status: PreflightCheck['status']) {
  switch (status) {
    case 'pass':
      return 'text-emerald-700 bg-emerald-50 ring-emerald-200'
    case 'warn':
      return 'text-amber-800 bg-amber-50 ring-amber-200'
    case 'fail':
      return 'text-red-700 bg-red-50 ring-red-200'
  }
}

export function AdminPushDeviceTest({ title, message, onSubscriptionsChanged }: DeviceTestProps) {
  const [permission, setPermission] = useState<NotificationPermissionState>('default')
  const [hasSubscription, setHasSubscription] = useState(false)
  const [pushMethod, setPushMethod] = useState<string | null>(null)
  const [localTesting, setLocalTesting] = useState(false)
  const [pushTesting, setPushTesting] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [pushDelaySeconds, setPushDelaySeconds] = useState(30)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [preflightChecks, setPreflightChecks] = useState<PreflightCheck[]>([])
  const [serverStatus, setServerStatus] = useState<ServerPushStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [deviceMessage, setDeviceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )

  const refreshAllStatus = useCallback(async () => {
    setRefreshing(true)
    pushDebug('AdminPushDeviceTest: refreshing all status')

    setPermission(getNotificationPermissionState())
    const sub = await getExistingPushSubscription()
    setHasSubscription(Boolean(sub))
    if (sub) {
      pushDebug('AdminPushDeviceTest: subscription found', {
        endpoint: `${sub.endpoint.slice(0, 48)}…`,
      })
    }

    const clientResult = await runClientPushPreflight()
    setPreflightChecks(clientResult.checks)

    try {
      const res = await fetch('/api/admin/push/status')
      if (res.ok) {
        const data = (await res.json()) as ServerPushStatus
        setServerStatus(data)
        pushDebug('AdminPushDeviceTest: server status', data)
      } else {
        pushDebugError('AdminPushDeviceTest: server status failed', res.status)
      }
    } catch (error) {
      pushDebugError('AdminPushDeviceTest: server status fetch error', error)
    }

    setRefreshing(false)
  }, [])

  useEffect(() => {
    void refreshAllStatus()
  }, [refreshAllStatus])

  useEffect(() => {
    if (countdown === null || countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((c) => (c !== null && c > 0 ? c - 1 : null)), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  const showBlockers = (blockers: string[]) => {
    setDeviceMessage({
      type: 'error',
      text: blockers.length === 1 ? blockers[0] : `Blocked: ${blockers.join(' · ')}`,
    })
  }

  const handleRequestPermission = async () => {
    setDeviceMessage(null)
    pushDebug('AdminPushDeviceTest: request permission')
    try {
      const next = await requestNotificationPermission()
      setPermission(next)
      await refreshAllStatus()
      if (next === 'granted') {
        setDeviceMessage({ type: 'success', text: 'Notifications enabled on this device.' })
      } else if (next === 'denied') {
        setDeviceMessage({ type: 'error', text: 'Permission blocked. Unblock notifications in browser settings.' })
      }
    } catch (e) {
      setDeviceMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to request permission.' })
    }
  }

  const handleLocalTest = async () => {
    setLocalTesting(true)
    setDeviceMessage(null)
    pushDebug('AdminPushDeviceTest: local test starting')

    const preflight = await assertLocalNotificationReady()
    setPreflightChecks(preflight.checks)
    if (!preflight.ok) {
      showBlockers(preflight.blockers)
      setLocalTesting(false)
      return
    }

    if (permission !== 'granted') {
      const next = await requestNotificationPermission()
      setPermission(next)
      if (next !== 'granted') {
        showBlockers(['Notification permission is required for local test'])
        setLocalTesting(false)
        return
      }
    }

    try {
      const result = await showLocalTestNotification({
        title: title.trim() || 'PG CRM local test',
        body: message.trim() || 'If you see this, notifications are enabled on this device.',
      })
      pushDebug('AdminPushDeviceTest: local test result', result)
      setPermission(getNotificationPermissionState())
      await refreshAllStatus()

      const parts = [
        result.inAppPreviewShown
          ? 'In-app preview shown at top of screen.'
          : 'Local notification triggered.',
        result.method === 'serviceWorker'
          ? 'System notification sent via service worker.'
          : result.method === 'notification-constructor'
            ? 'System notification sent via Notification API.'
            : 'System notification could not be shown — see in-app preview only.',
      ]
      if (result.hint) parts.push(result.hint)

      setDeviceMessage({ type: 'success', text: parts.join(' ') })
    } catch (e) {
      pushDebugError('AdminPushDeviceTest: local test failed', e)
      setDeviceMessage({ type: 'error', text: e instanceof Error ? e.message : 'Local notification failed.' })
    } finally {
      setLocalTesting(false)
    }
  }

  const handleSubscribeThisDevice = async () => {
    setSubscribing(true)
    setDeviceMessage(null)
    pushDebug('AdminPushDeviceTest: subscribe starting')

    const preflight = await assertSubscribeReady()
    setPreflightChecks(preflight.checks)
    if (!preflight.ok) {
      showBlockers(preflight.blockers)
      setSubscribing(false)
      return
    }

    if (serverStatus && !serverStatus.vapidConfigured) {
      showBlockers(['Server VAPID keys not configured — check VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY'])
      setSubscribing(false)
      return
    }

    try {
      const { subscription, method } = await subscribeToDeclarativePush()
      setPushMethod(method)
      pushDebug('AdminPushDeviceTest: saving subscription to server', { method })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
          deviceInfo: buildDeviceInfoForSubscription(method),
        }),
      })

      const data = await res.json().catch(() => ({}))
      pushDebug('AdminPushDeviceTest: subscribe API response', { ok: res.ok, data })

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save subscription.')
      }

      setHasSubscription(true)
      setPermission(getNotificationPermissionState())
      await refreshAllStatus()
      setDeviceMessage({ type: 'success', text: 'This device is subscribed for push (declarative).' })
    } catch (e) {
      pushDebugError('AdminPushDeviceTest: subscribe failed', e)
      setDeviceMessage({ type: 'error', text: e instanceof Error ? e.message : 'Subscribe failed.' })
    } finally {
      setSubscribing(false)
    }
  }

  const handleResetThisDevice = async () => {
    setResetting(true)
    setDeviceMessage(null)
    pushDebug('AdminPushDeviceTest: reset this device starting')

    try {
      const subscription = await getExistingPushSubscription()

      if (subscription) {
        pushDebug('AdminPushDeviceTest: unsubscribing browser push subscription')
        await subscription.unsubscribe()

        const res = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        })
        const data = await res.json().catch(() => ({}))
        pushDebug('AdminPushDeviceTest: delete subscription API', { ok: res.ok, data })
      } else {
        await unsubscribeFromPush()
      }

      setHasSubscription(false)
      setPushMethod(null)
      await refreshAllStatus()
      onSubscriptionsChanged?.()
      setDeviceMessage({
        type: 'success',
        text: 'Device reset — browser subscription removed and database record deleted. You can subscribe again.',
      })
    } catch (e) {
      pushDebugError('AdminPushDeviceTest: reset failed', e)
      setDeviceMessage({ type: 'error', text: e instanceof Error ? e.message : 'Reset failed.' })
    } finally {
      setResetting(false)
    }
  }

  const handlePushThisDevice = async () => {
    setPushTesting(true)
    setDeviceMessage(null)
    pushDebug('AdminPushDeviceTest: push test starting')

    const preflight = await assertPushTestReady()
    setPreflightChecks(preflight.checks)
    if (!preflight.ok) {
      showBlockers(preflight.blockers)
      setPushTesting(false)
      return
    }

    if (serverStatus && !serverStatus.vapidConfigured) {
      showBlockers(['Server VAPID keys not configured'])
      setPushTesting(false)
      return
    }

    if (serverStatus && !serverStatus.dbOk) {
      showBlockers([`Database error: ${serverStatus.error || 'push_subscriptions table unavailable'}`])
      setPushTesting(false)
      return
    }

    const delayMs = pushDelaySeconds * 1000

    if (pushDelaySeconds > 0) {
      setCountdown(pushDelaySeconds)
      setDeviceMessage({
        type: 'success',
        text: `Push scheduled in ${pushDelaySeconds}s — close or kill this app now, then wait for the notification.`,
      })
    }

    try {
      const subscription = await getExistingPushSubscription()
      if (!subscription) {
        throw new Error('Subscribe this device first, then send a push test.')
      }

      pushDebug('AdminPushDeviceTest: calling send-test API', {
        delayMs,
        endpoint: `${subscription.endpoint.slice(0, 48)}…`,
      })

      const res = await fetch('/api/push/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          title: title.trim() || 'PG CRM push test',
          message: message.trim() || 'Declarative push test to this device only.',
          delay: delayMs,
        }),
      })

      const data = await res.json().catch(() => ({}))
      pushDebug('AdminPushDeviceTest: send-test API response', { ok: res.ok, data })

      if (data.debug) {
        pushDebug('AdminPushDeviceTest: server debug steps', data.debug)
      }

      if (!res.ok) throw new Error(data.error || 'Push test failed.')

      if (data.scheduled && pushDelaySeconds > 0) {
        setDeviceMessage({
          type: 'success',
          text: data.message || `Push scheduled in ${pushDelaySeconds}s — close or kill the app now.`,
        })
        window.setTimeout(() => {
          setCountdown(null)
          setPushTesting(false)
        }, pushDelaySeconds * 1000)
        return
      }

      setCountdown(null)
      setDeviceMessage({
        type: 'success',
        text: data.message || 'Push sent to this device immediately.',
      })
    } catch (e) {
      pushDebugError('AdminPushDeviceTest: push test failed', e)
      setCountdown(null)
      setPushTesting(false)
      setDeviceMessage({ type: 'error', text: e instanceof Error ? e.message : 'Push test failed.' })
    } finally {
      if (pushDelaySeconds === 0) {
        setPushTesting(false)
      }
    }
  }

  const clientReady = preflightChecks.every((c) => c.status !== 'fail')
  const serverReady = serverStatus?.vapidConfigured && serverStatus?.dbOk

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Test on this device</h2>
          <p className="mt-1 text-sm text-slate-600">
            All checks must pass before push test runs. Open DevTools console for <code className="text-xs">[PG Push]</code> logs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAllStatus()}
          disabled={refreshing}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? 'Checking…' : 'Refresh status'}
        </button>
      </div>

      {/* Preflight checklist */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">Pre-flight checks (device)</p>
        <ul className="mt-3 space-y-2">
          {preflightChecks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset ${statusClass(check.status)}`}
              >
                {statusIcon(check.status)}
              </span>
              <span>
                <span className="font-medium text-slate-800">{check.label}</span>
                <span className="text-slate-500"> — {check.message}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Server status */}
      {serverStatus ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">Server status</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              VAPID configured:{' '}
              <span className={serverStatus.vapidConfigured ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                {serverStatus.vapidConfigured ? 'Yes' : 'No — set env keys'}
              </span>
            </li>
            <li>Site URL: {serverStatus.siteUrl}</li>
            <li>
              Database:{' '}
              <span className={serverStatus.dbOk ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                {serverStatus.dbOk ? `OK (${serverStatus.subscriberCount} subscriber(s))` : serverStatus.error || 'Error'}
              </span>
            </li>
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${permissionBadgeClass(permission)}`}
        >
          Permission: {permissionLabel(permission)}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
            hasSubscription
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-slate-100 text-slate-600 ring-slate-200'
          }`}
        >
          Push subscription: {hasSubscription ? 'Active' : 'None'}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
            clientReady && serverReady
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-amber-50 text-amber-800 ring-amber-200'
          }`}
        >
          Ready for push test: {clientReady && serverReady ? 'Yes' : 'No'}
        </span>
        {pushMethod ? (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
            via {pushMethod}
          </span>
        ) : null}
      </div>

      {deviceMessage ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            deviceMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {deviceMessage.text}
          {countdown !== null && countdown > 0 ? (
            <p className="mt-2 text-base font-semibold tabular-nums">Sending in {countdown}s…</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-700">Background push delay</p>
        <p className="mt-1 text-xs text-slate-500">
          Server waits before sending — close the app after tapping push test.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DELAY_PRESETS.map((preset) => (
            <button
              key={preset.seconds}
              type="button"
              onClick={() => setPushDelaySeconds(preset.seconds)}
              disabled={pushTesting}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                pushDelaySeconds === preset.seconds
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              } disabled:opacity-50`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {permission !== 'granted' ? (
          <button
            type="button"
            onClick={() => void handleRequestPermission()}
            className="rounded-xl border border-violet-300 bg-white px-4 py-2.5 text-sm font-semibold text-violet-800 transition hover:bg-violet-50"
          >
            Enable notifications
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => void handleLocalTest()}
          disabled={localTesting}
          className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          {localTesting ? 'Sending…' : 'Send local notification'}
        </button>

        <button
          type="button"
          onClick={() => void handleSubscribeThisDevice()}
          disabled={subscribing || hasSubscription}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {subscribing ? 'Subscribing…' : hasSubscription ? 'Subscribed' : 'Subscribe this device'}
        </button>

        <button
          type="button"
          onClick={() => void handlePushThisDevice()}
          disabled={pushTesting}
          className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 disabled:opacity-50"
        >
          {pushTesting
            ? pushDelaySeconds > 0
              ? `Waiting ${pushDelaySeconds}s…`
              : 'Sending…'
            : pushDelaySeconds > 0
              ? `Push test in ${pushDelaySeconds}s`
              : 'Push test (this device)'}
        </button>

        {hasSubscription ? (
          <button
            type="button"
            onClick={() => void handleResetThisDevice()}
            disabled={resetting}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
          >
            {resetting ? 'Resetting…' : 'Reset this device'}
          </button>
        ) : null}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        <strong>Local notification</strong> — instant, in-browser test (permission only).{' '}
        <strong>Push test</strong> — server sends declarative web push after the delay you pick.
        Use <strong>Reset this device</strong> after a test to remove the browser subscription and DB record so you can subscribe again.
        If checks fail, fix them first — the console shows each step tagged <code>[PG Push]</code>.
      </p>
    </section>
  )
}
