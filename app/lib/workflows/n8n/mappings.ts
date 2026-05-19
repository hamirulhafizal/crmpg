/** CRM slug → n8n node type */
export const CRM_TO_N8N_TYPE: Record<string, string> = {
  'crm.trigger.manual': 'n8n-nodes-base.manualTrigger',
  'crm.trigger.schedule': 'n8n-nodes-base.scheduleTrigger',
  'crm.audience.filter': 'n8n-nodes-base.filter',
  'crm.data.supabase': 'n8n-nodes-base.supabase',
  'crm.enroll.queue': 'n8n-nodes-base.noOp',
  'crm.flow.loop': 'n8n-nodes-base.splitInBatches',
  'crm.data.set': 'n8n-nodes-base.set',
  'crm.whatsapp.send': 'n8n-nodes-base.httpRequest',
  'crm.integration.waha': 'n8n-nodes-base.httpRequest',
  'crm.flow.wait': 'n8n-nodes-base.wait',
  'crm.flow.pass': 'n8n-nodes-base.noOp',
  'crm.flow.complete': 'n8n-nodes-base.noOp',
}

/** n8n node type → CRM slug (partial) */
export const N8N_TO_CRM_TYPE: Record<string, string> = {
  'n8n-nodes-base.manualTrigger': 'crm.trigger.manual',
  'n8n-nodes-base.manualtrigger': 'crm.trigger.manual',
  'n8n-nodes-base.scheduleTrigger': 'crm.trigger.schedule',
  'n8n-nodes-base.scheduletrigger': 'crm.trigger.schedule',
  'n8n-nodes-base.filter': 'crm.audience.filter',
  'n8n-nodes-base.supabase': 'crm.data.supabase',
  'n8n-nodes-base.splitInBatches': 'crm.flow.loop',
  'n8n-nodes-base.splitinbatches': 'crm.flow.loop',
  'n8n-nodes-base.set': 'crm.data.set',
  'n8n-nodes-base.httpRequest': 'crm.integration.waha',
  'n8n-nodes-base.httprequest': 'crm.integration.waha',
  'n8n-nodes-base.wait': 'crm.flow.wait',
  'n8n-nodes-base.noOp': 'crm.flow.pass',
  'n8n-nodes-base.noop': 'crm.flow.pass',
  'n8n-nodes-base.if': 'crm.logic.if',
}
