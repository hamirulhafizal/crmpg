'use client'

import { useEffect, useState } from 'react'
import { ImageTemplatePreview } from '@/app/dashboard/campaigns/_components/ImageTemplatePreview'
import type { CampaignStepDisplay } from '@/app/lib/campaigns/step-display'

export function CampaignStepPreview({ step }: { step: CampaignStepDisplay }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  const bgPath = step.image_parameters?.background_path ?? ''

  useEffect(() => {
    if (step.kind !== 'image' || !bgPath.trim()) {
      setThumbUrl(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/campaigns/workflow-media/url?path=${encodeURIComponent(bgPath)}`
        )
        const json = await res.json()
        if (!cancelled && res.ok && json.url) setThumbUrl(json.url)
      } catch {
        if (!cancelled) setThumbUrl(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step.kind, bgPath])

  if (step.kind === 'image' && step.image_parameters) {
    const layerCount = step.image_parameters.layers?.length ?? 0
    const hasBg = Boolean(bgPath.trim())
    return (
      <div className="mt-2 space-y-2">
        <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800 ring-1 ring-teal-200/80">
          WhatsApp image · {layerCount} text layer{layerCount === 1 ? '' : 's'}
        </span>
        <ImageTemplatePreview
          parameters={step.image_parameters}
          backgroundUrl={thumbUrl}
          maxWidthPx={320}
          className="overflow-hidden rounded-lg border border-slate-200"
          emptyLabel={hasBg ? 'Loading preview…' : 'No background uploaded'}
        />
        {step.message_template.trim() ? (
          <p className="text-xs text-slate-600">
            <span className="font-medium text-slate-500">Caption: </span>
            <span className="whitespace-pre-wrap">{step.message_template}</span>
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{step.message_template}</pre>
  )
}
