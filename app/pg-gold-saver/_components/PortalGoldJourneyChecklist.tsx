'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ChecklistStepStatus, ChecklistStepView } from '@/app/lib/customers/checklist'

type Summary = {
  total: number
  completed: number
  pending: number
  sent: number
  nextStepKey: string | null
}

function statusLabel(status: ChecklistStepStatus): string {
  switch (status) {
    case 'completed':
      return 'Selesai'
    case 'sent':
      return 'Dihantar'
    case 'skipped':
      return 'Skipped'
    default:
      return 'Belum'
  }
}

function statusClass(status: ChecklistStepStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-800'
    case 'sent':
      return 'bg-sky-100 text-sky-800'
    case 'skipped':
      return 'bg-slate-100 text-slate-600'
    default:
      return 'bg-amber-100 text-amber-900'
  }
}

export function PortalGoldJourneyChecklist() {
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<ChecklistStepView[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/customer-portal/checklist', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load checklist')
      setSteps(Array.isArray(json.steps) ? json.steps : [])
      setSummary(json.summary ?? null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load checklist')
      setSteps([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setStepStatus = async (stepKey: string, status: 'pending' | 'completed') => {
    setSavingKey(stepKey)
    setError(null)
    try {
      const res = await fetch('/api/customer-portal/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ step_key: stepKey, status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update step')
      setSteps(Array.isArray(json.steps) ? json.steps : [])
      setSummary(json.summary ?? null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update step')
    } finally {
      setSavingKey(null)
    }
  }

  const pct =
    summary && summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
              Gold Journey
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">
              Checklist Kaya Dengan Emas 2026
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Tandakan langkah yang sudah anda selesaikan. Dealer anda juga boleh lihat progress ini.
            </p>
          </div>
          {summary ? (
            <p className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
              {summary.completed}/{summary.total} selesai
            </p>
          ) : null}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100">
          <div
            className="h-full rounded-full bg-amber-600 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading checklist…</p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step) => {
            const done = step.status === 'completed' || step.status === 'skipped'
            const lockedByDirectDebit =
              step.auto_complete_source === 'direct_debit' &&
              step.status === 'completed' &&
              step.source === 'direct_debit'
            const busy = savingKey === step.step_key

            return (
              <li
                key={step.step_key}
                className={`rounded-2xl border px-4 py-3 shadow-sm ${
                  done ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    disabled={busy || lockedByDirectDebit}
                    onClick={() =>
                      void setStepStatus(step.step_key, done ? 'pending' : 'completed')
                    }
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      done
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white text-transparent hover:border-amber-400'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    aria-pressed={done}
                    aria-label={done ? `Unmark ${step.title_ms}` : `Mark ${step.title_ms} complete`}
                    title={
                      lockedByDirectDebit
                        ? 'Auto-completed from Direct Debit'
                        : done
                          ? 'Mark as not done'
                          : 'Mark as done'
                    }
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">{step.sort_order}.</span>
                      <p className="text-sm font-semibold text-slate-900">{step.title_ms}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(step.status)}`}
                      >
                        {statusLabel(step.status)}
                      </span>
                      {lockedByDirectDebit ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                          Auto · Direct Debit
                        </span>
                      ) : null}
                    </div>
                    {step.description ? (
                      <p className="mt-1 text-xs text-slate-500">{step.description}</p>
                    ) : null}
                    {busy ? <p className="mt-1 text-xs text-slate-400">Saving…</p> : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
