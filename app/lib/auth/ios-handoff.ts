import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { sanitizeNextPath } from '@/app/lib/auth/safe-next-path'

export type IosHandoffPayload = {
  accessToken: string
  refreshToken: string
  next: string
  exp: number
}

export { sanitizeNextPath }

const MAX_AGE_MS = 90_000

function handoffKey(): Buffer {
  const secret =
    process.env.IOS_HANDOFF_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!secret) {
    throw new Error('Missing IOS_HANDOFF_SECRET (or service role key) for iOS web handoff')
  }
  return createHash('sha256').update(`crmpg-ios-handoff:${secret}`).digest()
}

/** Encrypt session tokens into a short-lived opaque code for Safari handoff. */
export function sealIosHandoff(payload: Omit<IosHandoffPayload, 'exp'> & { exp?: number }): string {
  const body: IosHandoffPayload = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    next: sanitizeNextPath(payload.next),
    exp: payload.exp ?? Date.now() + MAX_AGE_MS,
  }
  const key = handoffKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(body), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function unsealIosHandoff(code: string): IosHandoffPayload {
  const raw = Buffer.from(code, 'base64url')
  if (raw.length < 12 + 16 + 1) {
    throw new Error('Invalid handoff code')
  }
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const encrypted = raw.subarray(28)
  const key = handoffKey()
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()])
  const payload = JSON.parse(plaintext.toString('utf8')) as IosHandoffPayload
  if (!payload.accessToken || !payload.refreshToken || !payload.next || !payload.exp) {
    throw new Error('Invalid handoff payload')
  }
  if (Date.now() > payload.exp) {
    throw new Error('Handoff code expired')
  }
  payload.next = sanitizeNextPath(payload.next)
  return payload
}
