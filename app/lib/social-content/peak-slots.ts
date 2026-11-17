import {
  DEFAULT_TIME_ZONE,
  PEAK_HOURS_MY,
} from '@/app/lib/social-content/categories'

/** Build next N peak-hour slots in Asia/Kuala_Lumpur (skip times already passed). */
export function buildPeakSlots(input: {
  days: number
  timeZone?: string
  from?: Date
}): Date[] {
  const timeZone = input.timeZone || DEFAULT_TIME_ZONE
  const from = input.from || new Date()
  const slots: Date[] = []

  for (let dayOffset = 0; slots.length < input.days && dayOffset < input.days + 14; dayOffset++) {
    const hour = PEAK_HOURS_MY[slots.length % PEAK_HOURS_MY.length]!
    const minute = hour === 12 ? 30 : 0
    const parts = datePartsInZone(from, timeZone)
    const candidate = wallTimeInZoneToUtc({
      year: parts.year,
      month: parts.month,
      day: parts.day + dayOffset,
      hour,
      minute,
      timeZone,
    })
    if (candidate.getTime() <= from.getTime() + 5 * 60 * 1000) continue
    slots.push(candidate)
  }

  return slots.slice(0, input.days)
}

function datePartsInZone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(date)
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
    day: Number(parts.find((p) => p.type === 'day')?.value),
  }
}

function wallTimeInZoneToUtc(input: {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  timeZone: string
}): Date {
  let guess = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0)

  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: input.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess))

    const got = {
      year: Number(parts.find((p) => p.type === 'year')?.value),
      month: Number(parts.find((p) => p.type === 'month')?.value),
      day: Number(parts.find((p) => p.type === 'day')?.value),
      hour: Number(parts.find((p) => p.type === 'hour')?.value),
      minute: Number(parts.find((p) => p.type === 'minute')?.value),
    }

    const desiredUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute)
    const gotUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute)
    guess += desiredUtc - gotUtc
  }

  return new Date(guess)
}

export function formatSlotLabel(iso: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('ms-MY', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}
