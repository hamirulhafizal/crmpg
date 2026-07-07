'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearStoredPgSyncJob,
  readStoredPgSyncJob,
  writeStoredPgSyncJob,
} from '@/app/lib/pg-sync/active-job'
import { buildQueueInfo, type PgSyncQueueInfo } from '@/app/lib/pg-sync/queue-info'
import {
  notifyForJobStatusTransition,
  pgSyncNotificationPermission,
  requestPgSyncNotificationPermission,
} from '@/app/lib/pg-sync/notifications'
import type { PgSyncJobView, PgSyncJobStatus, PgSyncServiceStatus } from '@/app/lib/pg-sync/types'

export type PgSyncStatusPayload = {
  ok?: boolean
  pg_code?: string
  status?: PgSyncServiceStatus
  active_job_id?: string | null
  active_job?: PgSyncJobView | null
  queue_info?: PgSyncQueueInfo
  error?: string
}

type Options = {
  enabled: boolean
  onOpenModal: () => void
  onActiveChange?: (active: boolean) => void
  onCompleted?: () => void
  /** Open modal once when an in-flight job is detected (e.g. after refresh). */
  autoOpenOnActive?: boolean
}

const STATUS_POLL_MS = 20_000
const JOB_POLL_MS = 3_000

function isTerminal(status: PgSyncJobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function usePgSyncQueueMonitor(options: Options) {
  const { enabled, onOpenModal, onActiveChange, onCompleted, autoOpenOnActive = true } = options
  const [queueInfo, setQueueInfo] = useState<PgSyncQueueInfo | null>(null)
  const [activeJob, setActiveJob] = useState<PgSyncJobView | null>(null)
  const [loading, setLoading] = useState(false)
  const [notifyPermission, setNotifyPermission] = useState(
    typeof window !== 'undefined' ? pgSyncNotificationPermission() : 'unsupported'
  )

  const lastJobStatusRef = useRef<PgSyncJobStatus | null>(null)
  const autoOpenedRef = useRef(false)
  const onOpenModalRef = useRef(onOpenModal)
  const onActiveChangeRef = useRef(onActiveChange)
  const onCompletedRef = useRef(onCompleted)
  onOpenModalRef.current = onOpenModal
  onActiveChangeRef.current = onActiveChange
  onCompletedRef.current = onCompleted

  const applyStatusPayload = useCallback((json: PgSyncStatusPayload) => {
    if (!json.status || !json.pg_code) return

    const job = json.active_job ?? null
    const queueInfoNext = buildQueueInfo({
      status: json.status,
      myPgCode: json.pg_code,
      myQueuePosition: job?.queue_position ?? json.queue_info?.my_queue_position ?? null,
      myJobStatus: job?.status ?? null,
    })

    setQueueInfo(json.queue_info ?? queueInfoNext)
    setActiveJob(job)

    if (job) {
      const prev = lastJobStatusRef.current
      if (prev !== job.status) {
        notifyForJobStatusTransition({
          jobId: job.id,
          prevStatus: prev,
          nextStatus: job.status,
          onOpen: () => onOpenModalRef.current(),
        })
        lastJobStatusRef.current = job.status
      }

      if (!isTerminal(job.status)) {
        writeStoredPgSyncJob(job.id, json.pg_code)
        onActiveChangeRef.current?.(true)
        if (autoOpenOnActive && !autoOpenedRef.current) {
          autoOpenedRef.current = true
          onOpenModalRef.current()
        }
      } else {
        clearStoredPgSyncJob()
        onActiveChangeRef.current?.(false)
        if (job.status === 'completed') {
          onCompletedRef.current?.()
        }
      }
    } else {
      lastJobStatusRef.current = null
      const stored = readStoredPgSyncJob()
      if (!stored || stored.pgCode.toUpperCase() !== json.pg_code.toUpperCase()) {
        onActiveChangeRef.current?.(false)
      }
    }
  }, [autoOpenOnActive])

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const res = await fetch('/api/pg-sync/status', { cache: 'no-store' })
      const json = (await res.json()) as PgSyncStatusPayload
      if (res.ok) applyStatusPayload(json)
    } catch {
      /* ignore transient errors */
    } finally {
      setLoading(false)
    }
  }, [applyStatusPayload, enabled])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const id = window.setInterval(() => void refresh(), STATUS_POLL_MS)
    return () => window.clearInterval(id)
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled || !activeJob?.id || isTerminal(activeJob.status)) return

    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/pg-sync/jobs/${encodeURIComponent(activeJob.id)}`, {
          cache: 'no-store',
        })
        const json = (await res.json()) as { ok?: boolean; job?: PgSyncJobView }
        if (!res.ok || !json.job) return

        const prev = lastJobStatusRef.current
        if (prev !== json.job.status) {
          notifyForJobStatusTransition({
            jobId: json.job.id,
            prevStatus: prev,
            nextStatus: json.job.status,
            onOpen: () => onOpenModalRef.current(),
          })
          lastJobStatusRef.current = json.job.status
        }

        setActiveJob(json.job)

        if (isTerminal(json.job.status)) {
          clearStoredPgSyncJob()
          onActiveChangeRef.current?.(false)
          if (json.job.status === 'completed') onCompletedRef.current?.()
          void refresh()
        } else {
          onActiveChangeRef.current?.(true)
        }
      } catch {
        /* ignore */
      }
    }, JOB_POLL_MS)

    return () => window.clearInterval(id)
  }, [activeJob?.id, activeJob?.status, enabled, refresh])

  const enableNotifications = useCallback(async () => {
    const perm = await requestPgSyncNotificationPermission()
    setNotifyPermission(perm)
    return perm
  }, [])

  return {
    queueInfo,
    activeJob,
    loading,
    notifyPermission,
    enableNotifications,
    refresh,
  }
}
