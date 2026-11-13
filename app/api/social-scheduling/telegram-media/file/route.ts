import { NextResponse } from 'next/server'

import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import {
  TelegramMcpError,
  fetchTelegramMediaForPlayback,
  fetchTelegramPreviewBytes,
  requestTelegramDownload,
} from '@/app/lib/telegram-mcp/client'
import { getTelegramMediaChatId, isAllowedTelegramChatId } from '@/app/lib/telegram-mcp/config'

export const runtime = 'nodejs'

function filenameFor(input: {
  messageId: number
  chatId: string
  mediaType?: string
  contentType: string
  fileName?: string | null
}) {
  if (input.fileName?.trim()) return input.fileName.trim()
  const ct = input.contentType.toLowerCase()
  const ext = ct.includes('mp4')
    ? 'mp4'
    : ct.includes('webm')
      ? 'webm'
      : ct.includes('png')
        ? 'png'
        : ct.includes('webp')
          ? 'webp'
          : ct.includes('jpeg') || ct.includes('jpg') || (input.mediaType || '').includes('photo')
            ? 'jpg'
            : (input.mediaType || '').includes('video')
              ? 'mp4'
              : 'bin'
  return `telegram_${input.chatId.replace(/^-/, '')}_${input.messageId}.${ext}`
}

export async function GET(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const messageId = Number(url.searchParams.get('messageId') || 0)
  const chatId = url.searchParams.get('chatId')?.trim() || getTelegramMediaChatId()
  const mediaType = url.searchParams.get('mediaType')?.trim() || 'photo'
  const disposition = url.searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline'
  const preferPreview = url.searchParams.get('preview') === '1'
  const fileNameParam = url.searchParams.get('fileName')

  if (!Number.isFinite(messageId) || messageId <= 0) {
    return NextResponse.json({ error: 'messageId is required' }, { status: 422 })
  }
  if (!isAllowedTelegramChatId(chatId)) {
    return NextResponse.json({ error: 'Chat not allowed' }, { status: 403 })
  }

  try {
    if (preferPreview) {
      const preview = await fetchTelegramPreviewBytes({ messageId, chatId })
      const filename = filenameFor({
        messageId,
        chatId,
        mediaType: 'photo',
        contentType: preview.contentType,
        fileName: fileNameParam,
      })
      return new NextResponse(new Uint8Array(preview.buffer), {
        status: 200,
        headers: {
          'Content-Type': preview.contentType,
          'Content-Length': String(preview.buffer.length),
          'Content-Disposition': `${disposition}; filename="${filename.replace(/"/g, '')}"`,
          'Cache-Control': 'private, max-age=120',
          'X-Telegram-Source': 'preview',
        },
      })
    }

    const fetched = await fetchTelegramMediaForPlayback({ messageId, chatId, mediaType })
    const filename = filenameFor({
      messageId,
      chatId,
      mediaType,
      contentType: fetched.contentType,
      fileName: fileNameParam,
    })

    return new NextResponse(new Uint8Array(fetched.buffer), {
      status: 200,
      headers: {
        'Content-Type': fetched.contentType,
        'Content-Length': String(fetched.buffer.length),
        'Content-Disposition': `${disposition}; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=60',
        'X-Telegram-Source': fetched.source,
        ...(fetched.hostPath ? { 'X-Telegram-Host-Path': fetched.hostPath } : {}),
      },
    })
  } catch (err) {
    if (err instanceof TelegramMcpError) {
      return NextResponse.json(
        { error: err.message, details: err.body },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      )
    }
    const message = err instanceof Error ? err.message : 'Telegram file failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/** Trigger host-side download only (mcptelegram “Download selected”). */
export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json()) as {
      messageId?: number
      chatId?: string
    }
    const messageId = Number(body.messageId || 0)
    const chatId = body.chatId?.trim() || getTelegramMediaChatId()
    if (!Number.isFinite(messageId) || messageId <= 0) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 422 })
    }
    if (!isAllowedTelegramChatId(chatId)) {
      return NextResponse.json({ error: 'Chat not allowed' }, { status: 403 })
    }

    const result = await requestTelegramDownload({ messageId, chatId })
    return NextResponse.json({
      ok: true,
      path: result.path,
      outputDir: result.outputDir,
      message: result.path
        ? `Saved on Telegram host: ${result.path}`
        : 'Download requested on Telegram host.',
    })
  } catch (err) {
    if (err instanceof TelegramMcpError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 502 })
    }
    const message = err instanceof Error ? err.message : 'Download failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
