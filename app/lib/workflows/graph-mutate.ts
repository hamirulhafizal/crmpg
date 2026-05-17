import { defaultParametersForType } from '@/app/lib/workflows/catalog'
import { topologicalOrder } from '@/app/lib/workflows/graph-order'
import type { WorkflowDefinition, WorkflowNodeTypeSlug } from '@/app/lib/workflows/types'

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
  target: string
): WorkflowDefinition {
  const id = `e-${source}-${target}`
  if (def.edges.some((e) => e.id === id)) return def
  return {
    ...def,
    edges: [...def.edges, { id, source, target, sourceHandle: 'main', targetHandle: 'main' }],
  }
}

export function applyEdgesFromFlow(
  def: WorkflowDefinition,
  edges: Array<{ source: string; target: string; id?: string }>
): WorkflowDefinition {
  return {
    ...def,
    edges: edges.map((e) => ({
      id: e.id ?? `e-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      sourceHandle: 'main',
      targetHandle: 'main',
    })),
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
