import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { getAccountStatusKey, type AccountStatusKey } from '@/app/lib/customer-account-status'
import { isRootFrontlineCustomer } from '@/app/lib/customers/frontline-parent'
import { normalizePgCodeValue } from '@/app/lib/customers/pg-code'

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
// Workspace scope: root frontline only (excludes nested dealer syncs e.g. Mos).
export async function GET(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
    }
    const { user, supabase } = auth

    const { data: profile } = await supabase
      .from('profiles')
      .select('pgcode')
      .eq('id', user.id)
      .maybeSingle()
    const rootPgCode = normalizePgCodeValue(profile?.pgcode)

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
      let query = supabase
        .from('customers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)

      if (rootPgCode) {
        query = query
          .or(`parent_pg_code.is.null,parent_pg_code.eq.${rootPgCode}`)
          .or(
            `original_data->>Parent PGCode.is.null,original_data->>Parent PGCode.eq.${rootPgCode}`
          )
      }

      const { data: batch, error } = await query

      if (error) {
        console.error('Error fetching customers for stats:', error)
        return NextResponse.json({ error: error.message }, { status: 500, headers: noStoreHeaders })
      }

      if (!batch?.length) break

      for (const row of batch) {
        if (
          rootPgCode &&
          !isRootFrontlineCustomer(
            {
              pg_code: (row as { pg_code?: string | null }).pg_code ?? null,
              name: (row as { name?: string | null }).name ?? null,
              parent_pg_code: (row as { parent_pg_code?: string | null }).parent_pg_code ?? null,
              original_data: (row as { original_data?: unknown }).original_data,
            },
            rootPgCode
          )
        ) {
          continue
        }
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
