export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'

export type CampaignTriggerType = 'manual' | 'birthday' | 'last_purchase' | 'enrollment'

export type EnrollmentStatus = 'active' | 'completed' | 'paused' | 'removed'

export type CampaignSendStatus = 'pending' | 'sent' | 'failed' | 'skipped'

/** Stored in campaigns.audience_filters — merged with app-side account-status logic. */
export type CampaignAudienceFilters = {
  tag_slugs?: string[]
  tag_ids?: string[]
  /** Matches keys from getAccountStatusKey */
  account_status?: Array<'temporary' | 'freeze' | 'active' | 'free' | 'inactive' | 'unknown'>
  is_monthly_buyer?: boolean | null
  is_friend?: boolean | null
  gender?: string | null
  /** Any match (OR) — values from customers.ethnicity: Malay, Chinese, Indian, Other */
  ethnicities?: Array<'Malay' | 'Chinese' | 'Indian' | 'Other'>
  location_contains?: string | null
  /** Minimum whole days since last purchase (based on column + original_data resolution in TS). */
  last_purchase_days_gt?: number | null
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
  send_time: string
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
