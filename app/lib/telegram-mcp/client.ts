import {
  getTelegramMcpApiKey,
  getTelegramMcpBaseUrl,
  getTelegramMediaChatId,
  getTelegramMediaChatIds,
  isAllowedTelegramChatId,
} from '@/app/lib/telegram-mcp/config'

export type TelegramMediaType = 'photo' | 'video' | 'document'

export type TelegramMediaItem = {
  messageId: number
  chatId: string
  channelTitle: string | null
  mediaType: TelegramMediaType | string
  date: string | null
  caption: string
  fileName: string | null
  previewUrl: string
}

export type TelegramChannelSearchMeta = {
  chatId: string
  resolvedTitle: string | null
  error?: string | null
  itemCount: number
}

export type TelegramMediaSearchResult = {
  multi: boolean
  chatIds: string[]
  items: TelegramMediaItem[]
  channels: TelegramChannelSearchMeta[]
  /** Per-chat pagination offsets for "load older". */
  nextOffsets: Record<string, number> | null
  nextOffsetId: number | null
  query: string
}

export class TelegramMcpError extends Error {
  status: number
  body: unknown

  constructor(message: string, status = 502, body?: unknown) {
    super(message)
    this.name = 'TelegramMcpError'
    this.status = status
    this.body = body
  }
}

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  const key = getTelegramMcpApiKey()
  if (key) {
    headers.set('Authorization', `Bearer ${key}`)
    headers.set('X-Api-Key', key)
  }
  return headers
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    try {
      const sanitized = text.replace(/[\u0000-\u001f]+/g, ' ')
      return JSON.parse(sanitized) as Record<string, unknown>
    } catch {
      throw new TelegramMcpError(
        `Telegram service returned non-JSON (${res.status})`,
        res.status || 502,
        text.slice(0, 300)
      )
    }
  }
}

function mapMediaItem(
  row: Record<string, unknown>,
  fallbackChatId: string
): TelegramMediaItem | null {
  const messageId = Number(row.message_id ?? row.messageId)
  if (!Number.isFinite(messageId)) return null
  const chatId = String(row.chat_id ?? row.chatId ?? fallbackChatId)
  const mediaType = String(row.media_type ?? row.mediaType ?? 'photo')
  const channelTitle =
    typeof row.resolved_title === 'string'
      ? row.resolved_title
      : typeof row.channel_title === 'string'
        ? row.channel_title
        : null
  return {
    messageId,
    chatId,
    channelTitle,
    mediaType,
    date: typeof row.date === 'string' ? row.date : null,
    caption: typeof row.caption === 'string' ? row.caption : '',
    fileName:
      typeof row.file_name === 'string'
        ? row.file_name
        : typeof row.fileName === 'string'
          ? row.fileName
          : null,
    previewUrl: buildTelegramPreviewPath(messageId, chatId),
  }
}

/** Fetch hardcoded/live allowlist of content channels from the Telegram host. */
export async function fetchTelegramChannelAllowlist(): Promise<{
  chatIds: string[]
  labels: Record<string, string>
  name: string | null
}> {
  const base = getTelegramMcpBaseUrl()
  try {
    const res = await fetch(`${base}/api/channel-media/allowlist`, {
      headers: authHeaders({ Accept: 'application/json' }),
      cache: 'no-store',
    })
    const json = await parseJson(res)
    if (!res.ok || json.ok === false) {
      return { chatIds: getTelegramMediaChatIds(), labels: {}, name: null }
    }
    const fromWeb = Array.isArray(json.web_chat_ids)
      ? (json.web_chat_ids as unknown[]).map(String)
      : []
    const fromSuggested =
      typeof json.suggested_channel_media_ids === 'string'
        ? String(json.suggested_channel_media_ids)
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : []
    const chatIds = [...new Set([...(fromWeb.length ? fromWeb : fromSuggested), ...getTelegramMediaChatIds()])]
    const labels =
      json.labels && typeof json.labels === 'object'
        ? (json.labels as Record<string, string>)
        : {}
    return {
      chatIds: chatIds.length ? chatIds : getTelegramMediaChatIds(),
      labels,
      name: typeof json.name === 'string' ? json.name : null,
    }
  } catch {
    return { chatIds: getTelegramMediaChatIds(), labels: {}, name: null }
  }
}

export async function searchTelegramChannelMedia(input: {
  query?: string
  mediaTypes?: Array<'photo' | 'video'> | 'photo' | 'video' | 'photo,video' | 'all'
  limit?: number
  /** Single-channel legacy offset. */
  offsetId?: number
  /** Multi-channel offsets from previous response.nextOffsets. */
  offsets?: Record<string, number>
  chatIds?: string[]
}): Promise<TelegramMediaSearchResult> {
  const base = getTelegramMcpBaseUrl()
  const allowlist = await fetchTelegramChannelAllowlist()
  const requested = (input.chatIds?.length ? input.chatIds : allowlist.chatIds)
    .map((id) => id.trim())
    .filter(Boolean)
  const chatIds = [...new Set(requested.filter((id) => isAllowedTelegramChatId(id) || allowlist.chatIds.includes(id)))]
  if (!chatIds.length) {
    throw new TelegramMcpError('No Telegram content channels configured', 400)
  }

  const mediaTypes =
    input.mediaTypes === 'all' || !input.mediaTypes
      ? 'photo,video'
      : Array.isArray(input.mediaTypes)
        ? input.mediaTypes.join(',')
        : input.mediaTypes

  const payload: Record<string, unknown> = {
    chatIds,
    query: input.query?.trim() || '',
    mediaTypes,
    limit: Math.min(Math.max(input.limit ?? 24, 1), 50),
  }
  if (input.offsets && Object.keys(input.offsets).length) {
    payload.offsets = input.offsets
  } else if (input.offsetId) {
    payload.offsetId = input.offsetId
  }

  const res = await fetch(`${base}/api/channel-media/search`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  const json = await parseJson(res)
  if (!res.ok || json.ok === false) {
    throw new TelegramMcpError(
      String(json.error || `Telegram search failed (${res.status})`),
      res.status || 502,
      json
    )
  }

  const multi = Boolean(json.multi) || chatIds.length > 1
  const rawItems = Array.isArray(json.items) ? json.items : []
  const items: TelegramMediaItem[] = rawItems
    .map((row) => mapMediaItem(row as Record<string, unknown>, chatIds[0]!))
    .filter(Boolean) as TelegramMediaItem[]

  // Enrich titles from allowlist labels when missing.
  for (const item of items) {
    if (!item.channelTitle && allowlist.labels[item.chatId]) {
      item.channelTitle = allowlist.labels[item.chatId] ?? null
    }
  }

  const channelsRaw = Array.isArray(json.channels) ? json.channels : []
  const channels: TelegramChannelSearchMeta[] = channelsRaw.map((row) => {
    const r = row as Record<string, unknown>
    const chatId = String(r.chat_id ?? '')
    const channelItems = Array.isArray(r.items) ? r.items : []
    return {
      chatId,
      resolvedTitle:
        typeof r.resolved_title === 'string'
          ? r.resolved_title
          : allowlist.labels[chatId] || null,
      error: typeof r.error === 'string' ? r.error : null,
      itemCount: channelItems.length,
    }
  })

  const nextOffsets =
    json.next_offsets && typeof json.next_offsets === 'object'
      ? (json.next_offsets as Record<string, number>)
      : null

  const hasMoreOffsets =
    nextOffsets &&
    Object.values(nextOffsets).some((v) => typeof v === 'number' && v > 0)

  return {
    multi,
    chatIds,
    items,
    channels,
    nextOffsets: hasMoreOffsets ? nextOffsets : null,
    nextOffsetId:
      typeof json.next_offset_id === 'number' && json.next_offset_id > 0
        ? json.next_offset_id
        : null,
    query: typeof json.query === 'string' ? json.query : input.query?.trim() || '',
  }
}

/** CRM-relative preview path (admin cookie / bearer protected). */
export function buildTelegramPreviewPath(messageId: number, chatId?: string): string {
  const params = new URLSearchParams({
    messageId: String(messageId),
    chatId: chatId || getTelegramMediaChatId(),
  })
  return `/api/social-scheduling/telegram-media/preview?${params.toString()}`
}

export function buildUpstreamPreviewUrl(messageId: number, chatId?: string): string {
  const base = getTelegramMcpBaseUrl()
  const params = new URLSearchParams({
    chatId: chatId || getTelegramMediaChatId(),
    messageId: String(messageId),
  })
  return `${base}/api/channel-media/preview?${params.toString()}`
}

export async function fetchTelegramPreviewBytes(input: {
  messageId: number
  chatId?: string
}): Promise<{ buffer: Buffer; contentType: string }> {
  const url = buildUpstreamPreviewUrl(input.messageId, input.chatId)
  let lastStatus = 502
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: authHeaders({ Accept: 'image/*,video/*,*/*' }),
      cache: 'no-store',
    })
    lastStatus = res.status
    if (!res.ok) {
      if (attempt === 0 && (res.status >= 500 || res.status === 429)) {
        await new Promise((r) => setTimeout(r, 400))
        continue
      }
      throw new TelegramMcpError(`Failed to fetch Telegram preview (${res.status})`, res.status)
    }
    const contentType = (res.headers.get('content-type') || 'application/octet-stream')
      .split(';')[0]!
      .trim()
    const buffer = Buffer.from(await res.arrayBuffer())
    if (!buffer.length) {
      throw new TelegramMcpError('Telegram preview was empty', 502)
    }
    return { buffer, contentType }
  }
  throw new TelegramMcpError(`Failed to fetch Telegram preview (${lastStatus})`, lastStatus)
}

export async function requestTelegramDownload(input: {
  messageId: number
  chatId?: string
}): Promise<{ outputDir: string | null; path: string | null }> {
  const base = getTelegramMcpBaseUrl()
  const chatId = input.chatId || getTelegramMediaChatId()
  const res = await fetch(`${base}/api/channel-media/download`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({
      chatId,
      messageIds: [input.messageId],
    }),
    cache: 'no-store',
  })
  const json = await parseJson(res)
  if (!res.ok || json.ok === false) {
    throw new TelegramMcpError(
      String(json.error || `Telegram download failed (${res.status})`),
      res.status || 502,
      json
    )
  }
  const files = Array.isArray(json.files) ? json.files : []
  const first = (files[0] || {}) as Record<string, unknown>
  return {
    outputDir: typeof json.output_dir === 'string' ? json.output_dir : null,
    path: typeof first.path === 'string' ? first.path : null,
  }
}

async function fetchTelegramFileBytes(input: {
  messageId: number
  chatId?: string
  path?: string | null
}): Promise<{ buffer: Buffer; contentType: string } | null> {
  const base = getTelegramMcpBaseUrl()
  const chatId = input.chatId || getTelegramMediaChatId()
  const params = new URLSearchParams({
    chatId,
    messageId: String(input.messageId),
  })
  if (input.path) params.set('path', input.path)

  const attempts = [
    `${base}/api/channel-media/file?${params.toString()}`,
    `${base}/api/channel-media/download-file?${params.toString()}`,
  ]

  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        headers: authHeaders({ Accept: 'video/*,image/*,application/octet-stream,*/*' }),
        cache: 'no-store',
      })
      if (!res.ok) continue
      const contentType = (res.headers.get('content-type') || 'application/octet-stream')
        .split(';')[0]!
        .trim()
      if (contentType.includes('text/html') || contentType.includes('application/json')) continue
      const buffer = Buffer.from(await res.arrayBuffer())
      if (!buffer.length) continue
      return { buffer, contentType }
    } catch {
      // try next
    }
  }
  return null
}

/**
 * Resolve bytes for lightbox play / browser download.
 * Photos → preview image. Videos → host download + /file when available.
 */
export async function fetchTelegramMediaForPlayback(input: {
  messageId: number
  mediaType?: string
  chatId?: string
}): Promise<{
  buffer: Buffer
  contentType: string
  source: 'preview' | 'file'
  hostPath: string | null
}> {
  const mediaType = (input.mediaType || 'photo').toLowerCase()
  if (mediaType === 'photo' || mediaType === 'image') {
    const preview = await fetchTelegramPreviewBytes(input)
    return { ...preview, source: 'preview', hostPath: null }
  }

  let hostPath: string | null = null
  try {
    const dl = await requestTelegramDownload(input)
    hostPath = dl.path
  } catch {
    // continue — preview may still work
  }

  const file = await fetchTelegramFileBytes({ ...input, path: hostPath })
  if (file && (file.contentType.startsWith('video/') || file.contentType.startsWith('image/'))) {
    return { ...file, source: 'file', hostPath }
  }

  const preview = await fetchTelegramPreviewBytes(input)
  return { ...preview, source: 'preview', hostPath }
}

/**
 * Always used before R2 upload.
 * Photos: upstream preview is full image.
 * Videos: try /file after download; fall back to preview only if it's a real video.
 */
export async function fetchTelegramMediaForImport(input: {
  messageId: number
  mediaType?: string
  chatId?: string
}): Promise<{ buffer: Buffer; contentType: string; source: 'preview' | 'file' }> {
  const mediaType = (input.mediaType || 'photo').toLowerCase()

  if (mediaType === 'photo' || mediaType === 'image') {
    const preview = await fetchTelegramPreviewBytes(input)
    return { ...preview, source: 'preview' }
  }

  let hostPath: string | null = null
  try {
    const dl = await requestTelegramDownload(input)
    hostPath = dl.path
  } catch {
    // continue
  }

  const file = await fetchTelegramFileBytes({ ...input, path: hostPath })
  if (file && (file.contentType.startsWith('video/') || file.contentType.startsWith('image/'))) {
    return { ...file, source: 'file' }
  }

  const preview = await fetchTelegramPreviewBytes(input)
  if (preview.contentType.startsWith('video/')) {
    return { ...preview, source: 'preview' }
  }

  if (mediaType === 'video') {
    throw new TelegramMcpError(
      hostPath
        ? `Video saved on Telegram host (${hostPath}) but /api/channel-media/file is not exposed for streaming. Use Preview → Download thumb, or add file serving on the MCP host.`
        : 'Telegram video file API is not available yet. Open Preview to download the thumb, or add GET /api/channel-media/file on the Telegram MCP host.',
      501
    )
  }

  return { ...preview, source: 'preview' }
}

export async function getTelegramServiceStatus(): Promise<{
  ok: boolean
  authorized: boolean
  chatId: string
  chatIds: string[]
  channelCount: number
  baseUrl: string
  mcpReachable: boolean
  catalogName: string | null
  error?: string
}> {
  const base = getTelegramMcpBaseUrl()
  const allowlist = await fetchTelegramChannelAllowlist()
  try {
    const res = await fetch(`${base}/api/status`, {
      headers: authHeaders({ Accept: 'application/json' }),
      cache: 'no-store',
    })
    const json = await parseJson(res)
    const telegram = (json.telegram ?? {}) as Record<string, unknown>
    const mcp = (json.mcp ?? {}) as Record<string, unknown>
    return {
      ok: Boolean(json.ok),
      authorized: Boolean(telegram.authorized),
      chatId: allowlist.chatIds[0] || getTelegramMediaChatId(),
      chatIds: allowlist.chatIds,
      channelCount: allowlist.chatIds.length,
      baseUrl: base,
      mcpReachable: Boolean(mcp.reachable),
      catalogName: allowlist.name,
      error: typeof telegram.error === 'string' ? telegram.error : undefined,
    }
  } catch (err) {
    return {
      ok: false,
      authorized: false,
      chatId: allowlist.chatIds[0] || getTelegramMediaChatId(),
      chatIds: allowlist.chatIds,
      channelCount: allowlist.chatIds.length,
      baseUrl: base,
      mcpReachable: false,
      catalogName: allowlist.name,
      error: err instanceof Error ? err.message : 'Telegram service unreachable',
    }
  }
}
