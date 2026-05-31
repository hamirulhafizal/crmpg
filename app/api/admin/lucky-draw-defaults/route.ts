import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import {
  loadPlatformLuckyDrawDefaults,
  savePlatformLuckyDrawDefaults,
} from '@/app/lib/lucky-draw/platform-defaults'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const defaults = await loadPlatformLuckyDrawDefaults(admin)

    const { count } = await admin
      .from('lucky_draw_pages')
      .select('*', { count: 'exact', head: true })
      .eq('uses_platform_defaults', true)

    return NextResponse.json({ data: defaults, synced_dealer_pages: count ?? 0 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load platform defaults'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json().catch(() => ({}))
    const admin = createServiceRoleClient()

    const result = await savePlatformLuckyDrawDefaults(admin, {
      title: typeof body.title === 'string' ? body.title : 'Lucky Draw',
      page_slug: typeof body.page_slug === 'string' ? body.page_slug : 'lucky-draw',
      prizes: body.prizes,
      terms_and_conditions:
        typeof body.terms_and_conditions === 'string' ? body.terms_and_conditions : null,
      target_audience: typeof body.target_audience === 'string' ? body.target_audience : null,
      questions: body.questions,
    })

    return NextResponse.json({
      data: result.defaults,
      synced_pages: result.synced_pages,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save platform defaults'
    const status = msg.includes('Invalid page slug') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
