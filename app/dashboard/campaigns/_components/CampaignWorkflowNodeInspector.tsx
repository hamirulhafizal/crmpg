'use client'

import type { WorkflowEditorDraft, WorkflowEditorStep } from '@/app/lib/campaigns/workflow-layout'
import { sendTimeLabel } from '@/app/lib/campaigns/workflow-layout'
import type { CampaignTriggerType } from '@/app/lib/campaigns/types'
import { AudienceBuilder } from '@/app/dashboard/campaigns/_components/AudienceBuilder'
import { CUSTOMER_MESSAGE_TEMPLATE_COLUMNS } from '@/app/lib/campaigns/template'
import { WORKFLOW_NODE } from '@/app/lib/campaigns/workflow-events'
import { definitionToDraft, draftToDefinition } from '@/app/lib/workflows/sync'

const TRIGGERS: { value: CampaignTriggerType; label: string }[] = [
  { value: 'manual', label: 'Manual (run / cron sync)' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'last_purchase', label: 'Last purchase' },
  { value: 'enrollment', label: 'On enrollment' },
]

function stepIndexFromNodeId(nodeId: string, steps: WorkflowEditorStep[]): number {
  const m = /^step-(\d+)$/.exec(nodeId)
  if (!m) return -1
  const order = Number(m[1])
  return steps.findIndex((s) => s.step_order === order)
}

type Props = {
  selectedNodeId: string | null
  draft: WorkflowEditorDraft
  onChange: (draft: WorkflowEditorDraft) => void
  onClose: () => void
}

export function CampaignWorkflowNodeInspector({ selectedNodeId, draft, onChange, onClose }: Props) {
  if (!selectedNodeId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-sm font-medium text-slate-700">Select a node</p>
        <p className="mt-1 max-w-[220px] text-xs text-slate-500">
          Click a node on the canvas to edit its settings, or drag nodes to rearrange the flow.
        </p>
      </div>
    )
  }

  const patch = (partial: Partial<WorkflowEditorDraft>) => onChange({ ...draft, ...partial })

  const defNode = draft.definition?.nodes.find((n) => n.id === selectedNodeId)
  const nodeType =
    defNode?.type ??
    (selectedNodeId === WORKFLOW_NODE.trigger
      ? 'crm.trigger.manual'
      : selectedNodeId === WORKFLOW_NODE.audience
        ? 'crm.audience.filter'
        : selectedNodeId === WORKFLOW_NODE.enroll
          ? 'crm.enroll.queue'
          : selectedNodeId === WORKFLOW_NODE.complete
            ? 'crm.flow.complete'
            : /^step-\d+$/.test(selectedNodeId)
              ? 'crm.whatsapp.send'
              : null)

  if (nodeType === 'crm.trigger.manual') {
    return (
      <InspectorShell title="Trigger" subtitle="When customers enter this campaign" onClose={onClose}>
        <label className="field">
          <span>Trigger type</span>
          <select
            value={draft.trigger_type}
            onChange={(e) => patch({ trigger_type: e.target.value as CampaignTriggerType })}
            className="input text-black"
          >
            {TRIGGERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Offset (days)</span>
          <input
            type="number"
            className="input text-black"
            value={draft.trigger_offset_days}
            onChange={(e) => patch({ trigger_offset_days: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="hint">Days before/after the trigger event (birthday, last purchase, etc.).</span>
        </label>
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.audience.filter') {
    return (
      <InspectorShell title="Audience" subtitle="CRM filters for who can enroll" onClose={onClose}>
        <AudienceBuilder value={draft.audience_filters} onChange={(audience_filters) => patch({ audience_filters })} />
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.enroll.queue') {
    return (
      <InspectorShell title="Enroll & send limits" subtitle="Queue and rate limits" onClose={onClose}>
        <label className="field">
          <span>Daily send limit</span>
          <input
            type="number"
            min={1}
            className="input text-black"
            value={draft.daily_send_limit}
            onChange={(e) => patch({ daily_send_limit: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="field">
          <span>Cooldown (days)</span>
          <input
            type="number"
            min={0}
            className="input text-black"
            value={draft.cooldown_days}
            onChange={(e) => patch({ cooldown_days: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="hint">Minimum days between campaign touches for the same customer.</span>
        </label>
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.flow.complete') {
    return (
      <InspectorShell title="Done" subtitle="End of the automation path" onClose={onClose}>
        <p className="text-sm text-slate-600">
          Marks enrollments complete after all active steps are sent. This node has no settings.
        </p>
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.whatsapp.send') {
  const stepIdx = stepIndexFromNodeId(selectedNodeId, draft.steps)
  if (stepIdx < 0 && defNode) {
    const order = Number((defNode.parameters.step_order as number) ?? 1)
    const newStep: WorkflowEditorStep = {
      step_order: order,
      delay_days: Number(defNode.parameters.delay_days ?? 0),
      send_time: String(defNode.parameters.send_time ?? '10:00'),
      message_template: String(defNode.parameters.message_template ?? ''),
      is_active: defNode.parameters.is_active !== false,
    }
    return (
      <InspectorShell title={`Step ${order}`} subtitle="WhatsApp message" onClose={onClose}>
        <p className="text-sm text-slate-600">Syncing step fields… save workflow to persist.</p>
        <button
          type="button"
          className="mt-2 text-sm font-medium text-violet-700"
          onClick={() => onChange(definitionToDraft(draftToDefinition({ ...draft, steps: [...draft.steps, newStep] })))}
        >
          Link step to campaign
        </button>
      </InspectorShell>
    )
  }
  if (stepIdx >= 0) {
    const step = draft.steps[stepIdx]!
    const updateStep = (partial: Partial<WorkflowEditorStep>) => {
      const steps = draft.steps.map((s, i) => (i === stepIdx ? { ...s, ...partial } : s))
      onChange({ ...draft, steps })
    }
    const removeStep = () => {
      if (draft.steps.length <= 1) return
      const steps = draft.steps.filter((_, i) => i !== stepIdx)
      onChange({ ...draft, steps })
    }

    return (
      <InspectorShell
        title={`Step ${step.step_order}`}
        subtitle={`WhatsApp · +${step.delay_days}d · ${sendTimeLabel(step.send_time)}`}
        onClose={onClose}
      >
        <label className="field">
          <span>Step order</span>
          <input
            type="number"
            min={1}
            className="input text-black"
            value={step.step_order}
            onChange={(e) => updateStep({ step_order: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="field">
          <span>Delay after previous (days)</span>
          <input
            type="number"
            min={0}
            className="input text-black"
            value={step.delay_days}
            onChange={(e) => updateStep({ delay_days: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <label className="field">
          <span>Send time</span>
          <input
            type="time"
            className="input text-black"
            value={sendTimeLabel(step.send_time)}
            onChange={(e) => updateStep({ send_time: e.target.value || '10:00' })}
          />
        </label>
        <label className="field">
          <span>Message template</span>
          <textarea
            rows={6}
            className="input font-mono text-xs text-black"
            value={step.message_template}
            onChange={(e) => updateStep({ message_template: e.target.value })}
          />
          <span className="hint">
            Variables:{' '}
            {CUSTOMER_MESSAGE_TEMPLATE_COLUMNS.map((c) => `{{${c}}}`).join(', ')}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox text-black"
            checked={step.is_active !== false}
            onChange={(e) => updateStep({ is_active: e.target.checked })}
            className="rounded border-slate-300"
          />
          Active (include in sends)
        </label>
        {draft.steps.length > 1 ? (
          <button type="button" onClick={removeStep} className="mt-2 text-sm font-medium text-red-600 hover:underline">
            Remove step
          </button>
        ) : null}
      </InspectorShell>
    )
  }
  }

  return (
    <InspectorShell title="Node" subtitle={selectedNodeId} onClose={onClose}>
      <p className="text-sm text-slate-500">Unknown node.</p>
    </InspectorShell>
  )
}

function InspectorShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 sm:hidden"
          aria-label="Close inspector"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [&_.field]:mb-4 [&_.field>span:first-child]:mb-1 [&_.field>span:first-child]:block [&_.field>span:first-child]:text-xs [&_.field>span:first-child]:font-medium [&_.field>span:first-child]:text-slate-700 [&_.hint]:mt-1 [&_.hint]:block [&_.hint]:text-[11px] [&_.hint]:text-slate-500 [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-slate-300 [&_.input]:px-2.5 [&_.input]:py-2 [&_.input]:text-sm">
        {children}
      </div>
    </div>
  )
}
