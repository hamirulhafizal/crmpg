import type { N8nCatalogEntry } from '@/app/lib/workflows/n8n/catalog-mappings'
import type { N8nWorkflowJson } from '@/app/lib/workflows/n8n/export'

/** Minimal n8n workflow JSON for one node — paste directly into n8n canvas (Ctrl+V). */
export function exportN8nNodeSnippet(
  entry: N8nCatalogEntry,
  opts?: { nodeName?: string; position?: [number, number] }
): N8nWorkflowJson {
  const nodeId = entry.slug.replace(/\./g, '-')
  const name = opts?.nodeName ?? entry.label
  const n8nType = entry.n8n_type ?? 'n8n-nodes-base.noOp'
  const typeVersion = entry.n8n_type_version ?? 1
  const baseParams = entry.n8n_parameters ?? {}
  const position = opts?.position ?? [240, 300]

  return {
    name: entry.label,
    nodes: [
      {
        id: nodeId,
        name,
        type: n8nType,
        typeVersion,
        position,
        parameters: { ...baseParams, _crmType: entry.slug },
      },
    ],
    connections: {},
    meta: { templateCredsSetupCompleted: true },
  }
}
