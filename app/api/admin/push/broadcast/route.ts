import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { buildDeclarativePushPayload } from '@/app/lib/push/payload'
import { getSubscriptionCount, sendToAllSubscriptions } from '@/app/lib/push/subscriptions'
import { ensureWebPushConfigured, getSiteBaseUrl } from '@/app/lib/push/vapid'

export async function POST(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const title = String(body.title ?? '').trim()
    const message = String(body.message ?? body.body ?? '').trim()
    const navigateUrlRaw = String(body.navigateUrl ?? body.navigate_url ?? '').trim()
    const imageUrl = String(body.imageUrl ?? body.image_url ?? '').trim()

    if (!title || !message) {
      return NextResponse.json({ error: 'Title and message are required' }, { status: 400 })
    }

    const vapid = ensureWebPushConfigured()
    if (!vapid.ok) {
      return NextResponse.json({ error: vapid.error, code: 'VAPID_NOT_CONFIGURED' }, { status: 500 })
    }

    const baseUrl = getSiteBaseUrl()
    const navigateUrl = navigateUrlRaw
      ? navigateUrlRaw.startsWith('http')
        ? navigateUrlRaw
        : `${baseUrl}${navigateUrlRaw.startsWith('/') ? '' : '/'}${navigateUrlRaw}`
      : `${baseUrl}/dashboard`

    const payload = buildDeclarativePushPayload({
      title,
      body: message,
      navigateUrl,
      imageUrl: imageUrl || undefined,
      tag: 'admin-broadcast',
    })

    const result = await sendToAllSubscriptions(payload)

    return NextResponse.json({
      success: true,
      format: 'declarative-web-push',
      webPush: 8030,
      ...result,
      message:
        result.total === 0
          ? 'No active subscriptions found'
          : `Sent to ${result.sent} of ${result.total} device(s)`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send broadcast notification'
    console.error('Error in admin push broadcast:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const count = await getSubscriptionCount()
    return NextResponse.json({ count })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load subscription count'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
