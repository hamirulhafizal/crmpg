import { WORKFLOW_NODE } from '@/app/lib/campaigns/workflow-events'
import type { CampaignAudienceFilters, CampaignTriggerType } from '@/app/lib/campaigns/types'
import type { WorkflowEditorDraft, WorkflowEditorStep } from '@/app/lib/campaigns/workflow-layout'
import { compileWorkflowDefinition } from '@/app/lib/workflows/compile'
import { createDefaultWorkflowDefinition, isEmptyWorkflowDefinition } from '@/app/lib/workflows/defaults'
import { topologicalOrder } from '@/app/lib/workflows/graph-order'
import { normalizeN8nTypesInDefinition } from '@/app/lib/workflows/normalize-definition'
import type { WorkflowDefinition, WorkflowEdge, WorkflowNodeInstance } from '@/app/lib/workflows/types'

function layoutFromDefinition(def: WorkflowDefinition) {
  const nodes: Record<string, { x: number; y: number }> = {}
  for (const n of def.nodes) {
    nodes[n.id] = { x: n.position.x, y: n.position.y }
  }
  return { nodes }
}

export function definitionToDraft(def: WorkflowDefinition): WorkflowEditorDraft {
  const normalized = normalizeN8nTypesInDefinition(def)
  const compiled = compileWorkflowDefinition(normalized)
  return {
    trigger_type: compiled.trigger_type,
    trigger_offset_days: compiled.trigger_offset_days,
    audience_filters: compiled.audience_filters,
    daily_send_limit: compiled.daily_send_limit,
    cooldown_days: compiled.cooldown_days,
    steps: compiled.steps.map((s) => ({
      step_order: s.step_order,
      delay_days: s.delay_days,
      send_time: s.send_time,
      message_template: s.message_template,
      is_active: s.is_active,
    })),
    layout: layoutFromDefinition(normalized),
    definition: normalized,
  }
}

export function draftToDefinition(draft: WorkflowEditorDraft): WorkflowDefinition {
  if (draft.definition?.nodes?.length) {
    return normalizeN8nTypesInDefinition(syncDefinitionFromDraftFields(draft.definition, draft))
  }
  return buildDefinitionFromLegacyDraft(draft)
}

function syncDefinitionFromDraftFields(def: WorkflowDefinition, draft: WorkflowEditorDraft): WorkflowDefinition {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    const wa = def.nodes.filter((n) => n.type === 'crm.whatsapp.send')
    console.debug('[workflow sync] whatsapp nodes before sync', wa.map((n) => ({
      id: n.id,
      step_order: n.parameters?.step_order,
      legacyOrder: legacyStepOrderFromNodeId(n.id),
    })))
  }

  const nodes = def.nodes.map((n) => {
    switch (n.type) {
      case 'crm.trigger.manual':
        return {
          ...n,
          parameters: {
            ...n.parameters,
            trigger_type: draft.trigger_type,
            trigger_offset_days: draft.trigger_offset_days,
          },
        }
      case 'crm.audience.filter':
        return { ...n, parameters: { ...n.parameters, audience_filters: draft.audience_filters } }
      case 'crm.enroll.queue':
        return {
          ...n,
          parameters: {
            ...n.parameters,
            daily_send_limit: draft.daily_send_limit,
            cooldown_days: draft.cooldown_days,
          },
        }
      case 'crm.whatsapp.send':
      case 'crm.integration.waha': {
        const legacyOrder = legacyStepOrderFromNodeId(n.id)
        const order = legacyOrder ?? Math.max(1, Number(n.parameters?.step_order ?? 0))
        const step = draft.steps.find((s) => s.step_order === order)
        if (!step) return n
        return {
          ...n,
          parameters: {
            ...n.parameters,
            step_order: step.step_order,
            delay_days: step.delay_days,
            send_time: step.send_time,
            message_template: step.message_template,
            is_active: step.is_active !== false,
          },
        }
      }
      case 'crm.data.supabase':
        if (n.parameters?.operation === 'getAll') {
          return {
            ...n,
            parameters: {
              ...n.parameters,
              audience_filters: draft.audience_filters,
            },
          }
        }
        return n
      default:
        return n
    }
  })

  const positions = draft.layout?.nodes ?? {}
  const nodesWithPos = nodes.map((n) => ({
    ...n,
    position: positions[n.id] ?? n.position,
  }))

  const result = { ...def, nodes: nodesWithPos }

  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    const wa = result.nodes.filter((n) => n.type === 'crm.whatsapp.send')
    console.debug('[workflow sync] whatsapp nodes after sync', wa.map((n) => ({
      id: n.id,
      step_order: n.parameters?.step_order,
    })))
  }

  return result
}

/** Only legacy canvas ids `step-1`, `step-2`. Dynamic ids (e.g. `send-173…-1`) must use parameters.step_order. */
function legacyStepOrderFromNodeId(nodeId: string): number | null {
  const m = /^step-(\d+)$/.exec(nodeId)
  return m ? Number(m[1]) : null
}

function buildDefinitionFromLegacyDraft(draft: WorkflowEditorDraft): WorkflowDefinition {
  const def = createDefaultWorkflowDefinition()
  const activeSteps = [...draft.steps]
    .filter((s) => s.is_active !== false)
    .sort((a, b) => a.step_order - b.step_order)

  const baseNodes = def.nodes.filter((n) => n.type !== 'crm.whatsapp.send')
  const complete = def.nodes.find((n) => n.type === 'crm.flow.complete')!
  const positions = draft.layout?.nodes ?? {}

  const stepNodes: WorkflowNodeInstance[] = activeSteps.map((step, i) => ({
    id: WORKFLOW_NODE.step(step.step_order),
    type: 'crm.whatsapp.send',
    position: positions[WORKFLOW_NODE.step(step.step_order)] ?? {
      x: (220 + 56) * (3 + i),
      y: 40,
    },
    parameters: {
      step_order: step.step_order,
      delay_days: step.delay_days,
      send_time: step.send_time,
      message_template: step.message_template,
      is_active: step.is_active !== false,
    },
  }))

  const nodes: WorkflowNodeInstance[] = [
    {
      ...baseNodes.find((n) => n.id === WORKFLOW_NODE.trigger)!,
      parameters: {
        trigger_type: draft.trigger_type,
        trigger_offset_days: draft.trigger_offset_days,
      },
      position: positions[WORKFLOW_NODE.trigger] ?? baseNodes[0]!.position,
    },
    {
      ...baseNodes.find((n) => n.id === WORKFLOW_NODE.audience)!,
      parameters: { audience_filters: draft.audience_filters },
      position: positions[WORKFLOW_NODE.audience] ?? baseNodes[1]!.position,
    },
    {
      ...baseNodes.find((n) => n.id === WORKFLOW_NODE.enroll)!,
      parameters: {
        daily_send_limit: draft.daily_send_limit,
        cooldown_days: draft.cooldown_days,
      },
      position: positions[WORKFLOW_NODE.enroll] ?? baseNodes[2]!.position,
    },
    ...stepNodes,
    {
      ...complete,
      position: positions[WORKFLOW_NODE.complete] ?? complete.position,
    },
  ]

  const edges: WorkflowEdge[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!
    const b = nodes[i + 1]!
    edges.push({ id: `e-${a.id}-${b.id}`, source: a.id, target: b.id })
  }

  return { version: 1, nodes, edges }
}

export function resolveWorkflowDefinition(
  campaign: {
    workflow_definition?: unknown
    trigger_type?: string
    trigger_offset_days?: number
    audience_filters?: CampaignAudienceFilters
    daily_send_limit?: number
    cooldown_days?: number
    workflow_layout?: { nodes?: Record<string, { x: number; y: number }> } | null
  },
  steps: WorkflowEditorStep[]
): WorkflowDefinition {
  if (!isEmptyWorkflowDefinition(campaign.workflow_definition)) {
    return (campaign.workflow_definition as WorkflowDefinition)
  }
  return buildDefinitionFromLegacyDraft({
    trigger_type: (campaign.trigger_type as CampaignTriggerType) ?? 'manual',
    trigger_offset_days: Number(campaign.trigger_offset_days ?? 0),
    audience_filters: (campaign.audience_filters ?? {}) as CampaignAudienceFilters,
    daily_send_limit: Number(campaign.daily_send_limit ?? 100),
    cooldown_days: Number(campaign.cooldown_days ?? 30),
    steps,
    layout: (campaign.workflow_layout ?? {}) as WorkflowEditorDraft['layout'],
  })
}

export { topologicalOrder }
