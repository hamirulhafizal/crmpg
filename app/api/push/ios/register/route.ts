import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'

type RegisterBody = {
  device_token?: unknown
  apns_environment?: unknown
  bundle_id?: unknown
  device_name?: unknown
  app_version?: unknown
}

function normalizeToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const token = raw.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(token) && !/^[0-9a-f]{8,}$/.test(token)) {
    // Allow hex tokens of reasonable length (simulator / future formats)
    if (token.length < 8 || token.length > 256) return null
  }
  return token
}

/** POST — register / refresh APNs device token for the signed-in dealer. */
export async function POST(request: Request) {
  const auth = await requireUserApi(request)
  if (!auth.ok) return auth.response
  const { user, supabase } = auth

  let body: RegisterBody
  try {
    body = (await request.json()) as RegisterBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const deviceToken = normalizeToken(body.device_token)
  if (!deviceToken) {
    return NextResponse.json({ error: 'device_token is required' }, { status: 400 })
  }

  const envRaw = typeof body.apns_environment === 'string' ? body.apns_environment.trim() : 'sandbox'
  const apnsEnvironment = envRaw === 'production' ? 'production' : 'sandbox'
  const bundleId =
    typeof body.bundle_id === 'string' && body.bundle_id.trim()
      ? body.bundle_id.trim()
      : 'com.publicgolds.crmpg'
  const deviceName =
    typeof body.device_name === 'string' && body.device_name.trim() ? body.device_name.trim() : null
  const appVersion =
    typeof body.app_version === 'string' && body.app_version.trim() ? body.app_version.trim() : null

  const now = new Date().toISOString()
  const { error } = await supabase.from('ios_push_devices').upsert(
    {
      user_id: user.id,
      device_token: deviceToken,
      apns_environment: apnsEnvironment,
      bundle_id: bundleId,
      device_name: deviceName,
      app_version: appVersion,
      last_seen_at: now,
    },
    { onConflict: 'device_token' }
  )

  if (error) {
    console.error('ios push register:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/** DELETE — remove device token on logout / uninstall cleanup. */
export async function DELETE(request: Request) {
  const auth = await requireUserApi(request)
  if (!auth.ok) return auth.response
  const { user, supabase } = auth

  const url = new URL(request.url)
  let deviceToken = normalizeToken(url.searchParams.get('device_token'))

  if (!deviceToken) {
    try {
      const body = (await request.json()) as RegisterBody
      deviceToken = normalizeToken(body.device_token)
    } catch {
      // optional body
    }
  }

  if (!deviceToken) {
    return NextResponse.json({ error: 'device_token is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('ios_push_devices')
    .delete()
    .eq('user_id', user.id)
    .eq('device_token', deviceToken)

  if (error) {
    console.error('ios push unregister:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
