/**
 * Schedule helpers using the campaign timezone string (IANA), default Malaysia.
 */

export function parseTimeToHm(sendTime: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(sendTime.trim())
  if (!m) return { h: 10, m: 0 }
  return { h: Number(m[1]), m: Number(m[2]) }
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
  sendTime: string,
  timeZone: string
): Date {
  const tz = timeZone?.trim() || 'Asia/Kuala_Lumpur'
  const { h, m } = parseTimeToHm(sendTime)
  const { y, mo, day } = addCalendarDaysInTz(anchor, delayDays, tz)
  return zonedWallTimeToUtc(y, mo, day, h, m, tz)
}
