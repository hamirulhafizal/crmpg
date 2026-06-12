'use client'

import { useEffect, useRef, useState } from 'react'
import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'
import { AudienceBuilder } from '@/app/dashboard/campaigns/_components/AudienceBuilder'
import { TriggerRunScheduleFields } from '@/app/dashboard/campaigns/_components/TriggerRunScheduleFields'
import { TemplateVariableButtons } from '@/app/dashboard/campaigns/_components/TemplateVariableButtons'
import { triggerScheduleFromParams } from '@/app/lib/campaigns/trigger-schedule'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import { getBuiltinNodeType } from '@/app/lib/workflows/catalog'
import { patchNodeParametersInDraft } from '@/app/lib/workflows/graph-mutate'
import { definitionToDraft, draftToDefinition } from '@/app/lib/workflows/sync'
import {
  formatWaitRangeLabel,
  minutesToSeconds,
  normalizeWaitParams,
  secondsToMinutes,
  WAIT_RANGE_PRESETS,
  activeWaitPresetId,
} from '@/app/lib/workflows/wait-params'
import type { WorkflowNodeInstance } from '@/app/lib/workflows/types'
import { safeInt } from '@/app/lib/safe-number'

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
      <InspectorField
        label="Batch size"
        hint="1 = one customer at a time: finish msg 1 → wait → msg 2 for customer A, then start customer B."
      >
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
  const { minSeconds, maxSeconds } = normalizeWaitParams(p)
  const activePreset = activeWaitPresetId(minSeconds, maxSeconds)
  const patch = (partial: Record<string, unknown>) =>
    onChange(patchNodeAndRefreshDraft(draft, nodeId, partial))

  const patchMinutes = (minMinutes: number, maxMinutes: number) => {
    const nextMin = minutesToSeconds(minMinutes)
    const nextMax = Math.max(nextMin, minutesToSeconds(maxMinutes))
    patch({ wait_min_seconds: nextMin, wait_max_seconds: nextMax })
  }

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
        label="Wait before next WhatsApp"
        hint={`Random delay: ${formatWaitRangeLabel(minSeconds, maxSeconds)} (${minSeconds}–${maxSeconds}s stored on node).`}
      >
        <div className="flex flex-wrap gap-1.5">
          {WAIT_RANGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() =>
                patch({
                  wait_min_seconds: preset.minSeconds,
                  wait_max_seconds: preset.maxSeconds,
                })
              }
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                activePreset === preset.id
                  ? 'border-violet-400 bg-violet-50 text-violet-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300 hover:bg-violet-50/60'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </InspectorField>

      <div className="grid grid-cols-2 gap-3">
        <InspectorField label="Min (minutes)">
          <input
            type="number"
            min={0}
            step={0.5}
            className="input text-black"
            value={secondsToMinutes(minSeconds)}
            onChange={(e) => patchMinutes(Number(e.target.value) || 0, secondsToMinutes(maxSeconds))}
          />
        </InspectorField>
        <InspectorField label="Max (minutes)">
          <input
            type="number"
            min={0}
            step={0.5}
            className="input text-black"
            value={secondsToMinutes(maxSeconds)}
            onChange={(e) => patchMinutes(secondsToMinutes(minSeconds), Number(e.target.value) || 0)}
          />
        </InspectorField>
      </div>
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
  enableTyping,
  randomizeSpaces,
  gmailFallbackEnabled,
  gmailFallbackTemplate,
  onStepOrder,
  onDelayDays,
  onSendTime,
  onMessageTemplate,
  onIsActive,
  onEnableTyping,
  onRandomizeSpaces,
  onGmailFallbackEnabled,
  onGmailFallbackTemplate,
  showRemove,
  onRemove,
}: {
  stepOrder: number
  delayDays: number
  sendTime: string
  messageTemplate: string
  isActive: boolean
  enableTyping: boolean
  randomizeSpaces: boolean
  gmailFallbackEnabled: boolean
  gmailFallbackTemplate: string
  onStepOrder: (n: number) => void
  onDelayDays: (n: number) => void
  onSendTime: (t: string) => void
  onMessageTemplate: (t: string) => void
  onIsActive: (v: boolean) => void
  onEnableTyping: (v: boolean) => void
  onRandomizeSpaces: (v: boolean) => void
  onGmailFallbackEnabled: (v: boolean) => void
  onGmailFallbackTemplate: (t: string) => void
  showRemove?: boolean
  onRemove?: () => void
}) {
  const [gmailPasswordOk, setGmailPasswordOk] = useState<boolean | null>(null)
  const [profileGmailMessage, setProfileGmailMessage] = useState('')
  const profilePrefillDone = useRef(false)

  useEffect(() => {
    profilePrefillDone.current = false
  }, [stepOrder])

  useEffect(() => {
    if (stepOrder !== 1) return
    let cancelled = false
    void fetch('/api/waha/email-fallback')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        const hasPass = Boolean(String(json.appPassword ?? '').trim())
        const profileMsg = String(json.gmailMessage ?? '').trim()
        setGmailPasswordOk(hasPass)
        setProfileGmailMessage(profileMsg)
        if (
          profileMsg &&
          !profilePrefillDone.current &&
          !gmailFallbackTemplate.trim()
        ) {
          profilePrefillDone.current = true
          onGmailFallbackTemplate(profileMsg)
        }
      })
      .catch(() => {
        if (!cancelled) setGmailPasswordOk(false)
      })
    return () => {
      cancelled = true
    }
  }, [stepOrder, gmailFallbackTemplate, onGmailFallbackTemplate])

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
        <label className="workflow-inspector-check mb-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(sendTime)}
            onChange={(e) => onSendTime(e.target.checked ? sendTime || '10:00' : '')}
            className="h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
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
      <InspectorField
        label="Anti-spam"
        hint="Makes automated sends look more human and reduces identical message patterns."
      >
        <label className="workflow-inspector-check mb-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={enableTyping}
            onChange={(e) => onEnableTyping(e.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
          />
          Show typing before send
        </label>
        <label className="workflow-inspector-check flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={randomizeSpaces}
            onChange={(e) => onRandomizeSpaces(e.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
          />
          Randomize spacing in message
        </label>
      </InspectorField>
      {stepOrder === 1 ? (
        <InspectorField
          label="Gmail fallback"
          hint="If WhatsApp fails, email the customer using your Gmail app password from Profile."
        >
          <label className="workflow-inspector-check flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={gmailFallbackEnabled}
              onChange={(e) => onGmailFallbackEnabled(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
              disabled={gmailPasswordOk === false}
            />
            Use Gmail fallback when WhatsApp fails
          </label>
          {gmailPasswordOk === false ? (
            <p className="hint">
              Add a Gmail app password in{' '}
              <a href="/profile" className="font-medium text-blue-600 hover:underline">
                Profile
              </a>{' '}
              to enable fallback.
            </p>
          ) : gmailPasswordOk === true ? (
            <p className="hint text-emerald-700">Gmail app password found on your profile.</p>
          ) : (
            <p className="hint">Checking profile Gmail settings…</p>
          )}
          {gmailFallbackEnabled ? (
            <div className="mt-3 space-y-2">
              <span className="block text-xs font-medium text-slate-700">Gmail fallback template</span>
              <p className="hint">
                Email body when WhatsApp fails. Leave empty to always use your Profile Gmail message
                (recommended — shared/imported workflows stay dealer-specific).
              </p>
              <textarea
                rows={5}
                className="input font-mono text-xs text-black"
                value={gmailFallbackTemplate}
                onChange={(e) => onGmailFallbackTemplate(e.target.value)}
              />
              <TemplateVariableButtons compact />
              {profileGmailMessage.trim() ? (
                <button
                  type="button"
                  className="text-xs font-medium text-blue-600 hover:underline"
                  onClick={() => onGmailFallbackTemplate(profileGmailMessage)}
                >
                  Reset to Profile Gmail message
                </button>
              ) : null}
            </div>
          ) : null}
        </InspectorField>
      ) : null}
      <label className="workflow-inspector-check flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => onIsActive(e.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
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
