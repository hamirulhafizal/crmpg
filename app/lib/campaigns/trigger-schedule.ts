import {
  parseTimeToHm,
  sendTimeFromDb,
  wallDatePartsInTz,
  zonedWallTimeToUtc,
} from '@/app/lib/campaigns/schedule'
import type { CampaignRow } from '@/app/lib/campaigns/types'
import type { CampaignWorkflowPlan } from '@/app/lib/workflows/plan'

export type TriggerRunSchedule = {
  run_date: string
  run_time: string
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
  }
}

/** Split campaign start_at into editor fields (campaign timezone). */
export function triggerScheduleFromStartAt(
  startAt: string | null | undefined,
  timezone: string | null | undefined
): TriggerRunSchedule {
  if (!startAt?.trim()) return { run_date: '', run_time: '' }
  const d = new Date(startAt)
  if (Number.isNaN(d.getTime())) return { run_date: '', run_time: '' }

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

export function triggerScheduleDisplayLabel(schedule: TriggerRunSchedule): string {
  const { run_date, run_time } = schedule
  if (run_date && run_time) return `${run_date} ${run_time}`
  if (run_date) return `from ${run_date}`
  if (run_time) return `at ${run_time}`
  return 'anytime'
}

export function getTriggerRunScheduleFromPlan(plan: CampaignWorkflowPlan): TriggerRunSchedule {
  const trigger = plan.ordered.find((n) => String(n.type).startsWith('crm.trigger.'))
  return triggerScheduleFromParams(trigger?.parameters)
}

function wallMinutesInTz(d: Date, timeZone: string): number {
  const { h, m } = wallTimeHmInTz(d, timeZone)
  return h * 60 + m
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

  const schedule = getTriggerRunScheduleFromPlan(plan)
  const tz = campaign.timezone?.trim() || 'Asia/Kuala_Lumpur'

  if (schedule.run_date && !campaign.start_at) {
    const { y, mo, day } = wallDatePartsInTz(now, tz)
    const [ry, rmo, rd] = schedule.run_date.split('-').map(Number)
    if (y < ry! || (y === ry && mo < rmo!) || (y === ry && mo === rmo && day < rd!)) {
      return false
    }
  }

  if (!opts?.skipTimeGate && schedule.run_time) {
    const { h, m } = parseTimeToHm(schedule.run_time)
    const targetMins = h * 60 + m
    const nowMins = wallMinutesInTz(now, tz)
    // Daily gate: allow any cron tick on/after the scheduled local time (not exact minute match).
    if (nowMins < targetMins) return false
  }

  return true
}
