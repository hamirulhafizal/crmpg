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

    // Filter out subscriptions without valid endpoints and keys
    const validSubscriptions = subscriptions.filter(
      (subData) => 
        subData.subscription?.endpoint &&
        subData.subscription?.keys?.p256dh &&
        subData.subscription?.keys?.auth
    )

    if (validSubscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        total: subscriptions.length,
        message: 'No valid subscriptions found (missing endpoint or keys)',
      })
    }

    // Determine the base URL for navigation
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"
    const navigateUrl = `${baseUrl}/dashboard`

    // Prepare notification payload in Declarative Web Push format (RFC 8030)
    const payload = JSON.stringify({
      web_push: "8030", // Indicates RFC 8030 declarative format
      notification: {
        title,
        navigate_url: navigateUrl,
        body: message,
        icon: `${baseUrl}/icons/image.png`,
        badge: `${baseUrl}/icons/image.png`,
        tag: 'broadcast-notification',
        sound: 'default',
      },
    })

    // Send notification to all valid subscriptions
    const results = await Promise.allSettled(
      validSubscriptions.map((subData) => {
        // We've already validated that endpoint and keys exist
        // web-push library accepts PushSubscriptionJSON format
        const subscription = subData.subscription
        return webpush.sendNotification(subscription as any, payload).catch((error) => {
          // Return error info instead of throwing
          return {
            error: error.message,
            statusCode: error.statusCode,
            endpoint: subscription.endpoint,
          }
        })
      })
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
        // For rejected promises, check if we returned an error object from catch
        // Otherwise use the rejection reason
        const errorMsg =
          result.reason && typeof result.reason === 'object' && 'error' in result.reason
            ? (result.reason as { error: string }).error
            : result.reason?.message || String(result.reason) || 'Unknown error'
        errors.push(`Subscription ${index + 1}: ${errorMsg}`)
      }
    })

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: validSubscriptions.length,
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

