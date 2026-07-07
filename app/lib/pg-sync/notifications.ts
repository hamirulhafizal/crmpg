import type { PgSyncJobStatus } from '@/app/lib/pg-sync/types'

const NOTIFY_PREFIX = 'crmpg_pg_sync_notify:'

export type PgSyncNotifyKind =
  | 'your_turn'
  | 'awaiting_tac'
  | 'awaiting_captcha'
  | 'completed'
  | 'failed'

export function pgSyncNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function pgSyncNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!pgSyncNotificationSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestPgSyncNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!pgSyncNotificationSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

function notifyKey(jobId: string, kind: PgSyncNotifyKind): string {
  return `${NOTIFY_PREFIX}${jobId}:${kind}`
}

function alreadyNotified(jobId: string, kind: PgSyncNotifyKind): boolean {
  try {
    return sessionStorage.getItem(notifyKey(jobId, kind)) === '1'
  } catch {
    return false
  }
}

function markNotified(jobId: string, kind: PgSyncNotifyKind): void {
  try {
    sessionStorage.setItem(notifyKey(jobId, kind), '1')
  } catch {
    /* ignore */
  }
}

export function notifyPgSyncEvent(params: {
  jobId: string
  kind: PgSyncNotifyKind
  title: string
  body: string
  /** Only notify when tab is hidden; set false for TAC (always alert). */
  onlyWhenHidden?: boolean
  onClick?: () => void
}): boolean {
  if (!pgSyncNotificationSupported()) return false
  if (Notification.permission !== 'granted') return false
  if (alreadyNotified(params.jobId, params.kind)) return false
  if (params.onlyWhenHidden !== false && typeof document !== 'undefined' && !document.hidden) {
    return false
  }

  try {
    const n = new Notification(params.title, {
      body: params.body,
      tag: notifyKey(params.jobId, params.kind),
      icon: '/favicon.ico',
    })
    markNotified(params.jobId, params.kind)
    n.onclick = () => {
      window.focus()
      params.onClick?.()
      n.close()
    }
    return true
  } catch {
    return false
  }
}

export function notifyForJobStatusTransition(params: {
  jobId: string
  prevStatus: PgSyncJobStatus | null
  nextStatus: PgSyncJobStatus
  onOpen?: () => void
}): void {
  const { jobId, prevStatus, nextStatus, onOpen } = params

  if (prevStatus === 'queued' && ['running', 'syncing', 'awaiting_tac'].includes(nextStatus)) {
    notifyPgSyncEvent({
      jobId,
      kind: 'your_turn',
      title: 'PG sync — your turn',
      body: 'Your Business Center sync is starting. Open CRMPG to follow progress.',
      onlyWhenHidden: true,
      onClick: onOpen,
    })
  }

  if (nextStatus === 'awaiting_tac' && prevStatus !== 'awaiting_tac') {
    notifyPgSyncEvent({
      jobId,
      kind: 'awaiting_tac',
      title: 'PG sync — enter TAC',
      body: 'SMS TAC required. Open CRMPG and enter the code to continue syncing.',
      onlyWhenHidden: false,
      onClick: onOpen,
    })
  }

  if (nextStatus === 'awaiting_captcha' && prevStatus !== 'awaiting_captcha') {
    notifyPgSyncEvent({
      jobId,
      kind: 'awaiting_captcha',
      title: 'PG sync — CAPTCHA',
      body: 'Complete the CAPTCHA step, then confirm in CRMPG.',
      onlyWhenHidden: false,
      onClick: onOpen,
    })
  }

  if (nextStatus === 'completed' && prevStatus !== 'completed') {
    notifyPgSyncEvent({
      jobId,
      kind: 'completed',
      title: 'PG sync complete',
      body: 'Customer import finished successfully.',
      onlyWhenHidden: true,
      onClick: onOpen,
    })
  }

  if ((nextStatus === 'failed' || nextStatus === 'cancelled') && prevStatus !== nextStatus) {
    notifyPgSyncEvent({
      jobId,
      kind: 'failed',
      title: 'PG sync failed',
      body: 'Open CRMPG to see details and try again.',
      onlyWhenHidden: true,
      onClick: onOpen,
    })
  }
}
