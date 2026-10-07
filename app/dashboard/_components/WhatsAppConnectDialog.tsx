'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatedSheetDialog } from '@/app/components/AnimatedSheetDialog'

type Mode = 'create' | 'reconnect'
type ReconnectTab = 'scan' | 'code'

const WA_CONNECT_HIDE_STORAGE_PREFIX = 'wa-connect-dialog-hide'

function waConnectDialogHideKey(userId: string) {
  return `${WA_CONNECT_HIDE_STORAGE_PREFIX}:${userId}`
}

export function isWaConnectDialogHidden(userId: string): boolean {
  if (!userId || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(waConnectDialogHideKey(userId)) === '1'
  } catch {
    return false
  }
}

export function setWaConnectDialogHidden(userId: string, hidden: boolean) {
  if (!userId || typeof window === 'undefined') return
  try {
    const key = waConnectDialogHideKey(userId)
    if (hidden) window.localStorage.setItem(key, '1')
    else window.localStorage.removeItem(key)
  } catch {
    // ignore quota / private mode
  }
}

type Props = {
  open: boolean
  onClose: (opts?: { dontShowAgain?: boolean }) => void
  userId: string
  hasExistingSession: boolean
  existingSessionName?: string | null
  platformReadOnly: boolean
  defaultPhone?: string
  onSessionCreated?: (sessionName: string) => void
  onConnected?: () => void
}

export function WhatsAppConnectDialog({
  open,
  onClose,
  userId,
  hasExistingSession,
  existingSessionName = null,
  platformReadOnly,
  defaultPhone = '',
  onSessionCreated,
  onConnected,
}: Props) {
  const [mode, setMode] = useState<Mode>(hasExistingSession ? 'reconnect' : 'create')
  const [reconnectTab, setReconnectTab] = useState<ReconnectTab>('scan')
  const [sessionName, setSessionName] = useState(defaultPhone)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [whatsappProvider, setWhatsappProvider] = useState<'waha' | 'wasender'>('waha')

  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loadingQr, setLoadingQr] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [alreadyConnected, setAlreadyConnected] = useState(false)
  const [activeSessionName, setActiveSessionName] = useState<string | null>(null)

  const [pairingPhone, setPairingPhone] = useState('')
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [loadingPairingCode, setLoadingPairingCode] = useState(false)
  const [pairingCodeCopied, setPairingCodeCopied] = useState(false)

  const handleClose = (opts?: { dontShowAgain?: boolean }) => {
    const hide = opts?.dontShowAgain ?? dontShowAgain
    if (hide) {
      setWaConnectDialogHidden(userId, true)
    }
    onClose({ dontShowAgain: hide })
  }

  const handleDontShowAgainChange = (checked: boolean) => {
    setDontShowAgain(checked)
    if (checked) {
      handleClose({ dontShowAgain: true })
    }
  }

  const fetchQr = useCallback(async (name: string, force = false) => {
    setLoadingQr(true)
    setQrError(null)
    setAlreadyConnected(false)
    try {
      const forceQs = force ? '&force=1' : ''
      const res = await fetch(
        `/api/waha/sessions/${encodeURIComponent(name)}/qr?format=image${forceQs}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to get QR')
      if (data.alreadyConnected) {
        setAlreadyConnected(true)
        setQrCode(null)
        onConnected?.()
        return
      }
      if (data.qrcode) {
        setQrCode(data.qrcode)
      } else {
        setQrError('No QR code returned. Tap refresh to try again.')
      }
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'Failed to get QR')
      setQrCode(null)
    } finally {
      setLoadingQr(false)
    }
  }, [onConnected])

  useEffect(() => {
    if (!open) return
    const nextMode: Mode = hasExistingSession ? 'reconnect' : 'create'
    const phone = defaultPhone.replace(/\D/g, '') || existingSessionName?.replace(/\D/g, '') || ''
    setMode(nextMode)
    setReconnectTab('scan')
    setSessionName(phone)
    setPairingPhone(phone)
    setPairingCode(null)
    setPairingCodeCopied(false)
    setError(null)
    setCreating(false)
    setDontShowAgain(false)
    setQrCode(null)
    setQrError(null)
    setAlreadyConnected(false)

    const reconnectName = existingSessionName?.trim() || null
    setActiveSessionName(reconnectName)

    void (async () => {
      try {
        const res = await fetch('/api/whatsapp/provider')
        const data = await res.json()
        if (res.ok && (data.provider === 'wasender' || data.provider === 'waha')) {
          setWhatsappProvider(data.provider)
        }
      } catch {
        // keep default
      }
    })()

    if (nextMode === 'reconnect' && reconnectName && !platformReadOnly) {
      void fetchQr(reconnectName)
    }
  }, [open, hasExistingSession, existingSessionName, defaultPhone, platformReadOnly, fetchQr])

  useEffect(() => {
    if (!open || !hasExistingSession) return
    setMode('reconnect')
    if (!activeSessionName && existingSessionName) {
      setActiveSessionName(existingSessionName)
    }
  }, [open, hasExistingSession, existingSessionName, activeSessionName])

  useEffect(() => {
    if (
      !open ||
      mode !== 'reconnect' ||
      reconnectTab !== 'scan' ||
      !activeSessionName ||
      alreadyConnected ||
      platformReadOnly
    ) {
      return
    }
    const timer = window.setInterval(() => {
      void fetchQr(activeSessionName)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [open, mode, reconnectTab, activeSessionName, alreadyConnected, platformReadOnly, fetchQr])

  const handleRequestPairingCode = async () => {
    const session = activeSessionName || existingSessionName
    if (!session) {
      setError('No session available. Create a session first.')
      return
    }
    const normalizedPhone = pairingPhone.replace(/\D/g, '')
    if (!normalizedPhone) {
      setError('Enter your phone number without + or dashes.')
      return
    }
    setLoadingPairingCode(true)
    setPairingCode(null)
    setPairingCodeCopied(false)
    setError(null)
    try {
      const res = await fetch(
        `/api/waha/sessions/${encodeURIComponent(session)}/request-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: normalizedPhone }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to request code')
      const code = typeof data.code === 'string' ? data.code : typeof data === 'string' ? data : String(data.code ?? '')
      if (!code) throw new Error('No pairing code returned')
      setPairingCode(code)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request code')
    } finally {
      setLoadingPairingCode(false)
    }
  }

  const handleCopyPairingCode = async () => {
    if (!pairingCode) return
    try {
      await navigator.clipboard.writeText(pairingCode)
      setPairingCodeCopied(true)
      window.setTimeout(() => setPairingCodeCopied(false), 1400)
    } catch {
      setError('Unable to copy pairing code')
    }
  }

  const sessionExists = hasExistingSession || !!activeSessionName

  const switchToReconnect = (name: string) => {
    setActiveSessionName(name)
    setMode('reconnect')
    setReconnectTab('scan')
    setError(null)
    onSessionCreated?.(name)
    void fetchQr(name, true)
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = sessionName.trim().replace(/\D/g, '') || sessionName.trim()
    if (!name) {
      setError('Enter your phone number as the session name (e.g. 60184644305).')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/waha/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          start: true,
          config: {},
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const message = String(data.error || 'Failed to create session')
        if (/already exists/i.test(message)) {
          switchToReconnect(name)
          return
        }
        throw new Error(message)
      }
      const createdName = String(data.name || name)
      switchToReconnect(createdName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setCreating(false)
    }
  }

  const title = platformReadOnly
    ? 'WhatsApp unavailable'
    : alreadyConnected
      ? 'WhatsApp connected'
      : sessionExists || mode === 'reconnect'
        ? 'Reconnect WhatsApp'
        : 'Create WhatsApp session'

  return (
    <AnimatedSheetDialog
      open={open}
      onClose={handleClose}
      title={title}
      maxWidthClassName="max-w-md"
      footer={
        <div className="space-y-3 px-6 py-4">
          {!alreadyConnected ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => handleDontShowAgainChange(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Don&apos;t show me again
            </label>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/ws-integration"
              onClick={() => handleClose()}
              className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
            >
              Open WhatsApp Server
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleClose()}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {alreadyConnected ? 'Done' : 'Not now'}
              </button>
              {platformReadOnly ? (
                <Link
                  href="/dashboard/billing"
                  onClick={() => handleClose()}
                  className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
                >
                  Upgrade to Pro
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4 px-6 py-5">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
          <p className="text-sm text-amber-950">
            WhatsApp is offline. Create a session or reconnect to keep messaging and campaigns running.
          </p>
        </div>

        {platformReadOnly ? (
          <p className="text-sm text-slate-600">
            Your free trial has ended. Upgrade to Pro to create or reconnect a WhatsApp session.
          </p>
        ) : alreadyConnected ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
            WhatsApp is connected{activeSessionName ? ` for ${activeSessionName}` : ''}. You can close this dialog.
          </div>
        ) : (
          <>
            {!sessionExists ? (
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setMode('create')}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    mode === 'create'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Create session
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('reconnect')
                    setReconnectTab('scan')
                    const name = activeSessionName || existingSessionName
                    if (name) void fetchQr(name, true)
                  }}
                  disabled={!sessionExists}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    mode === 'reconnect'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Reconnect
                </button>
              </div>
            ) : null}

            {!sessionExists && mode === 'create' ? (
              <form onSubmit={handleCreateSession} className="space-y-4">
                <p className="text-sm text-slate-600">
                  Use your phone number as the session name. After creating, scan the QR code to link WhatsApp.
                </p>
                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                  </div>
                ) : null}
                <div>
                  <label htmlFor="wa-connect-session-name" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Session name (phone)
                  </label>
                  <input
                    id="wa-connect-session-name"
                    type="tel"
                    inputMode="numeric"
                    placeholder="60184644305"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    autoFocus
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create session'}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                {!sessionExists ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    No session yet. Create a session first, then reconnect.
                  </div>
                ) : (
                  <>
                    {whatsappProvider === 'waha' ? (
                      <div className="flex border-b border-slate-200">
                        <button
                          type="button"
                          onClick={() => {
                            setReconnectTab('scan')
                            setError(null)
                            const name = activeSessionName || existingSessionName
                            if (name) void fetchQr(name, true)
                          }}
                          className={`px-4 py-2.5 text-sm font-medium transition ${
                            reconnectTab === 'scan'
                              ? 'border-b-2 border-emerald-600 text-emerald-600'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Scan QR
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReconnectTab('code')
                            setError(null)
                          }}
                          className={`px-4 py-2.5 text-sm font-medium transition ${
                            reconnectTab === 'code'
                              ? 'border-b-2 border-emerald-600 text-emerald-600'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Using code
                        </button>
                      </div>
                    ) : null}

                    {error ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                      </div>
                    ) : null}

                    {reconnectTab === 'scan' || whatsappProvider === 'wasender' ? (
                      <div className="space-y-4">
                        <p className="text-sm text-slate-600">
                          Scan this QR with WhatsApp on{' '}
                          <span className="font-semibold text-slate-900">
                            {activeSessionName || existingSessionName || 'your phone'}
                          </span>
                          .
                        </p>
                        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5">
                          {loadingQr && !qrCode ? (
                            <div className="flex h-56 w-56 items-center justify-center rounded-xl bg-white text-sm text-slate-500 shadow-sm">
                              Loading QR…
                            </div>
                          ) : qrCode ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`data:image/png;base64,${qrCode.replace(/^data:image\/\w+;base64,/, '')}`}
                              alt="WhatsApp QR code"
                              className="h-56 w-56 rounded-xl bg-white object-contain p-2 shadow-sm"
                            />
                          ) : (
                            <div className="flex h-56 w-56 items-center justify-center rounded-xl bg-white px-4 text-center text-sm text-slate-500 shadow-sm">
                              {qrError || 'QR unavailable'}
                            </div>
                          )}
                          {qrError ? (
                            <p className="text-center text-sm text-red-700">{qrError}</p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              const name = activeSessionName || existingSessionName
                              if (name) void fetchQr(name, true)
                            }}
                            disabled={loadingQr || !(activeSessionName || existingSessionName)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                          >
                            {loadingQr ? 'Refreshing…' : 'Refresh QR'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-slate-600">
                          Request a pairing code and enter it in WhatsApp: Linked Devices → Link with phone number.
                        </p>
                        <div>
                          <label
                            htmlFor="wa-connect-pairing-phone"
                            className="mb-1.5 block text-sm font-medium text-slate-700"
                          >
                            Your phone number
                          </label>
                          <input
                            id="wa-connect-pairing-phone"
                            type="tel"
                            inputMode="numeric"
                            placeholder="60123456789 (no +, no dashes)"
                            value={pairingPhone}
                            onChange={(e) => setPairingPhone(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRequestPairingCode()}
                          disabled={loadingPairingCode || !pairingPhone.trim()}
                          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {loadingPairingCode ? 'Requesting…' : 'Show code'}
                        </button>
                        {pairingCode ? (
                          <div className="rounded-xl bg-slate-100 px-4 py-4">
                            <p className="mb-1 text-sm text-slate-600">Enter this code in WhatsApp:</p>
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-mono text-2xl font-bold tracking-wider text-slate-900">
                                {pairingCode}
                              </p>
                              <button
                                type="button"
                                onClick={() => void handleCopyPairingCode()}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                              >
                                {pairingCodeCopied ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AnimatedSheetDialog>
  )
}
