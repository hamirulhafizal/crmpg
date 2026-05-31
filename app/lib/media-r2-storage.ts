import { randomUUID } from 'node:crypto'

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'

import {
  buildPublicMediaUrl,
  type MediaR2SettingsValue,
  type MediaType,
} from '@/app/lib/media-r2-settings'

export function mediaTypeFromMime(mime: string): MediaType | null {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (normalized.startsWith('image/')) return 'image'
  if (normalized.startsWith('audio/')) return 'audio'
  if (normalized.startsWith('video/')) return 'video'
  if (normalized === 'application/pdf') return 'pdf'
  return null
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_')
  return (base || 'file').slice(0, 120)
}

export function normalizeFolder(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
    .slice(0, 120)
}

/** R2-compatible S3 client (disables AWS SDK default checksums R2 does not support). */
export function createR2Client(settings: MediaR2SettingsValue): S3Client {
  const client = new S3Client({
    region: 'auto',
    endpoint: settings.s3Endpoint,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    // @aws-sdk/client-s3 v3.729+ sends checksum headers AWS S3 expects but R2 rejects.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  } as S3ClientConfig)

  client.middlewareStack.add(
    (next) => async (args) => {
      const request = args.request as { headers?: Record<string, string> }
      if (request.headers) {
        for (const key of Object.keys(request.headers)) {
          const lower = key.toLowerCase()
          if (
            lower.startsWith('x-amz-checksum-') ||
            lower === 'x-amz-sdk-checksum-algorithm'
          ) {
            delete request.headers[key]
          }
        }
      }
      return next(args)
    },
    { step: 'build', name: 'r2StripChecksumHeaders' }
  )

  return client
}

export function formatR2Error(error: unknown): string {
  if (!(error instanceof Error)) return 'R2 request failed'
  const name = 'name' in error ? String((error as { name?: string }).name ?? '') : ''
  const msg = error.message.trim() || 'R2 request failed'

  if (/unauthorized|access denied|invalidaccesskey|signaturedoesnotmatch/i.test(`${name} ${msg}`)) {
    return `R2 credentials rejected — check Access Key ID, Secret, bucket name (publicgolds), and S3 endpoint in Media settings. (${msg})`
  }
  if (/notimplemented|checksum/i.test(msg)) {
    return `R2 upload incompatible with AWS SDK checksum — retry after server update. (${msg})`
  }
  if (/nosuchbucket/i.test(msg)) {
    return `R2 bucket not found — verify bucket name "publicgolds" exists in Cloudflare. (${msg})`
  }

  return `R2 upload failed: ${msg}`
}

export function buildR2KeyWithFilenamePart(
  mediaType: MediaType,
  filenamePart: string,
  folder?: string
): string {
  const normalizedFolder = normalizeFolder(folder ?? '')
  const parts = ['media', mediaType]
  if (normalizedFolder) parts.push(normalizedFolder)
  parts.push(filenamePart)
  return parts.join('/')
}

export function buildR2ObjectKey(
  mediaType: MediaType,
  originalFilename: string,
  folder?: string
): string {
  const safeName = sanitizeFilename(originalFilename)
  const id = randomUUID()
  return buildR2KeyWithFilenamePart(mediaType, `${id}-${safeName}`, folder)
}

export async function uploadToR2(opts: {
  settings: MediaR2SettingsValue
  key: string
  body: Buffer
  mimeType: string
}): Promise<{ key: string; publicUrl: string }> {
  const client = createR2Client(opts.settings)
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: opts.settings.bucketName,
        Key: opts.key,
        Body: opts.body,
        ContentType: opts.mimeType,
      })
    )
  } catch (e) {
    throw new Error(formatR2Error(e))
  }

  return {
    key: opts.key,
    publicUrl: buildPublicMediaUrl(opts.settings, opts.key),
  }
}

export async function deleteFromR2(settings: MediaR2SettingsValue, key: string): Promise<void> {
  const client = createR2Client(settings)
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: settings.bucketName,
        Key: key,
      })
    )
  } catch (e) {
    throw new Error(formatR2Error(e))
  }
}

export async function moveR2Object(opts: {
  settings: MediaR2SettingsValue
  fromKey: string
  toKey: string
}): Promise<{ key: string; publicUrl: string }> {
  const client = createR2Client(opts.settings)
  const { CopyObjectCommand } = await import('@aws-sdk/client-s3')

  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: opts.settings.bucketName,
        CopySource: `${opts.settings.bucketName}/${opts.fromKey}`,
        Key: opts.toKey,
      })
    )

    await client.send(
      new DeleteObjectCommand({
        Bucket: opts.settings.bucketName,
        Key: opts.fromKey,
      })
    )
  } catch (e) {
    throw new Error(formatR2Error(e))
  }

  return {
    key: opts.toKey,
    publicUrl: buildPublicMediaUrl(opts.settings, opts.toKey),
  }
}

export async function testR2Connection(settings: MediaR2SettingsValue): Promise<{ ok: true } | { ok: false; message: string }> {
  const { HeadBucketCommand, ListObjectsV2Command } = await import('@aws-sdk/client-s3')
  const client = createR2Client(settings)

  try {
    await client.send(new HeadBucketCommand({ Bucket: settings.bucketName }))
    return { ok: true }
  } catch (headError) {
    try {
      await client.send(
        new ListObjectsV2Command({
          Bucket: settings.bucketName,
          MaxKeys: 1,
        })
      )
      return { ok: true }
    } catch (listError) {
      const message = formatR2Error(listError ?? headError)
      return { ok: false, message }
    }
  }
}
