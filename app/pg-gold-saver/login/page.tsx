'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PORTAL_BRAND } from '@/app/lib/customer-portal/brand'

export default function PgGoldSaverLoginPage() {
  const router = useRouter()
  const [pgCode, setPgCode] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [deliveryHint, setDeliveryHint] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'identify' | 'verify'>('identify')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/customer-portal/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pg_code: pgCode.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Could not send verification code')
      }
      setCustomerId(json.customer_id)
      setDeliveryHint(json.message || null)
      setStep('verify')
      setMessage({
        type: 'success',
        text: json.message || 'Verification code sent.',
      })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/customer-portal/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, code: code.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Invalid code')
      }
      router.replace('/pg-gold-saver/profile')
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Verification failed',
      })
    } finally {
      setLoading(false)
    }
  }

  const resetFlow = () => {
    setStep('identify')
    setCustomerId(null)
    setDeliveryHint(null)
    setCode('')
    setMessage(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-slate-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">{PORTAL_BRAND}</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Customer sign in</h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter your PG code. We will send a one-time code to your WhatsApp or email on file.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          {step === 'identify' ? (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div>
                <label htmlFor="pg_code" className="mb-1.5 block text-sm font-medium text-slate-700">
                  PG code
                </label>
                <input
                  id="pg_code"
                  type="text"
                  autoComplete="off"
                  placeholder="e.g. PG12345"
                  value={pgCode}
                  onChange={(e) => setPgCode(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !pgCode.trim()}
                className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send verification code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <p className="text-sm text-slate-600">
                {deliveryHint || 'Enter the 6-digit code we sent you.'}
              </p>
              <div>
                <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Verification code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg tracking-[0.35em] text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Verifying…' : 'Continue'}
              </button>
              <button
                type="button"
                onClick={resetFlow}
                className="w-full text-sm text-slate-500 hover:text-slate-800"
              >
                Use a different PG code
              </button>
            </form>
          )}

          {message && (
            <p
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-red-50 text-red-800'
              }`}
              role="alert"
            >
              {message.text}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Need help? Contact your PG dealer.
        </p>
      </div>
    </div>
  )
}
