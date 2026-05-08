import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

const SETTINGS_KEY = 'automation_default_templates'

const FALLBACK_TEMPLATES = {
  birthday: 'Salam {SenderName}, ini PG Code {PGCode} {SenderName} ya',
  inactive_followup: `saya semak kat system tiada pembelian sejak {LastPurchaseDate}

boleh saya tahu, {SenderName} ada perlukan apa-apa bantuan ka ?`,
  free_followup: `saya semak kat system tiada jualan dalam tempoh setahun yang lalu

boleh saya tahu, {SenderName} ada perlukan apa-apa bantuan ka ?`,
  active_profile_unverified_followup: `saya dapat info dari PG, {SenderName} dah mula menabung Emas, Tahniah ya {SenderName} ! 👏🎉

cuma status profile masih belum verified.

kalau {SenderName} sedia sekarang, kita update profile kejap boleh ?`,
  active_verified_no_autodebit_followup: `saya semak akaun {SenderName} aktif dan profile sudah verified 👍

belum aktifkan Direct Debit lagi kan? kalau {SenderName} nak, saya boleh bantu setup auto debit sekarang.`,
} as const

type TemplateMap = Record<keyof typeof FALLBACK_TEMPLATES, string>

function normalizeTemplateMap(raw: unknown): TemplateMap {
  const input =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  return {
    birthday:
      typeof input.birthday === 'string' && input.birthday.trim()
        ? input.birthday
        : FALLBACK_TEMPLATES.birthday,
    inactive_followup:
      typeof input.inactive_followup === 'string' && input.inactive_followup.trim()
        ? input.inactive_followup
        : FALLBACK_TEMPLATES.inactive_followup,
    free_followup:
      typeof input.free_followup === 'string' && input.free_followup.trim()
        ? input.free_followup
        : FALLBACK_TEMPLATES.free_followup,
    active_profile_unverified_followup:
      typeof input.active_profile_unverified_followup === 'string' &&
      input.active_profile_unverified_followup.trim()
        ? input.active_profile_unverified_followup
        : FALLBACK_TEMPLATES.active_profile_unverified_followup,
    active_verified_no_autodebit_followup:
      typeof input.active_verified_no_autodebit_followup === 'string' &&
      input.active_verified_no_autodebit_followup.trim()
        ? input.active_verified_no_autodebit_followup
        : FALLBACK_TEMPLATES.active_verified_no_autodebit_followup,
  }
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('admin_app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ templates: normalizeTemplateMap(data?.value) })
}
