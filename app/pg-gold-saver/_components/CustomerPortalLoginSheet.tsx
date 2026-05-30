'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useId, useState } from 'react'
import { PORTAL_BRAND } from '@/app/lib/customer-portal/brand'

type CustomerPortalLoginSheetProps = {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  title?: string
  description?: string
}

export function CustomerPortalLoginSheet({
  open,
  onClose,
  onSuccess,
  title = 'Customer sign in',
  description = 'Enter your PG code. We will send a one-time code to your WhatsApp or email on file.',
}: CustomerPortalLoginSheetProps) {
  const titleId = useId()
  const [pgCode, setPgCode] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [deliveryHint, setDeliveryHint] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'identify' | 'verify'>('identify')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (open) return
    setPgCode('')
    setCustomerId(null)
    setDeliveryHint(null)
    setCode('')
    setStep('identify')
    setLoading(false)
    setMessage(null)
  }, [open])

  const resetFlow = () => {
    setStep('identify')
    setCustomerId(null)
    setDeliveryHint(null)
    setCode('')
    setMessage(null)
  }

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
      onSuccess?.()
      onClose()
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Verification failed',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
          <motion.button
            type="button"
            aria-label="Close sign in"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-[111] flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 360 }}
          >
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />

            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
                    {PORTAL_BRAND}
                  </p>
                  <h2 id={titleId} className="mt-1 text-lg font-semibold text-slate-900">
                    {title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{description}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {step === 'identify' ? (
                <form onSubmit={handleRequestOtp} className="space-y-5">
                  <div>
                    <label htmlFor="portal_pg_code" className="mb-1.5 block text-sm font-medium text-slate-700">
                      PG code
                    </label>
                    <input
                      id="portal_pg_code"
                      type="text"
                      autoComplete="off"
                      placeholder="contoh: PG00123456"
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
                    <label htmlFor="portal_otp_code" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Verification code
                    </label>
                    <input
                      id="portal_otp_code"
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

              <p className="mt-6 text-center text-xs text-slate-500">
                Need help? Contact your PG dealer.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
