// Simple in-memory store for push subscriptions
// In production, you should use a database (e.g., Supabase)

interface PushSubscriptionData {
  subscription: PushSubscriptionJSON
  userAgent: string
  deviceInfo: {
    isIOS: boolean
    isStandalone: boolean
    userAgent: string
    displayMode: string
  }
  createdAt: number
}

const subscriptions: Map<string, PushSubscriptionData> = new Map()

export function saveSubscription(
  subscription: PushSubscriptionJSON,
  userAgent: string,
  deviceInfo: any
): string {
  // Create a unique key from subscription endpoint
  const key = subscription.endpoint || `${Date.now()}-${Math.random()}`
  
  subscriptions.set(key, {
    subscription,
    userAgent,
    deviceInfo,
    createdAt: Date.now(),
  })
  
  return key
}

export function getSubscription(key: string): PushSubscriptionData | undefined {
  return subscriptions.get(key)
}

export function getAllSubscriptions(): PushSubscriptionData[] {
  return Array.from(subscriptions.values())
}

export function deleteSubscription(subscription: PushSubscriptionJSON): boolean {
  const key = subscription.endpoint || ''
  
  // Try to find by endpoint
  for (const [k, data] of subscriptions.entries()) {
    if (data.subscription.endpoint === subscription.endpoint) {
      subscriptions.delete(k)
      return true
    }
  }
  
  return false
}

export function deleteSubscriptionByEndpoint(endpoint: string): boolean {
  for (const [key, data] of subscriptions.entries()) {
    if (data.subscription.endpoint === endpoint) {
      subscriptions.delete(key)
      return true
    }
  }
  return false
}

