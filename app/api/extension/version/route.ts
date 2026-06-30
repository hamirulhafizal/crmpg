import { NextResponse } from 'next/server'
import { getExtensionVersionInfo } from '@/app/lib/extension/version'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Extension-Version',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request: Request) {
  const clientVersion =
    request.headers.get('x-extension-version') ||
    new URL(request.url).searchParams.get('version')

  const info = getExtensionVersionInfo(clientVersion)

  return NextResponse.json(
    {
      latestVersion: info.latestVersion,
      minVersion: info.minVersion,
      storeUrl: info.storeUrl,
      updateRequired: info.updateRequired,
      currentVersion: clientVersion || null,
    },
    {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}
