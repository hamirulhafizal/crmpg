import type { ProcessSummary } from '@/app/lib/campaigns/process-due'
import type { CustomerForAudience } from '@/app/lib/campaigns/audience'

export const WORKFLOW_NODE = {
  trigger: 'trigger',
  audience: 'audience',
  enroll: 'enroll',
  step: (order: number) => `step-${order}`,
  complete: 'complete',
} as const

export type CampaignWorkflowProgressEvent =
  | { type: 'phase'; phase: 'started' | 'enrollment_sync' | 'due_send' | 'finished' }
  | { type: 'node'; nodeId: string; state: 'active' | 'complete' | 'idle' }
  | { type: 'log'; message: string; level?: 'info' | 'success' | 'error' }
  | { type: 'enrollment'; customerId: string; label: string }
  | {
      type: 'send'
      status: 'sending' | 'sent' | 'failed'
      stepOrder: number
      stepId: string
      customerId: string
      label: string
      index: number
      total: number
      error?: string
    }
  | { type: 'summary'; summary: ProcessSummary }
  | { type: 'error'; message: string }

export type CampaignWorkflowProgressHandler = (event: CampaignWorkflowProgressEvent) => void

export function customerWorkflowLabel(c: Pick<CustomerForAudience, 'name' | 'save_name' | 'pg_code'>): string {
  const s = c.save_name?.trim() || c.name?.trim()
  if (s) return s
  return c.pg_code?.trim() ? `PG ${c.pg_code}` : 'Customer'
}
