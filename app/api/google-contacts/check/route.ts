import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('google_contacts_access_token')?.value
    const refreshToken = cookieStore.get('google_contacts_refresh_token')?.value

    // Check if we have OAuth tokens
    if (accessToken || refreshToken) {
      return NextResponse.json({
        connected: true,
        method: 'oauth',
      })
    }

    // Check if service account is configured
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    const serviceAccountKeyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE

    if (serviceAccountEmail && serviceAccountKey) {
      return NextResponse.json({
        connected: true,
        method: 'service_account',
      })
    }

    if (serviceAccountKeyFile) {
      return NextResponse.json({
        connected: true,
        method: 'service_account_file',
      })
    }

    return NextResponse.json({
      connected: false,
      method: null,
    })
  } catch (error: any) {
    return NextResponse.json(
      { connected: false, error: error.message },
      { status: 500 }
    )
  }
}

