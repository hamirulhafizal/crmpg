'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type RotationQueueStatus = 'next' | 'waiting' | 'completed'

type AdminRotationQueueRow = {
  participant_id: string
  user_id: string
  displayName: string
  usernamePgo: string
  image_url: string
  pgcode: string
  queuePosition: number
  status: RotationQueueStatus
  lead_email: boolean
  email: string | null
  queue_sort_at: string | null
}

type AdminRotationSnapshot = {
  ok: boolean
  updatedAt: string
  hasManualQueueOrder?: boolean
  cycleComplete: boolean
  nextRecipient: {
    participant_id: string
    displayName: string
    usernamePgo: string
    image_url: string
    pgcode: string
  } | null
  queue: AdminRotationQueueRow[]
  stats: {
    total: number
    available: number
    completed: number
  }
}

const POLL_MS = 20_000

function statusLabel(status: RotationQueueStatus): string {
  if (status === 'next') return 'Next lead'
  if (status === 'completed') return 'Done this round'
  return 'Waiting'
}

function statusBadgeClass(status: RotationQueueStatus): string {
  if (status === 'next') return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
  if (status === 'completed') return 'bg-slate-100 text-slate-600 ring-slate-200'
  return 'bg-amber-50 text-amber-900 ring-amber-200'
}

function formatQueueTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function QueueRow({
  row,
  showPosition = true,
  actions,
}: {
  row: AdminRotationQueueRow
  showPosition?: boolean
  actions?: React.ReactNode
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${
        row.status === 'next'
          ? 'bg-emerald-50/80 ring-emerald-200'
          : row.status === 'completed'
            ? 'bg-slate-50 ring-slate-100'
            : 'bg-white ring-slate-100'
      }`}
    >
      {showPosition && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
          {row.queuePosition}
        </span>
      )}
      <img src={row.image_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{row.usernamePgo}</p>
        <p className="truncate text-xs text-slate-500">
          {row.email || row.pgcode}
          {row.queue_sort_at ? ` · paid ${formatQueueTime(row.queue_sort_at)}` : ''}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${statusBadgeClass(row.status)}`}
      >
        {statusLabel(row.status)}
      </span>
      {actions}
    </li>
  )
}

export function GoogleAdsAdminRotationPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AdminRotationSnapshot | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [waitingDraft, setWaitingDraft] = useState<AdminRotationQueueRow[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [undoingId, setUndoingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/google-ads/rotation-status', { cache: 'no-store' })
      const json = (await res.json().catch(() => ({}))) as AdminRotationSnapshot & { error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to load rotation')
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rotation')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      if (!editing && !saving && undoingId == null) void load()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [load, editing, saving, undoingId])

  const completedRows = useMemo(
    () => (data?.queue ?? []).filter((row) => row.status === 'completed'),
    [data?.queue]
  )

  const waitingRows = useMemo(
    () => (data?.queue ?? []).filter((row) => row.status !== 'completed'),
    [data?.queue]
  )

  const draftDirty = useMemo(() => {
    if (!editing) return false
    const originalIds = waitingRows.map((r) => r.participant_id).join(',')
    const draftIds = waitingDraft.map((r) => r.participant_id).join(',')
    return originalIds !== draftIds
  }, [editing, waitingDraft, waitingRows])

  const startEditing = () => {
    setWaitingDraft(waitingRows)
    setEditing(true)
    setActionError(null)
  }

  const cancelEditing = () => {
    setEditing(false)
    setWaitingDraft([])
    setActionError(null)
  }

  const saveQueueOrder = async () => {
    setSaving(true)
    setActionError(null)
    try {
      const res = await fetch('/api/admin/google-ads/rotation-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waitingParticipantIds: waitingDraft.map((r) => r.participant_id),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to save queue order')
      setEditing(false)
      setWaitingDraft([])
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save queue order')
    } finally {
      setSaving(false)
    }
  }

  const resetToPaymentOrder = async () => {
    if (!window.confirm('Reset waiting queue to payment-date order? Manual order will be cleared.')) return
    setSaving(true)
    setActionError(null)
    try {
      const res = await fetch('/api/admin/google-ads/rotation-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToPaymentOrder: true }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to reset queue order')
      setEditing(false)
      setWaitingDraft([])
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to reset queue order')
    } finally {
      setSaving(false)
    }
  }

  const undoLeadStatus = async (row: AdminRotationQueueRow) => {
    if (
      !window.confirm(
        `Undo lead for ${row.usernamePgo}? They will re-enter the waiting queue for this round.`
      )
    ) {
      return
    }
    setUndoingId(row.participant_id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/google-ads/participants/${row.participant_id}/lead-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_email: false }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to undo lead status')
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to undo lead status')
    } finally {
      setUndoingId(null)
    }
  }

  if (loading && !data) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Loading live lead rotation…</p>
      </section>
    )
  }

  if (error && !data) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
        <p className="text-sm font-medium text-red-900">Live lead rotation unavailable</p>
        <p className="mt-1 text-sm text-red-800">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50"
        >
          Retry
        </button>
      </section>
    )
  }

  if (!data) return null

  const { nextRecipient, queue, stats, cycleComplete, hasManualQueueOrder } = data
  const progressPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
  const displayWaiting = editing ? waitingDraft : waitingRows

  const headline = nextRecipient
    ? `Next GAP lead → ${nextRecipient.usernamePgo}`
    : cycleComplete
      ? 'Round complete — next lead starts a new cycle'
      : 'No active dealers in rotation'

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col gap-3 px-5 py-4 text-left sm:flex-row sm:items-start sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Live lead rotation</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">{headline}</h2>
          <p className="mt-1 text-xs text-slate-600">
            {hasManualQueueOrder ? 'Manual queue order' : 'Payment-date order'} · {stats.available} waiting ·{' '}
            {stats.completed} received this round
          </p>
          {stats.total > 0 && (
            <div className="mt-3 max-w-md">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                <span>
                  Round progress: {stats.completed}/{stats.total} received a lead
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-start">
          {hasManualQueueOrder && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
              Manual order
            </span>
          )}
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
            {stats.total} in rotation
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
            {stats.available} waiting
          </span>
          <span className="text-slate-500" aria-hidden>
            <svg
              className={`h-5 w-5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
      </button>

      <div className="flex items-center justify-between border-t border-emerald-100 px-5 py-2.5">
        <p className="text-xs text-slate-600">
          {expanded ? 'Manage queue order and undo mistaken leads' : 'Showing up next only'}
          {data.updatedAt ? ` · updated ${formatQueueTime(data.updatedAt)}` : ''}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {!expanded && nextRecipient && (
        <div className="flex items-center gap-3 bg-emerald-50/50 px-5 py-4">
          <img
            src={nextRecipient.image_url}
            alt=""
            className="h-12 w-12 rounded-full object-cover ring-2 ring-emerald-200"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Up next</p>
            <p className="font-semibold text-slate-900">{nextRecipient.usernamePgo}</p>
            <p className="text-xs text-slate-500">{nextRecipient.pgcode}</p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
          >
            View full queue
          </button>
        </div>
      )}

      {!expanded && !nextRecipient && (
        <div className="px-5 py-4">
          <p className="text-sm text-slate-500">
            {cycleComplete
              ? 'All participants received a lead this round. Expand to view the queue.'
              : 'No paid-active participants in rotation right now.'}
          </p>
          {queue.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View full queue
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="space-y-5 px-5 py-4">
          {actionError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Manage rotation</p>
            <div className="flex flex-wrap gap-2">
              {!editing ? (
                <>
                  {waitingRows.length > 1 && (
                    <button
                      type="button"
                      onClick={startEditing}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Edit waiting order
                    </button>
                  )}
                  {hasManualQueueOrder && (
                    <button
                      type="button"
                      onClick={() => void resetToPaymentOrder()}
                      disabled={saving}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                    >
                      Reset to payment order
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={saving}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveQueueOrder()}
                    disabled={saving || !draftDirty}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save order'}
                  </button>
                </>
              )}
            </div>
          </div>

          {completedRows.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Done this round</p>
              <ul className="mt-2 space-y-2">
                {completedRows.map((row) => (
                  <QueueRow
                    key={row.participant_id}
                    row={row}
                    actions={
                      <button
                        type="button"
                        onClick={() => void undoLeadStatus(row)}
                        disabled={undoingId === row.participant_id || saving || editing}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        {undoingId === row.participant_id ? 'Undoing…' : 'Undo lead'}
                      </button>
                    }
                  />
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Waiting queue {editing ? '(drag order with arrows)' : ''}
            </p>
            {displayWaiting.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No waiting participants.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {displayWaiting.map((row, index) => (
                  <QueueRow
                    key={row.participant_id}
                    row={{ ...row, queuePosition: index + 1 }}
                    showPosition
                    actions={
                      editing ? (
                        <div className="flex shrink-0 flex-col gap-1">
                          <button
                            type="button"
                            aria-label={`Move ${row.usernamePgo} up`}
                            disabled={index === 0 || saving}
                            onClick={() => setWaitingDraft((prev) => moveItem(prev, index, index - 1))}
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${row.usernamePgo} down`}
                            disabled={index === displayWaiting.length - 1 || saving}
                            onClick={() => setWaitingDraft((prev) => moveItem(prev, index, index + 1))}
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            ↓
                          </button>
                        </div>
                      ) : null
                    }
                  />
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-slate-600">
            Manual order clears when the round resets. Live refresh pauses while editing.
          </p>
        </div>
      )}
    </section>
  )
}
