import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { customerMatchesFilters, type CustomerForAudience } from '@/app/lib/campaigns/audience'
import { computeSendAt } from '@/app/lib/campaigns/schedule'
import { sendCampaignWhatsAppText } from '@/app/lib/campaigns/send-waha'
import { buildTemplateVariableMap, renderCampaignTemplate } from '@/app/lib/campaigns/template'
import type {
  CampaignAudienceFilters,
  CampaignRow,
  CampaignStepRow,
} from '@/app/lib/campaigns/types'

export type ProcessSummary = {
  campaigns_scanned: number
  enrollments_inserted: number
  messages_attempted: number
  messages_sent: number
  messages_failed: number
}

const CUSTOMER_PAGE = 250
const SEND_BATCH = 25

function campaignInWindow(c: CampaignRow, now: Date): boolean {
  if (c.start_at && new Date(c.start_at) > now) return false
  if (c.end_at && new Date(c.end_at) < now) return false
  return true
}

async function pickWahaSession(supabase: ReturnType<typeof createServiceRoleClient>, userId: string): Promise<string | null> {
  const { data: rows } = await supabase
    .from('waha_user_sessions')
    .select('session_name, last_known_waha_status')
    .eq('user_id', userId)

  const list = rows ?? []
  const working = list.find((r) => String(r.last_known_waha_status || '').toUpperCase() === 'WORKING')
  if (working?.session_name) return working.session_name
  return list[0]?.session_name ?? null
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

async function countSentToday(
  supabase: ReturnType<typeof createServiceRoleClient>,
  campaignId: string,
  dayStart: Date
): Promise<number> {
  const { count, error } = await supabase
    .from('campaign_message_logs')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('send_status', 'sent')
    .gte('sent_at', dayStart.toISOString())

  if (error) return 0
  return count ?? 0
}

async function syncEnrollmentsForCampaign(
  supabase: ReturnType<typeof createServiceRoleClient>,
  campaign: CampaignRow,
  steps: CampaignStepRow[],
  summary: ProcessSummary
): Promise<void> {
  if (steps.length === 0) return
  if (!['manual', 'enrollment'].includes(campaign.trigger_type)) return

  const tz = campaign.timezone?.trim() || 'Asia/Kuala_Lumpur'
  const filters = (campaign.audience_filters || {}) as CampaignAudienceFilters
  const sorted = [...steps].filter((s) => s.is_active).sort((a, b) => a.step_order - b.step_order)
  const first = sorted[0]
  if (!first) return

  const { data: existing } = await supabase
    .from('campaign_enrollments')
    .select('customer_id')
    .eq('campaign_id', campaign.id)

  const enrolled = new Set((existing ?? []).map((r) => r.customer_id))

  let offset = 0
  while (true) {
    const { data: batch, error } = await supabase
      .from('customers')
      .select(
        `id, phone, name, first_name, pg_code, save_name, gender, location, last_purchase_at, original_data, is_monthly_buyer, is_friend, segment_attributes,
         customer_tags ( tags ( slug ) )`
      )
      .eq('user_id', campaign.user_id)
      .range(offset, offset + CUSTOMER_PAGE - 1)

    if (error) break
    const rows = batch ?? []
    if (rows.length === 0) break

    for (const raw of rows) {
      const c = raw as unknown as CustomerForAudience
      if (enrolled.has(c.id)) continue
      if (!customerMatchesFilters(c, filters)) continue

      const enrollMoment = new Date()
      const nextSend = computeSendAt(enrollMoment, first.delay_days, first.send_time, tz)

      const { error: insErr } = await supabase.from('campaign_enrollments').insert({
        campaign_id: campaign.id,
        customer_id: c.id,
        user_id: campaign.user_id,
        status: 'active',
        last_step_sent: 0,
        next_send_at: nextSend.toISOString(),
        metadata: {},
      })

      if (!insErr) {
        enrolled.add(c.id)
        summary.enrollments_inserted++
      }
    }

    offset += CUSTOMER_PAGE
    if (rows.length < CUSTOMER_PAGE) break
  }
}

export async function processDueCampaignMessages(): Promise<ProcessSummary> {
  const supabase = createServiceRoleClient()
  const summary: ProcessSummary = {
    campaigns_scanned: 0,
    enrollments_inserted: 0,
    messages_attempted: 0,
    messages_sent: 0,
    messages_failed: 0,
  }

  const now = new Date()

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('status', 'active')

  const active = (campaigns ?? []).filter((c) => campaignInWindow(c as CampaignRow, now)) as CampaignRow[]
  summary.campaigns_scanned = active.length

  for (const c of active) {
    const { data: stepRows } = await supabase
      .from('campaign_steps')
      .select('*')
      .eq('campaign_id', c.id)
      .order('step_order', { ascending: true })

    const steps = (stepRows ?? []) as CampaignStepRow[]
    await syncEnrollmentsForCampaign(supabase, c, steps, summary)
  }

  const isoNow = now.toISOString()
  const dayStart = startOfUtcDay(now)

  const { data: dueRows } = await supabase
    .from('campaign_enrollments')
    // Keep this customer column list aligned with CUSTOMER_MESSAGE_TEMPLATE_COLUMNS in template.ts (plus `id`).
    .select(
      `
      *,
      campaign:campaigns (*),
      customer:customers (
        id,
        name,
        dob,
        email,
        phone,
        location,
        gender,
        ethnicity,
        age,
        prefix,
        first_name,
        sender_name,
        save_name,
        pg_code,
        row_number,
        last_purchase_at,
        is_monthly_buyer,
        is_married,
        is_friend,
        segment_attributes,
        original_data,
        last_synced_at,
        phone_e164,
        email_normalized,
        sales_journey_stage,
        sales_journey_updated_at,
        created_at,
        updated_at
      )
    `
    )
    .eq('status', 'active')
    .or(`next_send_at.is.null,next_send_at.lte.${isoNow}`)
    .limit(SEND_BATCH)

  const due = dueRows ?? []

  for (const row of due) {
    const rawCamp = row.campaign as CampaignRow | CampaignRow[] | null
    const campaign = (Array.isArray(rawCamp) ? rawCamp[0] : rawCamp) as CampaignRow | null
    const rawCust = row.customer as CustomerForAudience | CustomerForAudience[] | null
    const customer = (Array.isArray(rawCust) ? rawCust[0] : rawCust) as CustomerForAudience | null
    if (!campaign || campaign.status !== 'active' || !campaignInWindow(campaign, now) || !customer?.phone) {
      continue
    }

    const sentToday = await countSentToday(supabase, campaign.id, dayStart)
    if (sentToday >= campaign.daily_send_limit) continue

    const { data: stepRows } = await supabase
      .from('campaign_steps')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('step_order', { ascending: true })

    const steps = ((stepRows ?? []) as CampaignStepRow[]).filter((s) => s.is_active)
    const nextStep = steps.find((s) => s.step_order > row.last_step_sent)
    if (!nextStep) {
      await supabase
        .from('campaign_enrollments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          next_send_at: null,
        })
        .eq('id', row.id)
      continue
    }

    const session = await pickWahaSession(supabase, campaign.user_id)
    if (!session) {
      summary.messages_failed++
      await supabase.from('campaign_message_logs').insert({
        campaign_id: campaign.id,
        campaign_step_id: nextStep.id,
        enrollment_id: row.id,
        customer_id: customer.id,
        user_id: campaign.user_id,
        phone: customer.phone,
        rendered_message: null,
        send_status: 'failed',
        error_message: 'No WAHA session configured',
      })
      continue
    }

    const vars = buildTemplateVariableMap(customer as Record<string, unknown>)
    const body = renderCampaignTemplate(nextStep.message_template, vars)
    summary.messages_attempted++

    const { data: logInsert, error: logErr } = await supabase
      .from('campaign_message_logs')
      .insert({
        campaign_id: campaign.id,
        campaign_step_id: nextStep.id,
        enrollment_id: row.id,
        customer_id: customer.id,
        user_id: campaign.user_id,
        phone: customer.phone,
        rendered_message: body,
        send_status: 'pending',
      })
      .select('id')
      .maybeSingle()

    if (logErr || !logInsert?.id) {
      summary.messages_failed++
      continue
    }

    try {
      await sendCampaignWhatsAppText(campaign.user_id, session, customer.phone, body)
      const sentAt = new Date().toISOString()
      await supabase
        .from('campaign_message_logs')
        .update({ send_status: 'sent', sent_at: sentAt })
        .eq('id', logInsert.id)

      await supabase.from('customer_follow_up_activities').insert({
        customer_id: customer.id,
        user_id: campaign.user_id,
        created_by: campaign.user_id,
        topic: 'campaign_automation',
        channel: 'whatsapp_automation',
        outcome: 'sent',
        notes: `Campaign “${campaign.name}” step ${nextStep.step_order}`,
        metadata: {
          campaign_id: campaign.id,
          campaign_step_id: nextStep.id,
          enrollment_id: row.id,
          campaign_message_log_id: logInsert.id,
        },
        idempotency_key: `campaign_send:${logInsert.id}`,
      })

      summary.messages_sent++

      const following = steps.find((s) => s.step_order > nextStep.step_order)
      const tz = campaign.timezone?.trim() || 'Asia/Kuala_Lumpur'
      let nextSend: Date | null = null
      if (following) {
        let computed = computeSendAt(new Date(sentAt), following.delay_days, following.send_time, tz)
        const cooldownMs = campaign.cooldown_days * 24 * 60 * 60 * 1000
        const minNext = new Date(new Date(sentAt).getTime() + cooldownMs)
        if (computed < minNext) computed = minNext
        nextSend = computed
      }

      await supabase
        .from('campaign_enrollments')
        .update({
          last_step_sent: nextStep.step_order,
          next_send_at: following ? nextSend!.toISOString() : null,
          status: following ? 'active' : 'completed',
          completed_at: following ? null : new Date().toISOString(),
        })
        .eq('id', row.id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      summary.messages_failed++
      await supabase
        .from('campaign_message_logs')
        .update({
          send_status: 'failed',
          error_message: msg,
        })
        .eq('id', logInsert.id)
    }
  }

  return summary
}
