'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  mergeLiveScreenshot,
  snapshotsFromEvents,
  type PgSyncStepScreenshot,
} from '@/app/lib/pg-sync/screenshots'
import type { PgSyncJobView, PgSyncJobEventsView } from '@/app/lib/pg-sync/types'

type BrowserSnapshotState = {
  liveSrc: string | null
  steps: PgSyncStepScreenshot[]
  browserLiveUrl: string | null
  loading: boolean
}

const EMPTY: BrowserSnapshotState = {
  liveSrc: null,
  steps: [],
  browserLiveUrl: null,
  loading: false,
}

export function usePgSyncBrowserSnapshots(
  job: PgSyncJobView | null,
  jobId: string | null,
  enabled: boolean
): BrowserSnapshotState {
  const [state, setState] = useState<BrowserSnapshotState>(EMPTY)
  const lastEventsFetchRef = useRef(0)
  const eventsCacheRef = useRef<PgSyncStepScreenshot[]>([])

  const applyJob = useCallback((next: PgSyncJobView, events: PgSyncStepScreenshot[]) => {
    setState({
      ...mergeLiveScreenshot(next, events),
      loading: false,
    })
  }, [])

  const fetchEvents = useCallback(async (id: string): Promise<PgSyncStepScreenshot[]> => {
    const res = await fetch(`/api/pg-sync/jobs/${encodeURIComponent(id)}/events`, {
      cache: 'no-store',
    })
    const json = (await res.json()) as PgSyncJobEventsView & { ok?: boolean; error?: string }
    if (!res.ok || !json.events) return eventsCacheRef.current
    const snapshots = snapshotsFromEvents(json.events)
    eventsCacheRef.current = snapshots
    return snapshots
  }, [])

  useEffect(() => {
    if (!enabled || !job || !jobId) {
      setState(EMPTY)
      eventsCacheRef.current = []
      lastEventsFetchRef.current = 0
      return
    }

    applyJob(job, eventsCacheRef.current)

    const now = Date.now()
    const shouldFetchEvents = now - lastEventsFetchRef.current > 4000
    if (!shouldFetchEvents) return

    setState((prev) => ({
      ...prev,
      loading: prev.steps.length === 0 && !prev.liveSrc,
    }))

    let cancelled = false
    void fetchEvents(jobId)
      .then((events) => {
        if (cancelled) return
        lastEventsFetchRef.current = Date.now()
        applyJob(job, events)
      })
      .catch(() => {
        if (cancelled) return
        applyJob(job, eventsCacheRef.current)
      })

    return () => {
      cancelled = true
    }
  }, [job, jobId, enabled, fetchEvents, applyJob])

  return state
}
