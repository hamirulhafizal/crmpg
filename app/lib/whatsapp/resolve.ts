import { canUseWasenderForUser } from '@/app/lib/saas/enforce'
import { isPlatformAdmin } from '@/app/lib/saas/admin-access'
import {
  loadPreferredWahaServerId,
  loadPreferredWasenderServerId,
  loadUserWhatsAppAccess,
} from '@/app/lib/saas/whatsapp-access'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import type { WhatsAppProvider, WhatsAppServerConfig, UserWhatsAppSessionRow } from '@/app/lib/whatsapp/types'

const ENV_BASE_URL = (process.env.WAHA_API_BASE_URL || 'https://api.publicgolds.com').replace(/\/$/, '')
const ENV_API_KEY = process.env.WAHA_API_KEY || ''
const ENV_WASENDER_BASE = (process.env.WASENDER_API_BASE_URL || 'https://wasenderapi.com').replace(/\/$/, '')
const ENV_WASENDER_PAT = process.env.WASENDER_API_TOKEN || process.env.WASENDER_API_KEY || ''

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

type ServerRow = {
  id: string
  api_base_url: string
  api_key: string
  dashboard_pass: string | null
  provider_type: WhatsAppProvider
  is_default: boolean
}

async function loadServerById(serverId: string): Promise<ServerRow | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('waha_servers')
    .select('id, api_base_url, api_key, dashboard_pass, provider_type, is_default')
    .eq('id', serverId)
    .maybeSingle()
  if (error || !data) return null
  return data as ServerRow
}

async function loadDefaultServer(): Promise<ServerRow | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('waha_servers')
    .select('id, api_base_url, api_key, dashboard_pass, provider_type, is_default')
    .eq('is_default', true)
    .maybeSingle()
  if (error || !data) return null
  return data as ServerRow
}

function inferProviderFromBaseUrl(baseUrl: string): WhatsAppProvider | null {
  const host = baseUrl.toLowerCase()
  if (host.includes('wasenderapi.com')) return 'wasender'
  return null
}

function rowToConfig(row: ServerRow): WhatsAppServerConfig {
  const baseUrl = normalizeBaseUrl(row.api_base_url || '')
  const provider =
    row.provider_type === 'wasender'
      ? 'wasender'
      : inferProviderFromBaseUrl(baseUrl) ?? 'waha'
  return {
    serverId: row.id,
    provider,
    baseUrl,
    platformApiKey: (row.api_key || '').trim(),
    dashboardPass:
      typeof row.dashboard_pass === 'string' && row.dashboard_pass.trim()
        ? row.dashboard_pass.trim()
        : null,
  }
}

/** Prefer explicit session/server provider; do not treat session_api_key alone as Wasender. */
export function resolveEffectiveWhatsAppProvider(
  cfg: WhatsAppServerConfig,
  sessionRow?: UserWhatsAppSessionRow | null
): WhatsAppProvider {
  if (sessionRow?.provider_type === 'wasender') return 'wasender'
  if (sessionRow?.provider_type === 'waha') return 'waha'
  if (cfg.provider === 'wasender') return 'wasender'
  if (inferProviderFromBaseUrl(cfg.baseUrl) === 'wasender') return 'wasender'
  return 'waha'
}

function fromEnv(): WhatsAppServerConfig {
  if (ENV_WASENDER_PAT) {
    return {
      serverId: null,
      provider: 'wasender',
      baseUrl: ENV_WASENDER_BASE,
      platformApiKey: ENV_WASENDER_PAT,
      dashboardPass: null,
    }
  }
  return {
    serverId: null,
    provider: 'waha',
    baseUrl: ENV_BASE_URL,
    platformApiKey: ENV_API_KEY,
    dashboardPass: null,
  }
}

export async function getWhatsAppServerConfig(opts: { userId?: string | null } = {}): Promise<WhatsAppServerConfig> {
  const userId = opts.userId?.trim()
  let cfg: WhatsAppServerConfig

  if (userId) {
    const platformAdmin = await isPlatformAdmin(userId)
    const access = platformAdmin ? null : await loadUserWhatsAppAccess(userId)

    const admin = createServiceRoleClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('waha_server_id')
      .eq('id', userId)
      .maybeSingle()

    const assignedServerId = (profile?.waha_server_id || '').toString().trim()
    let serverRow: ServerRow | null = null

    if (assignedServerId) {
      serverRow = await loadServerById(assignedServerId)
    }

    if (!platformAdmin && access) {
      if (access.isProPaid) {
        if (!serverRow || serverRow.provider_type !== 'wasender') {
          const wasenderId = await loadPreferredWasenderServerId()
          if (wasenderId) serverRow = await loadServerById(wasenderId)
        }
      } else if (!access.adminWasenderOverride) {
        if (!serverRow || serverRow.provider_type === 'wasender') {
          const wahaId = await loadPreferredWahaServerId()
          if (wahaId) serverRow = await loadServerById(wahaId)
        }
      }
    }

    if (!serverRow) {
      cfg = await loadDefaultOrEnvConfig()
    } else {
      const resolved = rowToConfig(serverRow)
      if (!resolved.baseUrl || !resolved.platformApiKey) {
        throw new Error(`Assigned WhatsApp server is misconfigured: ${serverRow.id}`)
      }
      cfg = resolved
    }

    return enforceProviderEntitlement(userId, cfg)
  }

  return loadDefaultOrEnvConfig()
}

async function loadDefaultOrEnvConfig(): Promise<WhatsAppServerConfig> {
  const defaultServer = await loadDefaultServer()
  if (defaultServer) {
    const cfg = rowToConfig(defaultServer)
    if (cfg.baseUrl && cfg.platformApiKey) return cfg
  }
  return fromEnv()
}

async function enforceProviderEntitlement(
  userId: string,
  cfg: WhatsAppServerConfig
): Promise<WhatsAppServerConfig> {
  if (cfg.provider !== 'wasender') return cfg

  if (await canUseWasenderForUser(userId)) return cfg

  const wahaServer = await loadDefaultServer()
  if (wahaServer && wahaServer.provider_type !== 'wasender') {
    const wahaCfg = rowToConfig(wahaServer)
    if (wahaCfg.baseUrl && wahaCfg.platformApiKey) return wahaCfg
  }

  throw new Error('WasenderAPI unlocks after paid Pro. Pro trial uses WAHA — upgrade at Billing & plans.')
}

export async function isWhatsAppConfigured(opts: { userId?: string | null } = {}): Promise<boolean> {
  try {
    const cfg = await getWhatsAppServerConfig(opts)
    return Boolean(cfg.baseUrl && cfg.platformApiKey)
  } catch {
    return false
  }
}

export async function getProviderForUser(userId: string): Promise<WhatsAppProvider> {
  const cfg = await getWhatsAppServerConfig({ userId })
  return cfg.provider
}

export async function loadUserWhatsAppSession(userId: string): Promise<UserWhatsAppSessionRow | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('waha_user_sessions')
    .select('id, user_id, session_name, provider_type, external_session_id, session_api_key, last_known_waha_status')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return data as UserWhatsAppSessionRow
}

export async function loadUserWhatsAppSessionByName(
  userId: string,
  sessionName: string
): Promise<UserWhatsAppSessionRow | null> {
  const name = sessionName.trim()
  if (!name) return null
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('waha_user_sessions')
    .select('id, user_id, session_name, provider_type, external_session_id, session_api_key, last_known_waha_status')
    .eq('user_id', userId)
    .eq('session_name', name)
    .maybeSingle()
  if (error || !data) return null
  return data as UserWhatsAppSessionRow
}

export async function loadUserWhatsAppSessions(userId: string): Promise<UserWhatsAppSessionRow[]> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('waha_user_sessions')
    .select('id, user_id, session_name, provider_type, external_session_id, session_api_key, last_known_waha_status')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) return []
  return (data || []) as UserWhatsAppSessionRow[]
}

export async function getServerProviderById(serverId: string | null | undefined): Promise<WhatsAppProvider | null> {
  if (!serverId) return null
  const row = await loadServerById(serverId)
  return row ? (row.provider_type === 'wasender' ? 'wasender' : 'waha') : null
}
