import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

// GET /api/waha/email-fallback
// Load Gmail fallback settings from the current user's profile
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
      .from('profiles')
      .select('gmail_app_password, gmail_message')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to load email fallback settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      appPassword: data?.gmail_app_password || '',
      gmailMessage: data?.gmail_message || '',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load email fallback settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/waha/email-fallback
// Save Gmail fallback settings to the current user's profile
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
      .from('profiles')
      .update({ gmail_app_password: appPassword, gmail_message: gmailMessage })
      .eq('id', user.id)

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

