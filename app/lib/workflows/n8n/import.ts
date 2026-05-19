import { safeInt } from '@/app/lib/safe-number'
import { defaultParametersForType } from '@/app/lib/workflows/catalog'
import {
  buildN8nMappingMaps,
  resolveCrmSlugForN8nType,
  type N8nCatalogEntry,
} from '@/app/lib/workflows/n8n/catalog-mappings'
import { parseN8nClipboard } from '@/app/lib/workflows/n8n/parse-clipboard'
import { newWorkflowNodeId } from '@/app/lib/workflows/graph-mutate'
import { defaultLoopBackOffset, shouldUseLoopBackRouting } from '@/app/lib/workflows/edge-path'
import { assignStepOrdersToPastedNodes } from '@/app/lib/workflows/whatsapp-step'
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
      ? mergeCrmParameters(type, stripCrmMeta(n.parameters ?? {}), n.name)
      : { ...defaultParametersForType(type), display_name: n.name }
    return {
      id,
      type,
      position: { x: pos[0], y: pos[1] },
      parameters: { ...parameters, display_name: n.name, n8n_type: n.type },
    }
  })

  const edges: WorkflowEdge[] = []
  const conns = payload.connections ?? {}
  for (const [sourceName, conn] of Object.entries(conns)) {
    const sourceId = nameToId.get(sourceName) ?? sourceName
    const mains = conn.main ?? []
    mains.forEach((outputs, outputIndex) => {
      const sourceHandle =
        mains.length > 1 ? (outputIndex === 0 ? 'loop' : 'done') : undefined
      for (const target of outputs) {
        const targetId = nameToId.get(target.node) ?? target.node
        edges.push({
          id: `e-${sourceId}-${targetId}${sourceHandle ? `-${sourceHandle}` : ''}`,
          source: sourceId,
          target: targetId,
          ...(sourceHandle ? { sourceHandle } : {}),
        })
      }
    })
  }

  const wahaIds = importedNodes
    .filter((n) => {
      if (n.type !== 'crm.integration.waha' && n.type !== 'crm.whatsapp.send') return false
      const p = n.parameters as Record<string, unknown>
      return p.is_active !== false
    })
    .map((n) => n.id)

  const nodeById = new Map(importedNodes.map((n) => [n.id, n]))
  const edgesWithRouting = edges.map((e) => {
    const s = nodeById.get(e.source)
    const t = nodeById.get(e.target)
    if (s && t && shouldUseLoopBackRouting(s.position.x + 220, t.position.x, e.routing)) {
      return {
        ...e,
        routing: 'loop-back' as const,
        pathOffsetY: e.pathOffsetY ?? defaultLoopBackOffset(s.position.y + 45, t.position.y + 45),
      }
    }
    return e
  })

  let imported: WorkflowDefinition = { version: 1, nodes: importedNodes, edges: edgesWithRouting }
  if (wahaIds.length > 0) {
    imported = assignStepOrdersToPastedNodes(imported, wahaIds)
  }

  if (!options.mergeInto?.nodes?.length) {
    return { definition: imported, warnings }
  }

  return {
    definition: mergeWorkflowDefinitions(options.mergeInto, imported, options.mergeOffset),
    warnings,
  }
}

export function mergeWorkflowDefinitions(
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

/** Keep CRM-specific fields; map common n8n shapes into CRM parameters. */
export function mergeCrmParameters(
  type: string,
  fromN8n: Record<string, unknown>,
  nodeName?: string
): Record<string, unknown> {
  const defaults = defaultParametersForType(type)
  const base = { ...defaults, ...fromN8n }

  switch (type) {
    case 'crm.trigger.schedule': {
      const rule = fromN8n.rule as { interval?: Array<{ expression?: string }> } | undefined
      const cron =
        rule?.interval?.[0]?.expression ??
        (typeof fromN8n.cronExpression === 'string' ? fromN8n.cronExpression : undefined)
      return { ...base, ...(cron ? { cron_expression: cron } : {}) }
    }
    case 'crm.data.supabase': {
      const op = String(fromN8n.operation ?? defaults.operation ?? 'getAll')
      const table = String(fromN8n.tableId ?? fromN8n.table ?? defaults.table ?? 'customers')
      const filters = fromN8n.filters as { conditions?: Array<{ keyName?: string; keyValue?: string }> } | undefined
      const locationEq = filters?.conditions?.find(
        (c) => c.keyName === 'location' || c.keyName === 'state'
      )?.keyValue
      const audience_filters =
        op === 'getAll' && locationEq
          ? { location_contains: String(locationEq) }
          : (base.audience_filters as Record<string, unknown> | undefined) ?? {}
      return { ...base, operation: op, table, audience_filters }
    }
    case 'crm.flow.loop': {
      const batch = safeInt(fromN8n.batchSize ?? fromN8n.batch_size, 1, 1)
      return { ...base, batch_size: batch }
    }
    case 'crm.flow.wait': {
      const amount = safeInt(fromN8n.amount, 30, 0)
      const unit = String(fromN8n.unit ?? 'seconds')
      const sec = unit === 'minutes' ? amount * 60 : amount
      const maxAmount = safeInt(fromN8n.maxAmount, amount, 0)
      const maxSec = unit === 'minutes' ? maxAmount * 60 : maxAmount
      return {
        ...base,
        wait_min_seconds: Math.min(sec, maxSec),
        wait_max_seconds: Math.max(sec, maxSec),
      }
    }
    case 'crm.data.set': {
      const assignments = fromN8n.assignments as
        | { assignments?: Array<{ name?: string; value?: unknown }> }
        | undefined
      const list = assignments?.assignments ?? []
      const byName = (key: string) => {
        const row = list.find((a) => a.name === key)
        return row?.value != null ? String(row.value) : undefined
      }
      return {
        ...base,
        message1: byName('message1') ?? byName('message_1') ?? base.message1,
        message2: byName('message2') ?? byName('message_2') ?? base.message2,
      }
    }
    case 'crm.integration.waha':
    case 'crm.whatsapp.send': {
      const isNotify = /notify|complete|done/i.test(nodeName ?? '')
      const method = String(fromN8n.method ?? 'POST').toUpperCase()
      const url = String(fromN8n.url ?? fromN8n.requestUrl ?? '')
      let message_template = String(base.message_template ?? '')
      const jsonBody = fromN8n.jsonBody
      if (typeof jsonBody === 'string' && jsonBody.trim()) {
        try {
          const parsed = JSON.parse(jsonBody) as Record<string, unknown>
          const text = parsed.text ?? parsed.message ?? parsed.body
          if (typeof text === 'string') message_template = text
        } catch {
          if (jsonBody.includes('{{')) message_template = jsonBody
        }
      } else if (jsonBody && typeof jsonBody === 'object') {
        const o = jsonBody as Record<string, unknown>
        const text = o.text ?? o.message ?? o.body
        if (typeof text === 'string') message_template = text
      }
      return {
        ...base,
        message_template,
        http_method: method,
        n8n_url: url,
        is_active: !isNotify,
        step_order: isNotify ? 99 : safeInt(base.step_order, 1, 1),
      }
    }
    default:
      return base
  }
}
