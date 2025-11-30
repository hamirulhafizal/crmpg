import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const state = requestUrl.searchParams.get('state')

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      new URL(`/excel-processor?error=${encodeURIComponent(error)}`, requestUrl.origin)
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/excel-processor?error=no_code', requestUrl.origin)
    )
  }

  // Exchange authorization code for tokens
  const clientId = process.env.GOOGLE_CONTACTS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CONTACTS_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_CONTACTS_REDIRECT_URI || 
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'}/auth/google-contacts/callback`

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(errorData.error || 'Failed to exchange token')
    }

    const tokens = await tokenResponse.json()

    // Store tokens in httpOnly cookie (secure)
    const cookieStore = await cookies()
    cookieStore.set('google_contacts_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60, // 1 hour
    })

    if (tokens.refresh_token) {
      cookieStore.set('google_contacts_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365, // 1 year
      })
    }

    // Redirect back to Excel Processor with success
    return NextResponse.redirect(
      new URL('/excel-processor?google_contacts_connected=true', requestUrl.origin)
    )
  } catch (error: any) {
    console.error('Google Contacts OAuth error:', error)
    return NextResponse.redirect(
      new URL(`/excel-processor?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
    )
  }
}

