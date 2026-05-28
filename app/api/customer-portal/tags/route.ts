import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

/** Read-only tag catalog for customer portal (lucky draw questionnaires). */
export async function GET() {
  try {
    const admin = createServiceRoleClient()

    const { data: categories, error: catErr } = await admin
      .from('tag_categories')
      .select('id, key, name, description, sort_order, allows_multiple')
      .order('sort_order', { ascending: true })

    if (catErr) throw catErr

    const { data: tags, error: tagErr } = await admin
      .from('tags')
      .select('id, category_id, slug, label, sort_order')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })

    if (tagErr) throw tagErr

    const tagRows = tags || []
    const tree = (categories || []).map((c) => ({
      ...c,
      tags: tagRows.filter((t) => t.category_id === c.id),
    }))

    return NextResponse.json({ categories: tree, tags: tagRows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load tags'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
