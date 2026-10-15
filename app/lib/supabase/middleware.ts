import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Avoid hanging the whole request when Supabase Auth is 504 / slow. */
const AUTH_GET_USER_TIMEOUT_MS = 4_000

function isStaticOrPublicAsset(pathname: string): boolean {
  if (
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    pathname === '/robots.txt' ||
    pathname === '/favicon.ico' ||
    pathname === '/icon' ||
    pathname === '/apple-icon'
  ) {
    return true
  }
  // Public marketing / policy pages — no session gate needed
  if (
    pathname === '/' ||
    pathname === '/about' ||
    pathname === '/contact' ||
    pathname === '/privacy' ||
    pathname.startsWith('/policy/')
  ) {
    return true
  }
  // Public APIs that must not block on Auth
  if (pathname.startsWith('/api/get-all-agents') || pathname.startsWith('/api/public/')) {
    return true
  }
  return false
}

async function getUserWithTimeout(
  getUser: () => Promise<{ data: { user: unknown }; error: unknown }>
): Promise<{ user: { id: string } | null; timedOut: boolean }> {
  let timedOut = false
  try {
    const result = await Promise.race([
      getUser(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          timedOut = true
          reject(new Error('auth_get_user_timeout'))
        }, AUTH_GET_USER_TIMEOUT_MS)
      }),
    ])
    const user = (result.data?.user as { id: string } | null) ?? null
    return { user, timedOut: false }
  } catch {
    return { user: null, timedOut }
  }
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Never call Supabase Auth for assets / public pages (prevents Auth stampede + 25s kills).
  if (isStaticOrPublicAsset(pathname)) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: call getUser soon after createServerClient (cookie refresh).
  // Fail fast on Auth 504 so middleware does not eat the full Vercel 25s budget.
  const { user } = await getUserWithTimeout(() => supabase.auth.getUser())

  const isCustomerPortal =
    pathname.startsWith('/pg-gold-saver') ||
    pathname.startsWith('/customer') ||
    pathname.startsWith('/api/customer-portal') ||
    pathname.startsWith('/api/public/lucky-draw')

  const isProtectedAppRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/pwa-test') ||
    pathname.startsWith('/test-pwa') ||
    pathname.startsWith('/excel-processor') ||
    pathname.startsWith('/customers') ||
    pathname.startsWith('/ws-integration') ||
    pathname.startsWith('/waha-integration') ||
    pathname.startsWith('/google-ads') ||
    pathname.startsWith('/automated-messages') ||
    pathname.startsWith('/extension-download') ||
    pathname.startsWith('/admin')

  // Protected routes — preserve destination for post-login redirect (?next=/customers)
  if (!user && !isCustomerPortal && isProtectedAppRoute) {
    const returnTo = `${pathname}${request.nextUrl.search}`
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', returnTo)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages (logout is handled at /logout)
  const addAccount = request.nextUrl.searchParams.get('add_account') === '1'
  const isSwitchAccount = pathname === '/switch-account'
  const isIosHandoff =
    pathname === '/auth/ios-handoff' || pathname === '/auth/ios-session'
  if (
    user &&
    pathname !== '/logout' &&
    !isSwitchAccount &&
    !isIosHandoff &&
    (pathname === '/login' || pathname === '/register') &&
    !(pathname === '/login' && addAccount)
  ) {
    const url = request.nextUrl.clone()
    const next = request.nextUrl.searchParams.get('next')
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
    const qIndex = safeNext.indexOf('?')
    url.pathname = qIndex >= 0 ? safeNext.slice(0, qIndex) : safeNext
    url.search = qIndex >= 0 ? safeNext.slice(qIndex) : ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
