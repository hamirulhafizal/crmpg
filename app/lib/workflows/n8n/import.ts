import { defaultParametersForType } from '@/app/lib/workflows/catalog'
import {
  buildN8nMappingMaps,
  resolveCrmSlugForN8nType,
  type N8nCatalogEntry,
} from '@/app/lib/workflows/n8n/catalog-mappings'
import { parseN8nClipboard } from '@/app/lib/workflows/n8n/parse-clipboard'
import { newWorkflowNodeId } from '@/app/lib/workflows/graph-mutate'
import type { WorkflowDefinition, WorkflowEdge } from '@/app/lib/workflows/types'

export type N8nImportResult = {
  definition: WorkflowDefinition
  warnings: string[]
}

export type N8nImportOptions = {
  /** Catalog rows or descriptors with n8n_type for mapping. */
  catalog?: N8nCatalogEntry[]
  /** Merge into existing graph (paste nodes onto canvas). */
  mergeInto?: WorkflowDefinition
  /** Offset pasted nodes from top-left of existing graph. */
  mergeOffset?: { x: number; y: number }
}

export function importFromN8n(raw: unknown, options: N8nImportOptions = {}): N8nImportResult {
  const warnings: string[] = []
  const payload = parseN8nClipboard(raw)
  const maps = buildN8nMappingMaps(options.catalog ?? [])

  const nameToId = new Map<string, string>()
  const importedNodes = payload.nodes.map((n, i) => {
    const id = n.id ?? n.name ?? `n${i}`
    nameToId.set(n.name, id)
    const crmType = resolveCrmSlugForN8nType(n.type, maps, n.parameters)
    if (!crmType) {
      warnings.push(`Unsupported n8n node type "${n.type}" (${n.name}) — imported as Done (no-op)`)
    }
    const type = crmType ?? 'crm.flow.complete'
    const pos = n.position ?? [80 + i * 260, 80]
    const parameters = crmType
      ? mergeCrmParameters(type, stripCrmMeta(n.parameters ?? {}))
      : defaultParametersForType(type)
    return {
      id,
      type,
      position: { x: pos[0], y: pos[1] },
      parameters,
    }
  })

  const edges: WorkflowEdge[] = []
  const conns = payload.connections ?? {}
  for (const [sourceName, conn] of Object.entries(conns)) {
    const sourceId = nameToId.get(sourceName) ?? sourceName
    for (const outputs of conn.main ?? []) {
      for (const target of outputs) {
        const targetId = nameToId.get(target.node) ?? target.node
        edges.push({
          id: `e-${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
        })
      }
    }
  }

  const imported: WorkflowDefinition = { version: 1, nodes: importedNodes, edges }

  if (!options.mergeInto?.nodes?.length) {
    return { definition: imported, warnings }
  }

  return {
    definition: mergeWorkflowDefinitions(options.mergeInto, imported, options.mergeOffset),
    warnings,
  }
}

function mergeWorkflowDefinitions(
  base: WorkflowDefinition,
  pasted: WorkflowDefinition,
  offset = { x: 40, y: 40 }
): WorkflowDefinition {
  const maxX = base.nodes.reduce((m, n) => Math.max(m, n.position.x), 0)
  const maxY = base.nodes.reduce((m, n) => Math.max(m, n.position.y), 0)
  const idMap = new Map<string, string>()

  const newNodes = pasted.nodes.map((n) => {
    const newId = newWorkflowNodeId(n.type.split('.').pop() ?? 'n')
    idMap.set(n.id, newId)
    return {
      ...n,
      id: newId,
      position: {
        x: (Number.isFinite(maxX) ? maxX : 0) + offset.x + (n.position.x - (pasted.nodes[0]?.position.x ?? 0)),
        y: (Number.isFinite(maxY) ? maxY : 0) + offset.y + (n.position.y - (pasted.nodes[0]?.position.y ?? 0)),
      },
    }
  })

  const newEdges = pasted.edges.map((e) => ({
    ...e,
    id: `e-${idMap.get(e.source) ?? e.source}-${idMap.get(e.target) ?? e.target}`,
    source: idMap.get(e.source) ?? e.source,
    target: idMap.get(e.target) ?? e.target,
  }))

  return {
    version: 1,
    nodes: [...base.nodes, ...newNodes],
    edges: [...base.edges, ...newEdges],
  }
}

function stripCrmMeta(p: Record<string, unknown>): Record<string, unknown> {
  const { _crmType: _, ...rest } = p
  return rest
}

/** Keep CRM-specific fields; only overlay keys that exist in CRM defaults when unknown. */
function mergeCrmParameters(type: string, fromN8n: Record<string, unknown>): Record<string, unknown> {
  const defaults = defaultParametersForType(type)
  return { ...defaults, ...fromN8n }
}
