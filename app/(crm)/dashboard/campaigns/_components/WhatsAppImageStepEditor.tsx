'use client'

import { useCallback, useEffect, useState } from 'react'
import { parseImageStepParameters } from '@/app/lib/campaigns/image-step/parse'
import type { ImageStepParameters } from '@/app/lib/campaigns/image-step/types'
import { ImageTemplatePreview } from '@/app/dashboard/campaigns/_components/ImageTemplatePreview'
import { WhatsAppImageStepDialog } from '@/app/dashboard/campaigns/_components/WhatsAppImageStepDialog'
import { InspectorField } from '@/app/dashboard/campaigns/_components/workflow-node-parameter-forms'
import { sendTimeDisplayLabel } from '@/app/lib/campaigns/workflow-layout'

type Props = {
  nodeId: string
  campaignId?: string | null
  parameters: Record<string, unknown>
  onChange: (partial: Record<string, unknown>) => void
  onSaveTemplate: (parameters: ImageStepParameters) => void
}

function safeInt(n: number, fallback: number, min: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.round(n))
}

export function WhatsAppImageStepEditor({ nodeId, campaignId, parameters, onChange, onSaveTemplate }: Props) {
  const parsed = parseImageStepParameters(parameters)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  const refreshThumb = useCallback(async (path: string) => {
    if (!path.trim()) {
      setThumbUrl(null)
      return
    }
    try {
      const res = await fetch(`/api/campaigns/workflow-media/url?path=${encodeURIComponent(path)}`)
      const json = await res.json()
      if (res.ok && json.url) setThumbUrl(json.url)
    } catch {
      setThumbUrl(null)
    }
  }, [])

  useEffect(() => {
    void refreshThumb(parsed.background_path ?? '')
  }, [parsed.background_path, refreshThumb])

  const patch = (partial: Record<string, unknown>) => onChange(partial)

  const layerCount = parsed.layers?.length ?? 0
  const hasBackground = Boolean(parsed.background_path?.trim())

  return (
    <>
      <InspectorField label="Image template">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
          <ImageTemplatePreview
            key={`${parsed.background_path ?? ''}-${(parsed.layers ?? []).map((l) => `${l.id}:${l.x}:${l.y}:${l.rotation ?? 0}:${l.scale ?? 1}:${l.font_size}`).join('|')}`}
            parameters={parsed}
            backgroundUrl={thumbUrl}
            maxWidthPx={320}
            className="rounded-xl opacity-95"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-2 p-3">
            <div className="min-w-0 text-white">
              <p className="text-xs font-medium text-white/90">
                {layerCount} text layer{layerCount === 1 ? '' : 's'} · {parsed.aspect_mode ?? 'square'}
              </p>
              {!hasBackground ? (
                <p className="text-[11px] text-amber-200">Upload required before send</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-md transition hover:bg-slate-100"
              aria-label="Edit image template"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit
            </button>
          </div>
        </div>
      </InspectorField>

      <InspectorField label="Step order">
        <input
          type="number"
          min={1}
          className="input text-black"
          value={safeInt(parsed.step_order ?? 1, 1, 1)}
          onChange={(e) => patch({ step_order: Math.max(1, Number(e.target.value) || 1) })}
        />
      </InspectorField>
      <InspectorField label="Delay after previous (days)">
        <input
          type="number"
          min={0}
          className="input text-black"
          value={safeInt(parsed.delay_days ?? 0, 0, 0)}
          onChange={(e) => patch({ delay_days: Math.max(0, Number(e.target.value) || 0) })}
        />
      </InspectorField>
      <InspectorField
        label="Send time"
        hint="When off, sends as soon as the step is due."
      >
        <label className="workflow-inspector-check mb-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(parsed.send_time)}
            onChange={(e) => patch({ send_time: e.target.checked ? parsed.send_time || '10:00' : '' })}
            className="h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
          />
          Schedule at a fixed time
        </label>
        {parsed.send_time ? (
          <input
            type="time"
            className="input text-black"
            value={parsed.send_time}
            onChange={(e) => patch({ send_time: e.target.value })}
          />
        ) : (
          <p className="text-sm text-slate-500">Sends immediately when due ({sendTimeDisplayLabel('')}).</p>
        )}
      </InspectorField>

      <label className="workflow-inspector-check flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={parsed.is_active !== false}
          onChange={(e) => patch({ is_active: e.target.checked })}
          className="h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
        />
        Active (include in sends)
      </label>

      <WhatsAppImageStepDialog
        open={dialogOpen}
        nodeId={nodeId}
        campaignId={campaignId}
        initialParameters={parameters}
        onClose={() => setDialogOpen(false)}
        onSave={onSaveTemplate}
      />
    </>
  )
}
