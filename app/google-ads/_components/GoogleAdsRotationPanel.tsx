'use client'

import { useCallback, useEffect, useState } from 'react'

type RotationQueueStatus = 'next' | 'waiting' | 'completed'

type RotationSnapshot = {
  ok: boolean
  updatedAt: string
  cycleComplete: boolean
  nextRecipient: {
    participant_id: string
    displayName: string
    usernamePgo: string
    image_url: string
    pgcode: string
  } | null
  queue: Array<{
    participant_id: string
    user_id: string
    displayName: string
    usernamePgo: string
    image_url: string
    pgcode: string
    queuePosition: number
    status: RotationQueueStatus
    lead_email: boolean
    isYou: boolean
  }>
  stats: {
    total: number
    available: number
    completed: number
  }
  yours: {
    inRotation: boolean
    isYourTurn: boolean
    queuePosition: number | null
    waitingAhead: number
    status: RotationQueueStatus | null
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

export function GoogleAdsRotationPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<RotationSnapshot | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/google-ads/rotation-status', { cache: 'no-store' })
      const json = (await res.json().catch(() => ({}))) as RotationSnapshot & { error?: string }
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
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Loading live lead rotation…</p>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const { nextRecipient, queue, stats, yours, cycleComplete } = data
  const progressPct =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-900">Live lead rotation</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {nextRecipient
                ? `Next GAP lead → ${nextRecipient.usernamePgo}`
                : cycleComplete
                  ? 'Round complete — next lead starts a new cycle'
                  : 'No active dealers in rotation'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
          >
            Refresh
          </button>
        </div>

        {stats.total > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Round progress: {stats.completed}/{stats.total} received a lead
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {yours.inRotation ? (
        <div
          className={`px-5 py-4 ${
            yours.isYourTurn
              ? 'bg-emerald-50 border-b border-emerald-100'
              : 'bg-slate-50 border-b border-slate-100'
          }`}
        >
          {yours.isYourTurn ? (
            <p className="text-sm font-semibold text-emerald-900">
              It&apos;s your turn — the next GAP registration form will assign a lead to you.
            </p>
          ) : yours.status === 'completed' ? (
            <p className="text-sm text-slate-700">
              You already received a lead this round. You&apos;ll be back in line when the cycle resets.
            </p>
          ) : (
            <p className="text-sm text-slate-700">
              You are <span className="font-semibold text-slate-900">#{yours.queuePosition}</span> in line
              {yours.waitingAhead > 0 ? (
                <>
                  {' '}
                  — <span className="font-semibold">{yours.waitingAhead}</span> participant
                  {yours.waitingAhead === 1 ? '' : 's'} ahead of you
                </>
              ) : null}
              .
            </p>
          )}
        </div>
      ) : (
        <div className="border-b border-slate-100 bg-amber-50 px-5 py-4">
          <p className="text-sm text-amber-900">
            Your package is not in the active paid rotation pool. Renew or activate your subscription to
            receive GAP leads.
          </p>
        </div>
      )}

      {nextRecipient && (
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <img
            src={nextRecipient.image_url}
            alt=""
            className="h-12 w-12 rounded-full object-cover ring-2 ring-emerald-200"
          />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Up next</p>
            <p className="font-semibold text-slate-900">{nextRecipient.usernamePgo}</p>
            <p className="text-xs text-slate-500">{nextRecipient.pgcode}</p>
          </div>
        </div>
      )}

      <div className="px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">All participants (live turn)</p>
        {queue.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No paid-active participants in rotation right now.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {queue.map((row) => (
              <li
                key={row.participant_id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${
                  row.isYou
                    ? 'bg-blue-50/80 ring-blue-200'
                    : row.status === 'next'
                      ? 'bg-emerald-50/80 ring-emerald-200'
                      : 'bg-white ring-slate-100'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {row.queuePosition}
                </span>
                <img
                  src={row.image_url}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {row.usernamePgo}
                    {row.isYou ? (
                      <span className="ml-1.5 text-xs font-semibold text-blue-700">(You)</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-slate-500">{row.pgcode}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${statusBadgeClass(row.status)}`}
                >
                  {statusLabel(row.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          Updates every {POLL_MS / 1000}s · Order follows first payment date (earliest paid = first in line)
        </p>
      </div>
    </section>
  )
}
