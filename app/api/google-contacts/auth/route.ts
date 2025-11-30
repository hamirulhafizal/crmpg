import { NextResponse } from 'next/server'

// Google OAuth authorization URL
export async function GET(request: Request) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID
  const redirectUri = process.env.GOOGLE_CONTACTS_REDIRECT_URI || 
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'}/auth/google-contacts/callback`

  if (!clientId) {
    return NextResponse.json(
      { error: 'Google Contacts Client ID not configured' },
      { status: 500 }
    )
  }

  // Google OAuth scopes
  const scopes = [
    'https://www.googleapis.com/auth/contacts',
  ].join(' ')

  // Generate state parameter for security (store in session in production)
  const state = Buffer.from(JSON.stringify({
    timestamp: Date.now(),
    random: Math.random().toString(36),
  })).toString('base64')

  // Build authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', scopes)
  authUrl.searchParams.set('access_type', 'offline') // Get refresh token
  authUrl.searchParams.set('prompt', 'consent') // Force consent screen
  authUrl.searchParams.set('state', state)

  // Redirect to Google OAuth
  return NextResponse.redirect(authUrl.toString())
}

