import type { User, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/app/lib/supabase/server'
import { createBearerClient } from '@/app/lib/supabase/bearer'
import { extractBearerToken } from '@/app/lib/auth/bearer'

export type UserAuthOk = {
  ok: true
  user: User
  /** Cookie SSR client or Bearer client — both support .from() with RLS. */
  supabase: SupabaseClient
  accessToken: string | null
}

export type UserAuthFail = {
  ok: false
  response: Response
}

/**
 * Authenticate a dealer/user API request.
 * Prefer `Authorization: Bearer <access_token>` (native iOS / mobile),
 * fall back to cookie session (web SSR).
 *
 * Always pass `request` so mobile Bearer tokens are detected.
 */
export async function requireUserApi(request: Request): Promise<UserAuthOk | UserAuthFail> {
  const token = extractBearerToken(request)

  if (token) {
    const supabase = createBearerClient(token)
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return {
        ok: false,
        response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
      }
    }
    return { ok: true, user: data.user, supabase, accessToken: token }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return {
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return {
    ok: true,
    user: data.user,
    supabase: supabase as unknown as SupabaseClient,
    accessToken: null,
  }
}
