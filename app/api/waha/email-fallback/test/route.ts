import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import nodemailer from 'nodemailer'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user || !user.email) {
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
      return NextResponse.json({ error: 'Failed to load email fallback settings' }, { status: 500 })
    }

    if (!data?.gmaill_app_password) {
      return NextResponse.json(
        { error: 'Please save a Gmail app password first.' },
        { status: 400 }
      )
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      service: 'gmail',
      auth: {
        user: user.email,
        pass: data.gmaill_app_password,
      },
    })

    const fallbackText =
      (data.gmail_message as string | null) && data.gmail_message.trim()
        ? (data.gmail_message as string)
        : 'This is a test email from your WAHA email fallback configuration.'

    await transporter.sendMail({
      from: user.email,
      to: user.email,
      subject: 'Test WAHA email fallback',
      text: fallbackText,
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send test email'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

