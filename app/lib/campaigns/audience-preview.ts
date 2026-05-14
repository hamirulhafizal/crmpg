import type { SupabaseClient } from '@supabase/supabase-js'
import { customerMatchesFilters, type CustomerForAudience } from '@/app/lib/campaigns/audience'
import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'

const CUSTOMER_PAGE = 250
const SAMPLE_CAP = 40

export async function resolveTagIdLabels(
  supabase: SupabaseClient,
  tagIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!tagIds.length) return out
  const { data, error } = await supabase.from('tags').select('id, slug, label').in('id', tagIds)
  if (error) throw error
  for (const t of data ?? []) {
    const row = t as { id: string; slug: string; label?: string }
    const id = String(row.id)
    const slug = String(row.slug)
    out.set(id, row.label ? `${slug} — ${row.label}` : slug)
  }
  return out
}

export type AudienceEligibleSample = {
  id: string
  save_name: string | null
  name: string | null
  phone: string | null
  pg_code: string | null
}

export type AudienceDueSample = {
  enrollment_id: string
  last_step_sent: number
  next_send_at: string | null
  customer: AudienceEligibleSample | null
}

export function describeCampaignAudienceFilters(
  filters: CampaignAudienceFilters,
  tagIdLabels?: Map<string, string>
): string[] {
  const lines: string[] = []
  const tags = (filters.tag_slugs ?? []).map((t) => String(t).trim()).filter(Boolean)
  if (tags.length) {
    lines.push(`Tags (any match): ${tags.join(', ')}`)
  }
  if (filters.tag_ids?.length && !(filters.tag_slugs ?? []).filter(Boolean).length) {
    const parts = filters.tag_ids.map((id) => tagIdLabels?.get(String(id)) ?? String(id))
    lines.push(`Tags (by catalog id): ${parts.join(', ')}`)
  }
  const st = (filters.account_status ?? []).filter(Boolean)
  if (st.length) {
    lines.push(`Account status (any): ${st.join(', ')}`)
  }
  if (filters.is_monthly_buyer != null) {
    lines.push(`Monthly buyer: ${filters.is_monthly_buyer ? 'yes' : 'no'}`)
  }
  if (filters.is_friend != null) {
    lines.push(`Friend flag: ${filters.is_friend ? 'yes' : 'no'}`)
  }
  if (filters.gender?.trim()) {
    lines.push(`Gender: ${filters.gender.trim()}`)
  }
  if (filters.location_contains?.trim()) {
    lines.push(`Location contains: “${filters.location_contains.trim()}”`)
  }
  if (filters.last_purchase_days_gt != null && filters.last_purchase_days_gt > 0) {
    lines.push(`Last purchase older than: ${filters.last_purchase_days_gt} days`)
  }
  if (filters.segment_attributes && Object.keys(filters.segment_attributes).length > 0) {
    const bits = Object.entries(filters.segment_attributes)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${String(v)}`)
    if (bits.length) lines.push(`Segment fields: ${bits.join('; ')}`)
  }
  if (lines.length === 0) {
    lines.push('No audience filters — any customer with a saved phone number in your CRM.')
  }
  return lines
}

/**
 * Who matches audience rules right now (same matching logic as enrollment sync).
 */
export async function computeEligibleAudiencePreview(
  supabase: SupabaseClient,
  userId: string,
  filters: CampaignAudienceFilters
): Promise<{ matching_total: number; sample: AudienceEligibleSample[]; customers_scanned: number }> {
  const sample: AudienceEligibleSample[] = []
  let matching_total = 0
  let offset = 0
  let scanned = 0

  while (true) {
    const { data: batch, error } = await supabase
      .from('customers')
      .select(
        `id, phone, name, first_name, pg_code, save_name, gender, location, last_purchase_at, original_data, is_monthly_buyer, is_friend, segment_attributes,
         customer_tags ( tag_id, tags ( slug ) )`
      )
      .eq('user_id', userId)
      .range(offset, offset + CUSTOMER_PAGE - 1)

    if (error) throw error
    const rows = batch ?? []
    if (rows.length === 0) break

    for (const raw of rows) {
      const c = raw as unknown as CustomerForAudience
      scanned++
      if (!customerMatchesFilters(c, filters)) continue
      matching_total++
      if (sample.length < SAMPLE_CAP) {
        sample.push({
          id: c.id,
          save_name: c.save_name,
          name: c.name,
          phone: c.phone,
          pg_code: c.pg_code,
        })
      }
    }

    offset += CUSTOMER_PAGE
    if (rows.length < CUSTOMER_PAGE) break
  }

  return { matching_total, sample, customers_scanned: scanned }
}

/**
 * Active enrollments that are due for processing now (same window as cron send batch).
 */
export async function computeDueAudiencePreview(
  supabase: SupabaseClient,
  campaignId: string,
  isoNow: string
): Promise<{ due_total: number; sample: AudienceDueSample[] }> {
  const { count, error: cErr } = await supabase
    .from('campaign_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .or(`next_send_at.is.null,next_send_at.lte.${isoNow}`)

  if (cErr) throw cErr

  const { data: rows, error } = await supabase
    .from('campaign_enrollments')
    .select(
      `
      id,
      last_step_sent,
      next_send_at,
      customer:customers ( id, save_name, name, phone, pg_code )
    `
    )
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .or(`next_send_at.is.null,next_send_at.lte.${isoNow}`)
    .order('next_send_at', { ascending: true, nullsFirst: true })
    .limit(40)

  if (error) throw error

  const sample: AudienceDueSample[] = (rows ?? []).map((r: Record<string, unknown>) => {
    const cust = r.customer as CustomerForAudience | CustomerForAudience[] | null
    const c = Array.isArray(cust) ? cust[0] : cust
    return {
      enrollment_id: String(r.id),
      last_step_sent: Number(r.last_step_sent ?? 0),
      next_send_at: r.next_send_at ? String(r.next_send_at) : null,
      customer: c
        ? {
            id: c.id,
            save_name: c.save_name,
            name: c.name,
            phone: c.phone,
            pg_code: c.pg_code,
          }
        : null,
    }
  })

  return { due_total: count ?? 0, sample }
}
