'use client'

import dynamic from 'next/dynamic'
import { useCallback, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import {
  formatLocationAccuracyMeters,
} from '@/app/lib/reverse-geocode'
import type { LuckyDrawQuestion, LuckyDrawQuestionType } from '@/app/lib/lucky-draw/types'
import { LUCKY_DRAW_PURPOSE_TAG_CATEGORY_KEY } from '@/app/lib/lucky-draw/constants'

const InlineLocationMap = dynamic(
  () => import('@/app/pg-gold-saver/_components/InlineLocationMap').then((m) => m.InlineLocationMap),
  { ssr: false }
)

type TagRow = { id: string; category_id: string; label: string }
type TagCategory = {
  id: string
  key?: string
  name: string
  allows_multiple: boolean
  tags: TagRow[]
}

type LuckyDrawQuestionnaireProps = {
  open: boolean
  pageId: string
  pageTitle: string
  customQuestions: LuckyDrawQuestion[]
  tagCatalog: TagCategory[]
  onClose: () => void
  onComplete: (participatedAt: string) => void
}

type Step =
  | { kind: 'purpose' }
  | { kind: 'location' }
  | { kind: 'custom'; question: LuckyDrawQuestion }

function tagLabel(catalog: TagCategory[], tagId: string): string {
  for (const cat of catalog) {
    const t = cat.tags.find((x) => x.id === tagId)
    if (t) return t.label
  }
  return tagId
}

export function LuckyDrawQuestionnaire({
  open,
  pageId,
  pageTitle,
  customQuestions,
  tagCatalog,
  onClose,
  onComplete,
}: LuckyDrawQuestionnaireProps) {
  const steps = useMemo<Step[]>(() => {
    const list: Step[] = [{ kind: 'purpose' }, { kind: 'location' }]
    for (const q of customQuestions) {
      list.push({ kind: 'custom', question: q })
    }
    return list
  }, [customQuestions])

  const financialGoalCategories = useMemo(
    () =>
      tagCatalog.filter(
        (cat) => (cat.key ?? '').toLowerCase() === LUCKY_DRAW_PURPOSE_TAG_CATEGORY_KEY
      ),
    [tagCatalog]
  )

  const [stepIndex, setStepIndex] = useState(0)
  const [purposeTagIds, setPurposeTagIds] = useState<string[]>([])
  const [locationText, setLocationText] = useState('')
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLng, setLocationLng] = useState<number | null>(null)
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [customAnswers, setCustomAnswers] = useState<Record<string, unknown>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const step = steps[stepIndex]
  const isLast = stepIndex >= steps.length - 1

  const AUTO_ADVANCE_MS = 220

  const showContinueButton =
    step?.kind === 'purpose' ||
    step?.kind === 'location' ||
    (step?.kind === 'custom' && step.question.question_type === 'text')

  const scheduleAdvance = useCallback((advance: () => void) => {
    window.setTimeout(advance, AUTO_ADVANCE_MS)
  }, [])

  const submitEntry = useCallback(
    async (overrides?: {
      customAnswers?: Record<string, unknown>
      purposeTagIds?: string[]
      locationText?: string
      locationLat?: number | null
      locationLng?: number | null
    }) => {
      setSubmitting(true)
      setError(null)
      try {
        const answers = overrides?.customAnswers ?? customAnswers
        const tags = overrides?.purposeTagIds ?? purposeTagIds
        const locText = overrides?.locationText ?? locationText
        const locLat = overrides?.locationLat !== undefined ? overrides.locationLat : locationLat
        const locLng = overrides?.locationLng !== undefined ? overrides.locationLng : locationLng

        const payloadAnswers = customQuestions.map((q) => {
          const key = q.id ?? q.question_text
          let value = answers[key]
          if (q.question_type === 'tag_picker' && Array.isArray(value)) {
            value = (value as string[]).map((id) => ({ id, label: tagLabel(tagCatalog, id) }))
          }
          return {
            question_id: q.id ?? key,
            question_text: q.question_text,
            question_type: q.question_type as LuckyDrawQuestionType,
            value,
          }
        })

        const res = await fetch(`/api/customer-portal/lucky-draw/${pageId}/enter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purpose_tag_ids: tags,
            location_text: locText,
            location_lat: locLat,
            location_lng: locLng,
            custom_answers: payloadAnswers,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Could not submit entry')
        onComplete(json.participated_at as string)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Submission failed')
      } finally {
        setSubmitting(false)
      }
    },
    [
      customAnswers,
      customQuestions,
      locationLat,
      locationLng,
      locationText,
      onComplete,
      pageId,
      purposeTagIds,
      tagCatalog,
    ]
  )

  const togglePurposeTag = (tagId: string, categoryId: string) => {
    const cat = tagCatalog.find((c) => c.id === categoryId)
    const allowsMultiple = cat?.allows_multiple !== false

    setPurposeTagIds((prev) => {
      if (prev.includes(tagId)) return prev.filter((id) => id !== tagId)
      if (!allowsMultiple) {
        const catTagIds = new Set(cat?.tags.map((t) => t.id) ?? [])
        return [...prev.filter((id) => !catTagIds.has(id)), tagId]
      }
      return [...prev, tagId]
    })
    setError(null)
  }

  const handleLocationPick = useCallback(
    (coords: { lat: number; lng: number }, label: string, accuracy?: number | null) => {
      setLocationText(label)
      setLocationLat(coords.lat)
      setLocationLng(coords.lng)
      setLocationAccuracy(accuracy ?? null)
      setLocationError(null)
    },
    []
  )

  const handleCustomAnswerSelect = (key: string, value: unknown) => {
    const nextAnswers = { ...customAnswers, [key]: value }
    setCustomAnswers(nextAnswers)
    setError(null)
    const currentIndex = stepIndex
    scheduleAdvance(() => {
      if (currentIndex >= steps.length - 1) {
        void submitEntry({ customAnswers: nextAnswers })
      } else {
        setStepIndex(currentIndex + 1)
      }
    })
  }

  const validateStep = (): string | null => {
    if (!step) return 'Invalid step'
    if (step.kind === 'purpose') {
      if (purposeTagIds.length === 0) return 'Select at least one saving purpose.'
      return null
    }
    if (step.kind === 'location') {
      if (!locationText.trim() || locationLat == null || locationLng == null) {
        return 'Please pin your town on the map or tap Locate me.'
      }
      return null
    }
    const q = step.question
    if (!q.is_required) return null
    const val = customAnswers[q.id ?? q.question_text]
    if (q.question_type === 'yes_no') {
      if (val !== 'yes' && val !== 'no') return 'Please answer this question.'
      return null
    }
    if (q.question_type === 'tag_picker') {
      const ids = Array.isArray(val) ? val : []
      if (ids.length === 0) return 'Select at least one option.'
      return null
    }
    if (q.question_type === 'multiple_choice') {
      if (typeof val !== 'string' || !val.trim()) return 'Please select an option.'
      return null
    }
    if (typeof val !== 'string' || !val.trim()) return 'Please enter your answer.'
    return null
  }

  const handleNext = async () => {
    const validationError = validateStep()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)

    if (!isLast) {
      setStepIndex((i) => i + 1)
      return
    }

    await submitEntry()
  }

  const renderCustomInput = (q: LuckyDrawQuestion) => {
    const key = q.id ?? q.question_text
    const val = customAnswers[key]

    if (q.question_type === 'yes_no') {
      return (
        <div className="flex gap-3">
          {(['yes', 'no'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => handleCustomAnswerSelect(key, opt)}
              disabled={submitting}
              className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition active:scale-[0.98] ${
                val === opt
                  ? 'border-amber-500 bg-amber-50 text-amber-900'
                  : 'border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )
    }

    if (q.question_type === 'multiple_choice') {
      return (
        <div className="space-y-2">
          {(q.options ?? []).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => handleCustomAnswerSelect(key, opt)}
              disabled={submitting}
              className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition active:scale-[0.98] ${
                val === opt
                  ? 'border-amber-500 bg-amber-50 text-amber-900'
                  : 'border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )
    }

    if (q.question_type === 'tag_picker') {
      const selected = Array.isArray(val) ? (val as string[]) : []
      return (
        <div className="flex flex-wrap gap-2">
          {financialGoalCategories.flatMap((cat) =>
            cat.tags.map((tag) => {
              const active = selected.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    if (active || submitting) return
                    handleCustomAnswerSelect(key, [tag.id])
                  }}
                  disabled={submitting}
                  className={`rounded-full px-3 py-1.5 text-sm transition active:scale-[0.98] ${
                    active
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tag.label}
                </button>
              )
            })
          )}
        </div>
      )
    }

    return (
      <textarea
        value={typeof val === 'string' ? val : ''}
        onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [key]: e.target.value }))}
        rows={3}
        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
        placeholder="Your answer"
      />
    )
  }

  if (!open || !step) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lucky-draw-question-title"
      >
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              {pageTitle}
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <h2 id="lucky-draw-question-title" className="text-lg font-semibold text-slate-900">
                Step {stepIndex + 1} of {steps.length}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step.kind === 'purpose' && (
              <div className="space-y-4">
                <p className="text-base font-medium text-slate-900">
                  What is your purpose for saving gold right now?
                </p>
                {financialGoalCategories.map((cat) => (
                  <div key={cat.id}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {cat.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {cat.tags.map((tag) => {
                        const active = purposeTagIds.includes(tag.id)
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => togglePurposeTag(tag.id, cat.id)}
                            disabled={submitting}
                            className={`rounded-full px-3 py-1.5 text-sm transition active:scale-[0.98] ${
                              active
                                ? 'bg-amber-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {tag.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {step.kind === 'location' && (
              <div className="space-y-4">
                <p className="text-base font-medium text-slate-900">What is your location?</p>
                <p className="text-sm text-slate-600">
                  Tap on the map to pin your town, or use Locate me if GPS is accurate on your device.
                </p>

                <InlineLocationMap
                  lat={locationLat}
                  lng={locationLng}
                  locating={locating}
                  onLocatingChange={setLocating}
                  onLocationPick={handleLocationPick}
                  onError={(message) => setLocationError(message || null)}
                />

                {locationText && (
                  <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <div>
                      <span>{locationText}</span>
                      {formatLocationAccuracyMeters(locationAccuracy ?? undefined) && (
                        <p className="mt-1 text-xs text-slate-500">
                          {formatLocationAccuracyMeters(locationAccuracy ?? undefined)}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {locationError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {locationError}
                  </p>
                )}
              </div>
            )}

            {step.kind === 'custom' && (
              <div className="space-y-4">
                <p className="text-base font-medium text-slate-900">{step.question.question_text}</p>
                {renderCustomInput(step.question)}
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 px-6 py-4">
            {(stepIndex > 0 || showContinueButton) && (
              <div className="flex gap-2">
                {stepIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      setStepIndex((i) => i - 1)
                    }}
                    disabled={submitting}
                    className={`rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 ${
                      showContinueButton ? '' : 'flex-1'
                    }`}
                  >
                    Back
                  </button>
                )}
                {showContinueButton && (
                  <button
                    type="button"
                    onClick={() => void handleNext()}
                    disabled={submitting}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {submitting ? 'Submitting…' : isLast ? 'Complete entry' : 'Continue'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
  )
}
