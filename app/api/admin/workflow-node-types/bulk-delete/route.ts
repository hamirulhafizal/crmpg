import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }

  const uniqueIds = [...new Set(ids)]
  const admin = createServiceRoleClient()

  const { data: rows, error: fetchError } = await admin
    .from('workflow_node_types')
    .select('id, label, is_system')
    .in('id', uniqueIds)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const found = rows ?? []
  const foundIds = new Set(found.map((r) => r.id))
  const notFound = uniqueIds.filter((id) => !foundIds.has(id))

  const systemIds = found.filter((r) => r.is_system).map((r) => r.id)
  const customIds = found.filter((r) => !r.is_system).map((r) => r.id)

  let disabled = 0
  let deleted = 0

  if (systemIds.length > 0) {
    const { error } = await admin
      .from('workflow_node_types')
      .update({ enabled: false })
      .in('id', systemIds)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    disabled = systemIds.length
  }

  if (customIds.length > 0) {
    const { error } = await admin.from('workflow_node_types').delete().in('id', customIds)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    deleted = customIds.length
  }

  return NextResponse.json({
    success: true,
    deleted,
    disabled,
    not_found: notFound,
    total: uniqueIds.length,
  })
}
