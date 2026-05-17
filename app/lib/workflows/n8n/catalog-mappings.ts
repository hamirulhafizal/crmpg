import { CRM_TO_N8N_TYPE, N8N_TO_CRM_TYPE } from '@/app/lib/workflows/n8n/mappings'
import type { WorkflowNodeTypeDescriptor } from '@/app/lib/workflows/types'

export type N8nCatalogEntry = Pick<
  WorkflowNodeTypeDescriptor,
  'slug' | 'n8n_type' | 'label' | 'handler_key'
> & {
  n8n_type_version?: number
  n8n_parameters?: Record<string, unknown>
}

export type N8nMappingMaps = {
  crmToN8n: Record<string, string>
  n8nToCrm: Record<string, string>
  bySlug: Map<string, N8nCatalogEntry>
}

export function buildN8nMappingMaps(types: N8nCatalogEntry[]): N8nMappingMaps {
  const crmToN8n: Record<string, string> = { ...CRM_TO_N8N_TYPE }
  const n8nToCrm: Record<string, string> = { ...N8N_TO_CRM_TYPE }
  const bySlug = new Map<string, N8nCatalogEntry>()

  for (const t of types) {
    bySlug.set(t.slug, t)
    if (t.n8n_type) {
      crmToN8n[t.slug] = t.n8n_type
      n8nToCrm[t.n8n_type] = t.slug
      n8nToCrm[t.n8n_type.toLowerCase()] = t.slug
    }
  }

  return { crmToN8n, n8nToCrm, bySlug }
}

export function resolveCrmSlugForN8nType(
  n8nType: string,
  maps: N8nMappingMaps,
  parameters?: Record<string, unknown>
): string | undefined {
  const fromMeta = parameters?._crmType
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim()
  return maps.n8nToCrm[n8nType] ?? maps.n8nToCrm[n8nType.toLowerCase()]
}

export function resolveN8nTypeForCrmSlug(slug: string, maps: N8nMappingMaps): string {
  return maps.crmToN8n[slug] ?? 'n8n-nodes-base.noOp'
}
