import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { fetchWhatsAppLabels } from '@/app/lib/whatsapp/contacts'

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
      return NextResponse.json({ labels: [], message: 'Customer has no phone number' })
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
      return NextResponse.json({ error: 'No WhatsApp session configured' }, { status: 400 })
    }

    const sessionName = String(sessionRow.session_name)
    const result = await fetchWhatsAppLabels(user.id, sessionName, customer.phone)
    return NextResponse.json({
      labels: result.labels,
      chatId: result.chatId,
      session: sessionName,
      ...(result.message ? { message: result.message } : {}),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch labels'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
