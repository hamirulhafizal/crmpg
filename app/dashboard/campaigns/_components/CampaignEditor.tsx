'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { CampaignAudienceFilters, CampaignStatus, CampaignTriggerType } from '@/app/lib/campaigns/types'
import { AudienceBuilder } from '@/app/dashboard/campaigns/_components/AudienceBuilder'
import { CampaignStepsEditor, type StepDraft } from '@/app/dashboard/campaigns/_components/CampaignStepsEditor'

function sendTimeFromDb(s: string): string {
  return s.length >= 5 ? s.slice(0, 5) : '10:00'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Value for `<input type="datetime-local" />` (local wall time, no timezone suffix). */
function formatDateTimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** DB ISO string → local datetime-local value (slice(0,16) on UTC ISO is wrong for this input). */
function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return formatDateTimeLocalValue(d)
}

function localNowPlusMinutes(minutes: number): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + minutes)
  return formatDateTimeLocalValue(d)
}

/** datetime-local string is interpreted as local time; returns UTC ISO for the API. */
function datetimeLocalToIsoUtc(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function CampaignEditor(props: {
  mode: 'create' | 'edit'
  campaignId?: string
  /** When set, replaces default navigation after save. */
  onSaveSuccess?: (ctx: { id: string; mode: 'create' | 'edit' }) => void
  /** When set, replaces router.back() on Cancel. */
  onCancel?: () => void
  initial?: {
    name: string
    description: string | null
    status: CampaignStatus
    trigger_type: CampaignTriggerType
    trigger_offset_days: number
    timezone: string | null
    audience_filters: CampaignAudienceFilters
    daily_send_limit: number
    cooldown_days: number
    start_at: string | null
    end_at: string | null
    steps: Array<{
      step_order: number
      delay_days: number
      send_time: string
      message_template: string
    }>
  }
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(props.initial?.name ?? '')
  const [description, setDescription] = useState(props.initial?.description ?? '')
  const [status, setStatus] = useState<CampaignStatus>(props.initial?.status ?? 'draft')
  const [triggerType, setTriggerType] = useState<CampaignTriggerType>(props.initial?.trigger_type ?? 'manual')
  const [triggerOffsetDays, setTriggerOffsetDays] = useState(props.initial?.trigger_offset_days ?? 0)
  const [timezone, setTimezone] = useState(props.initial?.timezone ?? 'Asia/Kuala_Lumpur')
  const [filters, setFilters] = useState<CampaignAudienceFilters>(props.initial?.audience_filters ?? {})
  const [dailyLimit, setDailyLimit] = useState(props.initial?.daily_send_limit ?? 100)
  const [cooldownDays, setCooldownDays] = useState(props.initial?.cooldown_days ?? 30)
  const [startAt, setStartAt] = useState(() => {
    if (props.initial?.start_at) return isoToDatetimeLocalValue(props.initial.start_at)
    if (props.mode === 'create') return localNowPlusMinutes(3)
    return ''
  })
  const [endAt, setEndAt] = useState(() => isoToDatetimeLocalValue(props.initial?.end_at ?? null))

  useEffect(() => {
    if (props.mode !== 'edit' || !props.initial) return
    setStartAt(props.initial.start_at ? isoToDatetimeLocalValue(props.initial.start_at) : '')
    setEndAt(isoToDatetimeLocalValue(props.initial.end_at ?? null))
  }, [props.mode, props.initial?.start_at, props.initial?.end_at])

  const initialSteps: StepDraft[] = useMemo(() => {
    const ini = props.initial
    if (ini?.steps?.length) {
      return ini.steps.map((s) => ({
        step_order: s.step_order,
        delay_days: s.delay_days,
        send_time: sendTimeFromDb(s.send_time),
        message_template: s.message_template,
      }))
    }
    return [
      {
        step_order: 1,
        delay_days: 0,
        send_time: '10:00',
        message_template: 'Hello {{name}}, …',
      },
    ]
  }, [props.initial])

  const [steps, setSteps] = useState<StepDraft[]>(initialSteps)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const startIso = datetimeLocalToIsoUtc(startAt)
      const endIso = datetimeLocalToIsoUtc(endAt)
      if (startAt.trim() && !startIso) {
        setError('Invalid start date / time')
        setSaving(false)
        return
      }
      if (endAt.trim() && !endIso) {
        setError('Invalid end date / time')
        setSaving(false)
        return
      }

      const payload = {
        name,
        description,
        status,
        trigger_type: triggerType,
        trigger_offset_days: triggerOffsetDays,
        timezone,
        audience_filters: filters,
        daily_send_limit: dailyLimit,
        cooldown_days: cooldownDays,
        start_at: startIso,
        end_at: endIso,
        steps: steps.map((s) => ({
          step_order: s.step_order,
          delay_days: s.delay_days,
          send_time: s.send_time,
          message_template: s.message_template,
          is_active: true,
        })),
      }

      if (props.mode === 'create') {
        const res = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed')
        const newId = json.data.id as string
        if (props.onSaveSuccess) {
          props.onSaveSuccess({ id: newId, mode: 'create' })
        } else {
          router.push(`/dashboard/campaigns/${newId}`)
          router.refresh()
        }
      } else if (props.campaignId) {
        const res = await fetch(`/api/campaigns/${props.campaignId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed')
        if (props.onSaveSuccess) {
          props.onSaveSuccess({ id: props.campaignId, mode: 'edit' })
        } else {
          router.push(`/dashboard/campaigns/${props.campaignId}`)
          router.refresh()
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Basic info</h2>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Description</span>
          <textarea
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 text-slate-900">Status</span>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
              value={status}
              onChange={(e) => setStatus(e.target.value as CampaignStatus)}
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="completed">completed</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Trigger</span>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as CampaignTriggerType)}
            >
              <option value="manual">manual / audience sync</option>
              <option value="enrollment">enrollment</option>
              <option value="birthday">birthday</option>
              <option value="last_purchase">last purchase</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 text-slate-900">Trigger offset days (e.g. −3 before birthday)</span>
          <input
            type="number"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
            value={triggerOffsetDays}
            onChange={(e) => setTriggerOffsetDays(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 text-slate-900">Timezone</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Audience</h2>
        <AudienceBuilder value={filters} onChange={setFilters} />
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Limits & window</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 text-slate-900">Daily send limit</span>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Cooldown (days, stored on campaign)</span>
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              Jarak antara langkah ikut &quot;delay&quot; setiap langkah di bawah — bukan nilai ini.
            </span>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
              value={cooldownDays}
              onChange={(e) => setCooldownDays(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Start at (optional)</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">End at (optional)</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Steps</h2>
        <CampaignStepsEditor steps={steps} onChange={setSteps} />
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => (props.onCancel ? props.onCancel() : router.back())}
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || !name.trim()}
          onClick={() => void submit()}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : props.mode === 'create' ? 'Create campaign' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
