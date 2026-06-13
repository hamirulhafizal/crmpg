import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { WhatsAppApiError } from '@/app/lib/whatsapp/errors'
import { isWhatsAppConfigured } from '@/app/lib/whatsapp/resolve'
import { startWhatsAppSession, stopWhatsAppSession, deleteWhatsAppSession } from '@/app/lib/whatsapp/sessions'
import { getProviderForUser } from '@/app/lib/whatsapp/resolve'
import { listWhatsAppSessions } from '@/app/lib/whatsapp/sessions'

export async function GET(
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
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
