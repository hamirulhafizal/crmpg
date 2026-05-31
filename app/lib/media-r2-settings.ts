import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const MEDIA_R2_SETTINGS_KEY = 'media_r2'

export type MediaType = 'image' | 'audio' | 'video' | 'pdf'

export type MediaSizeLimitsMb = Record<MediaType, number>

export type MediaR2SettingsValue = {
  accountId: string
  s3Endpoint: string
  publicUrl: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  sizeLimitsMb: MediaSizeLimitsMb
}

export const DEFAULT_MEDIA_R2_SETTINGS: MediaR2SettingsValue = {
  accountId: '854fda69e0bc263a3b086313bf605e0f',
  s3Endpoint: 'https://854fda69e0bc263a3b086313bf605e0f.r2.cloudflarestorage.com',
  publicUrl: 'https://pub-b3adb23730ee4385bae1f46827b2adb5.r2.dev',
  bucketName: 'publicgolds',
  accessKeyId: '',
  secretAccessKey: '',
  sizeLimitsMb: {
    image: 10,
    audio: 25,
    pdf: 20,
    video: 100,
  },
}

function trimOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseLimitMb(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.round(n), 2048)
}

export function normalizeMediaR2SettingsValue(raw: unknown): MediaR2SettingsValue {
  const input =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const limitsRaw =
    input.sizeLimitsMb && typeof input.sizeLimitsMb === 'object' && !Array.isArray(input.sizeLimitsMb)
      ? (input.sizeLimitsMb as Record<string, unknown>)
      : {}

  return {
    accountId: trimOrEmpty(input.accountId) || DEFAULT_MEDIA_R2_SETTINGS.accountId,
    s3Endpoint: trimOrEmpty(input.s3Endpoint).replace(/\/+$/, '') || DEFAULT_MEDIA_R2_SETTINGS.s3Endpoint,
    publicUrl: trimOrEmpty(input.publicUrl).replace(/\/+$/, '') || DEFAULT_MEDIA_R2_SETTINGS.publicUrl,
    bucketName: trimOrEmpty(input.bucketName) || DEFAULT_MEDIA_R2_SETTINGS.bucketName,
    accessKeyId: trimOrEmpty(input.accessKeyId),
    secretAccessKey: trimOrEmpty(input.secretAccessKey),
    sizeLimitsMb: {
      image: parseLimitMb(limitsRaw.image, DEFAULT_MEDIA_R2_SETTINGS.sizeLimitsMb.image),
      audio: parseLimitMb(limitsRaw.audio, DEFAULT_MEDIA_R2_SETTINGS.sizeLimitsMb.audio),
      pdf: parseLimitMb(limitsRaw.pdf, DEFAULT_MEDIA_R2_SETTINGS.sizeLimitsMb.pdf),
      video: parseLimitMb(limitsRaw.video, DEFAULT_MEDIA_R2_SETTINGS.sizeLimitsMb.video),
    },
  }
}

export function isMediaR2Configured(settings: MediaR2SettingsValue): boolean {
  return Boolean(
    settings.s3Endpoint &&
      settings.publicUrl &&
      settings.bucketName &&
      settings.accessKeyId &&
      settings.secretAccessKey
  )
}

export function sizeLimitBytes(settings: MediaR2SettingsValue, mediaType: MediaType): number {
  return settings.sizeLimitsMb[mediaType] * 1024 * 1024
}

export async function loadStoredMediaR2Settings(): Promise<MediaR2SettingsValue> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('admin_app_settings')
    .select('value')
    .eq('key', MEDIA_R2_SETTINGS_KEY)
    .maybeSingle()

  if (error) throw error
  if (!data?.value) return { ...DEFAULT_MEDIA_R2_SETTINGS }
  return normalizeMediaR2SettingsValue(data.value)
}

export async function loadMediaR2Settings(): Promise<MediaR2SettingsValue> {
  try {
    return await loadStoredMediaR2Settings()
  } catch (e) {
    console.warn('Media R2 settings load failed:', e)
    return { ...DEFAULT_MEDIA_R2_SETTINGS }
  }
}

export class MediaR2SettingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaR2SettingsValidationError'
  }
}

export async function saveMediaR2Settings(
  input: Partial<MediaR2SettingsValue>
): Promise<MediaR2SettingsValue> {
  const admin = createServiceRoleClient()
  const existing = await loadStoredMediaR2Settings()

  const next = normalizeMediaR2SettingsValue({
    accountId: input.accountId ?? existing.accountId,
    s3Endpoint: resolveS3Endpoint(
      trimOrEmpty(input.accountId ?? existing.accountId),
      trimOrEmpty(input.s3Endpoint ?? existing.s3Endpoint)
    ),
    publicUrl: input.publicUrl ?? existing.publicUrl,
    bucketName: input.bucketName ?? existing.bucketName,
    accessKeyId: input.accessKeyId ?? existing.accessKeyId,
    secretAccessKey: trimOrEmpty(input.secretAccessKey) || existing.secretAccessKey,
    sizeLimitsMb: input.sizeLimitsMb ?? existing.sizeLimitsMb,
  })

  if (!next.s3Endpoint) throw new MediaR2SettingsValidationError('S3 endpoint is required.')
  if (!next.publicUrl) throw new MediaR2SettingsValidationError('Public URL is required.')
  if (!next.bucketName) throw new MediaR2SettingsValidationError('Bucket name is required.')
  if (!next.accessKeyId) throw new MediaR2SettingsValidationError('Access key ID is required.')
  if (!next.secretAccessKey) throw new MediaR2SettingsValidationError('Secret access key is required.')
  validateMediaR2Credentials(next)

  const { error } = await admin.from('admin_app_settings').upsert(
    {
      key: MEDIA_R2_SETTINGS_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )

  if (error) throw error
  return next
}

export function buildPublicMediaUrl(settings: MediaR2SettingsValue, r2Key: string): string {
  const base = settings.publicUrl.replace(/\/+$/, '')
  const key = r2Key.replace(/^\/+/, '')
  return `${base}/${key}`
}

/** S3 API host only — not the public r2.dev URL used for browser access. */
export function resolveS3Endpoint(accountId: string, s3Endpoint: string): string {
  const account = trimOrEmpty(accountId)
  const raw = trimOrEmpty(s3Endpoint).replace(/\/+$/, '')

  if (raw.includes('.r2.dev') || raw.includes('pub-')) {
    throw new MediaR2SettingsValidationError(
      'S3 API endpoint must be https://<account-id>.r2.cloudflarestorage.com — not the public r2.dev URL.'
    )
  }

  if (raw.includes('r2.cloudflarestorage.com')) {
    return raw
  }

  if (account) {
    return `https://${account}.r2.cloudflarestorage.com`
  }

  return DEFAULT_MEDIA_R2_SETTINGS.s3Endpoint
}

export function validateMediaR2Credentials(settings: MediaR2SettingsValue): void {
  if (settings.accessKeyId.length < 16) {
    throw new MediaR2SettingsValidationError(
      'Access Key ID looks too short. Use R2 → Manage R2 API Tokens → Create API token (S3 credentials), not a Cloudflare dashboard API token.'
    )
  }
  if (settings.secretAccessKey.length < 16) {
    throw new MediaR2SettingsValidationError('Secret access key is required and looks too short.')
  }
}
