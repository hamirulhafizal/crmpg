import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePrizes } from '@/app/lib/lucky-draw/prizes'
import { normalizeQuestions } from '@/app/lib/lucky-draw/questions'
import { isValidSlug, normalizeSlug } from '@/app/lib/lucky-draw/slug'
import type { LuckyDrawPrize, LuckyDrawQuestion } from '@/app/lib/lucky-draw/types'

export const PLATFORM_DEFAULTS_ID = 'default'

export type PlatformLuckyDrawDefaults = {
  id: string
  title: string
  page_slug: string
  prizes: LuckyDrawPrize[]
  terms_and_conditions: string | null
  target_audience: string | null
  questions: LuckyDrawQuestion[]
}

export const FALLBACK_PLATFORM_DEFAULTS: Omit<PlatformLuckyDrawDefaults, 'id'> = {
  title: 'Lucky Draw',
  page_slug: 'lucky-draw',
  prizes: [
    { name: '5GRAM', description: 'Gold Bar 999 (bernilai RM10K)' },
    { name: '1GRAM', description: 'Gold Bar 999' },
  ],
  terms_and_conditions:
    '1. Aktif Menabung Setiap bulan\n2. Profile sudah verified\n3. Subscribe Auto Debit GAP 5 tahun',
  target_audience: null,
  questions: [
    { sort_order: 0, question_type: 'yes_no', question_text: 'Pernah Hadir Seminar Kaya Dengan Emas ?', is_required: true },
    { sort_order: 1, question_type: 'yes_no', question_text: 'Pernah Withdraw Emas 999 GAP di ATM ?', is_required: true },
    { sort_order: 2, question_type: 'yes_no', question_text: 'Dah Install APPS Public Gold ?', is_required: true },
    { sort_order: 3, question_type: 'yes_no', question_text: 'Pernah Pajak Emas GAP ?', is_required: true },
    { sort_order: 4, question_type: 'yes_no', question_text: 'Pernah Buat Buyback (jual emas) GAP ?', is_required: true },
    { sort_order: 5, question_type: 'yes_no', question_text: 'Pernah Join Private Webinar ?', is_required: true },
    {
      sort_order: 6,
      question_type: 'yes_no',
      question_text: 'Pernah Withdraw Barang Kemas 999 GAP di branch ?',
      is_required: true,
    },
  ],
}

export async function loadPlatformLuckyDrawDefaults(
  supabase: SupabaseClient
): Promise<PlatformLuckyDrawDefaults> {
  const { data: row } = await supabase
    .from('lucky_draw_platform_defaults')
    .select('*')
    .eq('id', PLATFORM_DEFAULTS_ID)
    .maybeSingle()

  const { data: questionRows } = await supabase
    .from('lucky_draw_platform_default_questions')
    .select('id, sort_order, question_type, question_text, options, is_required')
    .order('sort_order', { ascending: true })

  const questions = normalizeQuestions(questionRows ?? [])
  const fallback = FALLBACK_PLATFORM_DEFAULTS

  if (!row) {
    return { id: PLATFORM_DEFAULTS_ID, ...fallback, questions: questions.length ? questions : fallback.questions }
  }

  return {
    id: row.id,
    title: row.title ?? fallback.title,
    page_slug: row.page_slug ?? fallback.page_slug,
    prizes: normalizePrizes(row.prizes).length ? normalizePrizes(row.prizes) : fallback.prizes,
    terms_and_conditions: row.terms_and_conditions ?? fallback.terms_and_conditions,
    target_audience: row.target_audience ?? fallback.target_audience,
    questions: questions.length ? questions : fallback.questions,
  }
}

async function replacePlatformQuestions(
  supabase: SupabaseClient,
  questions: LuckyDrawQuestion[]
) {
  await supabase.from('lucky_draw_platform_default_questions').delete().gte('sort_order', 0)
  const normalized = normalizeQuestions(questions)
  if (normalized.length === 0) return

  const rows = normalized.map((q) => ({
    sort_order: q.sort_order,
    question_type: q.question_type,
    question_text: q.question_text,
    options: q.options ?? null,
    is_required: q.is_required !== false,
  }))

  const { error } = await supabase.from('lucky_draw_platform_default_questions').insert(rows)
  if (error) throw error
}

async function replacePageQuestions(
  supabase: SupabaseClient,
  pageId: string,
  questions: LuckyDrawQuestion[]
) {
  await supabase.from('lucky_draw_questions').delete().eq('page_id', pageId)
  const normalized = normalizeQuestions(questions)
  if (normalized.length === 0) return

  const rows = normalized.map((q) => ({
    page_id: pageId,
    sort_order: q.sort_order,
    question_type: q.question_type,
    question_text: q.question_text,
    options: q.options ?? null,
    is_required: q.is_required !== false,
  }))

  const { error } = await supabase.from('lucky_draw_questions').insert(rows)
  if (error) throw error
}

export async function savePlatformLuckyDrawDefaults(
  supabase: SupabaseClient,
  input: {
    title: string
    page_slug: string
    prizes: unknown
    terms_and_conditions: string | null
    target_audience: string | null
    questions: unknown
  }
): Promise<{ defaults: PlatformLuckyDrawDefaults; synced_pages: number }> {
  const page_slug = normalizeSlug(input.page_slug) || 'lucky-draw'
  if (!isValidSlug(page_slug)) {
    throw new Error('Invalid page slug')
  }

  const prizes = normalizePrizes(input.prizes)
  const questions = normalizeQuestions(input.questions)

  const { error: upsertError } = await supabase.from('lucky_draw_platform_defaults').upsert({
    id: PLATFORM_DEFAULTS_ID,
    title: input.title.trim() || 'Lucky Draw',
    page_slug,
    prizes,
    terms_and_conditions: input.terms_and_conditions,
    target_audience: input.target_audience,
  })
  if (upsertError) throw upsertError

  await replacePlatformQuestions(supabase, questions)

  const { data: syncedPages, error: pagesError } = await supabase
    .from('lucky_draw_pages')
    .select('id')
    .eq('uses_platform_defaults', true)

  if (pagesError) throw pagesError

  for (const page of syncedPages ?? []) {
    const { error: pageUpdateError } = await supabase
      .from('lucky_draw_pages')
      .update({
        title: input.title.trim() || 'Lucky Draw',
        page_slug,
        prizes,
        terms_and_conditions: input.terms_and_conditions,
        target_audience: input.target_audience,
      })
      .eq('id', page.id)

    if (pageUpdateError) throw pageUpdateError
    await replacePageQuestions(supabase, page.id, questions)
  }

  const defaults = await loadPlatformLuckyDrawDefaults(supabase)
  return { defaults, synced_pages: syncedPages?.length ?? 0 }
}

/** Create the platform-default lucky draw page for a dealer if they don't have one yet. */
export async function ensureDealerDefaultLuckyDrawPage(
  supabase: SupabaseClient,
  userId: string
): Promise<{ created: boolean; page_id?: string }> {
  const defaults = await loadPlatformLuckyDrawDefaults(supabase)
  const pageSlug = defaults.page_slug || 'lucky-draw'

  const { data: existing } = await supabase
    .from('lucky_draw_pages')
    .select('id')
    .eq('user_id', userId)
    .eq('page_slug', pageSlug)
    .maybeSingle()

  if (existing) {
    return { created: false }
  }

  const { data: page, error: pageError } = await supabase
    .from('lucky_draw_pages')
    .insert({
      user_id: userId,
      title: defaults.title,
      page_slug: pageSlug,
      status: 'draft',
      prizes: defaults.prizes,
      terms_and_conditions: defaults.terms_and_conditions,
      target_audience: defaults.target_audience,
      uses_platform_defaults: true,
    })
    .select('id')
    .single()

  if (pageError) throw pageError

  await replacePageQuestions(supabase, page.id, defaults.questions)

  return { created: true, page_id: page.id }
}
