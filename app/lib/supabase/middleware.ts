import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
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

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
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
  if (
    user &&
    pathname !== '/logout' &&
    !isSwitchAccount &&
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

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely.

  return supabaseResponse
}

