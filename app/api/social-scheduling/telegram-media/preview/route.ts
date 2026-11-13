import { NextResponse } from 'next/server'

import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import { TelegramMcpError, fetchTelegramPreviewBytes } from '@/app/lib/telegram-mcp/client'
import { getTelegramMediaChatId, isAllowedTelegramChatId } from '@/app/lib/telegram-mcp/config'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const messageId = Number(url.searchParams.get('messageId') || 0)
  const chatId = url.searchParams.get('chatId')?.trim() || getTelegramMediaChatId()

  if (!Number.isFinite(messageId) || messageId <= 0) {
    return NextResponse.json({ error: 'messageId is required' }, { status: 422 })
  }

  // Only allowlisted PGG100 content channels (private use).
  if (!isAllowedTelegramChatId(chatId)) {
    return NextResponse.json({ error: 'Chat not allowed' }, { status: 403 })
  }

  try {
    const { buffer, contentType } = await fetchTelegramPreviewBytes({ messageId, chatId })
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    if (err instanceof TelegramMcpError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 502 })
    }
    const message = err instanceof Error ? err.message : 'Preview failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
