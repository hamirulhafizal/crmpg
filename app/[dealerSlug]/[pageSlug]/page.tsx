import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { LuckyDrawPublicClient } from '@/app/[dealerSlug]/[pageSlug]/_components/LuckyDrawPublicClient'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type Props = {
  params: Promise<{ dealerSlug: string; pageSlug: string }>
}

async function loadPublicPage(dealerSlug: string, pageSlug: string) {
  const admin = createServiceRoleClient()

  const { data: settings } = await admin
    .from('lucky_draw_dealer_settings')
    .select('user_id, dealer_slug')
    .eq('dealer_slug', dealerSlug.toLowerCase())
    .maybeSingle()

  if (!settings) return null

  const { data: page } = await admin
    .from('lucky_draw_pages')
    .select('id, title, status, prizes, terms_and_conditions, target_audience, page_slug')
    .eq('user_id', settings.user_id)
    .eq('page_slug', pageSlug.toLowerCase())
    .maybeSingle()

  if (!page) return null

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

  return {
    ...page,
    dealer_slug: settings.dealer_slug,
    dealer_name: profile?.full_name ?? null,
    questions: questions ?? [],
  }
}

export default async function LuckyDrawPublicPage({ params }: Props) {
  const { dealerSlug, pageSlug } = await params
  const page = await loadPublicPage(dealerSlug, pageSlug)
  if (!page) notFound()

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-amber-50 text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <LuckyDrawPublicClient page={page} dealerSlug={dealerSlug} pageSlug={pageSlug} />
    </Suspense>
  )
}
