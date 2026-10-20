'use client'

import {
  TRIGGER_WEEKDAY_OPTIONS,
  type TriggerRunFrequency,
  type TriggerRunSchedule,
} from '@/app/lib/campaigns/trigger-schedule'

export function TriggerRunScheduleFields({
  schedule,
  onChange,
  hint,
}: {
  schedule: TriggerRunSchedule
  onChange: (patch: Partial<TriggerRunSchedule>) => void
  hint?: string
}) {
  const frequency = schedule.run_frequency ?? 'daily'

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Repeat</label>
        <select
          className="input text-black"
          value={frequency}
          onChange={(e) =>
            onChange({
              run_frequency: e.target.value as TriggerRunFrequency,
            })
          }
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {frequency === 'daily' && 'Runs every day when cron fires (after the time below, if set).'}
          {frequency === 'weekly' && 'Runs once per week on the selected weekday.'}
          {frequency === 'monthly' && 'Runs once per month on the selected day.'}
        </p>
      </div>

      {frequency === 'weekly' ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Day of week</label>
          <select
            className="input text-black"
            value={schedule.run_weekday ?? 1}
            onChange={(e) => onChange({ run_weekday: Number(e.target.value) })}
          >
            {TRIGGER_WEEKDAY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {frequency === 'monthly' ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Day of month</label>
          <input
            type="number"
            min={1}
            max={31}
            className="input text-black"
            value={schedule.run_day_of_month ?? 1}
            onChange={(e) =>
              onChange({ run_day_of_month: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })
            }
          />
          <p className="mt-1 text-xs text-slate-500">Uses campaign timezone (1–31).</p>
        </div>
      ) : null}

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
          <p className="text-sm text-slate-500">No fixed time — cron runs whenever it fires on schedule days.</p>
        )}
      </div>

      {hint ? <p className="hint">{hint}</p> : (
        <p className="hint">
          Cron runs on each matching day after the local time until midnight. Uncheck time to allow all day.
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
