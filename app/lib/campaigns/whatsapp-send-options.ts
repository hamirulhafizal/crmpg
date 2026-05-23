import type { CampaignWorkflowPlan } from '@/app/lib/workflows/plan'
import { isCampaignSendStepType } from '@/app/lib/workflows/send-step-types'
import type { WorkflowNodeInstance } from '@/app/lib/workflows/types'

export type WhatsAppSendOptions = {
  enable_typing: boolean
  randomize_spaces: boolean
  gmail_fallback_enabled: boolean
  gmail_fallback_template: string
}

const DEFAULTS: WhatsAppSendOptions = {
  enable_typing: true,
  randomize_spaces: true,
  gmail_fallback_enabled: false,
  gmail_fallback_template: '',
}

export function whatsAppSendOptionsFromParameters(
  params: Record<string, unknown> | null | undefined
): WhatsAppSendOptions {
  const p = params ?? {}
  return {
    enable_typing: p.enable_typing !== false,
    randomize_spaces: p.randomize_spaces !== false,
    gmail_fallback_enabled: p.gmail_fallback_enabled === true,
    gmail_fallback_template: String(p.gmail_fallback_template ?? ''),
  }
}

export function whatsAppNodeForStep(
  plan: CampaignWorkflowPlan,
  stepOrder: number
): WorkflowNodeInstance | null {
  const fromGraph = plan.whatsappNodes.find((w) => w.stepOrder === stepOrder)
  if (fromGraph) {
    return plan.definition.nodes.find((n) => n.id === fromGraph.nodeId) ?? null
  }
  return (
    plan.definition.nodes.find(
      (n) =>
        isCampaignSendStepType(String(n.type)) &&
        Number(n.parameters?.step_order ?? 0) === stepOrder
    ) ?? null
  )
}

export function isImageStepNode(node: WorkflowNodeInstance | null | undefined): boolean {
  return node?.type === 'crm.whatsapp.send_image'
}

export function whatsAppSendOptionsForStep(
  plan: CampaignWorkflowPlan,
  stepOrder: number
): WhatsAppSendOptions {
  const node = whatsAppNodeForStep(plan, stepOrder)
  const opts = whatsAppSendOptionsFromParameters(node?.parameters)
  if (stepOrder !== 1) {
    return { ...opts, gmail_fallback_enabled: false, gmail_fallback_template: '' }
  }
  return opts
}

export { DEFAULTS as WHATSAPP_SEND_OPTION_DEFAULTS }
