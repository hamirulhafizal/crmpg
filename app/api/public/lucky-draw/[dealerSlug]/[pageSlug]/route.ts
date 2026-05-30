import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { resolveLuckyDrawDealer } from '@/app/lib/lucky-draw/dealer-settings'

type Params = { params: Promise<{ dealerSlug: string; pageSlug: string }> }

export async function GET(_request: Request, context: Params) {
  try {
    const { dealerSlug, pageSlug } = await context.params
    const admin = createServiceRoleClient()

    const settings = await resolveLuckyDrawDealer(admin, dealerSlug)

    if (!settings) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    const { data: page, error: pageErr } = await admin
      .from('lucky_draw_pages')
      .select('id, title, status, prizes, terms_and_conditions, target_audience, page_slug, created_at')
      .eq('user_id', settings.user_id)
      .eq('page_slug', pageSlug.toLowerCase())
      .maybeSingle()

    if (pageErr) throw pageErr
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    const { data: questions } = await admin
      .from('lucky_draw_questions')
      .select('id, sort_order, question_type, question_text, options, is_required')
      .eq('page_id', page.id)
      .order('sort_order', { ascending: true })

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', settings.user_id)
      .maybeSingle()

    return NextResponse.json({
      data: {
        ...page,
        dealer_slug: settings.dealer_slug,
        dealer_name: profile?.full_name ?? null,
        questions: questions ?? [],
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load page'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
