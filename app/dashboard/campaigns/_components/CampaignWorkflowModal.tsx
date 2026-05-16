'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { CampaignStatusBadge } from '@/app/dashboard/campaigns/_components/CampaignStatusBadge'
import { buildWorkflowFlowGraph } from '@/app/dashboard/campaigns/_components/build-workflow-graph'
import { CampaignWorkflowNodeInspector } from '@/app/dashboard/campaigns/_components/CampaignWorkflowNodeInspector'
import {
  campaignWorkflowNodeTypes,
  type WorkflowNodeData,
} from '@/app/dashboard/campaigns/_components/CampaignWorkflowNode'
import {
  addWorkflowStep,
  draftFromCampaignPayload,
  layoutFromNodePositions,
  type WorkflowEditorDraft,
} from '@/app/lib/campaigns/workflow-layout'

export type WorkflowNodeState = 'idle' | 'active' | 'complete'

export type WorkflowLogLine = {
  id: string
  message: string
  level?: 'info' | 'success' | 'error'
  at: number
}

export type WorkflowStepDef = {
  id: string
  step_order: number
  delay_days: number
  send_time: string
  message_template: string
  is_active?: boolean
}

type Props = {
  open: boolean
  onClose: () => void
  campaignId?: string
  campaignName: string
  campaignStatus: string
  triggerType: string
  steps: WorkflowStepDef[]
  enrolled?: number
  dueNow?: number
  matchingAudience?: number
  nodeStates: Record<string, WorkflowNodeState>
  logs: WorkflowLogLine[]
  running: boolean
  currentSend?: {
    label: string
    stepOrder: number
    status: 'sending' | 'sent' | 'failed'
    index: number
    total: number
  } | null
  onRunTest?: () => void
  testRunDisabled?: boolean
  editable?: boolean
  initialDraft?: WorkflowEditorDraft
  onSaved?: () => void
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return mobile
}

function FitViewOnChange({ deps }: { deps: unknown[] }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const t = window.setTimeout(() => {
      void fitView({ padding: 0.22, duration: 280 })
    }, 60)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return null
}

function WorkflowFlowCanvas({
  draft,
  nodeStates,
  editable,
  selectedNodeId,
  onSelectNode,
  onPositionsChange,
  enrolled,
  dueNow,
  matchingAudience,
  vertical,
  fitDeps,
}: {
  draft: WorkflowEditorDraft
  nodeStates: Record<string, WorkflowNodeState>
  editable: boolean
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onPositionsChange: (positions: Record<string, { x: number; y: number }>) => void
  enrolled: number
  dueNow: number
  matchingAudience?: number
  vertical: boolean
  fitDeps: unknown[]
}) {
  const built = useMemo(
    () =>
      buildWorkflowFlowGraph({
        draft,
        nodeStates,
        vertical,
        editable,
        selectedNodeId,
        enrolled,
        dueNow,
        matchingAudience,
      }),
    [draft, nodeStates, vertical, editable, selectedNodeId, enrolled, dueNow, matchingAudience]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges)
  const { getNodes } = useReactFlow()

  useEffect(() => {
    setNodes(built.nodes)
    setEdges(built.edges)
  }, [built.nodes, built.edges, setNodes, setEdges])

  const onNodeDragStop = useCallback(() => {
    if (!editable) return
    const positions = Object.fromEntries(getNodes().map((n) => [n.id, { x: n.position.x, y: n.position.y }]))
    onPositionsChange(positions)
  }, [editable, getNodes, onPositionsChange])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={editable ? onNodesChange : undefined}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onPaneClick={() => onSelectNode(null)}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={campaignWorkflowNodeTypes}
      fitView
      minZoom={0.25}
      maxZoom={1.6}
      panOnScroll
      zoomOnScroll
      nodesDraggable={editable}
      nodesConnectable={false}
      elementsSelectable={editable}
      proOptions={{ hideAttribution: true }}
      style={{ width: '100%', height: '100%' }}
      className="campaign-workflow-canvas"
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#c4c9d4" />
      <Controls
        showInteractive={false}
        className="!rounded-xl !border !border-slate-200 !bg-white/95 !shadow-lg [&>button]:!border-slate-200 [&>button]:!bg-white [&>button:hover]:!bg-slate-50"
      />
      <Panel position="top-center" className="pointer-events-none mt-2 hidden sm:block">
        <span className="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur">
          {editable ? 'Drag nodes · Click to edit · Save when done' : 'Pan & zoom to explore'}
        </span>
      </Panel>
      <FitViewOnChange deps={fitDeps} />
    </ReactFlow>
  )
}

function LiveActivityPanel({
  logs,
  running,
  currentSend,
  className,
}: {
  logs: WorkflowLogLine[]
  running: boolean
  currentSend: Props['currentSend']
  className?: string
}) {
  return (
    <div className={`flex min-h-0 flex-col ${className ?? ''}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Executions</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">Live activity from test runs</p>
        </div>
        {running ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
            Running
          </span>
        ) : null}
      </div>

      {currentSend ? (
        <div
          className={`mx-3 mt-3 shrink-0 rounded-xl border px-3 py-2.5 text-xs ${
            currentSend.status === 'sending'
              ? 'border-sky-200 bg-sky-50 text-sky-950'
              : currentSend.status === 'sent'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                : 'border-red-200 bg-red-50 text-red-950'
          }`}
        >
          <p className="font-semibold">
            {currentSend.status === 'sending' ? 'Sending WhatsApp…' : currentSend.status === 'sent' ? 'Sent' : 'Failed'}
            {' · '}Step {currentSend.stepOrder}
          </p>
          <p className="mt-1 opacity-90">
            {currentSend.status === 'sending' ? 'To' : 'Message to'}{' '}
            <span className="font-medium">{currentSend.label}</span> ({currentSend.index}/{currentSend.total})
          </p>
        </div>
      ) : null}

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {logs.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-slate-500">
            Run a test to see step-by-step events here.
          </li>
        ) : (
          logs.map((line) => (
            <li
              key={line.id}
              className={`rounded-lg px-3 py-2 font-mono text-[11px] leading-relaxed ${
                line.level === 'success'
                  ? 'text-emerald-800'
                  : line.level === 'error'
                    ? 'text-red-800'
                    : 'text-slate-700'
              }`}
            >
              <span className="text-slate-400">
                {new Date(line.at).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>{' '}
              {line.message}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

function CampaignWorkflowView(props: Props) {
  const {
    onClose,
    campaignId,
    campaignName,
    campaignStatus,
    steps,
    enrolled = 0,
    dueNow = 0,
    matchingAudience,
    nodeStates,
    logs,
    running,
    currentSend,
    onRunTest,
    testRunDisabled,
    editable = false,
    initialDraft,
    onSaved,
  } = props

  const isMobile = useIsMobile()
  const [mobileTab, setMobileTab] = useState<'canvas' | 'node' | 'logs'>('canvas')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [draft, setDraft] = useState<WorkflowEditorDraft>(() => initialDraft!)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const savedSnapshot = useRef(JSON.stringify(initialDraft))

  useEffect(() => {
    if (initialDraft) {
      setDraft(initialDraft)
      savedSnapshot.current = JSON.stringify(initialDraft)
    }
  }, [initialDraft])

  const isDirty = editable && JSON.stringify(draft) !== savedSnapshot.current

  const onPositionsChange = useCallback((positions: Record<string, { x: number; y: number }>) => {
    setDraft((d) => ({ ...d, layout: layoutFromNodePositions(positions) }))
  }, [])

  const fitDeps = useMemo(
    () => [isMobile, draft.steps.length, JSON.stringify(nodeStates), selectedNodeId, editable],
    [isMobile, draft.steps.length, nodeStates, selectedNodeId, editable]
  )

  const saveWorkflow = async () => {
    if (!campaignId || !editable) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_type: draft.trigger_type,
          trigger_offset_days: draft.trigger_offset_days,
          audience_filters: draft.audience_filters,
          daily_send_limit: draft.daily_send_limit,
          cooldown_days: draft.cooldown_days,
          workflow_layout: draft.layout,
          steps: draft.steps.map((s) => ({
            step_order: s.step_order,
            delay_days: s.delay_days,
            send_time: s.send_time,
            message_template: s.message_template,
            is_active: s.is_active !== false,
          })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Save failed')
      savedSnapshot.current = JSON.stringify(draft)
      onSaved?.()
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (isDirty && !window.confirm('Discard unsaved workflow changes?')) return
    onClose()
  }

  useEffect(() => {
    if (!isMobile) setMobileTab('canvas')
  }, [isMobile])

  useEffect(() => {
    if (selectedNodeId && isMobile) setMobileTab('node')
  }, [selectedNodeId, isMobile])

  const rightPanelTab = isMobile ? mobileTab : 'side'

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex flex-col bg-[#eceef1]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-title"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200/90 bg-white px-3 py-2.5 shadow-sm sm:gap-3 sm:px-4 sm:py-3">
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          aria-label="Close workflow"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id="workflow-title" className="truncate text-base font-semibold text-slate-900 sm:text-lg">
              {campaignName}
            </h1>
            <CampaignStatusBadge status={campaignStatus as never} />
            {isDirty ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                Unsaved
              </span>
            ) : null}
            {running ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                Running
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-slate-500 sm:text-sm">
            {editable ? 'Workflow editor' : 'Campaign workflow · view only'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {editable ? (
            <>
              <button
                type="button"
                onClick={() => setDraft((d) => addWorkflowStep(d))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:px-3"
              >
                + Step
              </button>
              <button
                type="button"
                disabled={!isDirty || saving}
                onClick={() => void saveWorkflow()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : null}
          {onRunTest ? (
            <button
              type="button"
              disabled={testRunDisabled || running || saving}
              onClick={onRunTest}
              title={
                testRunDisabled
                  ? 'Activate campaign to run test'
                  : 'Run enrollment sync and send due messages (live preview)'
              }
              className="inline-flex items-center gap-2 rounded-lg bg-[#ff6d5a] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#f25a47] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M16.023 9.348h4.992M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
              )}
              <span className="hidden sm:inline">{running ? 'Running…' : 'Run test'}</span>
            </button>
          ) : null}
        </div>
      </header>

      {saveError ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{saveError}</div>
      ) : null}

      {isMobile ? (
        <div className="flex shrink-0 border-b border-slate-200 bg-white px-2 py-1.5">
          <div className="flex w-full rounded-lg bg-slate-100 p-0.5">
            {(['canvas', ...(editable ? (['node'] as const) : []), 'logs'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMobileTab(tab)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold capitalize transition-colors ${
                  mobileTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {tab === 'node' ? 'Node' : tab}
                {tab === 'logs' && logs.length > 0 ? (
                  <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[10px]">{logs.length}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div
          className={`min-h-0 flex-1 ${
            isMobile && mobileTab !== 'canvas' ? 'hidden' : 'flex h-full flex-col'
          }`}
        >
          <ReactFlowProvider>
            <div className="h-full min-h-[240px] w-full flex-1">
              <WorkflowFlowCanvas
                draft={draft}
                nodeStates={nodeStates}
                editable={editable}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onPositionsChange={onPositionsChange}
                enrolled={enrolled}
                dueNow={dueNow}
                matchingAudience={matchingAudience}
                vertical={isMobile && !editable}
                fitDeps={fitDeps}
              />
            </div>
          </ReactFlowProvider>
        </div>

        <aside
          className={`flex min-h-0 flex-col border-slate-200 bg-white ${
            isMobile
              ? mobileTab === 'node' || mobileTab === 'logs'
                ? 'flex w-full flex-1 border-t'
                : 'hidden'
              : 'w-[min(100%,24rem)] border-l sm:max-w-md'
          }`}
        >
          {isMobile ? (
            mobileTab === 'logs' ? (
              <LiveActivityPanel logs={logs} running={running} currentSend={currentSend} />
            ) : mobileTab === 'node' ? (
              <CampaignWorkflowNodeInspector
                selectedNodeId={selectedNodeId}
                draft={draft}
                onChange={setDraft}
                onClose={() => setSelectedNodeId(null)}
              />
            ) : null
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {editable ? (
                <div className="flex min-h-0 flex-1 flex-col border-b border-slate-200">
                  <CampaignWorkflowNodeInspector
                    selectedNodeId={selectedNodeId}
                    draft={draft}
                    onChange={setDraft}
                    onClose={() => setSelectedNodeId(null)}
                  />
                </div>
              ) : null}
              <LiveActivityPanel
                logs={logs}
                running={running}
                currentSend={currentSend}
                className={editable ? 'max-h-[38vh] shrink-0' : 'min-h-0 flex-1'}
              />
            </div>
          )}
        </aside>
      </div>
    </motion.div>
  )
}

export function CampaignWorkflowModal(props: Props) {
  const { open, onClose, initialDraft, steps, triggerType, editable } = props

  const fallbackDraft = useMemo(
    () =>
      draftFromCampaignPayload(
        {
          trigger_type: triggerType,
          audience_filters: {},
          daily_send_limit: 100,
          cooldown_days: 30,
        },
        steps.map((s) => ({
          id: s.id,
          step_order: s.step_order,
          delay_days: s.delay_days,
          send_time: s.send_time,
          message_template: s.message_template,
          is_active: s.is_active,
        }))
      ),
    [triggerType, steps]
  )

  const draft = initialDraft ?? fallbackDraft

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editable && JSON.stringify(draft) !== JSON.stringify(initialDraft ?? fallbackDraft)) {
          if (!window.confirm('Discard unsaved workflow changes?')) return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, editable, draft, initialDraft, fallbackDraft])

  return (
    <AnimatePresence>
      {open ? <CampaignWorkflowView {...props} initialDraft={draft} /> : null}
    </AnimatePresence>
  )
}
