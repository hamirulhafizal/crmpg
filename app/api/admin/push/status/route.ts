import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { getSubscriptionCount } from '@/app/lib/push/subscriptions'
import { getSiteBaseUrl } from '@/app/lib/push/site-url'

export async function GET(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidConfigured = Boolean(vapidPublicKey && vapidPrivateKey)

  let subscriberCount = 0
  let dbOk = true
  let dbError: string | undefined

  try {
    subscriberCount = await getSubscriptionCount()
  } catch (error) {
    dbOk = false
    dbError = error instanceof Error ? error.message : 'Database error'
    console.error('[Push Status] DB error:', error)
  }

  const status = {
    vapidConfigured,
    vapidPublicKeyPresent: Boolean(vapidPublicKey),
    vapidPrivateKeyPresent: Boolean(vapidPrivateKey),
    siteUrl: getSiteBaseUrl(),
    subscriberCount,
    dbOk,
    dbError,
  }

  console.log('[Push Status]', status)

  return NextResponse.json(status)
}
