import { NextResponse } from 'next/server'
import { CAMPAIGN_WORKFLOW_MEDIA_BUCKET } from '@/app/lib/campaigns/image-step/defaults'
import { createClient } from '@/app/lib/supabase/server'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function extForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'png'
}

/** Read PNG/JPEG dimensions from buffer (minimal parser). */
function readImageDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    }
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) break
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        }
      }
      i += 2 + len
    }
  }
  return null
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const campaignId = String(formData.get('campaign_id') ?? 'draft').trim() || 'draft'
    const nodeId = String(formData.get('node_id') ?? 'node').trim() || 'node'

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: 'Use JPEG, PNG, WebP, or GIF' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be under 10MB' }, { status: 400 })
    }

    const ab = await file.arrayBuffer()
    const buffer = Buffer.from(ab)
    const dims = readImageDimensions(buffer)
    const ext = extForMime(file.type)
    const path = `${user.id}/${campaignId}/${nodeId}/background.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(CAMPAIGN_WORKFLOW_MEDIA_BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: signed } = await supabase.storage
      .from(CAMPAIGN_WORKFLOW_MEDIA_BUCKET)
      .createSignedUrl(path, 3600)

    return NextResponse.json({
      path,
      mimetype: file.type,
      width: dims?.width ?? 1080,
      height: dims?.height ?? 1080,
      preview_url: signed?.signedUrl ?? null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
