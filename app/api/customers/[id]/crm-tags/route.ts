import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

// GET /api/customers/[id]/crm-tags — tag IDs assigned to this customer
export async function GET(_request: Request, context: Params) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: customerId } = await context.params
    if (!customerId) {
      return NextResponse.json({ error: 'Missing customer id' }, { status: 400 })
    }

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (custErr) {
      console.error('crm-tags GET customer:', custErr)
      return NextResponse.json({ error: custErr.message }, { status: 500 })
    }
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const { data: rows, error } = await supabase
      .from('customer_tags')
      .select('tag_id')
      .eq('customer_id', customerId)

    if (error) {
      console.error('crm-tags GET:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const assignments = (rows || []).map((r) => ({ tag_id: r.tag_id }))
    return NextResponse.json({ assignments })
  } catch (e: unknown) {
    console.error('crm-tags GET:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/customers/[id]/crm-tags — replace all CRM tags (body: { tag_ids: string[] })
export async function PUT(request: Request, context: Params) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: customerId } = await context.params
    if (!customerId) {
      return NextResponse.json({ error: 'Missing customer id' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const rawIds = (body as { tag_ids?: unknown })?.tag_ids
    if (!Array.isArray(rawIds)) {
      return NextResponse.json({ error: 'tag_ids must be an array' }, { status: 400 })
    }

    const tag_ids = rawIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    const uniqueIds = [...new Set(tag_ids)]

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (custErr) {
      console.error('crm-tags PUT customer:', custErr)
      return NextResponse.json({ error: custErr.message }, { status: 500 })
    }
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (uniqueIds.length === 0) {
      const { error: delErr } = await supabase.from('customer_tags').delete().eq('customer_id', customerId)
      if (delErr) {
        console.error('crm-tags PUT delete all:', delErr)
        return NextResponse.json({ error: delErr.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true, assignments: [] })
    }

    const { data: tagMeta, error: metaErr } = await supabase
      .from('tags')
      .select('id, category_id, tag_categories ( allows_multiple )')
      .in('id', uniqueIds)

    if (metaErr) {
      console.error('crm-tags PUT meta:', metaErr)
      return NextResponse.json({ error: metaErr.message }, { status: 500 })
    }

    const metaRows = tagMeta || []
    if (metaRows.length !== uniqueIds.length) {
      return NextResponse.json(
        { error: 'One or more tag IDs are invalid or no longer exist.' },
        { status: 400 }
      )
    }

    const byCategory = new Map<
      string,
      { allows_multiple: boolean; count: number; name?: string }
    >()

    for (const row of metaRows) {
      const cat = row.tag_categories as { allows_multiple?: boolean; name?: string } | null
      const allows_multiple = cat?.allows_multiple !== false
      const cid = row.category_id as string
      const prev = byCategory.get(cid)
      const nextCount = (prev?.count ?? 0) + 1
      byCategory.set(cid, {
        allows_multiple,
        count: nextCount,
        name: typeof cat?.name === 'string' ? cat.name : prev?.name,
      })
    }

    for (const [cid, info] of byCategory) {
      if (!info.allows_multiple && info.count > 1) {
        return NextResponse.json(
          {
            error: `Only one tag is allowed in category "${info.name || cid}".`,
          },
          { status: 400 }
        )
      }
    }

    const { error: delErr } = await supabase.from('customer_tags').delete().eq('customer_id', customerId)

    if (delErr) {
      console.error('crm-tags PUT delete:', delErr)
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    const inserts = uniqueIds.map((tag_id) => ({
      customer_id: customerId,
      tag_id,
      user_id: user.id,
      source: 'manual' as const,
    }))

    const { error: insErr } = await supabase.from('customer_tags').insert(inserts)

    if (insErr) {
      console.error('crm-tags PUT insert:', insErr)
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      assignments: uniqueIds.map((tag_id) => ({ tag_id })),
    })
  } catch (e: unknown) {
    console.error('crm-tags PUT:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
