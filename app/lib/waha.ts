/**
 * WAHA (WhatsApp HTTP API) client helpers.
 * Resolution order:
 * 1) profiles.waha_server_id -> waha_servers
 * 2) waha_servers.is_default = true
 * 3) WAHA_API_BASE_URL / WAHA_API_KEY env fallback
 */
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type WahaConfig = {
  baseUrl: string
  apiKey: string
}

type WahaResolveOptions = {
  userId?: string | null
}

const ENV_BASE_URL = (process.env.WAHA_API_BASE_URL || 'https://api.publicgolds.com').replace(/\/$/, '')
const ENV_API_KEY = process.env.WAHA_API_KEY || ''

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function fromEnv(): WahaConfig {
  return { baseUrl: ENV_BASE_URL, apiKey: ENV_API_KEY }
}

async function getWahaServerById(serverId: string): Promise<WahaConfig | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('waha_servers')
    .select('api_base_url, api_key')
    .eq('id', serverId)
    .maybeSingle()

  if (error || !data) return null
  return {
    baseUrl: normalizeBaseUrl(data.api_base_url || ''),
    apiKey: (data.api_key || '').trim(),
  }
}

async function getDefaultWahaServer(): Promise<WahaConfig | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('waha_servers')
    .select('api_base_url, api_key')
    .eq('is_default', true)
    .maybeSingle()

  if (error || !data) return null
  return {
    baseUrl: normalizeBaseUrl(data.api_base_url || ''),
    apiKey: (data.api_key || '').trim(),
  }
}

export async function getWahaConfig(opts: WahaResolveOptions = {}): Promise<WahaConfig> {
  const userId = opts.userId?.trim()

  // Resolve explicit per-user server assignment first.
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
      if (assigned?.baseUrl && assigned?.apiKey) return assigned
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
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      ...options.headers,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    let message = `WAHA API error ${res.status}`
    try {
      const json = JSON.parse(text)
      message = json.message || json.error || json.detail || message
    } catch {
      if (text) message = text.slice(0, 200)
    }
    throw new Error(message)
  }
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined as T
  }
}
