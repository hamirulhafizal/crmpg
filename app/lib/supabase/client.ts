import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // OAuth / magic-link / recovery land on /auth/callback or are handled
        // explicitly. Auto-detecting URL codes on every page races PKCE exchange
        // and breaks Gmail password-reset links.
        detectSessionInUrl: false,
      },
    }
  )
}

