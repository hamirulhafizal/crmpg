import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

// GET /api/waha/email-fallback
// Load Gmail app password for the current user's WAHA sessions
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

    const { data, error } = await supabase
      .from('waha_user_sessions')
      .select('gmaill_app_password, gmail_message')
      .eq('user_id', user.id)
      .not('gmaill_app_password', 'is', null)
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to load email fallback settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      appPassword: data?.gmaill_app_password || '',
      gmailMessage: data?.gmail_message || '',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load email fallback settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/waha/email-fallback
// Save Gmail app password for the current user's WAHA sessions
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

    const body = await request.json().catch(() => ({}))
    const appPassword = (body.appPassword || '').toString().replace(/\s+/g, '')
    const gmailMessage = (body.gmailMessage || '').toString()

    if (!appPassword) {
      return NextResponse.json({ error: 'App password is required' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('waha_user_sessions')
      .update({ gmaill_app_password: appPassword, gmail_message: gmailMessage })
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to save email fallback settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save email fallback settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

