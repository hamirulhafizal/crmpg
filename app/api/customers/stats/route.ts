import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { getAccountStatusKey, type AccountStatusKey } from '@/app/lib/customer-account-status'

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'Surrogate-Control': 'no-store',
}

const STATUS_KEYS: AccountStatusKey[] = [
  'temporary',
  'freeze',
  'active',
  'free',
  'inactive',
  'unknown',
]

// GET /api/customers/stats — counts by account status for the logged-in user
// Use select('*') so missing optional columns (e.g. before migration 010) never break the query.
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
    }

    const counts: Record<AccountStatusKey, number> = {
      temporary: 0,
      freeze: 0,
      active: 0,
      free: 0,
      inactive: 0,
      unknown: 0,
    }

    const pageSize = 1000
    let from = 0

    for (;;) {
      const { data: batch, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)

      if (error) {
        console.error('Error fetching customers for stats:', error)
        return NextResponse.json({ error: error.message }, { status: 500, headers: noStoreHeaders })
      }

      if (!batch?.length) break

      for (const row of batch) {
        const key = getAccountStatusKey(row)
        counts[key] += 1
      }

      if (batch.length < pageSize) break
      from += pageSize
    }

    const total = STATUS_KEYS.reduce((sum, k) => sum + counts[k], 0)

    return NextResponse.json({ counts, total }, { headers: noStoreHeaders })
  } catch (err: unknown) {
    console.error('GET /api/customers/stats:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500, headers: noStoreHeaders }
    )
  }
}
