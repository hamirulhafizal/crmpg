import type { AudienceRanksFilter } from '@/app/lib/customer-account-status'

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'

export type CampaignTriggerType = 'manual' | 'birthday' | 'last_purchase' | 'enrollment'

export type EnrollmentStatus = 'active' | 'completed' | 'paused' | 'removed'

export type CampaignSendStatus = 'pending' | 'sent' | 'failed' | 'skipped'

/** Hops below the logged-in dealer in Tree Tier (direct frontline = 1). */
export type FrontlineTierNumber = 1 | 2 | 3 | 4
/** `all` = entire tree. Array = any of those hops. Omit = tier 1 only (legacy). */
export type FrontlineTiersFilter = 'all' | FrontlineTierNumber[]

/** Stored in campaigns.audience_filters — merged with app-side account-status logic. */
export type CampaignAudienceFilters = {
  tag_slugs?: string[]
  tag_ids?: string[]
  /**
   * Tree Tier hops to include. `all` = every descendant; `[1,3]` = those tiers.
   * Missing / empty = `[1]` (direct frontline only — existing workflows).
   */
  frontline_tiers?: FrontlineTiersFilter
  /**
   * Rank from `original_data.Rank`. `all` / omitted = every rank (legacy workflows).
   * Array = any of those buckets (Master dealer, Priority dealer, Dealer, Customer, Junior account).
   */
  business_ranks?: AudienceRanksFilter
  /** Matches keys from getAccountStatusKey */
  account_status?: Array<'temporary' | 'freeze' | 'active' | 'free' | 'inactive' | 'unknown'>
  is_monthly_buyer?: boolean | null
  is_friend?: boolean | null
  /** `original_data["Profile Verified"]` — yes / no / unset on customer record */
  profile_verified?: boolean | null
  /** `original_data["Direct Debit Subscription"]` — yes / no / unset on customer record */
  direct_debit?: boolean | null
  gender?: string | null
  /** Any match (OR) — values from customers.ethnicity: Malay, Chinese, Indian, Other */
  ethnicities?: Array<'Malay' | 'Chinese' | 'Indian' | 'Other'>
  location_contains?: string | null
  /** Minimum whole days since last purchase (based on column + original_data resolution in TS). */
  last_purchase_days_gt?: number | null
  /** Match `customers.dob` day/month to Malaysia “today” when the campaign runs (year ignored). */
  dob_is_today?: boolean | null
  /** @deprecated Prefer `dob_is_today`. Manual month 1–12 (year ignored). */
  dob_month?: number | null
  /** @deprecated Inclusive day range within `dob_month`. */
  dob_day_from?: number | null
  dob_day_to?: number | null
  /** Last purchase calendar date equals Malaysia “today” when the campaign runs. */
  last_purchase_is_today?: boolean | null
  /** Registration calendar date equals Malaysia “today” when the campaign runs. */
  register_is_today?: boolean | null
  /** @deprecated Prefer `last_purchase_is_today`. */
  last_purchase_on_or_after?: string | null
  last_purchase_on_or_before?: string | null
  /** @deprecated Prefer `register_is_today`. */
  register_on_or_after?: string | null
  register_on_or_before?: string | null
  segment_attributes?: Record<string, unknown>
}

export type CampaignRow = {
  id: string
  user_id: string
  name: string
  description: string | null
  status: CampaignStatus
  trigger_type: CampaignTriggerType
  trigger_offset_days: number
  timezone: string | null
  audience_filters: CampaignAudienceFilters
  workflow_layout?: { nodes?: Record<string, { x: number; y: number }> }
  workflow_definition?: { version?: number; nodes?: unknown[]; edges?: unknown[] }
  uses_platform_defaults?: boolean
  platform_default_id?: string | null
  platform_default_tier?: 'free' | 'pro' | null
  daily_send_limit: number
  cooldown_days: number
  start_at: string | null
  end_at: string | null
  created_at: string
  updated_at: string
}

export type CampaignStepRow = {
  id: string
  campaign_id: string
  step_order: number
  delay_days: number
  send_time: string | null
  message_template: string
  is_active: boolean
  created_at: string
}

export type CampaignEnrollmentRow = {
  id: string
  campaign_id: string
  customer_id: string
  user_id: string
  enrolled_at: string
  status: EnrollmentStatus
  last_step_sent: number
  next_send_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown>
}

export type CampaignMessageLogRow = {
  id: string
  campaign_id: string
  campaign_step_id: string | null
  enrollment_id: string | null
  customer_id: string
  user_id: string
  phone: string | null
  rendered_message: string | null
  send_status: CampaignSendStatus
  sent_at: string | null
  error_message: string | null
  waha_response: unknown
  created_at: string
}
