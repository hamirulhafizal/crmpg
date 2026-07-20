import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { WhatsAppApiError } from '@/app/lib/whatsapp/errors'
import { isWhatsAppConfigured, getProviderForUser } from '@/app/lib/whatsapp/resolve'
import {
  startWhatsAppSession,
  stopWhatsAppSession,
  deleteWhatsAppSession,
  listWhatsAppSessions,
} from '@/app/lib/whatsapp/sessions'

export async function GET(
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
    const sessions = await listWhatsAppSessions(user.id)
    const found = sessions.find((s) => s.name === session)
    if (!found) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json(found)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
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
    await deleteWhatsAppSession(user.id, session)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete session'
    const status = err instanceof WhatsAppApiError ? err.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ session: string }> }
) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user } = auth

    const { session } = await params
    const provider = await getProviderForUser(user.id)
    const body = await request.json().catch(() => ({}))
    const action = (body.action || '').toString()

    if (action === 'stop') {
      const result = await stopWhatsAppSession(user.id, session)
      return NextResponse.json(result)
    }

    const result = await startWhatsAppSession(user.id, session)
    return NextResponse.json({ ...result, provider })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed'
    const status = err instanceof WhatsAppApiError ? err.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}
