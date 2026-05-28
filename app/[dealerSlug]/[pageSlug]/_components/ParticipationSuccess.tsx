'use client'

import { useCallback, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

type ParticipationSuccessProps = {
  open: boolean
  participatedAt: string
  pageTitle: string
  customerName?: string | null
  onDismiss: () => void
}

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-MY', {
      dateStyle: 'full',
      timeStyle: 'medium',
      timeZone: 'Asia/Kuala_Lumpur',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function ParticipationSuccess({
  open,
  participatedAt,
  pageTitle,
  customerName,
  onDismiss,
}: ParticipationSuccessProps) {
  const frameRef = useRef<number | null>(null)

  const fireConfetti = useCallback(() => {
    const duration = 2500
    const end = Date.now() + duration
    const colors = ['#f59e0b', '#fbbf24', '#fcd34d', '#ffffff', '#fde68a']

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        colors,
        zIndex: 200,
      })
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.65 },
        colors,
        zIndex: 200,
      })
      if (Date.now() < end) {
        frameRef.current = requestAnimationFrame(frame)
      }
    }
    frame()
  }, [])

  useEffect(() => {
    if (!open) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      return
    }
    fireConfetti()
    const interval = window.setInterval(fireConfetti, 2800)
    return () => {
      window.clearInterval(interval)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [open, fireConfetti])

  if (!open) return null

  const timestamp = formatTimestamp(participatedAt)

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="participation-success-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 px-6 py-8 text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-3xl">
            🎉
          </div>
          <h2 id="participation-success-title" className="text-2xl font-bold">
            You&apos;re in!
          </h2>
          <p className="mt-2 text-sm text-amber-100">{pageTitle}</p>
        </div>

        <div className="space-y-4 px-6 py-6">
          {customerName && (
            <p className="text-center text-sm text-slate-600">
              Thank you, <span className="font-semibold text-slate-900">{customerName}</span>
            </p>
          )}

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Participation proof
            </p>
            <p className="mt-2 font-mono text-sm font-medium text-slate-900">{timestamp}</p>
            <p className="mt-3 text-xs leading-relaxed text-amber-900/80">
              Screenshot this screen and send it to your dealer&apos;s WhatsApp group as proof of
              participation.
            </p>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
