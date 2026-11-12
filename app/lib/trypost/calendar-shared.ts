export {
  platformIconSrc,
  platformLabel,
  platformShort,
  platformVisual,
} from '@/app/lib/trypost/platforms'

/** Local calendar day key YYYY-MM-DD in the given IANA timezone (defaults to Asia/Kuala_Lumpur). */
export function localDateKey(iso: string, timeZone = 'Asia/Kuala_Lumpur'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** Monday-start week containing `date` (local calendar parts). */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function formatWeekRangeLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const sameMonth = weekStart.getMonth() === end.getMonth()
  const startDay = weekStart.getDate()
  const endDay = end.getDate()
  const monthYear = end.toLocaleString(undefined, { month: 'long', year: 'numeric' })
  if (sameMonth) return `${startDay}–${endDay} ${monthYear}`
  const startMonth = weekStart.toLocaleString(undefined, { month: 'short' })
  const endMonth = end.toLocaleString(undefined, { month: 'short', year: 'numeric' })
  return `${startDay} ${startMonth} – ${endDay} ${endMonth}`
}

export function partsInTimeZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  }
}

export function formatTimeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}
