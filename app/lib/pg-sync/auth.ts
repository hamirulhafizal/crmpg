import { createClient } from '@/app/lib/supabase/server'

export type PgSyncSession = {
  userId: string
  email: string
  pgCode: string
}

export async function requirePgSyncSession(): Promise<
  { ok: true; session: PgSyncSession } | { ok: false; status: number; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.email) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const { data: profile, error: profileError } = await supabase
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
  }
}
