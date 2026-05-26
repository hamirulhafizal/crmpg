'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/app/contexts/auth-context'
import { CampaignStatusBadge } from '@/app/dashboard/campaigns/_components/CampaignStatusBadge'
import {
  CampaignFullScreenPanel,
  type CampaignPanelMode,
} from '@/app/dashboard/campaigns/_components/CampaignFullScreenPanel'
import {
  buildCampaignPanelPath,
  panelModeFromSearchParams,
} from '@/app/lib/campaigns/campaign-panel-url'

type Row = {
  id: string
  name: string
  status: string
  trigger_type: string
  enrolled_count?: number
  sent_count?: number
  created_at: string
}

type ToastItem = { id: string; type: 'success' | 'error'; text: string }

function ActionIcon({
  children,
  className = 'h-4 w-4',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={`inline-block ${className} shrink-0`} aria-hidden>
      {children}
    </span>
  )
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
  const toastSeqRef = useRef(0)

  const panelMode = useMemo(() => panelModeFromSearchParams(searchParams), [searchParams])

  const pushToast = useCallback((type: 'success' | 'error', text: string) => {
    toastSeqRef.current += 1
    const id = `${Date.now()}-${toastSeqRef.current}`
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
        router.replace(buildCampaignPanelPath(next), { scroll: false })
        return
      }
      router.replace(buildCampaignPanelPath(next), { scroll: false })
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
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => replacePanel({ view: r.id })}
                              title="View campaign"
                              aria-label="View campaign"
                              className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <ActionIcon>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </ActionIcon>
                            </button>
                            {/* <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => replacePanel({ edit: r.id })}
                              title="Edit campaign"
                              aria-label="Edit campaign"
                              className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <ActionIcon>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                  />
                                </svg>
                              </ActionIcon>
                            </button> */}
                            {r.status !== 'active' ? (
                              <button
                                type="button"
                                disabled={busy === r.id}
                                onClick={() => void patchStatus(r.id, 'active')}
                                title={r.status === 'paused' ? 'Resume campaign' : 'Activate campaign'}
                                aria-label={r.status === 'paused' ? 'Resume campaign' : 'Activate campaign'}
                                className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                <ActionIcon>
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                                    />
                                  </svg>
                                </ActionIcon>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy === r.id}
                                onClick={() => void patchStatus(r.id, 'paused')}
                                title="Pause campaign"
                                aria-label="Pause campaign"
                                className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                              >
                                <ActionIcon>
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 4.5h3v15H6v-15zm9 0h3v15h-3v-15z" />
                                  </svg>
                                </ActionIcon>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void duplicate(r.id)}
                              title="Duplicate campaign"
                              aria-label="Duplicate campaign"
                              className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <ActionIcon>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9 9 0 009 9zM18.75 6.75h-9a9 9 0 00-9 9v9.75c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125v-9.75a9 9 0 00-9-9z"
                                  />
                                </svg>
                              </ActionIcon>
                            </button>
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void remove(r.id)}
                              title="Delete campaign"
                              aria-label="Delete campaign"
                              className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <ActionIcon>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                  />
                                </svg>
                              </ActionIcon>
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
