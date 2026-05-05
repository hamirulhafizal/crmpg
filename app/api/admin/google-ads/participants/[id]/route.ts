import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type RouteParams = { params: Promise<{ id: string }> }

type SubscriptionPatch = {
  package_id?: string
  status?: 'active' | 'expired' | 'cancelled' | 'pending_payment'
  current_period_start?: string | null
  current_period_end?: string | null
  pending_renewal_package_id?: string | null
  external_payment_id?: string | null
  payment_metadata?: Record<string, unknown>
}

type PatchBody = {
  notes?: string | null
  pg_code?: string | null
  public_username?: string | null
  subscription?: SubscriptionPatch
}

export async function PATCH(request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await props.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()

    if (typeof body.notes === 'string' || body.notes === null) {
      const { error } = await admin
        .from('google_ads_participants')
        .update({ notes: typeof body.notes === 'string' ? body.notes.trim() || null : null })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (body.pg_code !== undefined || body.public_username !== undefined) {
      const row: { pg_code?: string | null; public_username?: string | null } = {}
      if (body.pg_code !== undefined) {
        row.pg_code = typeof body.pg_code === 'string' ? body.pg_code.trim() || null : null
      }
      if (body.public_username !== undefined) {
        row.public_username = typeof body.public_username === 'string' ? body.public_username.trim() || null : null
      }
      if (Object.keys(row).length > 0) {
        const { error } = await admin.from('google_ads_participants').update(row).eq('id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    if (body.subscription && typeof body.subscription === 'object') {
      const sub = body.subscription
      const updates: Record<string, unknown> = {}

      if (typeof sub.package_id === 'string' && sub.package_id.trim()) updates.package_id = sub.package_id.trim()
      if (
        sub.status === 'active' ||
        sub.status === 'expired' ||
        sub.status === 'cancelled' ||
        sub.status === 'pending_payment'
      ) {
        updates.status = sub.status
      }
      if (sub.current_period_start !== undefined) updates.current_period_start = sub.current_period_start
      if (sub.current_period_end !== undefined) updates.current_period_end = sub.current_period_end
      if (sub.pending_renewal_package_id !== undefined) {
        updates.pending_renewal_package_id = sub.pending_renewal_package_id
      }
      if (sub.external_payment_id !== undefined) updates.external_payment_id = sub.external_payment_id
      if (sub.payment_metadata && typeof sub.payment_metadata === 'object') {
        const { data: existing } = await admin
          .from('google_ads_subscriptions')
          .select('payment_metadata')
          .eq('participant_id', id)
          .maybeSingle()
        const prev = (existing?.payment_metadata as Record<string, unknown>) || {}
        updates.payment_metadata = { ...prev, ...sub.payment_metadata }
      }

      if (Object.keys(updates).length > 0) {
        const { error: subErr } = await admin
          .from('google_ads_subscriptions')
          .update(updates)
          .eq('participant_id', id)
        if (subErr) return NextResponse.json({ error: subErr.message }, { status: 400 })
      }
    }

    const { data: participant, error: loadErr } = await admin
      .from('google_ads_participants')
      .select(
        `
        id,
        user_id,
        notes,
        lead_email,
        pg_code,
        public_username,
        created_at,
        updated_at,
        google_ads_subscriptions (
          *,
          package:google_ads_packages!package_id (
            id,
            name,
            billing_period,
            price_amount,
            currency,
            is_active
          )
        )
      `
      )
      .eq('id', id)
      .maybeSingle()

    if (loadErr || !participant) {
      return NextResponse.json({ error: loadErr?.message || 'Not found' }, { status: 404 })
    }

    const subRows = (participant as { google_ads_subscriptions?: unknown }).google_ads_subscriptions
    const subscription = Array.isArray(subRows) ? subRows[0] : subRows

    return NextResponse.json({
      participant: {
        id: participant.id,
        user_id: participant.user_id,
        notes: participant.notes,
        lead_email: (participant as { lead_email?: boolean }).lead_email,
        pg_code: (participant as { pg_code?: string | null }).pg_code,
        public_username: (participant as { public_username?: string | null }).public_username,
        created_at: participant.created_at,
        updated_at: participant.updated_at,
        subscription: subscription ?? null,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update participant' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await props.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const admin = createServiceRoleClient()
    const { error } = await admin.from('google_ads_participants').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete participant' }, { status: 500 })
  }
}
