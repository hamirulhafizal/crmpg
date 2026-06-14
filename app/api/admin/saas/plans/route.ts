import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { upsertPlanFeatures } from '@/app/lib/saas/plans'
import type { SaasFeatureKey } from '@/app/lib/saas/types'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const { data: plans, error } = await admin
      .from('saas_plans')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const planIds = (plans ?? []).map((p) => p.id)
    const { data: features } = planIds.length
      ? await admin.from('saas_plan_features').select('*').in('plan_id', planIds)
      : { data: [] }

    const { data: subCounts } = planIds.length
      ? await admin.from('saas_subscriptions').select('plan_id')
      : { data: [] }

    const countByPlan = new Map<string, number>()
    for (const row of subCounts ?? []) {
      const pid = (row as { plan_id: string }).plan_id
      countByPlan.set(pid, (countByPlan.get(pid) ?? 0) + 1)
    }

    const featuresByPlan = new Map<string, typeof features>()
    for (const f of features ?? []) {
      const pid = (f as { plan_id: string }).plan_id
      const list = featuresByPlan.get(pid) ?? []
      list.push(f)
      featuresByPlan.set(pid, list)
    }

    return NextResponse.json({
      plans: (plans ?? []).map((p) => ({
        ...p,
        features: featuresByPlan.get(p.id) ?? [],
        subscriber_count: countByPlan.get(p.id) ?? 0,
      })),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}

type PostBody = {
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

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: PostBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!slug || !/^[a-z0-9_-]+$/.test(slug)) {
    return NextResponse.json({ error: 'slug is required (lowercase letters, numbers, -, _)' }, { status: 400 })
  }
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const billing =
    body.billing_period === 'monthly' || body.billing_period === 'yearly' || body.billing_period === 'none'
      ? body.billing_period
      : 'monthly'

  const price =
    typeof body.price_amount === 'number' && Number.isFinite(body.price_amount) ? body.price_amount : NaN
  if (Number.isNaN(price) || price < 0) {
    return NextResponse.json({ error: 'price_amount must be a non-negative number' }, { status: 400 })
  }

  const trialDays =
    typeof body.trial_days === 'number' && Number.isFinite(body.trial_days) ? Math.max(0, Math.floor(body.trial_days)) : 0

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('saas_plans')
      .insert({
        slug,
        name,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        billing_period: billing,
        price_amount: price,
        currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'MYR',
        trial_days: trialDays,
        is_active: body.is_active !== false,
        sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
        marketing_details:
          body.marketing_details && typeof body.marketing_details === 'object' ? body.marketing_details : {},
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (body.features && typeof body.features === 'object') {
      await upsertPlanFeatures(data.id, body.features)
    }

    const { data: features } = await admin.from('saas_plan_features').select('*').eq('plan_id', data.id)

    return NextResponse.json({ plan: { ...data, features: features ?? [] } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create plan' }, { status: 500 })
  }
}
