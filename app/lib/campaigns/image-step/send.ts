import { humanizeWhatsAppText } from '@/app/lib/campaigns/whatsapp-humanize'
import { parseImageStepParameters } from '@/app/lib/campaigns/image-step/parse'
import { renderCampaignImagePng } from '@/app/lib/campaigns/image-step/render'
import { downloadWorkflowMedia } from '@/app/lib/campaigns/image-step/storage'
import { renderCampaignTemplateForCustomer } from '@/app/lib/campaigns/template'
import { sendCampaignWhatsAppImage } from '@/app/lib/campaigns/send-waha'
import type { ImageStepParameters } from '@/app/lib/campaigns/image-step/types'

export const CAMPAIGN_IMAGE_SEND_VERSION = 'v3-dataurl-node-og'

export async function sendCampaignImageStep(opts: {
  userId: string
  session: string
  phone: string
  parameters: Record<string, unknown>
  customer: Record<string, unknown>
}): Promise<{ caption: string; pngBytes: number }> {
  const params = parseImageStepParameters(opts.parameters)
  const bgPath = params.background_path?.trim()
  if (!bgPath) {
    throw new Error('No background image on this step (open Step 3 in the editor and upload a background)')
  }

  console.log('[campaign-image]', {
    version: CAMPAIGN_IMAGE_SEND_VERSION,
    path: bgPath,
    layers: params.layers?.length ?? 0,
    aspect: params.aspect_mode ?? 'square',
  })

  const bg = await downloadWorkflowMedia(bgPath)
  console.log('[campaign-image] background loaded', { bytes: bg.length })

  let png: Buffer
  try {
    png = await renderCampaignImagePng(params, bg, opts.customer)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack?.split('\n').slice(0, 4).join(' | ') : ''
    console.error('[campaign-image] render failed', { detail, stack })
    throw new Error(`Campaign image render failed: ${detail}`)
  }

  if (!Buffer.isBuffer(png) || !png.length) {
    throw new Error('Campaign image render produced an empty file')
  }

  console.log('[campaign-image] rendered png', { bytes: png.length })

  let caption = renderCampaignTemplateForCustomer(params.caption_template ?? '', opts.customer)
  if (params.randomize_spaces && caption.trim()) {
    caption = humanizeWhatsAppText(caption)
  }

  await sendCampaignWhatsAppImage(opts.userId, opts.session, opts.phone, png, {
    caption: caption.trim() || undefined,
    enable_typing: params.enable_typing !== false && Boolean(caption.trim()),
    mimetype: 'image/png',
    filename: 'campaign-image.png',
  })

  console.log('[campaign-image] whatsapp send ok', { pngBytes: png.length })

  return { caption, pngBytes: png.length }
}

export type { ImageStepParameters }
