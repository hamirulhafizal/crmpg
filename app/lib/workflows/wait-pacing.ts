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
function asNodeId(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

export function waitSecondsOnPath(
  definition: WorkflowDefinition,
  fromNodeId: string,
  toNodeId: string
): number {
  const fromId = asNodeId(fromNodeId)
  const toId = asNodeId(toNodeId)
  if (!fromId || !toId || fromId === toId) return 0

  const nodeById = new Map(
    definition.nodes
      .map((n) => [asNodeId(n.id), n] as const)
      .filter(([id]) => Boolean(id))
  )
  const edgesBySource = new Map<string, string[]>()
  for (const e of definition.edges ?? []) {
    const source = asNodeId(e.source)
    const target = asNodeId(e.target)
    if (!source || !target) continue
    const list = edgesBySource.get(source) ?? []
    list.push(target)
    edgesBySource.set(source, list)
  }

  const queue: Array<{ id: string; wait: number }> = [{ id: fromId, wait: 0 }]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const { id, wait } = queue.shift()!
    if (id === toId) return wait
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
