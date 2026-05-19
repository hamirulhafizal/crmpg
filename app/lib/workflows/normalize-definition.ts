import { BUILTIN_WORKFLOW_NODE_TYPES } from '@/app/lib/workflows/catalog'
import { buildN8nMappingMaps, resolveCrmSlugForN8nType } from '@/app/lib/workflows/n8n/catalog-mappings'
import { isN8nNodeType } from '@/app/lib/workflows/n8n/detect'
import { mergeCrmParameters } from '@/app/lib/workflows/n8n/import'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

/** Re-map leftover n8n node types to CRM slugs (fixes paste that skipped import). */
export function normalizeN8nTypesInDefinition(def: WorkflowDefinition): WorkflowDefinition {
  const maps = buildN8nMappingMaps(BUILTIN_WORKFLOW_NODE_TYPES)
  let changed = false

  const nodes = def.nodes.map((n) => {
    const rawType = String(n.type)
    if (!isN8nNodeType(rawType)) return n
    changed = true
    const crmType = resolveCrmSlugForN8nType(rawType, maps, n.parameters) ?? 'crm.flow.complete'
    const displayName =
      typeof n.parameters?.display_name === 'string' && n.parameters.display_name.trim()
        ? n.parameters.display_name.trim()
        : n.id
    return {
      ...n,
      type: crmType,
      parameters: {
        ...mergeCrmParameters(crmType, n.parameters ?? {}, displayName),
        display_name: displayName,
        n8n_type: rawType,
      },
    }
  })

  return changed ? { ...def, nodes } : def
}
