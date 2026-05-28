import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { getAuthenticatedPortalCustomer } from '@/app/lib/customer-portal/auth'
import type { LuckyDrawEntryAnswer } from '@/app/lib/lucky-draw/types'
import {
  SYSTEM_QUESTION_LOCATION,
  SYSTEM_QUESTION_PURPOSE,
} from '@/app/lib/lucky-draw/types'

type SubmitInput = {
  pageId: string
  purposeTagIds: string[]
  locationText: string
  locationLat: number | null
  locationLng: number | null
  customAnswers: LuckyDrawEntryAnswer[]
}

export async function submitLuckyDrawEntry(input: SubmitInput) {
  const customer = await getAuthenticatedPortalCustomer()
  if (!customer) {
    return { ok: false as const, status: 401, error: 'Please sign in to join.' }
  }

  const admin = createServiceRoleClient()

  const { data: page, error: pageErr } = await admin
    .from('lucky_draw_pages')
    .select('id, user_id, status, title')
    .eq('id', input.pageId)
    .maybeSingle()

  if (pageErr) throw pageErr
  if (!page) {
    return { ok: false as const, status: 404, error: 'Lucky draw not found.' }
  }
  if (page.status !== 'active') {
    return { ok: false as const, status: 403, error: 'This lucky draw is not accepting entries.' }
  }

  if (customer.user_id !== page.user_id) {
    return {
      ok: false as const,
      status: 403,
      error: 'This PG account is not registered with this dealer.',
    }
  }

  const { data: existing } = await admin
    .from('lucky_draw_entries')
    .select('id, participated_at')
    .eq('page_id', page.id)
    .eq('customer_id', customer.id)
    .maybeSingle()

  if (existing) {
    return {
      ok: true as const,
      alreadyEntered: true,
      entry: existing,
      participated_at: existing.participated_at,
    }
  }

  const purposeTagIds = [...new Set(input.purposeTagIds.filter(Boolean))]
  if (purposeTagIds.length === 0) {
    return { ok: false as const, status: 400, error: 'Select at least one saving purpose.' }
  }

  if (!input.locationText.trim()) {
    return { ok: false as const, status: 400, error: 'Location is required.' }
  }

  const answers: LuckyDrawEntryAnswer[] = [
    {
      question_id: SYSTEM_QUESTION_PURPOSE,
      question_text: 'What is your purpose for saving gold right now?',
      question_type: 'purpose_tags',
      value: purposeTagIds,
    },
    {
      question_id: SYSTEM_QUESTION_LOCATION,
      question_text: 'What is your location?',
      question_type: 'location',
      value: {
        text: input.locationText.trim(),
        lat: input.locationLat,
        lng: input.locationLng,
      },
    },
    ...input.customAnswers,
  ]

  const participated_at = new Date().toISOString()

  const { data: entry, error: entryErr } = await admin
    .from('lucky_draw_entries')
    .insert({
      page_id: page.id,
      customer_id: customer.id,
      user_id: page.user_id,
      answers,
      purpose_tag_ids: purposeTagIds,
      location_text: input.locationText.trim(),
      location_lat: input.locationLat,
      location_lng: input.locationLng,
      participated_at,
    })
    .select('id, participated_at')
    .single()

  if (entryErr) {
    if (entryErr.code === '23505') {
      const { data: dup } = await admin
        .from('lucky_draw_entries')
        .select('id, participated_at')
        .eq('page_id', page.id)
        .eq('customer_id', customer.id)
        .maybeSingle()
      if (dup) {
        return {
          ok: true as const,
          alreadyEntered: true,
          entry: dup,
          participated_at: dup.participated_at,
        }
      }
    }
    throw entryErr
  }

  await admin
    .from('customers')
    .update({ location: input.locationText.trim() })
    .eq('id', customer.id)

  if (purposeTagIds.length > 0) {
    const { data: existingTags } = await admin
      .from('customer_tags')
      .select('tag_id')
      .eq('customer_id', customer.id)

    const have = new Set((existingTags ?? []).map((r) => r.tag_id as string))
    const toInsert = purposeTagIds
      .filter((tagId) => !have.has(tagId))
      .map((tag_id) => ({
        customer_id: customer.id,
        tag_id,
        user_id: page.user_id,
        source: 'lucky_draw' as const,
      }))

    if (toInsert.length > 0) {
      await admin.from('customer_tags').insert(toInsert)
    }
  }

  return {
    ok: true as const,
    alreadyEntered: false,
    entry,
    participated_at: entry.participated_at,
    page_title: page.title,
  }
}

export async function getLuckyDrawEntryStatus(pageId: string) {
  const customer = await getAuthenticatedPortalCustomer()
  if (!customer) {
    return { loggedIn: false as const, entered: false as const }
  }

  const admin = createServiceRoleClient()
  const { data: entry } = await admin
    .from('lucky_draw_entries')
    .select('id, participated_at')
    .eq('page_id', pageId)
    .eq('customer_id', customer.id)
    .maybeSingle()

  return {
    loggedIn: true as const,
    entered: !!entry,
    participated_at: entry?.participated_at ?? null,
    customer: {
      id: customer.id,
      name: customer.name,
    },
  }
}
