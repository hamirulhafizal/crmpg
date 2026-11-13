import { NextResponse } from 'next/server'

import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import {
  TelegramMcpError,
  getTelegramServiceStatus,
  searchTelegramChannelMedia,
} from '@/app/lib/telegram-mcp/client'
import {
  getTelegramMediaChatIds,
  isTelegramMediaConfigured,
} from '@/app/lib/telegram-mcp/config'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  if (!isTelegramMediaConfigured()) {
    return NextResponse.json(
      { error: 'Telegram media is not configured (TELEGRAM_MCP_BASE_URL).' },
      { status: 400 }
    )
  }

  const url = new URL(request.url)
  const statusOnly = url.searchParams.get('status') === '1'
  if (statusOnly) {
    const status = await getTelegramServiceStatus()
    return NextResponse.json({
      ...status,
      defaultChatIds: getTelegramMediaChatIds(),
    })
  }

  const q = url.searchParams.get('q')?.trim() || ''
  const type = (url.searchParams.get('type') || 'all').trim()
  const offsetId = Number(url.searchParams.get('offsetId') || 0) || 0
  const limit = Number(url.searchParams.get('limit') || 24) || 24
  const offsetsRaw = url.searchParams.get('offsets')?.trim() || ''

  let offsets: Record<string, number> | undefined
  if (offsetsRaw) {
    try {
      const parsed = JSON.parse(offsetsRaw) as Record<string, number>
      offsets = parsed
    } catch {
      return NextResponse.json({ error: 'Invalid offsets JSON' }, { status: 422 })
    }
  }

  const mediaTypes =
    type === 'photo' || type === 'image'
      ? 'photo'
      : type === 'video'
        ? 'video'
        : 'photo,video'

  try {
    const result = await searchTelegramChannelMedia({
      query: q,
      mediaTypes,
      offsetId: offsets ? undefined : offsetId,
      offsets,
      limit,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof TelegramMcpError) {
      return NextResponse.json(
        { error: err.message, details: err.body },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      )
    }
    const message = err instanceof Error ? err.message : 'Telegram search failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
