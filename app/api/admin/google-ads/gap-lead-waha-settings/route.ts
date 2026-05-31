import { NextResponse } from 'next/server'

import { requireAdminApi } from '@/app/lib/auth/require-admin'
import {
  GapLeadWahaSettingsValidationError,
  loadGapLeadWahaSettingsForAdmin,
  normalizeGapLeadWahaSettingsValue,
  saveGapLeadWahaSettings,
} from '@/app/lib/gap-lead-waha-settings'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const view = await loadGapLeadWahaSettingsForAdmin()
    return NextResponse.json({
      settings: {
        baseUrl: view.settings.baseUrl,
        session: view.settings.session,
        ccChatId: view.settings.ccChatId,
      },
      apiKeyConfigured: view.apiKeyConfigured,
      configured: view.configured,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const input = normalizeGapLeadWahaSettingsValue(body)
    const saved = await saveGapLeadWahaSettings(input)

    return NextResponse.json({
      success: true,
      settings: {
        baseUrl: saved.baseUrl,
        session: saved.session,
        ccChatId: saved.ccChatId,
      },
      apiKeyConfigured: Boolean(saved.apiKey),
      configured: true,
    })
  } catch (e: unknown) {
    if (e instanceof GapLeadWahaSettingsValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    const message = e instanceof Error ? e.message : 'Failed to save settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
