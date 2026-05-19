import { MarkerType, type EdgeMarker } from '@xyflow/react'

export function workflowEdgeStroke(active: boolean, complete: boolean): string {
  if (active) return '#0ea5e9'
  if (complete) return '#10b981'
  return '#cbd5e1'
}

export function workflowEdgeMarkerEnd(color: string): EdgeMarker {
  return {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color,
  }
}
