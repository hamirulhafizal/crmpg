'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { layerPreviewText } from '@/app/lib/campaigns/image-step/layer-text'
import { layerCanvasTextStyle } from '@/app/lib/campaigns/image-step/layer-style'
import {
  clampLayerScale,
  clampRotation,
  layerBoxTransformCss,
} from '@/app/lib/campaigns/image-step/layer-transform'
import type { ImageTextAlign, ImageTextLayer, DealerImageContext } from '@/app/lib/campaigns/image-step/types'
import { FontFamilyPicker } from '@/app/dashboard/campaigns/_components/FontFamilyPicker'

type GestureKind = 'move' | 'resize' | 'rotate' | null

type Props = {
  layers: ImageTextLayer[]
  selectedLayerId: string | null
  onSelectLayer: (id: string | null) => void
  onUpdateLayer: (id: string, partial: Partial<ImageTextLayer>) => void
  onDuplicateLayer: (id: string) => void
  onRemoveLayer: (id: string) => void
  canvasRef?: React.RefObject<HTMLDivElement | null>
  /** Non-interactive preview — same layer markup as the editor canvas. */
  readOnly?: boolean
  /** Resolved dealer profile values for dealer-variable layer preview. */
  dealerPreview?: DealerImageContext | null
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

function angleDeg(cx: number, cy: number, px: number, py: number): number {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI
}

function dist(cx: number, cy: number, px: number, py: number): number {
  return Math.hypot(px - cx, py - cy)
}

function ToolbarBtn({
  title,
  onClick,
  active,
  children,
  danger,
}: {
  title: string
  onClick: () => void
  active?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
        danger
          ? 'text-red-600 hover:bg-red-50'
          : active
            ? 'bg-violet-100 text-violet-800'
            : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

function LayerFloatingToolbar({
  layer,
  previewText,
  onUpdate,
  onDuplicate,
  onRemove,
}: {
  layer: ImageTextLayer
  previewText: string
  onUpdate: (partial: Partial<ImageTextLayer>) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const [fontOpen, setFontOpen] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!fontOpen) return
    const close = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setFontOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [fontOpen])

  const bumpSize = (delta: number) => {
    onUpdate({ font_size: Math.min(200, Math.max(12, layer.font_size + delta)) })
  }

  return (
    <div
      className="pointer-events-auto absolute bottom-full left-1/2 z-50 mb-3 -translate-x-1/2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 rounded-full border border-slate-200/90 bg-white px-1 py-1 shadow-lg shadow-slate-900/10">
        <div className="relative" ref={popRef}>
          <button
            type="button"
            onClick={() => setFontOpen((o) => !o)}
            className="max-w-[120px] truncate rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100"
            title="Font family"
          >
            Font
          </button>
          {fontOpen ? (
            <div className="absolute left-0 top-full z-[60] mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <FontFamilyPicker
                compact
                value={layer.font_family}
                previewText={previewText}
                onChange={(font_family) => {
                  onUpdate({ font_family })
                  setFontOpen(false)
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="mx-0.5 h-5 w-px bg-slate-200" />

        <ToolbarBtn title="Smaller" onClick={() => bumpSize(-2)}>
          <span className="text-sm font-bold leading-none">A−</span>
        </ToolbarBtn>
        <span className="min-w-[2rem] text-center text-[11px] font-medium tabular-nums text-slate-600">
          {layer.font_size}
        </span>
        <ToolbarBtn title="Larger" onClick={() => bumpSize(2)}>
          <span className="text-sm font-bold leading-none">A+</span>
        </ToolbarBtn>

        <div className="mx-0.5 h-5 w-px bg-slate-200" />

        <label
          title="Text color"
          className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className="h-5 w-5 rounded-full border border-slate-300 shadow-inner"
            style={{ backgroundColor: layer.color }}
          />
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={layer.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
          />
        </label>

        {(['left', 'center', 'right'] as ImageTextAlign[]).map((align) => (
          <ToolbarBtn
            key={align}
            title={`Align ${align}`}
            active={layer.align === align}
            onClick={() => onUpdate({ align })}
          >
            <AlignIcon align={align} />
          </ToolbarBtn>
        ))}

        <div className="mx-0.5 h-5 w-px bg-slate-200" />

        <ToolbarBtn
          title="Flip horizontal"
          active={layer.flip_x}
          onClick={() => onUpdate({ flip_x: !layer.flip_x })}
        >
          <FlipHIcon />
        </ToolbarBtn>
        <ToolbarBtn
          title="Flip vertical"
          active={layer.flip_y}
          onClick={() => onUpdate({ flip_y: !layer.flip_y })}
        >
          <FlipVIcon />
        </ToolbarBtn>

        <div className="mx-0.5 h-5 w-px bg-slate-200" />

        <ToolbarBtn title="Duplicate" onClick={onDuplicate}>
          <DuplicateIcon />
        </ToolbarBtn>
        <ToolbarBtn title="Delete" danger onClick={onRemove}>
          <TrashIcon />
        </ToolbarBtn>
      </div>
    </div>
  )
}

function AlignIcon({ align }: { align: ImageTextAlign }) {
  const bars =
    align === 'left'
      ? ['w-3', 'w-2', 'w-2.5']
      : align === 'right'
        ? ['w-2.5', 'w-2', 'w-3']
        : ['w-2', 'w-3', 'w-2']
  return (
    <span className="flex flex-col gap-0.5">
      {bars.map((w, i) => (
        <span key={i} className={`block h-0.5 rounded-full bg-current ${w}`} />
      ))}
    </span>
  )
}

function FlipHIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 3v18M7 8l-5 4 5 4M17 8l5 4-5 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FlipVIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12h18M8 7l4-5 4 5M8 17l4 5 4-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DuplicateIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="8" y="8" width="14" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function SelectionChrome({
  onResizeStart,
  onRotateStart,
}: {
  onResizeStart: (e: React.PointerEvent) => void
  onRotateStart: (e: React.PointerEvent) => void
}) {
  const handleClass =
    'absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-violet-600 bg-white shadow-md touch-none'

  return (
    <>
      <div
        className="pointer-events-none absolute -inset-1 rounded-sm border-2 border-violet-500"
        aria-hidden
      />
      {/* corner resize */}
      <div
        className={`${handleClass} -right-1 -bottom-1 cursor-nwse-resize`}
        style={{ right: -6, bottom: -6, left: 'auto', top: 'auto', transform: 'none' }}
        onPointerDown={onResizeStart}
      />
      <div
        className={`${handleClass} -left-1 -top-1 cursor-nwse-resize`}
        style={{ left: -6, top: -6, transform: 'none' }}
        onPointerDown={onResizeStart}
      />
      <div
        className={`${handleClass} -right-1 -top-1 cursor-nesw-resize`}
        style={{ right: -6, top: -6, left: 'auto', transform: 'none' }}
        onPointerDown={onResizeStart}
      />
      <div
        className={`${handleClass} -left-1 -bottom-1 cursor-nesw-resize`}
        style={{ left: -6, bottom: -6, top: 'auto', transform: 'none' }}
        onPointerDown={onResizeStart}
      />
      {/* rotation handle */}
      <div
        className="absolute left-1/2 top-full z-10 mt-5 flex -translate-x-1/2 flex-col items-center touch-none"
        style={{ pointerEvents: 'auto' }}
      >
        <div className="h-5 w-px bg-violet-500" />
        <button
          type="button"
          className="flex h-7 w-7 cursor-grab items-center justify-center rounded-full border-2 border-violet-600 bg-white text-violet-700 shadow-md active:cursor-grabbing"
          title="Rotate"
          onPointerDown={onRotateStart}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              d="M4 12a8 8 0 018-8 8 8 0 018 8M20 8v4h-4"
            />
          </svg>
        </button>
      </div>
    </>
  )
}

export function ImageTextLayersCanvas({
  layers,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer,
  onDuplicateLayer,
  onRemoveLayer,
  canvasRef: canvasRefProp,
  readOnly = false,
  dealerPreview = null,
  className = '',
  style,
  children,
}: Props) {
  const internalCanvasRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = canvasRefProp ?? internalCanvasRef

  const gestureRef = useRef<{
    kind: GestureKind
    layerId: string
    startX: number
    startY: number
    startScale: number
    startRotation: number
    startAngle: number
    startDist: number
    centerX: number
    centerY: number
    pendingMove?: boolean
  } | null>(null)

  const endGesture = useCallback(() => {
    gestureRef.current = null
  }, [])

  const getCanvasRect = () => canvasRef.current?.getBoundingClientRect()

  const getLayerCenter = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId)
    const rect = getCanvasRect()
    if (!layer || !rect) return { cx: 0, cy: 0 }
    return {
      cx: rect.left + (layer.x / 100) * rect.width,
      cy: rect.top + (layer.y / 100) * rect.height,
    }
  }

  useEffect(() => {
    if (readOnly) return
    const onMove = (ev: PointerEvent) => {
      const g = gestureRef.current
      if (!g) return
      const rect = getCanvasRect()
      if (!rect) return

      if (g.kind === 'move') {
        const dx = ev.clientX - g.startX
        const dy = ev.clientY - g.startY
        if (g.pendingMove && Math.hypot(dx, dy) < 4) return
        if (g.pendingMove) g.pendingMove = false
        const x = ((ev.clientX - rect.left) / rect.width) * 100
        const y = ((ev.clientY - rect.top) / rect.height) * 100
        onUpdateLayer(g.layerId, {
          x: Math.min(100, Math.max(0, x)),
          y: Math.min(100, Math.max(0, y)),
        })
        return
      }

      if (g.kind === 'resize') {
        const d = dist(g.centerX, g.centerY, ev.clientX, ev.clientY)
        const ratio = g.startDist > 8 ? d / g.startDist : 1
        onUpdateLayer(g.layerId, {
          scale: clampLayerScale(g.startScale * ratio),
        })
        return
      }

      if (g.kind === 'rotate') {
        const a = angleDeg(g.centerX, g.centerY, ev.clientX, ev.clientY)
        onUpdateLayer(g.layerId, {
          rotation: clampRotation(g.startRotation + (a - g.startAngle)),
        })
      }
    }

    const onUp = () => endGesture()

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [layers, onUpdateLayer, endGesture, canvasRef, readOnly])

  const startGesture = (
    kind: GestureKind,
    layerId: string,
    e: React.PointerEvent,
    extra?: { startScale?: number; startRotation?: number }
  ) => {
    e.preventDefault()
    e.stopPropagation()
    onSelectLayer(layerId)
    const { cx, cy } = getLayerCenter(layerId)
    const layer = layers.find((l) => l.id === layerId)
    gestureRef.current = {
      kind,
      layerId,
      startX: e.clientX,
      startY: e.clientY,
      startScale: extra?.startScale ?? layer?.scale ?? 1,
      startRotation: extra?.startRotation ?? layer?.rotation ?? 0,
      startAngle: angleDeg(cx, cy, e.clientX, e.clientY),
      startDist: dist(cx, cy, e.clientX, e.clientY),
      centerX: cx,
      centerY: cy,
      pendingMove: kind === 'move',
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      ref={canvasRef}
      className={className}
      style={style}
      onPointerDown={readOnly ? undefined : () => onSelectLayer(null)}
    >
      {children}
      {layers.map((layer) => {
        const selected = !readOnly && selectedLayerId === layer.id
        const preview = layerPreviewText(layer, dealerPreview)
        return (
          <div
            key={layer.id}
            className={readOnly ? 'pointer-events-none absolute' : 'absolute touch-none'}
            style={{
              left: `${layer.x}%`,
              top: `${layer.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: selected ? 30 : 10,
            }}
            onPointerDown={readOnly ? undefined : (e) => e.stopPropagation()}
          >
            <div
              className="relative"
              style={{
                transform: layerBoxTransformCss(layer),
                transformOrigin: 'center center',
              }}
            >
              {selected ? (
                <LayerFloatingToolbar
                  layer={layer}
                  previewText={preview}
                  onUpdate={(partial) => onUpdateLayer(layer.id, partial)}
                  onDuplicate={() => onDuplicateLayer(layer.id)}
                  onRemove={() => onRemoveLayer(layer.id)}
                />
              ) : null}

              <div className="relative inline-block max-w-[min(92vw,480px)]">
                {selected ? (
                  <SelectionChrome
                    onResizeStart={(e) =>
                      startGesture('resize', layer.id, e, { startScale: layer.scale ?? 1 })
                    }
                    onRotateStart={(e) =>
                      startGesture('rotate', layer.id, e, {
                        startRotation: layer.rotation ?? 0,
                      })
                    }
                  />
                ) : null}

                <div
                  role={readOnly ? undefined : 'button'}
                  tabIndex={readOnly ? undefined : 0}
                  onPointerDown={
                    readOnly
                      ? undefined
                      : (e) => {
                          onSelectLayer(layer.id)
                          startGesture('move', layer.id, e)
                        }
                  }
                  onClick={readOnly ? undefined : (e) => e.stopPropagation()}
                  className={
                    readOnly
                      ? 'select-none px-1'
                      : `cursor-grab select-none px-1 active:cursor-grabbing ${
                          selected ? '' : 'hover:ring-1 hover:ring-white/40 rounded'
                        }`
                  }
                  style={layerCanvasTextStyle(layer)}
                >
                  {preview}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
