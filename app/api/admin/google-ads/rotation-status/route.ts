import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { loadActiveGoogleAdsDealers } from '@/app/lib/google-ads/active-dealers-for-leads'
import { buildLeadRotationSnapshot } from '@/app/lib/google-ads/lead-rotation'
import { activePoolHasManualQueueOrder } from '@/app/lib/google-ads/rotation-queue-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

/** Admin: live GAP lead rotation queue for all paid-active participants. */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const [{ dealers }, hasManualQueueOrder] = await Promise.all([
      loadActiveGoogleAdsDealers(admin),
      activePoolHasManualQueueOrder(admin),
    ])
    const snapshot = buildLeadRotationSnapshot(dealers, null)

    const queue = snapshot.queue.map((row) => {
      const dealer = dealers.find((d) => d.participant_id === row.participant_id)
      return {
        ...row,
        email: dealer?.email ?? null,
        queue_sort_at: dealer?.queue_sort_at ?? null,
      }
    })

    return NextResponse.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      hasManualQueueOrder,
      ...snapshot,
      queue,
    })
  } catch (e) {
    console.error('[admin/google-ads/rotation-status]', e)
    return NextResponse.json({ error: 'Failed to load rotation status' }, { status: 500 })
  }
}
