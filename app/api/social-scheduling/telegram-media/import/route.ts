import { NextResponse } from 'next/server'

import {
  isMediaR2Configured,
  loadMediaR2Settings,
  sizeLimitBytes,
} from '@/app/lib/media-r2-settings'
import {
  buildR2ObjectKey,
  mediaTypeFromMime,
  uploadToR2,
} from '@/app/lib/media-r2-storage'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import {
  TelegramMcpError,
  fetchTelegramMediaForImport,
} from '@/app/lib/telegram-mcp/client'
import {
  TELEGRAM_IMPORT_FOLDER,
  getTelegramMediaChatId,
  isAllowedTelegramChatId,
  isTelegramMediaConfigured,
} from '@/app/lib/telegram-mcp/config'

export const runtime = 'nodejs'

type ImportItem = {
  messageId: number
  chatId?: string
  mediaType?: string
  caption?: string
  fileName?: string | null
}

function extensionFor(contentType: string, mediaType?: string): string {
  const ct = contentType.toLowerCase()
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('mp4')) return 'mp4'
  if (ct.includes('quicktime') || ct.includes('mov')) return 'mov'
  if (ct.includes('webm')) return 'webm'
  if ((mediaType || '').toLowerCase() === 'video') return 'mp4'
  return 'jpg'
}

export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  if (!isTelegramMediaConfigured()) {
    return NextResponse.json({ error: 'Telegram media is not configured.' }, { status: 400 })
  }

  try {
    const settings = await loadMediaR2Settings()
    if (!isMediaR2Configured(settings)) {
      return NextResponse.json(
        { error: 'Cloudflare R2 is not configured. Open Media settings first.' },
        { status: 400 }
      )
    }

    const body = (await request.json()) as {
      items?: ImportItem[]
      messageIds?: Array<number | string>
      chatId?: string
    }

    const defaultChatId = body.chatId?.trim() || getTelegramMediaChatId()
    if (body.chatId && !isAllowedTelegramChatId(defaultChatId)) {
      return NextResponse.json({ error: 'Chat not allowed' }, { status: 403 })
    }

    const items: ImportItem[] = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.messageIds)
        ? body.messageIds.map((id) => ({ messageId: Number(id), chatId: defaultChatId }))
        : []

    if (!items.length) {
      return NextResponse.json({ error: 'Select at least one Telegram media item.' }, { status: 422 })
    }
    if (items.length > 12) {
      return NextResponse.json({ error: 'Import up to 12 items at a time.' }, { status: 422 })
    }

    const admin = createServiceRoleClient()
    const assets: Array<{
      id: string
      publicUrl: string
      mediaType: string
      mimeType: string
      originalFilename: string
      sizeBytes: number
      r2Key: string
      folder: string
      messageId: number
      chatId: string
    }> = []

    for (const item of items) {
      const messageId = Number(item.messageId)
      if (!Number.isFinite(messageId) || messageId <= 0) {
        throw new TelegramMcpError(`Invalid messageId: ${item.messageId}`, 422)
      }
      const chatId = item.chatId?.trim() || defaultChatId
      if (!isAllowedTelegramChatId(chatId)) {
        throw new TelegramMcpError(`Chat not allowed: ${chatId}`, 403)
      }

      const fetched = await fetchTelegramMediaForImport({
        messageId,
        mediaType: item.mediaType,
        chatId,
      })

      const mimeType = fetched.contentType || 'application/octet-stream'
      const mediaType = mediaTypeFromMime(mimeType)
      if (!mediaType || (mediaType !== 'image' && mediaType !== 'video')) {
        throw new TelegramMcpError(
          `Unsupported Telegram media type for message ${messageId}: ${mimeType}`,
          422
        )
      }

      const maxBytes = sizeLimitBytes(settings, mediaType)
      if (fetched.buffer.length > maxBytes) {
        throw new TelegramMcpError(
          `Message ${messageId} exceeds ${settings.sizeLimitsMb[mediaType]} MB R2 limit.`,
          400
        )
      }

      const ext = extensionFor(mimeType, item.mediaType)
      const originalFilename =
        item.fileName?.trim() ||
        `telegram_${chatId.replace(/^-/, '')}_${messageId}.${ext}`
      const title =
        (item.caption || '').trim().slice(0, 80) ||
        `Telegram ${messageId}`

      const r2Key = buildR2ObjectKey(mediaType, originalFilename, TELEGRAM_IMPORT_FOLDER)
      let uploaded: { key: string; publicUrl: string }
      try {
        uploaded = await uploadToR2({
          settings,
          key: r2Key,
          body: fetched.buffer,
          mimeType,
        })
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'R2 upload failed'
        return NextResponse.json({ error: message, source: 'r2' }, { status: 502 })
      }

      const now = new Date().toISOString()
      const { data, error } = await admin
        .from('admin_media_assets')
        .insert({
          title,
          original_filename: originalFilename,
          media_type: mediaType,
          mime_type: mimeType,
          size_bytes: fetched.buffer.length,
          r2_key: uploaded.key,
          public_url: uploaded.publicUrl,
          folder: TELEGRAM_IMPORT_FOLDER,
          uploaded_by: auth.user.id,
          created_at: now,
          updated_at: now,
        })
        .select('id, public_url, media_type, mime_type, original_filename, size_bytes, r2_key, folder')
        .single()

      if (error || !data) {
        const { deleteFromR2 } = await import('@/app/lib/media-r2-storage')
        await deleteFromR2(settings, uploaded.key).catch(() => {})
        throw new Error(error?.message || 'Failed to save media asset')
      }

      assets.push({
        id: data.id,
        publicUrl: data.public_url,
        mediaType: data.media_type,
        mimeType: data.mime_type,
        originalFilename: data.original_filename,
        sizeBytes: data.size_bytes,
        r2Key: data.r2_key,
        folder: data.folder,
        messageId,
        chatId,
      })
    }

    return NextResponse.json({ assets, folder: TELEGRAM_IMPORT_FOLDER }, { status: 201 })
  } catch (err) {
    if (err instanceof TelegramMcpError) {
      return NextResponse.json(
        { error: err.message, details: err.body },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      )
    }
    const message = err instanceof Error ? err.message : 'Import failed'
    console.error('Telegram media import error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
