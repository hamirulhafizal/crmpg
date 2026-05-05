import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

function slugifyPublicGold(s: string): string {
  const t = s
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase()
  return t.slice(0, 80) || 'dealer'
}

/** Matches legacy `/api/get-all-agents` agent shape for the landing page. */
export type LeadRotationAgent = {
  participant_id: string
  user_id: string
  email: string
  /** Card / UI title */
  displayName: string
  /** Legacy “Username PGO” / Public Gold page slug (`page-1` fetch). */
  slug: string
  pgcode: string
  /** Username PGO (profiles.username_pbo → participant.public_username → display name). */
  usernamePgo: string
  image_url: string
  lead_email: boolean
  no_tel?: string
}

/** True when subscription is paid up for “now” (monthly or yearly window). */
export function isCurrentlyInPaidPeriod(
  status: string | null | undefined,
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  nowMs = Date.now()
): boolean {
  if (status !== 'active') return false
  if (!periodStart || !periodEnd) return false
  const start = new Date(periodStart).getTime()
  const end = new Date(periodEnd).getTime()
  return nowMs >= start && nowMs <= end
}

type ParticipantRow = {
  id: string
  user_id: string
  lead_email: boolean | null
  pg_code: string | null
  public_username: string | null
  created_at: string
  google_ads_subscriptions:
    | {
        status: string
        current_period_start: string | null
        current_period_end: string | null
      }
    | {
        status: string
        current_period_start: string | null
        current_period_end: string | null
      }[]
    | null
}

function normalizeSub(raw: ParticipantRow) {
  const s = raw.google_ads_subscriptions
  return Array.isArray(s) ? s[0] : s
}

async function authEmailsAndPhones(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, { email: string; phone?: string }>> {
  const map = new Map<string, { email: string; phone?: string }>()
  const unique = [...new Set(userIds)]
  await Promise.all(
    unique.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id)
      if (error || !data.user?.email) return
      map.set(id, { email: data.user.email, phone: data.user.phone ?? undefined })
    })
  )
  return map
}

/**
 * Active Google Ads dealers: enrolled, subscription `active`, and current time inside paid period
 * (monthly or yearly package — enforced via period_start / period_end).
 */
export async function loadActiveGoogleAdsDealers(
  admin: SupabaseClient
): Promise<{ dealers: LeadRotationAgent[] }> {
  const { data: participants, error } = await admin
    .from('google_ads_participants')
    .select(
      `
      id,
      user_id,
      lead_email,
      pg_code,
      public_username,
      created_at,
      google_ads_subscriptions (
        status,
        current_period_start,
        current_period_end
      )
    `
    )
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  const rows = (participants || []) as ParticipantRow[]
  const inPeriod = rows.filter((r) => {
    const sub = normalizeSub(r)
    if (!sub) return false
    return isCurrentlyInPaidPeriod(sub.status, sub.current_period_start, sub.current_period_end)
  })

  if (inPeriod.length === 0) {
    return { dealers: [] }
  }

  const userIds = inPeriod.map((r) => r.user_id)
  const authMap = await authEmailsAndPhones(admin, userIds)

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url, pgcode, phone, username_pbo')
    .in('id', userIds)

  const profileById = new Map((profiles || []).map((p) => [p.id, p]))

  const dealers: LeadRotationAgent[] = []
  for (const r of inPeriod) {
    const auth = authMap.get(r.user_id)
    if (!auth?.email) continue

    const prof = profileById.get(r.user_id)
    const displayName =
      (r.public_username && r.public_username.trim()) ||
      (prof?.full_name && prof.full_name.trim()) ||
      auth.email.split('@')[0] ||
      'Dealer'
    const usernamePgo =
      (prof?.username_pbo && prof.username_pbo.trim()) ||
      (r.public_username && r.public_username.trim()) ||
      displayName
    const slug = r.public_username?.trim()
      ? slugifyPublicGold(r.public_username)
      : prof?.username_pbo?.trim()
        ? slugifyPublicGold(prof.username_pbo)
        : slugifyPublicGold(displayName)
    const pgcode =
      (prof?.pgcode && prof.pgcode.trim()) || (r.pg_code && r.pg_code.trim()) || '—'
    const avatar =
      (prof?.avatar_url && prof.avatar_url.trim()) || 'https://via.placeholder.com/150'
    const dealerPhone = (prof?.phone && prof.phone.replace(/\D/g, '')) || ''

    dealers.push({
      participant_id: r.id,
      user_id: r.user_id,
      email: auth.email,
      displayName,
      slug,
      pgcode,
      usernamePgo,
      image_url: avatar,
      lead_email: Boolean(r.lead_email),
      no_tel: dealerPhone || auth.phone,
    })
  }

  return { dealers }
}

/** Same list as public `/api/get-all-agents` for rotation + resets. */
export async function getActiveGoogleAdsAgentsForApi(): Promise<
  Array<{
    username: string
    name: string
    username_pgo: string
    pgcode: string
    location: string
    image_url: string
    email: string
    customers: number
    no_tel: string
    lead_email: boolean
  }>
> {
  const admin = createServiceRoleClient()
  const { dealers } = await loadActiveGoogleAdsDealers(admin)
  return dealers.map((d) => ({
    username: d.displayName,
    name: d.displayName,
    username_pgo: d.usernamePgo,
    pgcode: d.pgcode,
    location: 'Malaysia',
    image_url: d.image_url,
    email: d.email,
    customers: 0,
    no_tel: d.no_tel || '',
    lead_email: d.lead_email,
  }))
}

export async function findParticipantIdByDealerEmail(
  admin: SupabaseClient,
  dealerEmail: string
): Promise<string | null> {
  const email = dealerEmail.trim().toLowerCase()
  const { dealers } = await loadActiveGoogleAdsDealers(admin)
  const match = dealers.find((d) => d.email.toLowerCase() === email)
  return match?.participant_id ?? null
}
