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

type Props = {
  customerId: string
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

export function CustomerChecklistPanel({ customerId }: Props) {
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<ChecklistStepView[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [programSlug, setProgramSlug] = useState('kaya_emas_2026')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/checklist`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load checklist')
      setSteps(Array.isArray(json.steps) ? json.steps : [])
      setSummary(json.summary ?? null)
      setProgramSlug(typeof json.program_slug === 'string' ? json.program_slug : 'kaya_emas_2026')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load checklist')
      setSteps([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  const setStepStatus = async (stepKey: string, status: ChecklistStepStatus) => {
    setSavingKey(stepKey)
    setError(null)
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          step_key: stepKey,
          status,
          program_slug: programSlug,
        }),
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
    summary && summary.total > 0
      ? Math.round((summary.completed / summary.total) * 100)
      : 0

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Checkpoint checklist
            </p>
            <h3 className="mt-0.5 text-base font-semibold text-slate-900">
              Checklist Kaya Dengan Emas 2026
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Track journey steps so follow-up tips are not repeated. WhatsApp send via workflow comes
              later.
            </p>
          </div>
          {summary ? (
            <p className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-indigo-800 ring-1 ring-indigo-200">
              {summary.completed}/{summary.total} selesai
            </p>
          ) : null}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading checklist…</p>
      ) : steps.length === 0 ? (
        <p className="text-sm text-slate-500">
          No checklist steps found. Apply migration <code>063_customer_checklist</code> if needed.
        </p>
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
                className={`rounded-xl border px-3 py-3 ${
                  done ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    disabled={busy || lockedByDirectDebit}
                    onClick={() =>
                      void setStepStatus(step.step_key, done ? 'pending' : 'completed')
                    }
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      done
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white text-transparent hover:border-indigo-400'
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
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
