import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

/**
 * Read-only tag catalog for authenticated agents (assign on customers, filters, etc.).
 * Admin writes via /api/admin/* routes.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: categories, error: catErr } = await supabase
      .from('tag_categories')
      .select('id, key, name, description, sort_order, allows_multiple')
      .order('sort_order', { ascending: true })

    if (catErr) {
      console.error('tags GET categories:', catErr)
      return NextResponse.json({ error: catErr.message }, { status: 500 })
    }

    const { data: tags, error: tagErr } = await supabase
      .from('tags')
      .select('id, category_id, slug, label, sort_order, metadata')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })

    if (tagErr) {
      console.error('tags GET tags:', tagErr)
      return NextResponse.json({ error: tagErr.message }, { status: 500 })
    }

    const tagRows = tags || []
    const tree = (categories || []).map((c) => ({
      ...c,
      tags: tagRows.filter((t) => t.category_id === c.id),
    }))

    return NextResponse.json({
      categories: tree,
      tags: tagRows,
    })
  } catch (e) {
    console.error('tags GET:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
