import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const { data: categories, error: catErr } = await admin
      .from('tag_categories')
      .select('id, key, name, description, sort_order, allows_multiple, created_at, updated_at')
      .order('sort_order', { ascending: true })

    if (catErr) {
      console.error('admin tag-catalog categories:', catErr)
      return NextResponse.json({ error: catErr.message }, { status: 500 })
    }

    const { data: tags, error: tagErr } = await admin
      .from('tags')
      .select('id, category_id, slug, label, sort_order, metadata, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })

    if (tagErr) {
      console.error('admin tag-catalog tags:', tagErr)
      return NextResponse.json({ error: tagErr.message }, { status: 500 })
    }

    const tagRows = tags || []
    const tree = (categories || []).map((c) => ({
      ...c,
      tags: tagRows.filter((t) => t.category_id === c.id),
    }))

    return NextResponse.json({ categories: tree })
  } catch (e) {
    console.error('admin tag-catalog:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
