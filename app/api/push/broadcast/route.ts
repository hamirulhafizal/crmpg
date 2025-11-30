import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { getAllSubscriptions } from '@/app/lib/push-subscriptions'

// Initialize web-push with VAPID keys from environment variables
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:hamirul.dev@gmail.com'

if (publicKey && privateKey) {
  webpush.setVapidDetails(vapidSubject, publicKey, privateKey)
}

export async function POST(request: Request) {
  try {
    const { title, message } = await request.json()

    if (!title || !message) {
      return NextResponse.json(
        { error: 'Title and message are required' },
        { status: 400 }
      )
    }

    if (!publicKey || !privateKey) {
      return NextResponse.json(
        {
          error: 'VAPID keys not configured',
          details: 'Please set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your environment variables.',
        },
        { status: 500 }
      )
    }

    // Get all subscriptions
    const subscriptions = getAllSubscriptions()

    if (subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        total: 0,
        message: 'No active subscriptions found',
      })
    }

    // Prepare notification payload
    const payload = JSON.stringify({
      title,
      body: message,
      icon: '/icons/image.png',
      badge: '/icons/image.png',
      tag: 'broadcast-notification',
      data: {
        url: '/dashboard',
        timestamp: Date.now(),
      },
    })

    // Send notification to all subscriptions
    const results = await Promise.allSettled(
      subscriptions.map((subData) =>
        webpush.sendNotification(subData.subscription, payload).catch((error) => {
          // Return error info instead of throwing
          return {
            error: error.message,
            statusCode: error.statusCode,
            endpoint: subData.subscription.endpoint,
          }
        })
      )
    )

    // Count successes and failures
    let sent = 0
    let failed = 0
    const errors: string[] = []

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sent++
      } else {
        failed++
        const errorMsg =
          typeof result.value === 'object' && result.value?.error
            ? result.value.error
            : result.reason?.message || 'Unknown error'
        errors.push(`Subscription ${index + 1}: ${errorMsg}`)
      }
    })

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: subscriptions.length,
      errors: errors.slice(0, 10), // Limit errors to first 10
    })
  } catch (error: any) {
    console.error('Error in broadcast route:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to send broadcast notification',
      },
      { status: 500 }
    )
  }
}

