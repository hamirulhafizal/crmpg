import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUserApi } from '@/app/lib/auth/require-user'

export type PgSyncSession = {
  userId: string
  email: string
  pgCode: string
}

/**
 * Authenticate PG sync routes.
 * Accepts Bearer (native iOS) or cookie session (web).
 */
export async function requirePgSyncSession(
  request: Request
): Promise<
  | { ok: true; session: PgSyncSession; supabase: SupabaseClient }
  | { ok: false; status: number; error: string }
> {
  const auth = await requireUserApi(request)
  if (!auth.ok) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const user = auth.user
  if (!user.email) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const { data: profile, error: profileError } = await auth.supabase
    .from('profiles')
    .select('pgcode')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return { ok: false, status: 500, error: profileError.message }
  }

  const pgCode = profile?.pgcode?.trim().toUpperCase() ?? ''
  if (!pgCode) {
    return {
      ok: false,
      status: 400,
      error: 'Add your PG code in Profile settings before syncing from PG Business Center.',
    }
  }

  return {
    ok: true,
    session: {
      userId: user.id,
      email: user.email.trim(),
      pgCode,
    },
    supabase: auth.supabase,
  }
}
