'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/app/contexts/auth-context'
import { createClient } from '@/app/lib/supabase/client'
import { parseImageStepParameters } from '@/app/lib/campaigns/image-step/parse'
import {
  newDealerTextLayer,
  newStaticTextLayer,
  newVariableTextLayer,
} from '@/app/lib/campaigns/image-step/defaults'
import { isDealerLayer, isStaticLayer, layerListLabel } from '@/app/lib/campaigns/image-step/layer-text'
import { previewCanvasLayout } from '@/app/lib/campaigns/image-step/preview-canvas'
import {
  IMAGE_DEALER_VARIABLE_LABELS,
  IMAGE_DEALER_VARIABLE_OPTIONS,
  IMAGE_VARIABLE_OPTIONS,
  type DealerImageContext,
  type ImageAspectMode,
  type ImageLayerKind,
  type ImageStepParameters,
  type ImageTextLayer,
} from '@/app/lib/campaigns/image-step/types'
import { ImageTextLayersCanvas } from '@/app/dashboard/campaigns/_components/ImageTextLayersCanvas'
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
  const { user } = useAuth()
  const supabase = createClient()
  const [draft, setDraft] = useState<ImageStepParameters>(() =>
    parseImageStepParameters(initialParameters)
  )
  const [localLayers, setLocalLayers] = useState<ImageTextLayer[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [dealerPreview, setDealerPreview] = useState<DealerImageContext | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetFromProps = useCallback(() => {
    const p = parseImageStepParameters(initialParameters)
    setDraft(p)
    setLocalLayers(cloneLayers(p.layers ?? []))
    setSelectedLayerId(p.layers?.[0]?.id ?? null)
    setUploadError(null)
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

  useEffect(() => {
    if (!open || !user?.id) {
      setDealerPreview(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, phone, pgcode')
          .eq('id', user.id)
          .maybeSingle()
        if (cancelled) return
        if (error) throw error
        setDealerPreview({
          full_name: data?.full_name?.trim() ?? '',
          phone: data?.phone?.trim() ?? '',
          pgcode: data?.pgcode?.trim() ?? '',
          email: user.email?.trim() ?? '',
        })
      } catch {
        if (!cancelled) {
          setDealerPreview({
            full_name: '',
            phone: '',
            pgcode: '',
            email: user.email?.trim() ?? '',
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, user?.id, user?.email, supabase])

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

  const addVariableLayer = () => {
    const layer = newVariableTextLayer()
    setLocalLayers((prev) => [...prev, layer])
    setSelectedLayerId(layer.id)
  }

  const addStaticLayer = () => {
    const layer = newStaticTextLayer()
    setLocalLayers((prev) => [...prev, layer])
    setSelectedLayerId(layer.id)
  }

  const addDealerLayer = () => {
    const layer = newDealerTextLayer()
    setLocalLayers((prev) => [...prev, layer])
    setSelectedLayerId(layer.id)
  }

  const duplicateLayer = (id: string) => {
    setLocalLayers((prev) => {
      const src = prev.find((l) => l.id === id)
      if (!src) return prev
      const copy: ImageTextLayer = {
        ...src,
        id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: Math.min(95, src.x + 4),
        y: Math.min(95, src.y + 4),
      }
      setSelectedLayerId(copy.id)
      return [...prev, copy]
    })
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

  const handleSave = () => {
    onSave({ ...draft, layers: cloneLayers(localLayers) })
    onClose()
  }

  const aspect = draft.aspect_mode ?? 'square'
  const canvasW = draft.canvas_width ?? 1080
  const canvasH = draft.canvas_height ?? 1080
  const previewLayout = previewCanvasLayout(aspect, canvasW, canvasH)

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
                  Select text on the canvas to move, resize, rotate, and style it — like Canva.
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
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-slate-700">Background</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void onUpload(f)
                          e.target.value = ''
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-teal-500 hover:bg-teal-50 hover:text-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <svg
                            className="h-4 w-4 shrink-0 text-teal-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                          </svg>
                          {uploading ? 'Uploading…' : previewUrl ? 'Change image' : 'Upload image'}
                        </button>
                        {draft.background_path ? (
                          <span className="max-w-[140px] truncate text-xs text-slate-500" title={draft.background_path}>
                            Image set
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">JPG, PNG, WebP, GIF · max 10MB</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
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
                      <p className="text-xs text-slate-500">{previewLayout.description}</p>
                    </div>
                  </div>
                  {uploading ? <p className="text-sm text-slate-500">Uploading…</p> : null}
                  {uploadError ? <p className="text-sm text-red-600">{uploadError}</p> : null}

                  <ImageTextLayersCanvas
                    canvasRef={canvasRef}
                    key={`canvas-${aspect}-${canvasW}-${canvasH}`}
                    layers={localLayers}
                    selectedLayerId={selectedLayerId}
                    onSelectLayer={setSelectedLayerId}
                    onUpdateLayer={updateLayer}
                    onDuplicateLayer={duplicateLayer}
                    onRemoveLayer={removeLayer}
                    dealerPreview={dealerPreview}
                    className="relative mx-auto w-full max-w-full overflow-hidden rounded-xl border-2 border-slate-300 bg-slate-950 shadow-inner"
                    style={{
                      touchAction: 'none',
                      aspectRatio: previewLayout.aspectRatio,
                      maxHeight: 'min(52vh, 560px)',
                    }}
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full pointer-events-none"
                        style={{ objectFit: previewLayout.imageObjectFit }}
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full min-h-[280px] items-center justify-center p-8 text-center text-sm text-slate-400 pointer-events-none">
                        Upload a background image to start designing
                      </div>
                    )}
                  </ImageTextLayersCanvas>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-100"
                      onClick={addVariableLayer}
                    >
                      + Customer variable
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
                      onClick={addDealerLayer}
                    >
                      + Dealer variable
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      onClick={addStaticLayer}
                    >
                      + Fixed text
                    </button>
                  </div>
                </div>

                <aside className="space-y-4">
                  <InspectorField
                    label="Text layers"
                    hint="Canvas: drag to move, corners to resize, handle below to rotate."
                  >
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
                              <span className="max-w-[120px] truncate text-xs text-slate-500">
                                {layerListLabel(layer)}
                              </span>
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
                      <fieldset className="space-y-2">
                        <legend className="text-xs font-medium text-slate-600">Text source</legend>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              ['variable', 'Customer field'],
                              ['dealer', 'Dealer variable'],
                              ['static', 'Fixed text'],
                            ] as const
                          ).map(([kind, label]) => (
                            <button
                              key={kind}
                              type="button"
                              className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                                (selectedLayer.layer_kind ?? 'variable') === kind
                                  ? 'border-teal-600 bg-teal-50 text-teal-900'
                                  : 'border-slate-200 bg-white text-slate-600'
                              }`}
                              onClick={() =>
                                updateLayer(selectedLayer.id, {
                                  layer_kind: kind as ImageLayerKind,
                                  ...(kind === 'static'
                                    ? { static_text: selectedLayer.static_text ?? 'Your text' }
                                    : {}),
                                  ...(kind === 'dealer'
                                    ? {
                                        variable: IMAGE_DEALER_VARIABLE_OPTIONS.includes(
                                          selectedLayer.variable as (typeof IMAGE_DEALER_VARIABLE_OPTIONS)[number]
                                        )
                                          ? selectedLayer.variable
                                          : 'DealerFullName',
                                      }
                                    : {}),
                                  ...(kind === 'variable'
                                    ? {
                                        variable: IMAGE_VARIABLE_OPTIONS.includes(
                                          selectedLayer.variable as (typeof IMAGE_VARIABLE_OPTIONS)[number]
                                        )
                                          ? selectedLayer.variable
                                          : 'SenderName',
                                      }
                                    : {}),
                                })
                              }
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      {isStaticLayer(selectedLayer) ? (
                        <label className="block text-xs text-slate-600">
                          Your text
                          <textarea
                            rows={2}
                            className="input mt-1 w-full text-sm text-black"
                            value={selectedLayer.static_text ?? ''}
                            placeholder="e.g. Tahniah! Promo istimewa"
                            onChange={(e) =>
                              updateLayer(selectedLayer.id, { static_text: e.target.value })
                            }
                          />
                        </label>
                      ) : isDealerLayer(selectedLayer) ? (
                        <label className="block text-xs text-slate-600">
                          Dealer variable
                          <select
                            className="input mt-1 w-full text-black"
                            value={selectedLayer.variable}
                            onChange={(e) => updateLayer(selectedLayer.id, { variable: e.target.value })}
                          >
                            {IMAGE_DEALER_VARIABLE_OPTIONS.map((v) => (
                              <option key={v} value={v}>
                                {IMAGE_DEALER_VARIABLE_LABELS[v]} ({`{${v}}`})
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-xs text-slate-500">
                            Pulled from your profile when the image is sent.
                          </p>
                        </label>
                      ) : (
                        <label className="block text-xs text-slate-600">
                          Customer variable
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
                      )}
                      <p className="text-xs text-slate-500">
                        Font, size, color, and alignment are on the floating toolbar above the
                        selected text. Use corner handles to resize and the round handle to rotate.
                      </p>
                      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
                        <span className="block text-xs font-medium text-slate-600">Text background</span>
                        <label className="block text-xs text-slate-500">
                          Background color
                          <input
                            type="color"
                            className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-slate-300"
                            value={selectedLayer.text_background_color ?? '#000000'}
                            onChange={(e) =>
                              updateLayer(selectedLayer.id, {
                                text_background_color: e.target.value,
                                text_background_opacity:
                                  (selectedLayer.text_background_opacity ?? 0) > 0
                                    ? selectedLayer.text_background_opacity
                                    : 70,
                              })
                            }
                          />
                        </label>
                        <label className="block text-xs text-slate-500">
                          Transparency ({selectedLayer.text_background_opacity ?? 0}% — 0 = off)
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            className="mt-2 w-full accent-teal-600"
                            value={selectedLayer.text_background_opacity ?? 0}
                            onChange={(e) =>
                              updateLayer(selectedLayer.id, {
                                text_background_opacity: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
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
