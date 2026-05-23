import { isCampaignSendStepType } from '@/app/lib/workflows/send-step-types'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

export type WorkflowValidationIssue = { message: string; nodeId?: string }

export function validateWorkflowDefinition(def: WorkflowDefinition): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = []

  if (!def || typeof def !== 'object') {
    issues.push({ message: 'Workflow definition is missing' })
    return issues
  }

  if (!Array.isArray(def.nodes) || def.nodes.length === 0) {
    issues.push({ message: 'Workflow must have at least one node' })
    return issues
  }

  const ids = new Set<string>()
  for (const n of def.nodes) {
    if (!n.id) issues.push({ message: 'Node missing id' })
    else if (ids.has(n.id)) issues.push({ message: `Duplicate node id: ${n.id}`, nodeId: n.id })
    else ids.add(n.id)
    if (!n.type) issues.push({ message: 'Node missing type', nodeId: n.id })
  }

  const triggers = def.nodes.filter((n) => String(n.type).startsWith('crm.trigger.'))
  if (triggers.length === 0) {
    issues.push({ message: 'Workflow needs a trigger node' })
  }

  const sends = def.nodes.filter((n) => isCampaignSendStepType(String(n.type)))
  if (sends.length === 0) {
    issues.push({ message: 'Workflow needs at least one WhatsApp send step (message or image)' })
  }
  for (const n of def.nodes.filter((x) => x.type === 'crm.whatsapp.send_image')) {
    if (!String(n.parameters?.background_path ?? '').trim()) {
      issues.push({
        message: 'WhatsApp image step needs a background upload',
        nodeId: n.id,
      })
    }
  }

  for (const e of def.edges ?? []) {
    if (!ids.has(e.source)) issues.push({ message: `Edge references unknown source: ${e.source}` })
    if (!ids.has(e.target)) issues.push({ message: `Edge references unknown target: ${e.target}` })
  }

  return issues
}
