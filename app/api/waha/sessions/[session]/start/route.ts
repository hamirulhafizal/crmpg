import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { WhatsAppApiError } from '@/app/lib/whatsapp/errors'
import { isWhatsAppConfigured } from '@/app/lib/whatsapp/resolve'
import { startWhatsAppSession } from '@/app/lib/whatsapp/sessions'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ session: string }> }
) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user } = auth
    if (!(await isWhatsAppConfigured({ userId: user.id }))) {
      return NextResponse.json({ error: 'WhatsApp integration is not configured' }, { status: 503 })
    }

    const { session } = await params
    const result = await startWhatsAppSession(user.id, session)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to start session'
    const status = err instanceof WhatsAppApiError ? err.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}
