/**
 * Schedule helpers using the campaign timezone string (IANA), default Malaysia.
 */

/** True when a step uses a fixed clock time; false means send as soon as due ("now"). */
export function isScheduledSendTime(sendTime: string | null | undefined): boolean {
  return Boolean(String(sendTime ?? '').trim())
}

export function sendTimeDisplayLabel(sendTime: string | null | undefined): string {
  const raw = String(sendTime ?? '').trim()
  if (!raw) return 'now'
  return raw.slice(0, 5)
}

/** Editor / API HH:MM from DB TIME or workflow parameter. Empty = immediate send. */
export function sendTimeFromDb(sendTime: string | null | undefined): string {
  const raw = String(sendTime ?? '').trim()
  if (!raw) return ''
  return raw.length >= 5 ? raw.slice(0, 5) : raw
}

/** Persist to campaign_steps.send_time — null when immediate. */
export function normalizeSendTimeForDb(sendTime: string | null | undefined): string | null {
  const s = String(sendTime ?? '').trim()
  if (!s) return null
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':')
    return `${h!.padStart(2, '0')}:${m}:00`
  }
  return null
}

export function parseTimeToHm(sendTime: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(sendTime.trim())
  if (!m) return { h: 10, m: 0 }
  return { h: Number(m[1]), m: Number(m[2]) }
}

/** Display HH:MM (24h storage) as "8:00 AM" / "2:30 PM". */
export function formatRunTimeAmPm(sendTime: string | null | undefined): string {
  const raw = sendTimeFromDb(sendTime)
  if (!raw) return ''
  const { h, m } = parseTimeToHm(raw)
  const d = new Date(2000, 0, 1, h, m)
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
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

/** Calendar date parts for `timeZone` at instant `d`. */
export function wallDatePartsInTz(d: Date, timeZone: string): { y: number; mo: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(d)
  const y = Number(parts.find((p) => p.type === 'year')?.value)
  const mo = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  return { y, mo, day }
}

/**
 * Wall-clock instant in `timeZone` when calendar shows (y, mo, day) at hh:mm local.
 * Uses iterative refinement so DST / offsets are handled by the environment.
 */
export function zonedWallTimeToUtc(y: number, mo: number, day: number, hh: number, mm: number, timeZone: string): Date {
  let guess = new Date(Date.UTC(y, mo - 1, day, 12, 0, 0))
  for (let i = 0; i < 24; i++) {
    const parts = wallDatePartsInTz(guess, timeZone)
    const localHm = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(guess)
    const h = Number(localHm.find((p) => p.type === 'hour')?.value)
    const m = Number(localHm.find((p) => p.type === 'minute')?.value)
    if (parts.y === y && parts.mo === mo && parts.day === day && h === hh && m === mm) {
      return guess
    }
    const wantMin = hh * 60 + mm
    const gotMin = h * 60 + m
    guess = new Date(guess.getTime() + (wantMin - gotMin) * 60 * 1000)
  }
  return guess
}

export function addCalendarDaysInTz(
  anchor: Date,
  days: number,
  timeZone: string
): { y: number; mo: number; day: number } {
  const { y, mo, day } = wallDatePartsInTz(anchor, timeZone)
  const utcNoon = new Date(Date.UTC(y, mo - 1, day, 12, 0, 0))
  const shifted = new Date(utcNoon.getTime() + days * 24 * 60 * 60 * 1000)
  return wallDatePartsInTz(shifted, timeZone)
}

export function computeSendAt(
  anchor: Date,
  delayDays: number,
  sendTime: string | null | undefined,
  timeZone: string
): Date {
  const tz = timeZone?.trim() || 'Asia/Kuala_Lumpur'

  if (!isScheduledSendTime(sendTime)) {
    if (delayDays === 0) return new Date(anchor.getTime())
    const { y, mo, day } = addCalendarDaysInTz(anchor, delayDays, tz)
    const { h, m } = wallTimeHmInTz(anchor, tz)
    return zonedWallTimeToUtc(y, mo, day, h, m, tz)
  }

  const { h, m } = parseTimeToHm(sendTime!)
  const { y, mo, day } = addCalendarDaysInTz(anchor, delayDays, tz)
  return zonedWallTimeToUtc(y, mo, day, h, m, tz)
}
