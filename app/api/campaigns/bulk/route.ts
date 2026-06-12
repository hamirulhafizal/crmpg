import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

export async function DELETE(request: Request) {
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
    const ids = body?.ids

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'IDs array is required' }, { status: 400 })
    }

    const uniqueIds = [...new Set(ids.map((id: unknown) => String(id)).filter(Boolean))]

    const { error, count } = await supabase
      .from('campaigns')
      .delete()
      .in('id', uniqueIds)
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({
      ok: true,
      count: count ?? uniqueIds.length,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to delete campaigns'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
