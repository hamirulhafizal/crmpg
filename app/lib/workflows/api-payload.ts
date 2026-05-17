import { compileWorkflowDefinition } from '@/app/lib/workflows/compile'
import { validateWorkflowDefinition } from '@/app/lib/workflows/validate'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

export function parseWorkflowDefinition(raw: unknown): WorkflowDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.nodes)) return null
  return {
    version: 1,
    nodes: o.nodes as WorkflowDefinition['nodes'],
    edges: Array.isArray(o.edges) ? (o.edges as WorkflowDefinition['edges']) : [],
  }
}

/** Apply workflow_definition from API body onto campaign insert/update payload. */
export function applyWorkflowToCampaignPayload(
  body: Record<string, unknown>,
  payload: Record<string, unknown>
): string | null {
  const raw = body.workflow_definition
  if (raw == null) return null

  const def = parseWorkflowDefinition(raw)
  if (!def) return 'Invalid workflow_definition'

  const issues = validateWorkflowDefinition(def)
  if (issues.length > 0) return issues[0]!.message

  const compiled = compileWorkflowDefinition(def)

  payload.workflow_definition = def
  payload.trigger_type = compiled.trigger_type
  payload.trigger_offset_days = compiled.trigger_offset_days
  payload.audience_filters = compiled.audience_filters
  payload.daily_send_limit = compiled.daily_send_limit
  payload.cooldown_days = compiled.cooldown_days

  return null
}
