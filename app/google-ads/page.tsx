'use client'

import Link from 'next/link'
import { PageContentSkeleton } from '@/app/components/PageContentSkeleton'
import { PageBackTitle } from '@/app/components/PageBackTitle'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { canRequestRenewal, effectivePackageStatus } from '@/app/lib/google-ads/billing'
import { GoogleAdsMyLeadsTab } from '@/app/google-ads/_components/GoogleAdsMyLeadsTab'
import { GoogleAdsRotationPanel } from '@/app/google-ads/_components/GoogleAdsRotationPanel'

type PackageRow = {
  id: string
  name: string
  billing_period: 'monthly' | 'yearly'
  price_amount: number
  currency: string
  is_active: boolean
}

type PaymentRow = {
  id: string
  order_number: string
  amount: number
  currency: string
  status: string
  receipt_label: string | null
  exchange_reference_number: string | null
  bayarcash_transaction_id: string | null
  payment_intent_id: string | null
  created_at: string
  updated_at: string
  package?: PackageRow | PackageRow[] | null
}

type MeResponse =
  | { enrolled: false }
  | {
      enrolled: true
      participant: { id: string; notes: string | null }
      subscription: {
        id: string
        package_id: string
        status: string
        current_period_start: string | null
        current_period_end: string | null
        pending_renewal_package_id: string | null
        payment_provider: string | null
        external_payment_id: string | null
        package?: PackageRow | PackageRow[] | null
      } | null
      packages: PackageRow[]
      payments: PaymentRow[]
      bayarcashCheckoutEnabled: boolean
      bayarcashDirectDebitEnabled?: boolean
      profilePhone?: string | null
      mandate?: {
        id: string
        status: string
        order_number: string
        amount: number
        frequency_mode: string
        created_at: string
        updated_at: string
      } | null
    }

type PaymentMethod = 'fpx' | 'direct_debit'

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: currency || 'MYR' }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

export default function GoogleAdsParticipantPage() {
  const [tab, setTab] = useState<'package' | 'leads'>('package')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<MeResponse | null>(null)
  const [renewPkgId, setRenewPkgId] = useState('')
  const [renewSubmitting, setRenewSubmitting] = useState(false)
  const [renewMessage, setRenewMessage] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('fpx')
  const [payerNric, setPayerNric] = useState('')
  const [payerPhone, setPayerPhone] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/google-ads/me')
      const json = (await res.json()) as MeResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const subscription = data && data.enrolled ? data.subscription : null
  const packages = data && data.enrolled ? data.packages : []
  const payments = data && data.enrolled ? data.payments ?? [] : []
  const bayarcashCheckoutEnabled = data && data.enrolled ? data.bayarcashCheckoutEnabled : false
  const bayarcashDirectDebitEnabled =
    data && data.enrolled ? Boolean(data.bayarcashDirectDebitEnabled) : false
  const activeMandate = data && data.enrolled ? data.mandate ?? null : null
  const missingSubscription = Boolean(data?.enrolled && !subscription)

  useEffect(() => {
    if (data && data.enrolled && data.profilePhone && !payerPhone) {
      setPayerPhone(data.profilePhone)
    }
  }, [data, payerPhone])

  const currentPkg = useMemo(() => {
    if (!subscription?.package) return null
    const p = subscription.package
    return Array.isArray(p) ? p[0] : p
  }, [subscription])

  const effective = subscription
    ? effectivePackageStatus({
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
      })
    : 'inactive'

  const allowRenew =
    (missingSubscription && packages.length > 0) ||
    (subscription
      ? canRequestRenewal({
          status: subscription.status,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
        })
      : false)

  const hasActivePackage = subscription ? effective === 'active' : false

  const renewalAllowedForSubscription = subscription
    ? canRequestRenewal({
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
      })
    : false

  /** No paid active window: show pay CTA (including enrolled users without a subscription row yet). */
  const showPaymentCTA = Boolean(
    packages.length > 0 &&
      !hasActivePackage &&
      (missingSubscription || renewalAllowedForSubscription)
  )

  /** Default package: first package when no subscription; else match enrolled package_id when possible. */
  useEffect(() => {
    if (packages.length === 0 || renewPkgId) return
    if (!subscription) {
      setRenewPkgId(packages[0]!.id)
      return
    }
    const enrolledPkgId = subscription.package_id
    const enrolledOk = packages.some((p) => p.id === enrolledPkgId)
    setRenewPkgId(enrolledOk ? enrolledPkgId : packages[0]!.id)
  }, [subscription, packages, renewPkgId])

  function scrollToPaymentSection() {
    document.getElementById('google-ads-pay-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => document.getElementById('renew-pkg')?.focus(), 350)
  }

  async function submitCheckout(e: React.FormEvent) {
    e.preventDefault()
    if (!renewPkgId) return
    setRenewSubmitting(true)
    setRenewMessage(null)
    try {
      if (paymentMethod === 'direct_debit') {
        if (!payerNric.trim()) throw new Error('NRIC / IC number is required for auto Direct Debit')
        if (!payerPhone.trim()) throw new Error('Phone number is required for auto Direct Debit')
        const res = await fetch('/api/google-ads/direct-debit/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            package_id: renewPkgId,
            payer_id: payerNric.trim(),
            payer_phone: payerPhone.trim(),
          }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          enrollUrl?: string
          error?: string
          detail?: string
        }
        if (!res.ok) throw new Error(json.error || 'Direct Debit enrollment failed')
        if (!json.enrollUrl) throw new Error('No enrollment URL returned')
        window.location.assign(json.enrollUrl)
        return
      }

      const res = await fetch('/api/google-ads/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: renewPkgId }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        checkoutUrl?: string
        error?: string
        detail?: string
      }
      if (!res.ok) throw new Error(json.error || 'Checkout failed')
      if (!json.checkoutUrl) throw new Error('No checkout URL returned')
      window.location.assign(json.checkoutUrl)
    } catch (e) {
      setRenewMessage(e instanceof Error ? e.message : 'Checkout failed')
      setRenewSubmitting(false)
    }
  }

  async function submitRenew(e: React.FormEvent) {
    e.preventDefault()
    if (!renewPkgId) return
    setRenewSubmitting(true)
    setRenewMessage(null)
    try {
      const res = await fetch('/api/google-ads/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: renewPkgId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Request failed')
      setRenewMessage(json.message || 'Renewal recorded.')
      await load()
    } catch (e) {
      setRenewMessage(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setRenewSubmitting(false)
    }
  }

  if (loading) {
    return <PageContentSkeleton />
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <p className="text-red-800">{error}</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (!data?.enrolled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          <h1 className="text-xl font-semibold text-slate-900">Google Ads campaign</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your account is not enrolled in this program. Contact an administrator if you should have access.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow transition hover:bg-slate-800 active:scale-[0.98]"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <PageBackTitle title="Google Ads" />

        <div className="mb-6">
          <GoogleAdsRotationPanel />
        </div>

        <div className="mb-6 flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('package')}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'package' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Your package
          </button>
          <button
            type="button"
            onClick={() => setTab('leads')}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'leads' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Your lead
          </button>
        </div>

        {tab === 'leads' && <GoogleAdsMyLeadsTab />}

        {tab === 'package' && (
          <>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Your package</h1>
          <p className="mt-1 text-sm text-slate-600">
            Monthly or yearly billing — change package only when you renew (not mid-cycle).
          </p>

          {subscription && (
            <div className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                    effective === 'active'
                      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                      : 'bg-slate-100 text-slate-700 ring-slate-200'
                  }`}
                >
                  {effective === 'active' ? 'Active' : 'Inactive'}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Record: {subscription.status.replace('_', ' ')}
                </span>
              </div>
              {currentPkg && (
                <p className="text-slate-800">
                  <span className="font-medium">Current pac:</span> {currentPkg.name} ·{' '}
                  {fmtMoney(Number(currentPkg.price_amount), currentPkg.currency)} /{' '}
                  {currentPkg.billing_period === 'monthly' ? 'month' : 'year'}
                </p>
              )}
              {subscription.current_period_start && subscription.current_period_end && (
                <p className="text-sm text-slate-600">
                  Period: {new Date(subscription.current_period_start).toLocaleDateString()} —{' '}
                  {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
              {subscription.status === 'pending_payment' && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {bayarcashCheckoutEnabled
                    ? 'Payment pending. Use Renew below to open Bayarcash and complete payment, or ask an administrator to confirm manually.'
                    : 'Payment pending. Your administrator can confirm payment to activate the next period.'}
                </p>
              )}
            </div>
          )}

          {!subscription && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4">
              <p className="text-sm font-medium text-slate-900">No subscription yet</p>
              <p className="mt-1 text-sm text-slate-600">
                You are enrolled, but a subscription has not been created.{' '}
                {packages.length > 0 ? (
                  <>
                    Use <span className="font-medium text-slate-800">Select pac & pay</span> below — payment will
                    create your subscription automatically.
                  </>
                ) : (
                  <>Contact an administrator if packages are not available.</>
                )}
              </p>
              {/* {packages.length > 0 && (
                <button
                  type="button"
                  onClick={scrollToPaymentSection}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-slate-800 active:scale-[0.99] sm:w-auto"
                >
                  {bayarcashCheckoutEnabled ? 'Select pac & pay now' : 'Select pac & request payment'}
                </button>
              )} */}
            </div>
          )}
        </div>

        {payments.length > 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Invoices & receipts</h2>
            <p className="mt-1 text-sm text-slate-600">
              Invoice number is your order reference; bank / FPX references appear after payment succeeds.
            </p>
            <ul className="mt-4 divide-y divide-slate-100">
              {payments.map((row) => {
                const pkgRow = row.package
                const pkgOne = pkgRow ? (Array.isArray(pkgRow) ? pkgRow[0] : pkgRow) : null
                return (
                  <li key={row.id} className="py-4 first:pt-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">Invoice #{row.order_number}</p>
                        {pkgOne && (
                          <p className="text-sm text-slate-600">
                            {pkgOne.name} · {fmtMoney(Number(row.amount), row.currency)}
                          </p>
                        )}
                        {!pkgOne && (
                          <p className="text-sm text-slate-600">{fmtMoney(Number(row.amount), row.currency)}</p>
                        )}
                        <p className="mt-1 text-xs text-slate-500">{new Date(row.created_at).toLocaleString()}</p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                          row.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                            : row.status === 'pending'
                              ? 'bg-amber-50 text-amber-900 ring-amber-200'
                              : 'bg-slate-100 text-slate-700 ring-slate-200'
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>
                    {row.status === 'paid' && (row.receipt_label || row.exchange_reference_number) && (
                      <p className="mt-2 text-sm text-slate-700">
                        <span className="font-medium text-slate-800">Receipt: </span>
                        {row.receipt_label ||
                          [row.exchange_reference_number, row.bayarcash_transaction_id].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {row.status === 'paid' && (
                      <a
                        href={`/api/google-ads/payments/${row.id}/receipt`}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]"
                      >
                        <svg className="h-4 w-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        Download PDF receipt
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {allowRenew && packages.length > 0 && (
          <div
            id="google-ads-pay-section"
            className="mt-6 scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-slate-900">
              {missingSubscription
                ? 'Select pac & pay'
                : subscription?.status === 'pending_payment' && !hasActivePackage
                  ? 'Activate with payment'
                  : 'Renew or pay'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {missingSubscription
                ? bayarcashCheckoutEnabled
                  ? 'Pick your billing pac and payment method. Your subscription is created when you start checkout.'
                  : 'Pick your pac and submit a payment request. An administrator will confirm and activate your period.'
                : bayarcashCheckoutEnabled
                  ? subscription?.status === 'pending_payment' && !hasActivePackage
                    ? 'Confirm the pac, choose how to pay, then complete checkout to activate.'
                    : 'Choose your pac and payment method, then pay securely with Bayarcash.'
                  : 'Choose the pac for your next term. An administrator will confirm when payment is received.'}
            </p>
            {activeMandate?.status === 'active' && (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Auto Direct Debit is active for this subscription (order {activeMandate.order_number}).
              </p>
            )}
            <form
              onSubmit={bayarcashCheckoutEnabled ? submitCheckout : submitRenew}
              className="mt-4 space-y-4"
            >
              <div>
                <label htmlFor="renew-pkg" className="block text-sm font-medium text-slate-700">
                  pac
                </label>
                <select
                  id="renew-pkg"
                  value={renewPkgId}
                  onChange={(e) => setRenewPkgId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Select…</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {fmtMoney(Number(p.price_amount), p.currency)} /{' '}
                      {p.billing_period === 'monthly' ? 'month' : 'year'}
                    </option>
                  ))}
                </select>
              </div>

              {bayarcashCheckoutEnabled && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-700">Payment method</legend>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                      paymentMethod === 'fpx'
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      value="fpx"
                      checked={paymentMethod === 'fpx'}
                      onChange={() => setPaymentMethod('fpx')}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">One-time FPX</span>
                      <span className="mt-0.5 block text-xs text-slate-600">
                        Pay once now via online banking. Renew again next period.
                      </span>
                    </span>
                  </label>
                  {bayarcashDirectDebitEnabled && (
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                        paymentMethod === 'direct_debit'
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment-method"
                        value="direct_debit"
                        checked={paymentMethod === 'direct_debit'}
                        onChange={() => setPaymentMethod('direct_debit')}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">
                          Auto Direct Debit
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-600">
                          Set up e-Mandate once; bank deducts automatically each billing cycle.
                        </span>
                      </span>
                    </label>
                  )}
                </fieldset>
              )}

              {bayarcashCheckoutEnabled &&
                bayarcashDirectDebitEnabled &&
                paymentMethod === 'direct_debit' && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <div>
                      <label htmlFor="payer-nric" className="block text-sm font-medium text-slate-700">
                        NRIC / IC number
                      </label>
                      <input
                        id="payer-nric"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={payerNric}
                        onChange={(e) => setPayerNric(e.target.value)}
                        required
                        placeholder="e.g. 900101011234"
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div>
                      <label htmlFor="payer-phone" className="block text-sm font-medium text-slate-700">
                        Phone (for bank enrollment)
                      </label>
                      <input
                        id="payer-phone"
                        type="tel"
                        autoComplete="tel"
                        value={payerPhone}
                        onChange={(e) => setPayerPhone(e.target.value)}
                        required
                        placeholder="e.g. 0123456789"
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Required by FPX Direct Debit. We store only the last 4 digits of your IC.
                    </p>
                  </div>
                )}

              <button
                type="submit"
                disabled={renewSubmitting || !renewPkgId}
                className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-50 active:scale-[0.99]"
              >
                {renewSubmitting
                  ? bayarcashCheckoutEnabled
                    ? paymentMethod === 'direct_debit'
                      ? 'Opening bank enrollment…'
                      : 'Opening checkout…'
                    : 'Submitting…'
                  : bayarcashCheckoutEnabled
                    ? paymentMethod === 'direct_debit'
                      ? 'Set up auto Direct Debit'
                      : 'Pay with FPX'
                    : 'Request renewal'}
              </button>
            </form>
            {renewMessage && (
              <p className="mt-3 text-sm text-slate-700" role="status">
                {renewMessage}
              </p>
            )}
          </div>
        )}

        {!allowRenew && subscription && subscription.status === 'active' && effective === 'active' && (
          <p className="mt-6 text-center text-sm text-slate-500">
            pac changes are available in the last 7 days before expiry, or after your period ends.
          </p>
        )}
          </>
        )}
      </div>
  )
}
