import type { WorkflowDefinition, WorkflowNodeInstance } from '@/app/lib/workflows/types'

/** Walk graph from trigger nodes following edges; append unreachable nodes at end. */
export function topologicalOrder(def: WorkflowDefinition): WorkflowNodeInstance[] {
  const byId = new Map(def.nodes.map((n) => [n.id, n]))
  const outEdges = new Map<string, string[]>()
  for (const e of def.edges ?? []) {
    const list = outEdges.get(e.source) ?? []
    list.push(e.target)
    outEdges.set(e.source, list)
  }

  const triggers = def.nodes.filter((n) => String(n.type).startsWith('crm.trigger.'))
  const starts = triggers.length > 0 ? triggers : def.nodes.slice(0, 1)

  const visited = new Set<string>()
  const ordered: WorkflowNodeInstance[] = []

  const visit = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)
    const node = byId.get(id)
    if (node) ordered.push(node)
    for (const next of outEdges.get(id) ?? []) visit(next)
  }

  for (const s of starts) visit(s.id)
  for (const n of def.nodes) {
    if (!visited.has(n.id)) ordered.push(n)
  }

  return ordered
}

/**
 * Nodes on a forward path from any trigger to `targetId` (inclusive).
 * Uses BFS — first path found wins when branches exist.
 */
export function workflowPathToNode(
  def: WorkflowDefinition,
  targetId: string
): WorkflowNodeInstance[] {
  const byId = new Map(def.nodes.map((n) => [n.id, n]))
  if (!byId.has(targetId)) return []

  const outEdges = new Map<string, string[]>()
  for (const e of def.edges ?? []) {
    const list = outEdges.get(e.source) ?? []
    list.push(e.target)
    outEdges.set(e.source, list)
  }

  const triggers = def.nodes.filter((n) => String(n.type).startsWith('crm.trigger.'))
  const startIds =
    triggers.length > 0 ? triggers.map((t) => t.id) : def.nodes[0] ? [def.nodes[0].id] : []

  const parent = new Map<string, string | null>()
  const queue: string[] = []
  for (const id of startIds) {
    parent.set(id, null)
    queue.push(id)
  }

  let found = false
  while (queue.length > 0) {
    const id = queue.shift()!
    if (id === targetId) {
      found = true
      break
    }
    for (const next of outEdges.get(id) ?? []) {
      if (!parent.has(next)) {
        parent.set(next, id)
        queue.push(next)
      }
    }
  }

  if (!found) {
    const ordered = topologicalOrder(def)
    const idx = ordered.findIndex((n) => n.id === targetId)
    if (idx < 0) return []
    return ordered.slice(0, idx + 1)
  }

  const pathIds: string[] = []
  let cur: string | null = targetId
  while (cur) {
    pathIds.unshift(cur)
    cur = parent.get(cur) ?? null
  }

  return pathIds.map((id) => byId.get(id)!).filter(Boolean)
}
