import { NextResponse } from 'next/server'
import { normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'
import { createClient } from '@/app/lib/supabase/server'
import { wahaFetch, WahaApiError } from '@/app/lib/waha'

type WahaLabel = {
  id?: string | number
  name?: string
  color?: number
  colorHex?: string
}

// GET /api/customers/[id]/labels - Get WhatsApp labels for a customer chat
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
      return NextResponse.json({ error: 'No WAHA session configured' }, { status: 400 })
    }

    const sessionName = String(sessionRow.session_name)
    const msisdn = normalizePhoneToMsisdn(customer.phone)
    const chatId = `${msisdn}@c.us`
    const encS = encodeURIComponent(sessionName)

    const labelPaths = [
      `/api/${encS}/labels/chats/${encodeURIComponent(chatId)}`,
      `/api/${encS}/labels/chats/${encodeURIComponent(chatId)}/`,
      `/api/${encS}/labels/chats/${encodeURIComponent(`${msisdn}@s.whatsapp.net`)}/`,
      `/api/${encS}/labels/chats/${encodeURIComponent(`${msisdn}@s.whatsapp.net`)}`,
      `/api/sessions/${encS}/labels/chats/${encodeURIComponent(chatId)}`,
    ]

    let labels: WahaLabel[] = []
    let lastErr: unknown
    let gotOk = false
    for (const path of labelPaths) {
      try {
        const data = await wahaFetch<WahaLabel[]>(path, {}, { userId: user.id })
        labels = Array.isArray(data) ? data : []
        gotOk = true
        break
      } catch (e) {
        lastErr = e
        if (e instanceof WahaApiError && (e.status === 404 || e.status === 405)) continue
        throw e
      }
    }
    if (!gotOk && lastErr instanceof WahaApiError && lastErr.status === 404) {
      return NextResponse.json({
        labels: [],
        chatId,
        session: sessionName,
        message:
          'WhatsApp labels API returned 404 for all known paths. Check WAHA build and that labels are supported for this session.',
      })
    }
    if (!gotOk && lastErr) {
      throw lastErr instanceof Error ? lastErr : new Error('Failed to fetch WAHA labels')
    }

    return NextResponse.json({
      labels: Array.isArray(labels) ? labels : [],
      chatId,
      session: sessionName,
    })
  } catch (error: any) {
    console.error('Error in GET /api/customers/[id]/labels:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch customer labels' },
      { status: 500 }
    )
  }
}
