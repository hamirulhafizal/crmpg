'use client'

import type { TriggerRunSchedule } from '@/app/lib/campaigns/trigger-schedule'

export function TriggerRunScheduleFields({
  schedule,
  onChange,
  hint,
}: {
  schedule: TriggerRunSchedule
  onChange: (patch: Partial<TriggerRunSchedule>) => void
  hint?: string
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(schedule.run_date)}
            onChange={(e) => onChange({ run_date: e.target.checked ? schedule.run_date || todayDateLocal() : '' })}
          />
          Run from date
        </label>
        {schedule.run_date ? (
          <input
            type="date"
            className="input text-black"
            value={schedule.run_date}
            onChange={(e) => onChange({ run_date: e.target.value })}
          />
        ) : (
          <p className="text-sm text-slate-500">No start date — can run immediately when active.</p>
        )}
      </div>

      <div>
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(schedule.run_time)}
            onChange={(e) => onChange({ run_time: e.target.checked ? schedule.run_time || '08:00' : '' })}
          />
          Run at time
        </label>
        {schedule.run_time ? (
          <input
            type="time"
            className="input text-black"
            value={schedule.run_time}
            onChange={(e) => onChange({ run_time: e.target.value })}
          />
        ) : (
          <p className="text-sm text-slate-500">No fixed time — cron runs whenever it fires.</p>
        )}
      </div>

      {hint ? <p className="hint">{hint}</p> : (
        <p className="hint">
          When set, cron runs on each tick after this local time until midnight. Uncheck to allow anytime.
        </p>
      )}
    </div>
  )
}

function todayDateLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
