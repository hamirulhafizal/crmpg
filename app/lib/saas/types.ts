export type SaasBillingPeriod = 'monthly' | 'yearly' | 'none'

export type SaasSubscriptionStatus = 'trialing' | 'active' | 'expired' | 'cancelled'

export type SaasPlanRow = {
  id: string
  slug: string
  name: string
  description: string | null
  billing_period: SaasBillingPeriod
  price_amount: number
  currency: string
  trial_days: number
  is_active: boolean
  sort_order: number
  marketing_details: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type SaasPlanFeatureRow = {
  id: string
  plan_id: string
  feature_key: string
  value: string
}

export type SaasSubscriptionRow = {
  id: string
  user_id: string
  organization_id: string | null
  plan_id: string
  status: SaasSubscriptionStatus
  locked_price_amount: number
  locked_currency: string
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  payment_provider: string | null
  payment_metadata: Record<string, unknown>
  admin_assigned_by: string | null
  admin_assigned_at: string | null
  created_at: string
  updated_at: string
}

/** Known v1 feature keys stored in saas_plan_features. */
export type SaasFeatureKey =
  | 'max_active_campaigns'
  | 'whatsapp_providers'
  | 'platform_access'

export type SaasPlanWithFeatures = SaasPlanRow & {
  features: SaasPlanFeatureRow[]
  subscriber_count?: number
}

export type SaasSubscriptionWithPlan = SaasSubscriptionRow & {
  plan?: SaasPlanRow | null
  profile?: {
    id: string
    full_name: string | null
    role: string
  } | null
}

export const SAAS_FEATURE_DEFAULTS: Record<SaasFeatureKey, string> = {
  max_active_campaigns: '1',
  whatsapp_providers: 'waha',
  platform_access: 'true',
}

export const SAAS_FEATURE_LABELS: Record<SaasFeatureKey, string> = {
  max_active_campaigns: 'Max active workflows (-1 = unlimited)',
  whatsapp_providers: 'WhatsApp providers (comma-separated: waha, wasender)',
  platform_access: 'Platform access when subscription valid (true/false)',
}
