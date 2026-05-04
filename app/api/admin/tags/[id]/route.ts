import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { isValidTagSlug, normalizeTagSlug } from '@/app/lib/tag-slug'

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
  if (typeof body.slug === 'string') {
    const slug = normalizeTagSlug(body.slug)
    if (!isValidTagSlug(slug)) {
      return NextResponse.json(
        { error: 'slug must be lowercase letters, numbers, and underscores (1–80 chars).' },
        { status: 400 }
      )
    }
    updates.slug = slug
  }
  if (typeof body.label === 'string') updates.label = body.label.trim()
  if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) {
    updates.sort_order = Math.trunc(body.sort_order)
  }
  if (body.metadata !== undefined) {
    if (body.metadata !== null && typeof body.metadata === 'object') {
      updates.metadata = body.metadata
    } else {
      return NextResponse.json({ error: 'metadata must be an object' }, { status: 400 })
    }
  }
  if (typeof body.category_id === 'string' && body.category_id) {
    updates.category_id = body.category_id
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  if (updates.label === '') {
    return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('tags')
      .update(updates)
      .eq('id', id)
      .select('id, category_id, slug, label, sort_order, metadata, created_at, updated_at')
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A tag with this slug already exists in this category.' },
          { status: 409 }
        )
      }
      console.error('admin tags PATCH:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    return NextResponse.json({ tag: data })
  } catch (e) {
    console.error('admin tags PATCH:', e)
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
    const { error } = await admin.from('tags').delete().eq('id', id)

    if (error) {
      console.error('admin tags DELETE:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('admin tags DELETE:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
