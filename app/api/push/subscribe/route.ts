import { NextResponse } from 'next/server'
import { saveSubscription, deleteSubscription } from '@/app/lib/push/subscriptions'

const LOG = '[PG Push API]'

export async function POST(request: Request) {
  try {
    const { subscription, userAgent, deviceInfo } = await request.json()

    console.log(`${LOG} POST /api/push/subscribe`, {
      endpoint: subscription?.endpoint?.slice(0, 60),
      deviceInfo,
    })

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      console.error(`${LOG} Invalid subscription data`)
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
    }

    const id = await saveSubscription(subscription, userAgent || '', deviceInfo || {})
    console.log(`${LOG} Subscription saved`, { id })

    return NextResponse.json({
      success: true,
      message: 'Subscription saved successfully',
      id,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save subscription'
    console.error(`${LOG} Error saving push subscription:`, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { subscription } = await request.json()

    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'Subscription data required' }, { status: 400 })
    }

    const deleted = await deleteSubscription(subscription)

    return NextResponse.json({
      success: deleted,
      message: deleted ? 'Subscription deleted successfully' : 'Subscription not found',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete subscription'
    console.error('Error deleting push subscription:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
