import { NextResponse } from 'next/server'

import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { effectivePackageStatus } from '@/app/lib/google-ads/billing'
import {
  customerToGapLead,
  fetchGapCustomerRows,
  leadWithinRange,
  resolveAnalyticsDateRange,
  type AnalyticsPeriod,
} from '@/app/lib/google-ads/gap-leads'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type ParticipantRow = {
  id: string
  user_id: string
  public_username: string | null
  pg_code: string | null
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

function parsePeriod(raw: string | null): AnalyticsPeriod {
  if (raw === 'this_month' || raw === 'last_30_days' || raw === 'all_time' || raw === 'custom') {
    return raw
  }
  return 'this_month'
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const period = parsePeriod(url.searchParams.get('period'))
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const participantId = url.searchParams.get('participantId')?.trim() || ''
  const participantStatus = url.searchParams.get('participantStatus')?.trim() || 'all'
  const locationCity = url.searchParams.get('location')?.trim().toLowerCase() || ''

  try {
    const admin = createServiceRoleClient()
    const { start, end, label: periodLabel } = resolveAnalyticsDateRange(period, from, to)

    const { data: participants, error: partErr } = await admin
      .from('google_ads_participants')
      .select(
        `
        id,
        user_id,
        public_username,
        pg_code,
        google_ads_subscriptions (
          status,
          current_period_start,
          current_period_end
        )
      `
      )
      .order('created_at', { ascending: true })

    if (partErr) throw partErr

    const participantRows = (participants || []) as ParticipantRow[]
    const userIds = participantRows.map((p) => p.user_id)

    const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const emailById = new Map((usersResult.data?.users || []).map((u) => [u.id, u.email || null]))

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])

    const nameById = new Map((profiles || []).map((p) => [p.id, p.full_name as string | null]))

    type ParticipantMeta = {
      participantId: string
      userId: string
      displayName: string
      email: string | null
      isActive: boolean
    }

    const participantMeta: ParticipantMeta[] = []
    for (const p of participantRows) {
      const sub = normalizeSub(p)
      const isActive = sub
        ? effectivePackageStatus({
            status: sub.status,
            current_period_start: sub.current_period_start,
            current_period_end: sub.current_period_end,
          }) === 'active'
        : false

      if (participantStatus === 'active' && !isActive) continue
      if (participantStatus === 'inactive' && isActive) continue
      if (participantId && p.id !== participantId) continue

      const email = emailById.get(p.user_id) ?? null
      const displayName =
        p.public_username?.trim() ||
        nameById.get(p.user_id)?.trim() ||
        email?.split('@')[0] ||
        'Participant'

      participantMeta.push({
        participantId: p.id,
        userId: p.user_id,
        displayName,
        email,
        isActive,
      })
    }

    const allowedUserIds = new Set(participantMeta.map((p) => p.userId))
    const metaByUserId = new Map(participantMeta.map((p) => [p.userId, p]))

    let customers: Array<{
      id: string
      user_id: string
      name: string | null
      email: string | null
      phone: string | null
      location: string | null
      created_at: string | null
      original_data: unknown
      segment_attributes: unknown
    }> = []

    if (allowedUserIds.size > 0) {
      customers = await fetchGapCustomerRows(admin, [...allowedUserIds])
    }

    const leads = customers
      .map((row) => customerToGapLead(row))
      .filter((lead): lead is NonNullable<typeof lead> => Boolean(lead))
      .filter((lead) => leadWithinRange(lead.submittedAt, start, end))
      .filter((lead) => !locationCity || lead.locationCity.toLowerCase() === locationCity)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())

    const locationCounts = new Map<string, number>()
    for (const lead of leads) {
      locationCounts.set(lead.locationCity, (locationCounts.get(lead.locationCity) || 0) + 1)
    }

    const byLocation = [...locationCounts.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))

    const countByUserId = new Map<string, number>()
    for (const lead of leads) {
      countByUserId.set(lead.userId, (countByUserId.get(lead.userId) || 0) + 1)
    }

    const byParticipant = participantMeta
      .map((p) => ({
        participantId: p.participantId,
        userId: p.userId,
        displayName: p.displayName,
        email: p.email,
        isActive: p.isActive,
        leadCount: countByUserId.get(p.userId) || 0,
      }))
      .sort((a, b) => b.leadCount - a.leadCount || a.displayName.localeCompare(b.displayName))

    return NextResponse.json({
      periodLabel,
      summary: {
        totalLeads: leads.length,
        uniqueLocations: byLocation.length,
        activeParticipants: participantMeta.filter((p) => p.isActive).length,
        participantCount: participantMeta.length,
      },
      byLocation,
      byParticipant,
      leads: leads.map((lead) => {
        const meta = metaByUserId.get(lead.userId)
        return {
          id: lead.id,
          participantId: meta?.participantId ?? null,
          participantName: meta?.displayName ?? null,
          participantEmail: meta?.email ?? null,
          participantActive: meta?.isActive ?? false,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          icNumber: lead.icNumber,
          location: lead.location,
          locationCity: lead.locationCity,
          submittedAt: lead.submittedAt,
        }
      }),
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load analytics'
    console.error('google-ads analytics:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
