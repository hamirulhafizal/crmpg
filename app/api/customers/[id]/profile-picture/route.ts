import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { wahaFetch } from '@/app/lib/waha'

type WahaProfilePictureResponse = {
  profilePictureURL?: string | null
}

function normalizePhoneToMsisdn(phone: string): string {
  let digits = phone.replace(/[^0-9]/g, '')
  if (!digits.startsWith('60')) {
    if (digits.startsWith('0')) {
      digits = `60${digits.slice(1)}`
    } else {
      digits = `60${digits}`
    }
  }
  return digits
}

// GET /api/customers/[id]/profile-picture - Get customer WhatsApp profile image
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, phone')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (customerError) {
      return NextResponse.json({ error: customerError.message }, { status: 500 })
    }
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    if (!customer.phone) {
      return NextResponse.json({ profilePictureURL: null, message: 'Customer has no phone number' })
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from('waha_user_sessions')
      .select('session_name')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 })
    }
    if (!sessionRow?.session_name) {
      return NextResponse.json({ error: 'No WAHA session configured' }, { status: 400 })
    }

    const contactId = `${normalizePhoneToMsisdn(customer.phone)}@c.us`
    const sessionName = String(sessionRow.session_name)
    const result = await wahaFetch<WahaProfilePictureResponse>(
      `/api/contacts/profile-picture?contactId=${encodeURIComponent(contactId)}&refresh=false&session=${encodeURIComponent(sessionName)}`,
      {},
      { userId: user.id }
    )

    return NextResponse.json({
      profilePictureURL: typeof result?.profilePictureURL === 'string' ? result.profilePictureURL : null,
      contactId,
      session: sessionName,
    })
  } catch (error: any) {
    console.error('Error in GET /api/customers/[id]/profile-picture:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch customer profile picture' },
      { status: 500 }
    )
  }
}
