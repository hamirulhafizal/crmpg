import { NextResponse } from 'next/server'
import { findParticipantIdByDealerEmail } from '@/app/lib/google-ads/active-dealers-for-leads'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function POST(req: Request) {
  try {
    const { dealerEmail } = await req.json()

    if (!dealerEmail || typeof dealerEmail !== 'string') {
      return NextResponse.json({ success: false, error: 'Dealer email is required' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const participantId = await findParticipantIdByDealerEmail(admin, dealerEmail)

    if (!participantId) {
      return NextResponse.json({ success: false, error: 'Dealer not found or not an active Google Ads participant' }, {
        status: 404,
      })
    }

    const { error } = await admin
      .from('google_ads_participants')
      .update({ lead_email: true })
      .eq('id', participantId)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Dealer lead status updated successfully' })
  } catch (error) {
    console.error('Error updating dealer lead status:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
