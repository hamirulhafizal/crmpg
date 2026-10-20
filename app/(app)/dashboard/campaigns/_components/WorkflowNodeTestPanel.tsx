'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkflowNodeTestResult } from '@/app/lib/campaigns/test-workflow-node'
import {
  allWorkflowNodeIds,
  animateWorkflowPathTest,
  workflowPathNodeIds,
} from '@/app/lib/campaigns/workflow-node-test-visual'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import type { WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'

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
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Items ({result.items.length})
              </p>
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {result.items.map((item, i) => (
                  <li key={i} className="px-2.5 py-2 text-xs">
                    <p className="font-medium text-slate-900">{item.label}</p>
                    {item.detail ? <p className="mt-0.5 text-slate-600">{item.detail}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">Run a test to see who matches or what would be sent.</p>
      )}
    </div>
  )
}
