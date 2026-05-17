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
import type { WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'

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

export type FlowEdgePayload = { id: string; source: string; target: string }

export function WorkflowFlowCanvas({
  draft,
  nodeStates,
  editable,
  selectedNodeId,
  onSelectNode,
  onPositionsChange,
  onConnect,
  onEdgesSync,
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
  onConnect?: (source: string, target: string) => void
  /** Called when edges are removed (or batch-updated) so draft.workflow_definition.edges stays in sync. */
  onEdgesSync?: (edges: FlowEdgePayload[]) => void
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

  const edgesFingerprint = useMemo(
    () =>
      (draft.definition?.edges ?? [])
        .map((e) => `${e.id}:${e.source}:${e.target}`)
        .join('|'),
    [draft.definition?.edges]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges] = useEdgesState(built.edges)
  const { getNodes } = useReactFlow()

  useEffect(() => {
    setNodes(built.nodes)
  }, [built.nodes, setNodes])

  useEffect(() => {
    setEdges(built.edges)
  }, [edgesFingerprint, built.edges, setEdges])

  const syncEdgesToDraft = useCallback(
    (next: Edge[]) => {
      onEdgesSync?.(
        next.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        }))
      )
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

  const onNodeDragStop = useCallback(() => {
    if (!editable) return
    const positions = Object.fromEntries(getNodes().map((n) => [n.id, { x: n.position.x, y: n.position.y }]))
    onPositionsChange(positions)
  }, [editable, getNodes, onPositionsChange])

  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || !onConnect) return
      onConnect(conn.source, conn.target)
    },
    [onConnect]
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={editable ? onNodesChange : undefined}
      onEdgesChange={editable ? handleEdgesChange : undefined}
      onEdgesDelete={editable ? handleEdgesDelete : undefined}
      onConnect={editable ? handleConnect : undefined}
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
      nodesConnectable={editable && !!onConnect}
      elementsSelectable={editable}
      deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
      defaultEdgeOptions={{
        selectable: editable,
        deletable: editable,
        focusable: editable,
      }}
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
          {editable
            ? 'Drag nodes · Connect handles · Click a line & Delete to remove'
            : 'Pan & zoom to explore'}
        </span>
      </Panel>
      <FitViewOnChange deps={fitDeps} />
    </ReactFlow>
  )
}
