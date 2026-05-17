export type N8nClipboardNode = {
  id?: string
  name: string
  type: string
  typeVersion?: number
  position?: [number, number]
  parameters?: Record<string, unknown>
}

export type N8nClipboardPayload = {
  name?: string
  nodes: N8nClipboardNode[]
  connections?: Record<
    string,
    { main?: Array<Array<{ node: string; type?: string; index?: number }>> }
  >
}

/** Normalize n8n clipboard / file JSON (workflow, nodes array, or single node). */
export function parseN8nClipboard(raw: unknown): N8nClipboardPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid JSON: expected an object')
  }

  const obj = raw as Record<string, unknown>

  if (Array.isArray(obj.nodes) && obj.nodes.length > 0) {
    return {
      name: typeof obj.name === 'string' ? obj.name : undefined,
      nodes: obj.nodes as N8nClipboardNode[],
      connections:
        obj.connections && typeof obj.connections === 'object'
          ? (obj.connections as N8nClipboardPayload['connections'])
          : {},
    }
  }

  if (typeof obj.type === 'string' && typeof obj.name === 'string') {
    return {
      nodes: [obj as unknown as N8nClipboardNode],
      connections: {},
    }
  }

  if (Array.isArray(raw) && raw.length > 0 && typeof (raw[0] as { type?: string }).type === 'string') {
    return { nodes: raw as N8nClipboardNode[], connections: {} }
  }

  throw new Error('Unrecognized n8n format: paste a workflow, nodes array, or single node')
}
