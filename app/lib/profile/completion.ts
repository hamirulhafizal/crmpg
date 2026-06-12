export type ProfileCompletionSnapshot = {
  full_name: string | null
  username_pbo: string | null
  phone: string | null
  pgcode: string | null
  gmail_app_password: string | null
  gmail_message: string | null
}

export type RequiredProfileField =
  | 'full_name'
  | 'username_pbo'
  | 'phone'
  | 'pgcode'
  | 'gmail_app_password'
  | 'gmail_message'

export const PROFILE_COMPLETION_STEPS: Array<{
  field: RequiredProfileField
  title: string
  description: string
  placeholder: string
}> = [
  {
    field: 'full_name',
    title: 'Your name',
    description: 'How customers and teammates will see you on the platform.',
    placeholder: 'Your full name',
  },
  {
    field: 'pgcode',
    title: 'PG code',
    description: 'Your Public Gold dealer code (e.g. PG00123456).',
    placeholder: 'PG00123456',
  },
  {
    field: 'username_pbo',
    title: 'pg2u.my username',
    description: 'Your public username on pg2u.my — used for lucky draw and lead pages.',
    placeholder: 'Your username on pg2u.my',
  },
  {
    field: 'phone',
    title: 'Phone number',
    description: 'Used for account recovery and routing leads to you via WhatsApp.',
    placeholder: '60123456789',
  },
  {
    field: 'gmail_app_password',
    title: 'Gmail app password',
    description:
      'Create an app password in your Google Account (Security → App passwords). Used when WhatsApp fails and we email customers instead.',
    placeholder: 'xxxx xxxx xxxx xxxx',
  },
  {
    field: 'gmail_message',
    title: 'Gmail message template',
    description:
      'Email body when WhatsApp delivery fails. We pre-fill a template with your name and phone — you can edit it anytime.',
    placeholder: 'Gmail fallback message…',
  },
]

export function resolveProfilePhone(
  profilePhone: string | null | undefined,
  metadataPhone?: unknown
): string {
  const fromProfile = profilePhone?.trim() ?? ''
  if (fromProfile) return fromProfile
  if (typeof metadataPhone === 'string') return metadataPhone.trim()
  return ''
}

export function resolveFullName(
  profileFullName: string | null | undefined,
  metadataFullName?: unknown
): string {
  const fromProfile = profileFullName?.trim() ?? ''
  if (fromProfile) return fromProfile
  if (typeof metadataFullName === 'string') return metadataFullName.trim()
  return ''
}

export function isFieldComplete(
  field: RequiredProfileField,
  profile: ProfileCompletionSnapshot,
  metadataPhone?: unknown,
  metadataFullName?: unknown
): boolean {
  switch (field) {
    case 'full_name':
      return Boolean(resolveFullName(profile.full_name, metadataFullName))
    case 'pgcode':
      return Boolean(profile.pgcode?.trim())
    case 'username_pbo':
      return Boolean(profile.username_pbo?.trim())
    case 'phone':
      return resolveProfilePhone(profile.phone, metadataPhone).replace(/\D/g, '').length >= 8
    case 'gmail_app_password':
      return (profile.gmail_app_password?.trim() ?? '').length >= 8
    case 'gmail_message':
      return Boolean(profile.gmail_message?.trim())
    default:
      return false
  }
}

export function getMissingProfileFields(
  profile: ProfileCompletionSnapshot,
  metadataPhone?: unknown,
  metadataFullName?: unknown
): RequiredProfileField[] {
  return PROFILE_COMPLETION_STEPS.filter(
    (step) => !isFieldComplete(step.field, profile, metadataPhone, metadataFullName)
  ).map((step) => step.field)
}

export function isProfileComplete(
  profile: ProfileCompletionSnapshot,
  metadataPhone?: unknown,
  metadataFullName?: unknown
): boolean {
  return getMissingProfileFields(profile, metadataPhone, metadataFullName).length === 0
}

export function firstIncompleteStepIndex(
  profile: ProfileCompletionSnapshot,
  metadataPhone?: unknown,
  metadataFullName?: unknown
): number {
  const missing = new Set(getMissingProfileFields(profile, metadataPhone, metadataFullName))
  const idx = PROFILE_COMPLETION_STEPS.findIndex((step) => missing.has(step.field))
  return idx === -1 ? PROFILE_COMPLETION_STEPS.length - 1 : idx
}

export const PROFILE_FIELD_LABELS: Record<RequiredProfileField, string> = {
  full_name: 'Full name',
  username_pbo: 'Username PGO',
  phone: 'Phone number',
  pgcode: 'PG code',
  gmail_app_password: 'Gmail app password',
  gmail_message: 'Gmail message template',
}
