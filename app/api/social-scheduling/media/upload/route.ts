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
import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const runtime = 'nodejs'

const SOCIAL_FOLDER = 'social-scheduling'
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
])

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

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file upload.' }, { status: 400 })
    }

    const mimeType = (file.type || 'application/octet-stream').toLowerCase()
    if (!ALLOWED_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: 'Unsupported file. Use JPEG, PNG, GIF, WebP, MP4, MOV, or PDF.' },
        { status: 400 }
      )
    }

    const mediaType = mediaTypeFromMime(mimeType)
    if (!mediaType) {
      return NextResponse.json({ error: 'Unsupported media type.' }, { status: 400 })
    }

    const maxBytes = sizeLimitBytes(settings, mediaType)
    if (file.size > maxBytes) {
      return NextResponse.json(
        {
          error: `File exceeds ${settings.sizeLimitsMb[mediaType]} MB limit for ${mediaType}.`,
        },
        { status: 400 }
      )
    }

    const originalFilename = file.name || 'upload'
    const title = originalFilename.replace(/\.[^.]+$/, '') || originalFilename
    const buffer = Buffer.from(await file.arrayBuffer())
    const r2Key = buildR2ObjectKey(mediaType, originalFilename, SOCIAL_FOLDER)

    let uploaded: { key: string; publicUrl: string }
    try {
      uploaded = await uploadToR2({
        settings,
        key: r2Key,
        body: buffer,
        mimeType,
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
        mime_type: mimeType,
        size_bytes: file.size,
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
