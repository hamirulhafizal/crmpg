import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

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

// PUT /api/automated-messages/[id] - Update a scheduled message (only if still pending)
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
    // Always clear any stale processing lock when the user saves edits.
    update.locked_at = null

    const { data, error } = await supabase
      .from('scheduled_messages')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'pending') // do not modify messages already processed
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      // No matching pending row was updated – it may have been processed already.
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('scheduled_messages')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'pending')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
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
