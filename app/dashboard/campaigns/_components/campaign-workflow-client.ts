import type { WorkflowLogLine, WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'
import { WORKFLOW_NODE, type CampaignWorkflowProgressEvent } from '@/app/lib/campaigns/workflow-events'

export type WorkflowUiState = {
  nodeStates: Record<string, WorkflowNodeState>
  logs: WorkflowLogLine[]
  currentSend: {
    label: string
    stepOrder: number
    status: 'sending' | 'sent' | 'failed'
    index: number
    total: number
  } | null
  logSeq: number
}

export function buildInitialWorkflowNodeStates(stepOrders: number[]): Record<string, WorkflowNodeState> {
  const states: Record<string, WorkflowNodeState> = {
    [WORKFLOW_NODE.trigger]: 'idle',
    [WORKFLOW_NODE.audience]: 'idle',
    [WORKFLOW_NODE.enroll]: 'idle',
    [WORKFLOW_NODE.complete]: 'idle',
  }
  for (const order of stepOrders) {
    states[WORKFLOW_NODE.step(order)] = 'idle'
  }
  return states
}

export function createInitialWorkflowUi(stepOrders: number[]): WorkflowUiState {
  return {
    nodeStates: buildInitialWorkflowNodeStates(stepOrders),
    logs: [],
    currentSend: null,
    logSeq: 0,
  }
}

export function applyWorkflowProgressEvent(prev: WorkflowUiState, event: CampaignWorkflowProgressEvent): WorkflowUiState {
  const next: WorkflowUiState = {
    nodeStates: { ...prev.nodeStates },
    logs: prev.logs,
    currentSend: prev.currentSend,
    logSeq: prev.logSeq,
  }

  const pushLog = (message: string, level?: WorkflowLogLine['level']) => {
    next.logSeq += 1
    next.logs = [{ id: String(next.logSeq), message, level, at: Date.now() }, ...prev.logs].slice(0, 80)
  }

  switch (event.type) {
    case 'phase':
      if (event.phase === 'started') {
        pushLog('Run started')
      } else if (event.phase === 'enrollment_sync') {
        pushLog('Syncing audience & enrollments…')
      } else if (event.phase === 'due_send') {
        pushLog('Sending due WhatsApp messages…')
      } else if (event.phase === 'finished') {
        pushLog('Run finished', 'success')
      }
      break
    case 'node':
      next.nodeStates[event.nodeId] = event.state
      break
    case 'log':
      pushLog(event.message, event.level)
      break
    case 'enrollment':
      pushLog(`Enrolled ${event.label}`, 'success')
      break
    case 'send':
      next.currentSend = {
        label: event.label,
        stepOrder: event.stepOrder,
        status: event.status === 'sending' ? 'sending' : event.status,
        index: event.index,
        total: event.total,
      }
      if (event.status === 'sending') {
        pushLog(`Sending to ${event.label} (${event.index}/${event.total})…`)
      } else if (event.status === 'sent') {
        pushLog(`Sent to ${event.label}`, 'success')
      } else {
        pushLog(`Failed ${event.label}${event.error ? `: ${event.error}` : ''}`, 'error')
      }
      break
    case 'summary':
      pushLog(
        `Done: +${event.summary.enrollments_inserted} enrolled, ${event.summary.messages_sent} sent, ${event.summary.messages_failed} failed`,
        'success'
      )
      next.currentSend = null
      break
    case 'error':
      pushLog(event.message, 'error')
      next.currentSend = null
      break
    default:
      break
  }

  return next
}

export async function runCampaignTestWithStream(
  campaignId: string,
  onEvent: (event: CampaignWorkflowProgressEvent) => void
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/campaigns/${campaignId}/run?stream=1`, { method: 'POST' })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: json.error || 'Run failed' }
  }
  if (!res.body) {
    return { ok: false, error: 'No response stream' }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const event = JSON.parse(trimmed) as CampaignWorkflowProgressEvent
        onEvent(event)
        if (event.type === 'error') {
          return { ok: false, error: event.message }
        }
      } catch {
        /* ignore partial json */
      }
    }
  }

  return { ok: true }
}
