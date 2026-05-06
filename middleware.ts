import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from './app/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  // Public image renderer used by server-side automation sender.
  if (pathname.startsWith('/api/automation/gold-poster')) {
    return NextResponse.next()
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/automation/gold-poster|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

