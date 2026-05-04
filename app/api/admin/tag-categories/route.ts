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

  const keyRaw = typeof body.key === 'string' ? body.key : ''
  const key = normalizeTagSlug(keyRaw)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description =
    typeof body.description === 'string' ? body.description.trim() || null : null
  const sort_order =
    typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
      ? Math.trunc(body.sort_order)
      : 0
  const allows_multiple =
    typeof body.allows_multiple === 'boolean' ? body.allows_multiple : true

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!isValidTagSlug(key)) {
    return NextResponse.json(
      { error: 'key must be lowercase letters, numbers, and underscores (1–80 chars).' },
      { status: 400 }
    )
  }

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('tag_categories')
      .insert({
        key,
        name,
        description,
        sort_order,
        allows_multiple,
      })
      .select('id, key, name, description, sort_order, allows_multiple, created_at, updated_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A category with this key already exists.' }, { status: 409 })
      }
      console.error('admin tag-categories POST:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ category: data })
  } catch (e) {
    console.error('admin tag-categories POST:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
