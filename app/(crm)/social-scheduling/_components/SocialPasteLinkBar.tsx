'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { adminFetch } from '@/app/lib/admin-api-client'
import type { LibraryMediaAsset } from '@/app/(crm)/social-scheduling/_components/SocialMediaLibraryPicker'

export const SOCIAL_LINK_IMPORT_JOB_KEY = 'crmpg:social-link-import-job'

type JobPublic = {
  id: string
  sourceUrl: string
  platform: string | null
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progressLabel: string | null
  progressPct: number
  errorMessage: string | null
  caption: string | null
  captionSource: string | null
  asset: {
    id: string
    title: string
    publicUrl: string
    mediaType: string
    mimeType: string
    originalFilename: string
    sizeBytes?: number
    folder?: string
  } | null
}

type Props = {
  /** When the parent dialog is open — re-runs resume each time it opens. */
  active?: boolean
  disabled?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  onLockedChange?: (locked: boolean) => void
  onImported: (payload: { asset: LibraryMediaAsset; caption: string }) => void
}

function persistJobId(id: string | null) {
  try {
    if (!id) localStorage.removeItem(SOCIAL_LINK_IMPORT_JOB_KEY)
    else localStorage.setItem(SOCIAL_LINK_IMPORT_JOB_KEY, id)
  } catch {
    /* ignore */
  }
}

export function readPersistedLinkImportJobId(): string | null {
  try {
    return localStorage.getItem(SOCIAL_LINK_IMPORT_JOB_KEY)
  } catch {
    return null
  }
}

function toLibraryAsset(asset: NonNullable<JobPublic['asset']>): LibraryMediaAsset {
  return {
    id: asset.id,
    title: asset.title || asset.originalFilename || 'Imported video',
    originalFilename: asset.originalFilename || 'imported-video.mp4',
    publicUrl: asset.publicUrl,
    mediaType: asset.mediaType || 'video',
    mimeType: asset.mimeType || 'video/mp4',
    sizeBytes: asset.sizeBytes,
    folder: asset.folder,
  }
}

function placeholderJob(id: string): JobPublic {
  return {
    id,
    sourceUrl: '',
    platform: null,
    status: 'running',
    progressLabel: 'Reconnecting to background import…',
    progressPct: 5,
    errorMessage: null,
    caption: null,
    captionSource: null,
    asset: null,
  }
}

export function SocialPasteLinkBar({
  active = true,
  disabled,
  inputRef,
  onLockedChange,
  onImported,
}: Props) {
  const [url, setUrl] = useState('')
  const [job, setJob] = useState<JobPublic | null>(() => {
    const id = readPersistedLinkImportJobId()
    return id ? placeholderJob(id) : null
  })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resuming, setResuming] = useState(() => Boolean(readPersistedLinkImportJobId()))
  const appliedCompletedRef = useRef<Set<string>>(new Set())
  const onImportedRef = useRef(onImported)
  onImportedRef.current = onImported

  const locked =
    submitting ||
    resuming ||
    job?.status === 'queued' ||
    job?.status === 'running'

  useEffect(() => {
    onLockedChange?.(locked)
  }, [locked, onLockedChange])

  const applyCompleted = useCallback((next: JobPublic) => {
    if (next.status !== 'completed' || !next.asset?.id || !next.asset.publicUrl) return
    if (appliedCompletedRef.current.has(next.id)) return
    appliedCompletedRef.current.add(next.id)
    persistJobId(null)
    setResuming(false)
    onImportedRef.current({
      asset: toLibraryAsset(next.asset),
      caption: typeof next.caption === 'string' ? next.caption : '',
    })
    setUrl('')
  }, [])

  const handleJobSnapshot = useCallback(
    (next: JobPublic) => {
      setJob(next)
      if (next.status === 'queued' || next.status === 'running') {
        persistJobId(next.id)
        setResuming(false)
        return
      }
      if (next.status === 'completed') {
        applyCompleted(next)
        return
      }
      if (next.status === 'failed') {
        persistJobId(null)
        setResuming(false)
        setError(next.errorMessage || 'Import failed.')
        return
      }
      // cancelled
      persistJobId(null)
      setResuming(false)
      setJob(null)
    },
    [applyCompleted]
  )

  const fetchJobById = useCallback(async (jobId: string): Promise<JobPublic | null> => {
    const res = await adminFetch(
      `/api/social-scheduling/media/import-link?jobId=${encodeURIComponent(jobId)}`
    )
    const json = await res.json().catch(() => ({} as { error?: string; job?: JobPublic }))
    if (res.status === 404) return null
    if (!res.ok) {
      throw new Error(typeof json.error === 'string' ? json.error : `Status failed (${res.status})`)
    }
    return json.job ?? null
  }, [])

  const fetchActiveJob = useCallback(async (): Promise<JobPublic | null> => {
    const res = await adminFetch('/api/social-scheduling/media/import-link?active=1')
    const json = await res.json().catch(() => ({} as { error?: string; job?: JobPublic }))
    if (!res.ok) {
      throw new Error(typeof json.error === 'string' ? json.error : `Status failed (${res.status})`)
    }
    return json.job ?? null
  }, [])

  // Resume whenever the dialog becomes active again.
  useEffect(() => {
    if (!active) return

    let cancelled = false
    const persisted = readPersistedLinkImportJobId()

    // Show locked UI immediately so reopen isn't a blank paste field.
    if (persisted) {
      setResuming(true)
      setJob((prev) => prev ?? placeholderJob(persisted))
      setError(null)
    } else {
      setResuming(true)
    }

    ;(async () => {
      try {
        let next: JobPublic | null = null
        if (persisted) {
          next = await fetchJobById(persisted)
        }
        if (!next) {
          next = await fetchActiveJob()
        }
        if (cancelled) return

        if (next) {
          handleJobSnapshot(next)
        } else {
          persistJobId(null)
          setJob(null)
          setResuming(false)
        }
      } catch (err) {
        if (cancelled) return
        // Keep placeholder locked UI if we still have a persisted id; poll will retry.
        const still = readPersistedLinkImportJobId()
        if (!still) {
          setResuming(false)
          setJob(null)
        }
        setError(err instanceof Error ? err.message : 'Could not resume background import')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, fetchActiveJob, fetchJobById, handleJobSnapshot])

  // Poll while locked / resuming.
  useEffect(() => {
    if (!active) return
    const id = job?.id || readPersistedLinkImportJobId()
    if (!id) return
    if (job && job.status !== 'queued' && job.status !== 'running' && !resuming) return

    let stopped = false
    const tick = async () => {
      try {
        const next = await fetchJobById(id)
        if (stopped) return
        if (!next) {
          const activeJob = await fetchActiveJob()
          if (stopped) return
          if (activeJob) handleJobSnapshot(activeJob)
          else {
            persistJobId(null)
            setResuming(false)
            setJob(null)
          }
          return
        }
        handleJobSnapshot(next)
      } catch (err) {
        if (stopped) return
        setError(err instanceof Error ? err.message : 'Could not refresh import status')
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 2000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [active, job, resuming, fetchJobById, fetchActiveJob, handleJobSnapshot])

  const submit = async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setError('Paste a video link first.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await adminFetch('/api/social-scheduling/media/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const json = await res.json().catch(() => ({} as { error?: string; job?: JobPublic }))
      if (!res.ok || !json.job) {
        throw new Error(typeof json.error === 'string' ? json.error : `Import failed (${res.status})`)
      }
      handleJobSnapshot(json.job)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setJob(null)
      setResuming(false)
      persistJobId(null)
    } finally {
      setSubmitting(false)
    }
  }

  const dismissFailed = () => {
    setJob(null)
    setError(null)
    setResuming(false)
    persistJobId(null)
  }

  const showProgress = locked && (job || resuming)

  return (
    <div className="rounded-xl border border-white/10 bg-[#1c1c1f] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Paste video link</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">
            YouTube · Instagram · TikTok · Facebook — runs in the background even if you close the app.
          </p>
        </div>
        {locked ? (
          <span className="shrink-0 rounded-full bg-[#7c5cff]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c4b5fd]">
            Locked
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <label className="sr-only" htmlFor="paste-video-url">
          Video URL
        </label>
        <input
          ref={inputRef}
          id="paste-video-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled || locked}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (!locked && !disabled) void submit()
            }
          }}
          placeholder="https://www.facebook.com/share/r/…"
          className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#7c5cff]/60 disabled:opacity-55"
        />
        <button
          type="button"
          disabled={disabled || locked || !url.trim()}
          onClick={() => void submit()}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#7c5cff] px-4 text-sm font-semibold text-white hover:bg-[#6d4fff] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
        >
          {locked ? 'Importing…' : 'Import'}
        </button>
      </div>

      {showProgress ? (
        <div className="mt-3 rounded-lg border border-[#7c5cff]/30 bg-[#7c5cff]/10 px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm text-[#e9e0ff]">
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-[#c4b5fd]"
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {job?.progressLabel || 'Processing in background…'}
            </span>
            <span className="shrink-0 text-[11px] text-[#c4b5fd]/80">
              {job?.progressPct ?? 5}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-[#a78bfa] transition-[width] duration-500"
              style={{ width: `${Math.max(4, Math.min(100, job?.progressPct ?? 5))}%` }}
            />
          </div>
          {job?.sourceUrl ? (
            <p className="mt-2 truncate text-[11px] text-white/45">{job.sourceUrl}</p>
          ) : (
            <p className="mt-2 text-[11px] text-white/45">Resuming your previous import…</p>
          )}
          <p className="mt-1 text-[11px] text-white/40">
            Safe to close this dialog — import continues on the server.
          </p>
        </div>
      ) : null}

      {job?.status === 'failed' || error ? (
        <div className="mt-3 flex items-start justify-between gap-2 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
          <p className="min-w-0 flex-1">{error || job?.errorMessage || 'Import failed'}</p>
          <button
            type="button"
            onClick={dismissFailed}
            className="shrink-0 rounded-md px-2 py-0.5 text-xs text-rose-100/80 hover:bg-white/5"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  )
}
