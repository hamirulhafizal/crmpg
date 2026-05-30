import type { SupabaseClient } from '@supabase/supabase-js'
import {
  dealerSlugFromUsernamePgo,
  defaultDealerSlugFromUserId,
  isValidSlug,
  normalizeSlug,
} from '@/app/lib/lucky-draw/slug'

async function allocateDefaultDealerSlug(
  supabase: SupabaseClient,
  userId: string
): Promise<{ dealer_slug: string }> {
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

async function upsertDealerSlug(
  supabase: SupabaseClient,
  userId: string,
  desiredSlug: string
): Promise<{ dealer_slug: string }> {
  const { data: existing } = await supabase
    .from('lucky_draw_dealer_settings')
    .select('dealer_slug')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing?.dealer_slug === desiredSlug) {
    return { dealer_slug: desiredSlug }
  }

  if (existing) {
    const { data, error } = await supabase
      .from('lucky_draw_dealer_settings')
      .update({ dealer_slug: desiredSlug })
      .eq('user_id', userId)
      .select('dealer_slug')
      .single()

    if (!error && data) return { dealer_slug: data.dealer_slug }
    if (error?.code === '23505') {
      return { dealer_slug: existing.dealer_slug }
    }
    throw error
  }

  const { data, error } = await supabase
    .from('lucky_draw_dealer_settings')
    .insert({ user_id: userId, dealer_slug: desiredSlug })
    .select('dealer_slug')
    .single()

  if (!error && data) return { dealer_slug: data.dealer_slug }
  if (error?.code === '23505') {
    return allocateDefaultDealerSlug(supabase, userId)
  }
  throw error
}

export async function resolveLuckyDrawDealer(
  supabase: SupabaseClient,
  dealerSlug: string
): Promise<{ user_id: string; dealer_slug: string } | null> {
  const slug = dealerSlug.toLowerCase()

  const { data: settings } = await supabase
    .from('lucky_draw_dealer_settings')
    .select('user_id, dealer_slug')
    .eq('dealer_slug', slug)
    .maybeSingle()

  if (settings) return settings

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username_pbo')
    .not('username_pbo', 'is', null)

  for (const profile of profiles ?? []) {
    const candidate = dealerSlugFromUsernamePgo(profile.username_pbo ?? '')
    if (candidate === slug && isValidSlug(candidate)) {
      return { user_id: profile.id, dealer_slug: candidate }
    }
  }

  return null
}

export async function ensureDealerSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<{ dealer_slug: string; username_pbo: string | null }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username_pbo')
    .eq('id', userId)
    .maybeSingle()

  const usernamePbo = profile?.username_pbo?.trim() || null

  if (usernamePbo) {
    const fromUsername = dealerSlugFromUsernamePgo(usernamePbo)
    if (isValidSlug(fromUsername)) {
      const settings = await upsertDealerSlug(supabase, userId, fromUsername)
      return { ...settings, username_pbo: usernamePbo }
    }
  }

  const { data: existing } = await supabase
    .from('lucky_draw_dealer_settings')
    .select('dealer_slug')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing?.dealer_slug) {
    return { dealer_slug: existing.dealer_slug, username_pbo: usernamePbo }
  }

  const allocated = await allocateDefaultDealerSlug(supabase, userId)
  return { ...allocated, username_pbo: usernamePbo }
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

  return upsertDealerSlug(supabase, userId, dealer_slug)
}
