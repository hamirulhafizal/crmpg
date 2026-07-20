import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { WhatsAppApiError } from '@/app/lib/whatsapp/errors'
import { isWhatsAppConfigured } from '@/app/lib/whatsapp/resolve'
import { createWhatsAppSession, listWhatsAppSessions } from '@/app/lib/whatsapp/sessions'

export async function GET(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user } = auth
    if (!(await isWhatsAppConfigured({ userId: user.id }))) {
      return NextResponse.json({ error: 'WhatsApp integration is not configured' }, { status: 503 })
    }

    const sessions = await listWhatsAppSessions(user.id)
    return NextResponse.json({ sessions })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list sessions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user } = auth
    if (!(await isWhatsAppConfigured({ userId: user.id }))) {
      return NextResponse.json({ error: 'WhatsApp integration is not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const name = (body.name || '').toString().trim()
    const start = body.start !== false
    const config = body.config || {}

    if (!name) {
      return NextResponse.json({ error: 'Session name is required (e.g. your phone: 60184644305)' }, { status: 400 })
    }

    const result = await createWhatsAppSession(user.id, { name, start, config })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create session'
    const status = err instanceof WhatsAppApiError ? err.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}
