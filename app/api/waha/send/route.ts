import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWahaConfigured, wahaFetch } from '@/app/lib/waha'

// Normalize phone to WAHA chatId (e.g. 60184644305 -> 60184644305@c.us)
function toChatId(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '60' + digits.slice(1)
  else if (!digits.startsWith('60')) digits = '60' + digits
  return `${digits}@c.us`
}

// POST /api/waha/send - Send WhatsApp text message via WAHA
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isWahaConfigured()) {
      return NextResponse.json(
        { error: 'WAHA integration is not configured' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const session = (body.session || '').toString().trim()
    const to = (body.to || body.phone || body.number || '').toString().trim()
    const text = (body.text || body.message || '').toString().trim()

    if (!session) {
      return NextResponse.json(
        { error: 'Session name is required (e.g. 60184644305)' },
        { status: 400 }
      )
    }
    if (!to) {
      return NextResponse.json(
        { error: 'Target phone number is required (e.g. 60123456789)' },
        { status: 400 }
      )
    }
    if (!text) {
      return NextResponse.json(
        { error: 'Message text is required' },
        { status: 400 }
      )
    }

    const chatId = toChatId(to)

    const result = await wahaFetch<unknown>('/api/sendText', {
      method: 'POST',
      body: JSON.stringify({
        session,
        chatId,
        text,
      }),
    })

    return NextResponse.json({ success: true, result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send message'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
