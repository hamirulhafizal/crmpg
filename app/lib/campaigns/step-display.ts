import { parseImageStepParameters } from '@/app/lib/campaigns/image-step/parse'
import type { ImageStepParameters } from '@/app/lib/campaigns/image-step/types'
import type { WorkflowDefinition, WorkflowNodeInstance } from '@/app/lib/workflows/types'

export type CampaignStepDisplayKind = 'text' | 'image'

export type CampaignStepDisplay = {
  kind: CampaignStepDisplayKind
  step_order: number
  delay_days: number
  send_time: string
  message_template: string
  is_active: boolean
  image_parameters?: ImageStepParameters
}

function imageNodeForStep(
  def: WorkflowDefinition | null | undefined,
  stepOrder: number
): WorkflowNodeInstance | undefined {
  if (!def?.nodes?.length) return undefined
  return def.nodes.find(
    (n) =>
      n.type === 'crm.whatsapp.send_image' &&
      Math.max(1, Number(n.parameters?.step_order ?? 0)) === stepOrder
  )
}

/** Merge DB step row with workflow graph for detail / list UI. */
export function buildCampaignStepDisplays(
  steps: Array<Record<string, unknown>>,
  workflowDefinition: unknown
): CampaignStepDisplay[] {
  const def =
    workflowDefinition && typeof workflowDefinition === 'object'
      ? (workflowDefinition as WorkflowDefinition)
      : null

  return steps.map((s) => {
    const step_order = Math.max(1, Number(s.step_order ?? 1))
    const imageNode = imageNodeForStep(def, step_order)
    if (imageNode) {
      const image_parameters = parseImageStepParameters(
        (imageNode.parameters ?? {}) as Record<string, unknown>
      )
      return {
        kind: 'image',
        step_order,
        delay_days: Number(s.delay_days ?? image_parameters.delay_days ?? 0),
        send_time: String(s.send_time ?? image_parameters.send_time ?? ''),
        message_template: String(
          s.message_template ?? image_parameters.caption_template ?? ''
        ),
        is_active: s.is_active !== false && image_parameters.is_active !== false,
        image_parameters,
      }
    }
    return {
      kind: 'text',
      step_order,
      delay_days: Number(s.delay_days ?? 0),
      send_time: String(s.send_time ?? ''),
      message_template: String(s.message_template ?? ''),
      is_active: s.is_active !== false,
    }
  })
}
