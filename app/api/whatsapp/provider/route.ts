import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { loadUserEntitlements, canUseWasenderForUser } from '@/app/lib/saas/enforce'
import { getWhatsAppProviderInfoForUser, isWhatsAppConfigured } from '@/app/lib/whatsapp/resolve'

export async function GET(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user } = auth
    if (!(await isWhatsAppConfigured({ userId: user.id }))) {
      return NextResponse.json({ error: 'WhatsApp integration is not configured' }, { status: 503 })
    }

    const entitlements = await loadUserEntitlements(user.id)
    const wasenderOk = await canUseWasenderForUser(user.id)
    const info = await getWhatsAppProviderInfoForUser(user.id)
    let provider = info.provider

    if (provider === 'wasender' && !wasenderOk) {
      provider = 'waha'
    }

    return NextResponse.json({
      provider,
      wasender_available: wasenderOk,
      is_pro_active: entitlements?.isProActive ?? false,
      server_id: info.serverId,
      server_name: info.serverName,
      server_base_url: info.baseUrl,
      assigned_by_admin: info.assignedByAdmin,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
