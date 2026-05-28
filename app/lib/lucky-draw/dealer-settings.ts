import type { SupabaseClient } from '@supabase/supabase-js'
import { defaultDealerSlugFromUserId, isValidSlug, normalizeSlug } from '@/app/lib/lucky-draw/slug'

export async function ensureDealerSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<{ dealer_slug: string }> {
  const { data: existing } = await supabase
    .from('lucky_draw_dealer_settings')
    .select('dealer_slug')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing?.dealer_slug) {
    return { dealer_slug: existing.dealer_slug }
  }

  let candidate = defaultDealerSlugFromUserId(userId)
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? candidate : `${candidate}${i}`
    const { data, error } = await supabase
      .from('lucky_draw_dealer_settings')
      .insert({ user_id: userId, dealer_slug: slug })
      .select('dealer_slug')
      .single()

    if (!error && data) return { dealer_slug: data.dealer_slug }
    if (error?.code !== '23505') throw error
  }

  throw new Error('Could not allocate a unique dealer slug')
}

export async function updateDealerSlug(
  supabase: SupabaseClient,
  userId: string,
  rawSlug: string
): Promise<{ dealer_slug: string }> {
  const dealer_slug = normalizeSlug(rawSlug)
  if (!isValidSlug(dealer_slug)) {
    throw new Error('Invalid slug. Use lowercase letters, numbers, and hyphens (2–64 chars).')
  }

  await ensureDealerSettings(supabase, userId)

  const { data, error } = await supabase
    .from('lucky_draw_dealer_settings')
    .update({ dealer_slug })
    .eq('user_id', userId)
    .select('dealer_slug')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('This dealer URL is already taken. Choose another slug.')
    }
    throw error
  }

  return { dealer_slug: data.dealer_slug }
}
