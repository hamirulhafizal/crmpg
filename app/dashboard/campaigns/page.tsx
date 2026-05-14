'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/app/contexts/auth-context'
import { CampaignStatusBadge } from '@/app/dashboard/campaigns/_components/CampaignStatusBadge'
import {
  CampaignFullScreenPanel,
  type CampaignPanelMode,
} from '@/app/dashboard/campaigns/_components/CampaignFullScreenPanel'

type Row = {
  id: string
  name: string
  status: string
  trigger_type: string
  enrolled_count?: number
  sent_count?: number
  created_at: string
}

type ToastItem = { id: number; type: 'success' | 'error'; text: string }

function panelModeFromSearchParams(sp: URLSearchParams): CampaignPanelMode | null {
  if (sp.get('new') === '1') return 'create'
  const edit = sp.get('edit')
  if (edit) return { edit }
  const view = sp.get('view')
  if (view) return { view }
  return null
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Trigger</th>
            <th className="px-4 py-3 text-right">Enrolled</th>
            <th className="px-4 py-3 text-right">Sent</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td className="px-4 py-3">
                <div className="h-4 w-40 rounded bg-slate-200/80 animate-pulse" />
              </td>
              <td className="px-4 py-3">
                <div className="h-6 w-16 rounded-full bg-slate-200/80 animate-pulse" />
              </td>
              <td className="px-4 py-3">
                <div className="h-4 w-20 rounded bg-slate-200/70 animate-pulse" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-4 w-8 rounded bg-slate-200/70 animate-pulse" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-4 w-8 rounded bg-slate-200/70 animate-pulse" />
              </td>
              <td className="px-4 py-3">
                <div className="h-4 w-24 rounded bg-slate-200/70 animate-pulse" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto flex justify-end gap-2">
                  <div className="h-7 w-14 rounded-lg bg-slate-200/70 animate-pulse" />
                  <div className="h-7 w-14 rounded-lg bg-slate-200/70 animate-pulse" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CampaignsListInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const panelMode = useMemo(() => panelModeFromSearchParams(searchParams), [searchParams])

  const pushToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev, { id, type, text }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  const replacePanel = useCallback(
    (next: CampaignPanelMode | null) => {
      if (next === null) {
        router.replace('/dashboard/campaigns', { scroll: false })
        return
      }
      if (next === 'create') {
        router.replace('/dashboard/campaigns?new=1', { scroll: false })
        return
      }
      if ('edit' in next) {
        router.replace(`/dashboard/campaigns?edit=${encodeURIComponent(next.edit)}`, { scroll: false })
        return
      }
      router.replace(`/dashboard/campaigns?view=${encodeURIComponent(next.view)}`, { scroll: false })
    },
    [router]
  )

  const refetchList = useCallback(() => {
    if (!user) return
    ;(async () => {
      try {
        const res = await fetch('/api/campaigns')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed')
        setRows(json.data ?? [])
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Failed')
      }
    })()
  }, [user])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setListLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/campaigns')
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(json.error || 'Failed')
        setRows(json.data ?? [])
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed')
      } finally {
        if (!cancelled) setListLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const patchStatus = async (id: string, status: string) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: json.data.status } : r)))
      pushToast('success', status === 'active' ? 'Campaign activated.' : 'Campaign updated.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      setErr(msg)
      pushToast('error', msg)
    } finally {
      setBusy(null)
    }
  }

  const duplicate = async (id: string) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/campaigns/${id}/duplicate`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      const newId = json.data.id as string
      pushToast('success', 'Campaign duplicated. You can edit the copy.')
      replacePanel({ edit: newId })
      refetchList()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      setErr(msg)
      pushToast('error', msg)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this campaign?')) return
    setBusy(id)
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed')
      }
      setRows((prev) => prev.filter((r) => r.id !== id))
      pushToast('success', 'Campaign deleted.')
      if (panelMode && panelMode !== 'create') {
        const panelId = 'edit' in panelMode ? panelMode.edit : panelMode.view
        if (panelId === id) replacePanel(null)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      setErr(msg)
      pushToast('error', msg)
    } finally {
      setBusy(null)
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <svg
            className="mx-auto h-8 w-8 animate-spin text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="mt-4 text-slate-600">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {toasts.map((t, i) => (
        <div
          key={t.id}
          style={{ bottom: `${16 + (toasts.length - 1 - i) * 58}px` }}
          className={`fixed right-4 z-[970] max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ${
            t.type === 'success' ? 'bg-emerald-700 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {t.text}
        </div>
      ))}

      <CampaignFullScreenPanel
        panelMode={panelMode}
        onClose={() => replacePanel(null)}
        onNavigateEdit={(id) => replacePanel({ edit: id })}
        onNavigateView={(id) => replacePanel({ view: id })}
        pushToast={pushToast}
        onSaved={() => {
          refetchList()
        }}
      />

      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-2xl border border-slate-200/50 bg-white p-6 shadow-xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Campaigns</h1>
              <p className="mt-1 text-sm text-slate-600">Multi-step WhatsApp automation for your CRM audience.</p>
            </div>
            <button
              type="button"
              onClick={() => replacePanel('create')}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New campaign
            </button>
          </div>

          {err ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
          ) : null}

          {listLoading ? (
            <TableSkeleton />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Trigger</th>
                    <th className="px-4 py-3 text-right">Enrolled</th>
                    <th className="px-4 py-3 text-right">Sent</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        No campaigns yet. Create one to start enrolling customers.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <button
                            type="button"
                            onClick={() => replacePanel({ view: r.id })}
                            className="text-left text-blue-700 hover:underline"
                          >
                            {r.name}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <CampaignStatusBadge status={r.status as never} />
                        </td>
                        <td className="px-4 py-3 text-slate-700">{r.trigger_type}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.enrolled_count ?? 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.sent_count ?? 0}</td>
                        <td className="px-4 py-3 text-slate-600">{new Date(r.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => replacePanel({ view: r.id })}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 text-slate-900"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => replacePanel({ edit: r.id })}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 text-slate-900"
                            >
                              Edit
                            </button>
                            {r.status !== 'active' ? (
                              <button
                                type="button"
                                disabled={busy === r.id}
                                onClick={() => void patchStatus(r.id, 'active')}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                Activate
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy === r.id}
                                onClick={() => void patchStatus(r.id, 'paused')}
                                className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                              >
                                Pause
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void duplicate(r.id)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 text-slate-900"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void remove(r.id)}
                              className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function CampaignsSuspenseFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="h-10 w-32 animate-pulse rounded-xl bg-slate-200/80" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200/50 bg-white p-6 shadow-xl">
          <div className="mb-6 h-8 w-48 animate-pulse rounded-lg bg-slate-200/80" />
          <TableSkeleton />
        </div>
      </main>
    </div>
  )
}

export default function CampaignsListPage() {
  return (
    <Suspense fallback={<CampaignsSuspenseFallback />}>
      <CampaignsListInner />
    </Suspense>
  )
}
