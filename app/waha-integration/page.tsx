'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface WahaSession {
  name: string
  status: string
  me?: { id?: string; pushName?: string } | null
  engine?: { engine?: string }
}

export default function WahaIntegrationPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [sessions, setSessions] = useState<WahaSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createName, setCreateName] = useState('')
  const [createStart, setCreateStart] = useState(true)
  const [creating, setCreating] = useState(false)

  const [selectedSession, setSelectedSession] = useState('')
  const [sendTo, setSendTo] = useState('')
  const [sendText, setSendText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ success: boolean; message?: string } | null>(null)

  const [qrSession, setQrSession] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loadingQr, setLoadingQr] = useState(false)

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const [loginDialogSession, setLoginDialogSession] = useState<string | null>(null)
  const [loginTab, setLoginTab] = useState<'scan' | 'code'>('scan')
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [loadingPairingCode, setLoadingPairingCode] = useState(false)

  const [screenshotDialogSession, setScreenshotDialogSession] = useState<string | null>(null)
  const [screenshotKey, setScreenshotKey] = useState(0)

  const [testDialogSession, setTestDialogSession] = useState<string | null>(null)
  const [testDialogTo, setTestDialogTo] = useState('')
  const [testDialogText, setTestDialogText] = useState('Hi there!')
  const [testDialogResponse, setTestDialogResponse] = useState<string | null>(null)
  const [loadingTestSend, setLoadingTestSend] = useState(false)

  const [emailFallbackDialogOpen, setEmailFallbackDialogOpen] = useState(false)
  const [emailAppPassword, setEmailAppPassword] = useState('')
  const [emailFallbackTemplate, setEmailFallbackTemplate] = useState('')
  const [showEmailAppPassword, setShowEmailAppPassword] = useState(false)
  const [savingEmailFallback, setSavingEmailFallback] = useState(false)
  const [emailFallbackMessage, setEmailFallbackMessage] = useState<string | null>(null)
  const [sendingTestEmail, setSendingTestEmail] = useState(false)

  const showQrForSession = qrSession && sessions.find((s) => s.name === qrSession)?.status !== 'WORKING'

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) loadSessions()
  }, [user])

  const loadSessions = async () => {
    setLoadingSessions(true)
    setError(null)
    try {
      const res = await fetch('/api/waha/sessions')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load sessions')
      setSessions(data.sessions || [])
      if (data.sessions?.length && !selectedSession) {
        setSelectedSession(data.sessions[0].name)
      }
      if (qrSession && data.sessions?.find((s: WahaSession) => s.name === qrSession)?.status === 'WORKING') {
        setQrSession(null)
        setQrCode(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions')
      setSessions([])
    } finally {
      setLoadingSessions(false)
    }
  }

  const handleRefresh = async () => {
    await loadSessions()
    if (qrSession) {
      await fetchQr(qrSession)
    }
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createName.trim()) {
      setError('Enter a session name (e.g. your phone: 60184644305)')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/waha/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          start: createStart,
          config: {},
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create session')
      setCreateName('')
      await loadSessions()
      setSelectedSession(data.name || createName.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session')
    } finally {
      setCreating(false)
    }
  }

  const handleStartStop = async (sessionName: string, start: boolean) => {
    setActionLoading(sessionName)
    setError(null)
    try {
      const path = start ? 'start' : 'stop'
      const res = await fetch(`/api/waha/sessions/${encodeURIComponent(sessionName)}/${path}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${path} session`)
      await loadSessions()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${start ? 'start' : 'stop'}`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteSession = async (sessionName: string) => {
    if (!window.confirm(`Delete session ${sessionName}? This will disconnect it from WAHA.`)) {
      return
    }
    setActionLoading(sessionName)
    setError(null)
    try {
      const res = await fetch(`/api/waha/sessions/${encodeURIComponent(sessionName)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete session')
      }
      await loadSessions()
      if (selectedSession === sessionName) {
        setSelectedSession('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete session')
    } finally {
      setActionLoading(null)
    }
  }

  const fetchQr = async (sessionName: string) => {
    setQrSession(sessionName)
    setLoadingQr(true)
    setQrCode(null)
    setError(null)
    try {
      const res = await fetch(
        `/api/waha/sessions/${encodeURIComponent(sessionName)}/qr?format=image`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to get QR')
      if (data.qrcode) {
        setQrCode(data.qrcode)
      } else {
        setError('No QR code returned')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get QR')
    } finally {
      setLoadingQr(false)
    }
  }

  // const openLoginDialog = (sessionName: string) => {
  //   setLoginDialogSession(sessionName)
  //   setLoginTab('scan')
  //   setPairingCode(null)
  //   setQrSession(sessionName)
  //   setQrCode(null)
  //   const s = sessions.find((x) => x.name === sessionName)
  //   if (s && (s.status === 'STARTING' || s.status === 'SCAN_QR_CODE')) {
  //     fetchQr(sessionName)
  //   }
  // }

  const closeLoginDialog = () => {
    const was = loginDialogSession
    setLoginDialogSession(null)
    setPairingCode(null)
    if (qrSession === was) {
      setQrSession(null)
      setQrCode(null)
    }
  }

  const handleRequestPairingCode = async () => {
    if (!loginDialogSession) return
    setLoadingPairingCode(true)
    setPairingCode(null)
    setError(null)
    try {
      const res = await fetch(
        `/api/waha/sessions/${encodeURIComponent(loginDialogSession)}/request-code`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to request code')
      setPairingCode(data.code || data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to request code')
    } finally {
      setLoadingPairingCode(false)
    }
  }

  const openScreenshotDialog = (sessionName: string) => {
    setScreenshotDialogSession(sessionName)
    setScreenshotKey((k) => k + 1)
  }

  const openTestDialog = (sessionName: string) => {
    setTestDialogSession(sessionName)
    setTestDialogTo('')
    setTestDialogText('Hi there!')
    setTestDialogResponse(null)
  }

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testDialogSession || !testDialogTo.trim() || !testDialogText.trim()) return
    setLoadingTestSend(true)
    setTestDialogResponse(null)
    try {
      const res = await fetch('/api/waha/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: testDialogSession,
          to: testDialogTo.trim(),
          text: testDialogText.trim(),
        }),
      })
      const data = await res.json()
      setTestDialogResponse(JSON.stringify(data, null, 2))
    } catch (e) {
      setTestDialogResponse((e instanceof Error ? e.message : 'Error') + '')
    } finally {
      setLoadingTestSend(false)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSession || !sendTo.trim() || !sendText.trim()) {
      setError('Session, target phone, and message are required')
      return
    }
    setSending(true)
    setError(null)
    setSendResult(null)
    try {
      const res = await fetch('/api/waha/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: selectedSession,
          to: sendTo.trim(),
          text: sendText.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSendResult({ success: false, message: data.error || 'Send failed' })
        return
      }
      setSendResult({ success: true, message: 'Message sent successfully' })
      setSendText('')
    } catch (e) {
      setSendResult({
        success: false,
        message: e instanceof Error ? e.message : 'Failed to send',
      })
    } finally {
      setSending(false)
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'WORKING':
        return 'text-emerald-600 bg-emerald-50'
      case 'STARTING':
      case 'SCAN_QR_CODE':
        return 'text-amber-600 bg-amber-50'
      case 'STOPPED':
        return 'text-slate-600 bg-slate-100'
      case 'FAILED':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-slate-600 bg-slate-100'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600 mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Back to dashboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>

              <h1 className="text-xl font-semibold text-slate-900">WAHA WhatsApp Integration</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-500 hover:text-red-700" aria-label="Dismiss">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Create session - only when user has no session (1 user = 1 session) */}
        {sessions.length === 0 && (
          <section className="bg-white rounded-2xl shadow-xl p-6 border border-slate-200/50">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Create session</h2>
            <p className="text-sm text-slate-600 mb-4">
              Use your phone number as session name (e.g. 60184644305). Session will represent this WhatsApp account.
            </p>
            <form onSubmit={handleCreateSession} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="create-name" className="block text-sm font-medium text-slate-700 mb-1">
                  Session name (phone)
                </label>
                <input
                  id="create-name"
                  type="text"
                  placeholder="60184644305"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={createStart}
                  onChange={(e) => setCreateStart(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Start session immediately
              </label>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating…' : 'Create session'}
              </button>
            </form>
          </section>
        )}

        {/* Sessions list & status */}
        <section className="bg-white rounded-2xl shadow-xl p-6 border border-slate-200/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Your sessions & status</h2>
            <div className="flex items-center gap-3">
              {sessions.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    if (savingEmailFallback) return
                    setEmailFallbackMessage(null)
                    setShowEmailAppPassword(false)
                    setEmailFallbackDialogOpen(true)
                    try {
                      const res = await fetch('/api/waha/email-fallback')
                      if (!res.ok) return
                      const data = await res.json()
                      setEmailAppPassword((data.appPassword || '').toString())
                      setEmailFallbackTemplate((data.gmailMessage || '').toString())
                    } catch {
                      // ignore load errors; user can still type a new password and message
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path
                        d="M4 6.5L11.1056 11.0704C11.6633 11.4247 12.3367 11.4247 12.8944 11.0704L20 6.5"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <rect
                        x="4"
                        y="5"
                        width="16"
                        height="14"
                        rx="2.4"
                        strokeWidth="1.6"
                      />
                    </svg>
                  </span>
                  <span>Configure email fallback</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleRefresh()}
                disabled={loadingSessions || loadingQr}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
              >
                {loadingSessions ? 'Refreshing…' : loadingQr ? 'Refreshing QR…' : 'Refresh'}
              </button>
            </div>
          </div>
          {loadingSessions ? (
            <p className="text-slate-500">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="text-slate-500">No sessions yet. Create one above.</p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((s) => (
                <li
                  key={s.name}
                  className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/50"
                >
                  <span className="font-medium text-slate-900">{s.name}</span>
                  <span className={`px-2.5 py-1 rounded-lg text-sm font-medium ${statusColor(s.status)}`}>
                    {s.status}
                  </span>
                  {s.me?.pushName && (
                    <span className="text-sm text-slate-600">({s.me.pushName})</span>
                  )}
                  <div className="flex flex-wrap items-center gap-2 ml-auto">
                    {/* <button
                      type="button"
                      onClick={() => openLoginDialog(s.name)}
                      title="Login (QR or code)"
                      className="p-2 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                      aria-label="Login"
                    >
                      <svg style={{
                        transform: 'rotate(180deg)'
                      }} className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                    </button> */}
                    <button
                      type="button"
                      onClick={() => openScreenshotDialog(s.name)}
                      title="WhatsApp UI screenshot"
                      className="p-2 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                      aria-label="Screenshot"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13v2a2 2 0 01-2 2H7a2 2 0 01-2-2v-2" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => openTestDialog(s.name)}
                      title="Test message"
                      className="p-2 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                      aria-label="Test message"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                    </button>
                    {s.status === 'STOPPED' && (
                      <button
                        type="button"
                        onClick={() => handleStartStop(s.name, true)}
                        disabled={actionLoading === s.name}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                      >
                        {actionLoading === s.name ? '…' : 'Start'}
                      </button>
                    )}
                    {s.status !== 'STOPPED' && s.status !== 'FAILED' && (
                      <button
                        type="button"
                        onClick={() => handleStartStop(s.name, false)}
                        disabled={actionLoading === s.name}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                      >
                        {actionLoading === s.name ? '…' : 'Stop'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(s.name)}
                      disabled={actionLoading === s.name}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                    >
                      {actionLoading === s.name ? '…' : 'Delete'}
                    </button>
                    {/* {(s.status === 'STARTING' || s.status === 'SCAN_QR_CODE') && (
                      <button
                        type="button"
                        onClick={() => fetchQr(s.name)}
                        disabled={loadingQr}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                      >
                        {loadingQr && qrSession === s.name ? 'Loading…' : 'Show QR'}
                      </button>
                    )} */}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* {showQrForSession && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-sm text-slate-600 mb-2">QR for session: {qrSession}</p>
              {loadingQr ? (
                <p className="text-slate-500">Loading QR…</p>
              ) : qrCode ? (
                <div className="inline-block p-4 bg-white rounded-xl border border-slate-200">
                  <img
                    src={`data:image/png;base64,${qrCode}`}
                    alt="WhatsApp QR code"
                    className="w-64 h-64 object-contain"
                  />
                </div>
              ) : null}
            </div>
          )} */}
        </section>



        {/* Login dialog (Scan QR + Enter Code) */}
        {loginDialogSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 top-[-2rem]" onClick={() => closeLoginDialog()}>
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-slate-900">{loginDialogSession}</span>
                  <span className="px-2 py-0.5 rounded text-sm font-medium bg-amber-100 text-amber-800">SCAN_QR_CODE (WAHA)</span>
                </div>
                <button type="button" onClick={() => closeLoginDialog()} className="p-2 text-slate-500 hover:text-slate-700" aria-label="Close">×</button>
              </div>
              <div className="flex border-b border-slate-200">
                <button type="button" onClick={() => setLoginTab('scan')} className={`px-6 py-3 text-sm font-medium ${loginTab === 'scan' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-600'}`}>Scan QR</button>
                <button type="button" onClick={() => setLoginTab('code')} className={`px-6 py-3 text-sm font-medium ${loginTab === 'code' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-600'}`}>Enter Code</button>
              </div>
              <div className="p-6 overflow-auto flex-1">
                {loginTab === 'scan' && (
                  <>
                    <p className="text-sm text-slate-600 mb-4">Scan QR Code to authorize this session.</p>
                    <ul className="text-sm text-slate-600 mb-4 list-disc list-inside space-y-1">
                      <li>Open WhatsApp on your phone</li>
                      <li>Tap More Options ⋮ or Settings ⚙️</li>
                      <li>Tap Linked Devices → Link a device</li>
                      <li>Point your phone at this screen to capture the QR code</li>
                    </ul>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-slate-700">QR</span>
                      <button type="button" onClick={() => fetchQr(loginDialogSession)} disabled={loadingQr} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" aria-label="Refresh QR">↻</button>
                    </div>
                    {loadingQr ? (
                      <p className="text-slate-500">Loading QR…</p>
                    ) : qrSession === loginDialogSession && qrCode ? (
                      <div className="inline-block p-4 bg-white rounded-xl border border-slate-200">
                        <img src={`data:image/png;base64,${qrCode}`} alt="WhatsApp QR" className="w-64 h-64 object-contain" />
                      </div>
                    ) : (
                      <p className="text-slate-500">Click refresh to load QR code.</p>
                    )}
                  </>
                )}
                {loginTab === 'code' && (
                  <>
                    <p className="text-sm text-slate-600 mb-4">Request a pairing code and enter it in WhatsApp: Linked Devices → Link with phone number.</p>
                    <button type="button" onClick={handleRequestPairingCode} disabled={loadingPairingCode} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                      {loadingPairingCode ? 'Requesting…' : 'Request code'}
                    </button>
                    {pairingCode && (
                      <div className="mt-4 p-4 rounded-xl bg-slate-100">
                        <p className="text-sm text-slate-600 mb-1">Enter this code in WhatsApp:</p>
                        <p className="text-2xl font-mono font-bold text-slate-900 tracking-wider">{pairingCode}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Screenshot dialog */}
        {screenshotDialogSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 top-[-2rem]" onClick={() => setScreenshotDialogSession(null)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <span className="font-semibold text-slate-900">Screenshot — {screenshotDialogSession}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setScreenshotKey((k) => k + 1)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Refresh</button>
                  <button type="button" onClick={() => setScreenshotDialogSession(null)} className="p-2 text-slate-500 hover:text-slate-700" aria-label="Close">×</button>
                </div>
              </div>
              <div className="p-4 overflow-auto flex-1 bg-slate-100 flex items-center justify-center min-h-[300px]">
                <img
                  key={screenshotKey}
                  src={`/api/waha/sessions/${encodeURIComponent(screenshotDialogSession)}/screenshot?t=${screenshotKey}`}
                  alt="WhatsApp UI screenshot"
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Test message dialog */}
        {testDialogSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setTestDialogSession(null)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <span className="font-semibold text-slate-900">Test message — {testDialogSession}</span>
                <button type="button" onClick={() => setTestDialogSession(null)} className="p-2 text-slate-500 hover:text-slate-700" aria-label="Close">×</button>
              </div>
              <div className="p-6 overflow-auto">
                <form onSubmit={handleSendTestMessage} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Session</label>
                    <input type="text" value={testDialogSession} readOnly className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">To (chatId / phone)</label>
                    <input type="text" placeholder="60123456789" value={testDialogTo} onChange={(e) => setTestDialogTo(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                    <textarea rows={2} placeholder="Hi there!" value={testDialogText} onChange={(e) => setTestDialogText(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900" />
                  </div>
                  <button type="submit" disabled={loadingTestSend} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
                    {loadingTestSend ? 'Sending…' : 'Send'}
                  </button>
                </form>
                {testDialogResponse !== null && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-slate-700 mb-1">Response</p>
                    <pre className="p-4 rounded-xl bg-slate-100 text-sm text-slate-800 overflow-auto max-h-48">{testDialogResponse}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Email fallback configuration dialog */}
        {emailFallbackDialogOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 top-[-2rem]"
            onClick={() => {
              if (!savingEmailFallback) setEmailFallbackDialogOpen(false)
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Email fallback for WhatsApp failures
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    When WhatsApp delivery fails, messages can fall back to email (Gmail).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!savingEmailFallback) setEmailFallbackDialogOpen(false)
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                      d="M6 18L18 6M6 6l12 12"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-4 text-sm text-slate-700 overflow-auto">
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <p className="text-xs text-slate-600">
                    Use a{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2"
                    >
                      Gmail App Password
                    </a>{' '}
                    for sending emails securely. Make sure your profile email below matches the Gmail
                    account you create the app password for.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-600">
                    Gmail account used for sending
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  />
                  <p className="text-[11px] text-slate-500">
                    Emails will be sent from this Gmail address to your customers&apos; email
                    addresses when WhatsApp delivery fails.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-600">
                    Gmail app password
                  </label>
                  <div className="relative">
                    <input
                      type={showEmailAppPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="16-character app password"
                      value={emailAppPassword}
                      onChange={(e) =>
                        setEmailAppPassword(e.target.value.replace(/\s+/g, ''))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEmailAppPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                      aria-label={showEmailAppPassword ? 'Hide app password' : 'Show app password'}
                    >
                      {showEmailAppPassword ? (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path
                            d="M3 3l18 18M10.584 10.588A3 3 0 0013.41 13.41M9.88 4.252A9.76 9.76 0 0112 4c5.523 0 10 4 10 8-0.413 1.24-1.12 2.38-2.06 3.34m-3.122 2.07A9.76 9.76 0 0112 20c-5.523 0-10-4-10-8 0-1.207.39-2.378 1.09-3.46"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path
                            d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="12" cy="12" r="3" strokeWidth="1.6" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    This password is stored encrypted in your WAHA session record and used only for
                    sending fallback emails.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-slate-600">
                      Email message template (optional)
                    </label>
                    <span className="text-[11px] text-slate-400">
                      You can use variables like{' '}
                      <span className="font-mono text-[11px] text-slate-500">
                        {'{Name}'}, {'{Email}'}, {'{Phone}'}, {'{Location}'}, {'{FirstName}'},{' '}
                        {'{SenderName}'}
                      </span>
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="If left empty, the WhatsApp message text will be reused for email."
                    value={emailFallbackTemplate}
                    onChange={(e) => setEmailFallbackTemplate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-[11px] text-slate-500">
                    When available, this template can be rendered with customer data using the same
                    variables as your WhatsApp templates.
                  </p>
                </div>

                {emailFallbackMessage && (
                  <p
                    className={`text-xs ${
                      emailFallbackMessage.toLowerCase().includes('failed') ||
                      emailFallbackMessage.toLowerCase().includes('error')
                        ? 'text-red-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {emailFallbackMessage}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  disabled={sendingTestEmail || !emailAppPassword.trim()}
                  onClick={async () => {
                    if (!emailAppPassword.trim()) return
                    setSendingTestEmail(true)
                    setEmailFallbackMessage(null)
                    try {
                      const res = await fetch('/api/waha/email-fallback/test', {
                        method: 'POST',
                      })
                      const data = await res.json().catch(() => ({}))
                      if (!res.ok) {
                        throw new Error(data.error || 'Failed to send test email')
                      }
                      setEmailFallbackMessage('Test email sent to your Gmail inbox.')
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : 'Failed to send test email'
                      setEmailFallbackMessage(msg)
                    } finally {
                      setSendingTestEmail(false)
                    }
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                >
                  {sendingTestEmail ? 'Sending test…' : 'Send test email to myself'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!savingEmailFallback) setEmailFallbackDialogOpen(false)
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingEmailFallback || !emailAppPassword.trim()}
                  onClick={async () => {
                    if (!emailAppPassword.trim()) return
                    setSavingEmailFallback(true)
                    setEmailFallbackMessage(null)
                    try {
                      const res = await fetch('/api/waha/email-fallback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          appPassword: emailAppPassword.trim(),
                          gmailMessage: emailFallbackTemplate,
                        }),
                      })
                      const data = await res.json()
                      if (!res.ok) {
                        throw new Error(data.error || 'Failed to save settings')
                      }
                      setEmailFallbackMessage('Email fallback settings saved successfully.')
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : 'Failed to save settings'
                      setEmailFallbackMessage(msg)
                    } finally {
                      setSavingEmailFallback(false)
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600"
                >
                  {savingEmailFallback ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
