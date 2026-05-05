import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type RouteParams = { params: Promise<{ id: string }> }

type PatchBody = {
  name?: string
  billing_period?: 'monthly' | 'yearly'
  price_amount?: number
  currency?: string
  is_active?: boolean
  sort_order?: number
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
  if (typeof body.name === 'string') updates.name = body.name.trim()
  if (body.billing_period === 'monthly' || body.billing_period === 'yearly') {
    updates.billing_period = body.billing_period
  }
  if (typeof body.price_amount === 'number' && Number.isFinite(body.price_amount) && body.price_amount >= 0) {
    updates.price_amount = body.price_amount
  }
  if (typeof body.currency === 'string') updates.currency = body.currency.trim() || 'MYR'
  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
  if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('google_ads_packages')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ package: data })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update package' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await props.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const admin = createServiceRoleClient()
    const { count, error: countError } = await admin
      .from('google_ads_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('package_id', id)

    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: 'Package is in use; deactivate it instead of deleting.' },
        { status: 409 }
      )
    }

    const { error } = await admin.from('google_ads_packages').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete package' }, { status: 500 })
  }
}
