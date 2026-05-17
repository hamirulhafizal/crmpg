import { topologicalOrder } from '@/app/lib/workflows/graph-order'
import {
  buildN8nMappingMaps,
  resolveN8nTypeForCrmSlug,
  type N8nCatalogEntry,
} from '@/app/lib/workflows/n8n/catalog-mappings'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

export type N8nWorkflowJson = {
  name: string
  nodes: Array<{
    id: string
    name: string
    type: string
    typeVersion: number
    position: [number, number]
    parameters: Record<string, unknown>
  }>
  connections: Record<
    string,
    { main: Array<Array<{ node: string; type: string; index: number }>> }
  >
  meta?: { templateCredsSetupCompleted?: boolean }
}

export function exportToN8n(
  def: WorkflowDefinition,
  name = 'CRM Campaign',
  catalog: N8nCatalogEntry[] = []
): N8nWorkflowJson {
  const maps = buildN8nMappingMaps(catalog)
  const ordered = topologicalOrder(def)
  const nameById = new Map(def.nodes.map((n) => [n.id, n.id]))

  const nodes = def.nodes.map((n) => {
    const entry = maps.bySlug.get(n.type)
    const n8nType = resolveN8nTypeForCrmSlug(n.type, maps)
    const typeVersion = entry?.n8n_type_version ?? 1
    const n8nDefaults = entry?.n8n_parameters ?? {}
    return {
      id: n.id,
      name: nameById.get(n.id) ?? n.id,
      type: n8nType,
      typeVersion,
      position: [n.position.x, n.position.y] as [number, number],
      parameters: { ...n8nDefaults, ...n.parameters, _crmType: n.type },
    }
  })

  const connections: N8nWorkflowJson['connections'] = {}
  for (const e of def.edges) {
    const srcName = nameById.get(e.source) ?? e.source
    const tgtName = nameById.get(e.target) ?? e.target
    if (!connections[srcName]) connections[srcName] = { main: [[]] }
    connections[srcName].main[0]!.push({ node: tgtName, type: 'main', index: 0 })
  }

  if (def.edges.length === 0 && ordered.length > 1) {
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i]!
      const b = ordered[i + 1]!
      const srcName = a.id
      const tgtName = b.id
      if (!connections[srcName]) connections[srcName] = { main: [[]] }
      connections[srcName].main[0]!.push({ node: tgtName, type: 'main', index: 0 })
    }
  }

  return { name, nodes, connections, meta: { templateCredsSetupCompleted: true } }
}
