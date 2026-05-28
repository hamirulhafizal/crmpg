import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  countActiveQueueSlots,
  countWaitingEnrollments,
  filterDueRowsForSequentialQueue,
  isQueueWaiting,
  metadataWithCustomerQueue,
  promoteNextQueuedEnrollment,
  reconcileSequentialQueue,
  usesSequentialCustomerQueue,
  type CustomerQueueMeta,
} from '@/app/lib/campaigns/customer-queue'
import { fetchActiveDueEnrollmentsMerged } from '@/app/lib/campaigns/due-enrollments-query'
import {
  CUSTOMER_EMBED_FOR_AUDIENCE_MATCH,
  customerMatchesFilters,
  type CustomerForAudience,
} from '@/app/lib/campaigns/audience'
import { computeSendAt, isScheduledSendTime } from '@/app/lib/campaigns/schedule'
import { campaignTriggerAllowsRunNow, getTriggerRunScheduleFromPlan, triggerScheduleDisplayLabel } from '@/app/lib/campaigns/trigger-schedule'
import { sendCampaignEmailFallback, type GmailFallbackCustomer } from '@/app/lib/campaigns/gmail-fallback'
import { sendCampaignImageStep } from '@/app/lib/campaigns/image-step/send'
import { sendCampaignWhatsAppText } from '@/app/lib/campaigns/send-waha'
import {
  isImageStepNode,
  whatsAppNodeForStep,
  whatsAppSendOptionsForStep,
} from '@/app/lib/campaigns/whatsapp-send-options'
import { renderCampaignTemplateForCustomer } from '@/app/lib/campaigns/template'
import type {
  CampaignAudienceFilters,
  CampaignRow,
  CampaignStepRow,
} from '@/app/lib/campaigns/types'
import {
  customerWorkflowLabel,
  WORKFLOW_NODE,
  type CampaignWorkflowProgressHandler,
} from '@/app/lib/campaigns/workflow-events'
import { metadataAfterStepSent, metadataForNewEnrollment } from '@/app/lib/workflows/enrollment-state'
import {
  buildCampaignWorkflowPlan,
  nodeIdForStep,
  type CampaignWorkflowPlan,
} from '@/app/lib/workflows/plan'
import { waitSecondsBeforeNextCustomer, waitSecondsOnPath } from '@/app/lib/workflows/wait-pacing'

export type ProcessSummary = {
  campaigns_scanned: number
  /** Active campaigns skipped because trigger date/time gate did not allow run yet today. */
  campaigns_skipped_schedule: number
  /** Active campaigns that passed the trigger gate and ran enrollment sync. */
  campaigns_processed: number
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
  /** Live progress for workflow visualizer (test run stream). */
  onProgress?: CampaignWorkflowProgressHandler
  /** Manual test run — skip daily run-time gate but still honor start/end window. */
  skipTriggerTimeGate?: boolean
}

export type ProcessDueResult = {
  summary: ProcessSummary
  /** Present when `debug` was requested. */
  debug?: string[]
}

function cronLog(debugLines: string[] | undefined, message: string) {
  const line = `[campaign-cron] ${message}`
  console.log(line)
  debugLines?.push(line)
}

const CUSTOMER_PAGE = 250
const SEND_BATCH = 25
const STEP_SEND_FAILURE_WINDOW_MS = 2 * 60 * 60 * 1000
const MAX_STEP_SEND_FAILURES_BEFORE_SKIP = 3

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

function audienceFiltersSummary(f: CampaignAudienceFilters): string {
  const slugs = (f.tag_slugs ?? []).map((s) => String(s).toLowerCase().trim()).filter(Boolean)
  const ids = (f.tag_ids ?? []).map(String).filter(Boolean)
  const acct = (f.account_status ?? []).length
  const eth = (f.ethnicities ?? []).join(',') || '—'
  return `tag_slugs=[${slugs.join(', ')}] tag_ids=${ids.length} account_status=${acct} gender=${f.gender ?? '—'} ethnicities=${eth} is_friend=${f.is_friend ?? '—'} profile_verified=${f.profile_verified ?? '—'} direct_debit=${f.direct_debit ?? '—'} is_monthly_buyer=${f.is_monthly_buyer ?? '—'}`
}

async function logCampaignPipelineDiagnostics(
  supabase: ReturnType<typeof createServiceRoleClient>,
  campaignId: string,
  userId: string,
  isoDue: string,
  debugLines: string[] | undefined
): Promise<void> {
  if (!debugLines) return

  const base = () =>
    supabase.from('campaign_enrollments').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId)

  const [{ count: allE }, { count: activeE }, { count: nullNext }, { count: futureNext }, { count: dueNext }, custRes] =
    await Promise.all([
      supabase.from('campaign_enrollments').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId),
      base().eq('status', 'active'),
      base().eq('status', 'active').is('next_send_at', null),
      base().eq('status', 'active').not('next_send_at', 'is', null).gt('next_send_at', isoDue),
      base().eq('status', 'active').not('next_send_at', 'is', null).lte('next_send_at', isoDue),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ])

  if (custRes.error) {
    cronLog(debugLines, `pipeline customers count error campaign=${campaignId}: ${custRes.error.message}`)
  }

  cronLog(
    debugLines,
    `pipeline campaign=${campaignId} customers_for_user=${custRes.count ?? 0} enrollments_all=${allE ?? 0} active=${activeE ?? 0} active_next_null=${nullNext ?? 0} active_next_future_gt_asof=${futureNext ?? 0} active_next_due_lte_asof=${dueNext ?? 0}`
  )

  const { data: sample } = await supabase
    .from('campaign_enrollments')
    .select('id, status, last_step_sent, next_send_at, customer_id')
    .eq('campaign_id', campaignId)
    .order('enrolled_at', { ascending: false })
    .limit(8)

  if (sample?.length) {
    cronLog(debugLines, `enrollment_recent_sample=${JSON.stringify(sample)}`)
  } else {
    cronLog(debugLines, 'enrollment_recent_sample=[] (no rows for this campaign)')
  }
}

async function promoteNextCustomerInQueue(
  supabase: ReturnType<typeof createServiceRoleClient>,
  campaignId: string,
  plan: CampaignWorkflowPlan,
  completedStepOrder: number,
  afterAt: string | Date,
  debugLines?: string[]
): Promise<void> {
  if (!usesSequentialCustomerQueue(plan)) return

  const lastNodeId = nodeIdForStep(plan, completedStepOrder)
  const waitSec = waitSecondsBeforeNextCustomer(plan.definition, lastNodeId)
  const baseMs = new Date(afterAt).getTime()
  const promoteAt = waitSec > 0 ? new Date(baseMs + waitSec * 1000) : new Date(baseMs)

  if (waitSec > 0) {
    cronLog(
      debugLines,
      `queue inter-customer wait=${waitSec}s after step=${completedStepOrder} → next customer at ${promoteAt.toISOString()}`
    )
  }

  await promoteNextQueuedEnrollment(supabase, campaignId, {
    nextSendAt: promoteAt,
    log: (msg) => cronLog(debugLines, msg),
  })
}

async function countRecentFailedStepAttempts(
  supabase: ReturnType<typeof createServiceRoleClient>,
  enrollmentId: string,
  stepId: string
): Promise<number> {
  const since = new Date(Date.now() - STEP_SEND_FAILURE_WINDOW_MS).toISOString()
  const { count, error } = await supabase
    .from('campaign_message_logs')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollmentId)
    .eq('campaign_step_id', stepId)
    .eq('send_status', 'failed')
    .gte('created_at', since)

  if (error) throw error
  return count ?? 0
}

async function advanceEnrollmentPastAbandonedStep(params: {
  supabase: ReturnType<typeof createServiceRoleClient>
  row: DueEnrollmentRow
  campaign: CampaignRow
  plan: CampaignWorkflowPlan
  steps: CampaignStepRow[]
  failedStep: CampaignStepRow
  reason: string
  debugLines?: string[]
  onProgress?: CampaignWorkflowProgressHandler
}): Promise<void> {
  const { supabase, row, campaign, plan, steps, failedStep, reason, debugLines, onProgress } = params
  const following = steps.find((s) => s.step_order > failedStep.step_order)
  const tz = campaign.timezone?.trim() || 'Asia/Kuala_Lumpur'
  const stepNodeId = nodeIdForStep(plan, failedStep.step_order)
  const workflowMeta = metadataAfterStepSent(plan, failedStep.step_order, stepNodeId)

  let nextSendAt: string | null = null
  let status: 'active' | 'completed' = 'completed'
  let completedAt: string | null = new Date().toISOString()

  if (following) {
    status = 'active'
    completedAt = null
    const computed = computeSendAt(new Date(), following.delay_days, following.send_time, tz)
    nextSendAt = computed.toISOString()
  }

  await supabase
    .from('campaign_enrollments')
    .update({
      last_step_sent: failedStep.step_order,
      next_send_at: nextSendAt,
      status,
      completed_at: completedAt,
      metadata: {
        ...(row.metadata ?? {}),
        ...workflowMeta,
        step_send_abandoned: {
          at: new Date().toISOString(),
          step_order: failedStep.step_order,
          step_id: failedStep.id,
          reason,
        },
      },
    })
    .eq('id', row.id)

  cronLog(
    debugLines,
    `abandon failed step enrollment=${row.id} campaign=${campaign.id} failed_step=${failedStep.step_order} following=${following?.step_order ?? 'none'} status=${status}`
  )
  onProgress?.({
    type: 'log',
    message: `Skipped step ${failedStep.step_order} after repeated failures so the queue can continue`,
    level: 'info',
  })

  if (!following && usesSequentialCustomerQueue(plan)) {
    await promoteNextCustomerInQueue(
      supabase,
      campaign.id,
      plan,
      failedStep.step_order,
      new Date(),
      debugLines
    )
  }
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
  plan: CampaignWorkflowPlan,
  summary: ProcessSummary,
  debugLines?: string[],
  onProgress?: CampaignWorkflowProgressHandler
): Promise<void> {
  if (!plan.enableEnrollmentSync) {
    cronLog(
      debugLines,
      `skip enrollment sync: workflow plan disabled (audience=${Boolean(plan.audienceNodeId)} enroll=${Boolean(plan.enrollNodeId)} trigger=${plan.compiled.trigger_type}) campaign=${campaign.id}`
    )
    return
  }
  if (steps.length === 0) {
    cronLog(debugLines, `skip enrollment sync: no steps campaign=${campaign.id}`)
    return
  }

  const tz = campaign.timezone?.trim() || 'Asia/Kuala_Lumpur'
  const filters = plan.compiled.audience_filters
  const sorted = [...steps].filter((s) => s.is_active).sort((a, b) => a.step_order - b.step_order)
  const first = sorted[0]
  if (!first) {
    cronLog(debugLines, `skip enrollment sync: no active steps campaign=${campaign.id}`)
    return
  }

  const { data: existing } = await supabase
    .from('campaign_enrollments')
    .select('customer_id')
    .eq('campaign_id', campaign.id)

  const enrolled = new Set((existing ?? []).map((r) => r.customer_id))
  const audienceId = plan.audienceNodeId ?? WORKFLOW_NODE.audience
  const enrollId = plan.enrollNodeId ?? WORKFLOW_NODE.enroll
  onProgress?.({ type: 'node', nodeId: audienceId, state: 'active' })
  onProgress?.({ type: 'log', message: 'Matching audience and enrolling new customers…' })
  onProgress?.({ type: 'node', nodeId: enrollId, state: 'active' })
  cronLog(
    debugLines,
    `sync start campaign=${campaign.id} user_id=${campaign.user_id} audience=${audienceFiltersSummary(filters)} first_step_order=${first.step_order} send_time=${first.send_time} delay_days=${first.delay_days} tz=${tz} already_enrolled_customers=${enrolled.size}`
  )

  let scanned = 0
  let skipAlready = 0
  let skipNoPhone = 0
  let skipFilters = 0
  let insertFailed = 0
  let insertedHere = 0

  let offset = 0
  while (true) {
    const { data: batch, error } = await supabase
      .from('customers')
      .select(CUSTOMER_EMBED_FOR_AUDIENCE_MATCH)
      .eq('user_id', campaign.user_id)
      .range(offset, offset + CUSTOMER_PAGE - 1)

    if (error) {
      cronLog(debugLines, `enrollment sync customers query error campaign=${campaign.id}: ${error.message}`)
      console.warn(`[campaign-cron] customers fetch failed campaign=${campaign.id}`, error.message)
      break
    }
    const rows = batch ?? []
    if (rows.length === 0) break

    scanned += rows.length
    cronLog(debugLines, `sync customers page campaign=${campaign.id} offset=${offset} rows=${rows.length}`)

    for (const raw of rows) {
      const c = raw as unknown as CustomerForAudience
      if (enrolled.has(c.id)) {
        skipAlready++
        continue
      }
      if (!c.phone || !String(c.phone).trim()) {
        skipNoPhone++
        continue
      }
      if (!customerMatchesFilters(c, filters)) {
        skipFilters++
        continue
      }

      const enrollMoment = new Date()
      let nextSend = computeSendAt(enrollMoment, first.delay_days, first.send_time, tz)
      if (isScheduledSendTime(first.send_time) && nextSend.getTime() < enrollMoment.getTime()) {
        nextSend = enrollMoment
      }

      const baseMeta = metadataForNewEnrollment(plan) as Record<string, unknown>
      let nextSendAt: string | null = nextSend.toISOString()
      let queueMeta: CustomerQueueMeta = {
        status: 'active',
        enrolled_at: enrollMoment.toISOString(),
      }

      if (usesSequentialCustomerQueue(plan)) {
        const activeSlots = await countActiveQueueSlots(supabase, campaign.id)
        if (activeSlots > 0) {
          const position = (await countWaitingEnrollments(supabase, campaign.id)) + 1
          queueMeta = {
            status: 'waiting',
            position,
            enrolled_at: enrollMoment.toISOString(),
          }
          nextSendAt = null
          cronLog(
            debugLines,
            `queue waiting customer=${c.id} campaign=${campaign.id} position=${position} (active customer still in flow)`
          )
        } else {
          cronLog(debugLines, `queue active customer=${c.id} campaign=${campaign.id} (first in loop)`)
        }
      }

      const { error: insErr } = await supabase.from('campaign_enrollments').insert({
        campaign_id: campaign.id,
        customer_id: c.id,
        user_id: campaign.user_id,
        status: 'active',
        last_step_sent: 0,
        next_send_at: nextSendAt,
        metadata: metadataWithCustomerQueue(baseMeta, queueMeta),
      })

      if (!insErr) {
        enrolled.add(c.id)
        summary.enrollments_inserted++
        insertedHere++
        const label = customerWorkflowLabel(c)
        onProgress?.({ type: 'enrollment', customerId: c.id, label })
        onProgress?.({ type: 'log', message: `Enrolled ${label}`, level: 'success' })
      } else {
        insertFailed++
        cronLog(debugLines, `enrollment insert failed campaign=${campaign.id} customer=${c.id}: ${insErr.message}`)
      }
    }

    offset += CUSTOMER_PAGE
    if (rows.length < CUSTOMER_PAGE) break
  }

  cronLog(
    debugLines,
    `sync done campaign=${campaign.id} customers_scanned=${scanned} new_inserts_this_run=${insertedHere} skip_already_enrolled=${skipAlready} skip_no_phone=${skipNoPhone} skip_audience_no_match=${skipFilters} insert_errors=${insertFailed}`
  )
  onProgress?.({ type: 'node', nodeId: audienceId, state: 'complete' })
  onProgress?.({ type: 'node', nodeId: enrollId, state: 'complete' })
}

/** Pause active enrollments whose customer no longer matches the workflow audience (e.g. after filter change). */
async function reconcileEnrollmentsToAudience(
  supabase: ReturnType<typeof createServiceRoleClient>,
  campaignId: string,
  plan: CampaignWorkflowPlan,
  debugLines?: string[],
  onProgress?: CampaignWorkflowProgressHandler
): Promise<number> {
  if (!plan.audienceNodeId) return 0

  const filters = plan.compiled.audience_filters
  let offset = 0
  let paused = 0

  while (true) {
    const { data: batch, error } = await supabase
      .from('campaign_enrollments')
      .select(`id, metadata, customer:customers (${CUSTOMER_EMBED_FOR_AUDIENCE_MATCH})`)
      .eq('campaign_id', campaignId)
      .eq('status', 'active')
      .range(offset, offset + CUSTOMER_PAGE - 1)

    if (error) {
      cronLog(debugLines, `audience reconcile error campaign=${campaignId}: ${error.message}`)
      break
    }
    const rows = batch ?? []
    if (rows.length === 0) break

    for (const raw of rows) {
      const row = raw as {
        id: string
        metadata?: Record<string, unknown> | null
        customer: CustomerForAudience | CustomerForAudience[] | null
      }
      const custRaw = row.customer
      const customer = (Array.isArray(custRaw) ? custRaw[0] : custRaw) as CustomerForAudience | null
      if (!customer || customerMatchesFilters(customer, filters)) continue

      const { error: uErr } = await supabase
        .from('campaign_enrollments')
        .update({
          status: 'paused',
          next_send_at: null,
          metadata: {
            ...(row.metadata ?? {}),
            audience_paused_at: new Date().toISOString(),
            audience_pause_reason: 'no_longer_matches_filters',
          },
        })
        .eq('id', row.id)

      if (!uErr) {
        paused++
        const label = customerWorkflowLabel(customer)
        cronLog(debugLines, `paused enrollment=${row.id} customer=${customer.id} (${label}): outside audience`)
        onProgress?.({
          type: 'log',
          message: `Paused ${label} — no longer matches audience`,
          level: 'info',
        })
      }
    }

    offset += CUSTOMER_PAGE
    if (rows.length < CUSTOMER_PAGE) break
  }

  if (paused > 0) {
    cronLog(debugLines, `audience reconcile campaign=${campaignId} paused=${paused}`)
    onProgress?.({ type: 'log', message: `Paused ${paused} enrollment(s) outside current audience` })
  }
  return paused
}

const enrollmentDueSelect = `
      *,
      campaign:campaigns (*),
      customer:customers (${CUSTOMER_EMBED_FOR_AUDIENCE_MATCH})
    `

type DueEnrollmentRow = {
  id: string
  last_step_sent: number
  metadata?: Record<string, unknown> | null
  next_send_at?: string | null
  campaign: CampaignRow | CampaignRow[] | null
  customer: CustomerForAudience | CustomerForAudience[] | null
}

async function processDueEnrollmentRows(
  supabase: ReturnType<typeof createServiceRoleClient>,
  due: DueEnrollmentRow[],
  plansByCampaignId: Map<string, CampaignWorkflowPlan>,
  now: Date,
  dayStart: Date,
  summary: ProcessSummary,
  debugLines?: string[],
  onProgress?: CampaignWorkflowProgressHandler
): Promise<void> {
  cronLog(debugLines, `due batch: ${due.length} enrollment row(s)`)
  const total = due.length
  let sendIndex = 0
  for (const row of due) {
    const rawCamp = row.campaign
    const campaign = (Array.isArray(rawCamp) ? rawCamp[0] : rawCamp) as CampaignRow | null
    const rawCust = row.customer as CustomerForAudience | CustomerForAudience[] | null
    const customer = (Array.isArray(rawCust) ? rawCust[0] : rawCust) as CustomerForAudience | null
    const plan = plansByCampaignId.get(campaign?.id ?? '') ?? null
    if (!campaign || campaign.status !== 'active' || !campaignInWindow(campaign, now) || !customer?.phone || !plan) {
      cronLog(
        debugLines,
        `skip enrollment=${row.id}: campaign=${campaign?.id ?? 'null'} status=${campaign?.status ?? 'n/a'} inWindow=${campaign ? campaignInWindow(campaign, now) : false} phone=${Boolean(customer?.phone)}`
      )
      continue
    }

    if (!plan.enableDueSend) {
      cronLog(debugLines, `skip enrollment=${row.id}: workflow has no active WhatsApp nodes`)
      continue
    }

    if (plan.audienceNodeId && !customerMatchesFilters(customer, plan.compiled.audience_filters)) {
      cronLog(
        debugLines,
        `skip enrollment=${row.id}: customer=${customer.id} does not match audience filters`
      )
      onProgress?.({
        type: 'log',
        message: `Skipped ${customerWorkflowLabel(customer)} — not in target audience`,
        level: 'info',
      })
      continue
    }

    const dailyLimit = plan.compiled.daily_send_limit
    const sentToday = await countSentToday(supabase, campaign.id, dayStart)
    if (sentToday >= dailyLimit) {
      cronLog(
        debugLines,
        `skip enrollment=${row.id}: daily cap campaign=${campaign.id} sentToday=${sentToday} limit=${dailyLimit}`
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
      if (usesSequentialCustomerQueue(plan)) {
        await promoteNextCustomerInQueue(
          supabase,
          campaign.id,
          plan,
          row.last_step_sent,
          new Date(),
          debugLines
        )
      }
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

    const stepNode = whatsAppNodeForStep(plan, nextStep.step_order)
    const isImageStep = isImageStepNode(stepNode)
    const body = renderCampaignTemplateForCustomer(
      nextStep.message_template,
      customer as Record<string, unknown>
    )
    summary.messages_attempted++
    sendIndex += 1
    const label = customerWorkflowLabel(customer)
    const stepNodeId = nodeIdForStep(plan, nextStep.step_order)
    onProgress?.({ type: 'node', nodeId: stepNodeId, state: 'active' })
    onProgress?.({
      type: 'send',
      status: 'sending',
      stepOrder: nextStep.step_order,
      stepId: nextStep.id,
      customerId: customer.id,
      label,
      index: sendIndex,
      total,
    })
    onProgress?.({
      type: 'log',
      message: `Sending step ${nextStep.step_order} to ${label} (${sendIndex}/${total})…`,
    })

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
      onProgress?.({
        type: 'send',
        status: 'failed',
        stepOrder: nextStep.step_order,
        stepId: nextStep.id,
        customerId: customer.id,
        label,
        index: sendIndex,
        total,
        error: logErr?.message ?? 'Log insert failed',
      })
      onProgress?.({ type: 'log', message: `Failed ${label}: log error`, level: 'error' })
      onProgress?.({ type: 'node', nodeId: stepNodeId, state: 'idle' })
      continue
    }

    const sendOpts = whatsAppSendOptionsForStep(plan, nextStep.step_order)
    let deliveryChannel: 'whatsapp' | 'email_fallback' = 'whatsapp'

    try {
      try {
        if (isImageStep && stepNode) {
          const imageResult = await sendCampaignImageStep({
            userId: campaign.user_id,
            session,
            phone: customer.phone,
            parameters: stepNode.parameters ?? {},
            customer: customer as Record<string, unknown>,
          })
          if (imageResult.caption) {
            await supabase
              .from('campaign_message_logs')
              .update({ rendered_message: imageResult.caption })
              .eq('id', logInsert.id)
          }
        } else {
          await sendCampaignWhatsAppText(campaign.user_id, session, customer.phone, body, sendOpts)
        }
      } catch (waErr) {
        if (!isImageStep && sendOpts.gmail_fallback_enabled) {
          const emailOk = await sendCampaignEmailFallback(
            campaign.user_id,
            customer as GmailFallbackCustomer,
            sendOpts.gmail_fallback_template
          )
          if (emailOk) {
            deliveryChannel = 'email_fallback'
            cronLog(
              debugLines,
              `gmail fallback sent campaign=${campaign.id} customer=${customer.id} step=${nextStep.step_order}`
            )
            onProgress?.({
              type: 'log',
              message: `Gmail fallback sent to ${label}`,
              level: 'success',
            })
          } else {
            throw waErr
          }
        } else {
          throw waErr
        }
      }

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
        channel: deliveryChannel === 'email_fallback' ? 'email' : 'whatsapp_automation',
        outcome: 'sent',
        notes:
          deliveryChannel === 'email_fallback'
            ? `Campaign “${campaign.name}” step ${nextStep.step_order} (Gmail fallback)`
            : `Campaign “${campaign.name}” step ${nextStep.step_order}`,
        metadata: {
          campaign_id: campaign.id,
          campaign_step_id: nextStep.id,
          enrollment_id: row.id,
          campaign_message_log_id: logInsert.id,
          delivery_channel: deliveryChannel,
          enable_typing: sendOpts.enable_typing,
          randomize_spaces: sendOpts.randomize_spaces,
        },
        idempotency_key: `campaign_send:${logInsert.id}`,
      })

      summary.messages_sent++
      onProgress?.({
        type: 'send',
        status: 'sent',
        stepOrder: nextStep.step_order,
        stepId: nextStep.id,
        customerId: customer.id,
        label,
        index: sendIndex,
        total,
      })
      onProgress?.({ type: 'log', message: `Sent to ${label}`, level: 'success' })
      onProgress?.({ type: 'node', nodeId: stepNodeId, state: 'complete' })

      cronLog(
        debugLines,
        `sent campaign=${campaign.id} "${campaign.name}" customer=${customer.id} step=${nextStep.step_order} log=${logInsert.id}`
      )

      const following = steps.find((s) => s.step_order > nextStep.step_order)
      const tz = campaign.timezone?.trim() || 'Asia/Kuala_Lumpur'
      let nextSend: Date | null = null
      if (following) {
        const fromNodeId = nodeIdForStep(plan, nextStep.step_order)
        const toNodeId = nodeIdForStep(plan, following.step_order)
        const waitSec = waitSecondsOnPath(plan.definition, fromNodeId, toNodeId)

        // Next step time comes from that step's delay_days + send_time (campaign timezone).
        // Do not apply campaign.cooldown_days here — it defaulted to 30d and overrode e.g. "delay 1d"
        // so step 2 was scheduled a month later instead of the next day.
        let computed = computeSendAt(new Date(sentAt), following.delay_days, following.send_time, tz)
        const sentMs = new Date(sentAt).getTime()
        // Same-day step with scheduled send_time already passed (e.g. default 10:00 after an evening send) → next calendar slot.
        if (isScheduledSendTime(following.send_time) && computed.getTime() <= sentMs) {
          computed = computeSendAt(new Date(sentAt), following.delay_days + 1, following.send_time, tz)
        }
        if (waitSec > 0) {
          const afterWait = sentMs + waitSec * 1000
          if (computed.getTime() < afterWait) {
            computed = new Date(afterWait)
          }
          cronLog(
            debugLines,
            `wait pacing enrollment=${row.id} step=${nextStep.step_order}→${following.step_order} wait=${waitSec}s next_send_at=${computed.toISOString()}`
          )
        }
        nextSend = computed
      }

      const workflowMeta = metadataAfterStepSent(plan, nextStep.step_order, stepNodeId)

      await supabase
        .from('campaign_enrollments')
        .update({
          last_step_sent: nextStep.step_order,
          next_send_at: following ? nextSend!.toISOString() : null,
          status: following ? 'active' : 'completed',
          completed_at: following ? null : new Date().toISOString(),
          metadata: {
            ...(row.metadata ?? {}),
            ...workflowMeta,
          },
        })
        .eq('id', row.id)

      if (!following) {
        await promoteNextCustomerInQueue(
          supabase,
          campaign.id,
          plan,
          nextStep.step_order,
          sentAt,
          debugLines
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const stackFirstLine =
        e instanceof Error && typeof e.stack === 'string'
          ? e.stack.split('\n').slice(0, 6).join(' | ')
          : ''
      summary.messages_failed++
      cronLog(
        debugLines,
        `fail send enrollment=${row.id} campaign=${campaign.id} customer=${customer.id} step=${nextStep.step_order} step_id=${nextStep.id} node_type=${isImageStep ? 'crm.whatsapp.send_image' : 'crm.whatsapp.send'} log=${logInsert.id}: ${msg}${stackFirstLine ? ` [${stackFirstLine}]` : ''}`
      )
      onProgress?.({
        type: 'send',
        status: 'failed',
        stepOrder: nextStep.step_order,
        stepId: nextStep.id,
        customerId: customer.id,
        label,
        index: sendIndex,
        total,
        error: msg,
      })
      onProgress?.({ type: 'log', message: `Failed ${label}: ${msg}`, level: 'error' })
      onProgress?.({ type: 'node', nodeId: stepNodeId, state: 'idle' })
      await supabase
        .from('campaign_message_logs')
        .update({
          send_status: 'failed',
          error_message: msg,
        })
        .eq('id', logInsert.id)

      const recentFails = await countRecentFailedStepAttempts(supabase, row.id, nextStep.id)
      if (recentFails >= MAX_STEP_SEND_FAILURES_BEFORE_SKIP) {
        cronLog(
          debugLines,
          `step send abandoned enrollment=${row.id} step=${nextStep.step_order} failures=${recentFails}/${MAX_STEP_SEND_FAILURES_BEFORE_SKIP}`
        )
        await advanceEnrollmentPastAbandonedStep({
          supabase,
          row,
          campaign,
          plan,
          steps,
          failedStep: nextStep,
          reason: msg,
          debugLines,
          onProgress,
        })
      }
    }
  }
}

export async function processDueCampaignMessages(opts?: ProcessDueOptions): Promise<ProcessDueResult> {
  const debugLines = opts?.debug ? [] : undefined
  const onProgress = opts?.onProgress
  const supabase = createServiceRoleClient()
  const summary: ProcessSummary = {
    campaigns_scanned: 0,
    campaigns_skipped_schedule: 0,
    campaigns_processed: 0,
    enrollments_inserted: 0,
    messages_attempted: 0,
    messages_sent: 0,
    messages_failed: 0,
  }

  const now = new Date()
  let scopedPlan: CampaignWorkflowPlan | null = null
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

  const plansByCampaignId = new Map<string, CampaignWorkflowPlan>()

  for (const c of active) {
    const { data: stepRows } = await supabase
      .from('campaign_steps')
      .select('*')
      .eq('campaign_id', c.id)
      .order('step_order', { ascending: true })

    const steps = (stepRows ?? []) as CampaignStepRow[]
    const plan = buildCampaignWorkflowPlan(c as CampaignRow, steps)
    plansByCampaignId.set(c.id, plan)

    if (!campaignTriggerAllowsRunNow(c as CampaignRow, plan, now, { skipTimeGate: opts?.skipTriggerTimeGate })) {
      summary.campaigns_skipped_schedule++
      const sched = getTriggerRunScheduleFromPlan(plan)
      cronLog(
        debugLines,
        `skip campaign=${c.id} "${c.name}": outside trigger schedule (${triggerScheduleDisplayLabel(sched)})`
      )
      continue
    }

    summary.campaigns_processed++

    if (opts?.campaignIdOnly === c.id) {
      scopedPlan = plan
    }

    const insBefore = summary.enrollments_inserted
    const progress = onProgress && opts?.campaignIdOnly === c.id ? onProgress : undefined
    if (progress) {
      progress({ type: 'phase', phase: 'started' })
      progress({ type: 'log', message: 'Starting campaign run…' })
      for (const tid of plan.triggerNodeIds) {
        progress({ type: 'node', nodeId: tid, state: 'active' })
        progress({ type: 'node', nodeId: tid, state: 'complete' })
      }
      progress({ type: 'phase', phase: 'enrollment_sync' })
    }
    await syncEnrollmentsForCampaign(supabase, c, steps, plan, summary, debugLines, progress)
    cronLog(debugLines, `enrollment sync campaign=${c.id} +${summary.enrollments_inserted - insBefore}`)
    await reconcileEnrollmentsToAudience(supabase, c.id, plan, debugLines, progress)
  }

  // Use a fresh instant after enrollment sync so rows inserted above with next_send_at ≈ "now"
  // are not excluded by `lte` against an older `now` captured at the start of this run.
  const dueAsOf = new Date()
  const isoDue = dueAsOf.toISOString()
  const dayStart = startOfUtcDay(dueAsOf)

  if (debugLines) {
    for (const c of active) {
      await logCampaignPipelineDiagnostics(supabase, c.id, c.user_id, isoDue, debugLines)
    }
  }

  for (const c of active) {
    const plan = plansByCampaignId.get(c.id)
    if (plan && usesSequentialCustomerQueue(plan)) {
      await reconcileSequentialQueue(supabase, c.id, (msg) => cronLog(debugLines, msg))
    }
  }

  const { data: dueRows, error: dueErr } = await fetchActiveDueEnrollmentsMerged<DueEnrollmentRow>(supabase, {
    select: enrollmentDueSelect,
    isoNow: isoDue,
    limit: SEND_BATCH,
    campaignId: opts?.campaignIdOnly,
  })
  if (dueErr) {
    cronLog(debugLines, `due query error: ${dueErr.message}`)
    throw dueErr
  }

  cronLog(debugLines, `due query returned ${(dueRows ?? []).length} row(s) (as_of=${isoDue})`)
  const dueRowsTyped = (dueRows ?? []) as DueEnrollmentRow[]
  const dueWaiting = dueRowsTyped.filter((r) => isQueueWaiting(r.metadata)).length
  const dueTimed = dueRowsTyped.length - dueWaiting
  cronLog(
    debugLines,
    `due mix total=${dueRowsTyped.length} timed_or_ready=${dueTimed} queue_waiting=${dueWaiting}`
  )

  const dueFiltered = filterDueRowsForSequentialQueue(dueRowsTyped, plansByCampaignId)
  if (dueFiltered.length !== (dueRows ?? []).length) {
    cronLog(
      debugLines,
      `sequential queue: processing ${dueFiltered.length} enrollment(s) this run (${(dueRows ?? []).length - dueFiltered.length} deferred)`
    )
  }
  if (dueRowsTyped.length > 0) {
    const kept = new Set(dueFiltered.map((r) => r.id))
    const campaignStats = new Map<string, { total: number; waiting: number; kept: number }>()
    for (const row of dueRowsTyped) {
      const raw = row.campaign
      const campaign = (Array.isArray(raw) ? raw[0] : raw) as CampaignRow | null
      const campaignKey = campaign ? `${campaign.id.slice(0, 8)}…${campaign.name}` : 'unknown'
      const stat = campaignStats.get(campaignKey) ?? { total: 0, waiting: 0, kept: 0 }
      stat.total += 1
      if (isQueueWaiting(row.metadata)) stat.waiting += 1
      if (kept.has(row.id)) stat.kept += 1
      campaignStats.set(campaignKey, stat)
    }
    const summary = [...campaignStats.entries()]
      .map(([k, v]) => `${k} total=${v.total} waiting=${v.waiting} kept=${v.kept}`)
      .join(' | ')
    cronLog(debugLines, `due by campaign ${summary}`)
  }
  if (onProgress && opts?.campaignIdOnly) {
    onProgress({ type: 'phase', phase: 'due_send' })
    onProgress({ type: 'log', message: `Processing ${dueFiltered.length} due enrollment(s)…` })
  }
  await processDueEnrollmentRows(
    supabase,
    dueFiltered,
    plansByCampaignId,
    dueAsOf,
    dayStart,
    summary,
    debugLines,
    onProgress && opts?.campaignIdOnly ? onProgress : undefined
  )

  cronLog(
    debugLines,
    `done enrollments_inserted_total=${summary.enrollments_inserted} attempted=${summary.messages_attempted} sent=${summary.messages_sent} failed=${summary.messages_failed}`
  )

  if (onProgress && opts?.campaignIdOnly && scopedPlan) {
    const completeId = scopedPlan.completeNodeId ?? WORKFLOW_NODE.complete
    onProgress({ type: 'node', nodeId: completeId, state: 'active' })
    onProgress({ type: 'node', nodeId: completeId, state: 'complete' })
    onProgress({ type: 'phase', phase: 'finished' })
    onProgress({ type: 'summary', summary: { ...summary } })
  }

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
  opts?: { debug?: boolean; onProgress?: CampaignWorkflowProgressHandler }
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
  const { data: stepRows } = await supabase
    .from('campaign_steps')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('step_order', { ascending: true })
  const plan = buildCampaignWorkflowPlan(c, (stepRows ?? []) as CampaignStepRow[])

  if (!campaignTriggerAllowsRunNow(c, plan, now, { skipTimeGate: true })) {
    throw new Error('Campaign is outside its start/end window')
  }

  return processDueCampaignMessages({
    debug: opts?.debug,
    onProgress: opts?.onProgress,
    campaignIdOnly: campaignId,
    skipTriggerTimeGate: true,
  })
}
