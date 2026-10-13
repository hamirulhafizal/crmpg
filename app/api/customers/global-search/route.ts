import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import {
  globalSearchOrFilterForToken,
  parseGlobalCustomerSearchQuery,
} from '@/app/lib/customers/global-search-query'

const SELECT_COLS =
  'id, name, sender_name, save_name, email, phone, pg_code, parent_pg_code, gender, ethnicity'

const MAX_RESULTS = 20

/**
 * GET /api/customers/global-search?q=
 * Full-tree search for the signed-in user (includes nested Tree Tier / dealers).
 * No Workspace root-frontline filter.
 */
export async function GET(request: Request) {
  const noStoreHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  }

  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
    }
    const { user, supabase } = auth

    const { searchParams } = new URL(request.url)
    const rawQ = searchParams.get('q') || searchParams.get('search') || ''
    const { q, tokens } = parseGlobalCustomerSearchQuery(rawQ)

    if (!q || tokens.length === 0) {
      return NextResponse.json({ data: [], q: '', count: 0 }, { headers: noStoreHeaders })
    }

    const orFilter = tokens.map((t) => globalSearchOrFilterForToken(t)).join(',')

    const { data, error } = await supabase
      .from('customers')
      .select(SELECT_COLS)
      .eq('user_id', user.id)
      .or(orFilter)
      .order('sender_name', { ascending: true })
      .limit(MAX_RESULTS)

    if (error) {
      console.error('GET /api/customers/global-search:', error)
      return NextResponse.json(
        { error: error.message || 'Search failed' },
        { status: 500, headers: noStoreHeaders }
      )
    }

    const rows = (data ?? []).map((row) => ({
      id: row.id as string,
      name: (row.name as string | null) ?? null,
      sender_name: (row.sender_name as string | null) ?? null,
      save_name: (row.save_name as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      pg_code: (row.pg_code as string | null) ?? null,
      parent_pg_code: (row.parent_pg_code as string | null) ?? null,
      gender: (row.gender as string | null) ?? null,
      ethnicity: (row.ethnicity as string | null) ?? null,
      display_name:
        (typeof row.sender_name === 'string' && row.sender_name.trim()) ||
        (typeof row.save_name === 'string' && row.save_name.trim()) ||
        (typeof row.name === 'string' && row.name.trim()) ||
        (typeof row.pg_code === 'string' && row.pg_code.trim()) ||
        'Unknown',
    }))

    return NextResponse.json(
      { data: rows, q, count: rows.length },
      { headers: noStoreHeaders }
    )
  } catch (err) {
    console.error('GET /api/customers/global-search:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500, headers: noStoreHeaders }
    )
  }
}
