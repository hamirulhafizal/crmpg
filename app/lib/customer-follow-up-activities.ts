/**
 * Follow-up activity log: topic + channel + outcome.
 * Used for CRM memory, anti-spam cooldowns, and weekly touch quotas (API-enforced).
 */

export const FOLLOW_UP_CHANNELS = ['call', 'whatsapp_manual', 'whatsapp_automation'] as const
export type FollowUpChannel = (typeof FOLLOW_UP_CHANNELS)[number]

export const FOLLOW_UP_OUTCOMES = [
  'answered',
  'no_answer',
  'busy',
  'wrong_number',
  'callback_requested',
  'not_interested',
  'completed',
  'delivered',
  'read',
  'replied',
  'failed',
  'skipped',
  'other',
] as const
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number]

export type FollowUpTopicDef = {
  key: string
  labelMs: string
  /** Days before same topic can be logged again for this customer */
  cooldownDays: number
}

/** Starter catalog — extend via migration/app later if you need DB-driven topics */
export const FOLLOW_UP_TOPICS: FollowUpTopicDef[] = [
  { key: 'profile_update', labelMs: 'Kemas kini profil / verifikasi', cooldownDays: 14 },
  { key: 'reactivate_from_free', labelMs: 'Aktifkan semula akaun (free / dorman)', cooldownDays: 21 },
  { key: 'winback_inactive', labelMs: 'Winback — tidak beli bulan semasa', cooldownDays: 14 },
  { key: 'direct_debit_education', labelMs: 'Direct debit / auto debit', cooldownDays: 21 },
  { key: 'invite_event', labelMs: 'Jemput hadir program / event', cooldownDays: 30 },
  { key: 'referral', labelMs: 'Ajak rujukan (referral)', cooldownDays: 30 },
  { key: 'bop', labelMs: 'BOP / program berkaitan', cooldownDays: 21 },
  { key: 'goal_saving_emas', labelMs: 'Matlamat simpan emas', cooldownDays: 30 },
  { key: 'rank_progression', labelMs: 'Naik taraf rank (dealer network)', cooldownDays: 30 },
  { key: 'general_check_in', labelMs: 'Sembang / check-in umum', cooldownDays: 5 },
  { key: 'other', labelMs: 'Lain-lain', cooldownDays: 7 },
]

export const FOLLOW_UP_TOPIC_KEYS = new Set(FOLLOW_UP_TOPICS.map((t) => t.key))

export const DEFAULT_MAX_TOUCHES_PER_WEEK = 6

export function getTopicCooldownDays(topic: string): number {
  const def = FOLLOW_UP_TOPICS.find((t) => t.key === topic)
  return def?.cooldownDays ?? 14
}

export function getTopicLabel(topic: string): string {
  const def = FOLLOW_UP_TOPICS.find((t) => t.key === topic)
  return def?.labelMs ?? topic
}

export function getChannelLabel(channel: FollowUpChannel): string {
  switch (channel) {
    case 'call':
      return 'Panggilan'
    case 'whatsapp_manual':
      return 'WhatsApp (manual)'
    case 'whatsapp_automation':
      return 'WhatsApp (automasi WAHA)'
    default:
      return channel
  }
}

export type FollowUpActivityRow = {
  id: string
  customer_id: string
  user_id: string
  created_by: string
  topic: string
  channel: FollowUpChannel
  outcome: string | null
  notes: string | null
  occurred_at: string
  counts_toward_quota: boolean
  idempotency_key: string | null
  metadata: Record<string, unknown>
  created_at: string
}
