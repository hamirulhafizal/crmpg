'use client'

import { TemplateVariableButtons } from '@/app/dashboard/campaigns/_components/TemplateVariableButtons'

export type StepDraft = {
  step_order: number
  delay_days: number
  send_time: string
  message_template: string
}

export function CampaignStepsEditor({
  steps,
  onChange,
}: {
  steps: StepDraft[]
  onChange: (steps: StepDraft[]) => void
}) {
  const update = (index: number, patch: Partial<StepDraft>) => {
    const next = steps.map((s, i) => (i === index ? { ...s, ...patch } : s))
    onChange(next)
  }

  const add = () => {
    const order = steps.length ? Math.max(...steps.map((s) => s.step_order)) + 1 : 1
    onChange([
      ...steps,
      {
        step_order: order,
        delay_days: 0,
        send_time: '10:00',
        message_template: 'Hello {{name}}, …',
      },
    ])
  }

  const remove = (index: number) => {
    onChange(steps.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      {steps.map((step, i) => (
        <div key={`${step.step_order}-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Step {step.step_order}</p>
            {steps.length > 1 ? (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
              Order
              <input
                type="number"
                min={1}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal"
                value={step.step_order}
                onChange={(e) => update(i, { step_order: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
              Delay (days after previous)
              <input
                type="number"
                min={0}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal"
                value={step.delay_days}
                onChange={(e) => update(i, { delay_days: Number(e.target.value) })}
              />
              <span className="font-normal text-slate-500">
                0 = same calendar day at send time (must be after the previous send). 1 = next day, etc. Stored as{' '}
                <code className="rounded bg-slate-100 px-1">campaign_steps.delay_days</code>.
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 sm:col-span-3">
              Send time
              <label className="flex items-center gap-2 font-normal text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(step.send_time)}
                  onChange={(e) =>
                    update(i, { send_time: e.target.checked ? step.send_time || '10:00' : '' })
                  }
                />
                Schedule at a fixed time
              </label>
              {step.send_time ? (
                <input
                  type="time"
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal"
                  value={step.send_time.length > 5 ? step.send_time.slice(0, 5) : step.send_time}
                  onChange={(e) => update(i, { send_time: e.target.value })}
                />
              ) : (
                <span className="font-normal text-slate-500">Sends immediately when the step is due.</span>
              )}
            </label>
          </div>
          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-slate-700">
            Message template
            <textarea
              rows={4}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
              value={step.message_template}
              onChange={(e) => update(i, { message_template: e.target.value })}
            />
          </label>
          <TemplateVariableButtons />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-full rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        + Add step
      </button>
    </div>
  )
}
