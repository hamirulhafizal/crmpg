import { WORKFLOW_NODE } from '@/app/lib/campaigns/workflow-events'
import type { CampaignAudienceFilters, CampaignTriggerType } from '@/app/lib/campaigns/types'

export type CampaignWorkflowLayout = {
  nodes?: Record<string, { x: number; y: number }>
}

export type WorkflowEditorStep = {
  id?: string
  step_order: number
  delay_days: number
  send_time: string
  message_template: string
  is_active?: boolean
}

export type WorkflowEditorDraft = {
  trigger_type: CampaignTriggerType
  trigger_offset_days: number
  audience_filters: CampaignAudienceFilters
  daily_send_limit: number
  cooldown_days: number
  steps: WorkflowEditorStep[]
  layout: CampaignWorkflowLayout
}

const NODE_W = 220
const NODE_H = 92
const GAP = 56

export function workflowNodeIds(stepOrders: number[]): string[] {
  const ids: string[] = [WORKFLOW_NODE.trigger, WORKFLOW_NODE.audience, WORKFLOW_NODE.enroll]
  for (const order of stepOrders) ids.push(WORKFLOW_NODE.step(order))
  ids.push(WORKFLOW_NODE.complete)
  return ids
}

/** Default horizontal layout when nothing saved yet. */
export function defaultNodePositions(nodeIds: string[], vertical: boolean): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  nodeIds.forEach((id, index) => {
    out[id] = vertical
      ? { x: 24, y: index * (NODE_H + GAP) }
      : { x: index * (NODE_W + GAP), y: 40 }
  })
  return out
}

export function mergeLayoutPositions(
  nodeIds: string[],
  saved: CampaignWorkflowLayout | null | undefined,
  vertical: boolean
): Record<string, { x: number; y: number }> {
  const defaults = defaultNodePositions(nodeIds, vertical)
  const savedNodes = saved?.nodes ?? {}
  const out = { ...defaults }
  for (const id of nodeIds) {
    const p = savedNodes[id]
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      out[id] = { x: p.x, y: p.y }
    }
  }
  return out
}

export function layoutFromNodePositions(positions: Record<string, { x: number; y: number }>): CampaignWorkflowLayout {
  return { nodes: positions }
}

export function sendTimeLabel(sendTime: string): string {
  return String(sendTime).slice(0, 5)
}

export function draftFromCampaignPayload(campaign: {
  trigger_type?: string
  trigger_offset_days?: number
  audience_filters?: CampaignAudienceFilters
  daily_send_limit?: number
  cooldown_days?: number
  workflow_layout?: CampaignWorkflowLayout | null
}, steps: WorkflowEditorStep[]): WorkflowEditorDraft {
  return {
    trigger_type: (campaign.trigger_type as CampaignTriggerType) ?? 'manual',
    trigger_offset_days: Number(campaign.trigger_offset_days ?? 0),
    audience_filters: (campaign.audience_filters ?? {}) as CampaignAudienceFilters,
    daily_send_limit: Number(campaign.daily_send_limit ?? 100),
    cooldown_days: Number(campaign.cooldown_days ?? 30),
    steps: steps.map((s) => ({
      id: s.id,
      step_order: s.step_order,
      delay_days: s.delay_days,
      send_time: sendTimeLabel(s.send_time),
      message_template: s.message_template,
      is_active: s.is_active !== false,
    })),
    layout: (campaign.workflow_layout ?? {}) as CampaignWorkflowLayout,
  }
}

export function addWorkflowStep(draft: WorkflowEditorDraft): WorkflowEditorDraft {
  const active = draft.steps.filter((s) => s.is_active !== false)
  const order = active.length ? Math.max(...active.map((s) => s.step_order)) + 1 : 1
  const newStep: WorkflowEditorStep = {
    step_order: order,
    delay_days: 0,
    send_time: '10:00',
    message_template: 'Hello {{name}}, …',
    is_active: true,
  }
  const nodeId = WORKFLOW_NODE.step(order)
  const ids = workflowNodeIds([...active.map((s) => s.step_order), order])
  const positions = mergeLayoutPositions(ids, draft.layout, false)
  const enrollPos = positions[WORKFLOW_NODE.enroll] ?? { x: 0, y: 40 }
  positions[nodeId] = { x: enrollPos.x + NODE_W + GAP, y: enrollPos.y }
  positions[WORKFLOW_NODE.complete] = {
    x: positions[nodeId]!.x + NODE_W + GAP,
    y: positions[nodeId]!.y,
  }
  return {
    ...draft,
    steps: [...draft.steps, newStep],
    layout: layoutFromNodePositions(positions),
  }
}
