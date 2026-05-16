import type { Edge, Node } from '@xyflow/react'
import { Position } from '@xyflow/react'
import type { WorkflowNodeData, WorkflowNodeKind } from '@/app/dashboard/campaigns/_components/CampaignWorkflowNode'
import type { WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'
import { WORKFLOW_NODE } from '@/app/lib/campaigns/workflow-events'
import {
  mergeLayoutPositions,
  sendTimeLabel,
  workflowNodeIds,
  type WorkflowEditorDraft,
} from '@/app/lib/campaigns/workflow-layout'

type GraphDef = {
  id: string
  kind: WorkflowNodeKind
  title: string
  subtitle: string
  badge?: string
}

function graphDefsFromDraft(
  draft: WorkflowEditorDraft,
  stats: { enrolled: number; dueNow: number; matchingAudience?: number }
): GraphDef[] {
  const activeSteps = [...draft.steps]
    .filter((s) => s.is_active !== false)
    .sort((a, b) => a.step_order - b.step_order)

  const defs: GraphDef[] = [
    { id: WORKFLOW_NODE.trigger, kind: 'trigger', title: 'Trigger', subtitle: draft.trigger_type },
    {
      id: WORKFLOW_NODE.audience,
      kind: 'audience',
      title: 'Audience',
      subtitle: 'Filter CRM customers',
      badge: stats.matchingAudience != null ? `${stats.matchingAudience} match today` : undefined,
    },
    {
      id: WORKFLOW_NODE.enroll,
      kind: 'enroll',
      title: 'Enroll',
      subtitle: 'Add to campaign queue',
      badge:
        stats.enrolled > 0
          ? `${stats.enrolled} enrolled`
          : stats.dueNow > 0
            ? `${stats.dueNow} due`
            : undefined,
    },
  ]

  for (const step of activeSteps) {
    defs.push({
      id: WORKFLOW_NODE.step(step.step_order),
      kind: 'step',
      title: `Step ${step.step_order}`,
      subtitle: `WhatsApp · +${step.delay_days}d · ${sendTimeLabel(step.send_time)}`,
    })
  }

  defs.push({
    id: WORKFLOW_NODE.complete,
    kind: 'complete',
    title: 'Done',
    subtitle: 'Completed enrollments',
  })

  return defs
}

export function buildWorkflowFlowGraph(opts: {
  draft: WorkflowEditorDraft
  nodeStates: Record<string, WorkflowNodeState>
  vertical: boolean
  editable: boolean
  selectedNodeId: string | null
  enrolled: number
  dueNow: number
  matchingAudience?: number
}): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  const defs = graphDefsFromDraft(opts.draft, {
    enrolled: opts.enrolled,
    dueNow: opts.dueNow,
    matchingAudience: opts.matchingAudience,
  })

  const stepOrders = opts.draft.steps
    .filter((s) => s.is_active !== false)
    .map((s) => s.step_order)
  const nodeIds = workflowNodeIds(stepOrders)
  const useVertical = opts.vertical && !opts.editable && !opts.draft.layout?.nodes
  const positions = mergeLayoutPositions(nodeIds, opts.draft.layout, useVertical)

  const sourcePosition = useVertical ? Position.Bottom : Position.Right
  const targetPosition = useVertical ? Position.Top : Position.Left

  const nodes: Node<WorkflowNodeData>[] = defs.map((def) => ({
    id: def.id,
    type: 'workflow',
    position: positions[def.id] ?? { x: 0, y: 0 },
    data: {
      title: def.title,
      subtitle: def.subtitle,
      kind: def.kind,
      state: opts.nodeStates[def.id] ?? 'idle',
      badge: def.badge,
      selected: opts.selectedNodeId === def.id,
      editable: opts.editable,
    },
    sourcePosition,
    targetPosition,
    draggable: opts.editable,
    selectable: opts.editable,
    connectable: false,
  }))

  const edges: Edge[] = defs.slice(0, -1).map((def, index) => {
    const targetId = defs[index + 1]!.id
    const sourceState = opts.nodeStates[def.id] ?? 'idle'
    const targetState = opts.nodeStates[targetId] ?? 'idle'
    const active = sourceState === 'active' || targetState === 'active'
    const complete = sourceState === 'complete' && targetState !== 'idle'

    return {
      id: `e-${def.id}-${targetId}`,
      source: def.id,
      target: targetId,
      type: 'smoothstep',
      animated: active,
      style: {
        stroke: active ? '#0ea5e9' : complete ? '#10b981' : '#cbd5e1',
        strokeWidth: active ? 2.5 : 2,
      },
    }
  })

  return { nodes, edges }
}
