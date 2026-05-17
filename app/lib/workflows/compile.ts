import type { CampaignAudienceFilters, CampaignTriggerType } from '@/app/lib/campaigns/types'
import { topologicalOrder } from '@/app/lib/workflows/graph-order'
import type { CompiledWorkflow, WorkflowDefinition } from '@/app/lib/workflows/types'

function sendTimeLabel(t: unknown): string {
  const s = String(t ?? '10:00')
  return s.length >= 5 ? s.slice(0, 5) : '10:00'
}

export function compileWorkflowDefinition(def: WorkflowDefinition): CompiledWorkflow {
  const ordered = topologicalOrder(def)

  let trigger_type: CampaignTriggerType = 'manual'
  let trigger_offset_days = 0
  let audience_filters: CampaignAudienceFilters = {}
  let daily_send_limit = 100
  let cooldown_days = 30
  const steps: CompiledWorkflow['steps'] = []

  for (const node of ordered) {
    const p = node.parameters ?? {}
    switch (node.type) {
      case 'crm.trigger.manual':
        trigger_type = (p.trigger_type as CampaignTriggerType) ?? 'manual'
        trigger_offset_days = Number(p.trigger_offset_days ?? 0)
        break
      case 'crm.audience.filter':
        audience_filters = (p.audience_filters as CampaignAudienceFilters) ?? {}
        break
      case 'crm.enroll.queue':
        daily_send_limit = Math.max(1, Number(p.daily_send_limit ?? 100))
        cooldown_days = Math.max(0, Number(p.cooldown_days ?? 30))
        break
      case 'crm.whatsapp.send':
        steps.push({
          step_order: Math.max(1, Number(p.step_order ?? steps.length + 1)),
          delay_days: Math.max(0, Number(p.delay_days ?? 0)),
          send_time: sendTimeLabel(p.send_time),
          message_template: String(p.message_template ?? ''),
          is_active: p.is_active !== false,
          node_id: node.id,
        })
        break
      default:
        break
    }
  }

  steps.sort((a, b) => a.step_order - b.step_order)

  return {
    trigger_type,
    trigger_offset_days,
    audience_filters,
    daily_send_limit,
    cooldown_days,
    steps,
  }
}
