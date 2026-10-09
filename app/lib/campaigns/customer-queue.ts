import { bypassSequentialCustomerQueueForAudience } from '@/app/lib/campaigns/enrollment-lifecycle'
import type { CampaignAudienceFilters, CampaignRow } from '@/app/lib/campaigns/types'
import type { CampaignWorkflowPlan } from '@/app/lib/workflows/plan'
import type { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export type CustomerQueueState = 'active' | 'waiting'

export type CustomerQueueMeta = {
  status: CustomerQueueState
  position?: number
  enrolled_at?: string
}

type Supabase = ReturnType<typeof createServiceRoleClient>

type EnrollmentRow = {
  id: string
  metadata?: Record<string, unknown> | null
  enrolled_at?: string
  last_step_sent?: number
}

export function loopBatchSizeFromPlan(plan: CampaignWorkflowPlan): number | null {
  const loop = plan.ordered.find((n) => n.type === 'crm.flow.loop')
  if (!loop) return null
  const size = Number(loop.parameters?.batch_size ?? 1)
  if (!Number.isFinite(size) || size < 1) return 1
  return Math.floor(size)
}

/** Loop batch size 1 → one customer completes the full message flow before the next starts. */
export function usesSequentialCustomerQueue(
  plan: CampaignWorkflowPlan,
  audienceFilters?: CampaignAudienceFilters
): boolean {
  if (audienceFilters && bypassSequentialCustomerQueueForAudience(audienceFilters)) return false
  return loopBatchSizeFromPlan(plan) === 1
}

export function readCustomerQueue(metadata: unknown): CustomerQueueMeta | null {
  if (!metadata || typeof metadata !== 'object') return null
  const raw = (metadata as Record<string, unknown>).customer_queue
  if (!raw || typeof raw !== 'object') return null
  const status = (raw as CustomerQueueMeta).status
  if (status !== 'active' && status !== 'waiting') return null
  return raw as CustomerQueueMeta
}

export function isQueueWaiting(metadata: unknown): boolean {
  return readCustomerQueue(metadata)?.status === 'waiting'
}

export function mergeEnrollmentMetadata(
  base: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return { ...(base ?? {}), ...patch }
}

export function metadataWithCustomerQueue(
  base: Record<string, unknown>,
  queue: CustomerQueueMeta
): Record<string, unknown> {
  return mergeEnrollmentMetadata(base, { customer_queue: queue })
}

export async function countActiveQueueSlots(
  supabase: Supabase,
  campaignId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('campaign_enrollments')
    .select('id, metadata')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')

  if (error) throw error
  return (data ?? []).filter((row) => !isQueueWaiting(row.metadata)).length
}

export async function countWaitingEnrollments(
  supabase: Supabase,
  campaignId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('campaign_enrollments')
    .select('id, metadata')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')

  if (error) throw error
  return (data ?? []).filter((row) => isQueueWaiting(row.metadata)).length
}

type EnrollmentSlotRow = EnrollmentRow & { next_send_at?: string | null }

/**
 * Ensure at most one enrollment owns the send slot.
 * Only loads rows with next_send_at set (plus a small null sample) so campaigns with
 * 1000+ waiting enrollments do not time out the global cron.
 */
export async function reconcileSequentialQueue(
  supabase: Supabase,
  campaignId: string,
  log?: (msg: string) => void
): Promise<void> {
  const { data: scheduled, error } = await supabase
    .from('campaign_enrollments')
    .select('id, metadata, enrolled_at, last_step_sent, next_send_at')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .not('next_send_at', 'is', null)
    .order('enrolled_at', { ascending: true })
    .limit(50)

  if (error) throw error
  const scheduledRows = (scheduled ?? []) as EnrollmentSlotRow[]
  const inSlot = scheduledRows.filter((row) => !isQueueWaiting(row.metadata))

  if (inSlot.length === 0) {
    const promoted = await promoteNextQueuedEnrollment(supabase, campaignId, { log })
    if (promoted) {
      log?.('queue self-heal: promoted first waiting enrollment because no active slot owner existed')
    }
    return
  }

  if (inSlot.length === 1) return

  const keeper =
    inSlot.find((row) => (row.last_step_sent ?? 0) > 0) ??
    inSlot[0]!

  let waitBase = await countWaitingEnrollments(supabase, campaignId)
  for (const row of inSlot) {
    if (row.id === keeper.id) continue
    waitBase += 1
    await supabase
      .from('campaign_enrollments')
      .update({
        next_send_at: null,
        metadata: metadataWithCustomerQueue((row.metadata ?? {}) as Record<string, unknown>, {
          status: 'waiting',
          position: waitBase,
          enrolled_at: String(row.enrolled_at ?? new Date().toISOString()),
        }),
      })
      .eq('id', row.id)
    log?.(`queue demote enrollment=${row.id} → waiting (#${waitBase})`)
  }
}

export async function promoteNextQueuedEnrollment(
  supabase: Supabase,
  campaignId: string,
  opts?: { nextSendAt?: Date | string; log?: (msg: string) => void }
): Promise<boolean> {
  const log = opts?.log
  // Waiting rows always use next_send_at=null — avoid loading the full active set.
  const { data, error } = await supabase
    .from('campaign_enrollments')
    .select('id, metadata, enrolled_at')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .is('next_send_at', null)
    .order('enrolled_at', { ascending: true })
    .limit(100)

  if (error) throw error
  const next =
    ((data ?? []) as EnrollmentRow[]).find((row) => isQueueWaiting(row.metadata)) ??
    // Broken state: active + null next_send_at but missing waiting tag — still promote earliest.
    ((data ?? []) as EnrollmentRow[])[0]
  if (!next) return false

  const sendAt =
    opts?.nextSendAt instanceof Date
      ? opts.nextSendAt.toISOString()
      : typeof opts?.nextSendAt === 'string'
        ? opts.nextSendAt
        : new Date().toISOString()

  await supabase
    .from('campaign_enrollments')
    .update({
      next_send_at: sendAt,
      metadata: metadataWithCustomerQueue((next.metadata ?? {}) as Record<string, unknown>, {
        status: 'active',
        enrolled_at: String(next.enrolled_at ?? sendAt),
      }),
    })
    .eq('id', next.id)

  const dueLabel = sendAt <= new Date().toISOString() ? 'now' : `at ${sendAt}`
  log?.(`queue promote enrollment=${next.id} → active (next send ${dueLabel})`)
  return true
}

export function filterDueRowsForSequentialQueue<
  T extends { id: string; metadata?: unknown; campaign?: CampaignRow | CampaignRow[] | null },
>(
  rows: T[],
  plansByCampaignId: Map<string, CampaignWorkflowPlan>
): T[] {
  const byCampaign = new Map<string, T[]>()
  for (const row of rows) {
    const raw = row.campaign
    const campaign = (Array.isArray(raw) ? raw[0] : raw) as CampaignRow | null
    const campaignId = campaign?.id
    if (!campaignId) continue
    const list = byCampaign.get(campaignId) ?? []
    list.push(row)
    byCampaign.set(campaignId, list)
  }

  const kept: T[] = []
  for (const [campaignId, group] of byCampaign) {
    const plan = plansByCampaignId.get(campaignId)
    const audienceFilters = plan?.compiled.audience_filters
    if (!plan || !usesSequentialCustomerQueue(plan, audienceFilters)) {
      kept.push(...group)
      continue
    }

    const eligible = group.filter((row) => !isQueueWaiting(row.metadata))
    if (eligible.length === 0) continue

    eligible.sort((a, b) => String(a.id).localeCompare(String(b.id)))
    kept.push(eligible[0]!)
  }

  return kept
}
