import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import { normalizeWaitParams, pickWaitSeconds } from '@/app/lib/workflows/wait-params'

export { pickWaitSeconds } from '@/app/lib/workflows/wait-params'

export function loopNodeIdFromDefinition(definition: WorkflowDefinition): string | null {
  return definition.nodes.find((n) => n.type === 'crm.flow.loop')?.id ?? null
}

/** Wait nodes on the path from the last sent step back to the loop (pace before next customer). */
export function waitSecondsBeforeNextCustomer(
  definition: WorkflowDefinition,
  completedStepNodeId: string
): number {
  const loopId = loopNodeIdFromDefinition(definition)
  if (!loopId || !completedStepNodeId) return 0
  return waitSecondsOnPath(definition, completedStepNodeId, loopId)
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
        const { minSeconds, maxSeconds } = normalizeWaitParams(node.parameters ?? {})
        add = pickWaitSeconds(minSeconds, maxSeconds)
      }
      queue.push({ id: nextId, wait: wait + add })
    }
  }

  return 0
}
