import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: Params) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string') updates.name = body.name.trim()
  if (body.description === null) updates.description = null
  if (typeof body.description === 'string') updates.description = body.description.trim() || null
  if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) {
    updates.sort_order = Math.trunc(body.sort_order)
  }
  if (typeof body.allows_multiple === 'boolean') updates.allows_multiple = body.allows_multiple

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('tag_categories')
      .update(updates)
      .eq('id', id)
      .select('id, key, name, description, sort_order, allows_multiple, created_at, updated_at')
      .maybeSingle()

    if (error) {
      console.error('admin tag-categories PATCH:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    return NextResponse.json({ category: data })
  } catch (e) {
    console.error('admin tag-categories PATCH:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: Params) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()
    const { error } = await admin.from('tag_categories').delete().eq('id', id)

    if (error) {
      console.error('admin tag-categories DELETE:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('admin tag-categories DELETE:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
