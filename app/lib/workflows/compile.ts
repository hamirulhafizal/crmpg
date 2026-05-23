import type { CampaignAudienceFilters, CampaignTriggerType } from '@/app/lib/campaigns/types'
import { sendTimeFromDb } from '@/app/lib/campaigns/schedule'
import { normalizeRunDate, normalizeRunTime, normalizeRunDayOfMonth, normalizeRunFrequency, normalizeRunWeekday } from '@/app/lib/campaigns/trigger-schedule'
import { topologicalOrder } from '@/app/lib/workflows/graph-order'
import type { CompiledWorkflow, WorkflowDefinition } from '@/app/lib/workflows/types'

function sendTimeLabel(t: unknown): string {
  return sendTimeFromDb(t != null ? String(t) : '')
}

export function compileWorkflowDefinition(def: WorkflowDefinition): CompiledWorkflow {
  const ordered = topologicalOrder(def)

  let trigger_type: CampaignTriggerType = 'manual'
  let trigger_offset_days = 0
  let run_date = ''
  let run_time = ''
  let run_frequency: 'daily' | 'weekly' | 'monthly' = 'daily'
  let run_weekday = 1
  let run_day_of_month = 1
  let audience_filters: CampaignAudienceFilters = {}
  let daily_send_limit = 100
  let cooldown_days = 30
  const steps: CompiledWorkflow['steps'] = []

  const hasEnroll = ordered.some((n) => n.type === 'crm.enroll.queue')
  const loopNode = ordered.find((n) => n.type === 'crm.flow.loop')

  for (const node of ordered) {
    const p = node.parameters ?? {}
    switch (node.type) {
      case 'crm.trigger.manual':
      case 'crm.trigger.schedule':
        trigger_type = (p.trigger_type as CampaignTriggerType) ?? 'manual'
        trigger_offset_days = Number(p.trigger_offset_days ?? 0)
        run_date = normalizeRunDate(p.run_date as string | undefined)
        run_time = normalizeRunTime(p.run_time as string | undefined)
        run_frequency = normalizeRunFrequency(p.run_frequency)
        run_weekday = normalizeRunWeekday(p.run_weekday)
        run_day_of_month = normalizeRunDayOfMonth(p.run_day_of_month)
        break
      case 'crm.audience.filter':
        audience_filters = (p.audience_filters as CampaignAudienceFilters) ?? {}
        break
      case 'crm.data.supabase':
        if (p.operation === 'getAll' && p.audience_filters) {
          audience_filters = (p.audience_filters as CampaignAudienceFilters) ?? audience_filters
        }
        break
      case 'crm.enroll.queue':
        daily_send_limit = Math.max(1, Number(p.daily_send_limit ?? 100))
        cooldown_days = Math.max(0, Number(p.cooldown_days ?? 30))
        break
      case 'crm.flow.loop':
        if (!hasEnroll) {
          daily_send_limit = Math.max(1, Number(p.batch_size ?? 1))
          cooldown_days = Math.max(0, Number(p.cooldown_days ?? 0))
        }
        break
      case 'crm.whatsapp.send':
      case 'crm.integration.waha':
        if (p.is_active === false) break
        steps.push({
          step_order: Math.max(1, Number(p.step_order ?? steps.length + 1)),
          delay_days: Math.max(0, Number(p.delay_days ?? 0)),
          send_time: sendTimeLabel(p.send_time),
          message_template: String(p.message_template ?? p.message1 ?? ''),
          is_active: p.is_active !== false,
          node_id: node.id,
        })
        break
      case 'crm.whatsapp.send_image':
        if (p.is_active === false) break
        steps.push({
          step_order: Math.max(1, Number(p.step_order ?? steps.length + 1)),
          delay_days: Math.max(0, Number(p.delay_days ?? 0)),
          send_time: sendTimeLabel(p.send_time),
          message_template: String(p.caption_template ?? ''),
          is_active: p.is_active !== false,
          node_id: node.id,
        })
        break
      default:
        break
    }
  }

  if (!hasEnroll && loopNode && daily_send_limit === 100) {
    daily_send_limit = Math.max(1, Number(loopNode.parameters?.batch_size ?? 1))
  }

  steps.sort((a, b) => a.step_order - b.step_order)

  return {
    trigger_type,
    trigger_offset_days,
    run_date,
    run_time,
    run_frequency,
    run_weekday,
    run_day_of_month,
    audience_filters,
    daily_send_limit,
    cooldown_days,
    steps,
  }
}
