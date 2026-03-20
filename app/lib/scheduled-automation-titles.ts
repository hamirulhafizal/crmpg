/** Exact titles stored on `scheduled_messages.title` for broadcast automations. */
export const SCHEDULED_TITLE_BIRTHDAY = 'Birthday'
export const SCHEDULED_TITLE_INACTIVE_FOLLOWUP = 'Inactive follow-up'
export const SCHEDULED_TITLE_FREE_FOLLOWUP = 'Free account follow-up'

export function normalizedScheduledTitle(title: string | null | undefined): string {
  return (title || '').trim().toLowerCase()
}

export function isBroadcastScheduledTitle(title: string | null | undefined): boolean {
  const t = normalizedScheduledTitle(title)
  return (
    t === 'birthday' ||
    t === 'inactive follow-up' ||
    t === 'free account follow-up'
  )
}
