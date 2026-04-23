import { createClient } from '@supabase/supabase-js'

/** Server-only client; bypasses RLS. Never import in client components. */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient(url, key)
}
