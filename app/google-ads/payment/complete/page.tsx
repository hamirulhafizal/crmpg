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
  const [message, setMessage] = useState('Confirming payment…')
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending' | 'error'>('loading')

  useEffect(() => {
    if (!orderNumber) {
      setStatus('error')
      setMessage('Missing order reference. Return to the Google Ads page and try again.')
      return
    }

    let cancelled = false
    let attempts = 0
    const maxAttempts = 18

    const poll = async () => {
      const res = await fetch(
        `/api/google-ads/sync-payment?order_number=${encodeURIComponent(orderNumber)}`
      )
      const j = (await res.json().catch(() => ({}))) as { status?: string; error?: string }
      if (cancelled) return

      if (!res.ok) {
        setStatus('error')
        setMessage(j.error || 'Could not confirm payment.')
        return
      }
      if (j.status === 'paid') {
        setStatus('paid')
        setMessage('Payment received. Your subscription is now active.')
        return
      }
      if (j.status === 'failed') {
        setStatus('error')
        setMessage('This payment was not completed. You can start checkout again from the Google Ads page.')
        return
      }

      attempts += 1
      if (attempts >= maxAttempts) {
        setStatus('pending')
        setMessage(
          'We are still waiting for confirmation from the bank. Refresh in a moment, or open the Google Ads page to see your status.'
        )
        return
      }
      window.setTimeout(poll, 2000)
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [orderNumber])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl text-center">
        <h1 className="text-lg font-semibold text-slate-900">Google Ads payment</h1>
        <p
          className={`mt-4 text-sm ${
            status === 'error' ? 'text-red-800' : status === 'paid' ? 'text-emerald-800' : 'text-slate-600'
          }`}
          role="status"
        >
          {message}
        </p>
        {status === 'loading' && (
          <div className="mt-6 flex justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
          </div>
        )}
        <Link
          href="/google-ads"
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-slate-800 active:scale-[0.99]"
        >
          Back to Google Ads subscription
        </Link>
      </div>
    </div>
  )
}

export default function GoogleAdsPaymentCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
          <p className="text-slate-600">Loading…</p>
        </div>
      }
    >
      <PaymentCompleteInner />
    </Suspense>
  )
}
