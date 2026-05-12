import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

const ACCOUNT_STATUS_FILTER = new Set([
  '',
  'temporary',
  'freeze',
  'active',
  'free',
  'inactive',
  'unknown',
])

async function assertCustomerOwned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  customerId: string
) {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data)
}

type BookmarkRow = {
  customer_id: string
  save_name: string
  account_status_filter: string
  page: number
  view_mode: string
  updated_at: string
}

/** GET — current user's bookmark or null */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('user_follow_up_bookmarks')
      .select('customer_id, save_name, account_status_filter, page, view_mode, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error(error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: (data as BookmarkRow | null) ?? null })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

type PutBody = {
  customerId?: unknown
  saveName?: unknown
  accountStatusFilter?: unknown
  page?: unknown
  viewMode?: unknown
}

/** PUT — upsert bookmark (customer must belong to user) */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as PutBody
    const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!customerId || !uuidRe.test(customerId)) {
      return NextResponse.json({ error: 'Invalid customerId' }, { status: 400 })
    }

    const ok = await assertCustomerOwned(supabase, user.id, customerId)
    if (!ok) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const saveName =
      typeof body.saveName === 'string' && body.saveName.trim() ? body.saveName.trim().slice(0, 500) : 'Customer'
    const accountStatusFilter =
      typeof body.accountStatusFilter === 'string' ? body.accountStatusFilter.trim() : ''
    if (!ACCOUNT_STATUS_FILTER.has(accountStatusFilter)) {
      return NextResponse.json({ error: 'Invalid accountStatusFilter' }, { status: 400 })
    }

    const pageRaw = body.page
    const page = typeof pageRaw === 'number' && Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1
    if (page < 1) {
      return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
    }

    const viewMode = body.viewMode === 'all' ? 'all' : 'paginated'

    const row = {
      user_id: user.id,
      customer_id: customerId,
      save_name: saveName,
      account_status_filter: accountStatusFilter,
      page,
      view_mode: viewMode,
    }

    const { data, error } = await supabase
      .from('user_follow_up_bookmarks')
      .upsert(row, { onConflict: 'user_id' })
      .select('customer_id, save_name, account_status_filter, page, view_mode, updated_at')
      .single()

    if (error) {
      console.error(error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data as BookmarkRow })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** DELETE — remove bookmark */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase.from('user_follow_up_bookmarks').delete().eq('user_id', user.id)

    if (error) {
      console.error(error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
