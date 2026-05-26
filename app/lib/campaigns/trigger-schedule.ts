import {
  formatRunTimeAmPm,
  parseTimeToHm,
  sendTimeFromDb,
  wallDatePartsInTz,
  zonedWallTimeToUtc,
} from '@/app/lib/campaigns/schedule'
import type { CampaignRow, CampaignTriggerType } from '@/app/lib/campaigns/types'
import type { CampaignWorkflowPlan } from '@/app/lib/workflows/plan'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

export type TriggerRunFrequency = 'daily' | 'weekly' | 'monthly'

export type TriggerRunSchedule = {
  run_date: string
  run_time: string
  run_frequency: TriggerRunFrequency
  /** 0 = Sunday … 6 = Saturday (campaign timezone). Used when run_frequency is weekly. */
  run_weekday: number
  /** 1–31 (campaign timezone). Used when run_frequency is monthly. */
  run_day_of_month: number
}

export const TRIGGER_WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export function normalizeRunFrequency(value: unknown): TriggerRunFrequency {
  const s = String(value ?? 'daily').toLowerCase()
  if (s === 'weekly' || s === 'monthly') return s
  return 'daily'
}

export function normalizeRunWeekday(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.min(6, Math.max(0, Math.floor(n)))
}

export function normalizeRunDayOfMonth(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.min(31, Math.max(1, Math.floor(n)))
}

function wallTimeHmInTz(d: Date, timeZone: string): { h: number; m: number } {
  const localHm = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  return {
    h: Number(localHm.find((p) => p.type === 'hour')?.value),
    m: Number(localHm.find((p) => p.type === 'minute')?.value),
  }
}

export function normalizeRunDate(value: string | null | undefined): string {
  const s = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  return s
}

export function normalizeRunTime(value: string | null | undefined): string {
  return sendTimeFromDb(value)
}

export function triggerScheduleFromParams(params: Record<string, unknown> | null | undefined): TriggerRunSchedule {
  return {
    run_date: normalizeRunDate(params?.run_date as string | undefined),
    run_time: normalizeRunTime(params?.run_time as string | undefined),
    run_frequency: normalizeRunFrequency(params?.run_frequency),
    run_weekday: normalizeRunWeekday(params?.run_weekday),
    run_day_of_month: normalizeRunDayOfMonth(params?.run_day_of_month),
  }
}

/** Split campaign start_at into editor fields (campaign timezone). */
export function triggerScheduleFromStartAt(
  startAt: string | null | undefined,
  timezone: string | null | undefined
): TriggerRunSchedule {
  if (!startAt?.trim()) {
    return {
      run_date: '',
      run_time: '',
      run_frequency: 'daily',
      run_weekday: 1,
      run_day_of_month: 1,
    }
  }
  const d = new Date(startAt)
  if (Number.isNaN(d.getTime())) {
    return {
      run_date: '',
      run_time: '',
      run_frequency: 'daily',
      run_weekday: 1,
      run_day_of_month: 1,
    }
  }

  const tz = timezone?.trim() || 'Asia/Kuala_Lumpur'
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = dateParts.find((p) => p.type === 'year')?.value ?? ''
  const mo = dateParts.find((p) => p.type === 'month')?.value ?? ''
  const day = dateParts.find((p) => p.type === 'day')?.value ?? ''
  const { h, m } = wallTimeHmInTz(d, tz)
  const hasTime = h !== 0 || m !== 0

  return {
    run_date: y && mo && day ? `${y}-${mo}-${day}` : '',
    run_time: hasTime ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : '',
    run_frequency: 'daily',
    run_weekday: 1,
    run_day_of_month: Math.min(31, Math.max(1, Number(day) || 1)),
  }
}

/** Persist start_at when date and/or time are set. Time-only returns null (daily gate uses run_time). */
export function startAtFromTriggerSchedule(
  runDate: string | null | undefined,
  runTime: string | null | undefined,
  timezone: string | null | undefined
): string | null {
  const date = normalizeRunDate(runDate)
  const time = normalizeRunTime(runTime)
  if (!date && !time) return null

  const tz = timezone?.trim() || 'Asia/Kuala_Lumpur'
  if (date && time) {
    const [y, mo, d] = date.split('-').map(Number)
    const { h, m } = parseTimeToHm(time)
    return zonedWallTimeToUtc(y, mo, d, h, m, tz).toISOString()
  }
  if (date) {
    const [y, mo, d] = date.split('-').map(Number)
    return zonedWallTimeToUtc(y, mo, d, 0, 0, tz).toISOString()
  }
  return null
}

export function triggerScheduleDisplayLabel(schedule: Partial<TriggerRunSchedule>): string {
  const freq = schedule.run_frequency ?? 'daily'
  const timeAmPm = schedule.run_time ? formatRunTimeAmPm(schedule.run_time) : ''
  const timeSuffix = timeAmPm ? ` at ${timeAmPm}` : ''
  const datePrefix = schedule.run_date ? `from ${schedule.run_date} · ` : ''

  if (freq === 'weekly') {
    const wd =
      TRIGGER_WEEKDAY_OPTIONS.find((o) => o.value === normalizeRunWeekday(schedule.run_weekday))?.label ??
      'Monday'
    return `${datePrefix}weekly ${wd}${timeSuffix}`.replace(/^from .* · weekly/, 'weekly').trim()
  }

  if (freq === 'monthly') {
    const dom = normalizeRunDayOfMonth(schedule.run_day_of_month)
    return `${datePrefix}monthly day ${dom}${timeSuffix}`.replace(/^from .* · monthly/, 'monthly').trim()
  }

  if (schedule.run_date && schedule.run_time) {
    return `${schedule.run_date} ${formatRunTimeAmPm(schedule.run_time)}`
  }
  if (schedule.run_date) return `from ${schedule.run_date}`
  if (schedule.run_time) return `daily${timeSuffix}`
  return 'anytime'
}

export function getTriggerRunScheduleFromPlan(plan: CampaignWorkflowPlan): TriggerRunSchedule {
  const trigger = plan.ordered.find((n) => String(n.type).startsWith('crm.trigger.'))
  return triggerScheduleFromParams(trigger?.parameters)
}

function triggerKindLabel(type: string): string {
  const t = type.toLowerCase()
  if (t === 'birthday') return 'Birthday'
  if (t === 'last_purchase') return 'Last purchase'
  if (t === 'enrollment') return 'Enrollment'
  return 'Manual'
}

function triggerEventHint(type: string, offsetDays: number): string | null {
  const t = type.toLowerCase()
  const n = Math.abs(Math.round(offsetDays))
  if (t === 'birthday') {
    if (offsetDays === 0) return 'On customer birthday'
    if (offsetDays < 0) return `${n} day${n === 1 ? '' : 's'} before birthday`
    return `${n} day${n === 1 ? '' : 's'} after birthday`
  }
  if (t === 'last_purchase') {
    if (offsetDays === 0) return 'On last purchase date'
    if (offsetDays < 0) return `${n} day${n === 1 ? '' : 's'} before last purchase`
    return `${n} day${n === 1 ? '' : 's'} after last purchase`
  }
  if (t === 'enrollment') return 'When customer enrolls'
  return null
}

/** Read cron schedule from workflow trigger node (or legacy start_at). */
export function resolveCampaignTriggerSchedule(campaign: {
  workflow_definition?: unknown
  start_at?: string | null
  timezone?: string | null
}): TriggerRunSchedule {
  const def = campaign.workflow_definition as WorkflowDefinition | undefined
  if (def?.nodes?.length) {
    const trigger = def.nodes.find((n) => String(n.type).startsWith('crm.trigger.'))
    if (trigger?.parameters) return triggerScheduleFromParams(trigger.parameters)
  }
  return triggerScheduleFromStartAt(campaign.start_at, campaign.timezone)
}

export type CampaignListTriggerDisplay = {
  kind: string
  /** When cron checks / runs: daily, weekly, monthly, time */
  scheduleLine: string
  /** Birthday / last purchase / enrollment context */
  eventLine: string | null
  timezone: string
}

/** Human-readable trigger + schedule for campaigns list table. */
export function campaignListTriggerDisplay(campaign: {
  trigger_type?: string | null
  trigger_offset_days?: number | null
  timezone?: string | null
  workflow_definition?: unknown
  start_at?: string | null
}): CampaignListTriggerDisplay {
  const triggerType = (campaign.trigger_type ?? 'manual') as CampaignTriggerType
  const schedule = resolveCampaignTriggerSchedule(campaign)
  let scheduleLine = triggerScheduleDisplayLabel(schedule)
  const freq = schedule.run_frequency ?? 'daily'
  if (freq === 'daily' && scheduleLine === 'anytime') {
    scheduleLine = 'Daily · anytime (cron)'
  } else if (freq === 'daily' && schedule.run_time && !scheduleLine.startsWith('daily')) {
    const t = formatRunTimeAmPm(schedule.run_time)
    scheduleLine = t ? `Daily at ${t}` : 'Daily'
  }

  return {
    kind: triggerKindLabel(triggerType),
    scheduleLine,
    eventLine: triggerEventHint(triggerType, Number(campaign.trigger_offset_days ?? 0)),
    timezone: campaign.timezone?.trim() || 'Asia/Kuala_Lumpur',
  }
}

function wallMinutesInTz(d: Date, timeZone: string): number {
  const { h, m } = wallTimeHmInTz(d, timeZone)
  return h * 60 + m
}

function wallWeekdayInTz(d: Date, timeZone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[wd] ?? 0
}

/** Whether cron should process this campaign now (manual test runs skip the time gate). */
export function campaignTriggerAllowsRunNow(
  campaign: CampaignRow,
  plan: CampaignWorkflowPlan,
  now: Date,
  opts?: { skipTimeGate?: boolean }
): boolean {
  if (campaign.end_at && new Date(campaign.end_at) < now) return false
  if (campaign.start_at && new Date(campaign.start_at) > now) return false

  const trigger = plan.ordered.find((n) => String(n.type).startsWith('crm.trigger.'))
  const schedule = triggerScheduleFromParams(trigger?.parameters)
  const tz = campaign.timezone?.trim() || 'Asia/Kuala_Lumpur'

  if (schedule.run_date && !campaign.start_at) {
    const { y, mo, day } = wallDatePartsInTz(now, tz)
    const [ry, rmo, rd] = schedule.run_date.split('-').map(Number)
    if (y < ry! || (y === ry && mo < rmo!) || (y === ry && mo === rmo && day < rd!)) {
      return false
    }
  }

  if (!opts?.skipTimeGate) {
    const freq = schedule.run_frequency

    if (freq === 'weekly') {
      if (wallWeekdayInTz(now, tz) !== schedule.run_weekday) return false
    } else if (freq === 'monthly') {
      const { day } = wallDatePartsInTz(now, tz)
      if (day !== schedule.run_day_of_month) return false
    }

    if (schedule.run_time) {
      const { h, m } = parseTimeToHm(schedule.run_time)
      const targetMins = h * 60 + m
      const nowMins = wallMinutesInTz(now, tz)
      // Allow any cron tick on/after the scheduled local time until midnight.
      if (nowMins < targetMins) return false
    }
  }

  return true
}
