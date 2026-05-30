export type ProfileCompletionSnapshot = {
  username_pbo: string | null
  phone: string | null
  pgcode: string | null
}

export type RequiredProfileField = 'username_pbo' | 'phone' | 'pgcode'

export function resolveProfilePhone(
  profilePhone: string | null | undefined,
  metadataPhone: unknown
): string {
  const fromProfile = profilePhone?.trim() ?? ''
  if (fromProfile) return fromProfile
  if (typeof metadataPhone === 'string') return metadataPhone.trim()
  return ''
}

export function getMissingProfileFields(
  profile: ProfileCompletionSnapshot,
  metadataPhone?: unknown
): RequiredProfileField[] {
  const missing: RequiredProfileField[] = []
  if (!profile.username_pbo?.trim()) missing.push('username_pbo')
  if (!resolveProfilePhone(profile.phone, metadataPhone)) missing.push('phone')
  if (!profile.pgcode?.trim()) missing.push('pgcode')
  return missing
}

export function isProfileComplete(
  profile: ProfileCompletionSnapshot,
  metadataPhone?: unknown
): boolean {
  return getMissingProfileFields(profile, metadataPhone).length === 0
}

export const PROFILE_FIELD_LABELS: Record<RequiredProfileField, string> = {
  username_pbo: 'Username PGO',
  phone: 'Phone number',
  pgcode: 'PG code',
}
