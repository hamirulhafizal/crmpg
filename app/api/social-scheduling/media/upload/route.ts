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
import {
  normalizeVideoForStorage,
  withMp4Filename,
} from '@/app/lib/social-content/chrome-safe-video'
import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const SOCIAL_FOLDER = 'social-scheduling'

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
  'video/3gpp2',
  'video/x-m4v',
  'application/pdf',
])

function inferMimeFromFilename(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'heic':
      return 'image/heic'
    case 'heif':
      return 'image/heif'
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'webm':
      return 'video/webm'
    case '3gp':
    case '3gpp':
      return 'video/3gpp'
    case 'pdf':
      return 'application/pdf'
    default:
      return null
  }
}

function resolveMimeType(file: File): string {
  const raw = (file.type || '').toLowerCase().split(';')[0]!.trim()
  if (raw && raw !== 'application/octet-stream') return raw
  return inferMimeFromFilename(file.name || '') || raw || 'application/octet-stream'
}

export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const settings = await loadMediaR2Settings()
    if (!isMediaR2Configured(settings)) {
      return NextResponse.json(
        { error: 'Cloudflare R2 is not configured. Open Media settings and save credentials first.' },
        { status: 400 }
      )
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Invalid upload body'
      // Common when body exceeds middlewareClientMaxBodySize / proxy limits.
      return NextResponse.json(
        {
          error:
            'Upload body too large or interrupted. Use a video under 100MB, or compress it on your phone first.',
          details: message,
        },
        { status: 413 }
      )
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file upload.' }, { status: 400 })
    }

    const mimeType = resolveMimeType(file)
    if (!ALLOWED_TYPES.has(mimeType)) {
      return NextResponse.json(
        {
          error: `Unsupported file type (${mimeType || 'unknown'}). Use JPEG, PNG, GIF, WebP, MP4, MOV, or PDF.`,
        },
        { status: 400 }
      )
    }

    const mediaType = mediaTypeFromMime(mimeType)
    if (!mediaType) {
      return NextResponse.json({ error: 'Unsupported media type.' }, { status: 400 })
    }

    const maxBytes = sizeLimitBytes(settings, mediaType)
    if (!file.size) {
      return NextResponse.json({ error: 'File is empty.' }, { status: 400 })
    }
    if (file.size > maxBytes) {
      return NextResponse.json(
        {
          error: `File exceeds ${settings.sizeLimitsMb[mediaType]} MB limit for ${mediaType}.`,
        },
        { status: 400 }
      )
    }

    let originalFilename =
      file.name || `upload.${mediaType === 'video' ? 'mp4' : mediaType === 'pdf' ? 'pdf' : 'jpg'}`
    const title = originalFilename.replace(/\.[^.]+$/, '') || originalFilename
    let buffer: Buffer = Buffer.from(await file.arrayBuffer())
    let storedMime = mimeType

    // Re-encode every video at ingest so Chrome / Safari / social apps all play it.
    if (mediaType === 'video') {
      try {
        const normalized = await normalizeVideoForStorage(buffer)
        buffer = Buffer.from(normalized.buffer)
        storedMime = normalized.mimeType
        originalFilename = withMp4Filename(originalFilename)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Video normalize failed'
        console.error('Social scheduling video normalize error:', e)
        return NextResponse.json(
          {
            error:
              'Could not convert this video to a browser-safe MP4. Try a shorter clip or re-export as H.264.',
            details: message,
            source: 'ffmpeg',
          },
          { status: 422 }
        )
      }
    }

    const r2Key = buildR2ObjectKey(mediaType, originalFilename, SOCIAL_FOLDER)

    let uploaded: { key: string; publicUrl: string }
    try {
      uploaded = await uploadToR2({
        settings,
        key: r2Key,
        body: buffer,
        mimeType: storedMime,
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'R2 upload failed'
      console.error('Social scheduling R2 upload error:', e)
      return NextResponse.json({ error: message, source: 'r2' }, { status: 502 })
    }

    const admin = createServiceRoleClient()
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('admin_media_assets')
      .insert({
        title,
        original_filename: originalFilename,
        media_type: mediaType,
        mime_type: storedMime,
        size_bytes: buffer.length,
        r2_key: uploaded.key,
        public_url: uploaded.publicUrl,
        folder: SOCIAL_FOLDER,
        uploaded_by: auth.user.id,
        created_at: now,
        updated_at: now,
      })
      .select('id, public_url, media_type, mime_type, original_filename, size_bytes, r2_key')
      .single()

    if (error) {
      const { deleteFromR2 } = await import('@/app/lib/media-r2-storage')
      await deleteFromR2(settings, uploaded.key).catch(() => {})
      throw error
    }

    return NextResponse.json({
      asset: {
        id: data.id,
        publicUrl: data.public_url,
        mediaType: data.media_type,
        mimeType: data.mime_type,
        originalFilename: data.original_filename,
        sizeBytes: data.size_bytes,
        r2Key: data.r2_key,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Upload failed'
    console.error('Social scheduling media upload error:', e)
    return NextResponse.json({ error: message, source: 'server' }, { status: 500 })
  }
}
