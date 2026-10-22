'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCustomerEditModal } from '@/app/contexts/customer-edit-modal-context'
import type { WorkflowNodeTestItem, WorkflowNodeTestResult } from '@/app/lib/campaigns/test-workflow-node'
import {
  allWorkflowNodeIds,
  animateWorkflowPathTest,
  workflowPathNodeIds,
} from '@/app/lib/campaigns/workflow-node-test-visual'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import type { WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'

const ITEMS_PAGE_SIZE = 20

function itemSearchHaystack(item: WorkflowNodeTestItem): string {
  return [item.label, item.detail, item.customer_id, item.meta?.pg_code]
    .map((x) => String(x ?? '').toLowerCase())
    .join(' ')
}

function TestResultItemsList({
  items,
  matchingTotal,
  onOpenCustomer,
}: {
  items: WorkflowNodeTestItem[]
  matchingTotal?: number
  onOpenCustomer: (customerId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    setQuery('')
    setPage(1)
  }, [items])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return items
    return items.filter((item) => itemSearchHaystack(item).includes(q))
  }, [items, q])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const from = filtered.length === 0 ? 0 : (safePage - 1) * ITEMS_PAGE_SIZE + 1
  const to = Math.min(safePage * ITEMS_PAGE_SIZE, filtered.length)
  const pageItems = filtered.slice((safePage - 1) * ITEMS_PAGE_SIZE, safePage * ITEMS_PAGE_SIZE)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [safePage, q])

  const universe = typeof matchingTotal === 'number' ? matchingTotal : items.length

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Items · {universe.toLocaleString()} match{universe === 1 ? '' : 'es'}
      </p>
      <label className="mt-1.5 block">
        <span className="sr-only">Search items</span>
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            type="text"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            placeholder="Search name, phone, or PG code"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setPage(1)
              }}
              className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>
      </label>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {filtered.length === 0
          ? q
            ? `No items match “${query.trim()}”.`
            : 'No items.'
          : q
            ? `Showing ${from}–${to} of ${filtered.length} matching “${query.trim()}”`
            : `Showing ${from}–${to} of ${filtered.length}`}
      </p>
      {pageItems.length > 0 ? (
        <ul
          ref={listRef}
          className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100"
        >
          {pageItems.map((item, i) => {
            const customerId = item.customer_id?.trim()
            const body = (
              <>
                <p
                  className={`font-medium text-slate-900 ${
                    customerId ? 'underline decoration-slate-300 underline-offset-2' : ''
                  }`}
                >
                  {item.label}
                </p>
                {item.detail ? <p className="mt-0.5 text-slate-600">{item.detail}</p> : null}
              </>
            )
            return (
              <li key={customerId || `${safePage}-${i}`} className="text-xs">
                {customerId ? (
                  <button
                    type="button"
                    onClick={() => onOpenCustomer(customerId)}
                    title="Open customer details"
                    className="workflow-test-item-btn block w-full px-2.5 py-2 text-left transition hover:bg-violet-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="px-2.5 py-2">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
      {totalPages > 1 ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage(1)}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="First page"
          >
            First
          </button>
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex h-8 min-w-14 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Prev
          </button>
          <p className="text-[11px] tabular-nums text-slate-500">
            Page {safePage} of {totalPages}
          </p>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex h-8 min-w-14 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setPage(totalPages)}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Last page"
          >
            Last
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function WorkflowNodeTestPanel({
  nodeId,
  draft,
  campaignId,
  onToast,
  autoRunKey,
  onTestEnd,
  onPathVisual,
}: {
  nodeId: string
  draft: WorkflowEditorDraft
  campaignId?: string
  onToast?: (type: 'success' | 'error', text: string) => void
  /** Increment to run test from canvas play button */
  autoRunKey?: number
  onTestEnd?: () => void
  /** Updates canvas node glow while the path test runs */
  onPathVisual?: (states: Record<string, WorkflowNodeState> | null) => void
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WorkflowNodeTestResult | null>(null)
  const { openCustomerById } = useCustomerEditModal()

  const draftRef = useRef(draft)
  const onToastRef = useRef(onToast)
  const onTestEndRef = useRef(onTestEnd)
  const onPathVisualRef = useRef(onPathVisual)
  draftRef.current = draft
  onToastRef.current = onToast
  onTestEndRef.current = onTestEnd
  onPathVisualRef.current = onPathVisual

  const runTest = useCallback(async (options?: { toast?: boolean }) => {
    setLoading(true)
    setResult(null)

    const currentDraft = draftRef.current
    const pathIds = workflowPathNodeIds(currentDraft, nodeId)
    const allIds = allWorkflowNodeIds(currentDraft)

    const visual =
      pathIds.length > 0 && onPathVisualRef.current
        ? animateWorkflowPathTest(pathIds, allIds, (states) => onPathVisualRef.current?.(states))
        : Promise.resolve()

    try {
      const url = campaignId
        ? `/api/campaigns/${campaignId}/test-node`
        : '/api/campaigns/test-node'

      const [data] = await Promise.all([
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ node_id: nodeId, draft: currentDraft }),
        }).then(async (res) => {
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json.error || 'Test failed')
          return json.data as WorkflowNodeTestResult
        }),
        visual,
      ])

      setResult(data)
      if (options?.toast !== false) {
        onToastRef.current?.(data.ok ? 'success' : 'error', data.summary)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Test failed'
      if (options?.toast !== false) {
        onToastRef.current?.('error', msg)
      }
      setResult({
        ok: false,
        node_id: nodeId,
        node_type: '',
        title: 'Error',
        duration_ms: 0,
        summary: msg,
        logs: [],
        items: [],
        metrics: {},
        error: msg,
      })
    } finally {
      setLoading(false)
      onTestEndRef.current?.()
    }
  }, [campaignId, nodeId])

  const runTestRef = useRef(runTest)
  runTestRef.current = runTest
  const lastAutoRunKeyRef = useRef(0)

  useEffect(() => {
    lastAutoRunKeyRef.current = 0
  }, [nodeId])

  useEffect(() => {
    if (autoRunKey == null || autoRunKey <= 0 || autoRunKey === lastAutoRunKeyRef.current) return
    lastAutoRunKeyRef.current = autoRunKey
    void runTestRef.current({ toast: false })
  }, [autoRunKey])

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Node output</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Dry-run from the first node through this one (n8n-style). Does not send messages.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runTest({ toast: true })}
          title="Test this node"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#ff6d5a] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#f25a47] disabled:opacity-50"
        >
          {loading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M16.023 9.348h4.992M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          )}
          {loading ? 'Running…' : 'Test node'}
        </button>
      </div>

      {result ? (
        <div className="mt-3 space-y-3">
          <div
            className={`rounded-xl border px-3 py-2.5 text-sm ${
              result.ok ? 'border-emerald-200 bg-emerald-50/90 text-emerald-950' : 'border-red-200 bg-red-50 text-red-950'
            }`}
          >
            <p className="font-semibold">{result.summary}</p>
            <p className="mt-1 text-[11px] opacity-80">
              {result.duration_ms}ms · {result.node_type}
            </p>
          </div>

          {result.path_steps && result.path_steps.length > 1 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Path ({result.path_steps.length} nodes)
              </p>
              <ol className="mt-1.5 space-y-1.5">
                {result.path_steps.map((step, i) => (
                  <li
                    key={step.node_id}
                    className={`flex gap-2 rounded-lg px-2 py-1.5 text-xs ${
                      step.ok ? 'bg-slate-50 text-slate-800' : 'bg-red-50 text-red-900'
                    }`}
                  >
                    <span className="shrink-0 font-mono text-[10px] text-slate-400">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{step.title}</p>
                      <p className="text-[11px] text-slate-600">{step.summary}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {Object.keys(result.metrics).length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Metrics</p>
              <dl className="mt-1.5 space-y-1">
                {Object.entries(result.metrics).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 text-xs">
                    <dt className="text-slate-500">{k.replace(/_/g, ' ')}</dt>
                    <dd className="font-medium text-slate-900">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {result.logs.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Log</p>
              <ul className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-slate-100 bg-white font-mono text-[11px] text-slate-700">
                {result.logs.map((line, i) => (
                  <li key={i} className="border-b border-slate-50 px-2 py-1 last:border-0">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.items.length > 0 ? (
            <TestResultItemsList
              items={result.items}
              matchingTotal={
                typeof result.metrics.matching_total === 'number'
                  ? result.metrics.matching_total
                  : undefined
              }
              onOpenCustomer={(customerId) =>
                openCustomerById(customerId, { overlayZIndexClassName: 'z-[2100]' })
              }
            />
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">Run a test to see who matches or what would be sent.</p>
      )}
    </div>
  )
}
