import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { upsertPlanFeatures } from '@/app/lib/saas/plans'
import type { SaasFeatureKey } from '@/app/lib/saas/types'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type RouteParams = { params: Promise<{ id: string }> }

type PatchBody = {
  slug?: string
  name?: string
  description?: string | null
  billing_period?: 'monthly' | 'yearly' | 'none'
  price_amount?: number
  currency?: string
  trial_days?: number
  is_active?: boolean
  sort_order?: number
  marketing_details?: Record<string, unknown>
  features?: Partial<Record<SaasFeatureKey, string>>
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

  const updates: Record<string, unknown> = {}
  if (typeof body.slug === 'string') {
    const slug = body.slug.trim().toLowerCase()
    if (!slug || !/^[a-z0-9_-]+$/.test(slug)) {
      return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
    }
    updates.slug = slug
  }
  if (typeof body.name === 'string') updates.name = body.name.trim()
  if (typeof body.description === 'string') updates.description = body.description.trim() || null
  if (body.billing_period === 'monthly' || body.billing_period === 'yearly' || body.billing_period === 'none') {
    updates.billing_period = body.billing_period
  }
  if (typeof body.price_amount === 'number' && Number.isFinite(body.price_amount) && body.price_amount >= 0) {
    updates.price_amount = body.price_amount
  }
  if (typeof body.currency === 'string') updates.currency = body.currency.trim() || 'MYR'
  if (typeof body.trial_days === 'number' && Number.isFinite(body.trial_days)) {
    updates.trial_days = Math.max(0, Math.floor(body.trial_days))
  }
  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
  if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order
  if (body.marketing_details && typeof body.marketing_details === 'object') {
    updates.marketing_details = body.marketing_details
  }

  if (Object.keys(updates).length === 0 && !body.features) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()

    if (Object.keys(updates).length > 0) {
      const { data, error } = await admin.from('saas_plans').update(updates).eq('id', id).select('*').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      if (!data) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    if (body.features && typeof body.features === 'object') {
      await upsertPlanFeatures(id, body.features)
    }

    const { data: plan } = await admin.from('saas_plans').select('*').eq('id', id).maybeSingle()
    const { data: features } = await admin.from('saas_plan_features').select('*').eq('plan_id', id)

    return NextResponse.json({ plan: plan ? { ...plan, features: features ?? [] } : null })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to update plan' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await props.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const admin = createServiceRoleClient()

    const { data: plan } = await admin.from('saas_plans').select('slug').eq('id', id).maybeSingle()
    if (plan?.slug === 'free' || plan?.slug === 'pro') {
      return NextResponse.json({ error: 'Core plans (free/pro) cannot be deleted; deactivate instead.' }, { status: 409 })
    }

    const { count, error: countError } = await admin
      .from('saas_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('plan_id', id)

    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: 'Plan has subscribers; deactivate it instead of deleting.' },
        { status: 409 }
      )
    }

    const { error } = await admin.from('saas_plans').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 })
  }
}
