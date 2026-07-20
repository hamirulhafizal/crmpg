import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { fetchWhatsAppProfilePicture } from '@/app/lib/whatsapp/contacts'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user, supabase } = auth

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
    if (!customer?.phone) {
      return NextResponse.json({ error: 'Customer has no phone' }, { status: 400 })
    }

    const { data: sessionRow } = await supabase
      .from('waha_user_sessions')
      .select('session_name')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!sessionRow?.session_name) {
      return NextResponse.json({ error: 'No WhatsApp session configured' }, { status: 400 })
    }

    const result = await fetchWhatsAppProfilePicture(user.id, sessionRow.session_name, customer.phone)
    return NextResponse.json({
      profilePictureURL: result.url,
      provider: result.provider,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch profile picture'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
