import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWhatsAppConfigured, getProviderForUser } from '@/app/lib/whatsapp/resolve'

export async function GET() {
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
    const provider = await getProviderForUser(user.id)
    return NextResponse.json({ provider })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
