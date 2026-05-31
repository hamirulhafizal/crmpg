import { NextResponse } from 'next/server'

import {
  customerToGapLead,
  enrichAllGapLeadsPgCode,
  fetchGapCustomerRows,
  leadWithinRange,
  resolveAnalyticsDateRange,
  type AnalyticsPeriod,
} from '@/app/lib/google-ads/gap-leads'
import { createClient } from '@/app/lib/supabase/server'

function parsePeriod(raw: string | null): AnalyticsPeriod {
  if (raw === 'this_month' || raw === 'last_30_days' || raw === 'all_time') return raw
  return 'all_time'
}

/** Enrolled Google Ads participant: their GAP registration leads. */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: participant, error: partErr } = await supabase
    .from('google_ads_participants')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (partErr) return NextResponse.json({ error: partErr.message }, { status: 500 })
  if (!participant) {
    return NextResponse.json({ error: 'Not enrolled in Google Ads campaign' }, { status: 403 })
  }

  const url = new URL(request.url)
  const period = parsePeriod(url.searchParams.get('period'))
  const locationCity = url.searchParams.get('location')?.trim().toLowerCase() || ''

  try {
    const { start, end, label: periodLabel } = resolveAnalyticsDateRange(period, null, null)
    const customers = await fetchGapCustomerRows(supabase, [user.id])

    let leads = customers
      .map((row) => customerToGapLead(row))
      .filter((lead): lead is NonNullable<typeof lead> => Boolean(lead))
      .filter((lead) => leadWithinRange(lead.submittedAt, start, end))
      .filter((lead) => !locationCity || lead.locationCity.toLowerCase() === locationCity)

    leads = await enrichAllGapLeadsPgCode(supabase, leads)
    leads.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())

    const locationCounts = new Map<string, number>()
    for (const lead of leads) {
      locationCounts.set(lead.locationCity, (locationCounts.get(lead.locationCity) || 0) + 1)
    }

    const byLocation = [...locationCounts.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))

    return NextResponse.json({
      periodLabel,
      summary: {
        totalLeads: leads.length,
        uniqueLocations: byLocation.length,
      },
      byLocation,
      leads: leads.map((lead) => ({
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        icNumber: lead.icNumber,
        pgCode: lead.pgCode,
        location: lead.location,
        locationCity: lead.locationCity,
        submittedAt: lead.submittedAt,
      })),
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load leads'
    console.error('google-ads leads:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
