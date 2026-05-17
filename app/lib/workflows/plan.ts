import type { CampaignRow, CampaignStepRow } from '@/app/lib/campaigns/types'
import { WORKFLOW_NODE } from '@/app/lib/campaigns/workflow-events'
import { compileWorkflowDefinition } from '@/app/lib/workflows/compile'
import { resolveWorkflowDefinition } from '@/app/lib/workflows/sync'
import { topologicalOrder } from '@/app/lib/workflows/graph-order'
import type { CompiledWorkflow, WorkflowDefinition, WorkflowNodeInstance } from '@/app/lib/workflows/types'

export type WhatsappPlanNode = {
  nodeId: string
  stepOrder: number
  delayDays: number
  sendTime: string
  messageTemplate: string
  isActive: boolean
}

export type CampaignWorkflowPlan = {
  definition: WorkflowDefinition
  compiled: CompiledWorkflow
  ordered: WorkflowNodeInstance[]
  /** All node ids for UI idle state initialization */
  nodeIds: string[]
  triggerNodeIds: string[]
  audienceNodeId: string | null
  enrollNodeId: string | null
  completeNodeId: string | null
  whatsappNodes: WhatsappPlanNode[]
  stepOrderToNodeId: Map<number, string>
  /** Run audience scan + enrollment insert */
  enableEnrollmentSync: boolean
  /** Campaign has at least one sendable WhatsApp step */
  enableDueSend: boolean
}

function firstNodeId(nodes: WorkflowNodeInstance[], type: string): string | null {
  return nodes.find((n) => n.type === type)?.id ?? null
}

function resolveNodeIdForStep(stepOrder: number, nodeId?: string): string {
  if (nodeId) return nodeId
  return WORKFLOW_NODE.step(stepOrder)
}

export function buildCampaignWorkflowPlan(
  campaign: CampaignRow & { workflow_definition?: unknown },
  steps: CampaignStepRow[] = []
): CampaignWorkflowPlan {
  const stepDrafts = steps.map((s) => ({
    id: s.id,
    step_order: s.step_order,
    delay_days: s.delay_days,
    send_time: s.send_time,
    message_template: s.message_template,
    is_active: s.is_active,
  }))

  const definition = resolveWorkflowDefinition(campaign, stepDrafts)
  const compiled = compileWorkflowDefinition(definition)
  const ordered = topologicalOrder(definition)

  const whatsappFromGraph: WhatsappPlanNode[] = ordered
    .filter((n) => n.type === 'crm.whatsapp.send')
    .map((n) => {
      const p = n.parameters ?? {}
      return {
        nodeId: n.id,
        stepOrder: Math.max(1, Number(p.step_order ?? 1)),
        delayDays: Math.max(0, Number(p.delay_days ?? 0)),
        sendTime: String(p.send_time ?? '10:00').slice(0, 5),
        messageTemplate: String(p.message_template ?? ''),
        isActive: p.is_active !== false,
      }
    })

  const stepOrderToNodeId = new Map<number, string>()
  for (const w of whatsappFromGraph) {
    stepOrderToNodeId.set(w.stepOrder, w.nodeId)
  }
  for (const s of steps.filter((x) => x.is_active)) {
    if (!stepOrderToNodeId.has(s.step_order)) {
      stepOrderToNodeId.set(s.step_order, resolveNodeIdForStep(s.step_order))
    }
  }

  const audienceNodeId = firstNodeId(ordered, 'crm.audience.filter')
  const enrollNodeId = firstNodeId(ordered, 'crm.enroll.queue')
  const completeNodeId = firstNodeId(ordered, 'crm.flow.complete')
  const triggerNodeIds = ordered.filter((n) => String(n.type).startsWith('crm.trigger.')).map((n) => n.id)

  const hasAudience = audienceNodeId != null
  const hasEnroll = enrollNodeId != null
  const triggerAllowsSync = ['manual', 'enrollment'].includes(compiled.trigger_type)
  const activeSteps = steps.filter((s) => s.is_active)

  return {
    definition,
    compiled,
    ordered,
    nodeIds: definition.nodes.map((n) => n.id),
    triggerNodeIds,
    audienceNodeId,
    enrollNodeId,
    completeNodeId,
    whatsappNodes: whatsappFromGraph,
    stepOrderToNodeId,
    enableEnrollmentSync: hasAudience && hasEnroll && triggerAllowsSync && activeSteps.length > 0,
    enableDueSend: activeSteps.length > 0 && whatsappFromGraph.some((w) => w.isActive),
  }
}

export function nodeIdForStep(plan: CampaignWorkflowPlan, stepOrder: number): string {
  return plan.stepOrderToNodeId.get(stepOrder) ?? WORKFLOW_NODE.step(stepOrder)
}

/** First WhatsApp node in graph order (used when enrolling). */
export function firstWhatsappNode(plan: CampaignWorkflowPlan): WhatsappPlanNode | null {
  const active = plan.whatsappNodes.filter((w) => w.isActive)
  if (active.length === 0) return null
  return [...active].sort((a, b) => a.stepOrder - b.stepOrder)[0] ?? null
}

export function nextWhatsappAfter(plan: CampaignWorkflowPlan, lastStepOrder: number): WhatsappPlanNode | null {
  const sorted = [...plan.whatsappNodes].filter((w) => w.isActive).sort((a, b) => a.stepOrder - b.stepOrder)
  return sorted.find((w) => w.stepOrder > lastStepOrder) ?? null
}
