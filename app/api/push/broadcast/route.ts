import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { buildDeclarativePushPayload } from '@/app/lib/push/payload'
import { sendToAllSubscriptions } from '@/app/lib/push/subscriptions'
import { ensureWebPushConfigured, getSiteBaseUrl } from '@/app/lib/push/vapid'

/** @deprecated Use POST /api/admin/push/broadcast */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const { title, message } = await request.json()

    if (!title || !message) {
      return NextResponse.json({ error: 'Title and message are required' }, { status: 400 })
    }

    const vapid = ensureWebPushConfigured()
    if (!vapid.ok) {
      return NextResponse.json({ error: vapid.error }, { status: 500 })
    }

    const payload = buildDeclarativePushPayload({
      title,
      body: message,
      navigateUrl: `${getSiteBaseUrl()}/dashboard`,
      tag: 'broadcast-notification',
    })

    const result = await sendToAllSubscriptions(payload)

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      total: result.total,
      errors: result.errors,
      pruned: result.pruned,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send broadcast notification'
    console.error('Error in broadcast route:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
