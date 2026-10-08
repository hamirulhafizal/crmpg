'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatedSheetDialog } from '@/app/components/AnimatedSheetDialog'
import { CampaignStatusBadge } from '@/app/dashboard/campaigns/_components/CampaignStatusBadge'
import type { CampaignStatus } from '@/app/lib/campaigns/types'
import {
  enrollParamsFromDefinition,
  messageCapFromCustomers,
  resolveDailyCustomersPerDay,
} from '@/app/lib/campaigns/daily-customer-cap'
import {
  resolveCampaignTriggerSchedule,
  triggerScheduleDisplayLabel,
} from '@/app/lib/campaigns/trigger-schedule'
import { parseWorkflowDefinition } from '@/app/lib/workflows/api-payload'
import { isCampaignSendStepType } from '@/app/lib/workflows/send-step-types'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

type WorkflowRow = {
  id: string
  name: string
  description?: string | null
  status: string
  enrolled_count?: number
  sent_count?: number
  sent_today_count?: number
  daily_send_limit?: number
  trigger_type?: string | null
  timezone?: string | null
  workflow_definition?: unknown
  start_at?: string | null
}

type SendStepSummary = {
  stepOrder: number
  kind: 'text' | 'image'
}

type WorkflowTab = 'active' | 'paused' | 'draft'

const TABS: { id: WorkflowTab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Pause' },
  { id: 'draft', label: 'Draft' },
]

/** Approximate card height for skeleton + scroll viewport (~3–4 cards). */
const CARD_H = '11.5rem'
const CARD_GAP = '0.75rem'

function canToggleStatus(status: string): boolean {
  const s = status.toLowerCase()
  return s === 'active' || s === 'paused' || s === 'draft'
}

function hasEditableTrigger(row: WorkflowRow): boolean {
  const def = parseWorkflowDefinition(row.workflow_definition)
  return Boolean(def?.nodes.some((n) => String(n.type).startsWith('crm.trigger.')))
}

function normalizePositiveInt(value: unknown, fallback = 100): number {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n < 1) return fallback
  return n
}

function withTriggerRunTime(def: WorkflowDefinition, runTime: string): WorkflowDefinition {
  return {
    ...def,
    nodes: def.nodes.map((node) => {
      if (!String(node.type).startsWith('crm.trigger.')) return node
      return {
        ...node,
        parameters: {
          ...node.parameters,
          run_time: runTime,
        },
      }
    }),
  }
}

/** Persist customer target; message cap = customers × steps (cron still uses daily_send_limit). */
function withEnrollDailyCustomers(
  def: WorkflowDefinition,
  customers: number,
  messageCap: number
): WorkflowDefinition {
  let touched = false
  const nodes = def.nodes.map((node) => {
    if (String(node.type) !== 'crm.enroll.queue') return node
    touched = true
    return {
      ...node,
      parameters: {
        ...node.parameters,
        daily_customers_per_day: customers,
        daily_send_limit: messageCap,
      },
    }
  })
  return touched ? { ...def, nodes } : def
}

function listSendSteps(row: WorkflowRow): SendStepSummary[] {
  const def = parseWorkflowDefinition(row.workflow_definition)
  if (!def) return []
  return def.nodes
    .filter((n) => isCampaignSendStepType(String(n.type)) && n.parameters?.is_active !== false)
    .map((n) => ({
      stepOrder: Math.max(1, Number(n.parameters?.step_order ?? 1)),
      kind: n.type === 'crm.whatsapp.send_image' ? ('image' as const) : ('text' as const),
    }))
    .sort((a, b) => a.stepOrder - b.stepOrder)
}

type Props = {
  open: boolean
  onClose: () => void
  onActiveCountChange?: (delta: number) => void
}

export function WorkflowListDialog({ open, onClose, onActiveCountChange }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rows, setRows] = useState<WorkflowRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [savingCapId, setSavingCapId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<WorkflowTab>('active')
  /** Local draft strings while editing daily cap (commit on blur / Enter). */
  const [capDrafts, setCapDrafts] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setActionError(null)
    setToast(null)
    setActiveTab('active')
    setRows([])
    setCapDrafts({})
    ;(async () => {
      try {
        const res = await fetch('/api/campaigns')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load workflows')
        if (cancelled) return
        setRows(Array.isArray(json.data) ? json.data : [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load workflows')
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const counts = useMemo(() => {
    let active = 0
    let paused = 0
    let draft = 0
    for (const row of rows) {
      const s = row.status.toLowerCase()
      if (s === 'active') active += 1
      else if (s === 'paused') paused += 1
      else if (s === 'draft') draft += 1
    }
    return { active, paused, draft }
  }, [rows])

  const filtered = useMemo(() => {
    return rows
      .filter((row) => row.status.toLowerCase() === activeTab)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [rows, activeTab])

  const patchStatus = async (row: WorkflowRow, nextStatus: 'active' | 'paused') => {
    const prevStatus = row.status.toLowerCase()
    if (prevStatus === nextStatus) return

    setBusyId(row.id)
    setActionError(null)
    try {
      const res = await fetch(`/api/campaigns/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update workflow')
      const updatedStatus = String(json.data?.status || nextStatus)
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: updatedStatus } : r)))

      if (prevStatus !== 'active' && updatedStatus === 'active') {
        onActiveCountChange?.(1)
      } else if (prevStatus === 'active' && updatedStatus !== 'active') {
        onActiveCountChange?.(-1)
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update workflow')
    } finally {
      setBusyId(null)
    }
  }

  const patchRunTime = async (row: WorkflowRow, runTime: string) => {
    const def = parseWorkflowDefinition(row.workflow_definition)
    if (!def) {
      setActionError('Open the workflow editor to set a trigger time for this campaign.')
      return
    }

    setBusyId(row.id)
    setActionError(null)
    try {
      const nextDef = withTriggerRunTime(def, runTime)
      const res = await fetch(`/api/campaigns/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_definition: nextDef }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update trigger time')
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                ...json.data,
                workflow_definition: json.data?.workflow_definition ?? nextDef,
              }
            : r
        )
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update trigger time')
    } finally {
      setBusyId(null)
    }
  }

  const patchDailyCustomers = async (row: WorkflowRow, rawValue: string) => {
    const def = parseWorkflowDefinition(row.workflow_definition)
    const stepCount = Math.max(1, listSendSteps(row).length)
    const enrollParams = enrollParamsFromDefinition(def)
    const prevCustomers = resolveDailyCustomersPerDay(
      enrollParams,
      normalizePositiveInt(row.daily_send_limit),
      stepCount
    )
    const nextCustomers = normalizePositiveInt(rawValue, prevCustomers)
    const messageCap = messageCapFromCustomers(nextCustomers, stepCount)
    setCapDrafts((d) => {
      const { [row.id]: _, ...rest } = d
      return rest
    })
    // Skip only when customer target and message cap already match (cap may be stale after step edits).
    if (
      nextCustomers === prevCustomers &&
      normalizePositiveInt(row.daily_send_limit) === messageCap &&
      enrollParams?.daily_customers_per_day != null
    ) {
      return
    }

    setBusyId(row.id)
    setSavingCapId(row.id)
    setActionError(null)
    try {
      const body: Record<string, unknown> = { daily_send_limit: messageCap }
      if (def) {
        body.workflow_definition = withEnrollDailyCustomers(def, nextCustomers, messageCap)
      }
      const res = await fetch(`/api/campaigns/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update customer limit')
      setRows((prevRows) =>
        prevRows.map((r) =>
          r.id === row.id
            ? {
                ...r,
                ...json.data,
                daily_send_limit: normalizePositiveInt(json.data?.daily_send_limit, messageCap),
                workflow_definition:
                  json.data?.workflow_definition ?? body.workflow_definition ?? r.workflow_definition,
              }
            : r
        )
      )
      const label = row.name?.trim() || 'Workflow'
      showToast(
        'success',
        `Saved — ${label} will send to ${nextCustomers.toLocaleString()} customer${nextCustomers === 1 ? '' : 's'} per day`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update customer limit'
      setActionError(msg)
      showToast('error', msg)
    } finally {
      setBusyId(null)
      setSavingCapId(null)
    }
  }

  const handleToggle = (row: WorkflowRow) => {
    const isActive = row.status.toLowerCase() === 'active'
    void patchStatus(row, isActive ? 'paused' : 'active')
  }

  return (
    <AnimatedSheetDialog
      open={open}
      onClose={onClose}
      title="Your workflows"
      maxWidthClassName="max-w-lg"
      panelClassName="h-[min(85dvh,760px)] sm:h-[760px] sm:max-h-[min(90vh,760px)]"
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
      footer={
        <div className="flex items-center justify-between gap-2 px-6 py-4">
          <Link
            href="/dashboard/campaigns"
            onClick={onClose}
            className="text-sm font-medium text-violet-600 transition hover:text-violet-800"
          >
            Open Workflows
          </Link>
          {/* <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Close
          </button> */}
        </div>
      }
    >
      <div className="relative flex min-h-0 flex-1 flex-col px-6 pt-5 pb-5">
        {toast ? (
          <div
            role="status"
            aria-live="polite"
            className={`absolute top-3 right-4 left-4 z-20 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ring-black/5 ${
              toast.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.text}
          </div>
        ) : null}
        <div
          role="tablist"
          aria-label="Workflow status"
          className="grid h-12 shrink-0 grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
        >
          {TABS.map((tab) => {
            const selected = activeTab === tab.id
            const count =
              tab.id === 'active' ? counts.active : tab.id === 'paused' ? counts.paused : counts.draft
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`workflow-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-2 text-sm font-semibold transition ${
                  selected
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}{' '}
                <span className={selected ? 'text-slate-600' : 'text-slate-400'}>
                  {loading ? (
                    <span className="inline-block h-3 w-4 align-middle rounded bg-slate-200 animate-pulse" />
                  ) : (
                    count
                  )}
                </span>
              </button>
            )
          })}
        </div>

        {actionError ? (
          <div className="mt-4 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {actionError}
          </div>
        ) : null}

        {/* Viewport sized for ~4 cards; remaining items scroll. */}
        <div
          className="mt-4 shrink-0 overflow-y-auto overscroll-contain pb-[20dvh]"
          style={{ height: `calc(4 * ${CARD_H} + 3 * ${CARD_GAP})` }}
        >
          {loading ? (
            <ul className="space-y-3 pb-1" aria-busy="true" aria-label="Loading workflows">
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="animate-pulse rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  style={{ minHeight: CARD_H }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-3/4 max-w-[14rem] rounded bg-slate-200" />
                      <div className="h-3 w-full max-w-[18rem] rounded bg-slate-100" />
                      <div className="h-3 w-40 rounded bg-slate-100" />
                      <div className="h-3 w-28 rounded bg-slate-100" />
                      <div className="h-3 w-24 rounded bg-slate-100" />
                      <div className="h-3 w-20 rounded bg-slate-100" />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="h-5 w-14 rounded-full bg-slate-200" />
                      <div className="h-6 w-11 rounded-full bg-slate-200" />
                    </div>
                  </div>
                  <div className="mt-2.5 space-y-2 border-t border-slate-100 pt-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-3.5 w-3.5 rounded bg-slate-200" />
                      <div className="h-3 w-20 rounded bg-slate-200" />
                      <div className="h-7 w-24 rounded-lg bg-slate-100" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-28 rounded bg-slate-200" />
                      <div className="h-7 w-14 rounded-lg bg-slate-100" />
                      <div className="h-3 w-24 rounded bg-slate-100" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
              No workflows yet.{' '}
              <Link href="/dashboard/campaigns" onClick={onClose} className="font-semibold text-violet-600 underline">
                Create one
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div
              role="tabpanel"
              aria-labelledby={`workflow-tab-${activeTab}`}
              className="flex h-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600"
            >
              No {activeTab === 'paused' ? 'paused' : activeTab} workflows.
            </div>
          ) : (
            <ul
              role="tabpanel"
              aria-labelledby={`workflow-tab-${activeTab}`}
              className="space-y-3 pb-10"
            >
              {filtered.map((row) => {
                const isActive = row.status.toLowerCase() === 'active'
                const togglable = canToggleStatus(row.status)
                const busy = busyId === row.id
                const savingCap = savingCapId === row.id
                const schedule = resolveCampaignTriggerSchedule(row)
                const canEditTime = hasEditableTrigger(row)
                const runTimeEnabled = Boolean(schedule.run_time)
                const sendSteps = listSendSteps(row)
                const stepCount = Math.max(1, sendSteps.length)
                const customersPerDay = resolveDailyCustomersPerDay(
                  enrollParamsFromDefinition(parseWorkflowDefinition(row.workflow_definition)),
                  normalizePositiveInt(row.daily_send_limit),
                  stepCount
                )
                const sentToday = row.sent_today_count ?? 0
                const capInputValue = capDrafts[row.id] ?? String(customersPerDay)

                return (
                  <li
                    key={row.id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-violet-200 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/dashboard/campaigns/${row.id}`}
                        onClick={onClose}
                        className="min-w-0 flex-1"
                      >
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {row.name || 'Untitled workflow'}
                        </p>
                        {row.description ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{row.description}</p>
                        ) : null}
                        <p className="mt-1.5 text-xs text-slate-500">
                          {(row.enrolled_count ?? 0).toLocaleString()} enrolled ·{' '}
                          {(row.sent_count ?? 0).toLocaleString()} sent
                          <span className="text-slate-400">
                            {' '}
                            · {triggerScheduleDisplayLabel(schedule)}
                          </span>
                        </p>
                        {sendSteps.length > 0 ? (
                          <div className="mt-2 space-y-0.5">
                            {sendSteps.map((step) => (
                              <p key={`${row.id}-step-${step.stepOrder}`} className="text-[11px] text-slate-600">
                                Step {step.stepOrder} — {step.kind === 'image' ? 'Image' : 'Text'}
                              </p>
                            ))}
                            <p className="pt-0.5 text-[11px] font-medium text-slate-500">
                              {sendSteps.length} step{sendSteps.length === 1 ? '' : 's'} total
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-400">No message steps yet</p>
                        )}
                      </Link>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <CampaignStatusBadge status={(row.status as CampaignStatus) || 'draft'} />
                        {togglable ? (
                          <label
                            className={`inline-flex items-center gap-2 ${busy ? 'opacity-60' : 'cursor-pointer'}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[11px] font-medium text-slate-500">
                              {isActive ? 'On' : 'Off'}
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isActive}
                              aria-label={isActive ? `Pause ${row.name}` : `Enable ${row.name}`}
                              disabled={busy}
                              onClick={() => handleToggle(row)}
                              className={`relative h-6 w-11 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-wait ${
                                isActive ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 ${isActive ? 'left-[-2.4rem]' : 'left-[1.4rem]'} h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                  isActive ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </label>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className="mt-2.5 space-y-2 border-t border-slate-100 pt-2.5"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {canEditTime ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={runTimeEnabled}
                              disabled={busy}
                              onChange={(e) => {
                                void patchRunTime(row, e.target.checked ? schedule.run_time || '08:00' : '')
                              }}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            Run at time
                          </label>
                          {runTimeEnabled ? (
                            <div className="relative">
                              <input
                                type="time"
                                value={schedule.run_time}
                                disabled={busy}
                                onChange={(e) => {
                                  void patchRunTime(row, e.target.value)
                                }}
                                className="rounded-lg border border-slate-300 bg-white py-1.5 pr-8 pl-2.5 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
                                aria-label={`Run time for ${row.name}`}
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">No fixed time</span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Trigger: {triggerScheduleDisplayLabel(schedule)}. Edit time in the workflow editor.
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-700">
                        <span className="font-medium">Send this message to</span>
                        <span className="relative inline-flex items-center">
                          <input
                            id={`daily-cap-${row.id}`}
                            type="number"
                            min={1}
                            inputMode="numeric"
                            disabled={busy}
                            value={capInputValue}
                            onChange={(e) => {
                              const v = e.target.value
                              setCapDrafts((d) => ({ ...d, [row.id]: v }))
                            }}
                            onBlur={() => {
                              void patchDailyCustomers(
                                row,
                                capDrafts[row.id] ?? String(customersPerDay)
                              )
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              }
                            }}
                            className="w-14 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
                            aria-label={`Customers to message per day for ${row.name}`}
                            aria-busy={savingCap}
                          />
                          {savingCap ? (
                            <span
                              className="pointer-events-none absolute -right-5 top-1/2 -translate-y-1/2"
                              aria-hidden
                            >
                              <svg
                                className="h-3.5 w-3.5 animate-spin text-emerald-600"
                                viewBox="0 0 24 24"
                                fill="none"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                            </span>
                          ) : null}
                        </span>
                        <span className={`font-medium ${savingCap ? 'ml-4' : ''}`}>customers per day</span>
                        {savingCap ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                            Saving…
                          </span>
                        ) : (
                          <span className="w-full text-[11px] text-slate-500 sm:w-auto sm:ml-1">
                            · {sentToday.toLocaleString()} sent today
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </AnimatedSheetDialog>
  )
}
