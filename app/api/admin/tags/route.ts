import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { isValidTagSlug, normalizeTagSlug } from '@/app/lib/tag-slug'

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const category_id = typeof body.category_id === 'string' ? body.category_id : ''
  const slug = normalizeTagSlug(typeof body.slug === 'string' ? body.slug : '')
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  const sort_order =
    typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
      ? Math.trunc(body.sort_order)
      : 0
  const metadata =
    body.metadata !== undefined && body.metadata !== null && typeof body.metadata === 'object'
      ? body.metadata
      : {}

  if (!category_id) {
    return NextResponse.json({ error: 'category_id is required' }, { status: 400 })
  }
  if (!label) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 })
  }
  if (!isValidTagSlug(slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase letters, numbers, and underscores (1–80 chars).' },
      { status: 400 }
    )
  }

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('tags')
      .insert({
        category_id,
        slug,
        label,
        sort_order,
        metadata,
      })
      .select('id, category_id, slug, label, sort_order, metadata, created_at, updated_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A tag with this slug already exists in this category.' },
          { status: 409 }
        )
      }
      if (error.code === '23503') {
        return NextResponse.json({ error: 'Invalid category_id.' }, { status: 400 })
      }
      console.error('admin tags POST:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ tag: data })
  } catch (e) {
    console.error('admin tags POST:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
