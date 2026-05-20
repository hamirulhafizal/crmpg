'use client'

import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'
import { AudienceBuilder } from '@/app/dashboard/campaigns/_components/AudienceBuilder'
import { TriggerRunScheduleFields } from '@/app/dashboard/campaigns/_components/TriggerRunScheduleFields'
import { TemplateVariableButtons } from '@/app/dashboard/campaigns/_components/TemplateVariableButtons'
import { triggerScheduleFromParams } from '@/app/lib/campaigns/trigger-schedule'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import { getBuiltinNodeType } from '@/app/lib/workflows/catalog'
import { patchNodeParametersInDraft } from '@/app/lib/workflows/graph-mutate'
import { definitionToDraft, draftToDefinition } from '@/app/lib/workflows/sync'
import { safeInt } from '@/app/lib/safe-number'
import type { WorkflowNodeInstance } from '@/app/lib/workflows/types'

export function nodeDisplayTitle(node: WorkflowNodeInstance): string {
  const name = node.parameters?.display_name
  if (typeof name === 'string' && name.trim()) return name.trim()
  return getBuiltinNodeType(node.type)?.label ?? node.type
}

/** Patch node params and re-sync compiled draft fields (audience, steps). */
export function patchNodeAndRefreshDraft(
  draft: WorkflowEditorDraft,
  nodeId: string,
  partial: Record<string, unknown>
): WorkflowEditorDraft {
  const patched = patchNodeParametersInDraft(draft, nodeId, partial)
  return definitionToDraft(draftToDefinition(patched))
}

type FieldProps = {
  label: string
  hint?: string
  children: React.ReactNode
}

export function InspectorField({ label, hint, children }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  )
}

export function SupabaseNodeFields({
  node,
  draft,
  nodeId,
  onChange,
}: {
  node: WorkflowNodeInstance
  draft: WorkflowEditorDraft
  nodeId: string
  onChange: (d: WorkflowEditorDraft) => void
}) {
  const p = node.parameters ?? {}
  const operation = String(p.operation ?? 'getAll')
  const patch = (partial: Record<string, unknown>) =>
    onChange(patchNodeAndRefreshDraft(draft, nodeId, partial))

  return (
    <>
      <InspectorField label="Display name">
        <input
          className="input text-black"
          value={String(p.display_name ?? '')}
          onChange={(e) => patch({ display_name: e.target.value })}
        />
      </InspectorField>
      <InspectorField label="Resource">
        <select className="input text-black" value="row" disabled>
          <option value="row">Row</option>
        </select>
      </InspectorField>
      <InspectorField label="Operation">
        <select
          className="input text-black"
          value={operation}
          onChange={(e) => patch({ operation: e.target.value })}
        >
          <option value="getAll">Get Many</option>
          <option value="update">Update</option>
          <option value="create">Create</option>
        </select>
      </InspectorField>
      <InspectorField label="Table">
        <input
          className="input text-black"
          value={String(p.table ?? 'customers')}
          onChange={(e) => patch({ table: e.target.value })}
        />
      </InspectorField>
      {operation === 'getAll' ? (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked readOnly className="rounded border-slate-300" />
            Return all
          </label>
          <p className="mb-2 text-xs font-medium text-slate-700">Filters (CRM audience)</p>
          <AudienceBuilder
            value={(p.audience_filters as CampaignAudienceFilters) ?? {}}
            onChange={(audience_filters) => patch({ audience_filters })}
          />
          <p className="hint">
            Same as n8n “Field = location, Value = Johor”. Drives who is eligible when the campaign runs.
          </p>
        </>
      ) : operation === 'update' ? (
        <InspectorField label="Note" hint="CRM logs sends in campaign_message_logs; this node is visual unless you wire custom handlers.">
          <p className="text-sm text-slate-600">Marks rows as sent in your n8n flow. Map to your own column in a future release.</p>
        </InspectorField>
      ) : null}
    </>
  )
}

export function ScheduleNodeFields({
  node,
  draft,
  nodeId,
  onChange,
}: {
  node: WorkflowNodeInstance
  draft: WorkflowEditorDraft
  nodeId: string
  onChange: (d: WorkflowEditorDraft) => void
}) {
  const p = node.parameters ?? {}
  const patch = (partial: Record<string, unknown>) =>
    onChange(patchNodeAndRefreshDraft(draft, nodeId, partial))

  return (
    <>
      <InspectorField label="Display name">
        <input
          className="input text-black"
          value={String(p.display_name ?? '')}
          onChange={(e) => patch({ display_name: e.target.value })}
        />
      </InspectorField>
      <InspectorField
        label="Cron expression"
        hint="Advanced: host cron expression. Use run date/time below for a simpler schedule."
      >
        <input
          className="input font-mono text-black"
          value={String(p.cron_expression ?? '0 8 * * *')}
          onChange={(e) => patch({ cron_expression: e.target.value })}
        />
      </InspectorField>
      <InspectorField
        label="When to run"
        hint="Optional. Date = don't run before this day. Time = run at this clock time each day (campaign timezone)."
      >
        <TriggerRunScheduleFields
          schedule={triggerScheduleFromParams(p)}
          onChange={(partial) => patch(partial)}
        />
      </InspectorField>
    </>
  )
}

export function LoopNodeFields({
  node,
  draft,
  nodeId,
  onChange,
}: {
  node: WorkflowNodeInstance
  draft: WorkflowEditorDraft
  nodeId: string
  onChange: (d: WorkflowEditorDraft) => void
}) {
  const p = node.parameters ?? {}
  const patch = (partial: Record<string, unknown>) =>
    onChange(patchNodeAndRefreshDraft(draft, nodeId, partial))

  return (
    <>
      <InspectorField label="Display name">
        <input
          className="input text-black"
          value={String(p.display_name ?? '')}
          onChange={(e) => patch({ display_name: e.target.value })}
        />
      </InspectorField>
      <InspectorField label="Batch size" hint="1 = one customer per loop (like n8n Split in Batches).">
        <input
          type="number"
          min={1}
          className="input text-black"
          value={safeInt(p.batch_size, 1, 1)}
          onChange={(e) => patch({ batch_size: Math.max(1, Number(e.target.value) || 1) })}
        />
      </InspectorField>
      <InspectorField label="Cooldown (days)" hint="Optional gap between re-touching the same customer.">
        <input
          type="number"
          min={0}
          className="input text-black"
          value={safeInt(p.cooldown_days ?? draft.cooldown_days, 0, 0)}
          onChange={(e) => patch({ cooldown_days: Math.max(0, Number(e.target.value) || 0) })}
        />
      </InspectorField>
    </>
  )
}

export function SetNodeFields({
  node,
  draft,
  nodeId,
  onChange,
}: {
  node: WorkflowNodeInstance
  draft: WorkflowEditorDraft
  nodeId: string
  onChange: (d: WorkflowEditorDraft) => void
}) {
  const p = node.parameters ?? {}
  const patch = (partial: Record<string, unknown>) =>
    onChange(patchNodeAndRefreshDraft(draft, nodeId, partial))

  return (
    <>
      <InspectorField label="Display name">
        <input
          className="input text-black"
          value={String(p.display_name ?? '')}
          onChange={(e) => patch({ display_name: e.target.value })}
        />
      </InspectorField>
      <InspectorField label="Mode">
        <select className="input text-black" value="manual" disabled>
          <option value="manual">Manual</option>
        </select>
      </InspectorField>
      <InspectorField label="Message 1" hint="Often copied into the first WhatsApp step.">
        <textarea
          rows={3}
          className="input font-mono text-xs text-black"
          value={String(p.message1 ?? '')}
          onChange={(e) => patch({ message1: e.target.value })}
        />
      </InspectorField>
      <InspectorField label="Message 2" hint="Often copied into the second WhatsApp step.">
        <textarea
          rows={3}
          className="input font-mono text-xs text-black"
          value={String(p.message2 ?? '')}
          onChange={(e) => patch({ message2: e.target.value })}
        />
      </InspectorField>
    </>
  )
}

export function WaitNodeFields({
  node,
  draft,
  nodeId,
  onChange,
}: {
  node: WorkflowNodeInstance
  draft: WorkflowEditorDraft
  nodeId: string
  onChange: (d: WorkflowEditorDraft) => void
}) {
  const p = node.parameters ?? {}
  const patch = (partial: Record<string, unknown>) =>
    onChange(patchNodeAndRefreshDraft(draft, nodeId, partial))

  return (
    <>
      <InspectorField label="Display name">
        <input
          className="input text-black"
          value={String(p.display_name ?? '')}
          onChange={(e) => patch({ display_name: e.target.value })}
        />
      </InspectorField>
      <InspectorField label="Min wait (seconds)">
        <input
          type="number"
          min={0}
          className="input text-black"
          value={safeInt(p.wait_min_seconds, 30, 0)}
          onChange={(e) => patch({ wait_min_seconds: Math.max(0, Number(e.target.value) || 0) })}
        />
      </InspectorField>
      <InspectorField label="Max wait (seconds)" hint="Random delay between this step and the next WhatsApp send (30–60 = wait 30s to 60s).">
        <input
          type="number"
          min={0}
          className="input text-black"
          value={safeInt(p.wait_max_seconds, 60, 0)}
          onChange={(e) => patch({ wait_max_seconds: Math.max(0, Number(e.target.value) || 0) })}
        />
      </InspectorField>
    </>
  )
}

export function PassNodeFields({
  node,
  draft,
  nodeId,
  onChange,
}: {
  node: WorkflowNodeInstance
  draft: WorkflowEditorDraft
  nodeId: string
  onChange: (d: WorkflowEditorDraft) => void
}) {
  const p = node.parameters ?? {}
  const patch = (partial: Record<string, unknown>) =>
    onChange(patchNodeAndRefreshDraft(draft, nodeId, partial))

  return (
    <InspectorField label="Display name" hint="Connects back to the loop node (next batch).">
      <input
        className="input text-black"
        value={String(p.display_name ?? '')}
        onChange={(e) => patch({ display_name: e.target.value })}
      />
    </InspectorField>
  )
}

export function WhatsAppMessageFields({
  stepOrder,
  delayDays,
  sendTime,
  messageTemplate,
  isActive,
  onStepOrder,
  onDelayDays,
  onSendTime,
  onMessageTemplate,
  onIsActive,
  showRemove,
  onRemove,
}: {
  stepOrder: number
  delayDays: number
  sendTime: string
  messageTemplate: string
  isActive: boolean
  onStepOrder: (n: number) => void
  onDelayDays: (n: number) => void
  onSendTime: (t: string) => void
  onMessageTemplate: (t: string) => void
  onIsActive: (v: boolean) => void
  showRemove?: boolean
  onRemove?: () => void
}) {
  return (
    <>
      <InspectorField label="Step order">
        <input
          type="number"
          min={1}
          className="input text-black"
          value={safeInt(stepOrder, 1, 1)}
          onChange={(e) => onStepOrder(Math.max(1, Number(e.target.value) || 1))}
        />
      </InspectorField>
      <InspectorField label="Delay after previous (days)">
        <input
          type="number"
          min={0}
          className="input text-black"
          value={safeInt(delayDays, 0, 0)}
          onChange={(e) => onDelayDays(Math.max(0, Number(e.target.value) || 0))}
        />
      </InspectorField>
      <InspectorField
        label="Send time"
        hint="When off, the message sends as soon as the step is due (after the delay)."
      >
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(sendTime)}
            onChange={(e) => onSendTime(e.target.checked ? sendTime || '10:00' : '')}
          />
          Schedule at a fixed time
        </label>
        {sendTime ? (
          <input
            type="time"
            className="input text-black"
            value={sendTime}
            onChange={(e) => onSendTime(e.target.value)}
          />
        ) : (
          <p className="text-sm text-slate-500">Sends immediately when due.</p>
        )}
      </InspectorField>
      <InspectorField label="Message template">
        <textarea
          rows={6}
          className="input font-mono text-xs text-black"
          value={messageTemplate}
          onChange={(e) => onMessageTemplate(e.target.value)}
        />
        <TemplateVariableButtons compact />
      </InspectorField>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => onIsActive(e.target.checked)}
          className="rounded border-slate-300"
        />
        Active (include in sends)
      </label>
      {showRemove && onRemove ? (
        <button type="button" onClick={onRemove} className="mt-2 text-sm font-medium text-red-600 hover:underline">
          Remove step
        </button>
      ) : null}
    </>
  )
}
