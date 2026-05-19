'use client'

import type { WorkflowEditorDraft, WorkflowEditorStep } from '@/app/lib/campaigns/workflow-layout'
import { sendTimeLabel } from '@/app/lib/campaigns/workflow-layout'
import type { CampaignTriggerType } from '@/app/lib/campaigns/types'
import { AudienceBuilder } from '@/app/dashboard/campaigns/_components/AudienceBuilder'
import { WORKFLOW_NODE } from '@/app/lib/campaigns/workflow-events'
import { definitionToDraft, draftToDefinition } from '@/app/lib/workflows/sync'
import { WorkflowNodeTestPanel } from '@/app/dashboard/campaigns/_components/WorkflowNodeTestPanel'
import {
  findStepIndexForWhatsAppNode,
  patchWhatsAppStepInDraft,
  stepFromNodeParameters,
} from '@/app/lib/workflows/whatsapp-step'
import {
  LoopNodeFields,
  nodeDisplayTitle,
  PassNodeFields,
  patchNodeAndRefreshDraft,
  ScheduleNodeFields,
  SetNodeFields,
  SupabaseNodeFields,
  WaitNodeFields,
  WhatsAppMessageFields,
} from '@/app/dashboard/campaigns/_components/workflow-node-parameter-forms'
import { safeInt } from '@/app/lib/safe-number'
import { getBuiltinNodeType } from '@/app/lib/workflows/catalog'

const TRIGGERS: { value: CampaignTriggerType; label: string }[] = [
  { value: 'manual', label: 'Manual (run / cron sync)' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'last_purchase', label: 'Last purchase' },
  { value: 'enrollment', label: 'On enrollment' },
]

type Props = {
  selectedNodeIds: string[]
  draft: WorkflowEditorDraft
  onChange: (draft: WorkflowEditorDraft) => void
  onClose: () => void
  campaignId?: string
  onToast?: (type: 'success' | 'error', text: string) => void
  nodeTestAutoRunKey?: number
  onNodeTestEnd?: () => void
}

export function CampaignWorkflowNodeInspector({
  selectedNodeIds,
  draft,
  onChange,
  onClose,
  campaignId,
  onToast,
  nodeTestAutoRunKey,
  onNodeTestEnd,
}: Props) {
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0]! : null

  if (selectedNodeIds.length > 1) {
    return (
      <InspectorShell
        title={`${selectedNodeIds.length} nodes selected`}
        subtitle="Multi-select"
        onClose={onClose}
      >
        <p className="text-sm text-slate-600">
          Click a single node to edit its settings, or use{' '}
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-xs">Ctrl+C</kbd> to copy and{' '}
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-xs">Delete</kbd> to remove.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1">Ctrl+A</kbd> /{' '}
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1">⌘A</kbd> select all ·{' '}
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1">Ctrl+V</kbd> paste workflow JSON
        </p>
      </InspectorShell>
    )
  }

  const defNode = selectedNodeId
    ? draft.definition?.nodes.find((n) => n.id === selectedNodeId)
    : undefined

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
            : /^step-\d+$/.test(selectedNodeId ?? '')
              ? 'crm.whatsapp.send'
              : null)

  const isWhatsAppType =
    nodeType === 'crm.whatsapp.send' || nodeType === 'crm.integration.waha'

  const stepIdx =
    selectedNodeId && isWhatsAppType ? findStepIndexForWhatsAppNode(selectedNodeId, draft, defNode) : -1

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

  const nodeTestFooter = (
    <WorkflowNodeTestPanel
      nodeId={selectedNodeId}
      draft={draft}
      campaignId={campaignId}
      onToast={onToast}
      autoRunKey={nodeTestAutoRunKey}
      onTestEnd={onNodeTestEnd}
    />
  )

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
            value={safeInt(draft.trigger_offset_days, 0, 0)}
            onChange={(e) => patch({ trigger_offset_days: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="hint">Days before/after the trigger event (birthday, last purchase, etc.).</span>
        </label>
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.audience.filter') {
    return (
      <InspectorShell title="Audience" subtitle="CRM filters for who can enroll" onClose={onClose}>
        <AudienceBuilder value={draft.audience_filters} onChange={(audience_filters) => patch({ audience_filters })} />
        {nodeTestFooter}
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
            value={safeInt(draft.daily_send_limit, 100, 1)}
            onChange={(e) => patch({ daily_send_limit: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="field">
          <span>Cooldown (days)</span>
          <input
            type="number"
            min={0}
            className="input text-black"
            value={safeInt(draft.cooldown_days, 0, 0)}
            onChange={(e) => patch({ cooldown_days: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="hint">Minimum days between campaign touches for the same customer.</span>
        </label>
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.flow.complete') {
    return (
      <InspectorShell title="Done" subtitle="End of the automation path" onClose={onClose}>
        <p className="text-sm text-slate-600">
          Marks enrollments complete after all active steps are sent. This node has no settings.
        </p>
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.trigger.schedule' && defNode) {
    return (
      <InspectorShell
        title={nodeDisplayTitle(defNode)}
        subtitle={getBuiltinNodeType(nodeType)?.label ?? 'Schedule'}
        onClose={onClose}
      >
        <ScheduleNodeFields node={defNode} draft={draft} nodeId={selectedNodeId} onChange={onChange} />
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.data.supabase' && defNode) {
    return (
      <InspectorShell
        title={nodeDisplayTitle(defNode)}
        subtitle={`${defNode.parameters?.operation ?? 'getAll'} · ${defNode.parameters?.table ?? 'customers'}`}
        onClose={onClose}
      >
        <SupabaseNodeFields node={defNode} draft={draft} nodeId={selectedNodeId} onChange={onChange} />
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.flow.loop' && defNode) {
    return (
      <InspectorShell
        title={nodeDisplayTitle(defNode)}
        subtitle="Split in batches"
        onClose={onClose}
      >
        <LoopNodeFields node={defNode} draft={draft} nodeId={selectedNodeId} onChange={onChange} />
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.data.set' && defNode) {
    return (
      <InspectorShell
        title={nodeDisplayTitle(defNode)}
        subtitle="Set fields"
        onClose={onClose}
      >
        <SetNodeFields node={defNode} draft={draft} nodeId={selectedNodeId} onChange={onChange} />
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.flow.wait' && defNode) {
    return (
      <InspectorShell
        title={nodeDisplayTitle(defNode)}
        subtitle="Wait between steps"
        onClose={onClose}
      >
        <WaitNodeFields node={defNode} draft={draft} nodeId={selectedNodeId} onChange={onChange} />
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  if (nodeType === 'crm.flow.pass' && defNode) {
    return (
      <InspectorShell
        title={nodeDisplayTitle(defNode)}
        subtitle="Loop continue"
        onClose={onClose}
      >
        <PassNodeFields node={defNode} draft={draft} nodeId={selectedNodeId} onChange={onChange} />
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  if (isWhatsAppType && defNode) {
    const linkedIdx = stepIdx >= 0 ? stepIdx : findStepIndexForWhatsAppNode(selectedNodeId, draft, defNode)
    const step =
      linkedIdx >= 0 ? draft.steps[linkedIdx]! : stepFromNodeParameters(defNode)

    const updateStep = (partial: Partial<WorkflowEditorStep>) => {
      onChange(patchWhatsAppStepInDraft(draft, selectedNodeId, partial))
    }

    const removeStep = () => {
      const whatsappCount = draft.definition?.nodes.filter((n) => n.type === 'crm.whatsapp.send').length ?? 0
      if (whatsappCount <= 1) return
      const def = draft.definition
      if (!def) return
      const nodes = def.nodes.filter((n) => n.id !== selectedNodeId)
      const edges = def.edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId)
      const steps = draft.steps.filter((s) => s.step_order !== step.step_order)
      onChange(
        definitionToDraft(
          draftToDefinition({
            ...draft,
            steps,
            definition: { ...def, nodes, edges },
          })
        )
      )
    }

    const waCount =
      draft.definition?.nodes.filter(
        (n) => n.type === 'crm.whatsapp.send' || n.type === 'crm.integration.waha'
      ).length ?? 0

    return (
      <InspectorShell
        title={defNode.parameters?.display_name ? nodeDisplayTitle(defNode) : `Step ${step.step_order}`}
        subtitle={`WhatsApp · +${step.delay_days}d · ${sendTimeLabel(step.send_time)}`}
        onClose={onClose}
      >
        {nodeType === 'crm.integration.waha' ? (
          <label className="field">
            <span>Display name</span>
            <input
              className="input text-black"
              value={String(defNode.parameters?.display_name ?? '')}
              onChange={(e) =>
                onChange(patchNodeAndRefreshDraft(draft, selectedNodeId, { display_name: e.target.value }))
              }
            />
          </label>
        ) : null}
        <WhatsAppMessageFields
          stepOrder={step.step_order}
          delayDays={step.delay_days}
          sendTime={sendTimeLabel(step.send_time)}
          messageTemplate={step.message_template}
          isActive={step.is_active !== false}
          onStepOrder={(n) => updateStep({ step_order: n })}
          onDelayDays={(n) => updateStep({ delay_days: n })}
          onSendTime={(t) => updateStep({ send_time: t })}
          onMessageTemplate={(t) => updateStep({ message_template: t })}
          onIsActive={(v) => updateStep({ is_active: v })}
          showRemove={nodeType === 'crm.whatsapp.send' && (draft.steps.length > 1 || waCount > 1)}
          onRemove={nodeType === 'crm.whatsapp.send' ? removeStep : undefined}
        />
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  if (defNode && nodeType) {
    const meta = getBuiltinNodeType(nodeType)
    return (
      <InspectorShell title={nodeDisplayTitle(defNode)} subtitle={meta?.label ?? nodeType} onClose={onClose}>
        <p className="text-sm text-slate-600">
          Node type <code className="text-xs">{nodeType}</code> has no parameter editor yet.
        </p>
        {nodeTestFooter}
      </InspectorShell>
    )
  }

  return (
    <InspectorShell title="Node" subtitle={selectedNodeId} onClose={onClose}>
      <p className="text-sm text-slate-500">Unknown node.</p>
      {nodeTestFooter}
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
