import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWhatsAppConfigured } from '@/app/lib/whatsapp/resolve'
import { sendWhatsAppText } from '@/app/lib/whatsapp/send'
import { humanizeWhatsAppText } from '@/app/lib/campaigns/whatsapp-humanize'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isWhatsAppConfigured({ userId: user.id }))) {
      return NextResponse.json({ error: 'WhatsApp integration is not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const session = (body.session || '').toString().trim()
    const to = (body.to || body.phone || body.number || '').toString().trim()
    const text = (body.text || body.message || '').toString().trim()

    if (!session) {
      return NextResponse.json({ error: 'Session name is required (e.g. 60184644305)' }, { status: 400 })
    }
    if (!to) {
      return NextResponse.json({ error: 'Target phone number is required (e.g. 60123456789)' }, { status: 400 })
    }
    if (!text) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
    }

    await sendWhatsAppText({
      userId: user.id,
      session,
      phone: to,
      text: humanizeWhatsAppText(text),
      enableTyping: true,
      randomizeSpaces: false,
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send message'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
