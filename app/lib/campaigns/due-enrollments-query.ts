import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

/**
 * Active enrollments where `next_send_at` is null OR `next_send_at <= isoNow`.
 * Implemented as two queries so we never rely on PostgREST `.or()` parsing of ISO timestamps.
 */
export async function fetchActiveDueEnrollmentsMerged<T>(
  supabase: SupabaseClient,
  opts: {
    select: string
    isoNow: string
    limit: number
    campaignId?: string
  }
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const { select, isoNow, limit, campaignId } = opts

  function base() {
    let q = supabase.from('campaign_enrollments').select(select).eq('status', 'active')
    if (campaignId) q = q.eq('campaign_id', campaignId)
    return q
  }

  const [nullNext, lteNext] = await Promise.all([
    base().is('next_send_at', null).limit(limit),
    base()
      .not('next_send_at', 'is', null)
      .lte('next_send_at', isoNow)
      .order('next_send_at', { ascending: true, nullsFirst: false })
      .limit(limit),
  ])

  if (nullNext.error) return { data: [], error: nullNext.error }
  if (lteNext.error) return { data: [], error: lteNext.error }

  const seen = new Set<string>()
  const merged: T[] = []
  // IMPORTANT: prioritize timestamp-due rows first.
  // In sequential queue campaigns, many waiting enrollments have `next_send_at = null`.
  // If null rows are merged first, they can consume the limit and starve truly due rows.
  const rows = [...(lteNext.data ?? []), ...(nullNext.data ?? [])] as T[]
  for (const row of rows) {
    const id = String((row as { id: string }).id)
    if (seen.has(id)) continue
    seen.add(id)
    merged.push(row)
    if (merged.length >= limit) break
  }

  return { data: merged, error: null }
}

/** Same predicate as merged fetch; for exact counts (preview / analytics). */
export async function countActiveDueEnrollments(
  supabase: SupabaseClient,
  opts: { isoNow: string; campaignId?: string }
): Promise<{ count: number; error: PostgrestError | null }> {
  const { isoNow, campaignId } = opts

  function baseCount() {
    let q = supabase
      .from('campaign_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
    if (campaignId) q = q.eq('campaign_id', campaignId)
    return q
  }

  const [c1, c2] = await Promise.all([
    baseCount().is('next_send_at', null),
    baseCount().not('next_send_at', 'is', null).lte('next_send_at', isoNow),
  ])

  if (c1.error) return { count: 0, error: c1.error }
  if (c2.error) return { count: 0, error: c2.error }

  return { count: (c1.count ?? 0) + (c2.count ?? 0), error: null }
}
