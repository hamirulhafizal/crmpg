import { createHash, randomInt } from 'node:crypto'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  OTP_LENGTH,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_SEND_LIMIT,
  OTP_SEND_WINDOW_MS,
  OTP_TTL_MS,
} from '@/app/lib/customer-portal/constants'

export function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH
  const n = randomInt(0, max)
  return String(n).padStart(OTP_LENGTH, '0')
}

export function hashOtpCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex')
}

export async function countRecentOtpSends(identifierNormalized: string): Promise<number> {
  const admin = createServiceRoleClient()
  const since = new Date(Date.now() - OTP_SEND_WINDOW_MS).toISOString()
  const { count, error } = await admin
    .from('customer_portal_otps')
    .select('id', { count: 'exact', head: true })
    .eq('identifier_normalized', identifierNormalized)
    .gte('created_at', since)

  if (error) throw error
  return count ?? 0
}

export async function createOtpRecord(params: {
  customerId: string
  code: string
  identifierKind: 'pg_code' | 'phone'
  identifierNormalized: string
}): Promise<void> {
  const admin = createServiceRoleClient()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()
  const { error } = await admin.from('customer_portal_otps').insert({
    customer_id: params.customerId,
    code_hash: hashOtpCode(params.code),
    expires_at: expiresAt,
    max_attempts: OTP_MAX_VERIFY_ATTEMPTS,
    identifier_kind: params.identifierKind,
    identifier_normalized: params.identifierNormalized,
  })
  if (error) throw error
}

export type VerifyOtpResult =
  | { ok: true; customerId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'locked' }

export async function verifyOtpForCustomer(
  customerId: string,
  code: string
): Promise<VerifyOtpResult> {
  const admin = createServiceRoleClient()
  const now = new Date().toISOString()
  const { data: rows, error } = await admin
    .from('customer_portal_otps')
    .select('id, code_hash, expires_at, attempts, max_attempts, consumed_at')
    .eq('customer_id', customerId)
    .is('consumed_at', null)
    .gte('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error
  const row = rows?.[0]
  if (!row) return { ok: false, reason: 'expired' }

  if (row.attempts >= row.max_attempts) {
    return { ok: false, reason: 'locked' }
  }

  const match = hashOtpCode(code) === row.code_hash
  const nextAttempts = row.attempts + 1

  if (!match) {
    await admin
      .from('customer_portal_otps')
      .update({ attempts: nextAttempts })
      .eq('id', row.id)
    return { ok: false, reason: nextAttempts >= row.max_attempts ? 'locked' : 'invalid' }
  }

  await admin
    .from('customer_portal_otps')
    .update({ consumed_at: now, attempts: nextAttempts })
    .eq('id', row.id)

  return { ok: true, customerId }
}

export function isOtpRateLimited(sendCount: number): boolean {
  return sendCount >= OTP_SEND_LIMIT
}
