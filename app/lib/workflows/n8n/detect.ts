/** True when JSON looks like an n8n workflow / node clipboard payload (not CRM workflow_definition). */
export function isN8nWorkflowPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  if (o.crmWorkflowClipboard === true) return false

  const nodes = o.nodes
  if (!Array.isArray(nodes) || nodes.length === 0) return false

  const hasN8nConnections =
    o.connections != null &&
    typeof o.connections === 'object' &&
    !Array.isArray(o.connections)

  const hasN8nNodeShape = nodes.some((n) => {
    if (!n || typeof n !== 'object') return false
    const node = n as Record<string, unknown>
    const type = String(node.type ?? '')
    return (
      type.startsWith('n8n-nodes-base.') ||
      type.startsWith('@n8n/') ||
      (typeof node.name === 'string' && typeof node.type === 'string' && !type.startsWith('crm.'))
    )
  })

  if (hasN8nConnections && hasN8nNodeShape) return true

  return nodes.every((n) => {
    if (!n || typeof n !== 'object') return false
    const type = String((n as Record<string, unknown>).type ?? '')
    return type.startsWith('n8n-nodes-base.') || type.startsWith('@n8n/')
  })
}

export function isN8nNodeType(type: string): boolean {
  return type.startsWith('n8n-nodes-base.') || type.startsWith('@n8n/')
}
