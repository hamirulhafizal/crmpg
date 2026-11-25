import { NextResponse } from 'next/server'

import {
  isMediaR2Configured,
  loadMediaR2Settings,
  sizeLimitBytes,
} from '@/app/lib/media-r2-settings'
import {
  buildR2ObjectKey,
  uploadToR2,
} from '@/app/lib/media-r2-storage'
import {
  buildDealerCta,
  downloadSocialVideo,
  generateRepostCaption,
} from '@/app/lib/social-content/link-import'
import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const SOCIAL_FOLDER = 'social-scheduling'

export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => null)) as { url?: string } | null
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!url) {
      return NextResponse.json({ error: 'Paste a social video URL.' }, { status: 400 })
    }

    const settings = await loadMediaR2Settings()
    if (!isMediaR2Configured(settings)) {
      return NextResponse.json(
        { error: 'Cloudflare R2 is not configured. Open Media settings first.' },
        { status: 400 }
      )
    }

    const maxBytes = sizeLimitBytes(settings, 'video')
    const downloaded = await downloadSocialVideo(url)
    if (downloaded.buffer.length > maxBytes) {
      return NextResponse.json(
        {
          error: `Video exceeds ${settings.sizeLimitsMb.video} MB limit.`,
        },
        { status: 400 }
      )
    }

    const admin = createServiceRoleClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('username_pbo, phone, full_name')
      .eq('id', auth.user.id)
      .maybeSingle()

    const cta = buildDealerCta({
      usernamePbo: profile?.username_pbo,
      phone: profile?.phone,
    })

    const { caption, source: captionSource } = await generateRepostCaption({
      meta: downloaded.meta,
      cta,
    })

    const originalFilename = downloaded.filename || 'social-import.mp4'
    const title =
      downloaded.meta.title?.slice(0, 120) ||
      originalFilename.replace(/\.[^.]+$/, '') ||
      'Imported social video'
    const r2Key = buildR2ObjectKey('video', originalFilename, SOCIAL_FOLDER)

    let uploaded: { key: string; publicUrl: string }
    try {
      uploaded = await uploadToR2({
        settings,
        key: r2Key,
        body: downloaded.buffer,
        mimeType: downloaded.mimeType,
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'R2 upload failed'
      console.error('Social link-import R2 error:', e)
      return NextResponse.json({ error: message, source: 'r2' }, { status: 502 })
    }

    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('admin_media_assets')
      .insert({
        title,
        original_filename: originalFilename,
        media_type: 'video',
        mime_type: downloaded.mimeType,
        size_bytes: downloaded.buffer.length,
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
        title,
        publicUrl: data.public_url,
        mediaType: data.media_type,
        mimeType: data.mime_type,
        originalFilename: data.original_filename,
        sizeBytes: data.size_bytes,
        r2Key: data.r2_key,
        folder: SOCIAL_FOLDER,
      },
      caption,
      captionSource,
      meta: downloaded.meta,
      cta,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Import failed'
    console.error('Social link-import error:', e)
    return NextResponse.json({ error: message, source: 'server' }, { status: 500 })
  }
}
