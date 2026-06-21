'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { sanitizeCrmOrderNumber } from '@/app/lib/google-ads/sanitize-order-number'

function PaymentCompleteInner() {
  const searchParams = useSearchParams()
  const orderNumber = useMemo(() => {
    for (const raw of searchParams.getAll('order_number')) {
      const s = sanitizeCrmOrderNumber(raw)
      if (s) return s
    }
    return ''
  }, [searchParams])
  const paymentIntentId = useMemo(
    () => (searchParams.get('payment_intent_id') || searchParams.get('payment_intent') || '').trim(),
    [searchParams]
  )
  const [message, setMessage] = useState('Confirming payment…')
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending' | 'error'>('loading')

  useEffect(() => {
    if (!orderNumber && !paymentIntentId) {
      setStatus('error')
      setMessage('Missing order reference. Return to billing and try again.')
      return
    }

    let cancelled = false
    let attempts = 0
    const maxAttempts = 18

    const syncUrl = orderNumber
      ? `/api/saas/sync-payment?order_number=${encodeURIComponent(orderNumber)}`
      : `/api/saas/sync-payment?payment_intent_id=${encodeURIComponent(paymentIntentId)}`

    const poll = async () => {
      const res = await fetch(syncUrl)
      const j = (await res.json().catch(() => ({}))) as { status?: string; error?: string }
      if (cancelled) return

      if (!res.ok) {
        setStatus('error')
        setMessage(j.error || 'Could not confirm payment.')
        return
      }
      if (j.status === 'paid') {
        setStatus('paid')
        setMessage('Payment received. Your Pro subscription is now active.')
        return
      }
      if (j.status === 'failed') {
        setStatus('error')
        setMessage('This payment was not completed. You can try checkout again from billing.')
        return
      }

      attempts += 1
      if (attempts >= maxAttempts) {
        setStatus('pending')
        setMessage(
          'We are still waiting for bank confirmation. Refresh billing in a moment to see your updated plan.'
        )
        return
      }
      window.setTimeout(poll, 2000)
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [orderNumber, paymentIntentId])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-violet-50/30 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <h1 className="text-lg font-semibold text-slate-900">Pro subscription payment</h1>
        <p
          className={`mt-4 text-sm ${
            status === 'error' ? 'text-red-800' : status === 'paid' ? 'text-emerald-800' : 'text-slate-600'
          }`}
          role="status"
        >
          {message}
        </p>
        {status === 'loading' ? (
          <div className="mt-6 flex justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600" />
          </div>
        ) : null}
        <Link
          href="/dashboard/billing"
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-violet-700 active:scale-[0.99]"
        >
          Back to billing
        </Link>
      </div>
    </div>
  )
}

export default function SaasPaymentCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-violet-50/30">
          <p className="text-slate-600">Loading…</p>
        </div>
      }
    >
      <PaymentCompleteInner />
    </Suspense>
  )
}
