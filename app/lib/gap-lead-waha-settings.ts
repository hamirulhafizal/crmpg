import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import type { WahaConfig } from '@/app/lib/waha'

export const GAP_LEAD_WAHA_SETTINGS_KEY = 'gap_lead_waha'

export type GapLeadWahaSettingsValue = {
  baseUrl: string
  apiKey: string
  session: string
  ccChatId: string
}

const EMPTY_SETTINGS: GapLeadWahaSettingsValue = {
  baseUrl: '',
  apiKey: '',
  session: '',
  ccChatId: '',
}

function trimOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeGapLeadWahaSettingsValue(raw: unknown): GapLeadWahaSettingsValue {
  const input =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    baseUrl: trimOrEmpty(input.baseUrl).replace(/\/+$/, ''),
    apiKey: trimOrEmpty(input.apiKey),
    session: trimOrEmpty(input.session),
    ccChatId: trimOrEmpty(input.ccChatId),
  }
}

export function isGapLeadWahaConfigured(settings: GapLeadWahaSettingsValue): boolean {
  return Boolean(settings.baseUrl && settings.apiKey && settings.session)
}

export async function loadStoredGapLeadWahaSettings(): Promise<GapLeadWahaSettingsValue> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('admin_app_settings')
    .select('value')
    .eq('key', GAP_LEAD_WAHA_SETTINGS_KEY)
    .maybeSingle()

  if (error) throw error
  return normalizeGapLeadWahaSettingsValue(data?.value)
}

/** Runtime settings — Supabase only (no env fallback). */
export async function loadGapLeadWahaSettings(): Promise<GapLeadWahaSettingsValue> {
  try {
    return await loadStoredGapLeadWahaSettings()
  } catch (e) {
    console.warn('GAP lead WAHA settings load failed:', e)
    return { ...EMPTY_SETTINGS }
  }
}

export function gapLeadWahaConfigFromSettings(settings: GapLeadWahaSettingsValue): WahaConfig | null {
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, '')
  const apiKey = settings.apiKey.trim()
  if (!baseUrl || !apiKey) return null
  return { baseUrl, apiKey, dashboardPass: null }
}

export type GapLeadWahaSettingsAdminView = {
  settings: GapLeadWahaSettingsValue
  apiKeyConfigured: boolean
  configured: boolean
}

export async function loadGapLeadWahaSettingsForAdmin(): Promise<GapLeadWahaSettingsAdminView> {
  const settings = await loadStoredGapLeadWahaSettings()
  return {
    settings,
    apiKeyConfigured: Boolean(settings.apiKey),
    configured: isGapLeadWahaConfigured(settings),
  }
}

export class GapLeadWahaSettingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GapLeadWahaSettingsValidationError'
  }
}

export async function saveGapLeadWahaSettings(
  input: Partial<GapLeadWahaSettingsValue>
): Promise<GapLeadWahaSettingsValue> {
  const admin = createServiceRoleClient()
  const existing = await loadStoredGapLeadWahaSettings()

  const next: GapLeadWahaSettingsValue = {
    baseUrl: trimOrEmpty(input.baseUrl ?? existing.baseUrl).replace(/\/+$/, ''),
    apiKey: trimOrEmpty(input.apiKey) || existing.apiKey,
    session: trimOrEmpty(input.session ?? existing.session),
    ccChatId: trimOrEmpty(input.ccChatId ?? existing.ccChatId),
  }

  if (!next.baseUrl) {
    throw new GapLeadWahaSettingsValidationError('WAHA base URL is required.')
  }
  if (!next.session) {
    throw new GapLeadWahaSettingsValidationError('Sender session is required.')
  }
  if (!next.apiKey) {
    throw new GapLeadWahaSettingsValidationError('WAHA API key is required.')
  }

  const { error } = await admin.from('admin_app_settings').upsert(
    {
      key: GAP_LEAD_WAHA_SETTINGS_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )

  if (error) throw error
  return next
}
