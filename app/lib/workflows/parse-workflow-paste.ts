import { isWorkflowClipboardPayload } from '@/app/lib/workflows/clipboard'
import { BUILTIN_WORKFLOW_NODE_TYPES } from '@/app/lib/workflows/catalog'
import { isN8nWorkflowPayload } from '@/app/lib/workflows/n8n/detect'
import { importFromN8n } from '@/app/lib/workflows/n8n/import'
import type { WorkflowDefinition, WorkflowEdge, WorkflowNodeInstance } from '@/app/lib/workflows/types'

export type ParsedWorkflowPaste = {
  definition: WorkflowDefinition
  warnings: string[]
  source: 'crm' | 'n8n' | 'crm-clipboard'
}

function normalizeNode(raw: unknown, index: number): WorkflowNodeInstance | null {
  if (!raw || typeof raw !== 'object') return null
  const n = raw as Record<string, unknown>
  const id = typeof n.id === 'string' && n.id.trim() ? n.id.trim() : `node-${index}`
  const type = typeof n.type === 'string' && n.type.trim() ? n.type.trim() : ''
  if (!type) return null
  const pos = n.position
  let position = { x: 80 + index * 260, y: 80 }
  if (pos && typeof pos === 'object' && !Array.isArray(pos)) {
    const p = pos as Record<string, unknown>
    position = { x: Number(p.x) || 0, y: Number(p.y) || 0 }
  } else if (Array.isArray(pos) && pos.length >= 2) {
    position = { x: Number(pos[0]) || 0, y: Number(pos[1]) || 0 }
  }
  const parameters =
    n.parameters && typeof n.parameters === 'object' && !Array.isArray(n.parameters)
      ? (n.parameters as Record<string, unknown>)
      : {}
  return { id, type, position, parameters }
}

function normalizeEdge(raw: unknown, index: number, nodeIds: Set<string>): WorkflowEdge | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  const source = typeof e.source === 'string' ? e.source : ''
  const target = typeof e.target === 'string' ? e.target : ''
  if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) return null
  const id =
    typeof e.id === 'string' && e.id.trim() ? e.id.trim() : `e-${source}-${target}-${index}`
  return {
    id,
    source,
    target,
    ...(typeof e.sourceHandle === 'string' ? { sourceHandle: e.sourceHandle } : {}),
    ...(typeof e.targetHandle === 'string' ? { targetHandle: e.targetHandle } : {}),
  }
}

export function normalizeWorkflowDefinition(raw: {
  version?: unknown
  nodes?: unknown
  edges?: unknown
}): WorkflowDefinition | null {
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) return null
  const nodes: WorkflowNodeInstance[] = []
  for (let i = 0; i < raw.nodes.length; i++) {
    const n = normalizeNode(raw.nodes[i], i)
    if (n) nodes.push(n)
  }
  if (nodes.length === 0) return null
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges: WorkflowEdge[] = []
  const edgeList = Array.isArray(raw.edges) ? raw.edges : []
  for (let i = 0; i < edgeList.length; i++) {
    const e = normalizeEdge(edgeList[i], i, nodeIds)
    if (e) edges.push(e)
  }
  return { version: 1, nodes, edges }
}

export function isWorkflowDefinitionPayload(raw: unknown): raw is WorkflowDefinition {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.nodes) || o.nodes.length === 0) return false
  if (isN8nWorkflowPayload(raw)) return false
  return true
}

export function parsePastedWorkflowText(
  text: string,
  options?: {
    mergeInto?: WorkflowDefinition
    mergeOffset?: { x: number; y: number }
  }
): ParsedWorkflowPaste | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

  let raw: unknown
  try {
    raw = JSON.parse(trimmed) as unknown
  } catch {
    return null
  }

  if (isWorkflowClipboardPayload(raw)) return null

  if (isN8nWorkflowPayload(raw)) {
    const { definition, warnings } = importFromN8n(raw, {
      catalog: BUILTIN_WORKFLOW_NODE_TYPES,
      mergeInto: options?.mergeInto,
      mergeOffset: options?.mergeOffset,
    })
    return { definition, warnings, source: 'n8n' }
  }

  let def: WorkflowDefinition | null = null
  if (isWorkflowDefinitionPayload(raw)) {
    def = normalizeWorkflowDefinition(raw as WorkflowDefinition)
  } else if (raw && typeof raw === 'object') {
    const wrapped = (raw as Record<string, unknown>).workflow_definition
    if (isWorkflowDefinitionPayload(wrapped)) {
      def = normalizeWorkflowDefinition(wrapped as WorkflowDefinition)
    }
  }

  if (!def) return null
  return { definition: def, warnings: [], source: 'crm' }
}

/** Parse CRM or n8n workflow JSON from the system clipboard. */
export function parseWorkflowDefinitionFromText(text: string): WorkflowDefinition | null {
  return parsePastedWorkflowText(text)?.definition ?? null
}
