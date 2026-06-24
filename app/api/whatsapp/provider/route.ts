import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { loadUserEntitlements, canUseWasenderForUser } from '@/app/lib/saas/enforce'
import { getWhatsAppProviderInfoForUser, isWhatsAppConfigured } from '@/app/lib/whatsapp/resolve'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
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
