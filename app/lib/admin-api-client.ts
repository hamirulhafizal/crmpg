'use client'

import { createClient } from '@/app/lib/supabase/client'

/** Authenticated fetch for admin API routes (cookie + Bearer fallback). */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const supabase = createClient()
  let {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession()
    session = refreshed.data.session
  }

  const headers = new Headers(init.headers)
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'same-origin',
  })
}
