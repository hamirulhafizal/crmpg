import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

/**
 * This route now manages concrete scheduled messages stored in `scheduled_messages`.
 * It exposes a simple CRUD API used by the `/automated-messages` UI.
 *
 * Fields:
 * - title: human-readable label (e.g. "Birthday", "Hari Raya")
 * - phone: target WhatsApp phone number (e.g. 60123456789)
 * - message: message template (can contain {SenderName}, {PGCode})
 * - scheduled_at: ISO datetime string in the user's local timezone (client normalises to UTC)
 */

// GET /api/automated-messages - List scheduled messages for current user
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
      .from('scheduled_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('scheduled_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('Error listing scheduled messages:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/automated-messages - Schedule a new message
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

    const body = await request.json()
    const { title, phone, message, scheduled_at } = body

    const isBirthdayTitle =
      typeof title === 'string' && title.toLowerCase().includes('birthday')

    if (!title || !message || !scheduled_at || (!isBirthdayTitle && !phone)) {
      return NextResponse.json(
        {
          error: isBirthdayTitle
            ? 'title, message and scheduled_at are required for birthday automations'
            : 'title, phone, message and scheduled_at are required',
        },
        { status: 400 }
      )
    }

    const scheduledAtDate = new Date(scheduled_at)
    if (Number.isNaN(scheduledAtDate.getTime())) {
      return NextResponse.json(
        { error: 'scheduled_at must be a valid datetime' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('scheduled_messages')
      .insert({
        user_id: user.id,
        title: String(title),
        phone: phone ? String(phone) : '',
        message: String(message),
        scheduled_at: scheduledAtDate.toISOString(),
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('Error creating scheduled message:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
