/**
 * WAHA (WhatsApp HTTP API) client helpers.
 * Resolution order:
 * 1) profiles.waha_server_id -> waha_servers
 * 2) waha_servers.is_default = true
 * 3) WAHA_API_BASE_URL / WAHA_API_KEY env fallback (no dashboard_pass from env)
 */
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export type WahaConfig = {
  baseUrl: string
  apiKey: string
  /** Optional WAHA dashboard password from `waha_servers.dashboard_pass` */
  dashboardPass: string | null
}

type WahaResolveOptions = {
  userId?: string | null
}

export type WahaAttempt = { path: string; status: number; message: string }

export class WahaApiError extends Error {
  status: number
  /** Request path (e.g. `/api/session/chats/...`) for debugging */
  path: string
  /** Prior tries when messages fetch walks multiple candidates */
  attempts?: WahaAttempt[]
  /** PN→LID from WAHA `/lids/pn/...` when message fetch fails (for debug) */
  resolvedLid?: string | null
  /** Chat id found in WAHA chats/overview (for debug) */
  knownChatId?: string | null
  constructor(message: string, status: number, path: string, attempts?: WahaAttempt[]) {
    super(message)
    this.name = 'WahaApiError'
    this.status = status
    this.path = path
    if (attempts?.length) this.attempts = attempts
  }
}

function friendlyHttpStatusMessage(status: number): string {
  switch (status) {
    case 524:
      return 'WAHA timed out (HTTP 524). The WhatsApp host did not respond in time—often overload, cold start, or a very large chat history. Retry later or check the WAHA machine and reverse proxy timeouts.'
    case 504:
      return 'Gateway timeout (HTTP 504) waiting for WAHA.'
    case 503:
      return 'WAHA unavailable (HTTP 503).'
    case 502:
      return 'Bad gateway (HTTP 502) to WAHA.'
    case 408:
      return 'WAHA request aborted (timeout).'
    default:
      return `WAHA HTTP ${status}`
  }
}

/** Avoid dumping Cloudflare/HTML error pages into logs and API JSON */
export function parseWahaErrorBody(text: string, status: number): string {
  const trimmed = text.trim()
  if (!trimmed) return friendlyHttpStatusMessage(status)
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>
    const exc = json.exception as Record<string, unknown> | undefined
    if (exc && typeof exc.message === 'string' && exc.message.trim()) {
      return String(exc.message).trim()
    }
    const msg = json.message ?? json.error ?? json.detail
    if (typeof msg === 'string' && msg.trim()) return String(msg).trim()
  } catch {
    // not JSON
  }
  if (/^<!DOCTYPE/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return friendlyHttpStatusMessage(status)
  }
  const oneLine = trimmed.replace(/\s+/g, ' ')
  if (oneLine.length <= 200) return oneLine
  return `${oneLine.slice(0, 197)}…`
}

const ENV_BASE_URL = (process.env.WAHA_API_BASE_URL || 'https://api.publicgolds.com').replace(/\/$/, '')
const ENV_API_KEY = process.env.WAHA_API_KEY || ''

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function fromEnv(): WahaConfig {
  return { baseUrl: ENV_BASE_URL, apiKey: ENV_API_KEY, dashboardPass: null }
}

async function getWahaServerById(serverId: string): Promise<WahaConfig | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('waha_servers')
    .select('api_base_url, api_key, dashboard_pass')
    .eq('id', serverId)
    .maybeSingle()

  if (error || !data) return null
  return {
    baseUrl: normalizeBaseUrl(data.api_base_url || ''),
    apiKey: (data.api_key || '').trim(),
    dashboardPass:
      typeof data.dashboard_pass === 'string' && data.dashboard_pass.trim()
        ? data.dashboard_pass.trim()
        : null,
  }
}

async function getDefaultWahaServer(): Promise<WahaConfig | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('waha_servers')
    .select('api_base_url, api_key, dashboard_pass')
    .eq('is_default', true)
    .maybeSingle()

  if (error || !data) return null
  return {
    baseUrl: normalizeBaseUrl(data.api_base_url || ''),
    apiKey: (data.api_key || '').trim(),
    dashboardPass:
      typeof data.dashboard_pass === 'string' && data.dashboard_pass.trim()
        ? data.dashboard_pass.trim()
        : null,
  }
}

export async function getWahaConfig(opts: WahaResolveOptions = {}): Promise<WahaConfig> {
  const userId = opts.userId?.trim()

  // Resolve explicit per-user server assignment first.
  // IMPORTANT: if a user is explicitly assigned to a WAHA server,
  // we do NOT fall back to default/env. This prevents accidentally
  // sending traffic with another server key.
  if (userId) {
    const admin = createServiceRoleClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('waha_server_id')
      .eq('id', userId)
      .maybeSingle()

    const assignedServerId = (profile?.waha_server_id || '').toString().trim()
    if (assignedServerId) {
      const assigned = await getWahaServerById(assignedServerId)
      if (!assigned) {
        throw new Error(`Assigned WAHA server not found: ${assignedServerId}`)
      }
      if (!assigned.baseUrl || !assigned.apiKey) {
        throw new Error(`Assigned WAHA server is misconfigured: ${assignedServerId}`)
      }
      return assigned
    }
  }

  const defaultServer = await getDefaultWahaServer()
  if (defaultServer?.baseUrl && defaultServer?.apiKey) {
    return defaultServer
  }

  return fromEnv()
}

export async function isWahaConfigured(opts: WahaResolveOptions = {}): Promise<boolean> {
  const cfg = await getWahaConfig(opts)
  return Boolean(cfg.baseUrl && cfg.apiKey)
}

export async function wahaFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  resolveOptions: WahaResolveOptions = {}
): Promise<T> {
  const { baseUrl, apiKey } = await getWahaConfig(resolveOptions)
  if (!apiKey) {
    throw new Error('WAHA_API_KEY is not configured')
  }
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const timeoutMs = Math.min(
    Math.max(Number(process.env.WAHA_FETCH_TIMEOUT_MS || 90000) || 90000, 5000),
    300000
  )
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      signal: options.signal ?? ac.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        ...options.headers,
      },
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new WahaApiError(
        `WAHA request timed out after ${timeoutMs}ms (${path})`,
        408,
        path
      )
    }
    throw e
  } finally {
    clearTimeout(t)
  }
  const text = await res.text()
  if (!res.ok) {
    const message = parseWahaErrorBody(text, res.status)
    throw new WahaApiError(message, res.status, path)
  }
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined as T
  }
}

/** @deprecated Use {@link loadGapLeadWahaSettings} from gap-lead-waha-settings (Supabase only). */
export function getGapLeadFormWahaConfig(): WahaConfig | null {
  return null
}

/** Same HTTP behaviour as {@link wahaFetch} but uses an explicit config (no DB/env chain). */
export async function wahaFetchWithConfig<T = unknown>(
  cfg: WahaConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!cfg.apiKey) {
    throw new Error('WAHA api key is missing')
  }
  const url = `${cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const timeoutMs = Math.min(
    Math.max(Number(process.env.WAHA_FETCH_TIMEOUT_MS || 90000) || 90000, 5000),
    300000
  )
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      signal: options.signal ?? ac.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': cfg.apiKey,
        ...options.headers,
      },
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new WahaApiError(
        `WAHA request timed out after ${timeoutMs}ms (${path})`,
        408,
        path
      )
    }
    throw e
  } finally {
    clearTimeout(t)
  }
  const text = await res.text()
  if (!res.ok) {
    const message = parseWahaErrorBody(text, res.status)
    throw new WahaApiError(message, res.status, path)
  }
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined as T
  }
}
