'use client'

import { useCallback, useRef } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react'
import { useWorkflowEdgeActions } from '@/app/dashboard/campaigns/_components/workflow-edge-actions-context'
import {
  clampLoopBackOffset,
  defaultLoopBackOffset,
  getLoopBackEdgePath,
  shouldUseLoopBackRouting,
  type WorkflowEdgeRouting,
} from '@/app/lib/workflows/edge-path'
export function WorkflowDeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  data,
  sourceHandleId,
}: EdgeProps) {
  const { editable, deleteEdge, updateEdgePathOffset, commitEdgesToDraft } = useWorkflowEdgeActions()
  const { screenToFlowPosition } = useReactFlow()
  const dragRef = useRef<{ startOffset: number } | null>(null)

  const routing = (data?.routing as WorkflowEdgeRouting | undefined) ?? 'default'
  const verticalLayout =
    Boolean(data?.vertical) ||
    (sourcePosition === Position.Bottom && targetPosition === Position.Top)
  const useLoopBack = verticalLayout
    ? routing === 'loop-back'
    : routing === 'loop-back' ||
      shouldUseLoopBackRouting(sourceX, targetX, routing, {
        sourceY,
        targetY,
        sourceHandle: sourceHandleId ?? undefined,
      })

  const pathOffsetY =
    typeof data?.pathOffsetY === 'number' && Number.isFinite(data.pathOffsetY)
      ? data.pathOffsetY
      : defaultLoopBackOffset(sourceY, targetY)

  const loop = useLoopBack
    ? getLoopBackEdgePath({ sourceX, sourceY, targetX, targetY, pathOffsetY })
    : null

  const [smoothPath, smoothLabelX, smoothLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: verticalLayout ? 10 : 8,
  })

  const edgePath = loop?.path ?? smoothPath
  const labelX = loop?.labelX ?? smoothLabelX
  const labelY = loop?.labelY ?? smoothLabelY

  const onControlPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!editable) return
      e.stopPropagation()
      e.preventDefault()
      dragRef.current = { startOffset: pathOffsetY }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [editable, pathOffsetY]
  )

  const onControlPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || !editable) return
      e.stopPropagation()
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const next = clampLoopBackOffset(sourceY, targetY, flow.y)
      updateEdgePathOffset(id, next)
    },
    [editable, id, screenToFlowPosition, sourceY, targetY, updateEdgePathOffset]
  )

  const onControlPointerUp = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = null
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      commitEdgesToDraft()
    },
    [commitEdgesToDraft]
  )

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 2.5 : style?.strokeWidth,
        }}
      />
      {editable ? (
        <EdgeLabelRenderer>
          {useLoopBack ? (
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${loop!.controlX}px,${loop!.controlY}px)`,
                pointerEvents: 'all',
              }}
              className="nodrag nopan"
            >
              <button
                type="button"
                title="Drag up/down to reposition loop line"
                aria-label="Reposition loop connection"
                onPointerDown={onControlPointerDown}
                onPointerMove={onControlPointerMove}
                onPointerUp={onControlPointerUp}
                className={`flex h-6 w-6 cursor-ns-resize items-center justify-center rounded-full border-2 bg-white shadow-md transition-colors hover:border-violet-400 hover:bg-violet-50 ${
                  selected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-slate-300'
                }`}
              >
                <svg className="h-3.5 w-3.5 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="6" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="18" r="1.5" />
                </svg>
              </button>
            </div>
          ) : null}
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - (useLoopBack ? 22 : 0)}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              type="button"
              aria-label="Remove connection"
              title="Remove connection"
              onClick={(e) => {
                e.stopPropagation()
                deleteEdge(id)
              }}
              className={`flex h-5 w-5 items-center justify-center rounded-full border bg-white text-slate-500 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 ${
                selected ? 'border-sky-300 ring-2 ring-sky-100' : 'border-slate-200'
              }`}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
