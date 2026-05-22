import { BUILTIN_WORKFLOW_NODE_TYPES } from '@/app/lib/workflows/catalog'
import { newWorkflowNodeId } from '@/app/lib/workflows/graph-mutate'
import { buildN8nMappingMaps, resolveCrmSlugForN8nType } from '@/app/lib/workflows/n8n/catalog-mappings'
import { isN8nNodeType } from '@/app/lib/workflows/n8n/detect'
import { mergeCrmParameters } from '@/app/lib/workflows/n8n/import'
import { assignStepOrdersToPastedNodes } from '@/app/lib/workflows/whatsapp-step'
import type {
  WorkflowDefinition,
  WorkflowEdgeRouting,
  WorkflowNodeInstance,
} from '@/app/lib/workflows/types'

export const WORKFLOW_CLIPBOARD_VERSION = 1 as const
export const WORKFLOW_CLIPBOARD_STORAGE_KEY = 'crm-workflow-node-clipboard'

export type WorkflowClipboardNode = {
  /** Original canvas id — used to restore edges on paste. */
  sourceId: string
  type: string
  position: { x: number; y: number }
  parameters: Record<string, unknown>
}

export type WorkflowClipboardEdge = {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  routing?: WorkflowEdgeRouting
  pathOffsetY?: number
}

export type WorkflowClipboardPayload = {
  crmWorkflowClipboard: true
  version: typeof WORKFLOW_CLIPBOARD_VERSION
  nodes: WorkflowClipboardNode[]
  edges?: WorkflowClipboardEdge[]
}

export function parseWorkflowClipboardJson(text: string): WorkflowClipboardPayload | null {
  try {
    const raw = JSON.parse(text) as unknown
    if (isWorkflowClipboardPayload(raw)) return raw
  } catch {
    /* ignore */
  }
  return null
}

export function persistWorkflowClipboard(payload: WorkflowClipboardPayload): void {
  const json = JSON.stringify(payload)
  try {
    sessionStorage.setItem(WORKFLOW_CLIPBOARD_STORAGE_KEY, json)
  } catch {
    /* private mode / quota */
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(json).catch(() => {})
  }
}

export function loadWorkflowClipboardFromStorage(): WorkflowClipboardPayload | null {
  try {
    const raw = sessionStorage.getItem(WORKFLOW_CLIPBOARD_STORAGE_KEY)
    if (!raw) return null
    return parseWorkflowClipboardJson(raw)
  } catch {
    return null
  }
}

export function isWorkflowClipboardPayload(raw: unknown): raw is WorkflowClipboardPayload {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return o.crmWorkflowClipboard === true && Array.isArray(o.nodes)
}

export function copyNodesFromDefinition(
  def: WorkflowDefinition,
  nodeIds: string[]
): WorkflowClipboardPayload | null {
  const idSet = new Set(nodeIds)
  const nodes = def.nodes
    .filter((n) => idSet.has(n.id))
    .map((n) => {
      const parameters = structuredClone(n.parameters ?? {})
      // Strip step_order so paste always assigns the next number (Step 2, 3, …)
      if (n.type === 'crm.whatsapp.send') {
        delete parameters.step_order
      }
      return {
        sourceId: n.id,
        type: n.type,
        position: { x: n.position.x, y: n.position.y },
        parameters,
      }
    })
  if (nodes.length === 0) return null

  const edges = def.edges
    .filter((e) => idSet.has(e.source) && idSet.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      routing: e.routing,
      pathOffsetY: e.pathOffsetY,
    }))

  return {
    crmWorkflowClipboard: true,
    version: WORKFLOW_CLIPBOARD_VERSION,
    nodes,
    edges: edges.length > 0 ? edges : undefined,
  }
}

const DEBUG_WORKFLOW =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'development'

export function pasteNodesIntoDefinition(
  def: WorkflowDefinition,
  payload: WorkflowClipboardPayload,
  offset = { x: 56, y: 56 }
): { definition: WorkflowDefinition; newNodeIds: string[]; pastedStepOrders: number[] } {
  if (DEBUG_WORKFLOW) {
    console.debug('[workflow paste] before', {
      existing: def.nodes
        .filter((n) => n.type === 'crm.whatsapp.send')
        .map((n) => ({ id: n.id, step_order: n.parameters?.step_order })),
    })
  }

  const newNodeIds: string[] = []
  const pastedStepOrders: number[] = []
  const pasted: WorkflowNodeInstance[] = []

  const maps = buildN8nMappingMaps(BUILTIN_WORKFLOW_NODE_TYPES)

  for (const n of payload.nodes) {
    const id = newWorkflowNodeId(n.type.split('.').pop() ?? 'n')
    newNodeIds.push(id)
    let type = n.type
    let parameters = structuredClone(n.parameters ?? {})
    if (isN8nNodeType(type)) {
      const crmType = resolveCrmSlugForN8nType(type, maps, parameters) ?? 'crm.flow.complete'
      const displayName = String(parameters.display_name ?? id)
      type = crmType
      parameters = {
        ...mergeCrmParameters(crmType, parameters, displayName),
        display_name: displayName,
        n8n_type: n.type,
      }
    }
    if (type === 'crm.whatsapp.send') {
      delete parameters.step_order
    }
    if (type === 'crm.integration.waha' && parameters.is_active !== false) {
      delete parameters.step_order
    }
    const node: WorkflowNodeInstance = {
      id,
      type,
      position: {
        x: n.position.x + offset.x,
        y: n.position.y + offset.y,
      },
      parameters,
    }
    pasted.push(node)
  }

  const idMap = new Map<string, string>()
  for (let i = 0; i < payload.nodes.length; i++) {
    const sourceId = payload.nodes[i]?.sourceId
    const newId = newNodeIds[i]
    if (sourceId && newId) idMap.set(sourceId, newId)
  }

  const pastedEdges =
    payload.edges
      ?.filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => {
        const source = idMap.get(e.source)!
        const target = idMap.get(e.target)!
        const sourceHandle = e.sourceHandle ?? 'main'
        const targetHandle = e.targetHandle ?? 'main'
        const id = `e-${source}-${target}${sourceHandle !== 'main' ? `-${sourceHandle}` : ''}`
        return {
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
          routing: e.routing,
          pathOffsetY: e.pathOffsetY,
        }
      }) ?? []

  let definition: WorkflowDefinition = {
    ...def,
    nodes: [...def.nodes, ...pasted],
    edges: [...def.edges, ...pastedEdges],
  }
  definition = assignStepOrdersToPastedNodes(definition, newNodeIds)

  for (const id of newNodeIds) {
    const node = definition.nodes.find((n) => n.id === id)
    if (node?.type === 'crm.whatsapp.send' || node?.type === 'crm.integration.waha') {
      pastedStepOrders.push(Number(node.parameters?.step_order ?? 0))
    }
  }

  if (DEBUG_WORKFLOW) {
    console.debug('[workflow paste] after assignStepOrders', {
      newNodeIds,
      pastedStepOrders,
      all: definition.nodes
        .filter((n) => n.type === 'crm.whatsapp.send')
        .map((n) => ({ id: n.id, step_order: n.parameters?.step_order })),
    })
  }

  return { definition, newNodeIds, pastedStepOrders }
}
