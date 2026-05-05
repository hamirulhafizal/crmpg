import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const { data: participants, error } = await admin
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
          id,
          package_id,
          status,
          current_period_start,
          current_period_end,
          pending_renewal_package_id,
          payment_provider,
          external_payment_id,
          payment_metadata,
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
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (usersResult.error) {
      return NextResponse.json({ error: usersResult.error.message }, { status: 500 })
    }
    const emailById = new Map((usersResult.data?.users || []).map((u) => [u.id, u.email || null]))

    const rows = (participants || []).map((p) => {
      const subRows = (p as { google_ads_subscriptions?: unknown }).google_ads_subscriptions
      const sub = Array.isArray(subRows) ? subRows[0] : subRows
      return {
        ...p,
        email: emailById.get(p.user_id) ?? null,
        subscription: sub ?? null,
      }
    })

    const participantIds = rows.map((r) => r.id)
    const hasPaidReceipt = new Set<string>()
    if (participantIds.length > 0) {
      const { data: paidRows } = await admin
        .from('google_ads_payments')
        .select('participant_id')
        .eq('status', 'paid')
        .in('participant_id', participantIds)
      for (const row of paidRows || []) {
        if (row.participant_id) hasPaidReceipt.add(row.participant_id)
      }
    }

    const withFlags = rows.map((r) => ({
      ...r,
      hasPaidReceipt: hasPaidReceipt.has(r.id),
    }))

    return NextResponse.json({ participants: withFlags })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load participants' }, { status: 500 })
  }
}

type PostBody = {
  user_id?: string
  notes?: string | null
  pg_code?: string | null
  public_username?: string | null
}

/**
 * Enroll a user in the campaign only (participant row). They choose pakej + pay on `/google-ads`.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: PostBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  try {
    const admin = createServiceRoleClient()

    const insertRow: {
      user_id: string
      notes: string | null
      pg_code?: string | null
      public_username?: string | null
    } = {
      user_id: userId,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : body.notes ?? null,
    }
    if (typeof body.pg_code === 'string') insertRow.pg_code = body.pg_code.trim() || null
    if (typeof body.public_username === 'string') insertRow.public_username = body.public_username.trim() || null

    const { data: participant, error: pError } = await admin
      .from('google_ads_participants')
      .insert(insertRow)
      .select('id, user_id, notes, lead_email, pg_code, public_username, created_at, updated_at')
      .single()

    if (pError || !participant) {
      return NextResponse.json({ error: pError?.message || 'Failed to create participant' }, { status: 400 })
    }

    return NextResponse.json({ participant, subscription: null })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create participant' }, { status: 500 })
  }
}
