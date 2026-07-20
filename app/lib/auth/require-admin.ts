import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { createBearerClient } from '@/app/lib/supabase/bearer'
import { extractBearerToken } from '@/app/lib/auth/bearer'
import type { User } from '@supabase/supabase-js'

export type AdminAuthOk = { ok: true; user: User }
export type AdminAuthFail = { ok: false; response: Response }

async function resolveUser(request?: Request): Promise<User | null> {
  const token = extractBearerToken(request)

  if (token) {
    const supabase = createBearerClient(token)
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return null
    return data.user
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

/** Verify session user has profiles.role = admin. Pass `request` for Bearer (mobile) auth. */
export async function requireAdminApi(request?: Request): Promise<AdminAuthOk | AdminAuthFail> {
  const user = await resolveUser(request)
  if (!user) {
    return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createServiceRoleClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || profile?.role !== 'admin') {
    return { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, user }
}
