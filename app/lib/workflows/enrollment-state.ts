import type { CampaignWorkflowPlan } from '@/app/lib/workflows/plan'
import { firstWhatsappNode, nextWhatsappAfter } from '@/app/lib/workflows/plan'

export type EnrollmentWorkflowMetadata = {
  workflow?: {
    version: 1
    current_node_id?: string | null
    last_completed_node_id?: string | null
    last_step_order?: number
  }
}

export function parseEnrollmentWorkflowMetadata(raw: unknown): EnrollmentWorkflowMetadata {
  if (!raw || typeof raw !== 'object') return {}
  const w = (raw as EnrollmentWorkflowMetadata).workflow
  if (!w || typeof w !== 'object') return {}
  return { workflow: { ...w, version: 1 } }
}

export function metadataForNewEnrollment(plan: CampaignWorkflowPlan): EnrollmentWorkflowMetadata {
  const first = firstWhatsappNode(plan)
  return {
    workflow: {
      version: 1,
      current_node_id: first?.nodeId ?? plan.enrollNodeId ?? null,
      last_step_order: 0,
    },
  }
}

export function metadataAfterStepSent(
  plan: CampaignWorkflowPlan,
  sentStepOrder: number,
  sentNodeId: string
): EnrollmentWorkflowMetadata {
  const next = nextWhatsappAfter(plan, sentStepOrder)
  return {
    workflow: {
      version: 1,
      current_node_id: next?.nodeId ?? plan.completeNodeId ?? null,
      last_completed_node_id: sentNodeId,
      last_step_order: sentStepOrder,
    },
  }
}
