'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { parseImageStepParameters } from '@/app/lib/campaigns/image-step/parse'
import {
  IMAGE_FONT_OPTIONS,
  IMAGE_VARIABLE_OPTIONS,
  type ImageAspectMode,
  type ImageStepParameters,
  type ImageTextLayer,
} from '@/app/lib/campaigns/image-step/types'
import { newImageTextLayer } from '@/app/lib/campaigns/image-step/defaults'
import { InspectorField } from '@/app/dashboard/campaigns/_components/workflow-node-parameter-forms'
import { TemplateVariableButtons } from '@/app/dashboard/campaigns/_components/TemplateVariableButtons'

type Props = {
  open: boolean
  nodeId: string
  campaignId?: string | null
  initialParameters: Record<string, unknown>
  onClose: () => void
  onSave: (parameters: ImageStepParameters) => void
}

function cloneLayers(layers: ImageTextLayer[]): ImageTextLayer[] {
  return layers.map((l) => ({ ...l }))
}

export function WhatsAppImageStepDialog({
  open,
  nodeId,
  campaignId,
  initialParameters,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<ImageStepParameters>(() =>
    parseImageStepParameters(initialParameters)
  )
  const [localLayers, setLocalLayers] = useState<ImageTextLayer[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragLayerId, setDragLayerId] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  const resetFromProps = useCallback(() => {
    const p = parseImageStepParameters(initialParameters)
    setDraft(p)
    setLocalLayers(cloneLayers(p.layers ?? []))
    setSelectedLayerId(p.layers?.[0]?.id ?? null)
    setUploadError(null)
    setDragLayerId(null)
  }, [initialParameters])

  useEffect(() => {
    if (open) resetFromProps()
  }, [open, resetFromProps])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const refreshPreview = useCallback(async (path: string) => {
    if (!path.trim()) {
      setPreviewUrl(null)
      return
    }
    try {
      const res = await fetch(`/api/campaigns/workflow-media/url?path=${encodeURIComponent(path)}`)
      const json = await res.json()
      if (res.ok && json.url) setPreviewUrl(json.url)
    } catch {
      setPreviewUrl(null)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void refreshPreview(draft.background_path ?? '')
  }, [open, draft.background_path, refreshPreview])

  const patchDraft = (partial: Partial<ImageStepParameters>) => {
    setDraft((prev) => ({ ...prev, ...partial }))
  }

  const updateLayer = (id: string, partial: Partial<ImageTextLayer>) => {
    setLocalLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...partial } : l)))
  }

  const removeLayer = (id: string) => {
    setLocalLayers((prev) => {
      const next = prev.filter((l) => l.id !== id)
      if (selectedLayerId === id) setSelectedLayerId(next[0]?.id ?? null)
      return next
    })
  }

  const addLayer = () => {
    const layer = newImageTextLayer()
    setLocalLayers((prev) => [...prev, layer])
    setSelectedLayerId(layer.id)
  }

  const onUpload = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('campaign_id', campaignId ?? 'draft')
      fd.set('node_id', nodeId)
      const res = await fetch('/api/campaigns/workflow-media/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      patchDraft({
        background_path: json.path,
        background_mimetype: json.mimetype,
        canvas_width: json.width,
        canvas_height: json.height,
      })
      if (json.preview_url) setPreviewUrl(json.preview_url)
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const onCanvasPointerDown = (layerId: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedLayerId(layerId)
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    isDraggingRef.current = true
    setDragLayerId(layerId)

    const el = canvasRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      const x = ((ev.clientX - rect.left) / rect.width) * 100
      const y = ((ev.clientY - rect.top) / rect.height) * 100
      setLocalLayers((prev) =>
        prev.map((l) =>
          l.id === layerId
            ? { ...l, x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) }
            : l
        )
      )
    }

    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      isDraggingRef.current = false
      setDragLayerId(null)
      try {
        target.releasePointerCapture(ev.pointerId)
      } catch {
        /* released */
      }
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const handleSave = () => {
    onSave({ ...draft, layers: cloneLayers(localLayers) })
    onClose()
  }

  const aspect = draft.aspect_mode ?? 'square'
  const aspectClass =
    aspect === 'square' ? 'aspect-square' : aspect === 'fit' ? 'aspect-[4/5]' : 'aspect-[3/4]'

  const selectedLayer = localLayers.find((l) => l.id === selectedLayerId) ?? localLayers[0] ?? null

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="wa-image-dialog"
          role="presentation"
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-sm sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-image-dialog-title"
            className="flex max-h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="wa-image-dialog-title" className="text-lg font-semibold text-slate-900">
                  Edit image template
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Upload a background, place variables, and adjust fonts. Save when done.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                      Background
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="max-w-[220px] text-xs text-slate-600"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void onUpload(f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(['square', 'fit', 'original'] as ImageAspectMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize ${
                            aspect === mode
                              ? 'border-teal-600 bg-teal-50 text-teal-800'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                          onClick={() => patchDraft({ aspect_mode: mode })}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  {uploading ? <p className="text-sm text-slate-500">Uploading…</p> : null}
                  {uploadError ? <p className="text-sm text-red-600">{uploadError}</p> : null}

                  <div
                    ref={canvasRef}
                    className={`relative w-full overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-900 ${aspectClass} max-h-[min(52vh,520px)] ${
                      dragLayerId ? 'cursor-grabbing' : ''
                    }`}
                    style={{ touchAction: 'none' }}
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full min-h-[280px] items-center justify-center p-8 text-center text-sm text-slate-400">
                        Upload a background image to start designing
                      </div>
                    )}
                    {localLayers.map((layer) => (
                      <div
                        key={layer.id}
                        onPointerDown={(e) => onCanvasPointerDown(layer.id, e)}
                        className={`absolute max-w-[92%] -translate-x-1/2 -translate-y-1/2 cursor-grab select-none px-1 touch-none rounded ring-offset-1 ${
                          selectedLayerId === layer.id ? 'ring-2 ring-teal-400' : ''
                        }`}
                        style={{
                          left: `${layer.x}%`,
                          top: `${layer.y}%`,
                          color: layer.color,
                          fontFamily: layer.font_family,
                          fontSize: `${Math.max(12, layer.font_size * 0.42)}px`,
                          fontWeight: layer.font_weight ?? 700,
                          textAlign: layer.align,
                          textShadow: '0 2px 10px rgba(0,0,0,0.65)',
                          whiteSpace: 'pre-wrap',
                          zIndex: dragLayerId === layer.id ? 30 : selectedLayerId === layer.id ? 20 : 10,
                        }}
                      >
                        {`{${layer.variable}}`}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="text-sm font-medium text-teal-700 hover:underline"
                    onClick={addLayer}
                  >
                    + Add text layer
                  </button>
                </div>

                <aside className="space-y-4">
                  <InspectorField label="Text layers" hint="Select a layer to edit font and color.">
                    {localLayers.length === 0 ? (
                      <p className="text-sm text-slate-500">No layers yet. Add one on the canvas.</p>
                    ) : (
                      <ul className="space-y-1">
                        {localLayers.map((layer, idx) => (
                          <li key={layer.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedLayerId(layer.id)}
                              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                                selectedLayerId === layer.id
                                  ? 'border-teal-500 bg-teal-50 text-teal-900'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="font-medium">{`Layer ${idx + 1}`}</span>
                              <span className="font-mono text-xs text-slate-500">{`{${layer.variable}}`}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </InspectorField>

                  {selectedLayer ? (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Layer settings
                        </span>
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => removeLayer(selectedLayer.id)}
                        >
                          Remove
                        </button>
                      </div>
                      <label className="block text-xs text-slate-600">
                        Variable
                        <select
                          className="input mt-1 w-full text-black"
                          value={selectedLayer.variable}
                          onChange={(e) => updateLayer(selectedLayer.id, { variable: e.target.value })}
                        >
                          {IMAGE_VARIABLE_OPTIONS.map((v) => (
                            <option key={v} value={v}>{`{${v}}`}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs text-slate-600">
                        Font family
                        <select
                          className="input mt-1 w-full text-black"
                          value={selectedLayer.font_family}
                          onChange={(e) => updateLayer(selectedLayer.id, { font_family: e.target.value })}
                        >
                          {IMAGE_FONT_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs text-slate-600">
                        Font size ({selectedLayer.font_size}px on send)
                        <input
                          type="range"
                          min={12}
                          max={120}
                          step={1}
                          className="mt-2 w-full accent-teal-600"
                          value={selectedLayer.font_size}
                          onChange={(e) =>
                            updateLayer(selectedLayer.id, {
                              font_size: Math.max(12, Number(e.target.value) || 48),
                            })
                          }
                        />
                      </label>
                      <label className="block text-xs text-slate-600">
                        Color
                        <input
                          type="color"
                          className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-slate-300"
                          value={selectedLayer.color}
                          onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })}
                        />
                      </label>
                      <label className="block text-xs text-slate-600">
                        Align
                        <select
                          className="input mt-1 w-full text-black"
                          value={selectedLayer.align}
                          onChange={(e) =>
                            updateLayer(selectedLayer.id, {
                              align: e.target.value as ImageTextLayer['align'],
                            })
                          }
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </label>
                    </div>
                  ) : null}

                  <InspectorField label="Caption (optional)" hint="Shown below the image in WhatsApp.">
                    <textarea
                      rows={3}
                      className="input w-full font-mono text-xs text-black"
                      value={draft.caption_template ?? ''}
                      onChange={(e) => patchDraft({ caption_template: e.target.value })}
                    />
                    <TemplateVariableButtons compact />
                  </InspectorField>
                </aside>
              </div>
            </div>

            <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-4">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
                onClick={handleSave}
              >
                Save template
              </button>
            </footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
