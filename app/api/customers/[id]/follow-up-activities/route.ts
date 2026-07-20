import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUserApi } from '@/app/lib/auth/require-user'
import {
  DEFAULT_MAX_TOUCHES_PER_WEEK,
  FOLLOW_UP_CHANNELS,
  FOLLOW_UP_OUTCOMES,
  FOLLOW_UP_TOPIC_KEYS,
  getTopicCooldownDays,
  type FollowUpChannel,
} from '@/app/lib/customer-follow-up-activities'

async function assertCustomerOwned(supabase: SupabaseClient, userId: string, customerId: string) {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return false
  return true
}

/** GET — list activities + quota summary */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user, supabase } = auth

    const { id: customerId } = await context.params
    const ok = await assertCustomerOwned(supabase, user.id, customerId)
    if (!ok) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: rows, error: listErr } = await supabase
      .from('customer_follow_up_activities')
      .select('*')
      .eq('customer_id', customerId)
      .order('occurred_at', { ascending: false })
      .limit(200)

    if (listErr) {
      console.error(listErr)
      return NextResponse.json({ error: listErr.message }, { status: 500 })
    }

    const { count: touchCount, error: countErr } = await supabase
      .from('customer_follow_up_activities')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('counts_toward_quota', true)
      .gte('occurred_at', since)

    if (countErr) {
      console.error(countErr)
      return NextResponse.json({ error: countErr.message }, { status: 500 })
    }

    return NextResponse.json({
      data: rows ?? [],
      limits: {
        touchesLast7Days: touchCount ?? 0,
        maxTouchesPerWeek: DEFAULT_MAX_TOUCHES_PER_WEEK,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** POST — append activity (quota + topic cooldown) */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user, supabase } = auth

    const { id: customerId } = await context.params
    const ok = await assertCustomerOwned(supabase, user.id, customerId)
    if (!ok) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
    const channel = body.channel as string
    const outcome =
      body.outcome === undefined || body.outcome === null || body.outcome === ''
        ? null
        : String(body.outcome).trim()
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
    const occurredAtRaw = body.occurred_at
    const occurredAt =
      typeof occurredAtRaw === 'string' && occurredAtRaw.trim()
        ? new Date(occurredAtRaw).toISOString()
        : new Date().toISOString()
    if (Number.isNaN(Date.parse(occurredAt))) {
      return NextResponse.json({ error: 'Invalid occurred_at' }, { status: 400 })
    }

    const countsTowardQuota = body.counts_toward_quota !== false
    const idempotencyKey =
      typeof body.idempotency_key === 'string' && body.idempotency_key.trim().length > 0
        ? body.idempotency_key.trim().slice(0, 200)
        : null

    const metadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {}

    if (!FOLLOW_UP_TOPIC_KEYS.has(topic)) {
      return NextResponse.json({ error: 'Invalid topic' }, { status: 400 })
    }
    if (!FOLLOW_UP_CHANNELS.includes(channel as FollowUpChannel)) {
      return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
    }
    if (outcome && !FOLLOW_UP_OUTCOMES.includes(outcome as (typeof FOLLOW_UP_OUTCOMES)[number])) {
      return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 })
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    if (countsTowardQuota) {
      const { count, error: cErr } = await supabase
        .from('customer_follow_up_activities')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', customerId)
        .eq('counts_toward_quota', true)
        .gte('occurred_at', since)
      if (cErr) {
        console.error(cErr)
        return NextResponse.json({ error: cErr.message }, { status: 500 })
      }
      if ((count ?? 0) >= DEFAULT_MAX_TOUCHES_PER_WEEK) {
        return NextResponse.json(
          {
            error: `Quota mingguan: maksimum ${DEFAULT_MAX_TOUCHES_PER_WEEK} sentuhan (7 hari) untuk pelanggan ini. Nyahaktifkan "Kira dalam quota" jika ini log dalaman.`,
          },
          { status: 409 }
        )
      }
    }

    const cooldownDays = getTopicCooldownDays(topic)
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000
    const { data: lastSame, error: lastErr } = await supabase
      .from('customer_follow_up_activities')
      .select('occurred_at')
      .eq('customer_id', customerId)
      .eq('topic', topic)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastErr) {
      console.error(lastErr)
      return NextResponse.json({ error: lastErr.message }, { status: 500 })
    }
    if (lastSame?.occurred_at) {
      const lastMs = new Date(lastSame.occurred_at).getTime()
      const newMs = new Date(occurredAt).getTime()
      if (Number.isFinite(lastMs) && Number.isFinite(newMs) && newMs - lastMs < cooldownMs) {
        const next = new Date(lastMs + cooldownMs)
        return NextResponse.json(
          {
            error: `Topik ini terlalu rapat dengan log lepas (cooldown ${cooldownDays} hari). Log seterusnya selepas ${next.toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })} atau pilih topik lain.`,
          },
          { status: 409 }
        )
      }
    }

    const insert = {
      customer_id: customerId,
      created_by: user.id,
      topic,
      channel,
      outcome,
      notes: notes || null,
      occurred_at: occurredAt,
      counts_toward_quota: countsTowardQuota,
      idempotency_key: idempotencyKey,
      metadata,
    }

    const { data: inserted, error: insErr } = await supabase
      .from('customer_follow_up_activities')
      .insert(insert)
      .select('*')
      .single()

    if (insErr) {
      if (insErr.code === '23505') {
        return NextResponse.json({ error: 'Rekod duplikat (idempotency key).' }, { status: 409 })
      }
      console.error(insErr)
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    const { count: touchCount } = await supabase
      .from('customer_follow_up_activities')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('counts_toward_quota', true)
      .gte('occurred_at', since)

    return NextResponse.json({
      data: inserted,
      limits: {
        touchesLast7Days: touchCount ?? 0,
        maxTouchesPerWeek: DEFAULT_MAX_TOUCHES_PER_WEEK,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
