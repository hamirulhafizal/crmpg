import { NextResponse } from 'next/server'

import { requireAdminApi } from '@/app/lib/auth/require-admin'
import {
  loadStoredMediaR2Settings,
  MediaR2SettingsValidationError,
  normalizeMediaR2SettingsValue,
  saveMediaR2Settings,
} from '@/app/lib/media-r2-settings'

export async function GET(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const settings = await loadStoredMediaR2Settings()
    return NextResponse.json({
      settings: {
        accountId: settings.accountId,
        s3Endpoint: settings.s3Endpoint,
        publicUrl: settings.publicUrl,
        bucketName: settings.bucketName,
        accessKeyId: settings.accessKeyId,
        sizeLimitsMb: settings.sizeLimitsMb,
      },
      secretConfigured: Boolean(settings.secretAccessKey),
      configured: Boolean(
        settings.s3Endpoint &&
          settings.publicUrl &&
          settings.bucketName &&
          settings.accessKeyId &&
          settings.secretAccessKey
      ),
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const input = normalizeMediaR2SettingsValue(body)
    const saved = await saveMediaR2Settings(input)

    return NextResponse.json({
      success: true,
      settings: {
        accountId: saved.accountId,
        s3Endpoint: saved.s3Endpoint,
        publicUrl: saved.publicUrl,
        bucketName: saved.bucketName,
        accessKeyId: saved.accessKeyId,
        sizeLimitsMb: saved.sizeLimitsMb,
      },
      secretConfigured: Boolean(saved.secretAccessKey),
      configured: true,
    })
  } catch (e: unknown) {
    if (e instanceof MediaR2SettingsValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    const message = e instanceof Error ? e.message : 'Failed to save settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
