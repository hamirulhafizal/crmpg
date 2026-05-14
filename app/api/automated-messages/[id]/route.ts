import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  isBroadcastScheduledTitle,
  normalizedScheduledTitle,
  SCHEDULED_TITLE_GOLD_PRICE_POSTER,
} from '@/app/lib/scheduled-automation-titles'

// GET /api/automated-messages/[id] - Fetch a single scheduled message
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('Error fetching automated message:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/automated-messages/[id] - Update a scheduled message.
// Gold poster rows are editable even after sent/failed (treated as recurring schedules).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { data: existing, error: existingError } = await supabase
      .from('scheduled_messages')
      .select('id, title, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existingError || !existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const isGoldPoster =
      normalizedScheduledTitle(existing.title) === normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER)

    const update: Record<string, unknown> = {}

    if (body.title !== undefined) update.title = String(body.title)
    if (body.phone !== undefined) update.phone = String(body.phone)
    if (body.message !== undefined) update.message = String(body.message)
    if (body.is_enable !== undefined) update.is_enable = Boolean(body.is_enable)
    if (body.scheduled_at !== undefined) {
      const scheduledAt = new Date(body.scheduled_at)
      if (Number.isNaN(scheduledAt.getTime())) {
        return NextResponse.json(
          { error: 'scheduled_at must be a valid datetime' },
          { status: 400 }
        )
      }
      update.scheduled_at = scheduledAt.toISOString()
    }
    if (body.audience_target !== undefined) {
      if (body.audience_target != null && typeof body.audience_target === 'object' && !Array.isArray(body.audience_target)) {
        update.audience_target = body.audience_target
      } else {
        update.audience_target = {}
      }
    }

    // Recurring gold poster schedules should become pending again when edited.
    if (isGoldPoster) update.status = 'pending'

    let query = supabase
      .from('scheduled_messages')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
    if (!isGoldPoster) {
      query = query.eq('status', 'pending') // preserve previous behavior for non-recurring rows
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Not found or not editable' }, { status: 404 })
    }

    // On success, just return a generic payload; client will refetch the list.
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error updating automated message:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/automated-messages/[id] - Cancel a scheduled message (only if still pending)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const admin = createServiceRoleClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: existing, error: existingError } = await admin
      .from('scheduled_messages')
      .select('id, title')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingError || !existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isGoldPoster =
      normalizedScheduledTitle(existing.title) === normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER)
    const isRecurringAutomation = isGoldPoster || isBroadcastScheduledTitle(existing.title)

    let deleteQuery = admin
      .from('scheduled_messages')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    // Preserve old safety for one-off personal schedules; recurring automations
    // should be removable even if latest run already marked as sent.
    if (!isRecurringAutomation) {
      deleteQuery = deleteQuery.eq('status', 'pending')
    }

    const { data, error } = await deleteQuery.select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Not found or not deletable' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error deleting automated message:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
