import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { id } = await props.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('waha_user_sessions')
      .select('id, user_id, session_name, last_known_waha_status, created_at, updated_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ sessions: data || [] })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 })
  }
}

export async function POST(request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { id } = await props.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as { session_name?: string }
  const sessionName = (body.session_name || '').toString().trim()
  if (!sessionName) return NextResponse.json({ error: 'session_name is required' }, { status: 400 })

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('waha_user_sessions')
      .upsert(
        {
          user_id: id,
          session_name: sessionName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,session_name' }
      )
      .select('id, user_id, session_name, last_known_waha_status, created_at, updated_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ session: data })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
  }
}
