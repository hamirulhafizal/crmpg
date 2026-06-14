import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { assignSaasPlanToUser } from '@/app/lib/saas/plans'
import type { SaasSubscriptionStatus } from '@/app/lib/saas/types'

type Body = {
  user_id?: string
  plan_id?: string
  status?: SaasSubscriptionStatus
  locked_price_amount?: number
  trial_days_override?: number | null
  period_days?: number
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  const planId = typeof body.plan_id === 'string' ? body.plan_id.trim() : ''
  if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  if (!planId) return NextResponse.json({ error: 'plan_id is required' }, { status: 400 })

  const status = body.status
  if (
    status &&
    status !== 'trialing' &&
    status !== 'active' &&
    status !== 'expired' &&
    status !== 'cancelled'
  ) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  try {
    await assignSaasPlanToUser({
      userId,
      planId,
      adminUserId: auth.user.id,
      status,
      lockedPriceAmount: body.locked_price_amount,
      trialDaysOverride: body.trial_days_override,
      periodDays: body.period_days,
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to assign plan' }, { status: 500 })
  }
}
