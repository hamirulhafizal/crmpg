'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import { effectivePackageStatus } from '@/app/lib/google-ads/billing'

type PackageRow = {
  id: string
  name: string
  billing_period: 'monthly' | 'yearly'
  price_amount: number
  currency: string
  is_active: boolean
  sort_order: number
}

type SubscriptionEmbed = {
  id: string
  package_id: string
  status: string
  current_period_start: string | null
  current_period_end: string | null
  pending_renewal_package_id: string | null
  payment_provider: string | null
  external_payment_id: string | null
  package?: PackageRow | PackageRow[] | null
}

type ParticipantRow = {
  id: string
  user_id: string
  email: string | null
  notes: string | null
  lead_email?: boolean
  pg_code?: string | null
  public_username?: string | null
  created_at: string
  hasPaidReceipt?: boolean
  subscription?: SubscriptionEmbed | null
  google_ads_subscriptions?: SubscriptionEmbed[] | null
}

function normalizeSubscription(raw: ParticipantRow): SubscriptionEmbed | null {
  if (raw.subscription) return raw.subscription
  const arr = raw.google_ads_subscriptions
  if (Array.isArray(arr) && arr[0]) return arr[0]
  return null
}

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: currency || 'MYR' }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

function formatUserOption(u: { id: string; email: string | null; full_name: string | null }) {
  return (u.email || u.id) + (u.full_name ? ` — ${u.full_name}` : '')
}

function subscriptionStatusBadgeClass(status: string | undefined): string {
  const s = (status || '').toLowerCase()
  if (s === 'active') return 'bg-emerald-50 text-emerald-800 ring-emerald-200/80'
  if (s === 'pending_payment') return 'bg-amber-50 text-amber-900 ring-amber-200/90'
  if (s === 'expired') return 'bg-slate-100 text-slate-700 ring-slate-300/80'
  if (s === 'cancelled') return 'bg-red-50 text-red-800 ring-red-200/80'
  return 'bg-slate-50 text-slate-600 ring-slate-200/80'
}

function humanizeSubscriptionStatus(status: string | undefined): string {
  if (!status) return '—'
  return status.replace(/_/g, ' ')
}

/** Local date/time for `<input type="datetime-local" />` from an ISO string. */
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminGoogleAdsPage() {
  const [tab, setTab] = useState<'participants' | 'packages'>('participants')

  const [packages, setPackages] = useState<PackageRow[]>([])
  const [loadingPackages, setLoadingPackages] = useState(true)
  const [packageError, setPackageError] = useState<string | null>(null)

  const [participants, setParticipants] = useState<ParticipantRow[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(true)
  const [participantError, setParticipantError] = useState<string | null>(null)

  const [users, setUsers] = useState<Array<{ id: string; email: string | null; full_name: string | null }>>([])

  const [pkgModal, setPkgModal] = useState(false)
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null)
  const [pkgName, setPkgName] = useState('')
  const [pkgPeriod, setPkgPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [pkgPrice, setPkgPrice] = useState('')
  const [pkgActive, setPkgActive] = useState(true)
  const [pkgSaving, setPkgSaving] = useState(false)

  const [partModal, setPartModal] = useState(false)
  const [selectedParticipantUserIds, setSelectedParticipantUserIds] = useState<string[]>([])
  const [newNotes, setNewNotes] = useState('')
  const [partSaving, setPartSaving] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [userPickerOpen, setUserPickerOpen] = useState(false)
  const [userHighlight, setUserHighlight] = useState(0)
  const userComboRef = useRef<HTMLDivElement>(null)

  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const [editParticipantOpen, setEditParticipantOpen] = useState(false)
  const [editParticipantRow, setEditParticipantRow] = useState<ParticipantRow | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editPgCode, setEditPgCode] = useState('')
  const [editPublicUsername, setEditPublicUsername] = useState('')
  const [editPackageId, setEditPackageId] = useState('')
  const [editStatus, setEditStatus] = useState<'active' | 'expired' | 'cancelled' | 'pending_payment'>('active')
  const [editPeriodStart, setEditPeriodStart] = useState('')
  const [editPeriodEnd, setEditPeriodEnd] = useState('')
  const [editPendingRenewalId, setEditPendingRenewalId] = useState('')
  const [editExternalPaymentId, setEditExternalPaymentId] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const loadPackages = useCallback(async () => {
    setLoadingPackages(true)
    setPackageError(null)
    try {
      const res = await fetch('/api/admin/google-ads/packages')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load packages')
      setPackages(data.packages || [])
    } catch (e) {
      setPackageError(e instanceof Error ? e.message : 'Failed to load packages')
    } finally {
      setLoadingPackages(false)
    }
  }, [])

  const loadParticipants = useCallback(async () => {
    setLoadingParticipants(true)
    setParticipantError(null)
    try {
      const res = await fetch('/api/admin/google-ads/participants')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load participants')
      setParticipants(data.participants || [])
    } catch (e) {
      setParticipantError(e instanceof Error ? e.message : 'Failed to load participants')
    } finally {
      setLoadingParticipants(false)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      const list = (data.users || []).map((u: { id: string; email: string | null; full_name: string | null }) => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
      }))
      setUsers(list)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    loadPackages()
    loadParticipants()
    loadUsers()
  }, [loadPackages, loadParticipants, loadUsers])

  const activePackages = useMemo(() => packages.filter((p) => p.is_active), [packages])

  const participantStats = useMemo(() => {
    let pendingPayment = 0
    let paidActive = 0
    for (const row of participants) {
      const sub = normalizeSubscription(row)
      const st = sub?.status
      if (st === 'pending_payment') pendingPayment++
      const eff =
        sub &&
        effectivePackageStatus({
          status: sub.status,
          current_period_start: sub.current_period_start,
          current_period_end: sub.current_period_end,
        })
      if (eff === 'active') paidActive++
    }
    return { total: participants.length, pendingPayment, active: paidActive }
  }, [participants])

  const USER_LIST_PREVIEW = 100

  const filteredUsers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase()
    if (!q) return users.slice(0, USER_LIST_PREVIEW)
    return users.filter(
      (u) =>
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        u.id.toLowerCase().includes(q)
    )
  }, [users, userSearchQuery])

  const selectedParticipantsResolved = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u]))
    return selectedParticipantUserIds.map((id) => map.get(id)).filter(Boolean) as Array<{
      id: string
      email: string | null
      full_name: string | null
    }>
  }, [users, selectedParticipantUserIds])

  useEffect(() => {
    setUserHighlight(0)
  }, [userSearchQuery, userPickerOpen])

  useEffect(() => {
    if (!partModal || !userPickerOpen) return
    function handlePointerDown(e: MouseEvent) {
      if (userComboRef.current && !userComboRef.current.contains(e.target as Node)) {
        setUserPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [partModal, userPickerOpen])

  function openParticipantModal() {
    setSelectedParticipantUserIds([])
    setNewNotes('')
    setUserSearchQuery('')
    setUserPickerOpen(false)
    setUserHighlight(0)
    setPartModal(true)
  }

  function closeParticipantModal() {
    setPartModal(false)
    setSelectedParticipantUserIds([])
    setNewNotes('')
    setUserSearchQuery('')
    setUserPickerOpen(false)
    setUserHighlight(0)
  }

  /** Toggle user in multi-selection; dropdown stays open for quick picks. */
  function toggleParticipantUser(u: { id: string; email: string | null; full_name: string | null }) {
    setSelectedParticipantUserIds((prev) =>
      prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
    )
  }

  function removeParticipantUserFromSelection(userId: string) {
    setSelectedParticipantUserIds((prev) => prev.filter((id) => id !== userId))
  }

  function openPackageModal(row?: PackageRow) {
    if (row) {
      setEditingPkgId(row.id)
      setPkgName(row.name)
      setPkgPeriod(row.billing_period)
      setPkgPrice(String(row.price_amount))
      setPkgActive(row.is_active)
    } else {
      setEditingPkgId(null)
      setPkgName('')
      setPkgPeriod('monthly')
      setPkgPrice('')
      setPkgActive(true)
    }
    setPkgModal(true)
  }

  async function savePackage(e: React.FormEvent) {
    e.preventDefault()
    setPkgSaving(true)
    try {
      const price = parseFloat(pkgPrice)
      if (Number.isNaN(price) || price < 0) throw new Error('Invalid price')
      const payload = {
        name: pkgName.trim(),
        billing_period: pkgPeriod,
        price_amount: price,
        is_active: pkgActive,
      }
      const res = editingPkgId
        ? await fetch(`/api/admin/google-ads/packages/${editingPkgId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        : await fetch('/api/admin/google-ads/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setPkgModal(false)
      await loadPackages()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setPkgSaving(false)
    }
  }

  async function deletePackage(id: string) {
    if (!confirm('Delete this package? Only allowed if no subscriptions use it.')) return
    const res = await fetch(`/api/admin/google-ads/packages/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(data.error || 'Delete failed')
      return
    }
    await loadPackages()
  }

  function userLabelForId(userId: string) {
    const u = users.find((x) => x.id === userId)
    return u ? formatUserOption(u) : userId
  }

  async function saveParticipant(e: React.FormEvent) {
    e.preventDefault()
    if (selectedParticipantUserIds.length === 0) return
    setPartSaving(true)
    const notes = newNotes.trim() || null
    const failed: { userId: string; message: string }[] = []
    const idsToAdd = [...new Set(selectedParticipantUserIds)]
    const attempted = idsToAdd.length
    try {
      for (const user_id of idsToAdd) {
        const res = await fetch('/api/admin/google-ads/participants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id,
            notes,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          failed.push({ userId: user_id, message: (data.error as string) || res.statusText || 'Failed' })
        }
      }

      await loadParticipants()

      if (failed.length === 0) {
        closeParticipantModal()
        return
      }

      const failedIds = new Set(failed.map((f) => f.userId))
      setSelectedParticipantUserIds(idsToAdd.filter((id) => failedIds.has(id)))

      const lines = failed.map((f) => `${userLabelForId(f.userId)}: ${f.message}`)
      const added = attempted - failed.length
      if (added > 0) {
        alert(`Added ${added} participant(s).\n\nCould not add:\n${lines.join('\n')}`)
      } else {
        alert(`Could not add participants:\n${lines.join('\n')}`)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add participants')
    } finally {
      setPartSaving(false)
    }
  }

  async function confirmPayment(participantId: string) {
    setConfirmingId(participantId)
    try {
      const res = await fetch(`/api/admin/google-ads/participants/${participantId}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Confirm failed')
      await loadParticipants()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Confirm failed')
    } finally {
      setConfirmingId(null)
    }
  }

  async function removeParticipant(id: string) {
    if (!confirm('Remove this participant and subscription?')) return
    const res = await fetch(`/api/admin/google-ads/participants/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(data.error || 'Remove failed')
      return
    }
    await loadParticipants()
  }

  function openEditParticipant(p: ParticipantRow) {
    setEditParticipantRow(p)
    setEditNotes(p.notes || '')
    setEditPgCode(p.pg_code || '')
    setEditPublicUsername(p.public_username || '')
    const sub = normalizeSubscription(p)
    setEditPackageId(sub?.package_id || '')
    const st = sub?.status
    if (st === 'active' || st === 'expired' || st === 'cancelled' || st === 'pending_payment') {
      setEditStatus(st)
    } else {
      setEditStatus('active')
    }
    setEditPeriodStart(sub?.current_period_start ? toDatetimeLocalValue(sub.current_period_start) : '')
    setEditPeriodEnd(sub?.current_period_end ? toDatetimeLocalValue(sub.current_period_end) : '')
    setEditPendingRenewalId(sub?.pending_renewal_package_id || '')
    setEditExternalPaymentId((sub?.external_payment_id && String(sub.external_payment_id).trim()) || '')
    setEditParticipantOpen(true)
  }

  function closeEditParticipant() {
    setEditParticipantOpen(false)
    setEditParticipantRow(null)
  }

  async function saveEditParticipant(e: React.FormEvent) {
    e.preventDefault()
    if (!editParticipantRow || !editPackageId) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/admin/google-ads/participants/${editParticipantRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: editNotes.trim() || null,
          pg_code: editPgCode.trim() || null,
          public_username: editPublicUsername.trim() || null,
          subscription: {
            package_id: editPackageId,
            status: editStatus,
            current_period_start: editPeriodStart.trim() ? new Date(editPeriodStart).toISOString() : null,
            current_period_end: editPeriodEnd.trim() ? new Date(editPeriodEnd).toISOString() : null,
            pending_renewal_package_id: editPendingRenewalId.trim() || null,
            external_payment_id: editExternalPaymentId.trim() || null,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Update failed')
      await loadParticipants()
      closeEditParticipant()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Google Ads campaign</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage pakej (monthly/yearly, price only) and enrolled users. Payment confirmation prepares for Bayarcash.
          </p>
        </div>
      </div>

      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab('packages')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${tab === 'packages' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-slate-50'
            }`}
        >
          Pakej
        </button>
        <button
          type="button"
          onClick={() => setTab('participants')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${tab === 'participants' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-slate-50'
            }`}
        >
          Participants
        </button>
      </div>

      {tab === 'packages' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Packages</h2>
            <button
              type="button"
              onClick={() => openPackageModal()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-slate-800 active:scale-[0.98]"
            >
              Add package
            </button>
          </div>
          {packageError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{packageError}</div>
          )}
          {loadingPackages ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : packages.length === 0 ? (
            <p className="text-sm text-slate-600">No packages yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {packages.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-sm text-slate-600">
                      {p.billing_period === 'monthly' ? 'Monthly' : 'Yearly'} · {fmtMoney(Number(p.price_amount), p.currency)}
                      {!p.is_active && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Inactive</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openPackageModal(p)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePackage(p.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'participants' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Participants</h2>
                {!loadingParticipants && participants.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-700 ring-1 ring-slate-200/80">
                    {participantStats.total}
                  </span>
                )}
              </div>
              {!loadingParticipants && participants.length > 0 && (
                <p className="text-xs text-slate-500">
                  <span className="tabular-nums text-emerald-700">{participantStats.active} active pakej</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="tabular-nums text-amber-800">{participantStats.pendingPayment} pending payment</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={openParticipantModal}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-slate-900/10 transition hover:bg-slate-800 active:scale-[0.98]"
            >
              Add participant
            </button>
          </div>
          {participantError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{participantError}</div>
          )}
          {loadingParticipants ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50/90 p-5 ring-1 ring-slate-900/5"
                >
                  <div className="h-4 w-2/3 rounded-md bg-slate-200" />
                  <div className="mt-3 h-3 w-1/2 rounded bg-slate-200/90" />
                  <div className="mt-6 space-y-2">
                    <div className="h-3 w-full rounded bg-slate-200/70" />
                    <div className="h-3 w-5/6 rounded bg-slate-200/70" />
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-2">
                    <div className="h-9 rounded-lg bg-slate-200/80" />
                    <div className="h-9 rounded-lg bg-slate-200/80" />
                    <div className="h-9 rounded-lg bg-slate-200/80" />
                    <div className="h-9 rounded-lg bg-slate-200/80" />
                  </div>
                </div>
              ))}
            </div>
          ) : participants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center">
              <p className="text-sm font-medium text-slate-700">No participants yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Add users to allow them to join the campaign; they choose a pakej and pay on their Google Ads page.
              </p>
              <button
                type="button"
                onClick={openParticipantModal}
                className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-slate-800"
              >
                Add participant
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {participants.map((p) => {
                const sub = normalizeSubscription(p)
                const pkg = sub?.package
                const pkgOne = Array.isArray(pkg) ? pkg[0] : pkg
                const status = sub?.status
                return (
                  <article
                    key={p.id}
                    className="group flex flex-col rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-5 shadow-sm ring-1 ring-slate-900/[0.04] transition duration-200 hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-slate-900" title={p.email || undefined}>
                          {p.email || 'No email'}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400" title={p.user_id}>
                          {p.user_id}
                        </p>
                      </div>
                      {sub ? (
                        status && (
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${subscriptionStatusBadgeClass(status)}`}
                          >
                            {humanizeSubscriptionStatus(status)}
                          </span>
                        )
                      ) : (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/90">
                          Awaiting pakej
                        </span>
                      )}
                    </div>

                    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                      <dt className="text-slate-500">Pakej</dt>
                      <dd className="min-w-0 font-medium text-slate-900">
                        {pkgOne?.name ?? '—'}
                        {pkgOne && (
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            {fmtMoney(Number(pkgOne.price_amount), pkgOne.currency)} ·{' '}
                            {pkgOne.billing_period === 'monthly' ? 'Monthly' : 'Yearly'}
                          </span>
                        )}
                      </dd>
                      <dt className="text-slate-500">Period ends</dt>
                      <dd className="tabular-nums text-slate-800">
                        {sub?.current_period_end
                          ? new Date(sub.current_period_end).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </dd>
                    </dl>

                    {!sub && (
                      <p className="mt-2 text-xs text-slate-500">
                        They choose a pakej and pay on their Google Ads page.
                      </p>
                    )}

                    {sub?.pending_renewal_package_id && (
                      <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950">
                        Renewal pakej chosen — confirm payment to apply the next term.
                      </div>
                    )}

                    {p.notes && (
                      <div className="mt-3 rounded-xl bg-slate-100/80 px-3 py-2 text-xs leading-relaxed text-slate-600">
                        <span className="font-medium text-slate-700">Notes · </span>
                        {p.notes}
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => openEditParticipant(p)}
                        className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm font-medium text-violet-900 transition hover:bg-violet-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={confirmingId === p.id}
                        onClick={() => confirmPayment(p.id)}
                        className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {confirmingId === p.id ? 'Confirming…' : 'Confirm payment'}
                      </button>
                      {p.hasPaidReceipt ? (
                        <a
                          href={`/api/admin/google-ads/participants/${p.id}/receipt`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-900/5 transition hover:bg-slate-50"
                        >
                          Download receipt
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Available after at least one paid payment"
                          className="inline-flex min-h-[40px] cursor-not-allowed items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-sm font-medium text-slate-400"
                        >
                          Download receipt
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeParticipant(p.id)}
                        className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {pkgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm top-[-2rem]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{editingPkgId ? 'Edit package' : 'New package'}</h3>
            <form onSubmit={savePackage} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Name</label>
                <input
                  value={pkgName}
                  onChange={(e) => setPkgName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-blue-200 focus:border-blue-500 focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Billing</label>
                <select
                  value={pkgPeriod}
                  onChange={(e) => setPkgPeriod(e.target.value as 'monthly' | 'yearly')}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="test">Test</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Price</label>
                <input
                  value={pkgPrice}
                  onChange={(e) => setPkgPrice(e.target.value)}
                  required
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              {editingPkgId && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={pkgActive} onChange={(e) => setPkgActive(e.target.checked)} />
                  Active (listed for renewal)
                </label>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPkgModal(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pkgSaving}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {pkgSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editParticipantOpen && editParticipantRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm top-[-2rem]">
          <div className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Edit participant</h3>
            <p className="mt-1 truncate text-sm text-slate-600" title={editParticipantRow.email || editParticipantRow.user_id}>
              {editParticipantRow.email || 'No email'}
            </p>
            <p className="truncate font-mono text-[11px] text-slate-400" title={editParticipantRow.user_id}>
              {editParticipantRow.user_id}
            </p>
            <form onSubmit={saveEditParticipant} className="mt-5 space-y-4">
              <div>
                <label htmlFor="edit-participant-notes" className="block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  id="edit-participant-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="Internal notes…"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-pg-code" className="block text-sm font-medium text-slate-700">
                    PG code (public listing)
                  </label>
                  <input
                    id="edit-pg-code"
                    type="text"
                    value={editPgCode}
                    onChange={(e) => setEditPgCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="Shown on landing agent grid"
                  />
                </div>
                <div>
                  <label htmlFor="edit-public-username" className="block text-sm font-medium text-slate-700">
                    Public username (Username PGO)
                  </label>
                  <input
                    id="edit-public-username"
                    type="text"
                    value={editPublicUsername}
                    onChange={(e) => setEditPublicUsername(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="Card title & Public Gold slug"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="edit-participant-pakej" className="block text-sm font-medium text-slate-700">
                  Pakej
                </label>
                <select
                  id="edit-participant-pakej"
                  value={editPackageId}
                  onChange={(e) => setEditPackageId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Select package…</option>
                  {packages.map((pk) => (
                    <option key={pk.id} value={pk.id}>
                      {pk.name} ({fmtMoney(Number(pk.price_amount), pk.currency)}) ·{' '}
                      {pk.billing_period === 'monthly' ? 'Monthly' : 'Yearly'}
                      {!pk.is_active ? ' — inactive' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-participant-status" className="block text-sm font-medium text-slate-700">
                  Subscription status
                </label>
                <select
                  id="edit-participant-status"
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as 'active' | 'expired' | 'cancelled' | 'pending_payment')
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="active">Active</option>
                  <option value="pending_payment">Pending payment</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-period-start" className="block text-sm font-medium text-slate-700">
                    Period start
                  </label>
                  <input
                    id="edit-period-start"
                    type="datetime-local"
                    value={editPeriodStart}
                    onChange={(e) => setEditPeriodStart(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label htmlFor="edit-period-end" className="block text-sm font-medium text-slate-700">
                    Period end
                  </label>
                  <input
                    id="edit-period-end"
                    type="datetime-local"
                    value={editPeriodEnd}
                    onChange={(e) => setEditPeriodEnd(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="edit-pending-renewal" className="block text-sm font-medium text-slate-700">
                  Pending renewal pakej
                </label>
                <select
                  id="edit-pending-renewal"
                  value={editPendingRenewalId}
                  onChange={(e) => setEditPendingRenewalId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">None</option>
                  {packages
                    .filter((pk) => pk.is_active)
                    .map((pk) => (
                      <option key={pk.id} value={pk.id}>
                        {pk.name} ({fmtMoney(Number(pk.price_amount), pk.currency)})
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Cleared when payment is confirmed.</p>
              </div>
              <div>
                <label htmlFor="edit-external-payment-id" className="block text-sm font-medium text-slate-700">
                  External payment ID (Bayarcash)
                </label>
                <input
                  id="edit-external-payment-id"
                  type="text"
                  value={editExternalPaymentId}
                  onChange={(e) => setEditExternalPaymentId(e.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="Optional reference from gateway"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditParticipant}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving || !editPackageId}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {partModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm top-[-2rem]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Add participant</h3>
            <p className="mt-1 text-sm text-slate-600">
              Pick one or more users and optional notes (shared by everyone in this batch). Click a row again to deselect.
              Participants choose their own pakej and pay on the Google Ads page — you only grant access to the campaign.
            </p>
            <form onSubmit={saveParticipant} className="mt-4 space-y-4">
              <div ref={userComboRef} className="relative">
                <label htmlFor="participant-user-search" className="block text-sm font-medium text-slate-700">
                  Users
                </label>
                {selectedParticipantsResolved.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedParticipantsResolved.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-3 pr-1 text-xs font-medium text-emerald-950"
                      >
                        <span className="min-w-0 truncate">{formatUserOption(u)}</span>
                        <button
                          type="button"
                          onClick={() => removeParticipantUserFromSelection(u.id)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-emerald-800 transition hover:bg-emerald-200"
                          aria-label={`Remove ${formatUserOption(u)}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </span>
                  <input
                    id="participant-user-search"
                    type="search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    role="combobox"
                    aria-expanded={userPickerOpen}
                    aria-controls="participant-user-listbox"
                    aria-activedescendant={
                      userPickerOpen && filteredUsers[userHighlight]
                        ? `participant-user-opt-${filteredUsers[userHighlight].id}`
                        : undefined
                    }
                    value={userSearchQuery}
                    onChange={(e) => {
                      setUserSearchQuery(e.target.value)
                      setUserPickerOpen(true)
                    }}
                    onFocus={() => setUserPickerOpen(true)}
                    onKeyDown={(e) => {
                      if (!userPickerOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                        setUserPickerOpen(true)
                        return
                      }
                      if (e.key === 'Escape') {
                        setUserPickerOpen(false)
                        return
                      }
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setUserHighlight((i) => Math.min(i + 1, Math.max(filteredUsers.length - 1, 0)))
                        return
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setUserHighlight((i) => Math.max(i - 1, 0))
                        return
                      }
                      if (e.key === 'Enter' && userPickerOpen && filteredUsers.length > 0) {
                        e.preventDefault()
                        const u = filteredUsers[userHighlight] ?? filteredUsers[0]
                        if (u) toggleParticipantUser(u)
                      }
                    }}
                    placeholder={
                      selectedParticipantsResolved.length > 0
                        ? 'Add or remove users…'
                        : 'Search by email, name, or user ID…'
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                {userPickerOpen && (
                  <ul
                    id="participant-user-listbox"
                    role="listbox"
                    aria-multiselectable="true"
                    className="absolute z-[60] mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
                  >
                    {!userSearchQuery.trim() && users.length > USER_LIST_PREVIEW ? (
                      <li className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                        Showing first {USER_LIST_PREVIEW} users — type to search all.
                      </li>
                    ) : null}
                    {filteredUsers.length === 0 ? (
                      <li className="px-3 py-2.5 text-sm text-slate-500">No users match your search.</li>
                    ) : (
                      filteredUsers.map((u, idx) => {
                        const isSel = selectedParticipantUserIds.includes(u.id)
                        return (
                          <li
                            key={u.id}
                            id={`participant-user-opt-${u.id}`}
                            role="option"
                            aria-selected={isSel}
                            className={`flex cursor-pointer items-start gap-2 px-3 py-2.5 text-sm transition ${idx === userHighlight ? 'bg-blue-50 text-blue-950' : 'text-slate-800 hover:bg-slate-50'
                              }`}
                            onMouseEnter={() => setUserHighlight(idx)}
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => toggleParticipantUser(u)}
                          >
                            <span
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSel ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'
                                }`}
                              aria-hidden
                            >
                              {isSel ? (
                                <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{u.email || u.id}</span>
                              {u.full_name && <span className="block text-xs text-slate-500">{u.full_name}</span>}
                            </span>
                          </li>
                        )
                      })
                    )}
                  </ul>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Notes (optional)</label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeParticipantModal}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={partSaving || selectedParticipantUserIds.length === 0}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {partSaving
                    ? 'Adding…'
                    : selectedParticipantUserIds.length > 1
                      ? `Add ${selectedParticipantUserIds.length} participants`
                      : 'Add participant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
