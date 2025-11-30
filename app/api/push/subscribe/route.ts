import { NextResponse } from 'next/server'
import {
  saveSubscription,
  deleteSubscription,
} from '@/app/lib/push-subscriptions'

export async function POST(request: Request) {
  try {
    const { subscription, userAgent, deviceInfo } = await request.json()

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'Invalid subscription data' },
        { status: 400 }
      )
    }

    // Save subscription
    const key = saveSubscription(subscription, userAgent || '', deviceInfo || {})

    return NextResponse.json({
      success: true,
      message: 'Subscription saved successfully',
      key,
    })
  } catch (error: any) {
    console.error('Error saving subscription:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save subscription' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { subscription } = await request.json()

    if (!subscription) {
      return NextResponse.json(
        { error: 'Subscription data required' },
        { status: 400 }
      )
    }

    const deleted = deleteSubscription(subscription)

    return NextResponse.json({
      success: deleted,
      message: deleted
        ? 'Subscription deleted successfully'
        : 'Subscription not found',
    })
  } catch (error: any) {
    console.error('Error deleting subscription:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete subscription' },
      { status: 500 }
    )
  }
}

