'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  SAAS_FEATURE_DEFAULTS,
  SAAS_FEATURE_LABELS,
  type SaasFeatureKey,
  type SaasPlanFeatureRow,
  type SaasPlanWithFeatures,
  type SaasSubscriptionStatus,
} from '@/app/lib/saas/types'

type UserOption = {
  id: string
  email?: string
  full_name?: string | null
}

type SubscriptionRow = {
  id: string
  user_id: string
  plan_id: string
  status: SaasSubscriptionStatus
  locked_price_amount: number
  locked_currency: string
  trial_ends_at: string | null
  current_period_end: string | null
  admin_assigned_at: string | null
  plan?: { id: string; name: string; slug: string } | null
  profile?: { id: string; full_name: string | null; role: string } | null
}

function featuresRecord(features: SaasPlanFeatureRow[]): Record<SaasFeatureKey, string> {
  const map = { ...SAAS_FEATURE_DEFAULTS }
  for (const f of features) {
    if (f.feature_key in map) {
      map[f.feature_key as SaasFeatureKey] = f.value
    }
  }
  return map
}

function formatMoney(amount: number, currency: string) {
  if (amount === 0) return 'Free'
  return `${currency} ${Number(amount).toFixed(2)}`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AdminSaasPlansPage() {
  const [tab, setTab] = useState<'plans' | 'subscribers'>('plans')
  const [plans, setPlans] = useState<SaasPlanWithFeatures[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [loadingSubs, setLoadingSubs] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [planModal, setPlanModal] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [planSaving, setPlanSaving] = useState(false)
  const [formSlug, setFormSlug] = useState('')
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formBilling, setFormBilling] = useState<'monthly' | 'yearly' | 'none'>('monthly')
  const [formPrice, setFormPrice] = useState('')
  const [formTrialDays, setFormTrialDays] = useState('0')
  const [formActive, setFormActive] = useState(true)
  const [formSort, setFormSort] = useState('0')
  const [formBullets, setFormBullets] = useState('')
  const [formFeatures, setFormFeatures] = useState<Record<SaasFeatureKey, string>>({ ...SAAS_FEATURE_DEFAULTS })

  const [assignModal, setAssignModal] = useState(false)
  const [assignUserId, setAssignUserId] = useState('')
  const [assignPlanId, setAssignPlanId] = useState('')
  const [assignStatus, setAssignStatus] = useState<SaasSubscriptionStatus>('active')
  const [assignLockedPrice, setAssignLockedPrice] = useState('')
  const [assignTrialOverride, setAssignTrialOverride] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)
  const [subSearch, setSubSearch] = useState('')

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true)
    try {
      const res = await fetch('/api/admin/saas/plans')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load plans')
      setPlans(data.plans || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plans')
    } finally {
      setLoadingPlans(false)
    }
  }, [])

  const loadSubscriptions = useCallback(async () => {
    setLoadingSubs(true)
    try {
      const q = subSearch.trim()
      const res = await fetch(`/api/admin/saas/subscriptions${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load subscriptions')
      setSubscriptions(data.subscriptions || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subscriptions')
    } finally {
      setLoadingSubs(false)
    }
  }, [subSearch])

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (!res.ok) return
      setUsers(
        (data.users || []).map((u: { id: string; email?: string; full_name?: string | null }) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
        }))
      )
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void loadPlans()
    void loadUsers()
  }, [loadPlans, loadUsers])

  useEffect(() => {
    if (tab === 'subscribers') void loadSubscriptions()
  }, [tab, loadSubscriptions])

  const activePlans = useMemo(() => plans.filter((p) => p.is_active), [plans])

  function openPlanModal(row?: SaasPlanWithFeatures) {
    if (row) {
      setEditingPlanId(row.id)
      setFormSlug(row.slug)
      setFormName(row.name)
      setFormDescription(row.description ?? '')
      setFormBilling(row.billing_period)
      setFormPrice(String(row.price_amount))
      setFormTrialDays(String(row.trial_days))
      setFormActive(row.is_active)
      setFormSort(String(row.sort_order))
      const bullets = row.marketing_details?.bullets
      setFormBullets(Array.isArray(bullets) ? bullets.map(String).join('\n') : '')
      setFormFeatures(featuresRecord(row.features))
    } else {
      setEditingPlanId(null)
      setFormSlug('')
      setFormName('')
      setFormDescription('')
      setFormBilling('monthly')
      setFormPrice('')
      setFormTrialDays('14')
      setFormActive(true)
      setFormSort(String(plans.length + 1))
      setFormBullets('')
      setFormFeatures({ ...SAAS_FEATURE_DEFAULTS })
    }
    setPlanModal(true)
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault()
    setPlanSaving(true)
    setError(null)
    try {
      const price = parseFloat(formPrice)
      if (Number.isNaN(price) || price < 0) throw new Error('Invalid price')
      const trialDays = parseInt(formTrialDays, 10)
      if (Number.isNaN(trialDays) || trialDays < 0) throw new Error('Invalid trial days')

      const payload = {
        slug: formSlug.trim().toLowerCase(),
        name: formName.trim(),
        description: formDescription.trim() || null,
        billing_period: formBilling,
        price_amount: price,
        trial_days: trialDays,
        is_active: formActive,
        sort_order: parseInt(formSort, 10) || 0,
        marketing_details: {
          bullets: formBullets
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        },
        features: formFeatures,
      }

      const res = editingPlanId
        ? await fetch(`/api/admin/saas/plans/${editingPlanId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/admin/saas/plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setPlanModal(false)
      await loadPlans()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setPlanSaving(false)
    }
  }

  async function deactivatePlan(id: string, slug: string) {
    if (slug === 'free') {
      alert('Free plan cannot be deactivated.')
      return
    }
    if (!confirm('Deactivate this plan? Existing subscribers keep their grandfathered price.')) return
    const res = await fetch(`/api/admin/saas/plans/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(data.error || 'Failed to deactivate')
      return
    }
    await loadPlans()
  }

  function openAssignModal(prefillUserId?: string) {
    setAssignUserId(prefillUserId ?? '')
    setAssignPlanId(activePlans.find((p) => p.slug === 'pro')?.id ?? activePlans[0]?.id ?? '')
    setAssignStatus('active')
    setAssignLockedPrice('')
    setAssignTrialOverride('')
    setAssignModal(true)
  }

  async function saveAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!assignUserId || !assignPlanId) return
    setAssignSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        user_id: assignUserId,
        plan_id: assignPlanId,
        status: assignStatus,
      }
      if (assignLockedPrice.trim()) {
        const p = parseFloat(assignLockedPrice)
        if (Number.isNaN(p) || p < 0) throw new Error('Invalid locked price')
        body.locked_price_amount = p
      }
      if (assignTrialOverride.trim()) {
        body.trial_days_override = parseInt(assignTrialOverride, 10)
      }

      const res = await fetch('/api/admin/saas/subscriptions/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Assign failed')
      setAssignModal(false)
      await loadSubscriptions()
      await loadPlans()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed')
    } finally {
      setAssignSaving(false)
    }
  }

  function userLabel(u: UserOption) {
    const name = u.full_name?.trim()
    if (name && u.email) return `${name} (${u.email})`
    return name || u.email || u.id
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">SaaS plans</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Manage platform packages (Free / Pro). Google Ads stays a separate add-on. New signups
            automatically get Free. Price changes apply to new subscribers only — existing Pro users
            keep their locked price.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openAssignModal()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Assign plan
          </button>
          <button
            type="button"
            onClick={() => openPlanModal()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            New plan
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-1 border-b border-slate-200">
        {(['plans', 'subscribers'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? 'border-b-2 border-violet-600 text-violet-700' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'plans' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {loadingPlans ? (
            <p className="text-sm text-slate-500">Loading plans…</p>
          ) : (
            plans.map((plan) => {
              const feats = featuresRecord(plan.features)
              const bullets = plan.marketing_details?.bullets
              return (
                <div
                  key={plan.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {plan.slug}
                        </span>
                        {!plan.is_active ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Inactive
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{plan.description || '—'}</p>
                    </div>
                    <p className="text-right text-lg font-semibold text-slate-900">
                      {formatMoney(Number(plan.price_amount), plan.currency)}
                      {plan.billing_period !== 'none' ? (
                        <span className="block text-xs font-normal text-slate-500">/{plan.billing_period}</span>
                      ) : null}
                    </p>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <dt className="font-medium text-slate-500">Trial</dt>
                      <dd>{plan.trial_days} days</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Subscribers</dt>
                      <dd>{plan.subscriber_count ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Campaigns</dt>
                      <dd>{feats.max_active_campaigns === '-1' ? 'Unlimited' : feats.max_active_campaigns}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">WhatsApp</dt>
                      <dd>{feats.whatsapp_providers}</dd>
                    </div>
                  </dl>

                  {Array.isArray(bullets) && bullets.length > 0 ? (
                    <ul className="mt-3 list-inside list-disc text-sm text-slate-600">
                      {bullets.map((b) => (
                        <li key={String(b)}>{String(b)}</li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openPlanModal(plan)}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
                    >
                      Edit
                    </button>
                    {plan.is_active && plan.slug !== 'free' ? (
                      <button
                        type="button"
                        onClick={() => void deactivatePlan(plan.id, plan.slug)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Deactivate
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={subSearch}
              onChange={(e) => setSubSearch(e.target.value)}
              placeholder="Search dealer name or id…"
              className="min-w-[220px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void loadSubscriptions()}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Search
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Dealer</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Locked price</th>
                  <th className="px-4 py-3">Trial ends</th>
                  <th className="px-4 py-3">Period end</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingSubs ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Loading…
                    </td>
                  </tr>
                ) : subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No subscriptions yet.
                    </td>
                  </tr>
                ) : (
                  subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {sub.profile?.full_name?.trim() || '—'}
                        </p>
                        <p className="text-xs text-slate-500">{sub.user_id}</p>
                      </td>
                      <td className="px-4 py-3">{sub.plan?.name ?? sub.plan_id}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            sub.status === 'active' || sub.status === 'trialing'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sub.status === 'expired'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {formatMoney(Number(sub.locked_price_amount), sub.locked_currency)}
                      </td>
                      <td className="px-4 py-3">{formatDate(sub.trial_ends_at)}</td>
                      <td className="px-4 py-3">{formatDate(sub.current_period_end)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openAssignModal(sub.user_id)}
                          className="text-xs font-medium text-violet-700 hover:text-violet-900"
                        >
                          Change
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {planModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm top-[-2rem]">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingPlanId ? 'Edit plan' : 'New plan'}
            </h3>
            <form onSubmit={savePlan} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Slug</label>
                  <input
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    required
                    disabled={Boolean(editingPlanId && (formSlug === 'free' || formSlug === 'pro'))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Sort order</label>
                  <input
                    type="number"
                    value={formSort}
                    onChange={(e) => setFormSort(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Name</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Billing</label>
                  <select
                    value={formBilling}
                    onChange={(e) => setFormBilling(e.target.value as typeof formBilling)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="none">None (Free)</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Price</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Trial days</label>
                  <input
                    type="number"
                    min={0}
                    value={formTrialDays}
                    onChange={(e) => setFormTrialDays(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Marketing bullets (one per line)</label>
                <textarea
                  value={formBullets}
                  onChange={(e) => setFormBullets(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
                <legend className="px-1 text-sm font-medium text-slate-700">Feature limits</legend>
                {(Object.keys(SAAS_FEATURE_LABELS) as SaasFeatureKey[]).map((key) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-600">{SAAS_FEATURE_LABELS[key]}</label>
                    <input
                      value={formFeatures[key]}
                      onChange={(e) => setFormFeatures((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </fieldset>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
                Active (visible for new signups)
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPlanModal(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={planSaving}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {planSaving ? 'Saving…' : 'Save plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {assignModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm top-[-2rem]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Assign plan to dealer</h3>
            <p className="mt-1 text-sm text-slate-600">
              Manual assignment for comp accounts, Pro upgrades, or trials. Locked price is optional
              for Pro. Use trial days override to extend a Free trial (e.g. 3 = 3 more days from now).
              (defaults to current plan list price).
            </p>
            <form onSubmit={saveAssign} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Dealer</label>
                <select
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select user…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {userLabel(u)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Plan</label>
                <select
                  value={assignPlanId}
                  onChange={(e) => setAssignPlanId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatMoney(Number(p.price_amount), p.currency)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={assignStatus}
                  onChange={(e) => setAssignStatus(e.target.value as SaasSubscriptionStatus)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="trialing">Trialing</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Locked price (optional)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={assignLockedPrice}
                    onChange={(e) => setAssignLockedPrice(e.target.value)}
                    placeholder="Grandfathered RM"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Trial days override</label>
                  <input
                    type="number"
                    min={0}
                    value={assignTrialOverride}
                    onChange={(e) => setAssignTrialOverride(e.target.value)}
                    placeholder="Plan default"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignModal(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignSaving}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {assignSaving ? 'Saving…' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
