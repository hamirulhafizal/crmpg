'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

type PlanRow = {
  id: string
  slug: string
  name: string
  description: string | null
  price_amount: number
  currency: string
  billing_period: string
  trial_days: number
  bullets: string[]
  features: Record<string, string>
}

type MeResponse = {
  subscription: {
    status: string
    locked_price_amount: number
    locked_currency: string
    trial_ends_at: string | null
    current_period_end: string | null
    plan: PlanRow
    features: Record<string, string>
  }
  plans: PlanRow[]
  usage: { active_campaigns: number }
  payments: Array<{
    id: string
    order_number: string
    amount: number
    currency: string
    status: string
    receipt_label: string | null
    created_at: string
  }>
  flags: {
    is_pro_active: boolean
    can_start_trial: boolean
    can_checkout: boolean
    can_upgrade_from_trial: boolean
    bayarcash_checkout_enabled: boolean
    trial_days: number
    renewal_price: number
    list_price: number
  }
  entitlements: {
    maxActiveCampaigns: number
    whatsappProviders: string[]
    isProActive: boolean
    planSlug: string
    status: string
  }
}

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: currency || 'MYR' }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })
}

function campaignLimitLabel(max: number) {
  return max < 0 ? 'Unlimited' : String(max)
}

export default function DashboardBillingPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<MeResponse | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [trialLoading, setTrialLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/saas/me')
      const json = (await res.json()) as MeResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to load billing')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load billing')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const freePlan = useMemo(() => data?.plans.find((p) => p.slug === 'free'), [data])
  const proPlan = useMemo(() => data?.plans.find((p) => p.slug === 'pro'), [data])

  async function startTrial() {
    setTrialLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch('/api/saas/start-trial', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not start trial')
      setActionMessage('Pro trial started. Enjoy unlimited campaigns and WasenderAPI.')
      await load()
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : 'Trial failed')
    } finally {
      setTrialLoading(false)
    }
  }

  async function checkout() {
    setCheckoutLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch('/api/saas/checkout', { method: 'POST' })
      const json = (await res.json()) as { checkoutUrl?: string; error?: string }
      if (!res.ok) throw new Error(json.error || 'Checkout failed')
      if (!json.checkoutUrl) throw new Error('No checkout URL returned')
      window.location.href = json.checkoutUrl
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : 'Checkout failed')
      setCheckoutLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-500">
        Loading billing…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error || 'Unable to load billing'}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-violet-700 hover:underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  const sub = data.subscription
  const maxCampaigns = data.entitlements.maxActiveCampaigns
  const checkoutAmount =
    sub.plan.slug === 'pro' && Number(sub.locked_price_amount) > 0
      ? Number(sub.locked_price_amount)
      : data.flags.list_price

  const checkoutLabel = data.flags.can_upgrade_from_trial
    ? `Upgrade to paid — ${fmtMoney(checkoutAmount, sub.locked_currency || proPlan?.currency || 'MYR')}/mo`
    : sub.status === 'active' && data.flags.is_pro_active
      ? `Renew — ${fmtMoney(checkoutAmount, sub.locked_currency)}/mo`
      : `Subscribe — ${fmtMoney(checkoutAmount, proPlan?.currency || 'MYR')}/mo`

  const showCheckout =
    data.flags.can_checkout && !data.flags.can_start_trial && (data.flags.can_upgrade_from_trial || !data.flags.is_pro_active || sub.status === 'active')

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Billing & plans</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your CRM subscription. Google Ads remains a separate add-on.
        </p>
      </div>

      {actionMessage ? (
        <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-900" role="status">
          {actionMessage}
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Current plan</h2>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xl font-bold text-slate-900">{sub.plan.name}</p>
            <p className="mt-1 text-sm text-slate-600 capitalize">Status: {sub.status}</p>
            {sub.status === 'trialing' && sub.trial_ends_at ? (
              <p className="mt-1 text-sm text-amber-700">Trial ends {fmtDate(sub.trial_ends_at)}</p>
            ) : null}
            {sub.current_period_end ? (
              <p className="mt-1 text-sm text-slate-500">Period ends {fmtDate(sub.current_period_end)}</p>
            ) : null}
            {sub.plan.slug === 'pro' && Number(sub.locked_price_amount) > 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                Your price: {fmtMoney(Number(sub.locked_price_amount), sub.locked_currency)}/mo
                {Number(sub.locked_price_amount) !== Number(proPlan?.price_amount ?? 0) ? (
                  <span className="text-emerald-700"> (grandfathered)</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="text-right text-sm text-slate-600">
            <p>
              Active campaigns:{' '}
              <span className="font-semibold text-slate-900">
                {data.usage.active_campaigns}
                {maxCampaigns >= 0 ? ` / ${maxCampaigns}` : ''}
              </span>
            </p>
            <p className="mt-1">
              WhatsApp:{' '}
              <span className="font-semibold text-slate-900">
                {data.entitlements.whatsappProviders.join(', ')}
              </span>
            </p>
          </div>
        </div>
        {data.flags.can_upgrade_from_trial && data.flags.can_checkout ? (
          <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50/80 p-4">
            <p className="text-sm text-violet-900">
              You&apos;re on a Pro trial. Upgrade now to start your paid monthly subscription — your trial
              benefits continue until payment is confirmed.
            </p>
            <button
              type="button"
              onClick={() => void checkout()}
              disabled={checkoutLoading || !data.flags.bayarcash_checkout_enabled}
              className="mt-3 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 sm:w-auto sm:min-w-[220px]"
            >
              {checkoutLoading ? 'Redirecting…' : checkoutLabel}
            </button>
            {!data.flags.bayarcash_checkout_enabled ? (
              <p className="mt-2 text-xs text-amber-700">Online payment is not configured. Contact admin.</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {[freePlan, proPlan].filter(Boolean).map((plan) => {
          const isCurrent = sub.plan.slug === plan!.slug && (plan!.slug === 'free' || data.flags.is_pro_active)
          const isPro = plan!.slug === 'pro'
          return (
            <div
              key={plan!.id}
              className={`relative rounded-2xl border p-6 shadow-sm transition ${
                isPro ? 'border-violet-200 bg-gradient-to-b from-violet-50/80 to-white' : 'border-slate-200 bg-white'
              }`}
            >
              {isCurrent ? (
                <span className="absolute right-4 top-4 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  Current
                </span>
              ) : null}
              <h3 className="text-lg font-semibold text-slate-900">{plan!.name}</h3>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {plan!.price_amount === 0 ? 'Free' : fmtMoney(Number(plan!.price_amount), plan!.currency)}
                {plan!.price_amount > 0 ? (
                  <span className="text-sm font-normal text-slate-500">/month</span>
                ) : null}
              </p>
              {plan!.description ? (
                <p className="mt-2 text-sm text-slate-600">{plan!.description}</p>
              ) : null}
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li>• {campaignLimitLabel(parseInt(plan!.features.max_active_campaigns ?? '1', 10))} active campaigns</li>
                <li>• WhatsApp: {plan!.features.whatsapp_providers ?? 'waha'}</li>
                {plan!.bullets.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>

              {isPro && !data.flags.is_pro_active ? (
                <div className="mt-6 space-y-2">
                  {data.flags.can_start_trial ? (
                    <button
                      type="button"
                      onClick={() => void startTrial()}
                      disabled={trialLoading || checkoutLoading}
                      className="w-full rounded-xl border border-violet-300 bg-white px-4 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                    >
                      {trialLoading ? 'Starting…' : `Start ${data.flags.trial_days}-day free trial`}
                    </button>
                  ) : null}
                  {data.flags.can_checkout ? (
                    <button
                      type="button"
                      onClick={() => void checkout()}
                      disabled={checkoutLoading || trialLoading || !data.flags.bayarcash_checkout_enabled}
                      className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {checkoutLoading ? 'Redirecting…' : checkoutLabel}
                    </button>
                  ) : null}
                  {!data.flags.bayarcash_checkout_enabled && data.flags.can_checkout ? (
                    <p className="text-xs text-amber-700">Online payment is not configured. Contact admin.</p>
                  ) : null}
                </div>
              ) : null}

              {isPro && data.flags.is_pro_active && showCheckout ? (
                <button
                  type="button"
                  onClick={() => void checkout()}
                  disabled={checkoutLoading || !data.flags.bayarcash_checkout_enabled}
                  className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
                    data.flags.can_upgrade_from_trial
                      ? 'bg-violet-600 hover:bg-violet-700'
                      : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {checkoutLoading ? 'Redirecting…' : checkoutLabel}
                </button>
              ) : null}
              {!data.flags.bayarcash_checkout_enabled && isPro && showCheckout ? (
                <p className="mt-2 text-xs text-amber-700">Online payment is not configured. Contact admin.</p>
              ) : null}
            </div>
          )
        })}
      </section>

      {data.payments.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Payment history</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-4 text-slate-600">{fmtDate(p.created_at)}</td>
                    <td className="py-2 pr-4 font-medium text-slate-900">
                      {fmtMoney(Number(p.amount), p.currency)}
                    </td>
                    <td className="py-2 pr-4 capitalize">{p.status}</td>
                    <td className="py-2 text-slate-600">{p.receipt_label || p.order_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
