import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function GET(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const planId = url.searchParams.get('plan_id')?.trim()
  const status = url.searchParams.get('status')?.trim()
  const q = url.searchParams.get('q')?.trim().toLowerCase()

  try {
    const admin = createServiceRoleClient()
    let query = admin
      .from('saas_subscriptions')
      .select(
        `
        *,
        plan:saas_plans (*),
        profile:profiles!user_id (id, full_name, role)
      `
      )
      .order('updated_at', { ascending: false })
      .limit(200)

    if (planId) query = query.eq('plan_id', planId)
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let rows = data ?? []
    if (q) {
      rows = rows.filter((row) => {
        const profile = row.profile as { full_name?: string | null; id?: string } | null
        const name = (profile?.full_name ?? '').toLowerCase()
        const uid = (profile?.id ?? row.user_id ?? '').toLowerCase()
        return name.includes(q) || uid.includes(q)
      })
    }

    return NextResponse.json({ subscriptions: rows })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load subscriptions' }, { status: 500 })
  }
}
