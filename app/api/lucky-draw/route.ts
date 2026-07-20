import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { ensureDealerSettings } from '@/app/lib/lucky-draw/dealer-settings'
import { ensureDealerDefaultLuckyDrawPage } from '@/app/lib/lucky-draw/platform-defaults'
import { normalizeQuestions } from '@/app/lib/lucky-draw/questions'
import { isValidSlug, normalizeSlug } from '@/app/lib/lucky-draw/slug'
import { normalizePrizes } from '@/app/lib/lucky-draw/prizes'

export async function GET(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response

    const { user, supabase } = auth
    const settings = await ensureDealerSettings(supabase, user.id)
    await ensureDealerDefaultLuckyDrawPage(supabase, user.id)

    const { data: pages, error } = await supabase
      .from('lucky_draw_pages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const ids = (pages ?? []).map((p) => p.id)
    let entryCounts = new Map<string, number>()
    if (ids.length > 0) {
      const { data: entries } = await supabase
        .from('lucky_draw_entries')
        .select('page_id')
        .in('page_id', ids)
      for (const e of entries ?? []) {
        const k = e.page_id as string
        entryCounts.set(k, (entryCounts.get(k) ?? 0) + 1)
      }
    }

    const enriched = (pages ?? []).map((p) => ({
      ...p,
      entry_count: entryCounts.get(p.id) ?? 0,
    }))

    return NextResponse.json({ data: enriched, dealer_slug: settings.dealer_slug })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load lucky draw pages'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response

    const { user, supabase } = auth
    await ensureDealerSettings(supabase, user.id)

    const body = await request.json().catch(() => ({}))
    const title = typeof body.title === 'string' ? body.title.trim() : 'Lucky Draw'
    const page_slug =
      normalizeSlug(typeof body.page_slug === 'string' ? body.page_slug : 'lucky-draw') ||
      'lucky-draw'

    if (!isValidSlug(page_slug)) {
      return NextResponse.json({ error: 'Invalid page slug' }, { status: 400 })
    }

    const status =
      body.status === 'active' || body.status === 'closed' || body.status === 'draft'
        ? body.status
        : 'draft'

    const { data: page, error: pageErr } = await supabase
      .from('lucky_draw_pages')
      .insert({
        user_id: user.id,
        title: title || 'Lucky Draw',
        page_slug,
        status,
        prizes: normalizePrizes(body.prizes),
        terms_and_conditions:
          typeof body.terms_and_conditions === 'string' ? body.terms_and_conditions : null,
        target_audience: typeof body.target_audience === 'string' ? body.target_audience : null,
      })
      .select('*')
      .single()

    if (pageErr) {
      if (pageErr.code === '23505') {
        return NextResponse.json(
          { error: 'You already have a page with this slug.' },
          { status: 409 }
        )
      }
      throw pageErr
    }

    const questions = normalizeQuestions(body.questions)
    if (questions.length > 0) {
      const rows = questions.map((q) => ({
        page_id: page.id,
        sort_order: q.sort_order,
        question_type: q.question_type,
        question_text: q.question_text,
        options: q.options ?? null,
        is_required: q.is_required !== false,
      }))
      const { error: qErr } = await supabase.from('lucky_draw_questions').insert(rows)
      if (qErr) {
        await supabase.from('lucky_draw_pages').delete().eq('id', page.id)
        throw qErr
      }
    }

    return NextResponse.json({ data: page })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create lucky draw page'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
