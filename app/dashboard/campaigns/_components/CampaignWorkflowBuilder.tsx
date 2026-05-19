'use client'

import { useCallback, useEffect, useMemo, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { CampaignWorkflowNodeInspector } from '@/app/dashboard/campaigns/_components/CampaignWorkflowNodeInspector'
import { WorkflowFlowCanvas } from '@/app/dashboard/campaigns/_components/WorkflowFlowCanvas'
import { WorkflowN8nToolbar } from '@/app/dashboard/campaigns/_components/WorkflowN8nToolbar'
import { useWorkflowNodeClipboard } from '@/app/dashboard/campaigns/_components/use-workflow-node-clipboard'
import { useWorkflowDraftHistory } from '@/app/dashboard/campaigns/_components/use-workflow-draft-history'
import { WorkflowUndoButtons } from '@/app/dashboard/campaigns/_components/WorkflowUndoButtons'
import {
  WorkflowCollapsibleSidebar,
  WorkflowSidebarFloatingToggle,
} from '@/app/dashboard/campaigns/_components/WorkflowCollapsibleSidebar'
import { WorkflowNodePalette } from '@/app/dashboard/campaigns/_components/WorkflowNodePalette'
import { addWorkflowStep, type WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import { createDefaultWorkflowDefinition } from '@/app/lib/workflows/defaults'
import {
  addEdgeToDefinition,
  addNodeToDefinition,
  applyEdgesFromFlow,
  ensureExplicitEdges,
  updateDefinitionPositions,
} from '@/app/lib/workflows/graph-mutate'
import { definitionToDraft, draftToDefinition } from '@/app/lib/workflows/sync'
import { isN8nNodeType } from '@/app/lib/workflows/n8n/detect'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import { validateWorkflowDefinition } from '@/app/lib/workflows/validate'

function BuilderCanvas({
  draft,
  setDraft,
  selectedNodeIds,
  setSelectedNodeIds,
  onTestNode,
  testingNodeId,
  fitDeps,
}: {
  draft: WorkflowEditorDraft
  setDraft: Dispatch<SetStateAction<WorkflowEditorDraft>>
  selectedNodeIds: string[]
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>
  onTestNode?: (nodeId: string) => void
  testingNodeId?: string | null
  fitDeps: unknown[]
}) {
  const { screenToFlowPosition } = useReactFlow()

  const onPositionsChange = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      setDraft((d) => {
        const def = draftToDefinition(d)
        return definitionToDraft(updateDefinitionPositions(def, positions))
      })
    },
    [setDraft]
  )

  const onConnect = useCallback(
    (
      source: string,
      target: string,
      handles?: { sourceHandle?: string | null; targetHandle?: string | null }
    ) => {
      setDraft((d) => {
        const def = draftToDefinition(d)
        return definitionToDraft(addEdgeToDefinition(def, source, target, handles))
      })
    },
    [setDraft]
  )

  const onEdgesSync = useCallback(
    (flowEdges: Array<{ id: string; source: string; target: string }>) => {
      setDraft((d) => {
        let def = ensureExplicitEdges(draftToDefinition(d))
        def = applyEdgesFromFlow(def, flowEdges)
        return definitionToDraft(def)
      })
    },
    [setDraft]
  )

  const onTidyLayout = useCallback(
    (def: WorkflowDefinition) => {
      setDraft(() => definitionToDraft(def))
    },
    [setDraft]
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData('application/workflow-node-type')
      if (!type) return
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setDraft((d) => {
        const def = draftToDefinition(d)
        return definitionToDraft(addNodeToDefinition(def, type, position))
      })
    },
    [screenToFlowPosition, setDraft]
  )

  useWorkflowNodeClipboard({
    editable: true,
    draft,
    setDraft,
    selectedNodeIds,
    setSelectedNodeIds,
  })

  return (
    <div className="relative h-full min-h-[320px] flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <WorkflowFlowCanvas
        draft={draft}
        nodeStates={{}}
        editable
        selectedNodeIds={selectedNodeIds}
        onSelectNodes={setSelectedNodeIds}
        onPositionsChange={onPositionsChange}
        onConnect={onConnect}
        onEdgesSync={onEdgesSync}
        onTidyLayout={onTidyLayout}
        enrolled={0}
        dueNow={0}
        vertical={false}
        fitDeps={fitDeps}
        onTestNode={onTestNode}
        testingNodeId={testingNodeId}
      />
    </div>
  )
}

export function CampaignWorkflowBuilder({
  onClose,
  onCreated,
  pushToast,
}: {
  onClose: () => void
  onCreated: (id: string) => void
  pushToast: (type: 'success' | 'error', text: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const initialDraft = useMemo(() => definitionToDraft(createDefaultWorkflowDefinition()), [])
  const { draft, setDraft, undo, redo, canUndo, canRedo } = useWorkflowDraftHistory(initialDraft)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [nodeTestAutoRunKey, setNodeTestAutoRunKey] = useState(0)
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)

  useEffect(() => {
    const def = draft.definition
    if (!def?.nodes.some((n) => isN8nNodeType(String(n.type)))) return
    setDraft(definitionToDraft(def))
  }, [draft.definition, setDraft])

  const triggerNodeTest = useCallback((nodeId: string) => {
    setSelectedNodeIds([nodeId])
    setTestingNodeId(nodeId)
    setNodeTestAutoRunKey((k) => k + 1)
  }, [])

  const addNodeFromPalette = useCallback((typeSlug: string) => {
    setDraft((d) => {
      const def = draftToDefinition(d)
      const last = def.nodes[def.nodes.length - 1]
      const position = last
        ? { x: last.position.x + 260, y: last.position.y }
        : { x: 80, y: 80 }
      return definitionToDraft(addNodeToDefinition(def, typeSlug, position))
    })
  }, [setDraft])

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Campaign name is required')
      return
    }
    const def = draftToDefinition(draft)
    const issues = validateWorkflowDefinition(def)
    if (issues.length > 0) {
      setError(issues[0]!.message)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || null,
          status: 'draft',
          workflow_definition: def,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to create campaign')
      const id = json.data?.id as string
      if (!id) throw new Error('No campaign id returned')
      onCreated(id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#eceef1]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <input
          type="text"
          placeholder="Campaign name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-[140px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-black"
        />
        <WorkflowUndoButtons canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
        <WorkflowN8nToolbar draft={draft} onDraftChange={setDraft} onToast={pushToast} />
        <button
          type="button"
          onClick={() => setDraft((d) => addWorkflowStep(d))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          + Step
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create campaign'}
        </button>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <WorkflowCollapsibleSidebar
          side="left"
          open={leftSidebarOpen}
          onToggle={() => setLeftSidebarOpen((v) => !v)}
          panelLabel="Nodes"
          className="w-52 sm:w-56"
        >
          <WorkflowNodePalette onAddNode={addNodeFromPalette} />
        </WorkflowCollapsibleSidebar>
        <div className="relative min-h-0 min-w-0 flex-1">
          {!leftSidebarOpen ? (
            <WorkflowSidebarFloatingToggle
              side="left"
              panelLabel="Nodes"
              onOpen={() => setLeftSidebarOpen(true)}
            />
          ) : null}
          {!rightSidebarOpen ? (
            <WorkflowSidebarFloatingToggle
              side="right"
              panelLabel="Properties"
              onOpen={() => setRightSidebarOpen(true)}
            />
          ) : null}
          <ReactFlowProvider>
            <BuilderCanvas
              draft={draft}
              setDraft={setDraft}
              selectedNodeIds={selectedNodeIds}
              setSelectedNodeIds={setSelectedNodeIds}
              onTestNode={triggerNodeTest}
              testingNodeId={testingNodeId}
              fitDeps={[
                draft.definition?.nodes?.length ?? 0,
                draft.steps.length,
                selectedNodeIds.join(','),
                leftSidebarOpen,
                rightSidebarOpen,
              ]}
            />
          </ReactFlowProvider>
        </div>
        <WorkflowCollapsibleSidebar
          side="right"
          open={rightSidebarOpen}
          onToggle={() => setRightSidebarOpen((v) => !v)}
          panelLabel="Properties"
          className="w-[min(100%,22rem)] sm:max-w-sm"
        >
          <CampaignWorkflowNodeInspector
            selectedNodeIds={selectedNodeIds}
            draft={draft}
            onChange={setDraft}
            onClose={() => setSelectedNodeIds([])}
            onToast={pushToast}
            nodeTestAutoRunKey={nodeTestAutoRunKey}
            onNodeTestEnd={() => setTestingNodeId(null)}
          />
        </WorkflowCollapsibleSidebar>
      </div>
    </div>
  )
}
