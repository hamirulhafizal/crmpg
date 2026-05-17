/** CRM slug → n8n node type */
export const CRM_TO_N8N_TYPE: Record<string, string> = {
  'crm.trigger.manual': 'n8n-nodes-base.manualTrigger',
  'crm.audience.filter': 'n8n-nodes-base.filter',
  'crm.enroll.queue': 'n8n-nodes-base.noOp',
  'crm.whatsapp.send': 'n8n-nodes-base.httpRequest',
  'crm.flow.complete': 'n8n-nodes-base.noOp',
}

/** n8n node type → CRM slug (partial) */
export const N8N_TO_CRM_TYPE: Record<string, string> = {
  'n8n-nodes-base.manualTrigger': 'crm.trigger.manual',
  'n8n-nodes-base.manualtrigger': 'crm.trigger.manual',
  'n8n-nodes-base.filter': 'crm.audience.filter',
  'n8n-nodes-base.httpRequest': 'crm.whatsapp.send',
  'n8n-nodes-base.httprequest': 'crm.whatsapp.send',
  'n8n-nodes-base.if': 'crm.logic.if',
}
