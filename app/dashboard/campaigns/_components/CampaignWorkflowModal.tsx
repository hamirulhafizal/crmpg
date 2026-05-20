'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type SetStateAction,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { CampaignStatusBadge } from '@/app/dashboard/campaigns/_components/CampaignStatusBadge'
import { WorkflowFlowCanvas } from '@/app/dashboard/campaigns/_components/WorkflowFlowCanvas'
import { WorkflowN8nToolbar } from '@/app/dashboard/campaigns/_components/WorkflowN8nToolbar'
import { useWorkflowNodeClipboard } from '@/app/dashboard/campaigns/_components/use-workflow-node-clipboard'
import { useWorkflowDraftHistory } from '@/app/dashboard/campaigns/_components/use-workflow-draft-history'
import { WorkflowUndoButtons } from '@/app/dashboard/campaigns/_components/WorkflowUndoButtons'
import { CampaignWorkflowNodeInspector } from '@/app/dashboard/campaigns/_components/CampaignWorkflowNodeInspector'
import {
  WorkflowCollapsibleSidebar,
  WorkflowSidebarFloatingToggle,
} from '@/app/dashboard/campaigns/_components/WorkflowCollapsibleSidebar'
import { WorkflowNodePalette } from '@/app/dashboard/campaigns/_components/WorkflowNodePalette'
import {
  WorkflowCanvasThemeProvider,
  workflowCanvasShellProps,
  useWorkflowCanvasTheme,
} from '@/app/dashboard/campaigns/_components/workflow-canvas-theme'
import {
  addWorkflowStep,
  draftFromCampaignPayload,
  type WorkflowEditorDraft,
} from '@/app/lib/campaigns/workflow-layout'
import {
  addEdgeToDefinition,
  addNodeToDefinition,
  applyEdgesFromFlow,
  ensureExplicitEdges,
  updateDefinitionPositions,
} from '@/app/lib/workflows/graph-mutate'
import { definitionToDraft, draftToDefinition } from '@/app/lib/workflows/sync'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

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
  pushToast?: (type: 'success' | 'error', text: string) => void
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

function WorkflowCanvasDropZone({
  setDraft,
  children,
}: {
  setDraft: Dispatch<SetStateAction<WorkflowEditorDraft>>
  children: React.ReactNode
}) {
  const { screenToFlowPosition } = useReactFlow()

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData('application/workflow-node-type')
      if (!type) return
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setDraft((d) => definitionToDraft(addNodeToDefinition(draftToDefinition(d), type, position)))
    },
    [screenToFlowPosition, setDraft]
  )

  return (
    <motion.div
      className="h-full min-h-[240px] w-full flex-1"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {children}
    </motion.div>
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
    <div className={`flex min-h-0 flex-col workflow-chrome ${className ?? ''}`}>
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
    pushToast,
  } = props

  const isMobile = useIsMobile()
  const [mobileTab, setMobileTab] = useState<'canvas' | 'nodes' | 'node' | 'logs'>('canvas')
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const { draft, setDraft, undo, redo, canUndo, canRedo, resetHistory } = useWorkflowDraftHistory(
    initialDraft,
    { enabled: editable }
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const savedSnapshot = useRef(JSON.stringify(initialDraft))
  const [nodeTestAutoRunKey, setNodeTestAutoRunKey] = useState(0)
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const { theme } = useWorkflowCanvasTheme()
  const shellTheme = workflowCanvasShellProps(theme)

  const openNodeCatalog = useCallback(() => {
    if (isMobile) {
      setMobileTab('nodes')
    } else {
      setLeftSidebarOpen(true)
    }
  }, [isMobile])

  const addNodeFromPalette = useCallback(
    (typeSlug: string) => {
      setDraft((d) => {
        const def = draftToDefinition(d)
        const last = def.nodes[def.nodes.length - 1]
        const position = last
          ? { x: last.position.x + 260, y: last.position.y }
          : { x: 80, y: 80 }
        return definitionToDraft(addNodeToDefinition(def, typeSlug, position))
      })
    },
    [setDraft]
  )

  const triggerNodeTest = useCallback(
    (nodeId: string) => {
      setSelectedNodeIds([nodeId])
      setTestingNodeId(nodeId)
      setNodeTestAutoRunKey((k) => k + 1)
      if (isMobile) setMobileTab('node')
    },
    [isMobile]
  )

  useEffect(() => {
    if (initialDraft) savedSnapshot.current = JSON.stringify(initialDraft)
  }, [initialDraft])

  const isDirty = editable && JSON.stringify(draft) !== savedSnapshot.current

  const onPositionsChange = useCallback((positions: Record<string, { x: number; y: number }>) => {
    setDraft((d) => {
      const def = draftToDefinition(d)
      return definitionToDraft(updateDefinitionPositions(def, positions))
    })
  }, [])

  const onConnect = useCallback(
    (
      source: string,
      target: string,
      handles?: { sourceHandle?: string | null; targetHandle?: string | null }
    ) => {
      setDraft((d) => definitionToDraft(addEdgeToDefinition(draftToDefinition(d), source, target, handles)))
    },
    []
  )

  const onEdgesSync = useCallback((flowEdges: Array<{ id: string; source: string; target: string }>) => {
    setDraft((d) => {
      let def = ensureExplicitEdges(draftToDefinition(d))
      def = applyEdgesFromFlow(def, flowEdges)
      return definitionToDraft(def)
    })
  }, [])

  const onTidyLayout = useCallback((def: WorkflowDefinition) => {
    setDraft(() => definitionToDraft(def))
  }, [])

  useWorkflowNodeClipboard({
    editable: Boolean(editable),
    draft,
    setDraft,
    selectedNodeIds,
    setSelectedNodeIds,
    onToast: pushToast,
  })

  const fitDeps = useMemo(
    () => [
      isMobile,
      draft.steps.length,
      JSON.stringify(nodeStates),
      selectedNodeIds.join(','),
      editable,
      leftSidebarOpen,
      rightSidebarOpen,
      theme,
    ],
    [isMobile, draft.steps.length, nodeStates, selectedNodeIds, editable, leftSidebarOpen, rightSidebarOpen, theme]
  )

  const saveWorkflow = async () => {
    if (!campaignId || !editable) return
    setSaving(true)
    setSaveError(null)
    try {
      const workflow_definition = draftToDefinition(draft)
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_definition }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Save failed')
      savedSnapshot.current = JSON.stringify(draft)
      resetHistory(draft)
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
    if (selectedNodeIds.length > 0 && isMobile) setMobileTab('node')
  }, [selectedNodeIds, isMobile])

  const rightPanelTab = isMobile ? mobileTab : 'side'

  return (
    <motion.div
      className={`campaign-workflow-shell fixed inset-0 z-[1000] flex flex-col bg-[#eceef1] ${shellTheme.className ?? ''}`}
      data-workflow-theme={shellTheme['data-workflow-theme']}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-title"
    >
      <header className="workflow-chrome flex shrink-0 items-center gap-2 border-b border-slate-200/90 bg-white px-3 py-2.5 shadow-sm sm:gap-3 sm:px-4 sm:py-3">
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
              <WorkflowUndoButtons canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
              <button
                type="button"
                onClick={openNodeCatalog}
                title="Open node catalog — drag or click to add nodes"
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 sm:px-3"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="hidden sm:inline">Add node</span>
              </button>
              <WorkflowN8nToolbar
                draft={draft}
                onDraftChange={setDraft}
                onToast={(type, msg) => pushToast?.(type, msg)}
              />
            </>
          ) : null}
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
        <div className="workflow-chrome flex shrink-0 border-b border-slate-200 bg-white px-2 py-1.5">
          <div className="flex w-full rounded-lg bg-slate-100 p-0.5">
            {(['canvas', ...(editable ? (['nodes', 'node'] as const) : []), 'logs'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMobileTab(tab)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold capitalize transition-colors ${
                  mobileTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {tab === 'node' ? 'Node' : tab === 'nodes' ? 'Catalog' : tab}
                {tab === 'logs' && logs.length > 0 ? (
                  <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[10px]">{logs.length}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {editable && !isMobile ? (
          <WorkflowCollapsibleSidebar
            side="left"
            open={leftSidebarOpen}
            onToggle={() => setLeftSidebarOpen((v) => !v)}
            panelLabel="Nodes"
            className="w-52 sm:w-56"
          >
            <WorkflowNodePalette onAddNode={addNodeFromPalette} />
          </WorkflowCollapsibleSidebar>
        ) : null}
        <div
          className={`relative min-h-0 min-w-0 flex-1 ${
            isMobile && mobileTab !== 'canvas' ? 'hidden' : 'flex h-full flex-col'
          }`}
        >
          {editable && !isMobile && !leftSidebarOpen ? (
            <WorkflowSidebarFloatingToggle
              side="left"
              panelLabel="Nodes"
              onOpen={() => setLeftSidebarOpen(true)}
            />
          ) : null}
          {!isMobile && !rightSidebarOpen ? (
            <WorkflowSidebarFloatingToggle
              side="right"
              panelLabel={editable ? 'Properties' : 'Activity'}
              onOpen={() => setRightSidebarOpen(true)}
            />
          ) : null}
          <ReactFlowProvider>
            {editable ? (
              <WorkflowCanvasDropZone setDraft={setDraft}>
                <WorkflowFlowCanvas
                  draft={draft}
                  nodeStates={nodeStates}
                  editable={editable}
                  selectedNodeIds={selectedNodeIds}
                  onSelectNodes={setSelectedNodeIds}
                  onPositionsChange={onPositionsChange}
                  onConnect={onConnect}
                  onEdgesSync={onEdgesSync}
                  onTidyLayout={onTidyLayout}
                  enrolled={enrolled}
                  dueNow={dueNow}
                  matchingAudience={matchingAudience}
                  vertical={isMobile && !editable}
                  fitDeps={fitDeps}
                  onTestNode={triggerNodeTest}
                  testingNodeId={testingNodeId}
                />
              </WorkflowCanvasDropZone>
            ) : (
              <div className="h-full min-h-[240px] w-full flex-1">
                <WorkflowFlowCanvas
                  draft={draft}
                  nodeStates={nodeStates}
                  editable={editable}
                  selectedNodeIds={selectedNodeIds}
                  onSelectNodes={setSelectedNodeIds}
                  onPositionsChange={onPositionsChange}
                  onConnect={undefined}
                  onEdgesSync={undefined}
                  onTidyLayout={undefined}
                  enrolled={enrolled}
                  dueNow={dueNow}
                  matchingAudience={matchingAudience}
                  vertical={isMobile && !editable}
                  fitDeps={fitDeps}
                  onTestNode={undefined}
                  testingNodeId={testingNodeId}
                />
              </div>
            )}
          </ReactFlowProvider>
        </div>

        {isMobile ? (
          <aside
            className={`workflow-chrome flex min-h-0 flex-col border-slate-200 bg-white ${
              mobileTab === 'nodes' || mobileTab === 'node' || mobileTab === 'logs'
                ? 'flex w-full flex-1 border-t'
                : 'hidden'
            }`}
          >
            {mobileTab === 'logs' ? (
              <LiveActivityPanel logs={logs} running={running} currentSend={currentSend} />
            ) : mobileTab === 'nodes' ? (
              <WorkflowNodePalette onAddNode={addNodeFromPalette} />
            ) : mobileTab === 'node' ? (
              <CampaignWorkflowNodeInspector
                selectedNodeIds={selectedNodeIds}
                draft={draft}
                onChange={setDraft}
                onClose={() => setSelectedNodeIds([])}
                campaignId={campaignId}
                onToast={pushToast}
                nodeTestAutoRunKey={nodeTestAutoRunKey}
                onNodeTestEnd={() => setTestingNodeId(null)}
              />
            ) : null}
          </aside>
        ) : (
          <WorkflowCollapsibleSidebar
            side="right"
            open={rightSidebarOpen}
            onToggle={() => setRightSidebarOpen((v) => !v)}
            panelLabel={editable ? 'Properties' : 'Activity'}
            className="w-[min(100%,24rem)] sm:max-w-md"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              {editable ? (
                <div className="flex min-h-0 flex-1 flex-col border-b border-slate-200">
                  <CampaignWorkflowNodeInspector
                    selectedNodeIds={selectedNodeIds}
                    draft={draft}
                    onChange={setDraft}
                    onClose={() => setSelectedNodeIds([])}
                    campaignId={campaignId}
                    onToast={pushToast}
                    nodeTestAutoRunKey={nodeTestAutoRunKey}
                    onNodeTestEnd={() => setTestingNodeId(null)}
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
          </WorkflowCollapsibleSidebar>
        )}
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
      {open ? (
        <WorkflowCanvasThemeProvider>
          <CampaignWorkflowView {...props} initialDraft={draft} />
        </WorkflowCanvasThemeProvider>
      ) : null}
    </AnimatePresence>
  )
}
