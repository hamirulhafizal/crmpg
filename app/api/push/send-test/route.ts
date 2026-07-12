import { NextResponse } from 'next/server'
import { buildDeclarativePushPayload } from '@/app/lib/push/payload'
import { parseWebPushSubscription, saveSubscription, type WebPushSubscription } from '@/app/lib/push/subscriptions'
import { ensureWebPushConfigured, getSiteBaseUrl, webpush } from '@/app/lib/push/vapid'

export const maxDuration = 300

const LOG = '[PG Push API]'

async function sendPushNotification(subscription: WebPushSubscription, payload: string) {
  console.log(`${LOG} sendNotification → endpoint: ${subscription.endpoint.slice(0, 60)}…`)
  console.log(`${LOG} payload preview:`, payload.slice(0, 200))
  await webpush.sendNotification(subscription, payload)
}

export async function POST(request: Request) {
  const debugSteps: string[] = []

  try {
    debugSteps.push('1. Received POST /api/push/send-test')
    const body = await request.json()
    const { subscription, title, message, delay = 0, navigateUrl, imageUrl } = body

    if (!subscription || !subscription.endpoint) {
      console.error(`${LOG} Missing subscription endpoint`)
      return NextResponse.json(
        { error: 'Push subscription is required', debug: debugSteps },
        { status: 400 }
      )
    }

    const webPushSubscription = parseWebPushSubscription(subscription as PushSubscriptionJSON)

    debugSteps.push(`2. Subscription endpoint: ${webPushSubscription.endpoint.slice(0, 60)}…`)

    const vapid = ensureWebPushConfigured()
    if (!vapid.ok) {
      console.error(`${LOG} VAPID not configured:`, vapid.error)
      debugSteps.push(`3. FAIL — ${vapid.error}`)
      return NextResponse.json(
        { error: vapid.error, code: 'VAPID_NOT_CONFIGURED', debug: debugSteps },
        { status: 500 }
      )
    }
    debugSteps.push('3. VAPID keys configured on server')

    const userAgent = request.headers.get('user-agent') || ''
    debugSteps.push('4. Saving/updating subscription in database…')
    await saveSubscription(subscription as PushSubscriptionJSON, userAgent, {})
    debugSteps.push('5. Subscription saved')

    const navigateTarget = navigateUrl?.trim() || '/dashboard'
    const navigateFull = navigateTarget.startsWith('http')
      ? navigateTarget
      : `${getSiteBaseUrl()}${navigateTarget.startsWith('/') ? '' : '/'}${navigateTarget}`

    const payload = buildDeclarativePushPayload({
      title: title || 'Test Notification',
      body: message || 'This is a test notification',
      navigateUrl: navigateFull,
      imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() || undefined : undefined,
      tag: 'test-notification',
    })
    debugSteps.push(`6. Payload built (declarative, navigate=${navigateFull})`)

    const maxDelay = 300 * 1000
    const delayMs = typeof delay === 'number' ? delay : 0

    if (delayMs > maxDelay) {
      return NextResponse.json(
        { error: `Delay cannot exceed ${maxDelay / 1000} seconds (5 minutes)`, debug: debugSteps },
        { status: 400 }
      )
    }

    const delaySeconds = delayMs > 0 ? Math.floor(delayMs / 1000) : 0
    console.log(`${LOG} Request: delay=${delaySeconds}s, title="${title}", endpoint=${webPushSubscription.endpoint.slice(0, 48)}…`)

    if (delayMs > 0) {
      debugSteps.push(`7. Waiting ${delaySeconds}s before send (server-side, Rms-style)…`)
      console.log(`${LOG} Waiting ${delaySeconds}s before sending…`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      console.log(`${LOG} Delay complete — sending push now`)
    }

    debugSteps.push(delayMs > 0 ? '8. Sending delayed push…' : '7. Sending push immediately…')
    await sendPushNotification(webPushSubscription, payload)
    debugSteps.push('Push sent successfully')
    console.log(`${LOG} Push notification sent successfully`)

    return NextResponse.json({
      success: true,
      scheduled: false,
      message:
        delayMs > 0
          ? `Push notification sent after ${delaySeconds} second(s) delay`
          : 'Push notification sent',
      sentAt: new Date().toISOString(),
      delay: delayMs,
      delaySeconds,
      format: 'declarative',
      debug: debugSteps,
    })
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string; statusCode?: number; endpoint?: string; body?: string }
    console.error(`${LOG} Error sending push notification:`, error)
    console.error(`${LOG} Error details:`, {
      name: err.name,
      message: err.message,
      statusCode: err.statusCode,
      endpoint: err.endpoint,
      body: err.body,
    })
    debugSteps.push(`FAIL — ${err.message || 'Unknown error'} (status ${err.statusCode ?? 'n/a'})`)

    if (err.statusCode === 410) {
      return NextResponse.json(
        {
          error: 'Push subscription has expired. Please resubscribe.',
          code: 'EXPIRED_SUBSCRIPTION',
          debug: debugSteps,
        },
        { status: 410 }
      )
    }

    if (err.statusCode === 403 || err.statusCode === 401) {
      return NextResponse.json(
        {
          error:
            'VAPID key mismatch. The subscription was created with different VAPID keys. Please unsubscribe and resubscribe with the current keys.',
          code: 'VAPID_MISMATCH',
          details:
            'This usually happens when VAPID keys were changed after creating the subscription.',
          debug: debugSteps,
        },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        error: err.message || 'Failed to send push notification',
        code: 'UNKNOWN_ERROR',
        statusCode: err.statusCode,
        details: err.body || 'Check server logs for more details',
        debug: debugSteps,
      },
      { status: 500 }
    )
  }
}
