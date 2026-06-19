export const AUTOMATION_TEMPLATE_OPTIONS = [
  { key: 'birthday', label: 'Birthday' },
  { key: 'inactive_followup', label: 'Inactive follow-up' },
  { key: 'free_followup', label: 'Free account follow-up' },
  { key: 'active_profile_unverified_followup', label: 'Active profile-unverified follow-up' },
  {
    key: 'active_verified_no_autodebit_followup',
    label: 'Active verified no-autodebit follow-up',
  },
] as const

export type AutomationTemplateKey = (typeof AUTOMATION_TEMPLATE_OPTIONS)[number]['key']

export type AutomationTemplateMap = Record<AutomationTemplateKey, string>

export const FALLBACK_AUTOMATION_TEMPLATES: AutomationTemplateMap = {
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
}

export function normalizeAutomationTemplateMap(raw: unknown): AutomationTemplateMap {
  const input =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}

  const pick = (key: AutomationTemplateKey): string => {
    const value = input[key]
    return typeof value === 'string' && value.trim() ? value : FALLBACK_AUTOMATION_TEMPLATES[key]
  }

  return {
    birthday: pick('birthday'),
    inactive_followup: pick('inactive_followup'),
    free_followup: pick('free_followup'),
    active_profile_unverified_followup: pick('active_profile_unverified_followup'),
    active_verified_no_autodebit_followup: pick('active_verified_no_autodebit_followup'),
  }
}

export function matchAutomationTemplateKey(
  messageTemplate: string,
  templates: AutomationTemplateMap
): AutomationTemplateKey | null {
  const normalized = messageTemplate.trim()
  if (!normalized) return null
  for (const option of AUTOMATION_TEMPLATE_OPTIONS) {
    if (templates[option.key].trim() === normalized) return option.key
  }
  return null
}

export const AUTOMATION_TEMPLATES_SETTINGS_KEY = 'automation_default_templates'
