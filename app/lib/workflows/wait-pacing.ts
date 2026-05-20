import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import { normalizeWaitParams, pickWaitSeconds } from '@/app/lib/workflows/wait-params'

export { pickWaitSeconds } from '@/app/lib/workflows/wait-params'

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
        const { minSeconds, maxSeconds } = normalizeWaitParams(node.parameters ?? {})
        add = pickWaitSeconds(minSeconds, maxSeconds)
      }
      queue.push({ id: nextId, wait: wait + add })
    }
  }

  return 0
}
