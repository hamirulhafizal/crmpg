export type WorkflowEdgeRouting = 'default' | 'loop-back'

const MIN_LOOP_OFFSET = 48
const DEFAULT_LOOP_OFFSET = 100

/** Extra vertical drop below the lower endpoint for loop-back edges. */
export function defaultLoopBackOffset(sourceY: number, targetY: number): number {
  return DEFAULT_LOOP_OFFSET + Math.max(0, Math.abs(sourceY - targetY) * 0.15)
}

export type LoopBackRoutingHint = {
  sourceY?: number
  targetY?: number
  sourceHandle?: string
}

/** True when the connection goes backward on the canvas (typical loop-back). */
export function shouldUseLoopBackRouting(
  sourceX: number,
  targetX: number,
  explicit?: WorkflowEdgeRouting,
  hint?: LoopBackRoutingHint
): boolean {
  if (explicit === 'loop-back') return true
  if (explicit === 'default') return false
  if (hint?.sourceHandle === 'done') return false
  if (
    hint?.sourceY != null &&
    hint?.targetY != null &&
    hint.targetY > hint.sourceY + 64
  ) {
    return false
  }
  return sourceX > targetX + 60
}

export function getLoopBackEdgePath(opts: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  pathOffsetY: number
}): { path: string; labelX: number; labelY: number; controlX: number; controlY: number } {
  const { sourceX, sourceY, targetX, targetY } = opts
  const pathOffsetY = Math.max(MIN_LOOP_OFFSET, opts.pathOffsetY)
  const bottomY = Math.max(sourceY, targetY) + pathOffsetY
  const r = 14

  const path = [
    `M ${sourceX} ${sourceY}`,
    `L ${sourceX} ${bottomY - r}`,
    `Q ${sourceX} ${bottomY} ${sourceX - r} ${bottomY}`,
    `L ${targetX + r} ${bottomY}`,
    `Q ${targetX} ${bottomY} ${targetX} ${bottomY - r}`,
    `L ${targetX} ${targetY}`,
  ].join(' ')

  const controlX = (sourceX + targetX) / 2
  const controlY = bottomY

  return {
    path,
    labelX: controlX,
    labelY: controlY,
    controlX,
    controlY,
  }
}

export function clampLoopBackOffset(
  sourceY: number,
  targetY: number,
  flowControlY: number
): number {
  const bottom = Math.max(sourceY, targetY)
  return Math.max(MIN_LOOP_OFFSET, flowControlY - bottom)
}
