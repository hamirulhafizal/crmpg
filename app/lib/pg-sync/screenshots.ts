import type { PgSyncJobView, PgSyncWebhookEvent } from '@/app/lib/pg-sync/types'

export type PgSyncStepScreenshot = {
  key: string
  step: number
  event: string
  label: string
  screenshotSrc: string | null
  timestamp: string
  url?: string
}

const EVENT_LABELS: Record<string, string> = {
  'job.queued': 'Queued',
  'job.started': 'Browser started',
  'step.completed': 'Automation step',
  'job.awaiting_tac': 'SMS code screen',
  'job.awaiting_captcha': 'CAPTCHA screen',
  'sync.progress': 'Importing rows',
  'job.completed': 'Finished',
  'job.failed': 'Failed',
  'job.cancelled': 'Cancelled',
}

/** Ensure worker base64 is a usable `<img src>`. */
export function normalizeScreenshotSrc(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  if (value.startsWith('data:image/')) return value
  return `data:image/png;base64,${value}`
}

function labelForEvent(ev: PgSyncWebhookEvent): string {
  const fromGoal = (ev.last_goal ?? '').trim()
  if (fromGoal) {
    if (/captcha|bot/i.test(fromGoal)) return 'CAPTCHA on PG Mall'
    if (/tac|otp|sms/i.test(fromGoal)) return 'SMS verification'
    if (/login|sign.?in/i.test(fromGoal)) return 'PG Mall login'
    if (fromGoal.length <= 64) return fromGoal
    return fromGoal.slice(0, 61) + '…'
  }
  return EVENT_LABELS[ev.event] ?? ev.event.replace(/\./g, ' ')
}

export function snapshotsFromEvents(events: PgSyncWebhookEvent[]): PgSyncStepScreenshot[] {
  const byStep = new Map<number, PgSyncStepScreenshot>()

  for (const ev of events) {
    const screenshotSrc = normalizeScreenshotSrc(ev.screenshot_base64)
    const step = typeof ev.step === 'number' && ev.step > 0 ? ev.step : byStep.size + 1
    const existing = byStep.get(step)

    if (existing && !screenshotSrc) continue

    byStep.set(step, {
      key: `${step}-${ev.event}-${ev.timestamp}`,
      step,
      event: ev.event,
      label: labelForEvent(ev),
      screenshotSrc: screenshotSrc ?? existing?.screenshotSrc ?? null,
      timestamp: ev.timestamp,
      url: ev.url,
    })
  }

  return [...byStep.values()].sort((a, b) => a.step - b.step)
}

export function mergeLiveScreenshot(
  job: PgSyncJobView,
  events: PgSyncStepScreenshot[]
): {
  liveSrc: string | null
  steps: PgSyncStepScreenshot[]
  browserLiveUrl: string | null
} {
  const liveSrc = normalizeScreenshotSrc(job.screenshot_base64)
  const browserLiveUrl = job.browser_live_url?.trim() || null
  const steps = [...events]

  if (liveSrc && typeof job.step === 'number' && job.step > 0) {
    const idx = steps.findIndex((s) => s.step === job.step)
    const entry: PgSyncStepScreenshot = {
      key: `live-${job.step}`,
      step: job.step,
      event: 'live',
      label: labelForEvent({
        event: 'step.completed',
        job_id: job.id,
        timestamp: new Date().toISOString(),
        last_goal: job.last_goal,
        last_action: job.last_action,
      }),
      screenshotSrc: liveSrc,
      timestamp: new Date().toISOString(),
      url: job.url,
    }
    if (idx >= 0) {
      steps[idx] = { ...steps[idx], ...entry, screenshotSrc: liveSrc }
    } else {
      steps.push(entry)
      steps.sort((a, b) => a.step - b.step)
    }
  }

  return { liveSrc, steps, browserLiveUrl }
}
