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

export type ProcessDueOptions = {
  /** When true, collect `debug` lines (also printed with `console.log`). */
  debug?: boolean
  /** Restrict enrollment sync + due-send batch to this campaign (must be active and in window). */
  campaignIdOnly?: string
}

export type ProcessDueResult = {
  summary: ProcessSummary
  /** Present when `debug` was requested. */
  debug?: string[]
}

function cronLog(debugLines: string[] | undefined, message: string) {
  if (!debugLines) return
  const line = `[campaign-cron] ${message}`
  debugLines.push(line)
  console.log(line)
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
  summary: ProcessSummary,
  debugLines?: string[]
): Promise<void> {
  if (steps.length === 0) {
    cronLog(debugLines, `skip enrollment sync: no steps campaign=${campaign.id}`)
    return
  }
  if (!['manual', 'enrollment'].includes(campaign.trigger_type)) {
    cronLog(debugLines, `skip enrollment sync: trigger=${campaign.trigger_type} campaign=${campaign.id}`)
    return
  }

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
         customer_tags ( tag_id, tags ( slug ) )`
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

const enrollmentDueSelect = `
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

type DueEnrollmentRow = {
  id: string
  last_step_sent: number
  campaign: CampaignRow | CampaignRow[] | null
  customer: CustomerForAudience | CustomerForAudience[] | null
}

async function processDueEnrollmentRows(
  supabase: ReturnType<typeof createServiceRoleClient>,
  due: DueEnrollmentRow[],
  now: Date,
  dayStart: Date,
  summary: ProcessSummary,
  debugLines?: string[]
): Promise<void> {
  cronLog(debugLines, `due batch: ${due.length} enrollment row(s)`)
  for (const row of due) {
    const rawCamp = row.campaign
    const campaign = (Array.isArray(rawCamp) ? rawCamp[0] : rawCamp) as CampaignRow | null
    const rawCust = row.customer as CustomerForAudience | CustomerForAudience[] | null
    const customer = (Array.isArray(rawCust) ? rawCust[0] : rawCust) as CustomerForAudience | null
    if (!campaign || campaign.status !== 'active' || !campaignInWindow(campaign, now) || !customer?.phone) {
      cronLog(
        debugLines,
        `skip enrollment=${row.id}: campaign=${campaign?.id ?? 'null'} status=${campaign?.status ?? 'n/a'} inWindow=${campaign ? campaignInWindow(campaign, now) : false} phone=${Boolean(customer?.phone)}`
      )
      continue
    }

    const sentToday = await countSentToday(supabase, campaign.id, dayStart)
    if (sentToday >= campaign.daily_send_limit) {
      cronLog(
        debugLines,
        `skip enrollment=${row.id}: daily cap campaign=${campaign.id} sentToday=${sentToday} limit=${campaign.daily_send_limit}`
      )
      continue
    }

    const { data: stepRows } = await supabase
      .from('campaign_steps')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('step_order', { ascending: true })

    const steps = ((stepRows ?? []) as CampaignStepRow[]).filter((s) => s.is_active)
    const nextStep = steps.find((s) => s.step_order > row.last_step_sent)
    if (!nextStep) {
      cronLog(debugLines, `enrollment=${row.id} campaign=${campaign.id}: no further step → mark completed`)
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
      cronLog(debugLines, `fail enrollment=${row.id} campaign=${campaign.id}: no WAHA session user=${campaign.user_id}`)
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
      cronLog(debugLines, `fail enrollment=${row.id}: log insert error ${logErr?.message ?? 'unknown'}`)
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

      cronLog(
        debugLines,
        `sent campaign=${campaign.id} "${campaign.name}" customer=${customer.id} step=${nextStep.step_order} log=${logInsert.id}`
      )

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
      cronLog(debugLines, `fail send enrollment=${row.id} log=${logInsert.id}: ${msg}`)
      await supabase
        .from('campaign_message_logs')
        .update({
          send_status: 'failed',
          error_message: msg,
        })
        .eq('id', logInsert.id)
    }
  }
}

export async function processDueCampaignMessages(opts?: ProcessDueOptions): Promise<ProcessDueResult> {
  const debugLines = opts?.debug ? [] : undefined
  const supabase = createServiceRoleClient()
  const summary: ProcessSummary = {
    campaigns_scanned: 0,
    enrollments_inserted: 0,
    messages_attempted: 0,
    messages_sent: 0,
    messages_failed: 0,
  }

  const now = new Date()
  cronLog(
    debugLines,
    `start at=${now.toISOString()} mode=${opts?.campaignIdOnly ? 'campaign_id_only' : 'global'} campaignIdOnly=${opts?.campaignIdOnly ?? '—'}`
  )

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('status', 'active')

  let active = (campaigns ?? []).filter((c) => campaignInWindow(c as CampaignRow, now)) as CampaignRow[]

  if (opts?.campaignIdOnly) {
    const narrowed = active.filter((c) => c.id === opts.campaignIdOnly)
    if (narrowed.length === 0) {
      cronLog(
        debugLines,
        `campaign_id=${opts.campaignIdOnly} not among ${active.length} in-window active campaign(s); skipping sync and sends`
      )
      return { summary, ...(debugLines && debugLines.length > 0 ? { debug: debugLines } : {}) }
    }
    active = narrowed
    cronLog(debugLines, `scoped to "${active[0]?.name}" (${opts.campaignIdOnly})`)
  }

  summary.campaigns_scanned = active.length
  cronLog(
    debugLines,
    `active_campaigns=${active.length} → ${active.map((c) => `${c.id.slice(0, 8)}…${c.name}`).join(' | ') || 'none'}`
  )

  for (const c of active) {
    const { data: stepRows } = await supabase
      .from('campaign_steps')
      .select('*')
      .eq('campaign_id', c.id)
      .order('step_order', { ascending: true })

    const steps = (stepRows ?? []) as CampaignStepRow[]
    const insBefore = summary.enrollments_inserted
    await syncEnrollmentsForCampaign(supabase, c, steps, summary, debugLines)
    cronLog(debugLines, `enrollment sync campaign=${c.id} +${summary.enrollments_inserted - insBefore}`)
  }

  const isoNow = now.toISOString()
  const dayStart = startOfUtcDay(now)

  let dueBuilder = supabase
    .from('campaign_enrollments')
    .select(enrollmentDueSelect)
    .eq('status', 'active')
    .or(`next_send_at.is.null,next_send_at.lte.${isoNow}`)
    .limit(SEND_BATCH)

  if (opts?.campaignIdOnly) {
    dueBuilder = dueBuilder.eq('campaign_id', opts.campaignIdOnly)
  }

  const { data: dueRows, error: dueErr } = await dueBuilder
  if (dueErr) {
    cronLog(debugLines, `due query error: ${dueErr.message}`)
    throw dueErr
  }

  cronLog(debugLines, `due query returned ${(dueRows ?? []).length} row(s)`)
  await processDueEnrollmentRows(supabase, (dueRows ?? []) as DueEnrollmentRow[], now, dayStart, summary, debugLines)

  cronLog(
    debugLines,
    `done enrollments_inserted_total=${summary.enrollments_inserted} attempted=${summary.messages_attempted} sent=${summary.messages_sent} failed=${summary.messages_failed}`
  )

  return {
    summary,
    ...(debugLines && debugLines.length > 0 ? { debug: debugLines } : {}),
  }
}

/**
 * Same processing logic as the global cron, but scoped to one campaign (dashboard "Test run").
 * Validates active + schedule window, then delegates to {@link processDueCampaignMessages} with `campaignIdOnly`.
 */
export async function processDueCampaignMessagesForCampaign(
  campaignId: string,
  opts?: { debug?: boolean }
): Promise<ProcessDueResult> {
  const supabase = createServiceRoleClient()
  const now = new Date()

  const { data: campaignRow, error: campErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('status', 'active')
    .maybeSingle()

  if (campErr) throw campErr
  if (!campaignRow) {
    throw new Error('Campaign not found or not active')
  }

  const c = campaignRow as CampaignRow
  if (!campaignInWindow(c, now)) {
    throw new Error('Campaign is outside its start/end window')
  }

  return processDueCampaignMessages({ ...opts, campaignIdOnly: campaignId })
}
