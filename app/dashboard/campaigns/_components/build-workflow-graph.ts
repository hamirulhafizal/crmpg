import type { Edge, Node } from '@xyflow/react'
import { Position } from '@xyflow/react'
import type { WorkflowNodeData, WorkflowNodeKind } from '@/app/dashboard/campaigns/_components/CampaignWorkflowNode'
import type { WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'
import { formatWaitRangeLabel, normalizeWaitParams } from '@/app/lib/workflows/wait-params'
import { WORKFLOW_NODE } from '@/app/lib/campaigns/workflow-events'
import { getBuiltinNodeType } from '@/app/lib/workflows/catalog'
import { topologicalOrder } from '@/app/lib/workflows/graph-order'
import {
  defaultLoopBackOffset,
  shouldUseLoopBackRouting,
} from '@/app/lib/workflows/edge-path'
import { workflowEdgeMarkerEnd, workflowEdgeStroke } from '@/app/lib/workflows/workflow-edge-marker'
import type { WorkflowDefinition, WorkflowEdge, WorkflowEdgeRouting } from '@/app/lib/workflows/types'
import { triggerScheduleDisplayLabel, triggerScheduleFromParams } from '@/app/lib/campaigns/trigger-schedule'
import {
  mergeLayoutPositions,
  sendTimeDisplayLabel,
  workflowNodeIds,
  type WorkflowEditorDraft,
} from '@/app/lib/campaigns/workflow-layout'

type GraphDef = {
  id: string
  nodeType: string
  kind: WorkflowNodeKind
  title: string
  subtitle: string
  badge?: string
}

function kindFromType(type: string): WorkflowNodeKind {
  switch (type) {
    case 'crm.trigger.schedule':
      return 'schedule'
    case 'crm.trigger.manual':
      return 'trigger'
    case 'crm.audience.filter':
      return 'audience'
    case 'crm.data.supabase':
      return 'database'
    case 'crm.enroll.queue':
      return 'enroll'
    case 'crm.flow.loop':
      return 'loop'
    case 'crm.data.set':
      return 'transform'
    case 'crm.whatsapp.send':
      return 'step'
    case 'crm.integration.waha':
      return 'http'
    case 'crm.flow.wait':
      return 'wait'
    case 'crm.flow.pass':
      return 'pass'
    case 'crm.flow.complete':
      return 'complete'
    default:
      return 'complete'
  }
}

function subtitleForType(type: string, params: Record<string, unknown>): string {
  switch (type) {
    case 'crm.trigger.manual': {
      const sched = triggerScheduleDisplayLabel(triggerScheduleFromParams(params))
      return `${params.trigger_type ?? 'manual'} · ${sched}`
    }
    case 'crm.trigger.schedule': {
      const sched = triggerScheduleDisplayLabel(triggerScheduleFromParams(params))
      const cron = String(params.cron_expression ?? '')
      return sched !== 'anytime' ? sched : cron || '0 8 * * *'
    }
    case 'crm.audience.filter':
      return 'Filter CRM customers'
    case 'crm.data.supabase':
      return `${params.operation ?? 'getAll'}: ${params.table ?? 'row'}`
    case 'crm.enroll.queue':
      return 'Add to campaign queue'
    case 'crm.flow.loop':
      return `batch ${params.batch_size ?? 1}`
    case 'crm.data.set':
      return 'manual'
    case 'crm.whatsapp.send':
      return `WhatsApp · +${params.delay_days ?? 0}d · ${sendTimeDisplayLabel(params.send_time != null ? String(params.send_time) : '')}`
    case 'crm.integration.waha': {
      const method = String(params.http_method ?? 'POST')
      const url = String(params.n8n_url ?? '')
      if (url) {
        const short = url.length > 32 ? `${url.slice(0, 32)}…` : url
        return `${method}: ${short}`
      }
      return `${method} · step ${params.step_order ?? '?'}`
    }
    case 'crm.flow.wait': {
      const { minSeconds, maxSeconds } = normalizeWaitParams(params)
      return formatWaitRangeLabel(minSeconds, maxSeconds)
    }
    case 'crm.flow.pass':
      return ''
    default:
      return type
  }
}

function titleForNode(type: string, params: Record<string, unknown>): { title: string; subtitle: string } {
  const displayName =
    typeof params.display_name === 'string' && params.display_name.trim()
      ? params.display_name.trim()
      : null
  const meta = getBuiltinNodeType(type)
  const label = meta?.label ?? type
  if (displayName) {
    return { title: displayName, subtitle: subtitleForType(type, params) }
  }
  switch (type) {
    case 'crm.whatsapp.send':
      return {
        title: `Step ${params.step_order ?? '?'}`,
        subtitle: subtitleForType(type, params),
      }
    default:
      return { title: label, subtitle: subtitleForType(type, params) }
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
      return {
        id: n.id,
        nodeType: n.type,
        kind: kindFromType(n.type),
        title,
        subtitle,
        badge,
      }
    })
  }

  const activeSteps = [...draft.steps]
    .filter((s) => s.is_active !== false)
    .sort((a, b) => a.step_order - b.step_order)

  const defs: GraphDef[] = [
    {
      id: WORKFLOW_NODE.trigger,
      nodeType: 'crm.trigger.manual',
      kind: 'trigger',
      title: 'Trigger',
      subtitle: `${draft.trigger_type} · ${triggerScheduleDisplayLabel({ run_date: draft.run_date, run_time: draft.run_time })}`,
    },
    {
      id: WORKFLOW_NODE.audience,
      nodeType: 'crm.audience.filter',
      kind: 'audience',
      title: 'Audience',
      subtitle: 'Filter CRM customers',
      badge: stats.matchingAudience != null ? `${stats.matchingAudience} match today` : undefined,
    },
    {
      id: WORKFLOW_NODE.enroll,
      nodeType: 'crm.enroll.queue',
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
      nodeType: 'crm.whatsapp.send',
      kind: 'step',
      title: `Step ${step.step_order}`,
      subtitle: `WhatsApp · +${step.delay_days}d · ${sendTimeDisplayLabel(step.send_time)}`,
    })
  }

  defs.push({
    id: WORKFLOW_NODE.complete,
    nodeType: 'crm.flow.complete',
    kind: 'complete',
    title: 'Done',
    subtitle: 'Completed enrollments',
  })

  return defs
}

function edgeType(editable: boolean): string {
  return editable ? 'deletable' : 'smoothstep'
}

const NODE_W = 220

function resolveEdgeHandles(
  e: WorkflowEdge,
  nodesById: Map<string, { type: string }>
): { sourceHandle?: string; targetHandle?: string } {
  const sourceNode = nodesById.get(e.source)
  let sourceHandle = e.sourceHandle
  if (sourceNode?.type === 'crm.flow.loop' && (!sourceHandle || sourceHandle === 'main')) {
    sourceHandle = 'loop'
  }
  return {
    sourceHandle,
    targetHandle: e.targetHandle ?? 'main',
  }
}

function edgesFromDefinition(
  def: WorkflowDefinition,
  nodeStates: Record<string, WorkflowNodeState>,
  editable: boolean,
  positions: Record<string, { x: number; y: number }>
): Edge[] {
  const edgeList: WorkflowEdge[] =
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

  const nodesById = new Map(def.nodes.map((n) => [n.id, { type: n.type }]))

  return edgeList.map((e) => {
    const sourceState = nodeStates[e.source] ?? 'idle'
    const targetState = nodeStates[e.target] ?? 'idle'
    const active = sourceState === 'active' || targetState === 'active'
    const complete = sourceState === 'complete' && targetState !== 'idle'
    const stroke = workflowEdgeStroke(active, complete)
    const src = positions[e.source]
    const tgt = positions[e.target]
    const { sourceHandle, targetHandle } = resolveEdgeHandles(e, nodesById)
    const routing: WorkflowEdgeRouting =
      e.routing ??
      (src && tgt
        ? shouldUseLoopBackRouting(src.x + NODE_W, tgt.x, e.routing, {
            sourceY: src.y,
            targetY: tgt.y,
            sourceHandle,
          })
          ? 'loop-back'
          : 'default'
        : 'default')
    const pathOffsetY =
      e.pathOffsetY ??
      (routing === 'loop-back' && src && tgt
        ? defaultLoopBackOffset(src.y + 45, tgt.y + 45)
        : undefined)

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle,
      targetHandle,
      type: edgeType(editable),
      animated: active,
      data: { routing, pathOffsetY },
      markerEnd: workflowEdgeMarkerEnd(stroke),
      style: {
        stroke,
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
  selectedNodeIds: string[]
  enrolled: number
  dueNow: number
  matchingAudience?: number
  onTestNode?: (nodeId: string) => void
  testingNodeId?: string | null
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
      nodeType: def.nodeType,
      state: opts.nodeStates[def.id] ?? 'idle',
      badge: def.badge,
      selected: opts.selectedNodeIds.includes(def.id),
      editable: opts.editable,
      onTestNode: opts.editable ? opts.onTestNode : undefined,
      testing: opts.testingNodeId === def.id,
    },
    sourcePosition,
    targetPosition,
    draggable: opts.editable,
    selectable: opts.editable,
    connectable: opts.editable,
  }))

  const edges = opts.draft.definition?.nodes?.length
    ? edgesFromDefinition(opts.draft.definition, opts.nodeStates, opts.editable, positions)
    : defs.slice(0, -1).map((def, index) => {
        const targetId = defs[index + 1]!.id
        const sourceState = opts.nodeStates[def.id] ?? 'idle'
        const targetState = opts.nodeStates[targetId] ?? 'idle'
        const active = sourceState === 'active' || targetState === 'active'
        const complete = sourceState === 'complete' && targetState !== 'idle'
        const stroke = workflowEdgeStroke(active, complete)
        return {
          id: `e-${def.id}-${targetId}`,
          source: def.id,
          target: targetId,
          type: edgeType(opts.editable),
          animated: active,
          markerEnd: workflowEdgeMarkerEnd(stroke),
          style: {
            stroke,
            strokeWidth: active ? 2.5 : 2,
          },
        }
      })

  return { nodes, edges }
}
