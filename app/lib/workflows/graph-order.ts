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
