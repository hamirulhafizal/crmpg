import { NextResponse } from 'next/server'
import { loadActiveGoogleAdsDealers } from '@/app/lib/google-ads/active-dealers-for-leads'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

/**
 * When every **active** Google Ads dealer has `lead_email: true`, reset all of them to `false`.
 */
export async function POST() {
  try {
    const admin = createServiceRoleClient()
    const { dealers } = await loadActiveGoogleAdsDealers(admin)

    if (dealers.length === 0) {
      return NextResponse.json({ success: false, error: 'No active dealers found' }, { status: 404 })
    }

    const allHaveLeadEmail = dealers.every((d) => d.lead_email === true)

    if (!allHaveLeadEmail) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot reset: Not all active dealers have lead_email: true',
          dealersWithLeadEmail: dealers.filter((d) => d.lead_email).length,
          totalDealers: dealers.length,
        },
        { status: 400 }
      )
    }

    const ids = dealers.map((d) => d.participant_id)
    const { error } = await admin.from('google_ads_participants').update({ lead_email: false }).in('id', ids)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Reset successful for ${ids.length} active dealer(s)`,
      totalDealers: dealers.length,
      resetReason: 'All active dealers had lead_email: true — rotation cycle completed',
    })
  } catch (error) {
    console.error('Error resetting dealer lead status:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
