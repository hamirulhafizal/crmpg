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
const CARD_H = '7.5rem'
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

type CardEditDraft = {
  runTimeEnabled: boolean
  runTime: string
  customers: string
}

type CardSaveState = 'idle' | 'saving' | 'saved' | 'error'

function committedCardEdit(row: WorkflowRow): CardEditDraft {
  const schedule = resolveCampaignTriggerSchedule(row)
  const stepCount = Math.max(1, listSendSteps(row).length)
  const customers = resolveDailyCustomersPerDay(
    enrollParamsFromDefinition(parseWorkflowDefinition(row.workflow_definition)),
    normalizePositiveInt(row.daily_send_limit),
    stepCount
  )
  return {
    runTimeEnabled: Boolean(schedule.run_time),
    runTime: schedule.run_time || '08:00',
    customers: String(customers),
  }
}

function isCardEditDirty(draft: CardEditDraft, committed: CardEditDraft): boolean {
  if (draft.runTimeEnabled !== committed.runTimeEnabled) return true
  if (draft.runTimeEnabled && draft.runTime !== committed.runTime) return true
  if (normalizePositiveInt(draft.customers, 0) !== normalizePositiveInt(committed.customers, 0)) {
    return true
  }
  // Allow dirty while typing incomplete number
  if (draft.customers.trim() !== committed.customers.trim()) return true
  return false
}

function SaveStateIcon({ state }: { state: CardSaveState }) {
  if (state === 'saving') {
    return (
      <svg className="h-4 w-4 animate-spin text-emerald-600" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    )
  }
  if (state === 'saved') {
    return (
      <svg className="h-4 w-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (state === 'error') {
    return (
      <svg className="h-4 w-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  }
  return null
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
  const [activeTab, setActiveTab] = useState<WorkflowTab>('active')
  /** Per-card local edits; Save commits to the API. */
  const [cardDrafts, setCardDrafts] = useState<Record<string, CardEditDraft>>({})
  const [cardSaveState, setCardSaveState] = useState<Record<string, CardSaveState>>({})
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
    const savedIds = Object.entries(cardSaveState)
      .filter(([, s]) => s === 'saved')
      .map(([id]) => id)
    if (savedIds.length === 0) return
    const t = window.setTimeout(() => {
      setCardSaveState((prev) => {
        const next = { ...prev }
        for (const id of savedIds) {
          if (next[id] === 'saved') next[id] = 'idle'
        }
        return next
      })
    }, 2200)
    return () => window.clearTimeout(t)
  }, [cardSaveState])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setActionError(null)
    setToast(null)
    setActiveTab('active')
    setRows([])
    setCardDrafts({})
    setCardSaveState({})
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

  const updateCardDraft = (row: WorkflowRow, patch: Partial<CardEditDraft>) => {
    const committed = committedCardEdit(row)
    setCardDrafts((prev) => {
      const base = prev[row.id] ?? committed
      const next = { ...base, ...patch }
      if (!isCardEditDirty(next, committed)) {
        const { [row.id]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [row.id]: next }
    })
    setCardSaveState((prev) => {
      if (prev[row.id] === 'idle' || prev[row.id] == null) return prev
      return { ...prev, [row.id]: 'idle' }
    })
  }

  const saveCardEdits = async (row: WorkflowRow) => {
    const committed = committedCardEdit(row)
    const draft = cardDrafts[row.id] ?? committed
    if (!isCardEditDirty(draft, committed)) return

    const canEditTime = hasEditableTrigger(row)
    const def = parseWorkflowDefinition(row.workflow_definition)
    if (canEditTime && !def) {
      setCardSaveState((s) => ({ ...s, [row.id]: 'error' }))
      setActionError('Open the workflow editor to set a trigger time for this campaign.')
      showToast('error', 'Open the workflow editor to set a trigger time for this campaign.')
      return
    }

    const stepCount = Math.max(1, listSendSteps(row).length)
    const nextCustomers = normalizePositiveInt(draft.customers, normalizePositiveInt(committed.customers))
    const messageCap = messageCapFromCustomers(nextCustomers, stepCount)
    const runTimeChanged =
      canEditTime &&
      (draft.runTimeEnabled !== committed.runTimeEnabled ||
        (draft.runTimeEnabled && draft.runTime !== committed.runTime))
    const customersChanged =
      nextCustomers !== normalizePositiveInt(committed.customers) ||
      normalizePositiveInt(row.daily_send_limit) !== messageCap

    setBusyId(row.id)
    setCardSaveState((s) => ({ ...s, [row.id]: 'saving' }))
    setActionError(null)

    try {
      let nextDef = def
      if (nextDef && runTimeChanged) {
        nextDef = withTriggerRunTime(nextDef, draft.runTimeEnabled ? draft.runTime || '08:00' : '')
      }
      if (nextDef && customersChanged) {
        nextDef = withEnrollDailyCustomers(nextDef, nextCustomers, messageCap)
      }

      const body: Record<string, unknown> = {}
      if (customersChanged) body.daily_send_limit = messageCap
      if (nextDef && (runTimeChanged || customersChanged)) {
        body.workflow_definition = nextDef
      }

      if (Object.keys(body).length === 0) {
        setCardDrafts((d) => {
          const { [row.id]: _, ...rest } = d
          return rest
        })
        setCardSaveState((s) => ({ ...s, [row.id]: 'saved' }))
        return
      }

      const res = await fetch(`/api/campaigns/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save changes')

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                ...json.data,
                daily_send_limit: normalizePositiveInt(
                  json.data?.daily_send_limit,
                  customersChanged ? messageCap : normalizePositiveInt(r.daily_send_limit)
                ),
                workflow_definition:
                  json.data?.workflow_definition ?? body.workflow_definition ?? r.workflow_definition,
              }
            : r
        )
      )
      setCardDrafts((d) => {
        const { [row.id]: _, ...rest } = d
        return rest
      })
      setCardSaveState((s) => ({ ...s, [row.id]: 'saved' }))
      const label = row.name?.trim() || 'Workflow'
      showToast('success', `Saved — ${label}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save changes'
      setCardSaveState((s) => ({ ...s, [row.id]: 'error' }))
      setActionError(msg)
      showToast('error', msg)
    } finally {
      setBusyId(null)
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
                const schedule = resolveCampaignTriggerSchedule(row)
                const canEditTime = hasEditableTrigger(row)
                const sendSteps = listSendSteps(row)
                const committed = committedCardEdit(row)
                const edit = cardDrafts[row.id] ?? committed
                const dirty = isCardEditDirty(edit, committed)
                const saveState = cardSaveState[row.id] ?? 'idle'
                const saving = saveState === 'saving'
                const sentToday = row.sent_today_count ?? 0

                return (
                  <li
                    key={row.id}
                    className={`rounded-2xl border bg-white px-4 py-3 shadow-sm transition ${
                      dirty
                        ? 'border-emerald-300 ring-1 ring-emerald-100'
                        : 'border-slate-200 hover:border-violet-200 hover:shadow-md'
                    }`}
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
                              checked={edit.runTimeEnabled}
                              disabled={busy || saving}
                              onChange={(e) => {
                                updateCardDraft(row, {
                                  runTimeEnabled: e.target.checked,
                                  runTime: edit.runTime || '08:00',
                                })
                              }}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            Run at time
                          </label>
                          {edit.runTimeEnabled ? (
                            <input
                              type="time"
                              value={edit.runTime}
                              disabled={busy || saving}
                              onChange={(e) => {
                                updateCardDraft(row, {
                                  runTimeEnabled: true,
                                  runTime: e.target.value,
                                })
                              }}
                              className="rounded-lg border border-slate-300 bg-white py-1.5 pr-2 pl-2.5 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
                              aria-label={`Run time for ${row.name}`}
                            />
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
                        <input
                          id={`daily-cap-${row.id}`}
                          type="number"
                          min={1}
                          inputMode="numeric"
                          disabled={busy || saving}
                          value={edit.customers}
                          onChange={(e) => {
                            updateCardDraft(row, { customers: e.target.value })
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && dirty && !saving) {
                              e.preventDefault()
                              void saveCardEdits(row)
                            }
                          }}
                          className="w-14 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
                          aria-label={`Customers to message per day for ${row.name}`}
                        />
                        <span className="font-medium">customers per day</span>
                        <span className="w-full text-[11px] text-slate-500 sm:w-auto sm:ml-1">
                          · {sentToday.toLocaleString()} sent today
                        </span>
                      </div>

                      {(dirty || saveState !== 'idle') && (
                        <div className="flex items-center justify-end gap-2 pt-0.5">
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center"
                            aria-live="polite"
                            aria-label={
                              saveState === 'saving'
                                ? 'Saving'
                                : saveState === 'saved'
                                  ? 'Saved'
                                  : saveState === 'error'
                                    ? 'Save failed'
                                    : undefined
                            }
                          >
                            <SaveStateIcon state={saveState} />
                          </span>
                          {dirty ? (
                            <button
                              type="button"
                              disabled={busy || saving}
                              onClick={() => {
                                void saveCardEdits(row)
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-wait disabled:opacity-60"
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                          ) : saveState === 'saved' ? (
                            <span className="text-xs font-medium text-emerald-700">Saved</span>
                          ) : saveState === 'error' ? (
                            <button
                              type="button"
                              disabled={busy || saving}
                              onClick={() => {
                                void saveCardEdits(row)
                              }}
                              className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                            >
                              Retry
                            </button>
                          ) : null}
                        </div>
                      )}
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
