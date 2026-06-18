import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import {
  applyWaitingQueueOrder,
  resetRotationQueueToPaymentOrder,
} from '@/app/lib/google-ads/rotation-queue-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type PatchBody = {
  waitingParticipantIds?: string[]
  resetToPaymentOrder?: boolean
}

/** Admin: reorder waiting participants or reset to payment-date order. */
export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()

    if (body.resetToPaymentOrder === true) {
      const result = await resetRotationQueueToPaymentOrder(admin, auth.user.id)
      return NextResponse.json({ ok: true, ...result })
    }

    if (!Array.isArray(body.waitingParticipantIds) || body.waitingParticipantIds.length === 0) {
      return NextResponse.json(
        { error: 'Provide waitingParticipantIds or resetToPaymentOrder: true' },
        { status: 400 }
      )
    }

    const ids = body.waitingParticipantIds.filter((id) => typeof id === 'string' && id.trim())
    const result = await applyWaitingQueueOrder(admin, ids, auth.user.id)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[admin/google-ads/rotation-queue]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update rotation queue' },
      { status: 400 }
    )
  }
}
