import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type RouteParams = { params: Promise<{ id: string; sessionId: string }> }

export async function DELETE(_request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { id, sessionId } = await props.params
  if (!id || !sessionId) {
    return NextResponse.json({ error: 'Missing id or sessionId' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()
    const { error } = await admin.from('waha_user_sessions').delete().eq('id', sessionId).eq('user_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
