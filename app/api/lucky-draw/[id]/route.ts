import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { normalizeQuestions } from '@/app/lib/lucky-draw/questions'
import { isValidSlug, normalizeSlug } from '@/app/lib/lucky-draw/slug'
import { normalizePrizes } from '@/app/lib/lucky-draw/prizes'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Params) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const { data: page, error } = await supabase
      .from('lucky_draw_pages')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    if (!page) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data: questions } = await supabase
      .from('lucky_draw_questions')
      .select('*')
      .eq('page_id', id)
      .order('sort_order', { ascending: true })

    const { count } = await supabase
      .from('lucky_draw_entries')
      .select('*', { count: 'exact', head: true })
      .eq('page_id', id)

    return NextResponse.json({
      data: { ...page, questions: questions ?? [], entry_count: count ?? 0 },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load page'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const { data: existing } = await supabase
      .from('lucky_draw_pages')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}

    if (typeof body.title === 'string') patch.title = body.title.trim() || 'Lucky Draw'
    if (typeof body.terms_and_conditions === 'string') patch.terms_and_conditions = body.terms_and_conditions
    if (typeof body.target_audience === 'string') patch.target_audience = body.target_audience
    if (body.status === 'draft' || body.status === 'active' || body.status === 'closed') {
      patch.status = body.status
    }
    if ('prizes' in body) patch.prizes = normalizePrizes(body.prizes)
    if (typeof body.page_slug === 'string') {
      const page_slug = normalizeSlug(body.page_slug)
      if (!isValidSlug(page_slug)) {
        return NextResponse.json({ error: 'Invalid page slug' }, { status: 400 })
      }
      patch.page_slug = page_slug
    }

    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabase.from('lucky_draw_pages').update(patch).eq('id', id)
      if (updErr) {
        if (updErr.code === '23505') {
          return NextResponse.json({ error: 'You already have a page with this slug.' }, { status: 409 })
        }
        throw updErr
      }
    }

    if ('questions' in body) {
      const questions = normalizeQuestions(body.questions)
      await supabase.from('lucky_draw_questions').delete().eq('page_id', id)
      if (questions.length > 0) {
        const rows = questions.map((q) => ({
          page_id: id,
          sort_order: q.sort_order,
          question_type: q.question_type,
          question_text: q.question_text,
          options: q.options ?? null,
          is_required: q.is_required !== false,
        }))
        const { error: qErr } = await supabase.from('lucky_draw_questions').insert(rows)
        if (qErr) throw qErr
      }
    }

    const { data: page } = await supabase.from('lucky_draw_pages').select('*').eq('id', id).single()
    const { data: questions } = await supabase
      .from('lucky_draw_questions')
      .select('*')
      .eq('page_id', id)
      .order('sort_order', { ascending: true })

    return NextResponse.json({ data: { ...page, questions: questions ?? [] } })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update page'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: Params) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const { error } = await supabase.from('lucky_draw_pages').delete().eq('id', id).eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to delete page'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
