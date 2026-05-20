import type { WorkflowDefinition } from '@/app/lib/workflows/types'

/** Random integer seconds in [min, max] inclusive. */
export function pickWaitSeconds(minSeconds: number, maxSeconds: number): number {
  const min = Math.max(0, Math.floor(Number(minSeconds) || 0))
  const max = Math.max(min, Math.floor(Number(maxSeconds) || min))
  if (max === min) return min
  return min + Math.floor(Math.random() * (max - min + 1))
}

/**
 * Sum wait-node delays along a path from `fromNodeId` to `toNodeId` (BFS, first path wins).
 * Used after a WhatsApp step to pace the next step.
 */
export function waitSecondsOnPath(
  definition: WorkflowDefinition,
  fromNodeId: string,
  toNodeId: string
): number {
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return 0

  const nodeById = new Map(definition.nodes.map((n) => [n.id, n]))
  const edgesBySource = new Map<string, string[]>()
  for (const e of definition.edges ?? []) {
    const list = edgesBySource.get(e.source) ?? []
    list.push(e.target)
    edgesBySource.set(e.source, list)
  }

  const queue: Array<{ id: string; wait: number }> = [{ id: fromNodeId, wait: 0 }]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const { id, wait } = queue.shift()!
    if (id === toNodeId) return wait
    if (visited.has(id)) continue
    visited.add(id)

    for (const nextId of edgesBySource.get(id) ?? []) {
      if (visited.has(nextId)) continue
      const node = nodeById.get(nextId)
      let add = 0
      if (node?.type === 'crm.flow.wait') {
        const p = node.parameters ?? {}
        add = pickWaitSeconds(Number(p.wait_min_seconds ?? 0), Number(p.wait_max_seconds ?? 0))
      }
      queue.push({ id: nextId, wait: wait + add })
    }
  }

  return 0
}
