import { defaultParametersForType } from '@/app/lib/workflows/catalog'
import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'
import { topologicalOrder } from '@/app/lib/workflows/graph-order'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import type {
  WorkflowDefinition,
  WorkflowEdgeRouting,
  WorkflowNodeTypeSlug,
} from '@/app/lib/workflows/types'

let idCounter = 0
export function newWorkflowNodeId(prefix = 'node'): string {
  idCounter += 1
  return `${prefix}-${Date.now()}-${idCounter}`
}

export function addNodeToDefinition(
  def: WorkflowDefinition,
  type: WorkflowNodeTypeSlug | string,
  position: { x: number; y: number }
): WorkflowDefinition {
  const id = newWorkflowNodeId(type.split('.').pop() ?? 'n')
  return {
    ...def,
    nodes: [
      ...def.nodes,
      {
        id,
        type,
        position,
        parameters: defaultParametersForType(type),
      },
    ],
  }
}

export function updateDefinitionPositions(
  def: WorkflowDefinition,
  positions: Record<string, { x: number; y: number }>
): WorkflowDefinition {
  return {
    ...def,
    nodes: def.nodes.map((n) => ({
      ...n,
      position: positions[n.id] ?? n.position,
    })),
  }
}

export function addEdgeToDefinition(
  def: WorkflowDefinition,
  source: string,
  target: string,
  handles?: { sourceHandle?: string | null; targetHandle?: string | null }
): WorkflowDefinition {
  const sourceHandle = handles?.sourceHandle ?? 'main'
  const targetHandle = handles?.targetHandle ?? 'main'
  const id = `e-${source}-${target}${sourceHandle !== 'main' ? `-${sourceHandle}` : ''}`
  if (def.edges.some((e) => e.id === id)) return def
  return {
    ...def,
    edges: [
      ...def.edges,
      {
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
      },
    ],
  }
}

export type FlowEdgeSyncPayload = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  routing?: WorkflowEdgeRouting
  pathOffsetY?: number
}

export function applyEdgesFromFlow(
  def: WorkflowDefinition,
  edges: FlowEdgeSyncPayload[]
): WorkflowDefinition {
  const prevById = new Map(def.edges.map((e) => [e.id, e]))
  const prevByPair = new Map(def.edges.map((e) => [`${e.source}:${e.target}`, e]))

  return {
    ...def,
    edges: edges.map((e) => {
      const id = e.id ?? `e-${e.source}-${e.target}`
      const prev = prevById.get(id) ?? prevByPair.get(`${e.source}:${e.target}`)
      return {
        id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? prev?.sourceHandle,
        targetHandle: e.targetHandle ?? prev?.targetHandle,
        routing: e.routing ?? prev?.routing,
        pathOffsetY: e.pathOffsetY ?? prev?.pathOffsetY,
      }
    }),
  }
}

/** Persist auto-generated sequential edges so individual connections can be removed. */
export function ensureExplicitEdges(def: WorkflowDefinition): WorkflowDefinition {
  if (def.edges.length > 0 || def.nodes.length < 2) return def
  const ordered = topologicalOrder(def)
  return applyEdgesFromFlow(
    def,
    ordered.slice(0, -1).map((n, i) => ({
      id: `e-${n.id}-${ordered[i + 1]!.id}`,
      source: n.id,
      target: ordered[i + 1]!.id,
    }))
  )
}

export function removeEdgeFromDefinition(def: WorkflowDefinition, edgeId: string): WorkflowDefinition {
  return {
    ...def,
    edges: def.edges.filter((e) => e.id !== edgeId),
  }
}

/** Remove a node and any edges connected to it. */
/** Update a single node's parameters on the canvas draft. */
export function patchNodeParametersInDraft(
  draft: WorkflowEditorDraft,
  nodeId: string,
  partial: Record<string, unknown>
): WorkflowEditorDraft {
  const def = draft.definition
  if (!def) return draft

  const nodes = def.nodes.map((n) => {
    if (n.id !== nodeId) return n
    return { ...n, parameters: { ...n.parameters, ...partial } }
  })

  const node = nodes.find((n) => n.id === nodeId)
  let next: WorkflowEditorDraft = { ...draft, definition: { ...def, nodes } }

  if (node?.type === 'crm.data.supabase' && node.parameters.operation === 'getAll') {
    const af = node.parameters.audience_filters as CampaignAudienceFilters | undefined
    if (af && typeof af === 'object') {
      next = { ...next, audience_filters: af }
    }
  }

  if (node?.type === 'crm.trigger.schedule' && typeof node.parameters.cron_expression === 'string') {
    next = {
      ...next,
      trigger_type: 'manual',
    }
  }

  return next
}

export function removeNodeFromDefinition(def: WorkflowDefinition, nodeId: string): WorkflowDefinition {
  const withEdges = ensureExplicitEdges(def)
  return {
    ...withEdges,
    nodes: withEdges.nodes.filter((n) => n.id !== nodeId),
    edges: withEdges.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
  }
}
