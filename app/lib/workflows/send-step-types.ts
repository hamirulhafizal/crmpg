/** Node types that participate in campaign step order / sends. */
export const CAMPAIGN_SEND_STEP_TYPES = [
  'crm.whatsapp.send',
  'crm.integration.waha',
  'crm.whatsapp.send_image',
] as const

export type CampaignSendStepType = (typeof CAMPAIGN_SEND_STEP_TYPES)[number]

export function isCampaignSendStepType(type: string): boolean {
  return (CAMPAIGN_SEND_STEP_TYPES as readonly string[]).includes(type)
}
