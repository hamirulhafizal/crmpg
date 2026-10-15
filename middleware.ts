import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from './app/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  // Public image renderer used by server-side automation sender.
  if (pathname.startsWith('/api/automation/gold-poster')) {
    return NextResponse.next()
  }
  // Large JSON workflow imports — skip middleware body handling; auth runs in the route handler.
  if (pathname.startsWith('/api/admin/campaign-workflow-defaults')) {
    return NextResponse.next()
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets / PWA files.
     * (Those must not hit supabase.auth.getUser — Auth 504s were killing middleware.)
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|robots\\.txt|icon|apple-icon|api/automation/gold-poster|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|json|txt|map)$).*)',
  ],
}

