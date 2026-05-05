import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('google_ads_packages')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ packages: data || [] })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load packages' }, { status: 500 })
  }
}

type PostBody = {
  name?: string
  billing_period?: 'monthly' | 'yearly'
  price_amount?: number
  currency?: string
  is_active?: boolean
  sort_order?: number
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

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (body.billing_period !== 'monthly' && body.billing_period !== 'yearly') {
    return NextResponse.json({ error: 'billing_period must be monthly or yearly' }, { status: 400 })
  }
  const price =
    typeof body.price_amount === 'number' && Number.isFinite(body.price_amount) ? body.price_amount : NaN
  if (Number.isNaN(price) || price < 0) {
    return NextResponse.json({ error: 'price_amount must be a non-negative number' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('google_ads_packages')
      .insert({
        name,
        billing_period: body.billing_period,
        price_amount: price,
        currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'MYR',
        is_active: body.is_active !== false,
        sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ package: data })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create package' }, { status: 500 })
  }
}
