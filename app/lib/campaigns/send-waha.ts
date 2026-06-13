import type { WhatsAppSendOptions } from '@/app/lib/campaigns/whatsapp-send-options'
import {
  sendWhatsAppImage,
  sendWhatsAppText,
} from '@/app/lib/whatsapp/send'

export type CampaignWhatsAppSendOpts = Partial<WhatsAppSendOptions>

export async function sendCampaignWhatsAppText(
  userId: string,
  session: string,
  phone: string,
  text: string,
  opts?: CampaignWhatsAppSendOpts
): Promise<void> {
  return sendWhatsAppText({
    userId,
    session,
    phone,
    text,
    enableTyping: opts?.enable_typing,
    randomizeSpaces: opts?.randomize_spaces,
  })
}

export type CampaignWhatsAppImageSendOpts = {
  caption?: string
  enable_typing?: boolean
  mimetype?: string
  filename?: string
}

export async function sendCampaignWhatsAppImage(
  userId: string,
  session: string,
  phone: string,
  imageBytes: Buffer,
  opts?: CampaignWhatsAppImageSendOpts
): Promise<void> {
  return sendWhatsAppImage({
    userId,
    session,
    phone,
    imageBytes,
    caption: opts?.caption,
    enableTyping: opts?.enable_typing,
    mimetype: opts?.mimetype,
    filename: opts?.filename,
  })
}
