import type { CampaignAudienceFilters, CampaignTriggerType } from '@/app/lib/campaigns/types'

export const WORKFLOW_DEFINITION_VERSION = 1 as const

export type WorkflowNodeCategory = 'trigger' | 'logic' | 'action' | 'integration' | 'flow'

/** Built-in node type slugs (catalog may extend via DB). */
export type WorkflowNodeTypeSlug =
  | 'crm.trigger.manual'
  | 'crm.audience.filter'
  | 'crm.enroll.queue'
  | 'crm.whatsapp.send'
  | 'crm.flow.complete'

export type WorkflowNodeInstance = {
  id: string
  type: WorkflowNodeTypeSlug | string
  position: { x: number; y: number }
  parameters: Record<string, unknown>
}

export type WorkflowEdgeRouting = 'default' | 'loop-back'

export type WorkflowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  /** Route backward connections below the main row (draggable). */
  routing?: WorkflowEdgeRouting
  /** Pixels below the lower endpoint — used when routing is loop-back. */
  pathOffsetY?: number
}

export type WorkflowDefinition = {
  version: typeof WORKFLOW_DEFINITION_VERSION
  nodes: WorkflowNodeInstance[]
  edges: WorkflowEdge[]
}

export type WorkflowNodeTypeDescriptor = {
  slug: string
  category: WorkflowNodeCategory
  label: string
  description: string | null
  icon: string | null
  parameter_schema: Record<string, unknown>
  handler_key: string
  n8n_type: string | null
  n8n_type_version?: number
  n8n_parameters?: Record<string, unknown>
  is_system: boolean
  enabled: boolean
  sort_order: number
}

export type WorkflowNodeTypeRow = WorkflowNodeTypeDescriptor & {
  id: string
  created_at?: string
}

export type CompiledWorkflow = {
  trigger_type: CampaignTriggerType
  trigger_offset_days: number
  run_date: string
  run_time: string
  run_frequency: 'daily' | 'weekly' | 'monthly'
  run_weekday: number
  run_day_of_month: number
  audience_filters: CampaignAudienceFilters
  daily_send_limit: number
  cooldown_days: number
  steps: Array<{
    step_order: number
    delay_days: number
    send_time: string
    message_template: string
    is_active: boolean
    node_id?: string
  }>
}
