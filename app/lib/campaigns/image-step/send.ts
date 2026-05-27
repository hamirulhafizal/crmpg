import { humanizeWhatsAppText } from '@/app/lib/campaigns/whatsapp-humanize'
import { parseImageStepParameters } from '@/app/lib/campaigns/image-step/parse'
import { renderCampaignImagePng } from '@/app/lib/campaigns/image-step/render'
import { downloadWorkflowMedia } from '@/app/lib/campaigns/image-step/storage'
import { renderCampaignTemplateForCustomer } from '@/app/lib/campaigns/template'
import { sendCampaignWhatsAppImage } from '@/app/lib/campaigns/send-waha'
import type { ImageStepParameters } from '@/app/lib/campaigns/image-step/types'

export async function sendCampaignImageStep(opts: {
  userId: string
  session: string
  phone: string
  parameters: Record<string, unknown>
  customer: Record<string, unknown>
}): Promise<{ caption: string; pngBytes: number }> {
  const params = parseImageStepParameters(opts.parameters)
  if (!params.background_path?.trim()) {
    throw new Error('No background image on this step')
  }

  const bg = await downloadWorkflowMedia(params.background_path)
  if (!bg.length) {
    throw new Error('Background image file is empty or could not be loaded from storage')
  }

  const png = await renderCampaignImagePng(params, bg, opts.customer)
  if (!png.length) {
    throw new Error('Failed to render campaign image (empty PNG output)')
  }

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

  return { caption, pngBytes: png.length }
}

export type { ImageStepParameters }
