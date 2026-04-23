import { createClient } from '@/app/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

export type AdminAuthOk = { ok: true; user: User }
export type AdminAuthFail = { ok: false; response: Response }

/** Verify session user has profiles.role = admin (uses anon key + RLS). */
export async function requireAdminApi(): Promise<AdminAuthOk | AdminAuthFail> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError || profile?.role !== 'admin') {
    return { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, user }
}
