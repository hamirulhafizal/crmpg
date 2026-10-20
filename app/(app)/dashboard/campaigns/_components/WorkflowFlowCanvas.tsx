'use client'

import { useCallback, useEffect, useMemo } from 'react'
import {
  applyEdgeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildWorkflowFlowGraph } from '@/app/dashboard/campaigns/_components/build-workflow-graph'
import { campaignWorkflowNodeTypes } from '@/app/dashboard/campaigns/_components/CampaignWorkflowNode'
import { WorkflowCanvasLayoutToggle } from '@/app/dashboard/campaigns/_components/WorkflowMobileLayoutToggle'
import { WorkflowCanvasTidyButton } from '@/app/dashboard/campaigns/_components/WorkflowCanvasTidyButton'
import { WorkflowCanvasThemeToggle } from '@/app/dashboard/campaigns/_components/WorkflowCanvasThemeToggle'
import { useWorkflowCanvasTheme } from '@/app/dashboard/campaigns/_components/workflow-canvas-theme'
import { WorkflowDeletableEdge } from '@/app/dashboard/campaigns/_components/WorkflowDeletableEdge'
import { WorkflowEdgeActionsProvider } from '@/app/dashboard/campaigns/_components/workflow-edge-actions-context'
import type { WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import { workflowEdgeMarkerEnd } from '@/app/lib/workflows/workflow-edge-marker'

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

import type { FlowEdgeSyncPayload } from '@/app/lib/workflows/graph-mutate'

export type FlowEdgePayload = FlowEdgeSyncPayload

export function WorkflowFlowCanvas({
  draft,
  nodeStates,
  editable,
  selectedNodeIds,
  onSelectNodes,
  onPositionsChange,
  onConnect,
  onEdgesSync,
  enrolled,
  dueNow,
  matchingAudience,
  vertical,
  fitDeps,
  onTestNode,
  testingNodeId,
  onTidyLayout,
  showCanvasTidy = true,
  showMobileLayoutToggle = false,
  onToggleMobileLayout,
  mobileLayoutDisabled = false,
  onOpenNodeProperties,
}: {
  draft: WorkflowEditorDraft
  nodeStates: Record<string, WorkflowNodeState>
  editable: boolean
  selectedNodeIds: string[]
  onSelectNodes: (ids: string[]) => void
  onPositionsChange: (positions: Record<string, { x: number; y: number }>) => void
  onConnect?: (
    source: string,
    target: string,
    handles?: { sourceHandle?: string | null; targetHandle?: string | null }
  ) => void
  /** Called when edges are removed (or batch-updated) so draft.workflow_definition.edges stays in sync. */
  onEdgesSync?: (edges: FlowEdgePayload[]) => void
  enrolled: number
  dueNow: number
  matchingAudience?: number
  vertical: boolean
  fitDeps: unknown[]
  onTestNode?: (nodeId: string) => void
  testingNodeId?: string | null
  onTidyLayout?: (def: WorkflowDefinition) => void
  /** Desktop: broom tidy in canvas controls. */
  showCanvasTidy?: boolean
  /** Mobile: vertical/horizontal layout toggle in canvas controls. */
  showMobileLayoutToggle?: boolean
  onToggleMobileLayout?: () => void
  mobileLayoutDisabled?: boolean
  /** Double-click a node to select it and open the properties panel. */
  onOpenNodeProperties?: (nodeId: string) => void
}) {
  const { isDark } = useWorkflowCanvasTheme()
  const dotColor = isDark ? '#3a4358' : '#c4c9d4'
  const edgeMarkerColor = isDark ? '#64748b' : '#cbd5e1'

  const built = useMemo(
    () =>
      buildWorkflowFlowGraph({
        draft,
        nodeStates,
        vertical,
        editable,
        selectedNodeIds,
        enrolled,
        dueNow,
        matchingAudience,
        onTestNode,
        testingNodeId,
      }),
    [
      draft,
      nodeStates,
      vertical,
      editable,
      selectedNodeIds,
      enrolled,
      dueNow,
      matchingAudience,
      onTestNode,
      testingNodeId,
    ]
  )

  const edgesFingerprint = useMemo(
    () =>
      (draft.definition?.edges ?? [])
        .map((e) => `${e.id}:${e.source}:${e.target}:${e.routing ?? ''}:${e.pathOffsetY ?? ''}`)
        .join('|'),
    [draft.definition?.edges]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges] = useEdgesState(built.edges)
  const { getNodes, getEdges } = useReactFlow()

  useEffect(() => {
    setNodes(built.nodes)
  }, [built.nodes, setNodes])

  useEffect(() => {
    setEdges(built.edges)
  }, [edgesFingerprint, built.edges, setEdges])

  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        markerEnd: workflowEdgeMarkerEnd(edgeMarkerColor),
      }))
    )
  }, [edgeMarkerColor, setEdges])

  /** Parent draft must not update inside a setEdges updater (React render-phase error). */
  const syncEdgesToDraft = useCallback(
    (next: Edge[]) => {
      if (!onEdgesSync) return
      const payload: FlowEdgeSyncPayload[] = next.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        routing: e.data?.routing as FlowEdgeSyncPayload['routing'],
        pathOffsetY:
          typeof e.data?.pathOffsetY === 'number' && Number.isFinite(e.data.pathOffsetY)
            ? e.data.pathOffsetY
            : undefined,
      }))
      queueMicrotask(() => onEdgesSync(payload))
    },
    [onEdgesSync]
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!editable) return
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds)
        if (changes.some((c) => c.type === 'remove')) {
          syncEdgesToDraft(next)
        }
        return next
      })
    },
    [editable, setEdges, syncEdgesToDraft]
  )

  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!editable || deleted.length === 0) return
      setEdges((eds) => {
        const deletedIds = new Set(deleted.map((e) => e.id))
        const next = eds.filter((e) => !deletedIds.has(e.id))
        syncEdgesToDraft(next)
        return next
      })
    },
    [editable, setEdges, syncEdgesToDraft]
  )

  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      if (!editable) return
      setEdges((eds) => {
        const next = eds.filter((e) => e.id !== edgeId)
        syncEdgesToDraft(next)
        return next
      })
    },
    [editable, setEdges, syncEdgesToDraft]
  )

  const updateEdgePathOffset = useCallback(
    (edgeId: string, pathOffsetY: number) => {
      if (!editable) return
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId
            ? {
                ...e,
                data: { ...e.data, routing: 'loop-back' as const, pathOffsetY },
              }
            : e
        )
      )
    },
    [editable, setEdges]
  )

  const commitEdgesToDraft = useCallback(() => {
    if (!editable) return
    syncEdgesToDraft(getEdges())
  }, [editable, getEdges, syncEdgesToDraft])

  const edgeTypes = useMemo(() => ({ deletable: WorkflowDeletableEdge }), [])

  const edgeActions = useMemo(
    () => ({ editable, deleteEdge: deleteEdgeById, updateEdgePathOffset, commitEdgesToDraft }),
    [editable, deleteEdgeById, updateEdgePathOffset, commitEdgesToDraft]
  )

  const onNodeDragStop = useCallback(() => {
    if (!editable) return
    const positions = Object.fromEntries(getNodes().map((n) => [n.id, { x: n.position.x, y: n.position.y }]))
    onPositionsChange(positions)
  }, [editable, getNodes, onPositionsChange])

  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || !onConnect) return
      onConnect(conn.source, conn.target, {
        sourceHandle: conn.sourceHandle,
        targetHandle: conn.targetHandle,
      })
    },
    [onConnect]
  )

  return (
    <WorkflowEdgeActionsProvider value={edgeActions}>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={editable ? onNodesChange : undefined}
      onEdgesChange={editable ? handleEdgesChange : undefined}
      onEdgesDelete={editable ? handleEdgesDelete : undefined}
      onConnect={editable ? handleConnect : undefined}
      onNodeClick={(e, node) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          onSelectNodes(
            selectedNodeIds.includes(node.id)
              ? selectedNodeIds.filter((id) => id !== node.id)
              : [...selectedNodeIds, node.id]
          )
        } else {
          onSelectNodes([node.id])
        }
      }}
      onNodeDoubleClick={(_e, node) => {
        onOpenNodeProperties?.(node.id)
      }}
      onPaneClick={() => onSelectNodes([])}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={campaignWorkflowNodeTypes}
      edgeTypes={edgeTypes}
      fitView
      minZoom={0.25}
      maxZoom={1.6}
      panOnScroll
      zoomOnScroll
      nodesDraggable={editable}
      nodesConnectable={editable && !!onConnect}
      elementsSelectable={editable}
      deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
      defaultEdgeOptions={{
        selectable: editable,
        deletable: editable,
        focusable: editable,
        markerEnd: workflowEdgeMarkerEnd(edgeMarkerColor),
      }}
      proOptions={{ hideAttribution: true }}
      style={{ width: '100%', height: '100%' }}
      className={`campaign-workflow-canvas${isDark ? ' campaign-workflow-canvas--dark' : ''}`}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color={dotColor} />
      <Controls showInteractive={false} className="campaign-workflow-controls">
        <WorkflowCanvasThemeToggle />
        {showMobileLayoutToggle && onToggleMobileLayout ? (
          <WorkflowCanvasLayoutToggle
            vertical={vertical}
            disabled={mobileLayoutDisabled}
            onToggle={onToggleMobileLayout}
          />
        ) : null}
        {onTidyLayout && showCanvasTidy ? (
          <WorkflowCanvasTidyButton
            draft={draft}
            vertical={vertical}
            editable={editable}
            onTidyLayout={onTidyLayout}
          />
        ) : null}
      </Controls>
      <Panel position="top-center" className="pointer-events-none mt-2 hidden sm:block">
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur ${
            isDark
              ? 'border-slate-600/80 bg-slate-900/90 text-slate-300'
              : 'border-slate-200/80 bg-white/90 text-slate-500'
          }`}
        >
          {editable
            ? '▶ Test node · Double-click node for properties · Ctrl+V paste · Ctrl+A select all · Ctrl+Z undo'
            : 'Double-click node for properties · Pan & zoom to explore'}
        </span>
      </Panel>
      <FitViewOnChange deps={fitDeps} />
    </ReactFlow>
    </WorkflowEdgeActionsProvider>
  )
}
