import { defaultLoopBackOffset, shouldUseLoopBackRouting } from '@/app/lib/workflows/edge-path'
import { topologicalOrder } from '@/app/lib/workflows/graph-order'
import type { WorkflowDefinition, WorkflowEdge, WorkflowNodeInstance } from '@/app/lib/workflows/types'

const NODE_W = 220
const NODE_H = 92
const H_GAP = 56
const V_GAP = 56
const START_X = 80
const START_Y = 80
const BRANCH_OFFSET = 168

export type TidyLayoutOptions = {
  vertical?: boolean
}

function handleRank(handle?: string): number {
  if (handle === 'loop') return 0
  if (handle === 'main' || !handle) return 1
  return 2
}

function isDoneBranchEdge(e: WorkflowEdge): boolean {
  return e.sourceHandle === 'done'
}

function isPrimaryEdge(e: WorkflowEdge): boolean {
  if (e.routing === 'loop-back') return false
  if (isDoneBranchEdge(e)) return false
  return true
}

/** Main-chain visit order (forward edges only, loop handle before main). */
function primaryNodeOrder(def: WorkflowDefinition): string[] {
  const out = new Map<string, WorkflowEdge[]>()
  for (const e of def.edges.filter(isPrimaryEdge)) {
    const list = out.get(e.source) ?? []
    list.push(e)
    out.set(e.source, list)
  }
  for (const [key, list] of out) {
    list.sort((a, b) => handleRank(a.sourceHandle) - handleRank(b.sourceHandle))
    out.set(key, list)
  }

  const triggers = def.nodes.filter((n) => String(n.type).startsWith('crm.trigger.'))
  const starts = triggers.length > 0 ? triggers.map((n) => n.id) : def.nodes.slice(0, 1).map((n) => n.id)

  const visited = new Set<string>()
  const order: string[] = []

  const visit = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)
    order.push(id)
    for (const e of out.get(id) ?? []) visit(e.target)
  }

  for (const s of starts) visit(s)
  for (const n of def.nodes) {
    if (!visited.has(n.id)) visit(n.id)
  }

  return order
}

function assignMainRowPositions(
  order: string[],
  vertical: boolean
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  order.forEach((id, index) => {
    positions[id] = vertical
      ? { x: START_X, y: START_Y + index * (NODE_H + V_GAP) }
      : { x: START_X + index * (NODE_W + H_GAP), y: START_Y }
  })
  return positions
}

function assignDoneBranchPositions(
  def: WorkflowDefinition,
  positions: Record<string, { x: number; y: number }>,
  mainOrder: string[],
  vertical: boolean
): void {
  const doneTargets = [...new Set(def.edges.filter(isDoneBranchEdge).map((e) => e.target))]
  if (doneTargets.length === 0) return

  const mainMaxIndex = mainOrder.length
  let branchSlot = 0

  for (const targetId of doneTargets) {
    const incoming = def.edges.filter((e) => e.target === targetId && isDoneBranchEdge(e))
    const sourceId = incoming[0]?.source
    const sourcePos = sourceId ? positions[sourceId] : undefined

    if (vertical) {
      const x = (sourcePos?.x ?? START_X) + NODE_W + H_GAP
      const y = sourcePos?.y ?? START_Y + mainMaxIndex * (NODE_H + V_GAP)
      positions[targetId] = { x, y }
    } else {
      const x =
        sourcePos != null
          ? sourcePos.x
          : START_X + (mainMaxIndex + branchSlot) * (NODE_W + H_GAP)
      const y = (sourcePos?.y ?? START_Y) + BRANCH_OFFSET
      positions[targetId] = { x, y }
      branchSlot += 1
    }
  }
}

function assignOrphanPositions(
  nodes: WorkflowNodeInstance[],
  positions: Record<string, { x: number; y: number }>,
  mainOrder: string[],
  vertical: boolean
): void {
  let extra = 0
  for (const n of nodes) {
    if (positions[n.id]) continue
    const slot = mainOrder.length + extra
    extra += 1
    positions[n.id] = vertical
      ? { x: START_X + NODE_W + H_GAP, y: START_Y + slot * (NODE_H + V_GAP) }
      : { x: START_X + slot * (NODE_W + H_GAP), y: START_Y }
  }
}

function nodeCenterY(pos: { x: number; y: number }): number {
  return pos.y + NODE_H / 2
}

function nodeEndX(pos: { x: number; y: number }): number {
  return pos.x + NODE_W
}

function refreshEdgeRouting(
  edges: WorkflowEdge[],
  positions: Record<string, { x: number; y: number }>,
  mainIndex: Map<string, number>
): WorkflowEdge[] {
  return edges.map((e) => {
    const src = positions[e.source]
    const tgt = positions[e.target]
    if (!src || !tgt) return e

    const explicitLoop = e.routing === 'loop-back'
    const backwardOnCanvas =
      !explicitLoop &&
      e.routing !== 'default' &&
      (mainIndex.get(e.target) ?? 0) <= (mainIndex.get(e.source) ?? 0) &&
      e.source !== e.target

    const loopBack =
      explicitLoop ||
      backwardOnCanvas ||
      shouldUseLoopBackRouting(nodeEndX(src), tgt.x, e.routing)

    if (!loopBack) {
      const { routing: _r, pathOffsetY: _p, ...rest } = e
      return rest
    }

    const pathOffsetY = defaultLoopBackOffset(nodeCenterY(src), nodeCenterY(tgt))
    return { ...e, routing: 'loop-back' as const, pathOffsetY }
  })
}

/** Auto-layout nodes on a horizontal main row with done branches below and loop-back routing. */
export function tidyWorkflowDefinition(
  def: WorkflowDefinition,
  options: TidyLayoutOptions = {}
): WorkflowDefinition {
  if (def.nodes.length === 0) return def

  const vertical = options.vertical === true
  const mainOrder =
    def.edges.length > 0
      ? primaryNodeOrder(def)
      : topologicalOrder(def).map((n) => n.id)

  const positions = assignMainRowPositions(mainOrder, vertical)
  assignDoneBranchPositions(def, positions, mainOrder, vertical)
  assignOrphanPositions(def.nodes, positions, mainOrder, vertical)

  const mainIndex = new Map(mainOrder.map((id, i) => [id, i]))
  const edges = refreshEdgeRouting(def.edges, positions, mainIndex)

  const nodes = def.nodes.map((n) => ({
    ...n,
    position: positions[n.id] ?? n.position,
  }))

  return { ...def, nodes, edges }
}
