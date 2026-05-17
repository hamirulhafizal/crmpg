import type { Edge, Node } from '@xyflow/react'
import { Position } from '@xyflow/react'
import type { WorkflowNodeData, WorkflowNodeKind } from '@/app/dashboard/campaigns/_components/CampaignWorkflowNode'
import type { WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'
import { WORKFLOW_NODE } from '@/app/lib/campaigns/workflow-events'
import { getBuiltinNodeType } from '@/app/lib/workflows/catalog'
import { topologicalOrder } from '@/app/lib/workflows/graph-order'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'
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

function kindFromType(type: string): WorkflowNodeKind {
  if (type.startsWith('crm.trigger.')) return 'trigger'
  if (type === 'crm.audience.filter') return 'audience'
  if (type === 'crm.enroll.queue') return 'enroll'
  if (type === 'crm.whatsapp.send') return 'step'
  return 'complete'
}

function titleForNode(type: string, params: Record<string, unknown>): { title: string; subtitle: string } {
  const meta = getBuiltinNodeType(type)
  const label = meta?.label ?? type
  switch (type) {
    case 'crm.trigger.manual':
      return { title: label, subtitle: String(params.trigger_type ?? 'manual') }
    case 'crm.audience.filter':
      return { title: label, subtitle: 'Filter CRM customers' }
    case 'crm.enroll.queue':
      return { title: label, subtitle: 'Add to campaign queue' }
    case 'crm.whatsapp.send':
      return {
        title: `Step ${params.step_order ?? '?'}`,
        subtitle: `WhatsApp · +${params.delay_days ?? 0}d · ${sendTimeLabel(String(params.send_time ?? '10:00'))}`,
      }
    default:
      return { title: label, subtitle: type }
  }
}

function graphDefsFromDraft(
  draft: WorkflowEditorDraft,
  stats: { enrolled: number; dueNow: number; matchingAudience?: number }
): GraphDef[] {
  if (draft.definition?.nodes?.length) {
    const ordered = topologicalOrder(draft.definition)
    return ordered.map((n) => {
      const { title, subtitle } = titleForNode(n.type, n.parameters ?? {})
      let badge: string | undefined
      if (n.id === WORKFLOW_NODE.audience && stats.matchingAudience != null) {
        badge = `${stats.matchingAudience} match today`
      }
      if (n.id === WORKFLOW_NODE.enroll) {
        badge =
          stats.enrolled > 0
            ? `${stats.enrolled} enrolled`
            : stats.dueNow > 0
              ? `${stats.dueNow} due`
              : undefined
      }
      return { id: n.id, kind: kindFromType(n.type), title, subtitle, badge }
    })
  }

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

function edgesFromDefinition(
  def: WorkflowDefinition,
  nodeStates: Record<string, WorkflowNodeState>
): Edge[] {
  const edgeList =
    def.edges.length > 0
      ? def.edges
      : (() => {
          const ordered = topologicalOrder(def)
          return ordered.slice(0, -1).map((n, i) => ({
            id: `e-${n.id}-${ordered[i + 1]!.id}`,
            source: n.id,
            target: ordered[i + 1]!.id,
          }))
        })()

  return edgeList.map((e) => {
    const sourceState = nodeStates[e.source] ?? 'idle'
    const targetState = nodeStates[e.target] ?? 'idle'
    const active = sourceState === 'active' || targetState === 'active'
    const complete = sourceState === 'complete' && targetState !== 'idle'
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: active,
      style: {
        stroke: active ? '#0ea5e9' : complete ? '#10b981' : '#cbd5e1',
        strokeWidth: active ? 2.5 : 2,
      },
    }
  })
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
  const nodeIds = defs.map((d) => d.id)
  const legacyIds = workflowNodeIds(stepOrders)
  const useVertical = opts.vertical && !opts.editable && !opts.draft.layout?.nodes && !opts.draft.definition

  const positions =
    opts.draft.definition?.nodes?.length
      ? Object.fromEntries(opts.draft.definition.nodes.map((n) => [n.id, n.position]))
      : mergeLayoutPositions(legacyIds.length === nodeIds.length ? legacyIds : nodeIds, opts.draft.layout, useVertical)

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
    connectable: opts.editable,
  }))

  const edges = opts.draft.definition?.nodes?.length
    ? edgesFromDefinition(opts.draft.definition, opts.nodeStates)
    : defs.slice(0, -1).map((def, index) => {
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
