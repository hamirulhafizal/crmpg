import { isCampaignSendStepType } from '@/app/lib/workflows/send-step-types'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

/**
 * Strip dealer-specific Gmail fallback body from Step 1 WhatsApp nodes.
 * Exported/imported workflows should use each dealer's Profile gmail_message at runtime.
 */
export function stripExportedGmailFallbackTemplate(
  def: WorkflowDefinition | null | undefined
): WorkflowDefinition | null {
  if (!def || typeof def !== 'object' || !Array.isArray(def.nodes)) return null

  const nodes = def.nodes.map((n) => {
    if (!isCampaignSendStepType(String(n.type))) return n
    const order = Number(n.parameters?.step_order ?? 0)
    if (order !== 1) return n
    return {
      ...n,
      parameters: {
        ...n.parameters,
        gmail_fallback_template: '',
      },
    }
  })

  return { ...def, nodes }
}

export function sanitizeCampaignRecordForTransfer(
  campaign: Record<string, unknown>
): Record<string, unknown> {
  const copy = { ...campaign }
  if (copy.workflow_definition && typeof copy.workflow_definition === 'object') {
    const stripped = stripExportedGmailFallbackTemplate(
      copy.workflow_definition as WorkflowDefinition
    )
    if (stripped) copy.workflow_definition = stripped
  }
  return copy
}
