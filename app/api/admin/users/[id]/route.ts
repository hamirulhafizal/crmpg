import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type RouteParams = { params: Promise<{ id: string }> }

type UserPatchBody = {
  email?: string
  password?: string
  full_name?: string | null
  role?: 'user' | 'admin'
  locale?: string | null
  timezone?: string | null
  waha_server_id?: string | null
}

export async function PATCH(request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { id } = await props.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  let body: UserPatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()

    const authUpdate: Record<string, unknown> = {}
    if (typeof body.email === 'string' && body.email.trim()) authUpdate.email = body.email.trim()
    if (typeof body.password === 'string' && body.password.trim()) authUpdate.password = body.password.trim()
    if (typeof body.full_name === 'string') authUpdate.user_metadata = { full_name: body.full_name.trim() }

    if (Object.keys(authUpdate).length > 0) {
      const authRes = await admin.auth.admin.updateUserById(id, authUpdate)
      if (authRes.error) {
        return NextResponse.json({ error: authRes.error.message }, { status: 400 })
      }
    }

    const profileUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.full_name === 'string') profileUpdates.full_name = body.full_name.trim() || null
    if (body.role === 'admin' || body.role === 'user') profileUpdates.role = body.role
    if (typeof body.locale === 'string') profileUpdates.locale = body.locale.trim() || 'en'
    if (typeof body.timezone === 'string') profileUpdates.timezone = body.timezone.trim() || null
    if (body.waha_server_id === null) profileUpdates.waha_server_id = null
    if (typeof body.waha_server_id === 'string') {
      profileUpdates.waha_server_id = body.waha_server_id.trim() || null
    }

    const { error: profileError } = await admin.from('profiles').update(profileUpdates).eq('id', id)
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { id } = await props.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const admin = createServiceRoleClient()
    const result = await admin.auth.admin.deleteUser(id)
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
