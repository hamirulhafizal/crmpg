import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  MEDIA_COOLDOWN_DAYS,
  type ContentCategory,
} from '@/app/lib/social-content/categories'
import {
  fetchTelegramMediaForImport,
  fetchTelegramPreviewBytes,
  searchTelegramChannelMedia,
  type TelegramMediaItem,
} from '@/app/lib/telegram-mcp/client'
import {
  TELEGRAM_IMPORT_FOLDER,
  isTelegramMediaConfigured,
} from '@/app/lib/telegram-mcp/config'
import {
  buildR2ObjectKey,
  mediaTypeFromMime,
  uploadToR2,
} from '@/app/lib/media-r2-storage'
import {
  isMediaR2Configured,
  loadMediaR2Settings,
  sizeLimitBytes,
} from '@/app/lib/media-r2-settings'

export type PickedMedia = {
  mediaKey: string
  mediaUrl: string
  /** JPEG/PNG poster for videos (so UI never uses mp4 in <img>). */
  mediaThumbUrl: string | null
  mediaType: 'image' | 'video'
  mediaSource: 'r2' | 'telegram'
  mediaTitle: string | null
  mediaCaption: string | null
  telegramMessageId?: number
  telegramChatId?: string
}

async function usedMediaKeys(userId: string): Promise<Set<string>> {
  const admin = createServiceRoleClient()
  const since = new Date()
  since.setDate(since.getDate() - MEDIA_COOLDOWN_DAYS)
  const { data } = await admin
    .from('social_content_media_usage')
    .select('media_key')
    .eq('user_id', userId)
    .gte('used_at', since.toISOString())
  return new Set((data ?? []).map((r) => String(r.media_key)))
}

function scoreR2Asset(
  row: { title?: string | null; original_filename?: string | null; folder?: string | null; media_type?: string },
  category: ContentCategory
): number {
  const hay = `${row.title || ''} ${row.original_filename || ''} ${row.folder || ''}`.toLowerCase()
  let score = 0
  for (const kw of category.r2Keywords) {
    if (hay.includes(kw.toLowerCase())) score += 3
  }
  if (category.preferVideo && row.media_type === 'video') score += 2
  if (!category.preferVideo && row.media_type === 'image') score += 1
  return score
}

async function pickFromR2(
  userId: string,
  category: ContentCategory,
  blocked: Set<string>
): Promise<PickedMedia | null> {
  const admin = createServiceRoleClient()
  const { data } = await admin
    .from('admin_media_assets')
    .select('id, title, original_filename, folder, media_type, public_url, mime_type')
    .in('media_type', ['image', 'video'])
    .order('created_at', { ascending: false })
    .limit(200)

  const ranked = (data ?? [])
    .map((row) => ({ row, score: scoreR2Asset(row, category) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  const images = (data ?? []).filter((r) => r.media_type === 'image')

  const toPicked = (row: {
    id: string
    title?: string | null
    original_filename?: string | null
    media_type: string
    public_url: string
  }): PickedMedia => {
    let mediaThumbUrl: string | null = row.media_type === 'image' ? row.public_url : null
    if (row.media_type === 'video') {
      const words = String(row.title || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3)
        .slice(0, 4)
      const match = images.find((img) => {
        const hay = `${img.title || ''} ${img.original_filename || ''}`.toLowerCase()
        return words.some((w) => hay.includes(w))
      })
      mediaThumbUrl = match?.public_url ?? null
    }
    return {
      mediaKey: `r2:${row.id}`,
      mediaUrl: row.public_url,
      mediaThumbUrl,
      mediaType: row.media_type === 'video' ? 'video' : 'image',
      mediaSource: 'r2',
      mediaTitle: row.title || row.original_filename || null,
      mediaCaption: row.title || null,
    }
  }

  for (const { row } of ranked) {
    if (blocked.has(`r2:${row.id}`)) continue
    if (row.media_type !== 'image' && row.media_type !== 'video') continue
    return toPicked(row)
  }

  for (const row of data ?? []) {
    if (blocked.has(`r2:${row.id}`)) continue
    if (row.media_type !== 'image' && row.media_type !== 'video') continue
    if (category.preferVideo && row.media_type !== 'video') continue
    return toPicked(row)
  }

  return null
}

async function importTelegramToR2(
  item: TelegramMediaItem,
  userId: string
): Promise<PickedMedia | null> {
  const settings = await loadMediaR2Settings()
  if (!isMediaR2Configured(settings)) return null

  // Prefer photos for reliability (video /file may be unavailable on host).
  const mediaType = String(item.mediaType || 'photo').toLowerCase()
  if (mediaType === 'video') {
    // Still try; import path throws 501 if file API missing.
  }

  try {
    const fetched = await fetchTelegramMediaForImport({
      messageId: item.messageId,
      chatId: item.chatId,
      mediaType: item.mediaType,
    })

    const mime = fetched.contentType
    const kind = mediaTypeFromMime(mime)
    if (kind !== 'image' && kind !== 'video') return null
    if (fetched.buffer.length > sizeLimitBytes(settings, kind)) return null

    const ext =
      mime.includes('png')
        ? 'png'
        : mime.includes('webp')
          ? 'webp'
          : mime.includes('mp4')
            ? 'mp4'
            : 'jpg'
    const filename =
      item.fileName ||
      `telegram_${item.chatId.replace(/^-/, '')}_${item.messageId}.${ext}`
    const key = buildR2ObjectKey(kind, filename, TELEGRAM_IMPORT_FOLDER)
    const uploaded = await uploadToR2({
      settings,
      key,
      body: fetched.buffer,
      mimeType: mime,
    })

    let mediaThumbUrl: string | null = kind === 'image' ? uploaded.publicUrl : null
    if (kind === 'video') {
      try {
        const preview = await fetchTelegramPreviewBytes({
          messageId: item.messageId,
          chatId: item.chatId,
        })
        if (preview.contentType.startsWith('image/') && preview.buffer.length > 0) {
          const thumbName = `telegram_${item.chatId.replace(/^-/, '')}_${item.messageId}_thumb.jpg`
          const thumbKey = buildR2ObjectKey('image', thumbName, TELEGRAM_IMPORT_FOLDER)
          const thumbUploaded = await uploadToR2({
            settings,
            key: thumbKey,
            body: preview.buffer,
            mimeType: preview.contentType.split(';')[0]!.trim() || 'image/jpeg',
          })
          mediaThumbUrl = thumbUploaded.publicUrl
        }
      } catch {
        // UI will fall back to <video> poster frame
      }
    }

    const admin = createServiceRoleClient()
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('admin_media_assets')
      .insert({
        title: (item.caption || '').trim().slice(0, 80) || `Telegram ${item.messageId}`,
        original_filename: filename,
        media_type: kind,
        mime_type: mime,
        size_bytes: fetched.buffer.length,
        r2_key: uploaded.key,
        public_url: uploaded.publicUrl,
        folder: TELEGRAM_IMPORT_FOLDER,
        uploaded_by: userId,
        created_at: now,
        updated_at: now,
      })
      .select('id, public_url, media_type, title')
      .single()

    const base = {
      mediaKey: `tg:${item.chatId}:${item.messageId}`,
      mediaUrl: data?.public_url || uploaded.publicUrl,
      mediaThumbUrl,
      mediaType: (data?.media_type === 'video' || kind === 'video' ? 'video' : 'image') as
        | 'image'
        | 'video',
      mediaSource: 'telegram' as const,
      mediaTitle: data?.title || item.caption?.slice(0, 80) || filename,
      mediaCaption: item.caption || null,
      telegramChatId: item.chatId,
      telegramMessageId: item.messageId,
    }

    if (error || !data) return base
    return base
  } catch {
    return null
  }
}

async function pickFromTelegram(
  userId: string,
  category: ContentCategory,
  blocked: Set<string>
): Promise<PickedMedia | null> {
  if (!isTelegramMediaConfigured()) return null

  for (const query of category.mediaQueries) {
    try {
      const result = await searchTelegramChannelMedia({
        query,
        mediaTypes: category.preferVideo ? 'video' : 'photo,video',
        limit: 12,
      })
      const candidates = [...result.items]
      // Prefer photos if video import often fails
      candidates.sort((a, b) => {
        const av = String(a.mediaType).includes('video') ? 1 : 0
        const bv = String(b.mediaType).includes('video') ? 1 : 0
        if (category.preferVideo) return bv - av
        return av - bv
      })

      for (const item of candidates) {
        const key = `tg:${item.chatId}:${item.messageId}`
        if (blocked.has(key)) continue
        const imported = await importTelegramToR2(item, userId)
        if (imported) return imported
      }
    } catch {
      // try next query
    }
  }
  return null
}

/** Pick unused media from R2 first, then Telegram (imported into R2). */
export async function pickMediaForCategory(input: {
  userId: string
  category: ContentCategory
  excludeKeys?: Set<string>
}): Promise<PickedMedia | null> {
  const blocked = await usedMediaKeys(input.userId)
  for (const k of input.excludeKeys ?? []) blocked.add(k)

  const fromR2 = await pickFromR2(input.userId, input.category, blocked)
  if (fromR2) return fromR2

  return pickFromTelegram(input.userId, input.category, blocked)
}

export async function markMediaUsed(input: {
  userId: string
  mediaKey: string
  mediaUrl?: string | null
  categoryId?: string
  batchItemId?: string
}) {
  const admin = createServiceRoleClient()
  await admin.from('social_content_media_usage').upsert(
    {
      user_id: input.userId,
      media_key: input.mediaKey,
      media_url: input.mediaUrl ?? null,
      category_id: input.categoryId ?? null,
      batch_item_id: input.batchItemId ?? null,
      used_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,media_key' }
  )
}
