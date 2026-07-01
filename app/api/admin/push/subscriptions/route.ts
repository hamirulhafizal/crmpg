import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import {
  deleteAllSubscriptions,
  deleteSubscriptionById,
  deleteSubscriptionByEndpoint,
  getAllSubscriptions,
} from '@/app/lib/push/subscriptions'

const LOG = '[PG Push API]'

export async function GET(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const subscriptions = await getAllSubscriptions()
    return NextResponse.json({
      subscriptions: subscriptions.map((entry) => ({
        id: entry.id,
        endpoint: entry.subscription.endpoint,
        userAgent: entry.userAgent,
        deviceInfo: entry.deviceInfo,
        createdAt: entry.createdAt,
        lastSeenAt: entry.lastSeenAt,
      })),
      count: subscriptions.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load subscriptions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json().catch(() => ({}))
    const { all, id, endpoint } = body as { all?: boolean; id?: string; endpoint?: string }

    if (all) {
      const deleted = await deleteAllSubscriptions()
      console.log(`${LOG} Admin deleted all subscriptions`, { deleted })
      return NextResponse.json({
        success: true,
        deleted,
        message: deleted > 0 ? `Removed ${deleted} subscription(s) from database.` : 'No subscriptions to remove.',
      })
    }

    if (id) {
      const deleted = await deleteSubscriptionById(id)
      console.log(`${LOG} Admin deleted subscription by id`, { id, deleted })
      return NextResponse.json({
        success: deleted,
        deleted: deleted ? 1 : 0,
        message: deleted ? 'Subscription removed.' : 'Subscription not found.',
      })
    }

    if (endpoint) {
      const deleted = await deleteSubscriptionByEndpoint(endpoint)
      console.log(`${LOG} Admin deleted subscription by endpoint`, {
        endpoint: endpoint.slice(0, 60),
        deleted,
      })
      return NextResponse.json({
        success: deleted,
        deleted: deleted ? 1 : 0,
        message: deleted ? 'Subscription removed.' : 'Subscription not found.',
      })
    }

    return NextResponse.json(
      { error: 'Provide { all: true }, { id }, or { endpoint } to delete.' },
      { status: 400 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete subscriptions'
    console.error(`${LOG} Admin delete subscriptions error:`, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
