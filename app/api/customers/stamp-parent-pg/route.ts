import { NextResponse } from 'next/server'
import { stampParentPgCodesForUser } from '@/app/lib/customers/stamp-parent-pg-codes'
import { normalizePgCodeValue } from '@/app/lib/customers/pg-code'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

/**
 * POST /api/customers/stamp-parent-pg
 * Recompute parent_pg_code from original_data Parent Name for the signed-in user.
 * Body optional: { root_pg_code?: string } — defaults to profiles.pgcode.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { root_pg_code?: string } = {}
  try {
    body = (await request.json()) as { root_pg_code?: string }
  } catch {
    body = {}
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('pgcode')
    .eq('id', user.id)
    .maybeSingle()

  const root =
    normalizePgCodeValue(body.root_pg_code) ||
    normalizePgCodeValue(profile?.pgcode)

  if (!root) {
    return NextResponse.json(
      { error: 'root_pg_code is required (set profiles.pgcode or pass in body)' },
      { status: 400 }
    )
  }

  try {
    const result = await stampParentPgCodesForUser(
      createServiceRoleClient(),
      user.id,
      root
    )
    return NextResponse.json({ ok: true, root_pg_code: root, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stamp failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
