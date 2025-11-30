import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { saveSubscription } from '@/app/lib/push-subscriptions'

// Initialize web-push with VAPID keys from environment variables
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:hamirul.dev@gmail.com'

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { subscription, title, message, delay = 0 } = body

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'Push subscription is required' },
        { status: 400 }
      )
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      return NextResponse.json(
        {
          error: 'VAPID keys not configured. Please set VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY in your environment variables.',
          code: 'VAPID_NOT_CONFIGURED',
        },
        { status: 500 }
      )
    }

    // Save subscription if it doesn't exist
    const userAgent = request.headers.get('user-agent') || ''
    saveSubscription(subscription, userAgent, {})

    // Determine the base URL for navigation
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'
    const navigateUrl = `${baseUrl}/dashboard`

    // Use Declarative Web Push format (RFC 8030) for Safari 18.4+ / iOS 18.4+
    // Reference: https://github.com/WebKit/explainers/tree/main/DeclarativeWebPush
    // Format: { "web_push": "8030", "notification": { "title": "...", "navigate_url": "...", "body": "...", etc. } }
    //
    // For browsers that support declarative web push, the OS handles the notification automatically
    // For other browsers, the service worker will handle it (fallback)
    const declarativePayload = {
      web_push: '8030',
      notification: {
        title: title || 'Test Notification',
        navigate_url: navigateUrl,
        body: message || 'This is a test notification',
        tag: 'test-notification',
        sound: 'default',
        icon: `${baseUrl}/icons/image.png`,
        badge: `${baseUrl}/icons/image.png`,
      },
    }

    // Stringify the payload - web-push library will send this as the message body
    const payload = JSON.stringify(declarativePayload)

    // Handle delay on SERVER SIDE so it works even when PWA is closed
    // This is critical: client-side delays won't work if the app is closed
    const maxDelay = 300 * 1000 // 5 minutes in milliseconds
    const delayMs = typeof delay === 'number' ? delay : 0

    if (delayMs > maxDelay) {
      return NextResponse.json(
        { error: `Delay cannot exceed ${maxDelay / 1000} seconds (5 minutes)` },
        { status: 400 }
      )
    }

    const delaySeconds = delayMs > 0 ? Math.floor(delayMs / 1000) : 0

    // Log for debugging
    console.log(`[Push API] Received request: delay=${delaySeconds}s, title="${title}", message="${message}"`)

    // Wait for delay if specified (server-side delay ensures it works even if app is closed)
    if (delayMs > 0) {
      console.log(`[Push API] Waiting ${delaySeconds} second(s) before sending...`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      console.log(`[Push API] Delay complete, sending notification now...`)
    }

    // Send the push notification
    console.log(`[Push API] Sending push notification to subscription endpoint...`)
    await webpush.sendNotification(subscription, payload)
    console.log(`[Push API] Push notification sent successfully`)

    return NextResponse.json({
      success: true,
      message:
        delayMs > 0
          ? `Push notification sent after ${delaySeconds} second(s) delay`
          : 'Push notification sent',
      sentAt: new Date().toISOString(),
      delay: delayMs,
      format: 'declarative',
    })
  } catch (error: any) {
    console.error('[Push API] Error sending push notification:', error)
    console.error('[Push API] Error details:', {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      endpoint: error.endpoint,
      body: error.body,
    })

    // Handle specific web-push errors
    if (error.statusCode === 410) {
      return NextResponse.json(
        {
          error: 'Push subscription has expired. Please resubscribe.',
          code: 'EXPIRED_SUBSCRIPTION',
        },
        { status: 410 }
      )
    }

    // Handle VAPID key mismatch (403 error)
    if (error.statusCode === 403 || error.statusCode === 401) {
      return NextResponse.json(
        {
          error:
            'VAPID key mismatch. The subscription was created with different VAPID keys. Please unsubscribe and resubscribe with the current keys.',
          code: 'VAPID_MISMATCH',
          details:
            'This usually happens when VAPID keys were changed after creating the subscription. You need to unsubscribe and create a new subscription with the current keys.',
        },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        error: error.message || 'Failed to send push notification',
        code: 'UNKNOWN_ERROR',
        statusCode: error.statusCode,
        details: error.body || 'Check server logs for more details',
      },
      { status: 500 }
    )
  }
}

