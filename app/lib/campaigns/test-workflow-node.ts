import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeDueAudiencePreview,
  computeEligibleAudiencePreview,
  describeCampaignAudienceFilters,
  resolveTagIdLabels,
} from '@/app/lib/campaigns/audience-preview'
import { customerMatchesFilters, type CustomerForAudience } from '@/app/lib/campaigns/audience'
import { computeSendAt, isScheduledSendTime, sendTimeDisplayLabel, sendTimeFromDb } from '@/app/lib/campaigns/schedule'
import { triggerScheduleDisplayLabel, triggerScheduleFromParams } from '@/app/lib/campaigns/trigger-schedule'
import { renderCampaignTemplateForCustomer } from '@/app/lib/campaigns/template'
import type { CampaignAudienceFilters, CampaignRow } from '@/app/lib/campaigns/types'
import { customerWorkflowLabel } from '@/app/lib/campaigns/workflow-events'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import { compileWorkflowDefinition } from '@/app/lib/workflows/compile'
import { buildCampaignWorkflowPlan } from '@/app/lib/workflows/plan'
import { draftToDefinition } from '@/app/lib/workflows/sync'
import type { WorkflowDefinition, WorkflowNodeInstance } from '@/app/lib/workflows/types'

export type WorkflowNodeTestItem = {
  label: string
  detail?: string
  meta?: Record<string, string | number | null>
}

export type WorkflowNodeTestResult = {
  ok: boolean
  node_id: string
  node_type: string
  title: string
  duration_ms: number
  summary: string
  logs: string[]
  items: WorkflowNodeTestItem[]
  metrics: Record<string, number | string | boolean | null>
  error?: string
}

function findNode(def: WorkflowDefinition, nodeId: string): WorkflowNodeInstance | undefined {
  return def.nodes.find((n) => n.id === nodeId)
}

function nodeDisplayTitleFromParams(node: WorkflowNodeInstance): string {
  const name = node.parameters?.display_name
  if (typeof name === 'string' && name.trim()) return name.trim()
  return String(node.type).split('.').pop() ?? 'Node'
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual — run test or cron sync',
  birthday: 'Customer birthday',
  last_purchase: 'Last purchase date',
  enrollment: 'On enrollment event',
}

export async function testWorkflowNode(opts: {
  supabase: SupabaseClient
  userId: string
  nodeId: string
  draft: WorkflowEditorDraft
  campaign?: Pick<
    CampaignRow,
    'id' | 'timezone' | 'status' | 'start_at' | 'end_at'
  > | null
}): Promise<WorkflowNodeTestResult> {
  const started = Date.now()
  const def = draftToDefinition(opts.draft)
  const node = findNode(def, opts.nodeId)
  if (!node) {
    return {
      ok: false,
      node_id: opts.nodeId,
      node_type: 'unknown',
      title: 'Unknown node',
      duration_ms: Date.now() - started,
      summary: 'Node not found in workflow',
      logs: [],
      items: [],
      metrics: {},
      error: 'Node not found',
    }
  }

  const compiled = compileWorkflowDefinition(def)
  const logs: string[] = []
  const items: WorkflowNodeTestItem[] = []
  const metrics: Record<string, number | string | boolean | null> = {}

  try {
    switch (node.type) {
      case 'crm.trigger.schedule': {
        const cron = String(node.parameters?.cron_expression ?? '0 8 * * *')
        const sched = triggerScheduleDisplayLabel(
          triggerScheduleFromParams(node.parameters as Record<string, unknown>)
        )
        logs.push(`Cron: ${cron}`)
        logs.push(`Run schedule: ${sched}`)
        logs.push('CRM runs on manual test / external cron when campaign is active.')
        return {
          ok: true,
          node_id: opts.nodeId,
          node_type: node.type,
          title: 'Schedule',
          duration_ms: Date.now() - started,
          summary: sched !== 'anytime' ? sched : `Cron ${cron}`,
          logs,
          items: [
            { label: 'Cron expression', detail: cron },
            { label: 'Run schedule', detail: sched },
          ],
          metrics: { cron_expression: cron },
        }
      }

      case 'crm.trigger.manual': {
        const triggerType = compiled.trigger_type
        const offset = compiled.trigger_offset_days
        const sched = triggerScheduleDisplayLabel({
          run_date: compiled.run_date,
          run_time: compiled.run_time,
        })
        logs.push(`Trigger type: ${triggerType}`)
        logs.push(`Offset days: ${offset}`)
        logs.push(`Run schedule: ${sched}`)
        if (triggerType === 'manual') {
          logs.push('Enrollment sync runs on “Run test” or campaign cron when campaign is active.')
        } else {
          logs.push('Automated triggers are evaluated per customer profile (not simulated here).')
        }
        return {
          ok: true,
          node_id: opts.nodeId,
          node_type: node.type,
          title: 'Manual trigger',
          duration_ms: Date.now() - started,
          summary: sched !== 'anytime' ? sched : (TRIGGER_LABELS[triggerType] ?? triggerType),
          logs,
          items: [
            { label: 'Trigger type', detail: triggerType },
            { label: 'Offset (days)', detail: String(offset) },
            { label: 'Run schedule', detail: sched },
            {
              label: 'Campaign window',
              detail:
                opts.campaign?.start_at || opts.campaign?.end_at
                  ? `${opts.campaign.start_at ?? '—'} → ${opts.campaign.end_at ?? '—'}`
                  : 'No start/end limit',
            },
          ],
          metrics: { trigger_type: triggerType, offset_days: offset, run_schedule: sched },
        }
      }

      case 'crm.audience.filter': {
        const filters = compiled.audience_filters
        const tagIds = (filters.tag_ids ?? []).map(String).filter(Boolean)
        const tagLabels = tagIds.length > 0 ? await resolveTagIdLabels(opts.supabase, tagIds) : undefined
        const criteria = describeCampaignAudienceFilters(filters, tagLabels)
        logs.push(...criteria.map((l) => `Rule: ${l}`))

        const preview = await computeEligibleAudiencePreview(opts.supabase, opts.userId, filters)
        logs.push(`Scanned ${preview.customers_scanned} customers in CRM`)
        logs.push(`${preview.matching_total} match audience rules now`)

        for (const row of preview.sample.slice(0, 12)) {
          items.push({
            label: row.save_name?.trim() || row.name?.trim() || row.pg_code || row.id,
            detail: row.phone ?? 'No phone',
            meta: { pg_code: row.pg_code },
          })
        }

        metrics.matching_total = preview.matching_total
        metrics.customers_scanned = preview.customers_scanned

        return {
          ok: true,
          node_id: opts.nodeId,
          node_type: node.type,
          title: 'Audience',
          duration_ms: Date.now() - started,
          summary: `${preview.matching_total} customer(s) match · ${preview.sample.length} shown`,
          logs,
          items,
          metrics,
        }
      }

      case 'crm.enroll.queue': {
        const filters = compiled.audience_filters
        const preview = await computeEligibleAudiencePreview(opts.supabase, opts.userId, filters)
        let alreadyEnrolled = 0
        let activeEnrollments = 0

        if (opts.campaign?.id) {
          const [{ count: allE }, { count: activeE }] = await Promise.all([
            opts.supabase
              .from('campaign_enrollments')
              .select('id', { count: 'exact', head: true })
              .eq('campaign_id', opts.campaign.id),
            opts.supabase
              .from('campaign_enrollments')
              .select('id', { count: 'exact', head: true })
              .eq('campaign_id', opts.campaign.id)
              .eq('status', 'active'),
          ])
          alreadyEnrolled = allE ?? 0
          activeEnrollments = activeE ?? 0
        }

        const newCandidates = Math.max(0, preview.matching_total - alreadyEnrolled)
        logs.push(`Audience matches: ${preview.matching_total}`)
        logs.push(`Already in campaign: ${alreadyEnrolled} (${activeEnrollments} active)`)
        logs.push(`Daily send limit: ${compiled.daily_send_limit}`)
        logs.push(
          newCandidates > 0
            ? `Up to ${newCandidates} new enrollment(s) on next sync (if not already enrolled)`
            : 'No new enrollments expected — all matches may already be enrolled'
        )

        metrics.matching_total = preview.matching_total
        metrics.already_enrolled = alreadyEnrolled
        metrics.active_enrollments = activeEnrollments
        metrics.daily_send_limit = compiled.daily_send_limit
        metrics.new_candidates = newCandidates

        return {
          ok: true,
          node_id: opts.nodeId,
          node_type: node.type,
          title: 'Enroll',
          duration_ms: Date.now() - started,
          summary: `${preview.matching_total} match · ${alreadyEnrolled} enrolled · cap ${compiled.daily_send_limit}/day`,
          logs,
          items: preview.sample.slice(0, 8).map((row) => ({
            label: row.save_name?.trim() || row.name?.trim() || 'Customer',
            detail: row.phone ? `Would queue if not enrolled · ${row.phone}` : 'Skipped — no phone',
          })),
          metrics,
        }
      }

      case 'crm.data.supabase': {
        const op = String(node.parameters?.operation ?? 'getAll')
        if (op !== 'getAll') {
          logs.push(`Operation: ${op}`)
          return {
            ok: true,
            node_id: opts.nodeId,
            node_type: node.type,
            title: nodeDisplayTitleFromParams(node),
            duration_ms: Date.now() - started,
            summary: `${op} on ${node.parameters?.table ?? 'customers'} (visual / not simulated)`,
            logs,
            items: [],
            metrics: { operation: op },
          }
        }
        const filters =
          (node.parameters?.audience_filters as CampaignAudienceFilters) ?? compiled.audience_filters
        const tagIds = (filters.tag_ids ?? []).map(String).filter(Boolean)
        const tagLabels = tagIds.length > 0 ? await resolveTagIdLabels(opts.supabase, tagIds) : undefined
        const criteria = describeCampaignAudienceFilters(filters, tagLabels)
        logs.push(...criteria.map((l) => `Rule: ${l}`))
        const preview = await computeEligibleAudiencePreview(opts.supabase, opts.userId, filters)
        logs.push(`${preview.matching_total} match (Get Many / audience)`)
        return {
          ok: true,
          node_id: opts.nodeId,
          node_type: node.type,
          title: nodeDisplayTitleFromParams(node),
          duration_ms: Date.now() - started,
          summary: `${preview.matching_total} customer(s) match filters`,
          logs,
          items: preview.sample.slice(0, 12).map((row) => ({
            label: row.save_name?.trim() || row.name?.trim() || row.pg_code || row.id,
            detail: row.phone ?? 'No phone',
          })),
          metrics: { matching_total: preview.matching_total },
        }
      }

      case 'crm.whatsapp.send':
      case 'crm.integration.waha': {
        const p = node.parameters ?? {}
        const stepOrder = Math.max(1, Number(p.step_order ?? 1))
        const delayDays = Math.max(0, Number(p.delay_days ?? 0))
        const sendTime = sendTimeFromDb(p.send_time != null ? String(p.send_time) : '')
        const template = String(p.message_template ?? '')
        const isActive = p.is_active !== false
        const tz = opts.campaign?.timezone?.trim() || 'Asia/Kuala_Lumpur'

        logs.push(`Step order: ${stepOrder}`)
        logs.push(`Delay: +${delayDays}d at ${sendTimeDisplayLabel(sendTime)} (${tz})`)
        logs.push(`Active: ${isActive ? 'yes' : 'no'}`)

        if (!isActive) {
          return {
            ok: true,
            node_id: opts.nodeId,
            node_type: node.type,
            title: `Step ${stepOrder}`,
            duration_ms: Date.now() - started,
            summary: 'Step is inactive — no sends',
            logs,
            items: [],
            metrics: { step_order: stepOrder, is_active: false },
          }
        }

        if (opts.campaign?.id) {
          const isoNow = new Date().toISOString()
          const { data: dueRows } = await opts.supabase
            .from('campaign_enrollments')
            .select(
              `id, last_step_sent, next_send_at, customer:customers ( id, phone, name, first_name, sender_name, save_name, pg_code, prefix, gender, ethnicity, location, last_purchase_at, original_data, is_monthly_buyer, is_friend, segment_attributes, customer_tags ( tag_id, tags ( slug ) ) )`
            )
            .eq('campaign_id', opts.campaign.id)
            .eq('status', 'active')
            .lte('next_send_at', isoNow)
            .order('next_send_at', { ascending: true })
            .limit(40)

          const forStep = (dueRows ?? []).filter((r) => Number(r.last_step_sent ?? 0) < stepOrder)
          const dueForThisStep = forStep.filter((r) => Number(r.last_step_sent ?? 0) === stepOrder - 1)

          logs.push(`${dueForThisStep.length} enrollment(s) due for this step now`)

          for (const row of dueForThisStep.slice(0, 10)) {
            const raw = row.customer as CustomerForAudience | CustomerForAudience[] | null
            const c = Array.isArray(raw) ? raw[0] : raw
            if (!c?.phone) continue
            const body = renderCampaignTemplateForCustomer(template, c as Record<string, unknown>)
            items.push({
              label: customerWorkflowLabel(c),
              detail: body.slice(0, 160) + (body.length > 160 ? '…' : ''),
              meta: {
                next_send_at: row.next_send_at ? String(row.next_send_at) : null,
                phone: c.phone,
              },
            })
          }

          metrics.due_now = dueForThisStep.length
          metrics.due_any_step = forStep.length

          return {
            ok: true,
            node_id: opts.nodeId,
            node_type: node.type,
            title: `Step ${stepOrder}`,
            duration_ms: Date.now() - started,
            summary:
              dueForThisStep.length > 0
                ? `${dueForThisStep.length} due now (dry-run preview, not sent)`
                : 'No enrollments due for this step right now',
            logs,
            items,
            metrics: { ...metrics, step_order: stepOrder },
          }
        }

        // No campaign id — preview against audience only
        const filters = compiled.audience_filters
        const preview = await computeEligibleAudiencePreview(opts.supabase, opts.userId, filters)
        const anchor = computeSendAt(new Date(), delayDays, sendTime, tz)
        logs.push('Save campaign to see enrollment-based due times')
        logs.push(`If enrolled now, first slot anchor ≈ ${anchor.toLocaleString('en-MY', { timeZone: tz })}`)

        const { data: sampleRows } = await opts.supabase
          .from('customers')
          .select(
            `id, phone, name, first_name, sender_name, save_name, pg_code, prefix, gender, ethnicity, location, last_purchase_at, dob, created_at, original_data, is_monthly_buyer, is_friend, segment_attributes,
             customer_tags ( tag_id, tags ( slug ) )`
          )
          .eq('user_id', opts.userId)
          .not('phone', 'is', null)
          .limit(80)

        let shown = 0
        for (const raw of sampleRows ?? []) {
          const c = raw as unknown as CustomerForAudience
          if (!customerMatchesFilters(c, filters)) continue
          const body = renderCampaignTemplateForCustomer(template, c as Record<string, unknown>)
          items.push({
            label: customerWorkflowLabel(c),
            detail: body.slice(0, 160) + (body.length > 160 ? '…' : ''),
            meta: { phone: c.phone },
          })
          shown++
          if (shown >= 8) break
        }

        metrics.audience_match = preview.matching_total

        return {
          ok: true,
          node_id: opts.nodeId,
          node_type: node.type,
          title: `Step ${stepOrder}`,
          duration_ms: Date.now() - started,
          summary: `${preview.matching_total} in audience · message preview (not sent)`,
          logs,
          items,
          metrics: { ...metrics, step_order: stepOrder },
        }
      }

      case 'crm.flow.complete': {
        let completed = 0
        if (opts.campaign?.id) {
          const { count } = await opts.supabase
            .from('campaign_enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', opts.campaign.id)
            .eq('status', 'completed')
          completed = count ?? 0
          logs.push(`${completed} enrollment(s) marked completed`)
        } else {
          logs.push('Customers reach Done after the last WhatsApp step is sent')
        }

        const plan = buildCampaignWorkflowPlan(
          { workflow_definition: def } as CampaignRow & { workflow_definition: WorkflowDefinition },
          []
        )
        const lastStep = plan.whatsappNodes.filter((w) => w.isActive).sort((a, b) => b.stepOrder - a.stepOrder)[0]

        return {
          ok: true,
          node_id: opts.nodeId,
          node_type: node.type,
          title: 'Done',
          duration_ms: Date.now() - started,
          summary: opts.campaign?.id
            ? `${completed} completed enrollment(s)`
            : lastStep
              ? `After Step ${lastStep.stepOrder} sends successfully`
              : 'End of workflow',
          logs,
          items: [],
          metrics: { completed_enrollments: completed },
        }
      }

      default:
        return {
          ok: false,
          node_id: opts.nodeId,
          node_type: String(node.type),
          title: String(node.type),
          duration_ms: Date.now() - started,
          summary: 'Unsupported node type for test',
          logs: [`Type ${node.type} has no test handler yet`],
          items: [],
          metrics: {},
          error: 'Unsupported node type',
        }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Test failed'
    return {
      ok: false,
      node_id: opts.nodeId,
      node_type: String(node.type),
      title: String(node.type),
      duration_ms: Date.now() - started,
      summary: msg,
      logs,
      items,
      metrics,
      error: msg,
    }
  }
}
