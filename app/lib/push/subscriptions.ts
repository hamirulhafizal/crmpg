import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export type DeviceInfo = {
  isIOS?: boolean
  isStandalone?: boolean
  userAgent?: string
  displayMode?: string
  pushMethod?: 'window.pushManager' | 'serviceWorker.pushManager'
  supportsDeclarativeWebPush?: boolean
}

type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  device_info: DeviceInfo
  created_at: string
  updated_at: string
  last_seen_at: string
}

function subscriptionFromRow(row: PushSubscriptionRow): PushSubscriptionJSON {
  return {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  }
}

/** Narrow PushSubscriptionJSON for web-push (requires endpoint + keys). */
export type WebPushSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export function parseWebPushSubscription(subscription: PushSubscriptionJSON): WebPushSubscription {
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error('Invalid push subscription')
  }
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  }
}

export async function saveSubscription(
  subscription: PushSubscriptionJSON,
  userAgent: string,
  deviceInfo: DeviceInfo
): Promise<string> {
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error('Invalid push subscription')
  }

  const admin = createServiceRoleClient()
  const now = new Date().toISOString()

  const { data, error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent || null,
        device_info: deviceInfo ?? {},
        updated_at: now,
        last_seen_at: now,
      },
      { onConflict: 'endpoint' }
    )
    .select('id')
    .single()

  if (error) throw error
  return data.id as string
}

export async function deleteSubscription(subscription: PushSubscriptionJSON): Promise<boolean> {
  if (!subscription.endpoint) return false

  const admin = createServiceRoleClient()
  const { error, count } = await admin
    .from('push_subscriptions')
    .delete({ count: 'exact' })
    .eq('endpoint', subscription.endpoint)

  if (error) throw error
  return (count ?? 0) > 0
}

export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<boolean> {
  const admin = createServiceRoleClient()
  const { error, count } = await admin
    .from('push_subscriptions')
    .delete({ count: 'exact' })
    .eq('endpoint', endpoint)

  if (error) throw error
  return (count ?? 0) > 0
}

export async function deleteSubscriptionById(id: string): Promise<boolean> {
  const admin = createServiceRoleClient()
  const { error, count } = await admin
    .from('push_subscriptions')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) throw error
  return (count ?? 0) > 0
}

/** Delete every row in push_subscriptions (admin reset for testing). */
export async function deleteAllSubscriptions(): Promise<number> {
  const admin = createServiceRoleClient()
  const { error, count } = await admin
    .from('push_subscriptions')
    .delete({ count: 'exact' })
    .neq('endpoint', '')

  if (error) throw error
  return count ?? 0
}

export async function getAllSubscriptions(): Promise<
  Array<{
    id: string
    subscription: PushSubscriptionJSON
    userAgent: string
    deviceInfo: DeviceInfo
    createdAt: string
    lastSeenAt: string
  }>
> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('*')
    .order('last_seen_at', { ascending: false })

  if (error) throw error

  return (data as PushSubscriptionRow[]).map((row) => ({
    id: row.id,
    subscription: subscriptionFromRow(row),
    userAgent: row.user_agent || '',
    deviceInfo: (row.device_info as DeviceInfo) || {},
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }))
}

export async function getSubscriptionCount(): Promise<number> {
  const admin = createServiceRoleClient()
  const { count, error } = await admin
    .from('push_subscriptions')
    .select('*', { count: 'exact', head: true })

  if (error) throw error
  return count ?? 0
}

export async function sendToAllSubscriptions(
  payload: string
): Promise<{ sent: number; failed: number; total: number; errors: string[]; pruned: number }> {
  const subscriptions = await getAllSubscriptions()
  const { webpush } = await import('@/app/lib/push/vapid')

  let sent = 0
  let failed = 0
  let pruned = 0
  const errors: string[] = []

  await Promise.all(
    subscriptions.map(async (entry, index) => {
      try {
        await webpush.sendNotification(parseWebPushSubscription(entry.subscription), payload)
        sent++
      } catch (error: unknown) {
        failed++
        const err = error as { statusCode?: number; message?: string; endpoint?: string }
        const message = err.message || 'Unknown error'
        errors.push(`Device ${index + 1}: ${message}`)

        if (err.statusCode === 410 || err.statusCode === 404) {
          if (entry.subscription.endpoint) {
            await deleteSubscriptionByEndpoint(entry.subscription.endpoint)
            pruned++
          }
        }
      }
    })
  )

  return {
    sent,
    failed,
    total: subscriptions.length,
    errors: errors.slice(0, 10),
    pruned,
  }
}
