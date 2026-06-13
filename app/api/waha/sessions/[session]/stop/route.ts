import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { WhatsAppApiError } from '@/app/lib/whatsapp/errors'
import { isWhatsAppConfigured } from '@/app/lib/whatsapp/resolve'
import { stopWhatsAppSession } from '@/app/lib/whatsapp/sessions'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ session: string }> }
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
    if (!(await isWhatsAppConfigured({ userId: user.id }))) {
      return NextResponse.json({ error: 'WhatsApp integration is not configured' }, { status: 503 })
    }

    const { session } = await params
    const result = await stopWhatsAppSession(user.id, session)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to stop session'
    const status = err instanceof WhatsAppApiError ? err.status : 500
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
